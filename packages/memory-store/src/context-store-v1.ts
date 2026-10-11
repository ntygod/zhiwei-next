/** Fixed Context composition: one verified SQLite view, protected body and Runtime input. */
import type { SQLOutputValue } from "node:sqlite";
import { assertIdentifierV2, assertRevisionV2, assertContentRefV2, scopeKeyV2,
  type ContentRefV2, type ScopeV2, type MemoryClaimV2, type Task, type WorkingStateV2, type ClaimVersionRefV2 } from "../../domain/src/index.ts";
import { canonicalJsonV1, parseCognitiveContextCapsuleV1, type SessionV1 } from "../../protocol/src/index.ts";
import type { CognitionFenceV2 } from "./cognitive-store-v2.ts";
import type { TaskStoreHostV1, TaskStoreEngineV1 } from "./task-store-v1.ts";
import type { TaskPersistenceBoundaryV1, TaskStoreContextV1, TaskInputCommitResultV1 } from "./task-store-v1-types.ts";
import type { ContextPersistenceBoundaryV1, ContextPrepareV1, ContextSnapshotV1, ContextPersistenceV1 } from "./context-store-v1-types.ts";

type Row = Record<string, SQLOutputValue>;
interface Material { readonly claim: MemoryClaimV2; readonly content: ContentRefV2; readonly sources: readonly ContentRefV2[] }
export interface ContextStoreHostV1 extends TaskStoreHostV1 {
  readonly tasks: TaskStoreEngineV1;
  currentFence(scope: ScopeV2): CognitionFenceV2;
  materials(context: TaskStoreContextV1, task: Task, query: string, required: readonly ClaimVersionRefV2[]): readonly Material[];
  evidenceContents(working: WorkingStateV2): readonly ContentRefV2[];
}
interface ReadSet {
  readonly task: Task;
  readonly workingState: WorkingStateV2;
  readonly session: SessionV1;
  readonly owner: TaskStoreContextV1;
  readonly query: string;
  readonly requiredClaims: readonly ClaimVersionRefV2[];
  readonly materials: readonly Material[];
  readonly fences: readonly CognitionFenceV2[];
  readonly dependencies: readonly ContentRefV2[];
}
interface CapsuleBody { readonly capsule: ReturnType<typeof parseCognitiveContextCapsuleV1>; readonly readSet: ReadSet; readonly request: ContextPrepareV1 }
const json = canonicalJsonV1;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
function text(value: unknown): string { if (typeof value !== "string") throw new Error("Invalid context text"); return value; }
function integer(value: unknown): number { if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new Error("Invalid context integer"); return value; }
function ref(row: Row): ContentRefV2 { return { contentId: text(row.content_id), contentVersion: integer(row.content_version) }; }
function taskScope(workspaceId: string, taskId: string): ScopeV2 { return { kind: "task", workspaceId, taskId }; }
function exact(value: unknown, keys: readonly string[]): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error("Invalid context record");
  const fields = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(fields).length !== keys.length || keys.some(key => !fields[key] || !("value" in fields[key]!) || !fields[key]!.enumerable || fields[key]!.value === undefined)) throw new Error("Invalid context fields");
}
export class ContextStoreEngineV1 implements ContextPersistenceV1 {
  readonly #host: ContextStoreHostV1;
  readonly #taskBoundary: TaskPersistenceBoundaryV1 | undefined;
  readonly #boundary: ContextPersistenceBoundaryV1 | undefined;
  constructor(host: ContextStoreHostV1, taskBoundary?: TaskPersistenceBoundaryV1, boundary?: ContextPersistenceBoundaryV1) {
    this.#host = host; this.#taskBoundary = taskBoundary; this.#boundary = boundary;
  }
  #row(sql: string, ...values: (string | number)[]): Row | undefined { return this.#host.db.prepare(sql).get(...values) as Row | undefined; }
  #rows(sql: string, ...values: (string | number)[]): Row[] { return this.#host.db.prepare(sql).all(...values) as Row[]; }
  #configured(): ContextPersistenceBoundaryV1 { if (!this.#boundary || !this.#taskBoundary) this.#host.fail("unsupported"); return this.#boundary; }
  #view(context: TaskStoreContextV1, taskId: string, query: string, requiredClaims: readonly ClaimVersionRefV2[]): ReadSet {
    this.#configured(); exact(context, ["principalId", "workspaceId", "daemonInstanceId", "ownerEpoch"]);
    for (const field of ["principalId", "workspaceId", "daemonInstanceId"]) assertIdentifierV2(context[field]); assertRevisionV2(context.ownerEpoch);
    if (context.daemonInstanceId !== this.#taskBoundary!.daemonInstanceId) this.#host.fail("revision_conflict");
    const task = this.#host.tasks.getTask(context.workspaceId, taskId).value;
    if (!task) this.#host.fail("unavailable");
    const session = this.#host.tasks.getSession(context.workspaceId, task.sessionId).value;
    const owner = this.#row("SELECT * FROM session_v1 WHERE workspace_id=? AND id=?", context.workspaceId, task.sessionId);
    if (!session || !owner) this.#host.fail("unavailable");
    if (owner.owner_instance_id !== context.daemonInstanceId || owner.owner_epoch !== context.ownerEpoch || owner.requires_reauthorization !== 0) this.#host.fail("revision_conflict");
    if (!["READY", "RUNNING"].includes(task.state)) this.#host.fail("conflict");
    const workingState = this.#host.tasks.readWorkingState(context.workspaceId, taskId).value;
    if (!workingState || workingState.privacy !== "model-allowed") this.#host.fail("unavailable");
    const inTask = (candidate: ScopeV2) => candidate.kind !== "global" && candidate.workspaceId === task.workspaceId
      && (candidate.kind !== "task" || candidate.taskId === task.id) && (candidate.kind !== "session" || candidate.sessionId === task.sessionId);
    if (!inTask(workingState.scope) || workingState.evidence.some(source => !inTask(source.scope) || source.privacy !== "model-allowed")) this.#host.fail("unavailable");
    const snapshot = this.#row("SELECT * FROM task_snapshot_v1 WHERE task_id=? AND revision=?", taskId, task.revision)!;
    if (snapshot.owner_epoch !== context.ownerEpoch) this.#host.fail("revision_conflict");
    const dependencies = [ref(snapshot), ref(owner), ...this.#host.evidenceContents(workingState)];
    for (const [content, scope] of [[ref(snapshot), taskScope(context.workspaceId, taskId)], [ref(owner), { kind: "session", workspaceId: context.workspaceId, sessionId: task.sessionId }]] as const) {
      if (this.#host.content(content, scope, true).privacy !== "model-allowed") this.#host.fail("unavailable");
    }
    const materials = this.#host.materials(context, task, query, requiredClaims);
    for (const material of materials) dependencies.push(material.content, ...material.sources);
    const scopes: ScopeV2[] = [{ kind: "global" }, { kind: "workspace", workspaceId: context.workspaceId }, taskScope(context.workspaceId, taskId), { kind: "session", workspaceId: context.workspaceId, sessionId: task.sessionId }, ...materials.flatMap(item => [item.claim.scope, ...item.claim.evidence.map(source => source.scope)]), ...workingState.evidence.map(source => source.scope)];
    const uniqueScopes = [...new Map(scopes.map(scope => [scopeKeyV2(scope), scope])).values()].sort((a,b) => scopeKeyV2(a).localeCompare(scopeKeyV2(b), "en"));
    const fences = uniqueScopes.map(scope => this.#host.currentFence(scope));
    const uniqueDependencies = [...new Map(dependencies.map(item => [json(item), item])).values()].sort((a,b) => json(a).localeCompare(json(b), "en"));
    return clone({ task, workingState, session, owner: context, query, requiredClaims, materials, fences, dependencies: uniqueDependencies });
  }
  #body(row: Row, available = true): CapsuleBody | undefined {
    const bytes = this.#host.content(ref(row), taskScope(text(row.workspace_id), text(row.task_id)), available).bytes;
    if (!bytes) return undefined;
    const value: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    exact(value, ["schemaVersion", "capsule", "readSet", "request"]); if (value.schemaVersion !== 1) throw new Error("Unknown Context body");
    exact(value.readSet, ["task", "workingState", "session", "owner", "query", "requiredClaims", "materials", "fences", "dependencies"]);
    exact(value.request, ["id", "taskId", "expectedRevision", "query", "requiredClaims"]);
    return { capsule: parseCognitiveContextCapsuleV1(value.capsule), readSet: value.readSet as unknown as ReadSet, request: value.request as unknown as ContextPrepareV1 };
  }
  #current(context: TaskStoreContextV1, row: Row): CapsuleBody {
    const body = this.#body(row)!;
    if (json(context) !== json(body.readSet.owner)) this.#host.fail("revision_conflict");
    const current = this.#view(context, body.capsule.taskId, body.readSet.query, body.readSet.requiredClaims);
    if (json(current) !== json(body.readSet)) this.#host.fail("revision_conflict");
    return body;
  }
  prepare(context: TaskStoreContextV1, input: ContextPrepareV1): ContextSnapshotV1 {
    exact(input, ["id", "taskId", "expectedRevision", "query", "requiredClaims"]);
    assertIdentifierV2(input.id); assertIdentifierV2(input.taskId); assertRevisionV2(input.expectedRevision);
    if (typeof input.query !== "string" || !input.query.trim() || input.query.length > 256 || !Array.isArray(input.requiredClaims) || input.requiredClaims.length > 100) this.#host.fail("validation");
    return this.#host.transaction(true, () => {
      this.#host.registerScope({ kind: "global" }); this.#host.registerScope({ kind: "workspace", workspaceId: context.workspaceId });
      const prior = this.#row("SELECT * FROM context_capsule_v1 WHERE id=?", input.id);
      if (prior) {
        if (prior.workspace_id !== context.workspaceId || prior.task_id !== input.taskId) this.#host.fail("conflict");
        const body = this.#current(context, prior); if (json(body.request) !== json(input)) this.#host.fail("conflict");
        return { ...this.#read(prior), runtimeInput: { ...this.#read(prior).runtimeInput, replay: true } };
      }
      const view = this.#view(context, input.taskId, input.query, input.requiredClaims), task = view.task, attempt = task.attempts.at(-1)!;
      if (task.revision !== input.expectedRevision) this.#host.fail("revision_conflict");
      if (task.state !== "READY") this.#host.fail("conflict");
      const boundary = this.#configured();
      const result = boundary.compile(clone({ id: input.id, task, workingState: view.workingState, claims: view.materials.map(item => item.claim), requiredClaims: input.requiredClaims, compiledAt: this.#host.now(), modelProfile: view.session.contract.modelProfile }));
      if (!result.ok) this.#host.fail(result.reason === "required_unavailable" ? "unavailable" : "budget_exceeded");
      const capsule = parseCognitiveContextCapsuleV1(result.capsule);
      if (capsule.id !== input.id || capsule.workspaceId !== context.workspaceId || capsule.taskId !== task.id || capsule.sessionId !== task.sessionId
        || capsule.taskRevision !== task.revision || capsule.attemptId !== attempt.id || capsule.intentRevision !== task.intent.revision
        || capsule.workingState.id !== view.workingState.id || capsule.workingState.revision !== view.workingState.revision || capsule.compiledAt !== this.#host.now()
        || json(capsule.modelProfile) !== json(view.session.contract.modelProfile) || json(capsule.budget) !== json(boundary.budget) || json(capsule.counter) !== json(boundary.counter)) this.#host.fail("validation");
      for (const item of [...capsule.report.selected, ...capsule.report.excluded]) if (!view.materials.some(material => material.claim.id === item.ref.id && material.claim.revision === item.ref.revision && material.claim.version === item.ref.version)) this.#host.fail("validation");
      const scope = taskScope(context.workspaceId, task.id), content = this.#host.writeBody(scope, clone({ schemaVersion: 1, capsule, readSet: view, request: input }), view.dependencies.map(item => ({ ...item })), this.#taskBoundary!);
      this.#host.db.prepare("INSERT INTO context_capsule_v1(id,workspace_id,task_id,attempt_id,task_revision,intent_revision,owner_epoch,runtime_input_id,scope_key,content_id,content_version,compiled_at) VALUES(?,?,?,?,?,?,?,NULL,?,?,?,?)")
        .run(input.id, context.workspaceId, task.id, attempt.id, task.revision, task.intent.revision, context.ownerEpoch, scopeKeyV2(scope), content.contentId, content.contentVersion, capsule.compiledAt);
      const runtimeInput = this.#host.tasks.recordCompiledRuntimeInput(context, { commandId: `context-input:${input.id}`, idempotencyKey: `context-input:${input.id}`, taskId: task.id,
        expectedRevision: task.revision, attemptId: attempt.id, intentRevision: task.intent.revision, text: capsule.rendering.fullText }, content);
      this.#host.db.prepare("UPDATE context_capsule_v1 SET runtime_input_id=? WHERE id=? AND runtime_input_id IS NULL").run(runtimeInput.snapshot.id, input.id);
      return clone({ capsule, contentRef: content, runtimeInput });
    });
  }
  #read(row: Row): ContextSnapshotV1 {
    const body = this.#body(row)!;
    const input = this.#row("SELECT i.* FROM task_input_v1 i WHERE id=?", text(row.runtime_input_id))!;
    const bytes = this.#host.content(ref(input), taskScope(text(row.workspace_id), text(row.task_id)), true).bytes!;
    const record = JSON.parse(new TextDecoder().decode(bytes)) as Omit<TaskInputCommitResultV1, "contentRef" | "replay" | "commitCursor"> & { input: TaskInputCommitResultV1["snapshot"] };
    const receipt = this.#row("SELECT commit_cursor FROM task_receipt_v1 WHERE command_id=? AND workspace_id=?", `context-input:${text(row.id)}`, text(row.workspace_id))!;
    return clone({ capsule: body.capsule, contentRef: ref(row), runtimeInput: { snapshot: record.input, receipt: record.receipt, commitCursor: integer(receipt.commit_cursor), replay: false, contentRef: ref(input) } });
  }
  read(workspaceId: string, taskId: string, id: string): ContextSnapshotV1 {
    for (const value of [workspaceId, taskId, id]) assertIdentifierV2(value);
    return this.#host.transaction(false, () => { const row = this.#row("SELECT * FROM context_capsule_v1 WHERE workspace_id=? AND task_id=? AND id=?", workspaceId, taskId, id); if (!row) this.#host.fail("unavailable"); return this.#read(row); });
  }
  assertCurrent(context: TaskStoreContextV1, id: string): void {
    assertIdentifierV2(id); this.#host.transaction(false, () => { const row = this.#row("SELECT * FROM context_capsule_v1 WHERE workspace_id=? AND id=?", context.workspaceId, id); if (!row) this.#host.fail("unavailable"); this.#current(context, row); });
  }
  /** Older strict engines can omit Context tables; latest owner always has fixed schema5. */
  validateRows(): void {
    if (!this.#row("SELECT 1 FROM sqlite_schema WHERE type='table' AND name='context_capsule_v1'")) return;
    try {
      for (const row of this.#rows("SELECT * FROM context_capsule_v1")) {
        for (const field of ["id", "workspace_id", "task_id", "attempt_id"]) assertIdentifierV2(row[field]);
        for (const field of ["task_revision", "intent_revision", "owner_epoch", "content_version"]) assertRevisionV2(row[field]);
        const scope = taskScope(text(row.workspace_id), text(row.task_id));
        const task = this.#row("SELECT * FROM task_v1 WHERE id=? AND workspace_id=?", text(row.task_id), text(row.workspace_id));
        const snapshot = this.#row("SELECT * FROM task_snapshot_v1 WHERE task_id=? AND revision=?", text(row.task_id), integer(row.task_revision));
        const input = this.#row("SELECT * FROM task_input_v1 WHERE id=?", text(row.runtime_input_id));
        if (!task || !snapshot || !input || row.scope_key !== scopeKeyV2(scope) || snapshot.attempt_id !== row.attempt_id || snapshot.intent_revision !== row.intent_revision
          || snapshot.owner_epoch !== row.owner_epoch || input.task_id !== row.task_id || input.attempt_id !== row.attempt_id || input.task_revision !== row.task_revision || input.intent_revision !== row.intent_revision || input.owner_epoch !== row.owner_epoch || input.kind !== "runtime_input") throw new Error("Context projection mismatch");
        const body = this.#body(row, false); if (!body) continue;
        const { capsule, readSet, request } = body;
        if (capsule.id !== row.id || capsule.workspaceId !== row.workspace_id || capsule.taskId !== row.task_id || capsule.sessionId !== task.session_id || capsule.attemptId !== row.attempt_id || capsule.taskRevision !== row.task_revision || capsule.intentRevision !== row.intent_revision || capsule.compiledAt !== row.compiled_at
          || readSet.task.id !== row.task_id || readSet.task.revision !== row.task_revision || readSet.task.attempts.at(-1)?.id !== row.attempt_id || readSet.session.id !== task.session_id || readSet.owner.workspaceId !== row.workspace_id || readSet.owner.ownerEpoch !== row.owner_epoch
          || capsule.workingState.id !== readSet.workingState.id || capsule.workingState.revision !== readSet.workingState.revision || request.id !== row.id || request.taskId !== row.task_id || request.expectedRevision !== row.task_revision || request.query !== readSet.query) throw new Error("Context body projection mismatch");
        const edges = this.#rows("SELECT source_id,source_version FROM task_content_dependency_v1 WHERE target_id=? AND target_version=?", text(row.content_id), integer(row.content_version)).map(edge => ({ contentId: text(edge.source_id), contentVersion: integer(edge.source_version) }));
        for (const dependency of readSet.dependencies) assertContentRefV2(dependency);
        const sorted = (refs: readonly ContentRefV2[]) => refs.map(json).sort();
        if (json(sorted(edges)) !== json(sorted(readSet.dependencies)) || !readSet.dependencies.some(item => json(item) === json(ref(snapshot)))) throw new Error("Context dependency mismatch");
        const inputBytes = this.#host.content(ref(input), scope, false).bytes;
        if (inputBytes) { const value = JSON.parse(new TextDecoder().decode(inputBytes)) as { input: { text: string } }; if (value.input.text !== capsule.rendering.fullText) throw new Error("Context Runtime input mismatch"); }
      }
    } catch (error) {
      if (["ERR_SQLITE_ERROR", "sqlite"].includes((error as { code?: string })?.code ?? "")) throw error;
      this.#host.fail("corruption");
    }
  }
}
