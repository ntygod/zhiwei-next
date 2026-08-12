import assert from "node:assert/strict";
import test from "node:test";

import {
  assertRuntimeEventStream,
  type NormalizedRuntimeEvent,
} from "../../protocol/src/runtime-events.ts";
import {
  normalizePiRuntimeEvent,
  normalizePiRuntimeEvents,
  type PiNormalizationContext,
  type PiRuntimeEventWithContext,
  type PiRuntimeInput,
} from "./normalize-runtime-event.ts";

const OBSERVED_AT = "2026-08-12T01:00:00.000Z";

function context(
  sourceSequence: number,
  overrides: Partial<PiNormalizationContext> = {},
): PiNormalizationContext {
  return {
    workspaceId: "workspace-a",
    runtimeSessionId: "runtime-session-a",
    sourceSurface: "sdk",
    sourceSequence,
    observedAt: OBSERVED_AT,
    correlation: {},
    ...overrides,
  };
}

function normalize(
  input: PiRuntimeInput,
  sourceSequence = 1,
  overrides: Partial<PiNormalizationContext> = {},
): NormalizedRuntimeEvent {
  return normalizePiRuntimeEvent(context(sourceSequence, overrides), input);
}

function event(
  input: PiRuntimeInput,
  sourceSequence: number,
  overrides: Partial<PiNormalizationContext> = {},
): PiRuntimeEventWithContext {
  return { context: context(sourceSequence, overrides), input };
}

test("normal SDK run keeps agent_end and final settled as distinct boundaries", () => {
  const events = normalizePiRuntimeEvents([
    event({ type: "agent_start" }, 1, { correlation: { promptId: "prompt-1", agentRunId: "run-1" } }),
    event({ type: "agent_end", willRetry: false }, 2, {
      correlation: { promptId: "prompt-1", agentRunId: "run-1" },
    }),
    event({ type: "agent_settled" }, 3, {
      correlation: { promptId: "prompt-1", agentRunId: "run-1" },
    }),
  ]);

  assert.equal(events[1].data.kind, "agent-run");
  assert.deepEqual(events[1].data, { kind: "agent-run", phase: "ended", willRetry: false });
  assert.equal(events[1].durability, "boundary");
  assert.deepEqual(events[2].data, { kind: "agent-run", phase: "settled" });
  assert.equal(events[2].durability, "stable");
});

test("Extension agent_end preserves the missing willRetry field as unknown", () => {
  const event = normalize(
    { type: "agent_end" },
    1,
    {
      sourceSurface: "extension",
      correlation: { agentRunId: "run-1" },
    },
  );

  assert.equal(event.sourceSurface, "extension");
  assert.deepEqual(event.data, { kind: "agent-run", phase: "ended", willRetry: "unknown" });
});

test("Retry backoff cancellation allows willRetry=true without a later Agent Run", () => {
  const events = normalizePiRuntimeEvents([
    event({ type: "agent_start" }, 1, { correlation: { promptId: "prompt-1", agentRunId: "run-1" } }),
    event({ type: "agent_end", willRetry: true }, 2, {
      correlation: { promptId: "prompt-1", agentRunId: "run-1" },
    }),
    event(
      {
        type: "auto_retry_start",
        attempt: 1,
        maxAttempts: 3,
        delayMs: 10_000,
        errorCode: "overloaded_error",
      },
      3,
      { correlation: { promptId: "prompt-1", agentRunId: "run-1" } },
    ),
    event(
      {
        type: "auto_retry_end",
        attempt: 1,
        success: false,
        errorCode: "retry-cancelled",
      },
      4,
      { correlation: { promptId: "prompt-1", agentRunId: "run-1" } },
    ),
    event({ type: "agent_settled" }, 5, {
      correlation: { promptId: "prompt-1", agentRunId: "run-1" },
    }),
  ]);

  assert.equal(events.filter((item) => item.data.kind === "agent-run" && item.data.phase === "started").length, 1);
  assert.deepEqual(events[1].data, { kind: "agent-run", phase: "ended", willRetry: true });
  assert.deepEqual(events[3].data, {
    kind: "retry",
    phase: "completed",
    attempt: 1,
    success: false,
    errorCode: "retry-cancelled",
  });
  assert.equal(events[4].durability, "stable");
});

test("Follow-up queue empty snapshot is not Prompt completion", () => {
  const queueFilled = normalize(
    { type: "queue_update", steeringCount: 0, followUpCount: 1, followUpRefs: ["msg:follow-up-1"] },
    1,
    { correlation: { promptId: "prompt-1", agentRunId: "run-1" } },
  );
  const queueEmpty = normalize(
    { type: "queue_update", steeringCount: 0, followUpCount: 0 },
    2,
    { correlation: { promptId: "prompt-1", agentRunId: "run-1" } },
  );
  const settled = normalize(
    { type: "prompt_settled" },
    3,
    {
      sourceSurface: "host",
      correlation: { promptId: "prompt-1", agentRunId: "run-1" },
    },
  );

  assert.equal(queueFilled.data.kind, "queue");
  assert.equal(queueEmpty.data.kind, "queue");
  assert.equal(queueEmpty.durability, "boundary");
  assert.equal(settled.data.kind, "prompt");
  assert.equal(settled.durability, "stable");
});

test("partial Assistant cancellation keeps the completed aborted message boundary", () => {
  const delta = normalize(
    {
      type: "message_update",
      role: "assistant",
      stopReason: "pending",
      contentLength: 64,
      contentRef: "sha256:partial",
    },
    1,
    { correlation: { promptId: "prompt-1", turnId: "turn-1", messageId: "assistant-1" } },
  );
  const completed = normalize(
    {
      type: "message_end",
      role: "assistant",
      stopReason: "aborted",
      contentLength: 64,
      contentRef: "sha256:partial",
    },
    2,
    { correlation: { promptId: "prompt-1", turnId: "turn-1", messageId: "assistant-1" } },
  );

  assert.equal(delta.durability, "transient");
  assert.deepEqual(completed.data, {
    kind: "message",
    phase: "completed",
    role: "assistant",
    stopReason: "aborted",
    contentLength: 64,
    contentRef: "sha256:partial",
    errorCode: undefined,
  });
  assert.equal(completed.durability, "boundary");
});

test("parallel Tool completion and result-message order stay independent", () => {
  const declaredOrder = ["alpha", "beta", "gamma"];
  const completedOrder = ["beta", "gamma", "alpha"];
  const messageOrder = ["alpha", "beta", "gamma"];
  let sourceSequence = 0;
  const inputs: PiRuntimeEventWithContext[] = [];

  for (const [index, toolName] of declaredOrder.entries()) {
    sourceSequence += 1;
    inputs.push(
      event(
        {
          type: "tool_declared",
          toolName,
          toolCallId: `tool-${toolName}`,
          declarationIndex: index,
          inputRef: `sha256:input-${toolName}`,
        },
        sourceSequence,
        { correlation: { agentRunId: "run-1", turnId: "turn-1" } },
      ),
    );
  }
  for (const toolName of completedOrder) {
    sourceSequence += 1;
    inputs.push(
      event(
        {
          type: "tool_execution_end",
          toolName,
          toolCallId: `tool-${toolName}`,
          outputRef: `sha256:output-${toolName}`,
        },
        sourceSequence,
        { correlation: { agentRunId: "run-1", turnId: "turn-1" } },
      ),
    );
  }
  for (const [index, toolName] of messageOrder.entries()) {
    sourceSequence += 1;
    inputs.push(
      event(
        {
          type: "tool_result_message",
          toolName,
          toolCallId: `tool-${toolName}`,
          resultMessageIndex: index,
          outputRef: `sha256:output-${toolName}`,
        },
        sourceSequence,
        { correlation: { agentRunId: "run-1", turnId: "turn-1" } },
      ),
    );
  }

  const normalized = normalizePiRuntimeEvents(inputs);
  const tools = normalized.filter((item) => item.data.kind === "tool");
  const completed = tools.filter((item) => item.data.kind === "tool" && item.data.phase === "completed");
  const resultMessages = tools.filter(
    (item) => item.data.kind === "tool" && item.data.phase === "result-message",
  );

  assert.deepEqual(
    completed.map((item) => (item.data.kind === "tool" ? item.data.toolName : "")),
    completedOrder,
  );
  assert.deepEqual(
    resultMessages.map((item) => (item.data.kind === "tool" ? item.data.toolName : "")),
    messageOrder,
  );
  for (const item of tools) {
    assert.equal(item.data.kind, "tool");
    assert.equal(item.correlation.toolCallId, item.data.toolCallId);
  }
});

test("Compaction summary is a derived reference rather than a replacement for source entries", () => {
  const before = normalize(
    {
      type: "session_before_compact",
      reason: "manual",
      sourceEntryCount: 4,
      contextMessageCount: 4,
    },
    1,
    { sourceSurface: "extension" },
  );
  const completed = normalize(
    {
      type: "session_compact",
      reason: "manual",
      fromExtension: true,
      summaryRef: "sha256:compaction-summary",
      sourceEntryCount: 4,
      contextMessageCount: 2,
    },
    2,
    { sourceSurface: "extension" },
  );

  assert.deepEqual(before.data, {
    kind: "compaction",
    phase: "started",
    reason: "manual",
    fromExtension: true,
    aborted: undefined,
    willRetry: undefined,
    summaryRef: undefined,
    sourceEntryCount: 4,
    contextMessageCount: 4,
  });
  assert.deepEqual(completed.data, {
    kind: "compaction",
    phase: "completed",
    reason: "manual",
    fromExtension: true,
    aborted: undefined,
    willRetry: undefined,
    summaryRef: "sha256:compaction-summary",
    sourceEntryCount: 4,
    contextMessageCount: 2,
  });
});

test("Session Replacement keeps shutdown, invalidation, rebind and new start distinct", () => {
  const extensionShutdown = normalize(
    { type: "session_shutdown", reason: "new", targetRuntimeSessionId: "runtime-session-b" },
    1,
    {
      sourceSurface: "extension",
      correlation: {
        previousRuntimeSessionId: "runtime-session-a",
        targetRuntimeSessionId: "runtime-session-b",
      },
    },
  );
  const invalidated = normalize(
    { type: "session_invalidated", reason: "replacement" },
    1,
    {
      sourceSurface: "host",
      correlation: {
        previousRuntimeSessionId: "runtime-session-a",
        targetRuntimeSessionId: "runtime-session-b",
      },
    },
  );
  const rebound = normalize(
    {
      type: "session_rebound",
      previousRuntimeSessionId: "runtime-session-a",
      targetRuntimeSessionId: "runtime-session-b",
    },
    2,
    {
      sourceSurface: "host",
      runtimeSessionId: "runtime-session-b",
      correlation: {
        previousRuntimeSessionId: "runtime-session-a",
        targetRuntimeSessionId: "runtime-session-b",
      },
    },
  );
  const started = normalize(
    {
      type: "session_start",
      reason: "new",
      previousRuntimeSessionId: "runtime-session-a",
    },
    1,
    {
      sourceSurface: "extension",
      runtimeSessionId: "runtime-session-b",
      correlation: {
        previousRuntimeSessionId: "runtime-session-a",
        targetRuntimeSessionId: "runtime-session-b",
      },
    },
  );

  assert.equal(extensionShutdown.provenance, "observed");
  assert.equal(invalidated.provenance, "host-synthesized");
  assert.equal(invalidated.durability, "stable");
  assert.equal(rebound.provenance, "host-synthesized");
  assert.equal(started.runtimeSessionId, "runtime-session-b");
});

test("RPC request, acceptance, Prompt settle, EOF and Worker exit remain separate", () => {
  const request = normalize(
    { type: "rpc_request", command: "prompt", requestId: "rpc-1" },
    1,
    { sourceSurface: "rpc", correlation: { promptId: "prompt-1" } },
  );
  const response = normalize(
    {
      type: "rpc_response",
      command: "prompt",
      requestId: "rpc-1",
      success: true,
      accepted: true,
    },
    2,
    { sourceSurface: "rpc", correlation: { promptId: "prompt-1" } },
  );
  const promptSettled = normalize(
    { type: "prompt_settled" },
    1,
    {
      sourceSurface: "host",
      correlation: { promptId: "prompt-1", agentRunId: "run-1" },
    },
  );
  const eof = normalize({ type: "rpc_eof" }, 3, { sourceSurface: "rpc" });
  const workerExit = normalize(
    { type: "worker_exited", exitCode: 0 },
    2,
    { sourceSurface: "host", correlation: { workerId: "worker-1" } },
  );

  assert.deepEqual(request.data, {
    kind: "rpc",
    phase: "request",
    command: "prompt",
    requestId: "rpc-1",
  });
  assert.deepEqual(response.data, {
    kind: "rpc",
    phase: "response",
    command: "prompt",
    requestId: "rpc-1",
    success: true,
    accepted: true,
    errorCode: undefined,
  });
  assert.equal(response.durability, "boundary");
  assert.equal(promptSettled.durability, "stable");
  assert.equal(eof.data.kind, "rpc");
  assert.equal(workerExit.durability, "stable");
});

test("normalizer rejects invalid correlation and non-monotonic source sequences", () => {
  assert.throws(
    () =>
      normalize(
        {
          type: "tool_execution_end",
          toolName: "alpha",
          toolCallId: "tool-alpha",
        },
        1,
        { correlation: { toolCallId: "wrong-id" } },
      ),
    /data\.toolCallId must equal correlation\.toolCallId/,
  );

  const first = normalize(
    { type: "agent_start" },
    2,
    { correlation: { agentRunId: "run-1" } },
  );
  const second = normalize(
    { type: "agent_end", willRetry: false },
    1,
    { correlation: { agentRunId: "run-1" } },
  );
  assert.throws(() => assertRuntimeEventStream([first, second]), /sourceSequence 1 is not greater than 2/);
});
