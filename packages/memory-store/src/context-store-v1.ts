/** Fixed Context composition: one verified SQLite view, protected body and Runtime input. */
import type { SQLOutputValue } from "node:sqlite";
import { assertIdentifierV2, assertRevisionV2, assertIsoTimestampV2, assertScopeV2, assertWorkingStateV2, assertClaimVersionRefV2, assertContentRefV2, scopeKeyV2,
  type ContentRefV2, type ScopeV2, type MemoryClaimV2, type Task, type WorkingStateV2, type ClaimVersionRefV2, type CognitiveDecisionInputV1 } from "../../domain/src/index.ts";
import { canonicalJsonV1, parseCognitiveContextCapsuleV1, parseCognitiveDecisionV1, parseCognitiveDecisionInputV1, parseSessionTaskV1, parseSessionV1, parseObservationV2, cognitiveDecisionRequestContextV1, type SessionV1, type CognitiveDecisionModelRequestV1, type ExecutionSpecV1, type RuntimeBindingV1, type JsonValue } from "../../protocol/src/index.ts";
import type { CognitionFenceV2 } from "./cognitive-store-v2.ts";
import type { TaskStoreHostV1, TaskStoreEngineV1 } from "./task-store-v1.ts";
import type { TaskPersistenceBoundaryV1, TaskStoreContextV1, TaskInputCommitResultV1 } from "./task-store-v1-types.ts";
import type { ContextPersistenceBoundaryV1, ContextPrepareV1, ContextSnapshotV1, ContextPersistenceV1, CognitiveBoundaryReadV1, CognitiveCallReservationV1, CognitiveDecisionRecordV1 } from "./context-store-v1-types.ts";

type Row = Record<string, SQLOutputValue>;
interface Material { readonly claim: MemoryClaimV2; readonly content: ContentRefV2; readonly sources: readonly ContentRefV2[] }
export interface ContextStoreHostV1 extends TaskStoreHostV1 {
  readonly tasks: TaskStoreEngineV1;
  currentFence(scope: ScopeV2): CognitionFenceV2;
  materials(context: TaskStoreContextV1, task: Task, query: string, required: readonly ClaimVersionRefV2[]): readonly Material[];
  evidenceContents(working: WorkingStateV2): readonly ContentRefV2[];
  validateMaterial(material: Material): void;
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
    if (session.contract.compilerProfile.id !== "cognitive-context-v1" || session.contract.compilerProfile.revision !== 1) this.#host.fail("unsupported");
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
    const value = this.#recordBody<unknown>(row, text(row.workspace_id), text(row.task_id), available);
    if (value === undefined) return undefined;
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
    for (const wanted of input.requiredClaims) assertClaimVersionRefV2(wanted);
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
      if (!result.ok) this.#host.fail(result.reason === "required_unavailable" ? "unavailable" : result.reason === "invalid_input" ? "validation" : "budget_exceeded");
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
  #runtimeCapsule(spec: ExecutionSpecV1): Row | undefined {
    if (!this.#row("SELECT 1 FROM sqlite_schema WHERE type='table' AND name='context_capsule_v1'")) return undefined;
    return this.#row(`SELECT c.* FROM context_capsule_v1 c JOIN task_input_v1 i ON i.id=c.runtime_input_id
      WHERE i.content_id=? AND i.content_version=?`, spec.requestSnapshotRef.contentId, spec.requestSnapshotRef.contentVersion);
  }
  #runtimeCurrent(context: TaskStoreContextV1, row: Row, spec: ExecutionSpecV1, binding: RuntimeBindingV1): CapsuleBody {
    const body = this.#body(row)!;
    if (json(context) !== json(body.readSet.owner) || spec.prompt !== body.capsule.rendering.fullText || spec.workspaceId !== row.workspace_id
      || spec.sessionId !== body.capsule.sessionId || spec.fence.sourceTask?.taskId !== row.task_id || spec.fence.sourceTask.attemptId !== row.attempt_id
      || spec.fence.sourceTask.intentRevision !== row.intent_revision || binding.executionUnitId !== spec.executionUnitId || binding.leaseEpoch !== context.ownerEpoch) this.#host.fail("revision_conflict");
    const proposal = this.#row(`SELECT d.* FROM cognitive_decision_v1 d JOIN cognitive_boundary_v1 b ON b.id=d.boundary_id
      WHERE b.capsule_id=? AND b.task_revision=? AND b.owner_epoch=? AND b.status='decided' AND d.content_id=b.decision_content_id AND d.content_version=b.decision_content_version`, text(row.id), integer(row.task_revision), context.ownerEpoch);
    if (!proposal || proposal.action !== "execute") this.#host.fail("conflict");
    this.#recordBody(proposal, context.workspaceId, text(row.task_id));
    const current = this.#view(context, text(row.task_id), body.readSet.query, body.readSet.requiredClaims);
    if (current.task.state === "READY") { if (json(current) !== json(body.readSet)) this.#host.fail("revision_conflict"); return body; }
    const oldTask = body.readSet.task, oldWorking = body.readSet.workingState, task = current.task;
    const snapshot = this.#row("SELECT * FROM task_snapshot_v1 WHERE task_id=? AND revision=?", task.id, task.revision)!;
    const start = this.#recordBody<{ command: { expectedRevision: number; payload: { kind: string; taskId: string; event: string; evidenceRefs?: readonly { id: string; revision: number }[] } } }>(snapshot, context.workspaceId, task.id)!;
    const receipt = start.command.payload.evidenceRefs;
    const execution = this.#row("SELECT * FROM task_execution_v1 WHERE binding_id=? AND task_id=? AND attempt_id=?", binding.bindingId, task.id, body.capsule.attemptId);
    const ready = receipt?.length === 1 ? this.#row("SELECT * FROM task_execution_snapshot_v1 WHERE binding_id=? AND revision=?", binding.bindingId, receipt[0]!.revision) : undefined;
    if (!execution || execution.task_revision !== oldTask.revision || task.state !== "RUNNING" || task.revision !== oldTask.revision + 1
      || start.command.expectedRevision !== oldTask.revision || start.command.payload.kind !== "task.runtime" || start.command.payload.event !== "start" || start.command.payload.taskId !== task.id
      || receipt?.length !== 1 || receipt[0]!.id !== binding.bindingId || !ready || ready.state !== "READY" || ready.dispatched !== 0 || ready.closed !== 0
      || !this.#row("SELECT 1 FROM task_content_dependency_v1 WHERE source_id=? AND source_version=? AND target_id=? AND target_version=?", text(ready.content_id), integer(ready.content_version), text(snapshot.content_id), integer(snapshot.content_version))) this.#host.fail("revision_conflict");
    const expectedTask = { ...oldTask, revision: task.revision, state: "RUNNING", updatedAt: task.updatedAt,
      attempts: [...oldTask.attempts.slice(0, -1), { ...oldTask.attempts.at(-1)!, state: "RUNNING", updatedAt: task.updatedAt }] };
    const expectedWorking = { ...oldWorking, revision: task.revision, updatedAt: task.updatedAt, currentStep: "RUNNING", task: { ...oldWorking.task, revision: task.revision } };
    if (json(task) !== json(expectedTask) || json(current.workingState) !== json(expectedWorking)) this.#host.fail("revision_conflict");
    const oldSnapshot = this.#row("SELECT * FROM task_snapshot_v1 WHERE task_id=? AND revision=?", task.id, oldTask.revision)!;
    const dependencies = current.dependencies.map(source => json(source) === json(ref(snapshot)) ? ref(oldSnapshot) : source).sort((a,b) => json(a).localeCompare(json(b), "en"));
    if (json({ ...current, task: oldTask, workingState: oldWorking, dependencies }) !== json(body.readSet)) this.#host.fail("revision_conflict");
    return body;
  }
  #runtimeRequestBudget(capsule: CapsuleBody["capsule"], prompt: string, request: Readonly<{ context: JsonValue; maxTokens: number }>): void {
    const context = request.context;
    const object = (value: JsonValue): Readonly<Record<string, JsonValue>> | undefined => value && typeof value === "object" && !Array.isArray(value) ? value as Readonly<Record<string, JsonValue>> : undefined;
    const messages = object(context)?.messages;
    if (!Array.isArray(messages)) this.#host.fail("validation");
    const hasInput = messages.some((message: JsonValue) => {
      const value = object(message); if (!value || value.role !== "user") return false;
      return value.content === prompt || Array.isArray(value.content) && value.content.some((part: JsonValue) => object(part)?.type === "text" && object(part)?.text === prompt);
    });
    if (!hasInput) this.#host.fail("conflict");
    const count = this.#configured().countActualRequest(context);
    if (!Number.isSafeInteger(count) || count < 0) this.#host.fail("validation");
    if (request.maxTokens > capsule.budget.reservedOutput || count > capsule.budget.contextLimit - capsule.budget.reservedOutput - capsule.budget.mandatoryProtocolOverhead) this.#host.fail("budget_exceeded");
  }
  /** Existing Task execution fences call this synchronously for dispatch, receive and final commit. */
  validateRuntimeContext(context: TaskStoreContextV1, spec: ExecutionSpecV1, binding: RuntimeBindingV1, request?: Readonly<{ context: JsonValue; maxTokens: number }>): void {
    const row = this.#runtimeCapsule(spec); if (!row) return;
    const body = this.#runtimeCurrent(context, row, spec, binding);
    if (request) this.#runtimeRequestBudget(body.capsule, spec.prompt, request);
  }
  linkRuntimeContext(context: TaskStoreContextV1, spec: ExecutionSpecV1, binding: RuntimeBindingV1, requestId: string): void {
    const row = this.#runtimeCapsule(spec); if (!row) return;
    this.#host.db.prepare("INSERT INTO context_model_request_v1(binding_id,request_id,capsule_id) VALUES(?,?,?)").run(binding.bindingId, requestId, row.id!);
  }
  #runtimeMaterials(context: TaskStoreContextV1, capsuleId: string, bindingId: string): readonly Material[] {
    const row = this.#capsule(context, capsuleId), execution = this.#row(`SELECT s.* FROM task_execution_v1 e JOIN task_execution_snapshot_v1 s
      ON s.binding_id=e.binding_id AND s.revision=e.current_revision WHERE e.binding_id=? AND e.workspace_id=? AND e.task_id=?`, bindingId, context.workspaceId, text(row.task_id));
    if (!execution || execution.closed !== 0 || execution.dispatched !== 1 || !["BUSY", "DRAINING"].includes(text(execution.state))) this.#host.fail("conflict");
    const runtime = this.#recordBody<{ spec: ExecutionSpecV1; binding: RuntimeBindingV1 }>(execution, context.workspaceId, text(row.task_id))!;
    if (this.#runtimeCapsule(runtime.spec)?.id !== row.id) this.#host.fail("conflict");
    const body = this.#runtimeCurrent(context, row, runtime.spec, runtime.binding);
    return body.readSet.materials.filter(material => body.capsule.report.selected.some(item => item.ref.id === material.claim.id && item.ref.version === material.claim.version && item.ref.revision === material.claim.revision));
  }
  searchRuntimeMemory(context: TaskStoreContextV1, input: Readonly<{ capsuleId: string; bindingId: string; query: string }>): readonly MemoryClaimV2[] {
    exact(input, ["capsuleId", "bindingId", "query"]); assertIdentifierV2(input.capsuleId); assertIdentifierV2(input.bindingId);
    if (typeof input.query !== "string" || !input.query.trim() || input.query.length > 256) this.#host.fail("validation");
    return this.#host.transaction(false, () => clone(this.#runtimeMaterials(context, input.capsuleId, input.bindingId)
      .filter(material => material.claim.statement.toLocaleLowerCase("en").includes(input.query.toLocaleLowerCase("en"))).map(material => material.claim)));
  }
  inspectRuntimeMemory(context: TaskStoreContextV1, input: Readonly<{ capsuleId: string; bindingId: string; claim: ClaimVersionRefV2 }>): MemoryClaimV2 {
    exact(input, ["capsuleId", "bindingId", "claim"]); assertIdentifierV2(input.capsuleId); assertIdentifierV2(input.bindingId); assertClaimVersionRefV2(input.claim);
    return this.#host.transaction(false, () => {
      const material = this.#runtimeMaterials(context, input.capsuleId, input.bindingId).find(item => item.claim.id === input.claim.claimId && item.claim.version === input.claim.version);
      if (!material) this.#host.fail("unavailable"); return clone(material.claim);
    });
  }
  #capsule(context: TaskStoreContextV1, id: string): Row {
    const row = this.#row("SELECT * FROM context_capsule_v1 WHERE id=? AND workspace_id=?", id, context.workspaceId);
    if (!row) this.#host.fail("unavailable"); return row;
  }
  #boundaryRow(context: TaskStoreContextV1, id: string): Row {
    const row = this.#row("SELECT * FROM cognitive_boundary_v1 WHERE id=? AND workspace_id=?", id, context.workspaceId);
    if (!row) this.#host.fail("unavailable");
    const capsule = this.#body(this.#capsule(context, text(row.capsule_id)))!;
    if (json(capsule.readSet.owner) !== json(context)) this.#host.fail("revision_conflict");
    return row;
  }
  #recordBody<T>(row: Row, workspaceId: string, taskId: string, available = true): T | undefined {
    const metadata = this.#row("SELECT purpose,scope_key,content_version,state FROM content_object WHERE content_id=? AND content_version=?", text(row.content_id), integer(row.content_version));
    if (!metadata || metadata.purpose !== "cognition" || metadata.content_version !== 1 || metadata.state === "staged" || metadata.scope_key !== scopeKeyV2(taskScope(workspaceId, taskId))) throw new Error("Invalid context content role");
    const bytes = this.#host.content(ref(row), taskScope(workspaceId, taskId), available).bytes;
    if (!bytes) return undefined;
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as T;
  }
  #boundaryRead(row: Row): CognitiveBoundaryReadV1 {
    const decisions = this.#rows("SELECT * FROM cognitive_decision_v1 WHERE boundary_id=? ORDER BY revision", text(row.id))
      .map(record => this.#recordBody<CognitiveDecisionRecordV1>(record, text(row.workspace_id), text(row.task_id))!);
    return clone({ id: text(row.id), taskId: text(row.task_id), attemptId: text(row.attempt_id), taskRevision: integer(row.task_revision), intentRevision: integer(row.intent_revision),
      capsuleId: text(row.capsule_id), status: row.status as CognitiveBoundaryReadV1["status"], callCount: integer(row.call_count), decisions });
  }
  openBoundary(context: TaskStoreContextV1, input: Readonly<{ id: string; capsuleId: string }>): CognitiveBoundaryReadV1 {
    exact(input, ["id", "capsuleId"]); assertIdentifierV2(input.id); assertIdentifierV2(input.capsuleId);
    return this.#host.transaction(true, () => {
      const capsule = this.#capsule(context, input.capsuleId);
      const prior = this.#row("SELECT * FROM cognitive_boundary_v1 WHERE task_id=? AND attempt_id=? AND task_revision=?", text(capsule.task_id), text(capsule.attempt_id), integer(capsule.task_revision));
      if (prior?.status === "decided") {
        const task = this.#host.tasks.getTask(context.workspaceId, text(capsule.task_id)).value;
        const pending = this.#row("SELECT action FROM cognitive_decision_v1 WHERE boundary_id=? ORDER BY revision DESC LIMIT 1", text(prior.id));
        if (task?.state === "WAITING_INPUT" && task.revision === integer(capsule.task_revision) + 1 && task.attempts.at(-1)!.id === capsule.attempt_id
          && pending && ["clarify", "wait"].includes(text(pending.action))) return this.#boundaryRead(this.#boundaryRow(context, text(prior.id)));
      }
      this.#current(context, capsule);
      if (prior) return this.#boundaryRead(this.#boundaryRow(context, text(prior.id)));
      this.#host.db.prepare("INSERT INTO cognitive_boundary_v1(id,workspace_id,task_id,attempt_id,task_revision,intent_revision,owner_epoch,capsule_id,status,call_count,decision_content_id,decision_content_version) VALUES(?,?,?,?,?,?,?,?,'open',0,NULL,NULL)")
        .run(input.id, context.workspaceId, capsule.task_id!, capsule.attempt_id!, capsule.task_revision!, capsule.intent_revision!, context.ownerEpoch, input.capsuleId);
      return this.#boundaryRead(this.#boundaryRow(context, input.id));
    });
  }
  readBoundary(workspaceId: string, taskId: string, id: string): CognitiveBoundaryReadV1 {
    for (const value of [workspaceId, taskId, id]) assertIdentifierV2(value);
    return this.#host.transaction(false, () => { const row = this.#row("SELECT * FROM cognitive_boundary_v1 WHERE id=? AND workspace_id=? AND task_id=?", id, workspaceId, taskId); if (!row) this.#host.fail("unavailable"); return this.#boundaryRead(row); });
  }
  #requestBudget(capsule: CapsuleBody["capsule"], request: CognitiveDecisionModelRequestV1): void {
    assertRevisionV2(request.maxTokens); const count = this.#configured().countActualRequest(request.context); assertRevisionV2(count, true);
    if (request.maxTokens > capsule.budget.reservedOutput || count > capsule.budget.contextLimit - capsule.budget.reservedOutput - capsule.budget.mandatoryProtocolOverhead) this.#host.fail("budget_exceeded");
  }
  #call(row: Row, boundary: Row): CognitiveCallReservationV1 {
    const inputRow = { content_id: row.input_content_id!, content_version: row.input_content_version! };
    const record = this.#recordBody<{ schemaVersion: 1; input: CognitiveDecisionInputV1; request: CognitiveDecisionModelRequestV1; createdAt: string }>(inputRow, text(boundary.workspace_id), text(boundary.task_id))!;
    return clone({ ...record.request, input: record.input, contentRef: ref(inputRow) });
  }
  reserveDecisionCall(context: TaskStoreContextV1, input: Parameters<ContextPersistenceV1["reserveDecisionCall"]>[1]): CognitiveCallReservationV1 {
    exact(input, ["boundaryId", "capsuleId", "requestId", "purpose"]);
    for (const value of [input.boundaryId, input.capsuleId, input.requestId]) assertIdentifierV2(value);
    if (!["initial", "repair", "retrieval"].includes(input.purpose)) this.#host.fail("validation");
    return this.#host.transaction(true, () => {
      const boundary = this.#boundaryRow(context, input.boundaryId), capsuleRow = this.#capsule(context, input.capsuleId), { capsule, readSet } = this.#current(context, capsuleRow);
      if (capsuleRow.task_id !== boundary.task_id || capsuleRow.attempt_id !== boundary.attempt_id || capsuleRow.task_revision !== boundary.task_revision || capsuleRow.intent_revision !== boundary.intent_revision) this.#host.fail("revision_conflict");
      const replay = this.#row("SELECT * FROM cognitive_call_v1 WHERE request_id=?", input.requestId);
      if (replay) { if (replay.boundary_id !== input.boundaryId || replay.capsule_id !== input.capsuleId) this.#host.fail("conflict"); const call = this.#call(replay, boundary); if (call.input.purpose !== input.purpose) this.#host.fail("conflict"); return call; }
      if (boundary.status !== "open" || integer(boundary.call_count) >= 2) this.#host.fail("conflict");
      const ordinal = (integer(boundary.call_count) + 1) as 1 | 2;
      if ((ordinal === 1) !== (input.purpose === "initial")) this.#host.fail("conflict");
      if (ordinal === 2) {
        const previous = this.#row("SELECT * FROM cognitive_call_v1 WHERE boundary_id=? AND ordinal=1", input.boundaryId);
        if (!previous?.received_content_id) this.#host.fail("conflict");
        if (input.purpose === "retrieval") {
          const first = this.#rows("SELECT * FROM cognitive_decision_v1 WHERE boundary_id=? ORDER BY revision", input.boundaryId).at(-1);
          if (!first || first.action !== "retrieve" || first.call_count !== 1) this.#host.fail("conflict");
        }
      }
      const decisionInput: CognitiveDecisionInputV1 = clone({ schemaVersion: 1, boundaryId: input.boundaryId, ordinal, capsuleId: input.capsuleId,
        task: { id: capsule.taskId, revision: capsule.taskRevision, attemptId: capsule.attemptId, intentRevision: capsule.intentRevision }, workingState: capsule.workingState,
        context: capsule.rendering.fullText, claimRefs: capsule.report.selected.map(item => item.ref), capabilities: ["respond", "clarify", "retrieve", "execute", "wait", "stop"],
        unknown: readSet.workingState.unknown, remainingCalls: ordinal === 1 ? 1 : 0, purpose: input.purpose, preparedAt: this.#host.now() });
      const request: CognitiveDecisionModelRequestV1 = { requestId: input.requestId, boundaryId: input.boundaryId, capsuleId: input.capsuleId, ordinal,
        context: cognitiveDecisionRequestContextV1(decisionInput), maxTokens: capsule.budget.reservedOutput };
      this.#requestBudget(capsule, request);
      const content = this.#host.writeBody(taskScope(context.workspaceId, capsule.taskId), clone({ schemaVersion: 1, input: decisionInput, request, createdAt: this.#host.now() }), [{ ...ref(capsuleRow) }], this.#taskBoundary!);
      this.#host.db.prepare("INSERT INTO cognitive_call_v1(boundary_id,ordinal,capsule_id,request_id,input_content_id,input_content_version,received_content_id,received_content_version) VALUES(?,?,?,?,?,?,NULL,NULL)")
        .run(input.boundaryId, ordinal, input.capsuleId, input.requestId, content.contentId, content.contentVersion);
      if (this.#host.db.prepare("UPDATE cognitive_boundary_v1 SET call_count=?,capsule_id=? WHERE id=? AND status='open' AND call_count=?").run(ordinal, input.capsuleId, input.boundaryId, ordinal - 1).changes !== 1) this.#host.fail("revision_conflict");
      return clone({ ...request, input: decisionInput, contentRef: content });
    });
  }
  recordDecisionRequest(context: TaskStoreContextV1, input: CognitiveDecisionModelRequestV1): void {
    exact(input, ["requestId", "boundaryId", "capsuleId", "ordinal", "context", "maxTokens"]);
    this.#host.transaction(true, () => {
      const boundary = this.#boundaryRow(context, input.boundaryId), capsule = this.#capsule(context, input.capsuleId), body = this.#current(context, capsule);
      const call = this.#row("SELECT * FROM cognitive_call_v1 WHERE boundary_id=? AND ordinal=? AND request_id=?", input.boundaryId, input.ordinal, input.requestId);
      if (!call || call.capsule_id !== input.capsuleId || boundary.status !== "open" || boundary.call_count !== input.ordinal || call.received_content_id !== null) this.#host.fail("conflict");
      const expected = this.#call(call, boundary), { input: _input, contentRef: _ref, ...request } = expected;
      if (json(request) !== json(input)) this.#host.fail("conflict"); this.#requestBudget(body.capsule, input);
      const content = this.#host.writeBody(taskScope(context.workspaceId, body.capsule.taskId), clone({ schemaVersion: 1, request: input, receivedAt: this.#host.now() }), [{ ...expected.contentRef }, { ...ref(capsule) }], this.#taskBoundary!);
      if (this.#host.db.prepare("UPDATE cognitive_call_v1 SET received_content_id=?,received_content_version=? WHERE boundary_id=? AND ordinal=? AND received_content_id IS NULL").run(content.contentId, content.contentVersion, input.boundaryId, input.ordinal).changes !== 1) this.#host.fail("revision_conflict");
    });
  }
  commitDecision(context: TaskStoreContextV1, input: Parameters<ContextPersistenceV1["commitDecision"]>[1]): CognitiveBoundaryReadV1 {
    exact(input, ["boundaryId", "capsuleId", "decision", "origin", "requestId"]);
    const decision = parseCognitiveDecisionV1(input.decision);
    return this.#host.transaction(true, () => {
      const boundary = this.#boundaryRow(context, input.boundaryId), capsuleRow = this.#capsule(context, input.capsuleId), { capsule } = this.#current(context, capsuleRow);
      if (boundary.status !== "open" || boundary.capsule_id !== input.capsuleId) this.#host.fail("conflict");
      const count = integer(boundary.call_count), previous = this.#rows("SELECT * FROM cognitive_decision_v1 WHERE boundary_id=? ORDER BY revision", input.boundaryId).at(-1);
      const call = count ? this.#row("SELECT * FROM cognitive_call_v1 WHERE boundary_id=? AND ordinal=?", input.boundaryId, count) : undefined;
      if (input.origin === "model-proposal") {
        if (!call?.received_content_id || call.capsule_id !== input.capsuleId || input.requestId !== call.request_id || previous?.call_count === count
          || decision.claimRefs.some(wanted => !capsule.report.selected.some(source => json(source.ref) === json(wanted))) || decision.action === "retrieve" && count === 2) this.#host.fail("validation");
      } else if (input.origin !== "coordinator-stop" || input.requestId !== null || decision.action !== "stop" || decision.claimRefs.length) this.#host.fail("validation");
      const revision = (previous ? integer(previous.revision) : 0) + 1; if (revision > 3) this.#host.fail("conflict");
      const record: CognitiveDecisionRecordV1 = { schemaVersion: 1, boundaryId: input.boundaryId, revision, capsuleId: input.capsuleId,
        callCount: count, origin: input.origin, decision, createdAt: this.#host.now(), requestId: input.requestId };
      const dependencies = [ref(capsuleRow), ...(call ? [{ contentId: text(call.input_content_id), contentVersion: integer(call.input_content_version) },
        ...(call.received_content_id ? [{ contentId: text(call.received_content_id), contentVersion: integer(call.received_content_version) }] : [])] : []), ...(previous ? [ref(previous)] : [])];
      const content = this.#host.writeBody(taskScope(context.workspaceId, capsule.taskId), clone(record), dependencies.map(item => ({ ...item })), this.#taskBoundary!);
      this.#host.db.prepare("INSERT INTO cognitive_decision_v1(boundary_id,revision,capsule_id,call_count,origin,action,content_id,content_version,created_at) VALUES(?,?,?,?,?,?,?,?,?)")
        .run(input.boundaryId, revision, input.capsuleId, count, input.origin, decision.action, content.contentId, content.contentVersion, record.createdAt);
      if (decision.action !== "retrieve") {
        if (this.#host.db.prepare("UPDATE cognitive_boundary_v1 SET status=?,decision_content_id=?,decision_content_version=? WHERE id=? AND status='open' AND call_count=?")
          .run(decision.action === "stop" ? "stopped" : "decided", content.contentId, content.contentVersion, input.boundaryId, count).changes !== 1) this.#host.fail("revision_conflict");
      }
      return this.#boundaryRead(this.#boundaryRow(context, input.boundaryId));
    });
  }
  #edges(row: Row, expected: readonly ContentRefV2[]): void {
    const edges = this.#rows("SELECT source_id,source_version FROM task_content_dependency_v1 WHERE target_id=? AND target_version=?", text(row.content_id), integer(row.content_version)).map(edge => ({ contentId: text(edge.source_id), contentVersion: integer(edge.source_version) }));
    const sorted = (refs: readonly ContentRefV2[]) => [...new Set(refs.map(json))].sort();
    if (json(sorted(edges)) !== json(sorted(expected))) throw new Error("Context dependency role mismatch");
  }
  #validateReadSet(row: Row, body: CapsuleBody, snapshot: Row, task: Row): void {
    const view = body.readSet, scope = taskScope(text(row.workspace_id), text(row.task_id));
    parseSessionTaskV1(view.task); assertWorkingStateV2(view.workingState); parseSessionV1(view.session);
    exact(view.owner, ["principalId", "workspaceId", "daemonInstanceId", "ownerEpoch"]);
    assertIdentifierV2(view.owner.principalId); assertIdentifierV2(view.owner.daemonInstanceId); assertRevisionV2(view.owner.ownerEpoch);
    const history = this.#row("SELECT * FROM session_revision_v1 WHERE session_id=? AND revision=?", view.session.id, view.session.revision);
    const session = this.#row("SELECT * FROM session_v1 WHERE id=? AND workspace_id=?", view.session.id, text(row.workspace_id));
    if (!history || !session || history.owner_epoch !== view.owner.ownerEpoch || history.owner_instance_id !== view.owner.daemonInstanceId || history.requires_reauthorization !== 0
      || view.session.ownerEpoch !== view.owner.ownerEpoch || view.task.sessionId !== task.session_id || view.workingState.task.id !== view.task.id || view.workingState.task.revision !== view.task.revision
      || view.workingState.taskAttempt.attemptId !== view.task.attempts.at(-1)!.id || view.workingState.intentRevision !== view.task.intent.revision || json(body.capsule.modelProfile) !== json(view.session.contract.modelProfile)) throw new Error("Context read-set coordinates mismatch");
    const source = this.#recordBody<{ task: Task; workingState: WorkingStateV2 }>(snapshot, text(row.workspace_id), text(row.task_id), false);
    if (source && (json(source.task) !== json(view.task) || json(source.workingState) !== json(view.workingState))) throw new Error("Context Task/WorkingState source mismatch");
    const sessionBytes = this.#host.content(ref(session), { kind: "session", workspaceId: text(row.workspace_id), sessionId: view.session.id }, false).bytes;
    if (sessionBytes) { const sessionBody = JSON.parse(new TextDecoder().decode(sessionBytes)) as { contract: SessionV1["contract"] }; if (json(sessionBody.contract) !== json(view.session.contract)) throw new Error("Context configuration source mismatch"); }
    if (!Array.isArray(view.materials) || view.materials.length > 100 || !Array.isArray(view.dependencies) || !Array.isArray(view.requiredClaims) || !Array.isArray(view.fences)) throw new Error("Context read-set list mismatch");
    for (const wanted of view.requiredClaims) assertClaimVersionRefV2(wanted);
    if (json(view.requiredClaims) !== json(body.request.requiredClaims)) throw new Error("Context required claims mismatch");
    const dependencies = [ref(snapshot), ref(session)];
    for (const material of view.materials) { this.#host.validateMaterial(material); dependencies.push(material.content, ...material.sources); }
    for (const evidence of view.workingState.evidence) {
      const observation = this.#row("SELECT event_json FROM observation_v2 WHERE id=?", evidence.source.id); if (!observation) throw new Error("Context evidence missing");
      const event = parseObservationV2(JSON.parse(text(observation.event_json))); if (event.content.availability !== "available" || event.revision !== evidence.source.revision) throw new Error("Context evidence mismatch"); dependencies.push(event.content.ref);
    }
    this.#edges(row, dependencies);
    const sorted = (refs: readonly ContentRefV2[]) => [...new Set(refs.map(json))].sort();
    if (json(sorted(dependencies)) !== json(sorted(view.dependencies))) throw new Error("Context dependency closure mismatch");
    const scopes: ScopeV2[] = [{ kind: "global" }, { kind: "workspace", workspaceId: text(row.workspace_id) }, scope, { kind: "session", workspaceId: text(row.workspace_id), sessionId: view.session.id }, ...view.materials.flatMap((material: Material) => [material.claim.scope, ...material.claim.evidence.map(evidence => evidence.scope)]), ...view.workingState.evidence.map(evidence => evidence.scope)];
    const expectedScopes = [...new Set(scopes.map(scopeKeyV2))].sort(), actualScopes: string[] = [];
    const installation = this.#row("SELECT installation_id,recovery_epoch FROM store_state WHERE singleton=1")!;
    for (const fence of view.fences) {
      exact(fence, ["installationId", "scope", "cognitionEpoch", "policyEpoch", "recoveryEpoch"]); assertScopeV2(fence.scope);
      assertRevisionV2(fence.cognitionEpoch, true); assertRevisionV2(fence.policyEpoch, true); assertRevisionV2(fence.recoveryEpoch, true);
      const current = this.#row("SELECT * FROM scope_catalog WHERE scope_key=?", scopeKeyV2(fence.scope));
      if (!current || fence.installationId !== installation.installation_id || fence.recoveryEpoch > integer(installation.recovery_epoch) || fence.cognitionEpoch > integer(current.cognition_epoch) || fence.policyEpoch > integer(current.policy_epoch)) throw new Error("Context fence projection mismatch");
      actualScopes.push(scopeKeyV2(fence.scope));
    }
    if (json(actualScopes.sort()) !== json(expectedScopes)) throw new Error("Context scope read-set mismatch");
    for (const selected of body.capsule.report.selected) {
      const material = view.materials.find(item => item.claim.id === selected.ref.id && item.claim.version === selected.ref.version && item.claim.revision === selected.ref.revision);
      if (!material || json(selected.evidence) !== json(material.claim.evidence)) throw new Error("Context selection source mismatch");
    }
  }
  #validateCoordinationRows(): void {
    if (!this.#row("SELECT 1 FROM sqlite_schema WHERE type='table' AND name='cognitive_decision_v1'")) return;
    for (const boundary of this.#rows("SELECT * FROM cognitive_boundary_v1")) {
      for (const field of ["id", "workspace_id", "task_id", "attempt_id", "capsule_id"]) assertIdentifierV2(boundary[field]);
      const capsule = this.#row("SELECT * FROM context_capsule_v1 WHERE id=?", text(boundary.capsule_id));
      if (!capsule || capsule.workspace_id !== boundary.workspace_id || capsule.task_id !== boundary.task_id || capsule.attempt_id !== boundary.attempt_id || capsule.task_revision !== boundary.task_revision || capsule.intent_revision !== boundary.intent_revision || capsule.owner_epoch !== boundary.owner_epoch) throw new Error("Decision boundary projection mismatch");
      const calls = this.#rows("SELECT * FROM cognitive_call_v1 WHERE boundary_id=? ORDER BY ordinal", text(boundary.id));
      if (calls.length !== boundary.call_count || calls.some((call,i) => call.ordinal !== i+1)) throw new Error("Decision call counter mismatch");
      for (const call of calls) {
        const source = this.#row("SELECT * FROM context_capsule_v1 WHERE id=?", text(call.capsule_id));
        if (!source || source.task_id !== boundary.task_id || source.attempt_id !== boundary.attempt_id || source.task_revision !== boundary.task_revision || source.intent_revision !== boundary.intent_revision || source.owner_epoch !== boundary.owner_epoch) throw new Error("Decision call capsule mismatch");
        const inputRow = { content_id: call.input_content_id!, content_version: call.input_content_version! };
        this.#edges(inputRow, [ref(source)]);
        const record = this.#recordBody<{ schemaVersion: 1; input: CognitiveDecisionInputV1; request: CognitiveDecisionModelRequestV1; createdAt: string }>(inputRow, text(boundary.workspace_id), text(boundary.task_id), false);
        if (record) {
          exact(record, ["schemaVersion", "input", "request", "createdAt"]); const input = parseCognitiveDecisionInputV1(record.input); assertIsoTimestampV2(record.createdAt);
          exact(record.request, ["requestId", "boundaryId", "capsuleId", "ordinal", "context", "maxTokens"]);
          const body = this.#body(source, false);
          if (record.schemaVersion !== 1 || record.request.requestId !== call.request_id || record.request.boundaryId !== boundary.id || record.request.capsuleId !== source.id || record.request.ordinal !== call.ordinal
            || input.boundaryId !== boundary.id || input.capsuleId !== source.id || input.ordinal !== call.ordinal || input.task.id !== boundary.task_id || input.task.revision !== boundary.task_revision || input.task.attemptId !== boundary.attempt_id || input.task.intentRevision !== boundary.intent_revision
            || json(record.request.context) !== json(cognitiveDecisionRequestContextV1(input)) || (input.ordinal === 1) !== (input.purpose === "initial") || input.preparedAt !== record.createdAt
            || body && (input.context !== body.capsule.rendering.fullText || json(input.claimRefs) !== json(body.capsule.report.selected.map(item => item.ref)) || json(input.workingState) !== json(body.capsule.workingState) || record.request.maxTokens !== body.capsule.budget.reservedOutput)) throw new Error("Decision call body mismatch");
        }
        if (call.received_content_id !== null) {
          const received = { content_id: call.received_content_id!, content_version: call.received_content_version! }; this.#edges(received, [ref(inputRow), ref(source)]);
          const body = this.#recordBody<{ schemaVersion: 1; request: CognitiveDecisionModelRequestV1; receivedAt: string }>(received, text(boundary.workspace_id), text(boundary.task_id), false);
          if (body) { exact(body, ["schemaVersion", "request", "receivedAt"]); assertIsoTimestampV2(body.receivedAt); if (body.schemaVersion !== 1 || record && json(body.request) !== json(record.request)) throw new Error("Decision actual request mismatch"); }
        }
      }
      const decisions = this.#rows("SELECT * FROM cognitive_decision_v1 WHERE boundary_id=? ORDER BY revision", text(boundary.id));
      let previous: Row | undefined;
      for (const [index, row] of decisions.entries()) {
        assertIsoTimestampV2(row.created_at);
        const source = this.#row("SELECT * FROM context_capsule_v1 WHERE id=?", text(row.capsule_id));
        const call = integer(row.call_count) ? calls.find(call => call.ordinal === row.call_count) : undefined;
        if (row.revision !== index+1 || !source || source.task_id !== boundary.task_id || source.attempt_id !== boundary.attempt_id || source.task_revision !== boundary.task_revision || integer(row.call_count) > integer(boundary.call_count)
          || previous && integer(row.call_count) < integer(previous.call_count) || previous && previous.action !== "retrieve" || row.origin === "model-proposal" && (!call?.received_content_id || call.capsule_id !== row.capsule_id || previous?.call_count === row.call_count)
          || row.origin === "coordinator-stop" && row.action !== "stop" || row.action === "retrieve" && row.call_count !== 1) throw new Error("Decision version projection mismatch");
        const dependencies = [ref(source), ...(call ? [{ contentId: text(call.input_content_id), contentVersion: integer(call.input_content_version) }, ...(call.received_content_id ? [{ contentId: text(call.received_content_id), contentVersion: integer(call.received_content_version) }] : [])] : []), ...(previous ? [ref(previous)] : [])];
        this.#edges(row, dependencies);
        const body = this.#recordBody<CognitiveDecisionRecordV1>(row, text(boundary.workspace_id), text(boundary.task_id), false);
        if (body) {
          exact(body, ["schemaVersion", "boundaryId", "revision", "capsuleId", "callCount", "origin", "decision", "createdAt", "requestId"]); const decision = parseCognitiveDecisionV1(body.decision);
          const capsuleBody = this.#body(source, false);
          if (body.schemaVersion !== 1 || body.boundaryId !== boundary.id || body.revision !== row.revision || body.capsuleId !== row.capsule_id || body.callCount !== row.call_count || body.origin !== row.origin || decision.action !== row.action || body.createdAt !== row.created_at
            || body.origin === "model-proposal" && (body.requestId !== call?.request_id || capsuleBody && decision.claimRefs.some(wanted => !capsuleBody.capsule.report.selected.some(item => json(item.ref) === json(wanted))))
            || body.origin === "coordinator-stop" && (body.requestId !== null || decision.claimRefs.length !== 0)) throw new Error("Decision body projection mismatch");
        }
        previous = row;
      }
      const final = decisions.at(-1);
      if (boundary.status === "open" ? final !== undefined && final.action !== "retrieve" : !final || final.action === "retrieve" || boundary.status !== (final.action === "stop" ? "stopped" : "decided") || boundary.decision_content_id !== final.content_id || boundary.decision_content_version !== final.content_version) throw new Error("Decision final pointer mismatch");
    }
  }
  #validateRuntimeRows(): void {
    for (const request of this.#rows("SELECT * FROM task_model_request_v1")) {
      const capsules = this.#rows(`SELECT c.* FROM task_content_dependency_v1 edge JOIN task_input_v1 i
        ON i.content_id=edge.source_id AND i.content_version=edge.source_version AND i.kind='runtime_input'
        JOIN context_capsule_v1 c ON c.runtime_input_id=i.id WHERE edge.target_id=? AND edge.target_version=?`, text(request.content_id), integer(request.content_version));
      const links = this.#rows("SELECT * FROM context_model_request_v1 WHERE binding_id=? AND request_id=?", text(request.binding_id), text(request.request_id));
      if (!capsules.length) { if (links.length) throw new Error("Uncompiled model request has a Context link"); continue; }
      const capsule = capsules[0]!;
      if (capsules.length !== 1 || links.length !== 1 || links[0]!.capsule_id !== capsule.id || request.task_id !== capsule.task_id || request.attempt_id !== capsule.attempt_id
        || request.intent_revision !== capsule.intent_revision || request.owner_epoch !== capsule.owner_epoch || request.task_revision !== integer(capsule.task_revision) + 1) throw new Error("Context model request binding mismatch");
      const body = this.#body(capsule, false), actual = this.#recordBody<{ context: JsonValue; maxTokens: number }>(request, text(capsule.workspace_id), text(capsule.task_id), false);
      if (body && actual && this.#boundary) this.#runtimeRequestBudget(body.capsule, body.capsule.rendering.fullText, actual);
    }
  }
  /** Older strict engines can omit Context tables; latest owner uses forward schema6. */
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
        this.#validateReadSet(row, body, snapshot, task);
        const edges = this.#rows("SELECT source_id,source_version FROM task_content_dependency_v1 WHERE target_id=? AND target_version=?", text(row.content_id), integer(row.content_version)).map(edge => ({ contentId: text(edge.source_id), contentVersion: integer(edge.source_version) }));
        for (const dependency of readSet.dependencies) assertContentRefV2(dependency);
        const sorted = (refs: readonly ContentRefV2[]) => refs.map(json).sort();
        if (json(sorted(edges)) !== json(sorted(readSet.dependencies)) || !readSet.dependencies.some(item => json(item) === json(ref(snapshot)))) throw new Error("Context dependency mismatch");
        const inputBytes = this.#host.content(ref(input), scope, false).bytes;
        if (inputBytes) { const value = JSON.parse(new TextDecoder().decode(inputBytes)) as { input: { text: string } }; if (value.input.text !== capsule.rendering.fullText) throw new Error("Context Runtime input mismatch"); }
      }
      this.#validateCoordinationRows();
      this.#validateRuntimeRows();
    } catch (error) {
      if (["ERR_SQLITE_ERROR", "sqlite"].includes((error as { code?: string })?.code ?? "")) throw error;
      this.#host.fail("corruption");
    }
  }
}
