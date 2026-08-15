import {
  parseNormalizedRuntimeEventV1,
  type NormalizedRuntimeEventIdV1,
  type NormalizedRuntimeEventV1,
} from "./runtime-event-v1.ts";

function streamKey(event: NormalizedRuntimeEventV1): string {
  return JSON.stringify([
    event.workspaceId,
    event.runtimeSessionId,
    event.runtimeInstanceId,
    event.source.adapter,
    event.source.runtime.implementation,
    event.source.runtime.version,
    event.source.surface,
    event.sequence.domain,
  ]);
}

function eventLinks(event: NormalizedRuntimeEventV1): NormalizedRuntimeEventIdV1[] {
  return [
    ...(event.links?.sourceEventIds ?? []),
    ...(event.links?.replacesEventIds ?? []),
  ];
}

/**
 * Validates only per-source ordering and explicit relationships.
 * It never constructs a total order across sequence domains.
 */
export function parseNormalizedRuntimeEventTraceV1(
  inputs: readonly unknown[],
): readonly NormalizedRuntimeEventV1[] {
  if (!Array.isArray(inputs) || inputs.length === 0) {
    throw new TypeError("NormalizedRuntimeEvent trace must be a non-empty array");
  }
  const events = inputs.map(parseNormalizedRuntimeEventV1);
  const byId = new Map<NormalizedRuntimeEventIdV1, NormalizedRuntimeEventV1>();
  const streamHeads = new Map<string, number>();
  const eventIndexes = new Map<NormalizedRuntimeEventIdV1, number>();

  for (const [index, event] of events.entries()) {
    if (byId.has(event.eventId)) throw new TypeError(`duplicate eventId: ${event.eventId}`);
    byId.set(event.eventId, event);
    eventIndexes.set(event.eventId, index);
    const key = streamKey(event);
    const previous = streamHeads.get(key);
    if (previous !== undefined && event.sequence.value <= previous) {
      throw new TypeError(`non-monotonic sequence in source stream: ${key}`);
    }
    streamHeads.set(key, event.sequence.value);
  }

  for (const event of events) {
    for (const linkedId of eventLinks(event)) {
      if (linkedId === event.eventId) throw new TypeError("event links must not reference themselves");
      const linked = byId.get(linkedId);
      if (!linked) throw new TypeError(`event link does not exist: ${linkedId}`);
      if (linked.workspaceId !== event.workspaceId) {
        throw new TypeError("event links must not cross workspaces");
      }
      if ((eventIndexes.get(linkedId) ?? Number.POSITIVE_INFINITY) >= (eventIndexes.get(event.eventId) ?? -1)) {
        throw new TypeError("event links must reference an earlier trace fact");
      }
    }

    if (event.data.kind === "tool.lifecycle") {
      const toolCallId = event.correlation.normalized.toolCallId;
      if (!toolCallId) throw new TypeError("tool lifecycle requires normalized.toolCallId");
      if (event.data.phase === "completed") {
        const declarations = (event.links?.sourceEventIds ?? [])
          .map((eventId) => byId.get(eventId))
          .filter(
            (candidate): candidate is NormalizedRuntimeEventV1 =>
              candidate !== undefined &&
              candidate.runtimeSessionId === event.runtimeSessionId &&
              candidate.data.kind === "tool.lifecycle" &&
              candidate.data.phase === "declared" &&
              candidate.correlation.normalized.toolCallId === toolCallId,
          );
        if (declarations.length !== 1) {
          throw new TypeError(`tool completion must explicitly link one declaration: ${toolCallId}`);
        }
      }
    }

    if (event.data.kind === "compaction.lifecycle" && event.data.phase === "completed") {
      if (!event.links?.sourceEventIds?.length || !event.links?.replacesEventIds?.length) {
        throw new TypeError("completed compaction must cite source and replaced events");
      }
    }
  }

  return events;
}
