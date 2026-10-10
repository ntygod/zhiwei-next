import { assertEntityRefV2, type EntityRefV2, type OutcomeStatus } from "../../domain/src/index.ts";
import { identifier, invalid, keys, list, member, object, revision, textValue, unique, version, wireBoundary } from "./cognitive-wire.ts";
import type { LocalApiErrorV1, LocalApiReceiptV1 } from "./local-api-v1-types.ts";

const taskStates = ["CREATED", "READY", "RUNNING", "VERIFYING", "WAITING_INPUT", "WAITING_APPROVAL", "PAUSED", "CANCELLING", "NEEDS_RECONCILIATION", "COMPLETED", "PARTIAL", "FAILED", "CANCELLED", "UNVERIFIABLE"] as const;
const terminalOutcomes = { COMPLETED: "completed", PARTIAL: "partial", FAILED: "failed", CANCELLED: "cancelled", UNVERIFIABLE: "unverifiable" } as const;
function outcomeSummary(input: unknown): { ref: EntityRefV2<"outcome">; status: OutcomeStatus } {
  const outcome = object(input); keys(outcome, ["ref", "status"]); assertEntityRefV2(outcome.ref, "outcome");
  const status = member(outcome.status, ["completed", "partial", "failed", "cancelled", "unverifiable"]);
  return { ref: outcome.ref, status };
}
function affected(input: unknown, claimOnly = false): void {
  const refs = list(input).map(ref => {
    assertEntityRefV2(ref);
    if (claimOnly && ref.kind !== "claim") invalid();
    return `${ref.kind}:${ref.id}:${ref.revision}`;
  });
  unique(refs);
}
export function parseLocalApiReceiptV1(input: unknown): LocalApiReceiptV1 {
  return wireBoundary(input, value => {
    keys(value, ["schemaVersion", "commandId", "status", "aggregate", "eventCursor", "result"]);
    version(value.schemaVersion, 1); identifier(value.commandId); member(value.status, ["committed"]);
    assertEntityRefV2(value.aggregate); member(value.aggregate.kind, ["task", "goal", "claim"]);
    // Opaque transport token. No decoding, verification or scope inference occurs in this DTO parser.
    const cursor = textValue(value.eventCursor, 4096);
    if (!/^[A-Za-z0-9_-]+$/.test(cursor)) invalid();
    const result = object(value.result);
    if (result.kind === "task") {
      keys(result, ["kind", "taskState", "intentRevision"], ["outcome", "initialOutcome"]);
      if (value.aggregate.kind !== "task") invalid();
      const state = member(result.taskState, taskStates); revision(result.intentRevision);
      const terminal = Object.hasOwn(terminalOutcomes, state);
      // P0-03 confirm-stop can reach CANCELLED before any Outcome is derived.
      if ((!terminal && result.outcome !== undefined) || (terminal && state !== "CANCELLED" && result.outcome === undefined)) invalid();
      if (result.outcome === undefined && result.initialOutcome !== undefined) invalid();
      if (result.outcome !== undefined) {
        const outcome = outcomeSummary(result.outcome);
        const originalStatus = terminalOutcomes[state as keyof typeof terminalOutcomes];
        if (outcome.ref.revision === 1) {
          if (result.initialOutcome !== undefined || outcome.status !== originalStatus) invalid();
        } else {
          // P0-03 preserves terminal Task/Attempt history while new evidence revises the same Outcome.
          const initial = outcomeSummary(result.initialOutcome);
          if (initial.ref.revision !== 1 || initial.ref.id !== outcome.ref.id || initial.status !== originalStatus) invalid();
          // Cancellation remains cancellation; other historical terminal states cannot become cancelled.
          if ((state === "CANCELLED") !== (outcome.status === "cancelled")) invalid();
        }
      }
    } else if (result.kind === "goal") {
      keys(result, ["kind", "status", "affectedRefs"]);
      if (value.aggregate.kind !== "goal") invalid();
      member(result.status, ["PROPOSED", "ACTIVE", "PAUSED", "ACHIEVED", "ABANDONED"]); affected(result.affectedRefs);
    } else {
      keys(result, ["kind", "affectedRefs", "cognitionEpoch"]); member(result.kind, ["memory"]);
      if (value.aggregate.kind !== "claim") invalid();
      affected(result.affectedRefs, true); revision(result.cognitionEpoch, true);
    }
    return value as unknown as LocalApiReceiptV1;
  });
}
const reasons = {
  validation: ["invalid_shape", "too_large", "unsupported_media"],
  unauthenticated: ["expired_session", "missing_session"],
  forbidden: ["action_not_granted", "privacy_blocked"],
  not_found: ["not_found"],
  revision_conflict: ["stale_intent", "stale_context", "stale_revision"],
  idempotency_conflict: ["key_reused"],
  unavailable: ["cursor_expired", "content_purged", "dependency_down", "recovery_required"],
  unsupported: ["runtime_capability", "protocol_version"],
  budget_exceeded: ["rate_limit", "token_limit", "required_context_over_budget"],
  corruption: ["integrity_failed"],
} as const;
export function parseLocalApiErrorV1(input: unknown): LocalApiErrorV1 {
  return wireBoundary(input, value => {
    keys(value, ["schemaVersion", "error"], ["commandId"]); version(value.schemaVersion, 1);
    if (value.commandId !== undefined) identifier(value.commandId);
    const error = object(value.error);
    keys(error, ["code", "reason", "safeMessage", "retryable", "diagnosticId"]);
    const code = member(error.code, Object.keys(reasons) as (keyof typeof reasons)[]);
    member(error.reason, reasons[code]); textValue(error.safeMessage, 512); identifier(error.diagnosticId);
    if (typeof error.retryable !== "boolean") invalid();
    // An unchanged invalid, forbidden or stale request must not be blindly retried.
    if (error.retryable && !["dependency_down", "rate_limit"].includes(error.reason as string)) invalid();
    return value as unknown as LocalApiErrorV1;
  });
}
