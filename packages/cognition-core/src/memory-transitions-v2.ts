import {
  assertMemoryCandidateV2, assertMemoryClaimV2, assertIdentifierV2, assertRevisionV2,
  assertIsoTimestampV2, assertEntityRefV2, sameScopeV2,
  type MemoryCandidateV2, type MemoryClaimV2, type EntityRefV2, type EvidenceRefV2,
  type ClaimVersionRefV2,
} from "../../domain/src/index.ts";
import {
  checkAdditionalEvidence, checkChange, checkEvidence, dataArray, exactObject, initialState, mergeEvidence, reject, requireState, snapshot,
  type CognitionChangeV2,
} from "./cognition-change-v2.ts";

/** Caller-supplied structured checks, never proof of producer identity or permission.
 * No automatic extraction/acceptance policy is implemented in this P1-01 boundary. */
export type CandidateAcceptanceV2 = Readonly<{
  kind: "user-confirmation";
  candidate: EntityRefV2<"candidate">;
  statement: string;
  checkedAt: string;
  evidence: EvidenceRefV2;
}> | Readonly<{
  kind: "structured-verification";
  candidate: EntityRefV2<"candidate">;
  statement: string;
  checkedAt: string;
  evidence: EvidenceRefV2;
  validator: EntityRefV2<"validator">;
}>;

export interface CandidateAcceptanceResultV2 {
  readonly candidate: MemoryCandidateV2;
  readonly claim: MemoryClaimV2;
  readonly acceptance: CandidateAcceptanceV2;
}
export interface ClaimCorrectionResultV2 {
  readonly previous: MemoryClaimV2;
  readonly current: MemoryClaimV2;
  readonly candidate: MemoryCandidateV2;
  readonly acceptance: CandidateAcceptanceV2;
}

export function createMemoryCandidate(input: MemoryCandidateV2): MemoryCandidateV2 {
  assertMemoryCandidateV2(input);
  initialState(input);
  requireState(input.status, "PENDING");
  if (input.expiresAt <= input.createdAt) reject("validation", "candidate_already_expired", "New candidate must not be expired");
  return snapshot(input);
}

export function transitionMemoryCandidate(candidate: MemoryCandidateV2, change: CognitionChangeV2,
  target: "REJECTED" | "EXPIRED"): MemoryCandidateV2 {
  assertMemoryCandidateV2(candidate);
  checkChange(candidate, change);
  requireState(candidate.status, "PENDING");
  if (target !== "REJECTED" && target !== "EXPIRED") reject("invalid_transition", "invalid_candidate_target", "Candidate target state is unsupported");
  if (target === "EXPIRED" && candidate.expiresAt > change.now) {
    reject("invalid_transition", "candidate_not_expired", "Candidate has not reached its expiry time");
  }
  const result = { ...candidate, status: target, revision: change.nextRevision, updatedAt: change.now };
  assertMemoryCandidateV2(result);
  return snapshot(result);
}

function checkAcceptance(candidate: MemoryCandidateV2, change: CognitionChangeV2, acceptance: CandidateAcceptanceV2): void {
  assertMemoryCandidateV2(candidate);
  checkChange(candidate, change);
  requireState(candidate.status, "PENDING");
  if (candidate.expiresAt <= change.now || (candidate.validUntil !== undefined && candidate.validUntil <= change.now)) {
    reject("invalid_transition", "candidate_expired", "Expired candidate cannot be accepted");
  }
  exactObject(acceptance, ["kind", "candidate", "statement", "checkedAt", "evidence"], ["validator"]);
  if (!["user-confirmation", "structured-verification"].includes(acceptance.kind)) {
    reject("evidence_invalid", "acceptance_required", "Acceptance requires an explicit confirmation or structured verification");
  }
  exactObject(acceptance, ["kind", "candidate", "statement", "checkedAt", "evidence"],
    acceptance.kind === "structured-verification" ? ["validator"] : []);
  assertEntityRefV2(acceptance.candidate);
  if (acceptance.candidate.kind !== "candidate" || acceptance.candidate.id !== candidate.id
    || acceptance.candidate.revision !== candidate.revision) {
    reject("revision_conflict", "acceptance_candidate_mismatch", "Acceptance must bind the exact candidate snapshot");
  }
  if (acceptance.statement !== candidate.statement) {
    reject("evidence_invalid", "acceptance_statement_mismatch", "Acceptance must verify the exact candidate statement");
  }
  assertIsoTimestampV2(acceptance.checkedAt);
  if (acceptance.checkedAt < candidate.updatedAt || acceptance.checkedAt > change.now) {
    reject("evidence_invalid", "acceptance_time_invalid", "Acceptance is stale or from the future");
  }
  checkEvidence(candidate, acceptance.evidence, acceptance.checkedAt,
    acceptance.kind === "user-confirmation" ? "user-direct" : "verified-tool");
  if (acceptance.evidence.role !== "supports") reject("evidence_invalid", "refutation_is_not_acceptance", "Refuting evidence cannot accept a candidate");
  if (acceptance.kind === "structured-verification") {
    assertEntityRefV2(acceptance.validator);
    if (acceptance.validator.kind !== "validator") reject("evidence_invalid", "invalid_validator", "Structured verification requires an exact validator reference");
  }
  if ((candidate.sourceTrust === "model-derived" || candidate.epistemic === "inferred")
    && (acceptance.evidence.observedAt < candidate.updatedAt
      || candidate.evidence.some(item => item.source.id === acceptance.evidence.source.id))) {
    reject("evidence_invalid", "independent_support_required", "Model inference requires a separate confirming observation");
  }
}

function accepted(candidate: MemoryCandidateV2, change: CognitionChangeV2, acceptance: CandidateAcceptanceV2,
  claimId: string, version: number, supersedes?: ClaimVersionRefV2, revision = 1): CandidateAcceptanceResultV2 {
  assertIdentifierV2(claimId);
  assertRevisionV2(version);
  const claim: MemoryClaimV2 = {
    schemaVersion: 2, id: claimId, revision, version, kind: candidate.kind,
    statement: candidate.statement, scope: candidate.scope, privacy: candidate.privacy,
    sourceTrust: acceptance.evidence.sourceTrust,
    epistemic: acceptance.kind === "user-confirmation" ? "asserted" : "verified",
    evidence: mergeEvidence(candidate.evidence, [acceptance.evidence]), status: "ACTIVE",
    validFrom: candidate.validFrom,
    ...(candidate.validUntil === undefined ? {} : { validUntil: candidate.validUntil }),
    ...(supersedes === undefined ? {} : { supersedes }),
    createdAt: change.now, updatedAt: change.now,
  };
  const next: MemoryCandidateV2 = { ...candidate, status: "ACCEPTED", revision: change.nextRevision,
    updatedAt: change.now, acceptedClaim: { claimId, version } };
  assertMemoryCandidateV2(next);
  assertMemoryClaimV2(claim);
  return snapshot({ candidate: next, claim, acceptance });
}

export function acceptMemoryCandidate(candidate: MemoryCandidateV2, change: CognitionChangeV2,
  claimId: string, acceptance: CandidateAcceptanceV2): CandidateAcceptanceResultV2 {
  checkAcceptance(candidate, change, acceptance);
  return accepted(candidate, change, acceptance, claimId, 1);
}

/** Returned snapshots must be committed together by the future store boundary.
 * Original content, evidence and validity remain available as history; no invalidation is performed here. */
export function correctMemoryClaim(current: MemoryClaimV2, change: CognitionChangeV2,
  expectedVersion: number, candidate: MemoryCandidateV2, candidateChange: CognitionChangeV2,
  acceptance: CandidateAcceptanceV2): ClaimCorrectionResultV2 {
  assertMemoryClaimV2(current);
  checkChange(current, change);
  assertRevisionV2(expectedVersion);
  if (expectedVersion !== current.version) reject("revision_conflict", "claim_version_mismatch", "Correction must bind the exact claim version");
  requireState(current.status, "ACTIVE", "DISPUTED");
  checkAcceptance(candidate, candidateChange, acceptance);
  if (acceptance.kind !== "user-confirmation") reject("evidence_invalid", "explicit_correction_required", "Correction requires an explicit user confirmation");
  if (change.now !== candidateChange.now) reject("validation", "correction_time_mismatch", "Correction and acceptance require the same recording time");
  if (!sameScopeV2(current.scope, candidate.scope)) reject("scope_conflict", "correction_scope_mismatch", "Correction must retain the original scope");
  if (current.privacy !== candidate.privacy || current.kind !== candidate.kind) {
    reject("validation", "correction_contract_mismatch", "Correction must retain the original privacy and claim kind");
  }
  if (acceptance.checkedAt < current.updatedAt || acceptance.evidence.observedAt < current.updatedAt) {
    reject("evidence_invalid", "stale_correction", "Correction evidence must not predate the current claim snapshot");
  }
  const nextVersion = current.version + 1;
  assertRevisionV2(nextVersion);
  const result = accepted(candidate, candidateChange, acceptance, current.id, nextVersion,
    { claimId: current.id, version: current.version }, change.nextRevision);
  const previous: MemoryClaimV2 = { ...current, status: "SUPERSEDED", revision: change.nextRevision,
    updatedAt: change.now, supersededBy: { claimId: current.id, version: nextVersion } };
  assertMemoryClaimV2(previous);
  return snapshot({ previous, current: result.claim, candidate: result.candidate, acceptance: result.acceptance });
}

export type ClaimLifecycleActionV2 =
  | Readonly<{ kind: "dispute"; evidence: readonly EvidenceRefV2[] }>
  | Readonly<{ kind: "expire" }>
  | Readonly<{ kind: "forget"; confirmation: EvidenceRefV2 }>;

export interface ClaimLifecycleTransitionV2 {
  readonly previous: MemoryClaimV2;
  readonly current: MemoryClaimV2;
  readonly action: ClaimLifecycleActionV2;
}

/** FORGOTTEN is an in-memory eligibility state only, not a claim that bytes were erased.
 * New lifecycle evidence lives in the action record; immutable version content is retained. */
export function transitionMemoryClaim(claim: MemoryClaimV2, change: CognitionChangeV2,
  expectedVersion: number, action: ClaimLifecycleActionV2): ClaimLifecycleTransitionV2 {
  assertMemoryClaimV2(claim);
  checkChange(claim, change);
  assertRevisionV2(expectedVersion);
  if (expectedVersion !== claim.version) reject("revision_conflict", "claim_version_mismatch", "Lifecycle change must bind the exact claim version");
  exactObject(action, ["kind"], ["evidence", "confirmation"]);
  let next: MemoryClaimV2;
  switch (action.kind) {
    case "dispute": {
      exactObject(action, ["kind", "evidence"]);
      requireState(claim.status, "ACTIVE");
      dataArray(action.evidence, 1);
      checkAdditionalEvidence(claim, claim.evidence, action.evidence, change.now);
      for (const evidence of action.evidence) {
        checkEvidence(claim, evidence, change.now);
        if (evidence.role !== "refutes") reject("evidence_invalid", "refutation_required", "Dispute evidence must be refuting");
      }
      next = { ...claim, status: "DISPUTED" };
      break;
    }
    case "expire":
      exactObject(action, ["kind"]);
      requireState(claim.status, "ACTIVE", "DISPUTED");
      if (claim.validUntil === undefined || claim.validUntil > change.now) reject("invalid_transition", "claim_not_expired", "Claim has not reached its validity end");
      next = { ...claim, status: "EXPIRED" };
      break;
    case "forget":
      exactObject(action, ["kind", "confirmation"]);
      requireState(claim.status, "ACTIVE", "DISPUTED", "SUPERSEDED", "EXPIRED");
      checkAdditionalEvidence(claim, claim.evidence, [action.confirmation], change.now);
      checkEvidence(claim, action.confirmation, change.now, "user-direct");
      if (action.confirmation.role !== "supports" || action.confirmation.observedAt < claim.updatedAt) {
        reject("evidence_invalid", "forget_confirmation_required", "Forgetting requires a current supporting user confirmation");
      }
      next = { ...claim, status: "FORGOTTEN" };
      break;
    default:
      reject("invalid_transition", "invalid_claim_target", "Claim target state is unsupported");
  }
  next = { ...next, revision: change.nextRevision, updatedAt: change.now };
  assertMemoryClaimV2(next);
  return snapshot({ previous: claim, current: next, action });
}
