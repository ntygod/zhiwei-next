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
