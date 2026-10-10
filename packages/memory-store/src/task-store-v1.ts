/** Task/session persistence owns durable CAS and historical integrity, never task-success judgment. */
import type { DatabaseSync, SQLOutputValue } from "node:sqlite";
import { assertIdentifierV2, assertRevisionV2, assertPrivacyV2, assertIsoTimestampV2, assertWorkingStateV2,
  scopeKeyV2, isTerminalTaskState, sameTaskIntent,
  type ContentRefV2, type ScopeV2, type PrivacyV2, type EvidenceRefV2, type Task, type TaskState, type WorkingStateV2 } from "../../domain/src/index.ts";
import { canonicalJsonV1, parseSessionTaskV1, parseSessionCreateCommandV1, parseSessionV1, parseLocalApiCommandV1,
  parseLocalApiReceiptV1, parseProductEventV1, parseObservationV2, parseNormalizedRuntimeEnvelopeV1,
  type LocalApiCommandV1, type LocalApiResultV1, type ProductEventV1, type SessionCreateCommandV1, type SessionV1,
  type TaskSummaryV1, type NormalizedRuntimeEnvelopeV1 } from "../../protocol/src/index.ts";
import type { CognitiveStoreErrorCodeV2 } from "./cognitive-store-v2.ts";
import type { TaskExecutionReadV1 } from "./task-execution-v1-types.ts";
import type { TaskPersistenceBoundaryV1, TaskPersistenceStoreV1, TaskStoreContextV1, TaskStoreCommandV1, TaskRuntimeCommandV1,
  TaskStoreCommitV1, TaskStoreReceiptV1, TaskStoreReadV1, TaskStoreSnapshotV1, TaskStoreReplayV1, TaskOutboxRowV1,
  RuntimeInputSnapshotV1, TaskInputCommitV1, TaskInputCommitResultV1 } from "./task-store-v1-types.ts";
export interface TaskStoreHostV1 {
  readonly db: DatabaseSync;
  transaction<T>(write: boolean, body: () => T): T;
  now(): string;
  recoveryEpoch(): number;
  registerScope(scope: ScopeV2): void;
  content(ref: ContentRefV2, scope: ScopeV2, available: boolean): { bytes?: Uint8Array; privacy: PrivacyV2; retentionUntil: string };
  writeBody(scope: ScopeV2, body: unknown, dependencies: readonly ContentRefV2[], boundary: TaskPersistenceBoundaryV1): ContentRefV2;
  recordCommandEvidence(scope: ScopeV2, command: LocalApiCommandV1, dependencies: readonly ContentRefV2[], boundary: TaskPersistenceBoundaryV1): { content: ContentRefV2; evidence: EvidenceRefV2 };
  executionForReduction(workspaceId: string, taskId: string): TaskExecutionReadV1 | undefined;
  onExecutionSettled(context: TaskStoreContextV1, envelope: NormalizedRuntimeEnvelopeV1): void;
  fail(code: CognitiveStoreErrorCodeV2): never;
}
type Row = Record<string, SQLOutputValue>;
const json = canonicalJsonV1;
function string(value: SQLOutputValue): string { if (typeof value !== "string") throw new Error("invalid string"); return value; }
function integer(value: SQLOutputValue): number { if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new Error("invalid integer"); return value; }
function ref(row: Row): ContentRefV2 { return { contentId: string(row.content_id), contentVersion: integer(row.content_version) }; }
function taskScope(workspaceId: string, taskId: string): ScopeV2 { return { kind: "task", workspaceId, taskId }; }
function sessionScope(workspaceId: string, sessionId: string): ScopeV2 { return { kind: "session", workspaceId, sessionId }; }
function exact(value: unknown, required: readonly string[], optional: readonly string[] = []): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error("invalid shape");
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).some(key => typeof key !== "string" || ![...required, ...optional].includes(key)
    || !("value" in descriptors[key]) || !descriptors[key].enumerable || descriptors[key].value === undefined)
    || required.some(key => !Object.hasOwn(descriptors, key))) throw new Error("invalid fields");
}
function bounded(value: number): number { assertRevisionV2(value); if (value > 1000) throw new Error("invalid limit"); return value; }
function parseStored(value: string): unknown { const result: unknown = JSON.parse(value); if (json(result) !== value) throw new Error("noncanonical JSON"); return result; }
function summary(task: Task): TaskSummaryV1 { return { id: task.id, workspaceId: task.workspaceId, sessionId: task.sessionId,
  revision: task.revision, intentRevision: task.intent.revision, state: task.state, updatedAt: task.updatedAt }; }
function receiptResult(task: Task): Extract<LocalApiResultV1, { kind: "task" }> {
  const attempt = task.attempts.at(-1)!, outcome = attempt.outcomes.at(-1), initial = attempt.outcomes[0];
  return { kind: "task", taskState: task.state, intentRevision: task.intent.revision,
    ...(outcome ? { outcome: { ref: { kind: "outcome" as const, id: outcome.id, revision: outcome.revision }, status: outcome.status } } : {}),
    ...(outcome && outcome.revision > 1 ? { initialOutcome: { ref: { kind: "outcome" as const, id: initial!.id, revision: initial!.revision }, status: initial!.status } } : {}) };
}
/** Independently reject forged history even when a configured reducer is incorrect. */
export function assertTaskHistoryExtensionV1(prior: Task | undefined, input: Task): Task {
  const next = parseSessionTaskV1(input), outcomeIds = new Set<string>();
  next.attempts.forEach((attempt, index) => {
    if (index < next.attempts.length - 1 && !isTerminalTaskState(attempt.state)) throw new Error("multiple nonterminal attempts");
    if (attempt.outcomes.length) { if (outcomeIds.has(attempt.outcomes[0]!.id)) throw new Error("reused outcome identity"); outcomeIds.add(attempt.outcomes[0]!.id); }
    if (isTerminalTaskState(attempt.state) && attempt.state !== "CANCELLED" && !attempt.outcomes.length) throw new Error("missing terminal outcome");
    if (!isTerminalTaskState(attempt.state) && attempt.outcomes.length) throw new Error("nonterminal outcome");
    if (attempt.outcomes.length && (attempt.outcomes[0]!.status.toUpperCase() !== attempt.state
      || (attempt.state === "CANCELLED") !== (attempt.outcomes.at(-1)!.status === "cancelled"))) throw new Error("terminal classification mismatch");
  });
  if (!prior) {
    const attempt = next.attempts[0]!;
    if (next.revision !== 1 || next.intent.revision !== 1 || next.state !== "CREATED" || next.attempts.length !== 1
      || attempt.outcomes.length || next.createdAt !== next.updatedAt || attempt.createdAt !== next.createdAt || attempt.updatedAt !== next.createdAt
      || attempt.pauseRequested || attempt.cancellationRequested || attempt.completeness !== "not-settled" || attempt.unresolvedActions.length) throw new Error("forged initial history");
    return next;
  }
  if (next.revision !== prior.revision + 1 || next.id !== prior.id || next.workspaceId !== prior.workspaceId || next.sessionId !== prior.sessionId
    || next.createdAt !== prior.createdAt || next.updatedAt < prior.updatedAt || next.attempts.length < prior.attempts.length
    || next.attempts.length > prior.attempts.length + 1) throw new Error("invalid history revision");
  const appending = next.attempts.length > prior.attempts.length;
  for (const [index, old] of prior.attempts.entries()) {
    const current = next.attempts[index]!;
    if (appending || index < prior.attempts.length - 1) { if (json(current) !== json(old)) throw new Error("historical attempt changed"); continue; }
    if (current.id !== old.id || current.taskId !== old.taskId || current.workspaceId !== old.workspaceId || current.createdAt !== old.createdAt
      || !sameTaskIntent(current.intent, old.intent) || current.updatedAt < old.updatedAt || current.outcomes.length < old.outcomes.length
      || current.outcomes.length > old.outcomes.length + 1 || old.outcomes.some((outcome, i) => json(outcome) !== json(current.outcomes[i]))) throw new Error("historical intent or outcome changed");
    if (!isTerminalTaskState(old.state)) {
      const allowed: Readonly<Partial<Record<TaskState, readonly TaskState[]>>> = {
        CREATED: ["READY", "WAITING_INPUT", "CANCELLING"], READY: ["RUNNING", "WAITING_INPUT", "WAITING_APPROVAL", "CANCELLING"],
        RUNNING: ["RUNNING", "VERIFYING", "PAUSED", "CANCELLING", "NEEDS_RECONCILIATION"], VERIFYING: ["COMPLETED", "PARTIAL", "FAILED", "UNVERIFIABLE", "CANCELLED", "CANCELLING"],
        WAITING_INPUT: ["READY", "CANCELLING"], WAITING_APPROVAL: ["READY", "CANCELLING"], PAUSED: ["CANCELLING"], CANCELLING: ["CANCELLED", "NEEDS_RECONCILIATION"], NEEDS_RECONCILIATION: ["VERIFYING", "CANCELLING"] };
      if (!allowed[old.state]?.includes(current.state) || (old.cancellationRequested && !current.cancellationRequested)) throw new Error("illegal task transition");
      if (old.state === "RUNNING" && current.state === "RUNNING" && (old.pauseRequested || !current.pauseRequested)) throw new Error("unrecorded progress transition");
    } else {
      const without = ({ outcomes: _outcomes, updatedAt: _at, ...rest }: typeof old) => rest;
      if (json(without(current)) !== json(without(old)) || current.outcomes.length !== old.outcomes.length + 1) throw new Error("terminal attempt rewritten");
    }
  }
  if (appending) {
    const old = prior.attempts.at(-1)!, current = next.attempts.at(-1)!;
    if (!isTerminalTaskState(old.state) || current.state !== "CREATED" || current.outcomes.length || current.intent.revision < old.intent.revision
      || current.intent.revision > old.intent.revision + 1 || (current.intent.revision === old.intent.revision && !sameTaskIntent(current.intent, old.intent))
      || current.createdAt !== next.updatedAt || current.updatedAt !== next.updatedAt || current.pauseRequested || current.cancellationRequested
      || current.completeness !== "not-settled" || current.unresolvedActions.length) throw new Error("invalid new attempt");
  } else if (!sameTaskIntent(next.intent, prior.intent)) throw new Error("intent changed within attempt");
  return next;
}
export class TaskStoreEngineV1 implements TaskPersistenceStoreV1 {
  readonly #host: TaskStoreHostV1;
  readonly #boundary: TaskPersistenceBoundaryV1 | undefined;
  constructor(host: TaskStoreHostV1, boundary?: TaskPersistenceBoundaryV1) { this.#host = host; this.#boundary = boundary; }
  #row(sql: string, ...values: (string | number | null)[]): Row | undefined { return this.#host.db.prepare(sql).get(...values) as Row | undefined; }
  #rows(sql: string, ...values: (string | number | null)[]): Row[] { return this.#host.db.prepare(sql).all(...values) as Row[]; }
  #run(sql: string, ...values: (string | number | null)[]): void { this.#host.db.prepare(sql).run(...values); }
  #writeBoundary(): TaskPersistenceBoundaryV1 {
    const boundary = this.#boundary; if (!boundary) return this.#host.fail("unsupported");
    assertIdentifierV2(boundary.daemonInstanceId); assertPrivacyV2(boundary.contentPolicy.privacy); assertIsoTimestampV2(boundary.contentPolicy.retentionUntil); return boundary;
  }
  #id(kind: Parameters<TaskPersistenceBoundaryV1["ids"]["next"]>[0]): string { const id = this.#writeBoundary().ids.next(kind); assertIdentifierV2(id); return id; }
  #context(context: TaskStoreContextV1, workspaceId: string): void {
    exact(context, ["principalId", "workspaceId", "daemonInstanceId", "ownerEpoch"]);
    assertIdentifierV2(context.principalId); assertIdentifierV2(context.workspaceId); assertIdentifierV2(context.daemonInstanceId); assertRevisionV2(context.ownerEpoch);
    if (workspaceId !== context.workspaceId || context.daemonInstanceId !== this.#writeBoundary().daemonInstanceId) this.#host.fail("revision_conflict");
  }
  #owner(context: TaskStoreContextV1, row: Row): void { if (row.workspace_id !== context.workspaceId || row.owner_instance_id !== context.daemonInstanceId || row.owner_epoch !== context.ownerEpoch) this.#host.fail("revision_conflict"); }
  #watermark(workspaceId: string): number { return integer(this.#row("SELECT coalesce(max(cursor),0) AS cursor FROM task_outbox_v1 WHERE workspace_id=?", workspaceId)!.cursor); }
  #body(row: Row, scope: ScopeV2, available = true): Record<string, unknown> | undefined {
    const content = this.#host.content(ref(row), scope, available); if (!content.bytes) return undefined;
    const body = parseStored(new TextDecoder("utf-8", { fatal: true }).decode(content.bytes));
    if (!body || typeof body !== "object" || Array.isArray(body)) this.#host.fail("corruption"); return body as Record<string, unknown>;
  }
  #session(row: Row, available = true): SessionV1 | undefined {
    const body = this.#body(row, sessionScope(string(row.workspace_id), string(row.id)), available); if (!body) return undefined;
    return parseSessionV1({ schemaVersion: 1, id: row.id, workspaceId: row.workspace_id, revision: row.revision,
      ownerEpoch: row.owner_epoch, contract: body.contract, createdAt: row.created_at, updatedAt: row.updated_at });
  }
  #taskRow(workspaceId: string, id: string): Row | undefined { return this.#row("SELECT s.*,t.workspace_id,t.session_id FROM task_v1 t JOIN task_snapshot_v1 s ON s.task_id=t.id AND s.revision=t.current_revision WHERE t.workspace_id=? AND t.id=?", workspaceId, id); }
  #task(row: Row, available = true): Task | undefined { const body = this.#body(row, taskScope(string(row.workspace_id), string(row.task_id)), available); return body ? parseSessionTaskV1(body.task) : undefined; }
  #event(workspaceId: string, aggregate: ProductEventV1["aggregate"], type: ProductEventV1["type"], payload: unknown): ProductEventV1 {
    return parseProductEventV1({ schemaVersion: 1, eventId: this.#id("event"), workspaceId, aggregate, occurredAt: this.#host.now(), type, payload });
  }
  #outbox(event: ProductEventV1, ownerEpoch: number): number {
    const checked = parseProductEventV1(event);
    if (checked.type === "task.progress" && checked.payload.checkpoint !== undefined) this.#host.fail("validation");
    return Number(this.#host.db.prepare("INSERT INTO task_outbox_v1(event_id,workspace_id,entity_kind,entity_id,revision,event_type,owner_epoch,recovery_epoch,occurred_at,publish_state,event_json) VALUES(?,?,?,?,?,?,?,?,?,'pending',?)")
      .run(checked.eventId, checked.workspaceId, checked.aggregate.kind, checked.aggregate.id, checked.aggregate.revision, checked.type, ownerEpoch, this.#host.recoveryEpoch(), checked.occurredAt, json(checked)).lastInsertRowid);
  }
  #replayReceipt(context: TaskStoreContextV1, command: { commandId: string; idempotencyKey: string; payload: { kind: string } }): TaskStoreCommitV1 | undefined {
    const rows = this.#rows("SELECT * FROM task_receipt_v1 WHERE principal_id=? AND ((command_kind=? AND idempotency_key=?) OR command_id=?)", context.principalId, command.payload.kind, command.idempotencyKey, command.commandId);
    if (rows.length > 1) this.#host.fail("conflict"); const row = rows[0]; if (!row) return undefined;
    if (row.workspace_id !== context.workspaceId || row.command_kind !== command.payload.kind || row.idempotency_key !== command.idempotencyKey) this.#host.fail("conflict");
    const scope = row.entity_kind === "session" ? sessionScope(context.workspaceId, string(row.entity_id)) : taskScope(context.workspaceId, string(row.entity_id)), body = this.#body(row, scope)!;
    const semantic = (value: unknown) => { const { commandId: _id, ...rest } = value as Record<string, unknown>; return rest; };
    if (json(semantic(body.command)) !== json(semantic(command))) this.#host.fail("conflict");
    const receipt = body.receipt as TaskStoreReceiptV1;
    if (!receipt || receipt.commandId !== row.command_id || receipt.aggregate.id !== row.entity_id || receipt.aggregate.revision !== row.revision) this.#host.fail("corruption");
    return { receipt: structuredClone(receipt), commitCursor: integer(row.commit_cursor), replay: true };
  }
  #receipt(context: TaskStoreContextV1, command: { commandId: string; idempotencyKey: string; payload: { kind: string } }, receipt: TaskStoreReceiptV1, cursor: number, content: ContentRefV2, scope: ScopeV2): TaskStoreCommitV1 {
    this.#run("INSERT INTO task_receipt_v1(principal_id,command_kind,idempotency_key,command_id,workspace_id,entity_kind,entity_id,revision,commit_cursor,content_id,content_version,scope_key) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
      context.principalId, command.payload.kind, command.idempotencyKey, command.commandId, context.workspaceId, receipt.aggregate.kind, receipt.aggregate.id, receipt.aggregate.revision, cursor, content.contentId, content.contentVersion, scopeKeyV2(scope));
    return { receipt: structuredClone(receipt), commitCursor: cursor, replay: false };
  }
  createSession(context: TaskStoreContextV1, raw: SessionCreateCommandV1): TaskStoreCommitV1 {
    const command = parseSessionCreateCommandV1(raw); this.#context(context, command.workspaceId); if (context.ownerEpoch !== 1) this.#host.fail("revision_conflict");
    return this.#host.transaction(true, () => {
      const replay = this.#replayReceipt(context, command); if (replay) return replay;
      const id = this.#id("session"), now = this.#host.now(), scope = sessionScope(context.workspaceId, id); this.#host.registerScope(scope);
      const receipt: TaskStoreReceiptV1 = { schemaVersion: 1, commandId: command.commandId, status: "committed", aggregate: { kind: "session", id, revision: 1 }, result: { kind: "session", ownerEpoch: 1 } };
      const content = this.#host.writeBody(scope, { schemaVersion: 1, contract: structuredClone(command.payload.contract), command, receipt }, [], this.#writeBoundary());
      this.#run("INSERT INTO session_v1(id,workspace_id,scope_key,revision,owner_epoch,owner_instance_id,requires_reauthorization,contract_revision,content_id,content_version,created_at,updated_at) VALUES(?,?,?,1,1,?,0,1,?,?,?,?)",
        id, context.workspaceId, scopeKeyV2(scope), context.daemonInstanceId, content.contentId, content.contentVersion, now, now);
      const cursor = this.#outbox(this.#event(context.workspaceId, receipt.aggregate, "session.created", { ownerEpoch: 1 }), 1);
      return this.#receipt(context, command, receipt, cursor, content, scope);
    });
  }
  executeTask(context: TaskStoreContextV1, raw: TaskStoreCommandV1): TaskStoreCommitV1 {
    let command: TaskStoreCommandV1; try { command = this.#command(raw); } catch { return this.#host.fail("validation"); }
    this.#context(context, command.workspaceId);
    return this.#host.transaction(true, () => {
      const taskId = command.payload.kind === "task.create" ? undefined : "targetRef" in command.payload ? command.payload.targetRef.id : command.payload.kind === "task.runtime" ? command.payload.taskId : this.#host.fail("unsupported");
      const currentRow = taskId ? this.#taskRow(context.workspaceId, taskId) : undefined; if (taskId && !currentRow) this.#host.fail("unavailable");
      const sessionId = command.payload.kind === "task.create" ? command.payload.sessionId : string(currentRow!.session_id);
      const sessionRow = this.#row("SELECT * FROM session_v1 WHERE workspace_id=? AND id=?", context.workspaceId, sessionId); if (!sessionRow) this.#host.fail("unavailable"); this.#owner(context, sessionRow);
      const replay = this.#replayReceipt(context, command); if (replay) return replay;
      if (command.payload.kind === "task.runtime" && command.payload.event !== "interrupted" && currentRow?.owner_epoch !== context.ownerEpoch) this.#host.fail("revision_conflict");
      if ((currentRow ? integer(currentRow.revision) : 0) !== command.expectedRevision) this.#host.fail("revision_conflict");
      const current = currentRow ? this.#task(currentRow)! : undefined, session = this.#session(sessionRow)!;
      const id = taskId ?? this.#id("task"), scope = taskScope(context.workspaceId, id), now = this.#host.now(); this.#host.registerScope(scope);
      if (command.payload.kind === "task.create" && json(command.payload.executionProfile) !== json(session.contract.runtimeProfile)) this.#host.fail("conflict");
      const accepted = command.payload.kind === "task.runtime" ? undefined : this.#host.recordCommandEvidence(scope, command as LocalApiCommandV1, [ref(sessionRow), ...(currentRow ? [ref(currentRow)] : [])], this.#writeBoundary());
      const evidence = accepted ? [accepted.evidence] : currentRow ? (this.#body(currentRow, scope)!.workingState as WorkingStateV2).evidence : [];
      const activeExecution = current ? this.#host.executionForReduction(context.workspaceId, current.id) : undefined;
      const runtimeDependencies = command.payload.kind === "task.runtime" ? this.#runtimeEvidence(context, command as TaskRuntimeCommandV1, current!, activeExecution) : [];
      const attemptId = this.#id("attempt"), outcomeId = this.#id("outcome");
      const reduced = this.#writeBoundary().reduce(current ? structuredClone(current) : undefined, structuredClone(command), { now, session: structuredClone(session), taskId: id,
        attemptId, nextRevision: command.expectedRevision + 1, outcomeId, requiresReauthorization: currentRow?.owner_epoch !== context.ownerEpoch,
        evidence: structuredClone(evidence), privacy: evidence.some(item => item.privacy === "local-only") ? "local-only" : this.#writeBoundary().contentPolicy.privacy, ...(activeExecution ? { activeExecution } : {}) });
      exact(reduced, ["versions"], ["workingStates"]);
      if (!Array.isArray(reduced.versions) || !reduced.versions.length || reduced.versions.length > 16) this.#host.fail("validation");
      if (reduced.workingStates !== undefined && (!Array.isArray(reduced.workingStates) || reduced.workingStates.length !== reduced.versions.length)) this.#host.fail("validation");
      const versions = reduced.versions.map(value => parseSessionTaskV1(value)), final = versions.at(-1)!; this.#operationReduction(command, current, versions);
      if (final.state === "CANCELLED" && activeExecution && !activeExecution.closed) this.#host.fail("conflict");
      const receipt: TaskStoreReceiptV1 = { schemaVersion: 1, commandId: command.commandId, status: "committed", aggregate: { kind: "task", id, revision: final.revision }, result: receiptResult(final) };
      parseLocalApiReceiptV1({ ...receipt, eventCursor: "validated" });
      const finalAttempt = final.attempts.at(-1)!;
      if ((!current || final.attempts.length > current.attempts.length) && finalAttempt.id !== attemptId) this.#host.fail("validation");
      for (const [index, attempt] of final.attempts.entries()) for (const outcome of attempt.outcomes.slice(current?.attempts[index]?.outcomes.length ?? 0))
        if (outcome.id !== outcomeId) this.#host.fail("validation");
      if (sessionRow.requires_reauthorization === 1 && command.payload.kind !== "task.runtime" && (command.payload.kind === "task.create" || (current && finalAttempt.id !== current.attempts.at(-1)!.id))) {
        const revision = integer(sessionRow.revision) + 1; assertRevisionV2(revision);
        if (this.#host.db.prepare("UPDATE session_v1 SET revision=?,requires_reauthorization=0,updated_at=? WHERE id=? AND revision=? AND owner_epoch=?").run(revision, now, sessionId, integer(sessionRow.revision), context.ownerEpoch).changes !== 1) this.#host.fail("revision_conflict");
        // Publish before Task versions so the final Task cursor covers the entire transaction.
        this.#outbox(this.#event(context.workspaceId, { kind: "session", id: sessionId, revision }, "session.owner_fenced", { ownerEpoch: context.ownerEpoch }), context.ownerEpoch);
      }
      let previous = current, previousContent = currentRow ? ref(currentRow) : ref(sessionRow), finalContent: ContentRefV2 | undefined, cursor = 0;
      for (const [index, next] of versions.entries()) {
        assertTaskHistoryExtensionV1(previous, next);
        if (next.id !== id || next.workspaceId !== context.workspaceId || next.sessionId !== sessionId || next.updatedAt !== now) this.#host.fail("validation");
        const working = reduced.workingStates === undefined ? this.#working(next, evidence) : this.#validateWorking(reduced.workingStates[index], next);
        const workingDependencies = working.evidence.map(item => { const row = this.#row("SELECT event_json FROM observation_v2 WHERE id=?", item.source.id); if (!row) this.#host.fail("unavailable");
          const event = parseObservationV2(parseStored(string(row.event_json))); if (event.content.availability !== "available") this.#host.fail("unavailable"); return event.content.ref; });
        const content = this.#host.writeBody(scope, { schemaVersion: 1, task: next, workingState: working, command: structuredClone(command), receipt: structuredClone(receipt) },
          [previousContent, ...(accepted ? [accepted.content] : []), ...runtimeDependencies, ...workingDependencies], this.#writeBoundary());
        this.#persistVersion(previous, next, content, context.ownerEpoch);
        cursor = this.#outbox(this.#event(context.workspaceId, { kind: "task", id, revision: next.revision }, previous ? "task.state_changed" : "task.created", { state: next.state, intentRevision: next.intent.revision }), context.ownerEpoch);
        previous = next; previousContent = content; finalContent = content;
      }
      const attempt = final.attempts.at(-1)!, ordinal = integer(this.#row("SELECT coalesce(max(ordinal),0)+1 AS ordinal FROM task_input_v1 WHERE attempt_id=?", attempt.id)!.ordinal);
      this.#run("INSERT INTO task_input_v1(id,task_id,attempt_id,task_revision,intent_revision,kind,ordinal,owner_epoch,content_id,content_version,scope_key) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
        this.#id("input"), id, attempt.id, final.revision, final.intent.revision, command.payload.kind === "task.runtime" ? "internal_command" : "user_command", ordinal, context.ownerEpoch,
        (accepted?.content ?? finalContent!).contentId, (accepted?.content ?? finalContent!).contentVersion, scopeKeyV2(scope));
      return this.#receipt(context, command, receipt, cursor, finalContent!, scope);
    });
  }
  #runtimeEvidence(context: TaskStoreContextV1, command: TaskRuntimeCommandV1, task: Task, active: TaskExecutionReadV1 | undefined): ContentRefV2[] {
    if (command.payload.event === "prepare") return [];
    if (!active || active.attemptId !== task.attempts.at(-1)!.id || !command.payload.evidenceRefs?.length) this.#host.fail("unavailable");
    const execution = this.#row("SELECT e.*,s.content_id,s.content_version,s.state,s.closed,s.dispatched FROM task_execution_v1 e JOIN task_execution_snapshot_v1 s ON s.binding_id=e.binding_id AND s.revision=e.current_revision WHERE e.binding_id=? AND e.task_id=?", active.bindingId, task.id)!;
    const dependencies: ContentRefV2[] = [], scope = taskScope(context.workspaceId, task.id); let settled = false, bindingReceipt = false;
    for (const evidence of command.payload.evidenceRefs) {
      if (evidence.id === active.bindingId && evidence.revision === execution.current_revision) { this.#host.content(ref(execution), scope, true); dependencies.push(ref(execution)); bindingReceipt = true; continue; }
      const event = this.#row("SELECT * FROM task_execution_event_v1 WHERE event_id=? AND binding_id=?", evidence.id, active.bindingId);
      if (!event || evidence.revision !== 1) this.#host.fail("unavailable");
      const content = this.#host.content(ref(event), scope, true); if (!content.bytes) this.#host.fail("unavailable");
      const envelope = parseNormalizedRuntimeEnvelopeV1(parseStored(new TextDecoder("utf-8", { fatal: true }).decode(content.bytes)));
      if (envelope.event.data.kind === "agent.lifecycle" && envelope.event.data.phase === "settled") settled = true; dependencies.push(ref(event));
    }
    switch (command.payload.event) {
      case "start": if (!bindingReceipt || active.state !== "READY" || active.dispatched || active.closed) this.#host.fail("conflict"); break;
      case "settled": if (!settled || !active.dispatched || command.payload.completeness !== "complete") this.#host.fail("conflict"); break;
      case "confirm-stop": case "confirm-pause": case "interrupted": if (!bindingReceipt || !active.closed) this.#host.fail("conflict"); break;
      default: this.#host.fail("unsupported");
    }
    return dependencies;
  }
  #operationReduction(command: TaskStoreCommandV1, prior: Task | undefined, versions: readonly Task[]): void {
    const final = versions.at(-1)!, payload = command.payload;
    if (payload.kind === "task.create" || payload.kind === "task.revise-request") {
      if (final.intent.request !== payload.request || json(final.intent.constraints) !== json(payload.constraints) || json(final.intent.criteria) !== json(payload.acceptanceChecks)) this.#host.fail("validation");
      if (payload.kind === "task.create" && (versions.length !== 2 || final.state !== "READY" || final.attempts.length !== 1)) this.#host.fail("validation");
      if (payload.kind === "task.revise-request" && (!prior || payload.intentRevision !== prior.intent.revision || final.intent.revision !== prior.intent.revision + 1)) this.#host.fail("revision_conflict");
    }
    for (const task of versions) for (const [index, attempt] of task.attempts.entries()) for (const outcome of attempt.outcomes.slice(prior?.attempts[index]?.outcomes.length ?? 0)) {
      // There is no P1-07 successful criterion verifier in this bounded P1-04 integration.
      if (payload.kind !== "task.runtime" || payload.event !== "interrupted" || outcome.status !== "unverifiable"
        || outcome.criteriaResults.some(result => result.status !== "unknown" || result.reason !== "incomplete" || result.evidence.length)) this.#host.fail("unsupported");
    }
    const expected: Partial<Record<typeof payload.kind, readonly TaskState[]>> = { "task.create": ["READY"], "task.cancel": ["CANCELLING", "CANCELLED"], "task.pause": ["RUNNING"], "task.retry": ["READY"], "task.continue": ["READY"], "task.revise-request": ["READY"] };
    if (expected[payload.kind] && !expected[payload.kind]!.includes(final.state)) this.#host.fail("validation");
    if (payload.kind === "task.runtime") {
      const state = ({ prepare: "READY", start: "RUNNING", settled: "VERIFYING", "confirm-stop": "CANCELLED", "confirm-pause": "PAUSED", interrupted: "UNVERIFIABLE", "effects-unknown": "NEEDS_RECONCILIATION" } as const)[payload.event];
      if (final.state !== state) this.#host.fail("validation");
    }
  }
  #command(input: TaskStoreCommandV1): TaskStoreCommandV1 {
    const raw = JSON.parse(json(input)) as TaskStoreCommandV1;
    if (raw?.payload?.kind !== "task.runtime") { const value = parseLocalApiCommandV1(raw); if (!value.payload.kind.startsWith("task.")) this.#host.fail("unsupported"); return value; }
    exact(raw, ["schemaVersion", "commandId", "idempotencyKey", "workspaceId", "expectedRevision", "payload"]); if (raw.schemaVersion !== 1) this.#host.fail("validation");
    for (const value of [raw.commandId, raw.idempotencyKey, raw.workspaceId]) assertIdentifierV2(value); assertRevisionV2(raw.expectedRevision);
    exact(raw.payload, ["kind", "taskId", "event"], ["completeness", "evidenceRefs"]); assertIdentifierV2(raw.payload.taskId);
    if (!["prepare", "start", "settled", "confirm-stop", "confirm-pause", "interrupted", "effects-unknown"].includes(raw.payload.event)) this.#host.fail("validation");
    if (raw.payload.completeness !== undefined && !["complete", "incomplete"].includes(raw.payload.completeness)) this.#host.fail("validation");
    if (raw.payload.evidenceRefs !== undefined) {
      if (!Array.isArray(raw.payload.evidenceRefs) || raw.payload.evidenceRefs.length > 100) this.#host.fail("validation");
      for (const evidence of raw.payload.evidenceRefs) { exact(evidence, ["id", "revision"]); assertIdentifierV2(evidence.id); assertRevisionV2(evidence.revision); }
    }
    return structuredClone(raw) as unknown as TaskRuntimeCommandV1;
  }
  #validateWorking(input: unknown, task: Task): WorkingStateV2 {
    assertWorkingStateV2(input); const value = JSON.parse(json(input)) as WorkingStateV2, attempt = task.attempts.at(-1)!;
    if (value.id !== task.id || value.revision !== task.revision || value.task.kind !== "task" || value.task.id !== task.id || value.task.revision !== task.revision
      || value.taskAttempt.taskId !== task.id || value.taskAttempt.attemptId !== attempt.id || value.taskAttempt.intentRevision !== task.intent.revision
      || value.intentRevision !== task.intent.revision || scopeKeyV2(value.scope) !== scopeKeyV2(taskScope(task.workspaceId, task.id))
      || value.createdAt !== task.createdAt || value.updatedAt !== task.updatedAt) this.#host.fail("validation");
    for (const evidence of value.evidence) {
      const row = this.#row("SELECT * FROM observation_v2 WHERE id=?", evidence.source.id); if (!row) this.#host.fail("unavailable");
      const event = parseObservationV2(parseStored(string(row.event_json)));
      if (event.id !== evidence.source.id || event.revision !== evidence.source.revision || json(event.scope) !== json(evidence.scope)
        || event.privacy !== evidence.privacy || event.sourceTrust !== evidence.sourceTrust || event.observedAt !== evidence.observedAt
        || evidence.fragmentId !== undefined || event.integrity.status !== "complete" || event.content.availability !== "available") this.#host.fail("validation");
      const content = this.#host.content(event.content.ref, event.scope, true); if (content.privacy === "local-only" && value.privacy !== "local-only") this.#host.fail("unavailable");
    }
    return value;
  }
  #working(task: Task, evidence: readonly EvidenceRefV2[]): WorkingStateV2 {
    const attempt = task.attempts.at(-1)!;
    const value: WorkingStateV2 = { schemaVersion: 2, id: task.id, revision: task.revision, scope: taskScope(task.workspaceId, task.id),
      privacy: evidence.some(item => item.privacy === "local-only") ? "local-only" : this.#writeBoundary().contentPolicy.privacy, sourceTrust: "verified-tool", createdAt: task.createdAt, updatedAt: task.updatedAt,
      task: { kind: "task", id: task.id, revision: task.revision }, taskAttempt: { taskId: task.id, attemptId: attempt.id, intentRevision: task.intent.revision },
      intentRevision: task.intent.revision, currentStep: task.state, known: [], unknown: [], pendingInput: [], nextSteps: [], evidence: structuredClone(evidence) };
    assertWorkingStateV2(value); return value;
  }
  #persistVersion(prior: Task | undefined, task: Task, content: ContentRefV2, ownerEpoch: number): void {
    const scope = taskScope(task.workspaceId, task.id), current = task.attempts.at(-1)!;
    if (!prior) this.#run("INSERT INTO task_v1(id,workspace_id,session_id,scope_key,current_revision) VALUES(?,?,?,?,?)", task.id, task.workspaceId, task.sessionId, scopeKeyV2(scope), task.revision);
    else if (this.#host.db.prepare("UPDATE task_v1 SET current_revision=? WHERE id=? AND workspace_id=? AND current_revision=?").run(task.revision, task.id, task.workspaceId, prior.revision).changes !== 1) this.#host.fail("revision_conflict");
    for (const [index, attempt] of task.attempts.entries()) {
      const previous = prior?.attempts[index];
      if (!previous) this.#run("INSERT INTO task_attempt_v1(id,task_id,attempt_no,intent_revision,state,active,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)", attempt.id, task.id, index + 1, attempt.intent.revision, attempt.state, isTerminalTaskState(attempt.state) ? 0 : 1, attempt.createdAt, attempt.updatedAt);
      else if (json(attempt) !== json(previous)) this.#run("UPDATE task_attempt_v1 SET state=?,active=?,updated_at=? WHERE id=? AND task_id=?", attempt.state, isTerminalTaskState(attempt.state) ? 0 : 1, attempt.updatedAt, attempt.id, task.id);
    }
    this.#run("INSERT INTO task_snapshot_v1(task_id,revision,scope_key,state,intent_revision,attempt_id,owner_epoch,content_id,content_version,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)", task.id, task.revision, scopeKeyV2(scope), task.state, task.intent.revision, current.id, ownerEpoch, content.contentId, content.contentVersion, task.updatedAt);
    for (const [index, attempt] of task.attempts.entries()) for (const outcome of attempt.outcomes.slice(prior?.attempts[index]?.outcomes.length ?? 0))
      this.#run("INSERT INTO task_outcome_v1(id,revision,task_id,attempt_id,intent_revision,status,snapshot_revision,recorded_at) VALUES(?,?,?,?,?,?,?,?)", outcome.id, outcome.revision, task.id, attempt.id, outcome.intentRevision, outcome.status, task.revision, outcome.recordedAt);
    this.#run("INSERT INTO working_state_v1(task_id,task_revision,attempt_id,content_id,content_version,scope_key) VALUES(?,?,?,?,?,?)", task.id, task.revision, current.id, content.contentId, content.contentVersion, scopeKeyV2(scope));
  }
  getSession(workspaceId: string, id: string): TaskStoreReadV1<SessionV1 | undefined> {
    assertIdentifierV2(workspaceId); assertIdentifierV2(id); return this.#host.transaction(false, () => { const row = this.#row("SELECT * FROM session_v1 WHERE workspace_id=? AND id=?", workspaceId, id); return { value: row ? this.#session(row) : undefined, commitCursor: this.#watermark(workspaceId) }; });
  }
  getTask(workspaceId: string, id: string): TaskStoreReadV1<Task | undefined> {
    assertIdentifierV2(workspaceId); assertIdentifierV2(id); return this.#host.transaction(false, () => { const row = this.#taskRow(workspaceId, id); return { value: row ? this.#task(row) : undefined, commitCursor: this.#watermark(workspaceId) }; });
  }
  listTasks(workspaceId: string, options: Readonly<{ state?: TaskState; limit?: number; after?: string }> = {}): TaskStoreReadV1<readonly TaskSummaryV1[]> {
    assertIdentifierV2(workspaceId); exact(options, [], ["state", "limit", "after"]); const limit = bounded(options.limit ?? 100); if (options.after !== undefined) assertIdentifierV2(options.after);
    return this.#host.transaction(false, () => ({ value: this.#rows("SELECT s.*,t.workspace_id,t.session_id FROM task_v1 t JOIN task_snapshot_v1 s ON s.task_id=t.id AND s.revision=t.current_revision WHERE t.workspace_id=? AND t.id>? ORDER BY t.id", workspaceId, options.after ?? "")
      .filter(row => options.state === undefined || row.state === options.state).slice(0, limit).map(row => summary(this.#task(row)!)), commitCursor: this.#watermark(workspaceId) }));
  }
  snapshot(workspaceId: string): TaskStoreSnapshotV1 {
    assertIdentifierV2(workspaceId); return this.#host.transaction(false, () => ({ sessions: this.#rows("SELECT * FROM session_v1 WHERE workspace_id=? ORDER BY id", workspaceId).map(row => this.#session(row)!),
      tasks: this.#rows("SELECT s.*,t.workspace_id,t.session_id FROM task_v1 t JOIN task_snapshot_v1 s ON s.task_id=t.id AND s.revision=t.current_revision WHERE t.workspace_id=? ORDER BY t.id", workspaceId).map(row => summary(this.#task(row)!)), commitCursor: this.#watermark(workspaceId) }));
  }
  replay(workspaceId: string, options: Readonly<{ afterCommitCursor?: number; limit?: number }> = {}): TaskStoreReplayV1 {
    assertIdentifierV2(workspaceId); exact(options, [], ["afterCommitCursor", "limit"]); const after = options.afterCommitCursor ?? 0, limit = bounded(options.limit ?? 100); assertRevisionV2(after, true);
    return this.#host.transaction(false, () => {
      const highWatermark = this.#watermark(workspaceId); if (after > highWatermark || (after !== 0 && !this.#row("SELECT 1 FROM task_outbox_v1 WHERE workspace_id=? AND cursor=?", workspaceId, after))) this.#host.fail("sequence");
      const rows = this.#rows("SELECT * FROM task_outbox_v1 WHERE workspace_id=? AND cursor>? ORDER BY cursor LIMIT ?", workspaceId, after, limit + 1);
      return { events: rows.slice(0, limit).map(row => this.#eventRow(row)), highWatermark, hasMore: rows.length > limit, gap: false };
    });
  }
  #eventRow(row: Row): TaskOutboxRowV1 { return { event: parseProductEventV1(parseStored(string(row.event_json))), commitCursor: integer(row.cursor), publishState: row.publish_state as TaskOutboxRowV1["publishState"] }; }
  readWorkingState(workspaceId: string, taskId: string): TaskStoreReadV1<WorkingStateV2 | undefined> {
    assertIdentifierV2(workspaceId); assertIdentifierV2(taskId); return this.#host.transaction(false, () => {
      const row = this.#taskRow(workspaceId, taskId); if (!row) return { value: undefined, commitCursor: this.#watermark(workspaceId) };
      const value = this.#body(row, taskScope(workspaceId, taskId))!.workingState; assertWorkingStateV2(value);
      const content = this.#host.content(ref(row), taskScope(workspaceId, taskId), true); return { value: { ...value, privacy: content.privacy }, commitCursor: this.#watermark(workspaceId) };
    });
  }
  recordRuntimeInput(context: TaskStoreContextV1, input: TaskInputCommitV1): TaskInputCommitResultV1 {
    exact(input, ["commandId", "idempotencyKey", "taskId", "expectedRevision", "attemptId", "intentRevision", "text"]);
    for (const id of [input.commandId, input.idempotencyKey, input.taskId, input.attemptId]) assertIdentifierV2(id); assertRevisionV2(input.expectedRevision); assertRevisionV2(input.intentRevision);
    if (typeof input.text !== "string" || !input.text.trim() || Buffer.byteLength(input.text) > 1024 * 1024) this.#host.fail("validation"); this.#context(context, context.workspaceId);
    const command = { schemaVersion: 1, commandId: input.commandId, idempotencyKey: input.idempotencyKey, workspaceId: context.workspaceId, expectedRevision: input.expectedRevision,
      payload: { kind: "task.runtime-input", taskId: input.taskId, attemptId: input.attemptId, intentRevision: input.intentRevision, text: input.text } };
    return this.#host.transaction(true, () => {
      const row = this.#taskRow(context.workspaceId, input.taskId); if (!row) this.#host.fail("unavailable");
      const session = this.#row("SELECT * FROM session_v1 WHERE id=? AND workspace_id=?", string(row.session_id), context.workspaceId)!; this.#owner(context, session); if (row.owner_epoch !== context.ownerEpoch) this.#host.fail("revision_conflict");
      const replay = this.#replayReceipt(context, command);
      if (replay) { const prior = this.#row("SELECT * FROM task_receipt_v1 WHERE principal_id=? AND command_id=?", context.principalId, replay.receipt.commandId)!;
        return { ...replay, snapshot: this.#body(prior, taskScope(context.workspaceId, input.taskId))!.input as unknown as RuntimeInputSnapshotV1, contentRef: ref(prior) }; }
      const task = this.#task(row)!, attempt = task.attempts.at(-1)!;
      if (task.revision !== input.expectedRevision || attempt.id !== input.attemptId || task.intent.revision !== input.intentRevision) this.#host.fail("revision_conflict");
      if (task.state !== "READY" || this.#host.executionForReduction(context.workspaceId, task.id)?.closed === false) this.#host.fail("conflict");
      const ordinal = integer(this.#row("SELECT coalesce(max(ordinal),0)+1 AS ordinal FROM task_input_v1 WHERE attempt_id=?", attempt.id)!.ordinal);
      const snapshot: RuntimeInputSnapshotV1 = { schemaVersion: 1, id: this.#id("input"), taskId: task.id, attemptId: attempt.id, taskRevision: task.revision, intentRevision: task.intent.revision,
        ownerEpoch: context.ownerEpoch, ordinal, kind: "runtime_input", contractRevision: integer(session.contract_revision), text: input.text, createdAt: this.#host.now() };
      const receipt: TaskStoreReceiptV1 = { schemaVersion: 1, commandId: input.commandId, status: "committed", aggregate: { kind: "task", id: task.id, revision: task.revision }, result: receiptResult(task) };
      const scope = taskScope(context.workspaceId, task.id), content = this.#host.writeBody(scope, { schemaVersion: 1, input: snapshot, command, receipt }, [ref(row), ref(session)], this.#writeBoundary());
      this.#run("INSERT INTO task_input_v1(id,task_id,attempt_id,task_revision,intent_revision,kind,ordinal,owner_epoch,content_id,content_version,scope_key) VALUES(?,?,?,?,?,'runtime_input',?,?,?,?,?)", snapshot.id, task.id, attempt.id, task.revision, task.intent.revision, ordinal, context.ownerEpoch, content.contentId, content.contentVersion, scopeKeyV2(scope));
      const cursor = this.#outbox(this.#event(context.workspaceId, { kind: "task", id: task.id, revision: task.revision }, "task.input_committed", { attemptId: attempt.id, ordinal }), context.ownerEpoch);
      return { ...this.#receipt(context, command, receipt, cursor, content, scope), snapshot, contentRef: content };
    });
  }
  listRuntimeInputs(workspaceId: string, taskId: string, attemptId: string): TaskStoreReadV1<readonly RuntimeInputSnapshotV1[]> {
    for (const id of [workspaceId, taskId, attemptId]) assertIdentifierV2(id); return this.#host.transaction(false, () => ({ value: this.#rows("SELECT i.* FROM task_input_v1 i JOIN task_v1 t ON t.id=i.task_id WHERE t.workspace_id=? AND i.task_id=? AND i.attempt_id=? AND i.kind='runtime_input' ORDER BY i.ordinal", workspaceId, taskId, attemptId)
      .map(row => structuredClone(this.#body(row, taskScope(workspaceId, taskId))!.input as RuntimeInputSnapshotV1)), commitCursor: this.#watermark(workspaceId) }));
  }
  acknowledgeOutbox(workspaceId: string, consumerId: string, eventId: string, expectedCursor: number): number {
    for (const id of [workspaceId, consumerId, eventId]) assertIdentifierV2(id); assertRevisionV2(expectedCursor, true);
    return this.#host.transaction(true, () => {
      const prior = this.#row("SELECT * FROM task_consumer_v1 WHERE consumer_id=? AND workspace_id=?", consumerId, workspaceId);
      if ((prior ? integer(prior.cursor) : 0) !== expectedCursor) this.#host.fail("revision_conflict");
      const next = this.#row("SELECT * FROM task_outbox_v1 WHERE workspace_id=? AND cursor>? ORDER BY cursor LIMIT 1", workspaceId, expectedCursor); if (!next || next.event_id !== eventId) this.#host.fail("sequence");
      if (prior) { if (this.#host.db.prepare("UPDATE task_consumer_v1 SET cursor=? WHERE consumer_id=? AND workspace_id=? AND cursor=?").run(integer(next.cursor), consumerId, workspaceId, expectedCursor).changes !== 1) this.#host.fail("revision_conflict"); }
      else this.#run("INSERT INTO task_consumer_v1(consumer_id,workspace_id,cursor) VALUES(?,?,?)", consumerId, workspaceId, integer(next.cursor));
      if (next.publish_state === "pending") this.#run("UPDATE task_outbox_v1 SET publish_state='published' WHERE cursor=?", integer(next.cursor)); return integer(next.cursor);
    });
  }
  fenceRestartedOwners(): readonly SessionV1[] {
    const boundary = this.#writeBoundary(); return this.#host.transaction(true, () => {
      const changed: SessionV1[] = [];
      for (const row of this.#rows("SELECT * FROM session_v1 WHERE owner_instance_id!=? ORDER BY id", boundary.daemonInstanceId)) {
        const epoch = integer(row.owner_epoch) + 1, revision = integer(row.revision) + 1; assertRevisionV2(epoch); assertRevisionV2(revision);
        if (this.#host.db.prepare("UPDATE session_v1 SET owner_epoch=?,revision=?,owner_instance_id=?,requires_reauthorization=1,updated_at=? WHERE id=? AND owner_epoch=? AND revision=?")
          .run(epoch, revision, boundary.daemonInstanceId, this.#host.now(), string(row.id), integer(row.owner_epoch), integer(row.revision)).changes !== 1) this.#host.fail("revision_conflict");
        this.#outbox(this.#event(string(row.workspace_id), { kind: "session", id: string(row.id), revision }, "session.owner_fenced", { ownerEpoch: epoch }), epoch);
        const session = this.#session(this.#row("SELECT * FROM session_v1 WHERE id=?", string(row.id))!, false); if (session) changed.push(session);
      }
      return changed;
    });
  }
  quarantineRecovery(recoveryEpoch: number): void {
    this.#run("UPDATE task_outbox_v1 SET publish_state='quarantined' WHERE recovery_epoch<?", recoveryEpoch);
    for (const row of this.#rows("SELECT * FROM session_v1")) {
      const epoch = integer(row.owner_epoch) + 1, revision = integer(row.revision) + 1; assertRevisionV2(epoch); assertRevisionV2(revision);
      this.#run("UPDATE session_v1 SET owner_epoch=?,revision=?,requires_reauthorization=1,updated_at=? WHERE id=? AND owner_epoch=? AND revision=?", epoch, revision, this.#host.now(), string(row.id), integer(row.owner_epoch), integer(row.revision));
    }
  }
  contentRefs(workspaceId: string, taskId: string): readonly ContentRefV2[] {
    assertIdentifierV2(workspaceId); assertIdentifierV2(taskId); return this.#host.transaction(false, () => this.#rows("SELECT s.content_id,s.content_version FROM task_snapshot_v1 s JOIN task_v1 t ON t.id=s.task_id WHERE t.workspace_id=? AND t.id=? ORDER BY s.revision", workspaceId, taskId).map(ref));
  }
  /** Called inside the same explicit snapshot as each read and before/after every write. */
  validateRows(): void {
    try {
      const snapshots = new Map<string, Task>(), currentTasks = new Map<string, Task>();
      for (const row of this.#rows("SELECT * FROM session_v1")) {
        assertIdentifierV2(row.id); assertIdentifierV2(row.workspace_id); assertIdentifierV2(row.owner_instance_id);
        assertRevisionV2(row.revision); assertRevisionV2(row.owner_epoch); assertRevisionV2(row.contract_revision);
        if (row.scope_key !== scopeKeyV2(sessionScope(string(row.workspace_id), string(row.id))) || integer(row.owner_epoch) > integer(row.revision)) throw new Error("session projection mismatch");
        const body = this.#body(row, sessionScope(string(row.workspace_id), string(row.id)), false);
        if (body) { exact(body, ["schemaVersion", "contract", "command", "receipt"]); const command = parseSessionCreateCommandV1(body.command);
          if (body.schemaVersion !== 1 || json(command.payload.contract) !== json(body.contract) || command.workspaceId !== row.workspace_id) throw new Error("contract mismatch"); this.#session(row, false); }
      }
      for (const taskRow of this.#rows("SELECT * FROM task_v1")) {
        const rows = this.#rows("SELECT * FROM task_snapshot_v1 WHERE task_id=? ORDER BY revision", string(taskRow.id));
        if (!rows.length || rows.length !== taskRow.current_revision || taskRow.scope_key !== scopeKeyV2(taskScope(string(taskRow.workspace_id), string(taskRow.id)))) throw new Error("task snapshot gap");
        let prior: Task | undefined;
        for (const [index, row] of rows.entries()) {
          if (row.revision !== index + 1 || row.scope_key !== taskRow.scope_key) throw new Error("task revision projection");
          const body = this.#body(row, taskScope(string(taskRow.workspace_id), string(taskRow.id)), false); if (!body) { prior = undefined; continue; }
          exact(body, ["schemaVersion", "task", "workingState"], ["command", "receipt"]);
          if (body.schemaVersion !== 1 || (body.command === undefined) !== (body.receipt === undefined)) throw new Error("invalid task body");
          const task = parseSessionTaskV1(body.task); if (index === 0 || prior) assertTaskHistoryExtensionV1(prior, task);
          if (task.id !== taskRow.id || task.workspaceId !== taskRow.workspace_id || task.sessionId !== taskRow.session_id || task.revision !== row.revision
            || task.state !== row.state || task.intent.revision !== row.intent_revision || task.updatedAt !== row.created_at || task.attempts.at(-1)!.id !== row.attempt_id) throw new Error("task projection mismatch");
          assertWorkingStateV2(body.workingState); const working = body.workingState;
          if (working.task.id !== task.id || working.task.revision !== task.revision || working.taskAttempt.attemptId !== row.attempt_id || working.taskAttempt.taskId !== task.id
            || working.intentRevision !== row.intent_revision || working.taskAttempt.intentRevision !== row.intent_revision || working.revision !== task.revision || working.id !== task.id
            || working.createdAt !== task.createdAt || working.updatedAt !== task.updatedAt || scopeKeyV2(working.scope) !== row.scope_key) throw new Error("working state mismatch");
          for (const evidence of working.evidence) {
            const observation = this.#row("SELECT * FROM observation_v2 WHERE id=?", evidence.source.id); if (!observation) throw new Error("working evidence missing");
            const event = parseObservationV2(parseStored(string(observation.event_json)));
            if (event.revision !== evidence.source.revision || json(event.scope) !== json(evidence.scope) || event.privacy !== evidence.privacy || event.sourceTrust !== evidence.sourceTrust
              || event.observedAt !== evidence.observedAt || evidence.fragmentId !== undefined || event.integrity.status !== "complete") throw new Error("working evidence mismatch");
            if (event.content.availability !== "available" || !this.#row("SELECT 1 FROM task_content_dependency_v1 WHERE source_id=? AND source_version=? AND target_id=? AND target_version=?", event.content.ref.contentId, event.content.ref.contentVersion, string(row.content_id), integer(row.content_version))) throw new Error("working evidence dependency missing");
          }
          const workingRow = this.#row("SELECT * FROM working_state_v1 WHERE task_id=? AND task_revision=?", task.id, task.revision);
          if (!workingRow || json(ref(workingRow)) !== json(ref(row))) throw new Error("working state missing");
          const predecessor = index === 0 ? this.#row("SELECT * FROM session_v1 WHERE id=?", task.sessionId)! : rows[index - 1]!;
          if (!this.#row("SELECT 1 FROM task_content_dependency_v1 WHERE source_id=? AND source_version=? AND target_id=? AND target_version=?", string(predecessor.content_id), integer(predecessor.content_version), string(row.content_id), integer(row.content_version))) throw new Error("task history dependency missing");
          snapshots.set(json([task.id, task.revision]), task); prior = task; if (index === rows.length - 1) currentTasks.set(task.id, task);
        }
        const attempts = this.#rows("SELECT * FROM task_attempt_v1 WHERE task_id=? ORDER BY attempt_no", string(taskRow.id));
        if (!attempts.length || attempts.some((row, i) => row.attempt_no !== i + 1 || (i < attempts.length - 1 && row.active !== 0))) throw new Error("attempt order mismatch");
        const current = currentTasks.get(string(taskRow.id));
        if (current && (current.attempts.length !== attempts.length || attempts.some((row, i) => { const attempt = current.attempts[i]!;
          return row.id !== attempt.id || row.state !== attempt.state || row.intent_revision !== attempt.intent.revision || row.created_at !== attempt.createdAt || row.updated_at !== attempt.updatedAt || row.active !== (isTerminalTaskState(attempt.state) ? 0 : 1); }))) throw new Error("attempt projection mismatch");
      }
      for (const row of this.#rows("SELECT * FROM task_outcome_v1")) {
        const task = snapshots.get(json([row.task_id, row.snapshot_revision])), outcome = task?.attempts.find(attempt => attempt.id === row.attempt_id)?.outcomes.find(item => item.id === row.id && item.revision === row.revision);
        if (task && (!outcome || outcome.status !== row.status || outcome.intentRevision !== row.intent_revision || outcome.recordedAt !== row.recorded_at)) throw new Error("outcome projection mismatch");
      }
      for (const task of currentTasks.values()) for (const attempt of task.attempts) for (const outcome of attempt.outcomes)
        if (!this.#row("SELECT 1 FROM task_outcome_v1 WHERE id=? AND revision=? AND task_id=? AND attempt_id=?", outcome.id, outcome.revision, task.id, attempt.id)) throw new Error("outcome missing");
      const ordinals = new Map<string, number>();
      for (const row of this.#rows("SELECT i.*,t.workspace_id FROM task_input_v1 i JOIN task_v1 t ON t.id=i.task_id ORDER BY i.attempt_id,i.ordinal")) {
        const last = ordinals.get(string(row.attempt_id)) ?? 0; if (row.ordinal !== last + 1) throw new Error("input gap"); ordinals.set(string(row.attempt_id), integer(row.ordinal));
        const body = this.#body(row, taskScope(string(row.workspace_id), string(row.task_id)), false);
        if (body && row.kind === "runtime_input") {
          exact(body, ["schemaVersion", "input", "command", "receipt"]); const input = body.input;
          exact(input, ["schemaVersion", "id", "taskId", "attemptId", "taskRevision", "intentRevision", "ownerEpoch", "ordinal", "kind", "contractRevision", "text", "createdAt"]);
          if (input.schemaVersion !== 1 || input.id !== row.id || input.taskId !== row.task_id || input.attemptId !== row.attempt_id || input.taskRevision !== row.task_revision
            || input.intentRevision !== row.intent_revision || input.ownerEpoch !== row.owner_epoch || input.ordinal !== row.ordinal || input.kind !== row.kind || typeof input.text !== "string" || !input.text.trim()) throw new Error("input projection mismatch");
          assertIsoTimestampV2(input.createdAt); assertRevisionV2(input.contractRevision);
        } else if (body && body.command === undefined) throw new Error("command input missing");
      }
      for (const row of this.#rows("SELECT * FROM task_receipt_v1")) {
        const scope = row.entity_kind === "task" ? taskScope(string(row.workspace_id), string(row.entity_id)) : sessionScope(string(row.workspace_id), string(row.entity_id));
        const body = this.#body(row, scope, false), event = this.#row("SELECT * FROM task_outbox_v1 WHERE cursor=?", integer(row.commit_cursor));
        if (!event || event.workspace_id !== row.workspace_id || event.entity_kind !== row.entity_kind || event.entity_id !== row.entity_id || event.revision !== row.revision) throw new Error("receipt cursor mismatch");
        if (body) {
          const command = body.command as { commandId: string; idempotencyKey: string; workspaceId: string; payload: { kind: string } }, receipt = body.receipt as TaskStoreReceiptV1;
          if (!command || command.commandId !== row.command_id || command.idempotencyKey !== row.idempotency_key || command.workspaceId !== row.workspace_id || command.payload.kind !== row.command_kind
            || !receipt || receipt.commandId !== row.command_id || receipt.aggregate.kind !== row.entity_kind || receipt.aggregate.id !== row.entity_id || receipt.aggregate.revision !== row.revision) throw new Error("receipt body mismatch");
          if (receipt.aggregate.kind === "task") parseLocalApiReceiptV1({ ...receipt, eventCursor: "validated" });
        }
      }
      let cursor = 0;
      for (const row of this.#rows("SELECT * FROM task_outbox_v1 ORDER BY cursor")) {
        const event = this.#eventRow(row).event;
        if (integer(row.cursor) <= cursor || row.event_id !== event.eventId || row.workspace_id !== event.workspaceId || row.entity_kind !== event.aggregate.kind || row.entity_id !== event.aggregate.id
          || row.revision !== event.aggregate.revision || row.event_type !== event.type || row.occurred_at !== event.occurredAt || integer(row.recovery_epoch) > this.#host.recoveryEpoch()
          || (integer(row.recovery_epoch) < this.#host.recoveryEpoch() && row.publish_state !== "quarantined")) throw new Error("outbox projection mismatch");
        if (event.type === "task.created" || event.type === "task.state_changed") {
          const snapshot = this.#row("SELECT * FROM task_snapshot_v1 WHERE task_id=? AND revision=?", event.aggregate.id, event.aggregate.revision);
          if (!snapshot || snapshot.state !== event.payload.state || snapshot.intent_revision !== event.payload.intentRevision || snapshot.owner_epoch !== row.owner_epoch) throw new Error("outbox task mismatch");
        }
        cursor = integer(row.cursor);
      }
      for (const row of this.#rows("SELECT * FROM task_consumer_v1")) if (row.cursor !== 0 && !this.#row("SELECT 1 FROM task_outbox_v1 WHERE workspace_id=? AND cursor=?", string(row.workspace_id), integer(row.cursor))) throw new Error("consumer cursor mismatch");
    } catch (error) { if ((error as { code?: string })?.code === "ERR_SQLITE_ERROR") throw error; this.#host.fail("corruption"); }
  }
}
