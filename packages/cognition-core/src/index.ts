import {
  assertConfidence,
  assertEvidence,
  scopeKey,
  type IsoTimestamp,
  type MemoryCandidate,
  type MemoryClaim,
  type MemoryClaimId,
  type ObservationId,
} from "../../domain/src/index.ts";

export function acceptCandidate(
  candidate: MemoryCandidate,
  claimId: MemoryClaimId,
  now: IsoTimestamp,
): MemoryClaim {
  if (candidate.status !== "pending") {
    throw new Error("Only a pending candidate can be accepted");
  }
  assertEvidence(candidate.evidenceIds);
  assertConfidence(candidate.confidence);

  return Object.freeze({
    id: claimId,
    kind: candidate.kind,
    statement: candidate.statement.trim(),
    scope: candidate.scope,
    evidenceIds: Object.freeze([...candidate.evidenceIds]),
    confidence: candidate.confidence,
    status: "active" as const,
    validFrom: now,
    createdAt: now,
    updatedAt: now,
  });
}

export interface ClaimCorrection {
  readonly id: MemoryClaimId;
  readonly statement: string;
  readonly evidenceIds: readonly ObservationId[];
  readonly confidence: number;
  readonly now: IsoTimestamp;
}

export interface CorrectionResult {
  readonly previous: MemoryClaim;
  readonly current: MemoryClaim;
}

export function correctClaim(current: MemoryClaim, correction: ClaimCorrection): CorrectionResult {
  if (current.status !== "active") {
    throw new Error("Only an active claim can be corrected");
  }
  if (correction.statement.trim().length === 0) {
    throw new Error("Correction statement must not be empty");
  }
  assertEvidence(correction.evidenceIds);
  assertConfidence(correction.confidence);

  const previous: MemoryClaim = Object.freeze({
    ...current,
    status: "superseded" as const,
    validTo: correction.now,
    updatedAt: correction.now,
  });

  const replacement: MemoryClaim = Object.freeze({
    id: correction.id,
    kind: current.kind,
    statement: correction.statement.trim(),
    scope: current.scope,
    evidenceIds: Object.freeze([...correction.evidenceIds]),
    confidence: correction.confidence,
    status: "active" as const,
    supersedesId: current.id,
    validFrom: correction.now,
    createdAt: correction.now,
    updatedAt: correction.now,
  });

  if (scopeKey(previous.scope) !== scopeKey(replacement.scope)) {
    throw new Error("A correction must remain in the original scope");
  }

  return Object.freeze({ previous, current: replacement });
}
