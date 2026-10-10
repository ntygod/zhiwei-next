import {
  assertTaskIntent, assertTaskEvidence, assertScopeV2, assertPrivacyV2,
  assertEntityRefV2, assertEvidenceRefV2, assertClaimVersionRefV2, assertEvidenceForScopeV2,
  type AcceptanceCriterion, type EntityKindV2, type EntityRefV2, type EvidenceRefV2, type TaskEvidenceRef,
} from "../../domain/src/index.ts";
import { identifier, invalid, keys, list, member, object, revision, textValue, timestamp, unique, version, wireBoundary } from "./cognitive-wire.ts";
import type { LocalApiCommandV1, LocalApiMemorySearchV1, LocalApiRouteV1 } from "./local-api-v1-types.ts";

const claimKinds = ["fact", "preference", "constraint", "decision"] as const;
function entityRef(input: unknown, kind?: EntityKindV2): EntityRefV2 {
  assertEntityRefV2(input);
  if (kind !== undefined && input.kind !== kind) invalid();
  return input;
}
function taskChecks(input: unknown, request: string, constraints: readonly string[] = []): void {
  for (const item of list(input, 100, 1)) {
    const value = object(item); keys(value, ["id", "revision", "description", "required", "method"]);
    identifier(value.id); revision(value.revision); textValue(value.description);
  }
  assertTaskIntent({ revision: 1, request, constraints, criteria: input as readonly AcceptanceCriterion[] });
}
function evidence(input: unknown, workspaceId: string): EvidenceRefV2 {
  assertEvidenceRefV2(input);
  if (input.scope.kind !== "global" && input.scope.workspaceId !== workspaceId) invalid();
  return input;
}
function target(payload: Record<string, unknown>, envelope: Record<string, unknown>, kind: EntityKindV2): void {
  const ref = entityRef(payload.targetRef, kind);
  if (ref.revision !== envelope.expectedRevision) invalid();
}
function taskInput(payload: Record<string, unknown>): void {
  const request = textValue(payload.request);
  const constraints = list(payload.constraints).map(value => textValue(value));
  taskChecks(payload.acceptanceChecks, request, constraints);
}
function goalInput(payload: Record<string, unknown>, workspaceId: string): void {
  const intent = textValue(payload.intent); taskChecks(payload.criteria, intent);
  member(payload.priority, ["low", "normal", "high"]); assertPrivacyV2(payload.privacy);
  const confirmation = evidence(payload.confirmation, workspaceId);
  assertEvidenceForScopeV2([confirmation], { kind: "workspace", workspaceId }, payload.privacy);
  if (payload.deadline !== undefined) timestamp(payload.deadline);
}
function memoryScope(payload: Record<string, unknown>, workspaceId: string): void {
  assertScopeV2(payload.scope);
  // Global writes require their own installation-level schema, not a Workspace envelope.
  if (payload.scope.kind === "global" || payload.scope.workspaceId !== workspaceId) invalid();
}
function memoryInput(payload: Record<string, unknown>, workspaceId: string): void {
  memoryScope(payload, workspaceId); assertPrivacyV2(payload.privacy);
  member(payload.claimKind, claimKinds); textValue(payload.statement);
  const refs = list(payload.evidenceRefs, 100, 1).map(ref => evidence(ref, workspaceId));
  assertScopeV2(payload.scope); assertEvidenceForScopeV2(refs, payload.scope, payload.privacy);
  timestamp(payload.validFrom);
  if (payload.validUntil !== undefined && timestamp(payload.validUntil) <= (payload.validFrom as string)) invalid();
}
function parsePayload(payload: Record<string, unknown>, envelope: Record<string, unknown>): void {
  const workspaceId = envelope.workspaceId as string;
  switch (payload.kind) {
    case "task.create": {
      keys(payload, ["kind", "sessionId", "request", "constraints", "acceptanceChecks", "executionProfile"], ["goalRef"]);
      identifier(payload.sessionId); taskInput(payload);
      const profile = object(payload.executionProfile); keys(profile, ["id", "revision"]);
      identifier(profile.id); revision(profile.revision);
      if (payload.goalRef !== undefined) entityRef(payload.goalRef, "goal");
      break;
    }
    case "task.continue": case "task.pause": case "task.cancel": case "task.retry":
      keys(payload, ["kind", "targetRef"]); target(payload, envelope, "task"); break;
    case "task.respond":
      keys(payload, ["kind", "targetRef", "pendingQuestionId", "response"]); target(payload, envelope, "task");
      identifier(payload.pendingQuestionId); textValue(payload.response); break;
    case "task.revise-request":
      keys(payload, ["kind", "targetRef", "intentRevision", "request", "constraints", "acceptanceChecks"]);
      target(payload, envelope, "task"); revision(payload.intentRevision); taskInput(payload); break;
    case "task.confirm-result": {
      keys(payload, ["kind", "targetRef", "attemptId", "intentRevision", "criterionId", "criterionRevision", "evidenceRefs"]);
      target(payload, envelope, "task"); identifier(payload.attemptId); identifier(payload.criterionId);
      revision(payload.intentRevision); revision(payload.criterionRevision);
      for (const item of list(payload.evidenceRefs, 100, 1)) {
        const ref = object(item); keys(ref, ["id", "revision"]); identifier(ref.id); revision(ref.revision);
      }
      assertTaskEvidence(payload.evidenceRefs as readonly TaskEvidenceRef[]); break;
    }
    case "goal.create": case "goal.revise":
      keys(payload, ["kind", "intent", "criteria", "priority", "privacy", "confirmation", ...(payload.kind === "goal.revise" ? ["targetRef"] : [])], ["deadline"]);
      if (payload.kind === "goal.revise") target(payload, envelope, "goal");
      goalInput(payload, workspaceId); break;
    case "goal.pause": case "goal.resume": case "goal.abandon":
      keys(payload, ["kind", "targetRef"]); target(payload, envelope, "goal"); break;
    case "memory.remember": case "memory.correct":
      keys(payload, ["kind", "scope", "privacy", "claimKind", "statement", "evidenceRefs", "validFrom", ...(payload.kind === "memory.correct" ? ["targetRef", "targetVersion"] : [])], ["validUntil"]);
      memoryInput(payload, workspaceId);
      if (payload.kind === "memory.correct") claimTarget(payload, envelope);
      break;
    case "memory.forget":
      keys(payload, ["kind", "targetRef", "targetVersion", "scope", "mode"]);
      claimTarget(payload, envelope); memoryScope(payload, workspaceId); member(payload.mode, ["logical"]); break;
    default: invalid();
  }
}
function claimTarget(payload: Record<string, unknown>, envelope: Record<string, unknown>): void {
  target(payload, envelope, "claim"); assertClaimVersionRefV2(payload.targetVersion);
  if (payload.targetVersion.claimId !== object(payload.targetRef).id) invalid();
}
export function parseLocalApiCommandV1(input: unknown, route?: LocalApiRouteV1): LocalApiCommandV1 {
  const command = wireBoundary(input, value => {
    keys(value, ["schemaVersion", "commandId", "idempotencyKey", "workspaceId", "expectedRevision", "payload"]);
    version(value.schemaVersion, 1); identifier(value.commandId); identifier(value.idempotencyKey); identifier(value.workspaceId);
    revision(value.expectedRevision, true);
    const payload = object(value.payload);
    const create = ["task.create", "goal.create", "memory.remember"].includes(payload.kind as string);
    if ((value.expectedRevision === 0) !== create) invalid();
    parsePayload(payload, value);
    return value as unknown as LocalApiCommandV1;
  });
  if (route !== undefined) wireBoundary(route, value => {
    keys(value, ["workspaceId"], ["targetId"]); identifier(value.workspaceId);
    if (value.workspaceId !== command.workspaceId) invalid();
    if (value.targetId !== undefined) {
      identifier(value.targetId);
      if (!("targetRef" in command.payload) || value.targetId !== command.payload.targetRef.id) invalid();
    }
    return value;
  });
  return command;
}
export function parseLocalApiMemorySearchV1(input: unknown): LocalApiMemorySearchV1 {
  return wireBoundary(input, value => {
    keys(value, ["schemaVersion", "query", "scope", "kinds", "limit"], ["validAt", "knownAt"]);
    version(value.schemaVersion, 1); textValue(value.query, 4096); assertScopeV2(value.scope);
    unique(list(value.kinds, 4, 1).map(kind => member(kind, claimKinds)));
    if (revision(value.limit) > 50) invalid();
    if (value.validAt !== undefined) timestamp(value.validAt);
    if (value.knownAt !== undefined) timestamp(value.knownAt);
    return value as unknown as LocalApiMemorySearchV1;
  });
}
