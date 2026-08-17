import { canonicalJsonV1 } from "./lossless-json.ts";
import {
  createNormalizedRuntimeEventV1 as createCore,
  parseNormalizedRuntimeEventV1 as parseCore,
  type NormalizedRuntimeEventDraftV1,
  type NormalizedRuntimeEventV1,
  type NormalizedRuntimeReplayRelationV1,
} from "./runtime-event-v1-core.ts";

export * from "./runtime-event-v1-core.ts";

function validateSessionReplacementLinks(event: NormalizedRuntimeEventV1): void {
  if (event.data.kind !== "session.identity" || event.data.action !== "replaced") return;
  if (
    event.links?.sourceEventIds?.length !== 2 ||
    event.links.replacesEventIds !== undefined
  ) {
    throw new TypeError(
      "session replacement must link exactly two source events and must not replace events",
    );
  }
}

function validateToolResultMessageLinks(event: NormalizedRuntimeEventV1): void {
  if (event.data.kind !== "message.lifecycle" || event.data.role !== "tool") return;
  if (!event.correlation.normalized.toolCallId) {
    throw new TypeError("tool result message requires normalized.toolCallId");
  }
  if (
    event.links?.sourceEventIds?.length !== 1 ||
    event.links.replacesEventIds !== undefined
  ) {
    throw new TypeError(
      "tool result message must link exactly one completed Tool event and must not replace events",
    );
  }
}

function validateExtendedLocalRelationships(event: NormalizedRuntimeEventV1): void {
  validateSessionReplacementLinks(event);
  validateToolResultMessageLinks(event);
}

export function createNormalizedRuntimeEventV1(
  input: NormalizedRuntimeEventDraftV1,
): NormalizedRuntimeEventV1 {
  const event = createCore(input);
  validateExtendedLocalRelationships(event);
  return event;
}

export function assertNormalizedRuntimeEventV1(
  input: unknown,
): asserts input is NormalizedRuntimeEventV1 {
  parseNormalizedRuntimeEventV1(input);
}

export function parseNormalizedRuntimeEventV1(input: unknown): NormalizedRuntimeEventV1 {
  const event = parseCore(input);
  validateExtendedLocalRelationships(event);
  return event;
}

export function classifyNormalizedRuntimeReplayV1(
  existingInput: unknown,
  candidateInput: unknown,
): NormalizedRuntimeReplayRelationV1 {
  const existing = parseNormalizedRuntimeEventV1(existingInput);
  const candidate = parseNormalizedRuntimeEventV1(candidateInput);
  if (existing.eventId !== candidate.eventId) return "distinct";
  return existing.idempotencyKey === candidate.idempotencyKey
    ? "exact-replay"
    : "source-slot-conflict";
}

export function canonicalNormalizedRuntimeEventV1(input: unknown): string {
  return canonicalJsonV1(parseNormalizedRuntimeEventV1(input));
}
