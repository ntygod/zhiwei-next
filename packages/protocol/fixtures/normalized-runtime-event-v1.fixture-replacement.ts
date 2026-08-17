import type { FixtureContext } from "./normalized-runtime-event-v1.fixture-context.ts";

export function append_replacement_fixture({ append, sessions }: FixtureContext): void {
  append({
    runtimeSessionId: sessions.sessionR,
    runtimeInstanceId: "fixture-worker-r",
    surface: "host",
    sequenceDomain: "process-boundaries",
    sourceEventType: "process_spawn",
    data: { kind: "process.boundary", boundary: "spawn" },
  });
  append({
    runtimeSessionId: sessions.sessionR,
    runtimeInstanceId: "fixture-worker-r",
    surface: "extension",
    sequenceDomain: "extension-events",
    sourceEventType: "session_start",
    data: { kind: "session.identity", action: "started", nextSessionIdentity: "session-object-r1" },
  });
  const oldShutdown = append({
    runtimeSessionId: sessions.sessionR,
    runtimeInstanceId: "fixture-worker-r",
    surface: "extension",
    sequenceDomain: "extension-events",
    sourceEventType: "session_shutdown",
    data: {
      kind: "session.identity",
      action: "shutdown",
      reason: "new",
      previousSessionIdentity: "session-object-r1",
    },
  });
  append({
    runtimeSessionId: sessions.sessionR,
    runtimeInstanceId: "fixture-worker-r",
    surface: "host",
    sequenceDomain: "session-orchestration",
    sourceEventType: "session_invalidated",
    provenance: "host-synthesized",
    data: {
      kind: "session.identity",
      action: "invalidated",
      reason: "new",
      previousSessionIdentity: "session-object-r1",
    },
  });
  const newStart = append({
    runtimeSessionId: sessions.sessionR,
    runtimeInstanceId: "fixture-worker-r",
    surface: "extension",
    sequenceDomain: "extension-events",
    sourceEventType: "session_start",
    data: {
      kind: "session.identity",
      action: "started",
      previousSessionIdentity: "session-object-r1",
      nextSessionIdentity: "session-object-r2",
    },
  });
  append({
    runtimeSessionId: sessions.sessionR,
    runtimeInstanceId: "fixture-worker-r",
    surface: "host",
    sequenceDomain: "session-orchestration",
    sourceEventType: "session_replaced",
    provenance: "host-synthesized",
    links: { sourceEventIds: [oldShutdown.eventId, newStart.eventId] },
    data: {
      kind: "session.identity",
      action: "replaced",
      previousSessionIdentity: "session-object-r1",
      nextSessionIdentity: "session-object-r2",
      previousRuntimeInstanceId: "fixture-worker-r",
      nextRuntimeInstanceId: "fixture-worker-r",
    },
  });
  append({
    runtimeSessionId: sessions.sessionR,
    runtimeInstanceId: "fixture-worker-r",
    surface: "host",
    sequenceDomain: "session-orchestration",
    sourceEventType: "listener_rebound",
    provenance: "host-synthesized",
    data: {
      kind: "session.identity",
      action: "listener-rebound",
      previousSessionIdentity: "session-object-r1",
      nextSessionIdentity: "session-object-r2",
    },
  });
  append({
    runtimeSessionId: sessions.sessionR,
    runtimeInstanceId: "fixture-worker-r",
    surface: "host",
    sequenceDomain: "host-client-actions",
    sourceEventType: "host_request_signal",
    provenance: "host-synthesized",
    data: { kind: "host.action", action: "request-signal", signal: "SIGTERM", accepted: true },
  });
  append({
    runtimeSessionId: sessions.sessionR,
    runtimeInstanceId: "fixture-worker-r",
    surface: "extension",
    sequenceDomain: "extension-events",
    sourceEventType: "extension_shutdown",
    data: {
      kind: "session.identity",
      action: "shutdown",
      reason: "quit",
      previousSessionIdentity: "session-object-r2",
    },
  });
  append({
    runtimeSessionId: sessions.sessionR,
    runtimeInstanceId: "fixture-worker-r",
    surface: "host",
    sequenceDomain: "process-boundaries",
    sourceEventType: "process_exit",
    data: { kind: "process.boundary", boundary: "exit", code: 143, signal: null },
  });
  append({
    runtimeSessionId: sessions.sessionR,
    runtimeInstanceId: "fixture-worker-r",
    surface: "host",
    sequenceDomain: "process-boundaries",
    sourceEventType: "process_close",
    data: { kind: "process.boundary", boundary: "close", code: 143, signal: null },
  });
  append({
    runtimeSessionId: sessions.sessionR,
    runtimeInstanceId: "fixture-worker-r",
    surface: "extension",
    sequenceDomain: "extension-events",
    sourceEventType: "future_event",
    compatibility: "ignorable",
    data: {
      kind: "runtime.unknown",
      sourceType: "future_event",
      keys: ["future", "type"],
      payloadSha256: "6180454abcf86cc4a5aa187bc3396dde1dbaa09bdf3608556c01fccab81189e6",
      canonicalization: "zhiwei-json-v1",
    },
  });
}
