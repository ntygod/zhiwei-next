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
  assert.throws(() => parseNormalizedRuntimeEventTraceV1([declaration, wrongName]), /matching declaration/);
});

test("Tool links cannot borrow a declaration from another Agent Run or Runtime instance", () => {
  const run1 = event(1, { kind: "agent.lifecycle", phase: "started" }, {
    correlation: { observed: {}, normalized: { agentRunId: "run-1" } },
  });
  const declaration = event(2, {
    kind: "tool.lifecycle",
    phase: "declared",
    toolName: "read",
  }, {
    correlation: { observed: {}, normalized: { agentRunId: "run-1", toolCallId: "tool-shared" } },
  });
  const run2 = event(3, { kind: "agent.lifecycle", phase: "started" }, {
    correlation: { observed: {}, normalized: { agentRunId: "run-2" } },
  });
  const crossRun = event(4, {
    kind: "tool.lifecycle",
    phase: "completed",
    toolName: "read",
    success: true,
  }, {
    correlation: { observed: {}, normalized: { agentRunId: "run-2", toolCallId: "tool-shared" } },
    links: { sourceEventIds: [declaration.eventId] },
  });
  assert.throws(
    () => parseNormalizedRuntimeEventTraceV1([run1, declaration, run2, crossRun]),
    /changed normalized.agentRunId/,
  );

  const declarationWithoutRun = event(5, {
    kind: "tool.lifecycle",
    phase: "declared",
    toolName: "read",
  }, {
    correlation: { observed: {}, normalized: { toolCallId: "tool-instance" } },
  });
  const crossInstance = event(1, {
    kind: "tool.lifecycle",
    phase: "completed",
    toolName: "read",
    success: true,
  }, {
    runtimeInstanceId: "worker-2",
    correlation: { observed: {}, normalized: { toolCallId: "tool-instance" } },
    links: { sourceEventIds: [declarationWithoutRun.eventId] },
  });
  assert.throws(
    () => parseNormalizedRuntimeEventTraceV1([declarationWithoutRun, crossInstance]),
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
  assert.throws(() => parseNormalizedRuntimeEventTraceV1([agentStart, turnEnd]), /turn end/);

  const messageEnd = event(2, { kind: "message.lifecycle", phase: "ended", role: "assistant" }, {
    correlation: { observed: {}, normalized: { agentRunId: "run-1", messageId: "message-1" } },
  });
  assert.throws(() => parseNormalizedRuntimeEventTraceV1([agentStart, messageEnd]), /no earlier start/);
});

test("Message IDs cannot borrow a start from another Agent Run or cross Runtime instances", () => {
  const run1 = event(1, { kind: "agent.lifecycle", phase: "started" }, {
    correlation: { observed: {}, normalized: { agentRunId: "run-1" } },
  });
  const messageStart = event(2, { kind: "message.lifecycle", phase: "started", role: "assistant" }, {
    correlation: { observed: {}, normalized: { agentRunId: "run-1", messageId: "message-1" } },
  });
  const run2 = event(3, { kind: "agent.lifecycle", phase: "started" }, {
    correlation: { observed: {}, normalized: { agentRunId: "run-2" } },
  });
  const wrongRunEnd = event(4, { kind: "message.lifecycle", phase: "ended", role: "assistant" }, {
    correlation: { observed: {}, normalized: { agentRunId: "run-2", messageId: "message-1" } },
  });
  assert.throws(
    () => parseNormalizedRuntimeEventTraceV1([run1, messageStart, run2, wrongRunEnd]),
    /changed normalized.agentRunId/,
  );

  const messageStartWithoutRun = event(5, {
    kind: "message.lifecycle",
    phase: "started",
    role: "assistant",
  }, {
    correlation: { observed: {}, normalized: { messageId: "message-instance" } },
  });
  const crossInstanceEnd = event(1, { kind: "message.lifecycle", phase: "ended", role: "assistant" }, {
    runtimeInstanceId: "worker-2",
    correlation: { observed: {}, normalized: { messageId: "message-instance" } },
  });
  assert.throws(
    () => parseNormalizedRuntimeEventTraceV1([messageStartWithoutRun, crossInstanceEnd]),
    /one Runtime instance/,
  );
});

test("duplicate correlated lifecycle starts and endings are rejected", () => {
  const start = event(1, { kind: "agent.lifecycle", phase: "started" }, {
    correlation: { observed: {}, normalized: { agentRunId: "run-1" } },
  });
  const duplicateStart = event(2, { kind: "agent.lifecycle", phase: "started" }, {
    correlation: { observed: {}, normalized: { agentRunId: "run-1" } },
  });
  assert.throws(() => parseNormalizedRuntimeEventTraceV1([start, duplicateStart]), /duplicate agent start/);

  const end = event(2, { kind: "agent.lifecycle", phase: "ended", willRetry: false }, {
    correlation: { observed: {}, normalized: { agentRunId: "run-1" } },
  });
  const duplicateEnd = event(3, { kind: "agent.lifecycle", phase: "ended", willRetry: false }, {
    correlation: { observed: {}, normalized: { agentRunId: "run-1" } },
  });
  assert.throws(() => parseNormalizedRuntimeEventTraceV1([start, end, duplicateEnd]), /duplicate agent end/);
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

function compactionSources() {
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
  return { messageStart, original };
}

test("completed compaction links one earlier matching start while retaining source and replacement lineage", () => {
  const { messageStart, original } = compactionSources();
  const compactionStart = event(3, {
    kind: "compaction.lifecycle",
    phase: "started",
    reason: "manual",
  });
  const completed = event(4, {
    kind: "compaction.lifecycle",
    phase: "completed",
    summaryKind: "context-summary",
  }, {
    links: {
      sourceEventIds: [compactionStart.eventId, original.eventId],
      replacesEventIds: [original.eventId],
    },
  });
  assert.doesNotThrow(() =>
    parseNormalizedRuntimeEventTraceV1([messageStart, original, compactionStart, completed])
  );
});

test("completed compaction rejects a missing or misplaced Compaction start", () => {
  const { messageStart, original } = compactionSources();
  const noStart = event(3, {
    kind: "compaction.lifecycle",
    phase: "completed",
    summaryKind: "context-summary",
  }, {
    links: {
      sourceEventIds: [original.eventId],
      replacesEventIds: [original.eventId],
    },
  });
  assert.throws(
    () => parseNormalizedRuntimeEventTraceV1([messageStart, original, noStart]),
    /exactly one earlier Compaction start/,
  );

  const compactionStart = event(3, {
    kind: "compaction.lifecycle",
    phase: "started",
    reason: "manual",
  });
  const startOnlyInReplacements = event(4, {
    kind: "compaction.lifecycle",
    phase: "completed",
    summaryKind: "context-summary",
  }, {
    links: {
      sourceEventIds: [original.eventId],
      replacesEventIds: [compactionStart.eventId, original.eventId],
    },
  });
  assert.throws(
    () => parseNormalizedRuntimeEventTraceV1([
      messageStart,
      original,
      compactionStart,
      startOnlyInReplacements,
    ]),
    /exactly one earlier Compaction start/,
  );
});

test("completed compaction rejects cross-Instance and cross-source-stream starts", () => {
  const { messageStart, original } = compactionSources();
  const crossInstanceStart = event(1, {
    kind: "compaction.lifecycle",
    phase: "started",
  }, {
    runtimeInstanceId: "worker-2",
  });
  const crossInstanceCompletion = event(3, {
    kind: "compaction.lifecycle",
    phase: "completed",
  }, {
    links: {
      sourceEventIds: [crossInstanceStart.eventId, original.eventId],
      replacesEventIds: [original.eventId],
    },
  });
  assert.throws(
    () => parseNormalizedRuntimeEventTraceV1([
      messageStart,
      original,
      crossInstanceStart,
      crossInstanceCompletion,
    ]),
    /Runtime scope, and source stream/,
  );

  const sourceStreamMismatches: readonly Partial<NormalizedRuntimeEventDraftV1>[] = [
    {
      source: {
        adapter: "other-adapter",
        runtime: { implementation: "pi", version: "0.84.1" },
        surface: "sdk",
        eventType: "compaction_start",
      },
    },
    {
      source: {
        adapter: "pi",
        runtime: { implementation: "other-runtime", version: "0.84.1" },
        surface: "sdk",
        eventType: "compaction_start",
      },
    },
    {
      source: {
        adapter: "pi",
        runtime: { implementation: "pi", version: "0.85.0" },
        surface: "sdk",
        eventType: "compaction_start",
      },
    },
    {
      source: {
        adapter: "pi",
        runtime: { implementation: "pi", version: "0.84.1" },
        surface: "rpc",
        eventType: "compaction_start",
      },
    },
    { sequence: { domain: "other-sdk-stream", value: 1 } },
  ];
  for (const overrides of sourceStreamMismatches) {
    const crossStreamStart = event(1, {
      kind: "compaction.lifecycle",
      phase: "started",
    }, overrides);
    const crossStreamCompletion = event(3, {
      kind: "compaction.lifecycle",
      phase: "completed",
    }, {
      links: {
        sourceEventIds: [crossStreamStart.eventId, original.eventId],
        replacesEventIds: [original.eventId],
      },
    });
    assert.throws(
      () => parseNormalizedRuntimeEventTraceV1([
        messageStart,
        original,
        crossStreamStart,
        crossStreamCompletion,
      ]),
      /Runtime scope, and source stream/,
    );
  }

  const crossSessionStart = event(1, {
    kind: "compaction.lifecycle",
    phase: "started",
  }, {
    runtimeSessionId: ids.session("session-2"),
  });
  const crossSessionCompletion = event(3, {
    kind: "compaction.lifecycle",
    phase: "completed",
  }, {
    links: {
      sourceEventIds: [crossSessionStart.eventId, original.eventId],
      replacesEventIds: [original.eventId],
    },
  });
  assert.throws(
    () => parseNormalizedRuntimeEventTraceV1([
      messageStart,
      original,
      crossSessionStart,
      crossSessionCompletion,
    ]),
    /one Runtime Session/,
  );
});

test("completed compaction rejects multiple Compaction starts", () => {
  const { messageStart, original } = compactionSources();
  const firstStart = event(3, {
    kind: "compaction.lifecycle",
    phase: "started",
    reason: "automatic",
  });
  const secondStart = event(4, {
    kind: "compaction.lifecycle",
    phase: "started",
    reason: "manual",
  });
  const completed = event(5, {
    kind: "compaction.lifecycle",
    phase: "completed",
  }, {
    links: {
      sourceEventIds: [firstStart.eventId, secondStart.eventId, original.eventId],
      replacesEventIds: [original.eventId],
    },
  });
  assert.throws(
    () => parseNormalizedRuntimeEventTraceV1([
      messageStart,
      original,
      firstStart,
      secondStart,
      completed,
    ]),
    /exactly one earlier Compaction start/,
  );
});

test("explicit links cannot point forward", () => {
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
  assert.throws(() => assertReplayableNormalizedRuntimeEventTraceV1([required]), /blocks replay/);
});
