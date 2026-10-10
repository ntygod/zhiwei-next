import {
  assertGoalV2, assertEntityRefV2, assertIsoTimestampV2, assertRevisionV2,
  type GoalV2, type EvidenceRefV2, type EntityRefV2, type AcceptanceCriterion,
} from "../../domain/src/index.ts";
import {
  checkAdditionalEvidence, checkChange, checkEvidence, checkUserEvidence, dataArray, exactObject, initialState, reject, requireState, snapshot,
  type CognitionChangeV2,
} from "./cognition-change-v2.ts";

/** A result binds a complete criterion snapshot and a specific Goal revision.
 * Supplied evidence is not proof that a verifier ran or that an action was authorized. */
export interface GoalCriterionResultV2 {
  readonly goal: EntityRefV2<"goal">;
  readonly criterion: AcceptanceCriterion;
  readonly status: "pass" | "fail" | "unknown" | "not-applicable";
  readonly evidence: readonly EvidenceRefV2[];
  readonly checkedAt: string;
  readonly validUntil: string;
}
export type GoalActionV2 =
  | Readonly<{ kind: "activate" | "pause" | "resume" | "abandon"; confirmation: EvidenceRefV2 }>
  | Readonly<{ kind: "achieve"; results: readonly GoalCriterionResultV2[] }>;
export interface GoalTransitionV2 {
  readonly previous: GoalV2;
  readonly current: GoalV2;
  readonly action: GoalActionV2;
}
export interface GoalRevisionV2 {
  readonly intent: string;
  readonly criteria: readonly AcceptanceCriterion[];
  readonly priority: "low" | "normal" | "high";
  readonly deadline?: string;
  readonly confirmation: EvidenceRefV2;
}
export interface GoalRevisionResultV2 {
  readonly previous: GoalV2;
  readonly current: GoalV2;
}

export function createGoal(input: GoalV2): GoalV2 {
  assertGoalV2(input);
  initialState(input);
  requireState(input.status, "PROPOSED");
  checkEvidence(input, input.confirmation, input.createdAt, "user-direct");
  if (input.confirmation.role !== "supports" || input.sourceTrust !== "user-direct") {
    reject("evidence_invalid", "goal_confirmation_required", "A goal requires supporting direct user evidence");
  }
  if (input.criteria.some(criterion => criterion.revision !== 1)) reject("revision_conflict", "new_criterion_revision", "New goal criteria must start at revision one");
  return snapshot(input);
}

function sameCriterion(left: AcceptanceCriterion, right: AcceptanceCriterion): boolean {
  return left.id === right.id && left.revision === right.revision && left.description === right.description
    && left.required === right.required && left.method === right.method;
}

function checkAchievement(goal: GoalV2, change: CognitionChangeV2, results: readonly GoalCriterionResultV2[]): void {
  dataArray(results);
  if (results.length !== goal.criteria.length) {
    reject("evidence_invalid", "incomplete_goal_results", "Every goal criterion requires one result");
  }
  const seen = new Set<string>();
  for (const result of results) {
    exactObject(result, ["goal", "criterion", "status", "evidence", "checkedAt", "validUntil"]);
    assertEntityRefV2(result.goal);
    if (result.goal.kind !== "goal" || result.goal.id !== goal.id || result.goal.revision !== goal.revision) {
      reject("revision_conflict", "goal_result_binding_mismatch", "Result must bind the exact goal snapshot");
    }
    exactObject(result.criterion, ["id", "revision", "description", "required", "method"]);
    const criterion = goal.criteria.find(item => item.id === result.criterion.id);
    if (!criterion || seen.has(criterion.id) || !sameCriterion(criterion, result.criterion)) {
      reject("evidence_invalid", "goal_criterion_mismatch", "Result must bind the unchanged, unique goal criterion");
    }
    seen.add(criterion.id);
    assertIsoTimestampV2(result.checkedAt);
    assertIsoTimestampV2(result.validUntil);
    if (result.checkedAt < goal.updatedAt || result.checkedAt > change.now
      || result.validUntil <= change.now || result.validUntil <= result.checkedAt) {
      reject("evidence_invalid", "goal_result_time_invalid", "Goal result is stale, expired or from the future");
    }
    dataArray(result.evidence);
    if (!["pass", "fail", "unknown", "not-applicable"].includes(result.status)) {
      reject("validation", "invalid_goal_result", "Goal result status or evidence is invalid");
    }
    checkAdditionalEvidence(goal, [goal.confirmation], result.evidence, result.checkedAt);
    if (result.status === "pass" || result.status === "fail") {
      const trust = criterion.method === "user-confirmation" ? "user-direct" : "verified-tool";
      if (criterion.method === "model-assisted" || !result.evidence.some(item => item.sourceTrust === trust && item.role === "supports")) {
        reject("evidence_invalid", "goal_result_unverified", "A pass or fail requires bounded independent verification evidence");
      }
    }
    if (criterion.required && result.status !== "pass") {
      reject("invalid_transition", "goal_criteria_not_met", "Required goal criteria are not all verified as passed");
    }
  }
}

export function transitionGoal(goal: GoalV2, change: CognitionChangeV2, action: GoalActionV2): GoalTransitionV2 {
  assertGoalV2(goal);
  checkChange(goal, change);
  exactObject(action, ["kind"], ["results", "confirmation"]);
  let status: GoalV2["status"];
  if (action.kind === "achieve") {
    exactObject(action, ["kind", "results"]);
    requireState(goal.status, "ACTIVE");
    checkAchievement(goal, change, action.results);
    status = "ACHIEVED";
  } else {
    exactObject(action, ["kind", "confirmation"]);
    checkAdditionalEvidence(goal, [goal.confirmation], [action.confirmation], change.now);
    checkUserEvidence(goal, action.confirmation, change.now);
    switch (action.kind) {
      case "activate": requireState(goal.status, "PROPOSED"); status = "ACTIVE"; break;
      case "pause": requireState(goal.status, "ACTIVE"); status = "PAUSED"; break;
      case "resume": requireState(goal.status, "PAUSED"); status = "ACTIVE"; break;
      case "abandon": requireState(goal.status, "PROPOSED", "ACTIVE", "PAUSED"); status = "ABANDONED"; break;
      default: reject("invalid_transition", "invalid_goal_target", "Goal target state is unsupported");
    }
  }
  const current: GoalV2 = { ...goal, status, revision: change.nextRevision, updatedAt: change.now };
  assertGoalV2(current);
  return snapshot({ previous: goal, current, action });
}

/** Revisions preserve history and return to PROPOSED for explicit activation.
 * Rechecking dependent tasks/invalidating their fences belongs to the later commit boundary. */
export function reviseGoal(goal: GoalV2, change: CognitionChangeV2, revision: GoalRevisionV2): GoalRevisionResultV2 {
  assertGoalV2(goal);
  checkChange(goal, change);
  requireState(goal.status, "PROPOSED", "ACTIVE", "PAUSED");
  exactObject(revision, ["intent", "criteria", "priority", "confirmation"], ["deadline"]);
  checkAdditionalEvidence(goal, [goal.confirmation], [revision.confirmation], change.now);
  checkUserEvidence(goal, revision.confirmation, change.now);
  const { deadline: _previousDeadline, ...retained } = goal;
  const current: GoalV2 = { ...retained, ...revision, sourceTrust: "user-direct", status: "PROPOSED",
    revision: change.nextRevision, updatedAt: change.now };
  assertGoalV2(current);
  for (const criterion of current.criteria) {
    const previous = goal.criteria.find(item => item.id === criterion.id);
    if (!previous && criterion.revision !== 1) reject("revision_conflict", "new_criterion_revision", "A new criterion must start at revision one");
    if (previous && !sameCriterion(previous, criterion)) {
      assertRevisionV2(previous.revision + 1);
      if (criterion.revision !== previous.revision + 1) {
        reject("revision_conflict", "criterion_revision_mismatch", "Changed criteria require the next exact revision");
      }
    }
  }
  return snapshot({ previous: goal, current });
}
