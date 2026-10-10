import {
  assertScopeV2, assertPrivacyV2, assertSourceTrustV2, assertContentRefV2, assertTaskAttemptRefV2,
  type ScopeV2, type PrivacyV2, type SourceTrustV2, type ContentRefV2,
  type ObservationActor, type ObservationKind, type TaskAttemptRefV2,
} from "../../domain/src/index.ts";
import { canonicalJsonV1 } from "./lossless-json.ts";
import { decodeWireJson, identifier, invalid, keys, list, member, object, revision, timestamp, unique, version, wireBoundary } from "./cognitive-wire.ts";

export const observationSchemaVersion = 2 as const;

/** Evidence references only. Body retrieval/retention and source authentication are separate boundaries. */
export interface ObservationV2 {
  readonly schemaVersion: typeof observationSchemaVersion;
  readonly id: string;
  readonly revision: 1;
  readonly scope: ScopeV2;
  readonly privacy: PrivacyV2;
  readonly sourceTrust: SourceTrustV2;
  /** Source-observed time; source clock skew may put this after recordedAt. */
  readonly observedAt: string;
  /** Trusted recording-boundary time; sequence ordering never uses either wall clock. */
  readonly recordedAt: string;
  readonly actor: ObservationActor;
  readonly kind: ObservationKind;
  readonly source: {
    /** Exact adapter/surface/instance sequence domain; never merged by wall time. */
    readonly streamId: string;
    readonly adapter: string;
    readonly surface: "sdk" | "rpc" | "extension" | "host" | "local-api" | "synthetic";
    readonly sourceSequence: number;
    readonly runtime: string | null;
    readonly productSessionId: string | null;
    readonly runtimeSessionId: string | null;
    readonly runtimeInstanceId: string | null;
    readonly eventType: string;
  };
  readonly correlation: {
    readonly taskAttempt: TaskAttemptRefV2 | null;
    readonly turnId: string | null;
    readonly toolCallId: string | null;
    readonly causationId: string | null;
    readonly correlationId: string | null;
  };
  readonly content:
    | { readonly availability: "available"; readonly ref: ContentRefV2 }
    | { readonly availability: "unavailable"; readonly reason: "not-retained" | "purged" | "missing" | "policy-blocked" };
  readonly integrity:
    | { readonly status: "complete" }
    | { readonly status: "incomplete"; readonly reason: "source-gap" | "truncated" | "unavailable"; readonly missingSequences: readonly number[] };
}

export function parseObservationV2(input: unknown): ObservationV2 {
  return wireBoundary(input, value => {
    keys(value, ["schemaVersion", "id", "revision", "scope", "privacy", "sourceTrust", "observedAt", "recordedAt", "actor", "kind", "source", "correlation", "content", "integrity"]);
    version(value.schemaVersion, 2); identifier(value.id);
    if (value.revision !== 1) invalid();
    assertScopeV2(value.scope); assertPrivacyV2(value.privacy); assertSourceTrustV2(value.sourceTrust);
    timestamp(value.observedAt); timestamp(value.recordedAt);
    member(value.actor, ["user", "assistant", "tool", "system", "connector"]);
    member(value.kind, ["user_input", "assistant_output", "tool_call", "tool_result", "session_event", "feedback"]);
    const source = object(value.source);
    keys(source, ["streamId", "adapter", "surface", "sourceSequence", "runtime", "productSessionId", "runtimeSessionId", "runtimeInstanceId", "eventType"]);
    identifier(source.streamId); identifier(source.adapter);
    member(source.surface, ["sdk", "rpc", "extension", "host", "local-api", "synthetic"]); revision(source.sourceSequence);
    if (source.runtime !== null) identifier(source.runtime);
    identifier(source.eventType);
    for (const key of ["productSessionId", "runtimeSessionId", "runtimeInstanceId"]) if (source[key] !== null) identifier(source[key]);
    if (source.runtime === null && (source.runtimeSessionId !== null || source.runtimeInstanceId !== null)) invalid();
    if (["sdk", "rpc", "extension"].includes(source.surface as string) && source.runtime === null) invalid();
    if (source.surface === "local-api" && source.runtime !== null) invalid();
    // Runtime session replacement must not change the product session or its Scope.
    if (value.scope.kind === "session" && source.productSessionId !== value.scope.sessionId) invalid();
    const correlation = object(value.correlation);
    keys(correlation, ["taskAttempt", "turnId", "toolCallId", "causationId", "correlationId"]);
    for (const key of ["turnId", "toolCallId", "causationId", "correlationId"]) if (correlation[key] !== null) identifier(correlation[key]);
    if (correlation.taskAttempt !== null) {
      assertTaskAttemptRefV2(correlation.taskAttempt);
      if (value.scope.kind === "task" && value.scope.taskId !== correlation.taskAttempt.taskId) invalid();
    }
    const content = object(value.content);
    if (content.availability === "available") {
      keys(content, ["availability", "ref"]); assertContentRefV2(content.ref);
    } else {
      keys(content, ["availability", "reason"]); member(content.availability, ["unavailable"]);
      member(content.reason, ["not-retained", "purged", "missing", "policy-blocked"]);
    }
    const integrity = object(value.integrity);
    if (integrity.status === "complete") keys(integrity, ["status"]);
    else {
      keys(integrity, ["status", "reason", "missingSequences"]); member(integrity.status, ["incomplete"]);
      member(integrity.reason, ["source-gap", "truncated", "unavailable"]);
      const missing = list(integrity.missingSequences).map(value => revision(value));
      unique(missing.map(String));
      if (missing.some(sequence => sequence >= (source.sourceSequence as number))) invalid();
      if ((integrity.reason === "source-gap") !== (missing.length > 0)) invalid();
    }
    return value as unknown as ObservationV2;
  });
}

export function serializeObservationV2(input: unknown): string {
  return canonicalJsonV1(parseObservationV2(input));
}

/** Source-slot identity is independent of wall clocks and payload ordering. */
export function classifyObservationReplayV2(existingInput: unknown, candidateInput: unknown): "distinct" | "exact-replay" | "identity-conflict" {
  const existing = parseObservationV2(existingInput), candidate = parseObservationV2(candidateInput);
  const sameSlot = existing.source.streamId === candidate.source.streamId
    && existing.source.sourceSequence === candidate.source.sourceSequence;
  if (existing.id !== candidate.id && !sameSlot) return "distinct";
  return serializeObservationV2(existing) === serializeObservationV2(candidate) ? "exact-replay" : "identity-conflict";
}

export function deserializeObservationV2(input: string): ObservationV2 {
  return parseObservationV2(decodeWireJson(input));
}
