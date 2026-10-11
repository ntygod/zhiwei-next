import { createMemoryCandidate, acceptMemoryCandidate, correctMemoryClaim, transitionMemoryClaim, qualifyMemoryClaimV2 } from "../../../../packages/cognition-core/src/index.ts";
import type { MemoryCandidateV2 } from "../../../../packages/domain/src/index.ts";
import type { MemoryPersistenceBoundaryV1, MemoryReductionInputV1, MemoryReductionV1 } from "../../../../packages/memory-store/src/index.ts";

export const reduceExplicitMemory: MemoryPersistenceBoundaryV1["reduce"] = (input: MemoryReductionInputV1): MemoryReductionV1 => {
  const { command, current, confirmation, now } = input;
  if (command.payload.kind === "memory.dispute") {
    if (!current) throw new Error("Missing exact memory version.");
    const change = transitionMemoryClaim(current, { expectedRevision: current.revision, nextRevision: current.revision + 1, now }, command.payload.targetVersion.version,
      { kind: "dispute", evidence: [...command.payload.evidenceRefs, { ...confirmation, role: "refutes" }] });
    return { kind: "dispute", previous: change.previous, current: change.current };
  }
  if (command.payload.kind !== "memory.remember" && command.payload.kind !== "memory.correct") throw new Error("Unsupported memory reduction.");
  const payload = command.payload;
  const pending: MemoryCandidateV2 = createMemoryCandidate({ schemaVersion: 2, id: input.candidateId, revision: 1,
    scope: payload.scope, privacy: payload.privacy, kind: payload.claimKind, statement: payload.statement,
    sourceTrust: "user-direct", epistemic: "asserted", confidence: 1, evidence: [...payload.evidenceRefs, confirmation],
    extractor: { kind: "extractor", id: "explicit-user-memory-v1", revision: 1 }, status: "PENDING",
    validFrom: payload.validFrom, ...(payload.validUntil === undefined ? {} : { validUntil: payload.validUntil }),
    expiresAt: new Date(Date.parse(now) + 600_000).toISOString(), createdAt: now, updatedAt: now });
  const candidateChange = { expectedRevision: 1, nextRevision: 2, now };
  const acceptance = { kind: "user-confirmation" as const, candidate: { kind: "candidate" as const, id: pending.id, revision: 1 }, statement: pending.statement, checkedAt: now, evidence: confirmation };
  if (payload.kind === "memory.correct") {
    if (!current) throw new Error("Missing exact memory version.");
    const result = correctMemoryClaim(current, { expectedRevision: current.revision, nextRevision: current.revision + 1, now },
      payload.targetVersion.version, pending, candidateChange, acceptance);
    return { kind: "accept", pending, accepted: result.candidate, claim: result.current };
  }
  const result = acceptMemoryCandidate(pending, candidateChange, input.claimId, acceptance);
  return { kind: "accept", pending, accepted: result.candidate, claim: result.claim };
};
export const qualifiesExplicitMemory: MemoryPersistenceBoundaryV1["qualifies"] = (claim, query, audience, now) =>
  qualifyMemoryClaimV2(claim, { scope: query.scope, audience, kinds: query.kinds, validAt: query.validAt ?? now, knownAt: query.knownAt ?? now }) === "eligible";
