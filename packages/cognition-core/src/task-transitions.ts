import {
  assertTaskText, assertTaskRevision, assertTaskTime, assertTaskEvidence, assertTaskIntent,
  isTerminalTaskState, sameTaskIntent,
  type Task, type TaskAttempt, type TaskIntent, type TaskId, type TaskAttemptId,
  type TaskState, type WorkspaceId, type SessionId, type IsoTimestamp,
  type TaskEvidenceRef, type CriterionResult, type OutcomeId,
} from "../../domain/src/index.ts";
import { deriveOutcome, assertOutcomeHistoryStatus } from "./outcome-rules.ts";

/** Structural in-memory guards only. No receipt here authenticates a producer or grants permission. */
export interface AttemptReceipt {
  readonly taskId: TaskId;
  readonly attemptId: TaskAttemptId;
  readonly workspaceId: WorkspaceId;
  readonly intentRevision: number;
  readonly at: IsoTimestamp;
  readonly evidence: readonly TaskEvidenceRef[];
}
export type TaskAction =
  | Readonly<{ kind: "prepare" }>
  | Readonly<{ kind: "wait-input"; question: string }>
  | Readonly<{ kind: "wait-approval"; proposal: TaskEvidenceRef }>
  | Readonly<{ kind: "continue" }>
  | Readonly<{ kind: "start"; preparation: AttemptReceipt }>
  | Readonly<{ kind: "settled"; receipt: AttemptReceipt; completeness: "complete" | "incomplete" }>
  | Readonly<{ kind: "request-pause" }>
  | Readonly<{ kind: "confirm-pause"; receipt: AttemptReceipt; unresolvedActions: readonly TaskEvidenceRef[] }>
  | Readonly<{ kind: "cancel" }>
  | Readonly<{ kind: "confirm-stop"; receipt: AttemptReceipt; unresolvedActions: readonly TaskEvidenceRef[] }>
  | Readonly<{ kind: "effects-unknown"; actionRefs: readonly TaskEvidenceRef[] }>
  | Readonly<{ kind: "reconcile"; receipt: AttemptReceipt; actionRefs: readonly TaskEvidenceRef[] }>
  | Readonly<{ kind: "finalize"; outcomeId: OutcomeId; outcomeRevision: number; results: readonly CriterionResult[] }>;
export interface TaskChange {
  readonly expectedRevision: number;
  readonly nextRevision: number;
  readonly expectedIntentRevision: number;
  readonly attemptId: TaskAttemptId;
  readonly now: IsoTimestamp;
  readonly trigger: TaskEvidenceRef;
}
export interface TaskTransitionRecord {
  readonly taskId: TaskId;
  readonly attemptId: TaskAttemptId;
  readonly from: TaskState;
  readonly to: TaskState;
  readonly reason: TaskAction["kind"] | "retry" | "revise-intent";
  readonly previousRevision: number;
  readonly revision: number;
  readonly intentRevision: number;
  readonly occurredAt: IsoTimestamp;
  readonly trigger: TaskEvidenceRef;
}
export interface TaskTransition {
  readonly task: Task;
  readonly record: TaskTransitionRecord;
}

// Copy recursively before freezing, so neither caller inputs nor prior history are frozen or mutated.
function snapshot<T>(value: T): T {
  if (Array.isArray(value)) return Object.freeze(value.map(item => snapshot(item))) as T;
  if (value !== null && typeof value === "object") {
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, snapshot(item)]))) as T;
  }
  return value;
}
function latest(task: Task): TaskAttempt {
  const attempt = task.attempts.at(-1);
  if (!attempt) throw new Error("task must have an attempt");
  return attempt;
}
function assertTask(task: Task): void {
  assertTaskText(task.id, "task id"); assertTaskText(task.workspaceId, "workspace id");
  assertTaskText(task.sessionId, "session id"); assertTaskRevision(task.revision);
  assertTaskIntent(task.intent); assertTaskTime(task.createdAt); assertTaskTime(task.updatedAt);
  if (task.updatedAt < task.createdAt) throw new Error("task time is reversed");
  const seen = new Set<string>();
  let previousAttempt: TaskAttempt | undefined;
  const outcomeOwners = new Map<string, TaskAttemptId>();
  for (const attempt of task.attempts) {
    assertTaskText(attempt.id, "attempt id"); assertTaskIntent(attempt.intent);
    assertTaskTime(attempt.createdAt); assertTaskTime(attempt.updatedAt);
    if (seen.has(attempt.id) || attempt.taskId !== task.id || attempt.workspaceId !== task.workspaceId) throw new Error("invalid attempt identity");
    if (attempt.createdAt < task.createdAt || attempt.updatedAt < attempt.createdAt || attempt.updatedAt > task.updatedAt) throw new Error("invalid attempt time");
    if (!["CREATED", "READY", "RUNNING", "VERIFYING", "WAITING_INPUT", "WAITING_APPROVAL", "PAUSED", "CANCELLING", "NEEDS_RECONCILIATION", "COMPLETED", "PARTIAL", "FAILED", "CANCELLED", "UNVERIFIABLE"].includes(attempt.state)) throw new Error("unknown task state");
    if (typeof attempt.pauseRequested !== "boolean" || typeof attempt.cancellationRequested !== "boolean"
      || !["not-settled", "complete", "incomplete"].includes(attempt.completeness) || !Array.isArray(attempt.outcomes)) throw new Error("invalid attempt state");
    assertOutcomeHistoryStatus(attempt);
    for (const outcome of attempt.outcomes) {
      const owner = outcomeOwners.get(outcome.id);
      if (owner !== undefined && owner !== attempt.id) throw new Error("outcome id belongs to another attempt");
      outcomeOwners.set(outcome.id, attempt.id);
    }
    if (previousAttempt && (attempt.createdAt < previousAttempt.updatedAt
      || attempt.intent.revision < previousAttempt.intent.revision || attempt.intent.revision > previousAttempt.intent.revision + 1)) throw new Error("attempt history must be monotonic");
    if (previousAttempt && attempt.intent.revision === previousAttempt.intent.revision
      && !sameTaskIntent(attempt.intent, previousAttempt.intent)) throw new Error("same intent revision must retain the same contract");
    previousAttempt = attempt;
    if (attempt.pauseRequested && attempt.state !== "RUNNING") throw new Error("invalid pause state");
    if (attempt.cancellationRequested && !["CANCELLING", "NEEDS_RECONCILIATION", "VERIFYING", "CANCELLED"].includes(attempt.state)) throw new Error("invalid cancellation state");
    if (attempt.state === "CANCELLING" && !attempt.cancellationRequested) throw new Error("cancelling requires a request");
    if (attempt.state === "CANCELLED" && (!attempt.cancellationRequested || attempt.completeness !== "complete")) throw new Error("cancelled requires a confirmed complete stop");
    if (["VERIFYING", "COMPLETED", "PARTIAL", "FAILED", "UNVERIFIABLE"].includes(attempt.state) && attempt.completeness === "not-settled") throw new Error("verification requires a settled attempt");
    if (["CREATED", "READY", "RUNNING", "WAITING_INPUT", "WAITING_APPROVAL", "PAUSED"].includes(attempt.state)
      && (attempt.completeness !== "not-settled" || attempt.outcomes.length)) throw new Error("unsettled state cannot have verification history");
    if (isTerminalTaskState(attempt.state) && attempt.state !== "CANCELLED"
      && (attempt.outcomes.length === 0 || attempt.outcomes[0].status.toUpperCase() !== attempt.state)) throw new Error("terminal state must retain its original outcome");
    assertTaskEvidence(attempt.unresolvedActions, false);
    if (attempt.unresolvedActions.length && !["CANCELLING", "NEEDS_RECONCILIATION"].includes(attempt.state)) throw new Error("unresolved actions require reconciliation");
    if (attempt.state === "NEEDS_RECONCILIATION" && (attempt.unresolvedActions.length === 0 || attempt.completeness !== "incomplete")) throw new Error("reconciliation requires recorded unresolved effects");
    seen.add(attempt.id);
  }
  const current = latest(task);
  if (task.state !== current.state || !sameTaskIntent(task.intent, current.intent)) throw new Error("current attempt differs from task");
  if (task.attempts.slice(0, -1).some(attempt => !isTerminalTaskState(attempt.state))) throw new Error("multiple active attempts");
}
function checkChange(task: Task, change: TaskChange): TaskAttempt {
  assertTask(task); assertTaskRevision(change.expectedRevision); assertTaskRevision(change.nextRevision);
  assertTaskRevision(change.expectedIntentRevision); assertTaskTime(change.now); assertTaskEvidence([change.trigger]);
  if (change.expectedRevision !== task.revision || change.nextRevision !== task.revision + 1) throw new Error("task revision conflict");
  if (change.expectedIntentRevision !== task.intent.revision) throw new Error("intent revision conflict");
  const current = latest(task);
  if (change.attemptId !== current.id) throw new Error("attempt conflict");
  if (change.now < task.updatedAt) throw new Error("time must not move backwards");
  return current;
}
function checkReceipt(attempt: TaskAttempt, receipt: AttemptReceipt, now: string): void {
  assertTaskTime(receipt.at); assertTaskEvidence(receipt.evidence);
  if (receipt.taskId !== attempt.taskId || receipt.attemptId !== attempt.id || receipt.workspaceId !== attempt.workspaceId
    || receipt.intentRevision !== attempt.intent.revision) throw new Error("receipt binding conflict");
  if (receipt.at < attempt.updatedAt || receipt.at > now) throw new Error("receipt time is stale or future");
}
function requireState(attempt: TaskAttempt, ...states: TaskState[]): void {
  if (!states.includes(attempt.state)) throw new Error("illegal task transition");
}
function commit(task: Task, next: TaskAttempt, change: TaskChange, reason: TaskTransitionRecord["reason"], append = false): TaskTransition {
  const attempts = append ? [...task.attempts, next] : [...task.attempts.slice(0, -1), next];
  return snapshot({
    task: { ...task, revision: change.nextRevision, intent: next.intent, state: next.state, attempts, updatedAt: change.now },
    record: { taskId: task.id, attemptId: next.id, from: task.state, to: next.state, reason,
      previousRevision: task.revision, revision: change.nextRevision, intentRevision: next.intent.revision,
      occurredAt: change.now, trigger: change.trigger },
  });
}
function initialAttempt(id: TaskAttemptId, taskId: TaskId, workspaceId: WorkspaceId, intent: TaskIntent, now: string): TaskAttempt {
  assertTaskText(id, "attempt id");
  return { id, taskId, workspaceId, intent, state: "CREATED", createdAt: now, updatedAt: now,
    pauseRequested: false, cancellationRequested: false, completeness: "not-settled", outcomes: [], unresolvedActions: [] };
}
export function createTask(input: Readonly<{
  id: TaskId; attemptId: TaskAttemptId; workspaceId: WorkspaceId; sessionId: SessionId;
  revision: number; intent: TaskIntent; now: IsoTimestamp;
}>): Task {
  assertTaskText(input.id, "task id"); assertTaskText(input.workspaceId, "workspace id"); assertTaskText(input.sessionId, "session id");
  assertTaskTime(input.now); assertTaskIntent(input.intent);
  if (input.revision !== 1 || input.intent.revision !== 1) throw new Error("new task revisions must be one");
  return snapshot({ id: input.id, workspaceId: input.workspaceId, sessionId: input.sessionId, revision: input.revision,
    intent: input.intent, state: "CREATED", attempts: [initialAttempt(input.attemptId, input.id, input.workspaceId, input.intent, input.now)],
    createdAt: input.now, updatedAt: input.now });
}
export function transitionTask(task: Task, change: TaskChange, action: TaskAction): TaskTransition {
  const current = checkChange(task, change);
  if (isTerminalTaskState(current.state)) throw new Error("terminal attempt cannot transition; create a new attempt");
  let next = { ...current, updatedAt: change.now };
  switch (action.kind) {
    case "prepare": requireState(current, "CREATED"); next.state = "READY"; break;
    case "wait-input":
      requireState(current, "CREATED", "READY"); assertTaskText(action.question, "question"); next.state = "WAITING_INPUT"; break;
    case "wait-approval":
      requireState(current, "READY"); assertTaskEvidence([action.proposal]); next.state = "WAITING_APPROVAL"; break;
    case "continue":
      // A paused running attempt cannot resume without a proven checkpoint contract (outside P0-03).
      requireState(current, "WAITING_INPUT", "WAITING_APPROVAL"); next.state = "READY"; break;
    case "start":
      requireState(current, "READY"); checkReceipt(current, action.preparation, change.now); next.state = "RUNNING"; break;
    case "settled":
      requireState(current, "RUNNING"); checkReceipt(current, action.receipt, change.now);
      if (!["complete", "incomplete"].includes(action.completeness)) throw new Error("unknown completeness");
      next.state = "VERIFYING"; next.completeness = action.completeness; next.pauseRequested = false; break;
    case "request-pause":
      requireState(current, "RUNNING"); if (current.pauseRequested) throw new Error("pause already requested"); next.pauseRequested = true; break;
    case "confirm-pause":
      requireState(current, "RUNNING"); if (!current.pauseRequested) throw new Error("pause not requested");
      checkReceipt(current, action.receipt, change.now); assertTaskEvidence(action.unresolvedActions, false);
      if (action.unresolvedActions.length) throw new Error("unresolved effects prevent pause");
      next.state = "PAUSED"; next.pauseRequested = false; break;
    case "cancel":
      if (current.cancellationRequested) throw new Error("cancellation already requested");
      next.state = "CANCELLING"; next.cancellationRequested = true; next.pauseRequested = false; break;
    case "confirm-stop":
      requireState(current, "CANCELLING"); checkReceipt(current, action.receipt, change.now); assertTaskEvidence(action.unresolvedActions, false);
      if (current.unresolvedActions.some(ref => !action.unresolvedActions.some(pending => pending.id === ref.id && pending.revision === ref.revision))) throw new Error("stop cannot erase unresolved actions; reconcile first");
      next.state = action.unresolvedActions.length ? "NEEDS_RECONCILIATION" : "CANCELLED";
      next.completeness = action.unresolvedActions.length ? "incomplete" : "complete";
      next.unresolvedActions = action.unresolvedActions; break;
    case "effects-unknown":
      requireState(current, "RUNNING", "CANCELLING"); assertTaskEvidence(action.actionRefs);
      if (action.actionRefs.some(ref => current.unresolvedActions.some(pending => pending.id === ref.id && pending.revision !== ref.revision))) throw new Error("original action revision cannot change");
      next.state = "NEEDS_RECONCILIATION"; next.completeness = "incomplete"; next.pauseRequested = false;
      next.unresolvedActions = [...current.unresolvedActions, ...action.actionRefs.filter(ref => !current.unresolvedActions.some(pending => pending.id === ref.id))]; break;
    case "reconcile":
      requireState(current, "NEEDS_RECONCILIATION"); checkReceipt(current, action.receipt, change.now); assertTaskEvidence(action.actionRefs);
      if (action.actionRefs.length !== current.unresolvedActions.length || current.unresolvedActions.some(ref => !action.actionRefs.some(checked => checked.id === ref.id && checked.revision === ref.revision))) throw new Error("reconciliation must cover exact original actions");
      next.unresolvedActions = [];
      next.state = "VERIFYING"; next.completeness = "complete"; next.pauseRequested = false; break;
    case "finalize": {
      requireState(current, "VERIFYING");
      if (task.attempts.some(attempt => attempt.id !== current.id && attempt.outcomes.some(outcome => outcome.id === action.outcomeId))) throw new Error("outcome id must not be reused across attempts");
      const outcome = deriveOutcome(current, { id: action.outcomeId, revision: action.outcomeRevision, now: change.now, results: action.results });
      const states = { completed: "COMPLETED", partial: "PARTIAL", failed: "FAILED", cancelled: "CANCELLED", unverifiable: "UNVERIFIABLE" } as const;
      next.state = states[outcome.status]; next.outcomes = [...current.outcomes, outcome]; break;
    }
    default: {
      const unsupported: never = action;
      throw new Error(`unsupported task action: ${String(unsupported)}`);
    }
  }
  return commit(task, next, change, action.kind);
}
/** Retrying never rewinds the old attempt or reuses its ID. No automatic retry is implied. */
export function retryTask(task: Task, change: TaskChange, attemptId: TaskAttemptId): TaskTransition {
  const current = checkChange(task, change);
  if (!isTerminalTaskState(current.state)) throw new Error("retry requires a terminal attempt");
  if (task.attempts.some(attempt => attempt.id === attemptId)) throw new Error("attempt id must not be reused");
  return commit(task, initialAttempt(attemptId, task.id, task.workspaceId, task.intent, change.now), change, "retry", true);
}
/** Running work must be stopped/reconciled first; this pure helper does not invalidate real workers. */
export function reviseTaskIntent(task: Task, change: TaskChange, intent: TaskIntent, attemptId: TaskAttemptId): TaskTransition {
  const current = checkChange(task, change); assertTaskIntent(intent);
  if (!isTerminalTaskState(current.state)) throw new Error("intent revision requires a terminal prior attempt");
  if (intent.revision !== task.intent.revision + 1) throw new Error("intent revision must advance by one");
  if (sameTaskIntent(intent, task.intent, false)) throw new Error("intent must change semantically");
  if (task.attempts.some(attempt => attempt.id === attemptId)) throw new Error("attempt id must not be reused");
  return commit(task, initialAttempt(attemptId, task.id, task.workspaceId, intent, change.now), change, "revise-intent", true);
}
