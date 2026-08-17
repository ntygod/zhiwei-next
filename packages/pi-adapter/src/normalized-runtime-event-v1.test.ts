import assert from "node:assert/strict";
import test from "node:test";

import { ids } from "../../domain/src/index.ts";
import {
  parseNormalizedRuntimeEventTraceV1,
  type NormalizedRuntimeCorrelationV1,
  type NormalizedRuntimeEventV1,
} from "../../protocol/src/index.ts";
import {
  normalizePiRuntimeEventV1,
  type PiRuntimeEventInputV1,
  type PiRuntimeNormalizationInputV1,
} from "./normalized-runtime-event-v1.ts";

const workspaceId = ids.workspace("workspace-1");
const runtimeSessionId = ids.session("runtime-session-1");

function correlation(
  normalized: NormalizedRuntimeCorrelationV1["normalized"] = {},
  observed: NormalizedRuntimeCorrelationV1["observed"] = {},
): NormalizedRuntimeCorrelationV1 {
  return { observed, normalized };
}

function normalize(
  sourceSequence: number,
  event: PiRuntimeEventInputV1,
  overrides: Partial<PiRuntimeNormalizationInputV1> = {},
): NormalizedRuntimeEventV1 {
  return normalizePiRuntimeEventV1({
    workspaceId,
    runtimeSessionId,
    runtimeInstanceId: "worker-1",
    runtimeVersion: "0.84.1",
    surface: "sdk",
    sequenceDomain: "sdk-public-events",
    sourceSequence,
    sourceEventType: event.type,
    observedAt: `2026-08-15T01:00:00.${String(sourceSequence).padStart(3, "0")}Z`,
    provenance: "observed",
    correlation: correlation(),
    event,
    ...overrides,
  });
}

test("RPC Prompt response remains preflight acceptance and Host actions remain a separate domain", () => {
  const hostSend = normalize(1, {
    type: "host_send_command",
    command: "prompt",
    requestId: "request-1",
  }, {
    surface: "host",
    sequenceDomain: "host-client-actions",
    provenance: "host-synthesized",
    correlation: correlation({ promptId: "prompt-1", rpcRequestId: "rpc-1" }, { requestId: "request-1" }),
  });
  const accepted = normalize(1, {
    type: "command_response",
    command: "prompt",
    success: true,
  }, {
    surface: "rpc",
    sequenceDomain: "rpc-worker-output",
    sourceEventType: "response",
    correlation: correlation({ promptId: "prompt-1", rpcRequestId: "rpc-1" }, { requestId: "request-1" }),
  });
  const started = normalize(2, { type: "agent_start" }, {
    surface: "rpc",
    sequenceDomain: "rpc-worker-output",
    correlation: correlation({ promptId: "prompt-1", agentRunId: "run-1" }),
  });

  assert.deepEqual(accepted.data, {
    kind: "command.response",
    command: "prompt",
    success: true,
    phase: "preflight-result",
  });
  assert.equal(hostSend.sequence.value, 1);
  assert.equal(accepted.sequence.value, 1);
  assert.equal(parseNormalizedRuntimeEventTraceV1([hostSend, accepted, started]).length, 3);
});

test("Preflight rejection and accepted Provider failure retain different facts", () => {
  const rejected = normalize(1, {
    type: "command_response",
    command: "prompt",
    success: false,
    error: { code: "credentials-missing", message: "No API key" },
  }, {
    surface: "rpc",
    sequenceDomain: "rpc-worker-output",
    correlation: correlation({ promptId: "prompt-rejected", rpcRequestId: "rpc-rejected" }, { requestId: "request-rejected" }),
  });
  const accepted = normalize(2, {
    type: "command_response",
    command: "prompt",
    success: true,
  }, {
    surface: "rpc",
    sequenceDomain: "rpc-worker-output",
    correlation: correlation({ promptId: "prompt-error", rpcRequestId: "rpc-error" }, { requestId: "request-error" }),
  });
  const start = normalize(3, { type: "agent_start" }, {
    surface: "rpc",
    sequenceDomain: "rpc-worker-output",
    correlation: correlation({ promptId: "prompt-error", agentRunId: "run-error" }),
  });
  const messageStart = normalize(4, {
    type: "message_start",
    role: "assistant",
    contentKinds: [],
  }, {
    surface: "rpc",
    sequenceDomain: "rpc-worker-output",
    correlation: correlation({ agentRunId: "run-error", messageId: "message-error" }),
  });
  const messageEnd = normalize(5, {
    type: "message_end",
    role: "assistant",
    contentKinds: ["text"],
    stopReason: "error",
    errorMessage: "ZHIWEI_RPC_FIXED_PROVIDER_ERROR",
    body: { text: "" },
  }, {
    surface: "rpc",
    sequenceDomain: "rpc-worker-output",
    correlation: correlation({ agentRunId: "run-error", messageId: "message-error" }),
  });
  const end = normalize(6, { type: "agent_end", willRetry: false }, {
    surface: "rpc",
    sequenceDomain: "rpc-worker-output",
    correlation: correlation({ agentRunId: "run-error" }),
  });
  const settled = normalize(7, { type: "agent_settled" }, {
    surface: "rpc",
    sequenceDomain: "rpc-worker-output",
    correlation: correlation({ agentRunId: "run-error" }),
  });
  assert.equal(rejected.data.kind, "command.response");
  assert.doesNotThrow(() => parseNormalizedRuntimeEventTraceV1([
    rejected,
    accepted,
    start,
    messageStart,
    messageEnd,
    end,
    settled,
  ]));
  assert.equal(settled.stability, "settled");
});

test("Retry and Follow-up preserve Agent Run and Turn boundaries without invented guarantees", () => {
  const run1Start = normalize(1, { type: "agent_start" }, {
    correlation: correlation({ agentRunId: "run-1", promptId: "prompt-1" }),
  });
  const turn1Start = normalize(2, { type: "turn_start" }, {
    correlation: correlation({ agentRunId: "run-1", turnId: "turn-1" }),
  });
  const turn1End = normalize(3, { type: "turn_end", toolResultCount: 0 }, {
    correlation: correlation({ agentRunId: "run-1", turnId: "turn-1" }),
  });
  const followUpQueued = normalize(4, {
    type: "queue_state",
    queue: "follow-up",
    pending: 1,
    mode: "one-at-a-time",
  }, {
    correlation: correlation({ agentRunId: "run-1" }),
  });
  const turn2Start = normalize(5, { type: "turn_start" }, {
    correlation: correlation({ agentRunId: "run-1", turnId: "turn-2" }),
  });
  const queueEmpty = normalize(6, {
    type: "queue_state",
    queue: "follow-up",
    pending: 0,
    mode: "one-at-a-time",
  }, {
    correlation: correlation({ agentRunId: "run-1" }),
  });
  const turn2End = normalize(7, { type: "turn_end", toolResultCount: 0 }, {
    correlation: correlation({ agentRunId: "run-1", turnId: "turn-2" }),
  });
  const run1End = normalize(8, { type: "agent_end", willRetry: true }, {
    correlation: correlation({ agentRunId: "run-1" }),
  });

  assert.doesNotThrow(() => parseNormalizedRuntimeEventTraceV1([
    run1Start,
    turn1Start,
    turn1End,
    followUpQueued,
    turn2Start,
    queueEmpty,
    turn2End,
    run1End,
  ]));
  assert.equal(run1End.data.kind, "agent.lifecycle");
  assert.equal(run1End.data.phase, "ended");
  if (run1End.data.phase === "ended") assert.equal(run1End.data.willRetry, true);
});

test("Cancellation preserves partial Assistant text and can abort a planned Retry", () => {
  const start = normalize(1, { type: "agent_start" }, {
    correlation: correlation({ agentRunId: "cancel-run" }),
  });
  const turnStart = normalize(2, { type: "turn_start" }, {
    correlation: correlation({ agentRunId: "cancel-run", turnId: "cancel-turn" }),
  });
  const messageStart = normalize(3, { type: "message_start", role: "assistant" }, {
    correlation: correlation({ agentRunId: "cancel-run", turnId: "cancel-turn", messageId: "cancel-message" }),
  });
  const messageEnd = normalize(4, {
    type: "message_end",
    role: "assistant",
    stopReason: "aborted",
    body: { text: "partial" },
  }, {
    correlation: correlation({ agentRunId: "cancel-run", turnId: "cancel-turn", messageId: "cancel-message" }),
  });
  const turnEnd = normalize(5, { type: "turn_end", toolResultCount: 0 }, {
    correlation: correlation({ agentRunId: "cancel-run", turnId: "cancel-turn" }),
  });
  const end = normalize(6, { type: "agent_end", willRetry: true }, {
    correlation: correlation({ agentRunId: "cancel-run" }),
  });
  const aborted = normalize(7, { type: "retry_aborted", reason: "user-cancel" }, {
    surface: "extension",
    sequenceDomain: "extension-events",
    correlation: correlation({ agentRunId: "cancel-run" }),
  });
  const settled = normalize(8, { type: "agent_settled" }, {
    correlation: correlation({ agentRunId: "cancel-run" }),
  });

  assert.doesNotThrow(() => parseNormalizedRuntimeEventTraceV1([
    start,
    turnStart,
    messageStart,
    messageEnd,
    turnEnd,
    end,
    aborted,
    settled,
  ]));
  assert.deepEqual(messageEnd.data, {
    kind: "message.lifecycle",
    phase: "ended",
    role: "assistant",
    stopReason: "aborted",
    body: { text: "partial" },
  });
});

test("Parallel Tool completion cites declarations instead of borrowing array order", () => {
  const declared = ["alpha", "beta", "gamma"].map((name, index) =>
    normalize(index + 1, {
      type: "tool_declared",
      toolName: name,
      input: { name },
    }, {
      correlation: correlation({ toolCallId: `tool-${name}` }),
    }),
  );
  const completionOrder = ["beta", "gamma", "alpha"];
  const completed = completionOrder.map((name, index) => {
    const declaration = declared.find(
      (item) => item.correlation.normalized.toolCallId === `tool-${name}`,
    )!;
    return normalize(index + 4, {
      type: "tool_completed",
      toolName: name,
      success: true,
      result: { name, completed: true },
    }, {
      correlation: correlation({ toolCallId: `tool-${name}` }),
      links: { sourceEventIds: [declaration.eventId] },
    });
  });

  assert.doesNotThrow(() => parseNormalizedRuntimeEventTraceV1([...declared, ...completed]));
  assert.deepEqual(
    completed.map((item) => item.data.kind === "tool.lifecycle" ? item.data.toolName : ""),
    completionOrder,
  );
});

test("Compaction and Session Replacement preserve real Extension/Host ownership", () => {
  const messageStart = normalize(1, {
    type: "message_start",
    role: "assistant",
  }, {
    correlation: correlation({ messageId: "message-1" }),
  });
  const original = normalize(2, {
    type: "message_end",
    role: "assistant",
    body: { text: "raw observation" },
  }, {
    correlation: correlation({ messageId: "message-1" }),
  });
  const compactionStart = normalize(3, {
    type: "compaction_start",
    reason: "manual",
  });
  const compaction = normalize(4, {
    type: "compaction_end",
    summaryKind: "context-summary",
  }, {
    links: {
      sourceEventIds: [compactionStart.eventId, original.eventId],
      replacesEventIds: [original.eventId],
    },
  });
  const oldShutdown = normalize(1, {
    type: "extension_shutdown",
    reason: "new",
    previousSessionIdentity: "session-object-1",
  }, {
    surface: "extension",
    sequenceDomain: "extension-events",
  });
  const invalidated = normalize(1, {
    type: "session_invalidated",
    reason: "new",
    previousSessionIdentity: "session-object-1",
  }, {
    surface: "host",
    sequenceDomain: "session-orchestration",
    provenance: "host-synthesized",
  });
  const newStart = normalize(1, {
    type: "session_start",
    previousSessionIdentity: "session-object-1",
    nextSessionIdentity: "session-object-2",
  }, {
    runtimeInstanceId: "worker-2",
    surface: "extension",
    sequenceDomain: "extension-events",
  });
  const replacement = normalize(1, {
    type: "session_replaced",
    previousSessionIdentity: "session-object-1",
    nextSessionIdentity: "session-object-2",
    previousRuntimeInstanceId: "worker-1",
    nextRuntimeInstanceId: "worker-2",
  }, {
    runtimeInstanceId: "worker-2",
    surface: "host",
    sequenceDomain: "session-orchestration",
    provenance: "host-synthesized",
    links: { sourceEventIds: [oldShutdown.eventId, newStart.eventId] },
  });
  const rebound = normalize(2, {
    type: "listener_rebound",
    previousSessionIdentity: "session-object-1",
    nextSessionIdentity: "session-object-2",
  }, {
    runtimeInstanceId: "worker-2",
    surface: "host",
    sequenceDomain: "session-orchestration",
    provenance: "host-synthesized",
  });

  assert.doesNotThrow(() => parseNormalizedRuntimeEventTraceV1([
    messageStart,
    original,
    compactionStart,
    compaction,
    oldShutdown,
    invalidated,
    newStart,
    replacement,
    rebound,
  ]));
  assert.equal(oldShutdown.source.surface, "extension");
  assert.equal(invalidated.provenance, "host-synthesized");
  assert.equal(replacement.source.surface, "host");
  assert.equal(rebound.source.surface, "host");
});

test("Extension shutdown remains Session identity and is not collapsed into Process exit", () => {
  const shutdown = normalize(1, {
    type: "extension_shutdown",
    reason: "quit",
    previousSessionIdentity: "session-object-1",
  }, {
    surface: "extension",
    sequenceDomain: "extension-events",
  });
  assert.deepEqual(shutdown.data, {
    kind: "session.identity",
    action: "shutdown",
    reason: "quit",
    previousSessionIdentity: "session-object-1",
  });
});

test("State and Messages snapshots are projected field-by-field instead of passing raw Pi objects", () => {
  const state = normalize(1, {
    type: "state_snapshot",
    state: {
      isStreaming: false,
      messageCount: 2,
      pendingMessageCount: 0,
      isIdle: true,
      provider: { raw: true },
    } as any,
  });
  const messages = normalize(2, {
    type: "messages_snapshot",
    messages: [
      {
        role: "assistant",
        contentKinds: ["text"],
        stopReason: "stop",
        text: "answer",
        rawSdkMessage: { hidden: true },
      } as any,
    ],
  });
  assert.equal(JSON.stringify(state.data).includes("provider"), false);
  assert.equal(JSON.stringify(messages.data).includes("rawSdkMessage"), false);
});

test("Unknown Pi payload is reduced to a canonical diagnostic, not passed through", () => {
  const unknown = normalize(1, {
    type: "unknown",
    sourceType: "future_event",
    payload: { z: 2, a: 1 },
    compatibility: "ignorable",
  });

  assert.deepEqual(unknown.data, {
    kind: "runtime.unknown",
    sourceType: "future_event",
    keys: ["a", "z"],
    payloadSha256: "99168216144c7fed5d4c54916cf98d9c66096280c04a499822a99b6658bd177a",
    canonicalization: "zhiwei-json-v1",
  });
  assert.equal("payload" in unknown.data, false);
});

test("Adapter does not invent missing correlation IDs", () => {
  const event = normalize(1, { type: "agent_start" });
  assert.deepEqual(event.correlation, { observed: {}, normalized: {} });
});

test("Host EOF and signal requests remain actions while exit and close remain observed boundaries", () => {
  const eof = normalize(1, { type: "host_close_stdin" }, {
    surface: "host",
    sequenceDomain: "host-client-actions",
    provenance: "host-synthesized",
  });
  const signal = normalize(1, {
    type: "host_request_signal",
    signal: "SIGTERM",
    accepted: true,
  }, {
    runtimeInstanceId: "worker-2",
    surface: "host",
    sequenceDomain: "host-client-actions",
    provenance: "host-synthesized",
  });
  const exit = normalize(1, { type: "process_exit", code: 143, signal: null }, {
    runtimeInstanceId: "worker-2",
    surface: "host",
    sequenceDomain: "process-boundaries",
  });
  const close = normalize(2, { type: "process_close", code: 143, signal: null }, {
    runtimeInstanceId: "worker-2",
    surface: "host",
    sequenceDomain: "process-boundaries",
  });

  assert.deepEqual(eof.data, { kind: "host.action", action: "close-stdin" });
  assert.deepEqual(signal.data, {
    kind: "host.action",
    action: "request-signal",
    signal: "SIGTERM",
    accepted: true,
  });
  assert.equal(exit.data.kind, "process.boundary");
  assert.equal(close.data.kind, "process.boundary");
  assert.doesNotThrow(() => parseNormalizedRuntimeEventTraceV1([eof, signal, exit, close]));
});
