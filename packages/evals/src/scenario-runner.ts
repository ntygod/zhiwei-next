import { createHash } from "node:crypto";
import { SCENARIOS, SCENARIO_ALIASES, SCENARIO_VERSION, LEDGER_SCENARIOS, type ScenarioId } from "./catalog.ts";
import { SYNTHETIC_FIXTURE, verifyLedgerEvidence, type LedgerEvidence, type ScenarioFixture } from "./ledger-scenarios.ts";

export type ExecutionStatus = "passed" | "failed" | "skipped" | "not-run";
export interface SourceIdentity {
  readonly kind: "observed-git" | "fixture";
  readonly head: string;
  readonly tree: string;
  readonly clean: boolean;
}
export interface ScenarioEnvironment {
  readonly node: string;
  readonly platform: string;
  readonly arch: string;
  readonly sqlite: string;
  readonly isolation: "worker-thread-synthetic-temp-sqlite" | "injected-test";
}
export interface RunnerProvenance {
  readonly source: SourceIdentity;
  readonly environment: ScenarioEnvironment;
}
export interface ScenarioResult {
  readonly id: ScenarioId;
  readonly status: ExecutionStatus;
  readonly productCoverage: "PARTIAL" | "NONE";
  readonly reason: string;
  readonly evidence?: LedgerEvidence;
}
export interface ScenarioReport extends RunnerProvenance {
  readonly schemaVersion: 1;
  readonly scenarioVersion: typeof SCENARIO_VERSION;
  readonly catalogSha256: string;
  readonly fixture: ScenarioFixture;
  readonly results: readonly ScenarioResult[];
  readonly totals: Readonly<Record<ExecutionStatus, number>>;
}
export interface ScenarioExecutor {
  // Must settle only after the execution is stopped and all owned I/O is cleaned.
  execute(id: ScenarioId, fixture: ScenarioFixture, timeoutMs: number): Promise<unknown>;
}
export class ScenarioExecutionError extends Error {
  readonly code: "timeout" | "execution" | "cleanup" | "invalid-output";
  constructor(code: ScenarioExecutionError["code"]) { super(code); this.code = code; }
}
export interface RunScenarioOptions extends RunnerProvenance {
  readonly select?: readonly string[];
  readonly skip?: Readonly<Record<string, string>>;
  readonly timeoutMs?: number;
  readonly fixture?: ScenarioFixture;
}

export const CATALOG_SHA256 = createHash("sha256").update(JSON.stringify({ SCENARIOS, SCENARIO_ALIASES, SCENARIO_VERSION })).digest("hex");

export async function runScenarioSuite(options: RunScenarioOptions, executor: ScenarioExecutor): Promise<ScenarioReport> {
  const ids = new Set<string>(SCENARIOS.map(scenario => scenario.id));
  const select = options.select ?? SCENARIOS.map(scenario => scenario.id);
  for (const id of [...select, ...Object.keys(options.skip ?? {})]) {
    if (!ids.has(id)) throw new TypeError(`Unknown canonical scenario: ${id}`);
  }
  if (new Set(select).size !== select.length) throw new TypeError("Duplicate selected scenario");
  for (const reason of Object.values(options.skip ?? {})) {
    if (typeof reason !== "string" || !reason.trim()) throw new TypeError("Skip needs an explicit reason");
  }
  const timeoutMs = options.timeoutMs ?? 5_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000) throw new TypeError("Invalid timeout budget");
  for (const sha of [options.source.head, options.source.tree]) {
    if (!/^[a-f0-9]{40}$/.test(sha)) throw new TypeError("Expected complete source identity");
  }
  const fixture = options.fixture ?? SYNTHETIC_FIXTURE;
  const results: ScenarioResult[] = [];
  const totals = { passed: 0, failed: 0, skipped: 0, "not-run": 0 };
  for (const scenario of SCENARIOS) {
    let result: ScenarioResult;
    if (!select.includes(scenario.id)) {
      result = { id: scenario.id, status: "not-run", productCoverage: "NONE", reason: "not-selected" };
    } else if (!LEDGER_SCENARIOS.includes(scenario.id)) {
      result = { id: scenario.id, status: "not-run", productCoverage: "NONE", reason: "required-product-capability-unavailable" };
    } else if (options.skip?.[scenario.id] !== undefined) {
      result = { id: scenario.id, status: "skipped", productCoverage: "NONE", reason: options.skip[scenario.id] };
    } else {
      try {
        const evidence = await executor.execute(scenario.id, fixture, timeoutMs);
        verifyLedgerEvidence(scenario.id, fixture, evidence);
        result = { id: scenario.id, status: "passed", productCoverage: "PARTIAL", reason: "Ledger component only; no product scenario completion", evidence };
      } catch (error) {
        result = { id: scenario.id, status: "failed", productCoverage: "NONE", reason: error instanceof ScenarioExecutionError ? error.code : "evidence-or-execution-failed" };
      }
    }
    totals[result.status] += 1;
    results.push(result);
  }
  return { schemaVersion: 1, source: options.source, environment: options.environment, scenarioVersion: SCENARIO_VERSION, catalogSha256: CATALOG_SHA256, fixture, results, totals };
}
