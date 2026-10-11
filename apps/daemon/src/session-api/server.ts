import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import {
  CognitiveProtocolError, deserializeLocalApiCommandV1, deserializeSessionCreateCommandV1, deserializeSessionPairRequestV1,
  parseProductEventV1, parseSessionApiReceiptV1, parseSessionSnapshotPageV1, parseSessionTaskRecoveryV1, parseSessionTaskStateV1, parseSessionTaskV1, parseSessionV1, parseTaskSummaryV1,
  type LocalApiErrorV1,
} from "../../../../packages/protocol/src/index.ts";
import { assertIdentifierV2 } from "../../../../packages/domain/src/index.ts";
import { SyntheticSessionAuthenticator, type SessionAuthentication, type SyntheticSessionFixture } from "./auth.ts";
import { SessionCursorCodec } from "./cursor.ts";
import { SessionApiError, type SessionApiApplication, type SessionApiContext, type SessionApiReplay } from "./service.ts";
export type { SessionApiApplication, SessionApiContext, SessionApiCommitted, SessionApiDurableReceipt, SessionApiSnapshot, SessionApiReplay, SessionApiTaskRead } from "./service.ts";
export { SessionApiError } from "./service.ts";
export { syntheticSessionIdentities } from "./auth.ts";

const MAX_BODY = 1_048_576;
const MAX_SSE_FRAME = 1_048_576;
function responseValue<T>(parse: (input: unknown) => T, input: unknown): T {
  try { return parse(input); } catch { throw new SessionApiError("corruption", "integrity_failed", 500); }
}
function invalid(): never { throw new SessionApiError("validation", "invalid_shape", 400); }
function safeError(error: unknown): Readonly<{ status: number; body: LocalApiErrorV1 }> {
  const value = error instanceof SessionApiError ? error
    : error instanceof CognitiveProtocolError ? new SessionApiError(error.code, error.reason, error.code === "unsupported" ? 422 : error.reason === "too_large" ? 413 : 400)
    : new SessionApiError("unavailable", "dependency_down", 503);
  const messages: Record<string, string> = {
    validation: "The request is invalid.", unauthenticated: "Pair this client again.", forbidden: "The request is not authorized.",
    not_found: "The requested resource is unavailable.", revision_conflict: "Reload the current version before retrying.", idempotency_conflict: "Use a new key for a different command.",
    unavailable: "Reload an authorized snapshot or reconnect when the service is available.", unsupported: "This capability is not supported.",
    budget_exceeded: "The local request limit has been reached.", corruption: "The stored state requires recovery.",
  };
  return { status: value.status, body: { schemaVersion: 1, error: { code: value.code, reason: value.reason, safeMessage: messages[value.code]!, retryable: value.reason === "dependency_down" || value.reason === "rate_limit", diagnosticId: `diagnostic-${randomUUID()}` } } };
}
function writeJson(response: ServerResponse, status: number, body: unknown, cookie?: string): void {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff", "connection": "close", ...(cookie === undefined ? {} : { "set-cookie": cookie }) });
  response.end(JSON.stringify(body));
}
function readIdentifier(value: string | null): string {
  try { assertIdentifierV2(value); return value; } catch { return invalid(); }
}
function validateQuery(url: URL, allowed: readonly string[]): void {
  const seen = new Set<string>();
  for (const key of url.searchParams.keys()) { if (!allowed.includes(key) || seen.has(key)) invalid(); seen.add(key); }
}
async function readBody(request: IncomingMessage): Promise<string> {
  if (request.headersDistinct["content-type"]?.length !== 1 || !/^application\/json(?:;\s*charset=utf-8)?$/i.test(request.headers["content-type"]!)) throw new SessionApiError("validation", "unsupported_media", 415);
  const length = request.headers["content-length"];
  if (length !== undefined && (!/^\d+$/.test(length) || !Number.isSafeInteger(Number(length)))) invalid();
  if (Number(length ?? 0) > MAX_BODY) throw new SessionApiError("validation", "too_large", 413);
  const bytes = await new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = []; let total = 0; let settled = false;
    const cleanup = () => { request.removeListener("data", data); request.removeListener("end", ended); request.removeListener("aborted", aborted); request.removeListener("error", aborted); };
    const aborted = () => { if (settled) return; settled = true; cleanup(); reject(new SessionApiError("validation", "invalid_shape", 400)); };
    const data = (chunk: Buffer) => {
      total += chunk.byteLength;
      if (total > MAX_BODY) {
        settled = true; cleanup(); request.pause(); request.once("error", () => undefined);
        // Preserve the response side long enough to send a safe 413. The response closes the socket.
        reject(new SessionApiError("validation", "too_large", 413)); return;
      }
      chunks.push(chunk);
    };
    const ended = () => { if (settled) return; settled = true; cleanup(); resolve(Buffer.concat(chunks)); };
    request.on("data", data); request.once("end", ended); request.once("aborted", aborted); request.once("error", aborted);
  });
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { return invalid(); }
}
export interface SyntheticSessionApiOptions {
  readonly application: SessionApiApplication;
  readonly installationId: string;
  readonly now?: () => number;
  readonly recoveryEpoch?: () => string;
  readonly projectionGeneration?: () => number;
  readonly sessionTtlMs?: number;
  readonly drainTimeoutMs?: number;
}
export interface SyntheticSessionApi {
  readonly mode: "synthetic-fixtures-only";
  listen(): Promise<string>;
  issuePairingCode(kind: "browser" | "cli", fixture?: SyntheticSessionFixture): string;
  revoke(fixture: SyntheticSessionFixture): void;
  close(): Promise<void>;
}
/** Internal composition seam for the parent-owned temporary synthetic harness. No production entrypoint
 * calls this helper, and there is deliberately no environment/accepted/authorized activation switch.
 * Only two fixed owned fixture identities can pair; callers cannot supply identity or grant scope.
 */
export function createSyntheticSessionApi(options: SyntheticSessionApiOptions): SyntheticSessionApi {
  const app = options.application; const now = options.now ?? Date.now;
  const drainTimeoutMs = options.drainTimeoutMs ?? 2000;
  if (!options.installationId || !Number.isInteger(drainTimeoutMs) || drainTimeoutMs < 1 || drainTimeoutMs > 5000) invalid();
  const auth = new SyntheticSessionAuthenticator(now, options.sessionTtlMs);
  const cursor = new SessionCursorCodec({ installationId: options.installationId, recoveryEpoch: options.recoveryEpoch ?? (() => "synthetic-recovery-1"), projectionGeneration: options.projectionGeneration ?? (() => 1), now });
  const streams = new Set<ServerResponse>(); const wakeStreams = new Set<() => void>(); let origin = ""; let state: "idle" | "starting" | "listening" | "closed" = "idle";
  let closing: Promise<void> | undefined;
  let starting: Promise<string> | undefined;
  const authorize = (authentication: SessionAuthentication, workspaceId: string): SessionApiContext => {
    if (!auth.current(authentication)) throw new SessionApiError("unauthenticated", "expired_session", 401);
    // Reject scope before consulting application content or membership lookup.
    if (workspaceId !== authentication.context.workspaceId) throw new SessionApiError("not_found", "not_found", 404);
    const context = { principalId: authentication.context.principalId, workspaceId };
    if (!app.authorize(context)) throw new SessionApiError("not_found", "not_found", 404);
    return context;
  };
  const eventsBinding = (context: SessionApiContext) => ({ ...context, purpose: "events" as const });
  const encode = (context: SessionApiContext, commitCursor: number) => cursor.encode(eventsBinding(context), { commitCursor });
  const checkReplay = (page: SessionApiReplay, after: number, context: SessionApiContext): void => {
    if (page.gap) throw new SessionApiError("unavailable", "event_gap", 410);
    if (!Number.isSafeInteger(page.highWatermark) || page.highWatermark < after || page.events.length > 32 || (page.hasMore && page.events.length === 0)) throw new SessionApiError("corruption", "integrity_failed", 500);
    let previous = after;
    for (const row of page.events) {
      if (!Number.isSafeInteger(row.commitCursor) || row.commitCursor <= previous || row.commitCursor > page.highWatermark
        || row.event.workspaceId !== context.workspaceId) throw new SessionApiError("corruption", "integrity_failed", 500);
      responseValue(parseProductEventV1, row.event); previous = row.commitCursor;
    }
  };
  const openEvents = (request: IncomingMessage, response: ServerResponse, authentication: SessionAuthentication, context: SessionApiContext, initial: number) => {
    if (streams.size >= 32) throw new SessionApiError("budget_exceeded", "rate_limit", 429);
    let after = initial; let closed = false; let scheduled: ReturnType<typeof setTimeout> | undefined; let drainTimer: ReturnType<typeof setTimeout> | undefined;
    let waitingDrain = false; let heartbeat: ReturnType<typeof setInterval> | undefined;
    let unsubscribe: (() => void) | undefined;
    const notify = () => { if (!closed && !waitingDrain && !scheduled) scheduled = setTimeout(pump, 0); };
    // Subscribe first, then read the durable watermark: no commit can fall between snapshot and notification.
    unsubscribe = app.subscribe(notify); wakeStreams.add(notify);
    // Validate first page before writing the SSE status; expired/gap cursors get a proper HTTP error.
    let firstPage: SessionApiReplay | undefined;
    try { authorize(authentication, context.workspaceId); firstPage = app.replay(context, { afterCommitCursor: after, limit: 32 }); checkReplay(firstPage, after, context); }
    catch (error) { unsubscribe(); wakeStreams.delete(notify); clearTimeout(scheduled); throw error; }
    response.writeHead(200, { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff", "connection": "close" });
    response.flushHeaders(); streams.add(response); request.socket.setTimeout(0);
    const cleanup = () => { if (closed) return; closed = true; clearTimeout(scheduled); clearTimeout(drainTimer); clearInterval(heartbeat); unsubscribe?.(); wakeStreams.delete(notify); streams.delete(response); response.removeListener("drain", drained); };
    const finish = (error: unknown) => {
      if (closed) return;
      const safe = safeError(error); const blocked = waitingDrain; cleanup();
      if (blocked || response.destroyed || response.writableLength > MAX_SSE_FRAME) response.destroy();
      else response.end(`event: stream.error\ndata: ${JSON.stringify(safe.body)}\n\n`);
    };
    const schedule = notify;
    const drained = () => { if (closed) return; waitingDrain = false; clearTimeout(drainTimer); schedule(); };
    response.on("close", cleanup); response.once("error", cleanup);
    const write = (frame: string): boolean => {
      if (Buffer.byteLength(frame) > MAX_SSE_FRAME || response.writableLength > MAX_SSE_FRAME) throw new SessionApiError("unavailable", "slow_consumer", 410);
      if (response.write(frame)) return true;
      waitingDrain = true; response.once("drain", drained);
      drainTimer = setTimeout(() => finish(new SessionApiError("unavailable", "slow_consumer", 410)), drainTimeoutMs); return false;
    };
    function pump(): void {
      scheduled = undefined;
      if (closed || waitingDrain) return;
      try {
        authorize(authentication, context.workspaceId);
        const page = firstPage ?? app.replay(context, { afterCommitCursor: after, limit: 32 }); firstPage = undefined; checkReplay(page, after, context);
        for (const row of page.events) {
          authorize(authentication, context.workspaceId); // Required even within the same replay batch.
          const event = responseValue(parseProductEventV1, row.event);
          const token = encode(context, row.commitCursor);
          const writable = write(`id: ${token}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
          after = row.commitCursor;
          if (!writable) return; // Remaining rows are read again from the durable outbox, never dropped.
        }
        if (!page.hasMore) after = page.highWatermark;
        if (page.hasMore) schedule();
      } catch (error) { finish(error); }
    }
    heartbeat = setInterval(() => {
      if (closed || waitingDrain) return;
      try { authorize(authentication, context.workspaceId); write(": heartbeat\n\n"); } catch (error) { finish(error); }
    }, 15_000);
    pump();
  };
  const handle = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    try {
      if (state !== "listening" || closing) throw new SessionApiError("unavailable", "dependency_down", 503);
      if (request.rawHeaders.length > 128 || !request.url || request.url.length > 4096 || request.headersDistinct.expect || request.headersDistinct["content-encoding"]) invalid();
      const authority = origin.slice("http://".length);
      if (request.socket.localAddress !== "127.0.0.1" || request.socket.remoteAddress !== "127.0.0.1"
        || request.headersDistinct.host?.length !== 1 || request.headersDistinct.host[0] !== authority) throw new SessionApiError("forbidden", "origin_mismatch", 403);
      if (!request.url.startsWith("/") || request.url.startsWith("//") || request.url.includes("#") || request.url.includes("\\")) invalid();
      const url = new URL(request.url, origin);
      if (url.origin !== origin || url.pathname.includes("%") || url.pathname.includes("//") || url.pathname !== request.url.split("?")[0]) invalid();
      if (request.method !== "GET" && request.method !== "POST") invalid();
      if (request.method === "GET" && (request.headersDistinct["content-length"] || request.headersDistinct["transfer-encoding"])) invalid();
      if (url.pathname === "/v1/pair" && request.method === "POST") {
        validateQuery(url, []);
        if (request.headersDistinct.authorization || request.headersDistinct.cookie || (request.headersDistinct.origin?.length ?? 0) > 1) invalid();
        const incomingOrigin = request.headers.origin;
        if (incomingOrigin !== undefined && incomingOrigin !== origin) throw new SessionApiError("forbidden", "origin_mismatch", 403);
        const pair = auth.pair(deserializeSessionPairRequestV1(await readBody(request)), incomingOrigin, origin); writeJson(response, 200, pair.body, pair.cookie); return;
      }
      const authentication = auth.authenticate(request, origin);
      if (url.pathname === "/v1/capabilities" && request.method === "GET") {
        validateQuery(url, []); authorize(authentication, authentication.context.workspaceId);
        writeJson(response, 200, { schemaVersion: 1, protocolVersions: [1], mode: "synthetic-fixtures-only", production: "unsupported", productAcceptance: "not_run",
          features: ["sessions", "tasks", "snapshot", "events"], supportedCommands: ["session.create", "task.create", "task.continue", "task.pause", "task.cancel", "task.retry", "task.revise-request"], unsupportedCommands: ["task.respond", "task.confirm-result"], runtime: { status: "limited", reason: "fixed-synthetic-fixtures-only", limitations: ["fixed-synthetic-request-only", "no-model-status-query", "no-production-authority"] }, limits: { bodyBytes: MAX_BODY, pageSize: 50, eventFrameBytes: MAX_SSE_FRAME, subscribers: 32 } }); return;
      }
      if (request.method === "POST") {
        validateQuery(url, []); const body = await readBody(request);
        if (url.pathname === "/v1/sessions") {
          const command = deserializeSessionCreateCommandV1(body); const context = authorize(authentication, command.workspaceId);
          const committed = app.createSession(context, command); const receipt = responseValue(parseSessionApiReceiptV1, { ...committed.value, eventCursor: encode(context, committed.commitCursor) });
          if (receipt.aggregate.kind !== "session") throw new SessionApiError("corruption", "integrity_failed", 500);
          writeJson(response, 201, receipt); return;
        }
        const target = /^\/v1\/tasks\/([^/]+)\/commands$/.exec(url.pathname);
        if (url.pathname !== "/v1/tasks" && !target) throw new SessionApiError("not_found", "not_found", 404);
        const command = deserializeLocalApiCommandV1(body);
        if (!command.payload.kind.startsWith("task.") || (url.pathname === "/v1/tasks") !== (command.payload.kind === "task.create")) invalid();
        if (target && (!("targetRef" in command.payload) || command.payload.targetRef.id !== readIdentifier(target[1]!))) invalid();
        const context = authorize(authentication, command.workspaceId); const committed = app.executeTask(context, command);
        const receipt = responseValue(parseSessionApiReceiptV1, { ...committed.value, eventCursor: encode(context, committed.commitCursor) });
        if (receipt.aggregate.kind !== "task") throw new SessionApiError("corruption", "integrity_failed", 500);
        writeJson(response, command.payload.kind === "task.create" ? 201 : 200, receipt); return;
      }
      const resource = /^\/v1\/(sessions|tasks)\/([^/]+)$/.exec(url.pathname);
      if (!["/v1/tasks", "/v1/snapshot", "/v1/events"].includes(url.pathname) && !resource) throw new SessionApiError("not_found", "not_found", 404);
      validateQuery(url, url.pathname === "/v1/tasks" ? ["workspaceId", "state", "cursor", "limit"] : url.pathname === "/v1/events" ? ["workspaceId", "afterCursor"] : url.pathname === "/v1/snapshot" ? ["workspaceId", "cursor"] : ["workspaceId"]);
      const context = authorize(authentication, readIdentifier(url.searchParams.get("workspaceId")));
      if (url.pathname === "/v1/snapshot") {
        const binding = { ...context, purpose: "snapshot" as const };
        const token = url.searchParams.get("cursor"); const position = token === null ? undefined : cursor.decode(binding, token);
        const result = app.snapshot(context);
        // Each page comes from a consistent read; only an unchanged watermark can extend the view.
        if (position && position.commitCursor !== result.commitCursor) throw new SessionApiError("unavailable", "snapshot_required", 410);
        const offsetText = position?.after ?? "0";
        if (!/^(?:0|[1-9][0-9]{0,14})$/.test(offsetText)) throw new SessionApiError("unavailable", "cursor_expired", 410);
        const offset = Number(offsetText); const total = result.sessions.length + result.tasks.length;
        if (!Number.isSafeInteger(total) || offset > total) throw new SessionApiError("corruption", "integrity_failed", 500);
        const sessions = result.sessions.slice(offset, offset + 50);
        const tasks = result.tasks.slice(Math.max(0, offset - result.sessions.length), Math.max(0, offset - result.sessions.length) + 50 - sessions.length);
        const next = offset + sessions.length + tasks.length;
        // Session has bounded profile refs, Task only summaries; the page parser also enforces byte/node budgets.
        writeJson(response, 200, responseValue(parseSessionSnapshotPageV1, { schemaVersion: 1, workspaceId: context.workspaceId, sessions, tasks,
          asOfCursor: encode(context, result.commitCursor), ...(next < total ? { nextCursor: cursor.encode(binding, { commitCursor: result.commitCursor, after: String(next) }) } : {}) })); return;
      }
      if (url.pathname === "/v1/events") {
        if ((request.headersDistinct["last-event-id"]?.length ?? 0) > 1) invalid();
        const queryCursor = url.searchParams.get("afterCursor"); const lastEvent = request.headers["last-event-id"];
        if (queryCursor && lastEvent && queryCursor !== lastEvent) invalid();
        const token = queryCursor ?? (typeof lastEvent === "string" ? lastEvent : undefined);
        if (!token) throw new SessionApiError("unavailable", "snapshot_required", 410);
        const position = cursor.decode(eventsBinding(context), token); openEvents(request, response, authentication, context, position.commitCursor); return;
      }
      if (resource) {
        const id = readIdentifier(resource[2]!); const result = resource[1] === "sessions" ? app.getSession(context, id) : app.getTask(context, id);
        const value = resource[1] === "sessions" ? responseValue(parseSessionV1, result.value) : responseValue(parseSessionTaskV1, result.value);
        if (value.workspaceId !== context.workspaceId) throw new SessionApiError("corruption", "integrity_failed", 500);
        const recovery = "recovery" in result && result.recovery !== undefined ? responseValue(parseSessionTaskRecoveryV1, result.recovery) : undefined;
        if (recovery && resource[1] !== "tasks") throw new SessionApiError("corruption", "integrity_failed", 500);
        writeJson(response, 200, { schemaVersion: 1, value, asOfCursor: encode(context, result.commitCursor), ...(recovery === undefined ? {} : { recovery }) }); return;
      }
      const stateFilter = url.searchParams.has("state") ? parseSessionTaskStateV1(url.searchParams.get("state")) : undefined;
      const limitText = url.searchParams.get("limit") ?? "50"; if (!/^(?:[1-9]|[1-4][0-9]|50)$/.test(limitText)) invalid();
      const binding = { ...context, purpose: "tasks" as const, filter: stateFilter ?? "" };
      const pageToken = url.searchParams.get("cursor"); const position = pageToken === null ? undefined : cursor.decode(binding, pageToken);
      const result = app.listTasks(context, { limit: Number(limitText), ...(stateFilter === undefined ? {} : { state: stateFilter }), ...(position?.after === undefined ? {} : { after: position.after }) });
      if (result.value.tasks.length > Number(limitText) || result.value.tasks.some(task => task.workspaceId !== context.workspaceId)) throw new SessionApiError("corruption", "integrity_failed", 500);
      writeJson(response, 200, { schemaVersion: 1, value: { tasks: result.value.tasks.map(task => responseValue(parseTaskSummaryV1, task)), ...(result.value.nextAfter === undefined ? {} : { nextCursor: cursor.encode(binding, { commitCursor: result.commitCursor, after: result.value.nextAfter }) }) }, asOfCursor: encode(context, result.commitCursor) });
    } catch (error) {
      if (response.headersSent) response.destroy();
      else { const safe = safeError(error); writeJson(response, safe.status, safe.body); }
    }
  };
  const server = createServer({ maxHeaderSize: 8192, headersTimeout: 5000, requestTimeout: 5000 }, (request, response) => { void handle(request, response); });
  server.maxHeadersCount = 0; server.maxRequestsPerSocket = 1;
  server.on("checkContinue", (request, response) => { void handle(request, response); });
  server.on("checkExpectation", (request, response) => { void handle(request, response); });
  server.on("dropRequest", (_request, socket) => socket.destroy());
  server.setTimeout(5000, socket => socket.destroy());
  server.on("clientError", (_error, socket) => { if (!socket.destroyed && socket.writable) socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\nCache-Control: no-store\r\nContent-Length: 0\r\n\r\n"); else socket.destroy(); });
  for (const event of ["upgrade", "connect"] as const) server.on(event, (_request, socket) => socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n"));
  return {
    mode: "synthetic-fixtures-only",
    listen: () => {
      if (state !== "idle") return Promise.reject(new SessionApiError("validation", "invalid_shape", 400));
      starting = new Promise((resolve, reject) => {
        state = "starting";
        const failed = () => { state = "closed"; reject(new SessionApiError("unavailable", "dependency_down", 503)); }; server.once("error", failed);
        server.listen(0, "127.0.0.1", () => {
          server.removeListener("error", failed); const address = server.address();
          if (!address || typeof address === "string") { failed(); return; }
          origin = `http://127.0.0.1:${address.port}`; state = "listening"; resolve(origin);
        });
      });
      return starting;
    },
    issuePairingCode: (kind, fixture) => auth.issuePairingCode(kind, fixture), revoke: fixture => { auth.revoke(fixture); for (const wake of wakeStreams) wake(); },
    close: () => {
      if (closing) return closing;
      auth.close(); cursor.close(); for (const response of streams) response.destroy();
      closing = (async () => {
        // A pending listen owns a real socket acquisition. Join it before teardown rather than
        // rejecting or claiming closure while its callback can still open the server later.
        if (state === "starting") await starting?.catch(() => undefined);
        if (state !== "listening") { state = "closed"; return; }
        state = "closed";
        await new Promise<void>((resolve, reject) => { server.closeAllConnections(); server.close(error => error ? reject(new SessionApiError("unavailable", "dependency_down", 503)) : resolve()); });
      })();
      return closing;
    },
  };
}
