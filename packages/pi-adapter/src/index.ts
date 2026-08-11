import {
  cognitionProtocolVersion,
  type NormalizedRuntimeEvent,
} from "../../protocol/src/index.ts";
import type {
  IsoTimestamp,
  SessionId,
  WorkspaceId,
} from "../../domain/src/index.ts";

/**
 * Bootstrap contract used before the concrete Pi SDK version is pinned.
 * Only this package may later import Pi SDK types.
 */
export type PiBootstrapEvent =
  | { readonly type: "session_start"; readonly payload?: unknown }
  | { readonly type: "input"; readonly text: string }
  | { readonly type: "tool_call"; readonly toolName: string; readonly input: unknown }
  | { readonly type: "tool_result"; readonly toolName: string; readonly result: unknown }
  | { readonly type: "agent_settled"; readonly outcome?: unknown }
  | { readonly type: "session_shutdown"; readonly reason?: string };

export interface PiNormalizationContext {
  readonly eventId: string;
  readonly sessionId: SessionId;
  readonly workspaceId?: WorkspaceId;
  readonly occurredAt: IsoTimestamp;
}

export function normalizePiEvent(
  event: PiBootstrapEvent,
  context: PiNormalizationContext,
): NormalizedRuntimeEvent {
  const shared = {
    protocolVersion: cognitionProtocolVersion,
    eventId: context.eventId,
    runtime: "pi" as const,
    workspaceId: context.workspaceId,
    sessionId: context.sessionId,
    occurredAt: context.occurredAt,
    sourceEventType: event.type,
  };

  if (event.type === "session_start") {
    return { ...shared, type: "session.started", observation: { actor: "system", kind: "session_event", payload: event.payload ?? {} } };
  }
  if (event.type === "input") {
    return { ...shared, type: "input.observed", observation: { actor: "user", kind: "user_input", payload: { text: event.text } } };
  }
  if (event.type === "tool_call") {
    return { ...shared, type: "tool.called", observation: { actor: "tool", kind: "tool_call", payload: { toolName: event.toolName, input: event.input } } };
  }
  if (event.type === "tool_result") {
    return { ...shared, type: "tool.completed", observation: { actor: "tool", kind: "tool_result", payload: { toolName: event.toolName, result: event.result } } };
  }
  if (event.type === "agent_settled") {
    return { ...shared, type: "session.settled", observation: { actor: "assistant", kind: "session_event", payload: event.outcome ?? {} } };
  }
  return { ...shared, type: "session.closed", observation: { actor: "system", kind: "session_event", payload: { reason: event.reason ?? "unknown" } } };
}
