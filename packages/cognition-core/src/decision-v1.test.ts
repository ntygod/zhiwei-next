import assert from "node:assert/strict";
import test from "node:test";
import { ids, type TaskId, type TaskAttemptId, type CriterionId, type WorkingStateV2, type CognitiveDecisionV1, type EvidenceRefV2 } from "../../domain/src/index.ts";
import { createTask, transitionTask, type TaskChange } from "./task-transitions.ts";
import { waitForCognitiveInputV1, respondToCognitiveInputV1, restartTaskWithCognitiveInputV1 } from "./decision-v1.ts";
const T0 = "2026-10-11T00:00:00.000Z", T1 = "2026-10-11T01:00:00.000Z";
function fixture() {
  const created = createTask({ id: "synthetic-task" as TaskId, attemptId: "synthetic-attempt" as TaskAttemptId, workspaceId: ids.workspace("synthetic-workspace"), sessionId: ids.session("synthetic-session"), revision: 1,
    intent: { revision: 1, request: "SYNTHETIC_ONLY: prepare a report", constraints: [], criteria: [{ id: "synthetic-check" as CriterionId, revision: 1, description: "Verify the report", required: true, method: "user-confirmation" }] }, now: T0 });
  const change = (revision: number, now = T0): TaskChange => ({ expectedRevision: revision, nextRevision: revision + 1, expectedIntentRevision: 1, attemptId: created.attempts[0]!.id, now, trigger: { id: "synthetic-trigger", revision: 1 } });
  const task = transitionTask(created, change(1), { kind: "prepare" }).task;
  const working: WorkingStateV2 = { schemaVersion: 2, id: task.id, revision: task.revision, scope: { kind: "task", workspaceId: task.workspaceId, taskId: task.id }, privacy: "model-allowed", sourceTrust: "verified-tool", createdAt: T0, updatedAt: T0,
    task: { kind: "task", id: task.id, revision: task.revision }, taskAttempt: { taskId: task.id, attemptId: task.attempts[0]!.id, intentRevision: 1 }, intentRevision: 1,
    currentStep: "READY", known: ["SYNTHETIC_ONLY: a supplied fact"], unknown: ["SYNTHETIC_ONLY: unresolved verification"], pendingInput: [], nextSteps: [],
    evidence: [{ source: { kind: "observation", id: "synthetic-task-input", revision: 1 }, role: "supports", scope: { kind: "task", workspaceId: task.workspaceId, taskId: task.id }, privacy: "model-allowed", sourceTrust: "user-direct", observedAt: T0 }] };
  const decision: CognitiveDecisionV1 = { schemaVersion: 1, action: "clarify", question: { id: "synthetic-question", prompt: "SYNTHETIC_ONLY: which format?" }, summary: "A format is required", claimRefs: [] };
  const evidence: EvidenceRefV2 = { source: { kind: "observation", id: "synthetic-user-input", revision: 1 }, role: "supports", scope: working.scope, privacy: "model-allowed", sourceTrust: "user-direct", observedAt: T1 };
  return { task, working, decision, evidence, change };
}
test("a cognitive question and exact user response preserve unknowns, history and immutable inputs", () => {
  const f = fixture(), original = structuredClone({ task: f.task, working: f.working, decision: f.decision });
  const waiting = waitForCognitiveInputV1(f.task, f.working, f.decision, f.change(2));
  assert.equal(waiting.task.state, "WAITING_INPUT"); assert.equal(waiting.task.attempts[0]!.outcomes.length, 0); assert.deepEqual(waiting.workingState.pendingInput, ["synthetic-question"]);
  const response = respondToCognitiveInputV1(waiting.task, waiting.workingState, f.decision, "synthetic-question", "SYNTHETIC_ONLY: plain text", [f.evidence], f.change(3, T1));
  assert.equal(response.task.state, "READY"); assert.equal(response.task.attempts[0]!.id, f.task.attempts[0]!.id); assert.equal(response.task.intent.revision, 1);
  assert.deepEqual(response.workingState.pendingInput, []); assert.deepEqual(response.workingState.unknown, f.working.unknown); assert.ok(response.workingState.known.includes("SYNTHETIC_ONLY: plain text"));
  assert.deepEqual({ task: f.task, working: f.working, decision: f.decision }, original); assert.equal(waiting.task.state, "WAITING_INPUT");
});
test("a fenced cognitive response retains confirmed stop history and requires a fresh attempt", () => {
  const f = fixture(), waiting = waitForCognitiveInputV1(f.task, f.working, f.decision, f.change(2)), original = structuredClone(waiting);
  const receipt = { taskId: waiting.task.id, attemptId: waiting.task.attempts[0]!.id, workspaceId: waiting.task.workspaceId, intentRevision: 1, at: T1, evidence: [{ id: "synthetic-no-execution", revision: 1 }] };
  const next = restartTaskWithCognitiveInputV1(waiting.task, waiting.workingState, f.decision, "synthetic-question", "SYNTHETIC_ONLY: plain text", [f.evidence], f.change(3, T1), "synthetic-next-attempt" as TaskAttemptId, receipt);
  assert.deepEqual(next.versions.map(task => task.state), ["CANCELLING", "CANCELLED", "CREATED", "READY"]);
  assert.equal(next.versions.at(-1)!.attempts[0]!.state, "CANCELLED"); assert.equal(next.versions.at(-1)!.attempts[1]!.id, "synthetic-next-attempt");
  assert.equal(next.workingStates.at(-1)!.taskAttempt.attemptId, "synthetic-next-attempt"); assert.deepEqual(next.workingStates.at(-1)!.pendingInput, []);
  assert.ok(next.workingStates.at(-1)!.known.includes("SYNTHETIC_ONLY: plain text")); assert.deepEqual(waiting, original);
  assert.throws(() => restartTaskWithCognitiveInputV1(waiting.task, waiting.workingState, f.decision, "synthetic-question", "answer", [], f.change(3, T1), "new" as TaskAttemptId, receipt));
  assert.throws(() => restartTaskWithCognitiveInputV1(waiting.task, waiting.workingState, f.decision, "synthetic-question", "answer", [f.evidence], f.change(3, T1), waiting.task.attempts[0]!.id, receipt));
  assert.throws(() => restartTaskWithCognitiveInputV1(waiting.task, waiting.workingState, f.decision, "synthetic-question", "answer", [f.evidence], f.change(3, T1), "new" as TaskAttemptId, { ...receipt, taskId: "foreign" as TaskId }));
});
test("cognitive input rejects stale revision, foreign scope, wrong questions and missing user evidence", () => {
  const f = fixture(); assert.throws(() => waitForCognitiveInputV1(f.task, f.working, f.decision, f.change(1)));
  assert.throws(() => waitForCognitiveInputV1(f.task, { ...f.working, scope: { kind: "task", taskId: f.task.id, workspaceId: "other-workspace" } }, f.decision, f.change(2)));
  const waiting = waitForCognitiveInputV1(f.task, f.working, f.decision, f.change(2));
  for (const [question, evidence] of [["other-question", [f.evidence]], ["synthetic-question", []], ["synthetic-question", [{ ...f.evidence, sourceTrust: "model-derived" }]]] as const)
    assert.throws(() => respondToCognitiveInputV1(waiting.task, waiting.workingState, f.decision, question, "SYNTHETIC_ONLY: answer", evidence, f.change(3, T1)));
  assert.throws(() => waitForCognitiveInputV1(waiting.task, waiting.workingState, f.decision, f.change(3)));
});
