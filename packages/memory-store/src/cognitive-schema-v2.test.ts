import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { ids } from "../../domain/src/index.ts";
import { createNormalizedRuntimeEventV1 } from "../../protocol/src/index.ts";
import {
  applyCognitiveMigrationsV2, configureCognitiveDatabaseV2,
  verifyCognitiveDatabaseV2, withCognitiveSnapshotV2,
} from "./cognitive-schema-v2.ts";
import { ObservationLedgerMigrationError } from "./migrations.ts";
import {
  ObservationLedgerCorruptionError, ObservationLedgerError,
  openSqliteObservationLedgerV1,
} from "./sqlite-observation-ledger.ts";

const now = "2026-10-10T00:00:00.000Z";
const clock = { now: () => now };

function legacyEvent(sequence: number) {
  return createNormalizedRuntimeEventV1({
    protocolVersion: 1,
    workspaceId: ids.workspace("synthetic-workspace"),
    runtimeSessionId: ids.session("synthetic-session"),
    runtimeInstanceId: "synthetic-instance",
    source: {
      adapter: "synthetic-adapter",
      runtime: { implementation: "synthetic-runtime", version: "1.0.0" },
      surface: "rpc", eventType: "response",
    },
    sequence: { domain: "synthetic-stream", value: sequence },
    observedAt: now,
    provenance: "observed", persistence: "durable", stability: "boundary", compatibility: "required",
    correlation: {
      observed: { requestId: `synthetic-request-${sequence}` },
      normalized: { rpcRequestId: `synthetic-request-${sequence}` },
    },
    data: { kind: "command.response", command: "get_state", success: true, phase: "command-result" },
  });
}

function tempDatabase<T>(work: (filePath: string) => T): T {
  const root = mkdtempSync(join(tmpdir(), "zhiwei-cognitive-schema-v2-"));
  try { return work(join(root, "product.sqlite")); }
  finally { rmSync(root, { recursive: true, force: true }); }
}

function open(filePath: string) {
  const db = new DatabaseSync(filePath);
  const pragmas = configureCognitiveDatabaseV2(db, { filePath, busyTimeoutMs: 4321 });
  const migrations = applyCognitiveMigrationsV2(db, { clock, expectedPragmas: pragmas });
  return { db, pragmas, migrations };
}

test("v2 fixed schema creates real WAL/FULL SQLite and validates all manifests on reopen", () => {
  tempDatabase(filePath => {
    const first = open(filePath);
    try {
      assert.deepEqual(first.migrations.map(row => row.version), [1, 2]);
      assert.equal(first.pragmas.journalMode, "wal");
      assert.equal(first.pragmas.synchronous, 2);
      assert.equal(first.pragmas.foreignKeys, 1);
      assert.equal(first.pragmas.busyTimeoutMs, 4321);
      assert.equal(first.pragmas.trustedSchema, 0);
      assert.equal(first.pragmas.tempStore, 2);
      assert.equal(first.pragmas.secureDelete, 1);
      assert.equal(first.db.prepare("PRAGMA secure_delete").get()?.secure_delete, 1);
      withCognitiveSnapshotV2(first.db, first.pragmas, state => {
        assert.equal(first.db.isTransaction, true);
        assert.deepEqual(state.legacyRows, []);
        assert.deepEqual(state.integrity, ["ok"]);
        const tables = first.db.prepare("PRAGMA table_list").all()
          .filter(row => row.schema === "main" && !String(row.name).startsWith("sqlite_"));
        assert.equal(tables.length, 20);
        assert.ok(tables.every(row => row.strict === 1));
      });
      assert.equal(first.db.isTransaction, false);
    } finally { first.db.close(); }
    const reopened = open(filePath);
    try {
      assert.deepEqual(reopened.migrations, first.migrations);
      assert.equal(reopened.pragmas.secureDelete, 1);
      assert.equal(reopened.db.prepare("PRAGMA secure_delete").get()?.secure_delete, 1);
      withCognitiveSnapshotV2(reopened.db, reopened.pragmas, state => assert.deepEqual(state.integrity, ["ok"]));
    } finally { reopened.db.close(); }
  });
});

test("forward v2 migration preserves normal v1 audit rows and public v1 refuses newer schema", () => {
  tempDatabase(filePath => {
    const legacy = openSqliteObservationLedgerV1({ filePath, clock });
    const events = [legacyEvent(1), legacyEvent(2)];
    const stored = legacy.appendBatch(events).results.map(({ inserted: _inserted, ...row }) => row);
    legacy.close();
    const current = open(filePath);
    try {
      withCognitiveSnapshotV2(current.db, current.pragmas, state => assert.deepEqual(state.legacyRows, stored));
      const guard = current.db.prepare("SELECT sql FROM sqlite_schema WHERE name = 'runtime_events_reject_insert_v2'").get();
      assert.match(String(guard?.sql), /BEFORE INSERT ON runtime_events/);
    } finally { current.db.close(); }
    assert.throws(() => openSqliteObservationLedgerV1({ filePath, clock }), ObservationLedgerMigrationError);
    const reopened = open(filePath);
    try {
      withCognitiveSnapshotV2(reopened.db, reopened.pragmas, state => assert.deepEqual(state.legacyRows, stored));
    } finally { reopened.db.close(); }
  });
});

test("v2 explicit snapshot validates and preserves the caller's normal write transaction", () => {
  const { db, pragmas } = open(":memory:");
  try {
    assert.equal(pragmas.journalMode, "memory");
    assert.throws(() => verifyCognitiveDatabaseV2(db, pragmas), ObservationLedgerCorruptionError);
    db.exec("BEGIN IMMEDIATE");
    db.prepare("INSERT INTO scope_catalog VALUES (?, ?, ?, ?)").run("synthetic-global", '{"kind":"global"}', 0, 0);
    withCognitiveSnapshotV2(db, pragmas, () => {
      assert.equal(db.isTransaction, true);
      assert.equal(db.prepare("SELECT COUNT(*) AS count FROM scope_catalog").get()?.count, 1);
    });
    assert.equal(db.isTransaction, true);
    db.exec("ROLLBACK");
    withCognitiveSnapshotV2(db, pragmas, () => assert.equal(db.prepare("SELECT COUNT(*) AS count FROM scope_catalog").get()?.count, 0));
  } finally { db.close(); }
});

test("v2 snapshot rolls back a throwing reader and keeps the connection usable", () => {
  const { db, pragmas } = open(":memory:");
  try {
    const failure = new Error("synthetic caller-domain failure");
    assert.throws(() => withCognitiveSnapshotV2(db, pragmas, () => { throw failure; }),
      (error: unknown) => error === failure);
    assert.equal(db.isTransaction, false);
    withCognitiveSnapshotV2(db, pragmas, state => assert.deepEqual(state.integrity, ["ok"]));
  } finally { db.close(); }
});

test("v2 invalid migration clock leaves a normal newly created database uninitialized", () => {
  const db = new DatabaseSync(":memory:");
  try {
    const pragmas = configureCognitiveDatabaseV2(db, { filePath: ":memory:", busyTimeoutMs: 100 });
    assert.throws(() => applyCognitiveMigrationsV2(db, {
      expectedPragmas: pragmas,
      clock: { now: () => "not-a-time" },
    }), ObservationLedgerMigrationError);
    assert.equal(db.isTransaction, false);
    assert.equal(db.prepare("PRAGMA user_version").get()?.user_version, 0);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM sqlite_schema WHERE name NOT GLOB 'sqlite_*'").get()?.count, 0);
    assert.deepEqual(applyCognitiveMigrationsV2(db, { expectedPragmas: pragmas, clock }).map(row => row.version), [1, 2]);
  } finally { db.close(); }
});

// Closed connections exercise the native SQLite boundary without mutation or bypass hooks.
test("v2 snapshot normalizes a closed SQLite connection failure", () => {
  const { db, pragmas } = open(":memory:");
  db.close();
  assert.throws(() => withCognitiveSnapshotV2(db, pragmas, () => undefined),
    (error: unknown) => error instanceof ObservationLedgerError && error.code === "sqlite");
});

test("exact P1 typed snapshot kinds retain their current pointers and scoped body references on reopen", () => {
  tempDatabase(filePath => {
    const { db, pragmas } = open(filePath);
    const kinds = [
      { kind: "candidate", version: null, status: "PENDING" },
      { kind: "hypothesis", version: 1, status: "OPEN" },
      { kind: "goal", version: null, status: "PROPOSED" },
      { kind: "episode", version: 1, status: null },
      { kind: "working-state", version: null, status: null },
    ] as const;
    try {
      db.exec("BEGIN IMMEDIATE");
      db.prepare("INSERT INTO scope_catalog VALUES (?, ?, ?, ?)").run("synthetic-global", '{"kind":"global"}', 0, 0);
      for (const { kind, version, status } of kinds) {
        const id = `synthetic-${kind}`, bodyId = `body-${kind}`;
        db.prepare(`INSERT INTO content_object
          (content_id,content_version,scope_key,privacy,state,purpose,retention_until,created_at,reservation_id,digest,byte_count,fence_json)
          VALUES (?,1,'synthetic-global','local-only','available','cognition',?,?,?, ?,2,'{}')`)
          .run(bodyId, "2027-01-01T00:00:00.000Z", now, `reservation-${kind}`, "a".repeat(64));
        // Deferred composite FKs permit either side's insertion order, not dangling commits.
        db.prepare(`INSERT INTO cognitive_snapshot
          (kind,id,revision,version,scope_key,status,content_id,content_version,metadata_json,availability)
          VALUES (?,?,1,?,'synthetic-global',?,?,1,?,'available')`)
          .run(kind, id, version, status, bodyId, JSON.stringify({ schemaVersion: 2, id, revision: 1 }));
        db.prepare("INSERT INTO cognitive_record VALUES (?,?,1,'synthetic-global')").run(kind, id);
        db.prepare("INSERT INTO snapshot_dependency VALUES ('content',?,1,?,?,1,1)").run(bodyId, kind, id);
      }
      withCognitiveSnapshotV2(db, pragmas, () => {
        assert.equal(db.prepare("PRAGMA foreign_key_check").all().length, 0);
        assert.equal(db.prepare("SELECT COUNT(*) AS count FROM cognitive_snapshot").get()?.count, 5);
      });
      db.exec("COMMIT");
    } finally { db.close(); }
    const reopened = open(filePath);
    try {
      withCognitiveSnapshotV2(reopened.db, reopened.pragmas, () => {
        const rows = reopened.db.prepare(`SELECT r.kind, r.current_revision, s.version, s.status, s.availability
          FROM cognitive_record r JOIN cognitive_snapshot s
          ON r.kind=s.kind AND r.id=s.id AND r.current_revision=s.revision ORDER BY r.kind`).all();
        assert.equal(rows.length, kinds.length);
        for (const shape of kinds) {
          const row = rows.find(row => row.kind === shape.kind);
          assert.equal(row?.current_revision, 1);
          assert.equal(row?.version, shape.version);
          assert.equal(row?.status, shape.status);
          assert.equal(row?.availability, "available");
        }
      });
    } finally { reopened.db.close(); }
  });
});
