import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import * as publicStore from "../../src/index.ts";
import { DEFAULT_OBSERVATION_LEDGER_MIGRATIONS, ObservationLedgerMigrationError } from "../../src/migrations.ts";
import { createObservationLedgerSchemaVerifierForTest, ObservationLedgerCorruptionError } from "../../src/sqlite-observation-ledger.ts";
import { candidateMigrations, candidateSql, candidateTables, clock, connectCandidate, createOldDatabase, oldTables, snapshot, syntheticEvent, upgrade, validateCandidate } from "./candidate.mjs";

function fixture(fn) {
  const root = mkdtempSync(join(tmpdir(), "zhiwei-schema-evolution-"));
  const filePath = join(root, "synthetic.sqlite");
  try {
    const events = createOldDatabase(filePath);
    return fn({ root, filePath, events });
  }
  finally { rmSync(root, { recursive: true, force: true }); }
}
function readSnapshot(filePath) {
  const database = connectCandidate(filePath);
  try { return snapshot(database); } finally { database.close(); }
}
function reopenCandidate(filePath, version = 2) {
  const database = connectCandidate(filePath);
  try { return validateCandidate(database, version); } finally { database.close(); }
}
function assertPreserved(before, after) {
  assert.deepEqual(after.events, before.events);
  assert.deepEqual(after.cursor, before.cursor);
  assert.deepEqual(after.history.slice(0, 1), before.history);
}
function failCode(fn) { assert.throws(fn, ObservationLedgerCorruptionError); }

// Candidate source is not a migration registration. The public API remains v1.
test("D02 fixed production migration1 bytes and public exports are unchanged", () => {
  const source = readFileSync(new URL("../../migrations/0001_normalized_runtime_event_v1.sql", import.meta.url));
  assert.equal(createHash("sha256").update(source).digest("hex"), "e0afaf4aec1f4fb91d4fabef94f0c4ca1bb7a32e97f1f2b61d6df6333d36e31c");
  assert.equal(DEFAULT_OBSERVATION_LEDGER_MIGRATIONS.length, 1);
  assert.equal(DEFAULT_OBSERVATION_LEDGER_MIGRATIONS[0].version, 1);
  assert.equal(DEFAULT_OBSERVATION_LEDGER_MIGRATIONS[0].sql, source.toString());
  assert.ok(Object.isFrozen(DEFAULT_OBSERVATION_LEDGER_MIGRATIONS));
  assert.ok(Object.isFrozen(DEFAULT_OBSERVATION_LEDGER_MIGRATIONS[0]));
  for (const name of ["createObservationLedgerSchemaVerifierForTest", "validateObservationLedgerRuntimeRowsForTest", "applyObservationLedgerMigrations", "DEFAULT_OBSERVATION_LEDGER_MIGRATIONS"]) assert.equal(name in publicStore, false);
});

test("D02 public open ignores attempted override getters and installs only fixed v1", () => fixture(({ root }) => {
  const filePath = join(root, "second-synthetic.sqlite");
  const options = { filePath, busyTimeoutMs: 0, clock };
  for (const name of ["migrations", "manifest", "skipValidation", "unsafe"]) Object.defineProperty(options, name, { get() { throw new Error(`override read: ${name}`); } });
  const ledger = publicStore.openSqliteObservationLedgerV1(options);
  try {
    assert.equal(ledger.schemaVersion, 1);
    assert.equal(ledger.append(syntheticEvent()).inserted, true);
    assert.equal(ledger.countEvents(), 1);
    assert.deepEqual(ledger.integrityCheck(), ["ok"]);
  } finally { ledger.close(); }
  assert.equal(readSnapshot(filePath).schema.some((row) => row.name === "synthetic_evolution_probe"), false);
}));

test("D02 same original validators upgrade a populated v1 file and preserve every canonical row cursor and history", () => fixture(({ filePath, events }) => {
  const database = connectCandidate(filePath);
  const before = snapshot(database);
  try {
    const history = upgrade(database);
    assert.equal(database.isTransaction, false);
    assert.equal(history.length, 2);
    assertPreserved(before, snapshot(database));
    assert.equal(snapshot(database).version, 2);
    const table = database.prepare("PRAGMA table_list('synthetic_evolution_probe')").get();
    assert.equal(table.strict, 1);
    assert.deepEqual(database.prepare("PRAGMA table_xinfo('synthetic_evolution_probe')").all().map((row) => row.name), ["probe_id", "revision", "label"]);
    assert.deepEqual(database.prepare("PRAGMA index_xinfo('synthetic_probe_revision')").all().filter((row) => row.key === 1).map((row) => [row.name, row.desc]), [["revision", 1]]);
    database.prepare("INSERT INTO synthetic_evolution_probe VALUES (?, ?, ?)").run("synthetic", 1, "probe");
    assert.throws(() => database.exec("INSERT INTO synthetic_evolution_probe VALUES ('invalid', 0, 'probe');"));
    assert.throws(() => database.exec("INSERT INTO synthetic_evolution_probe VALUES ('duplicate', 1, 'probe');"));
    assert.deepEqual(validateCandidate(database).map((row) => row.event), events);
  } finally { database.close(); }
  assert.deepEqual(reopenCandidate(filePath).map((row) => row.event), events);
  const after = readSnapshot(filePath);
  assertPreserved(before, after);
  assert.throws(() => publicStore.openSqliteObservationLedgerV1({ filePath, clock, migrations: candidateMigrations, manifest: "override", skipValidation: true }), (error) => error instanceof ObservationLedgerMigrationError && /unknown migration version 2/.test(error.message));
  assert.deepEqual(readSnapshot(filePath), after, "old binary rejection must not downgrade or delete the candidate");
}));

test("D02 original manifest actually queries candidate STRICT columns and index metadata", () => fixture(({ filePath }) => {
  const database = connectCandidate(filePath);
  try {
    upgrade(database);
    const queries = [];
    const prepare = database.prepare.bind(database);
    database.prepare = (sql) => { queries.push(sql); return prepare(sql); };
    validateCandidate(database);
    for (const sql of ["PRAGMA table_list('synthetic_evolution_probe')", "PRAGMA table_xinfo('synthetic_evolution_probe')", "PRAGMA index_list('synthetic_evolution_probe')", "PRAGMA index_xinfo('synthetic_probe_revision')", "PRAGMA index_xinfo('sqlite_autoindex_synthetic_evolution_probe_1')", "PRAGMA index_xinfo('sqlite_autoindex_synthetic_evolution_probe_2')"]) assert.ok(queries.includes(sql), sql);
  } finally { database.close(); }
}));

for (const names of [[], [...candidateTables, candidateTables[0]], oldTables, [...candidateTables, "missing_table"], [...oldTables, "synthetic_evolution_probe'); DROP TABLE runtime_events; --"], [...oldTables, "synthetic_evolution_probe\u0000"], [...oldTables, 42]]) {
  test(`D02 internal manifest seam rejects incomplete duplicate absent or unsafe table list ${JSON.stringify(names)}`, () => failCode(() => createObservationLedgerSchemaVerifierForTest(candidateMigrations, names)));
}

const drifts = {
  "unknown table": "CREATE TABLE synthetic_unknown(value TEXT) STRICT;",
  "hidden-prefix unknown table": "CREATE TABLE sqlitex_unknown(value TEXT) STRICT;",
  "extra index": "CREATE INDEX synthetic_extra ON synthetic_evolution_probe(label);",
  "extra trigger": "CREATE TRIGGER synthetic_extra AFTER INSERT ON synthetic_evolution_probe BEGIN SELECT 1; END;",
  "weakened CHECK": "DROP TABLE synthetic_evolution_probe; CREATE TABLE synthetic_evolution_probe(probe_id TEXT NOT NULL PRIMARY KEY, revision INTEGER NOT NULL CHECK(revision >= 0), label TEXT NOT NULL CHECK(length(label)>0), UNIQUE(label,revision)) STRICT; CREATE INDEX synthetic_probe_revision ON synthetic_evolution_probe(revision DESC);",
  "missing STRICT": "DROP TABLE synthetic_evolution_probe; CREATE TABLE synthetic_evolution_probe(probe_id TEXT NOT NULL PRIMARY KEY, revision INTEGER NOT NULL CHECK(revision > 0), label TEXT NOT NULL CHECK(length(label)>0), UNIQUE(label,revision)); CREATE INDEX synthetic_probe_revision ON synthetic_evolution_probe(revision DESC);",
  "weakened index order": "DROP INDEX synthetic_probe_revision; CREATE INDEX synthetic_probe_revision ON synthetic_evolution_probe(revision ASC);",
};
for (const [name, sql] of Object.entries(drifts)) test(`D02 candidate full manifest rejects ${name} after reopen`, () => fixture(({ filePath }) => {
  let database = connectCandidate(filePath);
  try { upgrade(database); database.exec(sql); } finally { database.close(); }
  database = connectCandidate(filePath);
  try {
    const before = snapshot(database);
    failCode(() => validateCandidate(database));
    assert.deepEqual(snapshot(database), before);
  } finally { database.close(); }
}));

test("D02 invalid old schema rejects before pending migration and preserves the invalid source for recovery", () => fixture(({ filePath }) => {
  const database = connectCandidate(filePath);
  try {
    database.exec("CREATE TABLE synthetic_unknown(value TEXT) STRICT;");
    const before = snapshot(database);
    failCode(() => upgrade(database));
    assert.deepEqual(snapshot(database), before);
    assert.equal(database.isTransaction, false);
  } finally { database.close(); }
}));

for (const phase of ["after-ddl", "after-history", "after-validation", "before-commit", "after-commit"]) test(`D02 real SQLite upgrade injected failure ${phase} leaves one complete version`, () => fixture(({ filePath }) => {
  const database = connectCandidate(filePath);
  const before = snapshot(database);
  const fault = new Error(`synthetic ${phase} failure`);
  let hits = 0;
  const exec = database.exec.bind(database);
  const prepare = database.prepare.bind(database);
  database.exec = (sql) => {
    if (phase === "before-commit" && sql === "COMMIT") { hits++; throw fault; }
    const result = exec(sql);
    if ((phase === "after-ddl" && sql === candidateSql) || (phase === "after-commit" && sql === "COMMIT")) { hits++; throw fault; }
    return result;
  };
  database.prepare = (sql) => {
    const statement = prepare(sql);
    if (phase === "after-history" && sql.includes("INSERT INTO schema_migrations")) {
      const run = statement.run.bind(statement);
      statement.run = (...args) => { const result = run(...args); hits++; throw fault; };
    }
    return statement;
  };
  try {
    assert.throws(() => upgrade(database, { afterValidation: () => {
      if (phase === "after-validation") { assert.equal(database.isTransaction, true); assert.equal(snapshot(database).version, 2); hits++; throw fault; }
    } }), (error) => error === fault || error.cause === fault);
    assert.equal(hits, 1);
    assert.equal(database.isTransaction, false);
  } finally { database.close(); }
  const after = readSnapshot(filePath);
  if (phase === "after-commit") {
    assert.equal(after.version, 2);
    assert.equal(after.history.length, 2);
    assertPreserved(before, after);
    reopenCandidate(filePath);
  } else {
    assert.deepEqual(after, before);
    reopenCandidate(filePath, 1);
    const recovered = publicStore.openSqliteObservationLedgerV1({ filePath, clock });
    try { assert.equal(recovered.countEvents(), 3); } finally { recovered.close(); }
  }
}));

for (const phase of ["after-ddl", "after-history", "after-validation", "after-commit"]) test(`D02 abrupt process exit ${phase} reopens at a complete version`, () => fixture(({ filePath }) => {
  const before = readSnapshot(filePath);
  const result = spawnSync(process.execPath, ["--experimental-strip-types", fileURLToPath(new URL("./crash-worker.mjs", import.meta.url)), filePath, phase], { encoding: "utf8", timeout: 10_000 });
  assert.equal(result.error, undefined);
  assert.equal(result.signal, null);
  assert.equal(result.status, 73, result.stderr);
  const after = readSnapshot(filePath);
  if (phase === "after-commit") {
    assert.equal(after.version, 2);
    assert.equal(after.history.length, 2);
    assertPreserved(before, after);
    reopenCandidate(filePath);
  } else {
    assert.deepEqual(after, before);
    reopenCandidate(filePath, 1);
  }
}));

test("D02 closed pre-upgrade backup restores v1 separately without treating a code revert as database downgrade", () => fixture(({ root, filePath, events }) => {
  assert.equal(existsSync(`${filePath}-wal`), false, "seed connection closed before copying its database");
  const backupPath = join(root, "synthetic-before-upgrade.sqlite");
  const restoredPath = join(root, "synthetic-restored.sqlite");
  copyFileSync(filePath, backupPath);
  const before = readSnapshot(backupPath);
  const database = connectCandidate(filePath);
  try { upgrade(database); } finally { database.close(); }
  copyFileSync(backupPath, restoredPath);
  const restored = publicStore.openSqliteObservationLedgerV1({ filePath: restoredPath, clock });
  try {
    assert.equal(restored.schemaVersion, 1);
    assert.deepEqual(restored.readWorkspace("synthetic-evolution-workspace").map((row) => row.event), events);
    assert.equal(restored.append(events[0]).inserted, false);
    assert.equal(restored.append(syntheticEvent(4)).rowId, 4);
  } finally { restored.close(); }
  assert.deepEqual(readSnapshot(backupPath), before);
  assert.equal(readSnapshot(filePath).version, 2, "the upgraded database was not rewritten");
}));

test("D02 public read append and integrity cannot consume the experiment override or tolerate extra tables", () => fixture(({ filePath }) => {
  const ledger = publicStore.openSqliteObservationLedgerV1({ filePath, clock, migrations: candidateMigrations, manifest: "override", skipValidation: true });
  const database = connectCandidate(filePath);
  try {
    database.exec("CREATE TABLE synthetic_unknown(value TEXT) STRICT;");
    const before = snapshot(database);
    for (const operation of [() => ledger.readWorkspace("synthetic-evolution-workspace"), () => ledger.readSession("synthetic-evolution-workspace", "synthetic-evolution-session"), () => ledger.countEvents(), () => ledger.getByEventId(syntheticEvent().eventId), () => ledger.getByIdempotencyKey(syntheticEvent().idempotencyKey), () => ledger.schemaVersion, () => ledger.appliedMigrations, () => ledger.append(syntheticEvent(4)), () => ledger.appendBatch([syntheticEvent(4)]), () => ledger.integrityCheck(), () => ledger.assertIntegrity()]) failCode(operation);
    assert.deepEqual(snapshot(database), before);
  } finally { database.close(); ledger.close(); }
}));

test("D02 existing canonical projection corruption rejects before upgrade without repairing evidence", () => fixture(({ filePath }) => {
  const database = connectCandidate(filePath);
  try {
    const trigger = database.prepare("SELECT sql FROM sqlite_schema WHERE name='runtime_events_reject_update'").get();
    assert.ok(trigger);
    database.exec("DROP TRIGGER runtime_events_reject_update; UPDATE runtime_events SET workspace_id='synthetic-drift' WHERE row_id=1;");
    database.exec(trigger.sql);
    const before = snapshot(database);
    failCode(() => upgrade(database));
    assert.deepEqual(snapshot(database), before);
    assert.equal(database.isTransaction, false);
    assert.equal(before.version, 1);
  } finally { database.close(); }
}));

test("D02 original final manifest failure rolls back DDL history and user_version together", () => fixture(({ filePath }) => {
  const database = connectCandidate(filePath);
  const before = snapshot(database);
  const exec = database.exec.bind(database);
  let hits = 0;
  database.exec = (sql) => {
    const result = exec(sql);
    if (sql === "PRAGMA user_version = 2") {
      assert.equal(database.isTransaction, true);
      assert.equal(snapshot(database).history.length, 2);
      exec("DROP INDEX synthetic_probe_revision;");
      hits++;
    }
    return result;
  };
  try {
    failCode(() => upgrade(database));
    assert.equal(hits, 1);
    assert.equal(database.isTransaction, false);
  } finally { database.close(); }
  assert.deepEqual(readSnapshot(filePath), before);
  reopenCandidate(filePath, 1);
}));

// Readback fault injection is separate from actual schema tampering above.
// The real PRAGMA executes first, then one returned field is changed; unchanged
// sqlite_schema SQL must not conceal the mismatch from the original comparator.
for (const [name, query, method, mutate] of [
  ["STRICT", "PRAGMA table_list('synthetic_evolution_probe')", "get", (row) => ({ ...row, strict: 0 })],
  ["table_xinfo", "PRAGMA table_xinfo('synthetic_evolution_probe')", "all", (rows) => rows.map((row) => row.name === "revision" ? { ...row, notnull: 0 } : row)],
  ["index_xinfo", "PRAGMA index_xinfo('synthetic_probe_revision')", "all", (rows) => rows.map((row) => row.key === 1 ? { ...row, desc: 0 } : row)],
]) test(`D02 original manifest rejects injected candidate ${name} readback drift despite identical schema SQL`, () => fixture(({ filePath }) => {
  const database = connectCandidate(filePath);
  try {
    upgrade(database);
    const before = snapshot(database);
    const prepare = database.prepare.bind(database);
    let hits = 0;
    database.prepare = (sql) => {
      const statement = prepare(sql);
      if (sql === query) {
        const read = statement[method].bind(statement);
        statement[method] = (...args) => { hits++; return mutate(read(...args)); };
      }
      return statement;
    };
    failCode(() => validateCandidate(database));
    assert.equal(hits, 1);
    assert.deepEqual(snapshot(database), before);
  } finally { database.close(); }
}));
