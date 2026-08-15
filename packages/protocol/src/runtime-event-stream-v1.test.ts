import assert from "node:assert/strict";
import test from "node:test";

import { ids } from "../../domain/src/index.ts";
import {
  createNormalizedRuntimeEventV1,
  parseNormalizedRuntimeEventTraceV1,
  type NormalizedRuntimeEventDraftV1,
} from "./index.ts";

function event(
  sequence: number,
  data: NormalizedRuntimeEventDraftV1["data"],
  overrides: Partial<NormalizedRuntimeEventDraftV1> = {},
) {
  return createNormalizedRuntimeEventV1({
    protocolVersion: 1,
    workspaceId: ids.workspace("workspace-1"),
    runtimeSessionId: ids.session("session-1"),
    runtimeInstanceId: "worker-1",
    source: {
      adapter: "pi",
      runtime: { implementation: "pi", version: "0.84.1" },
      surface: "sdk",
      eventType: data.kind,
    },
    sequence: { domain: "sdk-public-events", value: sequence },
    observedAt: `2026-08-15T00:00:00.${String(sequence).padStart(3, "0")}Z`,
    provenance: "observed",
    persistence: "durable",
    stability: data.kind === "agent.lifecycle" && data.phase === "settled" ? "settled" : "boundary",
    compatibility: "required",
    correlation: { observed: {}, normalized: {} },
    data,
    ...overrides,
  });
}

test("independent sequence domains may both start at one without implying a total order", () => {
  const sdk = event(1, { kind: "agent.lifecycle", phase: "started" }, {
    correlation: { observed: {}, normalized: { agentRunId: "run-1" } },
  });
  const host = event(1, { kind: "host.action", action: "send-command", command: "prompt" }, {
    source: {
      adapter: "pi",
      runtime: { implementation: "pi", version: "0.84.1" },
      surface: "host",
      eventType: "send-command",
    },
    sequence: { domain: "host-client-actions", value: 1 },
    provenance: "host-synthesized",
  });
  assert.equal(parseNormalizedRuntimeEventTraceV1([host, sdk]).length, 2);
});

test("source sequence is strict only inside its declared stream", () => {
  const later = event(2, { kind: "agent.lifecycle", phase: "started" }, {
    correlation: { observed: {}, normalized: { agentRunId: "run-2" } },
  });
  const earlier = event(1, { kind: "agent.lifecycle", phase: "started" }, {
    correlation: { observed: {}, normalized: { agentRunId: "run-1" } },
  });
  assert.throws(() => parseNormalizedRuntimeEventTraceV1([later, earlier]), /non-monotonic/);
});

test("tool completion requires an explicit declaration link, independent of completion order", () => {
  const declaration = event(1, {
    kind: "tool.lifecycle",
    phase: "declared",
    toolName: "read",
    input: { path: "README.md" },
  }, {
    correlation: { observed: {}, normalized: { toolCallId: "tool-1" } },
  });
  const completion = event(2, {
    kind: "tool.lifecycle",
    phase: "completed",
    toolName: "read",
    success: true,
    result: { bytes: 12 },
  }, {
    correlation: { observed: {}, normalized: { toolCallId: "tool-1" } },
    links: { sourceEventIds: [declaration.eventId] },
  });
  assert.equal(parseNormalizedRuntimeEventTraceV1([declaration, completion]).length, 2);

  const unlinked = event(3, {
    kind: "tool.lifecycle",
    phase: "completed",
    toolName: "read",
    success: true,
    result: { bytes: 12 },
  }, {
    correlation: { observed: {}, normalized: { toolCallId: "tool-1" } },
  });
  assert.throws(() => parseNormalizedRuntimeEventTraceV1([declaration, unlinked]), /explicitly link/);
});

test("willRetry=true is an observed plan, not a promise that another Agent Run exists", () => {
  const start = event(1, { kind: "agent.lifecycle", phase: "started" }, {
    correlation: { observed: {}, normalized: { agentRunId: "run-1" } },
  });
  const end = event(2, { kind: "agent.lifecycle", phase: "ended", willRetry: true }, {
    correlation: { observed: {}, normalized: { agentRunId: "run-1" } },
  });
  assert.doesNotThrow(() => parseNormalizedRuntimeEventTraceV1([start, end]));
});

test("completed compaction must retain source and replacement lineage", () => {
  const original = event(1, {
    kind: "message.lifecycle",
    phase: "ended",
    role: "assistant",
    body: { text: "original" },
  }, {
    correlation: { observed: {}, normalized: { messageId: "message-1" } },
  });
  const completed = event(2, {
    kind: "compaction.lifecycle",
    phase: "completed",
    summaryKind: "context-summary",
  }, {
    links: {
      sourceEventIds: [original.eventId],
      replacesEventIds: [original.eventId],
    },
  });
  assert.doesNotThrow(() => parseNormalizedRuntimeEventTraceV1([original, completed]));

  const missingLineage = event(3, {
    kind: "compaction.lifecycle",
    phase: "completed",
  });
  assert.throws(() => parseNormalizedRuntimeEventTraceV1([original, missingLineage]), /cite source/);
});


test("explicit links cannot point forward or borrow declarations from another Runtime Session", () => {
  const declaration = event(1, {
    kind: "tool.lifecycle",
    phase: "declared",
    toolName: "read",
  }, {
    correlation: { observed: {}, normalized: { toolCallId: "tool-shared" } },
  });
  const completion = event(2, {
    kind: "tool.lifecycle",
    phase: "completed",
    toolName: "read",
    success: true,
  }, {
    runtimeSessionId: ids.session("session-2"),
    correlation: { observed: {}, normalized: { toolCallId: "tool-shared" } },
    links: { sourceEventIds: [declaration.eventId] },
  });
  assert.throws(
    () => parseNormalizedRuntimeEventTraceV1([declaration, completion]),
    /explicitly link one declaration/,
  );

  const source = event(3, { kind: "message.lifecycle", phase: "ended", role: "assistant" });
  const derived = event(2, { kind: "compaction.lifecycle", phase: "completed" }, {
    links: { sourceEventIds: [source.eventId], replacesEventIds: [source.eventId] },
  });
  assert.throws(() => parseNormalizedRuntimeEventTraceV1([derived, source]), /earlier trace fact/);
});
