/** Task/session persistence owns durable CAS and historical integrity, never task-success judgment. */
import type { DatabaseSync, SQLOutputValue } from "node:sqlite";
import { assertIdentifierV2, assertRevisionV2, assertPrivacyV2, assertIsoTimestampV2, assertWorkingStateV2,
  scopeKeyV2, isTerminalTaskState, sameTaskIntent,
  type ContentRefV2, type ScopeV2, type PrivacyV2, type EvidenceRefV2, type Task, type TaskState, type WorkingStateV2 } from "../../domain/src/index.ts";
import { canonicalJsonV1, parseSessionTaskV1, parseSessionCreateCommandV1, parseSessionV1, parseLocalApiCommandV1,
  parseLocalApiReceiptV1, parseSessionApiReceiptV1, parseProductEventV1, parseObservationV2, parseNormalizedRuntimeEnvelopeV1,
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
  recoveryEpochs(): readonly number[];
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
    const metadata = this.#row("SELECT * FROM content_object WHERE content_id=? AND content_version=?", string(row.content_id), integer(row.content_version));
    if (!metadata || metadata.content_version !== 1 || metadata.purpose !== "cognition" || metadata.state === "staged") this.#host.fail("corruption");
    const fence = parseStored(string(metadata.fence_json)) as { recoveryEpoch: number };
    if (!Number.isSafeInteger(fence.recoveryEpoch) || fence.recoveryEpoch < 0 || fence.recoveryEpoch > this.#host.recoveryEpoch()) this.#host.fail("corruption");
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
  #recordSessionRevision(id: string, reason: "created" | "owner-fenced" | "reauthorized" | "recovery-fenced", recoveryEpoch: number, eventCursor: number | null): void {
    const row = this.#row("SELECT * FROM session_v1 WHERE id=?", id)!;
    this.#run("INSERT INTO session_revision_v1(session_id,revision,workspace_id,owner_epoch,owner_instance_id,requires_reauthorization,contract_revision,recovery_epoch,reason,created_at,event_cursor) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
      id, integer(row.revision), string(row.workspace_id), integer(row.owner_epoch), string(row.owner_instance_id), integer(row.requires_reauthorization), integer(row.contract_revision), recoveryEpoch, reason, string(row.updated_at), eventCursor);
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
      this.#recordSessionRevision(id, "created", this.#host.recoveryEpoch(), cursor);
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
      if (command.payload.kind === "task.runtime" && !["interrupted", "confirm-stop", "confirm-pause"].includes(command.payload.event) && currentRow?.owner_epoch !== context.ownerEpoch) this.#host.fail("revision_conflict");
      if ((currentRow ? integer(currentRow.revision) : 0) !== command.expectedRevision) this.#host.fail("revision_conflict");
      const current = currentRow ? this.#task(currentRow)! : undefined, session = this.#session(sessionRow)!;
      const id = taskId ?? this.#id("task"), scope = taskScope(context.workspaceId, id), now = this.#host.now(); this.#host.registerScope(scope);
      if (command.payload.kind === "task.create" && json(command.payload.executionProfile) !== json(session.contract.runtimeProfile)) this.#host.fail("conflict");
      const activeExecution = current ? this.#host.executionForReduction(context.workspaceId, current.id) : undefined;
      if (command.payload.kind !== "task.runtime" && activeExecution && activeExecution.ownerEpoch < context.ownerEpoch && !activeExecution.closed) this.#host.fail("recovery_required");
      const accepted = command.payload.kind === "task.runtime" ? undefined : this.#host.recordCommandEvidence(scope, command as LocalApiCommandV1, [ref(sessionRow), ...(currentRow ? [ref(currentRow)] : [])], this.#writeBoundary());
      const evidence = accepted ? [accepted.evidence] : currentRow ? (this.#body(currentRow, scope)!.workingState as WorkingStateV2).evidence : [];
      const runtimeDependencies = command.payload.kind === "task.runtime" ? this.#runtimeEvidence(context, command as TaskRuntimeCommandV1, current!, activeExecution) : [];
      const attemptId = this.#id("attempt"), outcomeId = this.#id("outcome");
      const reduced = this.#writeBoundary().reduce(current ? structuredClone(current) : undefined, structuredClone(command), { now, session: structuredClone(session), taskId: id,
        attemptId, nextRevision: command.expectedRevision + 1, outcomeId, requiresReauthorization: currentRow?.owner_epoch !== context.ownerEpoch,
        evidence: structuredClone(evidence), privacy: evidence.some(item => item.privacy === "local-only") ? "local-only" : this.#writeBoundary().contentPolicy.privacy, ...(activeExecution ? { activeExecution } : {}) });
      exact(reduced, ["versions"], ["workingStates"]);
      if (!Array.isArray(reduced.versions) || !reduced.versions.length || reduced.versions.length > 16) this.#host.fail("validation");
      if (reduced.workingStates !== undefined && (!Array.isArray(reduced.workingStates) || reduced.workingStates.length !== reduced.versions.length)) this.#host.fail("validation");
      const versions = reduced.versions.map(value => parseSessionTaskV1(value)), final = versions.at(-1)!; this.#operationReduction(command, current, versions);
      if (activeExecution && !activeExecution.closed && versions.some(version => version.state === "CANCELLED" || version.state === "PAUSED" || version.attempts.at(-1)!.id !== current?.attempts.at(-1)!.id)) this.#host.fail("conflict");
      // A user command may also rely on observed closure to stop or replace an attempt.
      // Retain that Store-owned fact, rather than leaving the reducer's true predicate ephemeral.
      if (command.payload.kind !== "task.runtime" && activeExecution?.closed && current && activeExecution.attemptId === current.attempts.at(-1)!.id
        && versions.some(version => version.state === "CANCELLED" || version.state === "PAUSED" || version.attempts.at(-1)!.id !== current.attempts.at(-1)!.id)) {
        const closed = this.#row("SELECT * FROM task_execution_snapshot_v1 WHERE binding_id=? AND revision=? AND closed=1", activeExecution.bindingId, activeExecution.revision);
        if (!closed || closed.task_id !== current.id || closed.attempt_id !== current.attempts.at(-1)!.id) this.#host.fail("corruption");
        runtimeDependencies.push(ref(closed));
      }
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
        const cursor = this.#outbox(this.#event(context.workspaceId, { kind: "session", id: sessionId, revision }, "session.owner_fenced", { ownerEpoch: context.ownerEpoch }), context.ownerEpoch);
        this.#recordSessionRevision(sessionId, "reauthorized", this.#host.recoveryEpoch(), cursor);
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
    const metadata = (task: Task): Row => ({ revision: task.revision, state: task.state, intent_revision: task.intent.revision, attempt_id: task.attempts.at(-1)!.id, created_at: task.updatedAt });
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
    try { this.#commandMetadata(payload.kind, prior ? metadata(prior) : undefined, versions.map(metadata)); } catch { this.#host.fail("validation"); }
    const expected: Partial<Record<typeof payload.kind, readonly TaskState[]>> = { "task.create": ["READY"], "task.cancel": ["CANCELLING", "CANCELLED"], "task.pause": ["RUNNING"], "task.retry": ["READY"], "task.continue": ["READY"], "task.revise-request": ["READY"] };
    if (expected[payload.kind] && !expected[payload.kind]!.includes(final.state)) this.#host.fail("validation");
    if (payload.kind === "task.runtime") {
      const state = ({ prepare: "READY", start: "RUNNING", settled: "VERIFYING", "confirm-stop": "CANCELLED", "confirm-pause": "PAUSED", interrupted: "UNVERIFIABLE", "effects-unknown": "NEEDS_RECONCILIATION" } as const)[payload.event];
      if (final.state !== state) this.#host.fail("validation");
    }
  }
  /** Retained command shape facts; request text and criterion meaning remain in managed bodies. */
  #commandMetadata(kind: string, prior: Row | undefined, versions: readonly Row[]): void {
    const states = versions.map(row => row.state).join(","), final = versions.at(-1)!;
    const sequences: Readonly<Record<string, readonly string[]>> = {
      "task.create": ["CREATED,READY"], "task.cancel": ["CANCELLING", "CANCELLING,CANCELLED"],
      "task.pause": ["RUNNING"], "task.retry": ["CREATED,READY"],
      "task.continue": ["READY", "CREATED,READY", "CANCELLING,CANCELLED,CREATED,READY"],
      "task.revise-request": ["CREATED,READY", "CANCELLING,CANCELLED,CREATED,READY"],
      "task.runtime": ["READY", "RUNNING", "VERIFYING", "CANCELLED", "PAUSED", "UNVERIFIABLE", "VERIFYING,UNVERIFIABLE"],
    };
    if (!sequences[kind]?.includes(states)) throw new Error("command state span mismatch");
    let previous = prior;
    for (const row of versions) {
      assertIdentifierV2(row.attempt_id); assertIsoTimestampV2(row.created_at);
      if (previous && row.created_at! < previous.created_at!) throw new Error("task command chronology mismatch");
      if (!previous) {
        if (row.revision !== 1 || row.intent_revision !== 1 || row.state !== "CREATED") throw new Error("initial metadata mismatch");
      } else if (row.attempt_id !== previous.attempt_id) {
        if (!isTerminalTaskState(previous.state as TaskState) || row.state !== "CREATED"
          || row.intent_revision !== integer(previous.intent_revision) + (kind === "task.revise-request" ? 1 : 0)
          || !["task.retry", "task.continue", "task.revise-request"].includes(kind)) throw new Error("new attempt metadata mismatch");
      } else {
        const transitions: Readonly<Partial<Record<TaskState, readonly TaskState[]>>> = {
          CREATED: ["READY"], READY: ["RUNNING", "CANCELLING"], RUNNING: ["RUNNING", "VERIFYING", "PAUSED", "CANCELLING"],
          VERIFYING: ["UNVERIFIABLE", "CANCELLING"], WAITING_INPUT: ["READY", "CANCELLING"], WAITING_APPROVAL: ["READY", "CANCELLING"],
          PAUSED: ["CANCELLING"], CANCELLING: ["CANCELLED"], NEEDS_RECONCILIATION: ["CANCELLING"],
        };
        if (row.intent_revision !== previous.intent_revision || !transitions[previous.state as TaskState]?.includes(row.state as TaskState)) throw new Error("attempt state metadata mismatch");
      }
      previous = row;
    }
    if (kind === "task.create" && (prior || final.intent_revision !== 1 || versions.some(row => row.attempt_id !== final.attempt_id))) throw new Error("create attempt metadata mismatch");
    if (["task.retry", "task.revise-request"].includes(kind) && (!prior || final.attempt_id === prior.attempt_id)) throw new Error("missing command attempt");
    if (kind === "task.pause" && prior?.state !== "RUNNING") throw new Error("pause metadata mismatch");
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
      if (session.requires_reauthorization !== 0) this.#host.fail("recovery_required");
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
        const cursor = this.#outbox(this.#event(string(row.workspace_id), { kind: "session", id: string(row.id), revision }, "session.owner_fenced", { ownerEpoch: epoch }), epoch);
        this.#recordSessionRevision(string(row.id), "owner-fenced", this.#host.recoveryEpoch(), cursor);
        const session = this.#session(this.#row("SELECT * FROM session_v1 WHERE id=?", string(row.id))!, false); if (session) changed.push(session);
      }
      return changed;
    });
  }
  quarantineRecovery(recoveryEpoch: number): void {
    this.#run("UPDATE task_outbox_v1 SET publish_state='quarantined' WHERE recovery_epoch<?", recoveryEpoch);
    for (const row of this.#rows("SELECT * FROM session_v1")) {
      const epoch = integer(row.owner_epoch) + 1, revision = integer(row.revision) + 1; assertRevisionV2(epoch); assertRevisionV2(revision);
      if (this.#host.db.prepare("UPDATE session_v1 SET owner_epoch=?,revision=?,requires_reauthorization=1,updated_at=? WHERE id=? AND owner_epoch=? AND revision=?")
        .run(epoch, revision, this.#host.now(), string(row.id), integer(row.owner_epoch), integer(row.revision)).changes !== 1) this.#host.fail("revision_conflict");
      this.#recordSessionRevision(string(row.id), "recovery-fenced", recoveryEpoch, null);
    }
  }
  contentRefs(workspaceId: string, taskId: string): readonly ContentRefV2[] {
    assertIdentifierV2(workspaceId); assertIdentifierV2(taskId); return this.#host.transaction(false, () => this.#rows("SELECT s.content_id,s.content_version FROM task_snapshot_v1 s JOIN task_v1 t ON t.id=s.task_id WHERE t.workspace_id=? AND t.id=? ORDER BY s.revision", workspaceId, taskId).map(ref));
  }
  /** Called inside the same explicit snapshot as each read and before/after every write. */
  validateRows(): void {
    try {
      const snapshots = new Map<string, Task>(), currentTasks = new Map<string, Task>(), aggregateContents = new Set<string>();
      for (const row of this.#rows("SELECT * FROM session_v1")) {
        assertIdentifierV2(row.id); assertIdentifierV2(row.workspace_id); assertIdentifierV2(row.owner_instance_id);
        assertRevisionV2(row.revision); assertRevisionV2(row.owner_epoch); assertRevisionV2(row.contract_revision);
        assertIsoTimestampV2(row.created_at); assertIsoTimestampV2(row.updated_at);
        if (row.contract_revision !== 1 || row.scope_key !== scopeKeyV2(sessionScope(string(row.workspace_id), string(row.id))) || integer(row.owner_epoch) > integer(row.revision)) throw new Error("session projection mismatch");
        const contentMetadata = this.#row("SELECT created_at,fence_json FROM content_object WHERE content_id=? AND content_version=?", string(row.content_id), integer(row.content_version));
        if (contentMetadata?.created_at !== row.created_at) throw new Error("session content time mismatch");
        const history = this.#rows("SELECT * FROM session_revision_v1 WHERE session_id=? ORDER BY revision", string(row.id));
        if (history.length !== row.revision) throw new Error("session revision history missing");
        const recoveryHistory = history.filter(version => version.reason === "recovery-fenced").map(version => integer(version.recovery_epoch));
        if (json(recoveryHistory) !== json(this.#host.recoveryEpochs().filter(epoch => epoch > integer(history[0]!.recovery_epoch)))) throw new Error("session recovery history missing");
        let previous: Row | undefined;
        for (const [index, version] of history.entries()) {
          assertIdentifierV2(version.owner_instance_id); assertIsoTimestampV2(version.created_at);
          if (version.revision !== index + 1 || version.workspace_id !== row.workspace_id || version.contract_revision !== 1
            || integer(version.recovery_epoch) > this.#host.recoveryEpoch() || version.created_at! < row.created_at! || previous && version.created_at! < previous.created_at!) throw new Error("session revision projection mismatch");
          if (!previous) {
            if (version.reason !== "created" || version.owner_epoch !== 1 || version.requires_reauthorization !== 0 || version.created_at !== row.created_at || (parseStored(string(contentMetadata!.fence_json)) as { recoveryEpoch: number }).recoveryEpoch !== version.recovery_epoch) throw new Error("session initial owner mismatch");
          } else {
            const sameOwner = version.owner_instance_id === previous.owner_instance_id;
            switch (version.reason) {
              case "owner-fenced":
                if (sameOwner || version.owner_epoch !== integer(previous.owner_epoch) + 1 || version.requires_reauthorization !== 1 || version.recovery_epoch !== previous.recovery_epoch) throw new Error("session owner transition mismatch"); break;
              case "reauthorized":
                if (!sameOwner || version.owner_epoch !== previous.owner_epoch || version.requires_reauthorization !== 0 || previous.requires_reauthorization !== 1 || version.recovery_epoch !== previous.recovery_epoch) throw new Error("session authorization transition mismatch"); break;
              case "recovery-fenced":
                if (!sameOwner || version.owner_epoch !== integer(previous.owner_epoch) + 1 || version.requires_reauthorization !== 1 || integer(version.recovery_epoch) <= integer(previous.recovery_epoch)) throw new Error("session recovery transition mismatch"); break;
              default: throw new Error("unknown session revision transition");
            }
          }
          if (version.reason === "recovery-fenced") { if (version.event_cursor !== null) throw new Error("unexpected recovery projection"); }
          else {
            const event = this.#row("SELECT * FROM task_outbox_v1 WHERE cursor=?", integer(version.event_cursor));
            if (!event || event.workspace_id !== version.workspace_id || event.entity_kind !== "session" || event.entity_id !== row.id || event.revision !== version.revision
              || event.owner_epoch !== version.owner_epoch || event.recovery_epoch !== version.recovery_epoch || event.occurred_at !== version.created_at
              || event.event_type !== (version.reason === "created" ? "session.created" : "session.owner_fenced")) throw new Error("session history event missing");
          }
          previous = version;
        }
        if (!previous || ["revision", "workspace_id", "owner_epoch", "owner_instance_id", "requires_reauthorization", "contract_revision"].some(field => previous![field] !== row[field])
          || previous.created_at !== row.updated_at || previous.recovery_epoch !== this.#host.recoveryEpoch()) throw new Error("session current history mismatch");
        if (this.#row("SELECT 1 FROM task_content_dependency_v1 WHERE target_id=? AND target_version=?", string(row.content_id), integer(row.content_version))) throw new Error("session dependency role mismatch");
        const contentKey = json(ref(row)); if (aggregateContents.has(contentKey)) throw new Error("reused aggregate content"); aggregateContents.add(contentKey);
        const body = this.#body(row, sessionScope(string(row.workspace_id), string(row.id)), false);
        if (body) { exact(body, ["schemaVersion", "contract", "command", "receipt"]); const command = parseSessionCreateCommandV1(body.command);
          if (body.schemaVersion !== 1 || json(command.payload.contract) !== json(body.contract) || command.workspaceId !== row.workspace_id) throw new Error("contract mismatch"); this.#session(row, false); }
      }
      for (const taskRow of this.#rows("SELECT * FROM task_v1")) {
        for (const field of ["id", "workspace_id", "session_id"]) assertIdentifierV2(taskRow[field]);
        const rows = this.#rows("SELECT * FROM task_snapshot_v1 WHERE task_id=? ORDER BY revision", string(taskRow.id));
        if (!rows.length || rows.length !== taskRow.current_revision || taskRow.scope_key !== scopeKeyV2(taskScope(string(taskRow.workspace_id), string(taskRow.id)))) throw new Error("task snapshot gap");
        let prior: Task | undefined;
        for (const [index, row] of rows.entries()) {
          if (row.revision !== index + 1 || row.scope_key !== taskRow.scope_key) throw new Error("task revision projection");
          const contentKey = json(ref(row)); if (aggregateContents.has(contentKey)) throw new Error("reused aggregate content"); aggregateContents.add(contentKey);
          const metadata = this.#row("SELECT created_at FROM content_object WHERE content_id=? AND content_version=?", string(row.content_id), integer(row.content_version));
          if (metadata?.created_at !== row.created_at) throw new Error("task content time mismatch");
          const workingRow = this.#row("SELECT * FROM working_state_v1 WHERE task_id=? AND task_revision=?", string(taskRow.id), integer(row.revision));
          if (!workingRow || workingRow.scope_key !== row.scope_key || workingRow.attempt_id !== row.attempt_id || json(ref(workingRow)) !== json(ref(row))) throw new Error("working state projection missing");
          const predecessor = index === 0 ? this.#row("SELECT * FROM session_v1 WHERE id=?", string(taskRow.session_id))! : rows[index - 1]!;
          if (!this.#row("SELECT 1 FROM task_content_dependency_v1 WHERE source_id=? AND source_version=? AND target_id=? AND target_version=?", string(predecessor.content_id), integer(predecessor.content_version), string(row.content_id), integer(row.content_version))) throw new Error("task history dependency missing");
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
          snapshots.set(json([task.id, task.revision]), task); prior = task; if (index === rows.length - 1) currentTasks.set(task.id, task);
        }
        const attempts = this.#rows("SELECT * FROM task_attempt_v1 WHERE task_id=? ORDER BY attempt_no", string(taskRow.id));
        if (!attempts.length || attempts.some((row, i) => row.attempt_no !== i + 1 || (i < attempts.length - 1 && row.active !== 0))) throw new Error("attempt order mismatch");
        for (const [index, attempt] of attempts.entries()) {
          assertIdentifierV2(attempt.id); assertIsoTimestampV2(attempt.created_at); assertIsoTimestampV2(attempt.updated_at);
          if (index > 0 && attempt.created_at! < attempts[index - 1]!.updated_at!) throw new Error("attempt chronology mismatch");
          const history = rows.filter(row => row.attempt_id === attempt.id), first = history[0], last = history.at(-1);
          if (!first || !last || first.state !== "CREATED" || attempt.intent_revision !== first.intent_revision || history.some(row => row.intent_revision !== attempt.intent_revision)
            || attempt.created_at !== first.created_at || attempt.updated_at !== last.created_at || attempt.state !== last.state
            || attempt.active !== (isTerminalTaskState(last.state as TaskState) ? 0 : 1)
            || index > 0 && integer(first.revision) !== integer(rows.filter(row => row.attempt_id === attempts[index - 1]!.id).at(-1)!.revision) + 1) throw new Error("attempt snapshot projection mismatch");
        }
        const current = currentTasks.get(string(taskRow.id));
        if (current && (current.attempts.length !== attempts.length || attempts.some((row, i) => { const attempt = current.attempts[i]!;
          return row.id !== attempt.id || row.state !== attempt.state || row.intent_revision !== attempt.intent.revision || row.created_at !== attempt.createdAt || row.updated_at !== attempt.updatedAt || row.active !== (isTerminalTaskState(attempt.state) ? 0 : 1); }))) throw new Error("attempt projection mismatch");
      }
      for (const row of this.#rows("SELECT * FROM task_outcome_v1")) {
        assertIdentifierV2(row.id);
        const snapshot = this.#row("SELECT * FROM task_snapshot_v1 WHERE task_id=? AND revision=?", string(row.task_id), integer(row.snapshot_revision));
        if (!snapshot || snapshot.attempt_id !== row.attempt_id || snapshot.intent_revision !== row.intent_revision || snapshot.created_at !== row.recorded_at
          || row.status !== "unverifiable" || snapshot.state !== "UNVERIFIABLE" || row.revision !== 1) throw new Error("outcome snapshot projection mismatch");
        const task = snapshots.get(json([row.task_id, row.snapshot_revision])), outcome = task?.attempts.find(attempt => attempt.id === row.attempt_id)?.outcomes.find(item => item.id === row.id && item.revision === row.revision);
        if (task && (!outcome || outcome.status !== row.status || outcome.intentRevision !== row.intent_revision || outcome.recordedAt !== row.recorded_at)) throw new Error("outcome projection mismatch");
      }
      // The bounded P1-04 writer only appends an initial all-unknown interruption Outcome.
      // No success verifier or subsequent adjudication writer exists in this version.
      for (const row of this.#rows("SELECT * FROM task_snapshot_v1 WHERE state IN ('COMPLETED','PARTIAL','FAILED','CANCELLED','UNVERIFIABLE')")) {
        const outcomes = this.#rows("SELECT * FROM task_outcome_v1 WHERE task_id=? AND snapshot_revision=?", string(row.task_id), integer(row.revision));
        if (row.state === "UNVERIFIABLE" ? outcomes.length !== 1 : outcomes.length !== 0 || row.state !== "CANCELLED") throw new Error("terminal outcome coverage mismatch");
      }
      for (const task of currentTasks.values()) for (const attempt of task.attempts) for (const outcome of attempt.outcomes)
        if (!this.#row("SELECT 1 FROM task_outcome_v1 WHERE id=? AND revision=? AND task_id=? AND attempt_id=?", outcome.id, outcome.revision, task.id, attempt.id)) throw new Error("outcome missing");
      // A command receipt covers every consecutive Task version in its transaction.
      // This coverage remains checkable after its managed body has been revoked or purged.
      const dependencyTargets = new Set(this.#rows(`SELECT content_id,content_version FROM session_v1 UNION SELECT content_id,content_version FROM task_snapshot_v1
        UNION SELECT content_id,content_version FROM task_input_v1 UNION SELECT content_id,content_version FROM task_execution_snapshot_v1
        UNION SELECT content_id,content_version FROM task_execution_event_v1 UNION SELECT content_id,content_version FROM task_model_request_v1`).map(row => json([row.content_id, row.content_version])));
      const edges = new Map<string, string[]>(), visiting = new Set<string>(), visited = new Set<string>();
      for (const edge of this.#rows("SELECT * FROM task_content_dependency_v1")) {
        const source = json([edge.source_id, edge.source_version]), target = json([edge.target_id, edge.target_version]);
        if (source === target || !dependencyTargets.has(target)) throw new Error("invalid dependency target");
        const targets = edges.get(source) ?? []; targets.push(target); edges.set(source, targets);
      }
      // A long legitimate Task history must not depend on the JavaScript call-stack limit.
      for (const root of edges.keys()) {
        if (visited.has(root)) continue;
        const pending = [{ id: root, index: 0 }]; visiting.add(root);
        while (pending.length) {
          const frame = pending.at(-1)!, targets = edges.get(frame.id) ?? [];
          if (frame.index === targets.length) { visiting.delete(frame.id); visited.add(frame.id); pending.pop(); continue; }
          const target = targets[frame.index++]!;
          if (visiting.has(target)) throw new Error("cyclic dependency");
          if (!visited.has(target)) { visiting.add(target); pending.push({ id: target, index: 0 }); }
        }
      }
      const commandEnds = new Map<string, number>(), commandStarts = new Map<number, number>();
      for (const receipt of this.#rows("SELECT * FROM task_receipt_v1 WHERE entity_kind='task' AND command_kind!='task.runtime-input' ORDER BY entity_id,revision")) {
        const task = this.#row("SELECT * FROM task_v1 WHERE id=?", string(receipt.entity_id));
        const end = integer(receipt.revision), start = commandEnds.get(string(receipt.entity_id)) ?? 0;
        const snapshot = this.#row("SELECT * FROM task_snapshot_v1 WHERE task_id=? AND revision=?", string(receipt.entity_id), end);
        if (!task || !snapshot || !["task.create", "task.cancel", "task.pause", "task.continue", "task.retry", "task.revise-request", "task.runtime"].includes(string(receipt.command_kind))
          || task.workspace_id !== receipt.workspace_id || task.scope_key !== receipt.scope_key || json(ref(receipt)) !== json(ref(snapshot))
          || end <= start || end - start > 16 || (start === 0) !== (receipt.command_kind === "task.create")) throw new Error("command receipt projection mismatch");
        const scope = taskScope(string(task.workspace_id), string(task.id)), finalBody = this.#body(snapshot, scope, false);
        const range = this.#rows("SELECT * FROM task_snapshot_v1 WHERE task_id=? AND revision>? AND revision<=? ORDER BY revision", string(task.id), start, end);
        const previous = start ? this.#row("SELECT * FROM task_snapshot_v1 WHERE task_id=? AND revision=?", string(task.id), start) : undefined;
        this.#commandMetadata(string(receipt.command_kind), previous, range);
        const events = this.#rows("SELECT * FROM task_outbox_v1 WHERE entity_kind='task' AND entity_id=? AND revision>? AND revision<=? AND event_type IN ('task.created','task.state_changed') ORDER BY cursor", string(task.id), start, end);
        if (events.length !== range.length || events.some((event, index) => event.revision !== start + index + 1)
          || events.at(-1)?.cursor !== receipt.commit_cursor
          || this.#rows("SELECT cursor FROM task_outbox_v1 WHERE cursor>=? AND cursor<=?", integer(events[0]!.cursor), integer(receipt.commit_cursor)).length !== range.length) throw new Error("command final watermark mismatch");
        if (!previous || previous.attempt_id !== snapshot.attempt_id) {
          const authority = this.#row("SELECT * FROM session_revision_v1 WHERE session_id=? AND recovery_epoch<=? AND (event_cursor IS NULL OR event_cursor<?) ORDER BY revision DESC LIMIT 1",
            string(task.session_id), integer(events[0]!.recovery_epoch), integer(events[0]!.cursor));
          if (!authority || authority.requires_reauthorization !== 0) throw new Error("new attempt authorization history missing");
        }
        // Required execution roles are known from the retained command span even when
        // its private evidenceRefs have been removed. All versions share the same proof.
        const internal = receipt.command_kind === "task.runtime";
        const starts = internal && snapshot.state === "RUNNING";
        const closes = internal && ["CANCELLED", "PAUSED", "UNVERIFIABLE"].includes(string(snapshot.state));
        const replaces = previous && range.some(version => version.state === "CANCELLED" || version.state === "PAUSED" || version.attempt_id !== previous.attempt_id);
        const priorExecution = previous && this.#row("SELECT * FROM task_execution_v1 WHERE task_id=? AND attempt_id=?", string(task.id), string(previous.attempt_id));
        if (starts || closes || !internal && replaces && priorExecution) {
          if (!previous || !priorExecution) throw new Error("required runtime execution missing");
          const candidates = this.#rows(`SELECT s.* FROM task_execution_snapshot_v1 s JOIN task_content_dependency_v1 d
            ON d.source_id=s.content_id AND d.source_version=s.content_version
            WHERE d.target_id=? AND d.target_version=? AND s.binding_id=? AND s.task_id=? AND s.attempt_id=? AND s.intent_revision=?`,
            string(range[0]!.content_id), integer(range[0]!.content_version), string(priorExecution.binding_id), string(task.id), string(previous.attempt_id), integer(previous.intent_revision))
            .filter(source => starts ? source.state === "READY" && source.closed === 0 && source.dispatched === 0 && source.owner_epoch === snapshot.owner_epoch
              : source.state === "STOPPED" && source.closed === 1 && integer(source.owner_epoch) <= integer(snapshot.owner_epoch));
          if (candidates.length !== 1) throw new Error("required runtime binding proof missing");
          for (const version of range) if (!this.#row("SELECT 1 FROM task_content_dependency_v1 WHERE source_id=? AND source_version=? AND target_id=? AND target_version=?",
            string(candidates[0]!.content_id), integer(candidates[0]!.content_version), string(version.content_id), integer(version.content_version))) throw new Error("runtime proof span incomplete");
        }
        for (let revision = start + 1; revision <= end; revision++) {
          const version = this.#row("SELECT * FROM task_snapshot_v1 WHERE task_id=? AND revision=?", string(task.id), revision);
          if (!version || version.scope_key !== task.scope_key || version.owner_epoch !== snapshot.owner_epoch || version.created_at !== snapshot.created_at) throw new Error("command version coverage mismatch");
          const body = this.#body(version, scope, false);
          if (body && (!body.command || !body.receipt || finalBody && (json(body.command) !== json(finalBody.command) || json(body.receipt) !== json(finalBody.receipt)))) throw new Error("command version body mismatch");
        }
        const bodies = range.map(version => snapshots.get(json([task.id, version.revision])));
        const priorTask = start ? snapshots.get(json([task.id, start])) : undefined;
        if (finalBody && bodies.every(value => value !== undefined) && (start === 0 || priorTask)) this.#operationReduction(this.#command(finalBody.command as TaskStoreCommandV1), priorTask, bodies as Task[]);
        commandStarts.set(integer(receipt.commit_cursor), start); commandEnds.set(string(task.id), end);
      }
      for (const task of this.#rows("SELECT id,current_revision FROM task_v1")) if (commandEnds.get(string(task.id)) !== task.current_revision) throw new Error("task command coverage missing");
      const ordinals = new Map<string, number>(), inputHeads = new Map<string, { cursor: number; revision: number }>(), usedReceipts = new Set<number>(), userContents = new Set<string>(), inputContents = new Set<string>();
      const dependency = (source: Row, target: Row): void => {
        if (!this.#row("SELECT 1 FROM task_content_dependency_v1 WHERE source_id=? AND source_version=? AND target_id=? AND target_version=?",
          string(source.content_id), integer(source.content_version), string(target.content_id), integer(target.content_version))) throw new Error("input dependency missing");
      };
      for (const row of this.#rows("SELECT i.*,t.workspace_id,t.session_id FROM task_input_v1 i JOIN task_v1 t ON t.id=i.task_id ORDER BY i.attempt_id,i.ordinal")) {
        assertIdentifierV2(row.id);
        const last = ordinals.get(string(row.attempt_id)) ?? 0; if (row.ordinal !== last + 1) throw new Error("input gap"); ordinals.set(string(row.attempt_id), integer(row.ordinal));
        const snapshot = this.#row("SELECT * FROM task_snapshot_v1 WHERE task_id=? AND revision=?", string(row.task_id), integer(row.task_revision));
        const attempt = this.#row("SELECT * FROM task_attempt_v1 WHERE task_id=? AND id=?", string(row.task_id), string(row.attempt_id));
        const session = this.#row("SELECT * FROM session_v1 WHERE id=? AND workspace_id=?", string(row.session_id), string(row.workspace_id));
        const scope = taskScope(string(row.workspace_id), string(row.task_id));
        if (!snapshot || !attempt || !session || snapshot.attempt_id !== row.attempt_id || snapshot.scope_key !== row.scope_key || row.scope_key !== scopeKeyV2(scope)
          || snapshot.intent_revision !== row.intent_revision || snapshot.owner_epoch !== row.owner_epoch || attempt.intent_revision !== row.intent_revision) throw new Error("input snapshot projection mismatch");
        const runtime = row.kind === "runtime_input", internal = row.kind === "internal_command";
        if (!internal) { const key = json(ref(row)); if (inputContents.has(key) || aggregateContents.has(key)) throw new Error("reused input content"); inputContents.add(key); }
        const candidates = this.#rows("SELECT * FROM task_receipt_v1 WHERE entity_kind='task' AND entity_id=? AND revision=?", string(row.task_id), integer(row.task_revision))
          .filter(receipt => runtime ? receipt.command_kind === "task.runtime-input" && json(ref(receipt)) === json(ref(row))
            : receipt.command_kind !== "task.runtime-input" && (receipt.command_kind === "task.runtime") === internal && json(ref(receipt)) === json(ref(snapshot)));
        if (candidates.length !== 1) throw new Error("input receipt missing");
        const receipt = candidates[0]!, cursor = integer(receipt.commit_cursor);
        const priorInput = inputHeads.get(string(row.attempt_id));
        if (priorInput && (cursor <= priorInput.cursor || integer(row.task_revision) < priorInput.revision)) throw new Error("input commit order mismatch");
        inputHeads.set(string(row.attempt_id), { cursor, revision: integer(row.task_revision) });
        if (usedReceipts.has(cursor) || receipt.workspace_id !== row.workspace_id || receipt.scope_key !== row.scope_key) throw new Error("duplicate command input");
        usedReceipts.add(cursor);
        const body = this.#body(row, scope, false), receiptBody = this.#body(receipt, scope, false);
        const start = runtime ? integer(row.task_revision) : commandStarts.get(cursor)!;
        if (runtime) { if (snapshot.state !== "READY") throw new Error("runtime input requires READY snapshot"); dependency(snapshot, row); dependency(session, row); }
        else if (internal) { if (json(ref(row)) !== json(ref(snapshot))) throw new Error("internal input body mismatch"); }
        else {
          if (json(ref(row)) === json(ref(snapshot))) throw new Error("user input cannot be task body");
          dependency(session, row);
          if (start > 0) dependency(this.#row("SELECT * FROM task_snapshot_v1 WHERE task_id=? AND revision=?", string(row.task_id), start)!, row);
          for (let revision = start + 1; revision <= integer(row.task_revision); revision++) dependency(row, this.#row("SELECT * FROM task_snapshot_v1 WHERE task_id=? AND revision=?", string(row.task_id), revision)!);
          const observations = this.#rows("SELECT * FROM observation_v2 WHERE content_id=? AND content_version=?", string(row.content_id), integer(row.content_version));
          if (observations.length !== 1) throw new Error("user input Observation missing");
          const observation = parseObservationV2(parseStored(string(observations[0]!.event_json)));
          if (json(observation.scope) !== json(scope) || observation.actor !== "user" || observation.kind !== "user_input" || observation.sourceTrust !== "user-direct"
            || observation.observedAt !== snapshot.created_at || observation.recordedAt !== snapshot.created_at || observation.integrity.status !== "complete"
            || observation.source.streamId !== `task-command:${row.task_id}` || observation.source.adapter !== "local-api" || observation.source.surface !== "local-api"
            || observation.source.eventType !== "task-command" || observation.source.runtime !== null || observation.source.productSessionId !== null
            || observation.source.runtimeSessionId !== null || observation.source.runtimeInstanceId !== null
            || Object.values(observation.correlation).some(value => value !== null)) throw new Error("user input Observation mismatch");
          const key = json(ref(row)); if (userContents.has(key)) throw new Error("duplicate user content"); userContents.add(key);
        }
        if (!internal) {
          const actual = this.#rows("SELECT source_id,source_version FROM task_content_dependency_v1 WHERE target_id=? AND target_version=?", string(row.content_id), integer(row.content_version))
            .map(edge => json([edge.source_id, edge.source_version])).sort();
          const previous = runtime ? snapshot : start > 0 ? this.#row("SELECT * FROM task_snapshot_v1 WHERE task_id=? AND revision=?", string(row.task_id), start)! : undefined;
          const expected = [session, ...(previous ? [previous] : [])].map(source => json([source.content_id, source.content_version])).sort();
          if (json(actual) !== json(expected)) throw new Error("input dependency role mismatch");
          const metadata = this.#row("SELECT created_at FROM content_object WHERE content_id=? AND content_version=?", string(row.content_id), integer(row.content_version))!;
          if (!runtime && metadata.created_at !== snapshot.created_at) throw new Error("command content time mismatch");
        }
        if (body) {
          if (runtime) {
            exact(body, ["schemaVersion", "input", "command", "receipt"]); const input = body.input;
            exact(input, ["schemaVersion", "id", "taskId", "attemptId", "taskRevision", "intentRevision", "ownerEpoch", "ordinal", "kind", "contractRevision", "text", "createdAt"]);
            if (input.schemaVersion !== 1 || input.id !== row.id || input.taskId !== row.task_id || input.attemptId !== row.attempt_id || input.taskRevision !== row.task_revision
              || input.intentRevision !== row.intent_revision || input.ownerEpoch !== row.owner_epoch || input.ordinal !== row.ordinal || input.kind !== row.kind
              || input.contractRevision !== session.contract_revision || typeof input.text !== "string" || !input.text.trim() || Buffer.byteLength(input.text) > 1024 * 1024) throw new Error("input projection mismatch");
            assertIsoTimestampV2(input.createdAt); assertRevisionV2(input.contractRevision);
            const metadata = this.#row("SELECT created_at FROM content_object WHERE content_id=? AND content_version=?", string(row.content_id), integer(row.content_version))!;
            if (input.createdAt !== metadata.created_at) throw new Error("runtime input time mismatch");
            exact(body.command, ["schemaVersion", "commandId", "idempotencyKey", "workspaceId", "expectedRevision", "payload"]);
            exact(body.command.payload, ["kind", "taskId", "attemptId", "intentRevision", "text"]);
            if (body.command.schemaVersion !== 1 || body.command.payload.kind !== "task.runtime-input" || body.command.payload.taskId !== row.task_id
              || body.command.payload.attemptId !== row.attempt_id || body.command.payload.intentRevision !== row.intent_revision || body.command.payload.text !== input.text) throw new Error("runtime input command mismatch");
          } else if (internal) exact(body, ["schemaVersion", "task", "workingState", "command", "receipt"]);
          else exact(body, ["schemaVersion", "command"]);
          if (body.schemaVersion !== 1) throw new Error("input body version mismatch");
          const command = runtime ? body.command as { commandId: string; idempotencyKey: string; workspaceId: string; expectedRevision: number; payload: { kind: string } }
            : this.#command(body.command as TaskStoreCommandV1);
          if (command.commandId !== receipt.command_id || command.idempotencyKey !== receipt.idempotency_key || command.workspaceId !== row.workspace_id
            || command.expectedRevision !== start || command.payload.kind !== receipt.command_kind) throw new Error("input command receipt mismatch");
          if (!runtime) {
            const parsed = command as TaskStoreCommandV1;
            if (internal !== (parsed.payload.kind === "task.runtime") || parsed.payload.kind === "task.create" && parsed.payload.sessionId !== row.session_id
              || parsed.payload.kind === "task.runtime" && parsed.payload.taskId !== row.task_id
              || "targetRef" in parsed.payload && parsed.payload.targetRef.id !== row.task_id) throw new Error("input command target mismatch");
          }
          if (internal) {
            const runtimeCommand = command as TaskRuntimeCommandV1;
            if (runtimeCommand.payload.event !== "prepare" && !runtimeCommand.payload.evidenceRefs?.length) throw new Error("internal evidence missing");
            for (const evidence of runtimeCommand.payload.evidenceRefs ?? []) {
              const binding = this.#row("SELECT * FROM task_execution_snapshot_v1 WHERE binding_id=? AND revision=? AND task_id=? AND attempt_id=?", evidence.id, evidence.revision, string(row.task_id), string(row.attempt_id));
              const event = evidence.revision === 1 ? this.#row("SELECT * FROM task_execution_event_v1 WHERE event_id=? AND task_id=? AND attempt_id=?", evidence.id, string(row.task_id), string(row.attempt_id)) : undefined;
              const source = binding ?? event; if (!source) throw new Error("internal evidence target missing");
              if (binding && runtimeCommand.payload.event === "start" && (binding.state !== "READY" || binding.dispatched !== 0 || binding.closed !== 0)
                || binding && ["interrupted", "confirm-stop", "confirm-pause"].includes(runtimeCommand.payload.event) && binding.closed !== 1) throw new Error("internal evidence state mismatch");
              for (let revision = start + 1; revision <= integer(row.task_revision); revision++) dependency(source, this.#row("SELECT * FROM task_snapshot_v1 WHERE task_id=? AND revision=?", string(row.task_id), revision)!);
            }
          }
          if (receiptBody && (json(body.command) !== json(receiptBody.command) || (runtime || internal) && json(body.receipt) !== json(receiptBody.receipt))) throw new Error("input command body mismatch");
        }
      }
      for (const receipt of this.#rows("SELECT commit_cursor FROM task_receipt_v1 WHERE entity_kind='task'")) if (!usedReceipts.has(integer(receipt.commit_cursor))) throw new Error("receipt input missing");
      for (const row of this.#rows("SELECT event_json FROM observation_v2")) {
        const event = parseObservationV2(parseStored(string(row.event_json)));
        if (event.source.adapter === "local-api" && event.source.eventType === "task-command"
          && (event.content.availability !== "available" || !userContents.has(json(event.content.ref)))) throw new Error("orphan command Observation");
      }
      for (const row of this.#rows("SELECT * FROM task_receipt_v1")) {
        for (const field of ["principal_id", "command_kind", "idempotency_key", "command_id", "workspace_id", "entity_id"]) assertIdentifierV2(row[field]);
        const scope = row.entity_kind === "task" ? taskScope(string(row.workspace_id), string(row.entity_id)) : sessionScope(string(row.workspace_id), string(row.entity_id));
        const body = this.#body(row, scope, false), event = this.#row("SELECT * FROM task_outbox_v1 WHERE cursor=?", integer(row.commit_cursor));
        if (!event || event.workspace_id !== row.workspace_id || event.entity_kind !== row.entity_kind || event.entity_id !== row.entity_id || event.revision !== row.revision) throw new Error("receipt cursor mismatch");
        if (row.entity_kind === "task" && event.event_type !== (row.command_kind === "task.runtime-input" ? "task.input_committed" : "task.state_changed")) throw new Error("receipt final event mismatch");
        if (row.entity_kind === "session") {
          const session = this.#row("SELECT * FROM session_v1 WHERE id=? AND workspace_id=?", string(row.entity_id), string(row.workspace_id));
          if (!session || row.command_kind !== "session.create" || row.revision !== 1 || event.event_type !== "session.created" || event.owner_epoch !== 1
            || row.scope_key !== session.scope_key || json(ref(row)) !== json(ref(session))) throw new Error("session receipt projection mismatch");
        }
        if (body) {
          const command = body.command as { commandId: string; idempotencyKey: string; workspaceId: string; payload: { kind: string } }, receipt = body.receipt as TaskStoreReceiptV1;
          if (!command || command.commandId !== row.command_id || command.idempotencyKey !== row.idempotency_key || command.workspaceId !== row.workspace_id || command.payload.kind !== row.command_kind
            || !receipt || receipt.commandId !== row.command_id || receipt.aggregate.kind !== row.entity_kind || receipt.aggregate.id !== row.entity_id || receipt.aggregate.revision !== row.revision) throw new Error("receipt body mismatch");
          exact(receipt, ["schemaVersion", "commandId", "status", "aggregate", "result"]);
          parseSessionApiReceiptV1({ ...receipt, eventCursor: "validated" });
          if (receipt.aggregate.kind === "task") {
            const task = snapshots.get(json([row.entity_id, row.revision]));
            const snapshot = this.#row("SELECT * FROM task_snapshot_v1 WHERE task_id=? AND revision=?", string(row.entity_id), integer(row.revision));
            if (!snapshot || receipt.result.kind !== "task" || receipt.result.taskState !== snapshot.state || receipt.result.intentRevision !== snapshot.intent_revision
              || task && json(receipt.result) !== json(receiptResult(task))) throw new Error("receipt result mismatch");
          } else if (row.command_kind !== "session.create" || receipt.result.kind !== "session" || receipt.result.ownerEpoch !== 1) throw new Error("session receipt mismatch");
        }
      }
      const consumerHeads = new Map<string, number>();
      for (const row of this.#rows("SELECT * FROM task_consumer_v1")) {
        assertIdentifierV2(row.consumer_id); assertIdentifierV2(row.workspace_id); assertRevisionV2(row.cursor);
        if (!this.#row("SELECT 1 FROM task_outbox_v1 WHERE workspace_id=? AND cursor=?", string(row.workspace_id), integer(row.cursor))) throw new Error("consumer cursor mismatch");
        consumerHeads.set(string(row.workspace_id), Math.max(consumerHeads.get(string(row.workspace_id)) ?? 0, integer(row.cursor)));
      }
      let cursor = 0;
      const sessionHeads = new Map<string, Row>(), taskEventHeads = new Map<string, number>(), versionEvents = new Set<string>(), inputEvents = new Set<string>(), closedEvents = new Set<string>();
      for (const row of this.#rows("SELECT * FROM task_outbox_v1 ORDER BY cursor")) {
        const event = this.#eventRow(row).event;
        if (integer(row.cursor) <= cursor || row.event_id !== event.eventId || row.workspace_id !== event.workspaceId || row.entity_kind !== event.aggregate.kind || row.entity_id !== event.aggregate.id
          || row.revision !== event.aggregate.revision || row.event_type !== event.type || row.occurred_at !== event.occurredAt || integer(row.recovery_epoch) > this.#host.recoveryEpoch()
          || (integer(row.recovery_epoch) < this.#host.recoveryEpoch() && row.publish_state !== "quarantined")
          || (integer(row.recovery_epoch) === this.#host.recoveryEpoch() && row.publish_state !== ((consumerHeads.get(event.workspaceId) ?? 0) >= integer(row.cursor) ? "published" : "pending"))) throw new Error("outbox projection mismatch");
        if (event.type === "session.created" || event.type === "session.owner_fenced") {
          const session = this.#row("SELECT * FROM session_v1 WHERE id=? AND workspace_id=?", event.aggregate.id, event.workspaceId);
          if (!session || event.aggregate.revision > integer(session.revision) || event.payload.ownerEpoch !== row.owner_epoch
            || integer(row.owner_epoch) > integer(session.owner_epoch) || event.occurredAt < string(session.created_at)) throw new Error("outbox session mismatch");
          const history = this.#row("SELECT * FROM session_revision_v1 WHERE session_id=? AND revision=? AND event_cursor=?", event.aggregate.id, event.aggregate.revision, integer(row.cursor));
          if (!history) throw new Error("session event history link missing");
          const prior = sessionHeads.get(event.aggregate.id);
          if (event.type === "session.created") {
            const receipt = this.#row("SELECT * FROM task_receipt_v1 WHERE commit_cursor=?", integer(row.cursor));
            if (prior || event.aggregate.revision !== 1 || row.owner_epoch !== 1 || event.occurredAt !== session.created_at
              || !receipt || receipt.entity_kind !== "session" || receipt.entity_id !== session.id || receipt.workspace_id !== session.workspace_id
              || receipt.command_kind !== "session.create" || receipt.revision !== 1 || json(ref(receipt)) !== json(ref(session))) throw new Error("outbox session creation mismatch");
          } else {
            if (!prior) throw new Error("outbox missing session creation");
            if (event.aggregate.revision <= integer(prior.revision)) throw new Error("outbox session history mismatch");
            if (history.reason === "reauthorized") {
              // Same-epoch event is the explicit user command that opens a new attempt, not a new daemon.
              const receipt = this.#row(`SELECT r.* FROM task_receipt_v1 r JOIN task_v1 t ON t.id=r.entity_id
                JOIN task_snapshot_v1 s ON s.task_id=t.id AND s.revision=r.revision
                JOIN task_attempt_v1 a ON a.id=s.attempt_id
                WHERE r.entity_kind='task' AND r.workspace_id=? AND t.session_id=? AND r.commit_cursor>?
                  AND r.command_kind IN ('task.create','task.retry','task.continue','task.revise-request')
                  AND s.owner_epoch=? AND s.created_at=? AND a.created_at=? ORDER BY r.commit_cursor LIMIT 1`,
                event.workspaceId, event.aggregate.id, integer(row.cursor), integer(row.owner_epoch), event.occurredAt, event.occurredAt);
              if (!receipt) throw new Error("outbox reauthorization missing command");
              const start = commandStarts.get(integer(receipt.commit_cursor))!;
              const final = this.#row("SELECT attempt_id FROM task_snapshot_v1 WHERE task_id=? AND revision=?", string(receipt.entity_id), integer(receipt.revision))!;
              const before = start ? this.#row("SELECT attempt_id FROM task_snapshot_v1 WHERE task_id=? AND revision=?", string(receipt.entity_id), start) : undefined;
              if (before && before.attempt_id === final.attempt_id) throw new Error("reauthorization requires new attempt");
              const first = this.#row("SELECT * FROM task_outbox_v1 WHERE cursor>? ORDER BY cursor LIMIT 1", integer(row.cursor));
              if (!first || first.entity_kind !== "task" || first.entity_id !== receipt.entity_id
                || first.revision !== (commandStarts.get(integer(receipt.commit_cursor)) ?? -1) + 1
                || !["task.created", "task.state_changed"].includes(string(first.event_type))) throw new Error("reauthorization command ordering mismatch");
            }
          }
          sessionHeads.set(event.aggregate.id, row);
        } else {
          const snapshot = this.#row("SELECT s.*,t.workspace_id,t.session_id FROM task_snapshot_v1 s JOIN task_v1 t ON t.id=s.task_id WHERE s.task_id=? AND s.revision=?", event.aggregate.id, event.aggregate.revision);
          if (!snapshot || snapshot.workspace_id !== event.workspaceId || event.type !== "task.execution_closed" && snapshot.owner_epoch !== row.owner_epoch) throw new Error("outbox task identity mismatch");
          const authority = this.#row("SELECT * FROM session_revision_v1 WHERE session_id=? AND recovery_epoch<=? AND (event_cursor IS NULL OR event_cursor<?) ORDER BY revision DESC LIMIT 1",
            string(snapshot.session_id), integer(row.recovery_epoch), integer(row.cursor));
          if (!authority || authority.owner_epoch !== row.owner_epoch || authority.recovery_epoch !== row.recovery_epoch || authority.created_at! > row.occurred_at!
            || event.type === "task.input_committed" && authority.requires_reauthorization !== 0) throw new Error("outbox task authority mismatch");
          switch (event.type) {
            case "task.created": case "task.state_changed": {
              const key = json([event.aggregate.id, event.aggregate.revision]);
              if (event.aggregate.revision !== (taskEventHeads.get(event.aggregate.id) ?? 0) + 1 || versionEvents.has(key) || (event.type === "task.created") !== (event.aggregate.revision === 1)
                || snapshot.state !== event.payload.state || snapshot.intent_revision !== event.payload.intentRevision || snapshot.created_at !== event.occurredAt) throw new Error("outbox task mismatch");
              const metadata = this.#row("SELECT fence_json FROM content_object WHERE content_id=? AND content_version=?", string(snapshot.content_id), integer(snapshot.content_version))!;
              if ((parseStored(string(metadata.fence_json)) as { recoveryEpoch: number }).recoveryEpoch !== row.recovery_epoch) throw new Error("task content recovery mismatch");
              versionEvents.add(key); taskEventHeads.set(event.aggregate.id, event.aggregate.revision); break;
            }
            case "task.input_committed": {
              if ((taskEventHeads.get(event.aggregate.id) ?? 0) !== event.aggregate.revision) throw new Error("input current task mismatch");
              const input = this.#row("SELECT * FROM task_input_v1 WHERE task_id=? AND attempt_id=? AND ordinal=? AND kind='runtime_input'", event.aggregate.id, event.payload.attemptId, event.payload.ordinal);
              const receipt = this.#row("SELECT * FROM task_receipt_v1 WHERE commit_cursor=?", integer(row.cursor));
              if (!input || input.task_revision !== event.aggregate.revision || input.owner_epoch !== row.owner_epoch || input.attempt_id !== snapshot.attempt_id
                || input.intent_revision !== snapshot.intent_revision || inputEvents.has(string(input.id)) || !receipt || receipt.command_kind !== "task.runtime-input"
                || receipt.entity_kind !== "task" || receipt.entity_id !== input.task_id || receipt.revision !== input.task_revision || receipt.workspace_id !== event.workspaceId
                || json(ref(receipt)) !== json(ref(input))) throw new Error("outbox input mismatch");
              const content = this.#row("SELECT created_at,fence_json FROM content_object WHERE content_id=? AND content_version=?", string(input.content_id), integer(input.content_version));
              if (!content || content.created_at !== event.occurredAt || (parseStored(string(content.fence_json)) as { recoveryEpoch: number }).recoveryEpoch !== row.recovery_epoch) throw new Error("outbox input time mismatch");
              inputEvents.add(string(input.id)); break;
            }
            case "task.execution_closed": {
              if ((taskEventHeads.get(event.aggregate.id) ?? 0) !== event.aggregate.revision) throw new Error("execution close current task mismatch");
              const source = this.#row("SELECT * FROM task_execution_snapshot_v1 WHERE binding_id=? AND revision=?", event.payload.bindingId, event.payload.executionRevision);
              const key = json([event.payload.bindingId, event.payload.executionRevision]);
              if (!source || source.task_id !== event.aggregate.id || source.attempt_id !== snapshot.attempt_id || source.intent_revision !== snapshot.intent_revision
                || source.state !== "STOPPED" || source.closed !== 1 || source.created_at !== event.occurredAt
                || integer(source.owner_epoch) > integer(row.owner_epoch) || source.recovery_epoch !== row.recovery_epoch || closedEvents.has(key)
                || !this.#row("SELECT 1 FROM task_content_dependency_v1 WHERE source_id=? AND source_version=? AND target_id=? AND target_version=?",
                  string(snapshot.content_id), integer(snapshot.content_version), string(source.content_id), integer(source.content_version))) throw new Error("execution close projection mismatch");
              closedEvents.add(key); break;
            }
            case "task.progress": {
              if ((taskEventHeads.get(event.aggregate.id) ?? 0) !== event.aggregate.revision) throw new Error("progress current task mismatch");
              const source = this.#row("SELECT * FROM task_execution_event_v1 WHERE commit_cursor=?", integer(row.cursor));
              if (!source || source.task_id !== event.aggregate.id || source.task_revision !== event.aggregate.revision || source.attempt_id !== snapshot.attempt_id
                || source.intent_revision !== snapshot.intent_revision || source.owner_epoch !== row.owner_epoch || source.recovery_epoch !== row.recovery_epoch
                || source.recorded_at !== event.occurredAt || json(event.payload) !== json({ phase: "working" })) throw new Error("outbox progress source missing");
              break;
            }
          }
        }
        cursor = integer(row.cursor);
      }
      for (const session of this.#rows("SELECT * FROM session_v1")) {
        const head = sessionHeads.get(string(session.id));
        const history = this.#row("SELECT * FROM session_revision_v1 WHERE session_id=? AND event_cursor IS NOT NULL ORDER BY revision DESC LIMIT 1", string(session.id));
        if (!head || history?.event_cursor !== head.cursor) throw new Error("session event head mismatch");
      }
      for (const snapshot of this.#rows("SELECT task_id,revision FROM task_snapshot_v1"))
        if (!versionEvents.has(json([snapshot.task_id, snapshot.revision]))) throw new Error("task version event missing");
      for (const closed of this.#rows("SELECT binding_id,revision FROM task_execution_snapshot_v1 WHERE closed=1"))
        if (!closedEvents.has(json([closed.binding_id, closed.revision]))) throw new Error("execution close event missing");
      for (const input of this.#rows("SELECT id FROM task_input_v1 WHERE kind='runtime_input'"))
        if (!inputEvents.has(string(input.id))) throw new Error("runtime input event missing");

    } catch (error) { if ((error as { code?: string })?.code === "ERR_SQLITE_ERROR") throw error; this.#host.fail("corruption"); }
  }
}
