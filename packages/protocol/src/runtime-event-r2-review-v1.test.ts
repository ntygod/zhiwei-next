import assert from "node:assert/strict";
import test from "node:test";

import { ids } from "../../domain/src/index.ts";
import {
  createNormalizedRuntimeEventV1,
  parseNormalizedRuntimeEventTraceV1,
  parseNormalizedRuntimeEventV1,
  type NormalizedRuntimeEventDraftV1,
  type NormalizedRuntimeEventV1,
} from "./index.ts";

const workspaceId = ids.workspace("r2-workspace");
const runtimeSessionId = ids.session("r2-session");
const runtime = { implementation: "pi", version: "0.84.1" } as const;

function event(
  sequence: number,
  data: NormalizedRuntimeEventDraftV1["data"],
  overrides: Partial<NormalizedRuntimeEventDraftV1> = {},
): NormalizedRuntimeEventV1 {
  return createNormalizedRuntimeEventV1({
    protocolVersion: 1,
    workspaceId,
    runtimeSessionId,
    runtimeInstanceId: "worker-1",
    source: {
      adapter: "pi",
      runtime,
      surface: "sdk",
      eventType: data.kind,
    },
    sequence: { domain: "sdk-public-events", value: sequence },
    observedAt: `2026-08-17T03:00:00.${String(sequence).padStart(3, "0")}Z`,
    provenance: "observed",
    persistence: "durable",
    stability:
      data.kind === "agent.lifecycle" && data.phase === "settled"
        ? "settled"
        : "boundary",
    compatibility: "required",
    correlation: { observed: {}, normalized: {} },
    data,
    ...overrides,
  });
}

function declaration(
  sequence: number,
  toolName: string,
  toolCallId: string,
  normalized: Record<string, string> = {},
): NormalizedRuntimeEventV1 {
  return event(sequence, {
    kind: "tool.lifecycle",
    phase: "declared",
    toolName,
  }, {
    correlation: {
      observed: {},
      normalized: { ...normalized, toolCallId },
    },
  });
}

function completion(
  sequence: number,
  declared: NormalizedRuntimeEventV1,
  success = true,
): NormalizedRuntimeEventV1 {
  assert.equal(declared.data.kind, "tool.lifecycle");
  return event(sequence, {
    kind: "tool.lifecycle",
    phase: "completed",
    toolName: declared.data.toolName,
    success,
  }, {
    correlation: declared.correlation,
    links: { sourceEventIds: [declared.eventId] },
  });
}

function toolMessage(
  sequence: number,
  completed: NormalizedRuntimeEventV1,
  phase: "started" | "ended",
  overrides: Partial<NormalizedRuntimeEventDraftV1> = {},
): NormalizedRuntimeEventV1 {
  assert.equal(completed.data.kind, "tool.lifecycle");
  assert.equal(completed.data.phase, "completed");
  const data = phase === "started"
    ? {
        kind: "message.lifecycle" as const,
        phase: "started" as const,
        role: "tool" as const,
        toolName: completed.data.toolName,
        success: completed.data.success,
        contentKinds: ["tool-result"],
      }
    : {
        kind: "message.lifecycle" as const,
        phase: "ended" as const,
        role: "tool" as const,
        toolName: completed.data.toolName,
        success: completed.data.success,
        contentKinds: ["tool-result"],
        body: { text: completed.data.toolName },
      };
  return event(sequence, data, {
    correlation: {
      observed: {},
      normalized: {
        ...completed.correlation.normalized,
        messageId: `message-${completed.correlation.normalized.toolCallId}-${phase}`,
      },
    },
    links: { sourceEventIds: [completed.eventId] },
    ...overrides,
  });
}

test("agent_end preserves observed booleans and explicit Extension unavailability", () => {
  const sdk = event(1, {
    kind: "agent.lifecycle",
    phase: "ended",
    willRetry: true,
  });
  const extension = event(1, {
    kind: "agent.lifecycle",
    phase: "ended",
    willRetry: "unavailable",
  }, {
    source: {
      adapter: "pi",
      runtime,
      surface: "extension",
      eventType: "agent_end",
    },
    sequence: { domain: "extension-events", value: 1 },
  });

  assert.equal(sdk.data.kind === "agent.lifecycle" && sdk.data.willRetry, true);
  assert.equal(
    extension.data.kind === "agent.lifecycle" && extension.data.willRetry,
    "unavailable",
  );
  assert.deepEqual(parseNormalizedRuntimeEventV1(extension), extension);

  assert.throws(
    () => event(2, {
      kind: "agent.lifecycle",
      phase: "ended",
      willRetry: "unavailable",
    }, {
      source: {
        adapter: "pi",
        runtime,
        surface: "sdk",
        eventType: "agent_end",
      },
    }),
    /reserved for observed Extension/,
  );
  assert.throws(
    () => event(3, {
      kind: "agent.lifecycle",
      phase: "ended",
      willRetry: "unknown",
    } as any),
    /boolean or explicit unavailable/,
  );
});

test("successful Retry completion remains distinct from both Agent Runs and final settled", () => {
  const firstStart = event(1, { kind: "agent.lifecycle", phase: "started" }, {
    correlation: { observed: {}, normalized: { agentRunId: "run-1" } },
  });
  const firstEnd = event(2, {
    kind: "agent.lifecycle",
    phase: "ended",
    willRetry: true,
  }, {
    correlation: { observed: {}, normalized: { agentRunId: "run-1" } },
  });
  const extensionFirstEnd = event(1, {
    kind: "agent.lifecycle",
    phase: "ended",
    willRetry: "unavailable",
  }, {
    source: { adapter: "pi", runtime, surface: "extension", eventType: "agent_end" },
    sequence: { domain: "extension-events", value: 1 },
  });
  const retryStarted = event(3, {
    kind: "retry.lifecycle",
    phase: "started",
    attempt: 1,
  });
  const secondStart = event(4, { kind: "agent.lifecycle", phase: "started" }, {
    correlation: { observed: {}, normalized: { agentRunId: "run-2" } },
  });
  const retryCompleted = event(5, {
    kind: "retry.lifecycle",
    phase: "completed",
    attempt: 1,
    success: true,
  });
  const secondEnd = event(6, {
    kind: "agent.lifecycle",
    phase: "ended",
    willRetry: false,
  }, {
    correlation: { observed: {}, normalized: { agentRunId: "run-2" } },
  });
  const extensionSecondEnd = event(2, {
    kind: "agent.lifecycle",
    phase: "ended",
    willRetry: "unavailable",
  }, {
    source: { adapter: "pi", runtime, surface: "extension", eventType: "agent_end" },
    sequence: { domain: "extension-events", value: 2 },
  });
  const settled = event(7, { kind: "agent.lifecycle", phase: "settled" }, {
    stability: "settled",
    correlation: { observed: {}, normalized: { agentRunId: "run-2" } },
  });

  const trace = parseNormalizedRuntimeEventTraceV1([
    firstStart,
    firstEnd,
    extensionFirstEnd,
    retryStarted,
    secondStart,
    retryCompleted,
    secondEnd,
    extensionSecondEnd,
    settled,
  ]);
  assert.deepEqual(
    trace
      .filter((candidate) => candidate.data.kind === "agent.lifecycle" && candidate.source.surface === "sdk")
      .map((candidate) => candidate.correlation.normalized.agentRunId),
    ["run-1", "run-1", "run-2", "run-2", "run-2"],
  );
  assert.equal(retryStarted.correlation.normalized.agentRunId, undefined);
  assert.equal(retryCompleted.correlation.normalized.agentRunId, undefined);
  assert.equal(retryCompleted.data.kind === "retry.lifecycle" && retryCompleted.data.success, true);

  assert.throws(
    () => event(8, {
      kind: "retry.lifecycle",
      phase: "completed",
      attempt: 0,
      success: true,
    }),
    /safe integer >= 1/,
  );

  const orphanCompletion = event(8, {
    kind: "retry.lifecycle",
    phase: "completed",
    attempt: 2,
    success: true,
  });
  assert.throws(
    () => parseNormalizedRuntimeEventTraceV1([orphanCompletion]),
    /no earlier matching start/,
  );
});

test("tool result messages require Tool Call identity and one completion link", () => {
  const declared = declaration(1, "read", "tool-1");
  const completed = completion(2, declared);

  assert.throws(
    () => event(3, {
      kind: "message.lifecycle",
      phase: "ended",
      role: "tool",
      toolName: "read",
      success: true,
      body: { text: "done" },
    }, {
      links: { sourceEventIds: [completed.eventId] },
    }),
    /requires normalized.toolCallId/,
  );
  assert.throws(
    () => event(4, {
      kind: "message.lifecycle",
      phase: "ended",
      role: "tool",
      toolName: "read",
      success: true,
      body: { text: "done" },
    }, {
      correlation: { observed: {}, normalized: { toolCallId: "tool-1" } },
    }),
    /link exactly one completed Tool event/,
  );
  assert.throws(
    () => event(5, {
      kind: "message.lifecycle",
      phase: "updated",
      role: "tool",
      delta: "not-supported",
    } as any, {
      correlation: { observed: {}, normalized: { toolCallId: "tool-1" } },
      links: { sourceEventIds: [completed.eventId] },
      persistence: "ephemeral",
      stability: "update",
      compatibility: "ignorable",
    }),
    /data.phase is unsupported/,
  );
});

test("tool result lineage matches completion, Runtime scope, and known parents", () => {
  const run1 = event(1, { kind: "agent.lifecycle", phase: "started" }, {
    correlation: { observed: {}, normalized: { agentRunId: "run-1" } },
  });
  const turn1 = event(2, { kind: "turn.lifecycle", phase: "started" }, {
    correlation: { observed: {}, normalized: { agentRunId: "run-1", turnId: "turn-1" } },
  });
  const declared = declaration(3, "read", "tool-1", {
    agentRunId: "run-1",
    turnId: "turn-1",
  });
  const completed = completion(4, declared);
  const started = toolMessage(5, completed, "started", {
    correlation: {
      observed: {},
      normalized: {
        agentRunId: "run-1",
        turnId: "turn-1",
        messageId: "tool-message-1",
        toolCallId: "tool-1",
      },
    },
  });
  const ended = toolMessage(6, completed, "ended", {
    correlation: started.correlation,
  });
  assert.equal(
    parseNormalizedRuntimeEventTraceV1([run1, turn1, declared, completed, started, ended]).length,
    6,
  );

  const wrongFact = toolMessage(7, completed, "ended", {
    correlation: { observed: {}, normalized: { toolCallId: "tool-1" } },
    links: { sourceEventIds: [declared.eventId] },
  });
  assert.throws(
    () => parseNormalizedRuntimeEventTraceV1([run1, turn1, declared, completed, wrongFact]),
    /link one completed Tool event/,
  );

  const wrongName = event(7, {
    kind: "message.lifecycle",
    phase: "ended",
    role: "tool",
    toolName: "write",
    success: true,
    body: { text: "done" },
  }, {
    correlation: { observed: {}, normalized: { toolCallId: "tool-1" } },
    links: { sourceEventIds: [completed.eventId] },
  });
  assert.throws(
    () => parseNormalizedRuntimeEventTraceV1([run1, turn1, declared, completed, wrongName]),
    /does not match/,
  );

  const plainDeclared = declaration(1, "plain", "tool-plain");
  const plainCompleted = completion(2, plainDeclared);
  const crossSession = toolMessage(3, plainCompleted, "ended", {
    runtimeSessionId: ids.session("other-session"),
    correlation: { observed: {}, normalized: { toolCallId: "tool-plain" } },
  });
  assert.throws(
    () => parseNormalizedRuntimeEventTraceV1([plainDeclared, plainCompleted, crossSession]),
    /one Runtime Session and Runtime instance/,
  );

  const crossInstance = toolMessage(1, plainCompleted, "ended", {
    runtimeInstanceId: "worker-2",
    sequence: { domain: "sdk-public-events", value: 1 },
    correlation: { observed: {}, normalized: { toolCallId: "tool-plain" } },
  });
  assert.throws(
    () => parseNormalizedRuntimeEventTraceV1([plainDeclared, plainCompleted, crossInstance]),
    /one Runtime Session and Runtime instance/,
  );

  const run2 = event(7, { kind: "agent.lifecycle", phase: "started" }, {
    correlation: { observed: {}, normalized: { agentRunId: "run-2" } },
  });
  const turn2 = event(8, { kind: "turn.lifecycle", phase: "started" }, {
    correlation: { observed: {}, normalized: { agentRunId: "run-2", turnId: "turn-2" } },
  });
  const crossRun = toolMessage(9, completed, "ended", {
    correlation: {
      observed: {},
      normalized: {
        agentRunId: "run-2",
        turnId: "turn-2",
        toolCallId: "tool-1",
      },
    },
  });
  assert.throws(
    () => parseNormalizedRuntimeEventTraceV1([
      run1,
      turn1,
      declared,
      completed,
      run2,
      turn2,
      crossRun,
    ]),
    /changed normalized.agentRunId/,
  );
});

test("Tool completion and Tool Result Message orders remain independently replayable", () => {
  const declarations = new Map<string, NormalizedRuntimeEventV1>();
  let sequence = 1;
  for (const name of ["alpha", "beta", "gamma"]) {
    declarations.set(name, declaration(sequence, name, `tool-${name}`));
    sequence += 1;
  }
  const completions = new Map<string, NormalizedRuntimeEventV1>();
  const ordered: NormalizedRuntimeEventV1[] = [...declarations.values()];
  for (const name of ["beta", "gamma", "alpha"]) {
    const completed = completion(sequence, declarations.get(name)!);
    sequence += 1;
    completions.set(name, completed);
    ordered.push(completed);
  }
  for (const name of ["alpha", "beta", "gamma"]) {
    ordered.push(toolMessage(sequence, completions.get(name)!, "ended", {
      correlation: {
        observed: {},
        normalized: { toolCallId: `tool-${name}` },
      },
    }));
    sequence += 1;
  }
  const snapshot = event(sequence, {
    kind: "snapshot.messages",
    messages: ["alpha", "beta", "gamma"].map((name) => ({
      role: "tool" as const,
      toolCallId: `tool-${name}`,
      toolName: name,
      success: true,
      contentKinds: ["tool-result"],
      text: name,
    })),
  });
  ordered.push(snapshot);

  const trace = parseNormalizedRuntimeEventTraceV1(ordered);
  assert.deepEqual(
    trace
      .filter((candidate) => candidate.data.kind === "tool.lifecycle" && candidate.data.phase === "completed")
      .map((candidate) => candidate.data.kind === "tool.lifecycle" ? candidate.data.toolName : ""),
    ["beta", "gamma", "alpha"],
  );
  assert.deepEqual(
    trace
      .filter((candidate) => candidate.data.kind === "message.lifecycle" && candidate.data.role === "tool")
      .map((candidate) => candidate.data.kind === "message.lifecycle" && candidate.data.role === "tool"
        ? candidate.correlation.normalized.toolCallId
        : ""),
    ["tool-alpha", "tool-beta", "tool-gamma"],
  );
  assert.deepEqual(
    snapshot.data.kind === "snapshot.messages"
      ? snapshot.data.messages.map((message) => message.role === "tool" ? message.toolCallId : "")
      : [],
    ["tool-alpha", "tool-beta", "tool-gamma"],
  );

  assert.throws(
    () => event(sequence + 1, {
      kind: "snapshot.messages",
      messages: [{ role: "tool", toolName: "alpha", success: true, text: "alpha" }],
    } as any),
    /toolCallId/,
  );
});
