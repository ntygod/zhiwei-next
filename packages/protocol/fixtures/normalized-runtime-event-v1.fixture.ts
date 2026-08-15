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
  evidence: {
    retrySuccess: {
      path: "packages/pi-adapter/fixtures/pi-lifecycle-retry-success.json",
      field: "contractFingerprint",
      value: "e87f7365eefbb4d7de7a4570a6c99df7a1fdf26f58aa2a40fab9149cb6deff02",
    },
    cancelRetryExhaustion: {
      path: "packages/pi-adapter/fixtures/pi-lifecycle-cancel-retry-exhaustion.json",
      field: "contractFingerprint",
      value: "b866798d18569c78d5c712254c3ecdecd7a3e02c0ef11458e6b97b0863b1f6e0",
    },
    parallelToolOrdering: {
      path: "packages/pi-adapter/fixtures/pi-lifecycle-parallel-tool-ordering.json",
      field: "contractFingerprint",
      value: "fd372a8e73f4545bd7a34c6ac3e82cfc2d044dca473ae374627b847864389b02",
    },
    compactionSessionReplacement: {
      path: "packages/pi-adapter/fixtures/pi-lifecycle-compaction-session-replacement.json",
      field: "contractFingerprint",
      value: "9ebe87b12f0670214fa1244239d21d7a517b2332da2f3f85b3372b8b6895ab75",
    },
    sdkRpcParity: {
      path: "packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/manifest.json",
      field: "outerContractFingerprint",
      value: "c99bcfb2872736e085750690965dd11dce1bc873b14b905b53a1e57defa3dcbf",
    },
    rpcWorkerLifecycle: {
      path: "packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle-manifest-v2.json",
      field: "outerContractFingerprint",
      value: "b4715e2b896258fddec81e2f25f4c28056d24a8562547f46d6305127ebe0053c",
    },
  },
});

const workspaceId = ids.workspace("fixture-workspace");
const sessionA = ids.session("fixture-session-a");
const sessionB = ids.session("fixture-session-b");
const sessionC = ids.session("fixture-session-c");
const sessionD = ids.session("fixture-session-d");
const sessionR = ids.session("fixture-session-replacement");

interface FixtureInput {
  readonly runtimeSessionId?: ReturnType<typeof ids.session>;
  readonly runtimeInstanceId?: string;
  readonly surface: NormalizedRuntimeSourceSurfaceV1;
  readonly sequenceDomain: string;
  readonly sourceEventType: string;
  readonly provenance?: NormalizedRuntimeProvenanceV1;
  readonly compatibility?: "required" | "ignorable";
  readonly persistence?: "durable" | "ephemeral";
  readonly stability?: "update" | "boundary" | "settled";
  readonly correlation?: NormalizedRuntimeCorrelationV1;
  readonly links?: NormalizedRuntimeLinksV1;
  readonly data: NormalizedRuntimePayloadV1;
}

function timestamp(index: number): IsoTimestamp {
  const minute = Math.floor(index / 60);
  const second = index % 60;
  return `2026-08-15T02:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}.000Z` as IsoTimestamp;
}
function emptyCorrelation(): NormalizedRuntimeCorrelationV1 {
  return { observed: {}, normalized: {} };
}

export function buildNormalizedRuntimeEventV1Fixture(): readonly NormalizedRuntimeEventV1[] {
  const events: NormalizedRuntimeEventV1[] = [];
  const streamSequences = new Map<string, number>();
  let observedAtIndex = 1;

  const append = (input: FixtureInput): NormalizedRuntimeEventV1 => {
    const runtimeSessionId = input.runtimeSessionId ?? sessionA;
    const runtimeInstanceId = input.runtimeInstanceId ?? "fixture-worker-1";
    const stream = JSON.stringify([
      runtimeSessionId,
      runtimeInstanceId,
      input.surface,
      input.sequenceDomain,
    ]);
    const sourceSequence = (streamSequences.get(stream) ?? 0) + 1;
    streamSequences.set(stream, sourceSequence);
    const event = createNormalizedRuntimeEventV1({
      protocolVersion: 1,
      workspaceId,
      runtimeSessionId,
      runtimeInstanceId,
      source: {
        adapter: "pi",
        runtime: {
          implementation: "@earendil-works/pi-coding-agent",
          version: NORMALIZED_RUNTIME_EVENT_V1_FIXTURE_SOURCE.runtimeVersion,
        },
        surface: input.surface,
        eventType: input.sourceEventType,
      },
      sequence: { domain: input.sequenceDomain, value: sourceSequence },
      observedAt: timestamp(observedAtIndex),
      provenance: input.provenance ?? "observed",
      persistence: input.persistence ?? "durable",
      stability: input.stability ?? "boundary",
      compatibility: input.compatibility ?? "required",
      correlation: input.correlation ?? emptyCorrelation(),
      ...(input.links ? { links: input.links } : {}),
      data: input.data,
    } satisfies NormalizedRuntimeEventDraftV1);
    observedAtIndex += 1;
    events.push(event);
    return event;
  };

  append({
    surface: "host",
    sequenceDomain: "host-client-actions",
    sourceEventType: "host_send_command",
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
  append({
    surface: "host",
    sequenceDomain: "process-boundaries",
    sourceEventType: "process_spawn",
    data: { kind: "process.boundary", boundary: "spawn" },
  });
  append({
    surface: "rpc",
    sequenceDomain: "rpc-worker-output",
    sourceEventType: "response",
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
  });

  append({
    surface: "sdk",
    sequenceDomain: "sdk-public-events",
    sourceEventType: "agent_start",
    correlation: { observed: {}, normalized: { promptId: "fixture-prompt-a", agentRunId: "fixture-run-a" } },
    data: { kind: "agent.lifecycle", phase: "started" },
  });
  append({
    surface: "sdk",
    sequenceDomain: "sdk-public-events",
    sourceEventType: "turn_start",
    correlation: { observed: {}, normalized: { agentRunId: "fixture-run-a", turnId: "fixture-turn-a" } },
    data: { kind: "turn.lifecycle", phase: "started" },
  });
  append({
    surface: "sdk",
    sequenceDomain: "sdk-public-events",
    sourceEventType: "message_start",
    correlation: {
      observed: {},
      normalized: {
        agentRunId: "fixture-run-a",
        turnId: "fixture-turn-a",
        messageId: "fixture-message-a",
      },
    },
    data: { kind: "message.lifecycle", phase: "started", role: "assistant", contentKinds: [] },
  });
  append({
    surface: "sdk",
    sequenceDomain: "sdk-public-events",
    sourceEventType: "message_update",
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
    data: { kind: "message.lifecycle", phase: "updated", role: "assistant", delta: "partial" },
  });
  const messageEnd = append({
    surface: "sdk",
    sequenceDomain: "sdk-public-events",
    sourceEventType: "message_end",
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
      contentKinds: ["text", "tool-call"],
      stopReason: "stop",
      body: { text: "fixture response" },
    },
  });

  const declarations = new Map<string, NormalizedRuntimeEventV1>();
  for (const name of ["alpha", "beta", "gamma"]) {
    const declaration = append({
      surface: "sdk",
      sequenceDomain: "sdk-public-events",
      sourceEventType: "tool_declared",
      correlation: {
        observed: {},
        normalized: {
          agentRunId: "fixture-run-a",
          turnId: "fixture-turn-a",
          toolCallId: `fixture-tool-${name}`,
        },
      },
      data: {
        kind: "tool.lifecycle",
        phase: "declared",
        toolName: name,
        input: { name },
      },
    });
    declarations.set(name, declaration);
  }
  for (const name of ["alpha", "beta", "gamma"]) {
    const declaration = declarations.get(name)!;
    append({
      surface: "sdk",
      sequenceDomain: "sdk-public-events",
      sourceEventType: "tool_started",
      correlation: declaration.correlation,
      links: { sourceEventIds: [declaration.eventId] },
      data: { kind: "tool.lifecycle", phase: "started", toolName: name },
    });
  }
  for (const name of ["beta", "gamma", "alpha"]) {
    const declaration = declarations.get(name)!;
    append({
      surface: "sdk",
      sequenceDomain: "sdk-public-events",
      sourceEventType: "tool_completed",
      correlation: declaration.correlation,
      links: { sourceEventIds: [declaration.eventId] },
      data: {
        kind: "tool.lifecycle",
        phase: "completed",
        toolName: name,
        success: true,
        result: { name, completed: true },
      },
    });
  }

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
        { role: "tool", contentKinds: ["tool-result"], text: "alpha" },
        { role: "tool", contentKinds: ["tool-result"], text: "beta" },
        { role: "tool", contentKinds: ["tool-result"], text: "gamma" },
      ],
    },
  });
  append({
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
      sourceEventIds: [messageEnd.eventId],
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

  append({
    runtimeSessionId: sessionB,
    runtimeInstanceId: "fixture-worker-preflight",
    surface: "host",
    sequenceDomain: "host-client-actions",
    sourceEventType: "host_send_command",
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
  });
  append({
    runtimeSessionId: sessionB,
    runtimeInstanceId: "fixture-worker-preflight",
    surface: "rpc",
    sequenceDomain: "rpc-worker-output",
    sourceEventType: "response",
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
  });

  append({
    runtimeSessionId: sessionC,
    runtimeInstanceId: "fixture-worker-cancel",
    surface: "sdk",
    sequenceDomain: "sdk-public-events",
    sourceEventType: "agent_start",
    correlation: { observed: {}, normalized: { agentRunId: "fixture-run-c" } },
    data: { kind: "agent.lifecycle", phase: "started" },
  });
  append({
    runtimeSessionId: sessionC,
    runtimeInstanceId: "fixture-worker-cancel",
    surface: "sdk",
    sequenceDomain: "sdk-public-events",
    sourceEventType: "turn_start",
    correlation: { observed: {}, normalized: { agentRunId: "fixture-run-c", turnId: "fixture-turn-c" } },
    data: { kind: "turn.lifecycle", phase: "started" },
  });
  append({
    runtimeSessionId: sessionC,
    runtimeInstanceId: "fixture-worker-cancel",
    surface: "sdk",
    sequenceDomain: "sdk-public-events",
    sourceEventType: "message_start",
    correlation: {
      observed: {},
      normalized: {
        agentRunId: "fixture-run-c",
        turnId: "fixture-turn-c",
        messageId: "fixture-message-c",
      },
    },
    data: { kind: "message.lifecycle", phase: "started", role: "assistant" },
  });
  append({
    runtimeSessionId: sessionC,
    runtimeInstanceId: "fixture-worker-cancel",
    surface: "sdk",
    sequenceDomain: "sdk-public-events",
    sourceEventType: "message_end",
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
  });
  append({
    runtimeSessionId: sessionC,
    runtimeInstanceId: "fixture-worker-cancel",
    surface: "sdk",
    sequenceDomain: "sdk-public-events",
    sourceEventType: "turn_end",
    correlation: { observed: {}, normalized: { agentRunId: "fixture-run-c", turnId: "fixture-turn-c" } },
    data: { kind: "turn.lifecycle", phase: "ended", toolResultCount: 0 },
  });
  append({
    runtimeSessionId: sessionC,
    runtimeInstanceId: "fixture-worker-cancel",
    surface: "sdk",
    sequenceDomain: "sdk-public-events",
    sourceEventType: "agent_end",
    correlation: { observed: {}, normalized: { agentRunId: "fixture-run-c" } },
    data: { kind: "agent.lifecycle", phase: "ended", willRetry: true },
  });
  append({
    runtimeSessionId: sessionC,
    runtimeInstanceId: "fixture-worker-cancel",
    surface: "extension",
    sequenceDomain: "extension-events",
    sourceEventType: "retry_scheduled",
    correlation: { observed: {}, normalized: { agentRunId: "fixture-run-c" } },
    data: {
      kind: "retry.lifecycle",
      phase: "scheduled",
      attempt: 2,
      delayMs: 1000,
      reason: "fixed failure",
    },
  });
  append({
    runtimeSessionId: sessionC,
    runtimeInstanceId: "fixture-worker-cancel",
    surface: "extension",
    sequenceDomain: "extension-events",
    sourceEventType: "retry_aborted",
    correlation: { observed: {}, normalized: { agentRunId: "fixture-run-c" } },
    data: { kind: "retry.lifecycle", phase: "aborted", attempt: 2, reason: "user-cancel" },
  });
  append({
    runtimeSessionId: sessionC,
    runtimeInstanceId: "fixture-worker-cancel",
    surface: "sdk",
    sequenceDomain: "sdk-public-events",
    sourceEventType: "agent_settled",
    stability: "settled",
    correlation: { observed: {}, normalized: { agentRunId: "fixture-run-c" } },
    data: { kind: "agent.lifecycle", phase: "settled" },
  });

  append({
    runtimeSessionId: sessionD,
    runtimeInstanceId: "fixture-worker-exhausted",
    surface: "sdk",
    sequenceDomain: "sdk-public-events",
    sourceEventType: "agent_start",
    correlation: { observed: {}, normalized: { agentRunId: "fixture-run-d" } },
    data: { kind: "agent.lifecycle", phase: "started" },
  });
  append({
    runtimeSessionId: sessionD,
    runtimeInstanceId: "fixture-worker-exhausted",
    surface: "sdk",
    sequenceDomain: "sdk-public-events",
    sourceEventType: "message_start",
    correlation: { observed: {}, normalized: { agentRunId: "fixture-run-d", messageId: "fixture-message-d" } },
    data: { kind: "message.lifecycle", phase: "started", role: "assistant" },
  });
  append({
    runtimeSessionId: sessionD,
    runtimeInstanceId: "fixture-worker-exhausted",
    surface: "sdk",
    sequenceDomain: "sdk-public-events",
    sourceEventType: "message_end",
    correlation: { observed: {}, normalized: { agentRunId: "fixture-run-d", messageId: "fixture-message-d" } },
    data: {
      kind: "message.lifecycle",
      phase: "ended",
      role: "assistant",
      stopReason: "error",
      errorMessage: "retry exhausted",
      body: { text: "" },
    },
  });
  append({
    runtimeSessionId: sessionD,
    runtimeInstanceId: "fixture-worker-exhausted",
    surface: "sdk",
    sequenceDomain: "sdk-public-events",
    sourceEventType: "agent_end",
    correlation: { observed: {}, normalized: { agentRunId: "fixture-run-d" } },
    data: { kind: "agent.lifecycle", phase: "ended", willRetry: false },
  });
  append({
    runtimeSessionId: sessionD,
    runtimeInstanceId: "fixture-worker-exhausted",
    surface: "extension",
    sequenceDomain: "extension-events",
    sourceEventType: "retry_exhausted",
    correlation: { observed: {}, normalized: { agentRunId: "fixture-run-d" } },
    data: { kind: "retry.lifecycle", phase: "exhausted", attempt: 3, reason: "maximum attempts" },
  });
  append({
    runtimeSessionId: sessionD,
    runtimeInstanceId: "fixture-worker-exhausted",
    surface: "sdk",
    sequenceDomain: "sdk-public-events",
    sourceEventType: "agent_settled",
    stability: "settled",
    correlation: { observed: {}, normalized: { agentRunId: "fixture-run-d" } },
    data: { kind: "agent.lifecycle", phase: "settled" },
  });

  append({
    runtimeSessionId: sessionR,
    runtimeInstanceId: "fixture-worker-r1",
    surface: "host",
    sequenceDomain: "process-boundaries",
    sourceEventType: "process_spawn",
    data: { kind: "process.boundary", boundary: "spawn" },
  });
  append({
    runtimeSessionId: sessionR,
    runtimeInstanceId: "fixture-worker-r1",
    surface: "extension",
    sequenceDomain: "extension-events",
    sourceEventType: "session_start",
    data: { kind: "session.identity", action: "started", nextSessionIdentity: "session-object-r1" },
  });
  const oldShutdown = append({
    runtimeSessionId: sessionR,
    runtimeInstanceId: "fixture-worker-r1",
    surface: "extension",
    sequenceDomain: "extension-events",
    sourceEventType: "session_shutdown",
    data: {
      kind: "session.identity",
      action: "shutdown",
      reason: "new",
      previousSessionIdentity: "session-object-r1",
    },
  });
  append({
    runtimeSessionId: sessionR,
    runtimeInstanceId: "fixture-worker-r1",
    surface: "host",
    sequenceDomain: "session-orchestration",
    sourceEventType: "session_invalidated",
    provenance: "host-synthesized",
    data: {
      kind: "session.identity",
      action: "invalidated",
      reason: "new",
      previousSessionIdentity: "session-object-r1",
    },
  });
  append({
    runtimeSessionId: sessionR,
    runtimeInstanceId: "fixture-worker-r2",
    surface: "host",
    sequenceDomain: "process-boundaries",
    sourceEventType: "process_spawn",
    data: { kind: "process.boundary", boundary: "spawn" },
  });
  const newStart = append({
    runtimeSessionId: sessionR,
    runtimeInstanceId: "fixture-worker-r2",
    surface: "extension",
    sequenceDomain: "extension-events",
    sourceEventType: "session_start",
    data: {
      kind: "session.identity",
      action: "started",
      previousSessionIdentity: "session-object-r1",
      nextSessionIdentity: "session-object-r2",
    },
  });
  append({
    runtimeSessionId: sessionR,
    runtimeInstanceId: "fixture-worker-r2",
    surface: "host",
    sequenceDomain: "session-orchestration",
    sourceEventType: "session_replaced",
    provenance: "host-synthesized",
    links: { sourceEventIds: [oldShutdown.eventId, newStart.eventId] },
    data: {
      kind: "session.identity",
      action: "replaced",
      previousSessionIdentity: "session-object-r1",
      nextSessionIdentity: "session-object-r2",
      previousRuntimeInstanceId: "fixture-worker-r1",
      nextRuntimeInstanceId: "fixture-worker-r2",
    },
  });
  append({
    runtimeSessionId: sessionR,
    runtimeInstanceId: "fixture-worker-r2",
    surface: "host",
    sequenceDomain: "session-orchestration",
    sourceEventType: "listener_rebound",
    provenance: "host-synthesized",
    data: {
      kind: "session.identity",
      action: "listener-rebound",
      previousSessionIdentity: "session-object-r1",
      nextSessionIdentity: "session-object-r2",
    },
  });
  append({
    runtimeSessionId: sessionR,
    runtimeInstanceId: "fixture-worker-r2",
    surface: "host",
    sequenceDomain: "host-client-actions",
    sourceEventType: "host_request_signal",
    provenance: "host-synthesized",
    data: { kind: "host.action", action: "request-signal", signal: "SIGTERM", accepted: true },
  });
  append({
    runtimeSessionId: sessionR,
    runtimeInstanceId: "fixture-worker-r2",
    surface: "extension",
    sequenceDomain: "extension-events",
    sourceEventType: "extension_shutdown",
    data: {
      kind: "session.identity",
      action: "shutdown",
      reason: "quit",
      previousSessionIdentity: "session-object-r2",
    },
  });
  append({
    runtimeSessionId: sessionR,
    runtimeInstanceId: "fixture-worker-r2",
    surface: "host",
    sequenceDomain: "process-boundaries",
    sourceEventType: "process_exit",
    data: { kind: "process.boundary", boundary: "exit", code: 143, signal: null },
  });
  append({
    runtimeSessionId: sessionR,
    runtimeInstanceId: "fixture-worker-r2",
    surface: "host",
    sequenceDomain: "process-boundaries",
    sourceEventType: "process_close",
    data: { kind: "process.boundary", boundary: "close", code: 143, signal: null },
  });
  append({
    runtimeSessionId: sessionR,
    runtimeInstanceId: "fixture-worker-r2",
    surface: "extension",
    sequenceDomain: "extension-events",
    sourceEventType: "future_event",
    compatibility: "ignorable",
    data: {
      kind: "runtime.unknown",
      sourceType: "future_event",
      keys: ["future", "type"],
      payloadSha256: "6180454abcf86cc4a5aa187bc3396dde1dbaa09bdf3608556c01fccab81189e6",
      canonicalization: "zhiwei-json-v1",
    },
  });

  return events;
}
