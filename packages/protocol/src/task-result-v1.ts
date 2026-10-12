import {
  assertCriterionCheckV1, assertCriterionObservationV1, assertOutcomeVerificationPlanV1, assertMemoryUseV1, assertEpisodeV2,
  type CriterionCheckV1, type CriterionObservationV1, type OutcomeVerificationPlanV1, type MemoryAdoptionCheckV1, type TaskResultBundleV1,
} from "../../domain/src/index.ts";
import { canonicalJsonV1 } from "./lossless-json.ts";
import { parseSessionTaskV1 } from "./session-api-v1.ts";
import { decodeWireJson, identifier, keys, list, member, object, revision, unique, version, wireBoundary } from "./cognitive-wire.ts";

export interface OutcomePlanCommandV1 {
  readonly schemaVersion: 1;
  readonly commandId: string;
  readonly idempotencyKey: string;
  readonly workspaceId: string;
  readonly taskId: string;
  readonly expectedRevision: number;
  readonly checks: readonly CriterionCheckV1[];
  readonly adoptionChecks: readonly MemoryAdoptionCheckV1[];
}
export interface OutcomeVerifyCommandV1 {
  readonly schemaVersion: 1;
  readonly commandId: string;
  readonly idempotencyKey: string;
  readonly workspaceId: string;
  readonly taskId: string;
  readonly expectedRevision: number;
}
export interface OutcomeFeedbackCommandV1 extends OutcomeVerifyCommandV1 {
  readonly attemptId: string;
  readonly intentRevision: number;
  readonly outcomeId: string;
  readonly outcomeRevision: number;
  readonly criterionId: string;
  readonly criterionRevision: number;
  readonly decision: "accepted" | "rejected";
}
const commandFields = ["schemaVersion", "commandId", "idempotencyKey", "workspaceId", "taskId", "expectedRevision"];
function command(value: Record<string, unknown>): void {
  version(value.schemaVersion, 1); for (const key of ["commandId", "idempotencyKey", "workspaceId", "taskId"]) identifier(value[key]); revision(value.expectedRevision);
}
/** Inner JSON is also a wire value: duplicate keys are not silently resolved. */
function checkJson(check: CriterionCheckV1 | MemoryAdoptionCheckV1): void {
  if ("format" in check && check.format === "json-equals") decodeWireJson(check.expectedText);
  if ("argumentsJson" in check) decodeWireJson(check.argumentsJson);
  if ("expectedJson" in check) decodeWireJson(check.expectedJson);
}
export function parseOutcomePlanCommandV1(input: unknown): OutcomePlanCommandV1 {
  return wireBoundary(input, value => {
    keys(value, [...commandFields, "checks", "adoptionChecks"]); command(value);
    const checks = list(value.checks, 100, 1); for (const check of checks) { assertCriterionCheckV1(check); checkJson(check); }
    unique(checks.map(item => (item as CriterionCheckV1).criterionId));
    const adoptionChecks = list(value.adoptionChecks);
    // Reuse the formal plan validator for the exact adoption/check shapes and bindings.
    const temporary = { schemaVersion: 1, id: value.commandId, workspaceId: value.workspaceId,
      task: { kind: "task", id: value.taskId, revision: value.expectedRevision }, taskAttempt: { taskId: value.taskId, attemptId: "syntax-only", intentRevision: 1 },
      criteria: checks.map((item, index) => { const check = item as CriterionCheckV1; return { id: check.criterionId, revision: check.criterionRevision, description: "Declared syntax check", required: index === 0, method: check.kind }; }),
      verifier: { id: "outcome-verifier-v1", revision: 1 }, checks, adoptionChecks, createdAt: "2000-01-01T00:00:00.000Z" };
    assertOutcomeVerificationPlanV1(temporary); for (const check of adoptionChecks) checkJson(check as MemoryAdoptionCheckV1);
    return value as unknown as OutcomePlanCommandV1;
  });
}
export function parseOutcomeVerifyCommandV1(input: unknown): OutcomeVerifyCommandV1 {
  return wireBoundary(input, value => { keys(value, commandFields); command(value); return value as unknown as OutcomeVerifyCommandV1; });
}
export function parseOutcomeFeedbackCommandV1(input: unknown): OutcomeFeedbackCommandV1 {
  return wireBoundary(input, value => {
    keys(value, [...commandFields, "attemptId", "intentRevision", "outcomeId", "outcomeRevision", "criterionId", "criterionRevision", "decision"]); command(value);
    for (const key of ["attemptId", "outcomeId", "criterionId"]) identifier(value[key]);
    for (const key of ["intentRevision", "outcomeRevision", "criterionRevision"]) revision(value[key]); member(value.decision, ["accepted", "rejected"]);
    return value as unknown as OutcomeFeedbackCommandV1;
  });
}
export function parseOutcomeVerificationPlanV1(input: unknown): OutcomeVerificationPlanV1 {
  return wireBoundary(input, value => { version(value.schemaVersion, 1); assertOutcomeVerificationPlanV1(value); for (const check of [...value.checks, ...value.adoptionChecks]) checkJson(check); return value; });
}
export function parseCriterionObservationV1(input: unknown): CriterionObservationV1 {
  return wireBoundary(input, value => { version(value.schemaVersion, 1); assertCriterionObservationV1(value);
    if (value.payload.kind === "tool-receipt") decodeWireJson(value.payload.argumentsJson); return value; });
}
export function parseTaskResultBundleV1(input: unknown): TaskResultBundleV1 {
  return wireBoundary(input, value => {
    keys(value, ["schemaVersion", "task", "outcome", "episode", "observations", "memoryUses", "learning"]); version(value.schemaVersion, 1);
    const task = parseSessionTaskV1(value.task), attempt = task.attempts.at(-1)!;
    const outcome = object(value.outcome), latest = attempt.outcomes.at(-1);
    if (!latest || canonicalJsonV1(outcome) !== canonicalJsonV1(latest)) throw new TypeError("Result does not match its Task.");
    assertEpisodeV2(value.episode); const episode = value.episode;
    if (episode.task.id !== task.id || episode.task.revision !== task.revision || episode.taskAttempt.attemptId !== attempt.id
      || episode.taskAttempt.intentRevision !== attempt.intent.revision || episode.scope.kind !== "task" || episode.scope.workspaceId !== task.workspaceId
      || episode.scope.taskId !== task.id || episode.outcome.id !== latest.id || episode.outcome.revision !== latest.revision || episode.outcomeStatus !== latest.status
      || canonicalJsonV1(episode.intent) !== canonicalJsonV1(attempt.intent)) throw new TypeError("Episode binding mismatch.");
    const observations = list(value.observations).map(parseCriterionObservationV1); unique(observations.map(item => item.id));
    for (const observation of observations) if (observation.taskId !== task.id || observation.attemptId !== attempt.id
      || observation.workspaceId !== task.workspaceId || observation.intentRevision !== attempt.intent.revision) throw new TypeError("Observation binding mismatch.");
    const uses = list(value.memoryUses); for (const use of uses) {
      assertMemoryUseV1(use); if (use.taskAttempt.taskId !== task.id || use.taskAttempt.attemptId !== attempt.id || use.taskAttempt.intentRevision !== attempt.intent.revision
        || use.workspaceId !== task.workspaceId || use.outcome.id !== latest.id || use.outcome.revision !== latest.revision) throw new TypeError("Use binding mismatch.");
    }
    unique(uses.map(use => (use as { id: string }).id)); member(value.learning, ["not-scheduled"]); return value as unknown as TaskResultBundleV1;
  });
}
export const deserializeOutcomePlanCommandV1 = (input: string): OutcomePlanCommandV1 => parseOutcomePlanCommandV1(decodeWireJson(input));
export const deserializeOutcomeVerifyCommandV1 = (input: string): OutcomeVerifyCommandV1 => parseOutcomeVerifyCommandV1(decodeWireJson(input));
export const deserializeOutcomeFeedbackCommandV1 = (input: string): OutcomeFeedbackCommandV1 => parseOutcomeFeedbackCommandV1(decodeWireJson(input));
