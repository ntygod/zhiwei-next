import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { openSyntheticCognitionStoreV2, type SyntheticCognitionStoreV2, type TaskPersistenceBoundaryV1, type TaskStoreContextV1 } from "../../../../packages/memory-store/src/index.ts";
import { parseLocalApiCommandV1, parseSessionCreateCommandV1, createNormalizedRuntimeEventV1, type ExecutionSpecV1, type RuntimeBindingV1 } from "../../../../packages/protocol/src/index.ts";
import { ids, type TaskResultBundleV1 } from "../../../../packages/domain/src/index.ts";
import { reducePersistentTask } from "../task-service/task-reducer.ts";
import { syntheticTaskSessionContract } from "../task-service/application.ts";
import { syntheticOutcomeBoundaryV1 } from "./synthetic-boundary.ts";
import { createOutcomeServiceV1 } from "./service.ts";
import { createSyntheticOutcomeReaderV1 } from "./synthetic-reader.ts";
import { createPersistentSessionApplication } from "../task-service/application.ts";
import { createSyntheticSessionApi } from "../session-api/server.ts";
const initialTime = "2026-10-12T00:00:00.000Z", retention = "2026-10-13T00:00:00.000Z";
const context: TaskStoreContextV1 = { principalId: "synthetic-principal-a", workspaceId: "synthetic-workspace-a", daemonInstanceId: "synthetic-result-daemon", ownerEpoch: 1 };
function fixture(t: TestContext, subjective = false) {
  const root = mkdtempSync(join(tmpdir(), "zhiwei-result-persistence-")), dataRoot = join(root, "data"), controlRoot = join(root, "control"); mkdirSync(dataRoot);
  let clock = initialTime, counter = 0, store: SyntheticCognitionStoreV2 | undefined;
  const nextId = (kind: string) => kind === "content" || kind === "reservation" ? `00000000-0000-4000-8000-${(++counter).toString(16).padStart(12, "0")}` : `${kind}-${++counter}`;
  const boundary: TaskPersistenceBoundaryV1 = { daemonInstanceId: context.daemonInstanceId, contentPolicy: { privacy: "model-allowed", retentionUntil: retention }, ids: { next: nextId }, reduce: reducePersistentTask };
  const options = { dataRoot, controlRoot, installationId: "synthetic-result-installation", clock: { now: () => clock }, taskPersistence: boundary, outcomePersistence: { ...syntheticOutcomeBoundaryV1, ids: { next: nextId } } };
  store = openSyntheticCognitionStoreV2({ ...options, mode: "create" }); store.registerScope({ kind: "global" }); store.registerScope({ kind: "workspace", workspaceId: context.workspaceId });
  t.after(() => { store?.close(); rmSync(root, { recursive: true, force: true }); });
  const session = store.tasks.createSession(context, parseSessionCreateCommandV1({ schemaVersion: 1, commandId: "session", idempotencyKey: "session", workspaceId: context.workspaceId, expectedRevision: 0, payload: { kind: "session.create", contract: syntheticTaskSessionContract } }));
  const command = parseLocalApiCommandV1({ schemaVersion: 1, commandId: "create", idempotencyKey: "create", workspaceId: context.workspaceId, expectedRevision: 0, payload: { kind: "task.create", sessionId: session.receipt.aggregate.id,
    executionProfile: syntheticTaskSessionContract.runtimeProfile, request: "SYNTHETIC_ONLY verify an owned sample", constraints: [], acceptanceChecks: [{ id: "artifact", revision: 1, description: "Exact sample count", required: true, method: subjective ? "user-confirmation" : "artifact" }] } });
  const created = store.tasks.executeTask(context, command), taskId = created.receipt.aggregate.id;
  const plan = { schemaVersion: 1 as const, commandId: "plan", idempotencyKey: "plan", workspaceId: context.workspaceId, taskId, expectedRevision: created.receipt.aggregate.revision,
    checks: subjective ? [{ criterionId: "artifact", criterionRevision: 1, kind: "user-confirmation" as const }] : [{ criterionId: "artifact", criterionRevision: 1, kind: "artifact" as const, resourceId: "sample", format: "json-equals" as const, expectedText: '{"count":8}' }], adoptionChecks: [] };
  return { get store() { return store!; }, taskId, dataRoot, plan, now: () => clock, setTime(now: string) { clock = now; }, reopen() { store!.close(); store = undefined; store = openSyntheticCognitionStoreV2({ ...options, mode: "open" }); },
    settle() {
      clock = "2026-10-12T00:00:01.000Z";
      const task = store!.tasks.getTask(context.workspaceId, taskId).value!, attemptId = task.attempts.at(-1)!.id;
      const input = store!.tasks.recordRuntimeInput(context, { commandId: "input", idempotencyKey: "input", taskId, expectedRevision: task.revision, attemptId, intentRevision: 1, text: task.intent.request });
      const global = store!.currentFence({ kind: "global" }), workspace = store!.currentFence({ kind: "workspace", workspaceId: context.workspaceId });
      const spec: ExecutionSpecV1 = { schemaVersion: 1, executionUnitId: "execution", workspaceId: context.workspaceId, sessionId: task.sessionId, prompt: input.snapshot.text, requestSnapshotRef: input.contentRef,
        fence: { installationId: options.installationId, recoveryEpoch: String(global.recoveryEpoch), owner: { kind: "task_attempt", id: attemptId }, sourceTask: { taskId, attemptId, intentRevision: 1 },
          contractRevision: 1, leaseEpoch: 1, cognition: { global: global.cognitionEpoch, workspace: workspace.cognitionEpoch }, policy: { global: global.policyEpoch, workspace: workspace.policyEpoch }, notAfter: "2026-10-12T00:01:00.000Z" },
        selectedModelProfile: syntheticTaskSessionContract.modelProfile, toolProfile: "none", bounds: { maxOutputBytes: 65536, maxDurationMs: 5000, maxTokens: 1000, maxModelRequests: 2, maxToolCalls: 0 }, controlledCwdRef: "synthetic-cwd" };
      const allocated: RuntimeBindingV1 = { schemaVersion: 1, bindingId: "binding", executionUnitId: spec.executionUnitId, workspaceId: context.workspaceId, sessionId: task.sessionId,
        owner: { kind: "task_attempt", id: attemptId }, workerInstanceId: "worker", leaseEpoch: 1, profileRevision: 1, runtime: { implementation: "synthetic", version: "1.0.0" }, state: "ALLOCATED", observedRuntimeSessionIds: [], sourceStreams: [] };
      const ready: RuntimeBindingV1 = { ...allocated, state: "READY", observedRuntimeSessionIds: ["native-session"], sourceStreams: [{ sourceStreamId: "source-stream", surface: "rpc", runtimeInstanceId: "runtime", sequenceDomain: "output-physical" }] };
      store!.executions.allocateExecution(context, { taskId, expectedRevision: task.revision, spec, binding: allocated }); const prepared = store!.executions.markExecutionReady(context, { taskId, binding: ready });
      store!.tasks.executeTask(context, { schemaVersion: 1, commandId: "start", idempotencyKey: "start", workspaceId: context.workspaceId, expectedRevision: task.revision, payload: { kind: "task.runtime", taskId, event: "start", evidenceRefs: [{ id: prepared.bindingId, revision: prepared.revision }] } });
      store!.executions.markExecutionDispatched(context, { taskId, bindingId: ready.bindingId }); clock = "2026-10-12T00:00:02.000Z";
      store!.executions.ingestExecutionEvent(context, { taskId, envelope: { schemaVersion: 1, bindingId: ready.bindingId, executionUnitId: ready.executionUnitId, workerInstanceId: ready.workerInstanceId, sourceStreamId: "source-stream",
        event: createNormalizedRuntimeEventV1({ protocolVersion: 1, workspaceId: ids.workspace(context.workspaceId), runtimeSessionId: ids.session("native-session"), runtimeInstanceId: "runtime",
          source: { adapter: "synthetic", runtime: { implementation: "synthetic", version: "1.0.0" }, surface: "rpc", eventType: "agent_settled" }, sequence: { domain: "output-physical", value: 1 }, observedAt: clock,
          provenance: "observed", persistence: "durable", stability: "settled", compatibility: "required", correlation: { observed: {}, normalized: { agentRunId: "agent-run" } }, data: { kind: "agent.lifecycle", phase: "settled" } }) } });
    },
  };
}
test("T06 cancellation retains a complete atomic result, Episode, receipt and durable replay across reopen", t => {
  const f = fixture(t), bound = f.store.outcomes.bindPlan(context, f.plan); assert.equal(bound.replay, false); assert.equal(f.store.outcomes.bindPlan(context, f.plan).replay, true);
  f.setTime("2026-10-12T00:00:01.000Z"); f.store.tasks.executeTask(context, parseLocalApiCommandV1({ schemaVersion: 1, commandId: "cancel", idempotencyKey: "cancel", workspaceId: context.workspaceId, expectedRevision: f.plan.expectedRevision, payload: { kind: "task.cancel", targetRef: { kind: "task", id: f.taskId, revision: f.plan.expectedRevision } } }));
  const task = f.store.tasks.getTask(context.workspaceId, f.taskId).value!, command = { schemaVersion: 1 as const, commandId: "verify", idempotencyKey: "verify", workspaceId: context.workspaceId, taskId: f.taskId, expectedRevision: task.revision };
  const prepared = f.store.outcomes.prepare(context, command), observed = { schemaVersion: 1 as const, id: "cancel-check", workspaceId: context.workspaceId, taskId: f.taskId,
    attemptId: task.attempts.at(-1)!.id, intentRevision: 1, criterionId: "artifact", criterionRevision: 1, observedAt: prepared.snapshot.preparedAt, notAfter: prepared.snapshot.notAfter,
    payload: { kind: "unknown" as const, reason: "incomplete" as const } };
  const committed = f.store.outcomes.commit(context, prepared.snapshot.id, [observed]); assert.equal(committed.bundle.outcome.status, "cancelled"); assert.equal(committed.bundle.episode.outcomeStatus, "cancelled");
  assert.deepEqual(committed.bundle.memoryUses, []); assert.equal(committed.bundle.learning, "not-scheduled"); assert.deepEqual(f.store.outcomes.read(context.workspaceId, f.taskId), committed.bundle);
  assert.equal(f.store.outcomes.prepare(context, command).committed?.replay, true); f.reopen(); assert.deepEqual(f.store.outcomes.read(context.workspaceId, f.taskId), committed.bundle);
  const db = new DatabaseSync(join(f.dataRoot, "product.sqlite")); try { assert.equal(db.prepare("PRAGMA journal_mode").get()!.journal_mode, "wal"); assert.equal(db.prepare("PRAGMA integrity_check").get()!.integrity_check, "ok");
    assert.equal(db.prepare("SELECT count(*) AS n FROM task_result_v1").get()!.n, 1); assert.equal(db.prepare("SELECT count(*) AS n FROM outcome_observation_v1").get()!.n, 1); } finally { db.close(); }
});
test("declared artifact checks commit completed from observed content, while settled remains VERIFYING", t => {
  const f = fixture(t); f.store.outcomes.bindPlan(context, f.plan); f.settle(); const task = f.store.tasks.getTask(context.workspaceId, f.taskId).value!; assert.equal(task.state, "VERIFYING");
  const command = { schemaVersion: 1 as const, commandId: "verify-content", idempotencyKey: "verify-content", workspaceId: context.workspaceId, taskId: f.taskId, expectedRevision: task.revision }, prepared = f.store.outcomes.prepare(context, command);
  const observed = { schemaVersion: 1 as const, id: "observed-artifact", workspaceId: context.workspaceId, taskId: f.taskId, attemptId: task.attempts.at(-1)!.id, intentRevision: 1,
    criterionId: "artifact", criterionRevision: 1, observedAt: prepared.snapshot.preparedAt, notAfter: prepared.snapshot.notAfter,
    payload: { kind: "artifact" as const, resourceId: "sample", artifact: { kind: "artifact" as const, id: "sample-version", version: 1 }, text: '{"count":8}' } };
  const result = f.store.outcomes.commit(context, prepared.snapshot.id, [observed]); assert.equal(result.bundle.outcome.status, "completed"); assert.equal(result.bundle.task.state, "COMPLETED");
  assert.equal(result.bundle.episode.artifacts[0]!.id, "sample-version"); assert.equal(f.store.outcomes.prepare(context, command).committed?.replay, true);
});

function serviceFixture(t: TestContext, subjective = false) {
  const f = fixture(t, subjective), reader = createSyntheticOutcomeReaderV1(); t.after(() => reader.close());
  const application = createPersistentSessionApplication({ store: () => f.store, daemonInstanceId: () => context.daemonInstanceId });
  const service = createOutcomeServiceV1({ store: () => f.store, application, reader, ids: { next: randomUUID }, now: f.now });
  service.bindPlan(context, f.plan); return { ...f, get store() { return f.store; }, reader, application, service };
}
test("the fixed daemon reader checks actual owned file content and executes its deterministic check", t => {
  for (const count of [8, 7]) {
    const f = serviceFixture(t), plan = f.store.outcomes.readPlan(context.workspaceId, f.taskId)!;
    f.reader.setSample(context.workspaceId, f.taskId, plan.taskAttempt.attemptId, JSON.stringify({ count })); f.settle();
    const task = f.store.tasks.getTask(context.workspaceId, f.taskId).value!, command = { schemaVersion: 1 as const, commandId: "actual-file", idempotencyKey: "actual-file", workspaceId: context.workspaceId, taskId: f.taskId, expectedRevision: task.revision };
    const result = f.service.verify(context, command); assert.equal(result.bundle.outcome.status, count === 8 ? "completed" : "failed");
    assert.equal(result.bundle.observations[0]!.payload.kind, "artifact"); const snapshot = f.store.outcomes.prepare(context, command).snapshot;
    const observed = f.reader.read(snapshot, { criterionId: "unused-test", criterionRevision: 1, kind: "deterministic-test", resourceId: "sample-test" });
    assert.equal(observed.kind, "deterministic-test"); if (observed.kind === "deterministic-test") assert.equal(observed.exitCode, count === 8 ? 0 : 1);
  }
});
test("a paired confirmation and later negative feedback append versions without overwriting the first terminal state", t => {
  const f = serviceFixture(t, true); f.settle(); const task = f.store.tasks.getTask(context.workspaceId, f.taskId).value!;
  const unknown = f.service.verify(context, { schemaVersion: 1, commandId: "unknown", idempotencyKey: "unknown", workspaceId: context.workspaceId, taskId: f.taskId, expectedRevision: task.revision });
  assert.equal(unknown.bundle.outcome.status, "unverifiable");
  const confirm = parseLocalApiCommandV1({ schemaVersion: 1, commandId: "confirm", idempotencyKey: "confirm", workspaceId: context.workspaceId, expectedRevision: unknown.bundle.task.revision,
    payload: { kind: "task.confirm-result", targetRef: { kind: "task", id: f.taskId, revision: unknown.bundle.task.revision }, attemptId: task.attempts.at(-1)!.id, intentRevision: 1,
      criterionId: "artifact", criterionRevision: 1, evidenceRefs: [{ id: unknown.bundle.observations[0]!.id, revision: 1 }] } });
  const accepted = f.service.confirm(context, confirm); assert.equal(accepted.bundle.outcome.status, "completed"); assert.equal(accepted.bundle.task.state, "UNVERIFIABLE");
  assert.equal(f.service.confirm(context, confirm).replay, true);
  const rejected = f.service.feedback(context, { schemaVersion: 1, commandId: "reject", idempotencyKey: "reject", workspaceId: context.workspaceId, taskId: f.taskId,
    expectedRevision: accepted.bundle.task.revision, attemptId: task.attempts.at(-1)!.id, intentRevision: 1, outcomeId: accepted.bundle.outcome.id,
    outcomeRevision: accepted.bundle.outcome.revision, criterionId: "artifact", criterionRevision: 1, decision: "rejected" });
  assert.equal(rejected.bundle.outcome.status, "failed"); assert.equal(rejected.bundle.episode.version, 3); assert.equal(rejected.bundle.task.state, "UNVERIFIABLE");
  f.reopen(); assert.deepEqual(f.service.history(context, f.taskId).map(item => item.outcome.status), ["unverifiable", "completed", "failed"]);
  assert.deepEqual(f.service.read(context, f.taskId), rejected.bundle);
});
test("stale verification rolls back all T06 rows and never publishes a partial result", t => {
  const f = fixture(t); f.store.outcomes.bindPlan(context, f.plan); f.settle(); const task = f.store.tasks.getTask(context.workspaceId, f.taskId).value!;
  const command = { schemaVersion: 1 as const, commandId: "expired", idempotencyKey: "expired", workspaceId: context.workspaceId, taskId: f.taskId, expectedRevision: task.revision }, prepared = f.store.outcomes.prepare(context, command);
  const observation = { schemaVersion: 1 as const, id: "rollback-first", workspaceId: context.workspaceId, taskId: f.taskId, attemptId: task.attempts.at(-1)!.id, intentRevision: 1,
    criterionId: "artifact", criterionRevision: 1, observedAt: prepared.snapshot.preparedAt, notAfter: prepared.snapshot.notAfter, payload: { kind: "unknown" as const, reason: "missing-evidence" as const } };
  const before = f.store.listObservations({ kind: "task", workspaceId: context.workspaceId, taskId: f.taskId }).length;
  assert.throws(() => f.store.outcomes.commit(context, prepared.snapshot.id, [observation, { ...observation, id: "rollback-extra" }]), { code: "validation" });
  assert.equal(f.store.listObservations({ kind: "task", workspaceId: context.workspaceId, taskId: f.taskId }).length, before);
  f.setTime(prepared.snapshot.notAfter);
  assert.throws(() => f.store.outcomes.commit(context, prepared.snapshot.id, []), { code: "revision_conflict" });
  assert.equal(f.store.tasks.getTask(context.workspaceId, f.taskId).value!.revision, task.revision); assert.equal(f.store.outcomes.read(context.workspaceId, f.taskId), undefined);
  const db = new DatabaseSync(join(f.dataRoot, "product.sqlite")); try { for (const table of ["task_result_v1", "outcome_observation_v1"]) assert.equal(db.prepare(`SELECT count(*) AS n FROM ${table}`).get()!.n, 0); } finally { db.close(); }
});
test("result HTTP routes keep pairing, workspace filtering and exact confirmation/feedback boundaries", async t => {
  const f = serviceFixture(t, true), api = createSyntheticSessionApi({ application: f.application, outcomes: f.service, installationId: "synthetic-result-api" }); t.after(() => api.close());
  const origin = await api.listen(), pair = await fetch(`${origin}/v1/pair`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ schemaVersion: 1, clientKind: "cli", bootstrapCode: api.issuePairingCode("cli", "a"), clientNonce: "syntheticResultApiNonce01234567890123456789" }) });
  const credential = (await pair.json() as { credential: string }).credential, headers = { "content-type": "application/json", authorization: `Bearer ${credential}` }; assert.equal(pair.status, 200);
  f.settle(); const task = f.store.tasks.getTask(context.workspaceId, f.taskId).value!, command = { schemaVersion: 1, commandId: "http", idempotencyKey: "http", workspaceId: context.workspaceId, taskId: f.taskId, expectedRevision: task.revision };
  const forged = await fetch(`${origin}/v1/tasks/${f.taskId}/verification`, { method: "POST", headers, body: JSON.stringify({ ...command, completed: true }) }); assert.equal(forged.status, 400);
  const result = await fetch(`${origin}/v1/tasks/${f.taskId}/verification`, { method: "POST", headers, body: JSON.stringify(command) }); assert.equal(result.status, 200);
  const body = await result.json() as { value: TaskResultBundleV1 }; assert.equal(body.value.outcome.status, "unverifiable");
  const confirmation = { schemaVersion: 1, commandId: "http-confirm", idempotencyKey: "http-confirm", workspaceId: context.workspaceId, expectedRevision: body.value.task.revision,
    payload: { kind: "task.confirm-result", targetRef: { kind: "task", id: f.taskId, revision: body.value.task.revision }, attemptId: task.attempts.at(-1)!.id, intentRevision: 1,
      criterionId: "artifact", criterionRevision: 1, evidenceRefs: [{ id: body.value.observations[0]!.id, revision: 1 }] } };
  const confirmed = await fetch(`${origin}/v1/tasks/${f.taskId}/commands`, { method: "POST", headers, body: JSON.stringify(confirmation) }); assert.equal(confirmed.status, 200);
  const current = f.service.read(context, f.taskId); assert.equal(current.outcome.status, "completed");
  const feedback = { schemaVersion: 1, commandId: "http-reject", idempotencyKey: "http-reject", workspaceId: context.workspaceId, taskId: f.taskId, expectedRevision: current.task.revision,
    attemptId: task.attempts.at(-1)!.id, intentRevision: 1, outcomeId: current.outcome.id, outcomeRevision: current.outcome.revision, criterionId: "artifact", criterionRevision: 1, decision: "rejected" };
  const negative = await fetch(`${origin}/v1/tasks/${f.taskId}/feedback`, { method: "POST", headers, body: JSON.stringify(feedback) }); assert.equal(negative.status, 200);
  assert.equal((await negative.json() as { value: TaskResultBundleV1 }).value.outcome.status, "failed");
  assert.equal((await fetch(`${origin}/v1/tasks/${f.taskId}/result?workspaceId=synthetic-workspace-b`, { headers })).status, 404);
  assert.equal((await fetch(`${origin}/v1/tasks/${f.taskId}/result?workspaceId=${context.workspaceId}`, { headers })).status, 200);
});
