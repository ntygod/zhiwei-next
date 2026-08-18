import type { NormalizedRuntimeEventV1 } from "../src/index.ts";
import type { FixtureContext } from "./normalized-runtime-event-v1.fixture-context.ts";

export function append_primary_tail_fixture(
  { append }: FixtureContext,
  messageEnd: NormalizedRuntimeEventV1,
): void {
  append({
    surface: "sdk",
    sequenceDomain: "sdk-public-events",
    sourceEventType: "queue_state",
    correlation: { observed: {}, normalized: { agentRunId: "fixture-run-a" } },
    data: { kind: "queue.changed", queue: "follow-up", pending: 1, mode: "one-at-a-time" },
  });
  append({
    surface: "sdk",
    sequenceDomain: "sdk-public-events",
    sourceEventType: "queue_state",
    correlation: { observed: {}, normalized: { agentRunId: "fixture-run-a" } },
    data: { kind: "queue.changed", queue: "follow-up", pending: 0, mode: "one-at-a-time" },
  });
  append({
    surface: "sdk",
    sequenceDomain: "sdk-public-events",
    sourceEventType: "turn_end",
    correlation: { observed: {}, normalized: { agentRunId: "fixture-run-a", turnId: "fixture-turn-a" } },
    data: { kind: "turn.lifecycle", phase: "ended", toolResultCount: 3 },
  });
  append({
    surface: "sdk",
    sequenceDomain: "sdk-public-events",
    sourceEventType: "agent_end",
    correlation: { observed: {}, normalized: { agentRunId: "fixture-run-a" } },
    data: { kind: "agent.lifecycle", phase: "ended", willRetry: false },
  });
  append({
    surface: "sdk",
    sequenceDomain: "sdk-public-events",
    sourceEventType: "agent_settled",
    stability: "settled",
    correlation: { observed: {}, normalized: { agentRunId: "fixture-run-a" } },
    data: { kind: "agent.lifecycle", phase: "settled" },
  });
  append({
    surface: "rpc",
    sequenceDomain: "rpc-worker-output",
    sourceEventType: "state_snapshot",
    data: {
      kind: "snapshot.state",
      state: {
        isStreaming: false,
        messageCount: 5,
        pendingMessageCount: 0,
        isCompacting: false,
        isIdle: true,
        followUpQueueCount: 0,
      },
    },
  });
  append({
    surface: "rpc",
    sequenceDomain: "rpc-worker-output",
    sourceEventType: "messages_snapshot",
    data: {
      kind: "snapshot.messages",
      messages: [
        { role: "assistant", contentKinds: ["text", "tool-call"], stopReason: "stop", text: "fixture response" },
        {
          role: "tool",
          toolCallId: "fixture-tool-alpha",
          toolName: "alpha",
          success: true,
          contentKinds: ["tool-result"],
          text: "alpha",
        },
        {
          role: "tool",
          toolCallId: "fixture-tool-beta",
          toolName: "beta",
          success: true,
          contentKinds: ["tool-result"],
          text: "beta",
        },
        {
          role: "tool",
          toolCallId: "fixture-tool-gamma",
          toolName: "gamma",
          success: true,
          contentKinds: ["tool-result"],
          text: "gamma",
        },
      ],
    },
  });
  const compactionStart = append({
    surface: "sdk",
    sequenceDomain: "sdk-public-events",
    sourceEventType: "compaction_start",
    data: { kind: "compaction.lifecycle", phase: "started", reason: "manual" },
  });
  append({
    surface: "sdk",
    sequenceDomain: "sdk-public-events",
    sourceEventType: "compaction_end",
    links: {
      sourceEventIds: [compactionStart.eventId, messageEnd.eventId],
      replacesEventIds: [messageEnd.eventId],
    },
    data: { kind: "compaction.lifecycle", phase: "completed", summaryKind: "context-summary" },
  });
  append({
    surface: "host",
    sequenceDomain: "host-client-actions",
    sourceEventType: "host_close_stdin",
    provenance: "host-synthesized",
    data: { kind: "host.action", action: "close-stdin" },
  });
  append({
    surface: "extension",
    sequenceDomain: "extension-events",
    sourceEventType: "extension_shutdown",
    data: {
      kind: "session.identity",
      action: "shutdown",
      reason: "quit",
      previousSessionIdentity: "session-object-a",
    },
  });
  append({
    surface: "host",
    sequenceDomain: "process-boundaries",
    sourceEventType: "process_exit",
    data: { kind: "process.boundary", boundary: "exit", code: 0, signal: null },
  });
  append({
    surface: "host",
    sequenceDomain: "process-boundaries",
    sourceEventType: "process_close",
    data: { kind: "process.boundary", boundary: "close", code: 0, signal: null },
  });
}
