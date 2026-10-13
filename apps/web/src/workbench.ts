import { canonicalJsonV1, parseBrowserPairResponseV1, parseSessionPairRequestV1, parseSessionCreateCommandV1, parseSessionApiReceiptV1,
  parseSessionSnapshotPageV1, parseSessionSnapshotV1, sessionSnapshotAssemblyBytesV1, parseProductEventV1,
  parseLocalApiCommandV1, parseLocalApiMemoryInputV1, parseLocalApiMemorySearchV1, parseLocalApiMemoryExplanationRequestV1,
  parseOutcomePlanCommandV1, parseOutcomeVerifyCommandV1, parseOutcomeFeedbackCommandV1,
  parseWorkbenchCapabilitiesV1, parseWorkbenchTaskReadV1, parseWorkbenchSessionReadV1, parseWorkbenchMemoryInputResponseV1,
  parseWorkbenchMemorySearchResponseV1, parseWorkbenchMemoryExplanationResponseV1, parseWorkbenchPlanResponseV1,
  parseWorkbenchResultResponseV1, parseWorkbenchResultReadV1, parseWorkbenchResultHistoryV1, parseWorkbenchReadNotAfterV1, parseWorkbenchIdentifierV1, parseWorkbenchCursorV1,
  parseWorkbenchContextV1, type SessionSnapshotV1, type ProductEventV1, type SessionApiReceiptV1, type TaskSummaryV1,
} from "../../../packages/protocol/src/index.ts";
import { WorkbenchError, bytes, checkResponse, eventFrames, responseJson } from "./transport.ts";
export { WorkbenchError } from "./transport.ts";

type Capabilities = ReturnType<typeof parseWorkbenchCapabilitiesV1>;
export interface WorkbenchWriteState {
  readonly status: "idle" | "sending" | "confirmed" | "received" | "unknown" | "rejected";
  readonly operation?: string; readonly commandId?: string; readonly code?: string; readonly canRetry?: boolean; readonly receipt?: SessionApiReceiptV1;
}
export interface WorkbenchView {
  readonly workspaceId: string;
  readonly connection: "unpaired" | "pairing" | "connected" | "disconnected" | "permission" | "closed";
  readonly status: "normal" | "empty" | "loading" | "error" | "permission" | "degraded";
  readonly code?: string; readonly capabilities?: Capabilities; readonly snapshot?: SessionSnapshotV1;
  readonly task?: ReturnType<typeof parseWorkbenchTaskReadV1>; readonly session?: ReturnType<typeof parseWorkbenchSessionReadV1>;
  readonly memory?: ReturnType<typeof parseWorkbenchMemorySearchResponseV1>; readonly explanation?: ReturnType<typeof parseWorkbenchMemoryExplanationResponseV1>;
  readonly evidence?: ReturnType<typeof parseWorkbenchMemoryInputResponseV1>; readonly plan?: ReturnType<typeof parseWorkbenchPlanResponseV1>;
  readonly result?: ReturnType<typeof parseWorkbenchResultReadV1>; readonly resultHistory?: ReturnType<typeof parseWorkbenchResultHistoryV1>;
  readonly lastEvent?: ProductEventV1; readonly lastConfirmed?: Readonly<{ at: string; tasks: readonly TaskSummaryV1[] }>;
  readonly write: WorkbenchWriteState;
  readonly context?: ReturnType<typeof parseWorkbenchContextV1>;
}
export interface WorkbenchOptions {
  readonly origin: string; readonly workspaceId: string; readonly nonce: () => string; readonly clearFragment: () => void;
  readonly fetch?: typeof fetch; readonly now?: () => number; readonly timeoutMs?: number;
  readonly schedule?: (callback: () => void, delayMs: number) => () => void;
}
type ParsedWrite = Readonly<{ receipt?: SessionApiReceiptV1; evidence?: WorkbenchView["evidence"]; plan?: WorkbenchView["plan"]; result?: WorkbenchView["result"] }>;
interface PendingWrite { readonly authGeneration: number; readonly workspaceId: string; readonly path: string; readonly body: string; readonly operation: string; readonly commandId: string;
  readonly parse: (input: unknown) => ParsedWrite; readonly targetId?: string; readonly lease: boolean }
interface ReadTicket { readonly facet: "snapshot" | "task" | "session" | "memory" | "explanation" | "result" | "resultHistory" | "context"; readonly sequence: number }
/** Bounded event transport tracking, without selecting any domain transition or Outcome. */
class EventTracker {
  readonly #seen = new Map<string, string>(); readonly #revisions = new Map<string, number>();
  constructor(snapshot: SessionSnapshotV1) {
    for (const session of snapshot.sessions) this.#revisions.set(`session:${session.id}`, session.revision);
    for (const task of snapshot.tasks) this.#revisions.set(`task:${task.id}`, task.revision);
  }
  accept(input: ProductEventV1): boolean {
    const event = parseProductEventV1(input), fingerprint = canonicalJsonV1(event), seen = this.#seen.get(event.eventId);
    if (seen !== undefined) { if (seen !== fingerprint) throw new WorkbenchError("invalid_response"); return false; }
    const key = `${event.aggregate.kind}:${event.aggregate.id}`, known = this.#revisions.get(key);
    if (known === undefined && event.aggregate.revision !== 1 || known !== undefined && event.aggregate.revision > known + (event.type === "task.execution_closed" ? 0 : 1)) throw new WorkbenchError("snapshot_required");
    if (this.#seen.size >= 4096) throw new WorkbenchError("snapshot_required"); this.#seen.set(event.eventId, fingerprint);
    if (known !== undefined && event.aggregate.revision < known) return false;
    if (event.type !== "task.execution_closed") this.#revisions.set(key, event.aggregate.revision); return true;
  }
}
export class BrowserWorkbench {
  readonly #options: WorkbenchOptions; readonly #fetch: typeof fetch; readonly #now: () => number; readonly #timeout: number;
  readonly #schedule: (callback: () => void, delayMs: number) => () => void;
  #view: WorkbenchView; #authentication: Readonly<{ csrf: string; expires: number }> | undefined;
  #authGeneration = 0; #readGeneration = 0; #readNotAfter = Infinity; #cancelExpiry: (() => void) | undefined;
  readonly #reads = new Set<AbortController>(); #pairing: AbortController | undefined; #writing: AbortController | undefined;
  readonly #selections = new Map<ReadTicket["facet"], number>();
  readonly #listeners = new Set<(view: WorkbenchView) => void>(); #notificationQueued = false;
  #pending: PendingWrite | undefined; #eventCursor: string | undefined; #tracker: EventTracker | undefined; #stream: AbortController | undefined;
  constructor(options: WorkbenchOptions) {
    let origin: URL; try { origin = new URL(options.origin); } catch { throw new WorkbenchError("invalid_configuration"); }
    if (origin.origin !== options.origin || origin.protocol !== "http:" || origin.hostname !== "127.0.0.1" || !origin.port
      || typeof globalThis.location !== "undefined" && globalThis.location.origin !== options.origin) throw new WorkbenchError("invalid_configuration");
    parseWorkbenchIdentifierV1(options.workspaceId);
    this.#options = options; this.#fetch = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.#now = () => { const value = (options.now ?? Date.now)(); if (!Number.isSafeInteger(value) || value < 0) throw new WorkbenchError("invalid_configuration"); return value; }; this.#timeout = options.timeoutMs ?? 5000;
    if (!Number.isSafeInteger(this.#timeout) || this.#timeout < 1 || this.#timeout > 30_000 || !Number.isFinite(this.#now())) throw new WorkbenchError("invalid_configuration");
    this.#schedule = options.schedule ?? ((callback, delay) => { const timer = setTimeout(callback, delay); return () => clearTimeout(timer); });
    this.#view = { workspaceId: options.workspaceId, connection: "unpaired", status: "permission", write: { status: "idle" } };
  }
  get view(): WorkbenchView { this.#checkTime(); return structuredClone(this.#view); }
  subscribe(listener: (view: WorkbenchView) => void): () => void {
    if (this.#listeners.size >= 32) throw new WorkbenchError("subscriber_limit"); this.#listeners.add(listener); listener(this.view);
    return () => { this.#listeners.delete(listener); };
  }
  #notify(): void {
    if (this.#notificationQueued) return; this.#notificationQueued = true;
    queueMicrotask(() => { this.#notificationQueued = false; for (const listener of this.#listeners) listener(this.view); });
  }
  #beginRead(facet: ReadTicket["facet"]): ReadTicket {
    this.#identity();
    const sequence = (this.#selections.get(facet) ?? 0) + 1;
    if (!Number.isSafeInteger(sequence)) throw new WorkbenchError("read_limit"); this.#selections.set(facet, sequence);
    this.#view = { ...this.#view, [facet]: undefined, status: "loading" }; this.#notify(); return { facet, sequence };
  }
  #selected(ticket: ReadTicket): boolean { return this.#selections.get(ticket.facet) === ticket.sequence; }
  #publishRead(read: Readonly<{ generation: number; deadline: number }>, ticket: ReadTicket): void {
    this.#live(read.generation, this.#authGeneration, read.deadline); if (!this.#selected(ticket)) throw new WorkbenchError("cancelled");
  }
  #checkTime(): void {
    if (this.#authentication && this.#authentication.expires <= this.#now()) this.#loseIdentity("expired_session");
    else if (this.#readNotAfter <= this.#now()) this.#invalidate("degraded", "expired_read");
  }
  #identity(): Readonly<{ csrf: string; expires: number }> { this.#checkTime(); if (!this.#authentication) throw new WorkbenchError("permission"); return this.#authentication; }
  #invalidate(status: WorkbenchView["status"], code: string, connection = this.#view.connection): void {
    this.#readGeneration++; for (const read of this.#reads) read.abort(); this.#reads.clear(); this.#stream = undefined;
    this.#selections.clear();
    this.#cancelExpiry?.(); this.#cancelExpiry = undefined; this.#readNotAfter = Infinity; this.#eventCursor = undefined; this.#tracker = undefined;
    this.#view = { workspaceId: this.#view.workspaceId, connection, status, code, ...(this.#view.capabilities ? { capabilities: this.#view.capabilities } : {}),
      ...(this.#view.lastConfirmed ? { lastConfirmed: this.#view.lastConfirmed } : {}), write: this.#view.write }; this.#notify();
  }
  #loseIdentity(code: string): void {
    this.#authGeneration++; this.#authentication = undefined; this.#pending = undefined; this.#writing?.abort(); this.#pairing?.abort();
    this.#invalidate("permission", code, "permission");
    this.#view = { workspaceId: this.#view.workspaceId, connection: "permission", status: "permission", code, write: { status: "idle" } }; this.#notify();
  }
  #live(readGeneration: number, authGeneration: number, deadline: number): void {
    this.#checkTime();
    if (readGeneration !== this.#readGeneration || authGeneration !== this.#authGeneration || !this.#authentication) throw new WorkbenchError("cancelled");
    if (!Number.isFinite(deadline) || deadline <= this.#now()) { this.#invalidate("degraded", "expired_read"); throw new WorkbenchError("expired_read"); }
  }
  #lease(response: Response): number {
    let deadline: number;
    try { deadline = Date.parse(parseWorkbenchReadNotAfterV1(response.headers.get("x-zhiwei-read-not-after"))); }
    catch { throw new WorkbenchError("invalid_response"); }
    return Math.min(deadline, this.#identity().expires);
  }
  #retainLease(deadline: number): void {
    this.#readNotAfter = Math.min(this.#readNotAfter, deadline); this.#cancelExpiry?.();
    const generation = this.#readGeneration;
    this.#cancelExpiry = this.#schedule(() => { if (generation === this.#readGeneration) this.#checkTime(); }, Math.max(1, this.#readNotAfter - this.#now()));
  }
  #failure(error: unknown, generation: number): never {
    const code = error instanceof WorkbenchError ? error.code : "daemon_unavailable";
    if (generation === this.#readGeneration) {
      if (code === "permission") this.#loseIdentity(code);
      else if (["snapshot_required", "expired_read", "stream_disconnected", "daemon_unavailable", "invalid_response", "response_too_large", "corruption", "recovery_required"].includes(code)) this.#invalidate("degraded", code, "disconnected");
      else this.#invalidate("error", code);
    }
    throw new WorkbenchError(code);
  }
  async pairFromFragment(fragment: string): Promise<void> {
    // Remove the entry secret before parsing, nonce generation or any asynchronous I/O.
    this.#options.clearFragment();
    if (typeof fragment !== "string" || bytes(fragment) > 4096) throw new WorkbenchError("invalid_configuration");
    const values = new URLSearchParams(fragment.startsWith("#") ? fragment.slice(1) : fragment);
    if ([...values.keys()].some(key => key !== "bootstrapCode") || values.getAll("bootstrapCode").length !== 1) throw new WorkbenchError("invalid_configuration");
    return this.pair(values.get("bootstrapCode")!);
  }
  async pair(bootstrapCode: string): Promise<void> {
    if (this.#view.connection === "closed") throw new WorkbenchError("closed");
    if (this.#pairing) throw new WorkbenchError("pair_in_progress");
    this.#options.clearFragment(); this.#loseIdentity("pairing");
    const generation = this.#authGeneration, controller = new AbortController(); this.#pairing = controller;
    this.#view = { ...this.#view, connection: "pairing", status: "loading" }; this.#notify();
    const cancel = this.#schedule(() => controller.abort(), this.#timeout);
    try {
      const request = parseSessionPairRequestV1({ schemaVersion: 1, bootstrapCode, clientNonce: this.#options.nonce(), clientKind: "browser" });
      const response = await this.#fetch("/v1/browser-pair", { method: "POST", mode: "same-origin", credentials: "same-origin", cache: "no-store", redirect: "manual", signal: controller.signal,
        headers: { "content-type": "application/json" }, body: canonicalJsonV1(request) });
      await checkResponse(response); const value = parseBrowserPairResponseV1(await responseJson(response));
      if (generation !== this.#authGeneration || controller.signal.aborted) throw new WorkbenchError("cancelled");
      const expires = Date.parse(value.expiresAt); if (expires <= this.#now()) throw new WorkbenchError("permission");
      this.#authentication = { csrf: value.csrfToken, expires }; this.#retainLease(expires);
      // A parsed pair body alone does not prove that this browser stored the Cookie or owns the selected Workspace.
      await this.capabilities(); await this.refresh();
      if (generation !== this.#authGeneration || controller.signal.aborted) throw new WorkbenchError("cancelled");
    } catch (error) { if (generation === this.#authGeneration) this.#loseIdentity(error instanceof WorkbenchError ? error.code : "daemon_unavailable"); throw new WorkbenchError(error instanceof WorkbenchError ? error.code : "daemon_unavailable"); }
    finally { cancel(); if (this.#pairing === controller) this.#pairing = undefined; }
  }
  selectWorkspace(workspaceId: string): void {
    if (this.#view.connection === "closed") throw new WorkbenchError("closed");
    parseWorkbenchIdentifierV1(workspaceId); if (workspaceId === this.#view.workspaceId) return;
    this.#loseIdentity("workspace_changed"); this.#view = { ...this.#view, workspaceId }; this.#notify();
  }
  async #query<T>(path: string, parse: (input: unknown) => T, body?: unknown, lease = true, timeoutMs = this.#timeout, ticket?: ReadTicket): Promise<Readonly<{ value: T; deadline: number; generation: number }>> {
    const identity = this.#identity(), generation = this.#readGeneration, authGeneration = this.#authGeneration, controller = new AbortController(); this.#reads.add(controller);
    const cancel = this.#schedule(() => controller.abort(), timeoutMs);
    let received = false;
    try {
      const response = await this.#fetch(path, { method: body === undefined ? "GET" : "POST", mode: "same-origin", credentials: "same-origin", cache: "no-store", redirect: "manual", signal: controller.signal,
        headers: body === undefined ? {} : { "content-type": "application/json", "x-zhiwei-csrf": identity.csrf }, ...(body === undefined ? {} : { body: canonicalJsonV1(body) }) });
      received = true;
      await checkResponse(response); const deadline = lease ? this.#lease(response) : identity.expires, value = parse(await responseJson(response));
      if (controller.signal.aborted || ticket && !this.#selected(ticket)) throw new WorkbenchError("cancelled");
      this.#live(generation, authGeneration, deadline); return { value, deadline, generation };
    } catch (error) { if (ticket && !this.#selected(ticket)) throw new WorkbenchError("cancelled");
      return this.#failure(error instanceof WorkbenchError ? error : new WorkbenchError(received ? "invalid_response" : "daemon_unavailable"), generation); }
    finally { cancel(); this.#reads.delete(controller); controller.abort(); }
  }
  async capabilities(): Promise<void> {
    const read = await this.#query("/v1/capabilities", parseWorkbenchCapabilitiesV1, undefined, false);
    this.#live(read.generation, this.#authGeneration, read.deadline); this.#view = { ...this.#view, capabilities: read.value }; this.#notify();
  }
  async context(): Promise<void> {
    const ticket = this.#beginRead("context"), read = await this.#query(`/v1/workbench-context?${new URLSearchParams({ workspaceId: this.#view.workspaceId })}`, parseWorkbenchContextV1, undefined, true, this.#timeout, ticket);
    this.#publishRead(read, ticket);
    if (read.value.workspaceId !== this.#view.workspaceId) return this.#failure(new WorkbenchError("invalid_response"), read.generation);
    this.#retainLease(read.deadline); this.#view = { ...this.#view, context: read.value, status: "normal" }; this.#notify();
  }
  async refresh(): Promise<void> {
    this.#identity(); const generation = this.#readGeneration, authGeneration = this.#authGeneration, workspaceId = this.#view.workspaceId, started = this.#now();
    const ticket = this.#beginRead("snapshot");
    const sessions: SessionSnapshotV1["sessions"][number][] = [], tasks: TaskSummaryV1[] = [], seen = new Set<string>();
    let cursor: string | undefined, asOfCursor = "", size = 0, deadline = Infinity;
    try {
      do {
        if (this.#now() - started >= this.#timeout) throw new WorkbenchError("snapshot_required");
        const read = await this.#query(`/v1/snapshot?${new URLSearchParams({ workspaceId, ...(cursor ? { cursor } : {}) })}`, parseSessionSnapshotPageV1, undefined, true, this.#timeout - (this.#now() - started), ticket);
        if (read.value.workspaceId !== workspaceId || read.generation !== generation) throw new WorkbenchError("invalid_response");
        deadline = Math.min(deadline, read.deadline); size += bytes(JSON.stringify(read.value));
        if (size > sessionSnapshotAssemblyBytesV1 || this.#now() - started >= this.#timeout) throw new WorkbenchError("snapshot_required");
        asOfCursor = read.value.asOfCursor; sessions.push(...read.value.sessions); tasks.push(...read.value.tasks); cursor = read.value.nextCursor;
        if (cursor !== undefined) { parseWorkbenchCursorV1(cursor); if (seen.has(cursor)) throw new WorkbenchError("invalid_response"); seen.add(cursor); }
      } while (cursor !== undefined);
      const snapshot = parseSessionSnapshotV1({ schemaVersion: 1, workspaceId, sessions, tasks, asOfCursor }); this.#live(generation, authGeneration, deadline);
      if (!this.#selected(ticket)) throw new WorkbenchError("cancelled");
      this.#retainLease(deadline); this.#eventCursor = asOfCursor; this.#tracker = new EventTracker(snapshot);
      this.#view = { ...this.#view, snapshot, status: snapshot.tasks.length || snapshot.sessions.length ? "normal" : "empty", connection: "connected",
        lastConfirmed: { at: new Date(this.#now()).toISOString(), tasks: snapshot.tasks } }; this.#notify();
    } catch (error) { if (generation === this.#readGeneration && !this.#selected(ticket)) throw new WorkbenchError("cancelled"); this.#failure(error, generation); }
  }
  async task(id: string): Promise<void> {
    parseWorkbenchIdentifierV1(id); const ticket = this.#beginRead("task"), read = await this.#query(`/v1/tasks/${encodeURIComponent(id)}?${new URLSearchParams({ workspaceId: this.#view.workspaceId })}`, parseWorkbenchTaskReadV1, undefined, true, this.#timeout, ticket);
    this.#publishRead(read, ticket);
    if (read.value.value.workspaceId !== this.#view.workspaceId || read.value.value.id !== id) return this.#failure(new WorkbenchError("invalid_response"), read.generation);
    this.#retainLease(read.deadline); this.#view = { ...this.#view, task: read.value, status: "normal" }; this.#notify();
  }
  async session(id: string): Promise<void> {
    parseWorkbenchIdentifierV1(id); const ticket = this.#beginRead("session"), read = await this.#query(`/v1/sessions/${encodeURIComponent(id)}?${new URLSearchParams({ workspaceId: this.#view.workspaceId })}`, parseWorkbenchSessionReadV1, undefined, true, this.#timeout, ticket);
    this.#publishRead(read, ticket);
    if (read.value.value.workspaceId !== this.#view.workspaceId || read.value.value.id !== id) return this.#failure(new WorkbenchError("invalid_response"), read.generation);
    this.#retainLease(read.deadline); this.#view = { ...this.#view, session: read.value, status: "normal" }; this.#notify();
  }
  async search(input: unknown): Promise<void> {
    const query = parseLocalApiMemorySearchV1(input); if (query.scope.kind === "global" || query.scope.workspaceId !== this.#view.workspaceId) throw new WorkbenchError("invalid_configuration");
    const ticket = this.#beginRead("memory"), read = await this.#query("/v1/memory/search", parseWorkbenchMemorySearchResponseV1, query, true, this.#timeout, ticket);
    this.#publishRead(read, ticket);
    if (canonicalJsonV1(read.value.fence.scope) !== canonicalJsonV1(query.scope)) return this.#failure(new WorkbenchError("invalid_response"), read.generation);
    this.#retainLease(read.deadline); this.#view = { ...this.#view, memory: read.value, status: read.value.material.length ? "normal" : "empty" }; this.#notify();
  }
  async explain(input: unknown): Promise<void> {
    const query = parseLocalApiMemoryExplanationRequestV1(input); if (query.workspaceId !== this.#view.workspaceId) throw new WorkbenchError("invalid_configuration");
    const ticket = this.#beginRead("explanation"), read = await this.#query("/v1/memory/explain", parseWorkbenchMemoryExplanationResponseV1, query, true, this.#timeout, ticket);
    this.#publishRead(read, ticket);
    if (read.value.id !== query.claimId || canonicalJsonV1(read.value.scope) !== canonicalJsonV1(query.scope) || query.version !== undefined && read.value.value !== undefined && read.value.value.version !== query.version) return this.#failure(new WorkbenchError("invalid_response"), read.generation);
    this.#retainLease(read.deadline); this.#view = { ...this.#view, explanation: read.value, status: read.value.value ? "normal" : "degraded" }; this.#notify();
  }
  async result(id: string, history = false): Promise<void> {
    parseWorkbenchIdentifierV1(id);
    const path = `/v1/tasks/${encodeURIComponent(id)}/${history ? "result-history" : "result"}?${new URLSearchParams({ workspaceId: this.#view.workspaceId })}`;
    const ticket = this.#beginRead(history ? "resultHistory" : "result");
    if (history) { const read = await this.#query(path, parseWorkbenchResultHistoryV1, undefined, true, this.#timeout, ticket);
      this.#publishRead(read, ticket);
      if (read.value.value.some(item => item.task.id !== id || item.task.workspaceId !== this.#view.workspaceId)) return this.#failure(new WorkbenchError("invalid_response"), read.generation);
      this.#retainLease(read.deadline); this.#view = { ...this.#view, resultHistory: read.value, status: read.value.value.length ? "normal" : "empty" }; this.#notify(); }
    else { const read = await this.#query(path, parseWorkbenchResultReadV1, undefined, true, this.#timeout, ticket);
      this.#publishRead(read, ticket);
      if (read.value.value.task.id !== id || read.value.value.task.workspaceId !== this.#view.workspaceId) return this.#failure(new WorkbenchError("invalid_response"), read.generation);
      this.#retainLease(read.deadline); this.#view = { ...this.#view, result: read.value, status: "normal" }; this.#notify(); }
  }
  async #write(pending: PendingWrite): Promise<WorkbenchWriteState> {
    if (this.#writing) throw new WorkbenchError("write_in_progress"); const identity = this.#identity();
    if (pending.authGeneration !== this.#authGeneration || pending.workspaceId !== this.#view.workspaceId) throw new WorkbenchError("permission");
    const retryingUnknown = this.#pending === pending && this.#view.write.status === "unknown";
    this.#pending = pending; this.#view = { ...this.#view, write: { status: "sending", operation: pending.operation, commandId: pending.commandId } }; this.#notify();
    const readGeneration = this.#readGeneration;
    const controller = new AbortController(), cancel = this.#schedule(() => controller.abort(), this.#timeout); this.#writing = controller; let sent = false;
    try {
      sent = true; const response = await this.#fetch(pending.path, { method: "POST", mode: "same-origin", credentials: "same-origin", cache: "no-store", redirect: "manual", signal: controller.signal,
        headers: { "content-type": "application/json", "x-zhiwei-csrf": identity.csrf }, body: pending.body });
      if (response.status >= 500 || response.status < 200 || response.status >= 300 && response.status < 400 || response.redirected || response.type === "opaqueredirect") throw new WorkbenchError("commit_unknown");
      if (!response.ok) { await checkResponse(response); throw new WorkbenchError("invalid_response"); }
      const parsed = pending.parse(await responseJson(response)); const deadline = pending.lease ? this.#lease(response) : identity.expires;
      this.#checkTime(); if (controller.signal.aborted || pending.authGeneration !== this.#authGeneration) throw new WorkbenchError("commit_unknown");
      if (parsed.receipt && (parsed.receipt.commandId !== pending.commandId || pending.targetId !== undefined && parsed.receipt.aggregate.id !== pending.targetId)) throw new WorkbenchError("commit_unknown");
      const canPublishBody = deadline > this.#now() && readGeneration === this.#readGeneration;
      if (!canPublishBody && !parsed.receipt) throw new WorkbenchError("commit_unknown");
      // A committed write invalidates earlier protected reads, without changing identity/retry eligibility.
      this.#invalidate("degraded", "write_committed"); this.#pending = undefined;
      const write: WorkbenchWriteState = { status: parsed.receipt ? "confirmed" : "received", operation: pending.operation, commandId: pending.commandId, ...(parsed.receipt ? { receipt: parsed.receipt } : {}) };
      this.#retainLease(canPublishBody ? deadline : identity.expires); this.#view = { ...this.#view, write,
        ...(canPublishBody && parsed.evidence ? { evidence: parsed.evidence } : {}), ...(canPublishBody && parsed.plan ? { plan: parsed.plan } : {}), ...(canPublishBody && parsed.result ? { result: parsed.result } : {}) }; this.#notify(); return write;
    } catch (error) {
      if (pending.authGeneration !== this.#authGeneration) throw new WorkbenchError("permission");
      const code = error instanceof WorkbenchError ? error.code : "commit_unknown";
      if (code === "permission") { this.#loseIdentity(code); throw new WorkbenchError(code); }
      // Rejecting this replay cannot establish that the earlier, unobserved attempt never committed.
      const rejected = !retryingUnknown && ["validation", "not_found", "revision_conflict", "idempotency_conflict", "unsupported", "budget_exceeded"].includes(code);
      if (rejected || !sent) this.#pending = undefined;
      this.#invalidate("degraded", code, rejected ? this.#view.connection : "disconnected");
      this.#view = { ...this.#view, write: { status: rejected || !sent ? "rejected" : "unknown", operation: pending.operation, commandId: pending.commandId, code,
        canRetry: sent && !rejected && this.#authentication !== undefined } }; this.#notify(); return this.#view.write;
    } finally { cancel(); if (this.#writing === controller) this.#writing = undefined; controller.abort(); }
  }
  #prepare(path: string, input: Readonly<{ commandId: string; workspaceId: string }>, operation: string, parse: PendingWrite["parse"], targetId?: string, lease = false): PendingWrite {
    this.#identity(); if (input.workspaceId !== this.#view.workspaceId) throw new WorkbenchError("invalid_configuration");
    if (this.#pending) throw new WorkbenchError("resolve_unknown_write");
    return { authGeneration: this.#authGeneration, workspaceId: input.workspaceId, path, body: canonicalJsonV1(input), operation, commandId: input.commandId, parse, targetId, lease };
  }
  createSession(input: unknown): Promise<WorkbenchWriteState> {
    const command = parseSessionCreateCommandV1(input); return this.#write(this.#prepare("/v1/sessions", command, command.payload.kind, value => {
      const receipt = parseSessionApiReceiptV1(value); if (receipt.aggregate.kind !== "session") throw new WorkbenchError("commit_unknown"); return { receipt }; }));
  }
  command(input: unknown): Promise<WorkbenchWriteState> {
    const command = parseLocalApiCommandV1(input), payload = command.payload;
    if (!payload.kind.startsWith("task.") && !payload.kind.startsWith("memory.")) throw new WorkbenchError("unsupported");
    const targetId = "targetRef" in payload ? payload.targetRef.id : undefined;
    const path = payload.kind.startsWith("memory.") ? "/v1/memory/commands" : payload.kind === "task.create" ? "/v1/tasks" : `/v1/tasks/${encodeURIComponent(targetId!)}/commands`;
    return this.#write(this.#prepare(path, command, payload.kind, value => { const receipt = parseSessionApiReceiptV1(value);
      if (receipt.aggregate.kind !== (payload.kind.startsWith("memory.") ? "claim" : "task")) throw new WorkbenchError("commit_unknown"); return { receipt }; }, targetId));
  }
  capture(input: unknown): Promise<WorkbenchWriteState> {
    const command = parseLocalApiMemoryInputV1(input); return this.#write(this.#prepare("/v1/memory/inputs", command, "memory.input", value => {
      const evidence = parseWorkbenchMemoryInputResponseV1(value); if (canonicalJsonV1(evidence.evidence.scope) !== canonicalJsonV1(command.scope)) throw new WorkbenchError("commit_unknown"); return { evidence }; }, undefined, true));
  }
  bindPlan(input: unknown): Promise<WorkbenchWriteState> {
    const command = parseOutcomePlanCommandV1(input); return this.#write(this.#prepare(`/v1/tasks/${encodeURIComponent(command.taskId)}/verification-plan`, command, "result.plan", value => {
      const plan = parseWorkbenchPlanResponseV1(value); if (plan.plan.workspaceId !== command.workspaceId || plan.plan.task.id !== command.taskId || plan.plan.task.revision !== command.expectedRevision
        || canonicalJsonV1(plan.plan.checks) !== canonicalJsonV1(command.checks) || canonicalJsonV1(plan.plan.adoptionChecks) !== canonicalJsonV1(command.adoptionChecks)) throw new WorkbenchError("commit_unknown"); return { plan }; }, command.taskId, true));
  }
  verify(input: unknown): Promise<WorkbenchWriteState> { return this.#resultWrite(parseOutcomeVerifyCommandV1(input), "verification", "result.verify"); }
  feedback(input: unknown): Promise<WorkbenchWriteState> { return this.#resultWrite(parseOutcomeFeedbackCommandV1(input), "feedback", "result.feedback"); }
  #resultWrite(command: ReturnType<typeof parseOutcomeVerifyCommandV1>, route: string, operation: string): Promise<WorkbenchWriteState> {
    return this.#write(this.#prepare(`/v1/tasks/${encodeURIComponent(command.taskId)}/${route}`, command, operation, value => {
      const response = parseWorkbenchResultResponseV1(value); if (response.value.task.workspaceId !== command.workspaceId) throw new WorkbenchError("commit_unknown");
      return { receipt: response.receipt, result: { schemaVersion: 1, value: response.value } }; }, command.taskId, true));
  }
  retryUnknown(): Promise<WorkbenchWriteState> {
    this.#identity(); if (!this.#pending || this.#view.write.status !== "unknown") throw new WorkbenchError("no_unknown_write"); return this.#write(this.#pending);
  }
  cancelWrite(): void { this.#writing?.abort(); }
  discardUnknown(): void { if (this.#writing) throw new WorkbenchError("write_in_progress"); this.#pending = undefined; this.#view = { ...this.#view, write: { status: "idle" } }; this.#notify(); }
  async watchEvents(): Promise<void> {
    const identity = this.#identity(); if (!this.#eventCursor || !this.#tracker) throw new WorkbenchError("snapshot_required");
    this.#stream?.abort(); const controller = new AbortController(), generation = this.#readGeneration, authGeneration = this.#authGeneration;
    this.#stream = controller; this.#reads.add(controller); const cancel = this.#schedule(() => controller.abort(), this.#timeout);
    try {
      const response = await this.#fetch(`/v1/events?${new URLSearchParams({ workspaceId: this.#view.workspaceId })}`, { method: "GET", mode: "same-origin", credentials: "same-origin", cache: "no-store", redirect: "manual", signal: controller.signal,
        headers: { accept: "text/event-stream", "last-event-id": this.#eventCursor } });
      await checkResponse(response); cancel(); const deadline = Math.min(this.#lease(response), identity.expires); this.#live(generation, authGeneration, deadline); this.#retainLease(deadline);
      for await (const frame of eventFrames(response)) {
        this.#live(generation, authGeneration, deadline); if (controller.signal.aborted) throw new WorkbenchError("cancelled");
        if (frame.event.workspaceId !== this.#view.workspaceId) throw new WorkbenchError("invalid_response");
        if (this.#tracker!.accept(frame.event)) { this.#view = { ...this.#view, lastEvent: frame.event, status: "degraded", code: "refresh_required" }; this.#notify(); }
        this.#eventCursor = frame.cursor;
      }
    } catch (error) { if (generation === this.#readGeneration && this.#stream === controller) this.#failure(error, generation); }
    finally { cancel(); controller.abort(); this.#reads.delete(controller); if (this.#stream === controller) this.#stream = undefined; }
  }
  disconnect(): void { if (this.#view.connection !== "closed") this.#invalidate("degraded", "stream_disconnected", "disconnected"); }
  async recover(): Promise<void> { this.#identity(); this.#invalidate("loading", "snapshot_required"); await this.refresh(); }
  close(): void { this.#loseIdentity("closed"); this.#view = { ...this.#view, connection: "closed" }; this.#notify(); }
}
