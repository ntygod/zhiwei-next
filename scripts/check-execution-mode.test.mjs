import assert from "node:assert/strict";
import test from "node:test";
import { validateExecutionMode } from "./check-execution-mode.mjs";

// Every input below is an isolated in-memory fixture. No GitHub, recorded command,
// Runtime, preintegration experiment, product activation, or real evidence runs.
const technicalEdges = [
  ["P0-01", []], ["P0-02", []], ["P0-03", []], ["P0-04", []],
  ["P1-01", ["P0-03"]], ["P1-02", ["P1-01"]],
  ["P1-03", ["P1-02"]], ["P1-04", ["P1-03"]],
  ["P1-05", ["P1-04"]], ["P1-06", ["P1-05", "P0-04"]],
  ["P1-07", ["P1-06"]], ["P1-08", ["P1-07"]], ["P1-09", ["P1-08"]],
];

function fixture() {
  const tasks = technicalEdges.map(([id, depends]) => ({
    id,
    implementation_depends: [...depends],
    implementation_status: ["P0-03", "P0-04"].includes(id) ? "implemented" : "not_started",
    acceptance_status: "not_run",
    implementation_evidence: ["P0-03", "P0-04"].includes(id) ? [`fixture:${id}:merged-pr-reference-not-authenticated`] : [],
    acceptance_evidence: [],
  }));
  const data = {
    schemaVersion: 1,
    baseline: "design-v2",
    mode: "synthetic-development",
    taskCatalog: "docs/planning/development-plan.json",
    acceptanceDependencyField: "depends",
    nextImplementation: "P1-01",
    tasks,
  };
  const catalog = {
    schemaVersion: 2,
    baseline: "design-v2",
    status: "design-only",
    tasks: technicalEdges.map(([id, depends]) => ({
      id,
      depends: id === "P0-02" ? ["P0-01"] : id === "P1-01" ? ["P0-02", "P0-03", "P0-04"] : [...depends],
    })),
  };
  return { data, catalog, task: (id) => tasks.find((task) => task.id === id) };
}

function implemented(task) {
  task.implementation_status = "implemented";
  task.implementation_evidence = [`fixture:${task.id}:implementation-reference`];
}

function passed(task) {
  implemented(task);
  task.acceptance_status = "passed";
  task.acceptance_evidence = [`fixture:${task.id}:acceptance-reference-not-authenticated`];
}

function rejects(name, mutate, error) {
  test(name, () => {
    const f = fixture();
    mutate(f);
    assert.throws(() => validateExecutionMode(f.data, f.catalog), error);
  });
}

test("initial synthetic index keeps component implementation separate from acceptance", () => {
  const f = fixture();
  const before = structuredClone({ data: f.data, catalog: f.catalog });
  const result = validateExecutionMode(f.data, f.catalog);
  assert.equal(result.taskCount, 13);
  assert.deepEqual(result.implementationReady, ["P0-01", "P0-02", "P1-01"]);
  assert.equal(result.remoteEvidenceAuthenticated, false);
  assert.equal(result.acceptanceAuthenticated, false);
  assert.equal(result.activationAuthorized, false);
  assert.deepEqual({ data: f.data, catalog: f.catalog }, before, "Validation must not mutate either DAG");
  assert.ok(f.data.tasks.every((task) => task.acceptance_status === "not_run"));
});

test("P1-01 can progress using its technical prerequisite before the P0 acceptance gate", () => {
  const f = fixture();
  const task = f.task("P1-01");
  task.implementation_status = "in_progress";
  task.implementation_evidence = ["fixture:implementation-issue-reference"];
  assert.doesNotThrow(() => validateExecutionMode(f.data, f.catalog));
  implemented(task);
  f.data.nextImplementation = "P1-02";
  assert.doesNotThrow(() => validateExecutionMode(f.data, f.catalog));
  assert.equal(f.task("P0-01").acceptance_status, "not_run");
  assert.equal(f.task("P0-02").implementation_status, "not_started");
});

test("P0-02 implementation does not inherit the P0-01 acceptance dependency", () => {
  const f = fixture();
  implemented(f.task("P0-02"));
  assert.doesNotThrow(() => validateExecutionMode(f.data, f.catalog));
});

test("passed acceptance is structurally possible only with all original prerequisites passed", () => {
  const f = fixture();
  for (const task of f.data.tasks) passed(task);
  f.data.nextImplementation = null;
  const result = validateExecutionMode(f.data, f.catalog);
  assert.equal(result.acceptanceAuthenticated, false, "Even consistent passed declarations are not authenticated evidence");
  assert.equal(result.activationAuthorized, false);
});

test("pending, failed, and blocked acceptance records carry references without implying a pass", () => {
  for (const status of ["pending", "failed", "blocked"]) {
    const f = fixture();
    f.task("P1-01").acceptance_status = status;
    f.task("P1-01").acceptance_evidence = ["fixture:acceptance-run-or-blocker-reference"];
    assert.doesNotThrow(() => validateExecutionMode(f.data, f.catalog));
  }
});

test("blocked implementation is representable with a blocker reference", () => {
  const f = fixture();
  f.task("P1-02").implementation_status = "blocked";
  f.task("P1-02").implementation_evidence = ["fixture:waiting-for-P1-01"];
  assert.doesNotThrow(() => validateExecutionMode(f.data, f.catalog));
});

test("task order and dependency order do not change the DAG", () => {
  const f = fixture();
  f.data.tasks.reverse();
  f.task("P1-06").implementation_depends.reverse();
  f.catalog.tasks.reverse();
  assert.doesNotThrow(() => validateExecutionMode(f.data, f.catalog));
});

test("nextImplementation can select another ready task without changing the checker", () => {
  const f = fixture();
  f.data.nextImplementation = "P0-02";
  assert.doesNotThrow(() => validateExecutionMode(f.data, f.catalog));
});

test("nextImplementation is null when all remaining work is blocked", () => {
  const f = fixture();
  for (const task of f.data.tasks) {
    if (task.implementation_status === "implemented") continue;
    task.implementation_status = "blocked";
    task.implementation_evidence = ["fixture:blocker-reference"];
  }
  f.data.nextImplementation = null;
  assert.doesNotThrow(() => validateExecutionMode(f.data, f.catalog));
});

rejects("rejects unknown nextImplementation", (f) => { f.data.nextImplementation = "P9-99"; }, /unknown nextImplementation/);
rejects("rejects non-string nextImplementation", (f) => { f.data.nextImplementation = true; }, /task ID or null/);
rejects("rejects nextImplementation with unmet technical prerequisites", (f) => { f.data.nextImplementation = "P1-02"; }, /must be ready or in progress/);
rejects("rejects implemented nextImplementation", (f) => { f.data.nextImplementation = "P0-03"; }, /must be ready or in progress/);
rejects("rejects blocked nextImplementation", (f) => {
  f.task("P1-01").implementation_status = "blocked";
  f.task("P1-01").implementation_evidence = ["fixture:blocker-reference"];
}, /must be ready or in progress/);
rejects("rejects null nextImplementation while ready work remains", (f) => { f.data.nextImplementation = null; }, /cannot be null while ready or in-progress/);
rejects("rejects null nextImplementation while work is in progress", (f) => {
  for (const task of f.data.tasks) {
    if (task.implementation_status === "implemented") continue;
    task.implementation_status = "blocked";
    task.implementation_evidence = ["fixture:blocker-reference"];
  }
  f.task("P1-01").implementation_status = "in_progress";
  f.data.nextImplementation = null;
}, /cannot be null while ready or in-progress/);

for (const [field, value, error] of [
  ["schemaVersion", 2, /schemaVersion/],
  ["baseline", "design-v1", /baseline/],
  ["mode", "production-enabled", /cannot claim activation/],
  ["taskCatalog", "other-plan.json", /original task catalog/],
  ["acceptanceDependencyField", "implementation_depends", /Acceptance dependencies/],
  ["nextImplementation", "", /nextImplementation/],
]) rejects(`rejects invalid ${field}`, (f) => { f.data[field] = value; }, error);

rejects("rejects missing top-level fields", (f) => { delete f.data.mode; }, /missing or unknown fields/);
rejects("rejects top-level enable claim", (f) => { f.data.enable = true; }, /missing or unknown fields/);
rejects("rejects top-level activation object", (f) => { f.data.activation = { approved: true }; }, /missing or unknown fields/);
rejects("rejects task activation claim", (f) => { f.task("P1-01").enable = true; }, /missing or unknown fields/);
rejects("rejects a replacement acceptance DAG in the index", (f) => { f.task("P1-01").acceptance_depends = []; }, /missing or unknown fields/);
rejects("rejects unknown task fields", (f) => { f.task("P0-01").note = "extra"; }, /missing or unknown fields/);
rejects("rejects missing task fields", (f) => { delete f.task("P0-01").acceptance_evidence; }, /missing or unknown fields/);
rejects("rejects non-object index", (f) => { f.data = null; }, /expected object/);
rejects("rejects non-array task list", (f) => { f.data.tasks = {}; }, /expected tasks array/);
rejects("rejects non-object task", (f) => { f.data.tasks[0] = null; }, /expected object/);
rejects("rejects missing tasks", (f) => { f.data.tasks.pop(); }, /must cover exactly/);
rejects("rejects duplicate tasks", (f) => { f.data.tasks.push(structuredClone(f.data.tasks[0])); }, /duplicate task/);
rejects("rejects unknown task ID", (f) => { f.task("P0-01").id = "P9-99"; }, /unsupported task/);
rejects("rejects catalog tasks outside the current index scope", (f) => {
  f.catalog.tasks.push({ id: "P2-01", depends: ["P1-09"] });
  f.data.tasks.push({ ...structuredClone(f.task("P0-01")), id: "P2-01" });
}, /unsupported task/);
rejects("rejects task IDs absent from original catalog", (f) => { f.catalog.tasks = f.catalog.tasks.filter((task) => task.id !== "P1-09"); }, /missing from original catalog/);
rejects("rejects unknown implementation reference", (f) => { f.task("P1-01").implementation_depends = ["P9-99"]; }, /unknown dependency/);
rejects("rejects duplicate implementation references", (f) => { f.task("P1-01").implementation_depends.push("P0-03"); }, /duplicates/);
rejects("rejects malformed implementation references", (f) => { f.task("P1-01").implementation_depends = [null]; }, /nonblank strings/);
rejects("rejects implementation cycles", (f) => { f.task("P0-03").implementation_depends = ["P1-01"]; }, /dependency cycle/);
rejects("rejects self-dependencies", (f) => { f.task("P1-01").implementation_depends = ["P1-01"]; }, /dependency cycle/);

for (const [id, dependencies] of technicalEdges) {
  for (const dependency of dependencies) rejects(`rejects removed technical edge ${id} -> ${dependency}`, (f) => {
    f.task(id).implementation_depends = dependencies.filter((entry) => entry !== dependency);
  }, /required technical implementation dependencies changed/);
}
rejects("rejects restoring the phase acceptance gate as an implementation barrier", (f) => {
  f.task("P1-01").implementation_depends = ["P0-02", "P0-03", "P0-04"];
}, /required technical implementation dependencies changed/);
rejects("rejects adding the P0-01 acceptance edge to P0-02 implementation", (f) => {
  f.task("P0-02").implementation_depends = ["P0-01"];
}, /required technical implementation dependencies changed/);

for (const status of ["in_progress", "implemented"]) rejects(`rejects ${status} before its technical prerequisite is implemented`, (f) => {
  f.task("P1-02").implementation_status = status;
  f.task("P1-02").implementation_evidence = ["fixture:implementation-reference"];
}, /implementation prerequisite P1-01 is not implemented/);

rejects("rejects unknown implementation status", (f) => { f.task("P1-01").implementation_status = "enabled"; }, /invalid implementation_status/);
rejects("rejects unknown acceptance status", (f) => { f.task("P1-01").acceptance_status = "accepted"; }, /invalid acceptance_status/);
for (const status of ["in_progress", "implemented", "blocked"]) rejects(`rejects ${status} without implementation evidence`, (f) => {
  f.task("P1-01").implementation_status = status;
}, /needs evidence or a blocker reference/);
for (const status of ["pending", "passed", "failed", "blocked"]) rejects(`rejects ${status} without acceptance evidence`, (f) => {
  implemented(f.task("P1-01"));
  f.task("P1-01").acceptance_status = status;
}, /needs evidence or a blocker reference/);
for (const field of ["implementation_evidence", "acceptance_evidence"]) {
  for (const value of [null, "reference", [null], [""], ["  "], [{ enabled: true }]]) rejects(`rejects malformed ${field}: ${JSON.stringify(value)}`, (f) => {
    f.task("P0-03")[field] = value;
  }, /nonblank strings/);
  rejects(`rejects duplicate ${field}`, (f) => { f.task("P0-03")[field] = ["fixture:ref", "fixture:ref"]; }, /duplicates/);
}
rejects("rejects evidence attached to not_started implementation", (f) => {
  f.task("P1-01").implementation_evidence = ["fixture:implementation-reference"];
}, /not_started must have empty evidence/);
rejects("rejects evidence attached to not_run acceptance", (f) => {
  f.task("P1-01").acceptance_evidence = ["fixture:acceptance-reference"];
}, /not_run must have empty evidence/);
rejects("rejects passed acceptance of an unimplemented task", (f) => {
  f.task("P0-01").acceptance_status = "passed";
  f.task("P0-01").acceptance_evidence = ["fixture:acceptance-reference"];
}, /passed acceptance requires implemented task/);
rejects("P0-02 passed acceptance still needs original P0-01 acceptance", (f) => { passed(f.task("P0-02")); }, /acceptance prerequisite P0-01 has not passed/);
for (const dependency of ["P0-02", "P0-03", "P0-04"]) rejects(`P1-01 passed acceptance still needs original ${dependency} acceptance`, (f) => {
  for (const id of ["P0-01", "P0-02", "P0-03", "P0-04", "P1-01"]) passed(f.task(id));
  f.task(dependency).acceptance_status = "not_run";
  f.task(dependency).acceptance_evidence = [];
}, new RegExp(`acceptance prerequisite ${dependency} has not passed`));
rejects("transitive original acceptance dependency must also pass", (f) => {
  for (const id of ["P0-02", "P0-03", "P0-04", "P1-01"]) passed(f.task(id));
}, /acceptance prerequisite P0-01 has not passed/);

rejects("rejects non-object catalog", (f) => { f.catalog = null; }, /expected object/);
rejects("rejects changed catalog schema", (f) => { f.catalog.schemaVersion = 1; }, /schemaVersion/);
rejects("rejects changed catalog baseline", (f) => { f.catalog.baseline = "other"; }, /baseline/);
rejects("rejects catalog completion claims", (f) => { f.catalog.status = "complete"; }, /not a completion database/);
rejects("rejects missing catalog tasks", (f) => { delete f.catalog.tasks; }, /expected tasks/);
rejects("rejects malformed catalog tasks", (f) => { f.catalog.tasks[0] = null; }, /expected object/);
rejects("rejects blank catalog ID", (f) => { f.catalog.tasks[0].id = ""; }, /expected id/);
rejects("rejects duplicate catalog tasks", (f) => { f.catalog.tasks.push(structuredClone(f.catalog.tasks[0])); }, /duplicate/);
rejects("rejects malformed acceptance references", (f) => { f.catalog.tasks[0].depends = [true]; }, /nonblank strings/);
rejects("rejects duplicate acceptance references", (f) => { f.catalog.tasks[1].depends.push("P0-01"); }, /duplicates/);
rejects("rejects unknown acceptance references", (f) => { f.catalog.tasks[0].depends = ["P9-99"]; }, /unknown dependency/);
rejects("rejects acceptance cycles", (f) => { f.catalog.tasks[0].depends = ["P0-02"]; }, /dependency cycle/);
