import {
  parseNormalizedRuntimeEventTraceV1 as parseTraceCore,
} from "./runtime-event-stream-v1-core.ts";
import type {
  NormalizedRuntimeEventV1,
  RuntimeSessionShutdownV1,
  RuntimeSessionStartedV1,
  RuntimeToolCompletedV1,
  RuntimeToolResultMessageEndedV1,
  RuntimeToolResultMessageStartedV1,
} from "./runtime-event-v1.ts";

export * from "./runtime-event-stream-v1-core.ts";

type ExtensionShutdown = NormalizedRuntimeEventV1 & {
  readonly data: RuntimeSessionShutdownV1;
};
type ExtensionStart = NormalizedRuntimeEventV1 & {
  readonly data: RuntimeSessionStartedV1;
};
type CompletedTool = NormalizedRuntimeEventV1 & {
  readonly data: RuntimeToolCompletedV1;
};
type ToolResultMessage = NormalizedRuntimeEventV1 & {
  readonly data: RuntimeToolResultMessageStartedV1 | RuntimeToolResultMessageEndedV1;
};

function isExtensionShutdown(event: NormalizedRuntimeEventV1): event is ExtensionShutdown {
  return event.source.surface === "extension" &&
    event.provenance === "observed" &&
    event.data.kind === "session.identity" &&
    event.data.action === "shutdown";
}

function isExtensionStart(event: NormalizedRuntimeEventV1): event is ExtensionStart {
  return event.source.surface === "extension" &&
    event.provenance === "observed" &&
    event.data.kind === "session.identity" &&
    event.data.action === "started";
}

function isCompletedTool(event: NormalizedRuntimeEventV1): event is CompletedTool {
  return event.data.kind === "tool.lifecycle" && event.data.phase === "completed";
}

function isToolResultMessage(event: NormalizedRuntimeEventV1): event is ToolResultMessage {
  return event.data.kind === "message.lifecycle" && event.data.role === "tool";
}

function assertCompatibleParents(
  source: NormalizedRuntimeEventV1,
  current: NormalizedRuntimeEventV1,
  label: string,
): void {
  for (const key of ["agentRunId", "turnId"] as const) {
    const left = source.correlation.normalized[key];
    const right = current.correlation.normalized[key];
    if (left !== undefined && right !== undefined && left !== right) {
      throw new TypeError(`${label} changed normalized.${key}`);
    }
  }
}

function validateSessionReplacementLineage(
  events: readonly NormalizedRuntimeEventV1[],
): void {
  const byId = new Map(events.map((event) => [event.eventId, event]));
  const indexes = new Map(events.map((event, index) => [event.eventId, index]));

  for (const event of events) {
    if (event.data.kind !== "session.identity" || event.data.action !== "replaced") continue;
    const lineage = event.links!.sourceEventIds!.map((id) => byId.get(id)!);
    if (lineage.some((source) => source.runtimeSessionId !== event.runtimeSessionId)) {
      throw new TypeError("session replacement lineage must remain in one Runtime Session");
    }
    const shutdowns = lineage.filter(isExtensionShutdown);
    const starts = lineage.filter(isExtensionStart);
    if (shutdowns.length !== 1 || starts.length !== 1) {
      throw new TypeError(
        "session replacement must link one observed Extension shutdown and one observed Extension start",
      );
    }
    const shutdown = shutdowns[0];
    const started = starts[0];
    if (indexes.get(shutdown.eventId)! >= indexes.get(started.eventId)!) {
      throw new TypeError("session replacement shutdown must precede the replacement start");
    }
    if (shutdown.data.previousSessionIdentity !== event.data.previousSessionIdentity) {
      throw new TypeError("session replacement previous identity does not match its shutdown source");
    }
    if (
      started.data.previousSessionIdentity !== event.data.previousSessionIdentity ||
      started.data.nextSessionIdentity !== event.data.nextSessionIdentity
    ) {
      throw new TypeError("session replacement old/new identities do not match its start source");
    }
    if (event.runtimeInstanceId !== started.runtimeInstanceId) {
      throw new TypeError("session replacement must be emitted by the new Runtime instance");
    }
    if (
      event.data.previousRuntimeInstanceId !== undefined &&
      event.data.previousRuntimeInstanceId !== shutdown.runtimeInstanceId
    ) {
      throw new TypeError("session replacement previous Runtime instance does not match shutdown");
    }
    if (
      event.data.nextRuntimeInstanceId !== undefined &&
      (
        event.data.nextRuntimeInstanceId !== started.runtimeInstanceId ||
        event.data.nextRuntimeInstanceId !== event.runtimeInstanceId
      )
    ) {
      throw new TypeError("session replacement next Runtime instance does not match start/aggregate");
    }
  }
}


function validateRetryCompletionLineage(
  events: readonly NormalizedRuntimeEventV1[],
): void {
  for (const [index, event] of events.entries()) {
    if (event.data.kind !== "retry.lifecycle" || event.data.phase !== "completed") continue;
    let matchingStart: NormalizedRuntimeEventV1 | undefined;
    for (let candidateIndex = index - 1; candidateIndex >= 0; candidateIndex -= 1) {
      const candidate = events[candidateIndex];
      if (
        candidate.workspaceId === event.workspaceId &&
        candidate.runtimeSessionId === event.runtimeSessionId &&
        candidate.runtimeInstanceId === event.runtimeInstanceId &&
        candidate.source.adapter === event.source.adapter &&
        candidate.source.runtime.implementation === event.source.runtime.implementation &&
        candidate.source.runtime.version === event.source.runtime.version &&
        candidate.source.surface === event.source.surface &&
        candidate.sequence.domain === event.sequence.domain &&
        candidate.data.kind === "retry.lifecycle" &&
        candidate.data.phase === "started" &&
        candidate.data.attempt === event.data.attempt &&
        (
          candidate.correlation.normalized.promptId === undefined ||
          event.correlation.normalized.promptId === undefined ||
          candidate.correlation.normalized.promptId === event.correlation.normalized.promptId
        )
      ) {
        matchingStart = candidate;
        break;
      }
    }
    if (matchingStart === undefined) {
      throw new TypeError(
        `retry completion has no earlier matching start for attempt ${event.data.attempt}`,
      );
    }
  }
}

function toolMessageKey(event: ToolResultMessage): string | undefined {
  const messageId = event.correlation.normalized.messageId;
  return messageId === undefined
    ? undefined
    : JSON.stringify([event.workspaceId, event.runtimeSessionId, messageId]);
}

function validateToolResultMessageLineage(
  events: readonly NormalizedRuntimeEventV1[],
): void {
  const byId = new Map(events.map((event) => [event.eventId, event]));
  const starts = new Map<string, ToolResultMessage>();

  for (const event of events) {
    if (!isToolResultMessage(event)) continue;
    const linked = byId.get(event.links!.sourceEventIds![0])!;
    if (
      linked.runtimeSessionId !== event.runtimeSessionId ||
      linked.runtimeInstanceId !== event.runtimeInstanceId
    ) {
      throw new TypeError(
        "tool result message lineage must remain in one Runtime Session and Runtime instance",
      );
    }
    if (!isCompletedTool(linked)) {
      throw new TypeError("tool result message must link one completed Tool event");
    }
    const toolCallId = event.correlation.normalized.toolCallId!;
    if (
      linked.correlation.normalized.toolCallId !== toolCallId ||
      linked.data.toolName !== event.data.toolName ||
      linked.data.success !== event.data.success
    ) {
      throw new TypeError("tool result message does not match its completed Tool event");
    }
    assertCompatibleParents(linked, event, `tool result message ${toolCallId}`);

    const key = toolMessageKey(event);
    if (key === undefined) continue;
    if (event.data.phase === "started") {
      starts.set(key, event);
      continue;
    }
    const started = starts.get(key);
    if (started === undefined) continue;
    if (
      started.correlation.normalized.toolCallId !== toolCallId ||
      started.data.toolName !== event.data.toolName ||
      started.data.success !== event.data.success ||
      started.links!.sourceEventIds![0] !== event.links!.sourceEventIds![0]
    ) {
      throw new TypeError("tool result message metadata changed after start");
    }
  }
}

export function parseNormalizedRuntimeEventTraceV1(
  inputs: readonly unknown[],
): readonly NormalizedRuntimeEventV1[] {
  const events = parseTraceCore(inputs);
  validateSessionReplacementLineage(events);
  validateRetryCompletionLineage(events);
  validateToolResultMessageLineage(events);
  return events;
}

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
