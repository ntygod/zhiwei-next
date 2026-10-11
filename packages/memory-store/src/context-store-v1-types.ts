import type { ClaimVersionRefV2, CognitiveContextCapsuleV1, ContextBudgetV1, MemoryClaimV2, Task, WorkingStateV2, ContentRefV2 } from "../../domain/src/index.ts";
import type { JsonValue } from "../../protocol/src/index.ts";
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
}
