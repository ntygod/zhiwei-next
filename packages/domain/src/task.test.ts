import { test } from "node:test";
import assert from "node:assert/strict";
import { assertTaskIntent, assertTaskRevision, assertTaskTime, assertTaskEvidence, isTerminalTaskState, type CriterionId, type TaskIntent, type TaskState } from "./index.ts";

const intent: TaskIntent = { revision: 1, request: "Produce a synthetic report", constraints: [], criteria: [
  { id: "content" as CriterionId, revision: 1, description: "Contains the expected field", required: true, method: "artifact" },
] };
test("task intent is JSON serializable with exact criterion semantics", () => {
  assertTaskIntent(intent);
  const copy = JSON.parse(JSON.stringify(intent));
  assert.deepEqual(copy, intent); assertTaskIntent(copy);
});
test("task revisions are positive safe integers", () => {
  for (const value of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => assertTaskRevision(value));
  assertTaskRevision(1); assertTaskRevision(Number.MAX_SAFE_INTEGER);
});
test("task time accepts canonical UTC only, rejecting impossible dates", () => {
  assertTaskTime("2026-10-10T00:00:00.000Z");
  for (const value of ["", "2026-02-30T00:00:00.000Z", "2026-10-10", "2026-10-10T00:00:00+00:00", "2026-10-10T00:00:60.000Z"]) assert.throws(() => assertTaskTime(value));
});
test("criterion IDs, method, required flags and empty acceptance sets fail closed", () => {
  for (const patch of [{ request: " " }, { criteria: [] }, { criteria: [intent.criteria[0], intent.criteria[0]] },
    { criteria: [{ ...intent.criteria[0], required: false }] }, { criteria: [{ ...intent.criteria[0], id: "" }] },
    { criteria: [{ ...intent.criteria[0], method: "exit-code" }] }, { criteria: [{ ...intent.criteria[0], required: "yes" }] },
    { constraints: [""] }]) assert.throws(() => assertTaskIntent({ ...intent, ...patch } as TaskIntent));
});
test("evidence requires exact nonempty version references", () => {
  assertTaskEvidence([{ id: "synthetic-evidence", revision: 1 }]);
  for (const refs of [[], [{ id: "", revision: 1 }], [{ id: "a", revision: 0 }], [{ id: "a", revision: 1 }, { id: "a", revision: 2 }]]) assert.throws(() => assertTaskEvidence(refs));
});
test("all domain task states classify without confusing reconciliation for a terminal", () => {
  const states: Record<TaskState, boolean> = { CREATED: false, READY: false, RUNNING: false, VERIFYING: false,
    WAITING_INPUT: false, WAITING_APPROVAL: false, PAUSED: false, CANCELLING: false, NEEDS_RECONCILIATION: false,
    COMPLETED: true, PARTIAL: true, FAILED: true, CANCELLED: true, UNVERIFIABLE: true };
  for (const [state, terminal] of Object.entries(states)) assert.equal(isTerminalTaskState(state as TaskState), terminal);
});
