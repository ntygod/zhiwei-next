import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { test } from "node:test";
import type { ProductEventV1 } from "../../../packages/protocol/src/index.ts";
import { createSessionDataClient, pairSyntheticSessionCli, runSessionCli, SessionClientError, SessionEventTracker } from "./session-client.ts";
const credential = `data_cli_${"c".repeat(43)}`;
const workspace = "synthetic-workspace-a";
const at = "2026-10-10T00:00:00.000Z";
const snapshot = () => ({ schemaVersion: 1 as const, workspaceId: workspace, sessions: [], tasks: [], asOfCursor: "snapshot_cursor" });
const event = (id = "event-2", revision = 2): ProductEventV1 => ({ schemaVersion: 1, eventId: id, workspaceId: workspace, aggregate: { kind: "task", id: "task-1", revision }, occurredAt: at, type: "task.state_changed", payload: { state: "READY", intentRevision: 1 } });
async function server(handler: (request: IncomingMessage, response: ServerResponse) => void) {
  const http = createServer(handler); await new Promise<void>(resolve => http.listen(0, "127.0.0.1", resolve)); const address = http.address(); assert.ok(address && typeof address !== "string");
  return { baseUrl: `http://127.0.0.1:${address.port}`, close: () => new Promise<void>((resolve, reject) => { http.closeAllConnections(); http.close(error => error ? reject(error) : resolve()); }) };
}
function json(response: ServerResponse, value: unknown, status = 200) { response.writeHead(status, { "content-type": "application/json" }); response.end(JSON.stringify(value)); }
const isError = (code: string) => (error: unknown) => error instanceof SessionClientError && error.code === code;
function errorBody(code: string, reason: string) { return { schemaVersion: 1, error: { code, reason, safeMessage: "Fixture request cannot continue.", retryable: false, diagnosticId: "diagnostic-fixture" } }; }
test("CLI pairs with its own in-memory credential and human/JSON views share the same scoped snapshot", async () => {
  const requests: { url: string; authorization: string | undefined }[] = [];
  const fixture = await server((request, response) => {
    assert.equal(request.headers.origin, undefined); assert.equal(request.headers.cookie, undefined); requests.push({ url: request.url!, authorization: request.headers.authorization });
    if (request.url === "/v1/pair") { let body = ""; request.on("data", part => { body += part; }); request.on("end", () => { const input = JSON.parse(body); assert.equal(input.clientKind, "cli"); assert.equal(input.bootstrapCode, "b".repeat(43)); assert.match(input.clientNonce, /^[A-Za-z0-9_-]{43}$/); json(response, { schemaVersion: 1, clientKind: "cli", credential, expiresAt: at }); }); }
    else json(response, snapshot());
  });
  try {
    const pair = await pairSyntheticSessionCli(fixture.baseUrl, "b".repeat(43)); assert.equal(pair.credential, credential);
    const options = { baseUrl: fixture.baseUrl, credential: pair.credential }; assert.deepEqual(await createSessionDataClient(options).snapshot(workspace), snapshot());
    const machine: string[] = []; const human: string[] = [];
    assert.equal(await runSessionCli(["snapshot", workspace, "--json"], value => machine.push(value), options), 0);
    assert.equal(await runSessionCli(["snapshot", workspace], value => human.push(value), options), 0);
    assert.deepEqual(JSON.parse(machine[0]!), snapshot()); assert.equal(human[0], `snapshot: ${machine[0]}`);
    assert.equal(requests[0]!.authorization, undefined); assert.ok(requests.slice(1).every(request => request.authorization === `Bearer ${credential}` && request.url === `/v1/snapshot?workspaceId=${workspace}`));
  } finally { await fixture.close(); }
});
test("CLI restricts literal loopback targets, rejects diagnostic credentials, redirects and oversized responses", async () => {
  for (const baseUrl of ["http://localhost:3456", "https://127.0.0.1:3456", "http://127.0.0.1:3456/path", "http://127.0.0.1:99999", "http://user@127.0.0.1:3456"]) assert.throws(() => createSessionDataClient({ baseUrl, credential }), isError("invalid_configuration"));
  assert.throws(() => createSessionDataClient({ baseUrl: "http://127.0.0.1:3456", credential: "a".repeat(64) }), isError("invalid_configuration"));
  let redirect = true; const fixture = await server((_request, response) => { if (redirect) { response.writeHead(302, { location: "http://example.invalid/private" }); response.end(); } else json(response, "x".repeat(1_048_576)); });
  try { const client = createSessionDataClient({ baseUrl: fixture.baseUrl, credential }); await assert.rejects(client.snapshot(workspace), isError("redirect_refused")); redirect = false; await assert.rejects(client.snapshot(workspace), isError("response_too_large")); }
  finally { await fixture.close(); }
});
test("SSE reconnect preserves delivered cursor; tracker handles duplicate, stale, conflicting and skipped revisions", async () => {
  const value = event(); const fixture = await server((request, response) => {
    assert.equal(request.headers["last-event-id"], "previous_cursor"); assert.equal(request.headers.authorization, `Bearer ${credential}`);
    response.writeHead(200, { "content-type": "text/event-stream" }); response.write(": heartbeat\n\n");
    const frame = `id: next_cursor\nevent: ${value.type}\ndata: ${JSON.stringify(value)}\n\n`; response.write(frame.slice(0, 80)); response.end(frame.slice(80));
  });
  try {
    const options = { baseUrl: fixture.baseUrl, credential }; let delivered = 0;
    for await (const frame of createSessionDataClient(options).events(workspace, "previous_cursor")) { assert.equal(frame.cursor, "next_cursor"); assert.deepEqual(frame.event, value); delivered++; break; } assert.equal(delivered, 1);
    const output: string[] = []; assert.equal(await runSessionCli(["replay", workspace, "previous_cursor", "1", "--json"], line => output.push(line), options), 0); assert.equal(JSON.parse(output[0]!).cursor, "next_cursor");
    const tracker = new SessionEventTracker(); assert.equal(tracker.accept(value), "applied"); assert.equal(tracker.accept(value), "duplicate"); assert.equal(tracker.accept(event("event-1", 1)), "stale"); assert.equal(tracker.accept(event("event-3", 3)), "applied"); assert.throws(() => tracker.accept(event("event-3", 4)), isError("invalid_response"));
    assert.throws(() => tracker.accept(event("event-5", 5)), isError("snapshot_required"));
    assert.equal(tracker.accept(event("event-4", 4)), "applied", "rejected gap does not poison later replay");
    const seeded = new SessionEventTracker({ ...snapshot(), tasks: [{ id: "task-1", workspaceId: workspace, sessionId: "session-1", revision: 2, intentRevision: 1, state: "READY", updatedAt: at }] });
    assert.throws(() => seeded.accept(event("event-4", 4)), isError("snapshot_required"));
    assert.equal(new SessionEventTracker().accept(event("first-observed", 9)), "applied", "unknown aggregates do not invent a starting revision");
  } finally { await fixture.close(); }
});
test("Unknown event versions, cursor gaps and expired sessions are explicit actionable failures", async () => {
  let mode = "unknown"; const fixture = await server((_request, response) => {
    if (mode === "unknown") { response.writeHead(200, { "content-type": "text/event-stream" }); response.end(`id: cursor\nevent: future.event\ndata: ${JSON.stringify({ ...event(), type: "future.event" })}\n\n`); }
    else if (mode === "gap") json(response, errorBody("unavailable", "cursor_expired"), 410);
    else json(response, errorBody("unauthenticated", "expired_session"), 401);
  });
  try {
    const options = { baseUrl: fixture.baseUrl, credential }; const client = createSessionDataClient(options);
    await assert.rejects(client.events(workspace, "old_cursor").next(), isError("unsupported_protocol")); mode = "gap";
    await assert.rejects(client.events(workspace, "old_cursor").next(), isError("snapshot_required")); mode = "expired";
    await assert.rejects(client.snapshot(workspace), isError("reauthentication_required"));
    const output: string[] = []; assert.equal(await runSessionCli(["snapshot", workspace], line => output.push(line), options), 1); assert.deepEqual(output, ["Session error: reauthentication_required."]);
  } finally { await fixture.close(); }
});
test("CLI rejects duplicate JSON fields and even empty snapshots from another workspace", async () => {
  let duplicate = true; const fixture = await server((_request, response) => { response.writeHead(200, { "content-type": "application/json" }); response.end(duplicate ? JSON.stringify(snapshot()).replace('"schemaVersion":1', '"schemaVersion":2,"schemaVersion":1') : JSON.stringify({ ...snapshot(), workspaceId: "synthetic-workspace-b" })); });
  try { const client = createSessionDataClient({ baseUrl: fixture.baseUrl, credential }); await assert.rejects(client.snapshot(workspace), isError("invalid_response")); duplicate = false; await assert.rejects(client.snapshot(workspace), isError("invalid_response")); }
  finally { await fixture.close(); }
});
