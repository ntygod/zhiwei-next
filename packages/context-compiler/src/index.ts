import {
  type IsoTimestamp,
  type MemoryClaim,
  type MemoryClaimId,
  type ObservationId,
  type SessionId,
  type WorkspaceId,
} from "../../domain/src/index.ts";

export interface ContextRequest {
  readonly sessionId: SessionId;
  readonly workspaceId?: WorkspaceId;
  readonly maxClaims: number;
  readonly compiledAt: IsoTimestamp;
}

export interface ContextEntry {
  readonly claimId: MemoryClaimId;
  readonly statement: string;
  readonly evidenceIds: readonly ObservationId[];
  readonly reason: "global-active" | "workspace-active";
}

export interface ContextCapsule {
  readonly sessionId: SessionId;
  readonly workspaceId?: WorkspaceId;
  readonly compiledAt: IsoTimestamp;
  readonly entries: readonly ContextEntry[];
}

const priority = {
  constraint: 0,
  decision: 1,
  goal: 2,
  preference: 3,
  procedure: 4,
  fact: 5,
} as const;

export function compileContext(
  claims: readonly MemoryClaim[],
  request: ContextRequest,
): ContextCapsule {
  if (!Number.isInteger(request.maxClaims) || request.maxClaims < 0) {
    throw new Error("maxClaims must be a non-negative integer");
  }

  const entries = claims
    .filter((claim) => claim.status === "active")
    .filter((claim) => {
      if (claim.scope.kind === "global") return true;
      if (claim.scope.kind === "workspace") {
        return request.workspaceId !== undefined && claim.scope.workspaceId === request.workspaceId;
      }
      return false;
    })
    .sort((left, right) => {
      const byKind = priority[left.kind] - priority[right.kind];
      return byKind !== 0 ? byKind : right.updatedAt.localeCompare(left.updatedAt);
    })
    .slice(0, request.maxClaims)
    .map<ContextEntry>((claim) => ({
      claimId: claim.id,
      statement: claim.statement,
      evidenceIds: claim.evidenceIds,
      reason: claim.scope.kind === "global" ? "global-active" : "workspace-active",
    }));

  return Object.freeze({
    sessionId: request.sessionId,
    workspaceId: request.workspaceId,
    compiledAt: request.compiledAt,
    entries: Object.freeze(entries),
  });
}
