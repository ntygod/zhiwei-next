import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const catalogPath = "docs/planning/development-plan.json";
const indexPath = "docs/harness/execution-mode.json";
const implementationDependencies = {
  "P0-01": [],
  "P0-02": [],
  "P0-03": [],
  "P0-04": [],
  "P1-01": ["P0-03"],
  "P1-02": ["P1-01"],
  "P1-03": ["P1-02"],
  "P1-04": ["P1-03"],
  "P1-05": ["P1-04"],
  "P1-06": ["P1-05", "P0-04"],
  "P1-07": ["P1-06"],
  "P1-08": ["P1-07"],
  "P1-09": ["P1-08"],
};
const implementationStatuses = ["not_started", "in_progress", "implemented", "blocked"];
const acceptanceStatuses = ["not_run", "pending", "passed", "failed", "blocked"];
const nonempty = (value) => typeof value === "string" && value.trim().length > 0;

function object(value, label) {
  assert.ok(value !== null && typeof value === "object" && !Array.isArray(value), `${label}: expected object`);
}

function exactKeys(value, keys, label) {
  object(value, label);
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort(), `${label}: missing or unknown fields`);
}

function stringList(value, label) {
  assert.ok(Array.isArray(value) && [...value].every(nonempty), `${label}: expected array of nonblank strings`);
  assert.equal(new Set(value).size, value.length, `${label}: duplicates`);
}

function acyclic(tasks, field, label) {
  const active = new Set();
  const visited = new Set();
  function visit(id) {
    assert.ok(!active.has(id), `${label}: dependency cycle at ${id}`);
    if (visited.has(id)) return;
    active.add(id);
    for (const dependency of tasks.get(id)[field]) {
      assert.ok(tasks.has(dependency), `${label}: ${id} has unknown dependency ${dependency}`);
      visit(dependency);
    }
    active.delete(id);
    visited.add(id);
  }
  for (const id of tasks.keys()) visit(id);
}

function evidenceFor(status, initialStatus, evidence, label) {
  stringList(evidence, `${label} evidence`);
  if (status === initialStatus) assert.equal(evidence.length, 0, `${label}: ${initialStatus} must have empty evidence`);
  else assert.ok(evidence.length > 0, `${label}: ${status} needs evidence or a blocker reference`);
}

// A pure structural/status consistency check. References are neither fetched nor
// executed and never authenticate merged PRs, acceptance, approval, or permission.
// The original catalog remains the acceptance DAG; this index cannot enable any
// product entry point or replace an existing decision, Runtime, or release gate.
export function validateExecutionMode(data, catalog) {
  exactKeys(data, ["schemaVersion", "baseline", "mode", "taskCatalog", "acceptanceDependencyField", "nextImplementation", "tasks"], "Execution mode");
  assert.equal(data.schemaVersion, 1, "Execution mode: unsupported schemaVersion");
  assert.equal(data.baseline, "design-v2", "Execution mode: unexpected baseline");
  assert.equal(data.mode, "synthetic-development", "Execution mode cannot claim activation");
  assert.equal(data.taskCatalog, catalogPath, "Execution mode must use the original task catalog");
  assert.equal(data.acceptanceDependencyField, "depends", "Acceptance dependencies must remain catalog depends");
  assert.ok(data.nextImplementation === null || nonempty(data.nextImplementation), "Execution mode: nextImplementation must be a task ID or null");

  object(catalog, "Task catalog");
  assert.equal(catalog.schemaVersion, 2, "Task catalog: unsupported schemaVersion");
  assert.equal(catalog.baseline, "design-v2", "Task catalog: unexpected baseline");
  assert.equal(catalog.status, "design-only", "The original task catalog is not a completion database");
  assert.ok(Array.isArray(catalog.tasks) && catalog.tasks.length > 0, "Task catalog: expected tasks");
  const catalogTasks = new Map();
  for (const task of catalog.tasks) {
    object(task, "Catalog task");
    assert.ok(nonempty(task.id), "Catalog task: expected id");
    assert.ok(!catalogTasks.has(task.id), `Task catalog: duplicate ${task.id}`);
    stringList(task.depends, `${task.id} acceptance dependencies`);
    catalogTasks.set(task.id, task);
  }
  acyclic(catalogTasks, "depends", "Acceptance DAG");

  assert.ok(Array.isArray(data.tasks), "Execution mode: expected tasks array");
  const tasks = new Map();
  for (const task of data.tasks) {
    exactKeys(task, ["id", "implementation_depends", "implementation_status", "acceptance_status", "implementation_evidence", "acceptance_evidence"], "Execution task");
    assert.ok(Object.hasOwn(implementationDependencies, task.id), `Execution mode: unsupported task ${task.id}`);
    assert.ok(catalogTasks.has(task.id), `Execution mode: task ${task.id} missing from original catalog`);
    assert.ok(!tasks.has(task.id), `Execution mode: duplicate task ${task.id}`);
    stringList(task.implementation_depends, `${task.id} implementation dependencies`);
    assert.ok(implementationStatuses.includes(task.implementation_status), `${task.id}: invalid implementation_status`);
    assert.ok(acceptanceStatuses.includes(task.acceptance_status), `${task.id}: invalid acceptance_status`);
    evidenceFor(task.implementation_status, "not_started", task.implementation_evidence, `${task.id} implementation`);
    evidenceFor(task.acceptance_status, "not_run", task.acceptance_evidence, `${task.id} acceptance`);
    tasks.set(task.id, task);
  }
  assert.deepEqual([...tasks.keys()].sort(), Object.keys(implementationDependencies).sort(), "Execution mode must cover exactly P0-01–P0-04 and P1-01–P1-09");
  acyclic(tasks, "implementation_depends", "Implementation DAG");

  for (const task of tasks.values()) {
    assert.deepEqual([...task.implementation_depends].sort(), [...implementationDependencies[task.id]].sort(), `${task.id}: required technical implementation dependencies changed`);
    if (["in_progress", "implemented"].includes(task.implementation_status)) {
      for (const dependency of task.implementation_depends) {
        assert.equal(tasks.get(dependency).implementation_status, "implemented", `${task.id}: implementation prerequisite ${dependency} is not implemented`);
      }
    }
    if (task.acceptance_status === "passed") {
      assert.equal(task.implementation_status, "implemented", `${task.id}: passed acceptance requires implemented task`);
      for (const dependency of catalogTasks.get(task.id).depends) {
        assert.equal(tasks.get(dependency)?.acceptance_status, "passed", `${task.id}: acceptance prerequisite ${dependency} has not passed`);
      }
    }
  }

  const implementationReady = [...tasks.values()]
    .filter((task) => task.implementation_status === "not_started" && task.implementation_depends.every((id) => tasks.get(id).implementation_status === "implemented"))
    .map((task) => task.id);
  const implementationInProgress = [...tasks.values()]
    .filter((task) => task.implementation_status === "in_progress")
    .map((task) => task.id);
  const candidates = [...implementationReady, ...implementationInProgress];
  if (data.nextImplementation === null) {
    assert.equal(candidates.length, 0, "Execution mode: nextImplementation cannot be null while ready or in-progress tasks remain");
  } else {
    assert.ok(tasks.has(data.nextImplementation), `Execution mode: unknown nextImplementation ${data.nextImplementation}`);
    assert.ok(candidates.includes(data.nextImplementation), `Execution mode: nextImplementation ${data.nextImplementation} must be ready or in progress`);
  }

  return {
    taskCount: tasks.size,
    implementationReady,
    remoteEvidenceAuthenticated: false,
    acceptanceAuthenticated: false,
    activationAuthorized: false,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.equal(process.argv.length, 2, "Usage: node scripts/check-execution-mode.mjs");
  const readJson = (path) => JSON.parse(readFileSync(resolve(root, path), "utf8"));
  const result = validateExecutionMode(readJson(indexPath), readJson(catalogPath));
  console.log(`Execution mode: ${result.taskCount} tasks; separate implementation/acceptance DAGs and evidence references consistent. Remote evidence, product acceptance, and activation NOT authenticated.`);
}
