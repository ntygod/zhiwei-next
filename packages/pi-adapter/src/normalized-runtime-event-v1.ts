import {
  createNormalizedRuntimeEventV1,
  type NormalizedRuntimeCompatibilityV1,
  type NormalizedRuntimeEventV1,
  type NormalizedRuntimePayloadV1,
  type RuntimeMessageRoleV1,
  type RuntimeMessageSnapshotItemV1,
  type RuntimeSnapshotMessageRoleV1,
} from "../../protocol/src/index.ts";
import {
  normalizePiRuntimeEventV1 as normalizeCore,
  type PiRuntimeEventInputV1 as CorePiRuntimeEventInputV1,
  type PiRuntimeNormalizationInputV1 as CorePiRuntimeNormalizationInputV1,
} from "./normalized-runtime-event-v1-core.ts";

export * from "./normalized-runtime-event-v1-core.ts";

export type PiRuntimeNonToolMessageRoleV1 = Exclude<RuntimeMessageRoleV1, "tool">;

export interface PiRuntimeNonToolMessageSnapshotInputV1 {
  readonly role: Exclude<RuntimeSnapshotMessageRoleV1, "tool">;
  readonly contentKinds?: readonly string[];
  readonly stopReason?: string;
  readonly errorMessage?: string;
  readonly text?: string;
}
export interface PiRuntimeToolMessageSnapshotInputV1 {
  readonly role: "tool";
  readonly toolCallId: string;
  readonly toolName: string;
  readonly success: boolean;
  readonly contentKinds?: readonly string[];
  readonly errorMessage?: string;
  readonly text?: string;
}
export type PiRuntimeMessageSnapshotInputV1 =
  | PiRuntimeNonToolMessageSnapshotInputV1
  | PiRuntimeToolMessageSnapshotInputV1;

export interface PiRuntimeAgentEndInputV1 {
  readonly type: "agent_end";
  readonly willRetry: boolean | "unavailable";
}
export interface PiRuntimeRetryCompletedInputV1 {
  readonly type: "retry_completed";
  readonly attempt: number;
  readonly success: boolean;
}
export interface PiRuntimeNonToolMessageStartInputV1 {
  readonly type: "message_start";
  readonly role: PiRuntimeNonToolMessageRoleV1;
  readonly contentKinds?: readonly string[];
}
export interface PiRuntimeToolMessageStartInputV1 {
  readonly type: "message_start";
  readonly role: "tool";
  readonly toolName: string;
  readonly success: boolean;
  readonly contentKinds?: readonly string[];
}
export interface PiRuntimeNonToolMessageUpdateInputV1 {
  readonly type: "message_update";
  readonly role: PiRuntimeNonToolMessageRoleV1;
  readonly delta: string;
}
export interface PiRuntimeNonToolMessageEndInputV1 {
  readonly type: "message_end";
  readonly role: PiRuntimeNonToolMessageRoleV1;
  readonly contentKinds?: readonly string[];
  readonly stopReason?: string;
  readonly errorMessage?: string;
  readonly body?: { readonly text: string };
}
export interface PiRuntimeToolMessageEndInputV1 {
  readonly type: "message_end";
  readonly role: "tool";
  readonly toolName: string;
  readonly success: boolean;
  readonly contentKinds?: readonly string[];
  readonly errorMessage?: string;
  readonly body?: { readonly text: string };
}
export interface PiRuntimeMessagesSnapshotInputV1 {
  readonly type: "messages_snapshot";
  readonly messages: readonly PiRuntimeMessageSnapshotInputV1[];
}

type CoreEventWithoutR2OverridesV1 = Exclude<
  CorePiRuntimeEventInputV1,
  | { readonly type: "agent_end" }
  | { readonly type: "message_start" }
  | { readonly type: "message_update" }
  | { readonly type: "message_end" }
  | { readonly type: "messages_snapshot" }
>;

export type PiRuntimeEventInputV1 =
  | CoreEventWithoutR2OverridesV1
  | PiRuntimeAgentEndInputV1
  | PiRuntimeRetryCompletedInputV1
  | PiRuntimeNonToolMessageStartInputV1
  | PiRuntimeToolMessageStartInputV1
  | PiRuntimeNonToolMessageUpdateInputV1
  | PiRuntimeNonToolMessageEndInputV1
  | PiRuntimeToolMessageEndInputV1
  | PiRuntimeMessagesSnapshotInputV1;

export type PiRuntimeNormalizationInputV1 = Omit<
  CorePiRuntimeNormalizationInputV1,
  "event"
> & {
  readonly event: PiRuntimeEventInputV1;
};

function compactObject<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined),
  ) as T;
}

function projectMessage(
  message: PiRuntimeMessageSnapshotInputV1,
): RuntimeMessageSnapshotItemV1 {
  if (message.role === "tool") {
    return compactObject({
      role: "tool" as const,
      toolCallId: message.toolCallId,
      toolName: message.toolName,
      success: message.success,
      contentKinds: message.contentKinds === undefined
        ? undefined
        : [...message.contentKinds],
      errorMessage: message.errorMessage,
      text: message.text,
    });
  }
  return compactObject({
    role: message.role,
    contentKinds: message.contentKinds === undefined
      ? undefined
      : [...message.contentKinds],
    stopReason: message.stopReason,
    errorMessage: message.errorMessage,
    text: message.text,
  });
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

function validateRetryCompletedCorrelation(
  input: PiRuntimeNormalizationInputV1,
): void {
  if (
    input.correlation.normalized.agentRunId !== undefined ||
    input.correlation.normalized.turnId !== undefined
  ) {
    throw new TypeError(
      "Pi retry_completed must not contain normalized.agentRunId or normalized.turnId",
    );
  }
}

function normalizeExtended(
  input: PiRuntimeNormalizationInputV1,
  data: NormalizedRuntimePayloadV1,
): NormalizedRuntimeEventV1 {
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
      eventType: input.sourceEventType,
    },
    sequence: { domain: input.sequenceDomain, value: input.sourceSequence },
    observedAt: input.observedAt,
    provenance: input.provenance,
    ...semantics(input.event),
    correlation: input.correlation,
    ...(input.links ? { links: input.links } : {}),
    data,
  });
}

export function normalizePiRuntimeEventV1(
  input: PiRuntimeNormalizationInputV1,
): NormalizedRuntimeEventV1 {
  const event = input.event;

  if (event.type === "agent_end" && event.willRetry === "unavailable") {
    return normalizeExtended(input, {
      kind: "agent.lifecycle",
      phase: "ended",
      willRetry: "unavailable",
    });
  }
  if (event.type === "retry_completed") {
    validateRetryCompletedCorrelation(input);
    return normalizeExtended(input, {
      kind: "retry.lifecycle",
      phase: "completed",
      attempt: event.attempt,
      success: event.success,
    });
  }
  if (event.type === "message_start" && event.role === "tool") {
    return normalizeExtended(input, compactObject({
      kind: "message.lifecycle" as const,
      phase: "started" as const,
      role: "tool" as const,
      toolName: event.toolName,
      success: event.success,
      contentKinds: event.contentKinds === undefined
        ? undefined
        : [...event.contentKinds],
    }));
  }
  if (event.type === "message_end" && event.role === "tool") {
    return normalizeExtended(input, compactObject({
      kind: "message.lifecycle" as const,
      phase: "ended" as const,
      role: "tool" as const,
      toolName: event.toolName,
      success: event.success,
      contentKinds: event.contentKinds === undefined
        ? undefined
        : [...event.contentKinds],
      errorMessage: event.errorMessage,
      body: event.body === undefined ? undefined : { text: event.body.text },
    }));
  }
  if (event.type === "message_update" && event.role === "tool") {
    throw new TypeError("tool result messages do not support message_update");
  }
  if (event.type === "messages_snapshot") {
    return normalizeExtended(input, {
      kind: "snapshot.messages",
      messages: event.messages.map(projectMessage),
    });
  }

  return normalizeCore(input as CorePiRuntimeNormalizationInputV1);
}
