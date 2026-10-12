import assert from "node:assert/strict";
import test, { describe, type TestContext } from "node:test";
import { randomUUID } from "node:crypto";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { setTimeout as delay } from "node:timers/promises";
import type { ScopeV2, PrivacyV2, MemoryClaimV2, CriterionId } from "../../../../packages/domain/src/index.ts";
import { parseLocalApiCommandV1, parseExecutionSpecV1, type SessionContractV1, type SessionCreateCommandV1, type LocalApiCommandV1 } from "../../../../packages/protocol/src/index.ts";
import { openSyntheticCognitionStoreV2, type TaskStoreContextV1, type ContextPersistenceBoundaryV1, type MemoryCommandV1 } from "../../../../packages/memory-store/src/index.ts";
import { compileCognitiveContextV1 } from "../../../../packages/context-compiler/src/index.ts";
import { reducePersistentTask } from "./task-reducer.ts";
import { reduceExplicitMemory, qualifiesExplicitMemory } from "../memory-service/memory-rules.ts";
import { syntheticContextBoundaryV1, syntheticContextCounterV1 } from "./synthetic-context-boundary.ts";
import { createSyntheticDecisionModelV1 } from "./synthetic-decision-model.ts";
import { coordinateCognitiveBoundaryV1 } from "./cognitive-coordinator.ts";
import type { SyntheticDecisionFixtureV1 } from "../infrastructure/controlled-broker.ts";
import { createSyntheticControlledWorkerSupervisor, type SyntheticWorkerSupervisor } from "../runtime/controlled-worker-supervisor.ts";
import { createSyntheticWorkerTestPackage } from "../runtime/controlled-worker-test-fixture.ts";
import { createSyntheticTaskSessionHarness, type SyntheticTaskSessionHarness } from "./synthetic-harness.ts";
import { syntheticTaskPrompt, syntheticTaskSessionContract, syntheticCognitiveTaskSessionContract } from "./application.ts";

const T0 = "2026-10-11T00:00:00.000Z", T1 = "2026-10-11T01:00:00.000Z";
const context: TaskStoreContextV1 = { principalId: "synthetic-owner", workspaceId: "synthetic-context-workspace", daemonInstanceId: "synthetic-daemon", ownerEpoch: 1 };
const scope: ScopeV2 = { kind: "workspace", workspaceId: context.workspaceId };
const contract: SessionContractV1 = { schemaVersion: 1, runtimeProfile: { id: "runtime-test", revision: 1 }, modelProfile: { id: "synthetic-v1", revision: 1 }, toolProfile: { id: "none", revision: 1 }, policyProfile: { id: "policy-test", revision: 1 }, dataProfile: { id: "data-test", revision: 1 }, compilerProfile: { id: "cognitive-context-v1", revision: 1 }, interactionKind: "interactive" };
function fixture(t: TestContext, boundary = syntheticContextBoundaryV1, toolProfile = "none", realTime = false) {
  const root = mkdtempSync(join(tmpdir(), "zhiwei-context-normal-")), dataRoot = join(root, "data"), controlRoot = join(root, "control"); mkdirSync(dataRoot);
  let now = T0;
  const options = { dataRoot, controlRoot, installationId: "synthetic-context-installation", clock: { now: () => realTime ? new Date().toISOString() : now },
    taskPersistence: { daemonInstanceId: context.daemonInstanceId, ids: { next: () => randomUUID() }, runtimeSourceIdentity: { bindingImplementation: "pi", adapter: "pi", implementation: "@earendil-works/pi-coding-agent", version: "0.84.1" }, contentPolicy: { privacy: "model-allowed" as const, retentionUntil: "2026-11-11T00:00:00.000Z" }, reduce: reducePersistentTask },
    memoryPersistence: { ids: { next: () => randomUUID() }, contentPolicy: { privacy: "model-allowed" as const, retentionUntil: "2026-11-11T00:00:00.000Z" }, reduce: reduceExplicitMemory, qualifies: qualifiesExplicitMemory }, contextPersistence: boundary };
  let store = openSyntheticCognitionStoreV2({ ...options, mode: "create" }); store.registerScope(scope);
  t.after(() => { try { store.close(); } finally { rmSync(root, { recursive: true, force: true }); } });
  const sessionId = store.tasks.createSession(context, { schemaVersion: 1, commandId: randomUUID(), idempotencyKey: randomUUID(), workspaceId: context.workspaceId, expectedRevision: 0, payload: { kind: "session.create", contract: { ...contract, toolProfile: { id: toolProfile, revision: 1 } } } }).receipt.aggregate.id;
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
// Each scenario owns its temporary installation and receiver; bound their parallelism.
describe("normal cognitive context and Worker scenarios", { concurrency: 2 }, () => {
test("the cognitive compiler profile rejects raw Runtime input without a committed capsule", t => {
  const f = fixture(t), task = f.store.tasks.getTask(context.workspaceId, f.taskId).value!, id = randomUUID();
  assert.throws(() => f.store.tasks.recordRuntimeInput(context, { commandId: id, idempotencyKey: id, taskId: f.taskId, expectedRevision: task.revision,
    attemptId: task.attempts.at(-1)!.id, intentRevision: task.intent.revision, text: "SYNTHETIC_ONLY: raw input" }), { code: "unsupported" });
  assert.equal(f.store.tasks.listRuntimeInputs(context.workspaceId, f.taskId, task.attempts.at(-1)!.id).value.length, 0);
  assert.equal(f.prepare().runtimeInput.snapshot.kind, "runtime_input");
});
test("Runtime memory tools return only current selected scoped material and actual requests retain it", async t => {
  const f = fixture(t, syntheticContextBoundaryV1, "controlled-read-memory-draft-v1", true), memory = f.remember(), hidden = f.remember("SYNTHETIC_ONLY：灯塔 private-tool-data", "local-only");
  const initial = f.prepare(), port = await model(f, initial, "execute"); t.after(() => port.close());
  const result = await coordinateCognitiveBoundaryV1({ store: () => f.store, context, initial, model: port, ids: { next: randomUUID } });
  const peer = await createSyntheticWorkerTestPackage(); t.after(() => peer.remove());
  const global = f.store.currentFence({ kind: "global" }), workspace = f.store.currentFence(scope), task = f.store.tasks.getTask(context.workspaceId, f.taskId).value!;
  let supervisor: SyntheticWorkerSupervisor | undefined, reads = 0;
  supervisor = await createSyntheticControlledWorkerSupervisor({ packageDirectory: peer.root, nodeExecutable: process.execPath, scenario: "tools", compiledInput: result.context,
    taskIdentity: { executionUnitId: randomUUID(), workspaceId: context.workspaceId, sessionId: f.sessionId, requestSnapshotRef: result.context.runtimeInput.contentRef,
      fence: { installationId: global.installationId, recoveryEpoch: String(global.recoveryEpoch), owner: { kind: "task_attempt", id: initial.capsule.attemptId }, sourceTask: { taskId: f.taskId, attemptId: initial.capsule.attemptId, intentRevision: task.intent.revision }, contractRevision: 1, leaseEpoch: context.ownerEpoch,
        cognition: { global: global.cognitionEpoch, workspace: workspace.cognitionEpoch }, policy: { global: global.policyEpoch, workspace: workspace.policyEpoch }, notAfter: new Date(Date.now() + 60000).toISOString() } },
    beforeSyntheticModelReceive(record) { f.store.executions.recordModelRequest(context, { taskId: f.taskId, bindingId: supervisor!.snapshot().binding.bindingId, requestId: record.requestId, context: record.context, maxTokens: record.maxTokens }); },
    memoryReader: { read() {
      reads++; const input = { capsuleId: initial.capsule.id, bindingId: supervisor!.snapshot().binding.bindingId };
      const rows = f.store.contexts.searchRuntimeMemory(context, { ...input, query: "灯塔" }); assert.deepEqual(rows.map(claim => claim.id), [memory.id]);
      assert.equal(f.store.contexts.inspectRuntimeMemory(context, { ...input, claim: { claimId: memory.id, version: memory.version } }).statement, memory.statement);
      assert.throws(() => f.store.contexts.inspectRuntimeMemory(context, { ...input, claim: { claimId: hidden.id, version: hidden.version } }), { code: "unavailable" });
      return JSON.stringify(rows);
    } },
  }); t.after(() => supervisor!.close());
  f.store.executions.allocateExecution(context, { taskId: f.taskId, expectedRevision: task.revision, spec: supervisor.spec, binding: supervisor.snapshot().binding });
  const binding = await supervisor.runtime.start(supervisor.spec); f.store.executions.markExecutionReady(context, { taskId: f.taskId, binding });
  const ready = f.store.executions.readExecution(context.workspaceId, f.taskId)!, commandId = randomUUID();
  f.store.tasks.executeTask(context, { schemaVersion: 1, commandId, idempotencyKey: commandId, workspaceId: context.workspaceId, expectedRevision: task.revision,
    payload: { kind: "task.runtime", taskId: f.taskId, event: "start", evidenceRefs: [{ id: binding.bindingId, revision: ready.revision }] } });
  const collecting = (async () => { for await (const envelope of supervisor!.runtime.events(binding.bindingId)) {
    f.store.executions.observeExecutionBinding(context, { taskId: f.taskId, binding: supervisor!.snapshot().binding }); f.store.executions.ingestExecutionEvent(context, { taskId: f.taskId, envelope });
    if (envelope.event.stability === "settled") break;
  } })(); void collecting.catch(() => undefined);
  f.store.executions.markExecutionDispatched(context, { taskId: f.taskId, bindingId: binding.bindingId }); await supervisor.runtime.dispatch(binding.bindingId); await collecting;
  const close = await supervisor.runtime.dispose(binding.bindingId); f.store.executions.closeExecution(context, { taskId: f.taskId, evidence: close });
  assert.equal(reads, 1); const requests = f.store.executions.listModelRequests(context.workspaceId, f.taskId, initial.capsule.attemptId);
  assert.equal(requests.length, 4); assert.deepEqual(supervisor.snapshot().broker.modelRequests, supervisor.snapshot().broker.receiverRequests);
  assert.ok(JSON.stringify(requests.at(-1)!.context).includes(memory.id)); assert.ok(!JSON.stringify(requests).includes("private-tool-data"));
  f.reopen(); assert.equal(f.store.executions.listModelRequests(context.workspaceId, f.taskId, initial.capsule.attemptId).length, 4);
});
test("clarify and wait persist pending input; only an exact actual response opens a new boundary", async t => {
  for (const action of ["clarify", "wait"] as const) {
    const f = fixture(t), initial = f.prepare(), scripted = await model(f, initial, action); t.after(() => scripted.close());
    const prior = f.store.tasks.readWorkingState(context.workspaceId, f.taskId).value!;
    const result = await coordinateCognitiveBoundaryV1({ store: () => f.store, context, initial, model: scripted, ids: { next: randomUUID } });
    const decision = result.boundary.decisions.at(-1)!.decision;
    const questionId = decision.action === "clarify" ? decision.question.id : decision.action === "wait" ? decision.condition.id : assert.fail("expected pending input");
    const waiting = f.store.tasks.getTask(context.workspaceId, f.taskId).value!, working = f.store.tasks.readWorkingState(context.workspaceId, f.taskId).value!;
    assert.equal(waiting.state, "WAITING_INPUT"); assert.equal(waiting.attempts.at(-1)!.outcomes.length, 0);
    assert.deepEqual(working.pendingInput, [questionId]); assert.ok(working.unknown.length); assert.deepEqual(prior.pendingInput, []);
    const command = (payload: object) => parseLocalApiCommandV1({ schemaVersion: 1, commandId: randomUUID(), idempotencyKey: randomUUID(), workspaceId: context.workspaceId, expectedRevision: waiting.revision, payload: { targetRef: { kind: "task", id: f.taskId, revision: waiting.revision }, ...payload } });
    assert.throws(() => f.store.tasks.executeTask(context, command({ kind: "task.continue" })));
    assert.throws(() => f.store.tasks.executeTask(context, command({ kind: "task.respond", pendingQuestionId: "wrong-question", response: "SYNTHETIC_ONLY：错误问题" })), { code: "revision_conflict" });
    f.reopen(); const cached = await coordinateCognitiveBoundaryV1({ store: () => f.store, context, initial, model: scripted, ids: { next: randomUUID } });
    assert.equal(cached.boundary.callCount, 1); assert.equal(scripted.snapshot().receiverRequests.length, 1);
    const response = "SYNTHETIC_ONLY：请按照灯塔补充说明继续。";
    f.store.tasks.executeTask(context, command({ kind: "task.respond", pendingQuestionId: questionId, response }));
    const nextWorking = f.store.tasks.readWorkingState(context.workspaceId, f.taskId).value!;
    assert.deepEqual(nextWorking.pendingInput, []); assert.ok(nextWorking.known.includes(response));
    assert.ok(nextWorking.evidence.some(item => item.sourceTrust === "user-direct"));
    const next = f.prepare(); assert.match(next.runtimeInput.snapshot.text, /补充说明/);
    const boundary = f.store.contexts.openBoundary(context, { id: randomUUID(), capsuleId: next.capsule.id });
    assert.notEqual(boundary.id, result.boundary.id); assert.equal(boundary.callCount, 0);
    assert.equal(f.store.contexts.readBoundary(context.workspaceId, f.taskId, result.boundary.id).callCount, 1);
    f.reopen(); assert.ok(f.store.tasks.readWorkingState(context.workspaceId, f.taskId).value!.known.includes(response));
  }
});
async function model(f: ReturnType<typeof fixture>, initial: ReturnType<typeof f.prepare>, scripted: SyntheticDecisionFixtureV1) {
  const global = f.store.currentFence({ kind: "global" }), workspace = f.store.currentFence(scope), task = initial.capsule;
  const spec = parseExecutionSpecV1({ schemaVersion: 1, executionUnitId: randomUUID(), workspaceId: context.workspaceId, sessionId: f.sessionId, prompt: initial.runtimeInput.snapshot.text,
    requestSnapshotRef: initial.runtimeInput.contentRef, selectedModelProfile: task.modelProfile, toolProfile: "none", controlledCwdRef: "synthetic-decision-cwd",
    fence: { installationId: global.installationId, recoveryEpoch: String(global.recoveryEpoch), owner: { kind: "task_attempt", id: task.attemptId }, sourceTask: { taskId: task.taskId, attemptId: task.attemptId, intentRevision: task.intentRevision }, contractRevision: 1, leaseEpoch: context.ownerEpoch,
      cognition: { global: global.cognitionEpoch, workspace: workspace.cognitionEpoch }, policy: { global: global.policyEpoch, workspace: workspace.policyEpoch }, notAfter: new Date(Date.now()+60000).toISOString() },
    bounds: { maxOutputBytes: 65536, maxDurationMs: 60000, maxTokens: 8192, maxModelRequests: 2, maxToolCalls: 0 } });
  return createSyntheticDecisionModelV1({ spec, store: () => f.store, context, fixture: scripted });
}

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
    assert.equal(db.prepare("PRAGMA journal_mode").get()!.journal_mode, "wal"); assert.equal(db.prepare("PRAGMA integrity_check").get()!.integrity_check, "ok"); assert.equal(db.prepare("PRAGMA user_version").get()!.user_version, 7);
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

test("retrieval uses the same durable boundary, records both decisions and delivers exact current context", async t => {
  const f = fixture(t); f.remember(); f.remember("SYNTHETIC_ONLY：辅助报告采用三句话格式。");
  const initial = f.prepare(), port = await model(f, initial, "retrieve-execute"); t.after(() => port.close());
  const result = await coordinateCognitiveBoundaryV1({ store: () => f.store, context, initial, model: port, ids: { next: () => randomUUID() } });
  assert.equal(result.boundary.callCount, 2); assert.deepEqual(result.boundary.decisions.map(record => record.decision.action), ["retrieve", "execute"]); assert.equal(result.boundary.status, "decided");
  assert.equal(port.snapshot().receiverRequests.length, 2); assert.deepEqual(port.snapshot().modelRequests, port.snapshot().receiverRequests);
  assert.equal(result.context.capsule.report.selected.length, 2); assert.match(result.context.runtimeInput.snapshot.text, /紫色/); assert.match(result.context.runtimeInput.snapshot.text, /三句话/);
  assert.throws(() => f.store.contexts.reserveDecisionCall(context, { boundaryId: result.boundary.id, capsuleId: result.context.capsule.id, requestId: randomUUID(), purpose: "repair" }), { code: "conflict" });
  assert.equal(f.store.tasks.getTask(context.workspaceId, f.taskId).value!.state, "READY");
  f.reopen(); assert.deepEqual(f.store.contexts.readBoundary(context.workspaceId, f.taskId, result.boundary.id), result.boundary);
  const cached = await coordinateCognitiveBoundaryV1({ store: () => f.store, context, initial: result.context, model: port, ids: { next: () => randomUUID() } });
  assert.equal(cached.boundary.id, result.boundary.id); assert.equal(port.snapshot().receiverRequests.length, 2);
});
test("one malformed decision consumes a call before one bounded repair succeeds", async t => {
  const f = fixture(t); f.remember(); const initial = f.prepare(), port = await model(f, initial, "bad-json-repair"); t.after(() => port.close());
  const result = await coordinateCognitiveBoundaryV1({ store: () => f.store, context, initial, model: port, ids: { next: () => randomUUID() } });
  assert.equal(result.boundary.callCount, 2); assert.equal(result.boundary.decisions.length, 1); assert.equal(result.boundary.decisions[0]!.decision.action, "execute"); assert.equal(port.snapshot().receiverRequests.length, 2);
  f.reopen(); assert.equal(f.store.contexts.readBoundary(context.workspaceId, f.taskId, result.boundary.id).callCount, 2);
});
test("bad JSON, illegal refs, repeated retrieval and no progress stop within the persisted call limit", async t => {
  for (const scripted of ["bad-json", "invalid-reference", "repeated-retrieve", "no-progress"] as const) {
    const f = fixture(t); f.remember(); f.remember("SYNTHETIC_ONLY：辅助报告采用三句话格式。"); const initial = f.prepare(), port = await model(f, initial, scripted); t.after(() => port.close());
    const result = await coordinateCognitiveBoundaryV1({ store: () => f.store, context, initial, model: port, ids: { next: () => randomUUID() } });
    assert.equal(result.boundary.status, "stopped"); const last = result.boundary.decisions.at(-1)!.decision;
    assert.equal(last.action, "stop"); assert.equal(result.boundary.callCount, scripted === "no-progress" ? 1 : 2); assert.equal(port.snapshot().receiverRequests.length, result.boundary.callCount);
    assert.equal(f.store.tasks.getTask(context.workspaceId, f.taskId).value!.attempts.at(-1)!.outcomes.length, 0);
  }
});
test("unsupported structured decision records a deterministic stop without invoking a model", async t => {
  const f = fixture(t); f.remember(); const initial = f.prepare(); let calls = 0;
  const result = await coordinateCognitiveBoundaryV1({ store: () => f.store, context, initial, ids: { next: () => randomUUID() },
    model: { profile: initial.capsule.modelProfile, structuredDecision: "unsupported", async invoke() { calls++; throw new Error("Must not call"); } } });
  assert.equal(calls, 0); assert.equal(result.boundary.callCount, 0); assert.equal(result.boundary.decisions[0]!.origin, "coordinator-stop"); assert.equal(result.boundary.status, "stopped");
});
test("correction or explicit forget before the actual receiver rejects the reserved request", async t => {
  for (const kind of ["correct", "forget"] as const) {
    const f = fixture(t), memory = f.remember(), initial = f.prepare(), port = await model(f, initial, "execute"); t.after(() => port.close());
    const boundary = f.store.contexts.openBoundary(context, { id: randomUUID(), capsuleId: initial.capsule.id });
    const call = f.store.contexts.reserveDecisionCall(context, { boundaryId: boundary.id, capsuleId: initial.capsule.id, requestId: randomUUID(), purpose: "initial" });
    f.time(T1);
    f.store.memories.execute(context, change(memory, kind === "forget" ? { kind: "memory.forget", ...target(memory), mode: "logical" }
      : { kind: "memory.correct", ...target(memory), privacy: memory.privacy, claimKind: memory.kind, statement: "SYNTHETIC_ONLY：灯塔报告采用琥珀色。", evidenceRefs: [memory.evidence[0]!], validFrom: T0 }));
    const { input: _input, contentRef: _ref, ...request } = call;
    await assert.rejects(port.invoke(request), { code: kind === "forget" ? "unavailable" : "revision_conflict" });
    assert.equal(port.snapshot().receiverRequests.length, 0); assert.equal(f.store.contexts.readBoundary(context.workspaceId, f.taskId, boundary.id).callCount, 1);
  }
});
test("the final response after the last model request is rejected when its exact memory version changed", async t => {
  const f = fixture(t), memory = f.remember(), initial = f.prepare(), port = await model(f, initial, "respond"); t.after(() => port.close());
  await assert.rejects(coordinateCognitiveBoundaryV1({ store: () => f.store, context, initial, ids: { next: () => randomUUID() },
    model: { profile: port.profile, structuredDecision: port.structuredDecision, async invoke(request) {
      const response = await port.invoke(request); f.time(T1);
      f.store.memories.execute(context, change(memory, { kind: "memory.correct", ...target(memory), privacy: memory.privacy, claimKind: memory.kind, statement: "SYNTHETIC_ONLY：灯塔报告采用琥珀色。", evidenceRefs: [memory.evidence[0]!], validFrom: T0 }));
      return response;
    } } }), { code: "revision_conflict" });
  assert.equal(port.snapshot().receiverRequests.length, 1); assert.equal(f.store.tasks.getTask(context.workspaceId, f.taskId).value!.attempts.at(-1)!.outcomes.length, 0);
});
test("the actual composed decision request is counted and rejected even when the capsule itself fits", t => {
  const baseline = fixture(t).prepare(), budget = { contextLimit: baseline.capsule.report.inputTokens + 512, reservedOutput: 512, mandatoryProtocolOverhead: 0 };
  const boundary: ContextPersistenceBoundaryV1 = { ...syntheticContextBoundaryV1, budget,
    compile: input => compileCognitiveContextV1({ ...input, scope, budget, counter: syntheticContextCounterV1 }) };
  const f = fixture(t, boundary), initial = f.prepare(), saved = f.store.contexts.openBoundary(context, { id: randomUUID(), capsuleId: initial.capsule.id });
  assert.equal(initial.capsule.report.inputTokens, initial.capsule.report.availableInput);
  assert.throws(() => f.store.contexts.reserveDecisionCall(context, { boundaryId: saved.id, capsuleId: initial.capsule.id, requestId: randomUUID(), purpose: "initial" }), { code: "budget_exceeded" });
  assert.equal(f.store.contexts.readBoundary(context.workspaceId, f.taskId, saved.id).callCount, 0);
});

const harnessContext = { principalId: "synthetic-principal-a", workspaceId: "synthetic-workspace-a" };
function harnessSessionCommand(): SessionCreateCommandV1 { const id = randomUUID(); return { schemaVersion: 1, commandId: id, idempotencyKey: id, workspaceId: harnessContext.workspaceId, expectedRevision: 0, payload: { kind: "session.create", contract: syntheticTaskSessionContract } }; }
function harnessTaskCommand(sessionId: string): LocalApiCommandV1 { const id = randomUUID(); return { schemaVersion: 1, commandId: id, idempotencyKey: id, workspaceId: harnessContext.workspaceId, expectedRevision: 0, payload: { kind: "task.create", sessionId, executionProfile: syntheticTaskSessionContract.runtimeProfile, request: syntheticTaskPrompt, constraints: [], acceptanceChecks: [{ id: "criterion-synthetic" as CriterionId, revision: 1, description: "Independently verify synthetic output", required: true, method: "deterministic-test" }] } }; }
function cognitiveFixture(h: SyntheticTaskSessionHarness) {
 const createSession = harnessSessionCommand(), session = h.application.createSession(harnessContext, { ...createSession, payload: { ...createSession.payload, contract: syntheticCognitiveTaskSessionContract } }), source = harnessTaskCommand(session.value.aggregate.id);
 if (source.payload.kind !== "task.create") assert.fail("task fixture");
 const command = { ...source, payload: { ...source.payload, request: "SYNTHETIC_ONLY lighthouse", constraints: ["Use only synthetic attributed material."] } };
 const taskId = h.application.executeTask(harnessContext, command).value.aggregate.id;
 const scope = { kind: "workspace" as const, workspaceId: harnessContext.workspaceId }, captureId = randomUUID();
 const evidence = h.memories.capture(harnessContext, { schemaVersion: 1, commandId: captureId, idempotencyKey: captureId, workspaceId: harnessContext.workspaceId, scope, privacy: "model-allowed", text: "SYNTHETIC_ONLY lighthouse uses amber for the report." }).evidence;
 const rememberId = randomUUID(), memory = h.memories.execute(harnessContext, { schemaVersion: 1, commandId: rememberId, idempotencyKey: rememberId, workspaceId: harnessContext.workspaceId, expectedRevision: 0,
   payload: { kind: "memory.remember", scope, privacy: "model-allowed", claimKind: "preference", statement: "SYNTHETIC_ONLY lighthouse uses amber for the report.", evidenceRefs: [evidence], validFrom: new Date().toISOString() } });
 const claim = h.memories.explain(harnessContext, scope, memory.receipt.aggregate.id).value!;
 return { taskId, claim, correct() { const id = randomUUID(); h.memories.execute(harnessContext, { schemaVersion: 1, commandId: id, idempotencyKey: id, workspaceId: harnessContext.workspaceId, expectedRevision: claim.revision,
   payload: { kind: "memory.correct", scope, targetRef: { kind: "claim", id: claim.id, revision: claim.revision }, targetVersion: { claimId: claim.id, version: claim.version }, privacy: "model-allowed", claimKind: "preference", statement: "SYNTHETIC_ONLY lighthouse uses purple for the report.", evidenceRefs: [evidence], validFrom: claim.validFrom } }); } };
}
test("Cognitive Task carries its committed attributed capsule through the existing Worker to the receiver", async t => {
 const peer = await createSyntheticWorkerTestPackage(), h = await createSyntheticTaskSessionHarness({ runtime: { packageDirectory: peer.root, nodeExecutable: process.execPath } });
 t.after(async () => { await h.close(); await peer.remove(); }); const f = cognitiveFixture(h), result = await h.runCognitiveTask(harnessContext, f.taskId); await h.idle();
 assert.equal(result.boundary.callCount, 1); assert.equal(result.boundary.decisions.at(-1)!.decision.action, "execute");
 assert.equal(result.context.capsule.report.selected[0]!.ref.id, f.claim.id); assert.match(result.context.capsule.rendering.fullText, /amber/);
 const evidence = h.evidence(harnessContext, f.taskId), task = h.application.getTask(harnessContext, f.taskId).value;
 assert.equal(evidence.execution!.spec.prompt, result.context.runtimeInput.snapshot.text); assert.deepEqual(evidence.execution!.spec.requestSnapshotRef, result.context.runtimeInput.contentRef);
 assert.equal(evidence.modelRequests.length, 1); assert.ok(JSON.stringify(evidence.modelRequests[0]!.context).includes("amber"));
 assert.equal(task.state, "VERIFYING"); assert.equal(task.attempts.at(-1)!.outcomes.length, 0); assert.equal(evidence.execution!.closed, true);
 await h.restart(); assert.equal(h.evidence(harnessContext, f.taskId).modelRequests.length, 1);
});
test("a cognitive Session with the default sample request executes through its capsule instead of the legacy queue", async t => {
 const peer = await createSyntheticWorkerTestPackage(), h = await createSyntheticTaskSessionHarness({ runtime: { packageDirectory: peer.root, nodeExecutable: process.execPath } });
 t.after(async () => { await h.close(); await peer.remove(); }); const command = harnessSessionCommand();
 const session = h.application.createSession(harnessContext, { ...command, payload: { ...command.payload, contract: syntheticCognitiveTaskSessionContract } });
 const taskId = h.application.executeTask(harnessContext, harnessTaskCommand(session.value.aggregate.id)).value.aggregate.id; await h.idle();
 assert.equal(h.evidence(harnessContext, taskId).execution, undefined); assert.equal(h.evidence(harnessContext, taskId).runtimeInputs.length, 0);
 await assert.rejects(h.runTask(harnessContext, taskId), { code: "unsupported" }); await assert.rejects(h.idle(), { code: "unsupported" });
 const result = await h.runCognitiveTask(harnessContext, taskId); await h.idle(); assert.equal(h.application.getTask(harnessContext, taskId).value.state, "VERIFYING");
 const evidence = h.evidence(harnessContext, taskId); assert.equal(evidence.runtimeInputs.length, 1); assert.equal(evidence.execution!.spec.prompt, result.context.capsule.rendering.fullText);
 assert.equal(evidence.modelRequests.length, 1);
});
test("Cognitive Worker rejects correction before send and after its last received request", async t => {
 for (const stage of ["prompt", "final"] as const) {
  const peer = await createSyntheticWorkerTestPackage({ pausePrompt: true, ...(stage === "final" ? { pauseFinal: true } : {}) });
  const h = await createSyntheticTaskSessionHarness({ runtime: { packageDirectory: peer.root, nodeExecutable: process.execPath } });
  t.after(async () => { await peer.releasePrompt(); await peer.releaseFinal(); await h.close(); await peer.remove(); }); const f = cognitiveFixture(h); await h.coordinateTask(harnessContext, f.taskId);
  const run = h.runCognitiveTask(harnessContext, f.taskId); void run.catch(() => undefined);
  let finished = false; void run.then(() => { finished = true; }, () => { finished = true; });
  while (h.evidence(harnessContext, f.taskId).execution?.state !== "BUSY") {
   if (finished) { await run; assert.fail("Cognitive Worker did not dispatch."); }
   await delay(100);
  }
  await peer.waitForPrompt();
  if (stage === "final") { await peer.releasePrompt(); await peer.waitForFinal(); }
  f.correct(); if (stage === "prompt") await peer.releasePrompt(); else await peer.releaseFinal();
  await assert.rejects(run); await assert.rejects(h.idle());
  const task = h.application.getTask(harnessContext, f.taskId).value, evidence = h.evidence(harnessContext, f.taskId);
  assert.notEqual(task.state, "COMPLETED"); assert.ok(task.attempts.at(-1)!.outcomes.every(outcome => outcome.status === "unverifiable"));
  assert.equal(evidence.modelRequests.length, stage === "prompt" ? 0 : 1); assert.equal(evidence.execution!.closed, true);
 }
});
test("a persisted cognitive question accepts its exact real response after owner fencing and opens a new boundary", async t => {
 const h = await createSyntheticTaskSessionHarness(); t.after(() => h.close()); const f = cognitiveFixture(h);
 const planned = await h.coordinateTask(harnessContext, f.taskId, "clarify"), question = planned.boundary.decisions.at(-1)!.decision;
 if (question.action !== "clarify") assert.fail("clarify fixture");
 const waiting = h.application.getTask(harnessContext, f.taskId).value, oldOwner = h.application.getSession(harnessContext, waiting.sessionId).value.ownerEpoch;
 await h.restart(); assert.ok(h.application.getSession(harnessContext, waiting.sessionId).value.ownerEpoch > oldOwner);
 assert.equal(h.application.getTask(harnessContext, f.taskId).value.state, "WAITING_INPUT");
 const id = randomUUID(); h.application.executeTask(harnessContext, { schemaVersion: 1, commandId: id, idempotencyKey: id, workspaceId: harnessContext.workspaceId, expectedRevision: waiting.revision,
   payload: { kind: "task.respond", targetRef: { kind: "task", id: f.taskId, revision: waiting.revision }, pendingQuestionId: question.question.id, response: "SYNTHETIC_ONLY: use plain text." } });
 const ready = h.application.getTask(harnessContext, f.taskId).value; assert.equal(ready.state, "READY"); assert.notEqual(ready.attempts.at(-1)!.id, waiting.attempts.at(-1)!.id); assert.equal(ready.attempts[0]!.state, "CANCELLED");
 const next = await h.coordinateTask(harnessContext, f.taskId); assert.notEqual(next.boundary.id, planned.boundary.id); assert.equal(next.boundary.callCount, 1);
 assert.ok(next.context.capsule.rendering.fullText.includes("use plain text")); await h.restart(); assert.equal(h.application.getTask(harnessContext, f.taskId).value.state, "READY");
});
});
