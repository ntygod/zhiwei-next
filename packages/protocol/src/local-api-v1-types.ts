import type {
  AcceptanceCriterion, ClaimKindV2, ClaimVersionRefV2, EntityRefV2, EvidenceRefV2,
  GoalStatusV2, OutcomeStatus, PrivacyV2, ScopeV2, TaskEvidenceRef, TaskState,
} from "../../domain/src/index.ts";

export const localApiSchemaVersion = 1 as const;
interface TaskInputV1 {
  readonly request: string;
  readonly constraints: readonly string[];
  readonly acceptanceChecks: readonly AcceptanceCriterion[];
}
interface GoalInputV1 {
  readonly intent: string;
  readonly criteria: readonly AcceptanceCriterion[];
  readonly priority: "low" | "normal" | "high";
  readonly privacy: PrivacyV2;
  readonly confirmation: EvidenceRefV2;
  readonly deadline?: string;
}
interface MemoryInputV1 {
  readonly scope: ScopeV2;
  readonly privacy: PrivacyV2;
  readonly claimKind: ClaimKindV2;
  readonly statement: string;
  readonly evidenceRefs: readonly EvidenceRefV2[];
  readonly validFrom: string;
  readonly validUntil?: string;
}
/** P1 core DTOs only. A parsed command is a request, never authorization or an applied transition. */
export type LocalApiPayloadV1 =
  | (Readonly<{ kind: "task.create"; sessionId: string; executionProfile: Readonly<{ id: string; revision: number }>; goalRef?: EntityRefV2<"goal"> }> & TaskInputV1)
  | Readonly<{ kind: "task.continue" | "task.pause" | "task.cancel" | "task.retry"; targetRef: EntityRefV2<"task"> }>
  | Readonly<{ kind: "task.respond"; targetRef: EntityRefV2<"task">; pendingQuestionId: string; response: string }>
  | (Readonly<{ kind: "task.revise-request"; targetRef: EntityRefV2<"task">; intentRevision: number }> & TaskInputV1)
  | Readonly<{ kind: "task.confirm-result"; targetRef: EntityRefV2<"task">; attemptId: string; intentRevision: number; criterionId: string; criterionRevision: number; evidenceRefs: readonly TaskEvidenceRef[] }>
  | (Readonly<{ kind: "goal.create" }> & GoalInputV1)
  | (Readonly<{ kind: "goal.revise"; targetRef: EntityRefV2<"goal"> }> & GoalInputV1)
  | Readonly<{ kind: "goal.pause" | "goal.resume" | "goal.abandon"; targetRef: EntityRefV2<"goal"> }>
  | (Readonly<{ kind: "memory.remember" }> & MemoryInputV1)
  | (Readonly<{ kind: "memory.correct"; targetRef: EntityRefV2<"claim">; targetVersion: ClaimVersionRefV2 }> & MemoryInputV1)
  | Readonly<{ kind: "memory.forget"; targetRef: EntityRefV2<"claim">; targetVersion: ClaimVersionRefV2; scope: ScopeV2; mode: "logical" }>;

export interface LocalApiCommandV1 {
  readonly schemaVersion: typeof localApiSchemaVersion;
  readonly commandId: string;
  readonly idempotencyKey: string;
  readonly workspaceId: string;
  readonly expectedRevision: number;
  readonly payload: LocalApiPayloadV1;
}
/** Matching route identities are syntax constraints, not caller identity or resource ownership checks. */
export interface LocalApiRouteV1 { readonly workspaceId: string; readonly targetId?: string }
export interface LocalApiMemorySearchV1 {
  readonly schemaVersion: typeof localApiSchemaVersion;
  readonly query: string;
  readonly scope: ScopeV2;
  readonly kinds: readonly ClaimKindV2[];
  readonly validAt?: string;
  readonly knownAt?: string;
  readonly limit: number;
}
export interface LocalApiOutcomeSummaryV1 {
  readonly ref: EntityRefV2<"outcome">;
  readonly status: OutcomeStatus;
}
export type LocalApiResultV1 =
  | Readonly<{
    kind: "task";
    /** Historical terminal state is retained when later evidence revises an Outcome. */
    taskState: TaskState;
    intentRevision: number;
    /** Current exact Outcome version; this status determines the current result classification. */
    outcome?: LocalApiOutcomeSummaryV1;
    /** Required only when outcome.revision > 1: original same-ID revision 1, matching taskState. */
    initialOutcome?: LocalApiOutcomeSummaryV1;
  }>
  | Readonly<{ kind: "goal"; status: GoalStatusV2; affectedRefs: readonly EntityRefV2[] }>
  | Readonly<{ kind: "memory"; affectedRefs: readonly EntityRefV2<"claim">[]; cognitionEpoch: number }>;
/** Durable receipt representation only; parsing cannot establish that a transaction committed. */
export interface LocalApiReceiptV1 {
  readonly schemaVersion: typeof localApiSchemaVersion;
  readonly commandId: string;
  readonly status: "committed";
  readonly aggregate: EntityRefV2<"task" | "goal" | "claim">;
  readonly eventCursor: string;
  readonly result: LocalApiResultV1;
}
export type LocalApiErrorCodeV1 = "validation" | "unauthenticated" | "forbidden" | "not_found"
  | "revision_conflict" | "idempotency_conflict" | "unavailable" | "unsupported" | "budget_exceeded" | "corruption";
export interface LocalApiErrorV1 {
  readonly schemaVersion: typeof localApiSchemaVersion;
  readonly commandId?: string;
  readonly error: {
    readonly code: LocalApiErrorCodeV1;
    readonly reason: string;
    readonly safeMessage: string;
    readonly retryable: boolean;
    readonly diagnosticId: string;
  };
}
