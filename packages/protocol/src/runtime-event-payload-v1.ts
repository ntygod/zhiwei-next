import { snapshotJsonValue, type JsonValue } from "./lossless-json.ts";

export type RuntimeMessageRoleV1 = "user" | "assistant" | "tool" | "system";
export type RuntimeSnapshotMessageRoleV1 = RuntimeMessageRoleV1 | "compaction-summary";

export interface RuntimeCommandResponseV1 {
  readonly kind: "command.response";
  readonly command: string;
  readonly success: boolean;
  readonly phase: "preflight-result" | "command-result";
  readonly error?: {
    readonly code?: string;
    readonly message: string;
  };
}

export interface RuntimeAgentStartedV1 {
  readonly kind: "agent.lifecycle";
  readonly phase: "started";
}
export interface RuntimeAgentEndedV1 {
  readonly kind: "agent.lifecycle";
  readonly phase: "ended";
  readonly willRetry: boolean;
}
export interface RuntimeAgentSettledV1 {
  readonly kind: "agent.lifecycle";
  readonly phase: "settled";
}
export type RuntimeAgentLifecycleV1 =
  | RuntimeAgentStartedV1
  | RuntimeAgentEndedV1
  | RuntimeAgentSettledV1;

export interface RuntimeTurnStartedV1 {
  readonly kind: "turn.lifecycle";
  readonly phase: "started";
}
export interface RuntimeTurnEndedV1 {
  readonly kind: "turn.lifecycle";
  readonly phase: "ended";
  readonly toolResultCount?: number;
}
export type RuntimeTurnLifecycleV1 = RuntimeTurnStartedV1 | RuntimeTurnEndedV1;

export interface RuntimeMessageContentV1 {
  readonly text: string;
}
export interface RuntimeMessageStartedV1 {
  readonly kind: "message.lifecycle";
  readonly phase: "started";
  readonly role: RuntimeMessageRoleV1;
  readonly contentKinds?: readonly string[];
}
export interface RuntimeMessageUpdatedV1 {
  readonly kind: "message.lifecycle";
  readonly phase: "updated";
  readonly role: RuntimeMessageRoleV1;
  readonly delta: string;
}
export interface RuntimeMessageEndedV1 {
  readonly kind: "message.lifecycle";
  readonly phase: "ended";
  readonly role: RuntimeMessageRoleV1;
  readonly contentKinds?: readonly string[];
  readonly stopReason?: string;
  readonly errorMessage?: string;
  /** Runtime-neutral projected text only; never a raw SDK/RPC message object. */
  readonly body?: RuntimeMessageContentV1;
}
export type RuntimeMessageLifecycleV1 =
  | RuntimeMessageStartedV1
  | RuntimeMessageUpdatedV1
  | RuntimeMessageEndedV1;

export interface RuntimeToolDeclaredV1 {
  readonly kind: "tool.lifecycle";
  readonly phase: "declared";
  readonly toolName: string;
  /** Tool contract input, not a raw Runtime event envelope. */
  readonly input?: JsonValue;
}
export interface RuntimeToolStartedV1 {
  readonly kind: "tool.lifecycle";
  readonly phase: "started";
  readonly toolName: string;
}
export interface RuntimeToolCompletedV1 {
  readonly kind: "tool.lifecycle";
  readonly phase: "completed";
  readonly toolName: string;
  readonly success: boolean;
  /** Tool contract result, not a raw Runtime event envelope. */
  readonly result?: JsonValue;
}
export type RuntimeToolLifecycleV1 =
  | RuntimeToolDeclaredV1
  | RuntimeToolStartedV1
  | RuntimeToolCompletedV1;

export interface RuntimeQueueChangedV1 {
  readonly kind: "queue.changed";
  readonly queue: "steering" | "follow-up";
  readonly pending: number;
  readonly mode?: string;
}

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
  | RuntimeRetryAbortedV1
  | RuntimeRetryExhaustedV1;

export interface RuntimeCompactionStartedV1 {
  readonly kind: "compaction.lifecycle";
  readonly phase: "started";
  readonly reason?: string;
}
export interface RuntimeCompactionCompletedV1 {
  readonly kind: "compaction.lifecycle";
  readonly phase: "completed";
  readonly summaryKind?: string;
}
export type RuntimeCompactionLifecycleV1 =
  | RuntimeCompactionStartedV1
  | RuntimeCompactionCompletedV1;

export interface RuntimeSessionStartedV1 {
  readonly kind: "session.identity";
  readonly action: "started";
  readonly nextSessionIdentity: string;
  readonly previousSessionIdentity?: string;
}
export interface RuntimeSessionResumedV1 {
  readonly kind: "session.identity";
  readonly action: "resumed";
  readonly previousSessionIdentity: string;
  readonly nextSessionIdentity: string;
}
export interface RuntimeSessionReplacedV1 {
  readonly kind: "session.identity";
  readonly action: "replaced";
  readonly previousSessionIdentity: string;
  readonly nextSessionIdentity: string;
  readonly previousRuntimeInstanceId?: string;
  readonly nextRuntimeInstanceId?: string;
}
export interface RuntimeSessionShutdownV1 {
  readonly kind: "session.identity";
  readonly action: "shutdown";
  readonly reason: string;
  readonly previousSessionIdentity: string;
}
export interface RuntimeSessionInvalidatedV1 {
  readonly kind: "session.identity";
  readonly action: "invalidated";
  readonly reason: string;
  readonly previousSessionIdentity: string;
}
export interface RuntimeListenerReboundV1 {
  readonly kind: "session.identity";
  readonly action: "listener-rebound";
  readonly previousSessionIdentity: string;
  readonly nextSessionIdentity: string;
}
export type RuntimeSessionIdentityV1 =
  | RuntimeSessionStartedV1
  | RuntimeSessionResumedV1
  | RuntimeSessionReplacedV1
  | RuntimeSessionShutdownV1
  | RuntimeSessionInvalidatedV1
  | RuntimeListenerReboundV1;

export interface RuntimeStateProjectionV1 {
  readonly isStreaming: boolean;
  readonly messageCount: number;
  readonly pendingMessageCount: number;
  readonly isCompacting?: boolean;
  readonly isIdle?: boolean;
  readonly steeringQueueCount?: number;
  readonly followUpQueueCount?: number;
}
export interface RuntimeStateSnapshotV1 {
  readonly kind: "snapshot.state";
  readonly state: RuntimeStateProjectionV1;
}

export interface RuntimeMessageSnapshotItemV1 {
  readonly role: RuntimeSnapshotMessageRoleV1;
  readonly contentKinds?: readonly string[];
  readonly stopReason?: string;
  readonly errorMessage?: string;
  readonly text?: string;
}
export interface RuntimeMessagesSnapshotV1 {
  readonly kind: "snapshot.messages";
  readonly messages: readonly RuntimeMessageSnapshotItemV1[];
}

export interface RuntimeProcessSpawnV1 {
  readonly kind: "process.boundary";
  readonly boundary: "spawn";
}
export interface RuntimeProcessExitV1 {
  readonly kind: "process.boundary";
  readonly boundary: "exit";
  readonly code?: number | null;
  readonly signal?: string | null;
}
export interface RuntimeProcessCloseV1 {
  readonly kind: "process.boundary";
  readonly boundary: "close";
  readonly code?: number | null;
  readonly signal?: string | null;
}
export type RuntimeProcessBoundaryV1 =
  | RuntimeProcessSpawnV1
  | RuntimeProcessExitV1
  | RuntimeProcessCloseV1;

export interface RuntimeHostSendCommandV1 {
  readonly kind: "host.action";
  readonly action: "send-command";
  readonly command: string;
  readonly requestId?: string;
}
export interface RuntimeHostCloseStdinV1 {
  readonly kind: "host.action";
  readonly action: "close-stdin";
}
export interface RuntimeHostRequestSignalV1 {
  readonly kind: "host.action";
  readonly action: "request-signal";
  readonly signal: string;
  readonly accepted: boolean;
}
export type RuntimeHostActionV1 =
  | RuntimeHostSendCommandV1
  | RuntimeHostCloseStdinV1
  | RuntimeHostRequestSignalV1;

export interface RuntimeUnknownEventV1 {
  readonly kind: "runtime.unknown";
  readonly sourceType: string;
  readonly keys: readonly string[];
  readonly payloadSha256: string;
  readonly canonicalization: "zhiwei-json-v1";
}

export type NormalizedRuntimePayloadV1 =
  | RuntimeCommandResponseV1
  | RuntimeAgentLifecycleV1
  | RuntimeTurnLifecycleV1
  | RuntimeMessageLifecycleV1
  | RuntimeToolLifecycleV1
  | RuntimeQueueChangedV1
  | RuntimeRetryLifecycleV1
  | RuntimeCompactionLifecycleV1
  | RuntimeSessionIdentityV1
  | RuntimeStateSnapshotV1
  | RuntimeMessagesSnapshotV1
  | RuntimeProcessBoundaryV1
  | RuntimeHostActionV1
  | RuntimeUnknownEventV1;

export interface RuntimePayloadValidationContextV1 {
  readonly sourceSurface: string;
  readonly sourceEventType: string;
  readonly provenance: string;
  readonly persistence: string;
  readonly stability: string;
  readonly compatibility: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function exactKeys(value: Record<string, unknown>, allowed: readonly string[], label: string): void {
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
function boundedText(value: unknown, label: string, maximum = 4 * 1024 * 1024): asserts value is string {
  if (typeof value !== "string") throw new TypeError(`${label} must be a string`);
  if (value.length > maximum) throw new TypeError(`${label} exceeds the length limit`);
}
function nonBlankText(value: unknown, label: string): asserts value is string {
  boundedText(value, label, 64 * 1024);
  if (value.trim().length === 0) throw new TypeError(`${label} must contain non-whitespace text`);
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
function stringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`);
  const output: string[] = [];
  for (const [index, item] of value.entries()) {
    nonEmptyString(item, `${label}[${index}]`);
    output.push(item);
  }
  if (new Set(output).size !== output.length) throw new TypeError(`${label} must not contain duplicates`);
  return output;
}
function requireDurableBoundary(context: RuntimePayloadValidationContextV1, label: string): void {
  if (
    context.persistence !== "durable" ||
    context.stability !== "boundary" ||
    context.compatibility !== "required"
  ) {
    throw new TypeError(`${label} must be durable, boundary, and required`);
  }
}
function requireSessionSurface(
  context: RuntimePayloadValidationContextV1,
  surface: "extension" | "host",
  provenance: "observed" | "host-synthesized",
  action: string,
): void {
  if (context.sourceSurface !== surface || context.provenance !== provenance) {
    throw new TypeError(`session ${action} must use ${surface}/${provenance}`);
  }
}
function validateMessageContent(value: unknown): void {
  if (!isRecord(value)) throw new TypeError("data.body must be an object");
  exactKeys(value, ["text"], "message.lifecycle.body");
  boundedText(value.text, "data.body.text");
}
function validateStateProjection(value: unknown): void {
  if (!isRecord(value)) throw new TypeError("data.state must be an object");
  exactKeys(
    value,
    [
      "isStreaming",
      "messageCount",
      "pendingMessageCount",
      "isCompacting",
      "isIdle",
      "steeringQueueCount",
      "followUpQueueCount",
    ],
    "snapshot.state.state",
  );
  if (typeof value.isStreaming !== "boolean") throw new TypeError("data.state.isStreaming must be boolean");
  safeInteger(value.messageCount, "data.state.messageCount");
  safeInteger(value.pendingMessageCount, "data.state.pendingMessageCount");
  if (value.isCompacting !== undefined && typeof value.isCompacting !== "boolean") {
    throw new TypeError("data.state.isCompacting must be boolean");
  }
  if (value.isIdle !== undefined && typeof value.isIdle !== "boolean") {
    throw new TypeError("data.state.isIdle must be boolean");
  }
  if (value.steeringQueueCount !== undefined) safeInteger(value.steeringQueueCount, "data.state.steeringQueueCount");
  if (value.followUpQueueCount !== undefined) safeInteger(value.followUpQueueCount, "data.state.followUpQueueCount");
}
function validateMessageSnapshotItem(value: unknown, index: number): void {
  if (!isRecord(value)) throw new TypeError(`data.messages[${index}] must be an object`);
  exactKeys(
    value,
    ["role", "contentKinds", "stopReason", "errorMessage", "text"],
    `snapshot.messages.messages[${index}]`,
  );
  oneOf(
    value.role,
    ["user", "assistant", "tool", "system", "compaction-summary"],
    `data.messages[${index}].role`,
  );
  if (value.contentKinds !== undefined) stringArray(value.contentKinds, `data.messages[${index}].contentKinds`);
  optionalString(value.stopReason, `data.messages[${index}].stopReason`);
  optionalString(value.errorMessage, `data.messages[${index}].errorMessage`);
  if (value.text !== undefined) boundedText(value.text, `data.messages[${index}].text`);
  if (value.role !== "assistant" && (value.stopReason !== undefined || value.errorMessage !== undefined)) {
    throw new TypeError(`data.messages[${index}] stop/error fields require assistant role`);
  }
}

export function validateNormalizedRuntimePayloadV1(
  input: unknown,
  context: RuntimePayloadValidationContextV1,
): asserts input is NormalizedRuntimePayloadV1 {
  if (!isRecord(input)) throw new TypeError("data must be an object");
  nonEmptyString(input.kind, "data.kind");

  if (input.kind === "command.response") {
    exactKeys(input, ["kind", "command", "success", "phase", "error"], input.kind);
    nonEmptyString(input.command, "data.command");
    if (typeof input.success !== "boolean") throw new TypeError("data.success must be boolean");
    oneOf(input.phase, ["preflight-result", "command-result"], "data.phase");
    if (input.command === "prompt" && input.phase !== "preflight-result") {
      throw new TypeError("prompt responses must use preflight-result");
    }
    if (input.command !== "prompt" && input.phase !== "command-result") {
      throw new TypeError("non-prompt responses must use command-result");
    }
    if (input.success) {
      if (input.error !== undefined) throw new TypeError("successful command responses must not contain error");
    } else {
      if (!isRecord(input.error)) throw new TypeError("failed command responses must contain error");
      exactKeys(input.error, ["code", "message"], "command.response.error");
      optionalString(input.error.code, "data.error.code");
      nonBlankText(input.error.message, "data.error.message");
    }
    if (context.sourceSurface !== "rpc" || context.provenance !== "observed") {
      throw new TypeError("command.response must be an observed rpc fact");
    }
    requireDurableBoundary(context, input.kind);
    return;
  }

  if (input.kind === "agent.lifecycle") {
    oneOf(input.phase, ["started", "ended", "settled"], "data.phase");
    if (input.phase === "started") {
      exactKeys(input, ["kind", "phase"], input.kind);
      requireDurableBoundary(context, "agent started");
    } else if (input.phase === "ended") {
      exactKeys(input, ["kind", "phase", "willRetry"], input.kind);
      if (typeof input.willRetry !== "boolean") throw new TypeError("agent ended requires willRetry");
      requireDurableBoundary(context, "agent ended");
    } else {
      exactKeys(input, ["kind", "phase"], input.kind);
      if (
        context.persistence !== "durable" ||
        context.stability !== "settled" ||
        context.compatibility !== "required"
      ) {
        throw new TypeError("agent settled must be durable, settled, and required");
      }
    }
    return;
  }

  if (input.kind === "turn.lifecycle") {
    oneOf(input.phase, ["started", "ended"], "data.phase");
    if (input.phase === "started") {
      exactKeys(input, ["kind", "phase"], input.kind);
    } else {
      exactKeys(input, ["kind", "phase", "toolResultCount"], input.kind);
      if (input.toolResultCount !== undefined) safeInteger(input.toolResultCount, "data.toolResultCount");
    }
    requireDurableBoundary(context, input.kind);
    return;
  }

  if (input.kind === "message.lifecycle") {
    oneOf(input.phase, ["started", "updated", "ended"], "data.phase");
    oneOf(input.role, ["user", "assistant", "tool", "system"], "data.role");
    if (input.phase === "started") {
      exactKeys(input, ["kind", "phase", "role", "contentKinds"], input.kind);
      if (input.contentKinds !== undefined) stringArray(input.contentKinds, "data.contentKinds");
      requireDurableBoundary(context, "message started");
    } else if (input.phase === "updated") {
      exactKeys(input, ["kind", "phase", "role", "delta"], input.kind);
      boundedText(input.delta, "data.delta");
      if (
        context.persistence !== "ephemeral" ||
        context.stability !== "update" ||
        context.compatibility !== "ignorable"
      ) {
        throw new TypeError("message updates must be ephemeral, update, and ignorable");
      }
    } else {
      exactKeys(
        input,
        ["kind", "phase", "role", "contentKinds", "stopReason", "errorMessage", "body"],
        input.kind,
      );
      if (input.contentKinds !== undefined) stringArray(input.contentKinds, "data.contentKinds");
      optionalString(input.stopReason, "data.stopReason");
      optionalString(input.errorMessage, "data.errorMessage");
      if (input.body !== undefined) validateMessageContent(input.body);
      requireDurableBoundary(context, "message ended");
    }
    return;
  }

  if (input.kind === "tool.lifecycle") {
    oneOf(input.phase, ["declared", "started", "completed"], "data.phase");
    nonEmptyString(input.toolName, "data.toolName");
    if (input.phase === "declared") {
      exactKeys(input, ["kind", "phase", "toolName", "input"], input.kind);
      if (input.input !== undefined) snapshotJsonValue(input.input);
    } else if (input.phase === "started") {
      exactKeys(input, ["kind", "phase", "toolName"], input.kind);
    } else {
      exactKeys(input, ["kind", "phase", "toolName", "success", "result"], input.kind);
      if (typeof input.success !== "boolean") throw new TypeError("tool completed requires success");
      if (input.result !== undefined) snapshotJsonValue(input.result);
    }
    requireDurableBoundary(context, input.kind);
    return;
  }

  if (input.kind === "queue.changed") {
    exactKeys(input, ["kind", "queue", "pending", "mode"], input.kind);
    oneOf(input.queue, ["steering", "follow-up"], "data.queue");
    safeInteger(input.pending, "data.pending");
    optionalString(input.mode, "data.mode");
    requireDurableBoundary(context, input.kind);
    return;
  }

  if (input.kind === "retry.lifecycle") {
    oneOf(input.phase, ["scheduled", "started", "aborted", "exhausted"], "data.phase");
    if (input.phase === "scheduled") {
      exactKeys(input, ["kind", "phase", "attempt", "delayMs", "reason"], input.kind);
      if (input.attempt !== undefined) safeInteger(input.attempt, "data.attempt", 1);
      if (input.delayMs !== undefined) safeInteger(input.delayMs, "data.delayMs");
      optionalString(input.reason, "data.reason");
    } else if (input.phase === "started") {
      exactKeys(input, ["kind", "phase", "attempt"], input.kind);
      if (input.attempt !== undefined) safeInteger(input.attempt, "data.attempt", 1);
    } else if (input.phase === "aborted") {
      exactKeys(input, ["kind", "phase", "attempt", "reason"], input.kind);
      if (input.attempt !== undefined) safeInteger(input.attempt, "data.attempt", 1);
      nonEmptyString(input.reason, "data.reason");
    } else {
      exactKeys(input, ["kind", "phase", "attempt", "reason"], input.kind);
      if (input.attempt !== undefined) safeInteger(input.attempt, "data.attempt", 1);
      optionalString(input.reason, "data.reason");
    }
    requireDurableBoundary(context, input.kind);
    return;
  }

  if (input.kind === "compaction.lifecycle") {
    oneOf(input.phase, ["started", "completed"], "data.phase");
    if (input.phase === "started") {
      exactKeys(input, ["kind", "phase", "reason"], input.kind);
      optionalString(input.reason, "data.reason");
    } else {
      exactKeys(input, ["kind", "phase", "summaryKind"], input.kind);
      optionalString(input.summaryKind, "data.summaryKind");
    }
    requireDurableBoundary(context, input.kind);
    return;
  }

  if (input.kind === "session.identity") {
    oneOf(
      input.action,
      ["started", "resumed", "replaced", "shutdown", "invalidated", "listener-rebound"],
      "data.action",
    );
    if (input.action === "started") {
      exactKeys(input, ["kind", "action", "nextSessionIdentity", "previousSessionIdentity"], input.kind);
      nonEmptyString(input.nextSessionIdentity, "data.nextSessionIdentity");
      optionalString(input.previousSessionIdentity, "data.previousSessionIdentity");
      requireSessionSurface(context, "extension", "observed", input.action);
    } else if (input.action === "resumed") {
      exactKeys(input, ["kind", "action", "previousSessionIdentity", "nextSessionIdentity"], input.kind);
      nonEmptyString(input.previousSessionIdentity, "data.previousSessionIdentity");
      nonEmptyString(input.nextSessionIdentity, "data.nextSessionIdentity");
      requireSessionSurface(context, "extension", "observed", input.action);
    } else if (input.action === "replaced") {
      exactKeys(
        input,
        [
          "kind",
          "action",
          "previousSessionIdentity",
          "nextSessionIdentity",
          "previousRuntimeInstanceId",
          "nextRuntimeInstanceId",
        ],
        input.kind,
      );
      nonEmptyString(input.previousSessionIdentity, "data.previousSessionIdentity");
      nonEmptyString(input.nextSessionIdentity, "data.nextSessionIdentity");
      optionalString(input.previousRuntimeInstanceId, "data.previousRuntimeInstanceId");
      optionalString(input.nextRuntimeInstanceId, "data.nextRuntimeInstanceId");
      if ((input.previousRuntimeInstanceId === undefined) !== (input.nextRuntimeInstanceId === undefined)) {
        throw new TypeError("session replacement Runtime instance identities must be supplied together");
      }
      requireSessionSurface(context, "host", "host-synthesized", input.action);
    } else if (input.action === "shutdown") {
      exactKeys(input, ["kind", "action", "reason", "previousSessionIdentity"], input.kind);
      nonEmptyString(input.reason, "data.reason");
      nonEmptyString(input.previousSessionIdentity, "data.previousSessionIdentity");
      requireSessionSurface(context, "extension", "observed", input.action);
    } else if (input.action === "invalidated") {
      exactKeys(input, ["kind", "action", "reason", "previousSessionIdentity"], input.kind);
      nonEmptyString(input.reason, "data.reason");
      nonEmptyString(input.previousSessionIdentity, "data.previousSessionIdentity");
      requireSessionSurface(context, "host", "host-synthesized", input.action);
    } else {
      exactKeys(input, ["kind", "action", "previousSessionIdentity", "nextSessionIdentity"], input.kind);
      nonEmptyString(input.previousSessionIdentity, "data.previousSessionIdentity");
      nonEmptyString(input.nextSessionIdentity, "data.nextSessionIdentity");
      requireSessionSurface(context, "host", "host-synthesized", input.action);
    }
    requireDurableBoundary(context, input.kind);
    return;
  }

  if (input.kind === "snapshot.state") {
    exactKeys(input, ["kind", "state"], input.kind);
    validateStateProjection(input.state);
    requireDurableBoundary(context, input.kind);
    return;
  }

  if (input.kind === "snapshot.messages") {
    exactKeys(input, ["kind", "messages"], input.kind);
    if (!Array.isArray(input.messages)) throw new TypeError("data.messages must be an array");
    for (const [index, message] of input.messages.entries()) validateMessageSnapshotItem(message, index);
    requireDurableBoundary(context, input.kind);
    return;
  }

  if (input.kind === "process.boundary") {
    oneOf(input.boundary, ["spawn", "exit", "close"], "data.boundary");
    if (input.boundary === "spawn") {
      exactKeys(input, ["kind", "boundary"], input.kind);
    } else {
      exactKeys(input, ["kind", "boundary", "code", "signal"], input.kind);
      if (input.code !== undefined && input.code !== null) safeInteger(input.code, "data.code");
      if (input.signal !== undefined && input.signal !== null) nonEmptyString(input.signal, "data.signal");
      if ((input.code === undefined || input.code === null) && (input.signal === undefined || input.signal === null)) {
        throw new TypeError(`${input.boundary} must contain a non-null code or signal`);
      }
    }
    if (context.sourceSurface !== "host" || context.provenance !== "observed") {
      throw new TypeError("process boundaries must be Host-observed facts");
    }
    requireDurableBoundary(context, input.kind);
    return;
  }

  if (input.kind === "host.action") {
    oneOf(input.action, ["send-command", "close-stdin", "request-signal"], "data.action");
    if (input.action === "send-command") {
      exactKeys(input, ["kind", "action", "command", "requestId"], input.kind);
      nonEmptyString(input.command, "data.command");
      optionalString(input.requestId, "data.requestId");
    } else if (input.action === "close-stdin") {
      exactKeys(input, ["kind", "action"], input.kind);
    } else {
      exactKeys(input, ["kind", "action", "signal", "accepted"], input.kind);
      nonEmptyString(input.signal, "data.signal");
      if (typeof input.accepted !== "boolean") throw new TypeError("request-signal requires boolean accepted");
    }
    if (context.sourceSurface !== "host" || context.provenance !== "host-synthesized") {
      throw new TypeError("host.action must use host surface and host-synthesized provenance");
    }
    requireDurableBoundary(context, input.kind);
    return;
  }

  if (input.kind === "runtime.unknown") {
    exactKeys(input, ["kind", "sourceType", "keys", "payloadSha256", "canonicalization"], input.kind);
    nonEmptyString(input.sourceType, "data.sourceType");
    const keys = stringArray(input.keys, "data.keys");
    if (JSON.stringify(keys) !== JSON.stringify([...keys].sort())) {
      throw new TypeError("data.keys must be sorted");
    }
    if (!/^[0-9a-f]{64}$/.test(String(input.payloadSha256))) {
      throw new TypeError("data.payloadSha256 must be lowercase SHA-256");
    }
    if (input.canonicalization !== "zhiwei-json-v1") {
      throw new TypeError("data.canonicalization must be zhiwei-json-v1");
    }
    if (input.sourceType !== context.sourceEventType) {
      throw new TypeError("runtime.unknown sourceType must match source.eventType");
    }
    if (context.persistence !== "durable" || context.stability !== "boundary") {
      throw new TypeError("runtime.unknown must be a durable boundary");
    }
    return;
  }

  throw new TypeError(`unsupported data.kind: ${String(input.kind)}`);
}
