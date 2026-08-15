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

function relationshipKey(event: NormalizedRuntimeEventV1, ...parts: string[]): string {
  return JSON.stringify([event.workspaceId, event.runtimeSessionId, ...parts]);
}

function eventLinks(event: NormalizedRuntimeEventV1): NormalizedRuntimeEventIdV1[] {
  return [
    ...(event.links?.sourceEventIds ?? []),
    ...(event.links?.replacesEventIds ?? []),
  ];
}

function linkedEvents(
  event: NormalizedRuntimeEventV1,
  ids: readonly NormalizedRuntimeEventIdV1[] | undefined,
  byId: ReadonlyMap<NormalizedRuntimeEventIdV1, NormalizedRuntimeEventV1>,
): NormalizedRuntimeEventV1[] {
  return (ids ?? []).map((id) => {
    const linked = byId.get(id);
    if (!linked) throw new TypeError(`event link does not exist: ${id}`);
    return linked;
  });
}

/**
 * Validates per-source order plus only explicitly correlated relationships.
 * Array order is used as a topological ingestion order, never as a total
 * Runtime order across sequence domains.
 */
export function parseNormalizedRuntimeEventTraceV1(
  inputs: readonly unknown[],
): readonly NormalizedRuntimeEventV1[] {
  if (!Array.isArray(inputs) || inputs.length === 0) {
    throw new TypeError("NormalizedRuntimeEvent trace must be a non-empty array");
  }

  const events = inputs.map(parseNormalizedRuntimeEventV1);
  const byId = new Map<NormalizedRuntimeEventIdV1, NormalizedRuntimeEventV1>();
  const eventIndexes = new Map<NormalizedRuntimeEventIdV1, number>();
  const streamHeads = new Map<string, number>();

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

  const agentStarts = new Set<string>();
  const agentEnds = new Set<string>();
  const turnStarts = new Set<string>();
  const messageStarts = new Map<string, string>();

  for (const [index, event] of events.entries()) {
    for (const linkedId of eventLinks(event)) {
      if (linkedId === event.eventId) throw new TypeError("event links must not reference themselves");
      const linked = byId.get(linkedId);
      if (!linked) throw new TypeError(`event link does not exist: ${linkedId}`);
      if (linked.workspaceId !== event.workspaceId) {
        throw new TypeError("event links must not cross workspaces");
      }
      if ((eventIndexes.get(linkedId) ?? Number.POSITIVE_INFINITY) >= index) {
        throw new TypeError("event links must reference an earlier trace fact");
      }
    }

    const agentRunId = event.correlation.normalized.agentRunId;
    const turnId = event.correlation.normalized.turnId;
    const messageId = event.correlation.normalized.messageId;

    if (turnId && !agentRunId) {
      throw new TypeError("turnId requires agentRunId");
    }
    if (messageId && turnId && !agentRunId) {
      throw new TypeError("message turn correlation requires agentRunId");
    }

    const runKey = agentRunId
      ? relationshipKey(event, "agent", agentRunId)
      : undefined;
    const turnKey = agentRunId && turnId
      ? relationshipKey(event, "turn", agentRunId, turnId)
      : undefined;
    const messageKey = messageId
      ? relationshipKey(event, "message", messageId)
      : undefined;

    if (event.data.kind === "agent.lifecycle") {
      if (agentRunId) {
        if (event.data.phase === "started") {
          agentStarts.add(runKey!);
        } else {
          if (!agentStarts.has(runKey!)) {
            throw new TypeError(`agent ${event.data.phase} has no earlier start: ${agentRunId}`);
          }
          if (event.data.phase === "ended") {
            agentEnds.add(runKey!);
          } else if (!agentEnds.has(runKey!)) {
            throw new TypeError(`agent settled has no earlier end: ${agentRunId}`);
          }
        }
      }
    }

    if (event.data.kind === "turn.lifecycle") {
      if (turnId && !agentRunId) throw new TypeError("turn lifecycle requires agentRunId when turnId is present");
      if (agentRunId && !agentStarts.has(runKey!)) {
        throw new TypeError(`turn lifecycle has no earlier Agent start: ${agentRunId}`);
      }
      if (turnKey) {
        if (event.data.phase === "started") {
          turnStarts.add(turnKey);
        } else if (!turnStarts.has(turnKey)) {
          throw new TypeError(`turn end has no earlier start: ${turnId}`);
        }
      }
    }

    if (event.data.kind === "message.lifecycle") {
      if (agentRunId && !agentStarts.has(runKey!)) {
        throw new TypeError(`message lifecycle has no earlier Agent start: ${agentRunId}`);
      }
      if (turnKey && !turnStarts.has(turnKey)) {
        throw new TypeError(`message lifecycle has no earlier Turn start: ${turnId}`);
      }
      if (messageKey) {
        if (event.data.phase === "started") {
          messageStarts.set(messageKey, event.data.role);
        } else {
          const startedRole = messageStarts.get(messageKey);
          if (startedRole === undefined) {
            throw new TypeError(`message ${event.data.phase} has no earlier start: ${messageId}`);
          }
          if (startedRole !== event.data.role) {
            throw new TypeError(`message role changed after start: ${messageId}`);
          }
        }
      }
    }

    if (event.data.kind === "tool.lifecycle") {
      const toolCallId = event.correlation.normalized.toolCallId;
      if (!toolCallId) throw new TypeError("tool lifecycle requires normalized.toolCallId");
      if (agentRunId && !agentStarts.has(runKey!)) {
        throw new TypeError(`tool lifecycle has no earlier Agent start: ${agentRunId}`);
      }
      if (turnKey && !turnStarts.has(turnKey)) {
        throw new TypeError(`tool lifecycle has no earlier Turn start: ${turnId}`);
      }
      if (event.data.phase !== "declared") {
        const declarations = linkedEvents(event, event.links?.sourceEventIds, byId).filter(
          (candidate) =>
            candidate.runtimeSessionId === event.runtimeSessionId &&
            candidate.data.kind === "tool.lifecycle" &&
            candidate.data.phase === "declared" &&
            candidate.data.toolName === event.data.toolName &&
            candidate.correlation.normalized.toolCallId === toolCallId,
        );
        if (declarations.length !== 1) {
          throw new TypeError(
            `tool ${event.data.phase} must explicitly link one matching declaration: ${toolCallId}`,
          );
        }
      }
    }

    if (
      (event.data.kind === "queue.changed" || event.data.kind === "retry.lifecycle") &&
      agentRunId &&
      !agentStarts.has(runKey!)
    ) {
      throw new TypeError(`${event.data.kind} has no earlier Agent start: ${agentRunId}`);
    }

    if (event.data.kind === "compaction.lifecycle" && event.data.phase === "completed") {
      if (!event.links?.sourceEventIds?.length || !event.links?.replacesEventIds?.length) {
        throw new TypeError("completed compaction must cite source and replaced events");
      }
      const lineage = linkedEvents(event, eventLinks(event), byId);
      if (lineage.some((candidate) => candidate.runtimeSessionId !== event.runtimeSessionId)) {
        throw new TypeError("compaction lineage must remain in one Runtime Session");
      }
    }
  }

  return events;
}

/** Consumers that claim complete replay must fail closed on required unknown vocabulary. */
export function assertReplayableNormalizedRuntimeEventTraceV1(
  inputs: readonly unknown[],
): readonly NormalizedRuntimeEventV1[] {
  const events = parseNormalizedRuntimeEventTraceV1(inputs);
  const requiredUnknown = events.find(
    (event) => event.data.kind === "runtime.unknown" && event.compatibility === "required",
  );
  if (requiredUnknown) {
    throw new TypeError(
      `required unknown Runtime event blocks replay: ${requiredUnknown.data.sourceType}`,
    );
  }
  return events;
}
