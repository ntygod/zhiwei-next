export const RUNTIME_EVENT_PROTOCOL_VERSION = 1 as const;

export type RuntimeSourceSurface = "sdk" | "extension" | "rpc" | "host";
export type RuntimeEventProvenance = "observed" | "host-synthesized";
export type RuntimeEventDurability = "transient" | "boundary" | "stable";

export interface RuntimeCorrelation {
  promptId?: string;
  agentRunId?: string;
  turnId?: string;
  messageId?: string;
  toolCallId?: string;
  rpcRequestId?: string;
  workerId?: string;
  previousRuntimeSessionId?: string;
  targetRuntimeSessionId?: string;
}

export type SessionLifecycleData = {
  kind: "session";
  phase: "created" | "started" | "before-switch" | "shutdown" | "invalidated" | "rebound";
  reason?: "startup" | "reload" | "new" | "resume" | "fork" | "exit" | "replacement";
  previousRuntimeSessionId?: string;
  targetRuntimeSessionId?: string;
};

export type PromptLifecycleData = {
  kind: "prompt";
  phase: "submitted" | "accepted" | "rejected" | "settled";
  command?: string;
  accepted?: boolean;
  errorCode?: string;
};

export type AgentRunLifecycleData = {
  kind: "agent-run";
  phase: "started" | "ended" | "settled";
  willRetry?: boolean | "unknown";
};

export type TurnLifecycleData = {
  kind: "turn";
  phase: "started" | "ended";
  outcome?: "stop" | "tool-use" | "error" | "aborted" | "length" | "unknown";
};

export type MessageLifecycleData = {
  kind: "message";
  phase: "started" | "delta" | "completed";
  role: "user" | "assistant" | "tool-result" | "system" | "custom" | "unknown";
  stopReason?: "stop" | "tool-use" | "error" | "aborted" | "length" | "pending" | "unknown";
  contentLength?: number;
  contentRef?: string;
  errorCode?: string;
};

export type ToolLifecycleData = {
  kind: "tool";
  phase: "declared" | "started" | "progress" | "completed" | "result-message";
  toolName: string;
  toolCallId: string;
  declarationIndex?: number;
  resultMessageIndex?: number;
  isError?: boolean;
  inputRef?: string;
  outputRef?: string;
};

export type QueueSnapshotData = {
  kind: "queue";
  phase: "snapshot";
  steeringCount: number;
  followUpCount: number;
  steeringRefs?: readonly string[];
  followUpRefs?: readonly string[];
};

export type RetryLifecycleData = {
  kind: "retry";
  phase: "scheduled" | "completed";
  attempt: number;
  maxAttempts?: number;
  delayMs?: number;
  success?: boolean;
  errorCode?: string;
};

export type CompactionLifecycleData = {
  kind: "compaction";
  phase: "started" | "completed";
  reason: "manual" | "threshold" | "overflow";
  fromExtension?: boolean;
  aborted?: boolean;
  willRetry?: boolean;
  summaryRef?: string;
  sourceEntryCount?: number;
  contextMessageCount?: number;
};

export type RpcLifecycleData = {
  kind: "rpc";
  phase: "request" | "response" | "eof";
  command?: string;
  requestId?: string;
  success?: boolean;
  accepted?: boolean;
  errorCode?: string;
};

export type WorkerLifecycleData = {
  kind: "worker";
  phase: "started" | "exited";
  exitCode?: number;
  signal?: string;
};

export type NormalizedRuntimeEventData =
  | SessionLifecycleData
  | PromptLifecycleData
  | AgentRunLifecycleData
  | TurnLifecycleData
  | MessageLifecycleData
  | ToolLifecycleData
  | QueueSnapshotData
  | RetryLifecycleData
  | CompactionLifecycleData
  | RpcLifecycleData
  | WorkerLifecycleData;

export interface NormalizedRuntimeEvent<
  TData extends NormalizedRuntimeEventData = NormalizedRuntimeEventData,
> {
  protocolVersion: typeof RUNTIME_EVENT_PROTOCOL_VERSION;
  eventId: string;
  idempotencyKey: string;
  workspaceId: string;
  runtimeSessionId: string;
  sourceSurface: RuntimeSourceSurface;
  sourceSequence: number;
  sourceEventType: string;
  observedAt: string;
  provenance: RuntimeEventProvenance;
  durability: RuntimeEventDurability;
  correlation: RuntimeCorrelation;
  data: TData;
}

export type CreateNormalizedRuntimeEventInput<
  TData extends NormalizedRuntimeEventData = NormalizedRuntimeEventData,
> = Omit<NormalizedRuntimeEvent<TData>, "protocolVersion" | "eventId" | "idempotencyKey"> & {
  eventId?: string;
};

export class RuntimeEventValidationError extends Error {
  readonly violations: readonly string[];

  constructor(violations: readonly string[]) {
    super(`Invalid NormalizedRuntimeEvent: ${violations.join("; ")}`);
    this.name = "RuntimeEventValidationError";
    this.violations = [...violations];
  }
}

function requireNonEmpty(value: unknown, label: string, violations: string[]): value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    violations.push(`${label} must be a non-empty string`);
    return false;
  }
  return true;
}

function requireOptionalNonEmpty(
  value: unknown,
  label: string,
  violations: string[],
): value is string | undefined {
  if (value === undefined) return true;
  return requireNonEmpty(value, label, violations);
}

function requireNonNegativeInteger(value: unknown, label: string, violations: string[]): boolean {
  if (!Number.isInteger(value) || Number(value) < 0) {
    violations.push(`${label} must be a non-negative integer`);
    return false;
  }
  return true;
}

function requirePositiveInteger(value: unknown, label: string, violations: string[]): boolean {
  if (!Number.isInteger(value) || Number(value) < 1) {
    violations.push(`${label} must be a positive integer`);
    return false;
  }
  return true;
}

function encodeSegment(value: string): string {
  return `${value.length}:${value}`;
}

export function buildRuntimeEventIdempotencyKey(input: {
  workspaceId: string;
  runtimeSessionId: string;
  sourceSurface: RuntimeSourceSurface;
  sourceSequence: number;
  sourceEventType: string;
}): string {
  return [
    `v${RUNTIME_EVENT_PROTOCOL_VERSION}`,
    encodeSegment(input.workspaceId),
    encodeSegment(input.runtimeSessionId),
    encodeSegment(input.sourceSurface),
    String(input.sourceSequence),
    encodeSegment(input.sourceEventType),
  ].join("|");
}

function validateCorrelation(correlation: RuntimeCorrelation, violations: string[]): void {
  for (const [key, value] of Object.entries(correlation)) {
    requireOptionalNonEmpty(value, `correlation.${key}`, violations);
  }
}

function validateData(
  event: NormalizedRuntimeEvent,
  violations: string[],
): void {
  const { data, correlation, durability } = event;
  switch (data.kind) {
    case "session": {
      requireOptionalNonEmpty(data.previousRuntimeSessionId, "data.previousRuntimeSessionId", violations);
      requireOptionalNonEmpty(data.targetRuntimeSessionId, "data.targetRuntimeSessionId", violations);
      if (data.phase === "invalidated" || data.phase === "rebound" || data.phase === "created") {
        if (event.provenance !== "host-synthesized") {
          violations.push(`session.${data.phase} must use host-synthesized provenance`);
        }
      }
      if (data.phase === "shutdown" && durability === "transient") {
        violations.push("session.shutdown cannot be transient");
      }
      break;
    }
    case "prompt": {
      if (!correlation.promptId) violations.push("prompt events require correlation.promptId");
      if (data.phase === "accepted" || data.phase === "rejected") {
        if (durability === "stable") {
          violations.push(`prompt.${data.phase} cannot be a stable boundary`);
        }
      }
      if (data.phase === "settled" && durability !== "stable") {
        violations.push("prompt.settled must use stable durability");
      }
      break;
    }
    case "agent-run": {
      if (!correlation.agentRunId) violations.push("agent-run events require correlation.agentRunId");
      if (data.phase === "ended" && data.willRetry === undefined) {
        violations.push("agent-run.ended requires willRetry=true|false|unknown");
      }
      if (data.phase !== "ended" && data.willRetry !== undefined) {
        violations.push("willRetry is only valid for agent-run.ended");
      }
      if (data.phase === "settled" && durability !== "stable") {
        violations.push("agent-run.settled must use stable durability");
      }
      break;
    }
    case "turn": {
      if (!correlation.turnId) violations.push("turn events require correlation.turnId");
      break;
    }
    case "message": {
      if (!correlation.messageId) violations.push("message events require correlation.messageId");
      if (data.contentLength !== undefined) {
        requireNonNegativeInteger(data.contentLength, "data.contentLength", violations);
      }
      requireOptionalNonEmpty(data.contentRef, "data.contentRef", violations);
      if (data.phase === "delta" && durability !== "transient") {
        violations.push("message.delta must use transient durability");
      }
      if (data.phase === "completed" && durability === "transient") {
        violations.push("message.completed cannot be transient");
      }
      break;
    }
    case "tool": {
      requireNonEmpty(data.toolName, "data.toolName", violations);
      requireNonEmpty(data.toolCallId, "data.toolCallId", violations);
      if (!correlation.toolCallId) {
        violations.push("tool events require correlation.toolCallId");
      } else if (correlation.toolCallId !== data.toolCallId) {
        violations.push("data.toolCallId must equal correlation.toolCallId");
      }
      if (data.declarationIndex !== undefined) {
        requireNonNegativeInteger(data.declarationIndex, "data.declarationIndex", violations);
      }
      if (data.resultMessageIndex !== undefined) {
        requireNonNegativeInteger(data.resultMessageIndex, "data.resultMessageIndex", violations);
      }
      break;
    }
    case "queue": {
      requireNonNegativeInteger(data.steeringCount, "data.steeringCount", violations);
      requireNonNegativeInteger(data.followUpCount, "data.followUpCount", violations);
      if (durability === "stable") {
        violations.push("queue snapshots cannot be treated as stable Prompt completion");
      }
      break;
    }
    case "retry": {
      requirePositiveInteger(data.attempt, "data.attempt", violations);
      if (data.maxAttempts !== undefined) {
        requirePositiveInteger(data.maxAttempts, "data.maxAttempts", violations);
        if (data.attempt > data.maxAttempts) {
          violations.push("data.attempt cannot exceed data.maxAttempts");
        }
      }
      if (data.delayMs !== undefined) {
        requireNonNegativeInteger(data.delayMs, "data.delayMs", violations);
      }
      if (data.phase === "scheduled" && data.success !== undefined) {
        violations.push("retry.scheduled cannot define success");
      }
      if (data.phase === "completed" && typeof data.success !== "boolean") {
        violations.push("retry.completed requires success");
      }
      break;
    }
    case "compaction": {
      if (data.sourceEntryCount !== undefined) {
        requireNonNegativeInteger(data.sourceEntryCount, "data.sourceEntryCount", violations);
      }
      if (data.contextMessageCount !== undefined) {
        requireNonNegativeInteger(data.contextMessageCount, "data.contextMessageCount", violations);
      }
      requireOptionalNonEmpty(data.summaryRef, "data.summaryRef", violations);
      if (data.phase === "completed" && durability === "transient") {
        violations.push("compaction.completed cannot be transient");
      }
      break;
    }
    case "rpc": {
      if (data.phase === "request" || data.phase === "response") {
        requireNonEmpty(data.command, "data.command", violations);
        requireNonEmpty(data.requestId, "data.requestId", violations);
        if (!correlation.rpcRequestId) {
          violations.push("RPC request/response requires correlation.rpcRequestId");
        } else if (correlation.rpcRequestId !== data.requestId) {
          violations.push("data.requestId must equal correlation.rpcRequestId");
        }
      }
      if (data.phase === "request" && data.success !== undefined) {
        violations.push("rpc.request cannot define success");
      }
      if (data.phase === "response" && typeof data.success !== "boolean") {
        violations.push("rpc.response requires success");
      }
      if (data.phase === "eof" && durability === "transient") {
        violations.push("rpc.eof cannot be transient");
      }
      break;
    }
    case "worker": {
      if (!correlation.workerId) violations.push("worker events require correlation.workerId");
      if (data.phase === "exited" && durability !== "stable") {
        violations.push("worker.exited must use stable durability");
      }
      if (data.exitCode !== undefined && !Number.isInteger(data.exitCode)) {
        violations.push("data.exitCode must be an integer");
      }
      requireOptionalNonEmpty(data.signal, "data.signal", violations);
      break;
    }
    default: {
      const exhaustive: never = data;
      violations.push(`unsupported event data: ${String(exhaustive)}`);
    }
  }
}

export function validateNormalizedRuntimeEvent(event: NormalizedRuntimeEvent): readonly string[] {
  const violations: string[] = [];
  if (event.protocolVersion !== RUNTIME_EVENT_PROTOCOL_VERSION) {
    violations.push(`protocolVersion must be ${RUNTIME_EVENT_PROTOCOL_VERSION}`);
  }
  requireNonEmpty(event.eventId, "eventId", violations);
  requireNonEmpty(event.workspaceId, "workspaceId", violations);
  requireNonEmpty(event.runtimeSessionId, "runtimeSessionId", violations);
  requireNonEmpty(event.sourceEventType, "sourceEventType", violations);
  requirePositiveInteger(event.sourceSequence, "sourceSequence", violations);
  if (!(["sdk", "extension", "rpc", "host"] as const).includes(event.sourceSurface)) {
    violations.push("sourceSurface is invalid");
  }
  if (!(["observed", "host-synthesized"] as const).includes(event.provenance)) {
    violations.push("provenance is invalid");
  }
  if (!(["transient", "boundary", "stable"] as const).includes(event.durability)) {
    violations.push("durability is invalid");
  }
  requireNonEmpty(event.observedAt, "observedAt", violations);
  if (typeof event.observedAt === "string" && Number.isNaN(Date.parse(event.observedAt))) {
    violations.push("observedAt must be an ISO-compatible timestamp");
  }
  validateCorrelation(event.correlation, violations);

  const expectedKey = buildRuntimeEventIdempotencyKey(event);
  if (event.idempotencyKey !== expectedKey) {
    violations.push("idempotencyKey does not match the event identity fields");
  }
  validateData(event, violations);
  return violations;
}

export function assertNormalizedRuntimeEvent(
  event: NormalizedRuntimeEvent,
): asserts event is NormalizedRuntimeEvent {
  const violations = validateNormalizedRuntimeEvent(event);
  if (violations.length > 0) throw new RuntimeEventValidationError(violations);
}

export function isNormalizedRuntimeEvent(value: unknown): value is NormalizedRuntimeEvent {
  if (!value || typeof value !== "object") return false;
  try {
    return validateNormalizedRuntimeEvent(value as NormalizedRuntimeEvent).length === 0;
  } catch {
    return false;
  }
}

export function createNormalizedRuntimeEvent<
  TData extends NormalizedRuntimeEventData,
>(input: CreateNormalizedRuntimeEventInput<TData>): NormalizedRuntimeEvent<TData> {
  const idempotencyKey = buildRuntimeEventIdempotencyKey(input);
  const event: NormalizedRuntimeEvent<TData> = {
    ...input,
    protocolVersion: RUNTIME_EVENT_PROTOCOL_VERSION,
    eventId: input.eventId ?? `evt:${idempotencyKey}`,
    idempotencyKey,
    correlation: { ...input.correlation },
  };
  assertNormalizedRuntimeEvent(event);
  return event;
}

export function validateRuntimeEventStream(
  events: readonly NormalizedRuntimeEvent[],
): readonly string[] {
  const violations: string[] = [];
  const eventIds = new Set<string>();
  const idempotencyKeys = new Set<string>();
  const sequenceBySource = new Map<string, number>();

  for (const [index, event] of events.entries()) {
    for (const violation of validateNormalizedRuntimeEvent(event)) {
      violations.push(`events[${index}]: ${violation}`);
    }
    if (eventIds.has(event.eventId)) {
      violations.push(`events[${index}]: duplicate eventId ${event.eventId}`);
    }
    eventIds.add(event.eventId);
    if (idempotencyKeys.has(event.idempotencyKey)) {
      violations.push(`events[${index}]: duplicate idempotencyKey ${event.idempotencyKey}`);
    }
    idempotencyKeys.add(event.idempotencyKey);

    const sourceKey = [event.workspaceId, event.runtimeSessionId, event.sourceSurface]
      .map(encodeSegment)
      .join("|");
    const previousSequence = sequenceBySource.get(sourceKey);
    if (previousSequence !== undefined && event.sourceSequence <= previousSequence) {
      violations.push(
        `events[${index}]: sourceSequence ${event.sourceSequence} is not greater than ${previousSequence}`,
      );
    }
    sequenceBySource.set(sourceKey, event.sourceSequence);
  }
  return violations;
}

export function assertRuntimeEventStream(
  events: readonly NormalizedRuntimeEvent[],
): void {
  const violations = validateRuntimeEventStream(events);
  if (violations.length > 0) throw new RuntimeEventValidationError(violations);
}
