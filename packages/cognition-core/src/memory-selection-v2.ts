import { isScopeWithinV2, type ClaimKindV2, type MemoryClaimV2, type ScopeV2 } from "../../domain/src/index.ts";

export interface MemorySelectionV2 {
  readonly scope: ScopeV2;
  readonly audience: "user" | "model";
  readonly validAt: string;
  readonly knownAt: string;
  readonly kinds: readonly ClaimKindV2[];
}

/** Storage supplies exact, available, source-checked snapshots. This function does
 * not authenticate a caller, retrieve a body, or authorize a model transmission. */
export function qualifyMemoryClaimV2(claim: MemoryClaimV2, input: MemorySelectionV2):
  "eligible" | "scope" | "privacy" | "state" | "time" | "kind" {
  if (!isScopeWithinV2(claim.scope, input.scope)) return "scope";
  if (input.audience === "model" && claim.privacy === "local-only") return "privacy";
  if (claim.status !== "ACTIVE") return "state";
  if (claim.createdAt > input.knownAt || claim.validFrom > input.validAt
    || (claim.validUntil !== undefined && claim.validUntil <= input.validAt)) return "time";
  if (!input.kinds.includes(claim.kind)) return "kind";
  return "eligible";
}
