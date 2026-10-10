import type { ContentRefV2 } from "../../domain/src/index.ts";
import type { ExecutionSpecV1, RuntimeBindingV1, RuntimeWorkerStateV1, NormalizedRuntimeEnvelopeV1, RuntimeProcessCloseEvidenceV1, JsonValue } from "../../protocol/src/index.ts";
import type { TaskStoreContextV1 } from "./task-store-v1-types.ts";

/** Durable execution coordinates, not a grant to perform an effect. */
export interface TaskExecutionReadV1 {
  readonly bindingId: string;
  readonly revision: number;
  readonly executionUnitId: string;
  readonly taskId: string;
  readonly attemptId: string;
  readonly taskRevision: number;
  readonly ownerEpoch: number;
  readonly state: RuntimeWorkerStateV1;
  readonly dispatched: boolean;
  readonly closed: boolean;
}
export interface TaskExecutionSourceIdentityV1 {
  readonly bindingImplementation: string;
  readonly adapter: string;
  readonly implementation: string;
  readonly version: string;
}
export interface TaskExecutionDetailsV1 extends TaskExecutionReadV1 {
  readonly spec: ExecutionSpecV1;
  readonly binding: RuntimeBindingV1;
  readonly sourceIdentity: TaskExecutionSourceIdentityV1;
  readonly closeEvidence?: RuntimeProcessCloseEvidenceV1;
}
export interface TaskExecutionEventCommitV1 { readonly replay: boolean; readonly commitCursor: number; readonly sourceSequence: number }
export interface TaskModelRequestCommitV1 { readonly replay: boolean; readonly ordinal: number; readonly contentRef: ContentRefV2 }
export interface TaskModelRequestSnapshotV1 {
  readonly schemaVersion: 1;
  readonly bindingId: string;
  readonly requestId: string;
  readonly taskId: string;
  readonly attemptId: string;
  readonly taskRevision: number;
  readonly intentRevision: number;
  readonly ownerEpoch: number;
  readonly recoveryEpoch: number;
  readonly ordinal: number;
  readonly context: JsonValue;
  readonly maxTokens: number;
  readonly createdAt: string;
  readonly contentRef: ContentRefV2;
}
/** Trusted in-process persistence only. No caller-supplied host, SQL or identity mapping. */
export interface TaskExecutionPersistenceV1 {
  allocateExecution(context: TaskStoreContextV1, input: Readonly<{ taskId: string; expectedRevision: number; spec: ExecutionSpecV1; binding: RuntimeBindingV1 }>): TaskExecutionReadV1;
  markExecutionReady(context: TaskStoreContextV1, input: Readonly<{ taskId: string; binding: RuntimeBindingV1 }>): TaskExecutionReadV1;
  markExecutionDispatched(context: TaskStoreContextV1, input: Readonly<{ taskId: string; bindingId: string }>): TaskExecutionReadV1;
  observeExecutionBinding(context: TaskStoreContextV1, input: Readonly<{ taskId: string; binding: RuntimeBindingV1 }>): TaskExecutionReadV1;
  ingestExecutionEvent(context: TaskStoreContextV1, input: Readonly<{ taskId: string; envelope: NormalizedRuntimeEnvelopeV1 }>): TaskExecutionEventCommitV1;
  recordModelRequest(context: TaskStoreContextV1, input: Readonly<{ taskId: string; bindingId: string; requestId: string; context: JsonValue; maxTokens: number }>): TaskModelRequestCommitV1;
  closeExecution(context: TaskStoreContextV1, input: Readonly<{ taskId: string; evidence: RuntimeProcessCloseEvidenceV1 }>): TaskExecutionReadV1;
  readExecution(workspaceId: string, taskId: string): TaskExecutionReadV1 | undefined;
  readExecutionDetails(workspaceId: string, taskId: string): TaskExecutionDetailsV1 | undefined;
  listModelRequests(workspaceId: string, taskId: string, attemptId: string): readonly TaskModelRequestSnapshotV1[];
}
