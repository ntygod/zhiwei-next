import {
  validateNormalizedRuntimePayloadV1 as validateCorePayload,
  type NormalizedRuntimePayloadV1 as CoreNormalizedRuntimePayloadV1,
  type RuntimeAgentLifecycleV1 as CoreRuntimeAgentLifecycleV1,
  type RuntimeMessageContentV1,
  type RuntimeMessageLifecycleV1 as CoreRuntimeMessageLifecycleV1,
  type RuntimeMessageRoleV1,
  type RuntimeMessagesSnapshotV1 as CoreRuntimeMessagesSnapshotV1,
  type RuntimePayloadValidationContextV1,
  type RuntimeRetryLifecycleV1 as CoreRuntimeRetryLifecycleV1,
  type RuntimeSnapshotMessageRoleV1,
} from "./runtime-event-payload-v1-core.ts";

export * from "./runtime-event-payload-v1-core.ts";

export type RuntimeWillRetryV1 = boolean | "unavailable";

export interface RuntimeAgentStartedV1 {
  readonly kind: "agent.lifecycle";
  readonly phase: "started";
}
export interface RuntimeAgentEndedV1 {
  readonly kind: "agent.lifecycle";
  readonly phase: "ended";
  /** Explicitly distinguishes an observed boolean from a source field that was unavailable. */
  readonly willRetry: RuntimeWillRetryV1;
}
export interface RuntimeAgentSettledV1 {
  readonly kind: "agent.lifecycle";
  readonly phase: "settled";
}
export type RuntimeAgentLifecycleV1 =
  | RuntimeAgentStartedV1
  | RuntimeAgentEndedV1
  | RuntimeAgentSettledV1;

export interface RuntimeRetryScheduledV1 {
  readonly kind: "retry.lifecycle";
  readonly phase: "scheduled";
  readonly attempt?: number;
  readonly delayMs?: number;
  readonly reason?: string;
}
export interface RuntimeRetryStartedV1 {
  readonly kind: "retry.lifecycle";
  readonly phase: "started";
  readonly attempt?: number;
}
export interface RuntimeRetryCompletedV1 {
  readonly kind: "retry.lifecycle";
  readonly phase: "completed";
  readonly attempt: number;
  readonly success: boolean;
}
export interface RuntimeRetryAbortedV1 {
  readonly kind: "retry.lifecycle";
  readonly phase: "aborted";
  readonly attempt?: number;
  readonly reason: string;
}
export interface RuntimeRetryExhaustedV1 {
  readonly kind: "retry.lifecycle";
  readonly phase: "exhausted";
  readonly attempt?: number;
  readonly reason?: string;
}
export type RuntimeRetryLifecycleV1 =
  | RuntimeRetryScheduledV1
  | RuntimeRetryStartedV1
  | RuntimeRetryCompletedV1
  | RuntimeRetryAbortedV1
  | RuntimeRetryExhaustedV1;

export type RuntimeNonToolMessageRoleV1 = Exclude<RuntimeMessageRoleV1, "tool">;

export interface RuntimeNonToolMessageStartedV1 {
  readonly kind: "message.lifecycle";
  readonly phase: "started";
  readonly role: RuntimeNonToolMessageRoleV1;
  readonly contentKinds?: readonly string[];
}
export interface RuntimeToolResultMessageStartedV1 {
  readonly kind: "message.lifecycle";
  readonly phase: "started";
  readonly role: "tool";
  readonly toolName: string;
  readonly success: boolean;
  readonly contentKinds?: readonly string[];
}
export type RuntimeMessageStartedV1 =
  | RuntimeNonToolMessageStartedV1
  | RuntimeToolResultMessageStartedV1;

export interface RuntimeMessageUpdatedV1 {
  readonly kind: "message.lifecycle";
  readonly phase: "updated";
  readonly role: RuntimeNonToolMessageRoleV1;
  readonly delta: string;
}

export interface RuntimeNonToolMessageEndedV1 {
  readonly kind: "message.lifecycle";
  readonly phase: "ended";
  readonly role: RuntimeNonToolMessageRoleV1;
  readonly contentKinds?: readonly string[];
  readonly stopReason?: string;
  readonly errorMessage?: string;
  readonly body?: RuntimeMessageContentV1;
}
export interface RuntimeToolResultMessageEndedV1 {
  readonly kind: "message.lifecycle";
  readonly phase: "ended";
  readonly role: "tool";
  readonly toolName: string;
  readonly success: boolean;
  readonly contentKinds?: readonly string[];
  readonly errorMessage?: string;
  readonly body?: RuntimeMessageContentV1;
}
export type RuntimeMessageEndedV1 =
  | RuntimeNonToolMessageEndedV1
  | RuntimeToolResultMessageEndedV1;

export type RuntimeMessageLifecycleV1 =
  | RuntimeMessageStartedV1
  | RuntimeMessageUpdatedV1
  | RuntimeMessageEndedV1;

export interface RuntimeNonToolMessageSnapshotItemV1 {
  readonly role: Exclude<RuntimeSnapshotMessageRoleV1, "tool">;
  readonly contentKinds?: readonly string[];
  readonly stopReason?: string;
  readonly errorMessage?: string;
  readonly text?: string;
}
export interface RuntimeToolMessageSnapshotItemV1 {
  readonly role: "tool";
  readonly toolCallId: string;
  readonly toolName: string;
  readonly success: boolean;
  readonly contentKinds?: readonly string[];
  readonly errorMessage?: string;
  readonly text?: string;
}
export type RuntimeMessageSnapshotItemV1 =
  | RuntimeNonToolMessageSnapshotItemV1
  | RuntimeToolMessageSnapshotItemV1;

export interface RuntimeMessagesSnapshotV1 {
  readonly kind: "snapshot.messages";
  readonly messages: readonly RuntimeMessageSnapshotItemV1[];
}

type CoreUnchangedPayloadV1 = Exclude<
  CoreNormalizedRuntimePayloadV1,
  | CoreRuntimeAgentLifecycleV1
  | CoreRuntimeRetryLifecycleV1
  | CoreRuntimeMessageLifecycleV1
  | CoreRuntimeMessagesSnapshotV1
>;

export type NormalizedRuntimePayloadV1 =
  | CoreUnchangedPayloadV1
  | RuntimeAgentLifecycleV1
  | RuntimeRetryLifecycleV1
  | RuntimeMessageLifecycleV1
  | RuntimeMessagesSnapshotV1;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  label: string,
): void {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedSet.has(key)) throw new TypeError(`${label} contains unsupported key: ${key}`);
  }
}

function nonEmptyString(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0 || value !== value.trim()) {
    throw new TypeError(`${label} must be a trimmed non-empty string`);
  }
  if (value.length > 1024) throw new TypeError(`${label} exceeds the length limit`);
}

function boundedText(value: unknown, label: string, maximum = 4 * 1024 * 1024): void {
  if (typeof value !== "string") throw new TypeError(`${label} must be a string`);
  if (value.length > maximum) throw new TypeError(`${label} exceeds the length limit`);
}

function optionalString(value: unknown, label: string): void {
  if (value !== undefined) nonEmptyString(value, label);
}

function safeInteger(value: unknown, label: string, minimum = 0): void {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) {
    throw new TypeError(`${label} must be a safe integer >= ${minimum}`);
  }
}

function oneOf(value: unknown, allowed: readonly string[], label: string): void {
  if (typeof value !== "string" || !allowed.includes(value)) {
    throw new TypeError(`${label} is unsupported`);
  }
}

function stringArray(value: unknown, label: string): void {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`);
  const values: string[] = [];
  for (const [index, item] of value.entries()) {
    nonEmptyString(item, `${label}[${index}]`);
    values.push(item);
  }
  if (new Set(values).size !== values.length) {
    throw new TypeError(`${label} must not contain duplicates`);
  }
}

function requireDurableBoundary(
  context: RuntimePayloadValidationContextV1,
  label: string,
): void {
  if (
    context.persistence !== "durable" ||
    context.stability !== "boundary" ||
    context.compatibility !== "required"
  ) {
    throw new TypeError(`${label} must be durable, boundary, and required`);
  }
}

function validateMessageContent(value: unknown): void {
  if (!isRecord(value)) throw new TypeError("data.body must be an object");
  exactKeys(value, ["text"], "message.lifecycle.body");
  boundedText(value.text, "data.body.text");
}

function validateAgentEnded(
  input: Record<string, unknown>,
  context: RuntimePayloadValidationContextV1,
): void {
  exactKeys(input, ["kind", "phase", "willRetry"], "agent.lifecycle");
  if (input.willRetry !== "unavailable" && typeof input.willRetry !== "boolean") {
    throw new TypeError("agent ended requires boolean or explicit unavailable willRetry");
  }
  if (
    input.willRetry === "unavailable" &&
    (context.sourceSurface !== "extension" || context.provenance !== "observed")
  ) {
    throw new TypeError("unavailable willRetry is reserved for observed Extension agent_end");
  }
  requireDurableBoundary(context, "agent ended");
}

function validateRetryCompleted(
  input: Record<string, unknown>,
  context: RuntimePayloadValidationContextV1,
): void {
  exactKeys(input, ["kind", "phase", "attempt", "success"], "retry.lifecycle");
  safeInteger(input.attempt, "data.attempt", 1);
  if (typeof input.success !== "boolean") {
    throw new TypeError("retry completed requires boolean success");
  }
  requireDurableBoundary(context, "retry completed");
}

function validateToolMessage(
  input: Record<string, unknown>,
  context: RuntimePayloadValidationContextV1,
): void {
  oneOf(input.phase, ["started", "ended"], "data.phase");
  nonEmptyString(input.toolName, "data.toolName");
  if (typeof input.success !== "boolean") {
    throw new TypeError("tool result message requires boolean success");
  }
  if (input.phase === "started") {
    exactKeys(
      input,
      ["kind", "phase", "role", "toolName", "success", "contentKinds"],
      "message.lifecycle",
    );
  } else {
    exactKeys(
      input,
      [
        "kind",
        "phase",
        "role",
        "toolName",
        "success",
        "contentKinds",
        "errorMessage",
        "body",
      ],
      "message.lifecycle",
    );
    optionalString(input.errorMessage, "data.errorMessage");
    if (input.success === true && input.errorMessage !== undefined) {
      throw new TypeError("successful tool result messages must not contain errorMessage");
    }
    if (input.body !== undefined) validateMessageContent(input.body);
  }
  if (input.contentKinds !== undefined) stringArray(input.contentKinds, "data.contentKinds");
  requireDurableBoundary(context, "tool result message");
}

function validateSnapshotItem(value: unknown, index: number): void {
  if (!isRecord(value)) throw new TypeError(`data.messages[${index}] must be an object`);
  if (value.role === "tool") {
    exactKeys(
      value,
      [
        "role",
        "toolCallId",
        "toolName",
        "success",
        "contentKinds",
        "errorMessage",
        "text",
      ],
      `snapshot.messages.messages[${index}]`,
    );
    nonEmptyString(value.toolCallId, `data.messages[${index}].toolCallId`);
    nonEmptyString(value.toolName, `data.messages[${index}].toolName`);
    if (typeof value.success !== "boolean") {
      throw new TypeError(`data.messages[${index}].success must be boolean`);
    }
    if (value.contentKinds !== undefined) {
      stringArray(value.contentKinds, `data.messages[${index}].contentKinds`);
    }
    optionalString(value.errorMessage, `data.messages[${index}].errorMessage`);
    if (value.success === true && value.errorMessage !== undefined) {
      throw new TypeError(`data.messages[${index}] successful Tool result must not contain errorMessage`);
    }
    if (value.text !== undefined) boundedText(value.text, `data.messages[${index}].text`);
    return;
  }

  exactKeys(
    value,
    ["role", "contentKinds", "stopReason", "errorMessage", "text"],
    `snapshot.messages.messages[${index}]`,
  );
  oneOf(
    value.role,
    ["user", "assistant", "system", "compaction-summary"],
    `data.messages[${index}].role`,
  );
  if (value.contentKinds !== undefined) {
    stringArray(value.contentKinds, `data.messages[${index}].contentKinds`);
  }
  optionalString(value.stopReason, `data.messages[${index}].stopReason`);
  optionalString(value.errorMessage, `data.messages[${index}].errorMessage`);
  if (value.text !== undefined) boundedText(value.text, `data.messages[${index}].text`);
  if (
    value.role !== "assistant" &&
    (value.stopReason !== undefined || value.errorMessage !== undefined)
  ) {
    throw new TypeError(`data.messages[${index}] stop/error fields require assistant role`);
  }
}

function validateMessagesSnapshot(
  input: Record<string, unknown>,
  context: RuntimePayloadValidationContextV1,
): void {
  exactKeys(input, ["kind", "messages"], "snapshot.messages");
  if (!Array.isArray(input.messages)) throw new TypeError("data.messages must be an array");
  for (const [index, item] of input.messages.entries()) validateSnapshotItem(item, index);
  requireDurableBoundary(context, "snapshot.messages");
}

export function validateNormalizedRuntimePayloadV1(
  input: unknown,
  context: RuntimePayloadValidationContextV1,
): asserts input is NormalizedRuntimePayloadV1 {
  if (!isRecord(input)) throw new TypeError("data must be an object");

  if (input.kind === "agent.lifecycle" && input.phase === "ended") {
    validateAgentEnded(input, context);
    return;
  }
  if (input.kind === "retry.lifecycle" && input.phase === "completed") {
    validateRetryCompleted(input, context);
    return;
  }
  if (input.kind === "message.lifecycle" && input.role === "tool") {
    validateToolMessage(input, context);
    return;
  }
  if (input.kind === "snapshot.messages") {
    validateMessagesSnapshot(input, context);
    return;
  }

  validateCorePayload(input, context);
}
