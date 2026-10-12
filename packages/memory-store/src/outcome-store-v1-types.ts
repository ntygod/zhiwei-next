import type { ContentRefV2, CriterionObservationV1, CriterionResult, EpisodeV2, EvidenceRefV2, MemoryClaimV2, MemoryUseV1, OutcomeVerificationPlanV1, Task, TaskAttempt, TaskResultBundleV1, ScopeV2 } from "../../domain/src/index.ts";
import type { OutcomeFeedbackCommandV1, OutcomePlanCommandV1, OutcomeVerifyCommandV1 } from "../../protocol/src/index.ts";
import type { TaskModelRequestSnapshotV1, TaskExecutionDetailsV1, TaskExecutionEventSnapshotV1 } from "./task-execution-v1-types.ts";
import type { CognitionFenceV2 } from "./cognitive-store-v2.ts";
import type { ContextSnapshotV1 } from "./context-store-v1-types.ts";
import type { TaskStoreContextV1, TaskStoreCommitV1 } from "./task-store-v1-types.ts";

export interface OutcomeMaterialV1 { readonly claim: MemoryClaimV2; readonly content: ContentRefV2; readonly sources: readonly ContentRefV2[] }
/** Fixed pure composition; no user command supplies these functions or a success boolean. */
export interface OutcomePersistenceBoundaryV1 {
  readonly verifier: Readonly<{ id: "outcome-verifier-v1"; revision: 1 }>;
  readonly verificationTtlMs: number;
  readonly ids: { next(kind: "plan" | "verification" | "episode" | "observation" | "event" | "use"): string };
  evaluate(attempt: TaskAttempt, plan: OutcomeVerificationPlanV1, observations: readonly CriterionObservationV1[], now: string): readonly CriterionResult[];
  buildEpisode(input: Readonly<{ id: string; task: Task; previous?: EpisodeV2; endedAt: string; recordedAt: string; privacy: EpisodeV2["privacy"];
    evidence: readonly EvidenceRefV2[]; actions: EpisodeV2["actions"]; artifacts: EpisodeV2["artifacts"]; contextDifferences: readonly string[]; unresolved: readonly string[] }>): EpisodeV2;
  adoption(input: Readonly<{ claim: MemoryClaimV2; check?: OutcomeVerificationPlanV1["adoptionChecks"][number]; observations: readonly CriterionObservationV1[]; now: string; claimedStep?: { id: string; revision: number } }>): MemoryUseV1["adoption"];
}
/** Fresh immutable I/O read-set. It does not grant an arbitrary resource read. */
export interface OutcomeVerificationSnapshotV1 {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly operation: "verify" | "feedback";
  readonly command: OutcomeVerifyCommandV1 | OutcomeFeedbackCommandV1;
  readonly owner: TaskStoreContextV1;
  readonly task: Task;
  readonly plan: OutcomeVerificationPlanV1;
  readonly fences: readonly CognitionFenceV2[];
  readonly dependencies: readonly ContentRefV2[];
  readonly execution?: TaskExecutionDetailsV1;
  readonly capsule?: ContextSnapshotV1;
  readonly previous?: TaskResultBundleV1;
  readonly modelRequests: readonly TaskModelRequestSnapshotV1[];
  readonly runtimeEvents: readonly TaskExecutionEventSnapshotV1[];
  readonly materials: readonly OutcomeMaterialV1[];
  readonly preparedAt: string;
  readonly notAfter: string;
}
export interface OutcomeCommitV1 extends TaskStoreCommitV1 { readonly bundle: TaskResultBundleV1 }
export interface OutcomePlanCommitV1 { readonly plan: OutcomeVerificationPlanV1; readonly replay: boolean }
export interface OutcomeVerificationPrepareV1 { readonly snapshot: OutcomeVerificationSnapshotV1; readonly committed?: OutcomeCommitV1 }
export interface TaskVerificationResolutionV1 {
  readonly plan: OutcomeVerificationPlanV1;
  readonly observations: readonly CriterionObservationV1[];
  readonly dependencies: readonly ContentRefV2[];
  readonly evidence: readonly EvidenceRefV2[];
}
export interface OutcomePersistenceV1 {
  bindPlan(context: TaskStoreContextV1, command: OutcomePlanCommandV1): OutcomePlanCommitV1;
  readPlan(workspaceId: string, taskId: string): OutcomeVerificationPlanV1 | undefined;
  prepare(context: TaskStoreContextV1, command: OutcomeVerifyCommandV1): OutcomeVerificationPrepareV1;
  prepareFeedback(context: TaskStoreContextV1, command: OutcomeFeedbackCommandV1): OutcomeVerificationPrepareV1;
  /** Only the fixed authorized verifier supplies observed values, never the HTTP caller. */
  commit(context: TaskStoreContextV1, id: string, observations: readonly CriterionObservationV1[]): OutcomeCommitV1;
  /** Called only after the complete receiving boundary, paired with the exact prepared request. */
  observeRequest(context: TaskStoreContextV1, input: Readonly<{ taskId: string; bindingId: string; requestId: string;
    toolCalls: readonly Readonly<{ callId: string; toolName: string; argumentsJson: string }>[] }>): void;
  read(workspaceId: string, taskId: string): TaskResultBundleV1 | undefined;
  history(workspaceId: string, taskId: string): readonly TaskResultBundleV1[];
}
export interface OutcomeObservationRecordV1 {
  readonly observation: CriterionObservationV1;
  readonly evidence: EvidenceRefV2;
  readonly content: ContentRefV2;
}
export interface ResultInputObservationV1 {
  readonly id: string; readonly scope: ScopeV2; readonly taskAttempt: Readonly<{ taskId: string; attemptId: string; intentRevision: number }>;
  readonly observedAt: string; readonly source: "verifier" | "feedback"; readonly body: unknown; readonly dependencies: readonly ContentRefV2[];
}
