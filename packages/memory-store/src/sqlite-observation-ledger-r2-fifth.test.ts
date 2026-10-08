import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { createNormalizedRuntimeEventV1 } from "../../protocol/src/index.ts";
import {
  ObservationLedgerCorruptionError,
  ObservationLedgerError,
  openSqliteObservationLedgerV1,
} from "./sqlite-observation-ledger.ts";
import {
  ObservationLedgerMigrationError,
  applyObservationLedgerMigrations,
} from "./migrations.ts";

const clock = { now: () => "2026-10-08T00:00:00.000Z" };
function event(sequence = 1) {
  return createNormalizedRuntimeEventV1({
    protocolVersion: 1,
    workspaceId: "synthetic-workspace",
    runtimeSessionId: "synthetic-session",
    runtimeInstanceId: "synthetic-instance",
    source: {
      adapter: "pi-rpc-v1",
      runtime: { implementation: "pi", version: "0.84.1" },
      surface: "rpc",
      eventType: "response",
    },
    sequence: { domain: "rpc-jsonl", value: sequence },
    observedAt: "2026-10-08T00:00:00.000Z",
    provenance: "observed",
    persistence: "durable",
    stability: "boundary",
    compatibility: "required",
    correlation: {
      observed: { requestId: `synthetic-request-${sequence}` },
      normalized: { rpcRequestId: `synthetic-rpc-${sequence}` },
    },
    data: { kind: "command.response", command: "get_state", success: true, phase: "command-result" },
  });
}
function open(filePath: string) {
  return openSqliteObservationLedgerV1({ filePath, busyTimeoutMs: 0, clock });
}
function schema(database: DatabaseSync) {
  // No prefix filter: the regression oracle must see every SQLite object.
  return database.prepare("SELECT type, name, sql FROM sqlite_schema ORDER BY type, name").all();
}
function count(database: DatabaseSync, table: string) {
  return Number((database.prepare(`SELECT count(*) AS count FROM ${table}`).get() as { count: number }).count);
}
const hiddenObjects = `
  CREATE TABLE sqlitex_side_effect(event_id TEXT);
  CREATE TRIGGER sqlitex_capture AFTER INSERT ON runtime_events
  BEGIN INSERT INTO sqlitex_side_effect VALUES (NEW.event_id); END;
`;

test("literal sqlite_ prefix does not hide user tables when deciding whether a DB is empty", () => {
  for (const name of ["sqlitex_marker", "sqliteX_marker", "SQLITEX_marker"]) {
    const root = mkdtempSync(join(tmpdir(), "zhiwei-prefix-empty-"));
    const filePath = join(root, "synthetic.sqlite");
    const raw = new DatabaseSync(filePath);
    try {
      raw.exec(`CREATE TABLE ${name}(value TEXT); INSERT INTO ${name} VALUES ('synthetic');`);
      const before = schema(raw);
      assert.throws(() => open(filePath), ObservationLedgerMigrationError);
      assert.deepEqual(schema(raw), before);
      assert.equal(count(raw, name), 1);
      assert.equal((raw.prepare("PRAGMA user_version").get() as { user_version: number }).user_version, 0);
    } finally {
      raw.close();
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("reopen rejects sqlitex tables and mutating triggers before any official write", () => {
  const root = mkdtempSync(join(tmpdir(), "zhiwei-prefix-reopen-"));
  const filePath = join(root, "synthetic.sqlite");
  open(filePath).close();
  const raw = new DatabaseSync(filePath);
  try {
    raw.exec(hiddenObjects);
    const before = schema(raw);
    assert.throws(() => open(filePath), ObservationLedgerCorruptionError);
    assert.deepEqual(schema(raw), before);
    assert.equal(count(raw, "runtime_events"), 0);
    assert.equal(count(raw, "sqlitex_side_effect"), 0);
  } finally {
    raw.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("post-open hidden-prefix Schema drift fails every public read/write and integrity boundary", () => {
  const root = mkdtempSync(join(tmpdir(), "zhiwei-prefix-active-"));
  const filePath = join(root, "synthetic.sqlite");
  const ledger = open(filePath);
  const first = event();
  ledger.append(first);
  const raw = new DatabaseSync(filePath);
  try {
    raw.exec(hiddenObjects);
    const beforeSchema = schema(raw);
    const beforeRows = raw.prepare("SELECT * FROM runtime_events ORDER BY row_id").all();
    const beforeCursor = raw.prepare("SELECT * FROM sqlite_sequence ORDER BY name").all();
    const operations = [
      () => ledger.getByEventId(first.eventId),
      () => ledger.getByIdempotencyKey(first.idempotencyKey),
      () => ledger.readSession("synthetic-workspace", "synthetic-session"),
      () => ledger.readWorkspace("synthetic-workspace"),
      () => ledger.countEvents(),
      () => ledger.integrityCheck(),
      () => ledger.assertIntegrity(),
      () => ledger.append(event(2)),
      () => ledger.appendBatch([first, event(2)]),
    ];
    for (const operation of operations) {
      assert.throws(operation, (error: unknown) => error instanceof ObservationLedgerCorruptionError && error.code === "corruption");
      assert.deepEqual(schema(raw), beforeSchema);
      assert.deepEqual(raw.prepare("SELECT * FROM runtime_events ORDER BY row_id").all(), beforeRows);
      assert.deepEqual(raw.prepare("SELECT * FROM sqlite_sequence ORDER BY name").all(), beforeCursor);
      assert.equal(count(raw, "sqlitex_side_effect"), 0);
    }
  } finally {
    ledger.close();
    raw.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("initial WAL migration lock is a sqlite operational error and leaves no partial schema", () => {
  const root = mkdtempSync(join(tmpdir(), "zhiwei-initial-lock-"));
  const filePath = join(root, "synthetic.sqlite");
  const blocker = new DatabaseSync(filePath);
  try {
    blocker.exec("PRAGMA journal_mode=WAL; BEGIN IMMEDIATE");
    const before = schema(blocker);
    assert.throws(() => open(filePath), (error: unknown) => {
      assert.ok(error instanceof ObservationLedgerError);
      assert.equal(error.code, "sqlite");
      assert.ok(!(error instanceof ObservationLedgerMigrationError));
      const cause = error.cause as Error & { code: string; errcode: number };
      assert.equal(cause.code, "ERR_SQLITE_ERROR");
      assert.equal(cause.errcode & 255, 5); // SQLITE_BUSY, including extended codes.
      return true;
    });
    assert.deepEqual(schema(blocker), before);
    assert.equal((blocker.prepare("PRAGMA user_version").get() as { user_version: number }).user_version, 0);
    blocker.exec("ROLLBACK");
    const recovered = open(filePath);
    try {
      assert.equal(recovered.schemaVersion, 1);
      assert.equal(recovered.append(event()).inserted, true);
      assert.deepEqual(recovered.integrityCheck(), ["ok"]);
    } finally { recovered.close(); }
  } finally {
    if (blocker.isTransaction) blocker.exec("ROLLBACK");
    blocker.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("initial migration COMMIT failure preserves its operational cause and rolls back DDL", () => {
  const root = mkdtempSync(join(tmpdir(), "zhiwei-initial-commit-"));
  const filePath = join(root, "synthetic.sqlite");
  const originalExec = DatabaseSync.prototype.exec;
  const cause = new Error("synthetic migration commit failure");
  let calls = 0;
  DatabaseSync.prototype.exec = function (sql: string) {
    if (sql.trim().toUpperCase() === "COMMIT") { calls++; throw cause; }
    return originalExec.call(this, sql);
  };
  try {
    assert.throws(() => open(filePath), (error: unknown) =>
      error instanceof ObservationLedgerError && error.code === "sqlite" && error.cause === cause);
    assert.equal(calls, 1);
  } finally { DatabaseSync.prototype.exec = originalExec; }
  try {
    const raw = new DatabaseSync(filePath);
    try {
      assert.deepEqual(schema(raw), []);
      assert.equal((raw.prepare("PRAGMA user_version").get() as { user_version: number }).user_version, 0);
    } finally { raw.close(); }
    open(filePath).close();
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("invalid migration SQL remains a migration error after transaction error normalization", () => {
  const raw = new DatabaseSync(":memory:");
  try {
    assert.throws(() => applyObservationLedgerMigrations(raw, {
      clock,
      migrations: [{ version: 1, name: "synthetic-invalid", sql: "CREATE TABLE incomplete (" }],
    }), (error: unknown) => error instanceof ObservationLedgerMigrationError && error.migrationVersion === 1);
    assert.deepEqual(schema(raw), []);
    assert.equal(raw.isTransaction, false);
  } finally { raw.close(); }
});

test("real SQLITE_FULL during metadata installation retains sqlite category and atomic rollback", () => {
  const root = mkdtempSync(join(tmpdir(), "zhiwei-initial-full-"));
  const filePath = join(root, "synthetic.sqlite");
  const originalExec = DatabaseSync.prototype.exec;
  DatabaseSync.prototype.exec = function (sql: string) {
    // Only constrain this test's fresh connection. SQLite itself raises FULL
    // when its real metadata installation exceeds the one-page limit.
    if (sql.trim().toUpperCase() === "BEGIN IMMEDIATE") originalExec.call(this, "PRAGMA max_page_count=1");
    return originalExec.call(this, sql);
  };
  try {
    assert.throws(() => open(filePath), (error: unknown) => {
      assert.ok(error instanceof ObservationLedgerError);
      assert.equal(error.code, "sqlite");
      const cause = error.cause as Error & { code: string; errcode: number };
      assert.equal(cause.code, "ERR_SQLITE_ERROR");
      assert.equal(cause.errcode & 255, 13); // Real SQLITE_FULL, not a mocked error.
      return true;
    });
  } finally { DatabaseSync.prototype.exec = originalExec; }
  try {
    const raw = new DatabaseSync(filePath);
    try {
      assert.deepEqual(schema(raw), []);
      assert.equal((raw.prepare("PRAGMA user_version").get() as { user_version: number }).user_version, 0);
    } finally { raw.close(); }
    open(filePath).close();
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("migration metadata and history I/O failures preserve sqlite category and original cause", () => {
  const root = mkdtempSync(join(tmpdir(), "zhiwei-migration-io-"));
  const filePath = join(root, "synthetic.sqlite");
  const ledger = open(filePath);
  const first = event();
  ledger.append(first);
  const originalPrepare = DatabaseSync.prototype.prepare;
  try {
    for (const needle of ["PRAGMA index_list('schema_migrations')", "SELECT version, name, checksum, applied_at"]) {
      for (const errcode of [10, 10 | (3 << 8)]) {
        const cause = Object.assign(new Error("synthetic SQLite I/O failure"), { code: "ERR_SQLITE_ERROR", errcode });
        DatabaseSync.prototype.prepare = function (sql: string) {
          if (sql.includes(needle)) throw cause;
          return originalPrepare.call(this, sql);
        };
        const operations = [
          () => open(filePath),
          () => ledger.appliedMigrations,
          () => ledger.schemaVersion,
          () => ledger.countEvents(),
          () => ledger.readWorkspace("synthetic-workspace"),
          () => ledger.integrityCheck(),
          () => ledger.append(event(2)),
          () => ledger.appendBatch([first, event(2)]),
        ];
        try {
          for (const operation of operations) {
            assert.throws(operation, (error: unknown) =>
              error instanceof ObservationLedgerError && error.code === "sqlite" && error.cause === cause);
          }
        } finally { DatabaseSync.prototype.prepare = originalPrepare; }
        assert.equal(ledger.countEvents(), 1);
        assert.deepEqual(ledger.integrityCheck(), ["ok"]);
      }
    }
  } finally {
    DatabaseSync.prototype.prepare = originalPrepare;
    ledger.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("migration SQL constraint failures remain semantic migration errors", () => {
  const raw = new DatabaseSync(":memory:");
  try {
    assert.throws(() => applyObservationLedgerMigrations(raw, {
      clock,
      migrations: [{ version: 1, name: "synthetic-constraint", sql: "CREATE TABLE unique_values(value TEXT UNIQUE); INSERT INTO unique_values VALUES ('synthetic'), ('synthetic');" }],
    }), (error: unknown) => {
      assert.ok(error instanceof ObservationLedgerMigrationError);
      const cause = error.cause as Error & { code: string; errcode: number };
      assert.equal(cause.code, "ERR_SQLITE_ERROR");
      assert.equal(cause.errcode & 255, 19);
      return true;
    });
    assert.deepEqual(schema(raw), []);
    assert.equal(raw.isTransaction, false);
  } finally { raw.close(); }
});
