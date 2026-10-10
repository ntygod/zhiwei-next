import type { Task, TaskState } from "../../domain/src/index.ts";
import type { LocalApiReceiptV1 } from "./local-api-v1-types.ts";

/** Product/session transport v1 is independent of frozen NormalizedRuntimeEvent v1. */
export interface SessionProfileRefV1 { readonly id: string; readonly revision: number }
export interface SessionContractV1 {
  readonly schemaVersion: 1;
  readonly runtimeProfile: SessionProfileRefV1;
  readonly modelProfile: SessionProfileRefV1;
  readonly toolProfile: SessionProfileRefV1;
  readonly policyProfile: SessionProfileRefV1;
  readonly dataProfile: SessionProfileRefV1;
  readonly compilerProfile: SessionProfileRefV1;
  readonly interactionKind: "interactive" | "single-task";
}
export interface SessionCreateCommandV1 {
  readonly schemaVersion: 1;
  readonly commandId: string;
  readonly idempotencyKey: string;
  readonly workspaceId: string;
  readonly expectedRevision: 0;
  readonly payload: Readonly<{ kind: "session.create"; contract: SessionContractV1 }>;
}
export interface SessionV1 {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly workspaceId: string;
  readonly revision: number;
  readonly ownerEpoch: number;
  readonly contract: SessionContractV1;
  readonly createdAt: string;
  readonly updatedAt: string;
}
/** Read-side availability only; the persisted Task state remains its last confirmed state. */
export interface SessionTaskRecoveryV1 { readonly status: "blocked"; readonly reason: "worker_custody_required" }
export interface TaskSummaryV1 {
  readonly id: string;
  readonly workspaceId: string;
  readonly sessionId: string;
  readonly revision: number;
  readonly intentRevision: number;
  readonly recovery?: SessionTaskRecoveryV1;
  readonly state: TaskState;
  readonly updatedAt: string;
}
export type SessionCommandReceiptV1 = Omit<LocalApiReceiptV1, "aggregate" | "result"> & Readonly<{
  aggregate: Readonly<{ kind: "session"; id: string; revision: number }>;
  result: Readonly<{ kind: "session"; ownerEpoch: number }>;
}>;
export type SessionApiReceiptV1 = LocalApiReceiptV1 | SessionCommandReceiptV1;
export interface SessionApiReadV1<T> { readonly schemaVersion: 1; readonly value: T; readonly asOfCursor: string; readonly recovery?: SessionTaskRecoveryV1 }
export interface SessionSnapshotV1 {
  readonly schemaVersion: 1;
  readonly workspaceId: string;
  readonly sessions: readonly SessionV1[];
  readonly tasks: readonly TaskSummaryV1[];
  readonly asOfCursor: string;
}
/** One bounded HTTP page. Continuations are pinned to the same authorized commit watermark. */
export interface SessionSnapshotPageV1 extends SessionSnapshotV1 { readonly nextCursor?: string }
export interface SessionTaskListV1 {
  readonly tasks: readonly TaskSummaryV1[];
  readonly nextCursor?: string;
}
export type SessionTaskV1 = Task;
interface ProductEventBaseV1 {
  readonly schemaVersion: 1;
  readonly eventId: string;
  readonly workspaceId: string;
  readonly aggregate: Readonly<{ kind: "task" | "session"; id: string; revision: number }>;
  readonly occurredAt: string;
}
export type ProductEventV1 = ProductEventBaseV1 & (
  | Readonly<{ type: "session.created" | "session.owner_fenced"; payload: Readonly<{ ownerEpoch: number }> }>
  | Readonly<{ type: "task.created" | "task.state_changed"; payload: Readonly<{ state: TaskState; intentRevision: number }> }>
  | Readonly<{ type: "task.input_committed"; payload: Readonly<{ attemptId: string; ordinal: number }> }>
  | Readonly<{ type: "task.progress"; payload: Readonly<{ phase: "queued" | "working" | "waiting" | "verifying" | "stopped"; checkpoint?: string }> }>
);
export interface SessionPairRequestV1 {
  readonly schemaVersion: 1;
  readonly bootstrapCode: string;
  readonly clientNonce: string;
  readonly clientKind: "browser" | "cli";
}
export interface SessionPairResponseV1 {
  readonly schemaVersion: 1;
  readonly clientKind: "browser" | "cli";
  readonly expiresAt: string;
  readonly csrfToken?: string;
  readonly credential?: string;
}
