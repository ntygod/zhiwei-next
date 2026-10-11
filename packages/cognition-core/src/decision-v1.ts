import { assertWorkingStateV2, type CognitiveDecisionInputV1, type CognitiveDecisionV1, type Task, type WorkingStateV2, type EvidenceRefV2 } from "../../domain/src/index.ts";
import { transitionTask, type TaskChange } from "./task-transitions.ts";
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
export function respondToCognitiveInputV1(task: Task, working: WorkingStateV2, decision: CognitiveDecisionV1, questionId: string, response: string, evidence: readonly EvidenceRefV2[], change: TaskChange): Readonly<{ task: Task; workingState: WorkingStateV2 }> {
  const pending = cognitivePendingInputV1(decision);
  if (task.state !== "WAITING_INPUT" || working.revision !== task.revision || pending.id !== questionId
    || working.pendingInput.length !== 1 || working.pendingInput[0] !== questionId || !response.trim()
    || !evidence.length || evidence.some(item => item.sourceTrust !== "user-direct")) throw new Error("Exact user input required.");
  const next = transitionTask(task, change, { kind: "continue" }).task;
  return { task: next, workingState: workingVersion(next, working, { known: [...working.known, response], pendingInput: [],
    unknown: working.unknown.filter(item => item !== pending.prompt), nextSteps: [], evidence: [...working.evidence, ...evidence] }) };
}
