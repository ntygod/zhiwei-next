import assert from "node:assert/strict";
import { ids } from "../../domain/src/index.ts";
import {
  createNormalizedRuntimeEventV1,
  type NormalizedRuntimeEventV1,
} from "../../protocol/src/index.ts";
import {
  ObservationLedgerConflictError,
  ObservationLedgerSequenceError,
  fingerprintNormalizedRuntimeEventV1,
  type OpenSqliteObservationLedgerOptions,
  type SqliteObservationLedgerV1,
  type StoredRuntimeEventV1,
} from "../../memory-store/src/index.ts";
import type { ScenarioId } from "./catalog.ts";

export interface ScenarioFixture {
  readonly now: string;
  readonly idPrefix: string;
  readonly modelReply: string;
}

export const SYNTHETIC_FIXTURE: ScenarioFixture = Object.freeze({
  now: "2026-01-01T00:00:00.000Z",
  idPrefix: "g4-synthetic",
  modelReply: "get_state",
});

export interface LedgerScenarioPorts {
  readonly clock: { now(): string };
  readonly ids: { next(label: string): string };
  // A deterministic synthetic model, never a provider or credential lookup.
  readonly model: { complete(input: string): string };
  readonly io: {
    open(options: OpenSqliteObservationLedgerOptions): SqliteObservationLedgerV1;
  };
}

export interface RowEvidence {
  readonly cursor: number;
  readonly eventId: string;
  readonly idempotencyKey: string;
  readonly fingerprint: string;
  readonly sequence: number;
}

export interface LedgerEvidence {
  readonly kind: "ledger-component-v1";
  readonly scenarioId: ScenarioId;
  readonly before: readonly RowEvidence[];
  readonly after: readonly RowEvidence[];
  readonly reopened: readonly RowEvidence[];
  readonly insertedCounts: readonly number[];
  readonly replayedCounts: readonly number[];
  readonly rejectionCodes: readonly string[];
  readonly integrity: readonly string[];
  readonly closedBeforeReopen: boolean;
}

export function fixturePorts(fixture: ScenarioFixture, io: LedgerScenarioPorts["io"]): LedgerScenarioPorts {
  return {
    clock: { now: () => fixture.now },
    ids: { next: label => `${fixture.idPrefix}-${label}` },
    model: { complete: () => fixture.modelReply },
    io,
  };
}

function events(ports: Pick<LedgerScenarioPorts, "clock" | "ids" | "model">): readonly NormalizedRuntimeEventV1[] {
  const workspaceId = ids.workspace(ports.ids.next("workspace"));
  const runtimeSessionId = ids.session(ports.ids.next("session"));
  const runtimeInstanceId = ports.ids.next("instance");
  const command = ports.model.complete("Return the synthetic command name only.");
  return [1, 2, 3, 4].map(sequence => createNormalizedRuntimeEventV1({
    protocolVersion: 1,
    workspaceId,
    runtimeSessionId,
    runtimeInstanceId,
    source: {
      adapter: "g4-synthetic-rpc",
      runtime: { implementation: "synthetic", version: "1" },
      surface: "rpc",
      eventType: "response",
    },
    sequence: { domain: "g4-synthetic-rpc", value: sequence },
    observedAt: ports.clock.now(),
    provenance: "observed",
    persistence: "durable",
    stability: "boundary",
    compatibility: "required",
    correlation: {
      observed: { requestId: ports.ids.next(`request-${sequence}`) },
      normalized: { rpcRequestId: ports.ids.next(`rpc-${sequence}`) },
    },
    data: { kind: "command.response", command, success: true, phase: "command-result" },
  }));
}

function rows(records: readonly StoredRuntimeEventV1[]): readonly RowEvidence[] {
  return records.map(record => ({
    cursor: record.rowId,
    eventId: record.event.eventId,
    idempotencyKey: record.event.idempotencyKey,
    fingerprint: record.fingerprint,
    sequence: record.event.sequence.value,
  }));
}

function expectedRows(fixture: ScenarioFixture): readonly RowEvidence[] {
  const input = events(fixturePorts(fixture, { open: () => { throw new Error("No I/O in evidence oracle"); } }));
  return input.slice(0, 3).map((event, index) => ({
    cursor: index + 1, eventId: event.eventId, idempotencyKey: event.idempotencyKey,
    fingerprint: fingerprintNormalizedRuntimeEventV1(event), sequence: index + 1,
  }));
}

// Assertions are independent of the case's status. Missing/malformed evidence,
// wrong output, a fabricated success flag, or changed fixture bytes cannot pass.
export function verifyLedgerEvidence(scenarioId: ScenarioId, fixture: ScenarioFixture, value: unknown): asserts value is LedgerEvidence {
  assert.ok(value && typeof value === "object" && !Array.isArray(value), "missing evidence");
  const evidence = value as Record<string, unknown>;
  const expected = expectedRows(fixture);
  assert.deepEqual(Object.keys(evidence).sort(), [
    "kind", "scenarioId", "before", "after", "reopened", "insertedCounts", "replayedCounts",
    "rejectionCodes", "integrity", "closedBeforeReopen",
  ].sort(), "evidence fields");
  assert.equal(evidence.kind, "ledger-component-v1");
  assert.equal(evidence.scenarioId, scenarioId);
  assert.deepEqual(evidence.before, scenarioId === "E0-03" || scenarioId === "E0-04" ? expected.slice(0, 1) : expected);
  assert.deepEqual(evidence.after, expected);
  assert.deepEqual(evidence.reopened, expected);
  assert.deepEqual(evidence.integrity, ["ok"]);
  assert.equal(evidence.closedBeforeReopen, true);
  assert.deepEqual(evidence.insertedCounts, scenarioId === "E0-03" ? [1, 2, 0] : scenarioId === "E0-04" ? [1, 2] : [3]);
  assert.deepEqual(evidence.replayedCounts, scenarioId === "E0-03" ? [0, 1, 3] : scenarioId === "E0-04" ? [0, 0] : [0]);
  assert.deepEqual(evidence.rejectionCodes, scenarioId === "E0-04" ? ["conflict", "sequence"] : []);
}

export function executeLedgerScenario(scenarioId: ScenarioId, filePath: string, ports: LedgerScenarioPorts): LedgerEvidence {
  assert.ok(["E0-02", "E0-03", "E0-04"].includes(scenarioId), "unsupported Ledger component");
  const input = events(ports);
  const [first, second, third, fourth] = input;
  assert.ok(first && second && third && fourth);
  let ledger = ports.io.open({ filePath, clock: ports.clock });
  const insertedCounts: number[] = [];
  const replayedCounts: number[] = [];
  const rejectionCodes: string[] = [];
  const read = (): readonly RowEvidence[] => rows(ledger.readSession(first.workspaceId, first.runtimeSessionId));
  const append = (batch: readonly NormalizedRuntimeEventV1[]): void => {
    const result = ledger.appendBatch(batch);
    insertedCounts.push(result.insertedCount);
    replayedCounts.push(result.replayedCount);
  };
  try {
    append(scenarioId === "E0-02" ? input.slice(0, 3) : [first]);
    const before = read();
    if (scenarioId === "E0-03") {
      append(input.slice(0, 3));
      append(input.slice(0, 3));
    }
    if (scenarioId === "E0-04") {
      const { eventId: _eventId, idempotencyKey: _idempotencyKey, ...draft } = first;
      const conflicting = createNormalizedRuntimeEventV1({ ...draft, data: { kind: "command.response", command: "synthetic-conflict", success: true, phase: "command-result" } });
      assert.throws(() => ledger.appendBatch([first, second, conflicting]), ObservationLedgerConflictError);
      rejectionCodes.push("conflict");
      assert.deepEqual(read(), before, "conflict must roll back new rows and cursor");
      assert.throws(() => ledger.appendBatch([fourth, second]), ObservationLedgerSequenceError);
      rejectionCodes.push("sequence");
      assert.deepEqual(read(), before, "out-of-order batch must roll back new rows and cursor");
      append([second, third]);
    }
    const after = read();
    ledger.close();
    const closedBeforeReopen = !ledger.isOpen;
    ledger = ports.io.open({ filePath, clock: ports.clock });
    return {
      kind: "ledger-component-v1", scenarioId, before, after, reopened: read(),
      insertedCounts, replayedCounts, rejectionCodes,
      integrity: ledger.integrityCheck(), closedBeforeReopen,
    };
  } finally {
    if (ledger.isOpen) ledger.close();
  }
}
