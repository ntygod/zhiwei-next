import {
  assertTaskEvidence, assertTaskIntent, assertTaskOutcomeHistory, assertTaskRevision, assertTaskText, assertTaskTime,
  type AcceptanceCriterion, type CriterionResult, type IsoTimestamp, type Outcome,
  type OutcomeId, type OutcomeStatus, type TaskAttempt,
} from "../../domain/src/index.ts";

function checkBinding(attempt: TaskAttempt, record: {
  readonly taskId: string; readonly attemptId: string; readonly workspaceId: string;
  readonly intentRevision: number;
}): void {
  if (record.taskId !== attempt.taskId || record.attemptId !== attempt.id
    || record.workspaceId !== attempt.workspaceId || record.intentRevision !== attempt.intent.revision) {
    throw new Error("Outcome evidence must match the exact task, attempt, workspace and intent revision");
  }
}

function checkedResult(attempt: TaskAttempt, criterion: AcceptanceCriterion,
  result: CriterionResult, now: IsoTimestamp): CriterionResult {
  checkBinding(attempt, result);
  if (result.criterionId !== criterion.id || result.criterionRevision !== criterion.revision) {
    throw new Error("Criterion evidence must match the exact criterion revision");
  }
  if (result.method !== criterion.method) throw new Error("Verification method does not match criterion");
  assertTaskText(result.explanation, "verification explanation");
  assertTaskTime(result.checkedAt);
  if (result.checkedAt < attempt.createdAt || result.checkedAt > now) {
    throw new Error("Verification time must lie within the attempt and recording time");
  }
  assertTaskEvidence(result.evidence, result.status === "pass" || result.status === "fail");
  const evidence = Object.freeze(result.evidence.map(ref => Object.freeze({ id: ref.id, revision: ref.revision })));
  const base = {
    taskId: result.taskId, attemptId: result.attemptId, workspaceId: result.workspaceId,
    intentRevision: result.intentRevision, criterionId: result.criterionId,
    criterionRevision: result.criterionRevision, method: result.method,
    checkedAt: result.checkedAt, explanation: result.explanation, evidence,
  };
  switch (result.status) {
    case "pass":
    case "fail":
      assertTaskTime(result.validUntil);
      // The freshness deadline is exclusive, including at the exact expiry instant.
      if (result.validUntil <= now || result.validUntil <= result.checkedAt) {
        throw new Error("Verification evidence is expired");
      }
      if (result.method === "model-assisted") {
        return Object.freeze({ ...base, status: "unknown", reason: "model-only" });
      }
      return Object.freeze({ ...base, status: result.status, validUntil: result.validUntil });
    case "unknown":
      if (!["missing-evidence", "validator-unavailable", "validator-error", "incomplete", "model-only"].includes(result.reason)) {
        throw new Error("Unknown verification failure reason");
      }
      return Object.freeze({ ...base, status: "unknown", reason: result.reason });
    case "not-applicable":
      return Object.freeze({ ...base, status: "not-applicable" });
    default:
      throw new Error("Unknown criterion result status");
  }
}

function classifyResults(attempt: TaskAttempt, results: readonly CriterionResult[]): OutcomeStatus {
  const byId = new Map(results.map(result => [result.criterionId, result]));
  if (attempt.completeness === "complete"
    && attempt.intent.criteria.every(criterion => !criterion.required || byId.get(criterion.id)?.status === "pass")) {
    return "completed";
  }
  if (results.some(result => result.status === "pass")) return "partial";
  if (results.some(result => result.status === "fail")) return "failed";
  return "unverifiable";
}

/** Package-internal policy shared by task transitions, not part of the public barrel. */
export function assertOutcomeHistoryStatus(attempt: TaskAttempt): void {
  assertTaskOutcomeHistory(attempt);
  if (attempt.outcomes.length === 0) return;
  if (attempt.completeness !== "complete" && attempt.completeness !== "incomplete") {
    throw new Error("Historical Outcomes require settled execution");
  }
  if (["COMPLETED", "PARTIAL", "FAILED", "UNVERIFIABLE", "CANCELLED"].includes(attempt.state)
    && attempt.outcomes[0].status.toUpperCase() !== attempt.state) {
    throw new Error("The initial Outcome must match the original terminal attempt state");
  }
  for (const outcome of attempt.outcomes) {
    if (attempt.cancellationRequested && outcome.status !== "cancelled") throw new Error("Cancellation must remain cancelled in Outcome history");
    if (outcome.status === "cancelled") {
      if (!attempt.cancellationRequested || attempt.completeness !== "complete") {
        throw new Error("Historical cancelled Outcome requires a reconciled cancellation");
      }
    } else if (outcome.status !== classifyResults(attempt, outcome.criteriaResults)) {
      throw new Error("Historical Outcome status does not match its criterion results and completeness");
    }
  }
}

/** Pure P0-03 reduction of caller-supplied evidence; it performs no verification I/O. */
export function deriveOutcome(attempt: TaskAttempt, input: {
  readonly id: OutcomeId;
  readonly revision: number;
  readonly now: IsoTimestamp;
  readonly results: readonly CriterionResult[];
}): Outcome {
  assertTaskText(attempt.id, "attempt id");
  assertTaskText(attempt.taskId, "task id");
  assertTaskText(attempt.workspaceId, "workspace id");
  assertTaskIntent(attempt.intent);
  assertTaskText(input.id, "outcome id");
  assertTaskRevision(input.revision);
  assertTaskTime(input.now);
  assertTaskTime(attempt.createdAt);
  assertTaskTime(attempt.updatedAt);
  if (attempt.createdAt > attempt.updatedAt || attempt.updatedAt > input.now) {
    throw new Error("Outcome recording time cannot precede attempt history");
  }
  if (typeof attempt.cancellationRequested !== "boolean" || typeof attempt.pauseRequested !== "boolean") {
    throw new Error("Attempt control flags must be boolean");
  }
  if (attempt.pauseRequested) throw new Error("Verification cannot retain a pending pause");
  if (!Array.isArray(attempt.outcomes)) throw new Error("Outcome history must be an array");
  const terminalRecheck = ["COMPLETED", "PARTIAL", "FAILED", "UNVERIFIABLE"].includes(attempt.state)
    && attempt.outcomes.length > 0;
  if (attempt.state !== "VERIFYING" && attempt.state !== "CANCELLED" && !terminalRecheck) {
    throw new Error("Only a verifying or cancelled attempt, or a terminal attempt with Outcome history, can derive an Outcome");
  }
  if (!Array.isArray(attempt.unresolvedActions) || attempt.unresolvedActions.length !== 0) {
    throw new Error("Unresolved actions must be reconciled before deriving an Outcome");
  }
  if (attempt.completeness !== "complete" && attempt.completeness !== "incomplete") {
    throw new Error("An attempt must be settled before deriving an Outcome");
  }
  if ((attempt.state === "CANCELLED" && !attempt.cancellationRequested)
    || (attempt.cancellationRequested && (attempt.completeness !== "complete"
      || (attempt.state !== "VERIFYING" && attempt.state !== "CANCELLED")))) {
    throw new Error("Cancellation requires a cancellation request and reconciled complete execution");
  }
  if (attempt.state === "COMPLETED" && attempt.completeness !== "complete") {
    throw new Error("A completed attempt requires complete execution");
  }
  assertOutcomeHistoryStatus(attempt);
  let previousRevision = 0;
  let previousTime = attempt.createdAt;
  for (const previous of attempt.outcomes) {
    checkBinding(attempt, previous);
    assertTaskRevision(previous.revision);
    assertTaskTime(previous.recordedAt);
    if (previous.id !== input.id || previous.revision !== previousRevision + 1) {
      throw new Error("Outcome revisions must retain the same id and advance by one");
    }
    if (previous.recordedAt < previousTime || previous.recordedAt > input.now) {
      throw new Error("Outcome history recording times must be monotonic");
    }
    previousRevision = previous.revision;
    previousTime = previous.recordedAt;
  }
  if (input.revision !== previousRevision + 1) {
    throw new Error("Outcome revision must advance by one, starting at one");
  }
  if (!Array.isArray(input.results) || input.results.length !== attempt.intent.criteria.length) {
    throw new Error("Results must cover every criterion exactly once");
  }
  const byId = new Map(input.results.map(result => [result.criterionId, result]));
  if (byId.size !== input.results.length) throw new Error("Duplicate criterion result");
  const results = Object.freeze(attempt.intent.criteria.map(criterion => {
    const result = byId.get(criterion.id);
    if (!result) throw new Error("Results must cover every criterion exactly once");
    return checkedResult(attempt, criterion, result, input.now);
  }));
  const status = attempt.cancellationRequested ? "cancelled" : classifyResults(attempt, results);
  return Object.freeze({
    id: input.id, revision: input.revision, taskId: attempt.taskId, attemptId: attempt.id,
    workspaceId: attempt.workspaceId, intentRevision: attempt.intent.revision,
    status, criteriaResults: results, recordedAt: input.now,
  });
}
