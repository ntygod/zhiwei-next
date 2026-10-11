import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { randomUUID } from "node:crypto";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { ScopeV2, PrivacyV2, MemoryClaimV2 } from "../../../../packages/domain/src/index.ts";
import { parseLocalApiCommandV1, type SessionContractV1 } from "../../../../packages/protocol/src/index.ts";
import { openSyntheticCognitionStoreV2, type TaskStoreContextV1, type ContextPersistenceBoundaryV1, type MemoryCommandV1 } from "../../../../packages/memory-store/src/index.ts";
import { compileCognitiveContextV1 } from "../../../../packages/context-compiler/src/index.ts";
import { reducePersistentTask } from "./task-reducer.ts";
import { reduceExplicitMemory, qualifiesExplicitMemory } from "../memory-service/memory-rules.ts";
import { syntheticContextBoundaryV1, syntheticContextCounterV1 } from "./synthetic-context-boundary.ts";

const T0 = "2026-10-11T00:00:00.000Z", T1 = "2026-10-11T01:00:00.000Z";
const context: TaskStoreContextV1 = { principalId: "synthetic-owner", workspaceId: "synthetic-context-workspace", daemonInstanceId: "synthetic-daemon", ownerEpoch: 1 };
const scope: ScopeV2 = { kind: "workspace", workspaceId: context.workspaceId };
const contract: SessionContractV1 = { schemaVersion: 1, runtimeProfile: { id: "runtime-test", revision: 1 }, modelProfile: { id: "synthetic-v1", revision: 1 }, toolProfile: { id: "none", revision: 1 }, policyProfile: { id: "policy-test", revision: 1 }, dataProfile: { id: "data-test", revision: 1 }, compilerProfile: { id: "compiler-test", revision: 1 }, interactionKind: "interactive" };
function fixture(t: TestContext, boundary = syntheticContextBoundaryV1) {
  const root = mkdtempSync(join(tmpdir(), "zhiwei-context-normal-")), dataRoot = join(root, "data"), controlRoot = join(root, "control"); mkdirSync(dataRoot);
  let now = T0;
  const options = { dataRoot, controlRoot, installationId: "synthetic-context-installation", clock: { now: () => now },
    taskPersistence: { daemonInstanceId: context.daemonInstanceId, ids: { next: () => randomUUID() }, contentPolicy: { privacy: "model-allowed" as const, retentionUntil: "2026-11-11T00:00:00.000Z" }, reduce: reducePersistentTask },
    memoryPersistence: { ids: { next: () => randomUUID() }, contentPolicy: { privacy: "model-allowed" as const, retentionUntil: "2026-11-11T00:00:00.000Z" }, reduce: reduceExplicitMemory, qualifies: qualifiesExplicitMemory }, contextPersistence: boundary };
  let store = openSyntheticCognitionStoreV2({ ...options, mode: "create" }); store.registerScope(scope);
  t.after(() => { try { store.close(); } finally { rmSync(root, { recursive: true, force: true }); } });
  const sessionId = store.tasks.createSession(context, { schemaVersion: 1, commandId: randomUUID(), idempotencyKey: randomUUID(), workspaceId: context.workspaceId, expectedRevision: 0, payload: { kind: "session.create", contract } }).receipt.aggregate.id;
  const taskId = store.tasks.executeTask(context, parseLocalApiCommandV1({ schemaVersion: 1, commandId: randomUUID(), idempotencyKey: randomUUID(), workspaceId: context.workspaceId, expectedRevision: 0,
    payload: { kind: "task.create", sessionId, executionProfile: contract.runtimeProfile, request: "SYNTHETIC_ONLY：按照灯塔要求准备报告", constraints: ["只使用虚构输入"], acceptanceChecks: [{ id: "synthetic-check", revision: 1, description: "人工稍后核对报告", required: true, method: "user-confirmation" }] } })).receipt.aggregate.id;
  return { dataRoot, taskId, sessionId, get store() { return store; }, time(at: string) { now = at; }, reopen() { store.close(); store = openSyntheticCognitionStoreV2({ ...options, mode: "open" }); },
    otherSession() { return store.tasks.createSession(context, { schemaVersion: 1, commandId: randomUUID(), idempotencyKey: randomUUID(), workspaceId: context.workspaceId, expectedRevision: 0, payload: { kind: "session.create", contract } }).receipt.aggregate.id; },
    otherTask() { return store.tasks.executeTask(context, parseLocalApiCommandV1({ schemaVersion: 1, commandId: randomUUID(), idempotencyKey: randomUUID(), workspaceId: context.workspaceId, expectedRevision: 0,
      payload: { kind: "task.create", sessionId, executionProfile: contract.runtimeProfile, request: "SYNTHETIC_ONLY：另一个灯塔任务", constraints: [], acceptanceChecks: [{ id: "synthetic-other-check", revision: 1, description: "人工核对", required: true, method: "user-confirmation" }] } })).receipt.aggregate.id; },
    prepare(id: string = randomUUID(), requiredClaims: readonly { claimId: string; version: number }[] = []) { return store.contexts.prepare(context, { id, taskId, expectedRevision: store.tasks.getTask(context.workspaceId, taskId).value!.revision, query: "灯塔", requiredClaims }); },
    remember(statement = "SYNTHETIC_ONLY：灯塔报告采用紫色。", privacy: PrivacyV2 = "model-allowed", targetScope = scope, validUntil?: string) {
      store.registerScope(targetScope); const owner = { principalId: context.principalId, workspaceId: targetScope.kind === "global" ? context.workspaceId : targetScope.workspaceId };
      const id = randomUUID(), evidence = store.memories.capture(owner, { schemaVersion: 1, commandId: id, idempotencyKey: id, workspaceId: owner.workspaceId, scope: targetScope, privacy, text: statement }).evidence;
      const commandId = randomUUID(), receipt = store.memories.execute(owner, { schemaVersion: 1, commandId, idempotencyKey: commandId, workspaceId: owner.workspaceId, expectedRevision: 0,
        payload: { kind: "memory.remember", scope: targetScope, privacy, claimKind: "preference", statement, evidenceRefs: [evidence], validFrom: now, ...(validUntil ? { validUntil } : {}) } });
      return store.memories.explain(owner, targetScope, receipt.receipt.aggregate.id).value!;
    } };
}
function change(claim: MemoryClaimV2, payload: MemoryCommandV1["payload"]): MemoryCommandV1 {
  const id = randomUUID(); return { schemaVersion: 1, commandId: id, idempotencyKey: id, workspaceId: context.workspaceId, expectedRevision: claim.revision, payload };
}
function target(claim: MemoryClaimV2) { return { scope: claim.scope, targetRef: { kind: "claim" as const, id: claim.id, revision: claim.revision }, targetVersion: { claimId: claim.id, version: claim.version } }; }

test("one current view commits an immutable attributed capsule and exact Runtime input atomically", t => {
  const f = fixture(t), memory = f.remember(), saved = f.prepare();
  assert.deepEqual(saved.capsule.report.selected.map(item => item.ref), [{ kind: "claim", id: memory.id, revision: memory.revision, version: memory.version }]);
  assert.equal(saved.runtimeInput.snapshot.text, saved.capsule.rendering.fullText); assert.match(saved.capsule.rendering.fullText, /紫色/);
  f.store.contexts.assertCurrent(context, saved.capsule.id);
  const mutated = structuredClone(saved); (mutated.capsule.report.selected as unknown[]).length = 0;
  assert.equal(f.store.contexts.read(context.workspaceId, f.taskId, saved.capsule.id).capsule.report.selected.length, 1);
  f.reopen(); assert.deepEqual(f.store.contexts.read(context.workspaceId, f.taskId, saved.capsule.id), saved);
  const replay = f.prepare(saved.capsule.id); assert.equal(replay.runtimeInput.replay, true); assert.equal(replay.runtimeInput.snapshot.id, saved.runtimeInput.snapshot.id);
  const db = new DatabaseSync(join(f.dataRoot, "product.sqlite")); try {
    assert.equal(db.prepare("PRAGMA journal_mode").get()!.journal_mode, "wal"); assert.equal(db.prepare("PRAGMA integrity_check").get()!.integrity_check, "ok"); assert.equal(db.prepare("PRAGMA user_version").get()!.user_version, 5);
    assert.ok(db.prepare("SELECT 1 FROM task_content_dependency_v1 WHERE source_id=? AND target_id=?").get(saved.contentRef.contentId, saved.runtimeInput.contentRef.contentId));
  } finally { db.close(); }
});
test("hidden, expired and other Task/Session/Workspace material never reaches the compiler or counter", t => {
  const counted: string[] = [], hydrated: string[] = [];
  const boundary: ContextPersistenceBoundaryV1 = { ...syntheticContextBoundaryV1, compile: input => {
    hydrated.push(...input.claims.map(item => item.statement));
    return compileCognitiveContextV1({ ...input, scope, budget: syntheticContextBoundaryV1.budget, counter: { ...syntheticContextCounterV1, count: text => { counted.push(text); return syntheticContextCounterV1.count(text); } } });
  } };
  const f = fixture(t, boundary); f.remember();
  f.remember("SYNTHETIC_ONLY：灯塔 hidden-private", "local-only"); f.remember("SYNTHETIC_ONLY：灯塔 hidden-expired", "model-allowed", scope, T1);
  f.remember("SYNTHETIC_ONLY：灯塔 hidden-task", "model-allowed", { kind: "task", workspaceId: context.workspaceId, taskId: f.otherTask() });
  f.remember("SYNTHETIC_ONLY：灯塔 hidden-session", "model-allowed", { kind: "session", workspaceId: context.workspaceId, sessionId: f.otherSession() });
  f.remember("SYNTHETIC_ONLY：灯塔 hidden-workspace", "model-allowed", { kind: "workspace", workspaceId: "other-workspace" });
  f.time(T1); const saved = f.prepare(); assert.equal(saved.capsule.report.selected.length, 1);
  assert.ok(hydrated.length > 0); assert.ok(counted.length > 0); assert.ok([...hydrated, ...counted, saved.runtimeInput.snapshot.text].every(text => !text.includes("hidden-")));
});
test("correction rejects the earlier read-set and a new capsule carries only the current exact version", t => {
  const f = fixture(t), memory = f.remember(), saved = f.prepare(); f.time(T1);
  f.store.memories.execute(context, change(memory, { kind: "memory.correct", ...target(memory), privacy: memory.privacy, claimKind: memory.kind,
    statement: "SYNTHETIC_ONLY：灯塔报告采用琥珀色。", evidenceRefs: [memory.evidence[0]!], validFrom: T0 }));
  assert.throws(() => f.store.contexts.assertCurrent(context, saved.capsule.id), { code: "revision_conflict" });
  const next = f.prepare(); assert.equal(next.capsule.report.selected[0]!.ref.version, 2); assert.match(next.runtimeInput.snapshot.text, /琥珀色/); assert.ok(!next.runtimeInput.snapshot.text.includes("紫色"));
});
test("normal explicit forget revokes derived capsule and Runtime input through their body dependencies", t => {
  const f = fixture(t), memory = f.remember(), saved = f.prepare();
  f.store.memories.execute(context, change(memory, { kind: "memory.forget", ...target(memory), mode: "logical" }));
  assert.throws(() => f.store.contexts.assertCurrent(context, saved.capsule.id), { code: "unavailable" });
  assert.throws(() => f.store.contexts.read(context.workspaceId, f.taskId, saved.capsule.id), { code: "unavailable" });
  f.reopen(); assert.throws(() => f.store.contexts.read(context.workspaceId, f.taskId, saved.capsule.id), { code: "unavailable" });
});
test("required budget failure commits neither capsule nor Runtime input", t => {
  const f = fixture(t), memories = ["紫色", "橙色", "绿色"].map(color => f.remember(`SYNTHETIC_ONLY：灯塔${color.repeat(850)}`)), before = f.store.tasks.snapshot(context.workspaceId);
  assert.throws(() => f.prepare(randomUUID(), memories.map(memory => ({ claimId: memory.id, version: memory.version }))), { code: "budget_exceeded" });
  assert.deepEqual(f.store.tasks.snapshot(context.workspaceId), before);
  const task = f.store.tasks.getTask(context.workspaceId, f.taskId).value!; assert.deepEqual(f.store.tasks.listRuntimeInputs(context.workspaceId, f.taskId, task.attempts.at(-1)!.id).value, []);
});
test("projection corruption is rejected on the next verified read", t => {
  const f = fixture(t); f.remember(); const saved = f.prepare(), db = new DatabaseSync(join(f.dataRoot, "product.sqlite"));
  try { db.prepare("UPDATE context_capsule_v1 SET compiled_at=? WHERE id=?").run(T1, saved.capsule.id); } finally { db.close(); }
  assert.throws(() => f.store.contexts.read(context.workspaceId, f.taskId, saved.capsule.id), { code: "corruption" });
});
