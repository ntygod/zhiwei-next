import type { AcceptanceCriterion, IsoTimestamp, OutcomeStatus, TaskIntent } from "./index.ts";

/** Formal P1 contracts. Bootstrap/v1 names deliberately retain their existing semantics. */
export type ScopeV2 =
  | Readonly<{ kind: "global" }>
  | Readonly<{ kind: "workspace"; workspaceId: string }>
  | Readonly<{ kind: "task"; workspaceId: string; taskId: string }>
  | Readonly<{ kind: "session"; workspaceId: string; sessionId: string }>;
export type PrivacyV2 = "model-allowed" | "local-only";
export type SourceTrustV2 = "user-direct" | "verified-tool" | "external-content" | "model-derived";
export type EpistemicV2 = "asserted" | "verified" | "inferred";
export type EntityKindV2 = "workspace" | "session" | "observation" | "candidate" | "claim" | "hypothesis"
  | "goal" | "task" | "outcome" | "episode" | "working-state" | "procedure"
  | "artifact" | "action" | "extractor" | "validator";
/** Aggregate snapshot identity. Task/Outcome continue to use their existing revision contract. */
export interface EntityRefV2<K extends EntityKindV2 = EntityKindV2> {
  readonly kind: K;
  readonly id: string;
  readonly revision: number;
}
/** Immutable content identity; never a filesystem path, URL or an authority to read it. */
export interface ContentRefV2 { readonly contentId: string; readonly contentVersion: number }
export type VersionedEntityKindV2 = "claim" | "hypothesis" | "episode" | "procedure" | "artifact";
export interface VersionRefV2<K extends VersionedEntityKindV2 = VersionedEntityKindV2> {
  readonly kind: K; readonly id: string; readonly version: number;
}
/** Existing TaskAttempt has no aggregate revision of its own. */
export interface TaskAttemptRefV2 { readonly taskId: string; readonly attemptId: string; readonly intentRevision: number }
/** Content version and aggregate revision are intentionally different coordinates. */
export interface ClaimVersionRefV2 { readonly claimId: string; readonly version: number }
export interface EvidenceRefV2 {
  readonly source: EntityRefV2<"observation">;
  readonly scope: ScopeV2;
  readonly privacy: PrivacyV2;
  readonly sourceTrust: SourceTrustV2;
  readonly role: "supports" | "refutes";
  readonly observedAt: IsoTimestamp;
  readonly fragmentId?: string;
}
export interface CognitionMetadataV2 {
  readonly schemaVersion: 2;
  readonly id: string;
  /** Aggregate CAS revision advances for content and lifecycle changes; never below content version. */
  readonly revision: number;
  readonly scope: ScopeV2;
  readonly privacy: PrivacyV2;
  readonly sourceTrust: SourceTrustV2;
  readonly createdAt: IsoTimestamp;
  readonly updatedAt: IsoTimestamp;
}
export type ClaimKindV2 = "fact" | "preference" | "constraint" | "decision";
export type CandidateStatusV2 = "PENDING" | "ACCEPTED" | "REJECTED" | "EXPIRED";
export type ClaimStatusV2 = "ACTIVE" | "SUPERSEDED" | "DISPUTED" | "EXPIRED" | "FORGOTTEN";
export type HypothesisStatusV2 = "OPEN" | "SUPPORTED" | "REFUTED" | "EXPIRED" | "WITHDRAWN";
export type GoalStatusV2 = "PROPOSED" | "ACTIVE" | "PAUSED" | "ACHIEVED" | "ABANDONED";
export type ProcedureStatusV2 = "CANDIDATE" | "TRIAL" | "ACTIVE" | "SUSPENDED" | "RETIRED";
export interface MemoryCandidateV2 extends CognitionMetadataV2 {
  readonly kind: ClaimKindV2;
  readonly statement: string;
  readonly epistemic: EpistemicV2;
  readonly confidence: number;
  readonly evidence: readonly EvidenceRefV2[];
  readonly extractor: EntityRefV2<"extractor">;
  readonly status: CandidateStatusV2;
  readonly validFrom: IsoTimestamp;
  readonly validUntil?: IsoTimestamp;
  readonly expiresAt: IsoTimestamp;
  readonly acceptedClaim?: ClaimVersionRefV2;
}
export interface MemoryClaimV2 extends CognitionMetadataV2 {
  readonly version: number;
  readonly kind: ClaimKindV2;
  readonly statement: string;
  readonly epistemic: Exclude<EpistemicV2, "inferred">;
  readonly evidence: readonly EvidenceRefV2[];
  readonly status: ClaimStatusV2;
  readonly validFrom: IsoTimestamp;
  readonly validUntil?: IsoTimestamp;
  readonly supersedes?: ClaimVersionRefV2;
  readonly supersededBy?: ClaimVersionRefV2;
}
export interface HypothesisV2 extends CognitionMetadataV2 {
  readonly version: number;
  readonly epistemic: "inferred";
  readonly proposition: string;
  readonly evidence: readonly EvidenceRefV2[];
  readonly alternatives: readonly string[];
  readonly verificationQuestions: readonly string[];
  readonly expiresAt: IsoTimestamp;
  readonly status: HypothesisStatusV2;
}
export interface GoalV2 extends CognitionMetadataV2 {
  readonly intent: string;
  readonly criteria: readonly AcceptanceCriterion[];
  readonly priority: "low" | "normal" | "high";
  readonly deadline?: IsoTimestamp;
  readonly confirmation: EvidenceRefV2;
  readonly status: GoalStatusV2;
}
export interface EpisodeV2 extends CognitionMetadataV2 {
  readonly version: number;
  readonly task: EntityRefV2<"task">;
  readonly taskAttempt: TaskAttemptRefV2;
  readonly goal?: EntityRefV2<"goal">;
  readonly intent: TaskIntent;
  readonly startedAt: IsoTimestamp;
  readonly endedAt: IsoTimestamp;
  readonly contextDifferences: readonly string[];
  readonly actions: readonly EntityRefV2<"action">[];
  readonly artifacts: readonly VersionRefV2<"artifact">[];
  readonly outcome: EntityRefV2<"outcome">;
  readonly outcomeStatus: OutcomeStatus;
  readonly unresolved: readonly string[];
  readonly evidence: readonly EvidenceRefV2[];
  readonly summary?: Readonly<{ text: string; sourceRefs: readonly (EntityRefV2 | VersionRefV2)[]; generatorRevision: number }>;
}
export interface WorkingStateV2 extends CognitionMetadataV2 {
  readonly task: EntityRefV2<"task">;
  readonly taskAttempt: TaskAttemptRefV2;
  readonly intentRevision: number;
  readonly currentStep: string;
  readonly known: readonly string[];
  readonly unknown: readonly string[];
  readonly pendingInput: readonly string[];
  readonly nextSteps: readonly string[];
  readonly evidence: readonly EvidenceRefV2[];
}
export interface ProcedureStepV2 {
  readonly id: string;
  readonly instruction: string;
  readonly checks: readonly string[];
  readonly onFailure: string;
}
/** Describes a recommendation, never executable code, tool grants or P2 promotion logic. */
export interface ProcedureV2 extends CognitionMetadataV2 {
  readonly version: number;
  readonly category: string;
  readonly prerequisites: readonly string[];
  readonly requiredCapabilities: readonly string[];
  readonly steps: readonly ProcedureStepV2[];
  readonly validators: readonly EntityRefV2<"validator">[];
  readonly failureConditions: readonly string[];
  readonly prohibitedActions: readonly string[];
  readonly expectedBenefits: readonly string[];
  readonly evidence: readonly EvidenceRefV2[];
  readonly sourceEpisodes: readonly VersionRefV2<"episode">[];
  readonly trialStatistics: Readonly<{
    attempts: number; tasks: number; verifiable: number; adoptedVerified: number;
    succeeded: number; failed: number; cancelled: number; unknown: number;
  }>;
  readonly status: ProcedureStatusV2;
  readonly previousActiveVersion?: number;
}
