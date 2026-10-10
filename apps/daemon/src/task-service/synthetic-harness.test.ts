import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { access } from "node:fs/promises";
import { join } from "node:path";
import { setImmediate as nextTick } from "node:timers/promises";
import type { CriterionId, Task } from "../../../../packages/domain/src/index.ts";
import type { LocalApiCommandV1, SessionCreateCommandV1 } from "../../../../packages/protocol/src/index.ts";
import { createSessionDataClient, pairSyntheticSessionCli, runSessionCli } from "../../../cli/src/session-client.ts";
import { createSyntheticWorkerTestPackage } from "../runtime/controlled-worker-test-fixture.ts";
import { createSyntheticTaskSessionHarness, type SyntheticTaskSessionHarness } from "./synthetic-harness.ts";
import { syntheticTaskPrompt, syntheticTaskSessionContract } from "./application.ts";
const context = { principalId: "synthetic-principal-a", workspaceId: "synthetic-workspace-a" };
function sessionCommand(): SessionCreateCommandV1 { const id = randomUUID(); return { schemaVersion: 1, commandId: id, idempotencyKey: id, workspaceId: context.workspaceId, expectedRevision: 0, payload: { kind: "session.create", contract: syntheticTaskSessionContract } }; }
function taskCommand(sessionId: string): LocalApiCommandV1 { const id = randomUUID(); return { schemaVersion: 1, commandId: id, idempotencyKey: id, workspaceId: context.workspaceId, expectedRevision: 0, payload: { kind: "task.create", sessionId, executionProfile: syntheticTaskSessionContract.runtimeProfile, request: syntheticTaskPrompt, constraints: [], acceptanceChecks: [{ id: "criterion-synthetic" as CriterionId, revision: 1, description: "Independently verify synthetic output", required: true, method: "deterministic-test" }] } }; }
function change(task: Task, kind: "task.cancel" | "task.retry" | "task.continue"): LocalApiCommandV1 { const id = randomUUID(); return { schemaVersion: 1, commandId: id, idempotencyKey: id, workspaceId: context.workspaceId, expectedRevision: task.revision, payload: { kind, targetRef: { kind: "task", id: task.id, revision: task.revision } } }; }
function create(h: SyntheticTaskSessionHarness) { const session = h.application.createSession(context, sessionCommand()); const command = taskCommand(session.value.aggregate.id), receipt = h.application.executeTask(context, command); return { taskId: receipt.value.aggregate.id, sessionId: session.value.aggregate.id, command, receipt }; }

test("Committed history/idempotency survives restart and continuation creates a new attempt", async t => {
 const h = await createSyntheticTaskSessionHarness(); t.after(() => h.close());
 const { taskId, sessionId, command, receipt } = create(h), original = h.application.getTask(context, taskId).value;
 assert.deepEqual(h.application.executeTask(context, command), receipt);
 const owner = h.application.getSession(context, sessionId).value.ownerEpoch;
 await h.restart(); assert.deepEqual(h.application.getTask(context, taskId).value, original);
 assert.ok(h.application.getSession(context, sessionId).value.ownerEpoch > owner);
 h.application.executeTask(context, change(original, "task.continue"));
 const continued = h.application.getTask(context, taskId).value;
 assert.equal(continued.attempts.length, 2); assert.notEqual(continued.attempts[1]!.id, original.attempts[0]!.id);
 h.application.executeTask(context, change(continued, "task.cancel")); assert.equal(h.application.getTask(context, taskId).value.state, "CANCELLED");
 assert.throws(() => h.application.getTask({ principalId: "synthetic-principal-b", workspaceId: "synthetic-workspace-b" }, taskId));
});

test("Actual synthetic Worker persists runtime/model inputs and settles only to VERIFYING", async t => {
 const peer = await createSyntheticWorkerTestPackage(), h = await createSyntheticTaskSessionHarness({ runtime: { packageDirectory: peer.root, nodeExecutable: process.execPath } });
 t.after(async () => { await h.close(); await peer.remove(); }); const { taskId } = create(h); await h.idle();
 const task = h.application.getTask(context, taskId).value; assert.equal(task.state, "VERIFYING"); assert.equal(task.attempts[0]!.outcomes.length, 0);
 assert.ok(h.application.replay(context, { afterCommitCursor: 0, limit: 100 }).events.some(row => row.event.type === "task.progress"));
 const evidence = h.evidence(context, taskId); assert.equal(evidence.execution?.state, "STOPPED"); assert.equal(evidence.execution?.closed, true);
 assert.equal(evidence.runtimeInputs.length, 1); assert.equal(evidence.modelRequests.length, 1); assert.equal(evidence.execution?.spec.prompt, syntheticTaskPrompt);
 assert.equal(evidence.modelRequests[0]!.bindingId, evidence.execution?.bindingId); assert.ok(JSON.stringify(evidence.modelRequests[0]!.context).includes(syntheticTaskPrompt));
 assert.throws(() => h.evidence({ principalId: "synthetic-principal-b", workspaceId: "synthetic-workspace-b" }, taskId));
 await h.restart(); assert.deepEqual(h.application.getTask(context, taskId).value, task); assert.deepEqual(h.evidence(context, taskId), evidence);
});

test("Concurrent direct calls share one queue and never dispatch twice", async t => {
 const peer = await createSyntheticWorkerTestPackage(), h = await createSyntheticTaskSessionHarness({ runtime: { packageDirectory: peer.root, nodeExecutable: process.execPath } });
 t.after(async () => { await h.close(); await peer.remove(); }); const { taskId } = create(h);
 await Promise.all([h.runTask(context, taskId), h.runTask(context, taskId)]); await h.idle(); assert.equal(h.evidence(context, taskId).modelRequests.length, 1);
});

for (const operation of ["cancel", "restart"] as const) test(`Actual handshake ${operation} closes Worker before any model reception`, async t => {
 const peer = await createSyntheticWorkerTestPackage({ pauseHandshake: true }), h = await createSyntheticTaskSessionHarness({ runtime: { packageDirectory: peer.root, nodeExecutable: process.execPath } });
 t.after(async () => { await h.close(); await peer.remove(); }); const { taskId } = create(h); await peer.waitForHandshake();
 if (operation === "restart") await h.restart(); else h.application.executeTask(context, change(h.application.getTask(context, taskId).value, "task.cancel"));
 await h.idle(); assert.equal(h.application.getTask(context, taskId).value.state, operation === "restart" ? "READY" : "CANCELLED");
 assert.equal(h.evidence(context, taskId).execution?.closed, true); assert.equal(h.evidence(context, taskId).modelRequests.length, 0);
});

test("Concurrent restart/close shuts down replacement API and repeated close is idempotent", async () => {
 const h = await createSyntheticTaskSessionHarness(), origin = await h.api.listen();
 await Promise.all([h.restart(), h.close(), h.close()]); await h.close(); await assert.rejects(fetch(`${origin}/v1/capabilities`)); await assert.rejects(h.api.listen());
});

test("Cancellation before queued admission creates no execution", async t => {
 const peer = await createSyntheticWorkerTestPackage(), h = await createSyntheticTaskSessionHarness({ runtime: { packageDirectory: peer.root, nodeExecutable: process.execPath } });
 t.after(async () => { await h.close(); await peer.remove(); }); const { taskId } = create(h);
 h.application.executeTask(context, change(h.application.getTask(context, taskId).value, "task.cancel")); await h.idle();
 assert.equal(h.application.getTask(context, taskId).value.state, "CANCELLED"); assert.equal(h.evidence(context, taskId).execution, undefined); assert.equal(h.evidence(context, taskId).modelRequests.length, 0);
});

test("Composition rejects executable option accessors without invoking them", async () => {
 let called = false; const options = Object.defineProperty({}, "runtime", { enumerable: true, get() { called = true; return {}; } });
 await assert.rejects(createSyntheticTaskSessionHarness(options), { code: "validation" }); assert.equal(called, false);
 await assert.rejects(createSyntheticTaskSessionHarness({ runtime: null } as never), { code: "validation" });
});

test("Restart of actually dispatched Worker preserves unknown outcome without native resume", async t => {
 const peer = await createSyntheticWorkerTestPackage({ pausePrompt: true }), h = await createSyntheticTaskSessionHarness({ runtime: { packageDirectory: peer.root, nodeExecutable: process.execPath } });
 t.after(async () => { await h.close(); await peer.remove(); }); const { taskId } = create(h); await peer.waitForPrompt(); assert.equal(h.application.getTask(context, taskId).value.state, "RUNNING");
 await h.restart(); await h.idle(); const task = h.application.getTask(context, taskId).value; assert.equal(task.state, "UNVERIFIABLE");
 assert.equal(task.attempts[0]!.outcomes[0]!.status, "unverifiable"); assert.ok(task.attempts[0]!.outcomes[0]!.criteriaResults.every(row => row.status === "unknown")); assert.equal(h.evidence(context, taskId).execution?.closed, true);
});

test("Notification exceptions do not undo committed history or its replayed receipt", async t => {
 const h = await createSyntheticTaskSessionHarness(); t.after(() => h.close()); const unsubscribe = h.application.subscribe(() => { throw new Error("Synthetic subscriber failure"); });
 const { taskId, command, receipt } = create(h); await Promise.resolve(); unsubscribe(); assert.equal(h.application.getTask(context, taskId).value.state, "READY"); assert.deepEqual(h.application.executeTask(context, command), receipt);
});

for (const kind of ["task.cancel", "task.pause"] as const) test(`Dispatched ${kind} waits for exact process close before terminal control state`, async t => {
 const peer = await createSyntheticWorkerTestPackage({ pausePrompt: true }), h = await createSyntheticTaskSessionHarness({ runtime: { packageDirectory: peer.root, nodeExecutable: process.execPath } });
 t.after(async () => { await h.close(); await peer.remove(); }); const { taskId } = create(h); await peer.waitForPrompt();
 const task = h.application.getTask(context, taskId).value, id = randomUUID();
 h.application.executeTask(context, { schemaVersion: 1, commandId: id, idempotencyKey: id, workspaceId: context.workspaceId, expectedRevision: task.revision, payload: { kind, targetRef: { kind: "task", id: task.id, revision: task.revision } } });
 await h.idle(); const final = h.application.getTask(context, taskId).value;
 assert.equal(final.state, kind === "task.cancel" ? "CANCELLED" : "PAUSED"); assert.equal(h.evidence(context, taskId).execution?.closed, true); assert.equal(final.attempts[0]!.outcomes.length, 0);
});

test("Actual HTTP lost response replays one durable Task; CLI/SSE read SQLite truth across restart", async t => {
 const h = await createSyntheticTaskSessionHarness(); t.after(() => h.close());
 let origin = await h.api.listen(); const paired = await pairSyntheticSessionCli(origin, h.api.issuePairingCode("cli"));
 const headers = { authorization: `Bearer ${paired.credential}`, "content-type": "application/json" };
 const post = async (path: string, command: unknown) => {
   const response = await fetch(`${origin}${path}`, { method: "POST", headers, body: JSON.stringify(command) }); assert.equal(response.status, 201); return response;
 };
 const session = await (await post("/v1/sessions", sessionCommand())).json() as { aggregate: { id: string } };
 const options = { baseUrl: origin, credential: paired.credential, timeoutMs: 30000 }, client = createSessionDataClient(options);
 const before = await client.snapshot(context.workspaceId), command = taskCommand(session.aggregate.id);
 const controller = new AbortController(), iterator = client.events(context.workspaceId, before.asOfCursor, controller.signal)[Symbol.asyncIterator]();
 const next = iterator.next();
 const lost = await post("/v1/tasks", command); await lost.body?.cancel(); // Commit succeeds; caller loses the receipt body.
 const receipt = await (await post("/v1/tasks", command)).json() as { aggregate: { id: string }; status: string };
 assert.equal(receipt.status, "committed"); assert.equal((await client.tasks(context.workspaceId)).value.tasks.length, 1);
 const frame = await next; assert.equal(frame.done, false); assert.equal(frame.value!.event.aggregate.id, receipt.aggregate.id);
 controller.abort(); await iterator.return(undefined);
 const output: string[] = []; assert.equal(await runSessionCli(["task", context.workspaceId, receipt.aggregate.id, "--json"], line => output.push(line), options), 0); assert.ok(output[0]!.includes(receipt.aggregate.id));
 const snapshot = await client.snapshot(context.workspaceId); await h.restart(); origin = await h.api.listen();
 const pairedAgain = await pairSyntheticSessionCli(origin, h.api.issuePairingCode("cli")); const restarted = createSessionDataClient({ baseUrl: origin, credential: pairedAgain.credential, timeoutMs: 30000 });
 assert.equal((await restarted.task(context.workspaceId, receipt.aggregate.id)).value.state, "READY");
 const stale = restarted.events(context.workspaceId, snapshot.asOfCursor)[Symbol.asyncIterator](); await assert.rejects(stale.next(), { code: "snapshot_required" });
});


test("Interrupted control plane exposes blocked custody, then exact retained Worker close permits a new attempt", async t => {
 const peer = await createSyntheticWorkerTestPackage({ pausePrompt: true });
 const h = await createSyntheticTaskSessionHarness({ runtime: { packageDirectory: peer.root, nodeExecutable: process.execPath } });
 t.after(async () => { await h.close(); await peer.remove(); });
 const { taskId, command, receipt } = create(h); await peer.waitForPrompt();
 const prior = h.application.getTask(context, taskId).value, execution = h.evidence(context, taskId).execution!;
 assert.equal(prior.state, "RUNNING"); assert.equal(execution.closed, false);
 await h.interruptControlPlane();
 const blocked = h.application.getTask(context, taskId);
 assert.deepEqual(blocked.value, prior); assert.deepEqual(blocked.recovery, { status: "blocked", reason: "worker_custody_required" });
 assert.deepEqual(h.application.snapshot(context).tasks[0]!.recovery, blocked.recovery);
 assert.deepEqual(h.application.listTasks(context, { limit: 10 }).value.tasks[0]!.recovery, blocked.recovery);
 assert.equal(h.evidence(context, taskId).execution!.closed, false);
 assert.throws(() => h.application.executeTask(context, change(prior, "task.continue")), { reason: "recovery_required" });
 assert.deepEqual(h.application.executeTask(context, command), receipt);
 const origin = await h.api.listen(), pairing = await pairSyntheticSessionCli(origin, h.api.issuePairingCode("cli"));
 const client = createSessionDataClient({ baseUrl: origin, credential: pairing.credential });
 assert.deepEqual((await client.task(context.workspaceId, taskId)).recovery, blocked.recovery);
 assert.deepEqual((await client.snapshot(context.workspaceId)).tasks[0]!.recovery, blocked.recovery);
 await h.reconcileRetainedWorkers(); await h.idle();
 const stopped = h.application.getTask(context, taskId); assert.equal(stopped.recovery, undefined); assert.equal(stopped.value.state, "UNVERIFIABLE");
 const closed = h.evidence(context, taskId).execution!; assert.equal(closed.bindingId, execution.bindingId); assert.equal(closed.ownerEpoch, execution.ownerEpoch); assert.equal(closed.closed, true); assert.ok(closed.closeEvidence);
 assert.ok(stopped.value.attempts[0]!.outcomes[0]!.criteriaResults.every(result => result.status === "unknown"));
 await peer.releasePrompt(); h.application.executeTask(context, change(stopped.value, "task.continue")); await h.idle();
 const continued = h.application.getTask(context, taskId).value; assert.equal(continued.attempts.length, 2); assert.equal(continued.state, "VERIFYING");
 assert.notEqual(continued.attempts[1]!.id, prior.attempts[0]!.id); assert.deepEqual(continued.attempts[0], stopped.value.attempts[0]);
 assert.notEqual(h.evidence(context, taskId).execution!.bindingId, execution.bindingId);
});


for (const window of ["handshake", "cancelling"] as const) test(`Retained custody recovers the ${window} interruption window without fabricated close`, async t => {
 const peer = await createSyntheticWorkerTestPackage(window === "handshake" ? { pauseHandshake: true } : { pausePrompt: true });
 const h = await createSyntheticTaskSessionHarness({ runtime: { packageDirectory: peer.root, nodeExecutable: process.execPath } });
 t.after(async () => { await h.close(); await peer.remove(); }); const { taskId } = create(h);
 if (window === "handshake") await peer.waitForHandshake(); else { await peer.waitForPrompt(); h.application.executeTask(context, change(h.application.getTask(context, taskId).value, "task.cancel")); }
 await h.interruptControlPlane(); await h.reconcileRetainedWorkers(); await h.idle();
 const stopped = h.application.getTask(context, taskId); assert.equal(stopped.recovery, undefined); assert.equal(stopped.value.state, window === "handshake" ? "READY" : "CANCELLED");
 assert.equal(h.evidence(context, taskId).execution!.closed, true); assert.equal(h.evidence(context, taskId).modelRequests.length, 0);
 if (window === "handshake") { await peer.releaseHandshake(); h.application.executeTask(context, change(stopped.value, "task.continue")); await h.idle(); assert.equal(h.application.getTask(context, taskId).value.attempts.length, 2); }
});

for (const action of ["restart", "interruptControlPlane", "reconcileRetainedWorkers"] as const) test(`A rejected pre-close lifecycle operation does not poison later ${action}`, async t => {
 const h = await createSyntheticTaskSessionHarness(); t.after(() => h.close());
 const originalApi = h.api, originalClose = originalApi.close;
 originalApi.close = async () => { throw new Error("synthetic pre-close failure"); };
 try { await assert.rejects(h.restart(), /synthetic pre-close failure/); }
 finally { originalApi.close = originalClose; }
 await h[action](); await h.reconcileRetainedWorkers(); await h.restart();
 const origin = await h.api.listen(), pair = await pairSyntheticSessionCli(origin, h.api.issuePairingCode("cli"));
 assert.deepEqual((await createSessionDataClient({ baseUrl: origin, credential: pair.credential }).snapshot(context.workspaceId)).tasks, []);
});

test("Concurrent API listen and restart closes the old port and permits later real Worker execution", async t => {
 const peer = await createSyntheticWorkerTestPackage(), h = await createSyntheticTaskSessionHarness({ runtime: { packageDirectory: peer.root, nodeExecutable: process.execPath } });
 t.after(async () => { await h.close(); await peer.remove(); });
 const oldApi = h.api, listening = oldApi.listen(), restarted = h.restart();
 const origin = await listening; await restarted;
 await assert.rejects(fetch(`${origin}/v1/capabilities`), TypeError); assert.notEqual(h.api, oldApi);
 await h.reconcileRetainedWorkers(); await h.restart();
 const currentOrigin = await h.api.listen(), pair = await pairSyntheticSessionCli(currentOrigin, h.api.issuePairingCode("cli"));
 assert.deepEqual((await createSessionDataClient({ baseUrl: currentOrigin, credential: pair.credential }).snapshot(context.workspaceId)).tasks, []);
 const { taskId } = create(h); await h.idle(); assert.equal(h.application.getTask(context, taskId).value.state, "VERIFYING");
 const execution = h.evidence(context, taskId).execution!; assert.equal(execution.closed, true); assert.ok(execution.closeEvidence);
});

test("Concurrent API listen, restart and repeated close finish without leaving a replacement API or accepting work", async t => {
 const peer = await createSyntheticWorkerTestPackage({ pausePrompt: true }), h = await createSyntheticTaskSessionHarness({ runtime: { packageDirectory: peer.root, nodeExecutable: process.execPath } });
 t.after(async () => { await h.close(); await peer.remove(); });
 const { taskId } = create(h); await peer.waitForPrompt();
 const listening = h.api.listen(), restarted = h.restart(), firstClose = h.close(), secondClose = h.close();
 const origin = await listening; await Promise.all([restarted, firstClose, secondClose]);
 await assert.rejects(fetch(`${origin}/v1/capabilities`), TypeError); await assert.rejects(h.api.listen());
 await assert.rejects(h.runTask(context, taskId)); await assert.rejects(h.restart()); await assert.rejects(h.reconcileRetainedWorkers());
});


test("Cancellation observed at ALLOCATED prevents spawn and commits explicit not-spawned disposal before CANCELLED", async t => {
 const peer = await createSyntheticWorkerTestPackage({ pauseHandshake: true }), h = await createSyntheticTaskSessionHarness({ runtime: { packageDirectory: peer.root, nodeExecutable: process.execPath } });
 t.after(async () => { await h.close(); await peer.remove(); }); const { taskId } = create(h);
 const deadline = Date.now() + 10_000;
 while (!h.evidence(context, taskId).execution) { assert.ok(Date.now() < deadline, "allocation becomes observable"); await nextTick(); }
 const allocated = h.evidence(context, taskId).execution!; assert.equal(allocated.state, "ALLOCATED"); assert.equal(allocated.closed, false);
 h.application.executeTask(context, change(h.application.getTask(context, taskId).value, "task.cancel")); await h.idle();
 const task = h.application.getTask(context, taskId).value, execution = h.evidence(context, taskId).execution!;
 assert.equal(task.state, "CANCELLED"); assert.equal(execution.closed, true); assert.equal(execution.dispatched, false);
 assert.equal(execution.closeEvidence?.processDisposition, "not_spawned"); assert.equal(execution.closeEvidence?.stdoutEof, false); assert.equal(execution.closeEvidence?.stderrEof, false); assert.equal(execution.closeEvidence?.closeObserved, false);
 assert.equal(execution.closeEvidence?.exitCode, null); assert.equal(execution.closeEvidence?.signal, null); assert.equal(h.evidence(context, taskId).modelRequests.length, 0);
 await assert.rejects(access(join(peer.root, "handshake-started")), error => (error as NodeJS.ErrnoException).code === "ENOENT");
 await h.restart(); assert.equal(h.application.getTask(context, taskId).value.state, "CANCELLED"); assert.deepEqual(h.evidence(context, taskId).execution?.closeEvidence, execution.closeEvidence);
});

test("Ordinary missing package startup failure releases only proven non-spawned custody and remains cancellable", async t => {
 const peer = await createSyntheticWorkerTestPackage(), h = await createSyntheticTaskSessionHarness({ runtime: { packageDirectory: join(peer.root, "missing-package"), nodeExecutable: process.execPath } });
 t.after(async () => { await h.close(); await peer.remove(); }); const { taskId } = create(h);
 await assert.rejects(h.idle(), { code: "package" });
 const before = h.application.getTask(context, taskId), execution = h.evidence(context, taskId).execution!;
 assert.equal(before.value.state, "READY"); assert.equal(execution.closed, true); assert.equal(execution.dispatched, false); assert.equal(execution.closeEvidence?.processDisposition, "not_spawned"); assert.equal(execution.closeEvidence?.closeObserved, false);
 assert.equal(h.evidence(context, taskId).modelRequests.length, 0);
 h.application.executeTask(context, change(before.value, "task.cancel")); await h.idle(); assert.equal(h.application.getTask(context, taskId).value.state, "CANCELLED");
 await h.restart(); assert.equal(h.application.getTask(context, taskId).recovery, undefined);
});
