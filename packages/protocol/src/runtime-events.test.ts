import assert from "node:assert/strict";
import test from "node:test";

import {
  RuntimeEventValidationError,
  assertNormalizedRuntimeEvent,
  assertRuntimeEventStream,
  buildRuntimeEventIdempotencyKey,
  createNormalizedRuntimeEvent,
  validateNormalizedRuntimeEvent,
  validateRuntimeEventStream,
  type CreateNormalizedRuntimeEventInput,
  type NormalizedRuntimeEventData,
} from "./runtime-events.ts";

const OBSERVED_AT = "2026-08-12T00:00:00.000Z";

function base<TData extends NormalizedRuntimeEventData>(
  data: TData,
  overrides: Partial<CreateNormalizedRuntimeEventInput<TData>> = {},
): CreateNormalizedRuntimeEventInput<TData> {
  return {
    workspaceId: "workspace-a",
    runtimeSessionId: "runtime-session-a",
    sourceSurface: "sdk",
    sourceSequence: 1,
    sourceEventType: "test_event",
    observedAt: OBSERVED_AT,
    provenance: "observed",
    durability: "boundary",
    correlation: {},
    data,
    ...overrides,
  };
}

test("idempotency key is deterministic and length-delimited", () => {
  const identity = {
    workspaceId: "workspace|a",
    runtimeSessionId: "runtime:session",
    sourceSurface: "sdk" as const,
    sourceSequence: 7,
    sourceEventType: "agent_end",
  };
  const first = buildRuntimeEventIdempotencyKey(identity);
  const second = buildRuntimeEventIdempotencyKey({ ...identity });
  const next = buildRuntimeEventIdempotencyKey({ ...identity, sourceSequence: 8 });

  assert.equal(first, second);
  assert.notEqual(first, next);
  assert.match(first, /^v1\|11:workspace\|a\|15:runtime:session\|3:sdk\|7\|9:agent_end$/);
});

test("createNormalizedRuntimeEvent injects version, event id and exact idempotency key", () => {
  const event = createNormalizedRuntimeEvent(
    base(
      { kind: "agent-run", phase: "ended", willRetry: false },
      {
        sourceEventType: "agent_end",
        correlation: { promptId: "prompt-1", agentRunId: "run-1" },
      },
    ),
  );

  assert.equal(event.protocolVersion, 1);
  assert.equal(event.eventId, `evt:${event.idempotencyKey}`);
  assert.equal(event.data.kind, "agent-run");
  assert.deepEqual(validateNormalizedRuntimeEvent(event), []);
});

test("extension agent_end can preserve unknown willRetry without inventing a boolean", () => {
  const event = createNormalizedRuntimeEvent(
    base(
      { kind: "agent-run", phase: "ended", willRetry: "unknown" },
      {
        sourceSurface: "extension",
        sourceEventType: "agent_end",
        correlation: { agentRunId: "run-1" },
      },
    ),
  );

  assert.equal(event.data.kind, "agent-run");
  assert.equal(event.data.willRetry, "unknown");
});

test("stable boundaries are explicit and cannot be inferred from queue state", () => {
  const queue = createNormalizedRuntimeEvent(
    base(
      { kind: "queue", phase: "snapshot", steeringCount: 0, followUpCount: 0 },
      {
        sourceEventType: "queue_update",
        correlation: { promptId: "prompt-1", agentRunId: "run-1" },
      },
    ),
  );
  const settled = createNormalizedRuntimeEvent(
    base(
      { kind: "agent-run", phase: "settled" },
      {
        sourceSequence: 2,
        sourceEventType: "agent_settled",
        durability: "stable",
        correlation: { promptId: "prompt-1", agentRunId: "run-1" },
      },
    ),
  );

  assert.equal(queue.durability, "boundary");
  assert.equal(settled.durability, "stable");
  assert.throws(
    () =>
      createNormalizedRuntimeEvent(
        base(
          { kind: "queue", phase: "snapshot", steeringCount: 0, followUpCount: 0 },
          { sourceEventType: "queue_update", durability: "stable" },
        ),
      ),
    RuntimeEventValidationError,
  );
});

test("message deltas are transient while completed messages are durable boundaries", () => {
  const delta = createNormalizedRuntimeEvent(
    base(
      {
        kind: "message",
        phase: "delta",
        role: "assistant",
        stopReason: "pending",
        contentLength: 12,
        contentRef: "sha256:delta",
      },
      {
        sourceEventType: "message_update",
        durability: "transient",
        correlation: { messageId: "message-1", turnId: "turn-1" },
      },
    ),
  );
  const completed = createNormalizedRuntimeEvent(
    base(
      {
        kind: "message",
        phase: "completed",
        role: "assistant",
        stopReason: "stop",
        contentLength: 32,
        contentRef: "sha256:complete",
      },
      {
        sourceSequence: 2,
        sourceEventType: "message_end",
        correlation: { messageId: "message-1", turnId: "turn-1" },
      },
    ),
  );

  assert.equal(delta.durability, "transient");
  assert.equal(completed.durability, "boundary");
});

test("tool and RPC correlations must match their payload identities", () => {
  assert.throws(
    () =>
      createNormalizedRuntimeEvent(
        base(
          {
            kind: "tool",
            phase: "completed",
            toolName: "alpha",
            toolCallId: "tool-call-1",
          },
          {
            sourceEventType: "tool_execution_end",
            correlation: { toolCallId: "tool-call-2" },
          },
        ),
      ),
    /data\.toolCallId must equal correlation\.toolCallId/,
  );

  assert.throws(
    () =>
      createNormalizedRuntimeEvent(
        base(
          {
            kind: "rpc",
            phase: "response",
            command: "prompt",
            requestId: "request-1",
            success: true,
            accepted: true,
          },
          {
            sourceSurface: "rpc",
            sourceEventType: "rpc_response",
            correlation: { rpcRequestId: "request-2" },
          },
        ),
      ),
    /data\.requestId must equal correlation\.rpcRequestId/,
  );
});

test("stream validation rejects duplicate identity and non-monotonic source sequence", () => {
  const first = createNormalizedRuntimeEvent(
    base(
      { kind: "agent-run", phase: "started" },
      {
        sourceEventType: "agent_start",
        correlation: { agentRunId: "run-1" },
      },
    ),
  );
  const sameSequence = createNormalizedRuntimeEvent(
    base(
      { kind: "turn", phase: "started" },
      {
        sourceEventType: "turn_start",
        correlation: { agentRunId: "run-1", turnId: "turn-1" },
      },
    ),
  );

  const violations = validateRuntimeEventStream([first, sameSequence]);
  assert.ok(violations.some((item) => item.includes("sourceSequence 1 is not greater than 1")));
  assert.throws(() => assertRuntimeEventStream([first, sameSequence]), RuntimeEventValidationError);
  assert.throws(() => assertRuntimeEventStream([first, first]), /duplicate eventId/);
});

test("different source surfaces maintain independent monotonic sequences", () => {
  const sdk = createNormalizedRuntimeEvent(
    base(
      { kind: "agent-run", phase: "ended", willRetry: false },
      {
        sourceEventType: "agent_end",
        sourceSurface: "sdk",
        correlation: { agentRunId: "run-1" },
      },
    ),
  );
  const extension = createNormalizedRuntimeEvent(
    base(
      { kind: "agent-run", phase: "ended", willRetry: "unknown" },
      {
        sourceEventType: "agent_end",
        sourceSurface: "extension",
        correlation: { agentRunId: "run-1" },
      },
    ),
  );

  assert.doesNotThrow(() => assertRuntimeEventStream([sdk, extension]));
});

test("invalid version, empty scope and malformed timestamp fail closed", () => {
  const valid = createNormalizedRuntimeEvent(
    base(
      { kind: "worker", phase: "exited", exitCode: 0 },
      {
        sourceSurface: "host",
        sourceEventType: "worker_exited",
        provenance: "host-synthesized",
        durability: "stable",
        correlation: { workerId: "worker-1" },
      },
    ),
  );
  const invalid = {
    ...valid,
    protocolVersion: 2,
    workspaceId: "",
    observedAt: "not-a-time",
  } as unknown as typeof valid;

  const violations = validateNormalizedRuntimeEvent(invalid);
  assert.ok(violations.some((item) => item.includes("protocolVersion")));
  assert.ok(violations.some((item) => item.includes("workspaceId")));
  assert.ok(violations.some((item) => item.includes("observedAt")));
  assert.throws(() => assertNormalizedRuntimeEvent(invalid), RuntimeEventValidationError);
});
