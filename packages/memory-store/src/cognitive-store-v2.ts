import { mkdirSync, lstatSync, realpathSync, existsSync, readdirSync, openSync, fsyncSync, closeSync } from "node:fs";
import { join, resolve, relative, isAbsolute, sep } from "node:path";
import { DatabaseSync, type SQLOutputValue } from "node:sqlite";
import {
  assertIdentifierV2, assertIsoTimestampV2, assertScopeV2, assertPrivacyV2,
  assertRevisionV2, assertContentRefV2, assertMemoryClaimV2, assertMemoryCandidateV2, sameScopeV2, scopeKeyV2,
  isScopeWithinV2,
  type ScopeV2, type PrivacyV2, type ContentRefV2, type MemoryClaimV2, type MemoryCandidateV2,
} from "../../domain/src/index.ts";
import {
  canonicalJsonV1, parseObservationV2, serializeObservationV2,
  type ObservationV2, type LocalApiCommandV1,
} from "../../protocol/src/index.ts";
import {
  configureCognitiveDatabaseV2, applyTaskMigrationsV1, verifyTaskDatabaseV1,
} from "./cognitive-schema-v2.ts";
import { cognitiveRecoveryPortV2, type CognitiveRecoveryPortV2, type CognitiveRecoveryStateV2 } from "./cognitive-recovery-port-v2.ts";
import { ContentFilesV2, type ContentFileDescriptorV2 } from "./content-files-v2.ts";
import { acquireCoordinatorLockV2, type CoordinatorLockV2 } from "./coordinator-lock-v2.ts";
import {
  initializeRecoveryJournalV2, openRecoveryJournalV2,
  parseRecoveryControlIntentV2,
  type RecoveryJournalV2, type RecoveryControlIntentV2, type RecoveryControlRecordV2,
  type RecoveryControlTargetV2,
} from "./recovery-journal-v2.ts";
import { splitClaimV2, hydrateClaimV2, parseCognitiveRecordV2, cognitiveRecordMetadataV2, parseCognitiveRecordMetadataV2,
  type CognitiveRecordKindV2, type CognitiveRecordByKindV2, type CognitiveRecordMetadataV2 } from "./cognitive-codec-v2.ts";

import { TaskStoreEngineV1, type TaskStoreHostV1 } from "./task-store-v1.ts";
import { TaskExecutionStoreEngineV1 } from "./task-execution-store-v1.ts";
import type { TaskPersistenceBoundaryV1, TaskPersistenceStoreV1 } from "./task-store-v1-types.ts";
import type { TaskExecutionPersistenceV1 } from "./task-execution-v1-types.ts";

/** Default-disabled synthetic composition; no real data or external model boundary. */
export interface SyntheticCognitionStoreOptionsV2 {
  readonly dataRoot: string;
  readonly controlRoot: string;
  readonly installationId: string;
  readonly mode: "create" | "open" | "migrate-v1";
  readonly clock: { now(): string };
  readonly taskPersistence?: TaskPersistenceBoundaryV1;
}
export interface CognitionFenceV2 {
  readonly installationId: string;
  readonly scope: ScopeV2;
  readonly cognitionEpoch: number;
  readonly policyEpoch: number;
  readonly recoveryEpoch: number;
}
export type CognitiveStoreErrorCodeV2 = "validation" | "closed" | "conflict" | "sequence"
  | "unavailable" | "unsupported" | "revision_conflict" | "corruption" | "recovery_required" | "sqlite" | "io";
export class CognitiveStoreErrorV2 extends Error {
  readonly code: CognitiveStoreErrorCodeV2;
  constructor(code: CognitiveStoreErrorCodeV2) {
    super(`Cognitive store ${code}.`); this.name = "CognitiveStoreErrorV2"; this.code = code;
  }
}
type Row = Record<string, SQLOutputValue>;
function fail(code: CognitiveStoreErrorCodeV2): never { throw new CognitiveStoreErrorV2(code); }
function json(value: unknown): string { return canonicalJsonV1(value); }
function parse(value: SQLOutputValue): unknown {
  if (typeof value !== "string") fail("corruption");
  try { const parsed: unknown = JSON.parse(value); if (json(parsed) !== value) fail("corruption"); return parsed; }
  catch { return fail("corruption"); }
}
function number(value: SQLOutputValue): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) fail("corruption");
  return value;
}
function text(value: SQLOutputValue): string { if (typeof value !== "string") fail("corruption"); return value; }
function increment(value: number): number { if (!Number.isSafeInteger(value) || value >= Number.MAX_SAFE_INTEGER) fail("conflict"); return value + 1; }
function refKey(ref: ContentRefV2): string { return json([ref.contentId, ref.contentVersion]); }
function contentRef(row: Row): ContentRefV2 { return { contentId: text(row.content_id), contentVersion: number(row.content_version) }; }
function scopeFrom(row: Row): ScopeV2 { const scope = parse(row.scope_json); assertScopeV2(scope); return scope; }
function immutableClaimMetadata(claim: MemoryClaimV2): unknown {
  const { statement: _statement, status: _status, revision: _revision, updatedAt: _updatedAt,
    supersededBy: _supersededBy, ...metadata } = claim;
  return metadata;
}
function streamIdentity(event: ObservationV2): unknown {
  const { sourceSequence: _sequence, eventType: _type, ...identity } = event.source;
  return { scope: event.scope, ...identity };
}
function assertFenceShape(value: CognitionFenceV2): void {
  plainDataRecord(value, ["installationId", "scope", "cognitionEpoch", "policyEpoch", "recoveryEpoch"]);
  if (!value || typeof value !== "object" || Object.keys(value).sort().join() !==
    ["installationId", "scope", "cognitionEpoch", "policyEpoch", "recoveryEpoch"].sort().join()) fail("validation");
  assertIdentifierV2(value.installationId); assertScopeV2(value.scope);
  assertRevisionV2(value.cognitionEpoch, true); assertRevisionV2(value.policyEpoch, true); assertRevisionV2(value.recoveryEpoch, true);
}
function plainDataRecord(value: unknown, keys: readonly string[]): void {
  if (!value || typeof value !== "object" || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail("validation");
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).length !== keys.length || Reflect.ownKeys(descriptors).some(key => typeof key !== "string"
    || !keys.includes(key) || !("value" in descriptors[key]) || !descriptors[key].enumerable || descriptors[key].value === undefined)) fail("validation");
}
function outsideRoot(parent: string, child: string): boolean {
  const path = relative(parent, child); return path === ".." || path.startsWith(`..${sep}`) || isAbsolute(path);
}
function externalEventId(id: string): void {
  assertIdentifierV2(id); if (/^(control|orphan|lifecycle):/.test(id)) fail("validation");
}

export interface StageCognitiveContentV2 {
  readonly ref: ContentRefV2;
  readonly reservationId: string;
  readonly fence: CognitionFenceV2;
  readonly privacy: PrivacyV2;
  readonly purpose: "observation" | "claim" | "evidence" | "artifact" | "cognition";
  readonly retentionUntil: string;
  readonly bytes: Uint8Array;
}
export interface CognitiveCommitReceiptV2 {
  readonly cursor: number;
  readonly eventId: string;
  readonly cognitionEpoch: number;
  readonly recoveryEpoch: number;
  readonly replay: boolean;
}
export interface CognitiveOutboxEventV2 extends CognitiveCommitReceiptV2 {
  readonly scope: ScopeV2;
  readonly type: string;
  readonly entityId: string;
  readonly entityKind: string;
  readonly version: number;
  readonly publishState: "pending" | "published" | "quarantined";
}

/** Single synchronous coordinator. The control log and SQLite are intentionally NOT one transaction. */
export class SyntheticCognitionStoreV2 {
  readonly #db: DatabaseSync;
  readonly #pragmas: ReturnType<typeof configureCognitiveDatabaseV2>;
  readonly #files: ContentFilesV2;
  readonly #journal: RecoveryJournalV2;
  readonly #options: SyntheticCognitionStoreOptionsV2;
  readonly #locks: readonly CoordinatorLockV2[];
  #closed = false;
  #gate = false;
  #bundleFence: CognitionFenceV2 | undefined;
  #transactionNow: string | undefined;
  #taskComposing = false;
  readonly #taskEngine: TaskStoreEngineV1;
  readonly #executionEngine: TaskExecutionStoreEngineV1;

  private constructor(options: SyntheticCognitionStoreOptionsV2, db: DatabaseSync,
    pragmas: ReturnType<typeof configureCognitiveDatabaseV2>, files: ContentFilesV2,
    journal: RecoveryJournalV2, locks: readonly CoordinatorLockV2[]) {
    this.#options = options; this.#db = db; this.#pragmas = pragmas;
    this.#files = files; this.#journal = journal; this.#locks = locks;
    const host: TaskStoreHostV1 = {
      db, now: () => this.#now(), recoveryEpoch: () => number(this.#state().recovery_epoch),
      recoveryEpochs: () => this.#journal.read().records.filter(record => record.controlSequence <= number(this.#state().applied_control_sequence) && record.intent.kind === "RESTORE_BEGIN").map(record => record.recoveryEpoch), fail,
      transaction: (write, body) => this.#transaction(write, () => {
        const prior = this.#taskComposing; this.#taskComposing = true;
        try { return body(); } finally { this.#taskComposing = prior; }
      }),
      registerScope: scope => { this.registerScope(scope); },
      content: (ref, scope, available) => {
        const row = this.#content(ref, scope, available ? ["available"] : ["available", "staged", "revoked", "purged"], available);
        return { ...(row.state === "available" ? { bytes: this.#taskBodyBytes(row) } : {}), privacy: row.privacy as PrivacyV2, retentionUntil: text(row.retention_until) };
      },
      writeBody: (scope, body, dependencies, boundary) => this.#writeTaskBody(scope, body, dependencies, boundary),
      recordCommandEvidence: (scope, command, dependencies, boundary) => this.#recordTaskCommand(scope, command, dependencies, boundary),
      executionForReduction: (workspaceId, taskId) => this.#executionEngine.currentForReduction(workspaceId, taskId),
      onExecutionSettled: (context, envelope) => {
        const execution = this.#row("SELECT task_id FROM task_execution_v1 WHERE binding_id=? AND workspace_id=?", envelope.bindingId, context.workspaceId);
        if (!execution) fail("unavailable");
        const task = this.#row("SELECT current_revision FROM task_v1 WHERE id=? AND workspace_id=?", text(execution.task_id), context.workspaceId);
        if (!task) fail("unavailable");
        this.#taskEngine.executeTask(context, { schemaVersion: 1, commandId: `settled:${envelope.event.eventId}`, idempotencyKey: `settled:${envelope.event.eventId}`,
          workspaceId: context.workspaceId, expectedRevision: number(task.current_revision), payload: { kind: "task.runtime", taskId: text(execution.task_id), event: "settled", completeness: "complete", evidenceRefs: [{ id: envelope.event.eventId, revision: 1 }] } });
      },
    };
    const configured = options.taskPersistence;
    const boundary: TaskPersistenceBoundaryV1 | undefined = configured ? Object.freeze({ daemonInstanceId: configured.daemonInstanceId,
      contentPolicy: Object.freeze(structuredClone(configured.contentPolicy)),
      ...(configured.runtimeSourceIdentity ? { runtimeSourceIdentity: Object.freeze(structuredClone(configured.runtimeSourceIdentity)) } : {}),
      ...(configured.recoveryCustody ? { recoveryCustody: Object.freeze({ observedClose: configured.recoveryCustody.observedClose.bind(configured.recoveryCustody) }) } : {}),
      ids: Object.freeze({ next: configured.ids.next.bind(configured.ids) }), reduce: configured.reduce }) : undefined;
    this.#taskEngine = new TaskStoreEngineV1(host, boundary); this.#executionEngine = new TaskExecutionStoreEngineV1(host, boundary);
  }

  static open(options: SyntheticCognitionStoreOptionsV2): SyntheticCognitionStoreV2 {
    let db: DatabaseSync | undefined;
    const locks: CoordinatorLockV2[] = [];
    try {
      assertIdentifierV2(options.installationId); assertIsoTimestampV2(options.clock.now());
      if (!["create", "open", "migrate-v1"].includes(options.mode)) fail("validation");
      const dataRoot = resolve(options.dataRoot), controlRoot = resolve(options.controlRoot);
      if (!isAbsolute(options.dataRoot) || !isAbsolute(options.controlRoot) || dataRoot === controlRoot
        || !outsideRoot(dataRoot, controlRoot) || !outsideRoot(controlRoot, dataRoot)) fail("validation");
      const root = lstatSync(dataRoot);
      if (!root.isDirectory() || root.isSymbolicLink() || realpathSync(dataRoot) !== dataRoot) fail("validation");
      const filePath = join(dataRoot, "product.sqlite");
      if (options.mode === "create" ? existsSync(filePath) : !existsSync(filePath)) fail("conflict");
      for (const path of [filePath, `${filePath}-wal`, `${filePath}-shm`]) if (existsSync(path)) {
        const stat = lstatSync(path); if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) fail("validation");
      }
      locks.push(acquireCoordinatorLockV2({ dataRoot, installationId: options.installationId }));
      const journal = options.mode === "open"
        ? openRecoveryJournalV2({ controlRoot, installationId: options.installationId })
        : initializeRecoveryJournalV2({ controlRoot, installationId: options.installationId });
      locks.push(acquireCoordinatorLockV2({ dataRoot: controlRoot, installationId: options.installationId }));
      if (options.mode !== "open") mkdirSync(join(dataRoot, "content"), { mode: 0o700 });
      const files = ContentFilesV2.open({ contentRoot: join(dataRoot, "content"), initialize: options.mode !== "open" });
      db = new DatabaseSync(filePath);
      const pragmas = configureCognitiveDatabaseV2(db, { filePath, busyTimeoutMs: 5000 });
      const store = new SyntheticCognitionStoreV2({ ...options, dataRoot, controlRoot }, db, pragmas, files, journal, locks);
      const hasState = db.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name='store_state'").get()
        && db.prepare("SELECT 1 FROM store_state WHERE singleton=1").get();
      applyTaskMigrationsV1(db, { clock: options.clock, expectedPragmas: pragmas, ...(hasState ? { validateProductRows: () => store.#validateRows() } : {}) });
      const state = db.prepare("SELECT * FROM store_state WHERE singleton=1").get();
      if (!state) {
        if (options.mode === "open") fail("corruption");
        const head = journal.read().head;
        db.prepare("INSERT INTO store_state(singleton,installation_id,applied_control_sequence,applied_control_checksum,recovery_epoch) VALUES(1,?,?,?,?)")
          .run(options.installationId, head.controlSequence, head.checksum, head.recoveryEpoch);
      } else if (options.mode !== "open") fail("conflict");
      store.reconcileControl();
      store.#transaction(false, () => undefined);
      if (options.taskPersistence) store.#taskEngine.fenceRestartedOwners();
      return store;
    } catch (error) {
      try { db?.close(); } catch { /* Preserve primary fixed-category error. */ }
      for (const lock of locks.reverse()) { try { lock.release(); } catch { /* Startup remains closed. */ } }
      if (error instanceof CognitiveStoreErrorV2) throw error;
      const code = (error as { code?: string })?.code;
      if (code === "ERR_SQLITE_ERROR" || code === "sqlite") fail("sqlite");
      if (["corruption", "recovery_required"].includes(code ?? "")) fail(code as "corruption" | "recovery_required");
      if ((error as Error)?.name === "ObservationLedgerMigrationError") fail("corruption");
      if (code === "EEXIST" || code === "conflict") fail("conflict");
      fail("io");
    }
  }

  get tasks(): TaskPersistenceStoreV1 { if (!this.#options.taskPersistence) fail("unsupported"); return this.#taskEngine; }
  get executions(): TaskExecutionPersistenceV1 { if (!this.#options.taskPersistence) fail("unsupported"); return this.#executionEngine; }

  #now(): string { const now = this.#transactionNow ?? this.#options.clock.now(); assertIsoTimestampV2(now); return now; }
  #row(sql: string, ...values: (string | number | null)[]): Row | undefined { return this.#db.prepare(sql).get(...values) as Row | undefined; }
  #rows(sql: string, ...values: (string | number | null)[]): Row[] { return this.#db.prepare(sql).all(...values) as Row[]; }
  #state(): Row { const row = this.#row("SELECT * FROM store_state WHERE singleton=1"); if (!row) fail("corruption"); return row; }
  #scope(scope: ScopeV2): Row {
    assertScopeV2(scope); const row = this.#row("SELECT * FROM scope_catalog WHERE scope_key=?", scopeKeyV2(scope));
    if (!row || !sameScopeV2(scopeFrom(row), scope)) fail("unavailable"); return row;
  }
  #checkControl(): void {
    if (this.#closed) fail("closed");
    if (this.#gate) fail("recovery_required");
    const control = this.#journal.read(), state = this.#state();
    if (control.recoveryRequired || state.installation_id !== this.#options.installationId
      || state.applied_control_sequence !== control.head.controlSequence
      || state.applied_control_checksum !== control.head.checksum
      || state.recovery_epoch !== control.recoveryEpoch) fail("recovery_required");
  }
  #fence(fence: CognitionFenceV2): Row {
    assertFenceShape(fence); const scope = this.#scope(fence.scope), state = this.#state();
    if (this.#bundleFence && this.#db.isTransaction && json(fence) === json(this.#bundleFence)) return scope;
    if (fence.installationId !== state.installation_id || fence.recoveryEpoch !== state.recovery_epoch
      || fence.cognitionEpoch !== scope.cognition_epoch || fence.policyEpoch !== scope.policy_epoch) fail("revision_conflict");
    return scope;
  }
  #transaction<T>(write: boolean, body: () => T, reconciling = false): T {
    if (this.#closed) fail("closed");
    // Only the fixed acceptance bundle below can compose these commands. It owns
    // the outer transaction and validates the shared initial fence exactly once.
    if ((this.#bundleFence || this.#taskComposing) && this.#db.isTransaction) return body();
    try {
      if (!reconciling) this.#checkControl();
      this.#transactionNow = this.#options.clock.now(); assertIsoTimestampV2(this.#transactionNow);
      this.#db.exec(write ? "BEGIN IMMEDIATE" : "BEGIN");
      verifyTaskDatabaseV1(this.#db, this.#pragmas);
      this.#validateRows();
      if (!reconciling) this.#checkControl();
      const result = body();
      this.#validateRows();
      if (!reconciling) this.#checkControl();
      this.#db.exec("COMMIT"); return result;
    } catch (error) {
      if (this.#db.isTransaction) { try { this.#db.exec("ROLLBACK"); } catch { this.#gate = true; } }
      if (error instanceof CognitiveStoreErrorV2) throw error;
      const code = (error as { code?: string })?.code;
      if (code === "ERR_SQLITE_ERROR" || code === "sqlite") fail("sqlite");
      if (["corruption", "recovery_required"].includes(code ?? "")) fail(code as "corruption" | "recovery_required");
      if (code === "io") fail("io");
      fail("validation");
    } finally { this.#transactionNow = undefined; }
  }

  registerScope(scope: ScopeV2): CognitionFenceV2 {
    assertScopeV2(scope);
    return this.#transaction(true, () => {
      this.#notForgotten(scope);
      const key = scopeKeyV2(scope), prior = this.#row("SELECT * FROM scope_catalog WHERE scope_key=?", key);
      if (!prior) {
        this.#db.prepare("INSERT INTO scope_catalog(scope_key,scope_json,cognition_epoch,policy_epoch) VALUES(?,?,0,0)").run(key, json(scope));
        // Recovery can replay a suppression before its former scope exists.
        // Re-registering that scope must restore the retained source fence.
        for (const record of this.#journal.read().records) {
          const intent = record.intent;
          if (intent.kind === "SOURCE_SUPPRESS" && sameScopeV2(intent.scope, scope)
            && !this.#row("SELECT 1 FROM source_suppression WHERE scope_key=? AND binding_id=? AND resource_id=?", key, intent.bindingId, intent.resourceId))
            this.#db.prepare("INSERT INTO source_suppression VALUES(?,?,?,?)").run(key, intent.bindingId, intent.resourceId, record.controlSequence);
        }
      }
      return this.#currentFence(scope);
    });
  }
  #currentFence(scope: ScopeV2): CognitionFenceV2 {
    const row = this.#scope(scope); return {
      installationId: this.#options.installationId, scope: structuredClone(scope),
      cognitionEpoch: number(row.cognition_epoch), policyEpoch: number(row.policy_epoch), recoveryEpoch: number(this.#state().recovery_epoch),
    };
  }
  currentFence(scope: ScopeV2): CognitionFenceV2 { return this.#transaction(false, () => this.#currentFence(scope)); }
  #notForgotten(scope: ScopeV2, entity?: Readonly<{ kind: "content" | "claim" | "observation"; id: string; version: number }>): void {
    for (const record of this.#journal.read().records) if (record.intent.kind === "FORGET") for (const target of record.intent.targets) {
      if (target.kind === "scope" && isScopeWithinV2(scope, target.scope)) fail("unavailable");
      if (!entity) continue;
      if (target.kind === "content" && entity.kind === "content" && entity.id === target.contentId && entity.version === target.contentVersion) fail("unavailable");
      if (target.kind === "claim" && entity.kind === "claim" && entity.id === target.id && entity.version === target.version) fail("unavailable");
      if (target.kind === "observation" && entity.kind === "observation" && entity.id === target.id) fail("unavailable");
    }
  }

  #descriptor(row: Row): ContentFileDescriptorV2 {
    return { contentId: text(row.content_id), version: number(row.content_version), reservationId: text(row.reservation_id),
      digest: text(row.digest), byteCount: number(row.byte_count) };
  }
  #content(ref: ContentRefV2, scope: ScopeV2, states: readonly string[] = ["available"], checkTime = true): Row {
    assertContentRefV2(ref); const row = this.#row("SELECT * FROM content_object WHERE content_id=? AND content_version=?", ref.contentId, ref.contentVersion);
    if (!row || row.scope_key !== scopeKeyV2(scope) || !states.includes(text(row.state))
      || (checkTime && text(row.retention_until) <= this.#now())) fail("unavailable");
    if (checkTime && states.length === 1 && states[0] === "available") this.#notForgotten(scope, { kind: "content", id: ref.contentId, version: ref.contentVersion });
    return row;
  }
  #taskBodyBytes(row: Row): Uint8Array {
    const value = parse(new TextDecoder("utf-8", { fatal: true }).decode(this.#files.read(this.#descriptor(row))));
    plainDataRecord(value, ["format", "dependencies", "record"]);
    const envelope = value as { format: string; dependencies: ContentRefV2[]; record: unknown };
    if (envelope.format !== "task-managed-content-v1" || !Array.isArray(envelope.dependencies)) fail("corruption");
    for (const ref of envelope.dependencies) assertContentRefV2(ref);
    const order = (refs: readonly ContentRefV2[]) => refs.map(refKey).sort();
    const expected = this.#rows("SELECT source_id AS content_id,source_version AS content_version FROM task_content_dependency_v1 WHERE target_id=? AND target_version=?", text(row.content_id), number(row.content_version)).map(contentRef);
    if (json(order(envelope.dependencies)) !== json(order(expected))) fail("corruption");
    return new TextEncoder().encode(json(envelope.record));
  }
  #writeTaskBody(scope: ScopeV2, body: unknown, dependencies: readonly ContentRefV2[], boundary: TaskPersistenceBoundaryV1): ContentRefV2 {
    if (!this.#taskComposing || !this.#db.isTransaction) fail("corruption");
    this.#notForgotten(scope); this.#scope(scope);
    const unique = [...new Map(dependencies.map(ref => { assertContentRefV2(ref); return [refKey(ref), structuredClone(ref)] as const; })).values()];
    let privacy = boundary.contentPolicy.privacy, retentionUntil = boundary.contentPolicy.retentionUntil;
    assertPrivacyV2(privacy); assertIsoTimestampV2(retentionUntil);
    for (const dependency of unique) {
      const source = this.#row("SELECT c.*,s.scope_json FROM content_object c JOIN scope_catalog s USING(scope_key) WHERE content_id=? AND content_version=?", dependency.contentId, dependency.contentVersion);
      if (!source) fail("unavailable"); const sourceScope = scopeFrom(source);
      if (scope.kind === "global" || sourceScope.kind === "global" || sourceScope.workspaceId !== scope.workspaceId) fail("unavailable");
      this.#content(dependency, sourceScope); this.#files.read(this.#descriptor(source));
      if (source.privacy === "local-only") privacy = "local-only";
      if (text(source.retention_until) < retentionUntil) retentionUntil = text(source.retention_until);
    }
    const content: ContentRefV2 = { contentId: boundary.ids.next("content"), contentVersion: 1 }, reservation = boundary.ids.next("reservation");
    assertContentRefV2(content); assertIdentifierV2(reservation);
    if (retentionUntil <= this.#now()) fail("unavailable");
    this.#notForgotten(scope, { kind: "content", id: content.contentId, version: 1 });
    const fence = this.#currentFence(scope), bytes = new TextEncoder().encode(json({ format: "task-managed-content-v1", dependencies: unique, record: body }));
    this.#db.prepare("INSERT INTO content_object(content_id,content_version,scope_key,privacy,state,purpose,retention_until,created_at,reservation_id,digest,byte_count,fence_json) VALUES(?,?,?,?,'staged','cognition',?,?,?,NULL,NULL,?)")
      .run(content.contentId, 1, scopeKeyV2(scope), privacy, retentionUntil, this.#now(), reservation, json(fence));
    const descriptor = this.#files.stage({ contentId: content.contentId, version: 1, reservationId: reservation }, bytes); this.#files.publish(descriptor);
    this.#db.prepare("UPDATE content_object SET digest=?,byte_count=? WHERE content_id=? AND content_version=? AND state='staged'").run(descriptor.digest, descriptor.byteCount, content.contentId, 1);
    this.#publish(content, fence, privacy);
    for (const source of unique) this.#db.prepare("INSERT INTO task_content_dependency_v1(source_id,source_version,target_id,target_version) VALUES(?,?,?,?)").run(source.contentId, source.contentVersion, content.contentId, 1);
    return content;
  }
  #recordTaskCommand(scope: ScopeV2, command: LocalApiCommandV1, dependencies: readonly ContentRefV2[], boundary: TaskPersistenceBoundaryV1): ReturnType<TaskStoreHostV1["recordCommandEvidence"]> {
    if (scope.kind !== "task") fail("validation");
    const content = this.#writeTaskBody(scope, { schemaVersion: 1, command }, dependencies, boundary);
    const stored = this.#content(content, scope), now = this.#now(), streamId = `task-command:${scope.taskId}`;
    const sequence = number(this.#row("SELECT coalesce(max(last_sequence),0)+1 AS n FROM source_stream WHERE stream_id=?", streamId)!.n);
    const observation = parseObservationV2({ schemaVersion: 2, id: boundary.ids.next("observation"), revision: 1,
      scope, privacy: stored.privacy, sourceTrust: "user-direct", observedAt: now, recordedAt: now, actor: "user", kind: "user_input",
      source: { streamId, adapter: "local-api", surface: "local-api", sourceSequence: sequence, runtime: null,
        productSessionId: command.payload.kind === "task.create" ? command.payload.sessionId : null,
        runtimeSessionId: null, runtimeInstanceId: null, eventType: "task-command" },
      correlation: { taskAttempt: null, turnId: null, toolCallId: null, causationId: null, correlationId: null },
      content: { availability: "available", ref: content }, integrity: { status: "complete" } });
    // The stream identity must stay fixed across create and subsequent commands.
    const event = parseObservationV2({ ...observation, source: { ...observation.source, productSessionId: null } });
    this.appendObservation(event, this.#currentFence(scope), boundary.ids.next("event"));
    return { content, evidence: { source: { kind: "observation", id: event.id, revision: 1 }, scope, privacy: event.privacy,
      sourceTrust: event.sourceTrust, observedAt: event.observedAt, role: "supports" } };
  }

  stageContent(input: StageCognitiveContentV2): ContentRefV2 {
    plainDataRecord(input, ["ref", "reservationId", "fence", "privacy", "purpose", "retentionUntil", "bytes"]);
    assertContentRefV2(input.ref); assertIdentifierV2(input.reservationId); assertPrivacyV2(input.privacy);
    assertIsoTimestampV2(input.retentionUntil);
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    if (!input.bytes || !(input.bytes instanceof Uint8Array) || input.bytes.byteLength > 20 * 1024 * 1024
      || !uuid.test(input.ref.contentId) || !uuid.test(input.reservationId)
      || !["observation", "claim", "evidence", "artifact", "cognition"].includes(input.purpose)) fail("validation");
    // Reserve before filesystem writes; the bytes remain unreadable until a business commit.
    this.#transaction(true, () => {
      this.#fence(input.fence);
      this.#notForgotten(input.fence.scope, { kind: "content", id: input.ref.contentId, version: input.ref.contentVersion });
      if (input.retentionUntil <= this.#now()) fail("unavailable");
      if (this.#row("SELECT 1 FROM content_object WHERE content_id=? AND content_version=?", input.ref.contentId, input.ref.contentVersion)) fail("conflict");
      this.#db.prepare("INSERT INTO content_object(content_id,content_version,scope_key,privacy,state,purpose,retention_until,created_at,reservation_id,digest,byte_count,fence_json) VALUES(?,?,?,?,'staged',?,?,?,?,NULL,NULL,?)")
        .run(input.ref.contentId, input.ref.contentVersion, scopeKeyV2(input.fence.scope), input.privacy, input.purpose,
          input.retentionUntil, this.#now(), input.reservationId, json(input.fence));
    });
    try {
      const descriptor = this.#files.stage({ contentId: input.ref.contentId, version: input.ref.contentVersion, reservationId: input.reservationId }, input.bytes);
      this.#files.publish(descriptor);
      this.#transaction(true, () => {
        this.#fence(input.fence);
        this.#content(input.ref, input.fence.scope, ["staged"]);
        this.#db.prepare("UPDATE content_object SET digest=?,byte_count=? WHERE content_id=? AND content_version=? AND state='staged'")
          .run(descriptor.digest, descriptor.byteCount, input.ref.contentId, input.ref.contentVersion);
      });
      return structuredClone(input.ref);
    } catch (error) {
      // Reservation survives as a non-readable, recoverable orphan. Never infer commit from a file.
      if (error instanceof CognitiveStoreErrorV2) throw error;
      const code = (error as { code?: string })?.code;
      if (["validation", "conflict", "corruption", "unavailable"].includes(code ?? "")) fail(code as CognitiveStoreErrorCodeV2);
      fail("io");
    }
  }
  #publish(ref: ContentRefV2, fence: CognitionFenceV2, privacy: PrivacyV2): Row {
    this.#fence(fence);
    const row = this.#content(ref, fence.scope, ["staged", "available"]);
    if (row.privacy === "local-only" && privacy !== "local-only") fail("validation");
    if (row.state === "staged" && json(fence) !== row.fence_json) fail("revision_conflict");
    this.#files.read(this.#descriptor(row));
    if (row.state === "staged") this.#db.prepare("UPDATE content_object SET state='available' WHERE content_id=? AND content_version=? AND state='staged'").run(ref.contentId, ref.contentVersion);
    return row;
  }
  readContent(scope: ScopeV2, ref: ContentRefV2): Uint8Array {
    return this.#transaction(false, () => {
      this.#scope(scope); const row = this.#content(ref, scope);
      const bytes = this.#files.read(this.#descriptor(row)); this.#checkControl(); return bytes;
    });
  }

  #outbox(eventId: string, scope: ScopeV2, type: string, entityId: string, version: number, kind?: string): CognitiveCommitReceiptV2 {
    assertIdentifierV2(eventId); assertIdentifierV2(entityId); assertRevisionV2(version);
    if (this.#row("SELECT 1 FROM outbox WHERE event_id=?", eventId)) fail("conflict");
    const fence = this.#currentFence(scope);
    const entityKind = kind ?? ({ "observation.appended": "observation", "claim.committed": "claim", "content.orphaned": "content", "source.suppressed": "source", "content.forgotten": "control", "content.restricted": "control" } as Record<string, string>)[type];
    if (!entityKind) fail("validation");
    const result = this.#db.prepare("INSERT INTO outbox(event_id,scope_key,type,entity_kind,entity_id,version,cognition_epoch,recovery_epoch,created_at,publish_state) VALUES(?,?,?,?,?,?,?,?,?,'pending')")
      .run(eventId, scopeKeyV2(scope), type, entityKind, entityId, version, fence.cognitionEpoch, fence.recoveryEpoch, this.#now());
    return { cursor: Number(result.lastInsertRowid), eventId, cognitionEpoch: fence.cognitionEpoch, recoveryEpoch: fence.recoveryEpoch, replay: false };
  }
  #receipt(row: Row, replay: boolean): CognitiveCommitReceiptV2 {
    return { cursor: number(row.cursor), eventId: text(row.event_id), cognitionEpoch: number(row.cognition_epoch), recoveryEpoch: number(row.recovery_epoch), replay };
  }
  #bump(scope: ScopeV2, policy = false): void {
    const row = this.#scope(scope), column = policy ? "policy_epoch" : "cognition_epoch";
    this.#db.prepare(`UPDATE scope_catalog SET ${column}=? WHERE scope_key=? AND ${column}=?`)
      .run(increment(number(row[column])), scopeKeyV2(scope), number(row[column]));
  }

  appendObservation(input: ObservationV2, fence: CognitionFenceV2, eventId: string): CognitiveCommitReceiptV2 {
    const event = parseObservationV2(input); externalEventId(eventId);
    if (!sameScopeV2(event.scope, fence.scope)) fail("validation");
    return this.#transaction(true, () => {
      this.#notForgotten(event.scope, { kind: "observation", id: event.id, version: 1 });
      const previous = this.#row("SELECT * FROM observation_v2 WHERE id=? OR (stream_id=? AND source_sequence=?)", event.id, event.source.streamId, event.source.sourceSequence);
      if (previous) {
        this.#replayFence(fence);
        if (previous.event_json !== serializeObservationV2(event)) fail("conflict");
        if (["revoked", "purged"].includes(text(previous.availability))) fail("unavailable");
        const receipt = this.#row("SELECT * FROM outbox WHERE event_id=? AND type='observation.appended' AND entity_id=?", eventId, event.id);
        if (!receipt) fail("conflict"); return this.#receipt(receipt, true);
      }
      this.#fence(fence);
      if (this.#row("SELECT 1 FROM source_suppression WHERE scope_key=? AND binding_id=?", scopeKeyV2(event.scope), event.source.streamId)) fail("unavailable");
      const stream = this.#row("SELECT * FROM source_stream WHERE stream_id=?", event.source.streamId);
      const identity = json(streamIdentity(event));
      if (stream && (stream.identity_json !== identity || stream.scope_key !== scopeKeyV2(event.scope))) fail("conflict");
      const last = stream ? number(stream.last_sequence) : 0;
      if (event.source.sourceSequence <= last) fail("sequence");
      if (event.source.sourceSequence !== last + 1 && event.integrity.status === "complete") fail("sequence");
      if (!stream) this.#db.prepare("INSERT INTO source_stream(stream_id,identity_json,scope_key,last_sequence,state) VALUES(?,?,?,0,'complete')")
        .run(event.source.streamId, identity, scopeKeyV2(event.scope));
      if (event.content.availability === "available") this.#publish(event.content.ref, fence, event.privacy);
      this.#db.prepare("INSERT INTO observation_v2(id,scope_key,stream_id,source_sequence,content_id,content_version,event_json,availability) VALUES(?,?,?,?,?,?,?,?)")
        .run(event.id, scopeKeyV2(event.scope), event.source.streamId, event.source.sourceSequence,
          event.content.availability === "available" ? event.content.ref.contentId : null,
          event.content.availability === "available" ? event.content.ref.contentVersion : null,
          serializeObservationV2(event), event.content.availability);
      this.#db.prepare("UPDATE source_stream SET last_sequence=?,state=? WHERE stream_id=?")
        .run(event.source.sourceSequence, stream?.state === "incomplete" || event.integrity.status === "incomplete" ? "incomplete" : "complete", event.source.streamId);
      return this.#outbox(eventId, event.scope, "observation.appended", event.id, 1);
    });
  }

  listObservations(scope: ScopeV2): readonly ObservationV2[] {
    return this.#transaction(false, () => {
      this.#scope(scope);
      return this.#rows("SELECT * FROM observation_v2 WHERE scope_key=? ORDER BY row_id", scopeKeyV2(scope)).map(row => {
        const event = parseObservationV2(parse(row.event_json));
        if (event.content.availability === "available") {
          const content = this.#row("SELECT * FROM content_object WHERE content_id=? AND content_version=?", event.content.ref.contentId, event.content.ref.contentVersion);
          if (row.availability !== "available" || !content || content.state !== "available" || text(content.retention_until) <= this.#now())
            return parseObservationV2({ ...event, content: { availability: "unavailable", reason: row.availability === "purged" ? "purged" : "policy-blocked" } });
        }
        if (event.content.availability === "available") {
          const row = this.#content(event.content.ref, scope);
          if (row.privacy === "local-only") return parseObservationV2({ ...event, privacy: "local-only" });
        }
        return event;
      });
    });
  }

  #hydrateClaim(row: Row, requireAvailable: boolean): MemoryClaimV2 {
    const metadata = parse(row.metadata_json);
    const scope = (metadata as { scope: ScopeV2 }).scope;
    let statement = "Unavailable retained claim body";
    const content = this.#content(contentRef(row), scope, requireAvailable ? ["available"] : ["staged", "available", "revoked", "purged"], requireAvailable);
    if (content.state === "available" || (content.state === "staged" && content.digest !== null))
      statement = new TextDecoder("utf-8", { fatal: true }).decode(this.#files.read(this.#descriptor(content)));
    const claim = hydrateClaimV2(metadata, statement, {
      status: row.status as MemoryClaimV2["status"], revision: number(row.revision), updatedAt: text(row.updated_at),
      ...(row.superseded_by_version === null ? {} : { supersededByVersion: number(row.superseded_by_version) }),
    });
    return requireAvailable && content.privacy === "local-only" ? { ...claim, privacy: "local-only" } : claim;
  }
  #replayFence(fence: CognitionFenceV2): void {
    assertFenceShape(fence); this.#scope(fence.scope);
    const state = this.#state();
    if (fence.installationId !== state.installation_id || fence.recoveryEpoch !== state.recovery_epoch) fail("revision_conflict");
  }
  #validateEvidence(claim: MemoryClaimV2): void {
    for (const evidence of claim.evidence) {
      if (evidence.fragmentId !== undefined) fail("unsupported");
      const row = this.#row("SELECT * FROM observation_v2 WHERE id=?", evidence.source.id);
      if (!row || row.availability !== "available") fail("unavailable");
      const event = parseObservationV2(parse(row.event_json));
      if (!sameScopeV2(event.scope, evidence.scope) || event.privacy !== evidence.privacy
        || event.sourceTrust !== evidence.sourceTrust || event.observedAt !== evidence.observedAt
        || event.revision !== evidence.source.revision || event.integrity.status !== "complete"
        || event.content.availability !== "available") fail("validation");
      const content = this.#content(event.content.ref, event.scope);
      if (content.privacy === "local-only" && claim.privacy !== "local-only") fail("unavailable");
      if (this.#row("SELECT state FROM source_stream WHERE stream_id=?", event.source.streamId)?.state !== "complete") fail("unavailable");
    }
  }
  /** Commit core acceptance/correction snapshots under one SQLite transaction. */
  commitCandidateAcceptance(input: Readonly<{
    candidate: MemoryCandidateV2; candidateExpectedRevision: number; candidateContent: ContentRefV2;
    claim: MemoryClaimV2; claimExpectedRevision: number; claimContent: ContentRefV2;
    fence: CognitionFenceV2; eventId: string;
  }>): Readonly<{ candidate: CognitiveCommitReceiptV2; claim: CognitiveCommitReceiptV2 }> {
    plainDataRecord(input, ["candidate", "candidateExpectedRevision", "candidateContent", "claim", "claimExpectedRevision", "claimContent", "fence", "eventId"]);
    assertMemoryCandidateV2(input.candidate); assertMemoryClaimV2(input.claim); externalEventId(input.eventId);
    const candidate = structuredClone(input.candidate), claim = structuredClone(input.claim);
    if (candidate.status !== "ACCEPTED" || candidate.acceptedClaim?.claimId !== claim.id
      || candidate.acceptedClaim.version !== claim.version || candidate.statement !== claim.statement
      || candidate.kind !== claim.kind || candidate.privacy !== claim.privacy || !sameScopeV2(candidate.scope, claim.scope)
      || candidate.updatedAt !== claim.updatedAt || candidate.validFrom !== claim.validFrom || candidate.validUntil !== claim.validUntil
      || candidate.evidence.some(evidence => !claim.evidence.some(stored => json(stored) === json(evidence)))) fail("validation");
    return this.#transaction(true, () => {
      const claimEventId = `${input.eventId}:claim`, candidateEventId = `${input.eventId}:candidate`;
      const claimReceipt = this.#row("SELECT 1 FROM outbox WHERE event_id=?", claimEventId);
      const candidateReceipt = this.#row("SELECT 1 FROM outbox WHERE event_id=?", candidateEventId);
      if (!!claimReceipt !== !!candidateReceipt) fail("conflict");
      if (claimReceipt) this.#replayFence(input.fence); else this.#fence(input.fence);
      this.#bundleFence = structuredClone(input.fence);
      try {
        const claimResult = this.commitClaim({ claim, expectedRevision: input.claimExpectedRevision,
          content: input.claimContent, fence: input.fence, eventId: claimEventId });
        const candidateResult = this.commitCognitiveRecord("candidate", { record: candidate,
          expectedRevision: input.candidateExpectedRevision, content: input.candidateContent,
          fence: input.fence, eventId: candidateEventId });
        return { candidate: candidateResult, claim: claimResult };
      } finally { this.#bundleFence = undefined; }
    });
  }

  commitClaim(input: Readonly<{ claim: MemoryClaimV2; expectedRevision: number; content: ContentRefV2;
    fence: CognitionFenceV2; eventId: string }>): CognitiveCommitReceiptV2 {
    plainDataRecord(input, ["claim", "expectedRevision", "content", "fence", "eventId"]);
    assertMemoryClaimV2(input.claim); assertRevisionV2(input.expectedRevision, true);
    assertContentRefV2(input.content); externalEventId(input.eventId);
    const claim = structuredClone(input.claim);
    if (claim.status !== "ACTIVE" || !sameScopeV2(claim.scope, input.fence.scope)) fail("validation");
    return this.#transaction(true, () => {
      const current = this.#row("SELECT * FROM claim WHERE id=?", claim.id);
      const priorReceipt = this.#row("SELECT * FROM outbox WHERE event_id=?", input.eventId);
      if (priorReceipt) {
        this.#replayFence(input.fence);
        const stored = this.#row("SELECT * FROM claim_version WHERE claim_id=? AND version=?", claim.id, claim.version);
        if (!stored || stored.status === "FORGOTTEN") fail("unavailable");
        const body = this.#content(contentRef(stored), claim.scope);
        if (priorReceipt.type !== "claim.committed"
          || priorReceipt.entity_id !== claim.id || priorReceipt.version !== claim.version
          || stored.content_id !== input.content.contentId || stored.content_version !== input.content.contentVersion
          || stored.metadata_json !== json(immutableClaimMetadata(claim))
          || claim.revision !== input.expectedRevision + 1 || claim.revision !== stored.initial_revision || claim.updatedAt !== stored.initial_updated_at
          || new TextDecoder("utf-8", { fatal: true }).decode(this.#files.read(this.#descriptor(body))) !== claim.statement) fail("conflict");
        return this.#receipt(priorReceipt, true);
      }
      this.#fence(input.fence);
      this.#notForgotten(claim.scope, { kind: "claim", id: claim.id, version: claim.version });
      if (current ? current.revision !== input.expectedRevision : input.expectedRevision !== 0) fail("revision_conflict");
      if (claim.revision !== increment(input.expectedRevision) || claim.version !== (current ? increment(number(current.current_version)) : 1)) fail("revision_conflict");
      if (current && current.scope_key !== scopeKeyV2(claim.scope)) fail("validation");
      if (current ? claim.supersedes?.claimId !== claim.id || claim.supersedes.version !== current.current_version : claim.supersedes !== undefined) fail("validation");
      this.#validateEvidence(claim);
      const content = this.#publish(input.content, input.fence, claim.privacy);
      if (content.purpose !== "claim" || content.privacy !== claim.privacy) fail("validation");
      if (new TextDecoder("utf-8", { fatal: true }).decode(this.#files.read(this.#descriptor(content))) !== claim.statement) fail("conflict");
      let previous: Row | undefined;
      if (current) {
        previous = this.#row("SELECT * FROM claim_version WHERE claim_id=? AND version=?", claim.id, number(current.current_version));
        if (!previous || !["ACTIVE", "DISPUTED"].includes(text(previous.status)) || claim.updatedAt < text(previous.updated_at)) fail("revision_conflict");
        const old = this.#hydrateClaim(previous, true);
        if (claim.createdAt < old.createdAt || claim.updatedAt > this.#now() || claim.kind !== old.kind || claim.privacy !== old.privacy) fail("validation");
        this.#db.prepare("UPDATE claim_version SET status='SUPERSEDED',revision=?,superseded_by_version=?,updated_at=? WHERE claim_id=? AND version=? AND status IN ('ACTIVE','DISPUTED')")
          .run(claim.revision, claim.version, claim.updatedAt, claim.id, number(current.current_version));
        const changed = this.#db.prepare("UPDATE claim SET current_version=?,revision=? WHERE id=? AND revision=?")
          .run(claim.version, claim.revision, claim.id, input.expectedRevision);
        if (changed.changes !== 1) fail("revision_conflict");
      } else {
        this.#db.prepare("INSERT INTO claim(id,scope_key,current_version,revision) VALUES(?,?,?,?)")
          .run(claim.id, scopeKeyV2(claim.scope), claim.version, claim.revision);
      }
      const split = splitClaimV2(claim);
      this.#db.prepare("INSERT INTO claim_version(claim_id,version,scope_key,revision,initial_revision,initial_updated_at,status,content_id,content_version,metadata_json,superseded_by_version,updated_at) VALUES(?,?,?,?,?,?,'ACTIVE',?,?,?,NULL,?)")
        .run(claim.id, claim.version, scopeKeyV2(claim.scope), claim.revision, claim.revision, claim.updatedAt, input.content.contentId,
          input.content.contentVersion, json(split.metadata), claim.updatedAt);
      for (const evidence of claim.evidence) {
        if (!this.#row("SELECT 1 FROM evidence_edge WHERE claim_id=? AND claim_version=? AND observation_id=? AND role=?", claim.id, claim.version, evidence.source.id, evidence.role))
          this.#db.prepare("INSERT INTO evidence_edge(claim_id,claim_version,observation_id,role) VALUES(?,?,?,?)")
            .run(claim.id, claim.version, evidence.source.id, evidence.role);
        this.#insertDependency("observation", evidence.source.id, 1, "claim", claim.id, claim.version);
      }
      this.#insertDependency("content", input.content.contentId, input.content.contentVersion, "claim", claim.id, claim.version);
      this.#bump(claim.scope);
      const receipt = this.#outbox(input.eventId, claim.scope, "claim.committed", claim.id, claim.version);
      if (previous) {
        this.#lifecycle(receipt, claim.scope, "claim", claim.id, number(previous.version), text(previous.status), "SUPERSEDED", "corrected");
        this.#invalidateDependents("claim", claim.id, number(previous.version), false, receipt);
      }
      return receipt;
    });
  }
  #insertDependency(sourceKind: string, sourceId: string, sourceVersion: number, targetKind: string, targetId: string, targetVersion: number): void {
    if (!this.#row("SELECT 1 FROM dependency_edge WHERE source_kind=? AND source_id=? AND source_version=? AND target_kind=? AND target_id=? AND target_version=?",
      sourceKind, sourceId, sourceVersion, targetKind, targetId, targetVersion))
      this.#db.prepare("INSERT INTO dependency_edge VALUES(?,?,?,?,?,?,1)").run(sourceKind, sourceId, sourceVersion, targetKind, targetId, targetVersion);
  }
  #lifecycle(receipt: CognitiveCommitReceiptV2, scope: ScopeV2, kind: string, id: string, version: number, from: string, to: string, reason: string): void {
    const ordinal = number(this.#row("SELECT count(*) AS n FROM lifecycle_change WHERE cursor=?", receipt.cursor)!.n);
    this.#db.prepare("INSERT INTO lifecycle_change(id,scope_key,kind,entity_id,version,from_state,to_state,reason_code,at,cursor) VALUES(?,?,?,?,?,?,?,?,?,?)")
      .run(`lifecycle:${receipt.cursor}:${ordinal}`, scopeKeyV2(scope), kind, id, version, from, to, reason, this.#now(), receipt.cursor);
  }
  #invalidateDependents(sourceKind: string, sourceId: string, sourceVersion: number, forgotten: boolean, receipt: CognitiveCommitReceiptV2): void {
    const pending = [{ kind: sourceKind, id: sourceId, version: sourceVersion }], seen = new Set<string>();
    while (pending.length) {
      const source = pending.shift()!, key = json(source);
      if (seen.has(key)) continue; seen.add(key);
      if (seen.size > 100000) fail("corruption");
      for (const edge of this.#rows("SELECT * FROM snapshot_dependency WHERE source_kind=? AND source_id=? AND source_version=? AND required=1", source.kind, source.id, source.version)) {
        const snapshot = this.#row("SELECT * FROM cognitive_snapshot WHERE kind=? AND id=? AND revision=?", text(edge.target_kind), text(edge.target_id), number(edge.target_revision));
        if (!snapshot) fail("corruption");
        const scope = scopeFrom(this.#row("SELECT * FROM scope_catalog WHERE scope_key=?", text(snapshot.scope_key))!);
        if (snapshot.availability === "available") {
          this.#db.prepare("UPDATE cognitive_snapshot SET availability='revoked' WHERE kind=? AND id=? AND revision=?")
            .run(text(snapshot.kind), text(snapshot.id), number(snapshot.revision));
          this.#bump(scope);
        }
        if (forgotten) this.#revokeContent(contentRef(snapshot), scope, receipt);
      }
      for (const edge of this.#rows("SELECT * FROM dependency_edge WHERE source_kind=? AND source_id=? AND source_version=? AND required=1", source.kind, source.id, source.version)) {
        const target = { kind: text(edge.target_kind), id: text(edge.target_id), version: number(edge.target_version) };
        if (target.kind === "claim") {
          const claim = this.#row("SELECT * FROM claim_version WHERE claim_id=? AND version=?", target.id, target.version);
          if (!claim) fail("corruption");
          if ((forgotten && claim.status !== "FORGOTTEN") || (!forgotten && claim.status === "ACTIVE")) {
            const scope = scopeFrom(this.#row("SELECT * FROM scope_catalog WHERE scope_key=?", text(claim.scope_key))!);
            const state = forgotten ? "FORGOTTEN" : "DISPUTED";
            this.#db.prepare("UPDATE claim_version SET status=?,revision=revision+1,updated_at=? WHERE claim_id=? AND version=?")
              .run(state, this.#now(), target.id, target.version);
            this.#db.prepare("UPDATE claim SET revision=revision+1 WHERE id=? AND current_version=?").run(target.id, target.version);
            this.#bump(scope);
            this.#lifecycle(receipt, scope, "claim", target.id, target.version, text(claim.status), state, forgotten ? "source_forgotten" : "source_corrected");
            if (forgotten) this.#revokeContent(contentRef(claim), scope, receipt);
          }
        } else if (target.kind === "content" && forgotten) {
          const content = this.#row("SELECT * FROM content_object WHERE content_id=? AND content_version=?", target.id, target.version);
          if (!content) fail("corruption");
          const scope = scopeFrom(this.#row("SELECT * FROM scope_catalog WHERE scope_key=?", text(content.scope_key))!);
          this.#revokeContent({ contentId: target.id, contentVersion: target.version }, scope, receipt);
        }
        pending.push(target);
      }
    }
  }
  readClaim(scope: ScopeV2, id: string, version?: number): MemoryClaimV2 | undefined {
    assertIdentifierV2(id); if (version !== undefined) assertRevisionV2(version);
    return this.#transaction(false, () => {
      this.#scope(scope); const current = this.#row("SELECT * FROM claim WHERE id=? AND scope_key=?", id, scopeKeyV2(scope));
      if (!current) return undefined;
      const row = this.#row("SELECT * FROM claim_version WHERE claim_id=? AND version=?", id, version ?? number(current.current_version));
      if (!row || row.status === "FORGOTTEN") fail("unavailable");
      const claim = this.#hydrateClaim(row, true);
      if (claim.validFrom > this.#now() || (claim.validUntil && claim.validUntil <= this.#now())) fail("unavailable");
      if (version === undefined && claim.status !== "ACTIVE") fail("unavailable");
      this.#validateEvidence(claim); return claim;
    });
  }

  /** Exact domain snapshots, not an arbitrary JSON repository or an authority grant. */
  commitCognitiveRecord<K extends CognitiveRecordKindV2>(kind: K, input: Readonly<{
    record: CognitiveRecordByKindV2[K]; expectedRevision: number; content: ContentRefV2;
    fence: CognitionFenceV2; eventId: string;
  }>): CognitiveCommitReceiptV2 {
    plainDataRecord(input, ["record", "expectedRevision", "content", "fence", "eventId"]);
    const record = parseCognitiveRecordV2(kind, input.record), metadata = cognitiveRecordMetadataV2(kind, record);
    assertRevisionV2(input.expectedRevision, true); assertContentRefV2(input.content); externalEventId(input.eventId);
    // Their exact Task/Attempt/Outcome references require the later task-service persistence transaction.
    // Do not accept caller-provided "verified" booleans in place of those records.
    if (kind === "episode" || kind === "working-state") fail("unsupported");
    if (!sameScopeV2(metadata.scope, input.fence.scope)) fail("validation");
    return this.#transaction(true, () => {
      const previousReceipt = this.#row("SELECT * FROM outbox WHERE event_id=?", input.eventId);
      if (previousReceipt) {
        this.#replayFence(input.fence);
        const stored = this.#row("SELECT * FROM cognitive_snapshot WHERE kind=? AND id=? AND revision=?", kind, metadata.id, metadata.revision);
        if (!stored || stored.availability !== "available" || stored.metadata_json !== json(metadata)
          || stored.content_id !== input.content.contentId || stored.content_version !== input.content.contentVersion
          || previousReceipt.type !== "cognition.committed" || previousReceipt.entity_kind !== kind || previousReceipt.entity_id !== metadata.id
          || previousReceipt.version !== metadata.revision || json(this.#readRecord(stored)) !== json(record)) fail("conflict");
        return this.#receipt(previousReceipt, true);
      }
      this.#fence(input.fence);
      const current = this.#row("SELECT * FROM cognitive_record WHERE kind=? AND id=?", kind, metadata.id);
      if ((current ? number(current.current_revision) : 0) !== input.expectedRevision || metadata.revision !== increment(input.expectedRevision)) fail("revision_conflict");
      if (current && current.scope_key !== scopeKeyV2(metadata.scope)) fail("validation");
      this.#validateRecordEvidence(metadata);
      if (kind === "candidate" && "acceptedClaim" in record && record.acceptedClaim) {
        if (!this.#bundleFence) fail("unsupported");
        const accepted = this.#row("SELECT * FROM claim_version WHERE claim_id=? AND version=? AND scope_key=?", record.acceptedClaim.claimId, record.acceptedClaim.version, scopeKeyV2(metadata.scope));
        if (!accepted || accepted.status !== "ACTIVE") fail("unavailable");
      }
      if (current) {
        const prior = this.#row("SELECT * FROM cognitive_snapshot WHERE kind=? AND id=? AND revision=?", kind, metadata.id, input.expectedRevision)!;
        const previous = this.#readRecord(prior, false), previousMetadata = cognitiveRecordMetadataV2(kind, previous);
        if (metadata.createdAt !== previousMetadata.createdAt || metadata.updatedAt < previousMetadata.updatedAt
          || (metadata.version !== null && (previousMetadata.version === null || metadata.version < previousMetadata.version || metadata.version > previousMetadata.version + 1))) fail("validation");
        if (kind === "candidate") {
          const immutable = (value: unknown) => {
            const { revision: _r, updatedAt: _u, status: _s, acceptedClaim: _a, ...body } = value as Record<string, unknown>;
            return json(body);
          };
          if (immutable(previous) !== immutable(record)) fail("conflict");
        }
        if (kind === "hypothesis" && metadata.version === previousMetadata.version) {
          const immutable = (value: unknown) => {
            const { revision: _r, updatedAt: _u, status: _s, ...body } = value as Record<string, unknown>;
            return json(body);
          };
          if (immutable(previous) !== immutable(record)) fail("conflict");
        }
        const allowed: Record<string, readonly (string | null)[]> = {
          PENDING: ["PENDING", "ACCEPTED", "REJECTED", "EXPIRED"], OPEN: ["OPEN", "SUPPORTED", "REFUTED", "EXPIRED", "WITHDRAWN"],
          PROPOSED: ["PROPOSED", "ACTIVE", "ABANDONED"], ACTIVE: ["PROPOSED", "ACTIVE", "PAUSED", "ACHIEVED", "ABANDONED"], PAUSED: ["PROPOSED", "PAUSED", "ACTIVE", "ABANDONED"],
        };
        if (!allowed[previousMetadata.status ?? ""]?.includes(metadata.status)) fail("validation");
        const changes = this.#db.prepare("UPDATE cognitive_record SET current_revision=? WHERE kind=? AND id=? AND current_revision=?")
          .run(metadata.revision, kind, metadata.id, input.expectedRevision);
        if (changes.changes !== 1) fail("revision_conflict");
      } else {
        if (metadata.status !== ({ candidate: "PENDING", hypothesis: "OPEN", goal: "PROPOSED" } as Record<string, string>)[kind]
          || (metadata.version !== null && metadata.version !== 1)) fail("validation");
        this.#db.prepare("INSERT INTO cognitive_record(kind,id,current_revision,scope_key) VALUES(?,?,?,?)")
          .run(kind, metadata.id, metadata.revision, scopeKeyV2(metadata.scope));
      }
      const content = this.#publish(input.content, input.fence, metadata.privacy);
      if (content.purpose !== "cognition" || content.privacy !== metadata.privacy
        || new TextDecoder("utf-8", { fatal: true }).decode(this.#files.read(this.#descriptor(content))) !== json(record)) fail("conflict");
      this.#db.prepare("INSERT INTO cognitive_snapshot(kind,id,revision,version,scope_key,status,content_id,content_version,metadata_json,availability) VALUES(?,?,?,?,?,?,?,?,?,'available')")
        .run(kind, metadata.id, metadata.revision, metadata.version, scopeKeyV2(metadata.scope), metadata.status,
          input.content.contentId, input.content.contentVersion, json(metadata));
      const sources = [{ kind: "content", id: input.content.contentId, version: input.content.contentVersion },
        ...metadata.evidence.map(e => ({ kind: "observation", id: e.source.id, version: e.source.revision }))];
      if (kind === "candidate" && "acceptedClaim" in record && record.acceptedClaim)
        sources.push({ kind: "claim", id: record.acceptedClaim.claimId, version: record.acceptedClaim.version });
      for (const source of new Map(sources.map(s => [json(s), s])).values())
        this.#db.prepare("INSERT INTO snapshot_dependency VALUES(?,?,?,?,?,?,1)").run(source.kind, source.id, source.version, kind, metadata.id, metadata.revision);
      this.#bump(metadata.scope);
      return this.#outbox(input.eventId, metadata.scope, "cognition.committed", metadata.id, metadata.revision, kind);
    });
  }
  #validateRecordEvidence(metadata: CognitiveRecordMetadataV2): void {
    for (const evidence of metadata.evidence) {
      if (evidence.fragmentId !== undefined) fail("unsupported");
      const row = this.#row("SELECT * FROM observation_v2 WHERE id=?", evidence.source.id);
      if (!row || row.availability !== "available") fail("unavailable");
      const event = parseObservationV2(parse(row.event_json));
      if (event.revision !== evidence.source.revision || !sameScopeV2(event.scope, evidence.scope)
        || event.privacy !== evidence.privacy || event.sourceTrust !== evidence.sourceTrust || event.observedAt !== evidence.observedAt
        || event.content.availability !== "available" || event.integrity.status !== "complete") fail("validation");
      const content = this.#content(event.content.ref, event.scope);
      if (content.privacy === "local-only" && metadata.privacy !== "local-only") fail("unavailable");
      if (this.#row("SELECT state FROM source_stream WHERE stream_id=?", event.source.streamId)?.state !== "complete") fail("unavailable");
    }
  }
  #readRecord<K extends CognitiveRecordKindV2>(row: Row, checkTime = true): CognitiveRecordByKindV2[K] {
    const metadata = parse(row.metadata_json) as unknown as CognitiveRecordMetadataV2;
    if (row.availability !== "available") fail("unavailable");
    const content = this.#content(contentRef(row), metadata.scope, ["available"], checkTime);
    const body = new TextDecoder("utf-8", { fatal: true }).decode(this.#files.read(this.#descriptor(content)));
    const record = parseCognitiveRecordV2(row.kind as K, parse(body));
    if (json(cognitiveRecordMetadataV2(row.kind as K, record)) !== row.metadata_json) fail("corruption");
    if (checkTime) {
      if (("expiresAt" in record && record.expiresAt <= this.#now()) || ("validFrom" in record && record.validFrom > this.#now())
        || ("validUntil" in record && record.validUntil !== undefined && record.validUntil <= this.#now())) fail("unavailable");
      if (content.privacy === "local-only") return parseCognitiveRecordV2(row.kind as K, { ...record, privacy: "local-only" });
    }
    return record;
  }
  readCognitiveRecord<K extends CognitiveRecordKindV2>(kind: K, scope: ScopeV2, id: string, revision?: number): CognitiveRecordByKindV2[K] | undefined {
    assertIdentifierV2(id); if (revision !== undefined) assertRevisionV2(revision);
    if (kind === "episode" || kind === "working-state") fail("unsupported");
    return this.#transaction(false, () => {
      this.#scope(scope); const current = this.#row("SELECT * FROM cognitive_record WHERE kind=? AND id=? AND scope_key=?", kind, id, scopeKeyV2(scope));
      if (!current) return undefined;
      const row = this.#row("SELECT * FROM cognitive_snapshot WHERE kind=? AND id=? AND revision=?", kind, id, revision ?? number(current.current_revision));
      if (!row) fail("unavailable"); const record = this.#readRecord<K>(row);
      this.#validateRecordEvidence(cognitiveRecordMetadataV2(kind, record)); return record;
    });
  }

  readOutbox(scope: ScopeV2, after = 0): readonly CognitiveOutboxEventV2[] {
    assertRevisionV2(after, true);
    return this.#transaction(false, () => {
      this.#scope(scope);
      return this.#rows("SELECT * FROM outbox WHERE scope_key=? AND cursor>? ORDER BY cursor", scopeKeyV2(scope), after)
        .map(row => ({ ...this.#receipt(row, false), scope: structuredClone(scope), type: text(row.type), entityKind: text(row.entity_kind), entityId: text(row.entity_id),
          version: number(row.version), publishState: row.publish_state as CognitiveOutboxEventV2["publishState"] }));
    });
  }
  acknowledgeOutbox(scope: ScopeV2, consumerId: string, eventId: string, expectedCursor: number): number {
    assertIdentifierV2(consumerId); assertIdentifierV2(eventId); assertRevisionV2(expectedCursor, true);
    return this.#transaction(true, () => {
      this.#scope(scope); const key = scopeKeyV2(scope);
      const prior = this.#row("SELECT * FROM consumer_cursor WHERE consumer_id=? AND scope_key=?", consumerId, key);
      if ((prior ? number(prior.cursor) : 0) !== expectedCursor) fail("revision_conflict");
      const next = this.#row("SELECT * FROM outbox WHERE scope_key=? AND cursor>? ORDER BY cursor LIMIT 1", key, expectedCursor);
      if (!next || next.event_id !== eventId) fail("sequence");
      // This API acknowledges state projection only. It never grants external execution.
      if (prior) this.#db.prepare("UPDATE consumer_cursor SET cursor=? WHERE consumer_id=? AND scope_key=? AND cursor=?").run(number(next.cursor), consumerId, key, expectedCursor);
      else this.#db.prepare("INSERT INTO consumer_cursor VALUES(?,?,?)").run(consumerId, key, number(next.cursor));
      if (next.publish_state !== "quarantined") this.#db.prepare("UPDATE outbox SET publish_state='published' WHERE cursor=?").run(number(next.cursor));
      return number(next.cursor);
    });
  }

  #revokeContent(ref: ContentRefV2, scope: ScopeV2, receipt: CognitiveCommitReceiptV2): void {
    const row = this.#content(ref, scope, ["staged", "available", "revoked", "purged"], false);
    if (row.state === "purged" || row.state === "revoked") return;
    this.#db.prepare("UPDATE content_object SET state='revoked' WHERE content_id=? AND content_version=?").run(ref.contentId, ref.contentVersion);
    this.#db.prepare("UPDATE observation_v2 SET availability='revoked' WHERE content_id=? AND content_version=? AND availability='available'").run(ref.contentId, ref.contentVersion);
    this.#db.prepare("UPDATE cognitive_snapshot SET availability='revoked' WHERE content_id=? AND content_version=? AND availability='available'").run(ref.contentId, ref.contentVersion);
    for (const kind of ["file", "staging", "database", "wal", "projection", "cache", "artifact", "backup"]) {
      if (!this.#row("SELECT 1 FROM managed_copy WHERE content_id=? AND content_version=? AND copy_kind=?", ref.contentId, ref.contentVersion, kind))
        this.#db.prepare("INSERT INTO managed_copy VALUES(?,?,?,?,?)").run(ref.contentId, ref.contentVersion, kind,
          ["file", "staging", "database", "wal"].includes(kind) ? "pending" : "outside", this.#now());
    }
    this.#lifecycle(receipt, scope, "content", ref.contentId, ref.contentVersion, text(row.state), "revoked", "control_restricted");
  }

  applyControlIntent(input: RecoveryControlIntentV2): Readonly<{ controlSequence: number; recoveryEpoch: number; logicalCommitted: true }> {
    const intent = parseRecoveryControlIntentV2(input);
    this.#transaction(false, () => {
      // Resolve targets before making an irreversible durable control commitment.
      if ("targets" in intent) for (const target of intent.targets) this.#resolveTargets(target);
      if (intent.kind === "SOURCE_SUPPRESS") this.#scope(intent.scope);
    });
    this.#gate = true;
    try {
      const record = this.#journal.append(intent);
      this.reconcileControl();
      return { controlSequence: record.controlSequence, recoveryEpoch: record.recoveryEpoch, logicalCommitted: true };
    } catch (error) {
      // A durable intent cannot be withdrawn if SQLite fails. All reads remain gated until reconciliation.
      this.#gate = true;
      if (error instanceof CognitiveStoreErrorV2) throw error;
      fail("recovery_required");
    }
  }
  #resolveTargets(target: RecoveryControlTargetV2, missingAllowed = false): Row[] {
    if (missingAllowed && !this.#row("SELECT 1 FROM scope_catalog WHERE scope_key=?", scopeKeyV2(target.scope))) return [];
    this.#scope(target.scope);
    if (target.kind === "scope") {
      const keys = this.#rows("SELECT * FROM scope_catalog").filter(row => isScopeWithinV2(scopeFrom(row), target.scope)).map(row => text(row.scope_key));
      return keys.flatMap(key => this.#rows("SELECT * FROM content_object WHERE scope_key=?", key));
    }
    if (target.kind === "content") {
      if (missingAllowed && !this.#row("SELECT 1 FROM content_object WHERE content_id=? AND content_version=? AND scope_key=?", target.contentId, target.contentVersion, scopeKeyV2(target.scope))) return [];
      return [this.#content({ contentId: target.contentId, contentVersion: target.contentVersion }, target.scope, ["staged", "available", "revoked", "purged"], false)];
    }
    if (target.kind === "claim") {
      const row = this.#row("SELECT * FROM claim_version WHERE claim_id=? AND version=? AND scope_key=?", target.id, target.version, scopeKeyV2(target.scope));
      if (!row) { if (missingAllowed) return []; fail("unavailable"); } return [this.#content(contentRef(row), target.scope, ["staged", "available", "revoked", "purged"], false)];
    }
    const row = this.#row("SELECT * FROM observation_v2 WHERE id=? AND scope_key=?", target.id, scopeKeyV2(target.scope));
    if (!row) { if (missingAllowed) return []; fail("unavailable"); }
    return row.content_id === null ? [] : [this.#content(contentRef(row), target.scope, ["staged", "available", "revoked", "purged"], false)];
  }

  #affectedContents(inputTargets: readonly RecoveryControlTargetV2[]): Map<string, Row> {
    const targets = new Map<string, Row>();
    for (const target of inputTargets) for (const row of this.#resolveTargets(target, true)) targets.set(refKey(contentRef(row)), row);
    // Resolve the whole required dependency closure before any qualification changes.
    const nodes: { kind: string; id: string; version: number }[] = [];
    for (const row of targets.values()) nodes.push({ kind: "content", id: text(row.content_id), version: number(row.content_version) });
    const seen = new Set<string>();
    while (nodes.length) {
      const source = nodes.shift()!, key = json(source); if (seen.has(key)) continue; seen.add(key);
      if (seen.size > 100000) fail("corruption");
      if (source.kind === "content") {
        for (const edge of this.#rows("SELECT * FROM task_content_dependency_v1 WHERE source_id=? AND source_version=?", source.id, source.version)) {
          const content = this.#row("SELECT * FROM content_object WHERE content_id=? AND content_version=?", text(edge.target_id), number(edge.target_version));
          if (!content) fail("corruption"); targets.set(refKey(contentRef(content)), content);
          nodes.push({ kind: "content", id: text(content.content_id), version: number(content.content_version) });
        }
        for (const row of this.#rows("SELECT * FROM observation_v2 WHERE content_id=? AND content_version=?", source.id, source.version)) nodes.push({ kind: "observation", id: text(row.id), version: 1 });
      }
      for (const edge of this.#rows("SELECT * FROM dependency_edge WHERE source_kind=? AND source_id=? AND source_version=? AND required=1", source.kind, source.id, source.version)) {
        const target = { kind: text(edge.target_kind), id: text(edge.target_id), version: number(edge.target_version) }; nodes.push(target);
        const content = target.kind === "claim"
          ? this.#row("SELECT content_object.* FROM claim_version JOIN content_object USING(content_id,content_version) WHERE claim_id=? AND version=?", target.id, target.version)
          : target.kind === "content" ? this.#row("SELECT * FROM content_object WHERE content_id=? AND content_version=?", target.id, target.version) : undefined;
        if (content) { targets.set(refKey(contentRef(content)), content); nodes.push({ kind: "content", id: text(content.content_id), version: number(content.content_version) }); }
      }
      for (const edge of this.#rows("SELECT * FROM snapshot_dependency WHERE source_kind=? AND source_id=? AND source_version=? AND required=1", source.kind, source.id, source.version)) {
        const content = this.#row("SELECT content_object.* FROM cognitive_snapshot JOIN content_object USING(content_id,content_version) WHERE kind=? AND id=? AND revision=?", text(edge.target_kind), text(edge.target_id), number(edge.target_revision));
        if (!content) fail("corruption"); targets.set(refKey(contentRef(content)), content);
        nodes.push({ kind: "content", id: text(content.content_id), version: number(content.content_version) });
      }
    }
    return targets;
  }

  #applyRecord(record: RecoveryControlRecordV2): void {
    const intent = record.intent;
    if (intent.kind === "RESTORE_BEGIN") {
      this.#taskEngine.quarantineRecovery(record.recoveryEpoch);
      // Historical bindings cannot restore execution authority.
      // Historical projection events are quarantined before any reader can open.
      this.#db.prepare("UPDATE outbox SET publish_state='quarantined' WHERE recovery_epoch<?").run(record.recoveryEpoch);
      for (const scope of this.#rows("SELECT * FROM scope_catalog")) {
        const value = scopeFrom(scope); this.#bump(value); this.#bump(value, true);
      }
    } else if (intent.kind === "SOURCE_SUPPRESS") {
      const key = scopeKeyV2(intent.scope);
      if (this.#row("SELECT 1 FROM scope_catalog WHERE scope_key=?", key)) {
        if (!this.#row("SELECT 1 FROM source_suppression WHERE scope_key=? AND binding_id=? AND resource_id=?", key, intent.bindingId, intent.resourceId))
          this.#db.prepare("INSERT INTO source_suppression VALUES(?,?,?,?)").run(key, intent.bindingId, intent.resourceId, record.controlSequence);
        this.#bump(intent.scope, true);
        this.#outbox(`control:${record.controlSequence}:source`, intent.scope, "source.suppressed", intent.bindingId, 1);
      }
    } else {
      const targets = this.#affectedContents(intent.targets);
      const receipts = new Map<string, CognitiveCommitReceiptV2>();
      for (const row of targets.values()) {
        const scopeRow = this.#row("SELECT * FROM scope_catalog WHERE scope_key=?", text(row.scope_key));
        if (!scopeRow) fail("corruption"); const scope = scopeFrom(scopeRow);
        let receipt = receipts.get(text(row.scope_key));
        if (!receipt) {
          this.#bump(scope); if (intent.kind !== "FORGET") this.#bump(scope, true);
          receipt = this.#outbox(`control:${record.controlSequence}:${receipts.size}`, scope,
            intent.kind === "FORGET" ? "content.forgotten" : "content.restricted", intent.operationId, 1);
          receipts.set(text(row.scope_key), receipt);
        }
        if (intent.kind === "PRIVACY_RESTRICT") {
          this.#db.prepare("UPDATE content_object SET privacy='local-only' WHERE content_id=? AND content_version=?")
            .run(text(row.content_id), number(row.content_version));
        } else if (intent.kind === "RETENTION_SHORTEN") {
          if (intent.retentionUntil < text(row.retention_until)) this.#db.prepare("UPDATE content_object SET retention_until=? WHERE content_id=? AND content_version=?")
            .run(intent.retentionUntil, text(row.content_id), number(row.content_version));
        }
        if (intent.kind === "FORGET") {
          this.#revokeContent(contentRef(row), scope, receipt);
          this.#invalidateDependents("content", text(row.content_id), number(row.content_version), true, receipt);
          for (const observation of this.#rows("SELECT * FROM observation_v2 WHERE content_id=? AND content_version=?", text(row.content_id), number(row.content_version)))
            this.#invalidateDependents("observation", text(observation.id), 1, true, receipt);
        }
      }
      for (const target of intent.targets) if (target.kind === "claim" && intent.kind === "FORGET") {
        const receipt = receipts.get(scopeKeyV2(target.scope));
        if (receipt) this.#invalidateDependents("claim", target.id, target.version, true, receipt);
      }
    }
    this.#db.prepare("INSERT INTO deletion_projection VALUES(?,?,?,?)")
      .run(record.controlSequence, record.checksum, intent.operationId, this.#now());
    this.#db.prepare("UPDATE store_state SET applied_control_sequence=?,applied_control_checksum=?,recovery_epoch=? WHERE singleton=1")
      .run(record.controlSequence, record.checksum, record.recoveryEpoch);
  }

  reconcileControl(): void {
    if (this.#closed) fail("closed"); this.#gate = true;
    try {
      let control = this.#journal.read();
      if (control.recoveryRequired) control = this.#journal.reconcileDurableHead({
        expectedSequence: control.durableTail.controlSequence, expectedChecksum: control.durableTail.checksum, at: this.#now(),
      });
      this.#transaction(true, () => {
        const state = this.#state(), sequence = number(state.applied_control_sequence);
        if (state.installation_id !== control.installationId || sequence > control.head.controlSequence) fail("recovery_required");
        const record = sequence === 0 ? undefined : control.records[sequence - 1];
        const expected = record?.checksum ?? control.records[0]?.previousChecksum ?? control.head.checksum;
        if (state.applied_control_checksum !== expected || (record && state.recovery_epoch !== record.recoveryEpoch)) fail("recovery_required");
        for (const pending of control.records.slice(sequence)) this.#applyRecord(pending);
      }, true);
      this.#gate = false; this.#transaction(false, () => undefined);
    } catch (error) {
      this.#gate = true;
      if (error instanceof CognitiveStoreErrorV2) throw error;
      fail("recovery_required");
    }
  }

  /** Only explicitly registered synthetic content, never caller-supplied paths. */
  purgeContent(scope: ScopeV2, ref: ContentRefV2): readonly Readonly<{ copyKind: string; state: string }>[] {
    const row = this.#transaction(false, () => this.#content(ref, scope, ["revoked", "purged"], false));
    if (row.state !== "purged") {
      const result = this.#files.remove({ contentId: ref.contentId, version: ref.contentVersion, reservationId: text(row.reservation_id) });
      this.#transaction(true, () => {
        this.#content(ref, scope, ["revoked"], false);
        for (const [kind, state] of [["file", result.objects], ["staging", result.staging]] as const)
          this.#db.prepare("UPDATE managed_copy SET state=?,updated_at=? WHERE content_id=? AND content_version=? AND copy_kind=?")
            .run(state.state === "failed" ? "failed" : "purged", this.#now(), ref.contentId, ref.contentVersion, kind);
        if (result.objects.state !== "failed" && result.staging.state !== "failed") {
          this.#db.prepare("UPDATE content_object SET state='purged',digest=NULL,byte_count=NULL WHERE content_id=? AND content_version=? AND state='revoked'")
            .run(ref.contentId, ref.contentVersion);
          this.#db.prepare("UPDATE observation_v2 SET availability='purged' WHERE content_id=? AND content_version=? AND availability='revoked'")
            .run(ref.contentId, ref.contentVersion);
          this.#db.prepare("UPDATE cognitive_snapshot SET availability='purged' WHERE content_id=? AND content_version=? AND availability='revoked'")
            .run(ref.contentId, ref.contentVersion);
          this.#db.prepare("UPDATE managed_copy SET state='purged',updated_at=? WHERE content_id=? AND content_version=? AND copy_kind='database'")
            .run(this.#now(), ref.contentId, ref.contentVersion);
        }
      });
    }
    // WAL reclamation is independently retryable, never a promise of media erasure.
    try {
      this.#checkControl();
      const checkpoint = this.#db.prepare("PRAGMA wal_checkpoint(TRUNCATE)").get() as Row;
      if (number(checkpoint.busy) === 0) this.#transaction(true, () => {
        this.#db.prepare("UPDATE managed_copy SET state='purged',updated_at=? WHERE content_id=? AND content_version=? AND copy_kind='wal' AND EXISTS(SELECT 1 FROM content_object WHERE content_id=? AND content_version=? AND state='purged')")
          .run(this.#now(), ref.contentId, ref.contentVersion, ref.contentId, ref.contentVersion);
      });
    } catch (error) { if (error instanceof CognitiveStoreErrorV2) throw error; fail("sqlite"); }
    return this.managedCopies(scope, ref);
  }
  managedCopies(scope: ScopeV2, ref: ContentRefV2): readonly Readonly<{ copyKind: string; state: string }>[] {
    return this.#transaction(false, () => {
      this.#content(ref, scope, ["staged", "available", "revoked", "purged"], false);
      return this.#rows("SELECT * FROM managed_copy WHERE content_id=? AND content_version=? ORDER BY copy_kind", ref.contentId, ref.contentVersion)
        .map(row => ({ copyKind: text(row.copy_kind), state: text(row.state) }));
    });
  }
  collectStagedContent(scope: ScopeV2): readonly ContentRefV2[] {
    const refs = this.#transaction(true, () => {
      this.#scope(scope); const rows = this.#rows("SELECT * FROM content_object WHERE scope_key=? AND state='staged'", scopeKeyV2(scope));
      for (const row of rows) {
        const receipt = this.#outbox(`orphan:${row.reservation_id}`, scope, "content.orphaned", text(row.content_id), number(row.content_version));
        this.#revokeContent(contentRef(row), scope, receipt);
      }
      return rows.map(contentRef);
    });
    for (const ref of refs) this.purgeContent(scope, ref);
    return refs;
  }
  collectOrphanFiles(): readonly Readonly<{ contentId: string; version: number; state: string }>[] {
    const known = this.#transaction(false, () => this.#rows("SELECT * FROM content_object").map(row => ({
      contentId: text(row.content_id), version: number(row.content_version), reservationId: text(row.reservation_id),
    })));
    const result: { contentId: string; version: number; state: string }[] = [];
    for (const entry of this.#files.inventory(known)) if (entry.state === "orphan") {
      this.#checkControl(); const removed = this.#files.removeInventoryEntry(entry);
      result.push({ contentId: entry.contentId, version: entry.version, state: removed.state });
    }
    return result;
  }

  #recoveryState(): CognitiveRecoveryStateV2 {
    const state = this.#state();
    return { installationId: text(state.installation_id), schemaVersion: 3,
      controlSequence: number(state.applied_control_sequence), controlChecksum: text(state.applied_control_checksum),
      recoveryEpoch: number(state.recovery_epoch) };
  }
  get [cognitiveRecoveryPortV2](): CognitiveRecoveryPortV2 {
    return {
      exportSnapshot: destination => {
        const root = resolve(destination);
        if (!isAbsolute(destination) || root !== destination || realpathSync(root) !== root
          || !lstatSync(root).isDirectory() || readdirSync(root).length !== 0
          || root === this.#options.dataRoot || root === this.#options.controlRoot) fail("validation");
        const snapshot = this.#transaction(false, () => {
          const rows = this.#rows("SELECT * FROM content_object");
          if (rows.some(row => row.state === "staged" || row.state === "revoked"
            || (row.state === "available" && text(row.retention_until) <= this.#now()))) fail("unavailable");
          const contents = rows.filter(row => row.state === "available").map(row => this.#descriptor(row));
          const databaseBytes = number((this.#db.prepare("PRAGMA page_count").get() as Row).page_count)
            * number((this.#db.prepare("PRAGMA page_size").get() as Row).page_size);
          if (contents.length > 100000 || databaseBytes > 256 * 1024 * 1024
            || contents.reduce((size, item) => size + item.byteCount, databaseBytes) > 512 * 1024 * 1024) fail("unsupported");
          return { state: this.#recoveryState(), contents };
        });
        // A quiescent owner holds both product/control locks throughout this export.
        this.#checkControl();
        this.#db.prepare("VACUUM INTO ?").run(join(root, "product.sqlite"));
        mkdirSync(join(root, "content"), { mode: 0o700 });
        const files = ContentFilesV2.open({ contentRoot: join(root, "content"), initialize: true });
        for (const descriptor of snapshot.contents) {
          const copied = files.stage(descriptor, this.#files.read(descriptor));
          if (copied.digest !== descriptor.digest || copied.byteCount !== descriptor.byteCount) fail("corruption");
          files.publish(copied);
        }
        for (const path of [join(root, "product.sqlite"), join(root, "content", "objects"), join(root, "content", "staging"), join(root, "content"), root]) {
          const fd = openSync(path, "r"); try { fsyncSync(fd); } finally { closeSync(fd); }
        }
        this.#transaction(false, () => {
          if (json(this.#recoveryState()) !== json(snapshot.state)) fail("conflict");
          if (this.#rows("SELECT * FROM content_object").some(row => row.state === "staged" || row.state === "revoked"
            || (row.state === "available" && text(row.retention_until) <= this.#now()))) fail("unavailable");
        });
        return { ...snapshot.state, contents: snapshot.contents };
      },
      verifyRecoveryBoundary: () => {
        const result = this.#transaction(false, () => ({ ...this.#recoveryState(),
          nonQuarantinedOldOutbox: number(this.#row("SELECT count(*) AS n FROM outbox WHERE recovery_epoch<? AND publish_state!='quarantined'", number(this.#state().recovery_epoch))!.n) + number(this.#row("SELECT count(*) AS n FROM task_outbox_v1 WHERE recovery_epoch<? AND publish_state!='quarantined'", number(this.#state().recovery_epoch))!.n) }));
        const checkpoint = this.#db.prepare("PRAGMA wal_checkpoint(TRUNCATE)").get() as Row;
        if (number(checkpoint.busy) !== 0) fail("recovery_required");
        this.#checkControl(); return result;
      },
    };
  }

  #validateRows(): void {
    try {
      const state = this.#state(); assertIdentifierV2(state.installation_id); number(state.applied_control_sequence); number(state.recovery_epoch);
      if (state.installation_id !== this.#options.installationId) fail("corruption");
      const scopes = new Map<string, ScopeV2>();
      for (const row of this.#rows("SELECT * FROM scope_catalog")) {
        const scope = scopeFrom(row); if (scopeKeyV2(scope) !== row.scope_key) fail("corruption");
        number(row.cognition_epoch); number(row.policy_epoch); scopes.set(text(row.scope_key), scope);
      }
      const contents = new Map<string, Row>();
      for (const row of this.#rows("SELECT * FROM content_object")) {
        const ref = contentRef(row); assertContentRefV2(ref); assertPrivacyV2(row.privacy);
        assertIsoTimestampV2(row.created_at); assertIsoTimestampV2(row.retention_until); assertIdentifierV2(row.reservation_id);
        const fence = parse(row.fence_json) as CognitionFenceV2; assertFenceShape(fence);
        if (!scopes.has(text(row.scope_key)) || scopeKeyV2(fence.scope) !== row.scope_key || fence.installationId !== state.installation_id
          || fence.recoveryEpoch > number(state.recovery_epoch)) fail("corruption");
        if (row.state === "available") this.#files.read(this.#descriptor(row));
        if (row.state === "purged" && (row.digest !== null || row.byte_count !== null)) fail("corruption");
        contents.set(refKey(ref), row);
      }
      const observations = new Map<string, ObservationV2>(), streams = new Map<string, { identity: string; sequence: number; incomplete: boolean }>();
      for (const row of this.#rows("SELECT * FROM observation_v2 ORDER BY row_id")) {
        const event = parseObservationV2(parse(row.event_json)); number(row.row_id);
        if (event.id !== row.id || scopeKeyV2(event.scope) !== row.scope_key || event.source.streamId !== row.stream_id
          || event.source.sourceSequence !== row.source_sequence) fail("corruption");
        if (event.content.availability === "available") {
          const content = contents.get(refKey(event.content.ref));
          if (!content || content.scope_key !== row.scope_key || content.content_id !== row.content_id
            || content.content_version !== row.content_version || row.availability !== content.state) fail("corruption");
        } else if (row.content_id !== null || row.content_version !== null || row.availability !== "unavailable") fail("corruption");
        const previous = streams.get(event.source.streamId), identity = json(streamIdentity(event));
        if (previous && (previous.identity !== identity || previous.sequence >= event.source.sourceSequence)) fail("corruption");
        if (event.integrity.status === "complete" && event.source.sourceSequence !== (previous?.sequence ?? 0) + 1) fail("corruption");
        streams.set(event.source.streamId, { identity, sequence: event.source.sourceSequence, incomplete: !!previous?.incomplete || event.integrity.status === "incomplete" });
        observations.set(event.id, event);
      }
      const streamRows = this.#rows("SELECT * FROM source_stream");
      if (streamRows.length !== streams.size) fail("corruption");
      for (const row of streamRows) {
        const expected = streams.get(text(row.stream_id));
        if (!expected || row.identity_json !== expected.identity || row.last_sequence !== expected.sequence
          || row.state !== (expected.incomplete ? "incomplete" : "complete")) fail("corruption");
      }
      const requiredDependencies = new Set<string>();
      for (const row of this.#rows("SELECT * FROM claim_version")) {
        const claim = this.#hydrateClaim(row, false);
        assertIsoTimestampV2(row.initial_updated_at);
        if (number(row.initial_revision) > number(row.revision) || number(row.initial_revision) < number(row.version) || text(row.initial_updated_at) > text(row.updated_at)) fail("corruption");
        if (claim.id !== row.claim_id || claim.version !== row.version || scopeKeyV2(claim.scope) !== row.scope_key) fail("corruption");
        const edges = this.#rows("SELECT * FROM evidence_edge WHERE claim_id=? AND claim_version=?", claim.id, claim.version);
        const expected = new Set(claim.evidence.map(e => json([e.source.id, e.role])));
        if (edges.length !== expected.size || edges.some(e => !expected.has(json([e.observation_id, e.role])))) fail("corruption");
        for (const evidence of claim.evidence) {
          const event = observations.get(evidence.source.id);
          if (!event || event.revision !== evidence.source.revision || !sameScopeV2(event.scope, evidence.scope)
            || event.privacy !== evidence.privacy || event.sourceTrust !== evidence.sourceTrust || event.observedAt !== evidence.observedAt) fail("corruption");
          if (evidence.fragmentId !== undefined) fail("corruption");
          requiredDependencies.add(json(["observation", evidence.source.id, 1, "claim", claim.id, claim.version]));
        }
        requiredDependencies.add(json(["content", row.content_id, row.content_version, "claim", claim.id, claim.version]));
        if (row.superseded_by_version !== null && !this.#row("SELECT 1 FROM claim_version WHERE claim_id=? AND version=?", claim.id, number(row.superseded_by_version))) fail("corruption");
      }
      for (const row of this.#rows("SELECT * FROM claim")) {
        const versions = this.#rows("SELECT * FROM claim_version WHERE claim_id=? ORDER BY version", text(row.id));
        if (!versions.length || versions.some((v, index) => v.version !== index + 1 || v.scope_key !== row.scope_key)
          || versions.at(-1)!.version !== row.current_version || versions.at(-1)!.revision !== row.revision) fail("corruption");
        if (versions.slice(0, -1).some(v => v.status === "ACTIVE")) fail("corruption");
      }
      const dependencyRows = this.#rows("SELECT * FROM dependency_edge");
      if (dependencyRows.length !== requiredDependencies.size) fail("corruption");
      for (const edge of dependencyRows) {
        if (edge.required !== 1 || !requiredDependencies.has(json([edge.source_kind, edge.source_id, edge.source_version, edge.target_kind, edge.target_id, edge.target_version]))) fail("corruption");
      }
      for (const row of this.#rows("SELECT * FROM cognitive_snapshot")) {
        const metadata = parseCognitiveRecordMetadataV2(parse(row.metadata_json));
        if (metadata.kind !== row.kind || metadata.id !== row.id || metadata.revision !== row.revision || metadata.version !== row.version
          || scopeKeyV2(metadata.scope) !== row.scope_key || metadata.status !== row.status || ["episode", "working-state"].includes(metadata.kind)) fail("corruption");
        const content = contents.get(refKey(contentRef(row))); if (!content || content.scope_key !== row.scope_key) fail("corruption");
        const expected = new Set([json(["content", row.content_id, row.content_version]), ...metadata.evidence.map(e => json(["observation", e.source.id, e.source.revision]))]);
        if (metadata.acceptedClaim) {
          expected.add(json(["claim", metadata.acceptedClaim.claimId, metadata.acceptedClaim.version]));
          if (!this.#row("SELECT 1 FROM claim_version WHERE claim_id=? AND version=? AND scope_key=?",
            metadata.acceptedClaim.claimId, metadata.acceptedClaim.version, row.scope_key)) fail("corruption");
        }
        if (row.availability === "available") {
          if (content.state !== "available") fail("corruption");
          this.#readRecord(row, false);
        } else if (row.availability === "purged" ? content.state !== "purged" : !["available", "revoked"].includes(text(content.state))) fail("corruption");
        for (const evidence of metadata.evidence) {
          const event = observations.get(evidence.source.id);
          if (!event || evidence.fragmentId !== undefined || event.revision !== evidence.source.revision || !sameScopeV2(event.scope, evidence.scope)
            || event.privacy !== evidence.privacy || event.sourceTrust !== evidence.sourceTrust || event.observedAt !== evidence.observedAt) fail("corruption");
        }
        const edges = this.#rows("SELECT * FROM snapshot_dependency WHERE target_kind=? AND target_id=? AND target_revision=?", metadata.kind, metadata.id, metadata.revision);
        if ([...expected].some(key => !edges.some(e => e.required === 1 && json([e.source_kind, e.source_id, e.source_version]) === key))) fail("corruption");
        if (edges.length !== expected.size) fail("corruption");
        for (const edge of edges) {
          if (edge.required !== 1 || !expected.has(json([edge.source_kind, edge.source_id, edge.source_version]))) fail("corruption");
          if (edge.source_kind === "claim" && !this.#row("SELECT 1 FROM claim_version WHERE claim_id=? AND version=?", text(edge.source_id), number(edge.source_version))) fail("corruption");
        }
      }
      for (const row of this.#rows("SELECT * FROM cognitive_record")) {
        const snapshots = this.#rows("SELECT * FROM cognitive_snapshot WHERE kind=? AND id=? ORDER BY revision", text(row.kind), text(row.id));
        if (!snapshots.length || snapshots.some((s, index) => s.revision !== index + 1 || s.scope_key !== row.scope_key)
          || snapshots.at(-1)!.revision !== row.current_revision) fail("corruption");
      }
      const control = this.#journal.read();
      const projections = this.#rows("SELECT * FROM deletion_projection ORDER BY control_sequence");
      if (projections.length !== state.applied_control_sequence) fail("corruption");
      for (const [index, row] of projections.entries()) {
        const record = control.records[index];
        if (row.control_sequence !== index + 1 || !record || row.control_checksum !== record.checksum || row.operation_id !== record.intent.operationId) fail("corruption");
        const intent = record.intent;
        if ("targets" in intent) {
          for (const content of this.#affectedContents(intent.targets).values()) {
            if (intent.kind === "FORGET" && !["revoked", "purged"].includes(text(content.state))) fail("corruption");
            if (intent.kind === "PRIVACY_RESTRICT" && content.privacy !== "local-only") fail("corruption");
            if (intent.kind === "RETENTION_SHORTEN" && text(content.retention_until) > intent.retentionUntil) fail("corruption");
          }
        } else if (intent.kind === "SOURCE_SUPPRESS") {
          if (scopes.has(scopeKeyV2(intent.scope)) && !this.#row("SELECT 1 FROM source_suppression WHERE scope_key=? AND binding_id=? AND resource_id=?", scopeKeyV2(intent.scope), intent.bindingId, intent.resourceId)) fail("corruption");
        } else if (intent.kind === "RESTORE_BEGIN") {
          if (number(state.recovery_epoch) < record.recoveryEpoch || this.#row("SELECT 1 FROM outbox WHERE recovery_epoch<? AND publish_state!='quarantined'", record.recoveryEpoch)) fail("corruption");
        }
      }
      for (const row of this.#rows("SELECT * FROM source_suppression")) {
        const record = control.records[number(row.control_sequence) - 1];
        if (!record || record.intent.kind !== "SOURCE_SUPPRESS" || record.intent.bindingId !== row.binding_id || record.intent.resourceId !== row.resource_id
          || scopeKeyV2(record.intent.scope) !== row.scope_key || number(row.control_sequence) > number(state.applied_control_sequence)) fail("corruption");
      }
      for (const row of this.#rows("SELECT * FROM managed_copy")) {
        assertIsoTimestampV2(row.updated_at);
        const content = contents.get(refKey(contentRef(row))); if (!content || !["revoked", "purged"].includes(text(content.state))) fail("corruption");
        if (["database", "wal"].includes(text(row.copy_kind)) && row.state === "purged" && content.state !== "purged") fail("corruption");
      }
      for (const row of this.#rows("SELECT * FROM consumer_cursor")) {
        assertIdentifierV2(row.consumer_id); number(row.cursor);
        if (row.cursor !== 0 && !this.#row("SELECT 1 FROM outbox WHERE scope_key=? AND cursor=?", text(row.scope_key), number(row.cursor))) fail("corruption");
      }
      for (const row of this.#rows("SELECT * FROM lifecycle_change")) {
        assertIdentifierV2(row.id); assertIdentifierV2(row.entity_id); assertIsoTimestampV2(row.at);
        if (!["corrected", "source_forgotten", "source_corrected", "control_restricted"].includes(text(row.reason_code))) fail("corruption");
        const receipt = this.#row("SELECT * FROM outbox WHERE cursor=?", number(row.cursor)); if (!receipt) fail("corruption");
        if (row.kind === "claim" && !this.#row("SELECT 1 FROM claim_version WHERE scope_key=? AND claim_id=? AND version=?", text(row.scope_key), text(row.entity_id), number(row.version))) fail("corruption");
        if (row.kind === "content" && !contents.has(refKey({ contentId: text(row.entity_id), contentVersion: number(row.version) }))) fail("corruption");
      }
      for (const row of this.#rows("SELECT * FROM outbox")) {
        number(row.cursor); assertIdentifierV2(row.event_id); assertIdentifierV2(row.entity_id); assertIsoTimestampV2(row.created_at);
        if (!["observation.appended", "claim.committed", "cognition.committed", "content.forgotten", "content.restricted", "source.suppressed", "content.orphaned"].includes(text(row.type))
          || number(row.recovery_epoch) > number(state.recovery_epoch)
          || number(row.cognition_epoch) > number(this.#scope(scopes.get(text(row.scope_key))!).cognition_epoch)) fail("corruption");
        if (row.type === "observation.appended" && (!observations.has(text(row.entity_id)) || row.version !== 1
          || scopeKeyV2(observations.get(text(row.entity_id))!.scope) !== row.scope_key)) fail("corruption");
        if (row.type === "claim.committed" && !this.#row("SELECT 1 FROM claim_version WHERE claim_id=? AND version=? AND scope_key=?", text(row.entity_id), number(row.version), text(row.scope_key))) fail("corruption");
        if (row.type === "cognition.committed" && !this.#row("SELECT 1 FROM cognitive_snapshot WHERE kind=? AND id=? AND revision=? AND scope_key=?", text(row.entity_kind), text(row.entity_id), number(row.version), text(row.scope_key))) fail("corruption");
      }
      for (const edge of this.#rows("SELECT * FROM task_content_dependency_v1")) {
        const source = contents.get(refKey({ contentId: text(edge.source_id), contentVersion: number(edge.source_version) }));
        const target = contents.get(refKey({ contentId: text(edge.target_id), contentVersion: number(edge.target_version) }));
        if (!source || !target) fail("corruption");
        const sourceScope = scopes.get(text(source.scope_key)), targetScope = scopes.get(text(target.scope_key));
        if (!sourceScope || !targetScope || sourceScope.kind === "global" || targetScope.kind === "global"
          || sourceScope.workspaceId !== targetScope.workspaceId
          || (source.privacy === "local-only" && target.privacy !== "local-only") || text(target.retention_until) > text(source.retention_until)
          || (target.state === "available" && source.state !== "available")) fail("corruption");
      }
      this.#taskEngine.validateRows(); this.#executionEngine.validateRows();
      if (this.#db.prepare("PRAGMA foreign_key_check").all().length) fail("corruption");
    } catch (error) {
      if (error instanceof CognitiveStoreErrorV2 && error.code === "sqlite") throw error;
      if (["ERR_SQLITE_ERROR", "sqlite"].includes((error as { code?: string })?.code ?? "")) fail("sqlite");
      fail("corruption");
    }
  }
  close(): void {
    if (this.#closed) return;
    try { this.#db.close(); } catch { fail("sqlite"); }
    this.#closed = true;
    try { for (const lock of [...this.#locks].reverse()) lock.release(); } catch { fail("io"); }
  }
}

export function openSyntheticCognitionStoreV2(options: SyntheticCognitionStoreOptionsV2): SyntheticCognitionStoreV2 {
  return SyntheticCognitionStoreV2.open(options);
}
