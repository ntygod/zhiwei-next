import assert from "node:assert/strict";
import test from "node:test";

import { ids } from "../../domain/src/index.ts";
import {
  assertReplayableNormalizedRuntimeEventTraceV1,
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

test("tool start and completion require one matching declaration link", () => {
  const declaration = event(1, {
    kind: "tool.lifecycle",
    phase: "declared",
    toolName: "read",
    input: { path: "README.md" },
  }, {
    correlation: { observed: {}, normalized: { toolCallId: "tool-1" } },
  });
  const started = event(2, {
    kind: "tool.lifecycle",
    phase: "started",
    toolName: "read",
  }, {
    correlation: { observed: {}, normalized: { toolCallId: "tool-1" } },
    links: { sourceEventIds: [declaration.eventId] },
  });
  const completion = event(3, {
    kind: "tool.lifecycle",
    phase: "completed",
    toolName: "read",
    success: true,
    result: { bytes: 12 },
  }, {
    correlation: { observed: {}, normalized: { toolCallId: "tool-1" } },
    links: { sourceEventIds: [declaration.eventId] },
  });
  assert.equal(parseNormalizedRuntimeEventTraceV1([declaration, started, completion]).length, 3);

  const wrongName = event(4, {
    kind: "tool.lifecycle",
    phase: "completed",
    toolName: "write",
    success: true,
  }, {
    correlation: { observed: {}, normalized: { toolCallId: "tool-1" } },
    links: { sourceEventIds: [declaration.eventId] },
  });
  assert.throws(
    () => parseNormalizedRuntimeEventTraceV1([declaration, wrongName]),
    /matching declaration/,
  );

  const unlinked = event(5, {
    kind: "tool.lifecycle",
    phase: "completed",
    toolName: "read",
    success: true,
  }, {
    correlation: { observed: {}, normalized: { toolCallId: "tool-1" } },
  });
  assert.throws(
    () => parseNormalizedRuntimeEventTraceV1([declaration, unlinked]),
    /matching declaration/,
  );
});

test("Agent, Turn and Message correlations reject endings without starts", () => {
  const endWithoutStart = event(1, { kind: "agent.lifecycle", phase: "ended", willRetry: false }, {
    correlation: { observed: {}, normalized: { agentRunId: "run-1" } },
  });
  assert.throws(() => parseNormalizedRuntimeEventTraceV1([endWithoutStart]), /no earlier start/);

  const agentStart = event(1, { kind: "agent.lifecycle", phase: "started" }, {
    correlation: { observed: {}, normalized: { agentRunId: "run-1" } },
  });
  const turnEnd = event(2, { kind: "turn.lifecycle", phase: "ended" }, {
    correlation: { observed: {}, normalized: { agentRunId: "run-1", turnId: "turn-1" } },
  });
  assert.throws(() => parseNormalizedRuntimeEventTraceV1([agentStart, turnEnd]), /Turn start|turn end/);

  const messageEnd = event(2, { kind: "message.lifecycle", phase: "ended", role: "assistant" }, {
    correlation: { observed: {}, normalized: { agentRunId: "run-1", messageId: "message-1" } },
  });
  assert.throws(() => parseNormalizedRuntimeEventTraceV1([agentStart, messageEnd]), /no earlier start/);
});

test("willRetry=true remains an observed plan, not a promise of another Agent Run", () => {
  const start = event(1, { kind: "agent.lifecycle", phase: "started" }, {
    correlation: { observed: {}, normalized: { agentRunId: "run-1" } },
  });
  const end = event(2, { kind: "agent.lifecycle", phase: "ended", willRetry: true }, {
    correlation: { observed: {}, normalized: { agentRunId: "run-1" } },
  });
  assert.doesNotThrow(() => parseNormalizedRuntimeEventTraceV1([start, end]));
});

test("completed compaction retains same-session source and replacement lineage", () => {
  const messageStart = event(1, {
    kind: "message.lifecycle",
    phase: "started",
    role: "assistant",
  }, {
    correlation: { observed: {}, normalized: { messageId: "message-1" } },
  });
  const original = event(2, {
    kind: "message.lifecycle",
    phase: "ended",
    role: "assistant",
    body: { text: "original" },
  }, {
    correlation: { observed: {}, normalized: { messageId: "message-1" } },
  });
  const completed = event(3, {
    kind: "compaction.lifecycle",
    phase: "completed",
    summaryKind: "context-summary",
  }, {
    links: {
      sourceEventIds: [original.eventId],
      replacesEventIds: [original.eventId],
    },
  });
  assert.doesNotThrow(() => parseNormalizedRuntimeEventTraceV1([messageStart, original, completed]));

  const crossSession = event(4, {
    kind: "compaction.lifecycle",
    phase: "completed",
  }, {
    runtimeSessionId: ids.session("session-2"),
    links: {
      sourceEventIds: [original.eventId],
      replacesEventIds: [original.eventId],
    },
  });
  assert.throws(
    () => parseNormalizedRuntimeEventTraceV1([messageStart, original, crossSession]),
    /one Runtime Session/,
  );
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
    /matching declaration/,
  );

  const source = event(3, { kind: "message.lifecycle", phase: "ended", role: "assistant" });
  const derived = event(2, { kind: "compaction.lifecycle", phase: "completed" }, {
    links: { sourceEventIds: [source.eventId], replacesEventIds: [source.eventId] },
  });
  assert.throws(() => parseNormalizedRuntimeEventTraceV1([derived, source]), /earlier trace fact/);
});

test("complete replay fails closed on required unknown vocabulary", () => {
  const ignorable = event(1, {
    kind: "runtime.unknown",
    sourceType: "future-info",
    keys: ["type"],
    payloadSha256: "0".repeat(64),
    canonicalization: "zhiwei-json-v1",
  }, {
    source: {
      adapter: "pi",
      runtime: { implementation: "pi", version: "0.84.1" },
      surface: "extension",
      eventType: "future-info",
    },
    compatibility: "ignorable",
  });
  assert.doesNotThrow(() => assertReplayableNormalizedRuntimeEventTraceV1([ignorable]));

  const required = event(2, {
    kind: "runtime.unknown",
    sourceType: "future-required",
    keys: ["type"],
    payloadSha256: "1".repeat(64),
    canonicalization: "zhiwei-json-v1",
  }, {
    source: {
      adapter: "pi",
      runtime: { implementation: "pi", version: "0.84.1" },
      surface: "extension",
      eventType: "future-required",
    },
    compatibility: "required",
  });
  assert.throws(
    () => assertReplayableNormalizedRuntimeEventTraceV1([required]),
    /blocks replay/,
  );
});
