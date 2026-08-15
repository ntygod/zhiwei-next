import { snapshotJsonValue, type JsonValue } from "./lossless-json.ts";

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

export interface RuntimeAgentLifecycleV1 {
  readonly kind: "agent.lifecycle";
  readonly phase: "started" | "ended" | "settled";
  readonly willRetry?: boolean;
}

export interface RuntimeTurnLifecycleV1 {
  readonly kind: "turn.lifecycle";
  readonly phase: "started" | "ended";
  readonly toolResultCount?: number;
}

export interface RuntimeMessageLifecycleV1 {
  readonly kind: "message.lifecycle";
  readonly phase: "started" | "updated" | "ended";
  readonly role: "user" | "assistant" | "tool" | "system";
  readonly contentKinds?: readonly string[];
  readonly stopReason?: string;
  readonly errorMessage?: string;
  readonly delta?: string;
  /** Runtime-neutral projected content; never a raw SDK object. */
  readonly body?: JsonValue;
}

export interface RuntimeToolLifecycleV1 {
  readonly kind: "tool.lifecycle";
  readonly phase: "declared" | "started" | "completed";
  readonly toolName: string;
  readonly success?: boolean;
  readonly input?: JsonValue;
  readonly result?: JsonValue;
}

export interface RuntimeQueueChangedV1 {
  readonly kind: "queue.changed";
  readonly queue: "steering" | "follow-up";
  readonly pending: number;
  readonly mode?: string;
}

export interface RuntimeRetryLifecycleV1 {
  readonly kind: "retry.lifecycle";
  readonly phase: "scheduled" | "started" | "aborted" | "exhausted";
  readonly attempt?: number;
  readonly delayMs?: number;
  readonly reason?: string;
}

export interface RuntimeCompactionLifecycleV1 {
  readonly kind: "compaction.lifecycle";
  readonly phase: "started" | "completed";
  readonly summaryKind?: string;
}

export interface RuntimeSessionIdentityV1 {
  readonly kind: "session.identity";
  readonly action:
    | "started"
    | "resumed"
    | "replaced"
    | "shutdown"
    | "invalidated"
    | "listener-rebound";
  readonly reason?: string;
  readonly previousSessionIdentity?: string;
  readonly nextSessionIdentity?: string;
  readonly previousRuntimeInstanceId?: string;
  readonly nextRuntimeInstanceId?: string;
}

export interface RuntimeStateSnapshotV1 {
  readonly kind: "snapshot.state";
  readonly state: JsonValue;
}

export interface RuntimeMessagesSnapshotV1 {
  readonly kind: "snapshot.messages";
  readonly messages: readonly JsonValue[];
}

export interface RuntimeProcessBoundaryV1 {
  readonly kind: "process.boundary";
  readonly boundary: "spawn" | "exit" | "close";
  readonly code?: number | null;
  readonly signal?: string | null;
}

export interface RuntimeHostActionV1 {
  readonly kind: "host.action";
  readonly action: "send-command" | "close-stdin" | "request-signal";
  readonly command?: string;
  readonly requestId?: string;
  readonly signal?: string;
  readonly accepted?: boolean;
}

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

function optionalString(value: unknown, label: string): void {
  if (value !== undefined) nonEmptyString(value, label);
}

function nonBlankText(value: unknown, label: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${label} must contain non-whitespace text`);
  }
  if (value.length > 64 * 1024) throw new TypeError(`${label} exceeds the length limit`);
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
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.length === 0)) {
    throw new TypeError(`${label} must be an array of non-empty strings`);
  }
  return value;
}

function requireDurableBoundary(context: RuntimePayloadValidationContextV1, label: string): void {
  if (context.persistence !== "durable" || context.stability !== "boundary") {
    throw new TypeError(`${label} must be a durable boundary event`);
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
    if (context.sourceSurface !== "rpc") {
      throw new TypeError("command.response must use the rpc source surface");
    }
    requireDurableBoundary(context, input.kind);
    return;
  }

  if (input.kind === "agent.lifecycle") {
    exactKeys(input, ["kind", "phase", "willRetry"], input.kind);
    oneOf(input.phase, ["started", "ended", "settled"], "data.phase");
    if (input.phase === "ended") {
      if (typeof input.willRetry !== "boolean") throw new TypeError("agent ended requires willRetry");
    } else if (input.willRetry !== undefined) {
      throw new TypeError("willRetry is only valid on agent ended");
    }
    if (context.persistence !== "durable") {
      throw new TypeError("agent lifecycle must be durable");
    }
    const expectedStability = input.phase === "settled" ? "settled" : "boundary";
    if (context.stability !== expectedStability) {
      throw new TypeError(`agent ${input.phase} must use stability=${expectedStability}`);
    }
    return;
  }

  if (input.kind === "turn.lifecycle") {
    exactKeys(input, ["kind", "phase", "toolResultCount"], input.kind);
    oneOf(input.phase, ["started", "ended"], "data.phase");
    if (input.toolResultCount !== undefined) safeInteger(input.toolResultCount, "data.toolResultCount");
    requireDurableBoundary(context, input.kind);
    return;
  }

  if (input.kind === "message.lifecycle") {
    exactKeys(
      input,
      ["kind", "phase", "role", "contentKinds", "stopReason", "errorMessage", "delta", "body"],
      input.kind,
    );
    oneOf(input.phase, ["started", "updated", "ended"], "data.phase");
    oneOf(input.role, ["user", "assistant", "tool", "system"], "data.role");
    if (input.contentKinds !== undefined) stringArray(input.contentKinds, "data.contentKinds");
    optionalString(input.stopReason, "data.stopReason");
    optionalString(input.errorMessage, "data.errorMessage");
    if (input.delta !== undefined && typeof input.delta !== "string") {
      throw new TypeError("data.delta must be string");
    }
    if (input.body !== undefined) snapshotJsonValue(input.body);
    if (input.phase === "updated") {
      if (
        context.persistence !== "ephemeral" ||
        context.stability !== "update" ||
        context.compatibility !== "ignorable"
      ) {
        throw new TypeError("message updates must be ephemeral, update, and ignorable");
      }
    } else {
      requireDurableBoundary(context, input.kind);
    }
    return;
  }

  if (input.kind === "tool.lifecycle") {
    exactKeys(input, ["kind", "phase", "toolName", "success", "input", "result"], input.kind);
    oneOf(input.phase, ["declared", "started", "completed"], "data.phase");
    nonEmptyString(input.toolName, "data.toolName");
    if (input.input !== undefined) snapshotJsonValue(input.input);
    if (input.result !== undefined) snapshotJsonValue(input.result);
    if (input.phase === "completed") {
      if (typeof input.success !== "boolean") throw new TypeError("tool completed requires success");
    } else if (input.success !== undefined || input.result !== undefined) {
      throw new TypeError("tool result fields are only valid on tool completed");
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
    exactKeys(input, ["kind", "phase", "attempt", "delayMs", "reason"], input.kind);
    oneOf(input.phase, ["scheduled", "started", "aborted", "exhausted"], "data.phase");
    if (input.attempt !== undefined) safeInteger(input.attempt, "data.attempt", 1);
    if (input.delayMs !== undefined) safeInteger(input.delayMs, "data.delayMs");
    optionalString(input.reason, "data.reason");
    requireDurableBoundary(context, input.kind);
    return;
  }

  if (input.kind === "compaction.lifecycle") {
    exactKeys(input, ["kind", "phase", "summaryKind"], input.kind);
    oneOf(input.phase, ["started", "completed"], "data.phase");
    optionalString(input.summaryKind, "data.summaryKind");
    requireDurableBoundary(context, input.kind);
    return;
  }

  if (input.kind === "session.identity") {
    exactKeys(
      input,
      [
        "kind",
        "action",
        "reason",
        "previousSessionIdentity",
        "nextSessionIdentity",
        "previousRuntimeInstanceId",
        "nextRuntimeInstanceId",
      ],
      input.kind,
    );
    oneOf(
      input.action,
      ["started", "resumed", "replaced", "shutdown", "invalidated", "listener-rebound"],
      "data.action",
    );
    for (const key of [
      "reason",
      "previousSessionIdentity",
      "nextSessionIdentity",
      "previousRuntimeInstanceId",
      "nextRuntimeInstanceId",
    ]) {
      optionalString(input[key], `data.${key}`);
    }
    if (
      input.action === "replaced" &&
      (input.previousSessionIdentity === undefined || input.nextSessionIdentity === undefined)
    ) {
      throw new TypeError("session replacement requires previous and next identities");
    }
    requireDurableBoundary(context, input.kind);
    return;
  }

  if (input.kind === "snapshot.state") {
    exactKeys(input, ["kind", "state"], input.kind);
    snapshotJsonValue(input.state);
    requireDurableBoundary(context, input.kind);
    return;
  }

  if (input.kind === "snapshot.messages") {
    exactKeys(input, ["kind", "messages"], input.kind);
    if (!Array.isArray(input.messages)) throw new TypeError("data.messages must be an array");
    snapshotJsonValue(input.messages);
    requireDurableBoundary(context, input.kind);
    return;
  }

  if (input.kind === "process.boundary") {
    exactKeys(input, ["kind", "boundary", "code", "signal"], input.kind);
    oneOf(input.boundary, ["spawn", "exit", "close"], "data.boundary");
    if (input.code !== undefined && input.code !== null) safeInteger(input.code, "data.code");
    if (input.signal !== undefined && input.signal !== null) nonEmptyString(input.signal, "data.signal");
    if (input.boundary === "spawn") {
      if (input.code !== undefined || input.signal !== undefined) {
        throw new TypeError("spawn must not contain exit code or signal");
      }
    } else if ((input.code === undefined || input.code === null) && (input.signal === undefined || input.signal === null)) {
      throw new TypeError(`${input.boundary} must contain a non-null code or signal`);
    }
    if (context.sourceSurface !== "host" || context.provenance !== "observed") {
      throw new TypeError("process boundaries must be Host-observed facts");
    }
    requireDurableBoundary(context, input.kind);
    return;
  }

  if (input.kind === "host.action") {
    exactKeys(input, ["kind", "action", "command", "requestId", "signal", "accepted"], input.kind);
    oneOf(input.action, ["send-command", "close-stdin", "request-signal"], "data.action");
    if (context.sourceSurface !== "host" || context.provenance !== "host-synthesized") {
      throw new TypeError("host.action must use host surface and host-synthesized provenance");
    }
    if (input.action === "send-command") {
      nonEmptyString(input.command, "data.command");
      optionalString(input.requestId, "data.requestId");
      if (input.signal !== undefined || input.accepted !== undefined) {
        throw new TypeError("send-command must not contain signal or accepted");
      }
    } else if (input.action === "close-stdin") {
      if (
        input.command !== undefined ||
        input.requestId !== undefined ||
        input.signal !== undefined ||
        input.accepted !== undefined
      ) {
        throw new TypeError("close-stdin must not contain command, requestId, signal, or accepted");
      }
    } else {
      nonEmptyString(input.signal, "data.signal");
      if (typeof input.accepted !== "boolean") {
        throw new TypeError("request-signal requires boolean accepted");
      }
      if (input.command !== undefined || input.requestId !== undefined) {
        throw new TypeError("request-signal must not contain command or requestId");
      }
    }
    requireDurableBoundary(context, input.kind);
    return;
  }

  if (input.kind === "runtime.unknown") {
    exactKeys(input, ["kind", "sourceType", "keys", "payloadSha256", "canonicalization"], input.kind);
    nonEmptyString(input.sourceType, "data.sourceType");
    const keys = stringArray(input.keys, "data.keys");
    if (new Set(keys).size !== keys.length || JSON.stringify(keys) !== JSON.stringify([...keys].sort())) {
      throw new TypeError("data.keys must be sorted and unique");
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
    requireDurableBoundary(context, input.kind);
    return;
  }

  throw new TypeError(`unsupported data.kind: ${String(input.kind)}`);
}
