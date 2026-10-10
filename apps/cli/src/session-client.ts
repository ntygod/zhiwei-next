import { randomBytes } from "node:crypto";
import type { Task } from "../../../packages/domain/src/index.ts";
import {
  canonicalJsonV1, decodeSessionApiJsonV1, deserializeProductEventV1, parseSessionApiErrorV1,
  parseProductEventV1, parseSessionSnapshotPageV1, parseSessionSnapshotV1, sessionSnapshotAssemblyBytesV1, parseSessionTaskV1, parseSessionV1, parseTaskSummaryV1,
  type ProductEventV1, type SessionApiReadV1, type SessionPairResponseV1, type SessionSnapshotV1, type SessionSnapshotPageV1,
  type SessionTaskListV1, type SessionV1, type TaskSummaryV1,
} from "../../../packages/protocol/src/index.ts";

type ClientErrorCode = "invalid_configuration" | "invalid_response" | "response_too_large" | "daemon_unavailable" | "redirect_refused" | "snapshot_required" | "reauthentication_required" | "unsupported_protocol" | "request_rejected" | "stream_disconnected";
export class SessionClientError extends Error {
  readonly code: ClientErrorCode;
  constructor(code: ClientErrorCode) { super(`Session client: ${code}.`); this.name = "SessionClientError"; this.code = code; }
}
function fail(code: ClientErrorCode): never { throw new SessionClientError(code); }
function origin(input: string): string {
  try {
    if (!/^http:\/\/127\.0\.0\.1:[1-9][0-9]{0,4}$/.test(input)) fail("invalid_configuration");
    const url = new URL(input); if (url.origin !== input || Number(url.port) > 65535 || Number(url.port) < 1) fail("invalid_configuration");
    return input;
  } catch { return fail("invalid_configuration"); }
}
function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail("invalid_response");
  return value as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []): void {
  if (required.some(key => !(key in value)) || Object.keys(value).some(key => !required.includes(key) && !optional.includes(key))) fail("invalid_response");
}
function token(value: unknown): string {
  if (typeof value !== "string" || value.length < 1 || value.length > 2048 || /[\r\n\0]/.test(value)) fail("invalid_response");
  return value;
}
async function responseJson(response: Response): Promise<unknown> {
  if (!response.headers.get("content-type")?.startsWith("application/json") || !response.body) fail("invalid_response");
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > 1_048_576) fail("response_too_large"); chunks.push(part.value); }
    const bytes = Buffer.concat(chunks); return decodeSessionApiJsonV1(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch (error) { if (error instanceof SessionClientError) throw error; return fail("invalid_response"); }
  finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
}
function errorCode(error: ReturnType<typeof parseSessionApiErrorV1>): never {
  if (error.error.code === "unauthenticated") fail("reauthentication_required");
  if (["cursor_expired", "event_gap", "snapshot_required", "slow_consumer"].includes(error.error.reason)) fail("snapshot_required");
  if (error.error.code === "unsupported") fail("unsupported_protocol");
  return fail("request_rejected");
}
async function checkStatus(response: Response): Promise<void> {
  if (response.status >= 300 && response.status <= 399) { await response.body?.cancel(); fail("redirect_refused"); }
  if (response.ok) return;
  let error: ReturnType<typeof parseSessionApiErrorV1>;
  try { error = parseSessionApiErrorV1(await responseJson(response)); } catch (failure) { if (failure instanceof SessionClientError) throw failure; return fail("invalid_response"); }
  errorCode(error);
}
/** Synthetic pairing returns a short-lived in-memory credential. It never stores it on disk. */
export async function pairSyntheticSessionCli(baseUrl: string, code: string): Promise<SessionPairResponseV1 & Readonly<{ clientKind: "cli"; credential: string }>> {
  const base = origin(baseUrl); if (!/^[A-Za-z0-9_-]{43}$/.test(code)) fail("invalid_configuration");
  try {
    const response = await fetch(`${base}/v1/pair`, { method: "POST", redirect: "manual", signal: AbortSignal.timeout(5000), headers: { "content-type": "application/json" }, body: JSON.stringify({ schemaVersion: 1, bootstrapCode: code, clientNonce: randomBytes(32).toString("base64url"), clientKind: "cli" }) });
    await checkStatus(response); const body = record(await responseJson(response)); keys(body, ["schemaVersion", "clientKind", "credential", "expiresAt"]);
    if (body.schemaVersion !== 1 || body.clientKind !== "cli" || typeof body.credential !== "string" || !/^data_cli_[A-Za-z0-9_-]{43}$/.test(body.credential) || typeof body.expiresAt !== "string" || !Number.isFinite(Date.parse(body.expiresAt))) fail("invalid_response");
    return { schemaVersion: 1, clientKind: "cli", credential: body.credential, expiresAt: body.expiresAt };
  } catch (error) { if (error instanceof SessionClientError) throw error; return fail("daemon_unavailable"); }
}
export interface SessionClientOptions { readonly baseUrl: string; readonly credential: string; readonly timeoutMs?: number }
export interface SessionClientEvent { readonly event: ProductEventV1; readonly cursor: string }
export function createSessionDataClient(options: SessionClientOptions) {
  const base = origin(options.baseUrl); const timeout = options.timeoutMs ?? 5000;
  if (!/^data_cli_[A-Za-z0-9_-]{43}$/.test(options.credential) || !Number.isSafeInteger(timeout) || timeout < 1 || timeout > 30_000) fail("invalid_configuration");
  const query = async (path: string, parameters: Record<string, string>): Promise<unknown> => {
    try {
      const response = await fetch(`${base}${path}?${new URLSearchParams(parameters)}`, { redirect: "manual", signal: AbortSignal.timeout(timeout), headers: { authorization: `Bearer ${options.credential}` } });
      await checkStatus(response); return await responseJson(response);
    } catch (error) { if (error instanceof SessionClientError) throw error; return fail("daemon_unavailable"); }
  };
  const read = async <T>(path: string, workspaceId: string, parse: (value: unknown) => T, parameters: Record<string, string> = {}): Promise<SessionApiReadV1<T>> => {
    try {
      const body = record(await query(path, { workspaceId, ...parameters })); keys(body, ["schemaVersion", "value", "asOfCursor"]);
      if (body.schemaVersion !== 1) fail("invalid_response");
      const value = parse(body.value);
      if (typeof value === "object" && value !== null && "workspaceId" in value && value.workspaceId !== workspaceId) fail("invalid_response");
      return { schemaVersion: 1, value, asOfCursor: token(body.asOfCursor) };
    } catch (error) { if (error instanceof SessionClientError) throw error; return fail("invalid_response"); }
  };
  async function* snapshotPages(workspaceId: string): AsyncGenerator<SessionSnapshotPageV1> {
    let cursor: string | undefined;
    do {
      let value: SessionSnapshotPageV1;
      try { value = parseSessionSnapshotPageV1(await query("/v1/snapshot", { workspaceId, ...(cursor === undefined ? {} : { cursor }) })); }
      catch (error) { if (error instanceof SessionClientError) throw error; return fail("invalid_response"); }
      if (value.workspaceId !== workspaceId || (value.nextCursor !== undefined && value.nextCursor === cursor)) fail("invalid_response");
      yield value; cursor = value.nextCursor;
    } while (cursor !== undefined);
  }
  return {
    // Pages are provisional until iteration completes; a changed watermark fails the whole view.
    snapshotPages,
    async snapshot(workspaceId: string): Promise<SessionSnapshotV1> {
      const sessions: SessionV1[] = []; const tasks: TaskSummaryV1[] = []; let asOfCursor = ""; let bytes = 0;
      for await (const page of snapshotPages(workspaceId)) {
        bytes += Buffer.byteLength(JSON.stringify(page)); if (bytes > sessionSnapshotAssemblyBytesV1) fail("response_too_large");
        asOfCursor ||= page.asOfCursor; sessions.push(...page.sessions); tasks.push(...page.tasks);
      }
      try { return parseSessionSnapshotV1({ schemaVersion: 1, workspaceId, sessions, tasks, asOfCursor }); }
      catch { return fail("invalid_response"); }
    },
    session: (workspaceId: string, id: string): Promise<SessionApiReadV1<SessionV1>> => read(`/v1/sessions/${encodeURIComponent(id)}`, workspaceId, parseSessionV1),
    task: (workspaceId: string, id: string): Promise<SessionApiReadV1<Task>> => read(`/v1/tasks/${encodeURIComponent(id)}`, workspaceId, parseSessionTaskV1),
    tasks(workspaceId: string, filters: Readonly<{ limit?: number; state?: string; cursor?: string }> = {}): Promise<SessionApiReadV1<SessionTaskListV1>> {
      const limit = filters.limit ?? 50; if (!Number.isInteger(limit) || limit < 1 || limit > 50) fail("invalid_configuration");
      return read("/v1/tasks", workspaceId, input => {
        const body = record(input); keys(body, ["tasks"], ["nextCursor"]);
        if (!Array.isArray(body.tasks) || body.tasks.length > limit) fail("invalid_response");
        const tasks = body.tasks.map(parseTaskSummaryV1); if (tasks.some(task => task.workspaceId !== workspaceId)) fail("invalid_response");
        return { tasks, ...(body.nextCursor === undefined ? {} : { nextCursor: token(body.nextCursor) }) };
      }, { limit: String(limit), ...(filters.state === undefined ? {} : { state: filters.state }), ...(filters.cursor === undefined ? {} : { cursor: token(filters.cursor) }) });
    },
    async *events(workspaceId: string, afterCursor: string, signal?: AbortSignal): AsyncGenerator<SessionClientEvent> {
      const controller = new AbortController(); const timeoutId = setTimeout(() => controller.abort(), timeout);
      let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
      try {
        const response = await fetch(`${base}/v1/events?${new URLSearchParams({ workspaceId })}`, { redirect: "manual", signal: signal ? AbortSignal.any([signal, controller.signal]) : controller.signal, headers: { authorization: `Bearer ${options.credential}`, accept: "text/event-stream", "last-event-id": token(afterCursor) } });
        clearTimeout(timeoutId); await checkStatus(response);
        if (!response.headers.get("content-type")?.startsWith("text/event-stream") || !response.body) fail("invalid_response");
        reader = response.body.getReader(); const decoder = new TextDecoder("utf-8", { fatal: true }); let buffer = "";
        for (;;) {
          const part = await reader.read(); buffer += decoder.decode(part.value, { stream: !part.done });
          let end: number;
          while ((end = buffer.indexOf("\n\n")) >= 0) {
            const frame = buffer.slice(0, end); buffer = buffer.slice(end + 2);
            if (Buffer.byteLength(frame) > 1_048_576) fail("response_too_large");
            if (!frame || frame.startsWith(":")) continue;
            const fields = new Map<string, string>();
            for (const line of frame.split("\n")) { const match = /^(id|event|data): (.*)$/.exec(line); if (!match || fields.has(match[1]!)) fail("unsupported_protocol"); fields.set(match[1]!, match[2]!); }
            if (fields.get("event") === "stream.error") {
              try { errorCode(parseSessionApiErrorV1(decodeSessionApiJsonV1(fields.get("data") ?? ""))); } catch (error) { if (error instanceof SessionClientError) throw error; fail("invalid_response"); }
            }
            if (fields.size !== 3) fail("unsupported_protocol");
            let event: ProductEventV1;
            try { event = deserializeProductEventV1(fields.get("data")!); } catch { fail("unsupported_protocol"); }
            if (fields.get("event") !== event.type || event.workspaceId !== workspaceId) fail("invalid_response");
            yield { event, cursor: token(fields.get("id")) };
          }
          if (Buffer.byteLength(buffer) > 1_048_576) fail("response_too_large");
          if (part.done) { if (buffer) fail("invalid_response"); fail("stream_disconnected"); }
        }
      } catch (error) { if (signal?.aborted) return; if (error instanceof SessionClientError) throw error; fail("stream_disconnected"); }
      finally { clearTimeout(timeoutId); controller.abort(); await reader?.cancel().catch(() => undefined); reader?.releaseLock(); }
    },
  };
}
/** A bounded consumer tracker. Capacity exhaustion explicitly requires a new authorized snapshot. */
export class SessionEventTracker {
  readonly #seen = new Map<string, string>(); readonly #revisions = new Map<string, number>();
  constructor(snapshot?: SessionSnapshotV1) {
    if (snapshot) { const value = parseSessionSnapshotV1(snapshot); for (const session of value.sessions) this.#revisions.set(`session:${session.id}`, session.revision); for (const task of value.tasks) this.#revisions.set(`task:${task.id}`, task.revision); }
  }
  accept(input: ProductEventV1): "applied" | "duplicate" | "stale" {
    const event = parseProductEventV1(input); const fingerprint = canonicalJsonV1(event); const previous = this.#seen.get(event.eventId);
    if (previous !== undefined) { if (previous !== fingerprint) fail("invalid_response"); return "duplicate"; }
    const key = `${event.aggregate.kind}:${event.aggregate.id}`; const knownRevision = this.#revisions.get(key);
    if (knownRevision !== undefined && event.aggregate.revision > knownRevision + 1) fail("snapshot_required");
    if (this.#seen.size >= 4096) fail("snapshot_required"); this.#seen.set(event.eventId, fingerprint);
    const revision = knownRevision ?? 0;
    if (event.aggregate.revision < revision) return "stale";
    this.#revisions.set(key, event.aggregate.revision); return "applied";
  }
}
/** Query/replay library entrypoint, intentionally separate from the diagnostic CLI credential domain. */
export async function runSessionCli(args: readonly string[], output: (line: string) => void, options: SessionClientOptions): Promise<number> {
  try {
    const parts = [...args]; const json = parts.at(-1) === "--json"; if (json) parts.pop();
    const [command, workspaceId, id, countText] = parts; if (!workspaceId) return 2;
    const client = createSessionDataClient(options); let result: unknown;
    if (command === "snapshot" && parts.length === 2) result = await client.snapshot(workspaceId);
    else if (command === "tasks" && parts.length === 2) result = await client.tasks(workspaceId);
    else if (command === "task" && parts.length === 3) result = await client.task(workspaceId, id!);
    else if (command === "session" && parts.length === 3) result = await client.session(workspaceId, id!);
    else if (command === "replay" && parts.length === 4 && /^(?:[1-9]|[1-4][0-9]|50)$/.test(countText!)) {
      const tracker = new SessionEventTracker(); let count = 0;
      for await (const frame of client.events(workspaceId, id!, AbortSignal.timeout(options.timeoutMs ?? 5000))) {
        if (tracker.accept(frame.event) !== "applied") continue;
        output(json ? JSON.stringify(frame) : `${frame.event.type}: ${JSON.stringify(frame)}`); if (++count === Number(countText)) return 0;
      }
      fail("stream_disconnected");
    } else return 2;
    output(json ? JSON.stringify(result) : `${command}: ${JSON.stringify(result)}`); return 0;
  } catch (error) { output(`Session error: ${error instanceof SessionClientError ? error.code : "invalid_response"}.`); return 1; }
}
