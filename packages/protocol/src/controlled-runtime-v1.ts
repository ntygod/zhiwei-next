import type { ContentRefV2, TaskAttemptRefV2 } from "../../domain/src/index.ts";
import {
  invalid, object, keys, member, identifier, revision, timestamp, textValue, list,
  unique, version, wireBoundary,
} from "./cognitive-wire.ts";
import {
  parseNormalizedRuntimeEventV1,
  type NormalizedRuntimeEventV1,
  type NormalizedRuntimeSourceSurfaceV1,
} from "./runtime-event-v1.ts";

/** Independent port version. Existing NormalizedRuntimeEvent v1 retains its wire meaning. */
export const controlledRuntimeSchemaVersion = 1 as const;
export type RuntimeExecutionOwnerV1 = Readonly<{ kind: "task_attempt" | "cognitive_job"; id: string }>;
export interface RuntimeScopeEpochsV1 { readonly global: number; readonly workspace: number }
export interface RuntimeSourceTaskV1 { readonly taskId: string; readonly attemptId?: string; readonly intentRevision: number }
interface ExecutionFenceBaseV1 {
  readonly installationId: string;
  readonly recoveryEpoch: string;
  readonly contractRevision: number;
  readonly leaseEpoch: number;
  readonly cognition: RuntimeScopeEpochsV1;
  readonly policy: RuntimeScopeEpochsV1;
  readonly notAfter: string;
}
/** Syntactic coordinates only. A parser cannot establish lease ownership or current eligibility. */
export type ExecutionFenceV1 = ExecutionFenceBaseV1 & (
  | Readonly<{ owner: Readonly<{ kind: "task_attempt"; id: string }>; sourceTask: TaskAttemptRefV2 }>
  | Readonly<{ owner: Readonly<{ kind: "cognitive_job"; id: string }>; sourceTask?: RuntimeSourceTaskV1 }>
);
export interface RuntimeProfileRefV1 { readonly id: string; readonly revision: number }
export type RuntimeToolProfileV1 = "none" | "controlled-read-memory-draft-v1";
export interface RuntimeExecutionBoundsV1 {
  readonly maxOutputBytes: number;
  readonly maxDurationMs: number;
  readonly maxTokens: number;
  readonly maxModelRequests: number;
  /** Zero is valid for a no-tool execution. */
  readonly maxToolCalls: number;
}
/** No paths, environment, credentials, grant claims or callback identities cross this DTO. */
export interface ExecutionSpecV1 {
  readonly schemaVersion: typeof controlledRuntimeSchemaVersion;
  readonly executionUnitId: string;
  readonly workspaceId: string;
  readonly sessionId: string;
  readonly prompt: string;
  /** An exact snapshot reference is not evidence of a committed snapshot or permission to read it. */
  readonly requestSnapshotRef: ContentRefV2;
  readonly fence: ExecutionFenceV1;
  readonly selectedModelProfile: RuntimeProfileRefV1;
  readonly toolProfile: RuntimeToolProfileV1;
  readonly bounds: RuntimeExecutionBoundsV1;
  /** Opaque host-managed directory identity, never an OS path or a Runtime-supplied cwd. */
  readonly controlledCwdRef: string;
}
export interface RuntimeIdentityV1 { readonly implementation: string; readonly version: string }
export interface RuntimeCapabilityEvidenceV1 {
  readonly status: "supported" | "unsupported" | "limited";
  readonly evidenceRevision: string;
  readonly limitations: readonly string[];
}
export interface RuntimeCapabilityProfileV1 {
  readonly schemaVersion: typeof controlledRuntimeSchemaVersion;
  readonly profileId: string;
  readonly profileRevision: number;
  readonly runtime: RuntimeIdentityV1;
  readonly structuredDecision: RuntimeCapabilityEvidenceV1;
  readonly modelBoundaryCapture: RuntimeCapabilityEvidenceV1;
  readonly toolInterception: RuntimeCapabilityEvidenceV1;
  readonly abort: RuntimeCapabilityEvidenceV1;
  readonly resume: RuntimeCapabilityEvidenceV1;
  readonly progress: RuntimeCapabilityEvidenceV1;
  readonly nativeCompaction: RuntimeCapabilityEvidenceV1;
}
export type RuntimeWorkerStateV1 = "ALLOCATED" | "STARTING" | "READY" | "BUSY" | "DRAINING" | "STOPPED" | "FAILED";
export interface RuntimeSourceStreamV1 {
  readonly sourceStreamId: string;
  readonly surface: NormalizedRuntimeSourceSurfaceV1;
  readonly runtimeInstanceId: string;
  readonly sequenceDomain: string;
}
/** Recorded connection facts, not an authority a Runtime may assign to itself. */
export interface RuntimeBindingV1 {
  readonly schemaVersion: typeof controlledRuntimeSchemaVersion;
  readonly bindingId: string;
  readonly executionUnitId: string;
  readonly workspaceId: string;
  readonly sessionId: string;
  readonly owner: RuntimeExecutionOwnerV1;
  readonly workerInstanceId: string;
  readonly leaseEpoch: number;
  readonly profileRevision: number;
  readonly runtime: RuntimeIdentityV1;
  readonly state: RuntimeWorkerStateV1;
  /** Actual upstream session observations; must never be filled with the product Session ID. */
  readonly observedRuntimeSessionIds: readonly string[];
  readonly sourceStreams: readonly RuntimeSourceStreamV1[];
}
/** Host binding coordinates wrap the source event; they are never inserted as upstream facts. */
export interface NormalizedRuntimeEnvelopeV1 {
  readonly schemaVersion: typeof controlledRuntimeSchemaVersion;
  readonly bindingId: string;
  readonly executionUnitId: string;
  readonly workerInstanceId: string;
  readonly sourceStreamId: string;
  readonly event: NormalizedRuntimeEventV1;
}
export type RuntimeStopReasonV1 = "cancelled" | "timeout" | "budget_exceeded" | "protocol_error" | "configuration_changed" | "shutdown";
/** Acknowledgement never proves that an external tool effect has been cancelled. */
export interface RuntimeStopAcknowledgementV1 {
  readonly schemaVersion: typeof controlledRuntimeSchemaVersion;
  readonly bindingId: string;
  readonly reason: RuntimeStopReasonV1;
  readonly status: "requested" | "observed-stopped" | "unsupported";
  readonly observedAt: string;
}
/** Transport observations, not task success or proof of absent external effects. */
export interface RuntimeProcessCloseEvidenceV1 {
  readonly schemaVersion: typeof controlledRuntimeSchemaVersion;
  readonly bindingId: string;
  readonly stdoutEof: boolean;
  readonly stderrEof: boolean;
  readonly closeObserved: boolean;
  readonly exitCode: number | null;
  readonly signal: string | null;
  readonly observedAt: string;
}
/** RPC/transport command acceptance only; never evidence that the user task succeeded. */
export type RuntimeCommandAcceptanceV1 = Readonly<{
  schemaVersion: typeof controlledRuntimeSchemaVersion;
  bindingId: string;
  requestId: string;
}> & (
  | Readonly<{ status: "accepted" }>
  | Readonly<{ status: "rejected"; errorCode: "unsupported" | "invalid_request" | "runtime_rejected" | "unavailable" }>
);
export interface RuntimePort {
  capabilities(): RuntimeCapabilityProfileV1;
  /** Returns only after the selected profile and actual handshake have passed; binding is READY. */
  start(spec: ExecutionSpecV1): Promise<RuntimeBindingV1>;
  /** Dispatches the already-bound spec after host admission; acceptance is not Runtime settlement. */
  dispatch(bindingId: string): Promise<RuntimeCommandAcceptanceV1>;
  events(bindingId: string): AsyncIterable<NormalizedRuntimeEnvelopeV1>;
  abort(bindingId: string, reason: RuntimeStopReasonV1): Promise<RuntimeStopAcknowledgementV1>;
  dispose(bindingId: string): Promise<RuntimeProcessCloseEvidenceV1>;
}

const capabilityNames = [
  "structuredDecision", "modelBoundaryCapture", "toolInterception", "abort", "resume", "progress", "nativeCompaction",
] as const;
const workerStates = ["ALLOCATED", "STARTING", "READY", "BUSY", "DRAINING", "STOPPED", "FAILED"] as const;
const stopReasons = ["cancelled", "timeout", "budget_exceeded", "protocol_error", "configuration_changed", "shutdown"] as const;
function parseOwner(value: unknown): RuntimeExecutionOwnerV1 {
  const record = object(value); keys(record, ["kind", "id"]);
  return { kind: member(record.kind, ["task_attempt", "cognitive_job"]), id: identifier(record.id) };
}
function parseEpochs(value: unknown): RuntimeScopeEpochsV1 {
  const record = object(value); keys(record, ["global", "workspace"]);
  return { global: revision(record.global, true), workspace: revision(record.workspace, true) };
}
function parseFence(value: unknown): ExecutionFenceV1 {
  const record = object(value);
  keys(record, ["installationId", "recoveryEpoch", "owner", "contractRevision", "leaseEpoch", "cognition", "policy", "notAfter"], ["sourceTask"]);
  const owner = parseOwner(record.owner);
  const base: ExecutionFenceBaseV1 = {
    installationId: identifier(record.installationId), recoveryEpoch: identifier(record.recoveryEpoch),
    contractRevision: revision(record.contractRevision), leaseEpoch: revision(record.leaseEpoch),
    cognition: parseEpochs(record.cognition), policy: parseEpochs(record.policy), notAfter: timestamp(record.notAfter),
  };
  let sourceTask: RuntimeSourceTaskV1 | undefined;
  if (record.sourceTask !== undefined) {
    const source = object(record.sourceTask); keys(source, ["taskId", "intentRevision"], ["attemptId"]);
    sourceTask = {
      taskId: identifier(source.taskId), intentRevision: revision(source.intentRevision),
      ...(source.attemptId === undefined ? {} : { attemptId: identifier(source.attemptId) }),
    };
  }
  if (owner.kind === "task_attempt") {
    if (!sourceTask || sourceTask.attemptId !== owner.id) invalid();
    return { ...base, owner: { kind: "task_attempt", id: owner.id }, sourceTask: { ...sourceTask, attemptId: owner.id } };
  }
  return { ...base, owner: { kind: "cognitive_job", id: owner.id }, ...(sourceTask ? { sourceTask } : {}) };
}
export function parseExecutionFenceV1(input: unknown): ExecutionFenceV1 {
  return wireBoundary(input, parseFence);
}
function parseProfileRef(value: unknown): RuntimeProfileRefV1 {
  const record = object(value); keys(record, ["id", "revision"]);
  return { id: identifier(record.id), revision: revision(record.revision) };
}
function parseBounds(value: unknown): RuntimeExecutionBoundsV1 {
  const record = object(value);
  keys(record, ["maxOutputBytes", "maxDurationMs", "maxTokens", "maxModelRequests", "maxToolCalls"]);
  return {
    maxOutputBytes: revision(record.maxOutputBytes), maxDurationMs: revision(record.maxDurationMs),
    maxTokens: revision(record.maxTokens), maxModelRequests: revision(record.maxModelRequests),
    maxToolCalls: revision(record.maxToolCalls, true),
  };
}
export function parseExecutionSpecV1(input: unknown): ExecutionSpecV1 {
  return wireBoundary(input, record => {
    keys(record, ["schemaVersion", "executionUnitId", "workspaceId", "sessionId", "prompt", "requestSnapshotRef", "fence", "selectedModelProfile", "toolProfile", "bounds", "controlledCwdRef"]);
    version(record.schemaVersion, controlledRuntimeSchemaVersion);
    const snapshot = object(record.requestSnapshotRef); keys(snapshot, ["contentId", "contentVersion"]);
    const fence = parseFence(record.fence);
    const toolProfile = member(record.toolProfile, ["none", "controlled-read-memory-draft-v1"]);
    const bounds = parseBounds(record.bounds);
    if (fence.owner.kind === "cognitive_job" && toolProfile !== "none") invalid();
    if (toolProfile === "none" && bounds.maxToolCalls !== 0) invalid();
    return {
      schemaVersion: controlledRuntimeSchemaVersion, executionUnitId: identifier(record.executionUnitId),
      workspaceId: identifier(record.workspaceId), sessionId: identifier(record.sessionId), prompt: textValue(record.prompt),
      requestSnapshotRef: { contentId: identifier(snapshot.contentId), contentVersion: revision(snapshot.contentVersion) },
      fence, selectedModelProfile: parseProfileRef(record.selectedModelProfile), toolProfile, bounds,
      controlledCwdRef: identifier(record.controlledCwdRef),
    };
  });
}
function parseRuntimeIdentity(value: unknown): RuntimeIdentityV1 {
  const record = object(value); keys(record, ["implementation", "version"]);
  const runtimeVersion = textValue(record.version, 128);
  if (runtimeVersion !== runtimeVersion.trim()) invalid();
  return { implementation: identifier(record.implementation), version: runtimeVersion };
}
function parseCapability(value: unknown): RuntimeCapabilityEvidenceV1 {
  const record = object(value); keys(record, ["status", "evidenceRevision", "limitations"]);
  const status = member(record.status, ["supported", "unsupported", "limited"]);
  const limitations = list(record.limitations, 16, status === "limited" ? 1 : 0).map(item => identifier(item));
  unique(limitations);
  if (status === "supported" && limitations.length !== 0) invalid();
  return { status, evidenceRevision: identifier(record.evidenceRevision), limitations };
}
export function parseRuntimeCapabilityProfileV1(input: unknown): RuntimeCapabilityProfileV1 {
  return wireBoundary(input, record => {
    keys(record, ["schemaVersion", "profileId", "profileRevision", "runtime", ...capabilityNames]);
    version(record.schemaVersion, controlledRuntimeSchemaVersion);
    return {
      schemaVersion: controlledRuntimeSchemaVersion, profileId: identifier(record.profileId),
      profileRevision: revision(record.profileRevision), runtime: parseRuntimeIdentity(record.runtime),
      structuredDecision: parseCapability(record.structuredDecision), modelBoundaryCapture: parseCapability(record.modelBoundaryCapture),
      toolInterception: parseCapability(record.toolInterception), abort: parseCapability(record.abort),
      resume: parseCapability(record.resume), progress: parseCapability(record.progress), nativeCompaction: parseCapability(record.nativeCompaction),
    };
  });
}
function parseSourceStream(value: unknown): RuntimeSourceStreamV1 {
  const record = object(value); keys(record, ["sourceStreamId", "surface", "runtimeInstanceId", "sequenceDomain"]);
  return {
    sourceStreamId: identifier(record.sourceStreamId), surface: member(record.surface, ["sdk", "extension", "rpc", "host"]),
    runtimeInstanceId: identifier(record.runtimeInstanceId), sequenceDomain: identifier(record.sequenceDomain),
  };
}
export function parseRuntimeBindingV1(input: unknown): RuntimeBindingV1 {
  return wireBoundary(input, record => {
    keys(record, ["schemaVersion", "bindingId", "executionUnitId", "workspaceId", "sessionId", "owner", "workerInstanceId", "leaseEpoch", "profileRevision", "runtime", "state", "observedRuntimeSessionIds", "sourceStreams"]);
    version(record.schemaVersion, controlledRuntimeSchemaVersion);
    const state = member(record.state, workerStates);
    const minimum = ["READY", "BUSY", "DRAINING"].includes(state) ? 1 : 0;
    const sessions = list(record.observedRuntimeSessionIds, 100, minimum).map(item => identifier(item)); unique(sessions);
    const streams = list(record.sourceStreams, 100, minimum).map(parseSourceStream);
    unique(streams.map(stream => stream.sourceStreamId));
    unique(streams.map(stream => JSON.stringify([stream.surface, stream.runtimeInstanceId, stream.sequenceDomain])));
    return {
      schemaVersion: controlledRuntimeSchemaVersion, bindingId: identifier(record.bindingId), executionUnitId: identifier(record.executionUnitId),
      workspaceId: identifier(record.workspaceId), sessionId: identifier(record.sessionId), owner: parseOwner(record.owner),
      workerInstanceId: identifier(record.workerInstanceId), leaseEpoch: revision(record.leaseEpoch), profileRevision: revision(record.profileRevision),
      runtime: parseRuntimeIdentity(record.runtime), state, observedRuntimeSessionIds: sessions, sourceStreams: streams,
    };
  });
}
export function parseNormalizedRuntimeEnvelopeV1(input: unknown): NormalizedRuntimeEnvelopeV1 {
  return wireBoundary(input, record => {
    keys(record, ["schemaVersion", "bindingId", "executionUnitId", "workerInstanceId", "sourceStreamId", "event"]);
    version(record.schemaVersion, controlledRuntimeSchemaVersion);
    return {
      schemaVersion: controlledRuntimeSchemaVersion, bindingId: identifier(record.bindingId), executionUnitId: identifier(record.executionUnitId),
      workerInstanceId: identifier(record.workerInstanceId), sourceStreamId: identifier(record.sourceStreamId),
      event: parseNormalizedRuntimeEventV1(record.event),
    };
  });
}
export function parseRuntimeStopAcknowledgementV1(input: unknown): RuntimeStopAcknowledgementV1 {
  return wireBoundary(input, record => {
    keys(record, ["schemaVersion", "bindingId", "reason", "status", "observedAt"]);
    version(record.schemaVersion, controlledRuntimeSchemaVersion);
    return {
      schemaVersion: controlledRuntimeSchemaVersion, bindingId: identifier(record.bindingId),
      reason: member(record.reason, stopReasons), status: member(record.status, ["requested", "observed-stopped", "unsupported"]),
      observedAt: timestamp(record.observedAt),
    };
  });
}
export function parseRuntimeProcessCloseEvidenceV1(input: unknown): RuntimeProcessCloseEvidenceV1 {
  return wireBoundary(input, record => {
    keys(record, ["schemaVersion", "bindingId", "stdoutEof", "stderrEof", "closeObserved", "exitCode", "signal", "observedAt"]);
    version(record.schemaVersion, controlledRuntimeSchemaVersion);
    if (typeof record.stdoutEof !== "boolean" || typeof record.stderrEof !== "boolean" || typeof record.closeObserved !== "boolean") invalid();
    const exitCode = record.exitCode === null ? null : revision(record.exitCode, true);
    const signal = record.signal === null ? null : identifier(record.signal);
    if (exitCode !== null && signal !== null) invalid();
    if (!record.closeObserved && (exitCode !== null || signal !== null)) invalid();
    return {
      schemaVersion: controlledRuntimeSchemaVersion, bindingId: identifier(record.bindingId),
      stdoutEof: record.stdoutEof, stderrEof: record.stderrEof, closeObserved: record.closeObserved,
      exitCode, signal, observedAt: timestamp(record.observedAt),
    };
  });
}

export function parseRuntimeCommandAcceptanceV1(input: unknown): RuntimeCommandAcceptanceV1 {
  return wireBoundary(input, record => {
    const status = member(record.status, ["accepted", "rejected"]);
    keys(record, ["schemaVersion", "bindingId", "requestId", "status", ...(status === "rejected" ? ["errorCode"] : [])]);
    version(record.schemaVersion, controlledRuntimeSchemaVersion);
    const base = { schemaVersion: controlledRuntimeSchemaVersion, bindingId: identifier(record.bindingId), requestId: identifier(record.requestId) };
    if (status === "accepted") return { ...base, status };
    return { ...base, status, errorCode: member(record.errorCode, ["unsupported", "invalid_request", "runtime_rejected", "unavailable"]) };
  });
}
