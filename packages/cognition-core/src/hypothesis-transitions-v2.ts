import {
  assertHypothesisV2, assertRevisionV2,
  type HypothesisV2, type EvidenceRefV2,
} from "../../domain/src/index.ts";
import {
  checkAdditionalEvidence, checkChange, checkEvidence, dataArray, exactObject, initialState, reject, requireState, snapshot,
  type CognitionChangeV2,
} from "./cognition-change-v2.ts";

export type HypothesisActionV2 =
  | Readonly<{ kind: "support" | "refute"; evidence: readonly EvidenceRefV2[] }>
  | Readonly<{ kind: "expire" }>
  | Readonly<{ kind: "withdraw"; confirmation: EvidenceRefV2 }>;

export function createHypothesis(input: HypothesisV2): HypothesisV2 {
  assertHypothesisV2(input);
  initialState(input);
  requireState(input.status, "OPEN");
  if (input.version !== 1 || input.expiresAt <= input.createdAt) {
    reject("validation", "invalid_initial_hypothesis", "New hypothesis must start at version one and must not be expired");
  }
  return snapshot(input);
}

export interface HypothesisTransitionV2 {
  readonly previous: HypothesisV2;
  readonly current: HypothesisV2;
  readonly action: HypothesisActionV2;
}

/** SUPPORTED remains inferred. This function cannot produce a Claim or a permission. */
export function transitionHypothesis(hypothesis: HypothesisV2, change: CognitionChangeV2,
  expectedVersion: number, action: HypothesisActionV2): HypothesisTransitionV2 {
  assertHypothesisV2(hypothesis);
  checkChange(hypothesis, change);
  assertRevisionV2(expectedVersion);
  if (expectedVersion !== hypothesis.version) reject("revision_conflict", "hypothesis_version_mismatch", "Change must bind the exact hypothesis version");
  requireState(hypothesis.status, "OPEN");
  exactObject(action, ["kind"], ["evidence", "confirmation"]);
  let next: HypothesisV2;
  switch (action.kind) {
    case "support":
    case "refute": {
      exactObject(action, ["kind", "evidence"]);
      if (hypothesis.expiresAt <= change.now) reject("invalid_transition", "hypothesis_expired", "Expired hypothesis cannot receive a finding");
      dataArray(action.evidence, 1);
      checkAdditionalEvidence(hypothesis, hypothesis.evidence, action.evidence, change.now);
      for (const evidence of action.evidence) {
        checkEvidence(hypothesis, evidence, change.now);
        if (evidence.role !== (action.kind === "support" ? "supports" : "refutes")
          || !["user-direct", "verified-tool"].includes(evidence.sourceTrust)
          || evidence.observedAt < hypothesis.updatedAt
          || hypothesis.evidence.some(existing => existing.source.id === evidence.source.id)) {
          reject("evidence_invalid", "independent_finding_required", "Finding must add current independent, appropriately directed evidence");
        }
      }
      next = { ...hypothesis, status: action.kind === "support" ? "SUPPORTED" : "REFUTED" };
      break;
    }
    case "expire":
      exactObject(action, ["kind"]);
      if (hypothesis.expiresAt > change.now) reject("invalid_transition", "hypothesis_not_expired", "Hypothesis has not reached its expiry time");
      next = { ...hypothesis, status: "EXPIRED" };
      break;
    case "withdraw":
      exactObject(action, ["kind", "confirmation"]);
      checkAdditionalEvidence(hypothesis, hypothesis.evidence, [action.confirmation], change.now);
      checkEvidence(hypothesis, action.confirmation, change.now, "user-direct");
      if (action.confirmation.role !== "supports" || action.confirmation.observedAt < hypothesis.updatedAt) {
        reject("evidence_invalid", "withdraw_confirmation_required", "Withdrawal requires a current user confirmation");
      }
      next = { ...hypothesis, status: "WITHDRAWN" };
      break;
    default:
      reject("invalid_transition", "invalid_hypothesis_target", "Hypothesis target state is unsupported");
  }
  next = { ...next, revision: change.nextRevision, updatedAt: change.now };
  assertHypothesisV2(next);
  return snapshot({ previous: hypothesis, current: next, action });
}
