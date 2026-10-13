import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openSyntheticCognitionStoreV2, type MemoryCommandV1 } from "../../../packages/memory-store/src/index.ts";
import { parseSessionApiErrorV1, parseWorkbenchMemorySearchResponseV1, parseWorkbenchMemoryExplanationResponseV1, parseWorkbenchCapabilitiesV1, parseBrowserPairResponseV1 } from "../../../packages/protocol/src/index.ts";
import { createSyntheticSessionApi } from "../../daemon/src/session-api/server.ts";
import { createPersistentSessionApplication, syntheticTaskSessionContract, syntheticCognitiveTaskSessionContract, syntheticTaskPrompt } from "../../daemon/src/task-service/application.ts";
import { reducePersistentTask } from "../../daemon/src/task-service/task-reducer.ts";
import { createPersistentMemoryApplication } from "../../daemon/src/memory-service/application.ts";
import { reduceExplicitMemory, qualifiesExplicitMemory } from "../../daemon/src/memory-service/memory-rules.ts";
import { createSyntheticTaskSessionHarness } from "../../daemon/src/task-service/synthetic-harness.ts";
import { createSyntheticWorkerTestPackage } from "../../daemon/src/runtime/controlled-worker-test-fixture.ts";
import { createSessionDataClient, pairSyntheticSessionCli } from "../../cli/src/session-client.ts";
import { BrowserWorkbench, WorkbenchError } from "./workbench.ts";

const context = { principalId: "synthetic-principal-a", workspaceId: "synthetic-workspace-a" }, scope = { kind: "workspace" as const, workspaceId: context.workspaceId };
const start = Date.parse("2026-10-12T00:00:00.000Z"), text = "SYNTHETIC_ONLY：虚构灯塔使用紫色报告。";
function envelope() { const id = randomUUID(); return { schemaVersion: 1 as const, commandId: id, idempotencyKey: id, workspaceId: context.workspaceId }; }
const query = () => ({ schemaVersion: 1, scope, query: "灯塔", kinds: ["fact"], limit: 10 });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }

/** Node transport adapter for HTTP/SQLite tests; this does not prove real browser Cookie behavior. */
function cookiePort(origin: string) {
  const nativeFetch = globalThis.fetch;
  let cookie = "", storeCookie = true; const sent: { path: string; body?: string }[] = [];
  let hook: ((path: string, response: Response) => Promise<Response>) | undefined;
  const port: typeof fetch = async (input, init) => {
    const path = String(input); assert.ok(path.startsWith("/v1/")); assert.equal(init?.credentials, "same-origin"); assert.equal(init?.mode, "same-origin");
    assert.equal(init?.cache, "no-store"); assert.equal(init?.redirect, "manual");
    const headers = new Headers(init?.headers); headers.set("origin", origin); headers.set("sec-fetch-site", "same-origin"); if (cookie) headers.set("cookie", cookie);
    sent.push({ path, ...(typeof init?.body === "string" ? { body: init.body } : {}) });
    const response = await nativeFetch(origin + path, { ...init, headers }); const next = response.headers.get("set-cookie"); if (next && storeCookie) cookie = next.split(";")[0]!;
    return hook ? hook(path, response) : response;
  };
  return { port, sent, get cookie() { return cookie; }, storage(enabled: boolean) { storeCookie = enabled; }, hook(value?: typeof hook) { hook = value; } };
}
async function fixture(t: TestContext, retentionMs = 86_400_000) {
  const root = mkdtempSync(join(tmpdir(), "zhiwei-web-api-")), dataRoot = join(root, "data"), controlRoot = join(root, "control"); mkdirSync(dataRoot);
  let now = start;
  const store = openSyntheticCognitionStoreV2({ dataRoot, controlRoot, installationId: "synthetic-web-installation", mode: "create", clock: { now: () => new Date(now).toISOString() },
    taskPersistence: { daemonInstanceId: "synthetic-web-daemon", ids: { next: () => randomUUID() }, contentPolicy: { privacy: "model-allowed", retentionUntil: new Date(start + 86_400_000).toISOString() }, reduce: reducePersistentTask },
    memoryPersistence: { ids: { next: () => randomUUID() }, contentPolicy: { privacy: "model-allowed", retentionUntil: new Date(start + retentionMs).toISOString() }, reduce: reduceExplicitMemory, qualifies: qualifiesExplicitMemory } });
  store.registerScope({ kind: "global" }); store.registerScope(scope); store.registerScope({ kind: "workspace", workspaceId: "synthetic-workspace-b" });
  const application = createPersistentSessionApplication({ store: () => store, daemonInstanceId: () => "synthetic-web-daemon" });
  const memory = createPersistentMemoryApplication({ store: () => store, authorize: application.authorize, afterCommit: application.committed });
  let qualificationReads = 0;
  let afterQualificationRead: (() => void) | undefined;
  const api = createSyntheticSessionApi({ application, memory, installationId: "synthetic-web-installation", now: () => now,
    readFence: (owner, read) => { qualificationReads++; const result = store.withReadQualification(owner, read); afterQualificationRead?.(); return result; } });
  const origin = await api.listen(), port = cookiePort(origin); let cleared = 0;
  const client = new BrowserWorkbench({ origin, workspaceId: context.workspaceId, nonce: () => "n".repeat(43), clearFragment: () => { cleared++; }, fetch: port.port, now: () => now, timeoutMs: 10_000 });
  t.after(async () => { client.close(); await api.close(); try { store.close(); } finally { rmSync(root, { recursive: true, force: true }); } });
  const pair = () => client.pairFromFragment(`#bootstrapCode=${api.issuePairingCode("browser")}`);
  const remember = async (validUntil?: string) => {
    assert.equal((await client.capture({ ...envelope(), scope, privacy: "model-allowed", text })).status, "received"); const evidence = client.view.evidence!.evidence;
    const command = { ...envelope(), expectedRevision: 0, payload: { kind: "memory.remember", scope, privacy: "model-allowed", claimKind: "fact", statement: text,
      evidenceRefs: [evidence], validFrom: new Date(now).toISOString(), ...(validUntil ? { validUntil } : {}) } };
    assert.equal((await client.command(command)).status, "confirmed"); await client.search(query()); return client.view.memory!.material[0]!.claim;
  };
  return { api, origin, port, client, store, application, memory, pair, remember, get now() { return now; }, time(value: number) { now = value; }, get cleared() { return cleared; }, get qualificationReads() { return qualificationReads; }, afterRead(callback?: () => void) { afterQualificationRead = callback; } };
}
test("Default browser transport preserves the native fetch receiver through pairing and authorized reads", async t => {
  const f = await fixture(t);
  t.mock.method(globalThis, "fetch", function(this: unknown, input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) {
    if (this !== globalThis) throw new TypeError("Illegal invocation");
    return f.port.port(input, init);
  });
  const client = new BrowserWorkbench({ origin: f.origin, workspaceId: context.workspaceId, nonce: () => "n".repeat(43), clearFragment() {}, now: () => f.now });
  try {
    await client.pair(f.api.issuePairingCode("browser"));
    assert.equal(client.view.connection, "connected");
    assert.equal(client.view.status, "empty");
    assert.deepEqual(f.port.sent.map(request => request.path.split("?")[0]), ["/v1/browser-pair", "/v1/capabilities", "/v1/snapshot"]);
  } finally { client.close(); }
});

test("Actual HTTP/SQLite pairing, session/task commands and memory correction retain exact backend versions", async t => {
  const f = await fixture(t); await f.pair(); assert.ok(f.cleared > 0); await f.client.capabilities(); assert.ok(f.client.view.capabilities!.features.includes("memory"));
  await f.client.refresh(); assert.equal(f.client.view.status, "empty");
  const session = await f.client.createSession({ ...envelope(), expectedRevision: 0, payload: { kind: "session.create", contract: syntheticTaskSessionContract } });
  assert.equal(session.status, "confirmed"); const sessionId = session.receipt!.aggregate.id;
  const task = await f.client.command({ ...envelope(), expectedRevision: 0, payload: { kind: "task.create", sessionId, executionProfile: syntheticTaskSessionContract.runtimeProfile,
    request: syntheticTaskPrompt, constraints: [], acceptanceChecks: [{ id: "check", revision: 1, description: "Synthetic user confirmation", required: true, method: "user-confirmation" }] } });
  const taskId = task.receipt!.aggregate.id; await f.client.task(taskId); const current = f.client.view.task!.value;
  // The actual Task rules reject pausing a READY task; the client preserves that rejection.
  assert.equal((await f.client.command({ ...envelope(), expectedRevision: current.revision, payload: { kind: "task.pause", targetRef: { kind: "task", id: taskId, revision: current.revision } } })).status, "rejected");
  await f.client.task(taskId); assert.equal(f.client.view.task!.value.state, "READY");
  assert.equal((await f.client.command({ ...envelope(), expectedRevision: current.revision, payload: { kind: "task.cancel", targetRef: { kind: "task", id: taskId, revision: current.revision } } })).status, "confirmed");
  await f.client.task(taskId); assert.equal(f.client.view.task!.value.state, "CANCELLED"); const stopped = f.client.view.task!.value;
  assert.equal((await f.client.command({ ...envelope(), expectedRevision: stopped.revision, payload: { kind: "task.continue", targetRef: { kind: "task", id: taskId, revision: stopped.revision } } })).status, "confirmed");
  await f.client.refresh(); assert.equal(f.client.view.snapshot!.tasks.length, 1); assert.equal(f.client.view.snapshot!.tasks[0]!.state, "READY");
  const original = await f.remember(); const correction = { ...envelope(), expectedRevision: original.revision, payload: { kind: "memory.correct", scope,
    targetRef: { kind: "claim", id: original.id, revision: original.revision }, targetVersion: { claimId: original.id, version: original.version }, privacy: original.privacy, claimKind: original.kind,
    statement: "SYNTHETIC_ONLY：虚构灯塔使用琥珀色报告。", evidenceRefs: [original.evidence[0]!], validFrom: original.validFrom } };
  assert.equal((await f.client.command(correction)).status, "confirmed"); assert.equal(f.client.view.memory, undefined);
  await f.client.explain({ schemaVersion: 1, workspaceId: context.workspaceId, scope, claimId: original.id });
  assert.equal(f.client.view.explanation!.currentVersion, 2); assert.equal(f.client.view.explanation!.versions[1]!.status, "SUPERSEDED");
  assert.match(f.client.view.explanation!.value!.statement, /琥珀色/); assert.equal(f.client.view.explanation!.value!.supersedes!.version, 1);
  const explanation = f.client.view.explanation!, historical = { ...explanation.value!, status: "SUPERSEDED", revision: explanation.value!.revision + 1, supersededBy: { claimId: original.id, version: 3 } };
  const versionWindow = { ...explanation, currentVersion: 52, value: historical, versions: Array.from({ length: 50 }, (_, index) => ({ version: 52 - index, revision: (52 - index) * 2,
    status: index === 0 ? "ACTIVE" : "SUPERSEDED", createdAt: historical.createdAt, updatedAt: historical.updatedAt, available: true })) };
  assert.equal(parseWorkbenchMemoryExplanationResponseV1(versionWindow).value!.version, 2); // An explicitly requested older version need not be in the latest-50 window.
  const taskScope = { kind: "task", workspaceId: context.workspaceId, taskId };
  const scoped = await f.client.command({ ...envelope(), expectedRevision: 0, payload: { kind: "memory.remember", scope: taskScope, privacy: original.privacy, claimKind: original.kind,
    statement: "SYNTHETIC_ONLY：任务灯塔使用紫色报告。", evidenceRefs: [original.evidence[0]!], validFrom: original.validFrom } });
  assert.equal(scoped.status, "confirmed"); await f.client.explain({ schemaVersion: 1, workspaceId: context.workspaceId, scope: taskScope, claimId: scoped.receipt!.aggregate.id });
  assert.ok(f.client.view.explanation!.sources.some(source => source.observation.scope.kind === "workspace"));
  assert.equal(JSON.stringify(f.client.view).includes("csrfToken"), false);
});
test("Browser repair consumes only its new ticket; failed repair preserves old session and ticket", async t => {
  const f = await fixture(t); await f.pair(); const oldCookie = f.port.cookie, code = f.api.issuePairingCode("browser", "b"), nonce = "n".repeat(43);
  const raw = (body: unknown, extra: Record<string, string> = {}) => fetch(f.origin + "/v1/browser-pair", { method: "POST", headers: { origin: f.origin, cookie: oldCookie, "content-type": "application/json", ...extra }, body: JSON.stringify(body) });
  const fresh = await raw({ schemaVersion: 1, bootstrapCode: f.api.issuePairingCode("browser"), clientNonce: nonce, clientKind: "browser" }, { cookie: "other_application_cookie=SYNTHETIC_ONLY" });
  assert.equal(fresh.status, 200); // Unrelated cookies do not become identity or block a valid new ticket.
  assert.equal((await raw({ schemaVersion: 1, bootstrapCode: code, clientNonce: nonce, clientKind: "cli" })).status, 400);
  assert.equal((await raw({ schemaVersion: 1, bootstrapCode: code, clientNonce: nonce, clientKind: "browser" }, { cookie: `${oldCookie}; ${oldCookie}` })).status, 400);
  await f.client.capabilities(); const reads = f.qualificationReads;
  const repaired = await raw({ schemaVersion: 1, bootstrapCode: code, clientNonce: nonce, clientKind: "browser" }); assert.equal(repaired.status, 200);
  const body = parseBrowserPairResponseV1(await repaired.json()); assert.equal("credential" in body, false);
  assert.equal((await fetch(f.origin + `/v1/snapshot?workspaceId=${context.workspaceId}`, { headers: { origin: f.origin, cookie: oldCookie } })).status, 401);
  const newCookie = repaired.headers.get("set-cookie")!.split(";")[0]!;
  assert.equal((await fetch(f.origin + `/v1/snapshot?workspaceId=${context.workspaceId}`, { headers: { origin: f.origin, cookie: newCookie } })).status, 404);
  assert.equal(f.qualificationReads, reads); // Cross-Workspace denial precedes actual body reads.
  assert.equal((await raw({ schemaVersion: 1, bootstrapCode: code, clientNonce: nonce, clientKind: "browser" })).status, 401);
  const originalPair = await fetch(f.origin + "/v1/pair", { method: "POST", headers: { origin: f.origin, cookie: newCookie, "content-type": "application/json" },
    body: JSON.stringify({ schemaVersion: 1, bootstrapCode: f.api.issuePairingCode("browser"), clientNonce: nonce, clientKind: "browser" }) }); assert.equal(originalPair.status, 400);
});
test("Pairing requires an authenticated Cookie read for the selected Workspace before showing connected", async t => {
  const f = await fixture(t); f.port.storage(false);
  await assert.rejects(f.pair(), (error: unknown) => error instanceof WorkbenchError && error.code === "permission");
  assert.equal(f.client.view.connection, "permission"); assert.equal(f.client.view.snapshot, undefined);
  f.port.storage(true); await f.pair(); assert.equal(f.client.view.connection, "connected"); assert.equal(f.client.view.snapshot!.workspaceId, context.workspaceId);
  f.client.selectWorkspace("synthetic-workspace-b");
  await assert.rejects(f.client.pair(f.api.issuePairingCode("browser", "a")), (error: unknown) => error instanceof WorkbenchError && error.code === "not_found");
  assert.equal(f.client.view.connection, "permission"); assert.equal(f.client.view.snapshot, undefined);
});
test("Lost committed response remains unknown; explicit retry sends identical bytes and is revoked by new pairing", async t => {
  const f = await fixture(t); await f.pair(); const command = { ...envelope(), expectedRevision: 0, payload: { kind: "session.create", contract: syntheticTaskSessionContract } };
  let dropped = false; f.port.hook(async (path, response) => { if (path === "/v1/sessions" && !dropped) { dropped = true; await response.arrayBuffer(); throw new TypeError("Synthetic lost response"); } return response; });
  assert.equal((await f.client.createSession(command)).status, "unknown"); assert.equal(f.store.tasks.snapshot(context.workspaceId).sessions.length, 1);
  assert.equal(f.port.sent.filter(row => row.path === "/v1/sessions").length, 1); f.client.disconnect();
  const recovered = await f.client.retryUnknown(); assert.equal(recovered.status, "confirmed"); assert.equal(f.store.tasks.snapshot(context.workspaceId).sessions.length, 1);
  const sends = f.port.sent.filter(row => row.path === "/v1/sessions"); assert.equal(sends[0]!.body, sends[1]!.body);
  dropped = false; assert.equal((await f.client.createSession({ ...command, ...envelope() })).status, "unknown"); await f.pair();
  assert.equal(f.client.view.write.status, "idle"); await assert.rejects(async () => f.client.retryUnknown(), (error: unknown) => error instanceof WorkbenchError && error.code === "no_unknown_write");
});
test("Memory invalidation cancels a response already received by transport and late reads cannot restore it", async t => {
  const f = await fixture(t); await f.pair(); const original = await f.remember(); await f.client.refresh();
  const streamOpened = deferred<void>(), oldResponse = deferred<void>(), release = deferred<void>(); let held = false;
  f.port.hook(async (path, response) => {
    if (path.startsWith("/v1/events")) streamOpened.resolve();
    if (path === "/v1/memory/search" && !held) { held = true; const body = await response.arrayBuffer(); oldResponse.resolve(); await release.promise;
      return new Response(body, { status: response.status, headers: response.headers }); }
    return response;
  });
  const watching = f.client.watchEvents(); await streamOpened.promise;
  const reading = f.client.search(query()); const failedRead = assert.rejects(reading, (error: unknown) => error instanceof WorkbenchError && error.code === "cancelled"); await oldResponse.promise;
  const correction: MemoryCommandV1 = { ...envelope(), expectedRevision: original.revision, payload: { kind: "memory.correct", scope,
    targetRef: { kind: "claim", id: original.id, revision: original.revision }, targetVersion: { claimId: original.id, version: original.version }, privacy: original.privacy, claimKind: original.kind,
    statement: "SYNTHETIC_ONLY：虚构灯塔使用琥珀色报告。", evidenceRefs: [original.evidence[0]!], validFrom: original.validFrom } };
  f.memory.execute(context, correction); await assert.rejects(watching, (error: unknown) => error instanceof WorkbenchError && error.code === "snapshot_required");
  assert.equal(f.client.view.memory, undefined); assert.ok(f.client.view.lastConfirmed); release.resolve(); await failedRead; assert.equal(f.client.view.memory, undefined);
  f.port.hook(); await f.client.search(query()); assert.equal(f.client.view.memory!.material[0]!.claim.version, 2);
});
test("CLI retains task events while the browser stream invalidates its loaded memory after a correction", async t => {
  const f = await fixture(t); await f.pair(); const original = await f.remember();
  const session = await f.client.createSession({ ...envelope(), expectedRevision: 0, payload: { kind: "session.create", contract: syntheticTaskSessionContract } });
  await f.client.refresh();
  const paired = await pairSyntheticSessionCli(f.origin, f.api.issuePairingCode("cli")), cli = createSessionDataClient({ baseUrl: f.origin, credential: paired.credential, timeoutMs: 10_000 });
  const snapshot = await cli.snapshot(context.workspaceId), controller = new AbortController();
  const iterator = cli.events(context.workspaceId, snapshot.asOfCursor, controller.signal)[Symbol.asyncIterator]();
  const next = iterator.next();
  const opened = deferred<void>(); f.port.hook(async (path, response) => { if (path.startsWith("/v1/events")) opened.resolve(); return response; });
  const browser = f.client.watchEvents(), invalidated = assert.rejects(browser, (error: unknown) => error instanceof WorkbenchError && error.code === "snapshot_required"); await opened.promise;
  f.memory.execute(context, { ...envelope(), expectedRevision: original.revision, payload: { kind: "memory.correct", scope,
    targetRef: { kind: "claim", id: original.id, revision: original.revision }, targetVersion: { claimId: original.id, version: original.version }, privacy: original.privacy, claimKind: original.kind,
    statement: "SYNTHETIC_ONLY：虚构灯塔使用琥珀色报告。", evidenceRefs: [original.evidence[0]!], validFrom: original.validFrom } });
  await invalidated; assert.equal(f.client.view.memory, undefined);
  const task = await f.client.command({ ...envelope(), expectedRevision: 0, payload: { kind: "task.create", sessionId: session.receipt!.aggregate.id, executionProfile: syntheticTaskSessionContract.runtimeProfile,
    request: syntheticTaskPrompt, constraints: [], acceptanceChecks: [{ id: "criterion-synthetic", revision: 1, description: "Independently verify synthetic output", required: true, method: "deterministic-test" }] } });
  const frame = await next; assert.equal(frame.done, false); assert.equal(frame.value!.event.aggregate.id, task.receipt!.aggregate.id);
  controller.abort(); await iterator.return(undefined);
});

test("Natural body/source expiry changes qualification without any commit and an independent SSE deadline ends the stream", async t => {
  const f = await fixture(t, 500); await f.pair(); const original = await f.remember(); await f.client.refresh(); await f.client.search(query());
  const before = f.store.withReadQualification(context, () => undefined).qualification, fence = f.store.currentFence(scope);
  assert.equal(before.notAfter, new Date(start + 500).toISOString());
  const cursor = f.client.view.snapshot!.asOfCursor;
  const response = await f.port.port(`/v1/events?workspaceId=${context.workspaceId}`, { method: "GET", credentials: "same-origin", mode: "same-origin", cache: "no-store", redirect: "manual", headers: { "last-event-id": cursor }, signal: AbortSignal.timeout(3000) });
  assert.equal(response.status, 200); f.time(start + 500);
  const after = f.store.withReadQualification(context, () => undefined).qualification; assert.notEqual(after.qualificationKey, before.qualificationKey); assert.deepEqual(f.store.currentFence(scope), fence);
  assert.equal(f.client.view.memory, undefined); assert.ok(f.client.view.lastConfirmed);
  const frame = await response.text(); assert.match(frame, /event: stream.error/); const data = /^data: (.+)$/m.exec(frame)![1]!;
  assert.equal(parseSessionApiErrorV1(JSON.parse(data)).error.reason, "snapshot_required");
  await f.client.search(query()); assert.equal(f.client.view.memory!.material.length, 0);
  const explanation = f.store.memories.explain(context, scope, original.id); assert.equal(explanation.value, undefined); assert.equal(explanation.sources.length, 0);
});
test("Semantic validity deadline and same-scope expired/late queries revoke publication without losing exact write eligibility", async t => {
  const f = await fixture(t); await f.pair(); await f.remember(new Date(start + 500).toISOString());
  const before = f.store.withReadQualification(context, () => undefined).qualification; assert.equal(before.notAfter, new Date(start + 500).toISOString());
  const held = deferred<void>(), release = deferred<void>(); f.port.hook(async (path, response) => { if (path === "/v1/memory/search") { const body = await response.arrayBuffer(); held.resolve(); await release.promise; return new Response(body, { status: response.status, headers: response.headers }); } return response; });
  const reading = f.client.search(query()); const failed = assert.rejects(reading, (error: unknown) => error instanceof WorkbenchError && ["cancelled", "expired_read"].includes(error.code)); await held.promise;
  f.time(start + 500); assert.equal(f.client.view.memory, undefined); release.resolve(); await failed; assert.equal(f.client.view.memory, undefined);
  f.port.hook(); await f.client.search(query()); assert.equal(f.client.view.memory!.material.length, 0); assert.equal(f.client.view.connection, "connected");
});
test("A newer query selection in the same Workspace wins over an already received older response", async t => {
  const f = await fixture(t); await f.pair(); await f.remember(); const held = deferred<void>(), release = deferred<void>(); let first = true;
  f.port.hook(async (path, response) => { if (path === "/v1/memory/search" && first) { first = false; const body = await response.arrayBuffer(); held.resolve(); await release.promise;
    return new Response(body, { status: response.status, headers: response.headers }); } return response; });
  const older = f.client.search(query()); const cancelled = assert.rejects(older, (error: unknown) => error instanceof WorkbenchError && error.code === "cancelled"); await held.promise;
  await f.client.search({ ...query(), query: "不存在" }); assert.equal(f.client.view.memory!.material.length, 0); release.resolve(); await cancelled;
  assert.equal(f.client.view.memory!.material.length, 0); assert.equal(f.client.view.status, "empty");
});
test("Unknown fields, missing leases, corrupt success and wrong-scope responses fail before state publication", async t => {
  const f = await fixture(t); await f.pair(); await f.remember(); const valid = f.client.view.memory!;
  assert.throws(() => parseWorkbenchMemorySearchResponseV1({ ...valid, secret: "SYNTHETIC_ONLY" }));
  assert.throws(() => parseWorkbenchMemorySearchResponseV1({ ...valid, material: [{ ...valid.material[0]!, claim: { ...valid.material[0]!.claim, scope: { kind: "workspace", workspaceId: "synthetic-workspace-b" } } }] }));
  const capabilities = await fetch(f.origin + "/v1/capabilities", { headers: { origin: f.origin, cookie: f.port.cookie } }).then(response => response.json());
  assert.throws(() => parseWorkbenchCapabilitiesV1({ ...capabilities, supportedCommands: ["future.write"] }));
  f.port.hook(async (path, response) => { if (path === "/v1/memory/search") { const body = await response.arrayBuffer(), headers = new Headers(response.headers); headers.delete("x-zhiwei-read-not-after"); return new Response(body, { status: 200, headers }); } return response; });
  await assert.rejects(f.client.search(query()), (error: unknown) => error instanceof WorkbenchError && error.code === "invalid_response"); assert.equal(f.client.view.memory, undefined);
  f.port.hook(async (path, response) => { if (path === "/v1/sessions") { const value = await response.json(); return Response.json({ ...value, commandId: "different-command" }); } return response; });
  assert.equal((await f.client.createSession({ ...envelope(), expectedRevision: 0, payload: { kind: "session.create", contract: syntheticTaskSessionContract } })).status, "unknown");
});
test("A late successful write cannot republish a revoked body; same-identity exact retry remains available", async t => {
  const f = await fixture(t); await f.pair(); const received = deferred<void>(), release = deferred<void>(); let held = false;
  f.port.hook(async (path, response) => { if (path === "/v1/memory/inputs" && !held) { held = true; const body = await response.arrayBuffer(); received.resolve(); await release.promise;
    return new Response(body, { status: response.status, headers: response.headers }); } return response; });
  const writing = f.client.capture({ ...envelope(), scope, privacy: "model-allowed", text }); await received.promise; f.client.disconnect(); release.resolve();
  assert.equal((await writing).status, "unknown"); assert.equal(f.client.view.evidence, undefined);
  assert.equal((await f.client.retryUnknown()).status, "received"); assert.equal(f.client.view.evidence!.replay, true);
  const sent = f.port.sent.filter(row => row.path === "/v1/memory/inputs"); assert.equal(sent[0]!.body, sent[1]!.body);
});
test("Rejecting an exact retry after source expiry does not misreport an earlier unobserved commit as failure", async t => {
  const f = await fixture(t, 500); await f.pair(); let dropped = false;
  f.port.hook(async (path, response) => { if (path === "/v1/memory/inputs" && !dropped) { dropped = true; await response.arrayBuffer(); throw new TypeError("Synthetic lost commit response"); } return response; });
  assert.equal((await f.client.capture({ ...envelope(), scope, privacy: "model-allowed", text })).status, "unknown");
  f.time(start + 500); const replay = await f.client.retryUnknown(); assert.equal(replay.status, "unknown"); assert.equal(replay.code, "not_found"); assert.equal(f.client.view.evidence, undefined);
  const sends = f.port.sent.filter(row => row.path === "/v1/memory/inputs"); assert.equal(sends[0]!.body, sends[1]!.body);
});
test("A post-commit qualification failure keeps the first write unknown and retains its exact retry", async t => {
  const f = await fixture(t, 500); await f.pair(); let committed = 0, reads = 0; const unsubscribe = f.application.subscribe(() => { committed++; });
  f.afterRead(() => { if (++reads === 1) f.time(start + 500); });
  const result = await f.client.capture({ ...envelope(), scope, privacy: "model-allowed", text });
  assert.equal(committed, 1); assert.equal(f.store.listObservations(scope).length, 1); assert.equal(result.status, "unknown"); assert.equal(result.code, "snapshot_required"); assert.equal(result.canRetry, true);
  f.afterRead(); const replay = await f.client.retryUnknown(); assert.equal(replay.status, "unknown"); assert.equal(replay.code, "not_found");
  const sends = f.port.sent.filter(row => row.path === "/v1/memory/inputs"); assert.equal(sends[0]!.body, sends[1]!.body); unsubscribe();
});
test("Other-Workspace commits do not alter the authorized qualification and memory capability requires a real reader", async t => {
  const f = await fixture(t); await f.pair(); await f.remember(); const before = f.store.withReadQualification(context, () => undefined).qualification;
  const other = { principalId: "synthetic-principal-b", workspaceId: "synthetic-workspace-b" }, otherScope = { kind: "workspace" as const, workspaceId: other.workspaceId };
  f.memory.capture(other, { ...envelope(), workspaceId: other.workspaceId, scope: otherScope, privacy: "local-only", text: "SYNTHETIC_ONLY：其他工作区的虚构输入。" });
  assert.deepEqual(f.store.withReadQualification(context, () => undefined).qualification, before);
  assert.throws(() => createSyntheticSessionApi({ application: f.application, memory: f.memory, installationId: "synthetic-no-reader" }), { code: "unsupported" });
  const states: string[] = [], unsubscribe = f.client.subscribe(view => { states.push(`${view.connection}:${view.status}`); assert.equal(JSON.stringify(view).includes("csrfToken"), false); });
  f.client.disconnect(); await Promise.resolve(); assert.ok(states.includes("disconnected:degraded")); await f.client.recover(); assert.ok(f.client.view.snapshot); unsubscribe();
  f.client.selectWorkspace("synthetic-workspace-b"); assert.equal(f.client.view.snapshot, undefined); assert.equal(f.client.view.lastConfirmed, undefined); assert.equal(f.client.view.connection, "permission");
});
test("Client result plan, actual controlled Worker verification, feedback and history use backend result bundles", async t => {
  const runtime = await createSyntheticWorkerTestPackage(), harness = await createSyntheticTaskSessionHarness({ runtime: { packageDirectory: runtime.root, nodeExecutable: process.execPath } });
  t.after(async () => { await harness.close(); await runtime.remove(); });
  const origin = await harness.api.listen(), port = cookiePort(origin), client = new BrowserWorkbench({ origin, workspaceId: context.workspaceId, nonce: () => "n".repeat(43), clearFragment() {}, fetch: port.port, timeoutMs: 30_000 });
  t.after(() => client.close()); await client.pair(harness.api.issuePairingCode("browser"));
  const session = await client.createSession({ ...envelope(), expectedRevision: 0, payload: { kind: "session.create", contract: syntheticCognitiveTaskSessionContract } });
  const task = await client.command({ ...envelope(), expectedRevision: 0, payload: { kind: "task.create", sessionId: session.receipt!.aggregate.id, executionProfile: syntheticCognitiveTaskSessionContract.runtimeProfile,
    request: syntheticTaskPrompt, constraints: [], acceptanceChecks: [{ id: "sample", revision: 1, description: "Sample count is eight", required: true, method: "artifact" },
      { id: "subjective", revision: 1, description: "Synthetic user accepts the result", required: true, method: "user-confirmation" }] } });
  const taskId = task.receipt!.aggregate.id; await client.task(taskId);
  assert.equal((await client.bindPlan({ ...envelope(), taskId, expectedRevision: client.view.task!.value.revision, checks: [{ criterionId: "sample", criterionRevision: 1, kind: "artifact", resourceId: "sample", format: "json-equals", expectedText: '{"count":8}' },
    { criterionId: "subjective", criterionRevision: 1, kind: "user-confirmation" }], adoptionChecks: [] })).status, "received");
  await harness.runCognitiveTask(context, taskId); await client.task(taskId); assert.equal(client.view.task!.value.state, "VERIFYING");
  assert.equal((await client.verify({ ...envelope(), taskId, expectedRevision: client.view.task!.value.revision })).status, "confirmed");
  const result = client.view.result!.value; assert.equal(result.outcome.status, "partial");
  assert.equal((await client.feedback({ ...envelope(), taskId, expectedRevision: result.task.revision, attemptId: result.task.attempts.at(-1)!.id, intentRevision: result.task.intent.revision,
    outcomeId: result.outcome.id, outcomeRevision: result.outcome.revision, criterionId: "subjective", criterionRevision: 1, decision: "accepted" })).status, "confirmed");
  await client.result(taskId, true); assert.equal(client.view.resultHistory!.value.length, 2); await client.result(taskId); assert.equal(client.view.result!.value.outcome.revision, 2);
  assert.equal(client.view.result!.value.outcome.status, "completed"); assert.equal(client.view.result!.value.task.state, "PARTIAL");
});
