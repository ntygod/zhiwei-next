import { assertTaskIntent, assertTaskOutcomeHistory, isTerminalTaskState, sameTaskIntent, type Task, type TaskAttempt, type TaskState } from "../../domain/src/index.ts";
import { decodeWireJson, identifier, invalid, keys, list, member, object, revision, textValue, timestamp, unique, version, wireBoundary } from "./cognitive-wire.ts";
import { canonicalJsonV1 } from "./lossless-json.ts";
import { parseLocalApiReceiptV1 } from "./local-api-v1-response.ts";
import type { SessionApiReceiptV1, SessionSnapshotV1, ProductEventV1, SessionContractV1, SessionCreateCommandV1, SessionPairRequestV1, SessionV1, TaskSummaryV1 } from "./session-api-v1-types.ts";
export * from "./session-api-v1-types.ts";
export const sessionTaskStatesV1 = ["CREATED", "READY", "RUNNING", "VERIFYING", "WAITING_INPUT", "WAITING_APPROVAL", "PAUSED", "CANCELLING", "NEEDS_RECONCILIATION", "COMPLETED", "PARTIAL", "FAILED", "CANCELLED", "UNVERIFIABLE"] as const;
function contract(input: unknown): void {
  const value = object(input); keys(value, ["schemaVersion", "runtimeProfile", "modelProfile", "toolProfile", "policyProfile", "dataProfile", "compilerProfile", "interactionKind"]);
  version(value.schemaVersion, 1); member(value.interactionKind, ["interactive", "single-task"]);
  for (const name of ["runtimeProfile", "modelProfile", "toolProfile", "policyProfile", "dataProfile", "compilerProfile"]) { const profile = object(value[name]); keys(profile, ["id", "revision"]); identifier(profile.id); revision(profile.revision); }
}
export function parseSessionContractV1(input: unknown): SessionContractV1 {
  return wireBoundary(input, value => { contract(value); return value as unknown as SessionContractV1; });
}
export function parseSessionCreateCommandV1(input: unknown): SessionCreateCommandV1 {
  return wireBoundary(input, value => {
    keys(value, ["schemaVersion", "commandId", "idempotencyKey", "workspaceId", "expectedRevision", "payload"]);
    version(value.schemaVersion, 1); identifier(value.commandId); identifier(value.idempotencyKey); identifier(value.workspaceId);
    if (value.expectedRevision !== 0) invalid();
    const payload = object(value.payload); keys(payload, ["kind", "contract"]); member(payload.kind, ["session.create"]); contract(payload.contract);
    return value as unknown as SessionCreateCommandV1;
  });
}
export function deserializeSessionCreateCommandV1(input: string): SessionCreateCommandV1 { return parseSessionCreateCommandV1(decodeWireJson(input)); }
export function serializeSessionCreateCommandV1(input: unknown): string { return canonicalJsonV1(parseSessionCreateCommandV1(input)); }
export function parseSessionV1(input: unknown): SessionV1 {
  return wireBoundary(input, value => {
    keys(value, ["schemaVersion", "id", "workspaceId", "revision", "ownerEpoch", "contract", "createdAt", "updatedAt"]);
    version(value.schemaVersion, 1); identifier(value.id); identifier(value.workspaceId); revision(value.revision); revision(value.ownerEpoch); contract(value.contract);
    if (timestamp(value.updatedAt) < timestamp(value.createdAt)) invalid();
    return value as unknown as SessionV1;
  });
}
export function parseTaskSummaryV1(input: unknown): TaskSummaryV1 {
  return wireBoundary(input, value => {
    keys(value, ["id", "workspaceId", "sessionId", "revision", "intentRevision", "state", "updatedAt"]);
    identifier(value.id); identifier(value.workspaceId); identifier(value.sessionId); revision(value.revision); revision(value.intentRevision);
    member(value.state, sessionTaskStatesV1); timestamp(value.updatedAt);
    return value as unknown as TaskSummaryV1;
  });
}
function intent(input: unknown): void {
  const value = object(input); keys(value, ["revision", "request", "constraints", "criteria"]); revision(value.revision); textValue(value.request);
  list(value.constraints).forEach(item => textValue(item));
  for (const item of list(value.criteria, 100, 1)) {
    const criterion = object(item); keys(criterion, ["id", "revision", "description", "required", "method"]);
    identifier(criterion.id); revision(criterion.revision); textValue(criterion.description);
    if (typeof criterion.required !== "boolean") invalid();
    member(criterion.method, ["artifact", "deterministic-test", "tool-receipt", "user-confirmation", "model-assisted"]);
  }
  assertTaskIntent(value as unknown as Task["intent"]);
}
function evidence(input: unknown): void {
  const refs = list(input); unique(refs.map(item => { const ref = object(item); keys(ref, ["id", "revision"]); revision(ref.revision); return identifier(ref.id); }));
}
/** Complete bounded wire validation, without inventing task transitions in the transport layer. */
export function parseSessionTaskV1(input: unknown): Task {
  return wireBoundary(input, value => {
    keys(value, ["id", "workspaceId", "sessionId", "revision", "intent", "state", "attempts", "createdAt", "updatedAt"]);
    identifier(value.id); identifier(value.workspaceId); identifier(value.sessionId); revision(value.revision); intent(value.intent); member(value.state, sessionTaskStatesV1);
    if (timestamp(value.updatedAt) < timestamp(value.createdAt)) invalid();
    const attempts = list(value.attempts, 100, 1);
    unique(attempts.map(item => {
      const attempt = object(item); keys(attempt, ["id", "taskId", "workspaceId", "intent", "state", "createdAt", "updatedAt", "pauseRequested", "cancellationRequested", "completeness", "outcomes", "unresolvedActions"]);
      const id = identifier(attempt.id); identifier(attempt.taskId); identifier(attempt.workspaceId); intent(attempt.intent); member(attempt.state, sessionTaskStatesV1);
      if (attempt.taskId !== value.id || attempt.workspaceId !== value.workspaceId || timestamp(attempt.updatedAt) < timestamp(attempt.createdAt)
        || timestamp(attempt.createdAt) < (value.createdAt as string) || timestamp(attempt.updatedAt) > (value.updatedAt as string)
        || typeof attempt.pauseRequested !== "boolean" || typeof attempt.cancellationRequested !== "boolean") invalid();
      member(attempt.completeness, ["not-settled", "complete", "incomplete"]); evidence(attempt.unresolvedActions);
      for (const entry of list(attempt.outcomes)) {
        const outcome = object(entry); keys(outcome, ["id", "revision", "taskId", "attemptId", "workspaceId", "intentRevision", "status", "criteriaResults", "recordedAt"]);
        identifier(outcome.id); revision(outcome.revision); identifier(outcome.taskId); identifier(outcome.attemptId); identifier(outcome.workspaceId); revision(outcome.intentRevision); timestamp(outcome.recordedAt);
        member(outcome.status, ["completed", "partial", "failed", "cancelled", "unverifiable"]);
        for (const row of list(outcome.criteriaResults)) {
          const result = object(row);
          const status = member(result.status, ["pass", "fail", "unknown", "not-applicable"]);
          keys(result, ["taskId", "attemptId", "workspaceId", "intentRevision", "criterionId", "criterionRevision", "method", "checkedAt", "explanation", "status", "evidence", ...(status === "pass" || status === "fail" ? ["validUntil"] : status === "unknown" ? ["reason"] : [])]);
          for (const name of ["taskId", "attemptId", "workspaceId", "criterionId"]) identifier(result[name]);
          revision(result.intentRevision); revision(result.criterionRevision); timestamp(result.checkedAt); textValue(result.explanation); evidence(result.evidence);
          member(result.method, ["artifact", "deterministic-test", "tool-receipt", "user-confirmation", "model-assisted"]);
          if (status === "pass" || status === "fail") timestamp(result.validUntil);
          if (status === "unknown") member(result.reason, ["missing-evidence", "validator-unavailable", "validator-error", "incomplete", "model-only"]);
        }
      }
      assertTaskOutcomeHistory(attempt as unknown as TaskAttempt); return id;
    }));
    const history = attempts as unknown as readonly TaskAttempt[];
    const outcomeOwners = new Map<string, string>();
    for (const [index, attempt] of history.entries()) {
      if (index < history.length - 1 && !isTerminalTaskState(attempt.state)) invalid();
      // These are stored-state coherence constraints, not transition selection or result verification.
      if (attempt.pauseRequested && attempt.state !== "RUNNING") invalid();
      if (attempt.cancellationRequested && !["CANCELLING", "NEEDS_RECONCILIATION", "VERIFYING", "CANCELLED"].includes(attempt.state)) invalid();
      if (attempt.state === "CANCELLING" && !attempt.cancellationRequested) invalid();
      if (attempt.state === "CANCELLED" && (!attempt.cancellationRequested || attempt.completeness !== "complete")) invalid();
      if (["VERIFYING", "COMPLETED", "PARTIAL", "FAILED", "UNVERIFIABLE"].includes(attempt.state) && attempt.completeness === "not-settled") invalid();
      if (["CREATED", "READY", "RUNNING", "WAITING_INPUT", "WAITING_APPROVAL", "PAUSED"].includes(attempt.state)
        && (attempt.completeness !== "not-settled" || attempt.outcomes.length)) invalid();
      if (attempt.outcomes.length && attempt.completeness === "not-settled") invalid();
      if (attempt.unresolvedActions.length && !["CANCELLING", "NEEDS_RECONCILIATION"].includes(attempt.state)) invalid();
      if (attempt.state === "NEEDS_RECONCILIATION" && (!attempt.unresolvedActions.length || attempt.completeness !== "incomplete")) invalid();
      const previous = history[index - 1];
      if (previous && (attempt.createdAt < previous.updatedAt || attempt.intent.revision < previous.intent.revision
        || attempt.intent.revision > previous.intent.revision + 1
        || (attempt.intent.revision === previous.intent.revision && !sameTaskIntent(attempt.intent, previous.intent)))) invalid();
      if (isTerminalTaskState(attempt.state) && attempt.state !== "CANCELLED"
        && (!attempt.outcomes.length || attempt.outcomes[0]!.status.toUpperCase() !== attempt.state)) invalid();
      for (const outcome of attempt.outcomes) {
        if (attempt.cancellationRequested && outcome.status !== "cancelled") invalid();
        if (outcome.status === "cancelled" && (!attempt.cancellationRequested || attempt.completeness !== "complete")) invalid();
        if (outcomeOwners.has(outcome.id) && outcomeOwners.get(outcome.id) !== attempt.id) invalid();
        outcomeOwners.set(outcome.id, attempt.id);
        if (isTerminalTaskState(attempt.state) && attempt.outcomes[0]!.status.toUpperCase() !== attempt.state) invalid();
      }
    }
    const active = attempts.at(-1) as unknown as TaskAttempt;
    if (active.state !== value.state || !sameTaskIntent(active.intent, value.intent as unknown as Task["intent"])) invalid();
    return value as unknown as Task;
  });
}
export function parseProductEventV1(input: unknown): ProductEventV1 {
  return wireBoundary(input, value => {
    keys(value, ["schemaVersion", "eventId", "workspaceId", "aggregate", "occurredAt", "type", "payload"]);
    version(value.schemaVersion, 1); identifier(value.eventId); identifier(value.workspaceId); timestamp(value.occurredAt);
    const aggregate = object(value.aggregate); keys(aggregate, ["kind", "id", "revision"]); member(aggregate.kind, ["session", "task"]); identifier(aggregate.id); revision(aggregate.revision);
    const payload = object(value.payload);
    switch (value.type) {
      case "session.created": case "session.owner_fenced": keys(payload, ["ownerEpoch"]); revision(payload.ownerEpoch); if (aggregate.kind !== "session") invalid(); break;
      case "task.created": case "task.state_changed": keys(payload, ["state", "intentRevision"]); member(payload.state, sessionTaskStatesV1); revision(payload.intentRevision); if (aggregate.kind !== "task") invalid(); break;
      case "task.input_committed": keys(payload, ["attemptId", "ordinal"]); identifier(payload.attemptId); revision(payload.ordinal, true); if (aggregate.kind !== "task") invalid(); break;
      case "task.progress": keys(payload, ["phase"], ["checkpoint"]); member(payload.phase, ["queued", "working", "waiting", "verifying", "stopped"]); if (payload.checkpoint !== undefined) textValue(payload.checkpoint, 1024); if (aggregate.kind !== "task") invalid(); break;
      default: invalid();
    }
    return value as unknown as ProductEventV1;
  });
}
export function deserializeProductEventV1(input: string): ProductEventV1 { return parseProductEventV1(decodeWireJson(input)); }
export function parseSessionPairRequestV1(input: unknown): SessionPairRequestV1 {
  return wireBoundary(input, value => {
    keys(value, ["schemaVersion", "bootstrapCode", "clientNonce", "clientKind"]); version(value.schemaVersion, 1); member(value.clientKind, ["browser", "cli"]);
    for (const name of ["bootstrapCode", "clientNonce"]) if (typeof value[name] !== "string" || !/^[A-Za-z0-9_-]{32,128}$/.test(value[name] as string)) invalid();
    return value as unknown as SessionPairRequestV1;
  });
}
export function deserializeSessionPairRequestV1(input: string): SessionPairRequestV1 { return parseSessionPairRequestV1(decodeWireJson(input)); }
export function parseSessionTaskStateV1(input: unknown): TaskState { return member(input, sessionTaskStatesV1); }

export function parseSessionApiReceiptV1(input: unknown): SessionApiReceiptV1 {
  return wireBoundary(input, value => {
    if (object(value.aggregate).kind !== "session") return parseLocalApiReceiptV1(value);
    keys(value, ["schemaVersion", "commandId", "status", "aggregate", "eventCursor", "result"]);
    version(value.schemaVersion, 1); identifier(value.commandId); member(value.status, ["committed"]); textValue(value.eventCursor, 2048);
    const aggregate = object(value.aggregate); keys(aggregate, ["kind", "id", "revision"]); identifier(aggregate.id); revision(aggregate.revision);
    const result = object(value.result); keys(result, ["kind", "ownerEpoch"]); member(result.kind, ["session"]); revision(result.ownerEpoch);
    return value as unknown as SessionApiReceiptV1;
  });
}
export function parseSessionSnapshotV1(input: unknown): SessionSnapshotV1 {
  return wireBoundary(input, value => {
    keys(value, ["schemaVersion", "workspaceId", "sessions", "tasks", "asOfCursor"]); version(value.schemaVersion, 1); identifier(value.workspaceId); textValue(value.asOfCursor, 2048);
    const sessions = list(value.sessions, 100).map(parseSessionV1); const tasks = list(value.tasks, 100).map(parseTaskSummaryV1);
    unique(sessions.map(session => session.id)); unique(tasks.map(task => task.id));
    if ([...sessions, ...tasks].some(row => row.workspaceId !== value.workspaceId)) invalid();
    return value as unknown as SessionSnapshotV1;
  });
}

/** Lossless JSON syntax boundary only; consumers must still apply the specific response DTO parser. */
export function decodeSessionApiJsonV1(input: string): unknown { return decodeWireJson(input); }
