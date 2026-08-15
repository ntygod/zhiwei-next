import { ids, type IsoTimestamp } from "../../domain/src/index.ts";
import {
  createNormalizedRuntimeEventV1,
  type NormalizedRuntimeCorrelationV1,
  type NormalizedRuntimeEventDraftV1,
  type NormalizedRuntimeEventV1,
  type NormalizedRuntimeLinksV1,
  type NormalizedRuntimePayloadV1,
  type NormalizedRuntimeProvenanceV1,
  type NormalizedRuntimeSourceSurfaceV1,
} from "../src/index.ts";

export const NORMALIZED_RUNTIME_EVENT_V1_FIXTURE_SOURCE = Object.freeze({
  issue: 32,
  mergeCommit: "374a27505c4a150cbcb63c1b8f6c1afb3bfb4448",
  runtimeVersion: "0.84.1",
});

const workspaceId = ids.workspace("fixture-workspace");
const sessionA = ids.session("fixture-session-a");
const sessionB = ids.session("fixture-session-b");
const sessionC = ids.session("fixture-session-c");

interface FixtureInput {
  readonly runtimeSessionId?: ReturnType<typeof ids.session>;
  readonly runtimeInstanceId?: string;
  readonly surface: NormalizedRuntimeSourceSurfaceV1;
  readonly sequenceDomain: string;
  readonly sourceSequence: number;
  readonly sourceEventType: string;
  readonly observedAtIndex: number;
  readonly provenance?: NormalizedRuntimeProvenanceV1;
  readonly compatibility?: "required" | "ignorable";
  readonly persistence?: "durable" | "ephemeral";
  readonly stability?: "update" | "boundary" | "settled";
  readonly correlation?: NormalizedRuntimeCorrelationV1;
  readonly links?: NormalizedRuntimeLinksV1;
  readonly data: NormalizedRuntimePayloadV1;
}

function timestamp(index: number): IsoTimestamp {
  return `2026-08-15T02:00:${String(index).padStart(2, "0")}.000Z` as IsoTimestamp;
}

function emptyCorrelation(): NormalizedRuntimeCorrelationV1 {
  return { observed: {}, normalized: {} };
}

function make(input: FixtureInput): NormalizedRuntimeEventV1 {
  return createNormalizedRuntimeEventV1({
    protocolVersion: 1,
    workspaceId,
    runtimeSessionId: input.runtimeSessionId ?? sessionA,
    runtimeInstanceId: input.runtimeInstanceId ?? "fixture-worker-1",
    source: {
      adapter: "pi",
      runtime: {
        implementation: "@earendil-works/pi-coding-agent",
        version: NORMALIZED_RUNTIME_EVENT_V1_FIXTURE_SOURCE.runtimeVersion,
      },
      surface: input.surface,
      eventType: input.sourceEventType,
    },
    sequence: {
      domain: input.sequenceDomain,
      value: input.sourceSequence,
    },
    observedAt: timestamp(input.observedAtIndex),
    provenance: input.provenance ?? "observed",
    persistence: input.persistence ?? "durable",
    stability: input.stability ?? "boundary",
    compatibility: input.compatibility ?? "required",
    correlation: input.correlation ?? emptyCorrelation(),
    ...(input.links ? { links: input.links } : {}),
    data: input.data,
  } satisfies NormalizedRuntimeEventDraftV1);
}

export function buildNormalizedRuntimeEventV1Fixture(): readonly NormalizedRuntimeEventV1[] {
  const events: NormalizedRuntimeEventV1[] = [];

  const hostPrompt = make({
    surface: "host",
    sequenceDomain: "host-client-actions",
    sourceSequence: 1,
    sourceEventType: "host_send_command",
    observedAtIndex: 1,
    provenance: "host-synthesized",
    correlation: {
      observed: { requestId: "fixture-request-a" },
      normalized: { promptId: "fixture-prompt-a", rpcRequestId: "fixture-rpc-a" },
    },
    data: {
      kind: "host.action",
      action: "send-command",
      command: "prompt",
      requestId: "fixture-request-a",
    },
  });
  events.push(hostPrompt);

  events.push(make({
    surface: "host",
    sequenceDomain: "process-boundaries",
    sourceSequence: 1,
    sourceEventType: "process_spawn",
    observedAtIndex: 2,
    data: { kind: "process.boundary", boundary: "spawn" },
  }));

  events.push(make({
    surface: "rpc",
    sequenceDomain: "rpc-worker-output",
    sourceSequence: 1,
    sourceEventType: "response",
    observedAtIndex: 3,
    correlation: {
      observed: { requestId: "fixture-request-a" },
      normalized: { promptId: "fixture-prompt-a", rpcRequestId: "fixture-rpc-a" },
    },
    data: {
      kind: "command.response",
      command: "prompt",
      success: true,
      phase: "preflight-result",
    },
  }));

  const agentStart = make({
    surface: "sdk",
    sequenceDomain: "sdk-public-events",
    sourceSequence: 1,
    sourceEventType: "agent_start",
    observedAtIndex: 4,
    correlation: {
      observed: {},
      normalized: { promptId: "fixture-prompt-a", agentRunId: "fixture-run-a" },
    },
    data: { kind: "agent.lifecycle", phase: "started" },
  });
  events.push(agentStart);

  events.push(make({
    surface: "sdk",
    sequenceDomain: "sdk-public-events",
    sourceSequence: 2,
    sourceEventType: "turn_start",
    observedAtIndex: 5,
    correlation: {
      observed: {},
      normalized: { agentRunId: "fixture-run-a", turnId: "fixture-turn-a" },
    },
    data: { kind: "turn.lifecycle", phase: "started" },
  }));

  events.push(make({
    surface: "sdk",
    sequenceDomain: "sdk-public-events",
    sourceSequence: 3,
    sourceEventType: "message_start",
    observedAtIndex: 6,
    correlation: {
      observed: {},
      normalized: {
        agentRunId: "fixture-run-a",
        turnId: "fixture-turn-a",
        messageId: "fixture-message-a",
      },
    },
    data: {
      kind: "message.lifecycle",
      phase: "started",
      role: "assistant",
      contentKinds: [],
    },
  }));

  events.push(make({
    surface: "sdk",
    sequenceDomain: "sdk-public-events",
    sourceSequence: 4,
    sourceEventType: "message_update",
    observedAtIndex: 7,
    persistence: "ephemeral",
    stability: "update",
    compatibility: "ignorable",
    correlation: {
      observed: {},
      normalized: {
        agentRunId: "fixture-run-a",
        turnId: "fixture-turn-a",
        messageId: "fixture-message-a",
      },
    },
    data: {
      kind: "message.lifecycle",
      phase: "updated",
      role: "assistant",
      delta: "partial",
    },
  }));

  const messageEnd = make({
    surface: "sdk",
    sequenceDomain: "sdk-public-events",
    sourceSequence: 5,
    sourceEventType: "message_end",
    observedAtIndex: 8,
    correlation: {
      observed: {},
      normalized: {
        agentRunId: "fixture-run-a",
        turnId: "fixture-turn-a",
        messageId: "fixture-message-a",
      },
    },
    data: {
      kind: "message.lifecycle",
      phase: "ended",
      role: "assistant",
      contentKinds: ["text", "toolCall"],
      stopReason: "stop",
      body: { text: "fixture response" },
    },
  });
  events.push(messageEnd);

  const toolDeclaration = make({
    surface: "sdk",
    sequenceDomain: "sdk-public-events",
    sourceSequence: 6,
    sourceEventType: "tool_declared",
    observedAtIndex: 9,
    correlation: {
      observed: {},
      normalized: {
        agentRunId: "fixture-run-a",
        turnId: "fixture-turn-a",
        toolCallId: "fixture-tool-a",
      },
    },
    data: {
      kind: "tool.lifecycle",
      phase: "declared",
      toolName: "read",
      input: { path: "README.md" },
    },
  });
  events.push(toolDeclaration);

  events.push(make({
    surface: "sdk",
    sequenceDomain: "sdk-public-events",
    sourceSequence: 7,
    sourceEventType: "tool_started",
    observedAtIndex: 10,
    correlation: toolDeclaration.correlation,
    links: { sourceEventIds: [toolDeclaration.eventId] },
    data: {
      kind: "tool.lifecycle",
      phase: "started",
      toolName: "read",
    },
  }));

  events.push(make({
    surface: "sdk",
    sequenceDomain: "sdk-public-events",
    sourceSequence: 8,
    sourceEventType: "tool_completed",
    observedAtIndex: 11,
    correlation: toolDeclaration.correlation,
    links: { sourceEventIds: [toolDeclaration.eventId] },
    data: {
      kind: "tool.lifecycle",
      phase: "completed",
      toolName: "read",
      success: true,
      result: { bytes: 12 },
    },
  }));

  events.push(make({
    surface: "sdk",
    sequenceDomain: "sdk-public-events",
    sourceSequence: 9,
    sourceEventType: "queue_state",
    observedAtIndex: 12,
    correlation: {
      observed: {},
      normalized: { agentRunId: "fixture-run-a" },
    },
    data: {
      kind: "queue.changed",
      queue: "follow-up",
      pending: 1,
      mode: "one-at-a-time",
    },
  }));

  events.push(make({
    surface: "sdk",
    sequenceDomain: "sdk-public-events",
    sourceSequence: 10,
    sourceEventType: "turn_end",
    observedAtIndex: 13,
    correlation: {
      observed: {},
      normalized: { agentRunId: "fixture-run-a", turnId: "fixture-turn-a" },
    },
    data: { kind: "turn.lifecycle", phase: "ended", toolResultCount: 1 },
  }));

  events.push(make({
    surface: "sdk",
    sequenceDomain: "sdk-public-events",
    sourceSequence: 11,
    sourceEventType: "agent_end",
    observedAtIndex: 14,
    correlation: {
      observed: {},
      normalized: { agentRunId: "fixture-run-a" },
    },
    data: { kind: "agent.lifecycle", phase: "ended", willRetry: false },
  }));

  events.push(make({
    surface: "sdk",
    sequenceDomain: "sdk-public-events",
    sourceSequence: 12,
    sourceEventType: "agent_settled",
    observedAtIndex: 15,
    stability: "settled",
    correlation: {
      observed: {},
      normalized: { agentRunId: "fixture-run-a" },
    },
    data: { kind: "agent.lifecycle", phase: "settled" },
  }));

  events.push(make({
    surface: "rpc",
    sequenceDomain: "rpc-worker-output",
    sourceSequence: 2,
    sourceEventType: "state_snapshot",
    observedAtIndex: 16,
    data: {
      kind: "snapshot.state",
      state: { isStreaming: false, messageCount: 2, pendingMessageCount: 0 },
    },
  }));

  events.push(make({
    surface: "rpc",
    sequenceDomain: "rpc-worker-output",
    sourceSequence: 3,
    sourceEventType: "messages_snapshot",
    observedAtIndex: 17,
    data: {
      kind: "snapshot.messages",
      messages: [{ role: "assistant", text: "fixture response" }],
    },
  }));

  events.push(make({
    surface: "sdk",
    sequenceDomain: "sdk-public-events",
    sourceSequence: 13,
    sourceEventType: "compaction_end",
    observedAtIndex: 18,
    links: {
      sourceEventIds: [messageEnd.eventId],
      replacesEventIds: [messageEnd.eventId],
    },
    data: {
      kind: "compaction.lifecycle",
      phase: "completed",
      summaryKind: "context-summary",
    },
  }));

  events.push(make({
    surface: "host",
    sequenceDomain: "host-client-actions",
    sourceSequence: 2,
    sourceEventType: "host_close_stdin",
    observedAtIndex: 19,
    provenance: "host-synthesized",
    data: { kind: "host.action", action: "close-stdin" },
  }));

  events.push(make({
    surface: "extension",
    sequenceDomain: "extension-events",
    sourceSequence: 1,
    sourceEventType: "extension_shutdown",
    observedAtIndex: 20,
    data: {
      kind: "session.identity",
      action: "shutdown",
      reason: "quit",
      previousSessionIdentity: "session-object-1",
    },
  }));

  events.push(make({
    surface: "host",
    sequenceDomain: "process-boundaries",
    sourceSequence: 2,
    sourceEventType: "process_exit",
    observedAtIndex: 21,
    data: { kind: "process.boundary", boundary: "exit", code: 0, signal: null },
  }));

  events.push(make({
    surface: "host",
    sequenceDomain: "process-boundaries",
    sourceSequence: 3,
    sourceEventType: "process_close",
    observedAtIndex: 22,
    data: { kind: "process.boundary", boundary: "close", code: 0, signal: null },
  }));

  events.push(make({
    runtimeSessionId: sessionB,
    runtimeInstanceId: "fixture-worker-preflight",
    surface: "host",
    sequenceDomain: "host-client-actions",
    sourceSequence: 1,
    sourceEventType: "host_send_command",
    observedAtIndex: 23,
    provenance: "host-synthesized",
    correlation: {
      observed: { requestId: "fixture-request-b" },
      normalized: { promptId: "fixture-prompt-b", rpcRequestId: "fixture-rpc-b" },
    },
    data: {
      kind: "host.action",
      action: "send-command",
      command: "prompt",
      requestId: "fixture-request-b",
    },
  }));

  events.push(make({
    runtimeSessionId: sessionB,
    runtimeInstanceId: "fixture-worker-preflight",
    surface: "rpc",
    sequenceDomain: "rpc-worker-output",
    sourceSequence: 1,
    sourceEventType: "response",
    observedAtIndex: 24,
    correlation: {
      observed: { requestId: "fixture-request-b" },
      normalized: { promptId: "fixture-prompt-b", rpcRequestId: "fixture-rpc-b" },
    },
    data: {
      kind: "command.response",
      command: "prompt",
      success: false,
      phase: "preflight-result",
      error: { code: "credentials-missing", message: "No API key" },
    },
  }));

  events.push(make({
    runtimeSessionId: sessionC,
    runtimeInstanceId: "fixture-worker-cancel",
    surface: "sdk",
    sequenceDomain: "sdk-public-events",
    sourceSequence: 1,
    sourceEventType: "agent_start",
    observedAtIndex: 25,
    correlation: { observed: {}, normalized: { agentRunId: "fixture-run-c" } },
    data: { kind: "agent.lifecycle", phase: "started" },
  }));

  events.push(make({
    runtimeSessionId: sessionC,
    runtimeInstanceId: "fixture-worker-cancel",
    surface: "sdk",
    sequenceDomain: "sdk-public-events",
    sourceSequence: 2,
    sourceEventType: "turn_start",
    observedAtIndex: 26,
    correlation: {
      observed: {},
      normalized: { agentRunId: "fixture-run-c", turnId: "fixture-turn-c" },
    },
    data: { kind: "turn.lifecycle", phase: "started" },
  }));

  events.push(make({
    runtimeSessionId: sessionC,
    runtimeInstanceId: "fixture-worker-cancel",
    surface: "sdk",
    sequenceDomain: "sdk-public-events",
    sourceSequence: 3,
    sourceEventType: "message_start",
    observedAtIndex: 27,
    correlation: {
      observed: {},
      normalized: {
        agentRunId: "fixture-run-c",
        turnId: "fixture-turn-c",
        messageId: "fixture-message-c",
      },
    },
    data: { kind: "message.lifecycle", phase: "started", role: "assistant" },
  }));

  events.push(make({
    runtimeSessionId: sessionC,
    runtimeInstanceId: "fixture-worker-cancel",
    surface: "sdk",
    sequenceDomain: "sdk-public-events",
    sourceSequence: 4,
    sourceEventType: "message_end",
    observedAtIndex: 28,
    correlation: {
      observed: {},
      normalized: {
        agentRunId: "fixture-run-c",
        turnId: "fixture-turn-c",
        messageId: "fixture-message-c",
      },
    },
    data: {
      kind: "message.lifecycle",
      phase: "ended",
      role: "assistant",
      stopReason: "aborted",
      body: { text: "partial" },
    },
  }));

  events.push(make({
    runtimeSessionId: sessionC,
    runtimeInstanceId: "fixture-worker-cancel",
    surface: "sdk",
    sequenceDomain: "sdk-public-events",
    sourceSequence: 5,
    sourceEventType: "turn_end",
    observedAtIndex: 29,
    correlation: {
      observed: {},
      normalized: { agentRunId: "fixture-run-c", turnId: "fixture-turn-c" },
    },
    data: { kind: "turn.lifecycle", phase: "ended", toolResultCount: 0 },
  }));

  events.push(make({
    runtimeSessionId: sessionC,
    runtimeInstanceId: "fixture-worker-cancel",
    surface: "sdk",
    sequenceDomain: "sdk-public-events",
    sourceSequence: 6,
    sourceEventType: "agent_end",
    observedAtIndex: 30,
    correlation: { observed: {}, normalized: { agentRunId: "fixture-run-c" } },
    data: { kind: "agent.lifecycle", phase: "ended", willRetry: true },
  }));

  events.push(make({
    runtimeSessionId: sessionC,
    runtimeInstanceId: "fixture-worker-cancel",
    surface: "extension",
    sequenceDomain: "extension-events",
    sourceSequence: 1,
    sourceEventType: "retry_scheduled",
    observedAtIndex: 31,
    correlation: { observed: {}, normalized: { agentRunId: "fixture-run-c" } },
    data: {
      kind: "retry.lifecycle",
      phase: "scheduled",
      attempt: 2,
      delayMs: 1000,
      reason: "fixed failure",
    },
  }));

  events.push(make({
    runtimeSessionId: sessionC,
    runtimeInstanceId: "fixture-worker-cancel",
    surface: "extension",
    sequenceDomain: "extension-events",
    sourceSequence: 2,
    sourceEventType: "retry_aborted",
    observedAtIndex: 32,
    correlation: { observed: {}, normalized: { agentRunId: "fixture-run-c" } },
    data: {
      kind: "retry.lifecycle",
      phase: "aborted",
      attempt: 2,
      reason: "user-cancel",
    },
  }));

  events.push(make({
    runtimeSessionId: sessionC,
    runtimeInstanceId: "fixture-worker-cancel",
    surface: "sdk",
    sequenceDomain: "sdk-public-events",
    sourceSequence: 7,
    sourceEventType: "agent_settled",
    observedAtIndex: 33,
    stability: "settled",
    correlation: { observed: {}, normalized: { agentRunId: "fixture-run-c" } },
    data: { kind: "agent.lifecycle", phase: "settled" },
  }));

  events.push(make({
    runtimeInstanceId: "fixture-worker-2",
    surface: "host",
    sequenceDomain: "process-boundaries",
    sourceSequence: 1,
    sourceEventType: "process_spawn",
    observedAtIndex: 34,
    data: { kind: "process.boundary", boundary: "spawn" },
  }));

  events.push(make({
    runtimeInstanceId: "fixture-worker-2",
    surface: "extension",
    sequenceDomain: "extension-events",
    sourceSequence: 1,
    sourceEventType: "session_replaced",
    observedAtIndex: 35,
    data: {
      kind: "session.identity",
      action: "replaced",
      previousSessionIdentity: "session-object-1",
      nextSessionIdentity: "session-object-2",
      previousRuntimeInstanceId: "fixture-worker-1",
      nextRuntimeInstanceId: "fixture-worker-2",
    },
  }));

  events.push(make({
    runtimeInstanceId: "fixture-worker-2",
    surface: "extension",
    sequenceDomain: "extension-events",
    sourceSequence: 2,
    sourceEventType: "listener_rebound",
    observedAtIndex: 36,
    data: {
      kind: "session.identity",
      action: "listener-rebound",
      previousSessionIdentity: "session-object-1",
      nextSessionIdentity: "session-object-2",
    },
  }));

  events.push(make({
    runtimeInstanceId: "fixture-worker-2",
    surface: "host",
    sequenceDomain: "host-client-actions",
    sourceSequence: 1,
    sourceEventType: "host_request_signal",
    observedAtIndex: 37,
    provenance: "host-synthesized",
    data: {
      kind: "host.action",
      action: "request-signal",
      signal: "SIGTERM",
      accepted: true,
    },
  }));

  events.push(make({
    runtimeInstanceId: "fixture-worker-2",
    surface: "extension",
    sequenceDomain: "extension-events",
    sourceSequence: 3,
    sourceEventType: "extension_shutdown",
    observedAtIndex: 38,
    data: {
      kind: "session.identity",
      action: "shutdown",
      reason: "quit",
      previousSessionIdentity: "session-object-2",
    },
  }));

  events.push(make({
    runtimeInstanceId: "fixture-worker-2",
    surface: "host",
    sequenceDomain: "process-boundaries",
    sourceSequence: 2,
    sourceEventType: "process_exit",
    observedAtIndex: 39,
    data: { kind: "process.boundary", boundary: "exit", code: 143, signal: null },
  }));

  events.push(make({
    runtimeInstanceId: "fixture-worker-2",
    surface: "host",
    sequenceDomain: "process-boundaries",
    sourceSequence: 3,
    sourceEventType: "process_close",
    observedAtIndex: 40,
    data: { kind: "process.boundary", boundary: "close", code: 143, signal: null },
  }));

  events.push(make({
    runtimeInstanceId: "fixture-worker-2",
    surface: "extension",
    sequenceDomain: "extension-events",
    sourceSequence: 4,
    sourceEventType: "future_event",
    observedAtIndex: 41,
    compatibility: "ignorable",
    data: {
      kind: "runtime.unknown",
      sourceType: "future_event",
      keys: ["future", "type"],
      payloadSha256: "6180454abcf86cc4a5aa187bc3396dde1dbaa09bdf3608556c01fccab81189e6",
      canonicalization: "zhiwei-json-v1",
    },
  }));

  return events;
}
