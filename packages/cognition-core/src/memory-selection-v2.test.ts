import assert from "node:assert/strict";
import test from "node:test";
import { qualifyMemoryClaimV2, type MemorySelectionV2 } from "./memory-selection-v2.ts";
import type { MemoryClaimV2 } from "../../domain/src/index.ts";

const now = "2026-10-11T00:00:00.000Z";
const claim: MemoryClaimV2 = { schemaVersion: 2, id: "synthetic-memory", revision: 1, version: 1, kind: "constraint",
  statement: "预算上限为8万元", scope: { kind: "workspace", workspaceId: "synthetic-a" }, privacy: "model-allowed",
  sourceTrust: "user-direct", epistemic: "asserted", status: "ACTIVE", validFrom: now, createdAt: now, updatedAt: now,
  evidence: [{ source: { kind: "observation", id: "synthetic-input", revision: 1 }, scope: { kind: "workspace", workspaceId: "synthetic-a" },
    privacy: "model-allowed", sourceTrust: "user-direct", role: "supports", observedAt: now }] };
const query: MemorySelectionV2 = { scope: claim.scope, audience: "user", kinds: ["constraint"], validAt: now, knownAt: now };

test("memory qualification checks scope and privacy before downstream ranking", () => {
  assert.equal(qualifyMemoryClaimV2(claim, query), "eligible");
  assert.equal(qualifyMemoryClaimV2(claim, { ...query, scope: { kind: "workspace", workspaceId: "synthetic-b" } }), "scope");
  assert.equal(qualifyMemoryClaimV2({ ...claim, privacy: "local-only" }, { ...query, audience: "model" }), "privacy");
  assert.equal(qualifyMemoryClaimV2({ ...claim, privacy: "local-only" }, query), "eligible");
});
test("superseded, disputed and forgotten material is excluded from normal memory use", () => {
  for (const status of ["SUPERSEDED", "DISPUTED", "EXPIRED", "FORGOTTEN"] as const)
    assert.equal(qualifyMemoryClaimV2({ ...claim, status }, query), "state");
});
test("valid and known time boundaries are exclusive at expiry and do not mutate snapshots", () => {
  const before = structuredClone(claim);
  assert.equal(qualifyMemoryClaimV2({ ...claim, validUntil: now }, query), "time");
  assert.equal(qualifyMemoryClaimV2({ ...claim, validFrom: "2026-10-12T00:00:00.000Z" }, query), "time");
  assert.equal(qualifyMemoryClaimV2(claim, { ...query, knownAt: "2026-10-10T00:00:00.000Z" }), "time");
  assert.equal(qualifyMemoryClaimV2(claim, { ...query, kinds: ["fact"] }), "kind");
  assert.deepEqual(claim, before);
});
