import type { ClaimVersionRefV2, CognitiveContextCapsuleV1, ContextBudgetV1, MemoryClaimV2, Task, WorkingStateV2, ContentRefV2, CognitiveDecisionV1, CognitiveDecisionInputV1 } from "../../domain/src/index.ts";
import type { JsonValue, CognitiveDecisionModelRequestV1 } from "../../protocol/src/index.ts";
import type { TaskInputCommitResultV1, TaskStoreContextV1 } from "./task-store-v1-types.ts";

/** Fixed at trusted composition. It cannot be supplied by a command or grant a send. */
export interface ContextPersistenceBoundaryV1 {
  readonly budget: ContextBudgetV1;
  readonly counter: Readonly<{ id: string; version: string; mode: "exact" }>;
  compile(input: Readonly<{ id: string; task: Task; workingState: WorkingStateV2; claims: readonly MemoryClaimV2[];
    requiredClaims: readonly ClaimVersionRefV2[]; compiledAt: string; modelProfile: Readonly<{ id: string; revision: number }> }>):
    Readonly<{ ok: true; capsule: CognitiveContextCapsuleV1 }> | Readonly<{ ok: false; reason: string }>;
  /** Counts the actual bounded transport request, including message/tool/protocol composition. */
  countActualRequest(context: JsonValue): number;
}
export interface ContextPrepareV1 {
  readonly id: string;
  readonly taskId: string;
  readonly expectedRevision: number;
  readonly query: string;
  readonly requiredClaims: readonly ClaimVersionRefV2[];
}
export interface ContextSnapshotV1 {
  readonly capsule: CognitiveContextCapsuleV1;
  readonly contentRef: ContentRefV2;
  readonly runtimeInput: TaskInputCommitResultV1;
}
export interface ContextPersistenceV1 {
  prepare(context: TaskStoreContextV1, input: ContextPrepareV1): ContextSnapshotV1;
  read(workspaceId: string, taskId: string, id: string): ContextSnapshotV1;
  assertCurrent(context: TaskStoreContextV1, id: string): void;
  /** Fixed first Runtime profile searches only the qualified material in its committed capsule. */
  searchRuntimeMemory(context: TaskStoreContextV1, input: Readonly<{ capsuleId: string; bindingId: string; query: string }>): readonly MemoryClaimV2[];
  inspectRuntimeMemory(context: TaskStoreContextV1, input: Readonly<{ capsuleId: string; bindingId: string; claim: ClaimVersionRefV2 }>): MemoryClaimV2;
  openBoundary(context: TaskStoreContextV1, input: Readonly<{ id: string; capsuleId: string }>): CognitiveBoundaryReadV1;
  readBoundary(workspaceId: string, taskId: string, id: string): CognitiveBoundaryReadV1;
  reserveDecisionCall(context: TaskStoreContextV1, input: Readonly<{ boundaryId: string; capsuleId: string; requestId: string; purpose: CognitiveDecisionInputV1["purpose"] }>): CognitiveCallReservationV1;
  recordDecisionRequest(context: TaskStoreContextV1, input: CognitiveDecisionModelRequestV1): void;
  commitDecision(context: TaskStoreContextV1, input: Readonly<{ boundaryId: string; capsuleId: string; decision: CognitiveDecisionV1; origin: "model-proposal" | "coordinator-stop"; requestId: string | null }>): CognitiveBoundaryReadV1;
}
export interface CognitiveDecisionRecordV1 {
  readonly schemaVersion: 1;
  readonly boundaryId: string;
  readonly revision: number;
  readonly capsuleId: string;
  readonly callCount: number;
  readonly origin: "model-proposal" | "coordinator-stop";
  readonly decision: CognitiveDecisionV1;
  readonly createdAt: string;
  readonly requestId: string | null;
}
export interface CognitiveBoundaryReadV1 {
  readonly id: string;
  readonly taskId: string;
  readonly attemptId: string;
  readonly taskRevision: number;
  readonly intentRevision: number;
  readonly capsuleId: string;
  readonly status: "open" | "decided" | "stopped";
  readonly callCount: number;
  readonly decisions: readonly CognitiveDecisionRecordV1[];
}
export interface CognitiveCallReservationV1 extends CognitiveDecisionModelRequestV1 {
  readonly input: CognitiveDecisionInputV1;
  readonly contentRef: ContentRefV2;
}
