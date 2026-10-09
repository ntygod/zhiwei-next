import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { SCENARIOS, SCENARIO_ALIASES } from "./catalog.ts";
import { createNodeScenarioExecutor } from "./node-executor.ts";
import { runScenarioSuite, type RunnerProvenance } from "./scenario-runner.ts";

const provenance: RunnerProvenance = {
  source: { kind: "fixture", head: "a".repeat(40), tree: "b".repeat(40), clean: true },
  environment: { node: "synthetic", platform: "synthetic", arch: "synthetic", sqlite: "synthetic", isolation: "injected-test" },
};

test("G-4 preserves all original E definitions and historical S aliases exactly", () => {
  for (const scenario of SCENARIOS) {
    const file = scenario.id.startsWith("E0") ? "milestone-m0-execution.md" : "milestone-m1.md";
    const source = readFileSync(new URL(`../../../docs/planning/${file}`, import.meta.url), "utf8");
    assert.ok(source.includes(`| ${scenario.id} | ${scenario.given} | ${scenario.observe} | ${scenario.owner} |`));
  }
  const map = readFileSync(new URL("../../../docs/planning/scenario-id-map.md", import.meta.url), "utf8");
  for (const alias of SCENARIO_ALIASES) {
    assert.ok(map.includes(`| ${alias.id} | ${alias.summary} | ${alias.scenarios.join(", ")} | ${alias.limitation} |`));
  }
  assert.equal(SCENARIOS.length, 24);
  assert.equal(SCENARIO_ALIASES.length, 24);
});

test("G-4 invokes public Ledger commit/reopen, idempotency and atomic rollback with only PARTIAL coverage", async () => {
  const report = await runScenarioSuite(provenance, createNodeScenarioExecutor());
  assert.deepEqual(report.totals, { passed: 3, failed: 0, skipped: 0, "not-run": 21 });
  for (const result of report.results) {
    assert.equal(result.productCoverage, result.status === "passed" ? "PARTIAL" : "NONE");
    if (result.status === "passed") assert.equal(result.evidence?.reopened.length, 3);
  }
});

test("G-4 rejects status-only and missing evidence, unknown identifiers and aliases", async () => {
  for (const output of [undefined, { status: "passed" }, {}]) {
    const report = await runScenarioSuite({ ...provenance, select: ["E0-02"] }, { execute: async () => output });
    assert.equal(report.totals.failed, 1);
    assert.equal(report.totals.passed, 0);
  }
  for (const id of ["E0-99", "S0-12"]) {
    await assert.rejects(runScenarioSuite({ ...provenance, select: [id] }, { execute: async () => { throw new Error("must not run"); } }), /Unknown canonical/);
  }
});

test("G-4 reports skipped separately and never upgrades unavailable or unselected scenarios", async () => {
  let calls = 0;
  const report = await runScenarioSuite({ ...provenance, select: ["E0-02", "E1-01"], skip: { "E0-02": "explicit test selection", "E1-01": "cannot hide unavailable capability" } }, {
    execute: async () => { calls += 1; },
  });
  assert.equal(calls, 0);
  assert.deepEqual(report.totals, { passed: 0, failed: 0, skipped: 1, "not-run": 23 });
  assert.equal(report.results.find(result => result.id === "E1-01")?.reason, "required-product-capability-unavailable");
  assert.equal(report.results.find(result => result.id === "E0-03")?.reason, "not-selected");
  await assert.rejects(runScenarioSuite({ ...provenance, skip: { "E0-02": " " } }, { execute: async () => undefined }), /Skip needs/);
});

test("G-4 deterministic real evidence rejects deliberate false output and evidence deletion", async () => {
  const options = { ...provenance, select: ["E0-02"] };
  const first = await runScenarioSuite(options, createNodeScenarioExecutor());
  const second = await runScenarioSuite(options, createNodeScenarioExecutor());
  assert.deepEqual(first, second, "same fixture/environment/source yields comparable evidence");
  const evidence = first.results.find(result => result.id === "E0-02")?.evidence;
  assert.ok(evidence);
  const mutations: readonly unknown[] = [
    { ...evidence, reopened: [] },
    { ...evidence, after: evidence.after.map(row => ({ ...row, fingerprint: "0".repeat(64) })) },
    { ...evidence, insertedCounts: [2] },
    { ...evidence, integrity: [] },
    { ...evidence, closedBeforeReopen: false },
    { ...evidence, scenarioId: "E0-03" },
    { ...evidence, reopened: undefined },
    { ...evidence, extraStatus: "passed" },
  ];
  for (const mutation of mutations) {
    const report = await runScenarioSuite(options, { execute: async () => mutation });
    assert.equal(report.totals.failed, 1);
    assert.equal(report.totals.passed, 0);
  }
  const wrongFixture = await runScenarioSuite({ ...options, fixture: { now: "2026-02-01T00:00:00.000Z", idPrefix: "other-synthetic", modelReply: "other-command" } }, { execute: async () => evidence });
  assert.equal(wrongFixture.totals.failed, 1, "evidence is bound to fixture clock, IDs, and model output");
});

test("G-4 validates duplicate selection, bounds, and full source IDs before I/O", async () => {
  const executor = { execute: async (): Promise<unknown> => { throw new Error("must not execute"); } };
  await assert.rejects(runScenarioSuite({ ...provenance, select: ["E0-02", "E0-02"] }, executor), /Duplicate/);
  for (const timeoutMs of [0, -1, 60_001, NaN, Infinity, 1.5]) await assert.rejects(runScenarioSuite({ ...provenance, timeoutMs }, executor), /timeout/);
  await assert.rejects(runScenarioSuite({ ...provenance, source: { ...provenance.source, head: "abc" } }, executor), /complete source/);
  await assert.rejects(runScenarioSuite({ ...provenance, source: { ...provenance.source, kind: "observed-git", clean: false } }, executor), /Uncommitted/);
});
