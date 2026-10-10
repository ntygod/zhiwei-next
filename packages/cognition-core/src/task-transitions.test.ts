import assert from "node:assert/strict";
import test from "node:test";
import { createTask, transitionTask, retryTask, reviseTaskIntent, type TaskAction, type TaskChange, type AttemptReceipt } from "./index.ts";
import { ids, type Task, type TaskId, type TaskAttemptId, type CriterionId, type OutcomeId, type TaskIntent, type CriterionResult } from "../../domain/src/index.ts";

// Synthetic, injected values only: this suite proves no runtime stop or real verification.
const time = (second: number) => `2026-10-01T00:00:${String(second).padStart(2, "0")}.000Z`;
const attemptId = (value = "attempt-1") => value as TaskAttemptId;
const evidence = () => ({ id: "synthetic-receipt", revision: 1 });
function intent(): TaskIntent {
  return { revision: 1, request: "Produce a synthetic artifact", constraints: ["Stay in this workspace"], criteria: [
    { id: "criterion-1" as CriterionId, revision: 1, description: "Artifact passes fixture", required: true, method: "deterministic-test" },
  ] };
}
function createInput() {
  return { id: "task-1" as TaskId, attemptId: attemptId(), workspaceId: ids.workspace("synthetic-workspace"), sessionId: ids.session("synthetic-session"), revision: 1, intent: intent(), now: time(0) };
}
function created() { return createTask(createInput()); }
function change(task: Task, now = time(task.revision)): TaskChange {
  return { expectedRevision: task.revision, nextRevision: task.revision + 1, expectedIntentRevision: task.intent.revision, attemptId: task.attempts.at(-1)!.id, now, trigger: evidence() };
}
function receipt(task: Task, at = time(task.revision)): AttemptReceipt {
  return { taskId: task.id, attemptId: task.attempts.at(-1)!.id, workspaceId: task.workspaceId, intentRevision: task.intent.revision, at, evidence: [evidence()] };
}
function step(task: Task, action: TaskAction) { return transitionTask(task, change(task), action).task; }
function ready() { return step(created(), { kind: "prepare" }); }
function running() { const task = ready(); return step(task, { kind: "start", preparation: receipt(task) }); }
function verifying(completeness: "complete" | "incomplete" = "complete", input = running()) {
  return step(input, { kind: "settled", receipt: receipt(input), completeness });
}
function result(task: Task, status: "pass" | "fail" | "unknown" = "pass"): CriterionResult {
  const criterion = task.intent.criteria[0];
  const base = { taskId: task.id, attemptId: task.attempts.at(-1)!.id, workspaceId: task.workspaceId, intentRevision: task.intent.revision, criterionId: criterion.id, criterionRevision: criterion.revision, method: criterion.method, checkedAt: task.updatedAt, explanation: "Synthetic verifier result", evidence: [evidence()] };
  return status === "unknown" ? { ...base, status, reason: "validator-unavailable" } : { ...base, status, validUntil: time(59) };
}
function finalize(task: Task, status: "pass" | "fail" | "unknown" = "pass"): Task {
  return step(task, { kind: "finalize", outcomeId: `outcome-${task.attempts.at(-1)!.id}` as OutcomeId, outcomeRevision: 1, results: [result(task, status)] });
}
function frozenDeep(value: unknown): void {
  if (value !== null && typeof value === "object") { assert.ok(Object.isFrozen(value)); for (const child of Object.values(value)) frozenDeep(child); }
}

test("creation and execution record state revisions without claiming success before verification", () => {
  const initial = created();
  assert.equal(initial.state, "CREATED"); assert.equal(initial.attempts.length, 1);
  const prepared = transitionTask(initial, change(initial), { kind: "prepare" });
  assert.deepEqual(prepared.record, { taskId: initial.id, attemptId: attemptId(), from: "CREATED", to: "READY", reason: "prepare", previousRevision: 1, revision: 2, intentRevision: 1, occurredAt: time(1), trigger: evidence() });
  const active = running(); const settled = verifying("complete", active);
  assert.equal(active.state, "RUNNING"); assert.equal(settled.state, "VERIFYING");
  assert.deepEqual(settled.attempts[0].outcomes, []);
  const complete = finalize(settled);
  assert.equal(complete.state, "COMPLETED"); assert.equal(complete.revision, 5); assert.equal(complete.intent.revision, 1);
  assert.equal(complete.attempts[0].outcomes[0].status, "completed");
});

test("failure, missing validation, model assertions and incomplete execution cannot claim completion", () => {
  assert.equal(finalize(verifying(), "fail").state, "FAILED");
  assert.equal(finalize(verifying(), "unknown").state, "UNVERIFIABLE");
  assert.equal(finalize(verifying("incomplete")).state, "PARTIAL");
  const input = createInput(); input.intent = { ...input.intent, criteria: input.intent.criteria.map(c => ({ ...c, method: "model-assisted" })) };
  let task = step(createTask(input), { kind: "prepare" }); task = step(task, { kind: "start", preparation: receipt(task) });
  const final = finalize(verifying("complete", task));
  assert.equal(final.state, "UNVERIFIABLE"); assert.equal(final.attempts[0].outcomes[0].criteriaResults[0].status, "unknown");
});

test("illegal transitions never bypass prepare, run or verification", () => {
  for (const task of [created(), ready(), running()]) {
    assert.throws(() => finalize(task), /illegal task transition/);
  }
  assert.throws(() => step(created(), { kind: "start", preparation: receipt(created()) }), /illegal task transition/);
  assert.throws(() => step(ready(), { kind: "settled", receipt: receipt(ready()), completeness: "complete" }), /illegal task transition/);
  assert.throws(() => step(running(), { kind: "prepare" }), /illegal task transition/);
  assert.throws(() => step(finalize(verifying()), { kind: "cancel" }), /terminal attempt/);
});

test("CAS, intent version, attempt identity, time and trigger evidence are enforced", () => {
  const task = created(); const good = change(task);
  for (const patch of [ { expectedRevision: 2 }, { nextRevision: 3 }, { expectedRevision: 0 }, { nextRevision: 1.5 }, { expectedIntentRevision: 2 }, { attemptId: attemptId("other") }, { now: "2026-09-30T23:59:59.000Z" }, { now: "invalid" }, { trigger: { id: "", revision: 1 } }, { trigger: { id: "event", revision: 0 } } ]) {
    assert.throws(() => transitionTask(task, { ...good, ...patch }, { kind: "prepare" }));
  }
  const prepared = step(task, { kind: "prepare" });
  assert.throws(() => transitionTask(prepared, good, { kind: "wait-input", question: "Which fixture?" }), /revision conflict/);
});

test("receipts require exact task, attempt, workspace, intent, evidence and bounded timestamps", () => {
  const task = ready(); const valid = receipt(task);
  for (const patch of [ { taskId: "other" as TaskId }, { attemptId: attemptId("other") }, { workspaceId: ids.workspace("other") }, { intentRevision: 2 }, { at: time(0) }, { at: time(3) }, { evidence: [] }, { evidence: [{ id: "receipt", revision: 0 }] } ]) {
    assert.throws(() => step(task, { kind: "start", preparation: { ...valid, ...patch } }));
  }
  assert.equal(step(task, { kind: "start", preparation: { ...valid, at: task.updatedAt } }).state, "RUNNING");
  assert.equal(step(task, { kind: "start", preparation: valid }).state, "RUNNING");
  const active = running();
  assert.throws(() => step(active, { kind: "settled", receipt: { ...receipt(active), workspaceId: ids.workspace("other") }, completeness: "complete" }), /binding conflict/);
});

test("waiting paths return to READY without duplicate attempts and reject repeated continue", () => {
  for (const task of [step(created(), { kind: "wait-input", question: "Which artifact?" }), step(ready(), { kind: "wait-approval", proposal: evidence() })]) {
    const resumed = step(task, { kind: "continue" });
    assert.equal(resumed.state, "READY"); assert.equal(resumed.attempts.length, 1); assert.equal(resumed.intent.revision, 1);
    assert.throws(() => step(resumed, { kind: "continue" }), /illegal task transition/);
  }
  assert.throws(() => step(created(), { kind: "wait-input", question: " " }), /question/);
  assert.throws(() => step(ready(), { kind: "wait-approval", proposal: { id: "proposal", revision: 0 } }), /revision/);
});

test("pause is a request until a stop-boundary receipt confirms no unresolved effects", () => {
  const active = running();
  assert.throws(() => step(active, { kind: "confirm-pause", receipt: receipt(active), unresolvedActions: [] }), /pause not requested/);
  const requested = step(active, { kind: "request-pause" });
  assert.equal(requested.state, "RUNNING"); assert.equal(requested.attempts[0].pauseRequested, true);
  assert.throws(() => step(requested, { kind: "request-pause" }), /already requested/);
  assert.throws(() => step(requested, { kind: "confirm-pause", receipt: receipt(requested), unresolvedActions: [{ id: "unknown-action", revision: 1 }] }), /unresolved effects/);
  assert.throws(() => step(requested, { kind: "confirm-pause", receipt: { ...receipt(requested), at: active.updatedAt }, unresolvedActions: [] }), /stale/);
  const paused = step(requested, { kind: "confirm-pause", receipt: receipt(requested), unresolvedActions: [] });
  assert.equal(paused.state, "PAUSED"); assert.equal(paused.attempts[0].pauseRequested, false);
  assert.throws(() => step(paused, { kind: "continue" }), /illegal task transition/);
  assert.throws(() => step(paused, { kind: "start", preparation: receipt(paused) }), /illegal task transition/);
});

test("cancellation is not completed until stop is confirmed and all effects reconciled", () => {
  const cancelling = step(running(), { kind: "cancel" });
  assert.equal(cancelling.state, "CANCELLING"); assert.equal(cancelling.attempts[0].cancellationRequested, true);
  assert.throws(() => step(cancelling, { kind: "cancel" }), /already requested/);
  assert.throws(() => finalize(cancelling), /illegal task transition/);
  const stopped = step(cancelling, { kind: "confirm-stop", receipt: receipt(cancelling), unresolvedActions: [] });
  assert.equal(stopped.state, "CANCELLED");
  const unknown = step(cancelling, { kind: "confirm-stop", receipt: receipt(cancelling), unresolvedActions: [{ id: "action-1", revision: 1 }] });
  assert.equal(unknown.state, "NEEDS_RECONCILIATION");
  assert.throws(() => finalize(unknown), /illegal task transition/);
  assert.throws(() => retryTask(unknown, change(unknown), attemptId("attempt-2")), /terminal/);
  const checked = step(unknown, { kind: "reconcile", receipt: receipt(unknown), actionRefs: [{ id: "action-1", revision: 1 }] });
  assert.equal(checked.state, "VERIFYING"); assert.equal(finalize(checked).state, "CANCELLED");
});

test("unknown running effects cannot be retried or reconciled with unrelated action references", () => {
  const unknown = step(running(), { kind: "effects-unknown", actionRefs: [{ id: "action-1", revision: 3 }] });
  assert.equal(unknown.state, "NEEDS_RECONCILIATION");
  assert.throws(() => step(unknown, { kind: "start", preparation: receipt(unknown) }), /illegal task transition/);
  assert.throws(() => step(unknown, { kind: "reconcile", receipt: receipt(unknown), actionRefs: [{ id: "other-action", revision: 3 }] }));
  assert.throws(() => step(unknown, { kind: "reconcile", receipt: receipt(unknown), actionRefs: [{ id: "action-1", revision: 2 }] }));
  const checked = step(unknown, { kind: "reconcile", receipt: receipt(unknown), actionRefs: [{ id: "action-1", revision: 3 }] });
  assert.equal(finalize(checked).state, "COMPLETED");
});

test("terminal retry creates a new attempt and preserves the failed history", () => {
  const failed = finalize(verifying(), "fail"); const before = structuredClone(failed);
  const retried = retryTask(failed, change(failed), attemptId("attempt-2"));
  assert.equal(retried.task.state, "CREATED"); assert.equal(retried.task.revision, failed.revision + 1);
  assert.equal(retried.task.intent.revision, failed.intent.revision); assert.equal(retried.record.reason, "retry");
  assert.deepEqual(retried.task.attempts[0], failed.attempts[0]); assert.equal(retried.task.attempts[1].id, "attempt-2");
  assert.deepEqual(retried.task.attempts[1].outcomes, []); assert.deepEqual(failed, before);
  assert.throws(() => retryTask(failed, change(failed), attemptId()), /reused/);
  assert.throws(() => retryTask(running(), change(running()), attemptId("attempt-2")), /terminal/);
  let second = step(retried.task, { kind: "prepare" }); second = step(second, { kind: "start", preparation: receipt(second) });
  const completed = finalize(verifying("complete", second));
  assert.equal(completed.state, "COMPLETED"); assert.equal(completed.attempts[0].state, "FAILED"); assert.equal(completed.attempts[0].outcomes[0].status, "failed");
});

test("semantic intent changes require a terminal prior attempt and preserve separate revisions", () => {
  const failed = finalize(verifying(), "fail");
  const revisedIntent = { ...intent(), revision: 2, request: "Produce a different synthetic artifact" };
  const revised = reviseTaskIntent(failed, change(failed), revisedIntent, attemptId("attempt-2"));
  assert.equal(revised.task.intent.revision, 2); assert.equal(revised.task.revision, failed.revision + 1);
  assert.deepEqual(revised.task.attempts[0], failed.attempts[0]); assert.equal(revised.task.attempts[0].intent.revision, 1);
  assert.equal(revised.task.attempts[1].intent.request, revisedIntent.request);
  assert.throws(() => reviseTaskIntent(running(), change(running()), revisedIntent, attemptId("attempt-2")), /terminal/);
  assert.throws(() => reviseTaskIntent(failed, change(failed), { ...revisedIntent, revision: 3 }, attemptId("attempt-2")), /advance by one/);
  assert.throws(() => reviseTaskIntent(failed, change(failed), { ...intent(), revision: 2 }, attemptId("attempt-2")), /semantically/);
  assert.throws(() => reviseTaskIntent(failed, change(failed), revisedIntent, attemptId()), /reused/);
  assert.throws(() => transitionTask(revised.task, { ...change(revised.task), expectedIntentRevision: 1 }, { kind: "prepare" }), /intent revision/);
});

test("creation and transitions clone mutable input and recursively freeze isolated output", () => {
  const input = createInput(); const before = structuredClone(input); const task = createTask(input);
  assert.deepEqual(input, before); assert.equal(Object.isFrozen(input.intent), false); frozenDeep(task);
  (input.intent.constraints as string[]).push("Caller mutation");
  assert.deepEqual(task.intent.constraints, before.intent.constraints);
  const mutable = structuredClone(task); const command = change(mutable); const prior = structuredClone(mutable);
  const output = transitionTask(mutable, command, { kind: "prepare" });
  assert.deepEqual(mutable, prior); assert.equal(Object.isFrozen(mutable), false); assert.equal(Object.isFrozen(command.trigger), false);
  assert.notEqual(output.task.intent, mutable.intent); assert.notEqual(output.record.trigger, command.trigger); frozenDeep(output);
  (command.trigger as { id: string }).id = "changed";
  assert.equal(output.record.trigger.id, "synthetic-receipt");
  const check = verifying(); const supplied = structuredClone(result(check));
  const final = step(check, { kind: "finalize", outcomeId: "outcome-1" as OutcomeId, outcomeRevision: 1, results: [supplied] });
  assert.equal(Object.isFrozen(supplied.evidence), false); frozenDeep(final);
  (supplied.evidence[0] as { id: string }).id = "changed";
  assert.equal(final.attempts[0].outcomes[0].criteriaResults[0].evidence[0].id, "synthetic-receipt");
});

test("invalid creation and corrupted task scope, history or state are rejected", () => {
  for (const input of [ { ...createInput(), revision: 2 }, { ...createInput(), attemptId: attemptId("") }, { ...createInput(), now: time(60) }, { ...createInput(), intent: { ...intent(), revision: 2 } }, { ...createInput(), intent: { ...intent(), criteria: [] } } ]) assert.throws(() => createTask(input));
  const task = created();
  for (const corrupt of [ { ...task, workspaceId: ids.workspace("other") }, { ...task, state: "READY" as const }, { ...task, intent: { ...intent(), request: "Changed without revision" } }, { ...task, attempts: [] }, { ...task, attempts: [...task.attempts, { ...task.attempts[0], id: attemptId("second-active") }] } ]) {
    assert.throws(() => transitionTask(corrupt, change(task), { kind: "prepare" }));
  }
});

test("reconciliation requires the full exact action set; cancellation cannot erase unknown effects", () => {
  const actions = [{ id: "action-1", revision: 3 }, { id: "action-2", revision: 1 }];
  const unknown = step(running(), { kind: "effects-unknown", actionRefs: actions });
  assert.deepEqual(unknown.attempts[0].unresolvedActions, actions);
  for (const refs of [[], [actions[0]], [...actions, { id: "extra-action", revision: 1 }], [actions[0], actions[0]]]) {
    assert.throws(() => step(unknown, { kind: "reconcile", receipt: receipt(unknown), actionRefs: refs }));
  }
  const checked = step(unknown, { kind: "reconcile", receipt: receipt(unknown), actionRefs: [...actions].reverse() });
  assert.deepEqual(checked.attempts[0].unresolvedActions, []);
  assert.deepEqual(unknown.attempts[0].unresolvedActions, actions);
  const cancelling = step(unknown, { kind: "cancel" });
  assert.throws(() => step(cancelling, { kind: "confirm-stop", receipt: receipt(cancelling), unresolvedActions: [] }), /unresolved/);
  assert.throws(() => step(cancelling, { kind: "confirm-stop", receipt: receipt(cancelling), unresolvedActions: [actions[0]] }), /unresolved/);
  assert.throws(() => step(cancelling, { kind: "effects-unknown", actionRefs: [{ id: "action-1", revision: 4 }] }), /revision/);
  const moreUnknown = step(cancelling, { kind: "effects-unknown", actionRefs: [{ id: "action-3", revision: 1 }] });
  assert.deepEqual(moreUnknown.attempts[0].unresolvedActions, [...actions, { id: "action-3", revision: 1 }]);
  assert.throws(() => step(moreUnknown, { kind: "reconcile", receipt: receipt(moreUnknown), actionRefs: [{ id: "action-3", revision: 1 }] }));
});

test("retry rejects corrupt historical Outcome bindings, revisions, timestamps, criteria and status", () => {
  const failed = finalize(verifying(), "fail");
  const historical = failed.attempts[0].outcomes[0];
  const corruptions = [
    { ...historical, workspaceId: ids.workspace("other-workspace") },
    { ...historical, taskId: "other-task" as TaskId },
    { ...historical, attemptId: attemptId("other-attempt") },
    { ...historical, intentRevision: 999 },
    { ...historical, revision: 999 },
    { ...historical, recordedAt: time(59) },
    { ...historical, recordedAt: "2026-09-30T23:59:59.000Z" },
    { ...historical, criteriaResults: [{ ...historical.criteriaResults[0], criterionId: "other-criterion" as CriterionId }] },
    { ...historical, criteriaResults: [{ ...historical.criteriaResults[0], criterionRevision: 999 }] },
    { ...historical, status: "invented-status" },
    { ...historical, criteriaResults: [{ ...historical.criteriaResults[0], status: "invented-status" }] },
    { ...historical, criteriaResults: [] },
  ];
  for (const outcome of corruptions) {
    const corrupt = { ...failed, attempts: [{ ...failed.attempts[0], outcomes: [outcome] }] } as Task;
    assert.throws(() => retryTask(corrupt, change(failed), attemptId("attempt-2")), JSON.stringify(outcome));
  }
});

test("terminal states require internally consistent cancellation flags and Outcome history", () => {
  const failed = finalize(verifying(), "fail");
  const cancelling = step(running(), { kind: "cancel" });
  const cancelled = step(cancelling, { kind: "confirm-stop", receipt: receipt(cancelling), unresolvedActions: [] });
  for (const corrupt of [
    { ...cancelled, attempts: [{ ...cancelled.attempts[0], cancellationRequested: false }] },
    { ...cancelled, attempts: [{ ...cancelled.attempts[0], completeness: "incomplete" as const }] },
    { ...failed, state: "COMPLETED" as const, attempts: [{ ...failed.attempts[0], state: "COMPLETED" as const, outcomes: [] }] },
    { ...failed, state: "COMPLETED" as const, attempts: [{ ...failed.attempts[0], state: "COMPLETED" as const }] },
  ]) assert.throws(() => retryTask(corrupt, change(corrupt), attemptId("attempt-2")));
});

test("intent comparison is semantic across object key and criterion order", () => {
  const first = intent();
  const reorderedKeys: TaskIntent = { criteria: first.criteria, constraints: first.constraints, request: first.request, revision: first.revision };
  const task = created();
  assert.equal(step({ ...task, intent: reorderedKeys }, { kind: "prepare" }).state, "READY");
  const failed = finalize(verifying(), "fail");
  assert.throws(() => reviseTaskIntent(failed, change(failed), { ...reorderedKeys, revision: 2 }, attemptId("attempt-2")), /semantically/);
  const input = createInput();
  input.intent = { ...first, criteria: [...first.criteria, { ...first.criteria[0], id: "criterion-2" as CriterionId, description: "Second fixture" }] };
  const cancelling = step(createTask(input), { kind: "cancel" });
  const cancelled = step(cancelling, { kind: "confirm-stop", receipt: receipt(cancelling), unresolvedActions: [] });
  const criteriaReordered = { ...input.intent, revision: 2, criteria: [...input.intent.criteria].reverse() };
  assert.throws(() => reviseTaskIntent(cancelled, change(cancelled), criteriaReordered, attemptId("attempt-2")), /semantically/);
});

test("distinct attempts cannot reuse an Outcome ID within the same Task", () => {
  const failed = finalize(verifying(), "fail");
  let second = retryTask(failed, change(failed), attemptId("attempt-2")).task;
  second = step(second, { kind: "prepare" });
  second = step(second, { kind: "start", preparation: receipt(second) });
  second = verifying("complete", second);
  assert.throws(() => step(second, { kind: "finalize", outcomeId: failed.attempts[0].outcomes[0].id, outcomeRevision: 1, results: [result(second)] }));
  const completed = finalize(second);
  assert.equal(completed.state, "COMPLETED");
  assert.notEqual(completed.attempts[0].outcomes[0].id, completed.attempts[1].outcomes[0].id);
});

test("unknown effects supersede a pending pause without stranding reconciliation", () => {
  const pausedRequest = step(running(), { kind: "request-pause" });
  const actionRefs = [{ id: "synthetic-action", revision: 1 }];
  const unknown = step(pausedRequest, { kind: "effects-unknown", actionRefs });
  assert.equal(unknown.attempts[0].pauseRequested, false);
  const reconciled = step(unknown, { kind: "reconcile", receipt: receipt(unknown), actionRefs });
  assert.equal(reconciled.state, "VERIFYING");
  assert.equal(finalize(reconciled).state, "COMPLETED");
});

test("reconciliation snapshots must retain unresolved effects and incomplete execution", () => {
  const source = running();
  for (const patch of [
    { unresolvedActions: [], completeness: "incomplete" },
    { unresolvedActions: [{ id: "action", revision: 1 }], completeness: "complete" },
  ]) {
    const current = { ...source.attempts[0], state: "NEEDS_RECONCILIATION", ...patch };
    const corrupt = { ...source, state: "NEEDS_RECONCILIATION", attempts: [current] } as Task;
    assert.throws(() => transitionTask(corrupt, change(corrupt), { kind: "cancel" }), /reconciliation requires/);
  }
});
