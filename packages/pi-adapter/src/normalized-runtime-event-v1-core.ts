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
  type RuntimeMessageRoleV1,
  type RuntimeMessageSnapshotItemV1,
  type RuntimeSnapshotMessageRoleV1,
  type RuntimeStateProjectionV1,
} from "../../protocol/src/index.ts";

export interface PiRuntimeStateSnapshotInputV1 {
  readonly isStreaming: boolean;
  readonly messageCount: number;
  readonly pendingMessageCount: number;
  readonly isCompacting?: boolean;
  readonly isIdle?: boolean;
  readonly steeringQueueCount?: number;
  readonly followUpQueueCount?: number;
}
export interface PiRuntimeMessageSnapshotInputV1 {
  readonly role: RuntimeSnapshotMessageRoleV1;
  readonly contentKinds?: readonly string[];
  readonly stopReason?: string;
  readonly errorMessage?: string;
  readonly text?: string;
}

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
      readonly type: "message_start";
      readonly role: RuntimeMessageRoleV1;
      readonly contentKinds?: readonly string[];
    }
  | {
      readonly type: "message_update";
      readonly role: RuntimeMessageRoleV1;
      readonly delta: string;
    }
  | {
      readonly type: "message_end";
      readonly role: RuntimeMessageRoleV1;
      readonly contentKinds?: readonly string[];
      readonly stopReason?: string;
      readonly errorMessage?: string;
      readonly body?: { readonly text: string };
    }
  | {
      readonly type: "tool_declared";
      readonly toolName: string;
      readonly input?: unknown;
    }
  | {
      readonly type: "tool_started";
      readonly toolName: string;
    }
  | {
      readonly type: "tool_completed";
      readonly toolName: string;
      readonly success: boolean;
      readonly result?: unknown;
    }
  | {
      readonly type: "queue_state";
      readonly queue: "steering" | "follow-up";
      readonly pending: number;
      readonly mode?: string;
    }
  | {
      readonly type: "retry_scheduled";
      readonly attempt?: number;
      readonly delayMs?: number;
      readonly reason?: string;
    }
  | { readonly type: "retry_started"; readonly attempt?: number }
  | { readonly type: "retry_aborted"; readonly attempt?: number; readonly reason: string }
  | { readonly type: "retry_exhausted"; readonly attempt?: number; readonly reason?: string }
  | { readonly type: "compaction_start"; readonly reason?: string }
  | { readonly type: "compaction_end"; readonly summaryKind?: string }
  | {
      readonly type: "session_start";
      readonly nextSessionIdentity: string;
      readonly previousSessionIdentity?: string;
    }
  | {
      readonly type: "session_resume";
      readonly previousSessionIdentity: string;
      readonly nextSessionIdentity: string;
    }
  | {
      readonly type: "session_replaced";
      readonly previousSessionIdentity: string;
      readonly nextSessionIdentity: string;
      readonly previousRuntimeInstanceId?: string;
      readonly nextRuntimeInstanceId?: string;
    }
  | {
      readonly type: "session_shutdown" | "extension_shutdown";
      readonly reason: string;
      readonly previousSessionIdentity: string;
    }
  | {
      readonly type: "session_invalidated";
      readonly reason: string;
      readonly previousSessionIdentity: string;
    }
  | {
      readonly type: "listener_rebound";
      readonly previousSessionIdentity: string;
      readonly nextSessionIdentity: string;
    }
  | { readonly type: "state_snapshot"; readonly state: PiRuntimeStateSnapshotInputV1 }
  | { readonly type: "messages_snapshot"; readonly messages: readonly PiRuntimeMessageSnapshotInputV1[] }
  | { readonly type: "process_spawn" }
  | {
      readonly type: "process_exit" | "process_close";
      readonly code?: number | null;
      readonly signal?: string | null;
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
      readonly accepted: boolean;
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
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;
}
function projectState(state: PiRuntimeStateSnapshotInputV1): RuntimeStateProjectionV1 {
  return compactObject({
    isStreaming: state.isStreaming,
    messageCount: state.messageCount,
    pendingMessageCount: state.pendingMessageCount,
    isCompacting: state.isCompacting,
    isIdle: state.isIdle,
    steeringQueueCount: state.steeringQueueCount,
    followUpQueueCount: state.followUpQueueCount,
  }) as RuntimeStateProjectionV1;
}
function projectMessage(message: PiRuntimeMessageSnapshotInputV1): RuntimeMessageSnapshotItemV1 {
  return compactObject({
    role: message.role,
    contentKinds: message.contentKinds === undefined ? undefined : [...message.contentKinds],
    stopReason: message.stopReason,
    errorMessage: message.errorMessage,
    text: message.text,
  }) as RuntimeMessageSnapshotItemV1;
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
  if (event.type === "agent_start") return { kind: "agent.lifecycle", phase: "started" };
  if (event.type === "agent_end") {
    return { kind: "agent.lifecycle", phase: "ended", willRetry: event.willRetry };
  }
  if (event.type === "agent_settled") return { kind: "agent.lifecycle", phase: "settled" };
  if (event.type === "turn_start") return { kind: "turn.lifecycle", phase: "started" };
  if (event.type === "turn_end") {
    return compactObject({
      kind: "turn.lifecycle" as const,
      phase: "ended" as const,
      toolResultCount: event.toolResultCount,
    });
  }
  if (event.type === "message_start") {
    return compactObject({
      kind: "message.lifecycle" as const,
      phase: "started" as const,
      role: event.role,
      contentKinds: event.contentKinds === undefined ? undefined : [...event.contentKinds],
    });
  }
  if (event.type === "message_update") {
    return {
      kind: "message.lifecycle",
      phase: "updated",
      role: event.role,
      delta: event.delta,
    };
  }
  if (event.type === "message_end") {
    return compactObject({
      kind: "message.lifecycle" as const,
      phase: "ended" as const,
      role: event.role,
      contentKinds: event.contentKinds === undefined ? undefined : [...event.contentKinds],
      stopReason: event.stopReason,
      errorMessage: event.errorMessage,
      body: event.body === undefined ? undefined : { text: event.body.text },
    });
  }
  if (event.type === "tool_declared") {
    return compactObject({
      kind: "tool.lifecycle" as const,
      phase: "declared" as const,
      toolName: event.toolName,
      input: event.input === undefined ? undefined : snapshotJsonValue(event.input),
    });
  }
  if (event.type === "tool_started") {
    return { kind: "tool.lifecycle", phase: "started", toolName: event.toolName };
  }
  if (event.type === "tool_completed") {
    return compactObject({
      kind: "tool.lifecycle" as const,
      phase: "completed" as const,
      toolName: event.toolName,
      success: event.success,
      result: event.result === undefined ? undefined : snapshotJsonValue(event.result),
    });
  }
  if (event.type === "queue_state") {
    return compactObject({
      kind: "queue.changed" as const,
      queue: event.queue,
      pending: event.pending,
      mode: event.mode,
    });
  }
  if (event.type === "retry_scheduled") {
    return compactObject({
      kind: "retry.lifecycle" as const,
      phase: "scheduled" as const,
      attempt: event.attempt,
      delayMs: event.delayMs,
      reason: event.reason,
    });
  }
  if (event.type === "retry_started") {
    return compactObject({ kind: "retry.lifecycle" as const, phase: "started" as const, attempt: event.attempt });
  }
  if (event.type === "retry_aborted") {
    return compactObject({
      kind: "retry.lifecycle" as const,
      phase: "aborted" as const,
      attempt: event.attempt,
      reason: event.reason,
    });
  }
  if (event.type === "retry_exhausted") {
    return compactObject({
      kind: "retry.lifecycle" as const,
      phase: "exhausted" as const,
      attempt: event.attempt,
      reason: event.reason,
    });
  }
  if (event.type === "compaction_start") {
    return compactObject({
      kind: "compaction.lifecycle" as const,
      phase: "started" as const,
      reason: event.reason,
    });
  }
  if (event.type === "compaction_end") {
    return compactObject({
      kind: "compaction.lifecycle" as const,
      phase: "completed" as const,
      summaryKind: event.summaryKind,
    });
  }
  if (event.type === "session_start") {
    return compactObject({
      kind: "session.identity" as const,
      action: "started" as const,
      nextSessionIdentity: event.nextSessionIdentity,
      previousSessionIdentity: event.previousSessionIdentity,
    });
  }
  if (event.type === "session_resume") {
    return {
      kind: "session.identity",
      action: "resumed",
      previousSessionIdentity: event.previousSessionIdentity,
      nextSessionIdentity: event.nextSessionIdentity,
    };
  }
  if (event.type === "session_replaced") {
    return compactObject({
      kind: "session.identity" as const,
      action: "replaced" as const,
      previousSessionIdentity: event.previousSessionIdentity,
      nextSessionIdentity: event.nextSessionIdentity,
      previousRuntimeInstanceId: event.previousRuntimeInstanceId,
      nextRuntimeInstanceId: event.nextRuntimeInstanceId,
    });
  }
  if (event.type === "session_shutdown" || event.type === "extension_shutdown") {
    return {
      kind: "session.identity",
      action: "shutdown",
      reason: event.reason,
      previousSessionIdentity: event.previousSessionIdentity,
    };
  }
  if (event.type === "session_invalidated") {
    return {
      kind: "session.identity",
      action: "invalidated",
      reason: event.reason,
      previousSessionIdentity: event.previousSessionIdentity,
    };
  }
  if (event.type === "listener_rebound") {
    return {
      kind: "session.identity",
      action: "listener-rebound",
      previousSessionIdentity: event.previousSessionIdentity,
      nextSessionIdentity: event.nextSessionIdentity,
    };
  }
  if (event.type === "state_snapshot") {
    return { kind: "snapshot.state", state: projectState(event.state) };
  }
  if (event.type === "messages_snapshot") {
    return { kind: "snapshot.messages", messages: event.messages.map(projectMessage) };
  }
  if (event.type === "process_spawn") return { kind: "process.boundary", boundary: "spawn" };
  if (event.type === "process_exit" || event.type === "process_close") {
    return compactObject({
      kind: "process.boundary" as const,
      boundary: event.type === "process_exit" ? "exit" as const : "close" as const,
      code: event.code,
      signal: event.signal,
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
  if (event.type === "host_close_stdin") return { kind: "host.action", action: "close-stdin" };
  if (event.type === "host_request_signal") {
    return {
      kind: "host.action",
      action: "request-signal",
      signal: event.signal,
      accepted: event.accepted,
    };
  }

  const snapshot = snapshotJsonValue(event.payload);
  const keys = snapshot !== null && typeof snapshot === "object" && !Array.isArray(snapshot)
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
    sequence: { domain: input.sequenceDomain, value: input.sourceSequence },
    observedAt: input.observedAt,
    provenance: input.provenance,
    ...eventSemantics,
    correlation: input.correlation,
    ...(input.links ? { links: input.links } : {}),
    data: payload(input.event),
  });
}
