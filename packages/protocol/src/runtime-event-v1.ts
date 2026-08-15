import type { IsoTimestamp, SessionId, WorkspaceId } from "../../domain/src/index.ts";
import {
  canonicalJsonSha256V1,
  canonicalJsonV1,
  snapshotJsonValue,
  type JsonValue,
} from "./lossless-json.ts";
import {
  validateNormalizedRuntimePayloadV1,
  type NormalizedRuntimePayloadV1,
} from "./runtime-event-payload-v1.ts";

export * from "./runtime-event-payload-v1.ts";

export const NORMALIZED_RUNTIME_EVENT_PROTOCOL_VERSION = 1 as const;
export const NORMALIZED_RUNTIME_EVENT_ID_PREFIX = "nre1_" as const;
export const NORMALIZED_RUNTIME_IDEMPOTENCY_PREFIX = "nre1b_" as const;

export type NormalizedRuntimeEventIdV1 = `${typeof NORMALIZED_RUNTIME_EVENT_ID_PREFIX}${string}`;
export type NormalizedRuntimeIdempotencyKeyV1 = `${typeof NORMALIZED_RUNTIME_IDEMPOTENCY_PREFIX}${string}`;

export const NORMALIZED_RUNTIME_SOURCE_SURFACES_V1 = ["sdk", "extension", "rpc", "host"] as const;
export type NormalizedRuntimeSourceSurfaceV1 = (typeof NORMALIZED_RUNTIME_SOURCE_SURFACES_V1)[number];
export type NormalizedRuntimeProvenanceV1 = "observed" | "host-synthesized";
export type NormalizedRuntimePersistenceV1 = "durable" | "ephemeral";
export type NormalizedRuntimeStabilityV1 = "update" | "boundary" | "settled";
export type NormalizedRuntimeCompatibilityV1 = "required" | "ignorable";

export interface NormalizedRuntimeSourceV1 {
  readonly adapter: string;
  readonly runtime: {
    readonly implementation: string;
    readonly version: string;
  };
  readonly surface: NormalizedRuntimeSourceSurfaceV1;
  /** Raw source vocabulary is semantic data, not part of the source slot identity. */
  readonly eventType: string;
}
export interface NormalizedRuntimeSequenceV1 {
  readonly domain: string;
  readonly value: number;
}
export interface NormalizedRuntimeCorrelationV1 {
  readonly observed: {
    readonly requestId?: string;
    readonly providerResponseId?: string;
    readonly sessionObjectId?: string;
  };
  readonly normalized: {
    readonly promptId?: string;
    readonly agentRunId?: string;
    readonly turnId?: string;
    readonly messageId?: string;
    readonly toolCallId?: string;
    readonly rpcRequestId?: string;
  };
}
export interface NormalizedRuntimeLinksV1 {
  readonly sourceEventIds?: readonly NormalizedRuntimeEventIdV1[];
  readonly replacesEventIds?: readonly NormalizedRuntimeEventIdV1[];
}
export interface NormalizedRuntimeEventV1 {
  readonly protocolVersion: typeof NORMALIZED_RUNTIME_EVENT_PROTOCOL_VERSION;
  readonly eventId: NormalizedRuntimeEventIdV1;
  readonly idempotencyKey: NormalizedRuntimeIdempotencyKeyV1;
  readonly workspaceId: WorkspaceId;
  readonly runtimeSessionId: SessionId;
  readonly runtimeInstanceId: string;
  readonly source: NormalizedRuntimeSourceV1;
  readonly sequence: NormalizedRuntimeSequenceV1;
  readonly observedAt: IsoTimestamp;
  readonly provenance: NormalizedRuntimeProvenanceV1;
  readonly persistence: NormalizedRuntimePersistenceV1;
  readonly stability: NormalizedRuntimeStabilityV1;
  readonly compatibility: NormalizedRuntimeCompatibilityV1;
  readonly correlation: NormalizedRuntimeCorrelationV1;
  readonly links?: NormalizedRuntimeLinksV1;
  readonly data: NormalizedRuntimePayloadV1;
}
export type NormalizedRuntimeEventDraftV1 = Omit<
  NormalizedRuntimeEventV1,
  "eventId" | "idempotencyKey"
>;
export type NormalizedRuntimeReplayRelationV1 = "distinct" | "exact-replay" | "source-slot-conflict";

const TOP_LEVEL_KEYS = [
  "protocolVersion", "eventId", "idempotencyKey", "workspaceId", "runtimeSessionId",
  "runtimeInstanceId", "source", "sequence", "observedAt", "provenance", "persistence",
  "stability", "compatibility", "correlation", "links", "data",
] as const;
const DRAFT_KEYS = TOP_LEVEL_KEYS.filter((key) => key !== "eventId" && key !== "idempotencyKey");
const SOURCE_KEYS = ["adapter", "runtime", "surface", "eventType"] as const;
const RUNTIME_KEYS = ["implementation", "version"] as const;
const SEQUENCE_KEYS = ["domain", "value"] as const;
const CORRELATION_KEYS = ["observed", "normalized"] as const;
const OBSERVED_CORRELATION_KEYS = ["requestId", "providerResponseId", "sessionObjectId"] as const;
const NORMALIZED_CORRELATION_KEYS = [
  "promptId", "agentRunId", "turnId", "messageId", "toolCallId", "rpcRequestId",
] as const;
const LINK_KEYS = ["sourceEventIds", "replacesEventIds"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function exactKeys(value: Record<string, unknown>, allowed: readonly string[], label: string): void {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedSet.has(key)) throw new TypeError(`${label} contains unsupported key: ${key}`);
  }
}
function nonEmptyString(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0 || value !== value.trim()) {
    throw new TypeError(`${label} must be a trimmed non-empty string`);
  }
  if (value.length > 1024) throw new TypeError(`${label} exceeds the length limit`);
}
function optionalString(value: unknown, label: string): void {
  if (value !== undefined) nonEmptyString(value, label);
}
function oneOf(value: unknown, allowed: readonly string[], label: string): void {
  if (typeof value !== "string" || !allowed.includes(value)) throw new TypeError(`${label} is unsupported`);
}
function positiveSequence(value: unknown): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw new TypeError("sequence.value must be a positive safe integer");
  }
}
function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    return leap ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}
function canonicalUtcTimestamp(value: unknown): asserts value is string {
  if (typeof value !== "string") throw new TypeError("observedAt must be a string");
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{3})Z$/.exec(value);
  if (!match) throw new TypeError("observedAt must be canonical UTC ISO-8601 with milliseconds");
  const [, yearText, monthText, dayText, hourText, minuteText, secondText] = match;
  const year = Number(yearText); const month = Number(monthText); const day = Number(dayText);
  const hour = Number(hourText); const minute = Number(minuteText); const second = Number(secondText);
  if (
    month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month) ||
    hour > 23 || minute > 59 || second > 59
  ) throw new TypeError("observedAt is not a real UTC timestamp");
}
function eventIdArray(value: unknown, label: string): void {
  if (!Array.isArray(value) || value.length === 0) throw new TypeError(`${label} must be a non-empty array`);
  const unique = new Set<string>();
  for (const [index, item] of value.entries()) {
    if (typeof item !== "string" || !/^nre1_[0-9a-f]{64}$/.test(item)) {
      throw new TypeError(`${label}[${index}] must be a NormalizedRuntimeEvent v1 ID`);
    }
    if (unique.has(item)) throw new TypeError(`${label} must not contain duplicates`);
    unique.add(item);
  }
}
function validateSource(value: unknown): asserts value is NormalizedRuntimeSourceV1 {
  if (!isRecord(value)) throw new TypeError("source must be an object");
  exactKeys(value, SOURCE_KEYS, "source");
  nonEmptyString(value.adapter, "source.adapter");
  oneOf(value.surface, NORMALIZED_RUNTIME_SOURCE_SURFACES_V1, "source.surface");
  nonEmptyString(value.eventType, "source.eventType");
  if (!isRecord(value.runtime)) throw new TypeError("source.runtime must be an object");
  exactKeys(value.runtime, RUNTIME_KEYS, "source.runtime");
  nonEmptyString(value.runtime.implementation, "source.runtime.implementation");
  nonEmptyString(value.runtime.version, "source.runtime.version");
}
function validateSequence(value: unknown): asserts value is NormalizedRuntimeSequenceV1 {
  if (!isRecord(value)) throw new TypeError("sequence must be an object");
  exactKeys(value, SEQUENCE_KEYS, "sequence");
  nonEmptyString(value.domain, "sequence.domain");
  positiveSequence(value.value);
}
function validateCorrelation(value: unknown): asserts value is NormalizedRuntimeCorrelationV1 {
  if (!isRecord(value)) throw new TypeError("correlation must be an object");
  exactKeys(value, CORRELATION_KEYS, "correlation");
  if (!isRecord(value.observed) || !isRecord(value.normalized)) {
    throw new TypeError("correlation.observed and correlation.normalized must be objects");
  }
  exactKeys(value.observed, OBSERVED_CORRELATION_KEYS, "correlation.observed");
  exactKeys(value.normalized, NORMALIZED_CORRELATION_KEYS, "correlation.normalized");
  for (const [key, item] of Object.entries(value.observed)) optionalString(item, `correlation.observed.${key}`);
  for (const [key, item] of Object.entries(value.normalized)) optionalString(item, `correlation.normalized.${key}`);
}
function validateLinks(value: unknown): asserts value is NormalizedRuntimeLinksV1 {
  if (!isRecord(value)) throw new TypeError("links must be an object");
  exactKeys(value, LINK_KEYS, "links");
  if (value.sourceEventIds !== undefined) eventIdArray(value.sourceEventIds, "links.sourceEventIds");
  if (value.replacesEventIds !== undefined) eventIdArray(value.replacesEventIds, "links.replacesEventIds");
  if (value.sourceEventIds === undefined && value.replacesEventIds === undefined) {
    throw new TypeError("links must contain at least one relationship");
  }
}
function validateSemantics(value: Record<string, unknown>): void {
  if (value.persistence === "ephemeral") {
    if (value.stability !== "update" || value.compatibility !== "ignorable") {
      throw new TypeError("ephemeral events must be update and ignorable");
    }
  }
  if (value.stability === "update" && value.persistence !== "ephemeral") {
    throw new TypeError("update events must be ephemeral");
  }
  if (value.stability === "settled" && value.persistence !== "durable") {
    throw new TypeError("settled events must be durable");
  }
}
function validateLocalRelationships(value: Record<string, unknown>): void {
  const data = value.data as NormalizedRuntimePayloadV1;
  const correlation = value.correlation as NormalizedRuntimeCorrelationV1;
  const links = value.links as NormalizedRuntimeLinksV1 | undefined;
  if (data.kind === "tool.lifecycle") {
    if (!correlation.normalized.toolCallId) {
      throw new TypeError("tool lifecycle requires normalized.toolCallId");
    }
    if (data.phase === "declared") {
      if (links !== undefined) throw new TypeError("tool declaration must not contain event links");
    } else {
      if (
        links?.sourceEventIds?.length !== 1 ||
        links.replacesEventIds !== undefined
      ) {
        throw new TypeError(`tool ${data.phase} must link exactly one declaration`);
      }
    }
  }
  if (data.kind === "compaction.lifecycle") {
    if (data.phase === "started") {
      if (links !== undefined) throw new TypeError("compaction started must not contain event links");
    } else if (!links?.sourceEventIds?.length || !links.replacesEventIds?.length) {
      throw new TypeError("completed compaction must cite source and replaced events");
    }
  }
}
function validateCommon(value: Record<string, unknown>, draft: boolean): void {
  exactKeys(value, draft ? DRAFT_KEYS : TOP_LEVEL_KEYS, draft ? "draft" : "event");
  if (value.protocolVersion !== NORMALIZED_RUNTIME_EVENT_PROTOCOL_VERSION) {
    throw new TypeError("protocolVersion must be 1");
  }
  nonEmptyString(value.workspaceId, "workspaceId");
  nonEmptyString(value.runtimeSessionId, "runtimeSessionId");
  nonEmptyString(value.runtimeInstanceId, "runtimeInstanceId");
  validateSource(value.source);
  validateSequence(value.sequence);
  canonicalUtcTimestamp(value.observedAt);
  oneOf(value.provenance, ["observed", "host-synthesized"], "provenance");
  oneOf(value.persistence, ["durable", "ephemeral"], "persistence");
  oneOf(value.stability, ["update", "boundary", "settled"], "stability");
  oneOf(value.compatibility, ["required", "ignorable"], "compatibility");
  validateSemantics(value);
  validateCorrelation(value.correlation);
  if (value.links !== undefined) validateLinks(value.links);
  validateNormalizedRuntimePayloadV1(value.data, {
    sourceSurface: value.source.surface,
    sourceEventType: value.source.eventType,
    provenance: value.provenance as string,
    persistence: value.persistence as string,
    stability: value.stability as string,
    compatibility: value.compatibility as string,
  });
  validateLocalRelationships(value);
  snapshotJsonValue(value);
}
/** The collision slot deliberately excludes source.eventType and semantic data. */
function sourceSlot(value: NormalizedRuntimeEventDraftV1): JsonValue {
  return snapshotJsonValue({
    protocolVersion: value.protocolVersion,
    workspaceId: value.workspaceId,
    runtimeSessionId: value.runtimeSessionId,
    runtimeInstanceId: value.runtimeInstanceId,
    source: {
      adapter: value.source.adapter,
      runtime: value.source.runtime,
      surface: value.source.surface,
    },
    sequence: value.sequence,
  });
}
export function computeNormalizedRuntimeEventIdV1(value: NormalizedRuntimeEventDraftV1): NormalizedRuntimeEventIdV1 {
  return `${NORMALIZED_RUNTIME_EVENT_ID_PREFIX}${canonicalJsonSha256V1(sourceSlot(value))}`;
}
export function computeNormalizedRuntimeIdempotencyKeyV1(
  value: NormalizedRuntimeEventDraftV1,
): NormalizedRuntimeIdempotencyKeyV1 {
  return `${NORMALIZED_RUNTIME_IDEMPOTENCY_PREFIX}${canonicalJsonSha256V1(value)}`;
}
export function createNormalizedRuntimeEventV1(input: NormalizedRuntimeEventDraftV1): NormalizedRuntimeEventV1 {
  const draft = snapshotJsonValue(input) as unknown as NormalizedRuntimeEventDraftV1;
  if (!isRecord(draft)) throw new TypeError("event draft must be an object");
  validateCommon(draft, true);
  const event = {
    ...draft,
    eventId: computeNormalizedRuntimeEventIdV1(draft),
    idempotencyKey: computeNormalizedRuntimeIdempotencyKeyV1(draft),
  } as NormalizedRuntimeEventV1;
  const snapshot = snapshotJsonValue(event);
  validateNormalizedRuntimeEventSnapshotV1(snapshot);
  return snapshot;
}
function validateNormalizedRuntimeEventSnapshotV1(snapshot: JsonValue): asserts snapshot is NormalizedRuntimeEventV1 {
  if (!isRecord(snapshot)) throw new TypeError("NormalizedRuntimeEvent v1 must be an object");
  validateCommon(snapshot, false);
  if (!/^nre1_[0-9a-f]{64}$/.test(String(snapshot.eventId))) {
    throw new TypeError("eventId must be a NormalizedRuntimeEvent v1 ID");
  }
  if (!/^nre1b_[0-9a-f]{64}$/.test(String(snapshot.idempotencyKey))) {
    throw new TypeError("idempotencyKey must be a NormalizedRuntimeEvent v1 key");
  }
  const { eventId: _eventId, idempotencyKey: _idempotencyKey, ...draft } = snapshot;
  const typedDraft = draft as unknown as NormalizedRuntimeEventDraftV1;
  if (snapshot.eventId !== computeNormalizedRuntimeEventIdV1(typedDraft)) {
    throw new TypeError("eventId does not match the source slot");
  }
  if (snapshot.idempotencyKey !== computeNormalizedRuntimeIdempotencyKeyV1(typedDraft)) {
    throw new TypeError("idempotencyKey does not match the canonical event body");
  }
}
export function assertNormalizedRuntimeEventV1(input: unknown): asserts input is NormalizedRuntimeEventV1 {
  const snapshot = snapshotJsonValue(input);
  validateNormalizedRuntimeEventSnapshotV1(snapshot);
}
export function parseNormalizedRuntimeEventV1(input: unknown): NormalizedRuntimeEventV1 {
  const snapshot = snapshotJsonValue(input);
  validateNormalizedRuntimeEventSnapshotV1(snapshot);
  return snapshot;
}
export function classifyNormalizedRuntimeReplayV1(
  existingInput: unknown,
  candidateInput: unknown,
): NormalizedRuntimeReplayRelationV1 {
  const existing = parseNormalizedRuntimeEventV1(existingInput);
  const candidate = parseNormalizedRuntimeEventV1(candidateInput);
  if (existing.eventId !== candidate.eventId) return "distinct";
  return existing.idempotencyKey === candidate.idempotencyKey ? "exact-replay" : "source-slot-conflict";
}
export function canonicalNormalizedRuntimeEventV1(input: unknown): string {
  return canonicalJsonV1(parseNormalizedRuntimeEventV1(input));
}
