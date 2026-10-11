import type { EvidenceRefV2, MemoryCandidateV2, MemoryClaimV2, ScopeV2 } from "../../domain/src/index.ts";
import type { LocalApiCommandV1, LocalApiMemoryInputV1, LocalApiMemorySearchV1, LocalApiReceiptV1, ObservationV2 } from "../../protocol/src/index.ts";
import type { CognitionFenceV2 } from "./cognitive-store-v2.ts";
import type { MemoryTextSearchV1 } from "./memory-fts-v1.ts";

export interface MemoryContextV1 { readonly principalId: string; readonly workspaceId: string }
export type MemoryCommandV1 = LocalApiCommandV1 & Readonly<{ payload: Extract<LocalApiCommandV1["payload"], { kind: `memory.${string}` }> }>;
export interface MemoryReductionInputV1 {
  readonly command: MemoryCommandV1;
  readonly current?: MemoryClaimV2;
  readonly now: string;
  readonly claimId: string;
  readonly candidateId: string;
  readonly confirmation: EvidenceRefV2;
}
export type MemoryReductionV1 =
  | Readonly<{ kind: "accept"; pending: MemoryCandidateV2; accepted: MemoryCandidateV2; claim: MemoryClaimV2 }>
  | Readonly<{ kind: "dispute"; previous: MemoryClaimV2; current: MemoryClaimV2 }>;
export interface MemoryPersistenceBoundaryV1 {
  readonly ids: { next(kind: "content" | "reservation" | "observation" | "candidate" | "claim" | "event"): string };
  readonly contentPolicy: Readonly<{ privacy: "local-only" | "model-allowed"; retentionUntil: string }>;
  reduce(input: MemoryReductionInputV1): MemoryReductionV1;
  qualifies(claim: MemoryClaimV2, query: LocalApiMemorySearchV1, audience: "user" | "model", now: string): boolean;
}
export interface MemoryCommitV1 {
  readonly receipt: Omit<LocalApiReceiptV1, "eventCursor">;
  readonly claimVersion: number;
  readonly commitCursor: number;
  readonly replay: boolean;
}
export interface MemoryMaterialV1 {
  readonly claim: MemoryClaimV2;
  readonly currentStatus: MemoryClaimV2["status"];
  readonly historical: boolean;
}
export interface MemorySearchReadV1 {
  readonly material: readonly MemoryMaterialV1[];
  readonly ranking: MemoryTextSearchV1;
  readonly fence: CognitionFenceV2;
  readonly commitCursor: number;
}
export interface MemoryVersionInfoV1 {
  readonly version: number; readonly revision: number; readonly status: MemoryClaimV2["status"];
  readonly createdAt: string; readonly updatedAt: string; readonly available: boolean;
}
export interface MemoryExplanationV1 {
  readonly id: string; readonly scope: ScopeV2; readonly currentVersion: number;
  readonly versions: readonly MemoryVersionInfoV1[];
  readonly value?: MemoryClaimV2;
  readonly sources: readonly Readonly<{ observation: ObservationV2; excerpt?: string }>[];
  readonly affected: readonly Readonly<{ kind: string; id: string; version: number }>[];
  readonly commitCursor: number;
}
export interface MemoryPersistenceV1 {
  capture(context: MemoryContextV1, input: LocalApiMemoryInputV1): Readonly<{ evidence: EvidenceRefV2; commitCursor: number; replay: boolean }>;
  execute(context: MemoryContextV1, command: MemoryCommandV1): MemoryCommitV1;
  search(context: MemoryContextV1, query: LocalApiMemorySearchV1, audience?: "user" | "model"): MemorySearchReadV1;
  explain(context: MemoryContextV1, scope: ScopeV2, id: string, version?: number): MemoryExplanationV1;
}
