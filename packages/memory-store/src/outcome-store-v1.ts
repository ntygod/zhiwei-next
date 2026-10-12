/** T06: fixed verification plans, observed evidence and an atomic result/Episode bundle. */
import type { SQLOutputValue } from "node:sqlite";
import { assertIdentifierV2, assertRevisionV2, assertIsoTimestampV2, assertScopeV2, assertContentRefV2, assertMemoryClaimV2, scopeKeyV2, isTerminalTaskState,
  type ContentRefV2, type CriterionObservationV1, type EvidenceRefV2, type OutcomeVerificationPlanV1, type Task, type TaskResultBundleV1, type MemoryUseV1, type ScopeV2 } from "../../domain/src/index.ts";
import { canonicalJsonV1, parseOutcomePlanCommandV1, parseOutcomeVerifyCommandV1, parseOutcomeFeedbackCommandV1, parseOutcomeVerificationPlanV1,
  parseCriterionObservationV1, parseTaskResultBundleV1, parseSessionTaskV1, parseNormalizedRuntimeEnvelopeV1, parseObservationV2,
  type OutcomePlanCommandV1, type OutcomeVerifyCommandV1, type OutcomeFeedbackCommandV1, type NormalizedRuntimeEnvelopeV1 } from "../../protocol/src/index.ts";
import type { TaskStoreHostV1, TaskStoreEngineV1 } from "./task-store-v1.ts";
import type { TaskExecutionStoreEngineV1 } from "./task-execution-store-v1.ts";
import type { ContextStoreEngineV1 } from "./context-store-v1.ts";
import type { TaskStoreContextV1, TaskPersistenceBoundaryV1 } from "./task-store-v1-types.ts";
import type { CognitionFenceV2 } from "./cognitive-store-v2.ts";
import type { OutcomePersistenceBoundaryV1, OutcomePersistenceV1, OutcomeVerificationSnapshotV1, OutcomeVerificationPrepareV1, OutcomeCommitV1,
  OutcomePlanCommitV1, OutcomeMaterialV1, TaskVerificationResolutionV1, ResultInputObservationV1 } from "./outcome-store-v1-types.ts";
export interface OutcomeStoreHostV1 extends TaskStoreHostV1 {
  readonly tasks: TaskStoreEngineV1;
  readonly executions: TaskExecutionStoreEngineV1;
  readonly contexts: ContextStoreEngineV1;
  currentFence(scope: ScopeV2): CognitionFenceV2;
  materials(context: TaskStoreContextV1, task: Task, query: string, required: readonly { claimId: string; version: number }[]): readonly OutcomeMaterialV1[];
  recordResultInput(input: ResultInputObservationV1): Readonly<{ content: ContentRefV2; evidence: EvidenceRefV2 }>;
  dependencyAvailable(content: ContentRefV2, scope: ScopeV2): boolean;
}
type Row = Record<string, SQLOutputValue>;
const json = canonicalJsonV1;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
function text(value: unknown): string { if (typeof value !== "string") throw new Error("Invalid result text."); return value; }
function integer(value: unknown): number { if (!Number.isSafeInteger(value) || (value as number) < 0) throw new Error("Invalid result integer."); return value as number; }
function ref(row: Row): ContentRefV2 { return { contentId: text(row.content_id), contentVersion: integer(row.content_version) }; }
function scope(workspaceId: string, taskId: string): ScopeV2 { return { kind: "task", workspaceId, taskId }; }
function exact(input: unknown, required: readonly string[], optional: readonly string[] = []): asserts input is Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid result record.");
  if (required.some(key => !Object.hasOwn(input, key)) || Object.keys(input).some(key => !required.includes(key) && !optional.includes(key))) throw new Error("Invalid result fields.");
}
const semantic = (value: unknown): unknown => { const { commandId: _id, ...rest } = value as Record<string, unknown>; return rest; };
export class OutcomeStoreEngineV1 implements OutcomePersistenceV1 {
  readonly #host: OutcomeStoreHostV1;
  readonly #taskBoundary: TaskPersistenceBoundaryV1 | undefined;
  readonly #boundary: OutcomePersistenceBoundaryV1 | undefined;
  #active: Readonly<{ id: string; owner: TaskStoreContextV1; resolution: TaskVerificationResolutionV1 }> | undefined;
  constructor(host: OutcomeStoreHostV1, taskBoundary?: TaskPersistenceBoundaryV1, boundary?: OutcomePersistenceBoundaryV1) { this.#host = host; this.#taskBoundary = taskBoundary; this.#boundary = boundary; }
  #row(sql: string, ...values: (string | number | null)[]): Row | undefined { return this.#host.db.prepare(sql).get(...values) as Row | undefined; }
  #rows(sql: string, ...values: (string | number | null)[]): Row[] { return this.#host.db.prepare(sql).all(...values) as Row[]; }
  #configured(): OutcomePersistenceBoundaryV1 {
    if (!this.#boundary || !this.#taskBoundary) this.#host.fail("unsupported");
    if (this.#boundary.verifier.id !== "outcome-verifier-v1" || this.#boundary.verifier.revision !== 1 || !Number.isSafeInteger(this.#boundary.verificationTtlMs)
      || this.#boundary.verificationTtlMs < 1 || this.#boundary.verificationTtlMs > 60_000) this.#host.fail("validation"); return this.#boundary;
  }
  #id(kind: Parameters<OutcomePersistenceBoundaryV1["ids"]["next"]>[0]): string { const value = this.#configured().ids.next(kind); assertIdentifierV2(value); return value; }
  #body<T>(row: Row, available = true): T | undefined {
    const content = this.#host.content(ref(row), scope(text(row.workspace_id), text(row.task_id)), available); if (!content.bytes) return undefined;
    const raw = new TextDecoder("utf-8", { fatal: true }).decode(content.bytes), value: unknown = JSON.parse(raw); if (json(value) !== raw) this.#host.fail("corruption"); return value as T;
  }
  #coordinates(context: TaskStoreContextV1, taskId: string): { task: Task; taskRow: Row; session: Row } {
    this.#configured(); exact(context, ["principalId", "workspaceId", "daemonInstanceId", "ownerEpoch"]);
    for (const value of [context.principalId, context.workspaceId, context.daemonInstanceId, taskId]) assertIdentifierV2(value); assertRevisionV2(context.ownerEpoch);
    if (context.daemonInstanceId !== this.#taskBoundary!.daemonInstanceId) this.#host.fail("revision_conflict");
    this.#host.registerScope({ kind: "global" }); this.#host.registerScope({ kind: "workspace", workspaceId: context.workspaceId });
    const task = this.#host.tasks.getTask(context.workspaceId, taskId).value; if (!task) this.#host.fail("unavailable");
    const taskRow = this.#row("SELECT s.*,t.workspace_id FROM task_v1 t JOIN task_snapshot_v1 s ON s.task_id=t.id AND s.revision=t.current_revision WHERE t.workspace_id=? AND t.id=?", context.workspaceId, taskId)!;
    const session = this.#row("SELECT * FROM session_v1 WHERE workspace_id=? AND id=?", context.workspaceId, task.sessionId);
    if (!session || session.owner_instance_id !== context.daemonInstanceId || session.owner_epoch !== context.ownerEpoch) this.#host.fail("revision_conflict");
    return { task, taskRow, session };
  }
  #plan(row: Row, available = true): OutcomeVerificationPlanV1 | undefined {
    const body = this.#body<{ schemaVersion: 1; command: OutcomePlanCommandV1; plan: OutcomeVerificationPlanV1 }>(row, available); if (!body) return undefined;
    exact(body, ["schemaVersion", "command", "plan"]); if (body.schemaVersion !== 1) this.#host.fail("corruption");
    const plan = parseOutcomeVerificationPlanV1(body.plan), command = parseOutcomePlanCommandV1(body.command);
    if (plan.id !== row.id || plan.workspaceId !== row.workspace_id || plan.task.id !== row.task_id || plan.task.revision !== row.task_revision
      || plan.taskAttempt.attemptId !== row.attempt_id || plan.taskAttempt.intentRevision !== row.intent_revision || plan.createdAt !== row.created_at
      || command.commandId !== row.command_id || command.idempotencyKey !== row.idempotency_key || command.taskId !== plan.task.id || command.expectedRevision !== plan.task.revision
      || json(command.checks) !== json(plan.checks) || json(command.adoptionChecks) !== json(plan.adoptionChecks)) this.#host.fail("corruption"); return plan;
  }
  bindPlan(context: TaskStoreContextV1, raw: OutcomePlanCommandV1): OutcomePlanCommitV1 {
    const command = parseOutcomePlanCommandV1(raw); if (command.workspaceId !== context.workspaceId) this.#host.fail("validation");
    return this.#host.transaction(true, () => {
      const { task, taskRow, session } = this.#coordinates(context, command.taskId), attempt = task.attempts.at(-1)!;
      const prior = this.#rows("SELECT * FROM outcome_plan_v1 WHERE principal_id=? AND (command_id=? OR idempotency_key=?)", context.principalId, command.commandId, command.idempotencyKey);
      if (prior.length > 1) this.#host.fail("conflict"); if (prior[0]) {
        const body = this.#body<{ command: OutcomePlanCommandV1 }>(prior[0])!; if (prior[0].workspace_id !== context.workspaceId || json(semantic(body.command)) !== json(semantic(command))) this.#host.fail("conflict");
        return { plan: clone(this.#plan(prior[0])!), replay: true };
      }
      if (task.revision !== command.expectedRevision || taskRow.owner_epoch !== context.ownerEpoch || session.requires_reauthorization !== 0) this.#host.fail("revision_conflict");
      if (task.state !== "READY" || this.#row("SELECT 1 FROM outcome_plan_v1 WHERE task_id=? AND attempt_id=?", task.id, attempt.id)
        || this.#row("SELECT 1 FROM task_execution_snapshot_v1 WHERE task_id=? AND attempt_id=? AND dispatched=1", task.id, attempt.id)) this.#host.fail("conflict");
      const plan = parseOutcomeVerificationPlanV1({ schemaVersion: 1, id: this.#id("plan"), workspaceId: task.workspaceId,
        task: { kind: "task", id: task.id, revision: task.revision }, taskAttempt: { taskId: task.id, attemptId: attempt.id, intentRevision: task.intent.revision },
        criteria: clone(attempt.intent.criteria), verifier: clone(this.#configured().verifier), checks: clone(command.checks), adoptionChecks: clone(command.adoptionChecks), createdAt: this.#host.now() });
      const selected = command.adoptionChecks.length ? this.#host.materials(context, task, "verification", command.adoptionChecks.map(item => ({ claimId: item.material.id, version: item.material.version }))) : [];
      const dependencies = [ref(taskRow), ref(session)];
      for (const check of command.adoptionChecks) {
        const material = selected.find(item => item.claim.id === check.material.id && item.claim.version === check.material.version && item.claim.revision === check.material.revision);
        if (!material || material.claim.kind !== "constraint" || material.claim.statement !== `SYNTHETIC_ONLY: parameter ${check.parameter} = ${check.expectedJson}`) this.#host.fail("unavailable");
        dependencies.push(material.content, ...material.sources);
      }
      const content = this.#host.writeBody(scope(context.workspaceId, task.id), clone({ schemaVersion: 1, command, plan }), dependencies, this.#taskBoundary!);
      this.#host.db.prepare("INSERT INTO outcome_plan_v1(id,principal_id,command_id,idempotency_key,workspace_id,task_id,attempt_id,task_revision,intent_revision,owner_epoch,scope_key,content_id,content_version,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
        .run(plan.id, context.principalId, command.commandId, command.idempotencyKey, task.workspaceId, task.id, attempt.id, task.revision, task.intent.revision, context.ownerEpoch,
          scopeKeyV2(scope(task.workspaceId, task.id)), content.contentId, content.contentVersion, plan.createdAt);
      return { plan: clone(plan), replay: false };
    });
  }
  readPlan(workspaceId: string, taskId: string): OutcomeVerificationPlanV1 | undefined {
    for (const value of [workspaceId, taskId]) assertIdentifierV2(value);
    return this.#host.transaction(false, () => { const task = this.#host.tasks.getTask(workspaceId, taskId).value; if (!task) return undefined;
      const row = this.#row("SELECT * FROM outcome_plan_v1 WHERE workspace_id=? AND task_id=? AND attempt_id=?", workspaceId, taskId, task.attempts.at(-1)!.id); return row ? clone(this.#plan(row)!) : undefined; });
  }
  #origin(context: TaskStoreContextV1, task: Task, operation: "verify" | "feedback"): { execution?: OutcomeVerificationSnapshotV1["execution"]; capsule?: OutcomeVerificationSnapshotV1["capsule"] } {
    const execution = this.#host.executions.readExecutionDetails(context.workspaceId, task.id); if (!execution) {
      if (operation === "verify" && task.state !== "CANCELLED") this.#host.fail("unavailable"); return {};
    }
    if (execution.spec.fence.sourceTask?.attemptId !== task.attempts.at(-1)!.id) this.#host.fail("revision_conflict");
    if (operation === "feedback") return { execution }; // A new subjective user observation is not a Runtime reply or permission to send.
    const fence = execution.spec.fence, global = this.#host.currentFence({ kind: "global" }), workspace = this.#host.currentFence({ kind: "workspace", workspaceId: context.workspaceId });
    if (execution.ownerEpoch !== context.ownerEpoch || fence.installationId !== global.installationId || fence.recoveryEpoch !== String(global.recoveryEpoch)
      || fence.notAfter <= this.#host.now()
      || !fence.sourceTask || fence.sourceTask.taskId !== task.id || fence.sourceTask.intentRevision !== task.intent.revision
      || fence.cognition.global !== global.cognitionEpoch || fence.cognition.workspace !== workspace.cognitionEpoch
      || fence.policy.global !== global.policyEpoch || fence.policy.workspace !== workspace.policyEpoch) this.#host.fail("revision_conflict");
    if (task.state === "CANCELLED" ? !execution.closed : !execution.dispatched) this.#host.fail("conflict");
    const capsule = this.#host.contexts.resultSources(context, execution.spec, execution.binding);
    return { execution, ...(capsule ? { capsule } : {}) };
  }
  #snapshot(row: Row, available = true): OutcomeVerificationSnapshotV1 | undefined {
    const value = this.#body<OutcomeVerificationSnapshotV1>(row, available); if (!value) return undefined;
    exact(value, ["schemaVersion", "id", "operation", "command", "owner", "task", "plan", "fences", "dependencies", "modelRequests", "runtimeEvents", "materials", "preparedAt", "notAfter"], ["execution", "capsule", "previous"]);
    if (value.schemaVersion !== 1 || value.id !== row.id || value.operation !== row.operation || value.owner.principalId !== row.principal_id
      || value.owner.workspaceId !== row.workspace_id || value.owner.ownerEpoch !== row.owner_epoch || value.task.id !== row.task_id || value.task.revision !== row.task_revision
      || value.task.attempts.at(-1)!.id !== row.attempt_id || value.task.intent.revision !== row.intent_revision || value.plan.id !== row.plan_id
      || value.preparedAt !== row.created_at || value.notAfter !== row.not_after) this.#host.fail("corruption");
    parseSessionTaskV1(value.task); parseOutcomeVerificationPlanV1(value.plan); (value.operation === "verify" ? parseOutcomeVerifyCommandV1 : parseOutcomeFeedbackCommandV1)(value.command);
    assertIsoTimestampV2(value.preparedAt); assertIsoTimestampV2(value.notAfter); for (const dependency of value.dependencies) assertContentRefV2(dependency);
    for (const material of value.materials) { assertMemoryClaimV2(material.claim); assertContentRefV2(material.content); for (const source of material.sources) assertContentRefV2(source); }
    for (const runtime of value.runtimeEvents) { parseNormalizedRuntimeEnvelopeV1(runtime.envelope); assertContentRefV2(runtime.contentRef); }
    for (const fence of value.fences) { assertScopeV2(fence.scope); assertIdentifierV2(fence.installationId); for (const number of [fence.cognitionEpoch, fence.policyEpoch, fence.recoveryEpoch]) assertRevisionV2(number, true); }
    if (value.previous) parseTaskResultBundleV1(value.previous); return value;
  }
  #prepare(context: TaskStoreContextV1, command: OutcomeVerifyCommandV1 | OutcomeFeedbackCommandV1, operation: "verify" | "feedback"): OutcomeVerificationPrepareV1 {
    if (command.workspaceId !== context.workspaceId) this.#host.fail("validation");
    return this.#host.transaction(true, () => {
      const { task, taskRow, session } = this.#coordinates(context, command.taskId);
      const existing = this.#rows("SELECT * FROM outcome_verification_v1 WHERE principal_id=? AND (command_id=? OR operation=? AND idempotency_key=?)", context.principalId, command.commandId, operation, command.idempotencyKey);
      if (existing.length > 1) this.#host.fail("conflict"); if (existing[0]) {
        const snapshot = this.#snapshot(existing[0])!; if (snapshot.operation !== operation || snapshot.command.workspaceId !== context.workspaceId || json(semantic(snapshot.command)) !== json(semantic(command))) this.#host.fail("conflict");
        const committed = this.#committed(existing[0], context); return { snapshot: clone(snapshot), ...(committed ? { committed } : {}) };
      }
      if (task.revision !== command.expectedRevision) this.#host.fail("revision_conflict");
      if (task.state !== "VERIFYING" && !isTerminalTaskState(task.state)) this.#host.fail("conflict");
      if (operation === "verify" && (taskRow.owner_epoch !== context.ownerEpoch || session.requires_reauthorization !== 0)) this.#host.fail("revision_conflict");
      const planRow = this.#row("SELECT * FROM outcome_plan_v1 WHERE workspace_id=? AND task_id=? AND attempt_id=?", task.workspaceId, task.id, task.attempts.at(-1)!.id);
      if (!planRow) this.#host.fail("unsupported"); const plan = this.#plan(planRow)!;
      const previousRow = this.#row("SELECT * FROM task_result_v1 WHERE workspace_id=? AND task_id=? AND attempt_id=? ORDER BY task_revision DESC LIMIT 1", task.workspaceId, task.id, task.attempts.at(-1)!.id);
      const previous = previousRow ? this.#result(previousRow)! : undefined;
      if (operation === "feedback") {
        const feedback = command as OutcomeFeedbackCommandV1, criterion = plan.criteria.find(item => item.id === feedback.criterionId);
        if (!previous || !isTerminalTaskState(task.state) || feedback.attemptId !== plan.taskAttempt.attemptId || feedback.intentRevision !== plan.taskAttempt.intentRevision
          || feedback.outcomeId !== previous.outcome.id || feedback.outcomeRevision !== previous.outcome.revision || !criterion || criterion.revision !== feedback.criterionRevision) this.#host.fail("revision_conflict");
        if (criterion.method !== "user-confirmation") this.#host.fail("unsupported");
      }
      const origin = this.#origin(context, task, operation), modelRequests = this.#host.executions.listModelRequests(context.workspaceId, task.id, task.attempts.at(-1)!.id);
      const runtimeEvents = this.#host.executions.listEvents(context.workspaceId, task.id, task.attempts.at(-1)!.id);
      const wanted = origin.capsule?.capsule.report.selected.map(item => ({ claimId: item.ref.id, version: item.ref.version })) ?? [];
      const materials = wanted.length ? this.#host.materials(context, task, "verification", wanted).filter(item => wanted.some(want => want.claimId === item.claim.id && want.version === item.claim.version)) : [];
      const dependencies = [ref(taskRow), ref(session), ref(planRow), ...(previousRow ? [ref(previousRow)] : []), ...modelRequests.map(item => item.contentRef), ...runtimeEvents.map(item => item.contentRef), ...materials.flatMap(item => [item.content, ...item.sources])];
      for (const request of modelRequests) { const received = this.#row("SELECT * FROM outcome_request_receipt_v1 WHERE binding_id=? AND request_id=?", request.bindingId, request.requestId); if (received) dependencies.push(ref(received)); }
      if (origin.capsule) dependencies.push(origin.capsule.contentRef, origin.capsule.runtimeInput.contentRef);
      if (origin.execution) { const current = this.#row("SELECT s.* FROM task_execution_v1 e JOIN task_execution_snapshot_v1 s ON s.binding_id=e.binding_id AND s.revision=e.current_revision WHERE e.binding_id=?", origin.execution.bindingId)!; dependencies.push(ref(current), origin.execution.spec.requestSnapshotRef); }
      const scopes: ScopeV2[] = [{ kind: "global" }, { kind: "workspace", workspaceId: task.workspaceId }, scope(task.workspaceId, task.id), { kind: "session", workspaceId: task.workspaceId, sessionId: task.sessionId }, ...materials.flatMap(item => [item.claim.scope, ...item.claim.evidence.map(evidence => evidence.scope)])];
      const fences = [...new Map(scopes.map(item => [scopeKeyV2(item), item])).values()].map(item => this.#host.currentFence(item));
      const preparedAt = this.#host.now(), notAfter = new Date(Math.min(Date.parse(preparedAt) + this.#configured().verificationTtlMs,
        Date.parse(this.#taskBoundary!.contentPolicy.retentionUntil), operation === "verify" && origin.execution ? Date.parse(origin.execution.spec.fence.notAfter) : Number.POSITIVE_INFINITY)).toISOString();
      if (notAfter <= preparedAt) this.#host.fail("unavailable");
      const snapshot: OutcomeVerificationSnapshotV1 = clone({ schemaVersion: 1, id: this.#id("verification"), operation, command, owner: context, task, plan, fences,
        dependencies: [...new Map(dependencies.map(item => [json(item), item])).values()], ...origin, ...(previous ? { previous } : {}), modelRequests, runtimeEvents, materials, preparedAt, notAfter });
      const content = this.#host.writeBody(scope(task.workspaceId, task.id), snapshot, snapshot.dependencies, this.#taskBoundary!);
      this.#host.db.prepare("INSERT INTO outcome_verification_v1(id,principal_id,command_id,idempotency_key,operation,workspace_id,task_id,attempt_id,task_revision,intent_revision,plan_id,owner_epoch,recovery_epoch,scope_key,content_id,content_version,created_at,not_after) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
        .run(snapshot.id, context.principalId, command.commandId, command.idempotencyKey, operation, task.workspaceId, task.id, task.attempts.at(-1)!.id, task.revision, task.intent.revision, plan.id,
          context.ownerEpoch, this.#host.recoveryEpoch(), scopeKeyV2(scope(task.workspaceId, task.id)), content.contentId, content.contentVersion, preparedAt, notAfter);
      return { snapshot: clone(snapshot) };
    });
  }
  prepare(context: TaskStoreContextV1, raw: OutcomeVerifyCommandV1): OutcomeVerificationPrepareV1 { return this.#prepare(context, parseOutcomeVerifyCommandV1(raw), "verify"); }
  prepareFeedback(context: TaskStoreContextV1, raw: OutcomeFeedbackCommandV1): OutcomeVerificationPrepareV1 { return this.#prepare(context, parseOutcomeFeedbackCommandV1(raw), "feedback"); }
  #guard(context: TaskStoreContextV1, row: Row, snapshot: OutcomeVerificationSnapshotV1): void {
    const { task, taskRow } = this.#coordinates(context, snapshot.task.id);
    if (json(context) !== json(snapshot.owner) || task.revision !== snapshot.task.revision || json(task) !== json(snapshot.task)
      || row.recovery_epoch !== this.#host.recoveryEpoch() || this.#host.now() >= snapshot.notAfter) this.#host.fail("revision_conflict");
    if (snapshot.operation === "verify" && taskRow.owner_epoch !== context.ownerEpoch) this.#host.fail("revision_conflict");
    for (const fence of snapshot.fences) if (json(this.#host.currentFence(fence.scope)) !== json(fence)) this.#host.fail("revision_conflict");
    for (const dependency of snapshot.dependencies) { const content = this.#row("SELECT scope_key FROM content_object WHERE content_id=? AND content_version=?", dependency.contentId, dependency.contentVersion); if (!content) this.#host.fail("unavailable");
      const owner = this.#row("SELECT scope_json FROM scope_catalog WHERE scope_key=?", text(content.scope_key)); if (!owner) this.#host.fail("corruption");
      if (!this.#host.dependencyAvailable(dependency, JSON.parse(text(owner.scope_json)) as ScopeV2)) this.#host.fail("unavailable"); }
    this.#origin(context, task, snapshot.operation);
  }
  #availableSources(snapshot: OutcomeVerificationSnapshotV1): boolean {
    if (snapshot.fences.some(fence => json(this.#host.currentFence(fence.scope)) !== json(fence))) return false;
    for (const dependency of snapshot.dependencies) {
      const content = this.#row("SELECT c.*,s.scope_json FROM content_object c JOIN scope_catalog s ON s.scope_key=c.scope_key WHERE c.content_id=? AND c.content_version=?", dependency.contentId, dependency.contentVersion);
      if (!content || !this.#host.dependencyAvailable(dependency, JSON.parse(text(content.scope_json)) as ScopeV2)) return false;
    }
    return true;
  }
  #committed(row: Row, context: TaskStoreContextV1): OutcomeCommitV1 | undefined {
    const result = this.#row("SELECT * FROM task_result_v1 WHERE verification_id=?", text(row.id)); if (!result) return undefined;
    const snapshot = this.#snapshot(row)!;
    if (context.principalId !== snapshot.owner.principalId || context.workspaceId !== snapshot.owner.workspaceId) this.#host.fail("conflict");
    this.#coordinates(context, snapshot.task.id); if (!this.#availableSources(snapshot)) this.#host.fail("unavailable");
    const receipt = this.#host.tasks.executeTask(context, { schemaVersion: 1, commandId: snapshot.command.commandId, idempotencyKey: snapshot.command.idempotencyKey,
      workspaceId: snapshot.command.workspaceId, expectedRevision: snapshot.task.revision, payload: { kind: "task.verify", taskId: snapshot.task.id, verificationId: snapshot.id } });
    return { ...receipt, replay: true, bundle: clone(this.#result(result)!) };
  }
  resolution(context: TaskStoreContextV1, taskId: string, id: string): TaskVerificationResolutionV1 {
    if (!this.#active || this.#active.id !== id || json(this.#active.owner) !== json(context) || this.#active.resolution.plan.task.id !== taskId) this.#host.fail("unsupported"); return clone(this.#active.resolution);
  }
  commit(context: TaskStoreContextV1, id: string, raw: readonly CriterionObservationV1[]): OutcomeCommitV1 {
    assertIdentifierV2(id); if (!Array.isArray(raw) || raw.length > 100) this.#host.fail("validation"); const supplied = raw.map(parseCriterionObservationV1);
    return this.#host.transaction(true, () => {
      const row = this.#row("SELECT * FROM outcome_verification_v1 WHERE id=? AND workspace_id=?", id, context.workspaceId); if (!row) this.#host.fail("unavailable");
      const snapshot = this.#snapshot(row)!; if (snapshot.owner.principalId !== context.principalId) this.#host.fail("conflict");
      const replay = this.#committed(row, context); if (replay) return replay;
      this.#guard(context, row, snapshot);
      let carryPrevious = false;
      if (snapshot.operation === "feedback" && snapshot.previous) {
        const previous = this.#row("SELECT * FROM task_result_v1 WHERE workspace_id=? AND task_id=? AND attempt_id=? AND task_revision=?", context.workspaceId, snapshot.task.id,
          snapshot.plan.taskAttempt.attemptId, snapshot.previous.task.revision);
        if (!previous || json(this.#result(previous)) !== json(snapshot.previous)) this.#host.fail("corruption");
        const previousVerification = this.#row("SELECT * FROM outcome_verification_v1 WHERE id=?", text(previous.verification_id))!;
        carryPrevious = this.#availableSources(this.#snapshot(previousVerification)!);
      }
      let input: ReturnType<OutcomeStoreHostV1["recordResultInput"]> | undefined;
      if (snapshot.operation === "feedback") input = this.#host.recordResultInput({ id: this.#id("observation"), scope: scope(context.workspaceId, snapshot.task.id), taskAttempt: snapshot.plan.taskAttempt,
        observedAt: this.#host.now(), source: "feedback", body: clone({ schemaVersion: 1, command: snapshot.command, principalId: context.principalId }), dependencies: [ref(row)] });
      const observations: CriterionObservationV1[] = [], evidence: EvidenceRefV2[] = [], dependencies: ContentRefV2[] = [ref(row)];
      for (const criterion of snapshot.plan.criteria) {
        let observation = supplied.find(item => item.criterionId === criterion.id);
        if (snapshot.operation === "feedback") {
          const feedback = snapshot.command as OutcomeFeedbackCommandV1;
          if (criterion.id === feedback.criterionId) observation = { schemaVersion: 1, id: this.#id("observation"), workspaceId: context.workspaceId, taskId: snapshot.task.id,
            attemptId: snapshot.plan.taskAttempt.attemptId, intentRevision: snapshot.plan.taskAttempt.intentRevision, criterionId: criterion.id, criterionRevision: criterion.revision,
            observedAt: this.#host.now(), notAfter: snapshot.notAfter, payload: { kind: "user-confirmation", decision: feedback.decision, principalId: context.principalId, input: { id: input!.evidence.source.id, revision: 1 } } };
          else observation = carryPrevious ? snapshot.previous?.observations.find(item => item.criterionId === criterion.id && item.notAfter > this.#host.now()) : undefined;
        }
        if (!observation) observation = { schemaVersion: 1, id: this.#id("observation"), workspaceId: context.workspaceId, taskId: snapshot.task.id, attemptId: snapshot.plan.taskAttempt.attemptId,
          intentRevision: snapshot.plan.taskAttempt.intentRevision, criterionId: criterion.id, criterionRevision: criterion.revision, observedAt: this.#host.now(), notAfter: snapshot.notAfter,
          payload: { kind: "unknown", reason: snapshot.task.state === "CANCELLED" ? "incomplete" : "missing-evidence" } };
        observation = parseCriterionObservationV1(observation);
        if (observation.workspaceId !== context.workspaceId || observation.taskId !== snapshot.task.id || observation.attemptId !== snapshot.plan.taskAttempt.attemptId
          || observation.intentRevision !== snapshot.plan.taskAttempt.intentRevision || observation.criterionRevision !== criterion.revision || observation.notAfter > snapshot.notAfter
          || observation.observedAt < snapshot.preparedAt && !snapshot.previous?.observations.some(item => json(item) === json(observation)) || observation.observedAt > this.#host.now()) this.#host.fail("validation");
        if (snapshot.operation === "verify" && observation.payload.kind === "user-confirmation") this.#host.fail("unsupported");
        const old = this.#row("SELECT o.*,v.workspace_id,v.task_id FROM outcome_observation_v1 o JOIN outcome_verification_v1 v ON v.id=o.verification_id WHERE o.observation_id=? LIMIT 1", observation.id);
        let recorded: { content: ContentRefV2; evidence: EvidenceRefV2 };
        if (old) {
          const body = this.#body<{ observation: CriterionObservationV1 }>(old)!;
          if (snapshot.operation !== "feedback" || json(body.observation) !== json(observation)) this.#host.fail("conflict");
          const eventRow = this.#row("SELECT event_json FROM observation_v2 WHERE id=?", observation.id)!, event = parseObservationV2(JSON.parse(text(eventRow.event_json)));
          recorded = { content: ref(old), evidence: { source: { kind: "observation", id: event.id, revision: 1 }, scope: event.scope, privacy: event.privacy, sourceTrust: event.sourceTrust, observedAt: event.observedAt, role: "supports" } };
        } else {
          recorded = this.#host.recordResultInput({ id: observation.id, scope: scope(context.workspaceId, snapshot.task.id), taskAttempt: snapshot.plan.taskAttempt,
            observedAt: observation.observedAt, source: observation.payload.kind === "user-confirmation" ? "feedback" : "verifier", body: clone({ schemaVersion: 1, observation }), dependencies: [ref(row), ...(input ? [input.content] : [])] });
        }
        this.#host.db.prepare("INSERT INTO outcome_observation_v1(verification_id,criterion_id,observation_id,input_observation_id,method,scope_key,content_id,content_version,observed_at,not_after) VALUES(?,?,?,?,?,?,?,?,?,?)")
          .run(id, criterion.id, observation.id, observation.payload.kind === "user-confirmation" ? observation.payload.input.id : null, criterion.method, scopeKeyV2(scope(context.workspaceId, snapshot.task.id)), recorded.content.contentId, recorded.content.contentVersion, observation.observedAt, observation.notAfter);
        observations.push(observation); evidence.push(recorded.evidence); dependencies.push(recorded.content);
      }
      if (snapshot.operation === "verify" && (supplied.length !== observations.length || supplied.some(item => !observations.some(observed => json(item) === json(observed))))) this.#host.fail("validation");
      const expected = this.#configured().evaluate(snapshot.task.attempts.at(-1)!, snapshot.plan, clone(observations), this.#host.now());
      this.#active = { id, owner: clone(context), resolution: { plan: snapshot.plan, observations, dependencies, evidence } };
      let committed; try { committed = this.#host.tasks.executeTask(context, { schemaVersion: 1, commandId: snapshot.command.commandId, idempotencyKey: snapshot.command.idempotencyKey,
        workspaceId: context.workspaceId, expectedRevision: snapshot.task.revision, payload: { kind: "task.verify", taskId: snapshot.task.id, verificationId: id } }); } finally { this.#active = undefined; }
      const task = this.#host.tasks.getTask(context.workspaceId, snapshot.task.id).value!, outcome = task.attempts.at(-1)!.outcomes.at(-1)!;
      if (json(outcome.criteriaResults) !== json(expected)) this.#host.fail("validation");
      const episode = this.#configured().buildEpisode({ id: snapshot.previous?.episode.id ?? this.#id("episode"), task: clone(task), ...(snapshot.previous ? { previous: clone(snapshot.previous.episode) } : {}),
        endedAt: snapshot.previous?.episode.endedAt ?? snapshot.task.attempts.at(-1)!.updatedAt, recordedAt: this.#host.now(), privacy: this.#taskBoundary!.contentPolicy.privacy,
        evidence: clone(evidence), actions: [...new Map(observations.flatMap(item => item.payload.kind === "tool-receipt" ? [[json(item.payload.action), clone(item.payload.action)] as const] : [])).values()],
        artifacts: [...new Map(observations.flatMap(item => item.payload.kind === "artifact" ? [[json(item.payload.artifact), clone(item.payload.artifact)] as const] : [])).values()],
        contextDifferences: snapshot.capsule ? [`capsule:${snapshot.capsule.capsule.id}`] : [], unresolved: clone(this.#host.tasks.readWorkingState(context.workspaceId, task.id).value?.unknown ?? []) });
      const memoryUses = this.#uses(snapshot, observations, outcome.id, outcome.revision);
      const bundle = parseTaskResultBundleV1(clone({ schemaVersion: 1, task, outcome, episode, observations, memoryUses, learning: "not-scheduled" }));
      const current = this.#row("SELECT * FROM task_snapshot_v1 WHERE task_id=? AND revision=?", task.id, task.revision)!;
      const content = this.#host.writeBody(scope(context.workspaceId, task.id), clone(bundle), [ref(current), ref(row), ...dependencies], this.#taskBoundary!);
      this.#host.db.prepare("INSERT INTO task_result_v1(verification_id,workspace_id,task_id,attempt_id,task_revision,outcome_id,outcome_revision,episode_id,episode_version,scope_key,content_id,content_version,commit_cursor,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
        .run(id, context.workspaceId, task.id, task.attempts.at(-1)!.id, task.revision, outcome.id, outcome.revision, episode.id, episode.version,
          scopeKeyV2(scope(context.workspaceId, task.id)), content.contentId, content.contentVersion, committed.commitCursor, this.#host.now());
      return { ...committed, bundle: clone(bundle) };
    });
  }
  #uses(snapshot: OutcomeVerificationSnapshotV1, observations: readonly CriterionObservationV1[], outcomeId: string, outcomeRevision: number, now = this.#host.now(), nextId = () => this.#id("use")): MemoryUseV1[] {
    if (snapshot.operation === "feedback" && snapshot.previous) return clone(snapshot.previous.memoryUses.map(use => ({ ...use, outcome: { kind: "outcome", id: outcomeId, revision: outcomeRevision }, adoption: { status: "unknown" }, benefit: { status: "unknown" } })));
    if (!snapshot.capsule) return [];
    return snapshot.modelRequests.flatMap(request => snapshot.capsule!.capsule.report.selected.map((selection, position): MemoryUseV1 => {
      const material = snapshot.materials.find(item => item.claim.id === selection.ref.id && item.claim.version === selection.ref.version && item.claim.revision === selection.ref.revision); if (!material) return this.#host.fail("unavailable");
      const received = this.#row("SELECT * FROM outcome_request_receipt_v1 WHERE binding_id=? AND request_id=?", request.bindingId, request.requestId);
      const receipt = received ? this.#body<{ toolCalls: readonly { callId: string; toolName: string; argumentsJson: string }[] }>(received)! : undefined;
      const exposure = receipt ? "sent" : "uncertain";
      const adopted = observations.filter(observation => observation.payload.kind === "tool-receipt" && receipt?.toolCalls.some(call => observation.payload.kind === "tool-receipt"
        && call.callId === observation.payload.action.id && call.toolName === observation.payload.toolName && json(JSON.parse(call.argumentsJson)) === json(JSON.parse(observation.payload.argumentsJson))));
      return { schemaVersion: 1, id: nextId(), taskAttempt: clone(snapshot.plan.taskAttempt), workspaceId: snapshot.task.workspaceId,
        request: { bindingId: request.bindingId, requestId: request.requestId, ordinal: request.ordinal }, material: clone(selection.ref), position, reason: selection.reason,
        exposure, adoption: exposure === "sent" ? this.#configured().adoption({ claim: clone(material.claim), check: snapshot.plan.adoptionChecks.find(item => json(item.material) === json(selection.ref)), observations: clone(adopted), now }) : { status: "unknown" },
        outcome: { kind: "outcome", id: outcomeId, revision: outcomeRevision }, benefit: { status: "unknown" } };
    }));
  }
  observeRequest(context: TaskStoreContextV1, input: Parameters<OutcomePersistenceV1["observeRequest"]>[1]): void {
    exact(input, ["taskId", "bindingId", "requestId", "toolCalls"]); for (const value of [input.taskId, input.bindingId, input.requestId]) assertIdentifierV2(value);
    if (!Array.isArray(input.toolCalls) || input.toolCalls.length > 10 || new Set(input.toolCalls.map(call => call.callId)).size !== input.toolCalls.length) this.#host.fail("validation");
    for (const call of input.toolCalls) { exact(call, ["callId", "toolName", "argumentsJson"]); assertIdentifierV2(call.callId); assertIdentifierV2(call.toolName);
      const args: unknown = JSON.parse(text(call.argumentsJson)); if (!args || typeof args !== "object" || Array.isArray(args) || json(args) !== call.argumentsJson) this.#host.fail("validation"); }
    this.#host.transaction(true, () => {
      const { task } = this.#coordinates(context, input.taskId), execution = this.#host.executions.readExecutionDetails(context.workspaceId, task.id);
      if (!execution || execution.bindingId !== input.bindingId || task.state !== "RUNNING" || execution.closed || !execution.dispatched || execution.ownerEpoch !== context.ownerEpoch) this.#host.fail("conflict");
      const request = this.#host.executions.listModelRequests(context.workspaceId, task.id, task.attempts.at(-1)!.id).find(item => item.bindingId === input.bindingId && item.requestId === input.requestId); if (!request) this.#host.fail("unavailable");
      const old = this.#row("SELECT * FROM outcome_request_receipt_v1 WHERE binding_id=? AND request_id=?", input.bindingId, input.requestId);
      if (old) { if (json(this.#body<{ toolCalls: unknown }>(old)!.toolCalls) !== json(input.toolCalls)) this.#host.fail("conflict"); return; }
      this.#host.validateRuntimeContext(context, execution.spec, execution.binding, { context: request.context, maxTokens: request.maxTokens });
      const observedAt = this.#host.now(), receiptId = this.#id("observation"), body = clone({ schemaVersion: 1, receiptId, kind: "actual-synthetic-model-receive", request, toolCalls: input.toolCalls, observedAt });
      const content = this.#host.writeBody(scope(context.workspaceId, task.id), body, [clone(request.contentRef)], this.#taskBoundary!);
      this.#host.db.prepare("INSERT INTO outcome_request_receipt_v1(binding_id,request_id,task_id,attempt_id,workspace_id,receipt_id,scope_key,content_id,content_version,observed_at) VALUES(?,?,?,?,?,?,?,?,?,?)")
        .run(input.bindingId, input.requestId, task.id, request.attemptId, context.workspaceId, receiptId, scopeKeyV2(scope(context.workspaceId, task.id)), content.contentId, content.contentVersion, observedAt);
    });
  }
  #result(row: Row, available = true): TaskResultBundleV1 | undefined {
    const body = this.#body(row, available); if (!body) return undefined; const bundle = parseTaskResultBundleV1(body);
    if (bundle.task.id !== row.task_id || bundle.task.revision !== row.task_revision || bundle.task.workspaceId !== row.workspace_id || bundle.outcome.attemptId !== row.attempt_id
      || bundle.outcome.id !== row.outcome_id || bundle.outcome.revision !== row.outcome_revision || bundle.episode.id !== row.episode_id || bundle.episode.version !== row.episode_version
      || bundle.outcome.recordedAt !== row.created_at) this.#host.fail("corruption"); return bundle;
  }
  read(workspaceId: string, taskId: string): TaskResultBundleV1 | undefined {
    for (const value of [workspaceId, taskId]) assertIdentifierV2(value); return this.#host.transaction(false, () => {
      const task = this.#host.tasks.getTask(workspaceId, taskId).value; if (!task) return undefined;
      const row = this.#row("SELECT * FROM task_result_v1 WHERE workspace_id=? AND task_id=? AND attempt_id=? AND task_revision=?", workspaceId, taskId, task.attempts.at(-1)!.id, task.revision);
      if (!row) return undefined;
      const verification = this.#row("SELECT * FROM outcome_verification_v1 WHERE id=?", text(row.verification_id))!, snapshot = this.#snapshot(verification, false);
      if (!snapshot) return undefined;
      if (!this.#availableSources(snapshot)) return undefined;
      const bundle = this.#result(row, false); return bundle ? clone(bundle) : undefined;
    });
  }
  history(workspaceId: string, taskId: string): readonly TaskResultBundleV1[] {
    for (const value of [workspaceId, taskId]) assertIdentifierV2(value); return this.#host.transaction(false, () => this.#rows("SELECT * FROM task_result_v1 WHERE workspace_id=? AND task_id=? ORDER BY task_revision", workspaceId, taskId).map(row => clone(this.#result(row)!)));
  }
  validateRows(): void {
    if (!this.#row("SELECT 1 FROM sqlite_schema WHERE name='outcome_plan_v1' AND type='table'")) return;
    try {
      const edge = (source: ContentRefV2, target: Row) => { if (!this.#row("SELECT 1 FROM task_content_dependency_v1 WHERE source_id=? AND source_version=? AND target_id=? AND target_version=?", source.contentId, source.contentVersion, text(target.content_id), integer(target.content_version))) throw new Error("Missing result content dependency."); };
      for (const row of this.#rows("SELECT * FROM outcome_plan_v1")) {
        const original = this.#row("SELECT s.*,t.workspace_id FROM task_snapshot_v1 s JOIN task_v1 t ON t.id=s.task_id WHERE s.task_id=? AND s.revision=?", text(row.task_id), integer(row.task_revision));
        if (!original || original.state !== "READY" || original.attempt_id !== row.attempt_id || original.owner_epoch !== row.owner_epoch || original.intent_revision !== row.intent_revision
          || original.workspace_id !== row.workspace_id || row.scope_key !== scopeKeyV2(scope(text(row.workspace_id), text(row.task_id)))
          || this.#row("SELECT 1 FROM task_execution_snapshot_v1 WHERE task_id=? AND attempt_id=? AND dispatched=1 AND created_at<?", text(row.task_id), text(row.attempt_id), text(row.created_at))) throw new Error("Plan registration projection mismatch.");
        edge(ref(original), row); const plan = this.#plan(row, false);
        const taskBody = this.#body<{ task: Task }>(original, false); if (plan && taskBody && json(plan.criteria) !== json(parseSessionTaskV1(taskBody.task).intent.criteria)) throw new Error("Plan criteria changed.");
      }
      for (const row of this.#rows("SELECT * FROM outcome_verification_v1")) {
        const plan = this.#row("SELECT * FROM outcome_plan_v1 WHERE id=?", text(row.plan_id)), original = this.#row("SELECT s.*,t.workspace_id FROM task_snapshot_v1 s JOIN task_v1 t ON t.id=s.task_id WHERE s.task_id=? AND s.revision=?", text(row.task_id), integer(row.task_revision));
        if (!plan || !original || original.attempt_id !== row.attempt_id || plan.task_id !== row.task_id || plan.attempt_id !== row.attempt_id || plan.intent_revision !== row.intent_revision
          || original.workspace_id !== row.workspace_id || original.intent_revision !== row.intent_revision || row.scope_key !== plan.scope_key || integer(row.recovery_epoch) > this.#host.recoveryEpoch()
          || text(row.not_after) <= text(row.created_at)) throw new Error("Verification reservation projection mismatch.");
        edge(ref(plan), row); edge(ref(original), row); this.#snapshot(row, false);
      }
      for (const row of this.#rows("SELECT o.*,v.workspace_id,v.task_id FROM outcome_observation_v1 o JOIN outcome_verification_v1 v ON v.id=o.verification_id")) {
        const parent = this.#row("SELECT * FROM outcome_verification_v1 WHERE id=?", text(row.verification_id))!, eventRow = this.#row("SELECT * FROM observation_v2 WHERE id=?", text(row.observation_id));
        if (!eventRow || eventRow.scope_key !== row.scope_key || eventRow.content_id !== row.content_id || eventRow.content_version !== row.content_version) throw new Error("Criterion observation projection mismatch.");
        const event = parseObservationV2(JSON.parse(text(eventRow.event_json))), body = this.#body<{ schemaVersion: 1; observation: CriterionObservationV1 }>(row, false);
        if (event.observedAt !== row.observed_at) throw new Error("Criterion observation time mismatch.");
        if (body) { exact(body, ["schemaVersion", "observation"]); const observation = parseCriterionObservationV1(body.observation);
          if (body.schemaVersion !== 1 || observation.id !== row.observation_id || observation.criterionId !== row.criterion_id || observation.observedAt !== row.observed_at || observation.notAfter !== row.not_after
            || observation.taskId !== row.task_id || observation.attemptId !== parent.attempt_id || observation.intentRevision !== parent.intent_revision || observation.workspaceId !== row.workspace_id
            || (observation.payload.kind === "user-confirmation" ? observation.payload.input.id : null) !== row.input_observation_id) throw new Error("Criterion observation body mismatch."); }
        if (event.source.adapter !== "outcome-verifier-v1" || event.source.surface !== (row.input_observation_id === null ? "synthetic" : "local-api")
          || event.actor !== (row.input_observation_id === null ? "tool" : "user") || event.sourceTrust !== (row.input_observation_id === null ? "verified-tool" : "user-direct")
          || event.integrity.status !== "complete") throw new Error("Criterion producer mismatch.");
        if (!this.#row("SELECT 1 FROM task_result_v1 WHERE verification_id=?", text(row.verification_id))) throw new Error("Partially committed criterion observations.");
      }
      for (const row of this.#rows("SELECT * FROM outcome_request_receipt_v1")) {
        const request = this.#row("SELECT m.*,e.workspace_id FROM task_model_request_v1 m JOIN task_execution_v1 e ON e.binding_id=m.binding_id WHERE m.binding_id=? AND m.request_id=?", text(row.binding_id), text(row.request_id));
        if (!request || request.task_id !== row.task_id || request.attempt_id !== row.attempt_id || request.scope_key !== row.scope_key || request.created_at! > row.observed_at!) throw new Error("Receiving receipt projection mismatch.");
        edge(ref(request), row); const body = this.#body<{ schemaVersion: 1; receiptId: string; kind: string; request: unknown; toolCalls: { callId: string; toolName: string; argumentsJson: string }[]; observedAt: string }>(row, false);
        if (body) { exact(body, ["schemaVersion", "receiptId", "kind", "request", "toolCalls", "observedAt"]); const requestBody = this.#body(request, false);
          if (body.schemaVersion !== 1 || body.receiptId !== row.receipt_id || body.kind !== "actual-synthetic-model-receive" || body.observedAt !== row.observed_at) throw new Error("Receiving receipt body mismatch.");
          if (!Array.isArray(body.toolCalls) || body.toolCalls.length > 10 || new Set(body.toolCalls.map(call => call.callId)).size !== body.toolCalls.length) throw new Error("Invalid received tool calls.");
          for (const call of body.toolCalls) { exact(call, ["callId", "toolName", "argumentsJson"]); assertIdentifierV2(call.callId); assertIdentifierV2(call.toolName);
            const args: unknown = JSON.parse(call.argumentsJson); if (!args || typeof args !== "object" || Array.isArray(args) || json(args) !== call.argumentsJson) throw new Error("Invalid received tool arguments."); }
          // The request's durable projection remains the existing execution validator's responsibility.
          const received = body.request as OutcomeVerificationSnapshotV1["modelRequests"][number], { contentRef: _content, ...projection } = received;
          if (received.bindingId !== row.binding_id || received.requestId !== row.request_id || received.taskId !== row.task_id || json(received.contentRef) !== json(ref(request))
            || requestBody && json(projection) !== json(requestBody)) throw new Error("Receiving request identity mismatch.");
        }
      }
      const versions = new Map<string, TaskResultBundleV1 | undefined>();
      for (const row of this.#rows("SELECT * FROM task_result_v1 ORDER BY task_id,attempt_id,episode_version")) {
        const parent = this.#row("SELECT * FROM outcome_verification_v1 WHERE id=?", text(row.verification_id))!, task = this.#row("SELECT s.*,t.workspace_id FROM task_snapshot_v1 s JOIN task_v1 t ON t.id=s.task_id WHERE s.task_id=? AND s.revision=?", text(row.task_id), integer(row.task_revision));
        const receipt = this.#row("SELECT * FROM task_receipt_v1 WHERE command_kind='task.verify' AND entity_id=? AND revision=?", text(row.task_id), integer(row.task_revision));
        if (!parent || !task || !receipt || task.revision !== integer(parent.task_revision) + 1 || task.attempt_id !== row.attempt_id || parent.task_id !== row.task_id || parent.workspace_id !== row.workspace_id
          || receipt.command_id !== parent.command_id || receipt.idempotency_key !== parent.idempotency_key || receipt.commit_cursor !== row.commit_cursor || row.created_at !== task.created_at) throw new Error("Result transaction projection mismatch.");
        edge(ref(task), row); edge(ref(parent), row); const key = json([row.task_id, row.attempt_id]), previous = versions.get(key), bundle = this.#result(row, false), snapshot = this.#snapshot(parent, false);
        const count = this.#rows("SELECT * FROM outcome_observation_v1 WHERE verification_id=?", text(row.verification_id));
        if (bundle && (count.length !== bundle.outcome.criteriaResults.length || count.some(item => !bundle.observations.some(observation => observation.id === item.observation_id && observation.criterionId === item.criterion_id)))) throw new Error("Result evidence coverage mismatch.");
        if (bundle && snapshot && this.#boundary && json(this.#boundary.evaluate(snapshot.task.attempts.at(-1)!, snapshot.plan, bundle.observations, bundle.outcome.recordedAt)) !== json(bundle.outcome.criteriaResults)) throw new Error("Stored result does not match its declared checks.");
        if (bundle && snapshot && this.#boundary) { let index = 0;
          const uses = this.#uses(snapshot, bundle.observations, bundle.outcome.id, bundle.outcome.revision, bundle.outcome.recordedAt, () => bundle.memoryUses[index++]?.id ?? "missing-use");
          if (json(uses) !== json(bundle.memoryUses)) throw new Error("Stored memory use does not match actual receiving and action records."); }
        if (bundle && previous && (bundle.episode.id !== previous.episode.id || bundle.episode.version !== previous.episode.version + 1 || bundle.episode.createdAt !== previous.episode.createdAt || bundle.episode.endedAt !== previous.episode.endedAt)) throw new Error("Episode history mismatch.");
        versions.set(key, bundle);
      }
    } catch { this.#host.fail("corruption"); }
  }
}
