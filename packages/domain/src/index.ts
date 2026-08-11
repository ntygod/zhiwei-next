export type IsoTimestamp = string;

type Brand<TName extends string> = string & { readonly __brand: TName };

export type WorkspaceId = Brand<"WorkspaceId">;
export type SessionId = Brand<"SessionId">;
export type ObservationId = Brand<"ObservationId">;
export type MemoryCandidateId = Brand<"MemoryCandidateId">;
export type MemoryClaimId = Brand<"MemoryClaimId">;

function branded<T extends string>(value: string, label: string): T {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new Error(`${label} must not be empty`);
  }
  return normalized as T;
}

export const ids = {
  workspace: (value: string) => branded<WorkspaceId>(value, "workspace id"),
  session: (value: string) => branded<SessionId>(value, "session id"),
  observation: (value: string) => branded<ObservationId>(value, "observation id"),
  candidate: (value: string) => branded<MemoryCandidateId>(value, "candidate id"),
  claim: (value: string) => branded<MemoryClaimId>(value, "claim id"),
};

export type ObservationActor = "user" | "assistant" | "tool" | "system" | "connector";
export type ObservationKind =
  | "user_input"
  | "assistant_output"
  | "tool_call"
  | "tool_result"
  | "session_event"
  | "feedback";

export interface Observation {
  readonly id: ObservationId;
  readonly workspaceId?: WorkspaceId;
  readonly sessionId: SessionId;
  readonly actor: ObservationActor;
  readonly kind: ObservationKind;
  readonly payload: unknown;
  readonly occurredAt: IsoTimestamp;
}

export type MemoryKind = "preference" | "constraint" | "decision" | "fact" | "goal" | "procedure";
export type CandidateSourceKind = "user_explicit" | "tool_grounded" | "connector_grounded" | "agent_inferred";
export type CandidateStatus = "pending" | "accepted" | "rejected";

export type MemoryScope =
  | { readonly kind: "global" }
  | { readonly kind: "workspace"; readonly workspaceId: WorkspaceId }
  | { readonly kind: "session"; readonly sessionId: SessionId }
  | { readonly kind: "private"; readonly workspaceId?: WorkspaceId };

export interface MemoryCandidate {
  readonly id: MemoryCandidateId;
  readonly kind: MemoryKind;
  readonly statement: string;
  readonly scope: MemoryScope;
  readonly evidenceIds: readonly ObservationId[];
  readonly confidence: number;
  readonly sourceKind: CandidateSourceKind;
  readonly status: CandidateStatus;
}

export type ClaimStatus = "active" | "superseded" | "disputed" | "expired" | "forgotten";

export interface MemoryClaim {
  readonly id: MemoryClaimId;
  readonly kind: MemoryKind;
  readonly statement: string;
  readonly scope: MemoryScope;
  readonly evidenceIds: readonly ObservationId[];
  readonly confidence: number;
  readonly status: ClaimStatus;
  readonly validFrom: IsoTimestamp;
  readonly validTo?: IsoTimestamp;
  readonly supersedesId?: MemoryClaimId;
  readonly createdAt: IsoTimestamp;
  readonly updatedAt: IsoTimestamp;
}

export function scopeKey(scope: MemoryScope): string {
  if (scope.kind === "global") return "global";
  if (scope.kind === "workspace") return `workspace:${scope.workspaceId}`;
  if (scope.kind === "session") return `session:${scope.sessionId}`;
  return `private:${scope.workspaceId ?? "local"}`;
}

export function assertEvidence(evidenceIds: readonly ObservationId[]): void {
  if (evidenceIds.length === 0) {
    throw new Error("A cognition record must contain at least one evidence id");
  }
}

export function assertConfidence(confidence: number): void {
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new Error("confidence must be between 0 and 1");
  }
}
