import { assertTaskIntent } from "./task.ts";
import type { TaskIntent } from "./task.ts";
import type {
  ScopeV2, PrivacyV2, SourceTrustV2, EpistemicV2, EntityRefV2, ContentRefV2,
  ClaimVersionRefV2, EvidenceRefV2, MemoryCandidateV2, MemoryClaimV2, HypothesisV2,
  GoalV2, EpisodeV2, WorkingStateV2, ProcedureV2, EntityKindV2, VersionRefV2, VersionedEntityKindV2, TaskAttemptRefV2,
} from "./cognitive-v2.ts";
import { domainErrorV2, DomainValidationErrorV2 } from "./errors-v2.ts";
import type { DomainErrorCodeV2 } from "./errors-v2.ts";

function fail(reason: string, code: DomainErrorCodeV2 = "validation"): never {
  // Fixed diagnostics deliberately do not echo a caller's potentially sensitive values.
  throw new DomainValidationErrorV2(domainErrorV2(code, reason, "The cognitive contract is invalid."));
}
function record(value: unknown, required: readonly string[], optional: readonly string[] = []): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail("invalid_shape");
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== "string" || ![...required, ...optional].includes(key)) fail("unknown_field");
    const descriptor = descriptors[key];
    if (!("value" in descriptor) || !descriptor.enumerable || descriptor.value === undefined) fail("invalid_shape");
  }
  for (const key of required) if (!Object.hasOwn(value, key)) fail("missing_field");
}
function oneOf<T extends string>(value: unknown, values: readonly T[], reason: string): asserts value is T {
  if (typeof value !== "string" || !values.includes(value as T)) fail(reason);
}
function array(value: unknown, minimum = 0): asserts value is unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) fail("invalid_array");
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const length = Object.getOwnPropertyDescriptor(value, "length")?.value as unknown;
  if (typeof length !== "number" || length < minimum || length > 1000) fail("invalid_array");
  if (Reflect.ownKeys(descriptors).length !== length + 1) fail("invalid_array");
  for (let index = 0; index < length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable || descriptor.value === undefined) fail("invalid_array");
  }
}
export function assertIdentifierV2(value: unknown): asserts value is string {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/.test(value)) fail("invalid_identifier");
}
export function assertTextV2(value: unknown, maximum = 8192): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0 || [...value].length > maximum
    || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) fail("invalid_text");
}
export function assertRevisionV2(value: unknown, allowZero = false): asserts value is number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < (allowZero ? 0 : 1)) fail("invalid_revision");
}
export function assertIsoTimestampV2(value: unknown): asserts value is string {
  if (typeof value !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)
    || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) fail("invalid_timestamp");
}
/** Pure comparison only, never a durable CAS or an idempotency receipt. */
export function assertExpectedRevisionV2(actual: unknown, expected: unknown, next?: unknown): void {
  assertRevisionV2(actual, true); assertRevisionV2(expected, true);
  if (actual !== expected) fail("stale_revision", "revision_conflict");
  if (next !== undefined) {
    assertRevisionV2(next);
    if (actual === Number.MAX_SAFE_INTEGER || next !== actual + 1) fail("invalid_next_revision", "revision_conflict");
  }
}
export function assertPrivacyV2(value: unknown): asserts value is PrivacyV2 {
  oneOf(value, ["model-allowed", "local-only"], "invalid_privacy");
}
export function assertSourceTrustV2(value: unknown): asserts value is SourceTrustV2 {
  oneOf(value, ["user-direct", "verified-tool", "external-content", "model-derived"], "invalid_source_trust");
}
export function assertEpistemicV2(value: unknown): asserts value is EpistemicV2 {
  oneOf(value, ["asserted", "verified", "inferred"], "invalid_epistemic");
}
export function assertScopeV2(value: unknown): asserts value is ScopeV2 {
  record(value, ["kind"], ["workspaceId", "taskId", "sessionId"]);
  const scope = value;
  switch (scope.kind) {
    case "global": record(scope, ["kind"]); break;
    case "workspace": record(scope, ["kind", "workspaceId"]); assertIdentifierV2(scope.workspaceId); break;
    case "task": record(scope, ["kind", "workspaceId", "taskId"]); assertIdentifierV2(scope.workspaceId); assertIdentifierV2(scope.taskId); break;
    case "session": record(scope, ["kind", "workspaceId", "sessionId"]); assertIdentifierV2(scope.workspaceId); assertIdentifierV2(scope.sessionId); break;
    default: fail("invalid_scope");
  }
}
/** Tuple encoding prevents delimiter collisions and preserves workspace identity. */
export function scopeKeyV2(scope: ScopeV2): string {
  assertScopeV2(scope);
  switch (scope.kind) {
    case "global": return JSON.stringify(["global"]);
    case "workspace": return JSON.stringify(["workspace", scope.workspaceId]);
    case "task": return JSON.stringify(["task", scope.workspaceId, scope.taskId]);
    case "session": return JSON.stringify(["session", scope.workspaceId, scope.sessionId]);
  }
}
export function sameScopeV2(left: ScopeV2, right: ScopeV2): boolean { return scopeKeyV2(left) === scopeKeyV2(right); }
/** Structural containment is not permission to read, share or invoke any model. */
export function isScopeWithinV2(inner: ScopeV2, outer: ScopeV2): boolean {
  assertScopeV2(inner); assertScopeV2(outer);
  if (sameScopeV2(inner, outer) || outer.kind === "global") return true;
  return outer.kind === "workspace" && inner.kind !== "global" && inner.workspaceId === outer.workspaceId;
}
const entityKinds: readonly EntityKindV2[] = ["workspace", "session", "observation", "candidate", "claim", "hypothesis",
  "goal", "task", "outcome", "episode", "working-state", "procedure", "artifact", "action", "extractor", "validator"];
export function assertEntityRefV2<K extends EntityKindV2 = EntityKindV2>(value: unknown, kind?: K): asserts value is EntityRefV2<K> {
  record(value, ["kind", "id", "revision"]);
  oneOf(value.kind, entityKinds, "invalid_entity_kind"); assertIdentifierV2(value.id); assertRevisionV2(value.revision);
  if (kind !== undefined && value.kind !== kind) fail("reference_kind_mismatch");
  if (value.kind === "observation" && value.revision !== 1) fail("immutable_observation_revision");
}
export function assertVersionRefV2<K extends VersionedEntityKindV2 = VersionedEntityKindV2>(value: unknown, kind?: K): asserts value is VersionRefV2<K> {
  record(value, ["kind", "id", "version"]);
  oneOf(value.kind, ["claim", "hypothesis", "episode", "procedure", "artifact"], "invalid_version_kind");
  assertIdentifierV2(value.id); assertRevisionV2(value.version);
  if (kind !== undefined && value.kind !== kind) fail("reference_kind_mismatch");
}
export function assertTaskAttemptRefV2(value: unknown): asserts value is TaskAttemptRefV2 {
  record(value, ["taskId", "attemptId", "intentRevision"]);
  assertIdentifierV2(value.taskId); assertIdentifierV2(value.attemptId); assertRevisionV2(value.intentRevision);
}
export function assertContentRefV2(value: unknown): asserts value is ContentRefV2 {
  record(value, ["contentId", "contentVersion"]); assertIdentifierV2(value.contentId); assertRevisionV2(value.contentVersion);
}
export function assertClaimVersionRefV2(value: unknown): asserts value is ClaimVersionRefV2 {
  record(value, ["claimId", "version"]); assertIdentifierV2(value.claimId); assertRevisionV2(value.version);
}
export function assertEvidenceRefV2(value: unknown): asserts value is EvidenceRefV2 {
  record(value, ["source", "scope", "privacy", "sourceTrust", "role", "observedAt"], ["fragmentId"]);
  assertEntityRefV2(value.source, "observation"); assertScopeV2(value.scope); assertPrivacyV2(value.privacy);
  assertSourceTrustV2(value.sourceTrust); oneOf(value.role, ["supports", "refutes"], "invalid_evidence_role");
  assertIsoTimestampV2(value.observedAt);
  if ("fragmentId" in value) assertIdentifierV2(value.fragmentId);
}
/** Metadata consistency only; the storage boundary must resolve/authenticate the cited Observation. */
export function assertEvidenceForScopeV2(evidence: unknown, scope: ScopeV2, privacy: PrivacyV2, recordedAt?: string): asserts evidence is readonly EvidenceRefV2[] {
  assertScopeV2(scope); assertPrivacyV2(privacy); if (recordedAt !== undefined) assertIsoTimestampV2(recordedAt);
  array(evidence, 1);
  const seen = new Set<string>(); const sources = new Map<string, string>();
  for (const ref of evidence) {
    assertEvidenceRefV2(ref);
    if (!isScopeWithinV2(scope, ref.scope)) fail("evidence_scope_widening", "scope_conflict");
    if (ref.privacy === "local-only" && privacy !== "local-only") fail("privacy_widening", "forbidden");
    if (recordedAt !== undefined && ref.observedAt > recordedAt) fail("future_evidence", "evidence_invalid");
    const sourceKey = JSON.stringify([ref.source.id, ref.source.revision]);
    const metadata = JSON.stringify([scopeKeyV2(ref.scope), ref.privacy, ref.sourceTrust, ref.observedAt]);
    if (sources.has(sourceKey) && sources.get(sourceKey) !== metadata) fail("conflicting_evidence_metadata", "evidence_invalid");
    sources.set(sourceKey, metadata);
    const key = JSON.stringify([sourceKey, ref.fragmentId ?? null, ref.role]);
    if (seen.has(key)) fail("duplicate_evidence", "evidence_invalid");
    seen.add(key);
  }
  if (!(evidence as EvidenceRefV2[]).some(ref => ref.role === "supports")) fail("missing_support", "evidence_invalid");
}
const baseKeys = ["schemaVersion", "id", "revision", "scope", "privacy", "sourceTrust", "createdAt", "updatedAt"];
function metadata(value: unknown, required: readonly string[], optional: readonly string[] = []): asserts value is Record<string, unknown> & {
  schemaVersion: 2; id: string; revision: number; scope: ScopeV2; privacy: PrivacyV2; sourceTrust: SourceTrustV2; createdAt: string; updatedAt: string;
} {
  record(value, [...baseKeys, ...required], optional);
  if (value.schemaVersion !== 2) fail("unsupported_schema", "unsupported");
  assertIdentifierV2(value.id); assertRevisionV2(value.revision); assertScopeV2(value.scope);
  assertPrivacyV2(value.privacy); assertSourceTrustV2(value.sourceTrust);
  assertIsoTimestampV2(value.createdAt); assertIsoTimestampV2(value.updatedAt);
  if (value.updatedAt < value.createdAt) fail("reversed_record_time");
}
function contentVersion(value: Record<string, unknown> & { revision: number }): asserts value is Record<string, unknown> & { revision: number; version: number } {
  assertRevisionV2(value.version);
  if (value.version > value.revision) fail("version_exceeds_revision", "revision_conflict");
}
function validity(value: Record<string, unknown>): void {
  assertIsoTimestampV2(value.validFrom);
  if ("validUntil" in value) {
    assertIsoTimestampV2(value.validUntil);
    if (value.validUntil <= value.validFrom) fail("invalid_validity_interval");
  }
}
function texts(value: unknown, minimum = 0): void { array(value, minimum); for (const item of value) assertTextV2(item); }
function claimKind(value: unknown): void { oneOf(value, ["fact", "preference", "constraint", "decision"], "invalid_claim_kind"); }
function referenceKey(ref: EntityRefV2 | VersionRefV2): string {
  return "revision" in ref ? JSON.stringify([ref.kind, ref.id, "revision", ref.revision]) : JSON.stringify([ref.kind, ref.id, "version", ref.version]);
}
function versionRefs(value: unknown, kind: VersionedEntityKindV2, minimum = 0): void {
  array(value, minimum); const seen = new Set<string>();
  for (const item of value) { assertVersionRefV2(item, kind); const key = referenceKey(item); if (seen.has(key)) fail("duplicate_reference"); seen.add(key); }
}
function mixedRefs(value: unknown): void {
  array(value, 1); const seen = new Set<string>();
  for (const item of value) {
    if (item !== null && typeof item === "object" && "version" in item) assertVersionRefV2(item);
    else assertEntityRefV2(item);
    const key = referenceKey(item); if (seen.has(key)) fail("duplicate_reference"); seen.add(key);
  }
}
function refs(value: unknown, kind?: EntityKindV2, minimum = 0): void {
  array(value, minimum); const seen = new Set<string>();
  for (const item of value) {
    assertEntityRefV2(item, kind);
    const key = JSON.stringify([item.kind, item.id, item.revision]);
    if (seen.has(key)) fail("duplicate_reference"); seen.add(key);
  }
}
/** The original P0-03 intent validator is reused without changing its contract. */
function intent(value: unknown): asserts value is TaskIntent {
  record(value, ["revision", "request", "constraints", "criteria"]);
  assertRevisionV2(value.revision); assertTextV2(value.request); texts(value.constraints); array(value.criteria, 1);
  for (const criterion of value.criteria) {
    record(criterion, ["id", "revision", "description", "required", "method"]);
    assertIdentifierV2(criterion.id); assertRevisionV2(criterion.revision); assertTextV2(criterion.description);
  }
  try { assertTaskIntent(value as unknown as TaskIntent); } catch { fail("invalid_acceptance_criteria"); }
}
export function assertMemoryCandidateV2(value: unknown): asserts value is MemoryCandidateV2 {
  metadata(value, ["kind", "statement", "epistemic", "confidence", "evidence", "extractor", "status", "validFrom", "expiresAt"], ["validUntil", "acceptedClaim"]);
  claimKind(value.kind); assertTextV2(value.statement, 2048); assertEpistemicV2(value.epistemic); validity(value);
  if (typeof value.confidence !== "number" || !Number.isFinite(value.confidence) || value.confidence < 0 || value.confidence > 1) fail("invalid_confidence");
  assertEvidenceForScopeV2(value.evidence, value.scope, value.privacy, value.updatedAt); assertEntityRefV2(value.extractor, "extractor");
  oneOf(value.status, ["PENDING", "ACCEPTED", "REJECTED", "EXPIRED"], "invalid_candidate_status");
  assertIsoTimestampV2(value.expiresAt);
  if (value.expiresAt <= value.createdAt) fail("invalid_expiry");
  if (value.status === "EXPIRED" && value.updatedAt < value.expiresAt) fail("premature_expiry");
  if ((value.status === "PENDING" || value.status === "ACCEPTED") && value.updatedAt >= value.expiresAt) fail("expired_candidate");
  if (value.status === "ACCEPTED") assertClaimVersionRefV2(value.acceptedClaim);
  else if ("acceptedClaim" in value) fail("unexpected_accepted_claim");
}
export function assertMemoryClaimV2(value: unknown): asserts value is MemoryClaimV2 {
  metadata(value, ["version", "kind", "statement", "epistemic", "evidence", "status", "validFrom"], ["validUntil", "supersedes", "supersededBy"]);
  contentVersion(value); claimKind(value.kind); assertTextV2(value.statement, 2048); validity(value);
  oneOf(value.epistemic, ["asserted", "verified"], "inference_requires_hypothesis");
  oneOf(value.status, ["ACTIVE", "SUPERSEDED", "DISPUTED", "EXPIRED", "FORGOTTEN"], "invalid_claim_status");
  assertEvidenceForScopeV2(value.evidence, value.scope, value.privacy, value.updatedAt);
  if (value.sourceTrust === "model-derived") fail("model_only_claim", "evidence_invalid");
  const supporting = value.evidence.filter(ref => ref.role === "supports");
  if (!supporting.some(ref => ref.sourceTrust !== "model-derived")) fail("model_only_claim", "evidence_invalid");
  if (value.epistemic === "verified" && !supporting.some(ref => ref.sourceTrust === "user-direct" || ref.sourceTrust === "verified-tool")) fail("independent_verification_required", "evidence_invalid");
  if (value.version > 1 || "supersedes" in value) {
    assertClaimVersionRefV2(value.supersedes);
    if (value.supersedes.claimId !== value.id || value.supersedes.version !== value.version - 1) fail("invalid_claim_lineage");
  }
  if (value.status === "SUPERSEDED" || (value.status === "FORGOTTEN" && "supersededBy" in value)) {
    assertClaimVersionRefV2(value.supersededBy);
    if (value.supersededBy.claimId !== value.id || value.supersededBy.version !== value.version + 1) fail("invalid_claim_lineage");
  } else if ("supersededBy" in value) fail("unexpected_successor");
}
export function assertHypothesisV2(value: unknown): asserts value is HypothesisV2 {
  metadata(value, ["version", "epistemic", "proposition", "evidence", "alternatives", "verificationQuestions", "expiresAt", "status"]);
  contentVersion(value); if (value.epistemic !== "inferred") fail("hypothesis_requires_inference");
  assertTextV2(value.proposition, 2048); texts(value.alternatives, 1); texts(value.verificationQuestions, 1);
  assertEvidenceForScopeV2(value.evidence, value.scope, value.privacy, value.updatedAt);
  assertIsoTimestampV2(value.expiresAt); if (value.expiresAt <= value.createdAt) fail("invalid_expiry");
  oneOf(value.status, ["OPEN", "SUPPORTED", "REFUTED", "EXPIRED", "WITHDRAWN"], "invalid_hypothesis_status");
  if (value.status === "OPEN" && value.updatedAt >= value.expiresAt) fail("expired_hypothesis");
  if (value.status === "EXPIRED" && value.updatedAt < value.expiresAt) fail("premature_expiry");
}
export function assertGoalV2(value: unknown): asserts value is GoalV2 {
  metadata(value, ["intent", "criteria", "priority", "confirmation", "status"], ["deadline"]);
  intent({ revision: value.revision, request: value.intent, constraints: [], criteria: value.criteria });
  oneOf(value.priority, ["low", "normal", "high"], "invalid_priority");
  oneOf(value.status, ["PROPOSED", "ACTIVE", "PAUSED", "ACHIEVED", "ABANDONED"], "invalid_goal_status");
  assertEvidenceForScopeV2([value.confirmation], value.scope, value.privacy, value.updatedAt);
  assertEvidenceRefV2(value.confirmation);
  if (value.confirmation.sourceTrust !== "user-direct" || value.confirmation.role !== "supports") fail("goal_confirmation_required", "evidence_invalid");
  if (value.sourceTrust !== "user-direct") fail("goal_confirmation_required", "evidence_invalid");
  if ("deadline" in value) assertIsoTimestampV2(value.deadline);
}
function taskBinding(value: Record<string, unknown> & { scope: ScopeV2 }): void {
  assertEntityRefV2(value.task, "task"); assertTaskAttemptRefV2(value.taskAttempt);
  if (value.task.id !== value.taskAttempt.taskId) fail("task_attempt_mismatch");
  if (value.scope.kind === "global" || (value.scope.kind === "task" && value.scope.taskId !== value.task.id)) fail("task_scope_mismatch", "scope_conflict");
}
export function assertEpisodeV2(value: unknown): asserts value is EpisodeV2 {
  metadata(value, ["version", "task", "taskAttempt", "intent", "startedAt", "endedAt", "contextDifferences", "actions", "artifacts", "outcome", "outcomeStatus", "unresolved", "evidence"], ["goal", "summary"]);
  contentVersion(value); taskBinding(value); intent(value.intent);
  assertTaskAttemptRefV2(value.taskAttempt);
  if (value.taskAttempt.intentRevision !== value.intent.revision) fail("task_intent_mismatch");
  if ("goal" in value) assertEntityRefV2(value.goal, "goal");
  assertIsoTimestampV2(value.startedAt); assertIsoTimestampV2(value.endedAt);
  if (value.endedAt < value.startedAt || value.endedAt > value.createdAt) fail("invalid_episode_interval");
  texts(value.contextDifferences); refs(value.actions, "action"); versionRefs(value.artifacts, "artifact");
  assertEntityRefV2(value.outcome, "outcome"); oneOf(value.outcomeStatus, ["completed", "partial", "failed", "cancelled", "unverifiable"], "invalid_outcome_status");
  texts(value.unresolved); assertEvidenceForScopeV2(value.evidence, value.scope, value.privacy, value.updatedAt);
  if ("summary" in value) {
    record(value.summary, ["text", "sourceRefs", "generatorRevision"]);
    assertTextV2(value.summary.text); assertRevisionV2(value.summary.generatorRevision); mixedRefs(value.summary.sourceRefs);
    const structured: (EntityRefV2 | VersionRefV2)[] = [value.task as EntityRefV2, value.outcome, ...(value.actions as EntityRefV2[]), ...(value.artifacts as VersionRefV2[]), ...value.evidence.map(ref => ref.source)];
    if (value.goal) structured.push(value.goal as EntityRefV2);
    const allowed = new Set(structured.map(ref => referenceKey(ref)));
    for (const ref of value.summary.sourceRefs as (EntityRefV2 | VersionRefV2)[]) {
      if (!allowed.has(referenceKey(ref))) fail("ungrounded_episode_summary", "evidence_invalid");
    }
  }
}
export function assertWorkingStateV2(value: unknown): asserts value is WorkingStateV2 {
  metadata(value, ["task", "taskAttempt", "intentRevision", "currentStep", "known", "unknown", "pendingInput", "nextSteps", "evidence"]);
  taskBinding(value); assertRevisionV2(value.intentRevision); assertTextV2(value.currentStep);
  assertTaskAttemptRefV2(value.taskAttempt);
  if (value.intentRevision !== value.taskAttempt.intentRevision) fail("task_intent_mismatch");
  texts(value.known); texts(value.unknown); texts(value.pendingInput); texts(value.nextSteps);
  assertEvidenceForScopeV2(value.evidence, value.scope, value.privacy, value.updatedAt);
}
export function assertProcedureV2(value: unknown): asserts value is ProcedureV2 {
  metadata(value, ["version", "category", "prerequisites", "requiredCapabilities", "steps", "validators", "failureConditions", "prohibitedActions", "expectedBenefits", "evidence", "sourceEpisodes", "trialStatistics", "status"], ["previousActiveVersion"]);
  contentVersion(value); assertTextV2(value.category); texts(value.prerequisites, 1); texts(value.requiredCapabilities);
  texts(value.failureConditions, 1); texts(value.prohibitedActions, 1); texts(value.expectedBenefits, 1);
  refs(value.validators, "validator", 1); versionRefs(value.sourceEpisodes, "episode", 1);
  assertEvidenceForScopeV2(value.evidence, value.scope, value.privacy, value.updatedAt);
  array(value.steps, 1); const steps = new Set<string>();
  for (const step of value.steps) {
    record(step, ["id", "instruction", "checks", "onFailure"]); assertIdentifierV2(step.id); assertTextV2(step.instruction);
    texts(step.checks, 1); assertTextV2(step.onFailure);
    if (steps.has(step.id)) fail("duplicate_procedure_step"); steps.add(step.id);
  }
  record(value.trialStatistics, ["attempts", "tasks", "verifiable", "adoptedVerified", "succeeded", "failed", "cancelled", "unknown"]);
  for (const count of Object.values(value.trialStatistics)) assertRevisionV2(count, true);
  const stats = value.trialStatistics as unknown as ProcedureV2["trialStatistics"];
  if (stats.tasks > stats.attempts || stats.verifiable > stats.attempts || stats.adoptedVerified > stats.attempts
    || stats.succeeded + stats.failed + stats.cancelled + stats.unknown !== stats.attempts
    || stats.verifiable > stats.attempts - stats.unknown || (stats.attempts > 0 && stats.tasks === 0)) fail("inconsistent_trial_statistics");
  oneOf(value.status, ["CANDIDATE", "TRIAL", "ACTIVE", "SUSPENDED", "RETIRED"], "invalid_procedure_status");
  if ("previousActiveVersion" in value) {
    assertRevisionV2(value.previousActiveVersion);
    if (value.previousActiveVersion >= value.version) fail("invalid_procedure_lineage");
  }
}
