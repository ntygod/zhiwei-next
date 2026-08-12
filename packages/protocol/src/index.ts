import type {
  IsoTimestamp,
  ObservationActor,
  ObservationKind,
  SessionId,
  WorkspaceId,
} from "../../domain/src/index.ts";

export const cognitionProtocolVersion = 1 as const;

export type NormalizedRuntimeEventType =
  | "session.started"
  | "input.observed"
  | "tool.called"
  | "tool.completed"
  | "session.settled"
  | "session.closed";

export interface NormalizedRuntimeEvent {
  readonly protocolVersion: typeof cognitionProtocolVersion;
  readonly eventId: string;
  readonly type: NormalizedRuntimeEventType;
  readonly runtime: "pi" | "codex" | "claude" | "test";
  readonly workspaceId?: WorkspaceId;
  readonly sessionId: SessionId;
  readonly occurredAt: IsoTimestamp;
  readonly observation: {
    readonly actor: ObservationActor;
    readonly kind: ObservationKind;
    readonly payload: unknown;
  };
  readonly sourceEventType: string;
}
export * from "./runtime-events.ts";
