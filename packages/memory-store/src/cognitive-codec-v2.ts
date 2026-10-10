import {
  assertMemoryClaimV2,
  assertMemoryCandidateV2,
  assertHypothesisV2,
  assertGoalV2,
  assertEpisodeV2,
  assertWorkingStateV2,
  assertIdentifierV2,
  assertRevisionV2,
  assertScopeV2,
  assertPrivacyV2,
  assertSourceTrustV2,
  assertIsoTimestampV2,
  assertEvidenceForScopeV2,
  assertClaimVersionRefV2,
  domainErrorV2,
  DomainValidationErrorV2,
  type ClaimStatusV2,
  type ClaimVersionRefV2,
  type CandidateStatusV2,
  type HypothesisStatusV2,
  type GoalStatusV2,
  type EvidenceRefV2,
  type MemoryCandidateV2,
  type MemoryClaimV2,
  type HypothesisV2,
  type GoalV2,
  type EpisodeV2,
  type WorkingStateV2,
  type PrivacyV2,
  type ScopeV2,
  type SourceTrustV2,
} from "../../domain/src/index.ts";
import {
  CognitiveProtocolError,
  parseNormalizedRuntimeEventV1,
  parseObservationV2,
  snapshotJsonValue,
  type ObservationV2,
} from "../../protocol/src/index.ts";

/** Only controlled identities/enums and evidence metadata belong in immutable SQL metadata. */
export type ClaimMetadataV2 = Omit<MemoryClaimV2,
  "statement" | "status" | "revision" | "updatedAt" | "supersededBy">;

export interface ClaimLifecycleV2 {
  readonly status: ClaimStatusV2;
  readonly revision: number;
  readonly updatedAt: string;
  readonly supersededByVersion?: number;
}

export interface SplitClaimV2 extends ClaimLifecycleV2 {
  readonly metadata: ClaimMetadataV2;
  /** Sensitive body: the caller stores this in the managed content layer, never metadata JSON. */
  readonly statement: string;
}

const METADATA_REQUIRED = ["schemaVersion", "id", "version", "scope", "privacy", "sourceTrust",
  "createdAt", "kind", "epistemic", "evidence", "validFrom"];
const METADATA_OPTIONAL = ["validUntil", "supersedes"];

function invalidClaimShape(): never {
  throw new DomainValidationErrorV2(domainErrorV2(
    "validation", "invalid_claim_storage_shape", "The claim storage contract is invalid.",
  ));
}

function freeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

function recordSnapshot(input: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  const value = snapshotJsonValue(input);
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || required.some(key => !Object.hasOwn(value, key))
    || Object.keys(value).some(key => !required.includes(key) && !optional.includes(key))) invalidClaimShape();
  return value as Record<string, unknown>;
}

function claimBoundary<T>(operation: () => T): T {
  try { return operation(); }
  catch (error) {
    if (error instanceof DomainValidationErrorV2) throw error;
    // JSON snapshot diagnostics can contain arbitrary input keys. Never expose them here.
    return invalidClaimShape();
  }
}

/** Validate before serialization; valid domain snapshots may share an in-memory Scope object. */
export function splitClaimV2(input: unknown): SplitClaimV2 {
  return claimBoundary(() => {
    assertMemoryClaimV2(input);
    // Exact domain validation rejects accessors/toJSON/extra fields before JSON.stringify.
    // JSON round-tripping intentionally detaches aliases before the canonical JSON snapshot.
    const claim = snapshotJsonValue(JSON.parse(JSON.stringify(input))) as unknown as MemoryClaimV2;
    const { statement, status, revision, updatedAt, supersededBy, ...metadata } = claim;
    return freeze({
      metadata, statement, status, revision, updatedAt,
      ...(supersededBy === undefined ? {} : { supersededByVersion: supersededBy.version }),
    });
  });
}

/** Reconstruct only a complete, available body. Revoked/unavailable reads must not call this. */
export function hydrateClaimV2(metadata: unknown, statement: unknown, lifecycle: ClaimLifecycleV2): MemoryClaimV2 {
  return claimBoundary(() => {
    const stored = recordSnapshot(metadata, METADATA_REQUIRED, METADATA_OPTIONAL);
    const current = recordSnapshot(lifecycle, ["status", "revision", "updatedAt"], ["supersededByVersion"]);
    const claim = {
      ...stored, statement, status: current.status, revision: current.revision, updatedAt: current.updatedAt,
      ...(Object.hasOwn(current, "supersededByVersion")
        ? { supersededBy: { claimId: stored.id, version: current.supersededByVersion } }
        : {}),
    };
    assertMemoryClaimV2(claim);
    return freeze(snapshotJsonValue(claim) as unknown as MemoryClaimV2);
  });
}

export type CognitiveRecordKindV2 = "candidate" | "hypothesis" | "goal" | "episode" | "working-state";
export interface CognitiveRecordByKindV2 {
  readonly candidate: MemoryCandidateV2;
  readonly hypothesis: HypothesisV2;
  readonly goal: GoalV2;
  readonly episode: EpisodeV2;
  readonly "working-state": WorkingStateV2;
}
export type CognitiveRecordV2 = CognitiveRecordByKindV2[CognitiveRecordKindV2];

/**
 * Minimal SQL projection. All other fields, including any free-text keys or nested bodies,
 * belong exclusively to the managed content file containing the entire canonical DTO.
 */
export interface CognitiveRecordMetadataV2 {
  readonly kind: CognitiveRecordKindV2;
  readonly id: string;
  /** Aggregate revision identifies the persisted snapshot, not an immutable content version. */
  readonly revision: number;
  /** null for records that have no domain content-version coordinate. */
  readonly version: number | null;
  readonly scope: ScopeV2;
  readonly privacy: PrivacyV2;
  readonly sourceTrust: SourceTrustV2;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly status: CandidateStatusV2 | HypothesisStatusV2 | GoalStatusV2 | null;
  readonly evidence: readonly EvidenceRefV2[];
  /** Exact accepted Claim content identity survives candidate body purge; otherwise null. */
  readonly acceptedClaim: ClaimVersionRefV2 | null;
}

const RECORD_METADATA_KEYS = ["kind", "id", "revision", "version", "scope", "privacy", "sourceTrust",
  "createdAt", "updatedAt", "status", "evidence", "acceptedClaim"];

function invalidRecordMetadata(): never {
  throw new DomainValidationErrorV2(domainErrorV2(
    "validation", "invalid_cognitive_record_metadata", "The cognitive record metadata is invalid.",
  ));
}

/**
 * Validate the retained projection without reading or fabricating a purged body.
 * Full-body-only invariants (for example expiry or exact task bindings) stay with the DTO parser.
 */
export function parseCognitiveRecordMetadataV2(input: unknown): CognitiveRecordMetadataV2 {
  try {
    const snapshot = snapshotJsonValue(input);
    if (snapshot === null || typeof snapshot !== "object" || Array.isArray(snapshot)
      || RECORD_METADATA_KEYS.some(key => !Object.hasOwn(snapshot, key))
      || Object.keys(snapshot).some(key => !RECORD_METADATA_KEYS.includes(key))) invalidRecordMetadata();
    const value = snapshot as Record<string, unknown>;
    if (typeof value.kind !== "string"
      || !["candidate", "hypothesis", "goal", "episode", "working-state"].includes(value.kind)) invalidRecordMetadata();
    assertIdentifierV2(value.id); assertRevisionV2(value.revision);
    assertScopeV2(value.scope); assertPrivacyV2(value.privacy); assertSourceTrustV2(value.sourceTrust);
    assertIsoTimestampV2(value.createdAt); assertIsoTimestampV2(value.updatedAt);
    if (value.updatedAt < value.createdAt) invalidRecordMetadata();
    if (value.kind === "hypothesis" || value.kind === "episode") {
      assertRevisionV2(value.version);
      if (value.version > value.revision) invalidRecordMetadata();
    } else if (value.version !== null) invalidRecordMetadata();
    const statuses = value.kind === "candidate" ? ["PENDING", "ACCEPTED", "REJECTED", "EXPIRED"]
      : value.kind === "hypothesis" ? ["OPEN", "SUPPORTED", "REFUTED", "EXPIRED", "WITHDRAWN"]
      : value.kind === "goal" ? ["PROPOSED", "ACTIVE", "PAUSED", "ACHIEVED", "ABANDONED"] : null;
    if (statuses === null ? value.status !== null : typeof value.status !== "string" || !statuses.includes(value.status)) invalidRecordMetadata();
    if (value.kind === "candidate" && value.status === "ACCEPTED") assertClaimVersionRefV2(value.acceptedClaim);
    else if (value.acceptedClaim !== null) invalidRecordMetadata();
    if ((value.kind === "episode" || value.kind === "working-state") && value.scope.kind === "global") invalidRecordMetadata();
    assertEvidenceForScopeV2(value.evidence, value.scope, value.privacy, value.updatedAt);
    if (value.kind === "goal" && (value.evidence.length !== 1 || value.sourceTrust !== "user-direct"
      || value.evidence[0].sourceTrust !== "user-direct" || value.evidence[0].role !== "supports")) invalidRecordMetadata();
    return freeze(snapshot as unknown as CognitiveRecordMetadataV2);
  } catch (error) {
    if (error instanceof DomainValidationErrorV2) throw error;
    return invalidRecordMetadata();
  }
}

/** Validate the complete DTO before making a detached, canonical, deeply frozen snapshot. */
export function parseCognitiveRecordV2<K extends CognitiveRecordKindV2>(kind: K, input: unknown): CognitiveRecordByKindV2[K] {
  try {
    switch (kind) {
      case "candidate": assertMemoryCandidateV2(input); break;
      case "hypothesis": assertHypothesisV2(input); break;
      case "goal": assertGoalV2(input); break;
      case "episode": assertEpisodeV2(input); break;
      case "working-state": assertWorkingStateV2(input); break;
      default: throw new DomainValidationErrorV2(domainErrorV2(
        "unsupported", "unsupported_cognitive_record_kind", "The cognitive record kind is unsupported.",
      ));
    }
    // Domain-valid aliases are detached only after exact field/accessor validation.
    return freeze(snapshotJsonValue(JSON.parse(JSON.stringify(input))) as unknown as CognitiveRecordByKindV2[K]);
  } catch (error) {
    if (error instanceof DomainValidationErrorV2) throw error;
    throw new DomainValidationErrorV2(domainErrorV2(
      "validation", "invalid_cognitive_record_shape", "The cognitive record storage contract is invalid.",
    ));
  }
}

/** Caller compares this exact projection with SQL metadata when reading the canonical body. */
export function cognitiveRecordMetadataV2(kind: CognitiveRecordKindV2, input: unknown): CognitiveRecordMetadataV2 {
  const record = parseCognitiveRecordV2(kind, input);
  return parseCognitiveRecordMetadataV2({
    kind, id: record.id, revision: record.revision,
    version: "version" in record ? record.version : null,
    scope: record.scope, privacy: record.privacy, sourceTrust: record.sourceTrust,
    createdAt: record.createdAt, updatedAt: record.updatedAt,
    status: "status" in record ? record.status : null,
    evidence: "confirmation" in record ? [record.confirmation] : record.evidence,
    acceptedClaim: "acceptedClaim" in record ? record.acceptedClaim : null,
  });
}

/**
 * Explicit trusted-adapter decisions, not inferred permission from a v1 event or its payload.
 * runtime is a controlled v2 identity: v1 package names need not be valid v2 identifiers.
 * streamId binds the entire workspace/adapter/runtime implementation+version/surface/
 * runtime instance/session/sequence-domain tuple; it is not derived from the surface alone.
 */
export interface RuntimeV1ObservationMappingV2 {
  readonly observationId: string;
  readonly streamId: string;
  readonly scope: ScopeV2;
  readonly privacy: PrivacyV2;
  readonly sourceTrust: SourceTrustV2;
  readonly recordedAt: string;
  readonly runtime: string;
  readonly productSessionId: string | null;
  readonly actor: ObservationV2["actor"];
  readonly kind: ObservationV2["kind"];
  readonly correlation: ObservationV2["correlation"];
  readonly content: ObservationV2["content"];
  readonly integrity: ObservationV2["integrity"];
}

const MAPPING_REQUIRED = ["observationId", "streamId", "scope", "privacy", "sourceTrust", "recordedAt",
  "runtime", "productSessionId", "actor", "kind", "correlation", "content", "integrity"];

/**
 * Pure conversion only: no v1 mutation, content materialization, grants or storage writes.
 * Caller must separately authorize/materialize any content ref and authenticate source metadata.
 * Does not retain v1 body, body fingerprint, links, raw correlation or runtime package/version.
 */
export function convertRuntimeV1ToObservationV2(input: unknown, mapping: RuntimeV1ObservationMappingV2): ObservationV2 {
  try {
    const event = parseNormalizedRuntimeEventV1(input);
    const explicit = recordSnapshot(mapping, MAPPING_REQUIRED) as unknown as RuntimeV1ObservationMappingV2;
    const result = parseObservationV2({
      schemaVersion: 2,
      id: explicit.observationId,
      revision: 1,
      scope: explicit.scope,
      privacy: explicit.privacy,
      sourceTrust: explicit.sourceTrust,
      observedAt: event.observedAt,
      recordedAt: explicit.recordedAt,
      actor: explicit.actor,
      kind: explicit.kind,
      source: {
        streamId: explicit.streamId,
        adapter: event.source.adapter,
        surface: event.source.surface,
        sourceSequence: event.sequence.value,
        runtime: explicit.runtime,
        productSessionId: explicit.productSessionId,
        runtimeSessionId: event.runtimeSessionId,
        runtimeInstanceId: event.runtimeInstanceId,
        eventType: event.source.eventType,
      },
      correlation: explicit.correlation,
      content: explicit.content,
      integrity: explicit.integrity,
    });
    if (result.scope.kind !== "global" && result.scope.workspaceId !== event.workspaceId) {
      throw new CognitiveProtocolError();
    }
    return result;
  } catch (error) {
    if (error instanceof CognitiveProtocolError) throw error;
    // The legacy parser is authoritative but its diagnostics may include caller-provided keys.
    throw new CognitiveProtocolError();
  }
}
