// Isolated synthetic candidate, never imported by the memory-store public index.
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { createNormalizedRuntimeEventV1 } from "../../../protocol/src/index.ts";
import { openSqliteObservationLedgerV1 } from "../../src/index.ts";
import {
  DEFAULT_OBSERVATION_LEDGER_MIGRATIONS,
  applyObservationLedgerMigrations,
  assertObservationLedgerMigrationState,
} from "../../src/migrations.ts";
import {
  createObservationLedgerSchemaVerifierForTest,
  validateObservationLedgerRuntimeRowsForTest,
} from "../../src/sqlite-observation-ledger.ts";

export const clock = Object.freeze({ now: () => "2026-10-08T00:00:00.000Z" });
export const candidateSql = `
CREATE TABLE synthetic_evolution_probe (
  probe_id TEXT NOT NULL PRIMARY KEY,
  revision INTEGER NOT NULL CHECK (revision > 0),
  label TEXT NOT NULL CHECK (length(label) > 0),
  UNIQUE (label, revision)
) STRICT;
CREATE INDEX synthetic_probe_revision ON synthetic_evolution_probe(revision DESC);
`;
export const candidateMigrations = Object.freeze([
  ...DEFAULT_OBSERVATION_LEDGER_MIGRATIONS,
  Object.freeze({ version: 2, name: "synthetic-schema-evolution-probe", sql: candidateSql }),
]);
export const oldTables = Object.freeze(["runtime_events", "schema_migrations"]);
export const candidateTables = Object.freeze([...oldTables, "synthetic_evolution_probe"]);

const oldManifest = createObservationLedgerSchemaVerifierForTest(DEFAULT_OBSERVATION_LEDGER_MIGRATIONS, oldTables);
const newManifest = createObservationLedgerSchemaVerifierForTest(candidateMigrations, candidateTables);

export function syntheticEvent(sequence = 1) {
  return createNormalizedRuntimeEventV1({
    protocolVersion: 1,
    workspaceId: "synthetic-evolution-workspace",
    runtimeSessionId: "synthetic-evolution-session",
    runtimeInstanceId: "synthetic-evolution-instance",
    source: { adapter: "pi-rpc-v1", runtime: { implementation: "pi", version: "0.84.1" }, surface: "rpc", eventType: "response" },
    sequence: { domain: "rpc-jsonl", value: sequence },
    observedAt: "2026-10-08T00:00:00.000Z",
    provenance: "observed", persistence: "durable", stability: "boundary", compatibility: "required",
    correlation: { observed: { requestId: `synthetic-${sequence}` }, normalized: { rpcRequestId: `synthetic-${sequence}` } },
    data: { kind: "command.response", command: "get_state", success: true, phase: "command-result" },
  });
}

export function createOldDatabase(filePath) {
  const ledger = openSqliteObservationLedgerV1({ filePath, busyTimeoutMs: 0, clock });
  try {
    assert.equal(ledger.journalMode, "wal");
    const events = [syntheticEvent(1), syntheticEvent(2), syntheticEvent(3)];
    const result = ledger.appendBatch(events);
    assert.equal(result.insertedCount, 3);
    assert.deepEqual(ledger.integrityCheck(), ["ok"]);
    return events;
  } finally { ledger.close(); }
}

export function connectCandidate(filePath) {
  const database = new DatabaseSync(filePath);
  try {
    database.exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=0; PRAGMA synchronous=NORMAL; PRAGMA trusted_schema=OFF; PRAGMA temp_store=MEMORY;");
    assertPragmas(database);
    return database;
  } catch (error) {
    database.close();
    throw error;
  }
}

export function assertPragmas(database) {
  for (const [name, expected] of Object.entries({ journal_mode: "wal", foreign_keys: 1, busy_timeout: 0, synchronous: 1, trusted_schema: 0, temp_store: 2 })) {
    assert.equal(database.prepare(`PRAGMA ${name}`).get()[name === "busy_timeout" ? "timeout" : name], expected, `real candidate connection ${name}`);
  }
  assert.deepEqual(database.prepare("PRAGMA integrity_check").all().map((row) => row.integrity_check), ["ok"]);
}

export function validateCandidate(database, version = 2) {
  const migrations = version === 1 ? DEFAULT_OBSERVATION_LEDGER_MIGRATIONS : candidateMigrations;
  assertObservationLedgerMigrationState(database, migrations);
  (version === 1 ? oldManifest : newManifest)(database);
  const rows = validateObservationLedgerRuntimeRowsForTest(database);
  assertPragmas(database);
  return rows;
}

export function upgrade(database, { afterValidation } = {}) {
  return applyObservationLedgerMigrations(database, {
    migrations: candidateMigrations,
    clock,
    validateBeforePending: ({ applied }) => {
      assert.equal(applied.length, 1);
      validateCandidate(database, 1);
    },
    validateAfterPending: () => {
      validateCandidate(database, 2);
      afterValidation?.();
    },
  });
}

export function snapshot(database) {
  return {
    version: database.prepare("PRAGMA user_version").get().user_version,
    schema: database.prepare("SELECT type, name, sql FROM sqlite_schema ORDER BY type, name").all(),
    history: database.prepare("SELECT * FROM schema_migrations ORDER BY version").all(),
    events: database.prepare("SELECT * FROM runtime_events ORDER BY row_id").all(),
    cursor: database.prepare("SELECT * FROM sqlite_sequence ORDER BY name").all(),
  };
}
