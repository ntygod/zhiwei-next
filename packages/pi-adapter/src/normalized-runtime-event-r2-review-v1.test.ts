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

const workspaceId = ids.workspace("adapter-r2-workspace");
const runtimeSessionId = ids.session("adapter-r2-session");

function correlation(
  normalized: NormalizedRuntimeCorrelationV1["normalized"] = {},
): NormalizedRuntimeCorrelationV1 {
  return { observed: {}, normalized };
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
    observedAt: `2026-08-17T04:00:00.${String(sourceSequence).padStart(3, "0")}Z`,
    provenance: "observed",
    correlation: correlation(),
    event,
    ...overrides,
  });
}

test("Pi Adapter preserves SDK willRetry and explicit Extension unavailability", () => {
  const sdk = normalize(1, { type: "agent_end", willRetry: true });
  const extension = normalize(1, { type: "agent_end", willRetry: "unavailable" }, {
    surface: "extension",
    sequenceDomain: "extension-events",
    sourceEventType: "agent_end",
  });

  assert.deepEqual(sdk.data, {
    kind: "agent.lifecycle",
    phase: "ended",
    willRetry: true,
  });
  assert.deepEqual(extension.data, {
    kind: "agent.lifecycle",
    phase: "ended",
    willRetry: "unavailable",
  });
  assert.throws(
    () => normalize(2, { type: "agent_end", willRetry: "unavailable" }),
    /reserved for observed Extension/,
  );
});

test("Pi Adapter maps successful auto_retry_end to Retry completion", () => {
  const completed = normalize(1, {
    type: "retry_completed",
    attempt: 1,
    success: true,
  }, {
    sourceEventType: "auto_retry_end",
  });
  assert.deepEqual(completed.data, {
    kind: "retry.lifecycle",
    phase: "completed",
    attempt: 1,
    success: true,
  });
});

test("Pi Adapter preserves Tool Result Message identity and completion lineage", () => {
  const declared = normalize(3, {
    type: "tool_declared",
    toolName: "read",
  }, {
    correlation: correlation({
      agentRunId: "run-1",
      turnId: "turn-1",
      toolCallId: "tool-1",
    }),
  });
  const completed = normalize(4, {
    type: "tool_completed",
    toolName: "read",
    success: true,
  }, {
    correlation: declared.correlation,
    links: { sourceEventIds: [declared.eventId] },
  });
  const started = normalize(5, {
    type: "message_start",
    role: "tool",
    toolName: "read",
    success: true,
    contentKinds: ["tool-result"],
  }, {
    correlation: correlation({
      agentRunId: "run-1",
      turnId: "turn-1",
      messageId: "message-1",
      toolCallId: "tool-1",
    }),
    links: { sourceEventIds: [completed.eventId] },
  });
  const ended = normalize(6, {
    type: "message_end",
    role: "tool",
    toolName: "read",
    success: true,
    contentKinds: ["tool-result"],
    body: { text: "done" },
  }, {
    correlation: started.correlation,
    links: { sourceEventIds: [completed.eventId] },
  });

  assert.deepEqual(started.data, {
    kind: "message.lifecycle",
    phase: "started",
    role: "tool",
    toolName: "read",
    success: true,
    contentKinds: ["tool-result"],
  });
  assert.deepEqual(ended.data, {
    kind: "message.lifecycle",
    phase: "ended",
    role: "tool",
    toolName: "read",
    success: true,
    contentKinds: ["tool-result"],
    body: { text: "done" },
  });

  const agent = normalize(1, { type: "agent_start" }, {
    correlation: correlation({ agentRunId: "run-1" }),
  });
  const turn = normalize(2, { type: "turn_start" }, {
    correlation: correlation({ agentRunId: "run-1", turnId: "turn-1" }),
  });
  assert.equal(
    parseNormalizedRuntimeEventTraceV1([
      agent,
      turn,
      declared,
      completed,
      started,
      ended,
    ]).length,
    6,
  );

  assert.throws(
    () => normalize(7, {
      type: "message_end",
      role: "tool",
      toolName: "read",
      success: true,
      body: { text: "missing-lineage" },
    }, {
      correlation: correlation({ toolCallId: "tool-1" }),
    }),
    /link exactly one completed Tool event/,
  );
});

test("Pi Adapter preserves Tool Call identity in Messages Snapshot", () => {
  const snapshot = normalize(1, {
    type: "messages_snapshot",
    messages: [
      {
        role: "tool",
        toolCallId: "tool-alpha",
        toolName: "ordered_echo",
        success: true,
        contentKinds: ["tool-result"],
        text: "alpha",
      },
      {
        role: "assistant",
        contentKinds: ["text"],
        stopReason: "stop",
        text: "done",
      },
    ],
  }, {
    surface: "rpc",
    sequenceDomain: "rpc-worker-output",
    sourceEventType: "messages_snapshot",
  });

  assert.deepEqual(snapshot.data, {
    kind: "snapshot.messages",
    messages: [
      {
        role: "tool",
        toolCallId: "tool-alpha",
        toolName: "ordered_echo",
        success: true,
        contentKinds: ["tool-result"],
        text: "alpha",
      },
      {
        role: "assistant",
        contentKinds: ["text"],
        stopReason: "stop",
        text: "done",
      },
    ],
  });

  assert.throws(
    () => normalize(2, {
      type: "messages_snapshot",
      messages: [{
        role: "tool",
        toolCallId: "",
        toolName: "ordered_echo",
        success: true,
        text: "alpha",
      }],
    }),
    /toolCallId/,
  );
});
