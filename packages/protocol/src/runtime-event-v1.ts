import type { IsoTimestamp, SessionId, WorkspaceId } from "../../domain/src/index.ts";
import {
  canonicalJsonSha256V1,
  canonicalJsonV1,
  snapshotJsonValue,
  type JsonValue,
} from "./lossless-json.ts";

export const NORMALIZED_RUNTIME_EVENT_PROTOCOL_VERSION = 1 as const;
export const NORMALIZED_RUNTIME_EVENT_ID_PREFIX = "nre1_" as const;
export const NORMALIZED_RUNTIME_IDEMPOTENCY_PREFIX = "nre1b_" as const;

export type NormalizedRuntimeEventIdV1 =
  `${typeof NORMALIZED_RUNTIME_EVENT_ID_PREFIX}${string}`;
export type NormalizedRuntimeIdempotencyKeyV1 =
  `${typeof NORMALIZED_RUNTIME_IDEMPOTENCY_PREFIX}${string}`;

export const NORMALIZED_RUNTIME_SOURCE_SURFACES_V1 = [
  "sdk",
  "extension",
  "rpc",
  "host",
] as const;
export type NormalizedRuntimeSourceSurfaceV1 =
  (typeof NORMALIZED_RUNTIME_SOURCE_SURFACES_V1)[number];

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

export interface RuntimeCommandResponseV1 {
  readonly kind: "command.response";
  readonly command: string;
  readonly success: boolean;
  readonly phase: "preflight-result" | "command-result";
  readonly error?: {
    readonly code?: string;
    readonly message: string;
  };
}

export interface RuntimeAgentLifecycleV1 {
  readonly kind: "agent.lifecycle";
  readonly phase: "started" | "ended" | "settled";
  readonly willRetry?: boolean;
}

export interface RuntimeTurnLifecycleV1 {
  readonly kind: "turn.lifecycle";
  readonly phase: "started" | "ended";
  readonly toolResultCount?: number;
}

export interface RuntimeMessageLifecycleV1 {
  readonly kind: "message.lifecycle";
  readonly phase: "started" | "updated" | "ended";
  readonly role: "user" | "assistant" | "tool" | "system";
  readonly contentKinds?: readonly string[];
  readonly stopReason?: string;
  readonly errorMessage?: string;
  readonly delta?: string;
  /** Runtime-neutral projected content; never a raw SDK object. */
  readonly body?: JsonValue;
}

export interface RuntimeToolLifecycleV1 {
  readonly kind: "tool.lifecycle";
  readonly phase: "declared" | "started" | "completed";
  readonly toolName: string;
  readonly success?: boolean;
  readonly input?: JsonValue;
  readonly result?: JsonValue;
}

export interface RuntimeQueueChangedV1 {
  readonly kind: "queue.changed";
  readonly queue: "steering" | "follow-up";
  readonly pending: number;
  readonly mode?: string;
}

export interface RuntimeRetryLifecycleV1 {
  readonly kind: "retry.lifecycle";
  readonly phase: "scheduled" | "started" | "aborted" | "exhausted";
  readonly attempt?: number;
  readonly delayMs?: number;
  readonly reason?: string;
}

export interface RuntimeCompactionLifecycleV1 {
  readonly kind: "compaction.lifecycle";
  readonly phase: "started" | "completed";
  readonly summaryKind?: string;
}

export interface RuntimeSessionIdentityV1 {
  readonly kind: "session.identity";
  readonly action:
    | "started"
    | "resumed"
    | "replaced"
    | "shutdown"
    | "invalidated"
    | "listener-rebound";
  readonly reason?: string;
  readonly previousSessionIdentity?: string;
  readonly nextSessionIdentity?: string;
  readonly previousRuntimeInstanceId?: string;
  readonly nextRuntimeInstanceId?: string;
}

export interface RuntimeStateSnapshotV1 {
  readonly kind: "snapshot.state";
  readonly state: JsonValue;
}

export interface RuntimeMessagesSnapshotV1 {
  readonly kind: "snapshot.messages";
  readonly messages: readonly JsonValue[];
}

export interface RuntimeProcessBoundaryV1 {
  readonly kind: "process.boundary";
  readonly boundary: "spawn" | "extension-shutdown" | "exit" | "close";
  readonly code?: number | null;
  readonly signal?: string | null;
  readonly reason?: string;
}

export interface RuntimeHostActionV1 {
  readonly kind: "host.action";
  readonly action: "send-command" | "close-stdin" | "request-signal";
  readonly command?: string;
  readonly requestId?: string;
  readonly signal?: string;
  readonly accepted?: boolean;
}

export interface RuntimeUnknownEventV1 {
  readonly kind: "runtime.unknown";
  readonly sourceType: string;
  readonly keys: readonly string[];
  readonly payloadSha256: string;
  readonly canonicalization: "zhiwei-json-v1";
}

export type NormalizedRuntimePayloadV1 =
  | RuntimeCommandResponseV1
  | RuntimeAgentLifecycleV1
  | RuntimeTurnLifecycleV1
  | RuntimeMessageLifecycleV1
  | RuntimeToolLifecycleV1
  | RuntimeQueueChangedV1
  | RuntimeRetryLifecycleV1
  | RuntimeCompactionLifecycleV1
  | RuntimeSessionIdentityV1
  | RuntimeStateSnapshotV1
  | RuntimeMessagesSnapshotV1
  | RuntimeProcessBoundaryV1
  | RuntimeHostActionV1
  | RuntimeUnknownEventV1;

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

const TOP_LEVEL_KEYS = new Set([
  "protocolVersion",
  "eventId",
  "idempotencyKey",
  "workspaceId",
  "runtimeSessionId",
  "runtimeInstanceId",
  "source",
  "sequence",
  "observedAt",
  "provenance",
  "persistence",
  "stability",
  "compatibility",
  "correlation",
  "links",
  "data",
]);
const DRAFT_KEYS = new Set([...TOP_LEVEL_KEYS].filter((key) => key !== "eventId" && key !== "idempotencyKey"));
const SOURCE_KEYS = new Set(["adapter", "runtime", "surface", "eventType"]);
const RUNTIME_KEYS = new Set(["implementation", "version"]);
const SEQUENCE_KEYS = new Set(["domain", "value"]);
const CORRELATION_KEYS = new Set(["observed", "normalized"]);
const OBSERVED_CORRELATION_KEYS = new Set(["requestId", "providerResponseId", "sessionObjectId"]);
const NORMALIZED_CORRELATION_KEYS = new Set([
  "promptId",
  "agentRunId",
  "turnId",
  "messageId",
  "toolCallId",
  "rpcRequestId",
]);
const LINK_KEYS = new Set(["sourceEventIds", "replacesEventIds"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>, label: string): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new TypeError(`${label} contains unsupported key: ${key}`);
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

function nonBlankText(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${label} must contain non-whitespace text`);
  }
  if (value.length > 64 * 1024) throw new TypeError(`${label} exceeds the length limit`);
}

function integer(value: unknown, label: string, minimum = 0): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) {
    throw new TypeError(`${label} must be a safe integer >= ${minimum}`);
  }
}

function exactEnum(value: unknown, allowed: readonly string[], label: string): void {
  if (typeof value !== "string" || !allowed.includes(value)) {
    throw new TypeError(`${label} is unsupported`);
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
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  if (
    month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month) ||
    hour > 23 || minute > 59 || second > 59
  ) {
    throw new TypeError("observedAt is not a real UTC timestamp");
  }
}

function idArray(value: unknown, label: string): void {
  if (!Array.isArray(value) || value.length === 0) {
    throw new TypeError(`${label} must be a non-empty array`);
  }
  const unique = new Set<string>();
  for (const [index, item] of value.entries()) {
    if (typeof item !== "string" || !/^nre1_[0-9a-f]{64}$/.test(item)) {
      throw new TypeError(`${label}[${index}] must be a NormalizedRuntimeEvent v1 ID`);
    }
    if (unique.has(item)) throw new TypeError(`${label} must not contain duplicates`);
    unique.add(item);
  }
}

function stringArray(value: unknown, label: string): void {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.length === 0)) {
    throw new TypeError(`${label} must be an array of non-empty strings`);
  }
}

function validateSource(value: unknown): void {
  if (!isRecord(value)) throw new TypeError("source must be an object");
  exactKeys(value, SOURCE_KEYS, "source");
  nonEmptyString(value.adapter, "source.adapter");
  exactEnum(value.surface, NORMALIZED_RUNTIME_SOURCE_SURFACES_V1, "source.surface");
  nonEmptyString(value.eventType, "source.eventType");
  if (!isRecord(value.runtime)) throw new TypeError("source.runtime must be an object");
  exactKeys(value.runtime, RUNTIME_KEYS, "source.runtime");
  nonEmptyString(value.runtime.implementation, "source.runtime.implementation");
  nonEmptyString(value.runtime.version, "source.runtime.version");
}

function validateSequence(value: unknown): void {
  if (!isRecord(value)) throw new TypeError("sequence must be an object");
  exactKeys(value, SEQUENCE_KEYS, "sequence");
  nonEmptyString(value.domain, "sequence.domain");
  integer(value.value, "sequence.value", 1);
}

function validateCorrelation(value: unknown): void {
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

function validateLinks(value: unknown): void {
  if (!isRecord(value)) throw new TypeError("links must be an object");
  exactKeys(value, LINK_KEYS, "links");
  if (value.sourceEventIds !== undefined) idArray(value.sourceEventIds, "links.sourceEventIds");
  if (value.replacesEventIds !== undefined) idArray(value.replacesEventIds, "links.replacesEventIds");
  if (value.sourceEventIds === undefined && value.replacesEventIds === undefined) {
    throw new TypeError("links must contain at least one relationship");
  }
}

function validatePayload(value: unknown, event: Record<string, unknown>): void {
  if (!isRecord(value)) throw new TypeError("data must be an object");
  nonEmptyString(value.kind, "data.kind");
  const kind = value.kind;

  if (kind === "command.response") {
    exactKeys(value, new Set(["kind", "command", "success", "phase", "error"]), "command.response");
    nonEmptyString(value.command, "data.command");
    if (typeof value.success !== "boolean") throw new TypeError("data.success must be boolean");
    exactEnum(value.phase, ["preflight-result", "command-result"], "data.phase");
    if (value.command === "prompt" && value.phase !== "preflight-result") {
      throw new TypeError("prompt responses must use preflight-result");
    }
    if (value.command !== "prompt" && value.phase !== "command-result") {
      throw new TypeError("non-prompt responses must use command-result");
    }
    if (value.success) {
      if (value.error !== undefined) throw new TypeError("successful command responses must not contain error");
    } else {
      if (!isRecord(value.error)) throw new TypeError("failed command responses must contain error");
      exactKeys(value.error, new Set(["code", "message"]), "command.response.error");
      optionalString(value.error.code, "data.error.code");
      nonBlankText(value.error.message, "data.error.message");
    }
    if (event.source && isRecord(event.source) && event.source.surface !== "rpc") {
      throw new TypeError("command.response must use the rpc source surface");
    }
    return;
  }

  if (kind === "agent.lifecycle") {
    exactKeys(value, new Set(["kind", "phase", "willRetry"]), "agent.lifecycle");
    exactEnum(value.phase, ["started", "ended", "settled"], "data.phase");
    if (value.phase === "ended") {
      if (typeof value.willRetry !== "boolean") throw new TypeError("agent ended requires willRetry");
    } else if (value.willRetry !== undefined) {
      throw new TypeError("willRetry is only valid on agent ended");
    }
    if (value.phase === "settled" && event.stability !== "settled") {
      throw new TypeError("agent settled must use stability=settled");
    }
    return;
  }

  if (kind === "turn.lifecycle") {
    exactKeys(value, new Set(["kind", "phase", "toolResultCount"]), "turn.lifecycle");
    exactEnum(value.phase, ["started", "ended"], "data.phase");
    if (value.toolResultCount !== undefined) integer(value.toolResultCount, "data.toolResultCount", 0);
    return;
  }

  if (kind === "message.lifecycle") {
    exactKeys(
      value,
      new Set(["kind", "phase", "role", "contentKinds", "stopReason", "errorMessage", "delta", "body"]),
      "message.lifecycle",
    );
    exactEnum(value.phase, ["started", "updated", "ended"], "data.phase");
    exactEnum(value.role, ["user", "assistant", "tool", "system"], "data.role");
    if (value.contentKinds !== undefined) stringArray(value.contentKinds, "data.contentKinds");
    optionalString(value.stopReason, "data.stopReason");
    optionalString(value.errorMessage, "data.errorMessage");
    if (value.delta !== undefined && typeof value.delta !== "string") throw new TypeError("data.delta must be string");
    if (value.body !== undefined) snapshotJsonValue(value.body);
    if (value.phase === "updated" && (event.persistence !== "ephemeral" || event.stability !== "update")) {
      throw new TypeError("message updates must be ephemeral update events");
    }
    return;
  }

  if (kind === "tool.lifecycle") {
    exactKeys(value, new Set(["kind", "phase", "toolName", "success", "input", "result"]), "tool.lifecycle");
    exactEnum(value.phase, ["declared", "started", "completed"], "data.phase");
    nonEmptyString(value.toolName, "data.toolName");
    if (value.input !== undefined) snapshotJsonValue(value.input);
    if (value.result !== undefined) snapshotJsonValue(value.result);
    if (value.phase === "completed") {
      if (typeof value.success !== "boolean") throw new TypeError("tool completed requires success");
    } else if (value.success !== undefined || value.result !== undefined) {
      throw new TypeError("tool result fields are only valid on tool completed");
    }
    return;
  }

  if (kind === "queue.changed") {
    exactKeys(value, new Set(["kind", "queue", "pending", "mode"]), "queue.changed");
    exactEnum(value.queue, ["steering", "follow-up"], "data.queue");
    integer(value.pending, "data.pending", 0);
    optionalString(value.mode, "data.mode");
    return;
  }

  if (kind === "retry.lifecycle") {
    exactKeys(value, new Set(["kind", "phase", "attempt", "delayMs", "reason"]), "retry.lifecycle");
    exactEnum(value.phase, ["scheduled", "started", "aborted", "exhausted"], "data.phase");
    if (value.attempt !== undefined) integer(value.attempt, "data.attempt", 1);
    if (value.delayMs !== undefined) integer(value.delayMs, "data.delayMs", 0);
    optionalString(value.reason, "data.reason");
    return;
  }

  if (kind === "compaction.lifecycle") {
    exactKeys(value, new Set(["kind", "phase", "summaryKind"]), "compaction.lifecycle");
    exactEnum(value.phase, ["started", "completed"], "data.phase");
    optionalString(value.summaryKind, "data.summaryKind");
    return;
  }

  if (kind === "session.identity") {
    exactKeys(
      value,
      new Set([
        "kind",
        "action",
        "reason",
        "previousSessionIdentity",
        "nextSessionIdentity",
        "previousRuntimeInstanceId",
        "nextRuntimeInstanceId",
      ]),
      "session.identity",
    );
    exactEnum(
      value.action,
      ["started", "resumed", "replaced", "shutdown", "invalidated", "listener-rebound"],
      "data.action",
    );
    for (const key of [
      "reason",
      "previousSessionIdentity",
      "nextSessionIdentity",
      "previousRuntimeInstanceId",
      "nextRuntimeInstanceId",
    ]) optionalString(value[key], `data.${key}`);
    if (
      value.action === "replaced" &&
      (value.previousSessionIdentity === undefined || value.nextSessionIdentity === undefined)
    ) {
      throw new TypeError("session replacement requires previous and next identities");
    }
    return;
  }

  if (kind === "snapshot.state") {
    exactKeys(value, new Set(["kind", "state"]), "snapshot.state");
    snapshotJsonValue(value.state);
    return;
  }

  if (kind === "snapshot.messages") {
    exactKeys(value, new Set(["kind", "messages"]), "snapshot.messages");
    if (!Array.isArray(value.messages)) throw new TypeError("data.messages must be an array");
    snapshotJsonValue(value.messages);
    return;
  }

  if (kind === "process.boundary") {
    exactKeys(value, new Set(["kind", "boundary", "code", "signal", "reason"]), "process.boundary");
    exactEnum(
      value.boundary,
      ["spawn", "extension-shutdown", "exit", "close"],
      "data.boundary",
    );
    if (value.code !== undefined && value.code !== null) integer(value.code, "data.code", 0);
    if (value.signal !== undefined && value.signal !== null) nonEmptyString(value.signal, "data.signal");
    optionalString(value.reason, "data.reason");
    if (
      (value.boundary === "spawn" || value.boundary === "extension-shutdown") &&
      (value.code !== undefined || value.signal !== undefined)
    ) {
      throw new TypeError(`${value.boundary} must not contain exit code or signal`);
    }
    if (
      (value.boundary === "exit" || value.boundary === "close") &&
      value.code === undefined &&
      value.signal === undefined
    ) {
      throw new TypeError(`${value.boundary} must contain code or signal`);
    }
    return;
  }

  if (kind === "host.action") {
    exactKeys(value, new Set(["kind", "action", "command", "requestId", "signal", "accepted"]), "host.action");
    exactEnum(value.action, ["send-command", "close-stdin", "request-signal"], "data.action");
    optionalString(value.command, "data.command");
    optionalString(value.requestId, "data.requestId");
    optionalString(value.signal, "data.signal");
    if (value.accepted !== undefined && typeof value.accepted !== "boolean") {
      throw new TypeError("data.accepted must be boolean");
    }
    if (!isRecord(event.source) || event.source.surface !== "host" || event.provenance !== "host-synthesized") {
      throw new TypeError("host.action must use host surface and host-synthesized provenance");
    }
    if (value.action === "send-command" && value.command === undefined) {
      throw new TypeError("send-command requires data.command");
    }
    if (value.action === "request-signal" && value.signal === undefined) {
      throw new TypeError("request-signal requires data.signal");
    }
    if (value.action === "close-stdin" && (value.command !== undefined || value.signal !== undefined)) {
      throw new TypeError("close-stdin must not contain command or signal");
    }
    return;
  }

  if (kind === "runtime.unknown") {
    exactKeys(value, new Set(["kind", "sourceType", "keys", "payloadSha256", "canonicalization"]), "runtime.unknown");
    nonEmptyString(value.sourceType, "data.sourceType");
    stringArray(value.keys, "data.keys");
    const keys = value.keys as string[];
    if (new Set(keys).size !== keys.length || JSON.stringify(keys) !== JSON.stringify([...keys].sort())) {
      throw new TypeError("data.keys must be sorted and unique");
    }
    if (!/^[0-9a-f]{64}$/.test(String(value.payloadSha256))) {
      throw new TypeError("data.payloadSha256 must be lowercase SHA-256");
    }
    if (value.canonicalization !== "zhiwei-json-v1") {
      throw new TypeError("data.canonicalization must be zhiwei-json-v1");
    }
    if (isRecord(event.source) && value.sourceType !== event.source.eventType) {
      throw new TypeError("runtime.unknown sourceType must match source.eventType");
    }
    return;
  }

  throw new TypeError(`unsupported data.kind: ${String(kind)}`);
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
  exactEnum(value.provenance, ["observed", "host-synthesized"], "provenance");
  exactEnum(value.persistence, ["durable", "ephemeral"], "persistence");
  exactEnum(value.stability, ["update", "boundary", "settled"], "stability");
  exactEnum(value.compatibility, ["required", "ignorable"], "compatibility");
  validateCorrelation(value.correlation);
  if (value.links !== undefined) validateLinks(value.links);
  validatePayload(value.data, value);
  snapshotJsonValue(value);
}

function sourceLocator(value: NormalizedRuntimeEventDraftV1): JsonValue {
  return snapshotJsonValue({
    protocolVersion: value.protocolVersion,
    workspaceId: value.workspaceId,
    runtimeSessionId: value.runtimeSessionId,
    runtimeInstanceId: value.runtimeInstanceId,
    source: value.source,
    sequence: value.sequence,
  });
}

export function computeNormalizedRuntimeEventIdV1(
  value: NormalizedRuntimeEventDraftV1,
): NormalizedRuntimeEventIdV1 {
  return `${NORMALIZED_RUNTIME_EVENT_ID_PREFIX}${canonicalJsonSha256V1(sourceLocator(value))}`;
}

export function computeNormalizedRuntimeIdempotencyKeyV1(
  value: NormalizedRuntimeEventDraftV1,
): NormalizedRuntimeIdempotencyKeyV1 {
  return `${NORMALIZED_RUNTIME_IDEMPOTENCY_PREFIX}${canonicalJsonSha256V1(value)}`;
}

export function createNormalizedRuntimeEventV1(
  input: NormalizedRuntimeEventDraftV1,
): NormalizedRuntimeEventV1 {
  const draft = snapshotJsonValue(input) as unknown as NormalizedRuntimeEventDraftV1;
  if (!isRecord(draft)) throw new TypeError("event draft must be an object");
  validateCommon(draft as unknown as Record<string, unknown>, true);
  const event = {
    ...draft,
    eventId: computeNormalizedRuntimeEventIdV1(draft),
    idempotencyKey: computeNormalizedRuntimeIdempotencyKeyV1(draft),
  } as NormalizedRuntimeEventV1;
  assertNormalizedRuntimeEventV1(event);
  return event;
}

function validateNormalizedRuntimeEventSnapshotV1(
  snapshot: JsonValue,
): asserts snapshot is NormalizedRuntimeEventV1 {
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
    throw new TypeError("eventId does not match the source locator");
  }
  if (snapshot.idempotencyKey !== computeNormalizedRuntimeIdempotencyKeyV1(typedDraft)) {
    throw new TypeError("idempotencyKey does not match the canonical event body");
  }
}

export function assertNormalizedRuntimeEventV1(
  input: unknown,
): asserts input is NormalizedRuntimeEventV1 {
  const snapshot = snapshotJsonValue(input);
  validateNormalizedRuntimeEventSnapshotV1(snapshot);
}

export function parseNormalizedRuntimeEventV1(input: unknown): NormalizedRuntimeEventV1 {
  const snapshot = snapshotJsonValue(input);
  validateNormalizedRuntimeEventSnapshotV1(snapshot);
  return snapshot;
}

export function canonicalNormalizedRuntimeEventV1(event: NormalizedRuntimeEventV1): string {
  assertNormalizedRuntimeEventV1(event);
  return canonicalJsonV1(event);
}
