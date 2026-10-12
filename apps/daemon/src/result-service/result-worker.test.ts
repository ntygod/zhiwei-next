import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { randomUUID } from "node:crypto";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { openSyntheticCognitionStoreV2, type SyntheticCognitionStoreV2, type TaskStoreContextV1 } from "../../../../packages/memory-store/src/index.ts";
import { canonicalJsonV1, parseLocalApiCommandV1 } from "../../../../packages/protocol/src/index.ts";
import type { MemoryClaimV2 } from "../../../../packages/domain/src/index.ts";
import { reducePersistentTask } from "../task-service/task-reducer.ts";
import { createPersistentSessionApplication, syntheticCognitiveTaskSessionContract, syntheticTaskPrompt } from "../task-service/application.ts";
import { createSyntheticTaskSessionHarness } from "../task-service/synthetic-harness.ts";
import { syntheticContextBoundaryV1 } from "../task-service/synthetic-context-boundary.ts";
import { coordinateCognitiveBoundaryV1 } from "../task-service/cognitive-coordinator.ts";
import { createSyntheticTaskDecisionModelV1 } from "../task-service/synthetic-decision-model.ts";
import { reduceExplicitMemory, qualifiesExplicitMemory } from "../memory-service/memory-rules.ts";
import { createSyntheticWorkerTestPackage } from "../runtime/controlled-worker-test-fixture.ts";
import { createSyntheticControlledWorkerSupervisor, type SyntheticWorkerSupervisor } from "../runtime/controlled-worker-supervisor.ts";
import { syntheticOutcomeBoundaryV1 } from "./synthetic-boundary.ts";
import { createSyntheticOutcomeReaderV1 } from "./synthetic-reader.ts";
import { createOutcomeServiceV1 } from "./service.ts";
const context: TaskStoreContextV1 = { principalId: "synthetic-principal-a", workspaceId: "synthetic-workspace-a", daemonInstanceId: "synthetic-result-worker-daemon", ownerEpoch: 1 };
const scope = { kind: "workspace" as const, workspaceId: context.workspaceId }, now = () => new Date().toISOString();
const draftArguments = { name: "synthetic-draft.txt", text: "Synthetic draft: the sample project uses a blue notebook." };
function fixture(t: TestContext, subjective = false) {
  const root = mkdtempSync(join(tmpdir(), "zhiwei-result-worker-")), dataRoot = join(root, "data"), controlRoot = join(root, "control"); mkdirSync(dataRoot);
  const policy = { privacy: "model-allowed" as const, retentionUntil: new Date(Date.now() + 86_400_000).toISOString() };
  const options = { dataRoot, controlRoot, installationId: "synthetic-result-worker-installation", clock: { now },
    taskPersistence: { daemonInstanceId: context.daemonInstanceId, ids: { next: () => randomUUID() }, runtimeSourceIdentity: { bindingImplementation: "pi", adapter: "pi", implementation: "@earendil-works/pi-coding-agent", version: "0.84.1" }, contentPolicy: policy, reduce: reducePersistentTask },
    memoryPersistence: { ids: { next: () => randomUUID() }, contentPolicy: policy, reduce: reduceExplicitMemory, qualifies: qualifiesExplicitMemory },
    contextPersistence: syntheticContextBoundaryV1, outcomePersistence: syntheticOutcomeBoundaryV1 };
  let store: SyntheticCognitionStoreV2 = openSyntheticCognitionStoreV2({ ...options, mode: "create" }); store.registerScope({ kind: "global" }); store.registerScope(scope);
  t.after(() => { store.close(); rmSync(root, { recursive: true, force: true }); });
  const application = createPersistentSessionApplication({ store: () => store, daemonInstanceId: () => context.daemonInstanceId }), reader = createSyntheticOutcomeReaderV1(); t.after(() => reader.close());
  const service = createOutcomeServiceV1({ store: () => store, application, reader, ids: { next: randomUUID }, now });
  const sessionId = store.tasks.createSession(context, { schemaVersion: 1, commandId: randomUUID(), idempotencyKey: randomUUID(), workspaceId: context.workspaceId, expectedRevision: 0,
    payload: { kind: "session.create", contract: { ...syntheticCognitiveTaskSessionContract, toolProfile: { id: "controlled-read-memory-draft-v1", revision: 1 } } } }).receipt.aggregate.id;
  const taskId = application.executeTask(context, parseLocalApiCommandV1({ schemaVersion: 1, commandId: randomUUID(), idempotencyKey: randomUUID(), workspaceId: context.workspaceId, expectedRevision: 0,
    payload: { kind: "task.create", sessionId, executionProfile: syntheticCognitiveTaskSessionContract.runtimeProfile, request: "SYNTHETIC_ONLY sample report", constraints: [], acceptanceChecks: [
      { id: "sample", revision: 1, description: "Sample count is eight", required: true, method: "artifact" }, { id: "draft", revision: 1, description: "Exact synthetic draft action", required: true, method: "tool-receipt" },
      ...(subjective ? [{ id: "subjective", revision: 1, description: "User accepts the sample", required: true, method: "user-confirmation" as const }] : []) ] } })).value.aggregate.id;
  const remember = (statement: string, claimKind: "constraint" | "preference") => {
    const input = randomUUID(), evidence = store.memories.capture(context, { schemaVersion: 1, commandId: input, idempotencyKey: input, workspaceId: context.workspaceId, scope, privacy: "model-allowed", text: statement }).evidence;
    const command = randomUUID(), result = store.memories.execute(context, { schemaVersion: 1, commandId: command, idempotencyKey: command, workspaceId: context.workspaceId, expectedRevision: 0,
      payload: { kind: "memory.remember", scope, privacy: "model-allowed", claimKind, statement, evidenceRefs: [evidence], validFrom: now() } });
    return store.memories.explain(context, scope, result.receipt.aggregate.id).value!;
  };
  const adopted = remember('SYNTHETIC_ONLY: parameter name = "synthetic-draft.txt"', "constraint"), other = remember("SYNTHETIC_ONLY: sample preference uses purple", "preference");
  service.bindPlan(context, { schemaVersion: 1, commandId: "plan", idempotencyKey: "plan", workspaceId: context.workspaceId, taskId, expectedRevision: application.getTask(context, taskId).value.revision,
    checks: [{ criterionId: "sample", criterionRevision: 1, kind: "artifact", resourceId: "sample", format: "json-equals", expectedText: '{"count":8}' },
      { criterionId: "draft", criterionRevision: 1, kind: "tool-receipt", toolName: "zhiwei_draft_write", argumentsJson: canonicalJsonV1(draftArguments) },
      ...(subjective ? [{ criterionId: "subjective", criterionRevision: 1, kind: "user-confirmation" as const }] : [])],
    adoptionChecks: [{ material: { kind: "claim", id: adopted.id, revision: adopted.revision, version: adopted.version }, toolName: "zhiwei_draft_write", parameter: "name", expectedJson: '"synthetic-draft.txt"', profile: "synthetic-parameter-v1" }] });
  const prepare = () => store.contexts.prepare(context, { id: randomUUID(), taskId, expectedRevision: application.getTask(context, taskId).value.revision, query: "sample",
    requiredClaims: [adopted, other].map(claim => ({ claimId: claim.id, version: claim.version })) });
  return { dataRoot, taskId, application, reader, service, adopted, other, prepare, get store() { return store; }, reopen() { store.close(); store = openSyntheticCognitionStoreV2({ ...options, mode: "open" }); } };
}
async function run(t: TestContext, f: ReturnType<typeof fixture>, pauseFinal = false, omitFirstReceipt = false) {
  const initial = f.prepare(), model = await createSyntheticTaskDecisionModelV1({ store: () => f.store, context, initial }); t.after(() => model.close());
  const decision = await coordinateCognitiveBoundaryV1({ store: () => f.store, context, initial, model, ids: { next: () => randomUUID() } }); assert.equal(decision.boundary.decisions.at(-1)!.decision.action, "execute");
  const peer = await createSyntheticWorkerTestPackage({ pauseFinal }); t.after(() => peer.remove());
  const global = f.store.currentFence({ kind: "global" }), workspace = f.store.currentFence(scope), task = f.application.getTask(context, f.taskId).value;
  let supervisor: SyntheticWorkerSupervisor | undefined, received = 0, resolveFinalRequest: () => void;
  const finalRequest = new Promise<void>(resolve => { resolveFinalRequest = resolve; });
  supervisor = await createSyntheticControlledWorkerSupervisor({ packageDirectory: peer.root, nodeExecutable: process.execPath, scenario: "tools", compiledInput: decision.context,
    taskIdentity: { executionUnitId: randomUUID(), workspaceId: context.workspaceId, sessionId: task.sessionId, requestSnapshotRef: decision.context.runtimeInput.contentRef,
      fence: { installationId: global.installationId, recoveryEpoch: String(global.recoveryEpoch), owner: { kind: "task_attempt", id: task.attempts.at(-1)!.id }, sourceTask: { taskId: task.id, attemptId: task.attempts.at(-1)!.id, intentRevision: task.intent.revision },
        contractRevision: 1, leaseEpoch: 1, cognition: { global: global.cognitionEpoch, workspace: workspace.cognitionEpoch }, policy: { global: global.policyEpoch, workspace: workspace.policyEpoch }, notAfter: new Date(Date.now() + 60_000).toISOString() } },
    beforeSyntheticModelReceive(record) { f.store.executions.recordModelRequest(context, { taskId: task.id, bindingId: supervisor!.snapshot().binding.bindingId, requestId: record.requestId, context: record.context, maxTokens: record.maxTokens }); },
    afterSyntheticModelReceive(record, reply) { received++; if (omitFirstReceipt && received === 1) return;
      f.store.outcomes.observeRequest(context, { taskId: task.id, bindingId: supervisor!.snapshot().binding.bindingId, requestId: record.requestId,
        toolCalls: (reply.toolCalls ?? []).map(call => ({ callId: call.id, toolName: call.name, argumentsJson: canonicalJsonV1(call.arguments) })) }); if (received === 4) resolveFinalRequest(); },
    memoryReader: { read() { return JSON.stringify(f.store.contexts.searchRuntimeMemory(context, { capsuleId: initial.capsule.id, bindingId: supervisor!.snapshot().binding.bindingId, query: "SYNTHETIC_ONLY" })); } },
  }); t.after(() => supervisor!.close());
  f.store.executions.allocateExecution(context, { taskId: task.id, expectedRevision: task.revision, spec: supervisor.spec, binding: supervisor.snapshot().binding });
  const binding = await supervisor.runtime.start(supervisor.spec), ready = f.store.executions.markExecutionReady(context, { taskId: task.id, binding });
  f.store.tasks.executeTask(context, { schemaVersion: 1, commandId: "start", idempotencyKey: "start", workspaceId: context.workspaceId, expectedRevision: task.revision,
    payload: { kind: "task.runtime", taskId: task.id, event: "start", evidenceRefs: [{ id: binding.bindingId, revision: ready.revision }] } });
  const collecting = (async () => { for await (const envelope of supervisor!.runtime.events(binding.bindingId)) {
    f.store.executions.observeExecutionBinding(context, { taskId: task.id, binding: supervisor!.snapshot().binding }); f.store.executions.ingestExecutionEvent(context, { taskId: task.id, envelope }); if (envelope.event.stability === "settled") break;
  } })(); void collecting.catch(() => undefined);
  f.store.executions.markExecutionDispatched(context, { taskId: task.id, bindingId: binding.bindingId }); await supervisor.runtime.dispatch(binding.bindingId);
  return { peer, supervisor, collecting, finalRequest: () => Promise.race([finalRequest, collecting.then(() => { throw new Error("Missing held final request."); })]), async settle() { await collecting; const close = await supervisor!.runtime.dispose(binding.bindingId); f.store.executions.closeExecution(context, { taskId: task.id, evidence: close }); } };
}
function verifyCommand(f: ReturnType<typeof fixture>) { return { schemaVersion: 1 as const, commandId: "verify", idempotencyKey: "verify", workspaceId: context.workspaceId, taskId: f.taskId, expectedRevision: f.application.getTask(context, f.taskId).value.revision }; }
function correct(f: ReturnType<typeof fixture>, claim: MemoryClaimV2) {
  const input = randomUUID(), evidence = f.store.memories.capture(context, { schemaVersion: 1, commandId: input, idempotencyKey: input, workspaceId: context.workspaceId, scope, privacy: "model-allowed", text: "SYNTHETIC_ONLY: sample corrected" }).evidence;
  const command = randomUUID(); f.store.memories.execute(context, { schemaVersion: 1, commandId: command, idempotencyKey: command, workspaceId: context.workspaceId, expectedRevision: claim.revision,
    payload: { kind: "memory.correct", scope, targetRef: { kind: "claim", id: claim.id, revision: claim.revision }, targetVersion: { claimId: claim.id, version: claim.version },
      privacy: "model-allowed", claimKind: claim.kind, statement: "SYNTHETIC_ONLY: sample corrected", evidenceRefs: [evidence], validFrom: now() } });
}
test("actual Worker requests prove exposure separately; only the matching request/action proves one memory adoption", async t => {
  const f = fixture(t), worker = await run(t, f, false, true); await worker.settle();
  const command = verifyCommand(f), result = f.service.verify(context, command); assert.equal(result.bundle.outcome.status, "completed"); assert.equal(result.bundle.memoryUses.length, 8);
  assert.equal(result.bundle.memoryUses.filter(use => use.exposure === "uncertain").length, 2); assert.equal(result.bundle.memoryUses.filter(use => use.exposure === "sent").length, 6);
  const verified = result.bundle.memoryUses.filter(use => use.adoption.status === "verified"); assert.equal(verified.length, 1); assert.equal(verified[0]!.material.id, f.adopted.id); assert.equal(verified[0]!.request.ordinal, 3);
  assert.ok(result.bundle.memoryUses.filter(use => use.material.id === f.other.id).every(use => use.adoption.status === "unknown")); assert.ok(result.bundle.memoryUses.every(use => use.benefit.status === "unknown"));
  assert.equal(result.bundle.episode.actions[0]!.id, "synthetic-draft-call"); f.reopen(); assert.deepEqual(f.service.read(context, f.taskId), result.bundle);
  const pending = f.store.outcomes.prepare(context, { ...verifyCommand(f), commandId: "recheck", idempotencyKey: "recheck" });
  correct(f, f.adopted); assert.throws(() => f.store.outcomes.commit(context, pending.snapshot.id, []), { code: "revision_conflict" });
  assert.throws(() => f.service.read(context, f.taskId), { code: "not_found" });
  assert.throws(() => f.service.verify(context, command), { code: "not_found" });
  const forgetId = randomUUID(); f.store.memories.execute(context, { schemaVersion: 1, commandId: forgetId, idempotencyKey: forgetId, workspaceId: context.workspaceId, expectedRevision: f.other.revision,
    payload: { kind: "memory.forget", scope, targetRef: { kind: "claim", id: f.other.id, revision: f.other.revision }, targetVersion: { claimId: f.other.id, version: f.other.version }, mode: "logical" } });
  assert.throws(() => f.service.history(context, f.taskId), { code: "not_found" });
});
test("correction or logical forgetting after the final request blocks a late final without more tool calls", async t => {
  for (const operation of ["correct", "forget"] as const) {
    const f = fixture(t), worker = await run(t, f, true); await worker.finalRequest(); await worker.peer.waitForFinal();
    assert.equal(worker.supervisor.snapshot().broker.receiverRequests.length, 4); assert.equal(worker.supervisor.snapshot().broker.toolCalls, 3);
    if (operation === "correct") correct(f, f.adopted);
    else { const command = randomUUID(); f.store.memories.execute(context, { schemaVersion: 1, commandId: command, idempotencyKey: command, workspaceId: context.workspaceId, expectedRevision: f.adopted.revision,
      payload: { kind: "memory.forget", scope, targetRef: { kind: "claim", id: f.adopted.id, revision: f.adopted.revision }, targetVersion: { claimId: f.adopted.id, version: f.adopted.version }, mode: "logical" } }); }
    await worker.peer.releaseFinal(); await assert.rejects(worker.collecting, { code: operation === "correct" ? "conflict" : "unavailable" });
    assert.throws(() => f.service.verify(context, verifyCommand(f)), { code: operation === "correct" ? "idempotency_conflict" : "not_found" }); assert.equal(worker.supervisor.snapshot().broker.toolCalls, 3);
    const db = new DatabaseSync(join(f.dataRoot, "product.sqlite")); try { assert.equal(db.prepare("SELECT count(*) AS n FROM task_result_v1").get()!.n, 0); } finally { db.close(); }
    const close = await worker.supervisor.runtime.dispose(worker.supervisor.snapshot().binding.bindingId);
    assert.ok(close.closeObserved && close.stdoutEof && close.stderrEof);
  }
});
test("a new subjective confirmation cannot reuse objective passes from a corrected execution source", async t => {
  const f = fixture(t, true), worker = await run(t, f); await worker.settle();
  const first = f.service.verify(context, verifyCommand(f)); assert.equal(first.bundle.outcome.status, "partial");
  correct(f, f.adopted); assert.throws(() => f.service.read(context, f.taskId), { code: "not_found" });
  const current = f.service.feedback(context, { schemaVersion: 1, commandId: "accept-after-correction", idempotencyKey: "accept-after-correction", workspaceId: context.workspaceId,
    taskId: f.taskId, expectedRevision: first.bundle.task.revision, attemptId: first.bundle.outcome.attemptId, intentRevision: 1,
    outcomeId: first.bundle.outcome.id, outcomeRevision: first.bundle.outcome.revision, criterionId: "subjective", criterionRevision: 1, decision: "accepted" });
  assert.equal(current.bundle.outcome.status, "partial"); assert.equal(current.bundle.task.state, "PARTIAL");
  assert.deepEqual(current.bundle.outcome.criteriaResults.map(result => result.status), ["unknown", "unknown", "pass"]);
  assert.equal(f.service.history(context, f.taskId)[0]!.outcome.status, "partial");
});
test("the owned daemon harness observes a bound result plan through its actual receiving hook", async t => {
  const peer = await createSyntheticWorkerTestPackage(), harness = await createSyntheticTaskSessionHarness({ runtime: { packageDirectory: peer.root, nodeExecutable: process.execPath } });
  t.after(async () => { await harness.close(); await peer.remove(); });
  const input = randomUUID(), statement = `SYNTHETIC_ONLY: ${syntheticTaskPrompt} Use purple.`, evidence = harness.memories.capture(context,
    { schemaVersion: 1, commandId: input, idempotencyKey: input, workspaceId: context.workspaceId, scope, privacy: "model-allowed", text: statement }).evidence;
  harness.memories.execute(context, { schemaVersion: 1, commandId: "harness-memory", idempotencyKey: "harness-memory", workspaceId: context.workspaceId, expectedRevision: 0,
    payload: { kind: "memory.remember", scope, privacy: "model-allowed", claimKind: "preference", statement, evidenceRefs: [evidence], validFrom: now() } });
  const sessionId = harness.application.createSession(context, { schemaVersion: 1, commandId: "harness-session", idempotencyKey: "harness-session", workspaceId: context.workspaceId, expectedRevision: 0,
    payload: { kind: "session.create", contract: syntheticCognitiveTaskSessionContract } }).value.aggregate.id;
  const taskId = harness.application.executeTask(context, parseLocalApiCommandV1({ schemaVersion: 1, commandId: "harness-task", idempotencyKey: "harness-task", workspaceId: context.workspaceId, expectedRevision: 0,
    payload: { kind: "task.create", sessionId, executionProfile: syntheticCognitiveTaskSessionContract.runtimeProfile, request: syntheticTaskPrompt, constraints: [],
      acceptanceChecks: [{ id: "sample", revision: 1, description: "Sample count is eight", required: true, method: "artifact" }] } })).value.aggregate.id;
  harness.outcomes.bindPlan(context, { schemaVersion: 1, commandId: "harness-plan", idempotencyKey: "harness-plan", workspaceId: context.workspaceId, taskId,
    expectedRevision: harness.application.getTask(context, taskId).value.revision, checks: [{ criterionId: "sample", criterionRevision: 1, kind: "artifact", resourceId: "sample", format: "json-equals", expectedText: '{"count":8}' }], adoptionChecks: [] });
  await harness.runCognitiveTask(context, taskId); const task = harness.application.getTask(context, taskId).value; assert.equal(task.state, "VERIFYING");
  const result = harness.outcomes.verify(context, { schemaVersion: 1, commandId: "harness-verify", idempotencyKey: "harness-verify", workspaceId: context.workspaceId, taskId, expectedRevision: task.revision });
  assert.equal(result.bundle.outcome.status, "completed"); assert.equal(result.bundle.memoryUses.length, 1); assert.equal(result.bundle.memoryUses[0]!.exposure, "sent");
  assert.equal(result.bundle.memoryUses[0]!.adoption.status, "unknown"); assert.equal(result.bundle.memoryUses[0]!.benefit.status, "unknown");
});
