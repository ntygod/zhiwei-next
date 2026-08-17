import type { NormalizedRuntimeEventV1 } from "../src/index.ts";
import type { FixtureContext } from "./normalized-runtime-event-v1.fixture-context.ts";

export function append_primary_command_fixture({ append }: FixtureContext): NormalizedRuntimeEventV1 {
  append({
    surface: "host",
    sequenceDomain: "host-client-actions",
    sourceEventType: "host_send_command",
    provenance: "host-synthesized",
    correlation: {
      observed: { requestId: "fixture-request-a" },
      normalized: { promptId: "fixture-prompt-a", rpcRequestId: "fixture-rpc-a" },
    },
    data: {
      kind: "host.action",
      action: "send-command",
      command: "prompt",
      requestId: "fixture-request-a",
    },
  });
  append({
    surface: "host",
    sequenceDomain: "process-boundaries",
    sourceEventType: "process_spawn",
    data: { kind: "process.boundary", boundary: "spawn" },
  });
  append({
    surface: "rpc",
    sequenceDomain: "rpc-worker-output",
    sourceEventType: "response",
    correlation: {
      observed: { requestId: "fixture-request-a" },
      normalized: { promptId: "fixture-prompt-a", rpcRequestId: "fixture-rpc-a" },
    },
    data: {
      kind: "command.response",
      command: "prompt",
      success: true,
      phase: "preflight-result",
    },
  });

  append({
    surface: "sdk",
    sequenceDomain: "sdk-public-events",
    sourceEventType: "agent_start",
    correlation: { observed: {}, normalized: { promptId: "fixture-prompt-a", agentRunId: "fixture-run-a" } },
    data: { kind: "agent.lifecycle", phase: "started" },
  });
  append({
    surface: "sdk",
    sequenceDomain: "sdk-public-events",
    sourceEventType: "turn_start",
    correlation: { observed: {}, normalized: { agentRunId: "fixture-run-a", turnId: "fixture-turn-a" } },
    data: { kind: "turn.lifecycle", phase: "started" },
  });
  append({
    surface: "sdk",
    sequenceDomain: "sdk-public-events",
    sourceEventType: "message_start",
    correlation: {
      observed: {},
      normalized: {
        agentRunId: "fixture-run-a",
        turnId: "fixture-turn-a",
        messageId: "fixture-message-a",
      },
    },
    data: { kind: "message.lifecycle", phase: "started", role: "assistant", contentKinds: [] },
  });
  append({
    surface: "sdk",
    sequenceDomain: "sdk-public-events",
    sourceEventType: "message_update",
    persistence: "ephemeral",
    stability: "update",
    compatibility: "ignorable",
    correlation: {
      observed: {},
      normalized: {
        agentRunId: "fixture-run-a",
        turnId: "fixture-turn-a",
        messageId: "fixture-message-a",
      },
    },
    data: { kind: "message.lifecycle", phase: "updated", role: "assistant", delta: "partial" },
  });
  const messageEnd = append({
    surface: "sdk",
    sequenceDomain: "sdk-public-events",
    sourceEventType: "message_end",
    correlation: {
      observed: {},
      normalized: {
        agentRunId: "fixture-run-a",
        turnId: "fixture-turn-a",
        messageId: "fixture-message-a",
      },
    },
    data: {
      kind: "message.lifecycle",
      phase: "ended",
      role: "assistant",
      contentKinds: ["text", "tool-call"],
      stopReason: "stop",
      body: { text: "fixture response" },
    },
  });
  return messageEnd;
}
