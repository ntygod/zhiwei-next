import { parseSyntheticWorkbenchPairingV1, type LocalApiCommandV1 } from "../../../packages/protocol/src/index.ts";
import { BrowserWorkbench, WorkbenchError, type WorkbenchView } from "./workbench.ts";
import { checkResponse, responseJson } from "./transport.ts";

export type WorkbenchPage = "home" | "tasks" | "task" | "artifacts" | "memory" | "connect" | "routines" | "settings";
export interface WorkbenchPresentation {
  readonly page: WorkbenchPage; readonly taskId?: string; readonly memoryId?: string;
  readonly modal?: "memory-add" | "memory-edit" | "forget"; readonly notice?: string; readonly busy: boolean;
}
export interface WorkbenchControllerOptions {
  readonly origin: string; readonly fetch?: typeof fetch; readonly id: () => string; readonly nonce: () => string;
  readonly clearFragment: () => void; readonly now?: () => number;
  readonly schedule?: (callback: () => void, delayMs: number) => () => void;
}
/** Presentation and command construction only. All business versions come from the API client. */
export class WorkbenchController {
  readonly #options: WorkbenchControllerOptions; readonly #listeners = new Set<() => void>();
  #client: BrowserWorkbench | undefined; #unsubscribe: (() => void) | undefined; #closed = false;
  #presentation: WorkbenchPresentation = { page: "home", busy: false };
  #streamGeneration = 0; #recoveryCount = 0; #confirmedVersions = ""; #recoveryCancel: (() => void) | undefined;
  #memoryQuery = "";
  constructor(options: WorkbenchControllerOptions) { this.#options = options; }
  get client(): BrowserWorkbench | undefined { return this.#client; }
  get view(): WorkbenchView | undefined { return this.#client?.view; }
  get presentation(): WorkbenchPresentation { return { ...this.#presentation }; }
  subscribe(listener: () => void): () => void { this.#listeners.add(listener); return () => this.#listeners.delete(listener); }
  #emit(): void { if (!this.#closed) for (const listener of this.#listeners) listener(); }
  #update(change: Partial<WorkbenchPresentation>): void { this.#presentation = { ...this.#presentation, ...change }; this.#emit(); }
  #envelope() { const id = this.#options.id(); return { schemaVersion: 1 as const, commandId: id, idempotencyKey: id, workspaceId: this.#required().view.workspaceId }; }
  #required(): BrowserWorkbench { if (!this.#client) throw new WorkbenchError("permission"); return this.#client; }
  async #perform(operation: () => Promise<void>): Promise<void> {
    if (this.#presentation.busy || this.#closed) return;
    this.#update({ busy: true, notice: undefined });
    try { await operation(); } catch { this.#update({ notice: "操作未完成，请查看连接与提交状态后再处理。" }); }
    finally { this.#update({ busy: false }); }
  }
  #attach(client: BrowserWorkbench): void {
    this.#streamGeneration++; this.#recoveryCancel?.(); this.#unsubscribe?.(); this.#client?.close(); this.#client = client;
    this.#unsubscribe = client.subscribe(view => {
      if (view.connection === "permission" || view.connection === "closed") this.#presentation = { page: "home", busy: this.#presentation.busy };
      else if (!view.explanation?.value && this.#presentation.modal && this.#presentation.modal !== "memory-add") this.#presentation = { ...this.#presentation, modal: undefined, memoryId: undefined };
      if (["disconnected", "permission", "closed"].includes(view.connection)) this.#presentation = { ...this.#presentation, modal: undefined, memoryId: undefined };
      const versions = JSON.stringify(view.lastConfirmed?.tasks.map(task => [task.id, task.revision]) ?? []);
      if (versions !== this.#confirmedVersions) { this.#confirmedVersions = versions; this.#recoveryCount = 0; }
      this.#emit();
    });
  }
  async connect(): Promise<void> { await this.#perform(async () => {
    this.#options.clearFragment();
    const response = await (this.#options.fetch ?? fetch)("/__synthetic__/pairing", { method: "POST", mode: "same-origin", credentials: "same-origin", redirect: "manual", cache: "no-store",
      headers: { "content-type": "application/json" }, body: '{"schemaVersion":1}', signal: AbortSignal.timeout(5000) });
    await checkResponse(response); const entry = parseSyntheticWorkbenchPairingV1(await responseJson(response));
    const client = new BrowserWorkbench({ ...this.#options, workspaceId: entry.workspaceId }); this.#attach(client);
    await client.pair(entry.bootstrapCode); await client.context(); this.#watch();
  }); }
  async pair(workspaceId: string, code: string): Promise<void> { await this.#perform(async () => {
    this.#options.clearFragment(); const client = new BrowserWorkbench({ ...this.#options, workspaceId }); this.#attach(client);
    await client.pair(code); await client.context(); this.#watch();
  }); }
  #watch(): void {
    const client = this.#client, generation = ++this.#streamGeneration; if (!client || this.#closed) return;
    void client.watchEvents().catch(() => undefined).finally(() => {
      if (this.#closed || client !== this.#client || generation !== this.#streamGeneration || !["connected", "disconnected"].includes(client.view.connection)) return;
      if (this.#recoveryCount >= 3) { this.#update({ notice: "连接尚未稳定，请手动重新同步。" }); return; }
      const delay = [200, 500, 1000][this.#recoveryCount++]!;
      const schedule = this.#options.schedule ?? ((callback: () => void, milliseconds: number) => { const timer = setTimeout(callback, milliseconds); return () => clearTimeout(timer); });
      this.#recoveryCancel = schedule(() => { void this.recover(false); }, delay);
    });
  }
  async recover(explicit = true): Promise<void> {
    const client = this.#client; if (!client || this.#closed) return;
    this.#streamGeneration++;
    if (explicit) this.#recoveryCount = 0; this.#recoveryCancel?.(); this.#recoveryCancel = undefined;
    try {
      await client.recover(); await client.context();
      const selection = this.#presentation;
      if (selection.taskId) await client.task(selection.taskId);
      if (selection.memoryId) await client.explain({ schemaVersion: 1, workspaceId: client.view.workspaceId, scope: this.#scope(), claimId: selection.memoryId });
      if (selection.page === "memory" && this.#memoryQuery) await client.search(this.#search(this.#memoryQuery));
      this.#watch();
    } catch { this.#update({ notice: "当前无法重新同步，请检查服务或重新配对。" }); }
  }
  #scope() { return { kind: "workspace" as const, workspaceId: this.#required().view.workspaceId }; }
  #search(query: string) { return { schemaVersion: 1, scope: this.#scope(), query, kinds: ["fact", "preference", "constraint", "decision"], limit: 50 }; }
  #suspendReads(): void { this.#streamGeneration++; this.#recoveryCancel?.(); this.#required().disconnect(); }
  async go(page: WorkbenchPage, id?: string): Promise<void> {
    this.#update({ page, taskId: page === "task" ? id : undefined, memoryId: undefined, modal: undefined, notice: undefined });
    if (!this.#client) return;
    await this.#perform(async () => {
      this.#suspendReads(); await this.#required().refresh(); await this.#required().context();
      if (page === "task" && id) { await this.#required().task(id); if (this.#required().view.task!.value.attempts.at(-1)!.outcomes.length) await this.#required().result(id); }
      if (page === "memory" && this.#memoryQuery) await this.#required().search(this.#search(this.#memoryQuery));
      this.#watch();
    });
  }
  async createTask(request: string, requirement: string): Promise<void> { await this.#perform(async () => {
    const client = this.#required(); if (!client.view.context) await client.context(); const context = client.view.context!;
    this.#suspendReads();
    const session = await client.createSession({ ...this.#envelope(), expectedRevision: 0, payload: { kind: "session.create", contract: context.sessionContract } });
    if (session.status !== "confirmed") return;
    const criterionId = this.#options.id(), created = await client.command({ ...this.#envelope(), expectedRevision: 0, payload: { kind: "task.create", sessionId: session.receipt!.aggregate.id,
      executionProfile: context.sessionContract.runtimeProfile, request, constraints: [], acceptanceChecks: [{ id: criterionId, revision: 1, description: requirement, required: true, method: "user-confirmation" }] } });
    if (created.status !== "confirmed") return;
    const id = created.receipt!.aggregate.id; this.#update({ page: "task", taskId: id }); await client.task(id);
    await client.bindPlan({ ...this.#envelope(), taskId: id, expectedRevision: client.view.task!.value.revision, checks: [{ criterionId, criterionRevision: 1, kind: "user-confirmation" }], adoptionChecks: [] });
    await client.refresh(); await client.context(); await client.task(id); this.#watch();
  }); }
  async taskCommand(kind: "task.pause" | "task.cancel" | "task.continue"): Promise<void> { await this.#perform(async () => {
    const client = this.#required(), task = client.view.task?.value; if (!task) return;
    this.#suspendReads();
    const result = await client.command({ ...this.#envelope(), expectedRevision: task.revision, payload: { kind, targetRef: { kind: "task", id: task.id, revision: task.revision } } });
    if (result.status === "confirmed") {
      await client.refresh(); await client.context(); await client.task(task.id);
      const current = client.view.task!.value;
      if (kind === "task.continue" && current.state === "READY" && current.intent.criteria.every(criterion => criterion.method === "user-confirmation")) {
        await client.bindPlan({ ...this.#envelope(), taskId: current.id, expectedRevision: current.revision,
          checks: current.intent.criteria.map(criterion => ({ criterionId: criterion.id, criterionRevision: criterion.revision, kind: "user-confirmation" })), adoptionChecks: [] });
        await client.refresh(); await client.context(); await client.task(current.id);
      }
      this.#watch();
    }
  }); }
  async verify(): Promise<void> { await this.#perform(async () => {
    const client = this.#required(), task = client.view.task?.value; if (!task) return;
    this.#suspendReads();
    const verified = await client.verify({ ...this.#envelope(), taskId: task.id, expectedRevision: task.revision });
    if (verified.status === "confirmed") { await client.refresh(); await client.context(); await client.task(task.id); await client.result(task.id); await client.result(task.id, true); this.#watch(); }
  }); }
  async feedback(criterionId: string, criterionRevision: number, decision: "accepted" | "rejected"): Promise<void> { await this.#perform(async () => {
    const client = this.#required(), bundle = client.view.result?.value; if (!bundle) return;
    this.#suspendReads();
    const feedback = await client.feedback({ ...this.#envelope(), taskId: bundle.task.id, expectedRevision: bundle.task.revision, attemptId: bundle.task.attempts.at(-1)!.id, intentRevision: bundle.task.intent.revision,
      outcomeId: bundle.outcome.id, outcomeRevision: bundle.outcome.revision, criterionId, criterionRevision, decision });
    if (feedback.status === "confirmed") { await client.refresh(); await client.context(); await client.task(bundle.task.id); await client.result(bundle.task.id); await client.result(bundle.task.id, true); this.#watch(); }
  }); }
  async search(query: string): Promise<void> { if (!query.trim()) return; this.#memoryQuery = query.trim(); await this.#perform(async () => { await this.#required().search(this.#search(this.#memoryQuery)); }); }
  async memoryDetail(id: string, modal?: WorkbenchPresentation["modal"]): Promise<void> { await this.#perform(async () => {
    const client = this.#required(); await client.explain({ schemaVersion: 1, workspaceId: client.view.workspaceId, scope: this.#scope(), claimId: id }); this.#update({ memoryId: id, modal });
  }); }
  newMemory(): void { this.#update({ modal: "memory-add", memoryId: undefined }); }
  closeModal(): void { this.#update({ modal: undefined }); }
  async saveMemory(statement: string): Promise<void> { await this.#perform(async () => {
    const client = this.#required(), existing = client.view.explanation?.value, editing = this.#presentation.modal === "memory-edit";
    if (editing && !existing) return;
    this.#suspendReads();
    const captured = await client.capture({ ...this.#envelope(), scope: this.#scope(), privacy: editing ? existing!.privacy : "local-only", text: statement });
    if (captured.status !== "received" || !client.view.evidence) return; const evidence = client.view.evidence.evidence;
    const command: LocalApiCommandV1 = editing ? { ...this.#envelope(), expectedRevision: existing!.revision, payload: { kind: "memory.correct", scope: existing!.scope,
      targetRef: { kind: "claim", id: existing!.id, revision: existing!.revision }, targetVersion: { claimId: existing!.id, version: existing!.version }, privacy: existing!.privacy, claimKind: existing!.kind,
      statement, evidenceRefs: [evidence], validFrom: existing!.validFrom } } : { ...this.#envelope(), expectedRevision: 0, payload: { kind: "memory.remember", scope: this.#scope(), privacy: "local-only", claimKind: "fact", statement, evidenceRefs: [evidence], validFrom: new Date((this.#options.now ?? Date.now)()).toISOString() } };
    const saved = await client.command(command); if (saved.status === "confirmed") {
      this.#update({ modal: undefined, memoryId: undefined }); await client.refresh(); await client.context(); await client.search(this.#search(statement.slice(0, 256))); this.#watch();
    }
  }); }
  async forget(): Promise<void> { await this.#perform(async () => {
    const client = this.#required(), claim = client.view.explanation?.value; if (!claim) return;
    this.#suspendReads();
    const command: LocalApiCommandV1 = { ...this.#envelope(), expectedRevision: claim.revision, payload: { kind: "memory.forget", scope: claim.scope, mode: "logical", targetRef: { kind: "claim", id: claim.id, revision: claim.revision }, targetVersion: { claimId: claim.id, version: claim.version } } };
    const result = await client.command(command);
    if (result.status === "confirmed") { this.#update({ modal: undefined, memoryId: undefined }); await client.refresh(); await client.context(); if (this.#memoryQuery) await client.search(this.#search(this.#memoryQuery)); this.#watch(); }
  }); }
  async retryUnknown(): Promise<void> { await this.#perform(async () => { await this.#required().retryUnknown(); }); }
  discardUnknown(): void { this.#required().discardUnknown(); this.#update({ notice: "已移除本地待核对信息；这不会撤销后端可能已提交的操作。" }); }
  close(): void { this.#closed = true; this.#streamGeneration++; this.#recoveryCancel?.(); this.#unsubscribe?.(); this.#client?.close(); this.#listeners.clear(); }
}
