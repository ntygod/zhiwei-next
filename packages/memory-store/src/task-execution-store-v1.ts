import type { SQLOutputValue } from "node:sqlite";
import { assertIdentifierV2, assertRevisionV2, assertIsoTimestampV2, scopeKeyV2,
  type ContentRefV2, type ScopeV2 } from "../../domain/src/index.ts";
import { canonicalJsonV1, parseExecutionSpecV1, parseRuntimeBindingV1, parseNormalizedRuntimeEnvelopeV1,
  parseRuntimeProcessCloseEvidenceV1, parseProductEventV1, parseSessionContractV1,
  type ExecutionSpecV1, type RuntimeBindingV1, type NormalizedRuntimeEnvelopeV1,
  type RuntimeProcessCloseEvidenceV1, type JsonValue } from "../../protocol/src/index.ts";
import type { TaskStoreHostV1 } from "./task-store-v1.ts";
import type { TaskPersistenceBoundaryV1, TaskStoreContextV1 } from "./task-store-v1-types.ts";
import type { TaskExecutionPersistenceV1, TaskExecutionReadV1, TaskExecutionDetailsV1,
  TaskExecutionSourceIdentityV1, TaskExecutionEventCommitV1, TaskModelRequestCommitV1,
  TaskModelRequestSnapshotV1 } from "./task-execution-v1-types.ts";

type Row = Record<string, SQLOutputValue>;
type Code = "validation" | "corruption";
interface Body {
  readonly schemaVersion: 1;
  readonly spec: ExecutionSpecV1;
  readonly binding: RuntimeBindingV1;
  readonly sourceIdentity: TaskExecutionSourceIdentityV1;
  readonly dispatched: boolean;
  readonly closed: boolean;
  readonly closeEvidence?: RuntimeProcessCloseEvidenceV1;
}
interface TaskCoordinates { task: Row; snapshot: Row; session: Row; scope: ScopeV2 }
interface Owned { row: Row; snapshot: Row; body: Body; current: TaskCoordinates }
const json = canonicalJsonV1;
function text(value: unknown): string { if (typeof value !== "string") throw new Error("Invalid string"); return value; }
function integer(value: unknown, zero = false): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < (zero ? 0 : 1)) throw new Error("Invalid integer"); return value;
}
function exact(value: unknown, required: readonly string[], optional: readonly string[] = []): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error("Invalid record");
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).some(key => typeof key !== "string" || ![...required, ...optional].includes(key)
    || !("value" in descriptors[key]) || !descriptors[key].enumerable || descriptors[key].value === undefined)
    || required.some(key => !Object.hasOwn(descriptors, key))) throw new Error("Invalid fields");
}
function ref(row: Row): ContentRefV2 { return { contentId: text(row.content_id), contentVersion: integer(row.content_version) }; }
function taskScope(workspaceId: string, taskId: string): ScopeV2 { return { kind: "task", workspaceId, taskId }; }
function next(value: SQLOutputValue): number { const n = integer(value); if (n >= Number.MAX_SAFE_INTEGER) throw new Error("Counter exhausted"); return n + 1; }
function sourceIdentity(value: unknown): TaskExecutionSourceIdentityV1 {
  exact(value, ["bindingImplementation", "adapter", "implementation", "version"]);
  assertIdentifierV2(value.bindingImplementation); assertIdentifierV2(value.adapter);
  const implementation = text(value.implementation), version = text(value.version);
  if (!implementation.length || implementation.length > 1024 || implementation.trim() !== implementation || implementation.includes("\0")
    || !version.length || version.length > 128 || version.trim() !== version || version.includes("\0")) throw new Error("Invalid runtime identity");
  return { bindingImplementation: value.bindingImplementation, adapter: value.adapter, implementation, version };
}
function identity(binding: RuntimeBindingV1): unknown {
  const { state: _state, observedRuntimeSessionIds: _sessions, sourceStreams: _streams, ...fixed } = binding; return fixed;
}
function prefix<T>(before: readonly T[], after: readonly T[]): boolean { return after.length >= before.length && before.every((item, index) => json(item) === json(after[index])); }
function complete(evidence: RuntimeProcessCloseEvidenceV1): boolean { return evidence.stdoutEof && evidence.stderrEof && evidence.closeObserved; }
function closeExtends(before: RuntimeProcessCloseEvidenceV1 | undefined, after: RuntimeProcessCloseEvidenceV1): boolean {
  return !before || (before.bindingId === after.bindingId && after.observedAt >= before.observedAt
    && (!before.stdoutEof || after.stdoutEof) && (!before.stderrEof || after.stderrEof) && (!before.closeObserved || after.closeObserved)
    && (!before.closeObserved || before.exitCode === after.exitCode && before.signal === after.signal));
}
/** Capture only the projected, bounded request. Raw model reasoning is never a stored body. */
function snapshotContext(value: unknown): JsonValue {
  let nodes = 0;
  const visit = (item: unknown, depth: number): JsonValue => {
    if (++nodes > 8192 || depth > 12) throw new Error("Oversize context");
    if (item === null || typeof item === "boolean") return item;
    if (typeof item === "string") { if (item.length > 262144 || item.includes("\0")) throw new Error("Oversize text"); return item; }
    if (typeof item === "number") { if (!Number.isFinite(item)) throw new Error("Invalid number"); return item; }
    if (Array.isArray(item)) {
      if (item.length > 128 || Reflect.ownKeys(item).length !== item.length + 1) throw new Error("Invalid list");
      return Array.from({ length: item.length }, (_, index) => { const d = Object.getOwnPropertyDescriptor(item, String(index)); if (!d || !("value" in d)) throw new Error("Accessor"); return visit(d.value, depth + 1); });
    }
    if (!item || typeof item !== "object" || ![Object.prototype, null].includes(Object.getPrototypeOf(item))) throw new Error("Invalid context");
    const entries = Object.getOwnPropertyDescriptors(item), keys = Reflect.ownKeys(entries);
    if (keys.length > 128) throw new Error("Oversize object");
    const output: Record<string, JsonValue> = Object.create(null) as Record<string, JsonValue>;
    for (const key of keys) {
      if (typeof key !== "string" || !("value" in entries[key]!) || !entries[key]!.enumerable) throw new Error("Unretained context");
      const child = entries[key]!.value as unknown;
      if (/^(thinking|reasoning|reasoning_content|chain_of_thought|thought|thoughts)$/i.test(key)
        && !(key === "reasoning" && typeof child === "number" && Number.isSafeInteger(child) && child >= 0)) throw new Error("Unretained reasoning");
      if (key === "type" && typeof child === "string" && /^(thinking|reasoning|redacted_thinking|analysis)$/.test(child)) throw new Error("Unretained block");
      output[key] = visit(child, depth + 1);
    }
    return output;
  };
  const result = visit(value, 0);
  const encoded = json(result);
  if (Buffer.byteLength(encoded, "utf8") > 262144) throw new Error("Oversize context");
  return JSON.parse(encoded) as JsonValue;
}

/** No runtime, model, filesystem or arbitrary transaction capability is exposed by this engine. */
export class TaskExecutionStoreEngineV1 implements TaskExecutionPersistenceV1 {
  readonly #host: TaskStoreHostV1;
  readonly #boundary: TaskPersistenceBoundaryV1 | undefined;
  constructor(host: TaskStoreHostV1, boundary?: TaskPersistenceBoundaryV1) { this.#host = host; this.#boundary = boundary; }
  #parse<T>(code: Code, work: () => T): T {
    try { return work(); } catch (error) {
      const category = (error as { code?: string })?.code;
      if (category === "ERR_SQLITE_ERROR" || category === "sqlite" || category === "io") throw error;
      return this.#host.fail(code);
    }
  }
  #configured(): TaskPersistenceBoundaryV1 { if (!this.#boundary) return this.#host.fail("unavailable"); return this.#boundary; }
  #context(context: TaskStoreContextV1): void {
    this.#parse("validation", () => { exact(context, ["principalId", "workspaceId", "daemonInstanceId", "ownerEpoch"]);
      assertIdentifierV2(context.principalId); assertIdentifierV2(context.workspaceId); assertIdentifierV2(context.daemonInstanceId); assertRevisionV2(context.ownerEpoch); });
    if (context.daemonInstanceId !== this.#configured().daemonInstanceId) this.#host.fail("conflict");
  }
  #bodyValue(row: Row, scope: ScopeV2, available: boolean): unknown | undefined {
    const bytes = this.#host.content(ref(row), scope, available).bytes;
    if (!bytes) { if (available) return this.#host.fail("unavailable"); return undefined; }
    return this.#parse("corruption", () => {
      const encoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes), value: unknown = JSON.parse(encoded);
      if (json(value) !== encoded) throw new Error("Noncanonical body"); return value;
    });
  }
  #decode(value: unknown): Body {
    return this.#parse("corruption", () => {
      exact(value, ["schemaVersion", "spec", "binding", "sourceIdentity", "dispatched", "closed"], ["closeEvidence"]);
      if (value.schemaVersion !== 1 || typeof value.dispatched !== "boolean" || typeof value.closed !== "boolean") throw new Error("Invalid body");
      const spec = parseExecutionSpecV1(value.spec), binding = parseRuntimeBindingV1(value.binding), declared = sourceIdentity(value.sourceIdentity);
      const evidence = value.closeEvidence === undefined ? undefined : parseRuntimeProcessCloseEvidenceV1(value.closeEvidence);
      if (!["ALLOCATED", "READY", "BUSY", "DRAINING", "STOPPED"].includes(binding.state)
        || value.closed !== (binding.state === "STOPPED") || (binding.state === "BUSY" || binding.state === "DRAINING") && !value.dispatched
        || (binding.state === "ALLOCATED" || binding.state === "READY") && value.dispatched
        || value.closed !== (evidence !== undefined && complete(evidence)) || evidence && evidence.bindingId !== binding.bindingId) throw new Error("Invalid state");
      this.#matchSpec(spec, binding, declared);
      return { schemaVersion: 1, spec, binding, sourceIdentity: declared, dispatched: value.dispatched, closed: value.closed, ...(evidence ? { closeEvidence: evidence } : {}) };
    });
  }
  #matchSpec(spec: ExecutionSpecV1, binding: RuntimeBindingV1, declared: TaskExecutionSourceIdentityV1): void {
    if (spec.fence.owner.kind !== "task_attempt" || binding.owner.kind !== "task_attempt" || binding.owner.id !== spec.fence.owner.id
      || binding.executionUnitId !== spec.executionUnitId || binding.workspaceId !== spec.workspaceId || binding.sessionId !== spec.sessionId
      || binding.leaseEpoch !== spec.fence.leaseEpoch || binding.runtime.implementation !== declared.bindingImplementation
      || binding.runtime.version !== declared.version) throw new Error("Spec binding mismatch");
  }
  #currentTask(context: TaskStoreContextV1, taskId: string, available = true): TaskCoordinates {
    this.#context(context); this.#parse("validation", () => assertIdentifierV2(taskId));
    const db = this.#host.db;
    const task = db.prepare("SELECT * FROM task_v1 WHERE workspace_id=? AND id=?").get(context.workspaceId, taskId) as Row | undefined;
    if (!task) return this.#host.fail("unavailable");
    const snapshot = db.prepare("SELECT * FROM task_snapshot_v1 WHERE task_id=? AND revision=?").get(taskId, task.current_revision!) as Row | undefined;
    const session = db.prepare("SELECT * FROM session_v1 WHERE workspace_id=? AND id=?").get(context.workspaceId, task.session_id!) as Row | undefined;
    if (!snapshot || !session) return this.#host.fail("corruption");
    if (session.owner_instance_id !== context.daemonInstanceId || session.owner_epoch !== context.ownerEpoch || snapshot.owner_epoch !== context.ownerEpoch) this.#host.fail("conflict");
    const scope = taskScope(context.workspaceId, taskId);
    this.#host.content(ref(snapshot), scope, available);
    return { task, snapshot, session, scope };
  }
  #owned(context: TaskStoreContextV1, taskId: string, bindingId: string, available = true): Owned {
    const current = this.#currentTask(context, taskId, available);
    const row = this.#host.db.prepare("SELECT * FROM task_execution_v1 WHERE task_id=? AND binding_id=?").get(taskId, bindingId) as Row | undefined;
    if (!row) return this.#host.fail("unavailable");
    if (row.workspace_id !== context.workspaceId || row.owner_epoch !== context.ownerEpoch || row.recovery_epoch !== this.#host.recoveryEpoch()
      || row.attempt_id !== current.snapshot.attempt_id || row.intent_revision !== current.snapshot.intent_revision) this.#host.fail("conflict");
    const snapshot = this.#host.db.prepare("SELECT * FROM task_execution_snapshot_v1 WHERE binding_id=? AND revision=?").get(bindingId, row.current_revision!) as Row | undefined;
    if (!snapshot) return this.#host.fail("corruption");
    const value = this.#bodyValue(snapshot, current.scope, true);
    return { row, snapshot, body: this.#decode(value), current };
  }
  #checkFence(context: TaskStoreContextV1, current: TaskCoordinates, spec: ExecutionSpecV1, binding: RuntimeBindingV1): void {
    const db = this.#host.db, fence = spec.fence, snapshot = current.snapshot, session = current.session;
    const state = db.prepare("SELECT * FROM store_state WHERE singleton=1").get() as Row | undefined;
    if (!state) return this.#host.fail("corruption");
    if (fence.owner.kind !== "task_attempt" || fence.sourceTask?.taskId !== current.task.id || fence.sourceTask.attemptId !== snapshot.attempt_id
      || fence.sourceTask.intentRevision !== snapshot.intent_revision || spec.workspaceId !== context.workspaceId || spec.sessionId !== current.task.session_id
      || fence.owner.id !== snapshot.attempt_id || fence.installationId !== state.installation_id || fence.recoveryEpoch !== String(this.#host.recoveryEpoch())
      || fence.leaseEpoch !== context.ownerEpoch || fence.contractRevision !== session.contract_revision || session.requires_reauthorization !== 0
      || fence.notAfter <= this.#host.now()) this.#host.fail("conflict");
    for (const [kind, scope] of [["global", { kind: "global" }], ["workspace", { kind: "workspace", workspaceId: context.workspaceId }]] as const) {
      this.#host.registerScope(scope);
      const row = db.prepare("SELECT * FROM scope_catalog WHERE scope_key=?").get(scopeKeyV2(scope)) as Row | undefined;
      if (!row || row.cognition_epoch !== fence.cognition[kind] || row.policy_epoch !== fence.policy[kind]) this.#host.fail("conflict");
    }
    const sessionScope: ScopeV2 = { kind: "session", workspaceId: context.workspaceId, sessionId: text(session.id) };
    const sessionContent = this.#host.content(ref(session), sessionScope, true), taskContent = this.#host.content(ref(snapshot), current.scope, true);
    const inputContent = this.#host.content(spec.requestSnapshotRef, current.scope, true);
    if (sessionContent.privacy !== "model-allowed" || taskContent.privacy !== "model-allowed" || inputContent.privacy !== "model-allowed") this.#host.fail("unavailable");
    const sessionBody = this.#bodyValue(session, sessionScope, true);
    const contract = this.#parse("corruption", () => { exact(sessionBody, ["schemaVersion", "contract", "command", "receipt"]); return parseSessionContractV1(sessionBody.contract); });
    if (json(contract.modelProfile) !== json(spec.selectedModelProfile) || contract.toolProfile.id !== spec.toolProfile
      || contract.runtimeProfile.revision !== binding.profileRevision) this.#host.fail("conflict");
    const input = db.prepare("SELECT * FROM task_input_v1 WHERE content_id=? AND content_version=? AND task_id=? AND kind='runtime_input'")
      .get(spec.requestSnapshotRef.contentId, spec.requestSnapshotRef.contentVersion, current.task.id!) as Row | undefined;
    if (!input || input.attempt_id !== snapshot.attempt_id || input.intent_revision !== snapshot.intent_revision || input.owner_epoch !== context.ownerEpoch) this.#host.fail("conflict");
    const inputBody = this.#bodyValue(input, current.scope, true);
    this.#parse("corruption", () => { exact(inputBody, ["schemaVersion", "input", "command", "receipt"]);
      if (!inputBody.input || typeof inputBody.input !== "object") throw new Error("Invalid input"); });
    const actual = (inputBody as { input: { text: string; contractRevision: number } }).input;
    if (actual.text !== spec.prompt || actual.contractRevision !== fence.contractRevision) this.#host.fail("conflict");
  }
  #writeBody(scope: ScopeV2, body: unknown, dependencies: readonly ContentRefV2[], boundary: TaskPersistenceBoundaryV1): ContentRefV2 {
    // The canonical codec rejects aliases. Dependency coordinates and body references are independent values.
    return this.#host.writeBody(scope, body, dependencies.map(item => ({ ...item })), boundary);
  }
  #summary(row: Row, body: Body): TaskExecutionReadV1 {
    const session = this.#host.db.prepare("SELECT owner_epoch,owner_instance_id FROM session_v1 WHERE workspace_id=? AND id=?")
      .get(row.workspace_id!, body.spec.sessionId) as Row | undefined;
    if (!session) return this.#host.fail("corruption");
    const authority = body.closed ? "closed" : session.owner_epoch === row.owner_epoch
      && session.owner_instance_id === this.#configured().daemonInstanceId && row.recovery_epoch === this.#host.recoveryEpoch() ? "current" : "recovery-blocked";
    return { bindingId: body.binding.bindingId, revision: integer(row.current_revision), executionUnitId: body.spec.executionUnitId,
      taskId: text(row.task_id), attemptId: text(row.attempt_id), taskRevision: integer(row.task_revision), ownerEpoch: integer(row.owner_epoch),
      state: body.binding.state, dispatched: body.dispatched, closed: body.closed, authority };
  }
  #append(owned: Owned, body: Body): TaskExecutionReadV1 {
    const revision = next(owned.row.current_revision!), now = this.#host.now(), row = owned.row;
    const content = this.#writeBody(owned.current.scope, body, [ref(owned.snapshot), ref(owned.current.snapshot), body.spec.requestSnapshotRef], this.#configured());
    this.#insertSnapshot(row, revision, body, content, now);
    if (this.#host.db.prepare("UPDATE task_execution_v1 SET current_revision=?,active=?,updated_at=? WHERE binding_id=? AND current_revision=?")
      .run(revision, body.closed ? 0 : 1, now, row.binding_id!, row.current_revision!).changes !== 1) this.#host.fail("revision_conflict");
    return this.#summary({ ...row, current_revision: revision }, body);
  }
  #insertSnapshot(row: Row, revision: number, body: Body, content: ContentRefV2, now: string): void {
    this.#host.db.prepare(`INSERT INTO task_execution_snapshot_v1(binding_id,revision,task_id,task_revision,attempt_id,intent_revision,
      owner_epoch,recovery_epoch,scope_key,state,dispatched,closed,content_id,content_version,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(row.binding_id!, revision, row.task_id!, row.task_revision!, row.attempt_id!, row.intent_revision!, row.owner_epoch!, row.recovery_epoch!,
        row.scope_key!, body.binding.state, body.dispatched ? 1 : 0, body.closed ? 1 : 0, content.contentId, content.contentVersion, now);
  }
  allocateExecution(context: TaskStoreContextV1, input: Parameters<TaskExecutionPersistenceV1["allocateExecution"]>[1]): TaskExecutionReadV1 {
    const { taskId, expectedRevision, spec, binding } = this.#parse("validation", () => {
      exact(input, ["taskId", "expectedRevision", "spec", "binding"]); assertIdentifierV2(input.taskId); assertRevisionV2(input.expectedRevision);
      return { taskId: input.taskId, expectedRevision: input.expectedRevision, spec: parseExecutionSpecV1(input.spec), binding: parseRuntimeBindingV1(input.binding) };
    });
    return this.#host.transaction(true, () => {
      const current = this.#currentTask(context, taskId), boundary = this.#configured();
      const declared = this.#parse("validation", () => sourceIdentity(boundary.runtimeSourceIdentity ?? {
        bindingImplementation: binding.runtime.implementation, adapter: binding.runtime.implementation, implementation: binding.runtime.implementation, version: binding.runtime.version }));
      this.#parse("validation", () => this.#matchSpec(spec, binding, declared));
      if (binding.state !== "ALLOCATED" || binding.observedRuntimeSessionIds.length || binding.sourceStreams.length) this.#host.fail("validation");
      const old = this.#host.db.prepare("SELECT * FROM task_execution_v1 WHERE binding_id=? OR execution_unit_id=?").get(binding.bindingId, spec.executionUnitId) as Row | undefined;
      if (old) {
        const owned = this.#owned(context, taskId, text(old.binding_id));
        const initial = this.#host.db.prepare("SELECT * FROM task_execution_snapshot_v1 WHERE binding_id=? AND revision=1").get(binding.bindingId) as Row | undefined;
        if (!initial) return this.#host.fail("conflict");
        const prior = this.#decode(this.#bodyValue(initial, current.scope, true));
        if (old.task_revision !== expectedRevision || json(prior.spec) !== json(spec) || json(prior.binding) !== json(binding)
          || json(prior.sourceIdentity) !== json(declared)) this.#host.fail("conflict");
        return this.#summary(owned.row, owned.body);
      }
      if (current.task.current_revision !== expectedRevision) this.#host.fail("revision_conflict");
      if (current.snapshot.state !== "READY") this.#host.fail("conflict");
      this.#checkFence(context, current, spec, binding);
      if (this.#host.db.prepare("SELECT 1 FROM task_execution_v1 WHERE task_id=? AND owner_epoch=? AND active=1").get(taskId, context.ownerEpoch)) this.#host.fail("conflict");
      const now = this.#host.now(), body: Body = { schemaVersion: 1, spec, binding, sourceIdentity: declared, dispatched: false, closed: false };
      const content = this.#writeBody(current.scope, body, [ref(current.snapshot), spec.requestSnapshotRef], boundary);
      const row: Row = { binding_id: binding.bindingId, execution_unit_id: spec.executionUnitId, workspace_id: context.workspaceId, task_id: taskId,
        attempt_id: text(current.snapshot.attempt_id), task_revision: expectedRevision, intent_revision: integer(current.snapshot.intent_revision),
        owner_epoch: context.ownerEpoch, recovery_epoch: this.#host.recoveryEpoch(), scope_key: scopeKeyV2(current.scope), current_revision: 1, active: 1, created_at: now, updated_at: now };
      this.#host.db.prepare(`INSERT INTO task_execution_v1(binding_id,execution_unit_id,workspace_id,task_id,attempt_id,task_revision,intent_revision,
        owner_epoch,recovery_epoch,scope_key,current_revision,active,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(row.binding_id!, row.execution_unit_id!, row.workspace_id!, row.task_id!, row.attempt_id!, row.task_revision!, row.intent_revision!, row.owner_epoch!,
          row.recovery_epoch!, row.scope_key!, 1, 1, now, now);
      this.#insertSnapshot(row, 1, body, content, now);
      return this.#summary(row, body);
    });
  }
  markExecutionReady(context: TaskStoreContextV1, input: Parameters<TaskExecutionPersistenceV1["markExecutionReady"]>[1]): TaskExecutionReadV1 {
    const binding = this.#parse("validation", () => { exact(input, ["taskId", "binding"]); assertIdentifierV2(input.taskId); return parseRuntimeBindingV1(input.binding); });
    return this.#host.transaction(true, () => {
      const owned = this.#owned(context, input.taskId, binding.bindingId);
      this.#checkFence(context, owned.current, owned.body.spec, binding);
      if (binding.state !== "READY" || owned.body.closed || json(identity(binding)) !== json(identity(owned.body.binding))) this.#host.fail("conflict");
      if (json(binding) === json(owned.body.binding)) return this.#summary(owned.row, owned.body);
      if (owned.body.binding.state !== "ALLOCATED" || !prefix(owned.body.binding.observedRuntimeSessionIds, binding.observedRuntimeSessionIds)
        || !prefix(owned.body.binding.sourceStreams, binding.sourceStreams)) this.#host.fail("conflict");
      return this.#append(owned, { ...owned.body, binding });
    });
  }
  markExecutionDispatched(context: TaskStoreContextV1, input: Parameters<TaskExecutionPersistenceV1["markExecutionDispatched"]>[1]): TaskExecutionReadV1 {
    this.#parse("validation", () => { exact(input, ["taskId", "bindingId"]); assertIdentifierV2(input.taskId); assertIdentifierV2(input.bindingId); });
    return this.#host.transaction(true, () => {
      const owned = this.#owned(context, input.taskId, input.bindingId);
      this.#checkFence(context, owned.current, owned.body.spec, owned.body.binding);
      if (this.#host.content(ref(owned.snapshot), owned.current.scope, true).privacy !== "model-allowed") this.#host.fail("unavailable");
      if (owned.body.closed || owned.current.snapshot.state !== "RUNNING") this.#host.fail("conflict");
      if (owned.body.dispatched && owned.body.binding.state === "BUSY") return this.#summary(owned.row, owned.body);
      if (owned.body.binding.state !== "READY" || owned.body.dispatched) this.#host.fail("conflict");
      return this.#append(owned, { ...owned.body, dispatched: true, binding: parseRuntimeBindingV1({ ...owned.body.binding, state: "BUSY" }) });
    });
  }
  observeExecutionBinding(context: TaskStoreContextV1, input: Parameters<TaskExecutionPersistenceV1["observeExecutionBinding"]>[1]): TaskExecutionReadV1 {
    const binding = this.#parse("validation", () => { exact(input, ["taskId", "binding"]); assertIdentifierV2(input.taskId); return parseRuntimeBindingV1(input.binding); });
    return this.#host.transaction(true, () => {
      const owned = this.#owned(context, input.taskId, binding.bindingId), previous = owned.body.binding;
      this.#checkFence(context, owned.current, owned.body.spec, binding);
      if (owned.body.closed || !["READY", "BUSY", "DRAINING"].includes(previous.state)
        || !(previous.state === binding.state || previous.state === "BUSY" && binding.state === "DRAINING")
        || json(identity(previous)) !== json(identity(binding)) || !prefix(previous.observedRuntimeSessionIds, binding.observedRuntimeSessionIds)
        || !prefix(previous.sourceStreams, binding.sourceStreams)) this.#host.fail("conflict");
      if (json(binding) === json(previous)) return this.#summary(owned.row, owned.body);
      return this.#append(owned, { ...owned.body, binding });
    });
  }
  #checkEnvelope(body: Body, envelope: NormalizedRuntimeEnvelopeV1): string {
    const binding = body.binding, event = envelope.event, declared = body.sourceIdentity;
    const stream = binding.sourceStreams.find(item => item.sourceStreamId === envelope.sourceStreamId);
    if (envelope.bindingId !== binding.bindingId || envelope.executionUnitId !== binding.executionUnitId || envelope.workerInstanceId !== binding.workerInstanceId
      || event.workspaceId !== binding.workspaceId || !binding.observedRuntimeSessionIds.includes(event.runtimeSessionId)
      || event.source.adapter !== declared.adapter || event.source.runtime.implementation !== declared.implementation || event.source.runtime.version !== declared.version
      || !stream || stream.surface !== event.source.surface || stream.runtimeInstanceId !== event.runtimeInstanceId || stream.sequenceDomain !== event.sequence.domain) this.#host.fail("conflict");
    return json([binding.bindingId, stream.sourceStreamId, event.workspaceId, event.runtimeSessionId, event.runtimeInstanceId,
      event.source.adapter, event.source.runtime.implementation, event.source.runtime.version, event.source.surface, event.sequence.domain]);
  }
  ingestExecutionEvent(context: TaskStoreContextV1, input: Parameters<TaskExecutionPersistenceV1["ingestExecutionEvent"]>[1]): TaskExecutionEventCommitV1 {
    const envelope = this.#parse("validation", () => { exact(input, ["taskId", "envelope"]); assertIdentifierV2(input.taskId); return parseNormalizedRuntimeEnvelopeV1(input.envelope); });
    return this.#host.transaction(true, () => {
      const owned = this.#owned(context, input.taskId, envelope.bindingId), sourceKey = this.#checkEnvelope(owned.body, envelope), event = envelope.event, db = this.#host.db;
      const old = db.prepare("SELECT * FROM task_execution_event_v1 WHERE event_id=? OR idempotency_key=? OR (source_key=? AND source_sequence=?)")
        .all(event.eventId, event.idempotencyKey, sourceKey, event.sequence.value) as Row[];
      if (old.length) {
        if (old.length !== 1 || old[0]!.event_id !== event.eventId || old[0]!.idempotency_key !== event.idempotencyKey
          || old[0]!.binding_id !== envelope.bindingId || old[0]!.source_key !== sourceKey || old[0]!.source_sequence !== event.sequence.value
          || json(this.#bodyValue(old[0]!, owned.current.scope, true)) !== json(envelope)) this.#host.fail("conflict");
        const ack = db.prepare("SELECT * FROM task_execution_ack_v1 WHERE event_id=?").get(event.eventId) as Row | undefined;
        if (!ack) return this.#host.fail("corruption");
        return { replay: true, commitCursor: integer(ack.commit_cursor), sourceSequence: event.sequence.value };
      }
      this.#checkFence(context, owned.current, owned.body.spec, owned.body.binding);
      if (owned.body.closed || !owned.body.dispatched || !["BUSY", "DRAINING"].includes(owned.body.binding.state)) this.#host.fail("conflict");
      const checkpoint = db.prepare("SELECT * FROM task_execution_stream_v1 WHERE binding_id=? AND source_key=?").get(envelope.bindingId, sourceKey) as Row | undefined;
      // Frozen Runtime v1 is strictly monotonic within its complete identity, not contiguous.
      // Different surfaces may share a physical counter. A numeric jump proves neither loss nor completeness.
      if (checkpoint && event.sequence.value <= integer(checkpoint.last_sequence)) this.#host.fail("sequence");
      const now = this.#host.now(), boundary = this.#configured(), body = this.#writeBody(owned.current.scope, envelope,
        [ref(owned.snapshot), ref(owned.current.snapshot), owned.body.spec.requestSnapshotRef], boundary);
      const progress = parseProductEventV1({ schemaVersion: 1, eventId: boundary.ids.next("event"), workspaceId: context.workspaceId,
        aggregate: { kind: "task", id: input.taskId, revision: integer(owned.current.task.current_revision) }, occurredAt: now,
        type: "task.progress", payload: { phase: "working" } });
      const outbox = db.prepare(`INSERT INTO task_outbox_v1(event_id,workspace_id,entity_kind,entity_id,revision,event_type,owner_epoch,recovery_epoch,occurred_at,publish_state,event_json)
        VALUES(?,?,'task',?,?,'task.progress',?,?,?,'pending',?)`).run(progress.eventId, context.workspaceId, input.taskId,
          progress.aggregate.revision, context.ownerEpoch, this.#host.recoveryEpoch(), now, json(progress));
      const progressCursor = integer(Number(outbox.lastInsertRowid));
      db.prepare(`INSERT INTO task_execution_event_v1(event_id,idempotency_key,binding_id,task_id,attempt_id,task_revision,intent_revision,owner_epoch,recovery_epoch,
        scope_key,source_stream_id,source_key,source_sequence,content_id,content_version,commit_cursor,recorded_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(event.eventId, event.idempotencyKey, envelope.bindingId, input.taskId, owned.row.attempt_id!, owned.current.task.current_revision!, owned.row.intent_revision!,
          context.ownerEpoch, this.#host.recoveryEpoch(), scopeKeyV2(owned.current.scope), envelope.sourceStreamId, sourceKey, event.sequence.value,
          body.contentId, body.contentVersion, progressCursor, now);
      if (checkpoint) {
        const updated = db.prepare(`UPDATE task_execution_stream_v1 SET last_sequence=?,last_event_id=?
          WHERE binding_id=? AND source_key=? AND last_sequence=? AND last_event_id=?`)
          .run(event.sequence.value, event.eventId, envelope.bindingId, sourceKey, checkpoint.last_sequence!, checkpoint.last_event_id!);
        if (updated.changes !== 1) this.#host.fail("sequence");
      } else db.prepare("INSERT INTO task_execution_stream_v1(binding_id,source_key,source_stream_id,last_sequence,last_event_id) VALUES(?,?,?,?,?)")
        .run(envelope.bindingId, sourceKey, envelope.sourceStreamId, event.sequence.value, event.eventId);
      if (event.data.kind === "agent.lifecycle" && event.data.phase === "settled") this.#host.onExecutionSettled(context, envelope);
      const final = db.prepare("SELECT max(cursor) AS cursor FROM task_outbox_v1 WHERE workspace_id=?").get(context.workspaceId) as Row;
      const commitCursor = integer(final.cursor);
      db.prepare("INSERT INTO task_execution_ack_v1(event_id,commit_cursor) VALUES(?,?)").run(event.eventId, commitCursor);
      return { replay: false, commitCursor, sourceSequence: event.sequence.value };
    });
  }
  recordModelRequest(context: TaskStoreContextV1, input: Parameters<TaskExecutionPersistenceV1["recordModelRequest"]>[1]): TaskModelRequestCommitV1 {
    const projected = this.#parse("validation", () => {
      exact(input, ["taskId", "bindingId", "requestId", "context", "maxTokens"]); assertIdentifierV2(input.taskId); assertIdentifierV2(input.bindingId);
      assertIdentifierV2(input.requestId); assertRevisionV2(input.maxTokens); return snapshotContext(input.context);
    });
    return this.#host.transaction(true, () => {
      const owned = this.#owned(context, input.taskId, input.bindingId), db = this.#host.db;
      const old = db.prepare("SELECT * FROM task_model_request_v1 WHERE binding_id=? AND request_id=?").get(input.bindingId, input.requestId) as Row | undefined;
      if (old) {
        const stored = this.#modelBody(old, owned.current.scope, true)!;
        if (stored.maxTokens !== input.maxTokens || json(stored.context) !== json(projected)) this.#host.fail("conflict");
        return { replay: true, ordinal: stored.ordinal, contentRef: ref(old) };
      }
      this.#checkFence(context, owned.current, owned.body.spec, owned.body.binding);
      if (owned.body.binding.state !== "BUSY" || !owned.body.dispatched || owned.body.closed || owned.current.snapshot.state !== "RUNNING") this.#host.fail("conflict");
      if (this.#host.content(ref(owned.snapshot), owned.current.scope, true).privacy !== "model-allowed") this.#host.fail("unavailable");
      const count = db.prepare("SELECT count(*) AS count FROM task_model_request_v1 WHERE binding_id=?").get(input.bindingId) as Row;
      const ordinal = integer(count.count, true) + 1;
      if (ordinal > owned.body.spec.bounds.maxModelRequests || input.maxTokens > owned.body.spec.bounds.maxTokens) this.#host.fail("conflict");
      const now = this.#host.now();
      const snapshot = { schemaVersion: 1 as const, bindingId: input.bindingId, requestId: input.requestId, taskId: input.taskId,
        attemptId: text(owned.row.attempt_id), taskRevision: integer(owned.current.task.current_revision), intentRevision: integer(owned.row.intent_revision),
        ownerEpoch: context.ownerEpoch, recoveryEpoch: this.#host.recoveryEpoch(), ordinal, context: projected, maxTokens: input.maxTokens, createdAt: now };
      const content = this.#writeBody(owned.current.scope, snapshot, [owned.body.spec.requestSnapshotRef, ref(owned.snapshot), ref(owned.current.snapshot)], this.#configured());
      db.prepare(`INSERT INTO task_model_request_v1(binding_id,request_id,task_id,attempt_id,task_revision,intent_revision,owner_epoch,recovery_epoch,ordinal,max_tokens,
        scope_key,content_id,content_version,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(input.bindingId, input.requestId, input.taskId, snapshot.attemptId, snapshot.taskRevision, snapshot.intentRevision, context.ownerEpoch,
          this.#host.recoveryEpoch(), ordinal, input.maxTokens, scopeKeyV2(owned.current.scope), content.contentId, content.contentVersion, now);
      return { replay: false, ordinal, contentRef: content };
    });
  }
  closeExecution(context: TaskStoreContextV1, input: Parameters<TaskExecutionPersistenceV1["closeExecution"]>[1]): TaskExecutionReadV1 {
    const evidence = this.#parse("validation", () => { exact(input, ["taskId", "evidence"]); assertIdentifierV2(input.taskId); return parseRuntimeProcessCloseEvidenceV1(input.evidence); });
    return this.#host.transaction(true, () => {
      const owned = this.#owned(context, input.taskId, evidence.bindingId, false);
      // Stop observation is a historical fact. Expired eligibility must not prevent recording it.
      if (json(owned.body.closeEvidence ?? null) === json(evidence)) return this.#summary(owned.row, owned.body);
      if (owned.body.closed || !closeExtends(owned.body.closeEvidence, evidence)) this.#host.fail("conflict");
      return this.#append(owned, { ...owned.body, closeEvidence: evidence, closed: complete(evidence),
        binding: parseRuntimeBindingV1({ ...owned.body.binding, ...(complete(evidence) ? { state: "STOPPED" } : {}) }) });
    });
  }
  recoverExecutionClose(context: TaskStoreContextV1, input: Parameters<TaskExecutionPersistenceV1["recoverExecutionClose"]>[1]): TaskExecutionReadV1 {
    this.#parse("validation", () => {
      exact(input, ["taskId", "bindingId", "expectedExecutionRevision"]);
      assertIdentifierV2(input.taskId); assertIdentifierV2(input.bindingId); assertRevisionV2(input.expectedExecutionRevision);
    });
    this.#context(context);
    return this.#host.transaction(true, () => {
      // This path records an already observed physical close under the new Session owner.
      // It never transfers the old lease, calls a Runtime, or weakens normal #owned admission.
      const db = this.#host.db;
      const task = db.prepare("SELECT * FROM task_v1 WHERE workspace_id=? AND id=?").get(context.workspaceId, input.taskId) as Row | undefined;
      if (!task) return this.#host.fail("unavailable");
      const session = db.prepare("SELECT * FROM session_v1 WHERE workspace_id=? AND id=?").get(context.workspaceId, task.session_id!) as Row | undefined;
      const row = db.prepare("SELECT * FROM task_execution_v1 WHERE workspace_id=? AND task_id=? AND binding_id=?")
        .get(context.workspaceId, input.taskId, input.bindingId) as Row | undefined;
      if (!session || !row) return this.#host.fail("unavailable");
      if (session.owner_instance_id !== context.daemonInstanceId || session.owner_epoch !== context.ownerEpoch
        || context.ownerEpoch <= integer(row.owner_epoch) || row.recovery_epoch !== this.#host.recoveryEpoch()) this.#host.fail("conflict");
      const taskSnapshot = db.prepare("SELECT * FROM task_snapshot_v1 WHERE task_id=? AND revision=?")
        .get(input.taskId, task.current_revision!) as Row | undefined;
      const snapshot = db.prepare("SELECT * FROM task_execution_snapshot_v1 WHERE binding_id=? AND revision=?")
        .get(input.bindingId, row.current_revision!) as Row | undefined;
      if (!taskSnapshot || !snapshot) return this.#host.fail("corruption");
      if (taskSnapshot.attempt_id !== row.attempt_id || taskSnapshot.intent_revision !== row.intent_revision
        || integer(taskSnapshot.owner_epoch) > context.ownerEpoch) this.#host.fail("conflict");
      const scope = taskScope(context.workspaceId, input.taskId);
      this.#host.content(ref(taskSnapshot), scope, true);
      const body = this.#decode(this.#bodyValue(snapshot, scope, true));
      const currentRevision = integer(row.current_revision), now = this.#host.now();
      if (now < text(snapshot.created_at)) this.#host.fail("conflict");
      if (body.closed) {
        // A lost response may retry the exact pre-close CAS. No custody re-query or new row.
        if (input.expectedExecutionRevision !== currentRevision && input.expectedExecutionRevision !== currentRevision - 1) this.#host.fail("revision_conflict");
        return this.#summary(row, body);
      }
      if (input.expectedExecutionRevision !== currentRevision) this.#host.fail("revision_conflict");
      const attempt = db.prepare("SELECT active FROM task_attempt_v1 WHERE task_id=? AND id=?").get(input.taskId, row.attempt_id!) as Row | undefined;
      if (!attempt || attempt.active !== 1 || row.active !== 1) this.#host.fail("conflict");
      const custody = this.#configured().recoveryCustody;
      if (!custody) return this.#host.fail("unavailable");
      const observed: unknown = custody.observedClose({ spec: structuredClone(body.spec), binding: structuredClone(body.binding), executionRevision: currentRevision });
      if (observed === undefined) return this.#host.fail("unavailable");
      const captured = this.#parse("validation", () => {
        exact(observed, ["spec", "binding", "executionRevision", "evidence"]); assertRevisionV2(observed.executionRevision);
        return { spec: parseExecutionSpecV1(observed.spec), binding: parseRuntimeBindingV1(observed.binding),
          executionRevision: observed.executionRevision, evidence: parseRuntimeProcessCloseEvidenceV1(observed.evidence) };
      });
      if (captured.executionRevision !== currentRevision || json(captured.spec) !== json(body.spec) || json(captured.binding) !== json(body.binding)
        || captured.evidence.bindingId !== input.bindingId || !complete(captured.evidence)
        || captured.evidence.observedAt > now || captured.evidence.observedAt < text(row.created_at)
        || !closeExtends(body.closeEvidence, captured.evidence)) this.#host.fail("conflict");
      const current: TaskCoordinates = { task, snapshot: taskSnapshot, session, scope };
      return this.#append({ row, snapshot, body, current }, { ...body, closed: true, closeEvidence: captured.evidence,
        binding: parseRuntimeBindingV1({ ...body.binding, state: "STOPPED" }) });
    });
  }
  #latest(workspaceId: string, taskId: string): { row: Row; body: Body } | undefined {
    const row = this.#host.db.prepare("SELECT * FROM task_execution_v1 WHERE workspace_id=? AND task_id=? ORDER BY rowid DESC LIMIT 1")
      .get(workspaceId, taskId) as Row | undefined;
    if (!row) return undefined;
    const snapshot = this.#host.db.prepare("SELECT * FROM task_execution_snapshot_v1 WHERE binding_id=? AND revision=?")
      .get(row.binding_id!, row.current_revision!) as Row | undefined;
    if (!snapshot) return this.#host.fail("corruption");
    return { row, body: this.#decode(this.#bodyValue(snapshot, taskScope(workspaceId, taskId), true)) };
  }
  currentForReduction(workspaceId: string, taskId: string): TaskExecutionReadV1 | undefined {
    if (!this.#host.db.isTransaction) return this.#host.fail("corruption");
    const current = this.#latest(workspaceId, taskId); return current ? this.#summary(current.row, current.body) : undefined;
  }
  readExecution(workspaceId: string, taskId: string): TaskExecutionReadV1 | undefined {
    this.#parse("validation", () => { assertIdentifierV2(workspaceId); assertIdentifierV2(taskId); });
    return this.#host.transaction(false, () => this.currentForReduction(workspaceId, taskId));
  }
  readExecutionDetails(workspaceId: string, taskId: string): TaskExecutionDetailsV1 | undefined {
    this.#parse("validation", () => { assertIdentifierV2(workspaceId); assertIdentifierV2(taskId); });
    return this.#host.transaction(false, () => {
      const current = this.#latest(workspaceId, taskId); if (!current) return undefined;
      return { ...this.#summary(current.row, current.body), spec: current.body.spec, binding: current.body.binding,
        sourceIdentity: current.body.sourceIdentity, ...(current.body.closeEvidence ? { closeEvidence: current.body.closeEvidence } : {}) };
    });
  }
  #modelBody(row: Row, scope: ScopeV2, available: boolean): Omit<TaskModelRequestSnapshotV1, "contentRef"> | undefined {
    const value = this.#bodyValue(row, scope, available); if (value === undefined) return undefined;
    return this.#parse("corruption", () => {
      exact(value, ["schemaVersion", "bindingId", "requestId", "taskId", "attemptId", "taskRevision", "intentRevision", "ownerEpoch", "recoveryEpoch", "ordinal", "context", "maxTokens", "createdAt"]);
      if (value.schemaVersion !== 1) throw new Error("Invalid model snapshot");
      for (const key of ["bindingId", "requestId", "taskId", "attemptId"]) assertIdentifierV2(value[key]);
      for (const key of ["taskRevision", "intentRevision", "ownerEpoch", "ordinal", "maxTokens"]) assertRevisionV2(value[key]);
      assertIsoTimestampV2(value.createdAt); integer(value.recoveryEpoch, true);
      const result = { ...value, context: snapshotContext(value.context) } as unknown as Omit<TaskModelRequestSnapshotV1, "contentRef">;
      if (json(result) !== json(value)) throw new Error("Noncanonical projected context");
      return result;
    });
  }
  listModelRequests(workspaceId: string, taskId: string, attemptId: string): readonly TaskModelRequestSnapshotV1[] {
    this.#parse("validation", () => { assertIdentifierV2(workspaceId); assertIdentifierV2(taskId); assertIdentifierV2(attemptId); });
    return this.#host.transaction(false, () => {
      const rows = this.#host.db.prepare(`SELECT m.* FROM task_model_request_v1 m JOIN task_execution_v1 e ON e.binding_id=m.binding_id
        WHERE e.workspace_id=? AND m.task_id=? AND m.attempt_id=? ORDER BY e.rowid,m.ordinal`).all(workspaceId, taskId, attemptId) as Row[];
      return rows.map(row => ({ ...this.#modelBody(row, taskScope(workspaceId, taskId), true)!, contentRef: ref(row) }));
    });
  }
  #dependency(target: ContentRefV2, source: ContentRefV2): void {
    if (!this.#host.db.prepare(`SELECT 1 FROM task_content_dependency_v1 WHERE source_id=? AND source_version=? AND target_id=? AND target_version=?`)
      .get(source.contentId, source.contentVersion, target.contentId, target.contentVersion)) this.#host.fail("corruption");
  }
  /** Called by the owning store inside its verified read/write snapshot, including before migration commits. */
  validateRows(): void {
    if (!this.#host.db.isTransaction) return this.#host.fail("corruption");
    this.#parse("corruption", () => {
      const db = this.#host.db, executions = db.prepare("SELECT * FROM task_execution_v1 ORDER BY rowid").all() as Row[];
      const all = new Map<string, { row: Row; scope: ScopeV2; body: Body | undefined }>();
      for (const row of executions) {
        const bindingId = text(row.binding_id), taskId = text(row.task_id), workspaceId = text(row.workspace_id), scope = taskScope(workspaceId, taskId);
        for (const key of ["binding_id", "execution_unit_id", "workspace_id", "task_id", "attempt_id"]) assertIdentifierV2(row[key]);
        for (const key of ["task_revision", "intent_revision", "owner_epoch", "current_revision"]) integer(row[key]);
        integer(row.recovery_epoch, true); assertIsoTimestampV2(row.created_at); assertIsoTimestampV2(row.updated_at);
        if (row.scope_key !== scopeKeyV2(scope) || row.updated_at! < row.created_at!) throw new Error("Execution coordinates");
        const task = db.prepare("SELECT * FROM task_v1 WHERE id=? AND workspace_id=?").get(taskId, workspaceId) as Row | undefined;
        const allocation = db.prepare("SELECT * FROM task_snapshot_v1 WHERE task_id=? AND revision=?").get(taskId, row.task_revision!) as Row | undefined;
        if (!task || !allocation || allocation.state !== "READY" || allocation.attempt_id !== row.attempt_id || allocation.owner_epoch !== row.owner_epoch
          || allocation.intent_revision !== row.intent_revision || allocation.scope_key !== row.scope_key) throw new Error("Allocation projection");
        const snapshots = db.prepare("SELECT * FROM task_execution_snapshot_v1 WHERE binding_id=? ORDER BY revision").all(bindingId) as Row[];
        if (snapshots.length !== row.current_revision) throw new Error("Execution history gap");
        let previous: Row | undefined, priorBody: Body | undefined, lastBody: Body | undefined;
        for (const [index, snapshot] of snapshots.entries()) {
          if (snapshot.revision !== index + 1) throw new Error("Execution revision gap");
          for (const key of ["binding_id", "task_id", "task_revision", "attempt_id", "intent_revision", "owner_epoch", "recovery_epoch", "scope_key"])
            if (snapshot[key] !== row[key]) throw new Error("Execution history identity");
          assertIsoTimestampV2(snapshot.created_at);
          if (!previous && (snapshot.state !== "ALLOCATED" || snapshot.dispatched !== 0 || snapshot.closed !== 0 || snapshot.created_at !== row.created_at)) throw new Error("Invalid initial allocation");
          if (previous) {
            const before = text(previous.state), after = text(snapshot.state);
            if (previous.closed !== 0 || snapshot.created_at! < previous.created_at! || previous.dispatched === 1 && snapshot.dispatched !== 1
              || !(before === after || before === "ALLOCATED" && after === "READY" || before === "READY" && after === "BUSY"
                || before === "BUSY" && after === "DRAINING" || after === "STOPPED")) throw new Error("Execution state rewind");
          }
          const value = this.#bodyValue(snapshot, scope, false), body = value === undefined ? undefined : this.#decode(value);
          if (body) {
            const source = body.spec.fence.sourceTask;
            if (body.binding.bindingId !== bindingId || body.spec.executionUnitId !== row.execution_unit_id || body.spec.workspaceId !== workspaceId
              || body.spec.sessionId !== task.session_id || body.spec.fence.owner.id !== row.attempt_id || body.spec.fence.owner.kind !== "task_attempt"
              || source?.taskId !== taskId || source.attemptId !== row.attempt_id || source.intentRevision !== row.intent_revision
              || body.spec.fence.leaseEpoch !== row.owner_epoch || body.spec.fence.recoveryEpoch !== String(row.recovery_epoch)
              || body.binding.state !== snapshot.state || Number(body.dispatched) !== snapshot.dispatched || Number(body.closed) !== snapshot.closed) throw new Error("Execution body projection");
            const input = db.prepare("SELECT * FROM task_input_v1 WHERE content_id=? AND content_version=?").get(body.spec.requestSnapshotRef.contentId, body.spec.requestSnapshotRef.contentVersion) as Row | undefined;
            if (!input || input.task_id !== taskId || input.attempt_id !== row.attempt_id || input.kind !== "runtime_input" || input.owner_epoch !== row.owner_epoch
              || input.intent_revision !== row.intent_revision || input.task_revision! > row.task_revision!) throw new Error("Execution input projection");
            this.#dependency(ref(snapshot), body.spec.requestSnapshotRef);
            if (!previous) this.#dependency(ref(snapshot), ref(allocation));
            if (previous) this.#dependency(ref(snapshot), ref(previous));
            if (priorBody && (json(priorBody.spec) !== json(body.spec) || json(priorBody.sourceIdentity) !== json(body.sourceIdentity)
              || json(identity(priorBody.binding)) !== json(identity(body.binding))
              || !prefix(priorBody.binding.sourceStreams, body.binding.sourceStreams)
              || !prefix(priorBody.binding.observedRuntimeSessionIds, body.binding.observedRuntimeSessionIds)
              || priorBody.closeEvidence && !body.closeEvidence || body.closeEvidence && !closeExtends(priorBody.closeEvidence, body.closeEvidence))) throw new Error("Execution facts rewritten");
          }
          previous = snapshot; priorBody = body; lastBody = body;
        }
        if (!previous || row.active !== 1 - integer(previous.closed, true) || row.updated_at !== previous.created_at) throw new Error("Execution current pointer");
        all.set(bindingId, { row, scope, body: lastBody });
      }
      const heads = new Map<string, Row>(), events = db.prepare("SELECT * FROM task_execution_event_v1 ORDER BY row_id").all() as Row[];
      for (const row of events) {
        integer(row.row_id); integer(row.source_sequence); integer(row.commit_cursor); assertIdentifierV2(row.event_id); assertIdentifierV2(row.idempotency_key);
        assertIdentifierV2(row.source_stream_id); assertIsoTimestampV2(row.recorded_at);
        const execution = all.get(text(row.binding_id)); if (!execution) throw new Error("Orphan execution event");
        for (const key of ["task_id", "attempt_id", "intent_revision", "owner_epoch", "recovery_epoch", "scope_key"])
          if (row[key] !== execution.row[key]) throw new Error("Event owner projection");
        const task = db.prepare("SELECT * FROM task_snapshot_v1 WHERE task_id=? AND revision=?").get(row.task_id!, row.task_revision!) as Row | undefined;
        if (!task || task.attempt_id !== row.attempt_id || task.owner_epoch !== row.owner_epoch || task.intent_revision !== row.intent_revision
          || row.task_revision! < execution.row.task_revision!) throw new Error("Event task projection");
        const source = JSON.parse(text(row.source_key)) as unknown;
        if (!Array.isArray(source) || source.length !== 10 || json(source) !== row.source_key || source.some(item => typeof item !== "string")
          || source[0] !== row.binding_id || source[1] !== row.source_stream_id || source[2] !== execution.row.workspace_id) throw new Error("Event source projection");
        const old = heads.get(text(row.source_key));
        if (old && row.source_sequence! <= old.source_sequence!) throw new Error("Source sequence rewind");
        heads.set(text(row.source_key), row);
        const value = this.#bodyValue(row, execution.scope, false);
        const envelope = value === undefined ? undefined : parseNormalizedRuntimeEnvelopeV1(value);
        if (envelope) {
          if (json(envelope) !== json(value) || envelope.bindingId !== row.binding_id || envelope.sourceStreamId !== row.source_stream_id
            || envelope.event.eventId !== row.event_id || envelope.event.idempotencyKey !== row.idempotency_key || envelope.event.sequence.value !== row.source_sequence
            || envelope.executionUnitId !== execution.row.execution_unit_id || envelope.event.workspaceId !== execution.row.workspace_id) throw new Error("Envelope projection");
          const e = envelope.event;
          if (json([envelope.bindingId, envelope.sourceStreamId, e.workspaceId, e.runtimeSessionId, e.runtimeInstanceId, e.source.adapter,
            e.source.runtime.implementation, e.source.runtime.version, e.source.surface, e.sequence.domain]) !== row.source_key) throw new Error("Full source identity");
          if (execution.body && this.#checkEnvelope(execution.body, envelope) !== row.source_key) throw new Error("Unobserved source");
          this.#dependency(ref(row), ref(task));
          if (execution.body) this.#dependency(ref(row), execution.body.spec.requestSnapshotRef);
        }
        const progress = db.prepare("SELECT * FROM task_outbox_v1 WHERE cursor=?").get(row.commit_cursor!) as Row | undefined;
        if (!progress || progress.workspace_id !== execution.row.workspace_id || progress.entity_kind !== "task" || progress.entity_id !== row.task_id
          || progress.revision !== row.task_revision || progress.owner_epoch !== row.owner_epoch || progress.recovery_epoch !== row.recovery_epoch
          || progress.event_type !== "task.progress" || progress.occurred_at !== row.recorded_at) throw new Error("Progress projection");
        const event = parseProductEventV1(JSON.parse(text(progress.event_json)));
        if (json(event) !== progress.event_json || event.eventId !== progress.event_id || event.workspaceId !== progress.workspace_id
          || event.aggregate.id !== row.task_id || event.aggregate.kind !== "task" || event.aggregate.revision !== row.task_revision
          || event.occurredAt !== row.recorded_at || event.type !== "task.progress" || json(event.payload) !== json({ phase: "working" })) throw new Error("Canonical progress");
        const ack = db.prepare("SELECT a.*,o.workspace_id,o.entity_id FROM task_execution_ack_v1 a JOIN task_outbox_v1 o ON o.cursor=a.commit_cursor WHERE a.event_id=?").get(row.event_id!) as Row | undefined;
        if (!ack || ack.commit_cursor! < row.commit_cursor! || ack.workspace_id !== execution.row.workspace_id || ack.entity_id !== row.task_id
          || envelope && !(envelope.event.data.kind === "agent.lifecycle" && envelope.event.data.phase === "settled") && ack.commit_cursor !== row.commit_cursor) throw new Error("Final commit acknowledgement");
      }
      const checkpoints = db.prepare("SELECT * FROM task_execution_stream_v1").all() as Row[];
      if (checkpoints.length !== heads.size) throw new Error("Orphan source checkpoint");
      for (const checkpoint of checkpoints) {
        const head = heads.get(text(checkpoint.source_key));
        if (!head || checkpoint.binding_id !== head.binding_id || checkpoint.source_stream_id !== head.source_stream_id
          || checkpoint.last_sequence !== head.source_sequence || checkpoint.last_event_id !== head.event_id) throw new Error("Checkpoint projection");
      }
      const ackCount = db.prepare("SELECT count(*) AS count FROM task_execution_ack_v1").get() as Row;
      if (ackCount.count !== events.length) throw new Error("Orphan acknowledgement");
      const ordinals = new Map<string, number>();
      const models = db.prepare("SELECT * FROM task_model_request_v1 ORDER BY binding_id,ordinal").all() as Row[];
      for (const row of models) {
        const bindingId = text(row.binding_id), execution = all.get(bindingId); if (!execution) throw new Error("Orphan model request");
        assertIdentifierV2(row.request_id); assertIsoTimestampV2(row.created_at); integer(row.max_tokens);
        const ordinal = (ordinals.get(bindingId) ?? 0) + 1;
        if (row.ordinal !== ordinal) throw new Error("Model ordinal gap"); ordinals.set(bindingId, ordinal);
        for (const key of ["task_id", "attempt_id", "intent_revision", "owner_epoch", "recovery_epoch", "scope_key"])
          if (row[key] !== execution.row[key]) throw new Error("Model owner projection");
        const task = db.prepare("SELECT * FROM task_snapshot_v1 WHERE task_id=? AND revision=?").get(row.task_id!, row.task_revision!) as Row | undefined;
        if (!task || task.state !== "RUNNING" || task.attempt_id !== row.attempt_id || task.owner_epoch !== row.owner_epoch || task.intent_revision !== row.intent_revision) throw new Error("Model task projection");
        if (execution.body && (ordinal > execution.body.spec.bounds.maxModelRequests || integer(row.max_tokens) > execution.body.spec.bounds.maxTokens)) throw new Error("Model bounds");
        const body = this.#modelBody(row, execution.scope, false);
        if (body) {
          const pairs = { bindingId: "binding_id", requestId: "request_id", taskId: "task_id", attemptId: "attempt_id", taskRevision: "task_revision",
            intentRevision: "intent_revision", ownerEpoch: "owner_epoch", recoveryEpoch: "recovery_epoch", ordinal: "ordinal", maxTokens: "max_tokens", createdAt: "created_at" } as const;
          for (const [field, column] of Object.entries(pairs)) if (body[field as keyof typeof pairs] !== row[column]) throw new Error("Model body projection");
          this.#dependency(ref(row), ref(task));
          if (execution.body) this.#dependency(ref(row), execution.body.spec.requestSnapshotRef);
        }
      }
    });
  }
}
