import type { AcceptanceCriterion, Outcome, Task, TaskEvidenceRef } from "./task.ts";
import type { ContextClaimRefV1, ContextSelectionReasonV1 } from "./context-v1.ts";
import type { EntityRefV2, EpisodeV2, TaskAttemptRefV2, VersionRefV2 } from "./cognitive-v2.ts";
import { assertIdentifierV2, assertRevisionV2, assertIsoTimestampV2, assertTextV2 } from "./validation-v2.ts";
import { assertEntityRefV2, assertTaskAttemptRefV2 } from "./validation-v2.ts";
import { assertTaskIntent } from "./task.ts";

/** A declared check is data, never a program, a resource path, or permission to read it. */
export type CriterionCheckV1 = Readonly<{ criterionId: string; criterionRevision: number }> & (
  | Readonly<{ kind: "artifact"; resourceId: string; format: "text-equals" | "json-equals"; expectedText: string }>
  | Readonly<{ kind: "deterministic-test"; resourceId: string }>
  | Readonly<{ kind: "tool-receipt"; toolName: string; argumentsJson: string }>
  | Readonly<{ kind: "user-confirmation" | "model-assisted" }>
);
/** A limited declared comparison, not a general interpretation of a memory statement. */
export interface MemoryAdoptionCheckV1 {
  readonly material: ContextClaimRefV1;
  readonly toolName: string;
  readonly parameter: string;
  readonly expectedJson: string;
  readonly profile: "synthetic-parameter-v1";
}
/** Immutable registration against the Task snapshot that preceded its first dispatch. */
export interface OutcomeVerificationPlanV1 {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly workspaceId: string;
  readonly task: EntityRefV2<"task">;
  readonly taskAttempt: TaskAttemptRefV2;
  readonly criteria: readonly AcceptanceCriterion[];
  readonly verifier: Readonly<{ id: "outcome-verifier-v1"; revision: 1 }>;
  readonly checks: readonly CriterionCheckV1[];
  readonly adoptionChecks: readonly MemoryAdoptionCheckV1[];
  readonly createdAt: string;
}
export type CriterionObservationPayloadV1 =
  | Readonly<{ kind: "artifact"; resourceId: string; artifact: VersionRefV2<"artifact">; text: string }>
  | Readonly<{ kind: "deterministic-test"; resourceId: string; exitCode: number }>
  | Readonly<{ kind: "tool-receipt"; toolName: string; argumentsJson: string; succeeded: boolean; action: EntityRefV2<"action">; sourceEvent: TaskEvidenceRef }>
  | Readonly<{ kind: "user-confirmation"; decision: "accepted" | "rejected"; principalId: string; input: TaskEvidenceRef }>
  | Readonly<{ kind: "unknown"; reason: "missing-evidence" | "validator-unavailable" | "validator-error" | "incomplete" | "model-only" }>;
/** Observed by a fixed authorized reader. Shape alone does not authenticate its producer. */
export interface CriterionObservationV1 {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly workspaceId: string;
  readonly taskId: string;
  readonly attemptId: string;
  readonly intentRevision: number;
  readonly criterionId: string;
  readonly criterionRevision: number;
  readonly observedAt: string;
  readonly notAfter: string;
  readonly payload: CriterionObservationPayloadV1;
}
export interface MemoryUseV1 {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly taskAttempt: TaskAttemptRefV2;
  readonly workspaceId: string;
  readonly request: Readonly<{ bindingId: string; requestId: string; ordinal: number }>;
  readonly material: ContextClaimRefV1;
  /** Position within the capsule's selected materials, in their actual rendered order. */
  readonly position: number;
  readonly reason: ContextSelectionReasonV1;
  readonly exposure: "sent" | "uncertain";
  readonly adoption:
    | Readonly<{ status: "unknown" }>
    | Readonly<{ status: "claimed"; step: TaskEvidenceRef }>
    | Readonly<{ status: "verified"; step: TaskEvidenceRef; action: EntityRefV2<"action">; parameter: string; evidence: TaskEvidenceRef }>;
  readonly outcome: EntityRefV2<"outcome">;
  /** This first profile performs no comparison and must not invent a benefit. */
  readonly benefit: Readonly<{ status: "unknown" }>;
}
export interface TaskResultBundleV1 {
  readonly schemaVersion: 1;
  readonly task: Task;
  readonly outcome: Outcome;
  readonly episode: EpisodeV2;
  readonly observations: readonly CriterionObservationV1[];
  readonly memoryUses: readonly MemoryUseV1[];
  readonly learning: "not-scheduled";
}

function invalid(): never { throw new TypeError("Invalid outcome verification contract."); }
function record(value: unknown, required: readonly string[], optional: readonly string[] = []): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) invalid();
  const fields = Object.getOwnPropertyDescriptors(value);
  if (required.some(key => !fields[key]) || Reflect.ownKeys(fields).some(key => typeof key !== "string"
    || ![...required, ...optional].includes(key) || !("value" in fields[key]) || !fields[key].enumerable || fields[key].value === undefined)) invalid();
}
function list(value: unknown, min = 0): asserts value is unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length < min || value.length > 100) invalid();
  const fields = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(fields).length !== value.length + 1) invalid();
  for (let index = 0; index < value.length; index++) if (!fields[index] || !("value" in fields[index]) || !fields[index].enumerable) invalid();
}
export function assertCriterionCheckV1(value: unknown): asserts value is CriterionCheckV1 {
  const common = ["criterionId", "criterionRevision", "kind"];
  record(value, common, ["resourceId", "format", "expectedText", "toolName", "argumentsJson"]);
  assertIdentifierV2(value.criterionId); assertRevisionV2(value.criterionRevision);
  switch (value.kind) {
    case "artifact": record(value, [...common, "resourceId", "format", "expectedText"]); assertIdentifierV2(value.resourceId); assertTextV2(value.expectedText);
      if (!["text-equals", "json-equals"].includes(value.format as string)) invalid();
      if (value.format === "json-equals") { try { JSON.parse(value.expectedText); } catch { invalid(); } } break;
    case "deterministic-test": record(value, [...common, "resourceId"]); assertIdentifierV2(value.resourceId); break;
    case "tool-receipt": record(value, [...common, "toolName", "argumentsJson"]); assertIdentifierV2(value.toolName); assertTextV2(value.argumentsJson);
      try { const parsed: unknown = JSON.parse(value.argumentsJson); if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) invalid(); } catch { invalid(); } break;
    case "user-confirmation": case "model-assisted": record(value, common); break;
    default: invalid();
  }
}
export function assertOutcomeVerificationPlanV1(value: unknown): asserts value is OutcomeVerificationPlanV1 {
  record(value, ["schemaVersion", "id", "workspaceId", "task", "taskAttempt", "criteria", "verifier", "checks", "adoptionChecks", "createdAt"]);
  if (value.schemaVersion !== 1) invalid(); assertIdentifierV2(value.id); assertIdentifierV2(value.workspaceId);
  assertEntityRefV2(value.task, "task"); assertTaskAttemptRefV2(value.taskAttempt); assertIsoTimestampV2(value.createdAt);
  if (value.task.id !== value.taskAttempt.taskId) invalid();
  record(value.verifier, ["id", "revision"]); if (value.verifier.id !== "outcome-verifier-v1" || value.verifier.revision !== 1) invalid();
  list(value.criteria, 1); for (const criterion of value.criteria) record(criterion, ["id", "revision", "description", "required", "method"]);
  assertTaskIntent({ revision: value.taskAttempt.intentRevision, request: "Declared verification criteria", constraints: [], criteria: value.criteria as unknown as readonly AcceptanceCriterion[] });
  list(value.checks, 1); if (value.checks.length !== value.criteria.length) invalid();
  const seen = new Set<string>();
  for (const check of value.checks) {
    assertCriterionCheckV1(check); const criterion = (value.criteria as unknown as readonly AcceptanceCriterion[]).find(item => item.id === check.criterionId);
    if (!criterion || seen.has(check.criterionId) || criterion.revision !== check.criterionRevision || criterion.method !== check.kind) invalid(); seen.add(check.criterionId);
  }
  list(value.adoptionChecks); const materials = new Set<string>();
  for (const check of value.adoptionChecks) {
    record(check, ["material", "toolName", "parameter", "expectedJson", "profile"]); record(check.material, ["kind", "id", "revision", "version"]);
    if (check.material.kind !== "claim" || check.profile !== "synthetic-parameter-v1") invalid();
    assertIdentifierV2(check.material.id); assertRevisionV2(check.material.revision); assertRevisionV2(check.material.version);
    assertIdentifierV2(check.toolName); assertIdentifierV2(check.parameter); assertTextV2(check.expectedJson);
    try { const expected: unknown = JSON.parse(check.expectedJson); if (expected !== null && !["string", "number", "boolean"].includes(typeof expected)) invalid(); } catch { invalid(); }
    const key = `${check.material.id}:${check.material.version}`; if (materials.has(key)) invalid(); materials.add(key);
  }
}
export function assertMemoryUseV1(value: unknown): asserts value is MemoryUseV1 {
  record(value, ["schemaVersion", "id", "taskAttempt", "workspaceId", "request", "material", "position", "reason", "exposure", "adoption", "outcome", "benefit"]);
  if (value.schemaVersion !== 1) invalid(); assertIdentifierV2(value.id); assertIdentifierV2(value.workspaceId); assertTaskAttemptRefV2(value.taskAttempt);
  record(value.request, ["bindingId", "requestId", "ordinal"]); assertIdentifierV2(value.request.bindingId); assertIdentifierV2(value.request.requestId); assertRevisionV2(value.request.ordinal);
  record(value.material, ["kind", "id", "revision", "version"]); if (value.material.kind !== "claim") invalid();
  assertIdentifierV2(value.material.id); assertRevisionV2(value.material.revision); assertRevisionV2(value.material.version);
  if (!Number.isSafeInteger(value.position) || (value.position as number) < 0 || (value.position as number) > 100) invalid();
  if (!["required", "selected_by_category", "selected_by_borrow"].includes(value.reason as string) || !["sent", "uncertain"].includes(value.exposure as string)) invalid();
  assertEntityRefV2(value.outcome, "outcome"); record(value.benefit, ["status"]); if (value.benefit.status !== "unknown") invalid();
  const adoption = value.adoption; record(adoption, ["status"], ["step", "action", "parameter", "evidence"]);
  if (adoption.status === "unknown") record(adoption, ["status"]);
  else {
    record(adoption, adoption.status === "claimed" ? ["status", "step"] : ["status", "step", "action", "parameter", "evidence"]);
    record(adoption.step, ["id", "revision"]); assertIdentifierV2(adoption.step.id); assertRevisionV2(adoption.step.revision);
    if (adoption.status === "verified") {
      if (value.exposure !== "sent") invalid(); assertEntityRefV2(adoption.action, "action"); assertIdentifierV2(adoption.parameter);
      record(adoption.evidence, ["id", "revision"]); assertIdentifierV2(adoption.evidence.id); assertRevisionV2(adoption.evidence.revision);
    } else if (adoption.status !== "claimed") invalid();
  }
}
export function assertCriterionObservationV1(value: unknown): asserts value is CriterionObservationV1 {
  record(value, ["schemaVersion", "id", "workspaceId", "taskId", "attemptId", "intentRevision", "criterionId", "criterionRevision", "observedAt", "notAfter", "payload"]);
  if (value.schemaVersion !== 1) invalid();
  for (const key of ["id", "workspaceId", "taskId", "attemptId", "criterionId"]) assertIdentifierV2(value[key]);
  assertRevisionV2(value.intentRevision); assertRevisionV2(value.criterionRevision); assertIsoTimestampV2(value.observedAt); assertIsoTimestampV2(value.notAfter);
  if (value.notAfter <= value.observedAt) invalid();
  const payload = value.payload; record(payload, ["kind"], ["resourceId", "artifact", "text", "exitCode", "toolName", "argumentsJson", "succeeded", "action", "sourceEvent", "decision", "principalId", "input", "reason"]);
  const ref = (input: unknown, kind?: string) => {
    record(input, kind ? ["kind", "id", kind === "artifact" ? "version" : "revision"] : ["id", "revision"]);
    assertIdentifierV2(input.id); assertRevisionV2(kind === "artifact" ? input.version : input.revision); if (kind && input.kind !== kind) invalid();
  };
  switch (payload.kind) {
    case "artifact": record(payload, ["kind", "resourceId", "artifact", "text"]); assertIdentifierV2(payload.resourceId); ref(payload.artifact, "artifact");
      if (typeof payload.text !== "string" || payload.text.length > 65_536) invalid(); break;
    case "deterministic-test": record(payload, ["kind", "resourceId", "exitCode"]); assertIdentifierV2(payload.resourceId);
      if (!Number.isSafeInteger(payload.exitCode) || (payload.exitCode as number) < 0 || (payload.exitCode as number) > 255) invalid(); break;
    case "tool-receipt": record(payload, ["kind", "toolName", "argumentsJson", "succeeded", "action", "sourceEvent"]);
      assertIdentifierV2(payload.toolName); assertTextV2(payload.argumentsJson); if (typeof payload.succeeded !== "boolean") invalid(); ref(payload.action, "action"); ref(payload.sourceEvent); break;
    case "user-confirmation": record(payload, ["kind", "decision", "principalId", "input"]); assertIdentifierV2(payload.principalId); ref(payload.input);
      if (!["accepted", "rejected"].includes(payload.decision as string)) invalid(); break;
    case "unknown": record(payload, ["kind", "reason"]); if (!["missing-evidence", "validator-unavailable", "validator-error", "incomplete", "model-only"].includes(payload.reason as string)) invalid(); break;
    default: invalid();
  }
}
