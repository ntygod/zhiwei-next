import type { FixtureContext } from "./normalized-runtime-event-v1.fixture-context.ts";

export function append_failure_cancel_fixture({ append, sessions }: FixtureContext): void {
  append({
    runtimeSessionId: sessions.sessionC,
    runtimeInstanceId: "fixture-worker-cancel",
    surface: "sdk",
    sequenceDomain: "sdk-public-events",
    sourceEventType: "agent_start",
    correlation: { observed: {}, normalized: { agentRunId: "fixture-run-c" } },
    data: { kind: "agent.lifecycle", phase: "started" },
  });
  append({
    runtimeSessionId: sessions.sessionC,
    runtimeInstanceId: "fixture-worker-cancel",
    surface: "sdk",
    sequenceDomain: "sdk-public-events",
    sourceEventType: "turn_start",
    correlation: { observed: {}, normalized: { agentRunId: "fixture-run-c", turnId: "fixture-turn-c" } },
    data: { kind: "turn.lifecycle", phase: "started" },
  });
  append({
    runtimeSessionId: sessions.sessionC,
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
    runtimeSessionId: sessions.sessionC,
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
    runtimeSessionId: sessions.sessionC,
    runtimeInstanceId: "fixture-worker-cancel",
    surface: "sdk",
    sequenceDomain: "sdk-public-events",
    sourceEventType: "turn_end",
    correlation: { observed: {}, normalized: { agentRunId: "fixture-run-c", turnId: "fixture-turn-c" } },
    data: { kind: "turn.lifecycle", phase: "ended", toolResultCount: 0 },
  });
  append({
    runtimeSessionId: sessions.sessionC,
    runtimeInstanceId: "fixture-worker-cancel",
    surface: "sdk",
    sequenceDomain: "sdk-public-events",
    sourceEventType: "agent_end",
    correlation: { observed: {}, normalized: { agentRunId: "fixture-run-c" } },
    data: { kind: "agent.lifecycle", phase: "ended", willRetry: true },
  });
  append({
    runtimeSessionId: sessions.sessionC,
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
    runtimeSessionId: sessions.sessionC,
    runtimeInstanceId: "fixture-worker-cancel",
    surface: "extension",
    sequenceDomain: "extension-events",
    sourceEventType: "retry_aborted",
    correlation: { observed: {}, normalized: { agentRunId: "fixture-run-c" } },
    data: { kind: "retry.lifecycle", phase: "aborted", attempt: 2, reason: "user-cancel" },
  });
  append({
    runtimeSessionId: sessions.sessionC,
    runtimeInstanceId: "fixture-worker-cancel",
    surface: "sdk",
    sequenceDomain: "sdk-public-events",
    sourceEventType: "agent_settled",
    stability: "settled",
    correlation: { observed: {}, normalized: { agentRunId: "fixture-run-c" } },
    data: { kind: "agent.lifecycle", phase: "settled" },
  });
}
