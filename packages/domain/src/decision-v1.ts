import type { ContextClaimRefV1 } from "./context-v1.ts";

/** A bounded model proposal. It grants no authority and cannot establish an Outcome. */
interface DecisionBasisV1 {
  readonly schemaVersion: 1;
  readonly summary: string;
  readonly claimRefs: readonly ContextClaimRefV1[];
}
export type CognitiveDecisionV1 = DecisionBasisV1 & (
  | Readonly<{ action: "respond"; text: string }>
  | Readonly<{ action: "clarify"; question: Readonly<{ id: string; prompt: string }> }>
  | Readonly<{ action: "retrieve"; query: string }>
  | Readonly<{ action: "execute"; plan: string }>
  | Readonly<{ action: "wait"; condition: Readonly<{ kind: "user-input"; id: string; description: string }> }>
  | Readonly<{ action: "stop"; reason: "no-progress" | "invalid-decision" | "call-limit" | "unsupported" | "declined" }>
);
export interface CognitiveDecisionInputV1 {
  readonly schemaVersion: 1;
  readonly boundaryId: string;
  readonly ordinal: 1 | 2;
  readonly capsuleId: string;
  readonly task: Readonly<{ id: string; revision: number; attemptId: string; intentRevision: number }>;
  readonly workingState: Readonly<{ id: string; revision: number }>;
  readonly context: string;
  readonly claimRefs: readonly ContextClaimRefV1[];
  readonly capabilities: readonly ("respond" | "clarify" | "retrieve" | "execute" | "wait" | "stop")[];
  readonly unknown: readonly string[];
  readonly remainingCalls: 0 | 1;
  readonly purpose: "initial" | "repair" | "retrieval";
  readonly preparedAt: string;
}
