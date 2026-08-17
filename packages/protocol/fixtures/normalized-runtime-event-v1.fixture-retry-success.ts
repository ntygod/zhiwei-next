import type { FixtureContext } from "./normalized-runtime-event-v1.fixture-context.ts";

export function append_retry_success_fixture({ append, sessions }: FixtureContext): void {
  append({
    runtimeSessionId: sessions.sessionE,
    runtimeInstanceId: "fixture-worker-retry-success",
    surface: "sdk",
    sequenceDomain: "sdk-public-events",
    sourceEventType: "agent_start",
    correlation: { observed: {}, normalized: { agentRunId: "fixture-run-e1" } },
    data: { kind: "agent.lifecycle", phase: "started" },
  });
  append({
    runtimeSessionId: sessions.sessionE,
    runtimeInstanceId: "fixture-worker-retry-success",
    surface: "sdk",
    sequenceDomain: "sdk-public-events",
    sourceEventType: "agent_end",
    correlation: { observed: {}, normalized: { agentRunId: "fixture-run-e1" } },
    data: { kind: "agent.lifecycle", phase: "ended", willRetry: true },
  });
  append({
    runtimeSessionId: sessions.sessionE,
    runtimeInstanceId: "fixture-worker-retry-success",
    surface: "extension",
    sequenceDomain: "extension-events",
    sourceEventType: "agent_end",
    data: { kind: "agent.lifecycle", phase: "ended", willRetry: "unavailable" },
  });
  append({
    runtimeSessionId: sessions.sessionE,
    runtimeInstanceId: "fixture-worker-retry-success",
    surface: "sdk",
    sequenceDomain: "sdk-public-events",
    sourceEventType: "auto_retry_start",
    data: { kind: "retry.lifecycle", phase: "started", attempt: 1 },
  });
  append({
    runtimeSessionId: sessions.sessionE,
    runtimeInstanceId: "fixture-worker-retry-success",
    surface: "sdk",
    sequenceDomain: "sdk-public-events",
    sourceEventType: "agent_start",
    correlation: { observed: {}, normalized: { agentRunId: "fixture-run-e2" } },
    data: { kind: "agent.lifecycle", phase: "started" },
  });
  append({
    runtimeSessionId: sessions.sessionE,
    runtimeInstanceId: "fixture-worker-retry-success",
    surface: "sdk",
    sequenceDomain: "sdk-public-events",
    sourceEventType: "auto_retry_end",
    data: { kind: "retry.lifecycle", phase: "completed", attempt: 1, success: true },
  });
  append({
    runtimeSessionId: sessions.sessionE,
    runtimeInstanceId: "fixture-worker-retry-success",
    surface: "sdk",
    sequenceDomain: "sdk-public-events",
    sourceEventType: "agent_end",
    correlation: { observed: {}, normalized: { agentRunId: "fixture-run-e2" } },
    data: { kind: "agent.lifecycle", phase: "ended", willRetry: false },
  });
  append({
    runtimeSessionId: sessions.sessionE,
    runtimeInstanceId: "fixture-worker-retry-success",
    surface: "extension",
    sequenceDomain: "extension-events",
    sourceEventType: "agent_end",
    data: { kind: "agent.lifecycle", phase: "ended", willRetry: "unavailable" },
  });
  append({
    runtimeSessionId: sessions.sessionE,
    runtimeInstanceId: "fixture-worker-retry-success",
    surface: "sdk",
    sequenceDomain: "sdk-public-events",
    sourceEventType: "agent_settled",
    stability: "settled",
    correlation: { observed: {}, normalized: { agentRunId: "fixture-run-e2" } },
    data: { kind: "agent.lifecycle", phase: "settled" },
  });

}
