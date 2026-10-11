import type { EvidenceRefV2, ScopeV2 } from "./cognitive-v2.ts";

/** A derived immutable value. Neither compilation nor this record authorizes a send. */
export interface ContextClaimRefV1 { readonly kind: "claim"; readonly id: string; readonly revision: number; readonly version: number }
export interface ContextBudgetV1 { readonly contextLimit: number; readonly reservedOutput: number; readonly mandatoryProtocolOverhead: number }
export type ContextSelectionReasonV1 = "required" | "selected_by_category" | "selected_by_borrow" | "category_budget" | "memory_budget" | "final_budget";
export interface ContextMaterialSelectionV1 {
  readonly ref: ContextClaimRefV1;
  readonly evidence: readonly EvidenceRefV2[];
  readonly required: boolean;
  readonly reason: ContextSelectionReasonV1;
}
export interface ContextCompilationReportV1 {
  readonly selected: readonly ContextMaterialSelectionV1[];
  /** Only eligible candidates may appear here; hidden material identities are omitted. */
  readonly excluded: readonly Readonly<{ ref: ContextClaimRefV1; reason: ContextSelectionReasonV1 }>[];
  readonly availableInput: number;
  readonly memoryBudget: number;
  readonly baseTokens: number;
  readonly memoryTokens: number;
  readonly inputTokens: number;
}
export interface CognitiveContextCapsuleV1 {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly workspaceId: string;
  readonly sessionId: string;
  readonly taskId: string;
  readonly taskRevision: number;
  readonly attemptId: string;
  readonly intentRevision: number;
  readonly workingState: Readonly<{ id: string; revision: number }>;
  readonly scope: ScopeV2;
  readonly compiledAt: string;
  readonly modelProfile: Readonly<{ id: string; revision: number }>;
  readonly compilerRevision: "cognitive-context-v1";
  readonly rendererRevision: "context-budget-json-lines-v1";
  readonly counter: Readonly<{ id: string; version: string; mode: "exact" }>;
  readonly budget: ContextBudgetV1;
  readonly rendering: Readonly<{ baseText: string; memoryText: string; fullText: string }>;
  readonly report: ContextCompilationReportV1;
}
