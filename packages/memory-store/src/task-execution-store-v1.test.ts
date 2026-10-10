import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { ids, type Task, type PrivacyV2 } from "../../domain/src/index.ts";
import { createNormalizedRuntimeEventV1, parseSessionTaskV1, type ExecutionSpecV1, type RuntimeBindingV1,
  type NormalizedRuntimeEnvelopeV1, type SessionContractV1, type RuntimeProcessCloseEvidenceV1 } from "../../protocol/src/index.ts";
import { openSyntheticCognitionStoreV2, CognitiveStoreErrorV2, type SyntheticCognitionStoreV2 } from "./cognitive-store-v2.ts";
import type { TaskPersistenceBoundaryV1, TaskStoreContextV1, TaskRuntimeCommandV1 } from "./task-store-v1-types.ts";

// Entirely invented local data. No process, provider, credential, real user data or external effect.
const T0 = "2026-10-10T00:00:00.000Z", T1 = "2026-10-10T00:01:00.000Z", EXPIRY = "2026-10-10T01:00:00.000Z";
const W = "workspace-synthetic", INSTANCE = "daemon-synthetic";
const context: TaskStoreContextV1 = { principalId: "principal-synthetic", workspaceId: W, daemonInstanceId: INSTANCE, ownerEpoch: 1 };
const contract: SessionContractV1 = { schemaVersion: 1, runtimeProfile: { id: "synthetic-runtime", revision: 1 }, modelProfile: { id: "synthetic-model", revision: 1 },
  toolProfile: { id: "none", revision: 1 }, policyProfile: { id: "synthetic-policy", revision: 1 }, dataProfile: { id: "synthetic-data", revision: 1 },
  compilerProfile: { id: "synthetic-compiler", revision: 1 }, interactionKind: "interactive" };
function code(work: () => unknown, expected: string): void { assert.throws(work, (error: unknown) => error instanceof CognitiveStoreErrorV2 && error.code === expected); }
function fixture(t: TestContext, privacy: PrivacyV2 = "model-allowed", declared?: TaskPersistenceBoundaryV1["runtimeSourceIdentity"], custody?: TaskPersistenceBoundaryV1["recoveryCustody"]) {
  const root = mkdtempSync(join(tmpdir(), "zhiwei-normal-execution-v1-")), dataRoot = join(root, "data"), controlRoot = join(root, "control");
  mkdirSync(dataRoot, { mode: 0o700 }); let counter = 0, now = T0, daemon = INSTANCE, rejectSettled = false;
  const reduce: TaskPersistenceBoundaryV1["reduce"] = (current, command, ctx) => {
    if (!current && command.payload.kind === "task.create") {
      const intent = { revision: 1, request: command.payload.request, constraints: command.payload.constraints, criteria: command.payload.acceptanceChecks };
      const initial = parseSessionTaskV1({ id: ctx.taskId, workspaceId: W, sessionId: ctx.session.id, revision: 1, intent, state: "CREATED", createdAt: ctx.now, updatedAt: ctx.now,
        attempts: [{ id: ctx.attemptId, taskId: ctx.taskId, workspaceId: W, intent: structuredClone(intent), state: "CREATED", createdAt: ctx.now, updatedAt: ctx.now,
          pauseRequested: false, cancellationRequested: false, completeness: "not-settled", outcomes: [], unresolvedActions: [] }] });
      return { versions: [initial, change(initial, "READY", ctx.now)] };
    }
    assert.ok(current);
    if (command.payload.kind === "task.runtime") {
      if (command.payload.event === "settled" && rejectSettled) throw new CognitiveStoreErrorV2("conflict");
      const state = command.payload.event === "start" ? "RUNNING" : command.payload.event === "settled" ? "VERIFYING" : command.payload.event === "confirm-stop" ? "CANCELLED" : "READY";
      return { versions: [change(current, state, ctx.now)] };
    }
    if (command.payload.kind === "task.cancel") return { versions: [change(current, "CANCELLING", ctx.now)] };
    throw new Error("Unsupported synthetic command");
  };
  function boundary(): TaskPersistenceBoundaryV1 { return { daemonInstanceId: daemon, contentPolicy: { privacy, retentionUntil: "2026-11-10T00:00:00.000Z" },
    ids: { next: kind => { counter++; return kind === "content" || kind === "reservation" ? `00000000-0000-4000-8000-${counter.toString(16).padStart(12, "0")}` : `${kind}-synthetic-${counter}`; } },
    reduce, ...(declared ? { runtimeSourceIdentity: declared } : {}), ...(custody ? { recoveryCustody: custody } : {}) }; }
  let store: SyntheticCognitionStoreV2 = openSyntheticCognitionStoreV2({ dataRoot, controlRoot, installationId: "installation-synthetic", mode: "create", clock: { now: () => now }, taskPersistence: boundary() });
  t.after(() => { try { store.close(); } finally { rmSync(root, { recursive: true, force: true }); } });
  const session = store.tasks.createSession(context, { schemaVersion: 1, commandId: "create-session", idempotencyKey: "create-session", workspaceId: W, expectedRevision: 0,
    payload: { kind: "session.create", contract } }).receipt.aggregate.id;
  const created = store.tasks.executeTask(context, { schemaVersion: 1, commandId: "create-task", idempotencyKey: "create-task", workspaceId: W, expectedRevision: 0,
    payload: { kind: "task.create", sessionId: session, executionProfile: contract.runtimeProfile, request: "SYNTHETIC ONLY: summarize the fictional lantern.", constraints: [],
      acceptanceChecks: [{ id: "criterion-synthetic" as Task["intent"]["criteria"][number]["id"], revision: 1, description: "Synthetic evidence required", required: true, method: "user-confirmation" }] } });
  const taskId = created.receipt.aggregate.id, task = store.tasks.getTask(W, taskId).value!, attemptId = task.attempts[0]!.id;
  const input = store.tasks.recordRuntimeInput(context, { commandId: "runtime-input", idempotencyKey: "runtime-input", taskId, expectedRevision: task.revision,
    attemptId, intentRevision: 1, text: task.intent.request });
  const global = store.registerScope({ kind: "global" }), workspace = store.registerScope({ kind: "workspace", workspaceId: W });
  const runtime = { implementation: declared?.bindingImplementation ?? "synthetic", version: declared?.version ?? "1.0.0" };
  const spec: ExecutionSpecV1 = { schemaVersion: 1, executionUnitId: "execution-synthetic", workspaceId: W, sessionId: session, prompt: input.snapshot.text,
    requestSnapshotRef: input.contentRef, fence: { installationId: "installation-synthetic", recoveryEpoch: String(global.recoveryEpoch), owner: { kind: "task_attempt", id: attemptId },
      sourceTask: { taskId, attemptId, intentRevision: 1 }, contractRevision: 1, leaseEpoch: 1, cognition: { global: global.cognitionEpoch, workspace: workspace.cognitionEpoch },
      policy: { global: global.policyEpoch, workspace: workspace.policyEpoch }, notAfter: EXPIRY }, selectedModelProfile: contract.modelProfile, toolProfile: "none",
    bounds: { maxOutputBytes: 65536, maxDurationMs: 5000, maxTokens: 1000, maxModelRequests: 2, maxToolCalls: 0 }, controlledCwdRef: "synthetic-cwd" };
  const allocated: RuntimeBindingV1 = { schemaVersion: 1, bindingId: "binding-synthetic", executionUnitId: spec.executionUnitId, workspaceId: W, sessionId: session,
    owner: { kind: "task_attempt", id: attemptId }, workerInstanceId: "worker-synthetic", leaseEpoch: 1, profileRevision: 1, runtime, state: "ALLOCATED", observedRuntimeSessionIds: [], sourceStreams: [] };
  const ready: RuntimeBindingV1 = { ...allocated, state: "READY", observedRuntimeSessionIds: ["native-synthetic"],
    sourceStreams: [{ sourceStreamId: "stream-synthetic", surface: "rpc", runtimeInstanceId: "runtime-synthetic", sequenceDomain: "output-physical" }] };
  const api = {
    get store() { return store; }, dataRoot, taskId, attemptId, session, spec, allocated, ready, input,
    setTime(value: string) { now = value; }, rejectSettlement() { rejectSettled = true; },
    reopen(newDaemon?: string) { store.close(); daemon = newDaemon ?? daemon; store = openSyntheticCognitionStoreV2({ dataRoot, controlRoot, installationId: "installation-synthetic", mode: "open", clock: { now: () => now }, taskPersistence: boundary() }); },
    allocate() { return store.executions.allocateExecution(context, { taskId, expectedRevision: task.revision, spec, binding: allocated }); },
    prepare() { api.allocate(); return store.executions.markExecutionReady(context, { taskId, binding: ready }); },
    runtime(event: TaskRuntimeCommandV1["payload"]["event"], evidenceId: string, revision: number) {
      return store.tasks.executeTask(context, { schemaVersion: 1, commandId: `command-${event}`, idempotencyKey: `command-${event}`, workspaceId: W,
        expectedRevision: store.tasks.getTask(W, taskId).value!.revision, payload: { kind: "task.runtime", taskId, event, evidenceRefs: [{ id: evidenceId, revision }] } });
    },
    start() { const prepared = api.prepare(); api.runtime("start", prepared.bindingId, prepared.revision); return store.executions.markExecutionDispatched(context, { taskId, bindingId: allocated.bindingId }); },
    envelope(sequence = 1, settled = false, binding: RuntimeBindingV1 = ready): NormalizedRuntimeEnvelopeV1 {
      const stream = binding.sourceStreams[0]!;
      return { schemaVersion: 1, bindingId: binding.bindingId, executionUnitId: binding.executionUnitId, workerInstanceId: binding.workerInstanceId, sourceStreamId: stream.sourceStreamId,
        event: createNormalizedRuntimeEventV1({ protocolVersion: 1, workspaceId: ids.workspace(W), runtimeSessionId: ids.session(binding.observedRuntimeSessionIds[0]!), runtimeInstanceId: stream.runtimeInstanceId,
          source: { adapter: declared?.adapter ?? "synthetic", runtime: { implementation: declared?.implementation ?? "synthetic", version: runtime.version }, surface: stream.surface, eventType: settled ? "agent_settled" : "queue_state" },
          sequence: { domain: stream.sequenceDomain, value: sequence }, observedAt: now, provenance: "observed", persistence: "durable", stability: settled ? "settled" : "boundary", compatibility: "required",
          correlation: { observed: {}, normalized: { agentRunId: "run-synthetic" } },
          data: settled ? { kind: "agent.lifecycle", phase: "settled" } : { kind: "queue.changed", queue: "follow-up", pending: 0, mode: "one-at-a-time" } }) };
    },
    ingest(envelope: NormalizedRuntimeEnvelopeV1) { return store.executions.ingestExecutionEvent(context, { taskId, envelope }); },
    model(requestId = "model-request", projected: unknown = { messages: [{ role: "user", content: "Synthetic projected request" }] }, maxTokens = 100) {
      return store.executions.recordModelRequest(context, { taskId, bindingId: allocated.bindingId, requestId, context: projected as never, maxTokens });
    },
    close(full = true) { return store.executions.closeExecution(context, { taskId, evidence: { schemaVersion: 1, bindingId: allocated.bindingId, stdoutEof: true,
      stderrEof: full, closeObserved: full, exitCode: full ? 0 : null, signal: null, observedAt: now } }); },
  };
  return api;
}
function change(task: Task, state: Task["state"], at: string): Task {
  return parseSessionTaskV1({ ...task, revision: task.revision + 1, state, updatedAt: at, attempts: task.attempts.map((attempt, index) => index !== task.attempts.length - 1 ? attempt : {
    ...attempt, state, updatedAt: at, cancellationRequested: attempt.cancellationRequested || state === "CANCELLING" || state === "CANCELLED",
    completeness: state === "VERIFYING" || state === "CANCELLED" ? "complete" : attempt.completeness }) });
}

test("allocation precedes READY and dispatch; durable exact spec and binding survive reopen", t => {
  const f = fixture(t); assert.equal(f.store.executions.readExecution(W, f.taskId), undefined);
  assert.equal(f.allocate().state, "ALLOCATED"); code(() => f.store.executions.markExecutionDispatched(context, { taskId: f.taskId, bindingId: f.allocated.bindingId }), "conflict");
  const ready = f.store.executions.markExecutionReady(context, { taskId: f.taskId, binding: f.ready }); assert.equal(ready.revision, 2);
  f.reopen(); const exact = f.store.executions.readExecutionDetails(W, f.taskId)!;
  assert.deepEqual(exact.spec, f.spec); assert.deepEqual(exact.binding, f.ready); assert.equal(exact.dispatched, false);
  assert.equal(f.store.executions.readExecution("other-workspace", f.taskId), undefined);
  f.runtime("start", ready.bindingId, ready.revision);
  assert.equal(f.store.executions.markExecutionDispatched(context, { taskId: f.taskId, bindingId: ready.bindingId }).state, "BUSY");
});
test("source checkpoints accept raw numeric jumps, reject rewinds and replay conflicts", t => {
  const f = fixture(t); f.start(); const first = f.envelope(3), second = f.envelope(7);
  const receipt = f.ingest(first); assert.deepEqual(f.ingest(first), { ...receipt, replay: true }); f.ingest(second);
  code(() => f.ingest(f.envelope(4)), "sequence");
  f.setTime(T1); code(() => f.ingest(f.envelope(7)), "conflict");
  f.reopen(); assert.equal(f.ingest(first).commitCursor, receipt.commitCursor);
});
test("settled intake atomically commits VERIFYING and its final acknowledgement", t => {
  const f = fixture(t); f.start(); const envelope = f.envelope(4, true), committed = f.ingest(envelope);
  const task = f.store.tasks.getTask(W, f.taskId); assert.equal(task.value!.state, "VERIFYING"); assert.equal(committed.commitCursor, task.commitCursor);
  const events = f.store.tasks.replay(W).events; assert.equal(events.at(-2)!.event.type, "task.progress"); assert.equal(events.at(-1)!.event.type, "task.state_changed");
  assert.deepEqual(f.ingest(envelope), { ...committed, replay: true });
});
test("settlement failure rolls back envelope, source checkpoint, progress and task together", t => {
  const f = fixture(t); f.start(); const before = f.store.tasks.snapshot(W).commitCursor; f.rejectSettlement();
  code(() => f.ingest(f.envelope(5, true)), "conflict"); assert.equal(f.store.tasks.snapshot(W).commitCursor, before);
  assert.equal(f.store.tasks.getTask(W, f.taskId).value!.state, "RUNNING");
  assert.equal(f.ingest(f.envelope(2)).sourceSequence, 2);
});
test("actual projected model context is durable before use, bounded and exact-replay only", t => {
  const f = fixture(t); f.start(); const saved = f.model(); assert.equal(saved.replay, false); assert.equal(saved.ordinal, 1);
  assert.deepEqual(f.model(), { ...saved, replay: true }); code(() => f.model("model-request", { messages: [] }), "conflict");
  code(() => f.model("too-many-tokens", {}, 1001), "conflict"); f.model("second-request"); code(() => f.model("third-request"), "conflict");
  f.reopen(); const rows = f.store.executions.listModelRequests(W, f.taskId, f.attemptId); assert.equal(rows.length, 2);
  assert.deepEqual(rows[0]!.contentRef, saved.contentRef); assert.equal(rows[0]!.maxTokens, 100);
  assert.deepEqual(f.store.executions.listModelRequests("another-workspace", f.taskId, f.attemptId), []);
});
test("model reasoning blocks, accessors and oversize request contexts are rejected before persistence", t => {
  const f = fixture(t); f.start();
  for (const value of [{ thinking: "not retained" }, { messages: [{ content: [{ type: "thinking", text: "not retained" }] }] }, { value: "x".repeat(262145) }]) code(() => f.model("invalid", value), "validation");
  let read = false; const accessor = Object.defineProperty({}, "messages", { enumerable: true, get() { read = true; return []; } });
  code(() => f.model("accessor", accessor), "validation"); assert.equal(read, false);
  const array = ["placeholder"]; Object.defineProperty(array, "0", { get() { read = true; return "hidden"; } });
  code(() => f.model("array-accessor", array), "validation"); assert.equal(read, false);
  assert.equal(f.store.executions.listModelRequests(W, f.taskId, f.attemptId).length, 0);
});
test("late model capture after settling cannot start a new effect", t => {
  const f = fixture(t); f.start(); const old = f.model(); f.ingest(f.envelope(1, true));
  assert.equal(f.model().ordinal, old.ordinal); code(() => f.model("late-request"), "conflict");
});
test("DRAINING is an observed monotonic state with no new model request", t => {
  const f = fixture(t); f.start(); const draining: RuntimeBindingV1 = { ...f.ready, state: "DRAINING" };
  const result = f.store.executions.observeExecutionBinding(context, { taskId: f.taskId, binding: draining }); assert.equal(result.state, "DRAINING");
  code(() => f.model(), "conflict"); f.ingest(f.envelope(8));
  code(() => f.store.executions.observeExecutionBinding(context, { taskId: f.taskId, binding: { ...f.ready, state: "BUSY" } }), "conflict");
  assert.equal(f.close().state, "STOPPED"); f.reopen(); assert.equal(f.store.executions.readExecution(W, f.taskId)!.closed, true);
});
test("native session and source observations may expand, never shrink or rewrite", t => {
  const f = fixture(t); f.start();
  const extension: RuntimeBindingV1 = { ...f.ready, state: "BUSY", observedRuntimeSessionIds: [...f.ready.observedRuntimeSessionIds, "native-second"],
    sourceStreams: [...f.ready.sourceStreams, { sourceStreamId: "stream-extension", surface: "extension", runtimeInstanceId: "extension-instance", sequenceDomain: "extension-lifecycle" }] };
  f.store.executions.observeExecutionBinding(context, { taskId: f.taskId, binding: extension });
  const observed: RuntimeBindingV1 = { ...extension, sourceStreams: [extension.sourceStreams[1]!], observedRuntimeSessionIds: ["native-second"] };
  f.ingest(f.envelope(12, false, observed));
  code(() => f.store.executions.observeExecutionBinding(context, { taskId: f.taskId, binding: { ...f.ready, state: "BUSY" } }), "conflict");
  f.reopen(); assert.equal(f.store.executions.readExecutionDetails(W, f.taskId)!.binding.sourceStreams.length, 2);
});
test("partial transport close never implies task success, complete close is immutable", t => {
  const f = fixture(t); f.start(); assert.equal(f.close(false).closed, false); assert.equal(f.close().closed, true); assert.equal(f.close().closed, true);
  assert.equal(f.store.tasks.getTask(W, f.taskId).value!.state, "RUNNING"); code(() => f.close(false), "conflict");
});
test("local-only input cannot cross allocation or model boundary", t => { const f = fixture(t, "local-only"); code(() => f.allocate(), "unavailable"); });
test("fixed neutral source declaration is persisted and exact, never supplied per allocation", t => {
  const f = fixture(t, "model-allowed", { bindingImplementation: "pi", adapter: "pi", implementation: "@earendil-works/pi-coding-agent", version: "0.84.1" });
  f.start(); f.ingest(f.envelope(1)); assert.equal(f.store.executions.readExecutionDetails(W, f.taskId)!.sourceIdentity.implementation, "@earendil-works/pi-coding-agent");
  const wrong = f.envelope(2); const { eventId: _id, idempotencyKey: _key, ...draft } = wrong.event;
  code(() => f.ingest({ ...wrong, event: createNormalizedRuntimeEventV1({ ...draft, source: { ...draft.source, runtime: { ...draft.source.runtime, version: "0.84.2" } } }) }), "conflict");
  code(() => f.store.executions.allocateExecution(context, { taskId: f.taskId, expectedRevision: 2, spec: f.spec, binding: f.allocated, expectedSourceIdentity: {} } as never), "validation");
});
test("expired lease rejects new intake but preserves exact committed replay and close fact", t => {
  const f = fixture(t); f.start(); const event = f.envelope(1), saved = f.ingest(event); f.setTime(EXPIRY);
  assert.deepEqual(f.ingest(event), { ...saved, replay: true }); code(() => f.ingest(f.envelope(2)), "conflict"); code(() => f.model(), "conflict"); assert.equal(f.close().closed, true);
});
test("new daemon owner fences old binding and never auto dispatches historical work", t => {
  const f = fixture(t); f.start(); f.reopen("replacement-daemon");
  code(() => f.ingest(f.envelope(1)), "conflict"); assert.equal(f.store.executions.readExecution(W, f.taskId)!.state, "BUSY");
});
test("wrong Worker and unobserved complete source identities cannot change checkpoints", t => {
  const f = fixture(t); f.start(); const event = f.envelope(1);
  code(() => f.ingest({ ...event, workerInstanceId: "wrong-worker" }), "conflict"); code(() => f.ingest({ ...event, sourceStreamId: "unobserved-stream" }), "conflict");
  assert.equal(f.ingest(event).replay, false);
});
test("global policy epoch changes invalidate intake despite unchanged task scope", t => {
  const f = fixture(t); f.start(); const event = f.envelope(1), committed = f.ingest(event);
  const db = new DatabaseSync(join(f.dataRoot, "product.sqlite"));
  try { db.prepare("UPDATE scope_catalog SET policy_epoch=policy_epoch+1 WHERE scope_json=?").run('{"kind":"global"}'); } finally { db.close(); }
  assert.deepEqual(f.ingest(event), { ...committed, replay: true }); code(() => f.ingest(f.envelope(2)), "conflict");
});
test("orphan or drifted checkpoints are corruption on verified reads", t => {
  const f = fixture(t); f.start(); const earlier = f.envelope(1); f.ingest(earlier); f.ingest(f.envelope(2));
  const db = new DatabaseSync(join(f.dataRoot, "product.sqlite"));
  try { db.prepare("UPDATE task_execution_stream_v1 SET last_sequence=9,last_event_id=?").run(earlier.event.eventId); } finally { db.close(); }
  code(() => f.store.executions.readExecution(W, f.taskId), "corruption");
});
test("numeric reasoning usage counters are retained without allowing reasoning text", t => {
  const f = fixture(t); f.start(); f.model("usage", { usage: { input: 5, output: 8, reasoning: 0 } });
  assert.deepEqual(f.store.executions.listModelRequests(W, f.taskId, f.attemptId)[0]!.context, { usage: { input: 5, output: 8, reasoning: 0 } });
  code(() => f.model("text", { usage: { reasoning: "secret thought" } }), "validation"); code(() => f.model("negative", { usage: { reasoning: -1 } }), "validation");
});
test("allocation rechecks exact task revision, committed input, model and owner fence", t => {
  const f = fixture(t), allocate = (spec: ExecutionSpecV1, expectedRevision = 2) => f.store.executions.allocateExecution(context, { taskId: f.taskId, expectedRevision, spec, binding: f.allocated });
  code(() => allocate(f.spec, 1), "revision_conflict"); code(() => allocate({ ...f.spec, prompt: "different input" }), "conflict");
  code(() => allocate({ ...f.spec, selectedModelProfile: { ...f.spec.selectedModelProfile, revision: 2 } }), "conflict");
  code(() => allocate({ ...f.spec, fence: { ...f.spec.fence, policy: { ...f.spec.fence.policy, global: 5 } } }), "conflict");
  code(() => f.store.executions.allocateExecution({ ...context, ownerEpoch: 2 }, { taskId: f.taskId, expectedRevision: 2, spec: f.spec, binding: f.allocated }), "conflict");
  assert.equal(f.store.executions.readExecution(W, f.taskId), undefined); assert.equal(f.allocate().revision, 1);
});
test("cancellation fences model request capture before closed transport confirmation", t => {
  const f = fixture(t); f.start(); f.store.tasks.executeTask(context, { schemaVersion: 1, commandId: "cancel", idempotencyKey: "cancel", workspaceId: W, expectedRevision: 3,
    payload: { kind: "task.cancel", targetRef: { kind: "task", id: f.taskId, revision: 3 } } });
  code(() => f.model(), "conflict"); const closed = f.close(); f.runtime("confirm-stop", closed.bindingId, closed.revision);
  assert.equal(f.store.tasks.getTask(W, f.taskId).value!.state, "CANCELLED"); code(() => f.model(), "conflict");
});
test("managed execution and model bodies disappear under the same task privacy lifecycle", t => {
  const f = fixture(t); f.start(); f.model(); f.ingest(f.envelope(1));
  f.store.applyControlIntent({ kind: "FORGET", operationId: "forget-execution-task", at: T0, authorization: "synthetic-user-request",
    targets: [{ kind: "scope", scope: { kind: "task", workspaceId: W, taskId: f.taskId } }] });
  code(() => f.store.executions.readExecutionDetails(W, f.taskId), "unavailable"); code(() => f.store.executions.listModelRequests(W, f.taskId, f.attemptId), "unavailable");
  f.reopen(); code(() => f.store.executions.readExecution(W, f.taskId), "unavailable");
});
test("READY task cannot dispatch before the durable RUNNING start transition", t => {
  const f = fixture(t), ready = f.prepare(), before = f.store.tasks.snapshot(W).commitCursor;
  code(() => f.store.executions.markExecutionDispatched(context, { taskId: f.taskId, bindingId: ready.bindingId }), "conflict");
  assert.equal(f.store.executions.readExecution(W, f.taskId)!.dispatched, false);
  assert.equal(f.store.executions.readExecution(W, f.taskId)!.revision, ready.revision);
  assert.equal(f.store.tasks.snapshot(W).commitCursor, before);
  f.runtime("start", ready.bindingId, ready.revision);
  const dispatched = f.store.executions.markExecutionDispatched(context, { taskId: f.taskId, bindingId: ready.bindingId });
  assert.equal(dispatched.dispatched, true);
  assert.deepEqual(f.store.executions.markExecutionDispatched(context, { taskId: f.taskId, bindingId: ready.bindingId }), dispatched);
});
test("undispatched READY binding cannot materialize progress even after Task becomes RUNNING", t => {
  const f = fixture(t), ready = f.prepare(), before = f.store.tasks.snapshot(W).commitCursor, envelope = f.envelope(8);
  code(() => f.ingest(envelope), "conflict");
  assert.equal(f.store.tasks.snapshot(W).commitCursor, before);
  f.runtime("start", ready.bindingId, ready.revision);
  const runningCursor = f.store.tasks.snapshot(W).commitCursor;
  code(() => f.ingest(envelope), "conflict");
  assert.equal(f.store.tasks.snapshot(W).commitCursor, runningCursor);
  f.store.executions.markExecutionDispatched(context, { taskId: f.taskId, bindingId: ready.bindingId });
  const committed = f.ingest(envelope); assert.equal(committed.replay, false);
  assert.deepEqual(f.ingest(envelope), { ...committed, replay: true });
});

// These custody fixtures represent already-recorded synthetic transport observations.
// They do not demonstrate physical custody of a real orphaned process.
type CloseWitness = { spec: ExecutionSpecV1; binding: RuntimeBindingV1; executionRevision: number; evidence: RuntimeProcessCloseEvidenceV1 };
function closeWitness(f: ReturnType<typeof fixture>): CloseWitness {
  const stored = f.store.executions.readExecutionDetails(W, f.taskId)!;
  return { spec: structuredClone(stored.spec), binding: structuredClone(stored.binding), executionRevision: stored.revision,
    evidence: { schemaVersion: 1, bindingId: stored.bindingId, stdoutEof: true, stderrEof: true, closeObserved: true, exitCode: 0, signal: null, observedAt: T0 } };
}
const nextOwner: TaskStoreContextV1 = { ...context, daemonInstanceId: "daemon-custodian", ownerEpoch: 2 };
function recover(f: ReturnType<typeof fixture>, revision: number, ctx = nextOwner) {
  return f.store.executions.recoverExecutionClose(ctx, { taskId: f.taskId, bindingId: f.allocated.bindingId, expectedExecutionRevision: revision });
}
test("new Session owner records exact custody close without rewriting old lease or inventing task outcome", t => {
  let recorded: CloseWitness | undefined, observations = 0;
  const f = fixture(t, "model-allowed", undefined, { observedClose() { observations++; return recorded; } });
  const active = f.start(); assert.equal(active.authority, "current"); recorded = closeWitness(f);
  f.reopen(nextOwner.daemonInstanceId);
  const blocked = f.store.executions.readExecution(W, f.taskId)!;
  assert.equal(blocked.authority, "recovery-blocked"); assert.equal(blocked.closed, false); assert.equal(blocked.state, "BUSY");
  const cursor = f.store.tasks.snapshot(W).commitCursor;
  code(() => f.close(), "conflict"); code(() => f.ingest(f.envelope(1)), "conflict");
  const closed = recover(f, active.revision);
  assert.equal(closed.authority, "closed"); assert.equal(closed.closed, true); assert.equal(closed.state, "STOPPED");
  assert.equal(closed.ownerEpoch, 1); assert.equal(closed.revision, active.revision + 1);
  const details = f.store.executions.readExecutionDetails(W, f.taskId)!;
  assert.deepEqual(details.closeEvidence, recorded.evidence); assert.equal(details.binding.leaseEpoch, 1);
  assert.deepEqual(details.spec, recorded.spec); assert.equal(details.dispatched, true);
  assert.equal(f.store.tasks.getTask(W, f.taskId).value!.state, "RUNNING");
  assert.equal(f.store.tasks.snapshot(W).commitCursor, cursor);
  assert.deepEqual(recover(f, active.revision), closed); assert.deepEqual(recover(f, closed.revision), closed); assert.equal(observations, 1);
  code(() => recover(f, active.revision - 1), "revision_conflict");
  f.reopen(); assert.deepEqual(f.store.executions.readExecution(W, f.taskId), closed);
});
test("recovery authority is derived on read without mutating execution facts", t => {
  const f = fixture(t); const active = f.start(); f.reopen(nextOwner.daemonInstanceId);
  const db = new DatabaseSync(join(f.dataRoot, "product.sqlite"));
  try {
    const before = db.prepare("SELECT * FROM task_execution_v1").all(), count = db.prepare("SELECT count(*) AS n FROM task_execution_snapshot_v1").get()!.n;
    const read = f.store.executions.readExecutionDetails(W, f.taskId)!;
    assert.equal(read.authority, "recovery-blocked"); assert.equal(read.revision, active.revision); assert.equal(read.closed, false); assert.equal(read.closeEvidence, undefined);
    assert.deepEqual(db.prepare("SELECT * FROM task_execution_v1").all(), before);
    assert.equal(db.prepare("SELECT count(*) AS n FROM task_execution_snapshot_v1").get()!.n, count);
  } finally { db.close(); }
});
test("recovery close remains unavailable without a fixed custody port or recorded observation", t => {
  const noPort = fixture(t); const active = noPort.start(); noPort.reopen(nextOwner.daemonInstanceId); code(() => recover(noPort, active.revision), "unavailable");
  const noEvidence = fixture(t, "model-allowed", undefined, { observedClose: () => undefined });
  const other = noEvidence.start(); noEvidence.reopen(nextOwner.daemonInstanceId); code(() => recover(noEvidence, other.revision), "unavailable");
  assert.equal(noEvidence.store.executions.readExecution(W, noEvidence.taskId)!.closed, false);
});
test("custody recovery rejects wrong binding, worker, lease, spec and revision echoes", t => {
  let recorded: CloseWitness | undefined;
  const f = fixture(t, "model-allowed", undefined, { observedClose: () => recorded }); const active = f.start(), exact = closeWitness(f);
  f.reopen(nextOwner.daemonInstanceId);
  const bad: CloseWitness[] = [
    { ...structuredClone(exact), binding: { ...structuredClone(exact.binding), bindingId: "different-binding" } },
    { ...structuredClone(exact), binding: { ...structuredClone(exact.binding), workerInstanceId: "different-worker" } },
    { ...structuredClone(exact), binding: { ...structuredClone(exact.binding), leaseEpoch: 2 } },
    { ...structuredClone(exact), spec: { ...structuredClone(exact.spec), prompt: "different request" } },
    { ...structuredClone(exact), executionRevision: exact.executionRevision + 1 },
    { ...structuredClone(exact), evidence: { ...exact.evidence, bindingId: "different-binding" } },
    { ...structuredClone(exact), evidence: { ...exact.evidence, stderrEof: false } },
    { ...structuredClone(exact), evidence: { ...exact.evidence, observedAt: T1 } },
  ];
  for (const candidate of bad) { recorded = candidate; code(() => recover(f, active.revision), "conflict"); }
  assert.equal(f.store.executions.readExecution(W, f.taskId)!.revision, active.revision);
  recorded = exact; assert.equal(recover(f, active.revision).closed, true);
});
test("custody recovery rejects malformed or asynchronous results and caller close assertions", t => {
  let result: unknown;
  const f = fixture(t, "model-allowed", undefined, { observedClose: () => result as CloseWitness }); const active = f.start(), exact = closeWitness(f);
  f.reopen(nextOwner.daemonInstanceId);
  for (const candidate of [{ ...exact, authorized: true }, { ...exact, evidence: { ...exact.evidence, stdoutEof: "yes" } }, Promise.resolve(exact)]) {
    result = candidate; code(() => recover(f, active.revision), "validation");
  }
  let invoked = false; result = Object.defineProperty({ ...exact }, "evidence", { enumerable: true, get() { invoked = true; return exact.evidence; } });
  code(() => recover(f, active.revision), "validation"); assert.equal(invoked, false);
  code(() => f.store.executions.recoverExecutionClose(nextOwner, { taskId: f.taskId, bindingId: f.allocated.bindingId,
    expectedExecutionRevision: active.revision, evidence: exact.evidence } as never), "validation");
  assert.equal(f.store.executions.readExecution(W, f.taskId)!.closed, false);
});
test("only the newer persisted Session owner can recover the exact active execution revision", t => {
  let recorded: CloseWitness | undefined, calls = 0;
  const f = fixture(t, "model-allowed", undefined, { observedClose() { calls++; return recorded; } }); const active = f.start(); recorded = closeWitness(f);
  code(() => recover(f, active.revision, context), "conflict");
  f.reopen(nextOwner.daemonInstanceId);
  code(() => recover(f, active.revision, context), "conflict");
  code(() => recover(f, active.revision, { ...nextOwner, ownerEpoch: 3 }), "conflict");
  code(() => recover(f, active.revision - 1), "revision_conflict"); assert.equal(calls, 0);
  assert.equal(recover(f, active.revision).closed, true); assert.equal(calls, 1);
});
test("old active execution blocks cancel, retry and continue after reopen without changing Task or cursor", t => {
  const f = fixture(t); f.start(); f.reopen(nextOwner.daemonInstanceId);
  const before = f.store.tasks.getTask(W, f.taskId), cursor = f.store.tasks.snapshot(W).commitCursor;
  for (const kind of ["task.cancel", "task.retry", "task.continue"] as const) {
    code(() => f.store.tasks.executeTask(nextOwner, { schemaVersion: 1, commandId: `recovered-${kind}`, idempotencyKey: `recovered-${kind}`, workspaceId: W,
      expectedRevision: before.value!.revision, payload: { kind, targetRef: { kind: "task", id: f.taskId, revision: before.value!.revision } } }), "recovery_required");
  }
  assert.deepEqual(f.store.tasks.getTask(W, f.taskId), before); assert.equal(f.store.tasks.snapshot(W).commitCursor, cursor);
});
test("recovery close rejects a clock earlier than its persisted execution snapshot", t => {
  let recorded: CloseWitness | undefined, calls = 0;
  const f = fixture(t, "model-allowed", undefined, { observedClose() { calls++; return recorded; } }); f.setTime(T1);
  const active = f.start(); recorded = { ...closeWitness(f), evidence: { ...closeWitness(f).evidence, observedAt: T1 } };
  f.reopen(nextOwner.daemonInstanceId); f.setTime(T0);
  code(() => recover(f, active.revision), "conflict"); assert.equal(calls, 0);
  f.setTime(T1); assert.equal(recover(f, active.revision).closed, true);
});


function removeExecutionBodies(f: ReturnType<typeof fixture>, purge = false): void {
  const scope = { kind: "task" as const, workspaceId: W, taskId: f.taskId }, refs = f.store.tasks.contentRefs(W, f.taskId);
  f.store.applyControlIntent({ kind: "FORGET", operationId: "forget-integrity-fixture", at: T0, authorization: "synthetic-user-request",
    targets: [{ kind: "scope", scope }] });
  if (purge) for (const ref of refs) f.store.purgeContent(scope, ref);
}
function corruptExecutionRows(f: ReturnType<typeof fixture>, tables: readonly string[], mutate: (db: DatabaseSync) => void): void {
  const db = new DatabaseSync(join(f.dataRoot, "product.sqlite"));
  try {
    // Isolated synthetic row-corruption fixture. Put the identical trigger definitions
    // back before a public verified read; this does not exercise backup or restore.
    const triggers = tables.flatMap(table => db.prepare("SELECT name,sql FROM sqlite_master WHERE type='trigger' AND tbl_name=?").all(table));
    db.exec("BEGIN");
    for (const trigger of triggers) db.exec(`DROP TRIGGER "${trigger.name}"`);
    mutate(db);
    for (const trigger of triggers) db.exec(String(trigger.sql));
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
    db.exec("COMMIT");
  } finally { db.close(); }
}
function rejectCorruptExecution(f: ReturnType<typeof fixture>): void {
  code(() => f.store.tasks.replay(W), "corruption");
  code(() => f.store.executions.readExecution(W, f.taskId), "corruption");
  code(() => f.reopen(), "corruption");
}
test("unavailable bodies retain unique execution payload ownership", async t => {
  for (const variant of ["model-copy", "snapshot-copy", "input-as-model", "task-as-model", "event-as-model"] as const) {
    await t.test(variant, t => {
      const f = fixture(t); f.start(); f.model(); f.ingest(f.envelope(1)); removeExecutionBodies(f);
      corruptExecutionRows(f, [], db => {
        if (variant === "snapshot-copy") {
          db.exec(`INSERT INTO task_execution_snapshot_v1 SELECT binding_id,revision+1,task_id,task_revision,attempt_id,intent_revision,
            owner_epoch,recovery_epoch,scope_key,state,dispatched,closed,content_id,content_version,created_at
            FROM task_execution_snapshot_v1 WHERE revision=(SELECT max(revision) FROM task_execution_snapshot_v1)`);
          db.exec("UPDATE task_execution_v1 SET current_revision=current_revision+1");
        } else {
          const replacement = variant === "input-as-model" ? "SELECT content_id,content_version FROM task_input_v1 WHERE kind='runtime_input'"
            : variant === "task-as-model" ? "SELECT content_id,content_version FROM task_snapshot_v1 WHERE revision=3"
            : variant === "event-as-model" ? "SELECT content_id,content_version FROM task_execution_event_v1"
            : "SELECT content_id,content_version FROM task_model_request_v1";
          const ref = db.prepare(replacement).get()!;
          db.prepare(`INSERT INTO task_model_request_v1 SELECT binding_id,'forged-next-request',task_id,attempt_id,task_revision,intent_revision,
            owner_epoch,recovery_epoch,ordinal+1,max_tokens,scope_key,?,?,created_at FROM task_model_request_v1`)
            .run(ref.content_id!, ref.content_version!);
        }
      });
      rejectCorruptExecution(f);
    });
  }
});
test("snapshot, event and model dependency coverage remains mandatory after revocation or purge", async t => {
  for (const purge of [false, true]) for (const table of ["task_execution_snapshot_v1", "task_execution_event_v1", "task_model_request_v1"]) {
    for (const role of ["binding", "task", "input"] as const) await t.test(`${purge ? "purged" : "revoked"} ${table} ${role}`, t => {
      const f = fixture(t); f.start(); f.model(); f.ingest(f.envelope(1)); removeExecutionBodies(f, purge);
      corruptExecutionRows(f, ["task_content_dependency_v1"], db => {
        const target = db.prepare(`SELECT * FROM ${table} ORDER BY rowid DESC LIMIT 1`).get()!;
        const sourceTable = role === "binding" ? "task_execution_snapshot_v1" : role === "task" ? "task_snapshot_v1" : "task_input_v1";
        const deleted = db.prepare(`DELETE FROM task_content_dependency_v1 WHERE target_id=? AND target_version=?
          AND (source_id,source_version) IN (SELECT content_id,content_version FROM ${sourceTable}${role === "input" ? " WHERE kind='runtime_input'" : ""})`)
          .run(target.content_id!, target.content_version!);
        assert.equal(deleted.changes, 1);
      });
      rejectCorruptExecution(f);
    });
  }
});
test("unavailable event and model payloads still require a dispatched historical binding dependency", async t => {
  for (const table of ["task_execution_event_v1", "task_model_request_v1"]) await t.test(table, t => {
    const f = fixture(t); f.start(); f.model(); f.ingest(f.envelope(1)); removeExecutionBodies(f);
    corruptExecutionRows(f, ["task_content_dependency_v1"], db => {
      const target = db.prepare(`SELECT * FROM ${table}`).get()!;
      db.prepare(`DELETE FROM task_content_dependency_v1 WHERE target_id=? AND target_version=?
        AND (source_id,source_version) IN (SELECT content_id,content_version FROM task_execution_snapshot_v1)`)
        .run(target.content_id!, target.content_version!);
      db.prepare(`INSERT INTO task_content_dependency_v1 SELECT content_id,content_version,?,?
        FROM task_execution_snapshot_v1 WHERE revision=2`).run(target.content_id!, target.content_version!);
    });
    rejectCorruptExecution(f);
  });
});
test("revoked event acknowledgements retain exact progress or deterministic settlement receipt linkage", async t => {
  for (const settled of [false, true]) await t.test(settled ? "settled" : "progress", t => {
    const f = fixture(t); f.start(); const envelope = f.envelope(1, settled); f.ingest(envelope);
    if (!settled) f.ingest(f.envelope(2));
    removeExecutionBodies(f);
    corruptExecutionRows(f, ["task_execution_ack_v1"], db => {
      const wrong = settled ? db.prepare("SELECT commit_cursor FROM task_execution_event_v1 WHERE event_id=?").get(envelope.event.eventId)!.commit_cursor
        : db.prepare("SELECT max(commit_cursor) AS cursor FROM task_execution_event_v1").get()!.cursor;
      db.prepare("UPDATE task_execution_ack_v1 SET commit_cursor=? WHERE event_id=?").run(wrong!, envelope.event.eventId);
    });
    rejectCorruptExecution(f);
  });
});

test("revoked settlement receipt retains the exact source event dependency", t => {
  const f = fixture(t); f.start(); const envelope = f.envelope(1, true); f.ingest(envelope); removeExecutionBodies(f);
  corruptExecutionRows(f, ["task_content_dependency_v1"], db => {
    const event = db.prepare("SELECT * FROM task_execution_event_v1 WHERE event_id=?").get(envelope.event.eventId)!;
    const receipt = db.prepare("SELECT * FROM task_receipt_v1 WHERE command_id=?").get(`settled:${envelope.event.eventId}`)!;
    assert.equal(db.prepare("DELETE FROM task_content_dependency_v1 WHERE source_id=? AND source_version=? AND target_id=? AND target_version=?")
      .run(event.content_id!, event.content_version!, receipt.content_id!, receipt.content_version!).changes, 1);
  });
  rejectCorruptExecution(f);
});
