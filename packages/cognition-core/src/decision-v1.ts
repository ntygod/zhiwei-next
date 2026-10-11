import { assertWorkingStateV2, type CognitiveDecisionInputV1, type CognitiveDecisionV1, type Task, type TaskAttemptId, type WorkingStateV2, type EvidenceRefV2 } from "../../domain/src/index.ts";
import { transitionTask, retryTask, type TaskChange, type AttemptReceipt } from "./task-transitions.ts";
/** Pure acceptance of a proposal; sending, calls, persistence and effects remain at their boundaries. */
export function validateCognitiveDecisionV1(decision: CognitiveDecisionV1, input: CognitiveDecisionInputV1):
  Readonly<{ ok: true }> | Readonly<{ ok: false; reason: "invalid-decision" | "call-limit" }> {
  if (!input.capabilities.includes(decision.action) || decision.claimRefs.some(ref => !input.claimRefs.some(source =>
    source.id === ref.id && source.revision === ref.revision && source.version === ref.version))) return { ok: false, reason: "invalid-decision" };
  if (input.ordinal === 2 && decision.action === "retrieve") return { ok: false, reason: "call-limit" };
  return { ok: true };
}

export function cognitivePendingInputV1(decision: CognitiveDecisionV1): Readonly<{ id: string; prompt: string }> {
  if (decision.action === "clarify") return decision.question;
  if (decision.action === "wait") return { id: decision.condition.id, prompt: decision.condition.description };
  throw new Error("Decision has no pending user input.");
}
function workingVersion(task: Task, prior: WorkingStateV2, changes: Partial<WorkingStateV2>): WorkingStateV2 {
  assertWorkingStateV2(prior);
  if (prior.task.id !== task.id || prior.taskAttempt.taskId !== task.id || prior.taskAttempt.attemptId !== task.attempts.at(-1)!.id || prior.intentRevision !== task.intent.revision
    || prior.scope.kind !== "task" || prior.scope.workspaceId !== task.workspaceId || prior.scope.taskId !== task.id || prior.revision + 1 !== task.revision) throw new Error("Working state binding conflict.");
  const value = structuredClone({ ...prior, ...changes, revision: task.revision, updatedAt: task.updatedAt,
    task: { kind: "task" as const, id: task.id, revision: task.revision }, currentStep: task.state });
  assertWorkingStateV2(value); return value;
}
/** A question is unresolved state, never a user observation or a successful Outcome. */
export function waitForCognitiveInputV1(task: Task, working: WorkingStateV2, decision: CognitiveDecisionV1, change: TaskChange): Readonly<{ task: Task; workingState: WorkingStateV2 }> {
  const pending = cognitivePendingInputV1(decision);
  if (working.revision !== task.revision || working.pendingInput.length) throw new Error("Pending input conflict.");
  const next = transitionTask(task, change, { kind: "wait-input", question: pending.prompt }).task;
  return { task: next, workingState: workingVersion(next, working, { unknown: [...new Set([...working.unknown, pending.prompt])], pendingInput: [pending.id], nextSteps: [pending.prompt] }) };
}
/** Only a real, exact user response can clear this pending input. */
function cognitiveResponseFacts(task: Task, working: WorkingStateV2, decision: CognitiveDecisionV1, questionId: string, response: string, evidence: readonly EvidenceRefV2[]): Partial<WorkingStateV2> {
  assertWorkingStateV2(working);
  const pending = cognitivePendingInputV1(decision);
  if (task.state !== "WAITING_INPUT" || working.revision !== task.revision || pending.id !== questionId
    || working.task.id !== task.id || working.task.revision !== task.revision || working.taskAttempt.taskId !== task.id
    || working.taskAttempt.attemptId !== task.attempts.at(-1)!.id || working.intentRevision !== task.intent.revision || working.taskAttempt.intentRevision !== task.intent.revision
    || working.pendingInput.length !== 1 || working.pendingInput[0] !== questionId || !response.trim()
    || working.scope.kind !== "task" || working.scope.workspaceId !== task.workspaceId || working.scope.taskId !== task.id
    || !evidence.length || evidence.some(item => item.sourceTrust !== "user-direct")) throw new Error("Exact user input required.");
  return { known: [...working.known, response], pendingInput: [], unknown: working.unknown.filter(item => item !== pending.prompt), nextSteps: [], evidence: [...working.evidence, ...evidence] };
}
export function respondToCognitiveInputV1(task: Task, working: WorkingStateV2, decision: CognitiveDecisionV1, questionId: string, response: string, evidence: readonly EvidenceRefV2[], change: TaskChange): Readonly<{ task: Task; workingState: WorkingStateV2 }> {
  const facts = cognitiveResponseFacts(task, working, decision, questionId, response, evidence);
  const next = transitionTask(task, change, { kind: "continue" }).task;
  return { task: next, workingState: workingVersion(next, working, facts) };
}
/** Fenced ownership follows the existing confirmed-stop/new-attempt rule, never native resume. */
export function restartTaskWithCognitiveInputV1(original: Task, working: WorkingStateV2, decision: CognitiveDecisionV1, questionId: string, response: string, evidence: readonly EvidenceRefV2[], change: TaskChange, attemptId: TaskAttemptId, stopReceipt: AttemptReceipt): Readonly<{ versions: readonly Task[]; workingStates: readonly WorkingStateV2[] }> {
  const facts = cognitiveResponseFacts(original, working, decision, questionId, response, evidence), versions: Task[] = [];
  let task = original;
  const nextChange = (): TaskChange => ({ ...change, expectedRevision: task.revision, nextRevision: task.revision + 1, attemptId: task.attempts.at(-1)!.id });
  if (change.expectedRevision !== original.revision || change.nextRevision !== original.revision + 1 || change.attemptId !== original.attempts.at(-1)!.id) throw new Error("Restart binding conflict.");
  task = transitionTask(task, change, { kind: "cancel" }).task; versions.push(task);
  task = transitionTask(task, nextChange(), { kind: "confirm-stop", receipt: stopReceipt, unresolvedActions: [] }).task; versions.push(task);
  task = retryTask(task, nextChange(), attemptId).task; versions.push(task);
  task = transitionTask(task, nextChange(), { kind: "prepare" }).task; versions.push(task);
  const workingStates = versions.map(version => {
    const value: WorkingStateV2 = structuredClone({ ...working, ...facts, revision: version.revision, updatedAt: version.updatedAt, currentStep: version.state,
      task: { kind: "task", id: version.id, revision: version.revision }, taskAttempt: { taskId: version.id, attemptId: version.attempts.at(-1)!.id, intentRevision: version.intent.revision } });
    assertWorkingStateV2(value); return value;
  });
  return { versions, workingStates };
}
