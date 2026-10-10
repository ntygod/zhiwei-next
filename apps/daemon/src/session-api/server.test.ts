import assert from "node:assert/strict";
import { request as httpRequest, type IncomingMessage } from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";
import type { Task } from "../../../../packages/domain/src/index.ts";
import { parseLocalApiCommandV1, parseSessionContractV1, parseSessionTaskV1, type LocalApiCommandV1, type ProductEventV1, type SessionCreateCommandV1, type SessionV1, type TaskSummaryV1 } from "../../../../packages/protocol/src/index.ts";
import { createSyntheticSessionApi, SessionApiError, syntheticSessionIdentities, type SessionApiApplication, type SessionApiContext, type SessionApiDurableReceipt, type SessionApiCommitted } from "./server.ts";
const at = "2026-10-10T00:00:00.000Z";
const workspace = syntheticSessionIdentities.a.workspaceId;
const profile = () => ({ id: "synthetic-profile", revision: 1 });
const contract = () => parseSessionContractV1({ schemaVersion: 1, runtimeProfile: profile(), modelProfile: profile(), toolProfile: profile(), policyProfile: profile(), dataProfile: profile(), compilerProfile: profile(), interactionKind: "single-task" });
const sessionCommand = (id = 1): SessionCreateCommandV1 => ({ schemaVersion: 1, commandId: `command-session-${id}`, idempotencyKey: `key-session-${id}`, workspaceId: workspace, expectedRevision: 0, payload: { kind: "session.create", contract: contract() } });
const taskCommand = (id = 1): LocalApiCommandV1 => parseLocalApiCommandV1({ schemaVersion: 1, commandId: `command-task-${id}`, idempotencyKey: `key-task-${id}`, workspaceId: workspace, expectedRevision: 0, payload: { kind: "task.create", sessionId: "synthetic-session-1", request: "Synthetic sample report", constraints: [], acceptanceChecks: [{ id: "synthetic-criterion", revision: 1, description: "Synthetic check", required: true, method: "artifact" }], executionProfile: profile() } });
class FixtureApplication implements SessionApiApplication {
  readonly sessions: SessionV1[] = []; readonly tasks: Task[] = []; readonly events: { commitCursor: number; event: ProductEventV1 }[] = [];
  readonly listeners = new Set<() => void>(); readonly receipts = new Map<string, { body: string; committed: SessionApiCommitted<SessionApiDurableReceipt> }>();
  cursor = 0; reads = 0; authorizations = 0; denyAt = Infinity; gap = false; readFailure = false;
  subscribe(listener: () => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  notify() { for (const listener of this.listeners) listener(); }
  authorize(context: SessionApiContext) { this.authorizations++; return this.authorizations < this.denyAt && Object.values(syntheticSessionIdentities).some(value => value.principalId === context.principalId && value.workspaceId === context.workspaceId); }
  append(event: ProductEventV1) { this.events.push({ commitCursor: ++this.cursor, event }); this.notify(); }
  summary(task: Task): TaskSummaryV1 { return { id: task.id, workspaceId: task.workspaceId, sessionId: task.sessionId, revision: task.revision, intentRevision: task.intent.revision, state: task.state, updatedAt: task.updatedAt }; }
  createSession(context: SessionApiContext, command: SessionCreateCommandV1): SessionApiCommitted<SessionApiDurableReceipt> {
    const key = `${context.principalId}:${command.idempotencyKey}`; const prior = this.receipts.get(key);
    if (prior) { if (prior.body !== JSON.stringify(command)) throw new SessionApiError("idempotency_conflict", "idempotency_conflict", 409); return prior.committed; }
    const session: SessionV1 = { schemaVersion: 1, id: `synthetic-session-${this.sessions.length + 1}`, workspaceId: context.workspaceId, revision: 1, ownerEpoch: 1, contract: command.payload.contract, createdAt: at, updatedAt: at }; this.sessions.push(session);
    this.append({ schemaVersion: 1, eventId: `event-${this.cursor + 1}`, workspaceId: context.workspaceId, aggregate: { kind: "session", id: session.id, revision: 1 }, occurredAt: at, type: "session.created", payload: { ownerEpoch: 1 } });
    const committed: SessionApiCommitted<SessionApiDurableReceipt> = { commitCursor: this.cursor, value: { schemaVersion: 1, commandId: command.commandId, status: "committed", aggregate: { kind: "session", id: session.id, revision: 1 }, result: { kind: "session", ownerEpoch: 1 } } };
    this.receipts.set(key, { body: JSON.stringify(command), committed }); return committed;
  }
  executeTask(context: SessionApiContext, command: LocalApiCommandV1): SessionApiCommitted<SessionApiDurableReceipt> {
    if (command.payload.kind !== "task.create") throw new SessionApiError("unsupported", "runtime_capability", 422);
    const payload = command.payload; const id = `synthetic-task-${this.tasks.length + 1}`;
    const intent = { revision: 1, request: payload.request, constraints: payload.constraints, criteria: payload.acceptanceChecks };
    const task = parseSessionTaskV1({ id, workspaceId: context.workspaceId, sessionId: payload.sessionId, revision: 1, intent, state: "READY", attempts: [{ id: `synthetic-attempt-${this.tasks.length + 1}`, taskId: id, workspaceId: context.workspaceId, intent: structuredClone(intent), state: "READY", createdAt: at, updatedAt: at, pauseRequested: false, cancellationRequested: false, completeness: "not-settled", outcomes: [], unresolvedActions: [] }], createdAt: at, updatedAt: at }); this.tasks.push(task);
    this.append({ schemaVersion: 1, eventId: `event-${this.cursor + 1}`, workspaceId: context.workspaceId, aggregate: { kind: "task", id, revision: 1 }, occurredAt: at, type: "task.created", payload: { state: "READY", intentRevision: 1 } });
    return { commitCursor: this.cursor, value: { schemaVersion: 1, commandId: command.commandId, status: "committed", aggregate: { kind: "task", id, revision: 1 }, result: { kind: "task", taskState: "READY", intentRevision: 1 } } };
  }
  getSession(context: SessionApiContext, id: string) { this.reads++; if (this.readFailure) throw new Error("private-secret /private/path Synthetic prompt"); const value = this.sessions.find(session => session.workspaceId === context.workspaceId && session.id === id); if (!value) throw new SessionApiError("not_found", "not_found", 404); return { value, commitCursor: this.cursor }; }
  getTask(context: SessionApiContext, id: string) { this.reads++; const value = this.tasks.find(task => task.workspaceId === context.workspaceId && task.id === id); if (!value) throw new SessionApiError("not_found", "not_found", 404); return { value, commitCursor: this.cursor }; }
  listTasks(context: SessionApiContext, query: Readonly<{ state?: string; limit: number; after?: string }>) { this.reads++; const values = this.tasks.filter(task => task.workspaceId === context.workspaceId && (!query.state || task.state === query.state) && (!query.after || task.id > query.after)); const selected = values.slice(0, query.limit); return { commitCursor: this.cursor, value: { tasks: selected.map(task => this.summary(task)), ...(values.length > selected.length ? { nextAfter: selected.at(-1)!.id } : {}) } }; }
  snapshot(context: SessionApiContext) { this.reads++; return { sessions: this.sessions.filter(session => session.workspaceId === context.workspaceId), tasks: this.tasks.filter(task => task.workspaceId === context.workspaceId).map(task => this.summary(task)), commitCursor: this.cursor }; }
  replay(context: SessionApiContext, query: Readonly<{ afterCommitCursor: number; limit: number }>) { this.reads++; const rows = this.events.filter(row => row.event.workspaceId === context.workspaceId && row.commitCursor > query.afterCommitCursor); return { events: rows.slice(0, query.limit), highWatermark: this.cursor, hasMore: rows.length > query.limit, gap: this.gap }; }
}
async function setup(options: Readonly<{ now?: () => number; sessionTtlMs?: number; drainTimeoutMs?: number }> = {}) {
  const app = new FixtureApplication(); const api = createSyntheticSessionApi({ application: app, installationId: "synthetic-installation", ...options }); const base = await api.listen();
  const call = (path: string, headers: Record<string, string> = {}, body?: unknown) => fetch(base + path, { method: body === undefined ? "GET" : "POST", headers: { ...(body === undefined ? {} : { "content-type": "application/json" }), ...headers }, ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }) });
  const pair = async (kind: "cli" | "browser" = "cli", fixture: "a" | "b" = "a") => {
    const code = api.issuePairingCode(kind, fixture); const request = { schemaVersion: 1, bootstrapCode: code, clientNonce: "x".repeat(43), clientKind: kind };
    const response = await call("/v1/pair", kind === "browser" ? { origin: base } : {}, request); assert.equal(response.status, 200); const body = await response.json() as { credential?: string; csrfToken?: string };
    const headers: Record<string, string> = kind === "cli" ? { authorization: `Bearer ${body.credential}` } : { origin: base, cookie: response.headers.get("set-cookie")!.split(";")[0]!, "x-zhiwei-csrf": body.csrfToken! };
    return { code, request, response, body, headers };
  };
  return { app, api, base, call, pair };
}
async function frames(response: Response, count: number): Promise<string[]> {
  const reader = response.body!.getReader(); let text = ""; const result: string[] = [];
  try { while (result.length < count) { const part = await reader.read(); if (part.done) break; text += new TextDecoder().decode(part.value); let end: number; while ((end = text.indexOf("\n\n")) >= 0) { result.push(text.slice(0, end)); text = text.slice(end + 2); } } return result; }
  finally { await reader.cancel(); reader.releaseLock(); }
}
const snapshotPath = `/v1/snapshot?workspaceId=${workspace}`;
const eventPath = `/v1/events?workspaceId=${workspace}`;
test("Synthetic pairing is one-use, short-lived, fixed-scope and distinct from diagnostics", async () => {
  let now = Date.parse(at); const fixture = await setup({ now: () => now });
  try {
    const pair = await fixture.pair(); assert.equal((await fixture.call("/v1/pair", {}, pair.request)).status, 401);
    const code = fixture.api.issuePairingCode("cli"); now += 300_000; assert.equal((await fixture.call("/v1/pair", {}, { ...pair.request, bootstrapCode: code })).status, 401);
    assert.equal((await fixture.call("/v1/pair", {}, { ...pair.request, principalId: "synthetic-principal-b" })).status, 400);
    const reads = fixture.app.reads; assert.equal((await fixture.call("/v1/snapshot?workspaceId=synthetic-workspace-b", pair.headers)).status, 404); assert.equal(fixture.app.reads, reads);
    assert.equal((await fixture.call(snapshotPath, { authorization: `Bearer ${"a".repeat(64)}` })).status, 401);
    const capabilities = await fixture.call("/v1/capabilities", pair.headers); assert.equal(capabilities.headers.get("cache-control"), "no-store");
    const value = await capabilities.json(); assert.deepEqual(value.unsupportedCommands, ["task.respond", "task.confirm-result"]); assert.ok(value.runtime.limitations.includes("fixed-synthetic-request-only"));
  } finally { await fixture.api.close(); }
});
test("Browser pairing enforces fixed Origin, HttpOnly cookie and independent CSRF on writes", async () => {
  const fixture = await setup();
  try {
    const browser = await fixture.pair("browser"); const cookie = browser.response.headers.get("set-cookie")!;
    assert.match(cookie, /HttpOnly/); assert.match(cookie, /SameSite=Strict/); assert.match(cookie, /Path=\/v1\//); assert.equal(browser.body.credential, undefined);
    const { "x-zhiwei-csrf": _, ...noCsrf } = browser.headers;
    assert.equal((await fixture.call("/v1/sessions", noCsrf, sessionCommand())).status, 403);
    assert.equal((await fixture.call(snapshotPath, { ...browser.headers, origin: "http://invalid.example" })).status, 403);
    assert.equal((await fixture.call(snapshotPath, { cookie: browser.headers.cookie! })).status, 403);
    assert.equal((await fixture.call("/v1/sessions", browser.headers, sessionCommand())).status, 201);
    const cli = await fixture.pair(); assert.equal((await fixture.call(snapshotPath, { ...cli.headers, origin: fixture.base })).status, 401);
    assert.equal((await fixture.call(snapshotPath, { ...cli.headers, cookie: browser.headers.cookie! })).status, 401);
    const code = fixture.api.issuePairingCode("browser"); assert.equal((await fixture.call("/v1/pair", { origin: "http://invalid.example" }, { ...browser.request, bootstrapCode: code })).status, 403);
  } finally { await fixture.api.close(); }
});
test("Committed session/task CRUD uses scoped queries, bounded lists, safe errors and durable retry receipts", async () => {
  const fixture = await setup();
  try {
    const pair = await fixture.pair(); const first = await fixture.call("/v1/sessions", pair.headers, sessionCommand()); assert.equal(first.status, 201); const receipt = await first.json(); assert.equal(receipt.status, "committed"); assert.match(receipt.eventCursor, /^[A-Za-z0-9_-]+$/);
    assert.equal((await fixture.call("/v1/sessions", pair.headers, sessionCommand())).status, 201); assert.equal(fixture.app.sessions.length, 1);
    assert.equal((await fixture.call("/v1/sessions", pair.headers, { ...sessionCommand(), commandId: "changed" })).status, 409);
    assert.equal((await fixture.call(`/v1/sessions/synthetic-session-1?workspaceId=${workspace}`, pair.headers)).status, 200);
    assert.equal((await fixture.call("/v1/tasks", pair.headers, taskCommand())).status, 201);
    assert.equal((await fixture.call(`/v1/tasks/synthetic-task-1?workspaceId=${workspace}`, pair.headers)).status, 200);
    const list = await fixture.call(`/v1/tasks?workspaceId=${workspace}&state=READY&limit=1`, pair.headers); assert.equal(list.status, 200); assert.equal((await list.json()).value.tasks.length, 1);
    assert.equal((await fixture.call(`/v1/tasks?workspaceId=${workspace}&limit=51`, pair.headers)).status, 400);
    const b = await fixture.pair("cli", "b"); const hidden = await fixture.call("/v1/sessions/synthetic-session-1?workspaceId=synthetic-workspace-b", b.headers); assert.equal(hidden.status, 404); assert.ok(!(await hidden.text()).includes("synthetic-session-1"));
    fixture.app.readFailure = true; const failed = await fixture.call(`/v1/sessions/synthetic-session-1?workspaceId=${workspace}`, pair.headers); assert.equal(failed.status, 503); assert.doesNotMatch(await failed.text(), /private-secret|private\/path|Synthetic prompt/);
  } finally { await fixture.api.close(); }
});
test("HTTP rejects oversized fixed/chunked bodies, excessive headers, duplicate JSON and unsupported routes", async () => {
  const fixture = await setup();
  try {
    const pair = await fixture.pair(); assert.equal((await fixture.call("/v1/sessions", pair.headers, "x".repeat(1_048_577))).status, 413);
    assert.equal((await fixture.call("/v1/sessions", { ...pair.headers, "content-type": "text/plain" }, "{}" )).status, 415);
    assert.equal((await fixture.call("/v1/sessions", pair.headers, JSON.stringify(sessionCommand()).replace('"schemaVersion":1', '"schemaVersion":1,"schemaVersion":1'))).status, 400);
    assert.equal((await fixture.call("/v1/memory/search", pair.headers, {})).status, 404);
    assert.equal((await fixture.call(snapshotPath + `&workspaceId=${workspace}`, pair.headers)).status, 400);
    const manyHeaders = await new Promise<number>(resolve => { const request = httpRequest(fixture.base + snapshotPath, { headers: { ...pair.headers, ...Object.fromEntries(Array.from({ length: 65 }, (_, index) => [`x-test-${index}`, "fixture"])) } }, response => { response.resume(); response.on("end", () => resolve(response.statusCode!)); }); request.end(); }); assert.equal(manyHeaders, 400);
    const chunked = await new Promise<number>((resolve, reject) => { const request = httpRequest(fixture.base + "/v1/sessions", { method: "POST", headers: { ...pair.headers, "content-type": "application/json", "transfer-encoding": "chunked" } }, response => { response.resume(); response.on("end", () => resolve(response.statusCode!)); }); request.on("error", reject); request.write("x".repeat(524288)); request.end("x".repeat(524289)); }); assert.equal(chunked, 413); assert.equal(fixture.app.sessions.length, 0);
  } finally { await fixture.api.close(); }
});
test("Snapshot plus event-driven SSE replays after disconnect, rejects cross-scope cursors and explicit gaps", async () => {
  const fixture = await setup();
  try {
    const pair = await fixture.pair(); const snapshot = await (await fixture.call(snapshotPath, pair.headers)).json();
    const first = await fixture.call(eventPath + `&afterCursor=${snapshot.asOfCursor}`, pair.headers); assert.equal(first.status, 200);
    const reads = fixture.app.reads; await delay(40); assert.equal(fixture.app.reads, reads, "idle subscribers never poll storage");
    await fixture.call("/v1/sessions", pair.headers, sessionCommand()); const one = await frames(first, 1); assert.match(one[0]!, /event: session.created/); const cursor = /^id: (.+)$/m.exec(one[0]!)![1]!;
    await fixture.call("/v1/tasks", pair.headers, taskCommand()); const second = await fixture.call(eventPath, { ...pair.headers, "last-event-id": cursor }); const two = await frames(second, 1); assert.match(two[0]!, /event: task.created/); assert.doesNotMatch(two[0]!, /session.created/);
    assert.equal((await fixture.call(eventPath, pair.headers)).status, 410);
    const b = await fixture.pair("cli", "b"); assert.equal((await fixture.call(`/v1/events?workspaceId=synthetic-workspace-b&afterCursor=${cursor}`, b.headers)).status, 410);
    fixture.app.gap = true; const gap = await fixture.call(eventPath + `&afterCursor=${cursor}`, pair.headers); assert.equal(gap.status, 410); assert.equal((await gap.json()).error.reason, "event_gap");
  } finally { await fixture.api.close(); }
});
test("Every emitted event rechecks scope and already-open streams stop on credential revocation", async () => {
  const fixture = await setup();
  try {
    const pair = await fixture.pair(); const snapshot = await (await fixture.call(snapshotPath, pair.headers)).json();
    await fixture.call("/v1/sessions", pair.headers, sessionCommand()); await fixture.call("/v1/tasks", pair.headers, taskCommand());
    fixture.app.denyAt = fixture.app.authorizations + 5;
    const response = await fixture.call(eventPath + `&afterCursor=${snapshot.asOfCursor}`, pair.headers); const denied = (await frames(response, 2)).join("\n"); assert.match(denied, /session.created/); assert.match(denied, /stream.error/); assert.doesNotMatch(denied, /task.created/);
    fixture.app.denyAt = Infinity; const latest = await (await fixture.call(snapshotPath, pair.headers)).json(); const open = await fixture.call(eventPath + `&afterCursor=${latest.asOfCursor}`, pair.headers);
    fixture.api.revoke("a"); assert.match((await frames(open, 1))[0]!, /expired_session/); await delay(10); assert.equal(fixture.app.listeners.size, 0);
  } finally { await fixture.api.close(); }
});
test("Slow HTTP subscribers are bounded and durable events remain replayable after backpressure disconnect", { timeout: 10_000 }, async () => {
  const fixture = await setup({ drainTimeoutMs: 20 }); let slow: IncomingMessage | undefined;
  try {
    const pair = await fixture.pair(); const snapshot = await (await fixture.call(snapshotPath, pair.headers)).json();
    slow = await new Promise<IncomingMessage>((resolve, reject) => { const request = httpRequest(fixture.base + eventPath + `&afterCursor=${snapshot.asOfCursor}`, { headers: pair.headers }, response => { response.pause(); resolve(response); }); request.on("error", reject); request.end(); });
    for (let index = 0; index < 8000; index++) fixture.app.events.push({ commitCursor: ++fixture.app.cursor, event: { schemaVersion: 1, eventId: `event-${index + 1}`, workspaceId: workspace, aggregate: { kind: "task", id: "synthetic-task-1", revision: 1 }, occurredAt: at, type: "task.progress", payload: { phase: "working", checkpoint: "x".repeat(1024) } } });
    fixture.app.notify(); const deadline = Date.now() + 5000; while (fixture.app.listeners.size && Date.now() < deadline) await delay(20);
    assert.equal(fixture.app.listeners.size, 0); assert.equal(fixture.app.events.length, 8000); assert.ok(fixture.app.reads < 1000);
    slow.destroy(); slow = undefined; const reconnect = await fixture.call(eventPath + `&afterCursor=${snapshot.asOfCursor}`, pair.headers); const replay = await frames(reconnect, 1); assert.match(replay[0]!, /"eventId":"event-1"/);
  } finally { slow?.destroy(); await fixture.api.close(); }
});

test("Authenticated snapshots page more than 100 sessions and tasks and reject stale or cross-purpose continuation", async () => {
  const fixture = await setup();
  try {
    const pair = await fixture.pair();
    for (let index = 1; index <= 101; index++) {
      const session = await fixture.call("/v1/sessions", pair.headers, sessionCommand(index)); assert.equal(session.status, 201); await session.arrayBuffer();
      const task = await fixture.call("/v1/tasks", pair.headers, taskCommand(index)); assert.equal(task.status, 201); await task.arrayBuffer();
    }
    const { createSessionDataClient, SessionEventTracker } = await import("../../../cli/src/session-client.ts");
    const client = createSessionDataClient({ baseUrl: fixture.base, credential: pair.body.credential! });
    const complete = await client.snapshot(workspace); assert.equal(complete.sessions.length, 101); assert.equal(complete.tasks.length, 101); assert.doesNotThrow(() => new SessionEventTracker(complete));
    let total = 0; let pages = 0;
    for await (const page of client.snapshotPages(workspace)) { const count = page.sessions.length + page.tasks.length; assert.ok(count <= 50); assert.ok(Buffer.byteLength(JSON.stringify(page)) <= 1_048_576); total += count; pages++; }
    assert.equal(total, 202); assert.equal(pages, 5);
    const first = await (await fixture.call(snapshotPath, pair.headers)).json(); assert.ok(first.nextCursor);
    assert.equal((await fixture.call(eventPath + `&afterCursor=${first.nextCursor}`, pair.headers)).status, 410);
    const b = await fixture.pair("cli", "b"); assert.equal((await fixture.call(`/v1/snapshot?workspaceId=synthetic-workspace-b&cursor=${first.nextCursor}`, b.headers)).status, 410);
    await fixture.call("/v1/sessions", pair.headers, sessionCommand(102));
    const stale = await fixture.call(snapshotPath + `&cursor=${first.nextCursor}`, pair.headers); assert.equal(stale.status, 410); assert.equal((await stale.json()).error.reason, "snapshot_required");
    const stream = await fixture.call(eventPath, { ...pair.headers, "last-event-id": complete.asOfCursor }); assert.match((await frames(stream, 1))[0]!, /session.created/);
  } finally { await fixture.api.close(); }
});

test("Cookie GET and SSE accept genuine same-origin Fetch Metadata without Origin, but writes and cross-site reads fail closed", async () => {
  const fixture = await setup();
  try {
    const pair = await fixture.pair("browser");
    const headers = { cookie: pair.headers.cookie!, "sec-fetch-site": "same-origin", "sec-fetch-mode": "cors", "sec-fetch-dest": "empty" };
    const response = await fixture.call(snapshotPath, headers); assert.equal(response.status, 200); const snapshot = await response.json();
    for (const site of ["cross-site", "same-site", "none"]) assert.equal((await fixture.call(snapshotPath, { ...headers, "sec-fetch-site": site })).status, 403);
    assert.equal((await fixture.call(snapshotPath, { cookie: headers.cookie, "sec-fetch-site": "same-origin" })).status, 403);
    assert.equal((await fixture.call(snapshotPath, { ...headers, "sec-fetch-mode": "navigate", "sec-fetch-dest": "document" })).status, 403);
    assert.equal((await fixture.call(snapshotPath, { ...headers, origin: "http://invalid.example" })).status, 403);
    assert.equal((await fixture.call(snapshotPath, { ...headers, origin: fixture.base, "sec-fetch-site": "cross-site" })).status, 403);
    assert.equal((await fixture.call("/v1/sessions", { ...headers, "x-zhiwei-csrf": pair.body.csrfToken! }, sessionCommand())).status, 403);
    const stream = await fixture.call(eventPath + `&afterCursor=${snapshot.asOfCursor}`, headers); assert.equal(stream.status, 200);
    await fixture.call("/v1/sessions", pair.headers, sessionCommand()); assert.match((await frames(stream, 1))[0]!, /session.created/);
  } finally { await fixture.api.close(); }
});
