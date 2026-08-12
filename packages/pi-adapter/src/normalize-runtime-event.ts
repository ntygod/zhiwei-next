import {
  createNormalizedRuntimeEvent,
  type AgentRunLifecycleData,
  type CompactionLifecycleData,
  type CreateNormalizedRuntimeEventInput,
  type MessageLifecycleData,
  type NormalizedRuntimeEvent,
  type NormalizedRuntimeEventData,
  type PromptLifecycleData,
  type RpcLifecycleData,
  type RuntimeCorrelation,
  type RuntimeEventDurability,
  type RuntimeEventProvenance,
  type RuntimeSourceSurface,
  type SessionLifecycleData,
  type ToolLifecycleData,
  type TurnLifecycleData,
  type WorkerLifecycleData,
  assertRuntimeEventStream,
} from "../../protocol/src/runtime-events.ts";

export interface PiNormalizationContext {
  workspaceId: string;
  runtimeSessionId: string;
  sourceSurface: RuntimeSourceSurface;
  sourceSequence: number;
  observedAt: string;
  correlation?: RuntimeCorrelation;
  eventId?: string;
}

export type PiMessageRole = "user" | "assistant" | "toolResult" | "system" | "custom" | string;
export type PiStopReason = "stop" | "toolUse" | "error" | "aborted" | "length" | "pending" | string;

export type PiRuntimeInput =
  | { type: "session_created" }
  | {
      type: "session_start";
      reason: "startup" | "reload" | "new" | "resume" | "fork";
      previousRuntimeSessionId?: string;
    }
  | {
      type: "session_before_switch";
      reason: "new" | "resume";
      targetRuntimeSessionId?: string;
    }
  | {
      type: "session_shutdown";
      reason: "exit" | "new" | "resume" | "fork";
      targetRuntimeSessionId?: string;
    }
  | { type: "session_invalidated"; reason: "replacement" }
  | {
      type: "session_rebound";
      previousRuntimeSessionId?: string;
      targetRuntimeSessionId: string;
    }
  | { type: "prompt_submitted" }
  | {
      type: "prompt_accepted";
      command?: string;
      accepted: boolean;
      errorCode?: string;
    }
  | { type: "prompt_settled" }
  | { type: "agent_start" }
  | { type: "agent_end"; willRetry?: boolean }
  | { type: "agent_settled" }
  | { type: "turn_start" }
  | { type: "turn_end"; outcome?: PiStopReason }
  | {
      type: "message_start" | "message_update" | "message_end";
      role: PiMessageRole;
      stopReason?: PiStopReason;
      contentLength?: number;
      contentRef?: string;
      errorCode?: string;
    }
  | {
      type:
        | "tool_declared"
        | "tool_execution_start"
        | "tool_execution_update"
        | "tool_execution_end"
        | "tool_result_message";
      toolName: string;
      toolCallId: string;
      declarationIndex?: number;
      resultMessageIndex?: number;
      isError?: boolean;
      inputRef?: string;
      outputRef?: string;
    }
  | {
      type: "queue_update";
      steeringCount: number;
      followUpCount: number;
      steeringRefs?: readonly string[];
      followUpRefs?: readonly string[];
    }
  | {
      type: "auto_retry_start";
      attempt: number;
      maxAttempts: number;
      delayMs: number;
      errorCode?: string;
    }
  | {
      type: "auto_retry_end";
      attempt: number;
      success: boolean;
      errorCode?: string;
    }
  | {
      type: "compaction_start" | "session_before_compact";
      reason: "manual" | "threshold" | "overflow";
      sourceEntryCount?: number;
      contextMessageCount?: number;
    }
  | {
      type: "compaction_end" | "session_compact";
      reason: "manual" | "threshold" | "overflow";
      fromExtension?: boolean;
      aborted?: boolean;
      willRetry?: boolean;
      summaryRef?: string;
      sourceEntryCount?: number;
      contextMessageCount?: number;
    }
  | { type: "rpc_request"; command: string; requestId: string }
  | {
      type: "rpc_response";
      command: string;
      requestId: string;
      success: boolean;
      accepted?: boolean;
      errorCode?: string;
    }
  | { type: "rpc_eof" }
  | { type: "worker_started" }
  | { type: "worker_exited"; exitCode?: number; signal?: string };

function mapRole(role: PiMessageRole): MessageLifecycleData["role"] {
  switch (role) {
    case "user":
    case "assistant":
    case "system":
    case "custom":
      return role;
    case "toolResult":
      return "tool-result";
    default:
      return "unknown";
  }
}

function mapMessageStopReason(
  reason: PiStopReason | undefined,
): MessageLifecycleData["stopReason"] | undefined {
  switch (reason) {
    case undefined:
      return undefined;
    case "stop":
    case "error":
    case "aborted":
    case "length":
    case "pending":
      return reason;
    case "toolUse":
      return "tool-use";
    default:
      return "unknown";
  }
}

function mapTurnOutcome(
  reason: PiStopReason | undefined,
): TurnLifecycleData["outcome"] | undefined {
  switch (reason) {
    case undefined:
      return undefined;
    case "stop":
    case "error":
    case "aborted":
    case "length":
      return reason;
    case "toolUse":
      return "tool-use";
    default:
      return "unknown";
  }
}

function baseInput<TData extends NormalizedRuntimeEventData>(
  context: PiNormalizationContext,
  sourceEventType: string,
  data: TData,
  durability: RuntimeEventDurability,
  provenance: RuntimeEventProvenance = "observed",
): CreateNormalizedRuntimeEventInput<TData> {
  return {
    eventId: context.eventId,
    workspaceId: context.workspaceId,
    runtimeSessionId: context.runtimeSessionId,
    sourceSurface: context.sourceSurface,
    sourceSequence: context.sourceSequence,
    sourceEventType,
    observedAt: context.observedAt,
    provenance,
    durability,
    correlation: { ...(context.correlation ?? {}) },
    data,
  };
}

function normalizeSessionEvent(
  context: PiNormalizationContext,
  input: Extract<
    PiRuntimeInput,
    {
      type:
        | "session_created"
        | "session_start"
        | "session_before_switch"
        | "session_shutdown"
        | "session_invalidated"
        | "session_rebound";
    }
  >,
): NormalizedRuntimeEvent<SessionLifecycleData> {
  switch (input.type) {
    case "session_created":
      return createNormalizedRuntimeEvent(
        baseInput(
          context,
          input.type,
          { kind: "session", phase: "created", reason: "startup" },
          "boundary",
          "host-synthesized",
        ),
      );
    case "session_start":
      return createNormalizedRuntimeEvent(
        baseInput(
          context,
          input.type,
          {
            kind: "session",
            phase: "started",
            reason: input.reason,
            previousRuntimeSessionId: input.previousRuntimeSessionId,
          },
          "boundary",
        ),
      );
    case "session_before_switch":
      return createNormalizedRuntimeEvent(
        baseInput(
          context,
          input.type,
          {
            kind: "session",
            phase: "before-switch",
            reason: input.reason,
            targetRuntimeSessionId: input.targetRuntimeSessionId,
          },
          "boundary",
        ),
      );
    case "session_shutdown":
      return createNormalizedRuntimeEvent(
        baseInput(
          context,
          input.type,
          {
            kind: "session",
            phase: "shutdown",
            reason: input.reason,
            targetRuntimeSessionId: input.targetRuntimeSessionId,
          },
          "boundary",
        ),
      );
    case "session_invalidated":
      return createNormalizedRuntimeEvent(
        baseInput(
          context,
          input.type,
          { kind: "session", phase: "invalidated", reason: input.reason },
          "stable",
          "host-synthesized",
        ),
      );
    case "session_rebound":
      return createNormalizedRuntimeEvent(
        baseInput(
          context,
          input.type,
          {
            kind: "session",
            phase: "rebound",
            reason: "replacement",
            previousRuntimeSessionId: input.previousRuntimeSessionId,
            targetRuntimeSessionId: input.targetRuntimeSessionId,
          },
          "boundary",
          "host-synthesized",
        ),
      );
  }
}

function normalizePromptEvent(
  context: PiNormalizationContext,
  input: Extract<
    PiRuntimeInput,
    { type: "prompt_submitted" | "prompt_accepted" | "prompt_settled" }
  >,
): NormalizedRuntimeEvent<PromptLifecycleData> {
  switch (input.type) {
    case "prompt_submitted":
      return createNormalizedRuntimeEvent(
        baseInput(context, input.type, { kind: "prompt", phase: "submitted" }, "boundary", "host-synthesized"),
      );
    case "prompt_accepted":
      return createNormalizedRuntimeEvent(
        baseInput(
          context,
          input.type,
          {
            kind: "prompt",
            phase: input.accepted ? "accepted" : "rejected",
            command: input.command,
            accepted: input.accepted,
            errorCode: input.errorCode,
          },
          "boundary",
        ),
      );
    case "prompt_settled":
      return createNormalizedRuntimeEvent(
        baseInput(context, input.type, { kind: "prompt", phase: "settled" }, "stable", "host-synthesized"),
      );
  }
}

function normalizeAgentRunEvent(
  context: PiNormalizationContext,
  input: Extract<PiRuntimeInput, { type: "agent_start" | "agent_end" | "agent_settled" }>,
): NormalizedRuntimeEvent<AgentRunLifecycleData> {
  switch (input.type) {
    case "agent_start":
      return createNormalizedRuntimeEvent(
        baseInput(context, input.type, { kind: "agent-run", phase: "started" }, "boundary"),
      );
    case "agent_end":
      return createNormalizedRuntimeEvent(
        baseInput(
          context,
          input.type,
          {
            kind: "agent-run",
            phase: "ended",
            willRetry: input.willRetry ?? "unknown",
          },
          "boundary",
        ),
      );
    case "agent_settled":
      return createNormalizedRuntimeEvent(
        baseInput(context, input.type, { kind: "agent-run", phase: "settled" }, "stable"),
      );
  }
}

function normalizeTurnEvent(
  context: PiNormalizationContext,
  input: Extract<PiRuntimeInput, { type: "turn_start" | "turn_end" }>,
): NormalizedRuntimeEvent<TurnLifecycleData> {
  return createNormalizedRuntimeEvent(
    baseInput(
      context,
      input.type,
      {
        kind: "turn",
        phase: input.type === "turn_start" ? "started" : "ended",
        outcome: input.type === "turn_end" ? mapTurnOutcome(input.outcome) : undefined,
      },
      "boundary",
    ),
  );
}

function normalizeMessageEvent(
  context: PiNormalizationContext,
  input: Extract<PiRuntimeInput, { type: "message_start" | "message_update" | "message_end" }>,
): NormalizedRuntimeEvent<MessageLifecycleData> {
  const phase =
    input.type === "message_start"
      ? "started"
      : input.type === "message_update"
        ? "delta"
        : "completed";
  return createNormalizedRuntimeEvent(
    baseInput(
      context,
      input.type,
      {
        kind: "message",
        phase,
        role: mapRole(input.role),
        stopReason: mapMessageStopReason(input.stopReason),
        contentLength: input.contentLength,
        contentRef: input.contentRef,
        errorCode: input.errorCode,
      },
      phase === "delta" ? "transient" : "boundary",
    ),
  );
}

function normalizeToolEvent(
  context: PiNormalizationContext,
  input: Extract<
    PiRuntimeInput,
    {
      type:
        | "tool_declared"
        | "tool_execution_start"
        | "tool_execution_update"
        | "tool_execution_end"
        | "tool_result_message";
    }
  >,
): NormalizedRuntimeEvent<ToolLifecycleData> {
  const phaseByType: Record<typeof input.type, ToolLifecycleData["phase"]> = {
    tool_declared: "declared",
    tool_execution_start: "started",
    tool_execution_update: "progress",
    tool_execution_end: "completed",
    tool_result_message: "result-message",
  };
  return createNormalizedRuntimeEvent(
    baseInput(
      {
        ...context,
        correlation: {
          ...(context.correlation ?? {}),
          toolCallId: context.correlation?.toolCallId ?? input.toolCallId,
        },
      },
      input.type,
      {
        kind: "tool",
        phase: phaseByType[input.type],
        toolName: input.toolName,
        toolCallId: input.toolCallId,
        declarationIndex: input.declarationIndex,
        resultMessageIndex: input.resultMessageIndex,
        isError: input.isError,
        inputRef: input.inputRef,
        outputRef: input.outputRef,
      },
      input.type === "tool_execution_update" ? "transient" : "boundary",
    ),
  );
}

function normalizeCompactionEvent(
  context: PiNormalizationContext,
  input: Extract<
    PiRuntimeInput,
    {
      type:
        | "compaction_start"
        | "session_before_compact"
        | "compaction_end"
        | "session_compact";
    }
  >,
): NormalizedRuntimeEvent<CompactionLifecycleData> {
  const completed = input.type === "compaction_end" || input.type === "session_compact";
  return createNormalizedRuntimeEvent(
    baseInput(
      context,
      input.type,
      {
        kind: "compaction",
        phase: completed ? "completed" : "started",
        reason: input.reason,
        fromExtension:
          "fromExtension" in input
            ? input.fromExtension
            : input.type === "session_before_compact" || input.type === "session_compact",
        aborted: "aborted" in input ? input.aborted : undefined,
        willRetry: "willRetry" in input ? input.willRetry : undefined,
        summaryRef: "summaryRef" in input ? input.summaryRef : undefined,
        sourceEntryCount: input.sourceEntryCount,
        contextMessageCount: input.contextMessageCount,
      },
      "boundary",
    ),
  );
}

function normalizeRpcEvent(
  context: PiNormalizationContext,
  input: Extract<PiRuntimeInput, { type: "rpc_request" | "rpc_response" | "rpc_eof" }>,
): NormalizedRuntimeEvent<RpcLifecycleData> {
  if (input.type === "rpc_eof") {
    return createNormalizedRuntimeEvent(
      baseInput(context, input.type, { kind: "rpc", phase: "eof" }, "boundary"),
    );
  }
  const correlation = {
    ...(context.correlation ?? {}),
    rpcRequestId: context.correlation?.rpcRequestId ?? input.requestId,
  };
  return createNormalizedRuntimeEvent(
    baseInput(
      { ...context, correlation },
      input.type,
      input.type === "rpc_request"
        ? {
            kind: "rpc",
            phase: "request",
            command: input.command,
            requestId: input.requestId,
          }
        : {
            kind: "rpc",
            phase: "response",
            command: input.command,
            requestId: input.requestId,
            success: input.success,
            accepted: input.accepted,
            errorCode: input.errorCode,
          },
      "boundary",
    ),
  );
}

function normalizeWorkerEvent(
  context: PiNormalizationContext,
  input: Extract<PiRuntimeInput, { type: "worker_started" | "worker_exited" }>,
): NormalizedRuntimeEvent<WorkerLifecycleData> {
  return createNormalizedRuntimeEvent(
    baseInput(
      context,
      input.type,
      input.type === "worker_started"
        ? { kind: "worker", phase: "started" }
        : {
            kind: "worker",
            phase: "exited",
            exitCode: input.exitCode,
            signal: input.signal,
          },
      input.type === "worker_exited" ? "stable" : "boundary",
      "host-synthesized",
    ),
  );
}

export function normalizePiRuntimeEvent(
  context: PiNormalizationContext,
  input: PiRuntimeInput,
): NormalizedRuntimeEvent {
  switch (input.type) {
    case "session_created":
    case "session_start":
    case "session_before_switch":
    case "session_shutdown":
    case "session_invalidated":
    case "session_rebound":
      return normalizeSessionEvent(context, input);
    case "prompt_submitted":
    case "prompt_accepted":
    case "prompt_settled":
      return normalizePromptEvent(context, input);
    case "agent_start":
    case "agent_end":
    case "agent_settled":
      return normalizeAgentRunEvent(context, input);
    case "turn_start":
    case "turn_end":
      return normalizeTurnEvent(context, input);
    case "message_start":
    case "message_update":
    case "message_end":
      return normalizeMessageEvent(context, input);
    case "tool_declared":
    case "tool_execution_start":
    case "tool_execution_update":
    case "tool_execution_end":
    case "tool_result_message":
      return normalizeToolEvent(context, input);
    case "queue_update":
      return createNormalizedRuntimeEvent(
        baseInput(
          context,
          input.type,
          {
            kind: "queue",
            phase: "snapshot",
            steeringCount: input.steeringCount,
            followUpCount: input.followUpCount,
            steeringRefs: input.steeringRefs,
            followUpRefs: input.followUpRefs,
          },
          "boundary",
        ),
      );
    case "auto_retry_start":
      return createNormalizedRuntimeEvent(
        baseInput(
          context,
          input.type,
          {
            kind: "retry",
            phase: "scheduled",
            attempt: input.attempt,
            maxAttempts: input.maxAttempts,
            delayMs: input.delayMs,
            errorCode: input.errorCode,
          },
          "boundary",
        ),
      );
    case "auto_retry_end":
      return createNormalizedRuntimeEvent(
        baseInput(
          context,
          input.type,
          {
            kind: "retry",
            phase: "completed",
            attempt: input.attempt,
            success: input.success,
            errorCode: input.errorCode,
          },
          "boundary",
        ),
      );
    case "compaction_start":
    case "session_before_compact":
    case "compaction_end":
    case "session_compact":
      return normalizeCompactionEvent(context, input);
    case "rpc_request":
    case "rpc_response":
    case "rpc_eof":
      return normalizeRpcEvent(context, input);
    case "worker_started":
    case "worker_exited":
      return normalizeWorkerEvent(context, input);
  }
}

export interface PiRuntimeEventWithContext {
  context: PiNormalizationContext;
  input: PiRuntimeInput;
}

export function normalizePiRuntimeEvents(
  events: readonly PiRuntimeEventWithContext[],
): readonly NormalizedRuntimeEvent[] {
  const normalized = events.map(({ context, input }) => normalizePiRuntimeEvent(context, input));
  assertRuntimeEventStream(normalized);
  return normalized;
}
