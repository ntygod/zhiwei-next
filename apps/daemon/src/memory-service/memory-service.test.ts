import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { MemoryClaimV2, PrivacyV2, ScopeV2 } from "../../../../packages/domain/src/index.ts";
import type { LocalApiMemorySearchV1 } from "../../../../packages/protocol/src/index.ts";
import { openSyntheticCognitionStoreV2, type MemoryCommandV1 } from "../../../../packages/memory-store/src/index.ts";
import { reduceExplicitMemory, qualifiesExplicitMemory } from "./memory-rules.ts";
import { createSyntheticTaskSessionHarness } from "../task-service/synthetic-harness.ts";

const context = { principalId: "synthetic-principal-a", workspaceId: "synthetic-workspace-a" };
const scope: ScopeV2 = { kind: "workspace", workspaceId: context.workspaceId };
const otherContext = { principalId: "synthetic-principal-b", workspaceId: "synthetic-workspace-b" };
const otherScope: ScopeV2 = { kind: "workspace", workspaceId: otherContext.workspaceId };
const T0 = "2026-10-11T00:00:00.000Z", T1 = "2026-10-11T01:00:00.000Z", T2 = "2026-10-11T02:00:00.000Z";
const text = "SYNTHETIC_ONLY：虚构灯塔使用紫色报告。";
type RememberCommand = MemoryCommandV1 & Readonly<{ payload: Extract<MemoryCommandV1["payload"], { kind: "memory.remember" }> }>;
function fixture(t: TestContext) {
  const root = mkdtempSync(join(tmpdir(), "zhiwei-memory-service-")), dataRoot = join(root, "data"), controlRoot = join(root, "control"); mkdirSync(dataRoot);
  let now = T0;
  const options = { dataRoot, controlRoot, installationId: "synthetic-memory-installation", clock: { now: () => now },
    memoryPersistence: { ids: { next: () => randomUUID() }, contentPolicy: { privacy: "model-allowed" as const, retentionUntil: "2026-11-11T00:00:00.000Z" }, reduce: reduceExplicitMemory, qualifies: qualifiesExplicitMemory } };
  let store = openSyntheticCognitionStoreV2({ ...options, mode: "create" }); store.registerScope(scope); store.registerScope(otherScope);
  t.after(() => { try { store.close(); } finally { rmSync(root, { recursive: true, force: true }); } });
  return { get store() { return store; }, time(at: string) { now = at; }, reopen() { store.close(); store = openSyntheticCognitionStoreV2({ ...options, mode: "open" }); },
    remember(statement = text, privacy: PrivacyV2 = "model-allowed", validUntil?: string) {
      const inputId = randomUUID(), evidence = store.memories.capture(context, { schemaVersion: 1, commandId: inputId, idempotencyKey: inputId, workspaceId: context.workspaceId, scope, privacy, text: statement }).evidence;
      const id = randomUUID(), command: RememberCommand = { schemaVersion: 1, commandId: id, idempotencyKey: id, workspaceId: context.workspaceId, expectedRevision: 0,
        payload: { kind: "memory.remember", scope, privacy, claimKind: "fact", statement, evidenceRefs: [evidence], validFrom: now, ...(validUntil ? { validUntil } : {}) } };
      const receipt = store.memories.execute(context, command); return { command, receipt, id: receipt.receipt.aggregate.id };
    }, search(query = "虚构灯塔", extra: Partial<LocalApiMemorySearchV1> = {}, audience: "user" | "model" = "user") {
      return store.memories.search(context, { schemaVersion: 1, scope, query, kinds: ["fact"], limit: 10, ...extra }, audience);
    } };
}
function update(claim: MemoryClaimV2, payload: MemoryCommandV1["payload"]): MemoryCommandV1 {
  const id = randomUUID(); return { schemaVersion: 1, commandId: id, idempotencyKey: id, workspaceId: context.workspaceId, expectedRevision: claim.revision, payload };
}
function target(claim: MemoryClaimV2) { return { targetRef: { kind: "claim" as const, id: claim.id, revision: claim.revision }, targetVersion: { claimId: claim.id, version: claim.version }, scope: claim.scope }; }

test("Explicit input → remember → correct → dispute → forget persists exact history and receipts across restart", t => {
  const f = fixture(t), saved = f.remember();
  assert.equal(f.search().ranking.method, "fts5-trigram"); assert.equal(f.search("灯塔").material.length, 1);
  assert.ok(f.store.memories.explain(context, scope, saved.id).sources.some(source => source.excerpt === text));
  f.reopen(); assert.equal(f.search().material[0]!.claim.id, saved.id);
  assert.deepEqual(f.store.memories.execute(context, { ...saved.command, commandId: randomUUID() }), { ...saved.receipt, replay: true });
  const original = f.search().material[0]!.claim; f.time(T1);
  const correction = update(original, { kind: "memory.correct", ...target(original), privacy: original.privacy, claimKind: original.kind,
    statement: "SYNTHETIC_ONLY：虚构灯塔使用琥珀色报告。", evidenceRefs: [original.evidence[0]!], validFrom: T0 });
  f.store.memories.execute(context, correction);
  assert.equal(f.search("紫色").material.length, 0); assert.equal(f.search("琥珀色").material[0]!.claim.version, 2);
  const historical = f.search("紫色", { knownAt: T0, validAt: T0 }).material[0]!;
  assert.equal(historical.claim.status, "ACTIVE"); assert.equal(historical.currentStatus, "SUPERSEDED"); assert.equal(historical.historical, true);
  assert.equal(f.store.memories.explain(context, scope, saved.id, 1).value!.status, "SUPERSEDED");
  assert.throws(() => f.store.memories.execute(context, { ...correction, commandId: randomUUID(), idempotencyKey: randomUUID() }), { code: "revision_conflict" });
  const corrected = f.search().material[0]!.claim; f.time(T2);
  f.store.memories.execute(context, update(corrected, { kind: "memory.dispute", ...target(corrected), reason: "SYNTHETIC_ONLY：需要核对新的颜色。", evidenceRefs: [] }));
  assert.equal(f.search().material.length, 0);
  const disputed = f.store.memories.explain(context, scope, saved.id).value!; assert.equal(disputed.status, "DISPUTED");
  assert.ok(f.store.memories.explain(context, scope, saved.id).sources.some(source => source.excerpt?.includes("需要核对")));
  const forgetting = update(disputed, { kind: "memory.forget", ...target(disputed), mode: "logical" });
  const forgotten = f.store.memories.execute(context, forgetting); f.reopen();
  assert.deepEqual(f.store.memories.execute(context, forgetting), { ...forgotten, replay: true });
  assert.equal(f.search().material.length, 0); assert.equal(f.search("琥珀色", { knownAt: T1, validAt: T1 }).material.length, 0);
  const explanation = f.store.memories.explain(context, scope, saved.id);
  assert.equal(explanation.value, undefined); assert.equal(explanation.versions[0]!.status, "FORGOTTEN");
  assert.throws(() => f.store.memories.execute(context, correction), { code: "unavailable" });
});

test("Scope, current privacy, source availability and dual time qualify material before ranking", t => {
  const f = fixture(t), saved = f.remember(text, "model-allowed", T1);
  assert.equal(f.search().material.length, 1);
  assert.equal(f.store.memories.search(otherContext, { schemaVersion: 1, scope: otherScope, query: "虚构灯塔", kinds: ["fact"], limit: 10 }).material.length, 0);
  assert.throws(() => f.store.memories.explain(otherContext, otherScope, saved.id), { code: "unavailable" });
  const blocked = f.remember("SYNTHETIC_ONLY：虚构卫星使用绿色报告。"), blockedClaim = f.search("虚构卫星").material[0]!.claim;
  const blockedSource = f.store.listObservations(scope).find(event => event.id === blockedClaim.evidence[0]!.source.id)!;
  f.store.applyControlIntent({ kind: "SOURCE_SUPPRESS", operationId: randomUUID(), at: T0, authorization: "synthetic-user-request", scope,
    bindingId: blockedSource.source.streamId, resourceId: "synthetic-input-source" });
  assert.equal(f.search("虚构卫星").material.length, 0); assert.equal(f.store.memories.explain(context, scope, blocked.id).value, undefined);
  assert.equal(f.store.memories.explain(context, scope, blocked.id).unavailableReason, "source-unavailable");
  const original = f.search().material[0]!.claim;
  f.store.applyControlIntent({ kind: "PRIVACY_RESTRICT", operationId: randomUUID(), at: T0, authorization: "synthetic-user-request",
    privacy: "local-only", targets: [{ kind: "observation", scope, id: original.evidence[0]!.source.id }] });
  assert.equal(f.search().material[0]!.claim.privacy, "local-only"); assert.equal(f.search("虚构灯塔", {}, "model").material.length, 0);
  f.time(T2); assert.equal(f.search().material.length, 0);
  assert.equal(f.search("虚构灯塔", { validAt: T0, knownAt: T0 }).material.length, 1);
  f.store.applyControlIntent({ kind: "FORGET", operationId: randomUUID(), at: T2, authorization: "synthetic-user-request", targets: [{ kind: "observation", scope, id: original.evidence[0]!.source.id }] });
  assert.equal(f.search("虚构灯塔", { validAt: T0, knownAt: T0 }).material.length, 0);
});

test("Rejected source/idempotency conflicts leave no usable claim or partial receipt", t => {
  const f = fixture(t), saved = f.remember();
  assert.throws(() => f.store.memories.execute(context, { ...saved.command, payload: { ...saved.command.payload, statement: "SYNTHETIC_ONLY：不同内容" } } as MemoryCommandV1), { code: "conflict" });
  assert.throws(() => f.store.memories.execute(context, { ...saved.command, commandId: randomUUID(), idempotencyKey: randomUUID(),
    payload: { ...saved.command.payload, evidenceRefs: [{ ...saved.command.payload.evidenceRefs[0]!, source: { kind: "observation", id: "missing-synthetic-source", revision: 1 } }] } }), { code: "unavailable" });
  f.reopen(); assert.equal(f.search().material.length, 1); assert.equal(f.search().material[0]!.claim.id, saved.id);
});

test("A committed forget whose receipt was interrupted resumes the same control intent after reopen", t => {
  const f = fixture(t), saved = f.remember(), claim = f.search().material[0]!.claim;
  const command = update(claim, { kind: "memory.forget", ...target(claim), mode: "logical" });
  const apply = f.store.applyControlIntent.bind(f.store);
  f.store.applyControlIntent = intent => { apply(intent); throw new Error("Synthetic interruption after logical commit."); };
  assert.throws(() => f.store.memories.execute(context, command));
  f.time(T1); f.reopen(); assert.equal(f.search().material.length, 0);
  const result = f.store.memories.execute(context, command); assert.equal(result.claimVersion, claim.version);
  assert.equal(f.store.memories.explain(context, scope, saved.id).versions[0]!.status, "FORGOTTEN");
  assert.deepEqual(f.store.memories.execute(context, command), { ...result, replay: true });
});

test("Paired HTTP memory routes commit real temporary storage and expose opaque scoped cursors", async t => {
  const h = await createSyntheticTaskSessionHarness(); t.after(() => h.close()); const origin = await h.api.listen();
  const pair = await fetch(`${origin}/v1/pair`, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ schemaVersion: 1, bootstrapCode: h.api.issuePairingCode("cli"), clientKind: "cli", clientNonce: "x".repeat(43) }) });
  assert.equal(pair.status, 200); const paired = await pair.json() as { credential: string };
  const call = (path: string, body: unknown) => fetch(origin + path, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${paired.credential}` }, body: JSON.stringify(body) });
  const id = randomUUID(), input = await call("/v1/memory/inputs", { schemaVersion: 1, commandId: id, idempotencyKey: id, workspaceId: context.workspaceId, scope, privacy: "local-only", text });
  assert.equal(input.status, 201); const captured = await input.json() as { evidence: MemoryClaimV2["evidence"][number]; asOfCursor: string };
  assert.equal(typeof captured.asOfCursor, "string");
  const commandId = randomUUID(), remembered = await call("/v1/memory/commands", { schemaVersion: 1, commandId, idempotencyKey: commandId, workspaceId: context.workspaceId, expectedRevision: 0,
    payload: { kind: "memory.remember", scope, privacy: "local-only", claimKind: "fact", statement: text, evidenceRefs: [captured.evidence], validFrom: new Date().toISOString() } });
  assert.equal(remembered.status, 200); const receipt = await remembered.json() as { aggregate: { id: string }; eventCursor: string };
  const searched = await call("/v1/memory/search", { schemaVersion: 1, scope, query: "虚构灯塔", kinds: ["fact"], limit: 10 }); assert.equal(searched.status, 200);
  const page = await searched.json() as { material: { claim: MemoryClaimV2 }[]; commitCursor?: number; asOfCursor: string };
  assert.equal(page.material[0]!.claim.id, receipt.aggregate.id); assert.equal(page.commitCursor, undefined); assert.equal(typeof page.asOfCursor, "string");
  assert.equal((await call("/v1/memory/explain", { schemaVersion: 1, workspaceId: context.workspaceId, scope, claimId: receipt.aggregate.id })).status, 200);
  const cross = await call("/v1/memory/search", { schemaVersion: 1, scope: otherScope, query: "虚构灯塔", kinds: ["fact"], limit: 10 }); assert.equal(cross.status, 404);
  const forgotten = await call("/v1/memory/commands", update(page.material[0]!.claim, { kind: "memory.forget", ...target(page.material[0]!.claim), mode: "logical" })); assert.equal(forgotten.status, 200);
  await h.restart(); assert.equal(h.memories.search(context, { schemaVersion: 1, scope, query: "虚构灯塔", kinds: ["fact"], limit: 10 }).material.length, 0);
});
