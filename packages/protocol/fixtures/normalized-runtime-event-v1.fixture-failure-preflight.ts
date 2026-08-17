import type { FixtureContext } from "./normalized-runtime-event-v1.fixture-context.ts";

export function append_failure_preflight_fixture({ append, sessions }: FixtureContext): void {
  append({
    runtimeSessionId: sessions.sessionB,
    runtimeInstanceId: "fixture-worker-preflight",
    surface: "host",
    sequenceDomain: "host-client-actions",
    sourceEventType: "host_send_command",
    provenance: "host-synthesized",
    correlation: {
      observed: { requestId: "fixture-request-b" },
      normalized: { promptId: "fixture-prompt-b", rpcRequestId: "fixture-rpc-b" },
    },
    data: {
      kind: "host.action",
      action: "send-command",
      command: "prompt",
      requestId: "fixture-request-b",
    },
  });
  append({
    runtimeSessionId: sessions.sessionB,
    runtimeInstanceId: "fixture-worker-preflight",
    surface: "rpc",
    sequenceDomain: "rpc-worker-output",
    sourceEventType: "response",
    correlation: {
      observed: { requestId: "fixture-request-b" },
      normalized: { promptId: "fixture-prompt-b", rpcRequestId: "fixture-rpc-b" },
    },
    data: {
      kind: "command.response",
      command: "prompt",
      success: false,
      phase: "preflight-result",
      error: { code: "credentials-missing", message: "No API key" },
    },
  });
}
