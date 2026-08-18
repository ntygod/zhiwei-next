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
  ids: readonly NormalizedRuntimeEventIdV1[] | undefined,
  byId: ReadonlyMap<NormalizedRuntimeEventIdV1, NormalizedRuntimeEventV1>,
): NormalizedRuntimeEventV1[] {
  return (ids ?? []).map((id) => {
    const linked = byId.get(id);
    if (!linked) throw new TypeError(`event link does not exist: ${id}`);
    return linked;
  });
}
function assertSameRuntimeInstance(
  started: NormalizedRuntimeEventV1,
  current: NormalizedRuntimeEventV1,
  label: string,
): void {
  if (started.runtimeInstanceId !== current.runtimeInstanceId) {
    throw new TypeError(`${label} must remain in one Runtime instance`);
  }
}
function assertCompatibleParents(
  started: NormalizedRuntimeEventV1,
  current: NormalizedRuntimeEventV1,
  label: string,
): void {
  for (const key of ["agentRunId", "turnId"] as const) {
    const left = started.correlation.normalized[key];
    const right = current.correlation.normalized[key];
    if (left !== undefined && right !== undefined && left !== right) {
      throw new TypeError(`${label} changed normalized.${key}`);
    }
  }
}

/**
 * Validates per-source order plus only explicitly correlated relationships.
 * Array order is a topological ingestion order, never a total Runtime order
 * across sequence domains.
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

  const agentStarts = new Map<string, NormalizedRuntimeEventV1>();
  const agentEnds = new Map<string, NormalizedRuntimeEventV1>();
  const agentSettled = new Set<string>();
  const turnStarts = new Map<string, NormalizedRuntimeEventV1>();
  const turnEnds = new Set<string>();
  const messageStarts = new Map<string, NormalizedRuntimeEventV1>();
  const messageEnds = new Set<string>();
  const toolDeclarations = new Map<string, NormalizedRuntimeEventV1>();

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
    if (turnId && !agentRunId) throw new TypeError("turnId requires agentRunId");

    const runKey = agentRunId ? relationshipKey(event, "agent", agentRunId) : undefined;
    const turnKey = agentRunId && turnId
      ? relationshipKey(event, "turn", agentRunId, turnId)
      : undefined;
    const messageKey = messageId ? relationshipKey(event, "message", messageId) : undefined;

    if (event.data.kind === "agent.lifecycle" && agentRunId) {
      if (event.data.phase === "started") {
        if (agentStarts.has(runKey!)) throw new TypeError(`duplicate agent start: ${agentRunId}`);
        agentStarts.set(runKey!, event);
      } else {
        const started = agentStarts.get(runKey!);
        if (!started) throw new TypeError(`agent ${event.data.phase} has no earlier start: ${agentRunId}`);
        assertSameRuntimeInstance(started, event, `agent ${agentRunId}`);
        if (event.data.phase === "ended") {
          if (agentEnds.has(runKey!)) throw new TypeError(`duplicate agent end: ${agentRunId}`);
          agentEnds.set(runKey!, event);
        } else {
          if (!agentEnds.has(runKey!)) throw new TypeError(`agent settled has no earlier end: ${agentRunId}`);
          if (agentSettled.has(runKey!)) throw new TypeError(`duplicate agent settled: ${agentRunId}`);
          agentSettled.add(runKey!);
        }
      }
    }

    if (event.data.kind === "turn.lifecycle") {
      if (agentRunId) {
        const startedRun = agentStarts.get(runKey!);
        if (!startedRun) throw new TypeError(`turn lifecycle has no earlier Agent start: ${agentRunId}`);
        assertSameRuntimeInstance(startedRun, event, `turn Agent run ${agentRunId}`);
      }
      if (turnKey) {
        if (event.data.phase === "started") {
          if (turnStarts.has(turnKey)) throw new TypeError(`duplicate turn start: ${turnId}`);
          turnStarts.set(turnKey, event);
        } else {
          const started = turnStarts.get(turnKey);
          if (!started) throw new TypeError(`turn end has no earlier start: ${turnId}`);
          assertSameRuntimeInstance(started, event, `turn ${turnId}`);
          if (turnEnds.has(turnKey)) throw new TypeError(`duplicate turn end: ${turnId}`);
          turnEnds.add(turnKey);
        }
      }
    }

    if (event.data.kind === "message.lifecycle") {
      if (agentRunId) {
        const startedRun = agentStarts.get(runKey!);
        if (!startedRun) throw new TypeError(`message lifecycle has no earlier Agent start: ${agentRunId}`);
        assertSameRuntimeInstance(startedRun, event, `message Agent run ${agentRunId}`);
      }
      if (turnKey) {
        const startedTurn = turnStarts.get(turnKey);
        if (!startedTurn) throw new TypeError(`message lifecycle has no earlier Turn start: ${turnId}`);
        assertSameRuntimeInstance(startedTurn, event, `message Turn ${turnId}`);
      }
      if (messageKey) {
        if (event.data.phase === "started") {
          if (messageStarts.has(messageKey)) throw new TypeError(`duplicate message start: ${messageId}`);
          messageStarts.set(messageKey, event);
        } else {
          const started = messageStarts.get(messageKey);
          if (!started) throw new TypeError(`message ${event.data.phase} has no earlier start: ${messageId}`);
          assertSameRuntimeInstance(started, event, `message ${messageId}`);
          assertCompatibleParents(started, event, `message ${messageId}`);
          if (started.data.kind !== "message.lifecycle" || started.data.role !== event.data.role) {
            throw new TypeError(`message role changed after start: ${messageId}`);
          }
          if (messageEnds.has(messageKey)) {
            throw new TypeError(`message ${event.data.phase} occurs after end: ${messageId}`);
          }
          if (event.data.phase === "ended") messageEnds.add(messageKey);
        }
      }
    }

    if (event.data.kind === "tool.lifecycle") {
      const toolCallId = event.correlation.normalized.toolCallId!;
      const declarationKey = relationshipKey(event, "tool", toolCallId);
      if (agentRunId) {
        const startedRun = agentStarts.get(runKey!);
        if (!startedRun) throw new TypeError(`tool lifecycle has no earlier Agent start: ${agentRunId}`);
        assertSameRuntimeInstance(startedRun, event, `tool Agent run ${agentRunId}`);
      }
      if (turnKey) {
        const startedTurn = turnStarts.get(turnKey);
        if (!startedTurn) throw new TypeError(`tool lifecycle has no earlier Turn start: ${turnId}`);
        assertSameRuntimeInstance(startedTurn, event, `tool Turn ${turnId}`);
      }
      if (event.data.phase === "declared") {
        if (toolDeclarations.has(declarationKey)) {
          throw new TypeError(`duplicate tool declaration: ${toolCallId}`);
        }
        toolDeclarations.set(declarationKey, event);
      } else {
        const declarations = linkedEvents(event.links?.sourceEventIds, byId).filter(
          (candidate) =>
            candidate.runtimeSessionId === event.runtimeSessionId &&
            candidate.runtimeInstanceId === event.runtimeInstanceId &&
            candidate.data.kind === "tool.lifecycle" &&
            candidate.data.phase === "declared" &&
            candidate.data.toolName === event.data.toolName &&
            candidate.correlation.normalized.toolCallId === toolCallId,
        );
        if (declarations.length !== 1) {
          throw new TypeError(`tool ${event.data.phase} must explicitly link one matching declaration: ${toolCallId}`);
        }
        assertCompatibleParents(declarations[0], event, `tool ${toolCallId}`);
        if (toolDeclarations.get(declarationKey)?.eventId !== declarations[0].eventId) {
          throw new TypeError(`tool ${event.data.phase} linked an ambiguous declaration: ${toolCallId}`);
        }
      }
    }

    if (
      (event.data.kind === "queue.changed" || event.data.kind === "retry.lifecycle") &&
      agentRunId
    ) {
      const startedRun = agentStarts.get(runKey!);
      if (!startedRun) throw new TypeError(`${event.data.kind} has no earlier Agent start: ${agentRunId}`);
      assertSameRuntimeInstance(startedRun, event, `${event.data.kind} ${agentRunId}`);
    }

    if (event.data.kind === "compaction.lifecycle" && event.data.phase === "completed") {
      const sourceLineage = linkedEvents(event.links?.sourceEventIds, byId);
      const replacementLineage = linkedEvents(event.links?.replacesEventIds, byId);
      const lineage = [...sourceLineage, ...replacementLineage];
      if (lineage.some((candidate) => candidate.runtimeSessionId !== event.runtimeSessionId)) {
        throw new TypeError("compaction lineage must remain in one Runtime Session");
      }
      const compactionStarts = sourceLineage.filter(
        (candidate) =>
          candidate.data.kind === "compaction.lifecycle" &&
          candidate.data.phase === "started",
      );
      if (compactionStarts.length !== 1) {
        throw new TypeError(
          "compaction completion must link exactly one earlier Compaction start in sourceEventIds",
        );
      }
      if (streamKey(compactionStarts[0]) !== streamKey(event)) {
        throw new TypeError(
          "compaction start must match completion Workspace, Runtime scope, and source stream",
        );
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
    throw new TypeError(`required unknown Runtime event blocks replay: ${requiredUnknown.data.sourceType}`);
  }
  return events;
}
