import type { FixtureContext } from "./normalized-runtime-event-v1.fixture-context.ts";

export function append_failure_exhausted_fixture({ append, sessions }: FixtureContext): void {
  append({
    runtimeSessionId: sessions.sessionD,
    runtimeInstanceId: "fixture-worker-exhausted",
    surface: "sdk",
    sequenceDomain: "sdk-public-events",
    sourceEventType: "agent_start",
    correlation: { observed: {}, normalized: { agentRunId: "fixture-run-d" } },
    data: { kind: "agent.lifecycle", phase: "started" },
  });
  append({
    runtimeSessionId: sessions.sessionD,
    runtimeInstanceId: "fixture-worker-exhausted",
    surface: "sdk",
    sequenceDomain: "sdk-public-events",
    sourceEventType: "message_start",
    correlation: { observed: {}, normalized: { agentRunId: "fixture-run-d", messageId: "fixture-message-d" } },
    data: { kind: "message.lifecycle", phase: "started", role: "assistant" },
  });
  append({
    runtimeSessionId: sessions.sessionD,
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
    runtimeSessionId: sessions.sessionD,
    runtimeInstanceId: "fixture-worker-exhausted",
    surface: "sdk",
    sequenceDomain: "sdk-public-events",
    sourceEventType: "agent_end",
    correlation: { observed: {}, normalized: { agentRunId: "fixture-run-d" } },
    data: { kind: "agent.lifecycle", phase: "ended", willRetry: false },
  });
  append({
    runtimeSessionId: sessions.sessionD,
    runtimeInstanceId: "fixture-worker-exhausted",
    surface: "extension",
    sequenceDomain: "extension-events",
    sourceEventType: "retry_exhausted",
    correlation: { observed: {}, normalized: { agentRunId: "fixture-run-d" } },
    data: { kind: "retry.lifecycle", phase: "exhausted", attempt: 3, reason: "maximum attempts" },
  });
  append({
    runtimeSessionId: sessions.sessionD,
    runtimeInstanceId: "fixture-worker-exhausted",
    surface: "sdk",
    sequenceDomain: "sdk-public-events",
    sourceEventType: "agent_settled",
    stability: "settled",
    correlation: { observed: {}, normalized: { agentRunId: "fixture-run-d" } },
    data: { kind: "agent.lifecycle", phase: "settled" },
  });
}
