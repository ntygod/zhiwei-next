import type { IsoTimestamp, SessionId, WorkspaceId } from "./index.ts";

/** P0-03 in-memory preparation only. These records do not prove I/O or authorization. */
export type TaskId = string & { readonly __brand: "TaskId" };
export type TaskAttemptId = string & { readonly __brand: "TaskAttemptId" };
export type CriterionId = string & { readonly __brand: "CriterionId" };
export type OutcomeId = string & { readonly __brand: "OutcomeId" };
export type TaskState = "CREATED" | "READY" | "RUNNING" | "VERIFYING"
  | "WAITING_INPUT" | "WAITING_APPROVAL" | "PAUSED" | "CANCELLING"
  | "NEEDS_RECONCILIATION" | "COMPLETED" | "PARTIAL" | "FAILED"
  | "CANCELLED" | "UNVERIFIABLE";
export type OutcomeStatus = "completed" | "partial" | "failed" | "cancelled" | "unverifiable";
export type VerificationMethod = "artifact" | "deterministic-test" | "tool-receipt"
  | "user-confirmation" | "model-assisted";
export interface AcceptanceCriterion {
  readonly id: CriterionId;
  readonly revision: number;
  readonly description: string;
  readonly required: boolean;
  readonly method: VerificationMethod;
}
export interface TaskIntent {
  readonly revision: number;
  readonly request: string;
  readonly constraints: readonly string[];
  readonly criteria: readonly AcceptanceCriterion[];
}
export interface TaskAttempt {
  readonly id: TaskAttemptId;
  readonly taskId: TaskId;
  readonly workspaceId: WorkspaceId;
  readonly intent: TaskIntent;
  readonly state: TaskState;
  readonly createdAt: IsoTimestamp;
  readonly updatedAt: IsoTimestamp;
  readonly pauseRequested: boolean;
  readonly cancellationRequested: boolean;
  readonly completeness: "not-settled" | "complete" | "incomplete";
  readonly outcomes: readonly Outcome[];
  readonly unresolvedActions: readonly TaskEvidenceRef[];
}
export interface Task {
  readonly id: TaskId;
  readonly workspaceId: WorkspaceId;
  readonly sessionId: SessionId;
  readonly revision: number;
  readonly intent: TaskIntent;
  readonly state: TaskState;
  readonly attempts: readonly TaskAttempt[];
  readonly createdAt: IsoTimestamp;
  readonly updatedAt: IsoTimestamp;
}
/** A caller-supplied exact-version reference, never an authorization token. */
export interface TaskEvidenceRef {
  readonly id: string;
  readonly revision: number;
}
export interface CriterionBinding {
  readonly taskId: TaskId;
  readonly attemptId: TaskAttemptId;
  readonly workspaceId: WorkspaceId;
  readonly intentRevision: number;
  readonly criterionId: CriterionId;
  readonly criterionRevision: number;
}
export type CriterionResult = CriterionBinding & Readonly<{
  method: VerificationMethod;
  checkedAt: IsoTimestamp;
  explanation: string;
}> & (
  | Readonly<{ status: "pass" | "fail"; evidence: readonly TaskEvidenceRef[]; validUntil: IsoTimestamp }>
  | Readonly<{ status: "unknown"; reason: "missing-evidence" | "validator-unavailable" | "validator-error" | "incomplete" | "model-only"; evidence: readonly TaskEvidenceRef[] }>
  | Readonly<{ status: "not-applicable"; evidence: readonly TaskEvidenceRef[] }>
);
export interface Outcome {
  readonly id: OutcomeId;
  readonly revision: number;
  readonly taskId: TaskId;
  readonly attemptId: TaskAttemptId;
  readonly workspaceId: WorkspaceId;
  readonly intentRevision: number;
  readonly status: OutcomeStatus;
  readonly criteriaResults: readonly CriterionResult[];
  readonly recordedAt: IsoTimestamp;
}

export function assertTaskText(value: string, label: string): void {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${label} must not be empty`);
}
export function assertTaskRevision(value: number): void {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error("revision must be a positive safe integer");
}
export function assertTaskTime(value: string): void {
  // Date parsing is deterministic; no wall-clock access. Require canonical UTC milliseconds.
  if (typeof value !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)
    || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) {
    throw new Error("time must be a canonical UTC timestamp");
  }
}
export function assertTaskEvidence(refs: readonly TaskEvidenceRef[], required = true): void {
  if (!Array.isArray(refs) || (required && refs.length === 0)) throw new Error("evidence is required");
  const seen = new Set<string>();
  for (const ref of refs) {
    assertTaskText(ref.id, "evidence id"); assertTaskRevision(ref.revision);
    if (seen.has(ref.id)) throw new Error("duplicate evidence id");
    seen.add(ref.id);
  }
}
export function assertTaskIntent(intent: TaskIntent): void {
  assertTaskRevision(intent.revision); assertTaskText(intent.request, "request");
  if (!Array.isArray(intent.constraints)) throw new Error("constraints must be an array");
  for (const constraint of intent.constraints) assertTaskText(constraint, "constraint");
  if (!Array.isArray(intent.criteria) || intent.criteria.length === 0) throw new Error("criteria are required");
  const seen = new Set<string>();
  for (const criterion of intent.criteria) {
    assertTaskText(criterion.id, "criterion id"); assertTaskRevision(criterion.revision);
    assertTaskText(criterion.description, "criterion description");
    if (typeof criterion.required !== "boolean") throw new Error("criterion required must be boolean");
    if (!["artifact", "deterministic-test", "tool-receipt", "user-confirmation", "model-assisted"].includes(criterion.method)) throw new Error("unknown verification method");
    if (seen.has(criterion.id)) throw new Error("duplicate criterion id");
    seen.add(criterion.id);
  }
  if (!intent.criteria.some(criterion => criterion.required)) throw new Error("at least one required criterion is needed");
}
export function isTerminalTaskState(state: TaskState): boolean {
  return ["COMPLETED", "PARTIAL", "FAILED", "CANCELLED", "UNVERIFIABLE"].includes(state);
}

export function assertTaskOutcomeHistory(attempt: TaskAttempt): void {
  let recordedAt = attempt.createdAt;
  let outcomeId: string | undefined;
  for (const [index, outcome] of attempt.outcomes.entries()) {
    assertTaskText(outcome.id, "outcome id"); assertTaskTime(outcome.recordedAt);
    if (outcome.taskId !== attempt.taskId || outcome.attemptId !== attempt.id || outcome.workspaceId !== attempt.workspaceId
      || outcome.intentRevision !== attempt.intent.revision) throw new Error("historical outcome binding conflict");
    if (outcome.revision !== index + 1 || (outcomeId !== undefined && outcome.id !== outcomeId)) throw new Error("historical outcome revision conflict");
    if (outcome.recordedAt < recordedAt || outcome.recordedAt > attempt.updatedAt) throw new Error("historical outcome time conflict");
    if (!["completed", "partial", "failed", "cancelled", "unverifiable"].includes(outcome.status)) throw new Error("unknown historical outcome status");
    if (!Array.isArray(outcome.criteriaResults) || outcome.criteriaResults.length !== attempt.intent.criteria.length) throw new Error("historical criteria incomplete");
    const ids = new Set<string>();
    for (const result of outcome.criteriaResults) {
      const criterion = attempt.intent.criteria.find(item => item.id === result.criterionId);
      if (!criterion || ids.has(result.criterionId) || result.criterionRevision !== criterion.revision || result.method !== criterion.method
        || result.taskId !== attempt.taskId || result.attemptId !== attempt.id || result.workspaceId !== attempt.workspaceId
        || result.intentRevision !== attempt.intent.revision) throw new Error("historical criterion binding conflict");
      ids.add(result.criterionId); assertTaskTime(result.checkedAt); assertTaskText(result.explanation, "historical explanation");
      if (result.checkedAt < attempt.createdAt || result.checkedAt > outcome.recordedAt) throw new Error("historical criterion time conflict");
      assertTaskEvidence(result.evidence, result.status === "pass" || result.status === "fail");
      if (result.status === "pass" || result.status === "fail") {
        assertTaskTime(result.validUntil);
        if (result.validUntil <= outcome.recordedAt || result.method === "model-assisted") throw new Error("invalid historical verification");
      } else if (result.status === "unknown") {
        if (!["missing-evidence", "validator-unavailable", "validator-error", "incomplete", "model-only"].includes(result.reason)) throw new Error("unknown historical verification reason");
      } else if (result.status !== "not-applicable") throw new Error("unknown historical criterion status");
    }
    outcomeId = outcome.id; recordedAt = outcome.recordedAt;
  }
}

/** Compare contract fields, independent of JavaScript object key insertion order. */
export function sameTaskIntent(left: TaskIntent, right: TaskIntent, includeRevision = true): boolean {
  return (!includeRevision || left.revision === right.revision) && left.request === right.request
    && left.constraints.length === right.constraints.length && left.constraints.every((value, index) => value === right.constraints[index])
    && left.criteria.length === right.criteria.length && left.criteria.every(criterion => {
      const other = right.criteria.find(value => value.id === criterion.id);
      return other !== undefined && criterion.revision === other.revision && criterion.description === other.description
        && criterion.required === other.required && criterion.method === other.method;
    });
}
