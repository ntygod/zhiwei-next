import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { ids } from "../../domain/src/index.ts";
import { createNormalizedRuntimeEventV1 } from "../../protocol/src/index.ts";
import {
  applyCognitiveMigrationsV2, applyTaskMigrationsV1, configureCognitiveDatabaseV2,
  verifyCognitiveDatabaseV2, verifyTaskDatabaseV1, withTaskSnapshotV1,
} from "./cognitive-schema-v2.ts";
import {
  assertObservationLedgerMigrationSet, checksumObservationLedgerMigration,
  ObservationLedgerMigrationError, readAppliedObservationLedgerMigrations,
} from "./migrations.ts";
import {
  ObservationLedgerCorruptionError, ObservationLedgerError, openSqliteObservationLedgerV1,
} from "./sqlite-observation-ledger.ts";

// Development checks only: real isolated SQLite and entirely invented fixture data.
// These checks do not assert product acceptance or exercise real user databases.
const NOW = "2026-10-10T00:00:00.000Z";
const clock = { now: () => NOW };
const TASK_TABLES = [
  "session_v1", "task_v1", "task_snapshot_v1", "task_attempt_v1", "task_outcome_v1",
  "task_input_v1", "working_state_v1", "task_receipt_v1", "task_content_dependency_v1",
  "task_outbox_v1", "task_consumer_v1", "task_execution_v1", "task_execution_snapshot_v1",
  "task_execution_stream_v1", "task_execution_event_v1", "task_model_request_v1", "task_execution_ack_v1",
] as const;

function temporaryDatabase<T>(work: (filePath: string) => T): T {
  const root = mkdtempSync(join(tmpdir(), "zhiwei-task-schema-v1-"));
  try { return work(join(root, "synthetic.sqlite")); }
  finally { rmSync(root, { recursive: true, force: true }); }
}

function open(filePath: string) {
  const db = new DatabaseSync(filePath);
  const pragmas = configureCognitiveDatabaseV2(db, { filePath, busyTimeoutMs: 4321 });
  const migrations = applyTaskMigrationsV1(db, { clock, expectedPragmas: pragmas });
  return { db, pragmas, migrations };
}

function scalar(db: DatabaseSync, sql: string): unknown {
  return Object.values(db.prepare(sql).get() ?? {})[0];
}

/** Populate every table with a normally committed, scoped, synthetic record. */
function populate(db: DatabaseSync): void {
  db.exec("BEGIN IMMEDIATE");
  db.prepare("INSERT INTO scope_catalog VALUES (?, ?, 0, 0)").run("scope-session", '{"kind":"session","sessionId":"session"}');
  db.prepare("INSERT INTO scope_catalog VALUES (?, ?, 0, 0)").run("scope-task", '{"kind":"task","taskId":"task"}');
  for (const [id, scope] of [["session-body", "scope-session"], ["task-body", "scope-task"], ["input-body", "scope-task"], ["execution-body", "scope-task"]]) {
    db.prepare(`INSERT INTO content_object VALUES (?, 1, ?, 'local-only', 'available', 'cognition', ?, ?, ?, ?, 2, '{}')`)
      .run(id, scope, "2027-01-01T00:00:00.000Z", NOW, `reservation-${id}`, "a".repeat(64));
  }
  db.prepare("INSERT INTO session_v1 VALUES ('session', 'workspace', 'scope-session', 1, 1, 'daemon', 0, 1, 'session-body', 1, ?, ?)").run(NOW, NOW);
  db.exec("INSERT INTO task_v1 VALUES ('task', 'workspace', 'session', 'scope-task', 1)");
  db.prepare("INSERT INTO task_attempt_v1 VALUES ('attempt', 'task', 1, 1, 'RUNNING', 1, ?, ?)").run(NOW, NOW);
  db.prepare("INSERT INTO task_snapshot_v1 VALUES ('task', 1, 'scope-task', 'RUNNING', 1, 'attempt', 1, 'task-body', 1, ?)").run(NOW);
  db.prepare("INSERT INTO task_outcome_v1 VALUES ('outcome', 1, 'task', 'attempt', 1, 'unverifiable', 1, ?)").run(NOW);
  db.exec("INSERT INTO task_input_v1 VALUES ('input', 'task', 'attempt', 1, 1, 'runtime_input', 1, 1, 'input-body', 1, 'scope-task')");
  db.exec("INSERT INTO working_state_v1 VALUES ('task', 1, 'attempt', 'task-body', 1, 'scope-task')");
  for (let cursor = 1; cursor <= 3; cursor++) {
    db.prepare(`INSERT INTO task_outbox_v1 VALUES (?, ?, 'workspace', 'task', 'task', 1, 'task.progress', 1, 0, ?, 'pending', '{}')`)
      .run(cursor, `event-${cursor}`, NOW);
  }
  db.exec("INSERT INTO task_receipt_v1 VALUES ('principal', 'task.input', 'idempotency', 'command', 'workspace', 'task', 'task', 1, 1, 'input-body', 1, 'scope-task')");
  db.exec("INSERT INTO task_content_dependency_v1 VALUES ('task-body', 1, 'input-body', 1)");
  db.exec("INSERT INTO task_consumer_v1 VALUES ('consumer', 'workspace', 0)");
  db.prepare("INSERT INTO task_execution_v1 VALUES ('binding', 'execution-unit', 'workspace', 'task', 'attempt', 1, 1, 1, 0, 'scope-task', 1, 1, ?, ?)").run(NOW, NOW);
  db.prepare("INSERT INTO task_execution_snapshot_v1 VALUES ('binding', 1, 'task', 1, 'attempt', 1, 1, 0, 'scope-task', 'ALLOCATED', 0, 0, 'execution-body', 1, ?)").run(NOW);
  db.exec("INSERT INTO task_execution_stream_v1 VALUES ('binding', 'source', 'stream', 1, 'runtime-event')");
  db.prepare("INSERT INTO task_execution_event_v1 VALUES (1, 'runtime-event', 'runtime-idempotency', 'binding', 'task', 'attempt', 1, 1, 1, 0, 'scope-task', 'stream', 'source', 1, 'execution-body', 1, 2, ?)").run(NOW);
  db.prepare("INSERT INTO task_model_request_v1 VALUES ('binding', 'request', 'task', 'attempt', 1, 1, 1, 0, 1, 1024, 'scope-task', 'input-body', 1, ?)").run(NOW);
  db.exec("INSERT INTO task_execution_ack_v1 VALUES ('runtime-event', 2)");
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  db.exec("COMMIT");
}

test("fixed v3 creates 17 new STRICT tables in a verified real WAL database and reopens", () => {
  temporaryDatabase(filePath => {
    const first = open(filePath);
    try {
      assert.deepEqual(first.migrations.map(row => row.version), [1, 2, 3]);
      assert.deepEqual(first.pragmas, { journalMode: "wal", foreignKeys: 1, busyTimeoutMs: 4321,
        synchronous: 2, trustedSchema: 0, tempStore: 2, secureDelete: 1 });
      const tables = first.db.prepare("PRAGMA table_list").all()
        .filter(row => row.schema === "main" && !String(row.name).startsWith("sqlite_"));
      assert.equal(tables.length, 37);
      assert.ok(tables.every(row => row.strict === 1));
      assert.ok(TASK_TABLES.every(name => tables.some(row => row.name === name)));
      populate(first.db);
      withTaskSnapshotV1(first.db, first.pragmas, state => {
        assert.equal(first.db.isTransaction, true);
        assert.deepEqual(state.integrity, ["ok"]);
        assert.deepEqual(state.legacyRows, []);
      });
    } finally { first.db.close(); }
    const reopened = open(filePath);
    try {
      assert.deepEqual(reopened.migrations, first.migrations);
      withTaskSnapshotV1(reopened.db, reopened.pragmas, state => {
        assert.deepEqual(state.integrity, ["ok"]);
        for (const table of TASK_TABLES) assert.ok(Number(scalar(reopened.db, `SELECT COUNT(*) FROM ${table}`)) > 0);
      });
    } finally { reopened.db.close(); }
  });
});

test("v3 source is a permitted forward migration and its immutable checksum is recorded", () => {
  const { db } = open(":memory:");
  try {
    const migration = { version: 3, name: "task-session-v1", sql: readFileSync(new URL("../migrations/0003_task_session_v1.sql", import.meta.url), "utf8") };
    const prefix = [
      { version: 1, name: "normalized-runtime-event-v1", sql: readFileSync(new URL("../migrations/0001_normalized_runtime_event_v1.sql", import.meta.url), "utf8") },
      { version: 2, name: "cognitive-persistence-v2", sql: readFileSync(new URL("../migrations/0002_cognitive_persistence_v2.sql", import.meta.url), "utf8") }, migration,
    ];
    assertObservationLedgerMigrationSet(prefix);
    assert.equal(readAppliedObservationLedgerMigrations(db)[2].checksum, checksumObservationLedgerMigration(migration));
  } finally { db.close(); }
});

test("v1 runtime evidence survives v3 forward migration and old v1/v2 boundaries stay strict", () => {
  temporaryDatabase(filePath => {
    const ledger = openSqliteObservationLedgerV1({ filePath, clock });
    const event = createNormalizedRuntimeEventV1({
      protocolVersion: 1, workspaceId: ids.workspace("synthetic-workspace"), runtimeSessionId: ids.session("synthetic-session"),
      runtimeInstanceId: "synthetic-instance", source: { adapter: "synthetic-adapter", runtime: { implementation: "synthetic-runtime", version: "1" }, surface: "rpc", eventType: "response" },
      sequence: { domain: "synthetic-stream", value: 1 }, observedAt: NOW,
      provenance: "observed", persistence: "durable", stability: "boundary", compatibility: "required",
      correlation: { observed: { requestId: "request" }, normalized: { rpcRequestId: "request" } },
      data: { kind: "command.response", command: "get_state", success: true, phase: "command-result" },
    });
    const { inserted: _inserted, ...stored } = ledger.appendBatch([event]).results[0];
    ledger.close();
    const { db, pragmas } = open(filePath);
    try {
      withTaskSnapshotV1(db, pragmas, state => assert.deepEqual(state.legacyRows, [stored]));
      assert.throws(() => applyCognitiveMigrationsV2(db, { clock, expectedPragmas: pragmas }), ObservationLedgerMigrationError);
      db.exec("BEGIN");
      assert.throws(() => verifyCognitiveDatabaseV2(db, pragmas), ObservationLedgerMigrationError);
      db.exec("ROLLBACK");
    } finally { db.close(); }
    assert.throws(() => openSqliteObservationLedgerV1({ filePath, clock }), ObservationLedgerMigrationError);
  });
});

test("product row validation runs before migration commit, including already migrated opens", () => {
  temporaryDatabase(filePath => {
    const db = new DatabaseSync(filePath);
    try {
      const expectedPragmas = configureCognitiveDatabaseV2(db, { filePath, busyTimeoutMs: 100 });
      applyCognitiveMigrationsV2(db, { clock, expectedPragmas });
      db.exec("INSERT INTO scope_catalog VALUES ('existing', '{\"kind\":\"global\"}', 0, 0)");
      const before = readAppliedObservationLedgerMigrations(db);
      const failure = Object.assign(new Error("Synthetic product row validation failure."), { code: "corruption" });
      assert.throws(() => applyTaskMigrationsV1(db, { clock, expectedPragmas, validateProductRows: () => {
        assert.equal(db.isTransaction, true);
        assert.equal(scalar(db, "PRAGMA user_version"), 3);
        assert.equal(scalar(db, "SELECT COUNT(*) FROM scope_catalog"), 1);
        throw failure;
      } }), error => error === failure);
      assert.equal(db.isTransaction, false);
      assert.equal(scalar(db, "PRAGMA user_version"), 2);
      assert.equal(scalar(db, "SELECT COUNT(*) FROM sqlite_schema WHERE name='session_v1'"), 0);
      assert.deepEqual(readAppliedObservationLedgerMigrations(db), before);
      let calls = 0;
      const validateProductRows = () => { assert.equal(db.isTransaction, true); calls++; };
      applyTaskMigrationsV1(db, { clock, expectedPragmas, validateProductRows });
      assert.equal(calls, 1);
      applyTaskMigrationsV1(db, { clock, expectedPragmas, validateProductRows });
      assert.equal(calls, 2);
      assert.equal(db.isTransaction, false);
    } finally { db.close(); }
  });
});

test("a failed fresh product validation rolls back schema, history and user_version together", () => {
  const db = new DatabaseSync(":memory:");
  try {
    const expectedPragmas = configureCognitiveDatabaseV2(db, { filePath: ":memory:", busyTimeoutMs: 100 });
    assert.throws(() => applyTaskMigrationsV1(db, { clock, expectedPragmas, validateProductRows: () => {
      throw new ObservationLedgerCorruptionError("Synthetic validation failure.");
    } }), ObservationLedgerCorruptionError);
    assert.equal(db.isTransaction, false);
    assert.equal(scalar(db, "PRAGMA user_version"), 0);
    assert.equal(scalar(db, "SELECT COUNT(*) FROM sqlite_schema WHERE name NOT GLOB 'sqlite_*'"), 0);
    assert.equal(applyTaskMigrationsV1(db, { clock, expectedPragmas }).length, 3);
  } finally { db.close(); }
});

test("a product validator cannot end the migration transaction without detection", () => {
  const db = new DatabaseSync(":memory:");
  try {
    const expectedPragmas = configureCognitiveDatabaseV2(db, { filePath: ":memory:", busyTimeoutMs: 100 });
    assert.throws(() => applyTaskMigrationsV1(db, { clock, expectedPragmas, validateProductRows: () => {
      db.exec("ROLLBACK");
    } }), ObservationLedgerCorruptionError);
    assert.equal(db.isTransaction, false);
    assert.equal(scalar(db, "PRAGMA user_version"), 0);
  } finally { db.close(); }
});

test("task reads require and retain an explicit snapshot, with caller errors preserved", () => {
  const { db, pragmas } = open(":memory:");
  try {
    assert.equal(pragmas.journalMode, "memory");
    assert.throws(() => verifyTaskDatabaseV1(db, pragmas), ObservationLedgerCorruptionError);
    const failure = new Error("Synthetic reader error.");
    assert.throws(() => withTaskSnapshotV1(db, pragmas, () => { throw failure; }), error => error === failure);
    assert.equal(db.isTransaction, false);
    db.exec("BEGIN IMMEDIATE");
    withTaskSnapshotV1(db, pragmas, state => assert.deepEqual(state.integrity, ["ok"]));
    assert.equal(db.isTransaction, true);
    db.exec("ROLLBACK");
  } finally { db.close(); }
});

test("a borrowed task snapshot cannot silently disappear while its reader runs", () => {
  const { db, pragmas } = open(":memory:");
  try {
    db.exec("BEGIN");
    assert.throws(() => withTaskSnapshotV1(db, pragmas, () => { db.exec("ROLLBACK"); }), ObservationLedgerCorruptionError);
    assert.equal(db.isTransaction, false);
    withTaskSnapshotV1(db, pragmas, state => assert.deepEqual(state.integrity, ["ok"]));
  } finally { db.close(); }
});

test("task schema connection errors are normalized without native SQLite messages", () => {
  const { db, pragmas } = open(":memory:");
  db.close();
  for (const action of [() => verifyTaskDatabaseV1(db, pragmas), () => withTaskSnapshotV1(db, pragmas, () => undefined),
    () => applyTaskMigrationsV1(db, { clock, expectedPragmas: pragmas })]) {
    assert.throws(action, error => error instanceof ObservationLedgerError && error.code === "sqlite");
  }
});

test("task schema enforces append-only evidence, replacement guards and scoped references", () => {
  const { db, pragmas } = open(":memory:");
  try {
    populate(db);
    for (const table of TASK_TABLES) {
      assert.throws(() => db.exec(`DELETE FROM ${table}`), /reject delete/);
      assert.throws(() => db.exec(`INSERT OR REPLACE INTO ${table} SELECT * FROM ${table}`), /reject replacement/);
    }
    for (const table of ["task_snapshot_v1", "task_outcome_v1", "task_input_v1", "working_state_v1", "task_receipt_v1", "task_content_dependency_v1",
      "task_execution_snapshot_v1", "task_execution_event_v1", "task_model_request_v1", "task_execution_ack_v1"]) {
      const column = String(db.prepare(`PRAGMA table_xinfo('${table}')`).get()?.name);
      assert.throws(() => db.exec(`UPDATE ${table} SET ${column}=${column}`), /reject update/);
    }
    assert.throws(() => db.prepare("INSERT INTO task_input_v1 VALUES ('wrong-scope', 'task', 'attempt', 1, 1, 'runtime_input', 2, 1, 'session-body', 1, 'scope-task')").run(), /FOREIGN KEY/);
    assert.throws(() => db.exec("INSERT INTO task_consumer_v1 VALUES ('invalid', 'workspace', 9007199254740992)"), /CHECK/);
    assert.throws(() => db.exec("INSERT INTO task_consumer_v1 VALUES (' ', 'workspace', 0)"), /CHECK/);
    withTaskSnapshotV1(db, pragmas, state => assert.deepEqual(state.integrity, ["ok"]));
  } finally { db.close(); }
});

test("session/task revisions, owner fencing and consumer/outbox progress are monotonic", () => {
  const { db } = open(":memory:");
  try {
    populate(db);
    assert.throws(() => db.exec("UPDATE session_v1 SET revision=3"), /guard update/);
    assert.throws(() => db.exec("UPDATE session_v1 SET revision=2, owner_instance_id='other'"), /guard update/);
    db.exec("UPDATE session_v1 SET revision=2, owner_epoch=2, owner_instance_id='other', requires_reauthorization=1");
    assert.throws(() => db.exec("UPDATE session_v1 SET revision=3, owner_epoch=1"), /guard update/);
    assert.throws(() => db.exec("UPDATE task_v1 SET current_revision=3"), /guard update/);
    db.exec("UPDATE task_consumer_v1 SET cursor=2");
    assert.throws(() => db.exec("UPDATE task_consumer_v1 SET cursor=1"), /guard update/);
    db.exec("UPDATE task_outbox_v1 SET publish_state='published' WHERE cursor=1");
    assert.throws(() => db.exec("UPDATE task_outbox_v1 SET publish_state='pending' WHERE cursor=1"), /guard update/);
    db.exec("UPDATE task_outbox_v1 SET publish_state='quarantined' WHERE cursor=2");
    assert.throws(() => db.exec("UPDATE task_outbox_v1 SET publish_state='published' WHERE cursor=2"), /guard update/);
    db.exec("UPDATE task_attempt_v1 SET state='PAUSED', active=0");
    assert.throws(() => db.exec("UPDATE task_attempt_v1 SET active=1"), /guard update/);
    db.exec("UPDATE task_attempt_v1 SET state='FAILED'");
    assert.throws(() => db.exec("UPDATE task_attempt_v1 SET state='READY'"), /guard update/);
  } finally { db.close(); }
});

test("execution stream positions advance by source sequence rather than requiring contiguous events", () => {
  const { db, pragmas } = open(":memory:");
  try {
    populate(db);
    db.exec("BEGIN IMMEDIATE");
    db.prepare("INSERT INTO task_execution_event_v1 VALUES (2, 'runtime-event-later', 'runtime-idempotency-later', 'binding', 'task', 'attempt', 1, 1, 1, 0, 'scope-task', 'stream', 'source', 4, 'execution-body', 1, 3, ?)").run(NOW);
    db.exec("UPDATE task_execution_stream_v1 SET last_sequence=4, last_event_id='runtime-event-later'");
    db.exec("COMMIT");
    assert.throws(() => db.exec("UPDATE task_execution_stream_v1 SET last_sequence=3, last_event_id='runtime-event'"), /guard update/);
    assert.throws(() => db.exec("UPDATE task_execution_stream_v1 SET last_sequence=5"), /guard update/);
    withTaskSnapshotV1(db, pragmas, state => assert.deepEqual(state.integrity, ["ok"]));
  } finally { db.close(); }
});

test("execution snapshots require consistent dispatch/closure state and preserve current-pointer FKs", () => {
  const { db } = open(":memory:");
  try {
    populate(db);
    for (const [state, dispatched, closed] of [["BUSY", 0, 0], ["DRAINING", 0, 0], ["STOPPED", 0, 0], ["READY", 1, 0], ["ALLOCATED", 0, 1]] as const) {
      assert.throws(() => db.prepare("INSERT INTO task_execution_snapshot_v1 VALUES ('binding', 2, 'task', 1, 'attempt', 1, 1, 0, 'scope-task', ?, ?, ?, 'execution-body', 1, ?)").run(state, dispatched, closed, NOW), /CHECK/);
    }
    db.exec("BEGIN IMMEDIATE");
    db.prepare("INSERT INTO task_execution_snapshot_v1 VALUES ('binding', 2, 'task', 1, 'attempt', 1, 1, 0, 'scope-task', 'READY', 0, 0, 'execution-body', 1, ?)").run(NOW);
    db.exec("UPDATE task_execution_v1 SET current_revision=2");
    db.exec("COMMIT");
    assert.throws(() => db.exec("UPDATE task_execution_v1 SET current_revision=4"), /guard update/);
    db.exec("BEGIN IMMEDIATE");
    db.exec("UPDATE task_execution_v1 SET current_revision=3");
    assert.throws(() => db.exec("COMMIT"), /FOREIGN KEY/);
    db.exec("ROLLBACK");
    assert.equal(scalar(db, "SELECT current_revision FROM task_execution_v1"), 2);
  } finally { db.close(); }
});
