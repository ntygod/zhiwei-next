import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test, { type TestContext } from "node:test";
import { ids, type Task, type TaskAttemptId, type TaskId, type OutcomeId, type TaskState, type WorkingStateV2, type PrivacyV2 } from "../../domain/src/index.ts";
import { canonicalJsonV1, parseProductEventV1, parseLocalApiCommandV1, type SessionCreateCommandV1, type SessionContractV1, type ExecutionSpecV1, type RuntimeBindingV1 } from "../../protocol/src/index.ts";
import { CognitiveStoreErrorV2, openSyntheticCognitionStoreV2, type SyntheticCognitionStoreV2, type TaskPersistenceBoundaryV1, type TaskStoreContextV1 } from "./index.ts";
import { applyTaskMigrationsV1, configureCognitiveDatabaseV2 } from "./cognitive-schema-v2.ts";
import { TaskStoreEngineV1, type TaskStoreHostV1 } from "./task-store-v1.ts";
import { TaskExecutionStoreEngineV1 } from "./task-execution-store-v1.ts";
// Normal isolated, synthetic persistence tests. No backup replacement diagnostic or real data.
const T0 = "2026-10-10T00:00:00.000Z", RETENTION = "2026-11-10T00:00:00.000Z", WORKSPACE = "synthetic-task-workspace";
const contract: SessionContractV1 = { schemaVersion: 1, runtimeProfile: { id: "runtime-test", revision: 1 }, modelProfile: { id: "model-test", revision: 1 },
  toolProfile: { id: "none", revision: 1 }, policyProfile: { id: "policy-test", revision: 1 }, dataProfile: { id: "data-test", revision: 1 }, compilerProfile: { id: "compiler-test", revision: 1 }, interactionKind: "interactive" };
const sessionCommand: SessionCreateCommandV1 = { schemaVersion: 1, commandId: "session-command", idempotencyKey: "session-key", workspaceId: WORKSPACE, expectedRevision: 0, payload: { kind: "session.create", contract } };
const context: TaskStoreContextV1 = { principalId: "synthetic-owner", workspaceId: WORKSPACE, daemonInstanceId: "daemon-one", ownerEpoch: 1 };
function uuid(n: number): string { return `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`; }
function mutate(task: Task, state: TaskState, now = task.updatedAt): Task { return { ...structuredClone(task), revision: task.revision + 1, state, updatedAt: now,
  attempts: task.attempts.map((attempt, i) => i === task.attempts.length - 1 ? { ...structuredClone(attempt), state, updatedAt: now, cancellationRequested: state === "CANCELLING" || state === "CANCELLED", completeness: state === "CANCELLED" ? "complete" : attempt.completeness } : structuredClone(attempt)) }; }
const reduce: TaskPersistenceBoundaryV1["reduce"] = (current, command, context) => {
  if (command.payload.kind === "task.create") {
    const intent = { revision: 1, request: command.payload.request, constraints: command.payload.constraints, criteria: command.payload.acceptanceChecks };
    const task: Task = { id: context.taskId as TaskId, workspaceId: ids.workspace(command.workspaceId), sessionId: ids.session(command.payload.sessionId), revision: 1, intent, state: "CREATED", createdAt: context.now, updatedAt: context.now,
      attempts: [{ id: context.attemptId as TaskAttemptId, taskId: context.taskId as TaskId, workspaceId: ids.workspace(command.workspaceId), intent: structuredClone(intent), state: "CREATED", createdAt: context.now, updatedAt: context.now, pauseRequested: false, cancellationRequested: false, completeness: "not-settled", outcomes: [], unresolvedActions: [] }] };
    return { versions: [task, mutate(task, "READY")] };
  }
  if (!current) throw new Error("missing task");
  if (command.payload.kind === "task.runtime" && command.payload.event === "start") return { versions: [mutate(current, "RUNNING", context.now)] };
  if (command.payload.kind === "task.cancel") { const cancelling = mutate(current, "CANCELLING", context.now); return { versions: [cancelling, mutate(cancelling, "CANCELLED")] }; }
  if (command.payload.kind === "task.retry") {
    const task: Task = { ...structuredClone(current), revision: current.revision + 1, state: "CREATED", updatedAt: context.now,
      attempts: [...structuredClone(current.attempts), { id: context.attemptId as TaskAttemptId, taskId: current.id, workspaceId: current.workspaceId, intent: structuredClone(current.intent), state: "CREATED", createdAt: context.now, updatedAt: context.now, pauseRequested: false, cancellationRequested: false, completeness: "not-settled", outcomes: [], unresolvedActions: [] }] };
    return { versions: [task, mutate(task, "READY")] };
  }
  throw new Error("unsupported synthetic reduction");
};
function fixture(t: TestContext, reducer: TaskPersistenceBoundaryV1["reduce"] = reduce, advancing = false, privacy: PrivacyV2 = "local-only") {
  const root = mkdtempSync(join(tmpdir(), "zhiwei-task-normal-rebuild-")), dataRoot = join(root, "data"), controlRoot = join(root, "control"); mkdirSync(dataRoot);
  let n = 0, ticks = 0, at = T0, store: SyntheticCognitionStoreV2 | undefined;
  const boundary = (daemonInstanceId: string): TaskPersistenceBoundaryV1 => ({ daemonInstanceId, contentPolicy: { privacy, retentionUntil: RETENTION }, ids: { next: kind => kind === "content" || kind === "reservation" ? uuid(++n) : `${kind}-${++n}` }, reduce: reducer });
  const options = { dataRoot, controlRoot, installationId: "task-installation", clock: { now: () => advancing ? new Date(Date.parse(at) + ticks++).toISOString() : at } };
  store = openSyntheticCognitionStoreV2({ ...options, mode: "create", taskPersistence: boundary(context.daemonInstanceId) });
  t.after(() => { store?.close(); rmSync(root, { recursive: true, force: true }); });
  return { get store() { return store!; }, dataRoot, setTime(value: string) { at = value; }, reopen(daemon = "daemon-one") { store?.close(); store = undefined; store = openSyntheticCognitionStoreV2({ ...options, mode: "open", taskPersistence: boundary(daemon) }); return store; } };
}
function create(f: ReturnType<typeof fixture>) {
  const session = f.store.tasks.createSession(context, sessionCommand), sessionId = session.receipt.aggregate.id;
  const command = parseLocalApiCommandV1({ schemaVersion: 1, commandId: "task-command", idempotencyKey: "task-key", workspaceId: WORKSPACE, expectedRevision: 0,
    payload: { kind: "task.create", sessionId, executionProfile: contract.runtimeProfile, request: "SYNTHETIC_ONLY: Count the violet lanterns", constraints: ["No external action"], acceptanceChecks: [{ id: "check-one", revision: 1, description: "Exact deterministic count", required: true, method: "deterministic-test" }] } });
  const task = f.store.tasks.executeTask(context, command); return { session, sessionId, command, task, taskId: task.receipt.aggregate.id };
}
function action(kind: "task.cancel" | "task.retry", id: string, revision: number) { return parseLocalApiCommandV1({ schemaVersion: 1, commandId: kind, idempotencyKey: kind, workspaceId: WORKSPACE, expectedRevision: revision, payload: { kind, targetRef: { kind: "task", id, revision } } }); }
function code(body: () => unknown, expected: string) { assert.throws(body, error => error instanceof CognitiveStoreErrorV2 && error.code === expected); }
function input(f: ReturnType<typeof fixture>, taskId: string) { const task = f.store.tasks.getTask(WORKSPACE, taskId).value!; return { commandId: "input-command", idempotencyKey: "input-key", taskId, expectedRevision: task.revision, attemptId: task.attempts.at(-1)!.id, intentRevision: task.intent.revision, text: "SYNTHETIC_ONLY exact Runtime input" }; }
test("Task transaction preserves exact versions, WorkingState and response-loss idempotency across reopen", t => {
  const f = fixture(t), c = create(f), task = f.store.tasks.getTask(WORKSPACE, c.taskId).value!;
  assert.equal(task.revision, 2); assert.equal(task.state, "READY"); assert.equal(task.attempts.length, 1);
  assert.equal(f.store.tasks.readWorkingState(WORKSPACE, task.id).value!.task.revision, 2);
  assert.deepEqual(f.store.tasks.executeTask(context, c.command), { ...c.task, replay: true });
  assert.deepEqual(f.store.tasks.executeTask(context, { ...c.command, commandId: "new-correlation-id" }), { ...c.task, replay: true });
  assert.deepEqual(f.reopen().tasks.getTask(WORKSPACE, task.id).value, task);
  const db = new DatabaseSync(join(f.dataRoot, "product.sqlite")); try { assert.equal(db.prepare("PRAGMA integrity_check").get()!.integrity_check, "ok"); assert.equal(db.prepare("PRAGMA journal_mode").get()!.journal_mode, "wal"); assert.equal(db.prepare("SELECT count(*) AS n FROM task_snapshot_v1").get()!.n, 2); } finally { db.close(); }
});
test("same key changed content and stale expectedRevision leave every cursor unchanged", t => {
  const f = fixture(t), c = create(f), before = f.store.tasks.snapshot(WORKSPACE);
  assert.equal(c.command.payload.kind, "task.create"); const changed = parseLocalApiCommandV1({ ...c.command, payload: { ...c.command.payload, request: "SYNTHETIC_ONLY changed request" } });
  code(() => f.store.tasks.executeTask(context, changed), "conflict"); code(() => f.store.tasks.executeTask(context, action("task.cancel", c.taskId, 1)), "revision_conflict");
  assert.deepEqual(f.store.tasks.snapshot(WORKSPACE), before);
});
test("incorrect configured reducer cannot forge initial history or publish available partial state", t => {
  const f = fixture(t, (current, command, context) => { const result = reduce(current, command, context); return { versions: result.versions.map(item => ({ ...item, revision: item.revision + 8 })) }; });
  code(() => create(f), "validation"); assert.deepEqual(f.store.tasks.snapshot(WORKSPACE).tasks, []); assert.equal(f.store.tasks.replay(WORKSPACE).events.length, 1);
});
test("new daemon fences old owner and preserves READY without automatic execution", t => {
  const f = fixture(t), c = create(f); f.reopen("daemon-two"); assert.equal(f.store.tasks.getSession(WORKSPACE, c.sessionId).value!.ownerEpoch, 2);
  assert.equal(f.store.tasks.getTask(WORKSPACE, c.taskId).value!.state, "READY"); code(() => f.store.tasks.executeTask(context, c.command), "revision_conflict");
  assert.equal(f.store.tasks.getTask("other-workspace", c.taskId).value, undefined);
  assert.equal(f.store.tasks.replay(WORKSPACE).events.at(-1)!.event.type, "session.owner_fenced");
});
test("runtime input records the exact managed snapshot before allocation and replays once", t => {
  const f = fixture(t), c = create(f), request = input(f, c.taskId), receipt = f.store.tasks.recordRuntimeInput(context, request);
  assert.equal(receipt.snapshot.text, request.text); assert.equal(receipt.snapshot.ordinal, 2); assert.equal(f.store.tasks.recordRuntimeInput(context, request).replay, true);
  assert.deepEqual(f.reopen().tasks.listRuntimeInputs(WORKSPACE, c.taskId, request.attemptId).value, [receipt.snapshot]);
  assert.match(new TextDecoder().decode(f.store.readContent({ kind: "task", workspaceId: WORKSPACE, taskId: c.taskId }, receipt.contentRef)), /exact Runtime input/);
});
test("forget and purge keep minimal receipts but never reexecute or leak old Task bodies", t => {
  const f = fixture(t), c = create(f), scope = { kind: "task" as const, workspaceId: WORKSPACE, taskId: c.taskId }, refs = f.store.tasks.contentRefs(WORKSPACE, c.taskId);
  assert.ok(!readFileSync(join(f.dataRoot, "product.sqlite")).includes(Buffer.from("Count the violet lanterns")));
  f.store.applyControlIntent({ kind: "FORGET", operationId: "forget-task", at: T0, authorization: "synthetic-user-request", targets: [{ kind: "scope", scope }] });
  code(() => f.store.tasks.getTask(WORKSPACE, c.taskId), "unavailable"); code(() => f.store.tasks.executeTask(context, c.command), "unavailable");
  for (const ref of refs) f.store.purgeContent(scope, ref); f.reopen(); code(() => f.store.tasks.executeTask(context, c.command), "unavailable");
  assert.equal(f.store.tasks.replay(WORKSPACE).events.length, 3);
});
test("snapshot watermark and replay consumer cursor cannot skip an event or cross Workspace", t => {
  const f = fixture(t), c = create(f); assert.equal(f.store.tasks.snapshot(WORKSPACE).commitCursor, c.task.commitCursor);
  const events = f.store.tasks.replay(WORKSPACE).events; code(() => f.store.tasks.acknowledgeOutbox(WORKSPACE, "consumer", events[1]!.event.eventId, 0), "sequence");
  assert.equal(f.store.tasks.acknowledgeOutbox(WORKSPACE, "consumer", events[0]!.event.eventId, 0), events[0]!.commitCursor);
  code(() => f.store.tasks.replay("other-workspace", { afterCommitCursor: events[0]!.commitCursor }), "sequence"); assert.equal(f.store.tasks.replay(WORKSPACE, { limit: 1 }).hasMore, true);
});
test("advancing clock is captured once per transaction for Task, Observation and WorkingState", t => {
  const f = fixture(t, reduce, true), c = create(f), task = f.store.tasks.getTask(WORKSPACE, c.taskId).value!, working = f.store.tasks.readWorkingState(WORKSPACE, c.taskId).value!;
  assert.equal(working.updatedAt, task.updatedAt); assert.equal(working.evidence[0]!.observedAt, task.updatedAt); assert.deepEqual(f.reopen().tasks.getTask(WORKSPACE, c.taskId).value, task);
});
test("client Task histories, executable getters and unknown fields are rejected without invocation", t => {
  const f = fixture(t), c = create(f); let invoked = false; const bad = { ...c.command };
  Object.defineProperty(bad, "payload", { enumerable: true, get() { invoked = true; return c.command.payload; } });
  code(() => f.store.tasks.executeTask(context, bad), "validation"); assert.equal(invoked, false);
  code(() => f.store.tasks.executeTask(context, { ...c.command, task: f.store.tasks.getTask(WORKSPACE, c.taskId).value } as typeof c.command), "validation");
});
test("retry retains cancelled attempt and appends exactly one new attempt with unchanged intent", t => {
  const f = fixture(t), c = create(f); f.store.tasks.executeTask(context, action("task.cancel", c.taskId, 2)); const prior = f.store.tasks.getTask(WORKSPACE, c.taskId).value!;
  f.store.tasks.executeTask(context, action("task.retry", c.taskId, 4)); const next = f.store.tasks.getTask(WORKSPACE, c.taskId).value!;
  assert.deepEqual(next.attempts[0], prior.attempts[0]); assert.equal(next.attempts.length, 2); assert.notEqual(next.attempts[0]!.id, next.attempts[1]!.id); assert.equal(next.intent.revision, 1); assert.equal(next.state, "READY");
});
test("late invalid version rolls back Observation, Task, receipt, content metadata and Outbox", t => {
  const f = fixture(t, (task, command, context) => { const result = reduce(task, command, context), bad = structuredClone(result.versions[1]!);
    return { versions: [result.versions[0]!, { ...bad, intent: { ...bad.intent, request: "SYNTHETIC_ONLY forged historical intent" } }] }; });
  code(() => create(f), "validation"); const db = new DatabaseSync(join(f.dataRoot, "product.sqlite")); try {
    for (const table of ["task_v1", "task_snapshot_v1", "observation_v2"]) assert.equal(db.prepare(`SELECT count(*) AS n FROM ${table}`).get()!.n, 0);
    assert.equal(db.prepare("SELECT count(*) AS n FROM task_receipt_v1").get()!.n, 1); assert.equal(db.prepare("SELECT count(*) AS n FROM content_object").get()!.n, 1);
  } finally { db.close(); }
});
test("same-connection read validates the entire attempt projection", t => {
  const f = fixture(t), c = create(f), db = new DatabaseSync(join(f.dataRoot, "product.sqlite")); try { db.prepare("UPDATE task_attempt_v1 SET state='RUNNING' WHERE task_id=?").run(c.taskId); } finally { db.close(); }
  code(() => f.store.tasks.getTask(WORKSPACE, c.taskId), "corruption");
});
function rich(task: Task, evidence: WorkingStateV2["evidence"], privacy: WorkingStateV2["privacy"]): WorkingStateV2 { return { schemaVersion: 2, id: task.id, revision: task.revision, scope: { kind: "task", workspaceId: task.workspaceId, taskId: task.id }, privacy, sourceTrust: "verified-tool", createdAt: task.createdAt, updatedAt: task.updatedAt,
  task: { kind: "task", id: task.id, revision: task.revision }, taskAttempt: { taskId: task.id, attemptId: task.attempts.at(-1)!.id, intentRevision: task.intent.revision }, intentRevision: task.intent.revision,
  currentStep: "Inspect fictional lanterns", known: ["Input is synthetic"], unknown: ["Count unverified"], pendingInput: ["Fixture result"], nextSteps: ["Run deterministic fixture"], evidence }; }
test("rich WorkingState persists exact known, unknown, pending and next-step content with real evidence", t => {
  const f = fixture(t, (task, command, context) => { const result = reduce(task, command, context); return { ...result, workingStates: result.versions.map(item => rich(item, context.evidence, context.privacy)) }; }), c = create(f);
  const before = f.store.tasks.readWorkingState(WORKSPACE, c.taskId).value!; assert.deepEqual(before.known, ["Input is synthetic"]); assert.equal(before.evidence.length, 1);
  assert.deepEqual(f.reopen().tasks.readWorkingState(WORKSPACE, c.taskId).value, before);
});
test("WorkingState rejects mismatched Task references and invented Observation evidence", async t => {
  for (const corrupt of ["task", "evidence"] as const) await t.test(corrupt, t => {
    const f = fixture(t, (task, command, context) => { const result = reduce(task, command, context); return { ...result, workingStates: result.versions.map(item => { const value = rich(item, context.evidence, context.privacy); return corrupt === "task" ? { ...value, task: { ...value.task, revision: 999 } } : { ...value, evidence: value.evidence.map(e => ({ ...e, source: { ...e.source, id: "nonexistent-evidence" } })) }; }) }; });
    code(() => create(f), corrupt === "task" ? "validation" : "unavailable");
  });
});
test("Session forget closes over Task, command evidence, WorkingState and runtime input dependencies", t => {
  const f = fixture(t), c = create(f), request = input(f, c.taskId); f.store.tasks.recordRuntimeInput(context, request);
  f.store.applyControlIntent({ kind: "FORGET", operationId: "forget-session", at: T0, authorization: "synthetic-user-request", targets: [{ kind: "scope", scope: { kind: "session", workspaceId: WORKSPACE, sessionId: c.sessionId } }] });
  code(() => f.store.tasks.getTask(WORKSPACE, c.taskId), "unavailable"); code(() => f.store.tasks.listRuntimeInputs(WORKSPACE, c.taskId, request.attemptId), "unavailable"); f.reopen(); code(() => f.store.tasks.readWorkingState(WORKSPACE, c.taskId), "unavailable");
});
test("post-restart retry receipt covers the Session reauthorization event and final Task version", t => {
  const f = fixture(t), c = create(f); f.store.tasks.executeTask(context, action("task.cancel", c.taskId, 2)); f.reopen("daemon-two");
  const owner = { ...context, daemonInstanceId: "daemon-two", ownerEpoch: 2 }, retry = action("task.retry", c.taskId, 4), result = f.store.tasks.executeTask(owner, retry);
  assert.equal(result.commitCursor, f.store.tasks.snapshot(WORKSPACE).commitCursor); assert.equal(f.store.tasks.replay(WORKSPACE).events.at(-1)!.event.aggregate.id, c.taskId);
  assert.equal(f.store.tasks.getSession(WORKSPACE, c.sessionId).value!.revision, 3); assert.equal(f.reopen("daemon-two").tasks.executeTask(owner, retry).commitCursor, result.commitCursor);
});
test("retention expiry keeps exact original idempotency key unavailable instead of restarting work", t => {
  const f = fixture(t), c = create(f); f.setTime(RETENTION); code(() => f.store.tasks.executeTask(context, c.command), "unavailable"); code(() => f.store.tasks.getTask(WORKSPACE, c.taskId), "unavailable");
  assert.equal(f.store.tasks.replay(WORKSPACE).events.length, 3);
});
test("malformed cancellation and forged attempt identity fail independently of trusted reducer", async t => {
  await t.test("cancellation completeness", t => { const f = fixture(t, (task, command, context) => { const result = reduce(task, command, context); return command.payload.kind !== "task.cancel" ? result : { versions: result.versions.map(v => ({ ...v, attempts: v.attempts.map(a => ({ ...a, completeness: "not-settled" as const })) })) }; }); const c = create(f); code(() => f.store.tasks.executeTask(context, action("task.cancel", c.taskId, 2)), "validation"); });
  await t.test("attempt identity", t => { const f = fixture(t, (task, command, context) => { const result = reduce(task, command, context); return { versions: result.versions.map(v => ({ ...v, attempts: v.attempts.map(a => ({ ...a, id: "invented-attempt" as TaskAttemptId })) })) }; }); code(() => create(f), "validation"); });
});


test("a configured reducer cannot promote invented successful criterion evidence into an Outcome", t => {
  const f = fixture(t, (current, command, context) => {
    if (command.payload.kind !== "task.cancel" || !current) return reduce(current, command, context);
    const running = mutate(current, "RUNNING", context.now), checking = mutate(running, "VERIFYING", context.now), completed = mutate(checking, "COMPLETED", context.now);
    const attempt = completed.attempts.at(-1)!;
    const terminal: Task = { ...completed, attempts: completed.attempts.map(item => ({ ...item, completeness: "complete", outcomes: [{ id: context.outcomeId as OutcomeId, revision: 1,
      taskId: current.id, attemptId: attempt.id, workspaceId: current.workspaceId, intentRevision: current.intent.revision, status: "completed", recordedAt: context.now,
      criteriaResults: attempt.intent.criteria.map(criterion => ({ taskId: current.id, attemptId: attempt.id, workspaceId: current.workspaceId, intentRevision: current.intent.revision,
        criterionId: criterion.id, criterionRevision: criterion.revision, method: criterion.method, checkedAt: context.now, explanation: "SYNTHETIC_ONLY untrusted success claim",
        status: "pass", evidence: [{ id: "invented-result", revision: 1 }], validUntil: RETENTION })) }] })) };
    const verifying: Task = { ...checking, attempts: checking.attempts.map(item => ({ ...item, completeness: "complete" })) };
    return { versions: [running, verifying, terminal] };
  }), c = create(f), before = f.store.tasks.getTask(WORKSPACE, c.taskId);
  code(() => f.store.tasks.executeTask(context, action("task.cancel", c.taskId, 2)), "unsupported");
  assert.deepEqual(f.store.tasks.getTask(WORKSPACE, c.taskId), before);
});


test("all ProductEvent variants reject orphan aggregates in a real isolated in-memory database", async t => {
  for (const [type, kind, payload] of [
    ["session.created", "session", { ownerEpoch: 999 }], ["session.owner_fenced", "session", { ownerEpoch: 999 }],
    ["task.created", "task", { state: "CREATED", intentRevision: 1 }], ["task.state_changed", "task", { state: "READY", intentRevision: 1 }],
    ["task.input_committed", "task", { attemptId: "missing-attempt", ordinal: 999 }], ["task.progress", "task", { phase: "working" }],
  ] as const) await t.test(type, () => {
    const db = new DatabaseSync(":memory:");
    try {
      const pragmas = configureCognitiveDatabaseV2(db, { filePath: ":memory:", busyTimeoutMs: 100 });
      applyTaskMigrationsV1(db, { clock: { now: () => T0 }, expectedPragmas: pragmas });
      const unused = (): never => { throw new Error("Unexpected content or execution access"); };
      const host: TaskStoreHostV1 = { db, now: () => T0, recoveryEpoch: () => 0, registerScope: unused, content: unused, writeBody: unused,
        recordCommandEvidence: unused, executionForReduction: unused, onExecutionSettled: unused,
        fail: category => { throw new CognitiveStoreErrorV2(category); }, transaction: (_write, body) => {
          db.exec("BEGIN"); try { engine.validateRows(); execution.validateRows(); const result = body(); db.exec("COMMIT"); return result; }
          catch (error) { if (db.isTransaction) db.exec("ROLLBACK"); throw error; }
        } };
      const engine = new TaskStoreEngineV1(host), execution = new TaskExecutionStoreEngineV1(host);
      const event = parseProductEventV1({ schemaVersion: 1, eventId: `orphan-${type}`, workspaceId: "missing-workspace",
        aggregate: { kind, id: "missing-aggregate", revision: 999 }, occurredAt: T0, type, payload });
      db.prepare("INSERT INTO task_outbox_v1(event_id,workspace_id,entity_kind,entity_id,revision,event_type,owner_epoch,recovery_epoch,occurred_at,publish_state,event_json) VALUES(?,?,?,?,?,?,1,0,?,'pending',?)")
        .run(event.eventId, event.workspaceId, kind, event.aggregate.id, event.aggregate.revision, type, T0, canonicalJsonV1(event));
      assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
      code(() => engine.replay("missing-workspace"), "corruption");
    } finally { db.close(); }
  });
});

test("Outbox rejects canonical wrong scope, owner, version, input and source facts through full Store reads", async t => {
  for (const variant of ["wrong-workspace", "wrong-task-time", "duplicate-task-version", "created-late", "missing-task-version", "wrong-task-owner", "session-owner", "session-version", "session-history", "input-attempt", "input-ordinal", "input-owner", "input-time", "orphan-progress"] as const)
    await t.test(variant, t => {
      const f = fixture(t), c = create(f), committed = f.store.tasks.recordRuntimeInput(context, input(f, c.taskId));
      if (variant === "session-history") { f.reopen("daemon-two"); f.reopen("daemon-three"); }
      const db = new DatabaseSync(join(f.dataRoot, "product.sqlite"));
      try {
        const type = variant.startsWith("session") ? "session.created" : variant.startsWith("input") ? "task.input_committed" : "task.state_changed";
        const original = db.prepare("SELECT * FROM task_outbox_v1 WHERE event_type=? ORDER BY cursor LIMIT 1").get(type)!;
        const parsed = JSON.parse(String(original.event_json)); let owner = Number(original.owner_epoch);
        let value = { ...parsed, eventId: `forged-${variant}` };
        if (variant === "wrong-workspace") value = { ...value, workspaceId: "other-synthetic-workspace" };
        if (variant === "wrong-task-time" || variant === "input-time") value = { ...value, occurredAt: "2026-10-10T00:00:01.000Z" };
        if (variant === "created-late") value = { ...value, type: "task.created" };
        if (variant === "missing-task-version" || variant === "session-version") value = { ...value, aggregate: { ...value.aggregate, revision: 999 } };
        if (variant === "wrong-task-owner" || variant === "input-owner") owner = 999;
        if (variant === "session-owner") value = { ...value, payload: { ownerEpoch: 999 } };
        if (variant === "session-history") value = { ...value, type: "session.owner_fenced", aggregate: { ...value.aggregate, revision: 2 }, payload: { ownerEpoch: 2 } }, owner = 2;
        if (variant === "input-attempt") value = { ...value, payload: { ...value.payload, attemptId: "missing-attempt" } };
        if (variant === "input-ordinal") value = { ...value, payload: { ...value.payload, ordinal: committed.snapshot.ordinal + 99 } };
        if (variant === "orphan-progress") value = { ...value, type: "task.progress", payload: { phase: "working" } };
        const event = parseProductEventV1(value);
        db.prepare("INSERT INTO task_outbox_v1(event_id,workspace_id,entity_kind,entity_id,revision,event_type,owner_epoch,recovery_epoch,occurred_at,publish_state,event_json) VALUES(?,?,?,?,?,?,?,0,?,'pending',?)")
          .run(event.eventId, event.workspaceId, event.aggregate.kind, event.aggregate.id, event.aggregate.revision, event.type, owner, event.occurredAt, canonicalJsonV1(event));
        assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
      } finally { db.close(); }
      code(() => f.store.tasks.replay(WORKSPACE), "corruption");
      code(() => f.store.tasks.snapshot(WORKSPACE), "corruption");
      code(() => f.reopen(), "corruption");
    });
});


function startStoredExecution(f: ReturnType<typeof fixture>, taskId: string, sessionId: string): void {
  const request = input(f, taskId), recorded = f.store.tasks.recordRuntimeInput(context, request);
  const global = f.store.registerScope({ kind: "global" }), workspace = f.store.registerScope({ kind: "workspace", workspaceId: WORKSPACE });
  const spec: ExecutionSpecV1 = { schemaVersion: 1, executionUnitId: "execution-input-check", workspaceId: WORKSPACE, sessionId, prompt: request.text,
    requestSnapshotRef: recorded.contentRef, fence: { installationId: "task-installation", recoveryEpoch: String(global.recoveryEpoch), owner: { kind: "task_attempt", id: request.attemptId },
      sourceTask: { taskId, attemptId: request.attemptId, intentRevision: 1 }, contractRevision: 1, leaseEpoch: 1,
      cognition: { global: global.cognitionEpoch, workspace: workspace.cognitionEpoch }, policy: { global: global.policyEpoch, workspace: workspace.policyEpoch }, notAfter: RETENTION },
    selectedModelProfile: contract.modelProfile, toolProfile: "none", bounds: { maxOutputBytes: 1024, maxDurationMs: 1000, maxTokens: 100, maxModelRequests: 1, maxToolCalls: 0 }, controlledCwdRef: "synthetic-input-cwd" };
  const binding: RuntimeBindingV1 = { schemaVersion: 1, bindingId: "binding-input-check", executionUnitId: spec.executionUnitId, workspaceId: WORKSPACE, sessionId,
    owner: { kind: "task_attempt", id: request.attemptId }, workerInstanceId: "worker-input-check", leaseEpoch: 1, profileRevision: 1,
    runtime: { implementation: "synthetic", version: "1.0.0" }, state: "ALLOCATED", observedRuntimeSessionIds: [], sourceStreams: [] };
  f.store.executions.allocateExecution(context, { taskId, expectedRevision: request.expectedRevision, spec, binding });
  const ready = f.store.executions.markExecutionReady(context, { taskId, binding: { ...binding, state: "READY", observedRuntimeSessionIds: ["native-input-check"], sourceStreams: [{ sourceStreamId: "stream-input-check", surface: "rpc", runtimeInstanceId: "runtime-input-check", sequenceDomain: "output" }] } });
  f.store.tasks.executeTask(context, { schemaVersion: 1, commandId: "start-input-check", idempotencyKey: "start-input-check", workspaceId: WORKSPACE,
    expectedRevision: request.expectedRevision, payload: { kind: "task.runtime", taskId, event: "start", evidenceRefs: [{ id: ready.bindingId, revision: ready.revision }] } });
}

test("all input kinds reject extra metadata or reused command rows before reads and reopen", async t => {
  for (const kind of ["user_command", "internal_command", "runtime_input"] as const)
    for (const variant of ["owner", "intent", "duplicate", "wrong-kind", "revoked-duplicate"] as const)
      await t.test(`${kind}/${variant}`, t => {
        const f = fixture(t, reduce, false, "model-allowed"), c = create(f);
        if (kind === "internal_command") startStoredExecution(f, c.taskId, c.sessionId);
        else if (kind === "runtime_input") f.store.tasks.recordRuntimeInput(context, input(f, c.taskId));
        if (variant === "revoked-duplicate") {
          const scope = { kind: "task" as const, workspaceId: WORKSPACE, taskId: c.taskId };
          f.store.applyControlIntent({ kind: "FORGET", operationId: "forget-input-projection", at: T0, authorization: "synthetic-user-request", targets: [{ kind: "scope", scope }] });
          f.reopen(); // Revoked content alone remains a structurally valid store.
        }
        const db = new DatabaseSync(join(f.dataRoot, "product.sqlite"));
        try {
          const original = db.prepare("SELECT * FROM task_input_v1 WHERE task_id=? AND kind=? ORDER BY ordinal LIMIT 1").get(c.taskId, kind)!;
          const ordinal = db.prepare("SELECT max(ordinal)+1 AS n FROM task_input_v1 WHERE attempt_id=?").get(original.attempt_id!)!.n;
          db.prepare("INSERT INTO task_input_v1(id,task_id,attempt_id,task_revision,intent_revision,kind,ordinal,owner_epoch,content_id,content_version,scope_key) VALUES(?,?,?,?,?,?,?,?,?,?,?)")
            .run(`extra-${kind}-${variant}`, original.task_id!, original.attempt_id!, original.task_revision!, variant === "intent" ? 999 : original.intent_revision!,
              variant === "wrong-kind" ? kind === "user_command" ? "internal_command" : "user_command" : kind, ordinal!, variant === "owner" ? 999 : original.owner_epoch!, original.content_id!, original.content_version!, original.scope_key!);
          assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
        } finally { db.close(); }
        code(() => f.store.tasks.getTask(WORKSPACE, c.taskId), "corruption");
        code(() => f.store.tasks.replay(WORKSPACE), "corruption");
        code(() => f.reopen(), "corruption");
      });
});

test("reverse input, receipt, WorkingState and dependency coverage survives body revocation", async t => {
  for (const target of ["input", "receipt", "working", "dependency", "observation"] as const) await t.test(target, t => {
    const f = fixture(t), c = create(f);
    f.store.applyControlIntent({ kind: "FORGET", operationId: "forget-coverage", at: T0, authorization: "synthetic-user-request", targets: [{ kind: "scope", scope: { kind: "task", workspaceId: WORKSPACE, taskId: c.taskId } }] });
    const db = new DatabaseSync(join(f.dataRoot, "product.sqlite"));
    try {
      // Isolated row-corruption fixture: restore the identical trigger SQL before validation.
      // No application guard is disabled, and no restore or backup operation is used.
      const table = target === "input" ? "task_input_v1" : target === "receipt" ? "task_receipt_v1" : target === "working" ? "working_state_v1" : target === "dependency" ? "task_content_dependency_v1" : "observation_v2";
      const triggers = db.prepare("SELECT name,sql FROM sqlite_master WHERE type='trigger' AND tbl_name=?").all(table);
      db.exec("BEGIN");
      for (const trigger of triggers) db.exec(`DROP TRIGGER "${trigger.name}"`);
      if (target === "input") db.prepare("DELETE FROM task_input_v1 WHERE task_id=?").run(c.taskId);
      else if (target === "receipt") db.prepare("DELETE FROM task_receipt_v1 WHERE entity_kind='task' AND entity_id=?").run(c.taskId);
      else if (target === "working") db.prepare("DELETE FROM working_state_v1 WHERE task_id=?").run(c.taskId);
      else if (target === "dependency") db.exec("DELETE FROM task_content_dependency_v1");
      else db.exec("DELETE FROM observation_v2");
      for (const trigger of triggers) db.exec(String(trigger.sql));
      db.exec("COMMIT");
    } finally { db.close(); }
    code(() => f.store.tasks.replay(WORKSPACE), "corruption");
    code(() => f.reopen(), "corruption");
  });
});


test("revoked metadata still rejects invented attempts and terminal Outcomes", async t => {
  for (const variant of ["attempt-state", "outcome"] as const) await t.test(variant, t => {
    const f = fixture(t), c = create(f);
    if (variant === "outcome") f.store.tasks.executeTask(context, action("task.cancel", c.taskId, 2));
    f.store.applyControlIntent({ kind: "FORGET", operationId: "forget-terminal-metadata", at: T0, authorization: "synthetic-user-request", targets: [{ kind: "scope", scope: { kind: "task", workspaceId: WORKSPACE, taskId: c.taskId } }] });
    const db = new DatabaseSync(join(f.dataRoot, "product.sqlite"));
    try {
      if (variant === "attempt-state") db.prepare("UPDATE task_attempt_v1 SET state='RUNNING' WHERE task_id=?").run(c.taskId);
      else db.prepare("INSERT INTO task_outcome_v1(id,revision,task_id,attempt_id,intent_revision,status,snapshot_revision,recorded_at) SELECT 'invented-outcome',1,task_id,attempt_id,intent_revision,'completed',revision,created_at FROM task_snapshot_v1 WHERE task_id=? AND state='CANCELLED'").run(c.taskId);
      assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
    } finally { db.close(); }
    code(() => f.store.tasks.replay(WORKSPACE), "corruption"); code(() => f.reopen(), "corruption");
  });
});
