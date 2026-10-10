import type { ContentRefV2, PrivacyV2, EvidenceRefV2, Task, TaskEvidenceRef, TaskState, WorkingStateV2 } from "../../domain/src/index.ts";
import type { LocalApiCommandV1, ProductEventV1, SessionApiReceiptV1, SessionCreateCommandV1, SessionV1, TaskSummaryV1 } from "../../protocol/src/index.ts";

/** Trusted in-process command; the HTTP parser never accepts this envelope. */
export interface TaskRuntimeCommandV1 {
  readonly schemaVersion: 1;
  readonly commandId: string;
  readonly idempotencyKey: string;
  readonly workspaceId: string;
  readonly expectedRevision: number;
  readonly payload: Readonly<{
    kind: "task.runtime";
    taskId: string;
    event: "prepare" | "start" | "settled" | "confirm-stop" | "confirm-pause" | "interrupted" | "effects-unknown";
    completeness?: "complete" | "incomplete";
    evidenceRefs?: readonly TaskEvidenceRef[];
  }>;
}
export type TaskStoreCommandV1 = LocalApiCommandV1 | TaskRuntimeCommandV1;
export interface TaskReductionContextV1 {
  readonly now: string;
  readonly session: SessionV1;
  readonly taskId: string;
  readonly attemptId: string;
  readonly nextRevision: number;
  readonly outcomeId: string;
  readonly requiresReauthorization: boolean;
  readonly evidence: readonly EvidenceRefV2[];
  readonly privacy: PrivacyV2;
  readonly activeExecution?: Readonly<{ bindingId: string; state: string; dispatched: boolean; closed: boolean }>;
}
export interface TaskReductionV1 {
  /** Every consecutive domain version is retained, including intermediate CREATED/CANCELLING. */
  readonly versions: readonly Task[];
  /** Optional exact WorkingState snapshots, aligned one-to-one with versions. */
  readonly workingStates?: readonly WorkingStateV2[];
}
export interface TaskPersistenceBoundaryV1 {
  readonly daemonInstanceId: string;
  /** Fixed adapter-selected mapping between transport and raw source namespaces; never taken from an event. */
  readonly runtimeSourceIdentity?: Readonly<{ bindingImplementation: string; adapter: string; implementation: string; version: string }>;
  readonly contentPolicy: Readonly<{ privacy: PrivacyV2; retentionUntil: string }>;
  /** All generated identities are trusted injected values; content/reservation must be UUIDs. */
  readonly ids: { next(kind: "session" | "task" | "attempt" | "outcome" | "observation" | "event" | "input" | "content" | "reservation"): string };
  /** Fixed once at composition, never supplied with a user command; no I/O or asynchronous work. */
  readonly reduce: (current: Task | undefined, command: TaskStoreCommandV1, context: TaskReductionContextV1) => TaskReductionV1;
}
export interface TaskStoreContextV1 {
  readonly principalId: string;
  readonly workspaceId: string;
  readonly daemonInstanceId: string;
  readonly ownerEpoch: number;
}
export type TaskStoreReceiptV1 = SessionApiReceiptV1 extends infer R ? R extends SessionApiReceiptV1 ? Omit<R, "eventCursor"> : never : never;
export interface TaskStoreCommitV1 { readonly receipt: TaskStoreReceiptV1; readonly commitCursor: number; readonly replay: boolean }
export interface TaskStoreReadV1<T> { readonly value: T; readonly commitCursor: number }
export interface TaskStoreSnapshotV1 { readonly sessions: readonly SessionV1[]; readonly tasks: readonly TaskSummaryV1[]; readonly commitCursor: number }
export interface TaskOutboxRowV1 { readonly event: ProductEventV1; readonly commitCursor: number; readonly publishState: "pending" | "published" | "quarantined" }
export interface TaskStoreReplayV1 { readonly events: readonly TaskOutboxRowV1[]; readonly highWatermark: number; readonly hasMore: boolean; readonly gap: boolean }
export interface RuntimeInputSnapshotV1 {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly taskId: string;
  readonly attemptId: string;
  readonly taskRevision: number;
  readonly intentRevision: number;
  readonly ownerEpoch: number;
  readonly ordinal: number;
  /** Runtime input is not evidence that a provider received a model request. */
  readonly kind: "runtime_input";
  readonly contractRevision: number;
  readonly text: string;
  readonly createdAt: string;
}
export interface TaskInputCommitResultV1 extends TaskStoreCommitV1 { readonly snapshot: RuntimeInputSnapshotV1; readonly contentRef: ContentRefV2 }
export interface TaskInputCommitV1 {
  readonly commandId: string;
  readonly idempotencyKey: string;
  readonly taskId: string;
  readonly expectedRevision: number;
  readonly attemptId: string;
  readonly intentRevision: number;
  readonly text: string;
}
export interface TaskPersistenceStoreV1 {
  createSession(context: TaskStoreContextV1, command: SessionCreateCommandV1): TaskStoreCommitV1;
  executeTask(context: TaskStoreContextV1, command: TaskStoreCommandV1): TaskStoreCommitV1;
  getSession(workspaceId: string, id: string): TaskStoreReadV1<SessionV1 | undefined>;
  getTask(workspaceId: string, id: string): TaskStoreReadV1<Task | undefined>;
  listTasks(workspaceId: string, options?: Readonly<{ state?: TaskState; limit?: number; after?: string }>): TaskStoreReadV1<readonly TaskSummaryV1[]>;
  snapshot(workspaceId: string): TaskStoreSnapshotV1;
  replay(workspaceId: string, options?: Readonly<{ afterCommitCursor?: number; limit?: number }>): TaskStoreReplayV1;
  readWorkingState(workspaceId: string, taskId: string): TaskStoreReadV1<WorkingStateV2 | undefined>;
  recordRuntimeInput(context: TaskStoreContextV1, input: TaskInputCommitV1): TaskInputCommitResultV1;
  listRuntimeInputs(workspaceId: string, taskId: string, attemptId: string): TaskStoreReadV1<readonly RuntimeInputSnapshotV1[]>;
  acknowledgeOutbox(workspaceId: string, consumerId: string, eventId: string, expectedCursor: number): number;
  /** Called only by the synthetic launcher after a new daemon instance takes ownership; never resumes work. */
  fenceRestartedOwners(): readonly SessionV1[];
  contentRefs(workspaceId: string, taskId: string): readonly ContentRefV2[];
}
