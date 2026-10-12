import {
  assertOutcomeVerificationPlanV1, assertCriterionObservationV1, assertEpisodeV2, assertTaskTime, assertMemoryClaimV2, sameTaskIntent,
  type OutcomeVerificationPlanV1, type CriterionObservationV1, type CriterionResult, type Task, type TaskAttempt,
  type EpisodeV2, type EvidenceRefV2, type EntityRefV2, type VersionRefV2, type MemoryClaimV2, type MemoryAdoptionCheckV1, type MemoryUseV1, type TaskEvidenceRef,
} from "../../domain/src/index.ts";

function immutable<T>(value: T): T {
  if (Array.isArray(value)) return Object.freeze(value.map(immutable)) as T;
  if (value && typeof value === "object") return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, immutable(item)]))) as T;
  return value;
}
function canonical(value: unknown, depth = 0): string {
  if (depth > 32) throw new Error("Verification JSON exceeds its declared bound.");
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(item => canonical(item, depth + 1)).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key], depth + 1)}`).join(",")}}`;
  throw new Error("Verification JSON is invalid.");
}
/** Pure checks of already authenticated observations. It never runs a validator or grants a read. */
export function evaluateCriterionObservationsV1(attempt: TaskAttempt, plan: OutcomeVerificationPlanV1,
  observations: readonly CriterionObservationV1[], now: string): readonly CriterionResult[] {
  assertOutcomeVerificationPlanV1(plan); assertTaskTime(now);
  if (plan.workspaceId !== attempt.workspaceId || plan.task.id !== attempt.taskId || plan.taskAttempt.attemptId !== attempt.id
    || plan.taskAttempt.intentRevision !== attempt.intent.revision || plan.createdAt < attempt.createdAt || plan.createdAt > now
    || !sameTaskIntent({ ...attempt.intent, criteria: plan.criteria }, attempt.intent)) throw new Error("Verification plan does not match its attempt.");
  const byCriterion = new Map<string, CriterionObservationV1>(), ids = new Set<string>();
  for (const observation of observations) {
    assertCriterionObservationV1(observation);
    const criterion = plan.criteria.find(item => item.id === observation.criterionId);
    if (!criterion || byCriterion.has(observation.criterionId) || ids.has(observation.id) || observation.workspaceId !== attempt.workspaceId
      || observation.taskId !== attempt.taskId || observation.attemptId !== attempt.id || observation.intentRevision !== attempt.intent.revision
      || observation.criterionRevision !== criterion.revision || observation.observedAt < attempt.createdAt || observation.observedAt > now
      || observation.notAfter <= now) throw new Error("Verification observation binding or freshness mismatch.");
    byCriterion.set(observation.criterionId, observation); ids.add(observation.id);
  }
  return immutable(plan.criteria.map(criterion => {
    const check = plan.checks.find(item => item.criterionId === criterion.id)!, observation = byCriterion.get(criterion.id), payload = observation?.payload;
    const base = { taskId: attempt.taskId, attemptId: attempt.id, workspaceId: attempt.workspaceId, intentRevision: attempt.intent.revision,
      criterionId: criterion.id, criterionRevision: criterion.revision, method: criterion.method, checkedAt: observation?.observedAt ?? now,
      evidence: observation ? [{ id: observation.id, revision: 1 }] : [] };
    const unknown = (reason: Extract<CriterionResult, { status: "unknown" }>["reason"], explanation: string): CriterionResult => ({ ...base, status: "unknown", reason, explanation });
    if (!payload) return unknown("missing-evidence", "No independent observation is available for this criterion.");
    if (payload.kind === "unknown") return unknown(payload.reason, "The declared checker did not obtain a verifiable result.");
    if (criterion.method === "model-assisted") return unknown("model-only", "Model judgment cannot independently verify this criterion.");
    if (payload.kind !== check.kind) throw new Error("Observation method does not match the declared checker.");
    let passed: boolean;
    switch (payload.kind) {
      case "artifact": {
        if (check.kind !== "artifact" || payload.resourceId !== check.resourceId) throw new Error("Artifact identity mismatch.");
        if (check.format === "text-equals") passed = payload.text === check.expectedText;
        else { try { passed = canonical(JSON.parse(payload.text)) === canonical(JSON.parse(check.expectedText)); }
          catch { return unknown("validator-error", "Artifact JSON could not be checked against the declared content."); } } break;
      }
      case "deterministic-test": if (check.kind !== "deterministic-test" || payload.resourceId !== check.resourceId) throw new Error("Test identity mismatch."); passed = payload.exitCode === 0; break;
      case "tool-receipt": if (check.kind !== "tool-receipt" || payload.toolName !== check.toolName) throw new Error("Tool identity mismatch.");
        passed = payload.succeeded && canonical(JSON.parse(payload.argumentsJson)) === canonical(JSON.parse(check.argumentsJson)); break;
      case "user-confirmation": if (check.kind !== "user-confirmation") throw new Error("Confirmation does not match its subjective criterion."); passed = payload.decision === "accepted"; break;
    }
    return { ...base, status: passed ? "pass" : "fail", validUntil: observation!.notAfter,
      explanation: passed ? "The declared criterion is supported by this exact observation." : "The exact observation does not satisfy the declared criterion." } satisfies CriterionResult;
  }));
}

/** Reuse only still-current observations; expired evidence becomes an explicit unknown check. */
export function currentCriterionObservationsV1(input: readonly CriterionObservationV1[], now: string): readonly CriterionObservationV1[] {
  assertTaskTime(now); return immutable(input.filter(observation => { assertCriterionObservationV1(observation); return observation.notAfter > now; }));
}

export function buildResultEpisodeV1(input: Readonly<{
  id: string; task: Task; previous?: EpisodeV2; endedAt: string; recordedAt: string; privacy: EpisodeV2["privacy"];
  evidence: readonly EvidenceRefV2[]; actions: readonly EntityRefV2<"action">[]; artifacts: readonly VersionRefV2<"artifact">[];
  contextDifferences: readonly string[]; unresolved: readonly string[];
}>): EpisodeV2 {
  const attempt = input.task.attempts.at(-1)!, outcome = attempt.outcomes.at(-1); if (!outcome) throw new Error("Episode requires a committed result decision.");
  const previous = input.previous;
  if (previous && (previous.id !== input.id || previous.taskAttempt.attemptId !== attempt.id || previous.taskAttempt.taskId !== input.task.id
    || previous.intent.revision !== attempt.intent.revision || previous.startedAt !== attempt.createdAt || previous.endedAt !== input.endedAt)) throw new Error("Episode history binding changed.");
  const episode: EpisodeV2 = { schemaVersion: 2, id: input.id, revision: (previous?.revision ?? 0) + 1, version: (previous?.version ?? 0) + 1,
    scope: { kind: "task", workspaceId: input.task.workspaceId, taskId: input.task.id }, privacy: input.privacy, sourceTrust: "verified-tool",
    createdAt: previous?.createdAt ?? input.recordedAt, updatedAt: input.recordedAt,
    task: { kind: "task", id: input.task.id, revision: input.task.revision }, taskAttempt: { taskId: input.task.id, attemptId: attempt.id, intentRevision: attempt.intent.revision },
    intent: attempt.intent, startedAt: attempt.createdAt, endedAt: input.endedAt, contextDifferences: input.contextDifferences,
    actions: input.actions, artifacts: input.artifacts, outcome: { kind: "outcome", id: outcome.id, revision: outcome.revision }, outcomeStatus: outcome.status,
    unresolved: [...input.unresolved, ...outcome.criteriaResults.filter(result => result.status !== "pass" && result.status !== "not-applicable").map(result => `${result.criterionId}: ${result.status}`)], evidence: input.evidence };
  assertEpisodeV2(episode); return immutable(episode);
}

/** This finite synthetic rule proves a recorded parameter match, not general causal attribution. */
export function deriveMemoryAdoptionV1(input: Readonly<{
  claim: MemoryClaimV2; check?: MemoryAdoptionCheckV1; observations: readonly CriterionObservationV1[]; now: string; claimedStep?: TaskEvidenceRef;
}>): MemoryUseV1["adoption"] {
  const { claim, check } = input; assertMemoryClaimV2(claim); assertTaskTime(input.now);
  if (check && check.profile === "synthetic-parameter-v1" && check.material.id === claim.id && check.material.revision === claim.revision && check.material.version === claim.version
    && claim.kind === "constraint" && claim.status === "ACTIVE"
    && claim.validFrom <= input.now && (!claim.validUntil || claim.validUntil > input.now)
    && claim.statement === `SYNTHETIC_ONLY: parameter ${check.parameter} = ${check.expectedJson}`) {
    for (const observation of input.observations) {
      assertCriterionObservationV1(observation); const payload = observation.payload;
      if (observation.notAfter <= input.now || observation.observedAt > input.now || claim.scope.kind === "global"
        || observation.workspaceId !== claim.scope.workspaceId || claim.scope.kind === "task" && observation.taskId !== claim.scope.taskId) continue;
      if (payload.kind !== "tool-receipt" || !payload.succeeded || payload.toolName !== check.toolName) continue;
      const argumentsValue: unknown = JSON.parse(payload.argumentsJson);
      if (argumentsValue && typeof argumentsValue === "object" && Object.hasOwn(argumentsValue, check.parameter)
        && canonical((argumentsValue as Record<string, unknown>)[check.parameter]) === canonical(JSON.parse(check.expectedJson))) {
        return immutable({ status: "verified", step: payload.sourceEvent, action: payload.action, parameter: check.parameter, evidence: { id: observation.id, revision: 1 } });
      }
    }
  }
  return input.claimedStep ? immutable({ status: "claimed", step: input.claimedStep }) : Object.freeze({ status: "unknown" });
}
