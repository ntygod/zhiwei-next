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
