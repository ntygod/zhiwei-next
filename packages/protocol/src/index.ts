import type {
  IsoTimestamp,
  ObservationActor,
  ObservationKind,
  SessionId,
  WorkspaceId,
} from "../../domain/src/index.ts";

export * from "./sha256.ts";
export * from "./lossless-json.ts";
export * from "./local-diagnostics-v1.ts";
export * from "./runtime-event-v1.ts";
export * from "./runtime-event-stream-v1.ts";

/** @deprecated Bootstrap-only contract. Use NormalizedRuntimeEventV1. */
export const cognitionProtocolVersion = 1 as const;

/** @deprecated Bootstrap-only event vocabulary. */
export type NormalizedRuntimeEventType =
  | "session.started"
  | "input.observed"
  | "tool.called"
  | "tool.completed"
  | "session.settled"
  | "session.closed";

/** @deprecated Bootstrap-only event. It is not the durable v1 Runtime protocol. */
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

// Independent P1 wire contracts; neither replaces Runtime v1 nor enables data endpoints.
export { CognitiveProtocolError } from "./cognitive-wire.ts";
export * from "./observation-v2.ts";
export * from "./local-api-v1.ts";

// Controlled Runtime transport is independent of the existing event and persistence contracts.
export * from "./controlled-runtime-v1.ts";
