import type { IsoTimestamp, SessionId, WorkspaceId } from "../../domain/src/index.ts";
import {
  canonicalJsonSha256V1,
  createNormalizedRuntimeEventV1,
  snapshotJsonValue,
  type JsonValue,
  type NormalizedRuntimeCompatibilityV1,
  type NormalizedRuntimeCorrelationV1,
  type NormalizedRuntimeEventV1,
  type NormalizedRuntimeLinksV1,
  type NormalizedRuntimePayloadV1,
  type NormalizedRuntimeProvenanceV1,
  type NormalizedRuntimeSourceSurfaceV1,
} from "../../protocol/src/index.ts";

export type PiRuntimeEventInputV1 =
  | {
      readonly type: "command_response";
      readonly command: string;
      readonly success: boolean;
      readonly error?: { readonly code?: string; readonly message: string };
    }
  | { readonly type: "agent_start" }
  | { readonly type: "agent_end"; readonly willRetry: boolean }
  | { readonly type: "agent_settled" }
  | { readonly type: "turn_start" }
  | { readonly type: "turn_end"; readonly toolResultCount?: number }
  | {
      readonly type: "message_start" | "message_update" | "message_end";
      readonly role: "user" | "assistant" | "tool" | "system";
      readonly contentKinds?: readonly string[];
      readonly stopReason?: string;
      readonly errorMessage?: string;
      readonly delta?: string;
      readonly body?: unknown;
    }
  | {
      readonly type: "tool_declared" | "tool_started" | "tool_completed";
      readonly toolName: string;
      readonly success?: boolean;
      readonly input?: unknown;
      readonly result?: unknown;
    }
  | {
      readonly type: "queue_state";
      readonly queue: "steering" | "follow-up";
      readonly pending: number;
      readonly mode?: string;
    }
  | {
      readonly type: "retry_scheduled" | "retry_started" | "retry_aborted" | "retry_exhausted";
      readonly attempt?: number;
      readonly delayMs?: number;
      readonly reason?: string;
    }
  | {
      readonly type: "compaction_start" | "compaction_end";
      readonly summaryKind?: string;
    }
  | {
      readonly type:
        | "session_start"
        | "session_resume"
        | "session_replaced"
        | "session_shutdown"
        | "session_invalidated"
        | "listener_rebound";
      readonly reason?: string;
      readonly previousSessionIdentity?: string;
      readonly nextSessionIdentity?: string;
      readonly previousRuntimeInstanceId?: string;
      readonly nextRuntimeInstanceId?: string;
    }
  | { readonly type: "state_snapshot"; readonly state: unknown }
  | { readonly type: "messages_snapshot"; readonly messages: readonly unknown[] }
  | {
      readonly type:
        | "process_spawn"
        | "extension_shutdown"
        | "process_exit"
        | "process_close";
      readonly code?: number | null;
      readonly signal?: string | null;
      readonly reason?: string;
    }
  | {
      readonly type: "host_send_command";
      readonly command: string;
      readonly requestId?: string;
    }
  | { readonly type: "host_close_stdin" }
  | {
      readonly type: "host_request_signal";
      readonly signal: string;
      readonly accepted?: boolean;
    }
  | {
      readonly type: "unknown";
      readonly sourceType: string;
      readonly payload: unknown;
      readonly compatibility: NormalizedRuntimeCompatibilityV1;
    };

export interface PiRuntimeNormalizationInputV1 {
  readonly workspaceId: WorkspaceId;
  readonly runtimeSessionId: SessionId;
  readonly runtimeInstanceId: string;
  readonly runtimeVersion: string;
  readonly surface: NormalizedRuntimeSourceSurfaceV1;
  readonly sequenceDomain: string;
  readonly sourceSequence: number;
  readonly sourceEventType: string;
  readonly observedAt: IsoTimestamp;
  readonly provenance: NormalizedRuntimeProvenanceV1;
  readonly correlation: NormalizedRuntimeCorrelationV1;
  readonly links?: NormalizedRuntimeLinksV1;
  readonly event: PiRuntimeEventInputV1;
}

function compactObject<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined),
  ) as T;
}

function payload(event: PiRuntimeEventInputV1): NormalizedRuntimePayloadV1 {
  if (event.type === "command_response") {
    return compactObject({
      kind: "command.response" as const,
      command: event.command,
      success: event.success,
      phase: event.command === "prompt" ? "preflight-result" as const : "command-result" as const,
      error: event.error,
    });
  }
  if (event.type === "agent_start") {
    return { kind: "agent.lifecycle", phase: "started" };
  }
  if (event.type === "agent_end") {
    return { kind: "agent.lifecycle", phase: "ended", willRetry: event.willRetry };
  }
  if (event.type === "agent_settled") {
    return { kind: "agent.lifecycle", phase: "settled" };
  }
  if (event.type === "turn_start") {
    return { kind: "turn.lifecycle", phase: "started" };
  }
  if (event.type === "turn_end") {
    return compactObject({
      kind: "turn.lifecycle" as const,
      phase: "ended" as const,
      toolResultCount: event.toolResultCount,
    });
  }
  if (["message_start", "message_update", "message_end"].includes(event.type)) {
    const message = event as Extract<
      PiRuntimeEventInputV1,
      { type: "message_start" | "message_update" | "message_end" }
    >;
    const phase = message.type === "message_start"
      ? "started"
      : message.type === "message_update"
        ? "updated"
        : "ended";
    return compactObject({
      kind: "message.lifecycle" as const,
      phase,
      role: message.role,
      contentKinds: message.contentKinds,
      stopReason: message.stopReason,
      errorMessage: message.errorMessage,
      delta: message.delta,
      body: message.body === undefined ? undefined : snapshotJsonValue(message.body),
    }) as NormalizedRuntimePayloadV1;
  }
  if (["tool_declared", "tool_started", "tool_completed"].includes(event.type)) {
    const tool = event as Extract<
      PiRuntimeEventInputV1,
      { type: "tool_declared" | "tool_started" | "tool_completed" }
    >;
    const phase = tool.type === "tool_declared"
      ? "declared"
      : tool.type === "tool_started"
        ? "started"
        : "completed";
    return compactObject({
      kind: "tool.lifecycle" as const,
      phase,
      toolName: tool.toolName,
      success: tool.success,
      input: tool.input === undefined ? undefined : snapshotJsonValue(tool.input),
      result: tool.result === undefined ? undefined : snapshotJsonValue(tool.result),
    }) as NormalizedRuntimePayloadV1;
  }
  if (event.type === "queue_state") {
    return compactObject({
      kind: "queue.changed" as const,
      queue: event.queue,
      pending: event.pending,
      mode: event.mode,
    });
  }
  if (["retry_scheduled", "retry_started", "retry_aborted", "retry_exhausted"].includes(event.type)) {
    const retry = event as Extract<
      PiRuntimeEventInputV1,
      { type: "retry_scheduled" | "retry_started" | "retry_aborted" | "retry_exhausted" }
    >;
    const phases = {
      retry_scheduled: "scheduled",
      retry_started: "started",
      retry_aborted: "aborted",
      retry_exhausted: "exhausted",
    } as const;
    return compactObject({
      kind: "retry.lifecycle" as const,
      phase: phases[retry.type],
      attempt: retry.attempt,
      delayMs: retry.delayMs,
      reason: retry.reason,
    });
  }
  if (event.type === "compaction_start" || event.type === "compaction_end") {
    return compactObject({
      kind: "compaction.lifecycle" as const,
      phase: event.type === "compaction_start" ? "started" as const : "completed" as const,
      summaryKind: event.summaryKind,
    });
  }
  if (
    [
      "session_start",
      "session_resume",
      "session_replaced",
      "session_shutdown",
      "session_invalidated",
      "listener_rebound",
    ].includes(event.type)
  ) {
    const session = event as Extract<
      PiRuntimeEventInputV1,
      {
        type:
          | "session_start"
          | "session_resume"
          | "session_replaced"
          | "session_shutdown"
          | "session_invalidated"
          | "listener_rebound";
      }
    >;
    const actions = {
      session_start: "started",
      session_resume: "resumed",
      session_replaced: "replaced",
      session_shutdown: "shutdown",
      session_invalidated: "invalidated",
      listener_rebound: "listener-rebound",
    } as const;
    return compactObject({
      kind: "session.identity" as const,
      action: actions[session.type],
      reason: session.reason,
      previousSessionIdentity: session.previousSessionIdentity,
      nextSessionIdentity: session.nextSessionIdentity,
      previousRuntimeInstanceId: session.previousRuntimeInstanceId,
      nextRuntimeInstanceId: session.nextRuntimeInstanceId,
    });
  }
  if (event.type === "state_snapshot") {
    return { kind: "snapshot.state", state: snapshotJsonValue(event.state) };
  }
  if (event.type === "messages_snapshot") {
    return {
      kind: "snapshot.messages",
      messages: snapshotJsonValue(event.messages) as readonly JsonValue[],
    };
  }
  if (
    [
      "process_spawn",
      "extension_shutdown",
      "process_exit",
      "process_close",
    ].includes(event.type)
  ) {
    const process = event as Extract<
      PiRuntimeEventInputV1,
      {
        type:
          | "process_spawn"
          | "extension_shutdown"
          | "process_exit"
          | "process_close";
      }
    >;
    const boundaries = {
      process_spawn: "spawn",
      extension_shutdown: "extension-shutdown",
      process_exit: "exit",
      process_close: "close",
    } as const;
    return compactObject({
      kind: "process.boundary" as const,
      boundary: boundaries[process.type],
      code: process.code,
      signal: process.signal,
      reason: process.reason,
    });
  }
  if (event.type === "host_send_command") {
    return compactObject({
      kind: "host.action" as const,
      action: "send-command" as const,
      command: event.command,
      requestId: event.requestId,
    });
  }
  if (event.type === "host_close_stdin") {
    return { kind: "host.action", action: "close-stdin" };
  }
  if (event.type === "host_request_signal") {
    return compactObject({
      kind: "host.action" as const,
      action: "request-signal" as const,
      signal: event.signal,
      accepted: event.accepted,
    });
  }

  const snapshot = snapshotJsonValue(event.payload);
  const keys =
    snapshot !== null && typeof snapshot === "object" && !Array.isArray(snapshot)
      ? Object.keys(snapshot).sort()
      : [];
  return {
    kind: "runtime.unknown",
    sourceType: event.sourceType,
    keys,
    payloadSha256: canonicalJsonSha256V1(snapshot),
    canonicalization: "zhiwei-json-v1",
  };
}

function semantics(event: PiRuntimeEventInputV1): {
  persistence: "durable" | "ephemeral";
  stability: "update" | "boundary" | "settled";
  compatibility: NormalizedRuntimeCompatibilityV1;
} {
  if (event.type === "message_update") {
    return { persistence: "ephemeral", stability: "update", compatibility: "ignorable" };
  }
  if (event.type === "agent_settled") {
    return { persistence: "durable", stability: "settled", compatibility: "required" };
  }
  if (event.type === "unknown") {
    return { persistence: "durable", stability: "boundary", compatibility: event.compatibility };
  }
  return { persistence: "durable", stability: "boundary", compatibility: "required" };
}

export function normalizePiRuntimeEventV1(
  input: PiRuntimeNormalizationInputV1,
): NormalizedRuntimeEventV1 {
  const eventSemantics = semantics(input.event);
  return createNormalizedRuntimeEventV1({
    protocolVersion: 1,
    workspaceId: input.workspaceId,
    runtimeSessionId: input.runtimeSessionId,
    runtimeInstanceId: input.runtimeInstanceId,
    source: {
      adapter: "pi",
      runtime: {
        implementation: "@earendil-works/pi-coding-agent",
        version: input.runtimeVersion,
      },
      surface: input.surface,
      eventType: input.event.type === "unknown" ? input.event.sourceType : input.sourceEventType,
    },
    sequence: {
      domain: input.sequenceDomain,
      value: input.sourceSequence,
    },
    observedAt: input.observedAt,
    provenance: input.provenance,
    ...eventSemantics,
    correlation: input.correlation,
    ...(input.links ? { links: input.links } : {}),
    data: payload(input.event),
  });
}
