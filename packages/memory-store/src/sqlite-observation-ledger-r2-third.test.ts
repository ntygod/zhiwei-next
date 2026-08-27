import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

import {
  canonicalJsonV1,
  canonicalNormalizedRuntimeEventV1,
  createNormalizedRuntimeEventV1,
  type NormalizedRuntimeEventV1,
} from "../../protocol/src/index.ts";
import {
  DEFAULT_OBSERVATION_LEDGER_MIGRATIONS,
  OBSERVATION_LEDGER_MIGRATION_SCHEMA_SQL,
  ObservationLedgerMigrationError,
  applyObservationLedgerMigrations,
  type ObservationLedgerMigration,
} from "./migrations.ts";
import {
  normalizeSqlSchemaSignature,
  sqlStatementLeadingKeywords,
} from "./sqlite-schema-sql.ts";
import {
  ObservationLedgerConflictError,
  ObservationLedgerCorruptionError,
  ObservationLedgerError,
  ObservationLedgerQueryError,
  ObservationLedgerSequenceError,
  openSqliteObservationLedgerV1,
  validateObservationLedgerRuntimeRowsForTest,
} from "./sqlite-observation-ledger.ts";

const CLOCK = { now: () => "2026-08-24T00:00:00.000Z" };

test("Observation Ledger exact-head validation runs in the declared Node range", () => {
  const match = /^v(\d+)\.(\d+)\./u.exec(process.version);
  assert.ok(match);
  assert.equal(Number(match[1]), 22);
  assert.ok(Number(match[2]) >= 16);
  const packageJson = JSON.parse(
    readFileSync(new URL("../../../package.json", import.meta.url), "utf8"),
  ) as { engines?: { node?: string } };
  assert.equal(packageJson.engines?.node, ">=22.16.0 <23");
});

const RUNTIME_COLUMNS = [
  "row_id",
  "event_id",
  "idempotency_key",
  "event_fingerprint",
  "protocol_version",
  "workspace_id",
  "runtime_session_id",
  "runtime_instance_id",
  "source_adapter",
  "runtime_implementation",
  "runtime_version",
  "source_surface",
  "source_event_type",
  "sequence_domain",
  "source_sequence",
  "observed_at",
  "provenance",
  "persistence",
  "stability",
  "compatibility",
  "correlation_json",
  "links_json",
  "data_kind",
  "data_json",
  "event_json",
] as const;

function tempRoot(): string {
  return mkdtempSync(join(tmpdir(), "zhiwei-ledger-r2-third-"));
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function makeEvent(sequence: number, suffix = ""): NormalizedRuntimeEventV1 {
  return createNormalizedRuntimeEventV1({
    protocolVersion: 1,
    workspaceId: "workspace-r2",
    runtimeSessionId: "session-r2",
    runtimeInstanceId: "instance-r2",
    source: {
      adapter: "pi-rpc-v1",
      runtime: { implementation: "pi", version: "0.84.1" },
      surface: "rpc",
      eventType: "response",
    },
    sequence: { domain: "rpc-jsonl", value: sequence },
    observedAt: `2026-08-24T00:00:${String(sequence).padStart(2, "0")}.000Z`,
    provenance: "observed",
    persistence: "durable",
    stability: "boundary",
    compatibility: "required",
    correlation: {
      observed: { requestId: `request-${sequence}${suffix}` },
      normalized: { rpcRequestId: `rpc-${sequence}${suffix}` },
    },
    data: {
      kind: "command.response",
      command: suffix ? `get_state_${suffix}` : "get_state",
      success: true,
      phase: "command-result",
    },
  }) as NormalizedRuntimeEventV1;
}

function openFile(filePath: string, busyTimeoutMs = 5_000) {
  return openSqliteObservationLedgerV1({
    filePath,
    busyTimeoutMs,
    clock: CLOCK,
  });
}

function eventValues(event: NormalizedRuntimeEventV1, rowId?: number): {
  columns: string[];
  values: unknown[];
} {
  const eventJson = canonicalNormalizedRuntimeEventV1(event);
  const columns = [...RUNTIME_COLUMNS];
  const values: unknown[] = [
    rowId ?? null,
    event.eventId,
    event.idempotencyKey,
    sha256(eventJson),
    event.protocolVersion,
    event.workspaceId,
    event.runtimeSessionId,
    event.runtimeInstanceId,
    event.source.adapter,
    event.source.runtime.implementation,
    event.source.runtime.version,
    event.source.surface,
    event.source.eventType,
    event.sequence.domain,
    event.sequence.value,
    event.observedAt,
    event.provenance,
    event.persistence,
    event.stability,
    event.compatibility,
    canonicalJsonV1(event.correlation),
    event.links === undefined ? null : canonicalJsonV1(event.links),
    event.data.kind,
    canonicalJsonV1(event.data),
    eventJson,
  ];
  if (rowId === undefined) {
    columns.shift();
    values.shift();
  }
  return { columns, values };
}

function insertRuntimeEvent(
  database: DatabaseSync,
  event: NormalizedRuntimeEventV1,
  rowId?: number,
): void {
  const { columns, values } = eventValues(event, rowId);
  database
    .prepare(
      `INSERT INTO runtime_events (${columns.join(",")})
       VALUES (${columns.map(() => "?").join(",")})`,
    )
    .run(...(values as any[]));
}

function userSchemaSnapshot(database: DatabaseSync): unknown {
  const metadataExists = Number(
    (
      database
        .prepare(
          "SELECT count(*) AS count FROM sqlite_schema WHERE type='table' AND name='schema_migrations'",
        )
        .get() as { count: number | bigint }
    ).count,
  ) === 1;
  return {
    userVersion: {
      ...(database.prepare("PRAGMA user_version").get() as Record<string, unknown>),
    },
    objects: (
      database
        .prepare(
          `SELECT type, name, sql
           FROM sqlite_schema
           WHERE name NOT LIKE 'sqlite_%'
           ORDER BY type, name`,
        )
        .all() as Array<Record<string, unknown>>
    ).map((row) => ({ ...row })),
    migrations: metadataExists
      ? (
          database
            .prepare(
              `SELECT version, name, checksum, applied_at
               FROM schema_migrations
               ORDER BY version`,
            )
            .all() as Array<Record<string, unknown>>
        ).map((row) => ({ ...row }))
      : [],
  };
}

function runtimeStateSnapshot(database: DatabaseSync): unknown {
  return {
    rows: (
      database
        .prepare("SELECT * FROM runtime_events ORDER BY row_id")
        .all() as Array<Record<string, unknown>>
    ).map((row) => ({ ...row })),
    sequence: (
      database
        .prepare("SELECT name, seq FROM sqlite_sequence ORDER BY name")
        .all() as Array<Record<string, unknown>>
    ).map((row) => ({ ...row })),
  };
}

function rawRuntimeState(filePath: string): unknown {
  const database = new DatabaseSync(filePath);
  try {
    return runtimeStateSnapshot(database);
  } finally {
    database.close();
  }
}

function withPrepareOverride<T>(
  predicate: (sql: string) => boolean,
  replacement: (statement: any, sql: string) => any,
  operation: () => T,
): T {
  const original = DatabaseSync.prototype.prepare;
  (DatabaseSync.prototype as any).prepare = function prepare(sql: string) {
    const statement = original.call(this, sql);
    return predicate(sql.trim()) ? replacement(statement, sql.trim()) : statement;
  };
  try {
    return operation();
  } finally {
    (DatabaseSync.prototype as any).prepare = original;
  }
}

function restoreTrigger(database: DatabaseSync, name: string, mutation: () => void): void {
  const row = database
    .prepare("SELECT sql FROM sqlite_schema WHERE type='trigger' AND name=?")
    .get(name) as { sql: string };
  database.exec(`DROP TRIGGER ${name}`);
  try {
    mutation();
  } finally {
    database.exec(row.sql);
  }
}

test("Schema SQL signatures preserve quoted CHECK and RAISE literal bytes", () => {
  assert.notEqual(
    normalizeSqlSchemaSignature("CHECK (surface IN ('sdk'))"),
    normalizeSqlSchemaSignature("check(surface in ('SDK'))"),
  );
  assert.notEqual(
    normalizeSqlSchemaSignature("SELECT RAISE(ABORT, 'two  spaces')"),
    normalizeSqlSchemaSignature("select raise(abort, 'two spaces')"),
  );
  assert.notEqual(
    normalizeSqlSchemaSignature("SELECT X'ABCD'"),
    normalizeSqlSchemaSignature("SELECT X'abcd'"),
  );
  assert.notEqual(
    normalizeSqlSchemaSignature('CREATE TABLE "CaseName"(id INTEGER)'),
    normalizeSqlSchemaSignature('CREATE TABLE "casename"(id INTEGER)'),
  );
  assert.notEqual(
    normalizeSqlSchemaSignature("CREATE TABLE [CaseName](id INTEGER)"),
    normalizeSqlSchemaSignature("CREATE TABLE [casename](id INTEGER)"),
  );
  assert.notEqual(
    normalizeSqlSchemaSignature("CREATE TABLE `CaseName`(id INTEGER)"),
    normalizeSqlSchemaSignature("CREATE TABLE `casename`(id INTEGER)"),
  );
  assert.deepEqual(
    sqlStatementLeadingKeywords(`
      CREATE TRIGGER valid_trigger AFTER INSERT ON demo
      BEGIN
        SELECT CASE WHEN NEW.id > 0 THEN 1 ELSE 0 END;
      END;
    `),
    ["create"],
  );
  assert.deepEqual(
    sqlStatementLeadingKeywords("END TRANSACTION; CREATE TABLE escaped(id INTEGER);"),
    ["end", "create"],
  );

  const cases: ReadonlyArray<{
    readonly name: string;
    readonly mutate: (database: DatabaseSync) => void;
    readonly error: typeof ObservationLedgerCorruptionError | typeof ObservationLedgerMigrationError;
    readonly message: RegExp;
  }> = [
    {
      name: "check-literal-case",
      mutate(database) {
        database.exec("DROP TABLE runtime_events");
        database.exec(
          DEFAULT_OBSERVATION_LEDGER_MIGRATIONS[0].sql.replace(
            "'sdk', 'extension', 'rpc', 'host'",
            "'SDK', 'extension', 'rpc', 'host'",
          ),
        );
      },
      error: ObservationLedgerCorruptionError,
      message: /schema manifest has drifted/,
    },
    {
      name: "runtime-raise-case",
      mutate(database) {
        const row = database
          .prepare(
            "SELECT sql FROM sqlite_schema WHERE type='trigger' AND name='runtime_events_reject_update'",
          )
          .get() as { sql: string };
        database.exec("DROP TRIGGER runtime_events_reject_update");
        database.exec(row.sql.replace("runtime_events is append-only", "RUNTIME_EVENTS is append-only"));
      },
      error: ObservationLedgerCorruptionError,
      message: /schema manifest has drifted/,
    },
    {
      name: "migration-raise-spacing",
      mutate(database) {
        const row = database
          .prepare(
            "SELECT sql FROM sqlite_schema WHERE type='trigger' AND name='schema_migrations_reject_update'",
          )
          .get() as { sql: string };
        database.exec("DROP TRIGGER schema_migrations_reject_update");
        database.exec(row.sql.replace("schema_migrations is append-only", "schema_migrations  is append-only"));
      },
      error: ObservationLedgerMigrationError,
      message: /definition has drifted|manifest has drifted/,
    },
  ];

  for (const item of cases) {
    const root = tempRoot();
    const filePath = join(root, `${item.name}.sqlite`);
    try {
      openFile(filePath).close();
      const database = new DatabaseSync(filePath);
      try {
        item.mutate(database);
      } finally {
        database.close();
      }
      const beforeDatabase = new DatabaseSync(filePath);
      const before = userSchemaSnapshot(beforeDatabase);
      beforeDatabase.close();

      assert.throws(
        () => openFile(filePath),
        (error: unknown) =>
          error instanceof item.error && item.message.test(error.message),
      );

      const afterDatabase = new DatabaseSync(filePath);
      try {
        assert.deepEqual(userSchemaSnapshot(afterDatabase), before);
      } finally {
        afterDatabase.close();
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("an existing migration prefix is validated without mutating rogue Schema", () => {
  const rogueObjects: ReadonlyArray<{
    readonly sql: string;
    readonly predicate: (error: unknown) => boolean;
  }> = [
    {
      sql: "CREATE TABLE rogue(id INTEGER PRIMARY KEY) STRICT;",
      predicate: (error: unknown) =>
        error instanceof ObservationLedgerCorruptionError &&
        /schema manifest has drifted/.test(error.message),
    },
    {
      sql: "CREATE INDEX rogue_metadata_index ON schema_migrations(applied_at);",
      predicate: (error: unknown) =>
        error instanceof ObservationLedgerMigrationError &&
        /Migration metadata Schema manifest has drifted/.test(error.message),
    },
    {
      sql: `CREATE TRIGGER rogue_metadata_trigger
            AFTER INSERT ON schema_migrations
            BEGIN SELECT 1; END;`,
      predicate: (error: unknown) =>
        error instanceof ObservationLedgerMigrationError &&
        /Migration metadata Schema manifest has drifted/.test(error.message),
    },
  ];

  for (const [index, rogue] of rogueObjects.entries()) {
    const root = tempRoot();
    const filePath = join(root, `rogue-${index}.sqlite`);
    const database = new DatabaseSync(filePath);
    try {
      database.exec(OBSERVATION_LEDGER_MIGRATION_SCHEMA_SQL);
      database.exec(rogue.sql);
      const before = userSchemaSnapshot(database);
      database.close();

      assert.throws(() => openFile(filePath), rogue.predicate);

      const verify = new DatabaseSync(filePath);
      try {
        assert.deepEqual(userSchemaSnapshot(verify), before);
      } finally {
        verify.close();
      }
    } finally {
      try {
        database.close();
      } catch {
        // Already closed.
      }
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("pending migration installation and metadata roll back when final validation fails", () => {
  const root = tempRoot();
  const filePath = join(root, "rollback.sqlite");
  const database = new DatabaseSync(filePath);
  const migrations: readonly ObservationLedgerMigration[] = [
    {
      version: 1,
      name: "stable",
      sql: "CREATE TABLE stable(id INTEGER PRIMARY KEY) STRICT;",
    },
  ];
  try {
    const before = userSchemaSnapshot(database);
    assert.throws(
      () =>
        applyObservationLedgerMigrations(database, {
          migrations,
          clock: CLOCK,
          validateAfterPending() {
            throw new Error("simulated final manifest mismatch");
          },
        }),
      (error: unknown) =>
        error instanceof Error &&
        error.message === "simulated final manifest mismatch",
    );
    assert.deepEqual(userSchemaSnapshot(database), before);
  } finally {
    database.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("migration SQL rejects every top-level transaction escape before writing", () => {
  const cases = [
    { sql: "PRAGMA busy_timeout=1; CREATE TABLE forbidden(id INTEGER PRIMARY KEY) STRICT;", leader: "PRAGMA" },
    { sql: "BEGIN; CREATE TABLE forbidden(id INTEGER PRIMARY KEY) STRICT; COMMIT;", leader: "BEGIN" },
    { sql: "END; CREATE TABLE escaped_commit(id INTEGER PRIMARY KEY) STRICT;", leader: "END" },
    { sql: "END TRANSACTION; CREATE TABLE escaped_transaction(id INTEGER PRIMARY KEY) STRICT;", leader: "END" },
  ];
  for (const [index, item] of cases.entries()) {
    const database = new DatabaseSync(":memory:");
    try {
      const before = userSchemaSnapshot(database);
      assert.throws(
        () =>
          applyObservationLedgerMigrations(database, {
            migrations: [{ version: 1, name: `unsafe-${index}`, sql: item.sql }],
            clock: CLOCK,
          }),
        (error: unknown) =>
          error instanceof ObservationLedgerMigrationError &&
          error.migrationVersion === 1 &&
          error.message.includes(`forbidden top-level ${item.leader}`),
      );
      assert.deepEqual(userSchemaSnapshot(database), before);
    } finally {
      database.close();
    }
  }

  const valid = new DatabaseSync(":memory:");
  try {
    applyObservationLedgerMigrations(valid, {
      migrations: [{
        version: 1,
        name: "valid-trigger-end",
        sql: `
          CREATE TABLE demo(id INTEGER PRIMARY KEY) STRICT;
          CREATE TRIGGER demo_guard BEFORE DELETE ON demo
          BEGIN
            SELECT CASE WHEN OLD.id > 0 THEN RAISE(ABORT, 'guard') ELSE 0 END;
          END;
        `,
      }],
      clock: CLOCK,
    });
    assert.equal(valid.isTransaction, false);
    valid.exec("INSERT INTO demo(id) VALUES (1)");
    assert.throws(() => valid.exec("DELETE FROM demo"), /guard/);
  } finally {
    valid.close();
  }
});

test("public Ledger API ignores migration overrides and hides migration execution seams", async () => {
  const api = await import("./index.ts");
  for (const name of [
    "DEFAULT_OBSERVATION_LEDGER_MIGRATIONS",
    "OBSERVATION_LEDGER_MIGRATION_SCHEMA_SQL",
    "applyObservationLedgerMigrations",
    "assertObservationLedgerMigrationState",
  ]) {
    assert.equal(name in api, false, `${name} must not be in the public index`);
  }

  const root = tempRoot();
  const filePath = join(root, "public.sqlite");
  try {
    const ledger = openSqliteObservationLedgerV1({
      filePath,
      clock: CLOCK,
      migrations: [
        {
          version: 1,
          name: "attacker",
          sql: "PRAGMA busy_timeout=1; CREATE TABLE rogue(id INTEGER);",
        },
      ],
    } as any);
    ledger.close();

    const database = new DatabaseSync(filePath);
    try {
      const rogue = database
        .prepare("SELECT count(*) AS count FROM sqlite_schema WHERE name='rogue'")
        .get() as { count: number | bigint };
      const guard = database
        .prepare(
          "SELECT sql FROM sqlite_schema WHERE type='trigger' AND name='runtime_events_reject_update'",
        )
        .get() as { sql: string };
      assert.equal(Number(rogue.count), 0);
      assert.match(guard.sql, /RAISE/);
    } finally {
      database.close();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("open re-reads PRAGMAs after pending migrations and rolls the install back on drift", () => {
  const root = tempRoot();
  const filePath = join(root, "pragma-drift.sqlite");
  let busyReads = 0;
  try {
    assert.throws(
      () =>
        withPrepareOverride(
          (sql) => sql === "PRAGMA busy_timeout",
          (statement) => ({
            get: (...args: unknown[]) => {
              busyReads += 1;
              if (busyReads === 1) return statement.get(...args);
              return { timeout: 1 };
            },
          }),
          () => openFile(filePath),
        ),
      (error: unknown) =>
        error instanceof ObservationLedgerCorruptionError &&
        /busyTimeoutMs/.test(error.message),
    );
    const database = new DatabaseSync(filePath);
    try {
      assert.deepEqual(userSchemaSnapshot(database), {
        userVersion: { user_version: 0 },
        objects: [],
        migrations: [],
      });
    } finally {
      database.close();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("INSERT OR REPLACE and REPLACE cannot rewrite Runtime or migration history", () => {
  const root = tempRoot();
  const filePath = join(root, "replace.sqlite");
  try {
    const ledger = openFile(filePath);
    ledger.append(makeEvent(1));
    ledger.close();

    const database = new DatabaseSync(filePath);
    try {
      const recursive = database.prepare("PRAGMA recursive_triggers").get() as {
        recursive_triggers: number | bigint;
      };
      assert.equal(Number(recursive.recursive_triggers), 0);

      const base = database
        .prepare("SELECT * FROM runtime_events WHERE row_id=1")
        .get() as Record<string, unknown>;

      const runtimeCases = [
        {
          name: "row_id",
          message: "runtime_events row_id replacement is forbidden",
          mutate(row: Record<string, unknown>) {
            row.row_id = 1;
            row.event_id = "replacement-row-id";
            row.idempotency_key = "replacement-row-idempotency";
            row.source_sequence = 2;
          },
        },
        {
          name: "event_id",
          message: "runtime_events event_id replacement is forbidden",
          mutate(row: Record<string, unknown>) {
            row.row_id = 2;
            row.idempotency_key = "replacement-event-idempotency";
            row.source_sequence = 2;
          },
        },
        {
          name: "idempotency",
          message: "runtime_events idempotency_key replacement is forbidden",
          mutate(row: Record<string, unknown>) {
            row.row_id = 2;
            row.event_id = "replacement-event-id";
            row.source_sequence = 2;
          },
        },
        {
          name: "source_slot",
          message: "runtime_events source_slot replacement is forbidden",
          mutate(row: Record<string, unknown>) {
            row.row_id = 2;
            row.event_id = "replacement-source-slot-event";
            row.idempotency_key = "replacement-source-slot-idempotency";
          },
        },
      ] as const;

      for (const verb of ["INSERT OR REPLACE", "REPLACE"] as const) {
        for (const item of runtimeCases) {
          const before = runtimeStateSnapshot(database);
          const row = { ...base };
          item.mutate(row);
          const values = RUNTIME_COLUMNS.map((column) => row[column]);
          assert.throws(
            () =>
              database
                .prepare(
                  `${verb} INTO runtime_events (${RUNTIME_COLUMNS.join(",")})
                   VALUES (${RUNTIME_COLUMNS.map(() => "?").join(",")})`,
                )
                .run(...(values as any[])),
            (error: unknown) =>
              error instanceof Error && error.message.includes(item.message),
            `${verb} ${item.name}`,
          );
          assert.deepEqual(runtimeStateSnapshot(database), before);
        }
      }

      const migration = database
        .prepare("SELECT * FROM schema_migrations WHERE version=1")
        .get() as Record<string, unknown>;
      const migrationCases = [
        {
          message: "schema_migrations version replacement is forbidden",
          values: [
            migration.version,
            "replacement-name",
            migration.checksum,
            migration.applied_at,
          ],
        },
        {
          message: "schema_migrations name replacement is forbidden",
          values: [
            2,
            migration.name,
            migration.checksum,
            migration.applied_at,
          ],
        },
      ];
      for (const verb of ["INSERT OR REPLACE", "REPLACE"] as const) {
        for (const item of migrationCases) {
          const before = userSchemaSnapshot(database);
          assert.throws(
            () =>
              database
                .prepare(
                  `${verb} INTO schema_migrations(version,name,checksum,applied_at)
                   VALUES (?,?,?,?)`,
                )
                .run(...(item.values as any[])),
            (error: unknown) =>
              error instanceof Error && error.message.includes(item.message),
          );
          assert.deepEqual(userSchemaSnapshot(database), before);
        }
      }
    } finally {
      database.close();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("canonical persisted reverse source sequence fails at open and every live boundary", () => {
  const root = tempRoot();
  try {
    const openPath = join(root, "open.sqlite");
    openFile(openPath).close();
    const openDatabase = new DatabaseSync(openPath);
    insertRuntimeEvent(openDatabase, makeEvent(2));
    insertRuntimeEvent(openDatabase, makeEvent(1));
    openDatabase.close();
    assert.throws(
      () => openFile(openPath),
      (error: unknown) =>
        error instanceof ObservationLedgerCorruptionError &&
        error.rowId === 2 &&
        error.previousRowId === 1 &&
        error.previousSourceSequence === 2 &&
        error.currentSourceSequence === 1 &&
        error.stream?.sequenceDomain === "rpc-jsonl" &&
        /source sequence 1 is not greater than earlier row 1 sequence 2/.test(error.message),
    );

    for (const mode of ["append", "batch", "read"] as const) {
      const filePath = join(root, `${mode}.sqlite`);
      const ledger = openFile(filePath);
      const external = new DatabaseSync(filePath);
      insertRuntimeEvent(external, makeEvent(2));
      insertRuntimeEvent(external, makeEvent(1));
      external.close();
      const before = rawRuntimeState(filePath);
      assert.throws(
        () => {
          if (mode === "append") ledger.append(makeEvent(3));
          else if (mode === "batch") ledger.appendBatch([makeEvent(3), makeEvent(4)]);
          else ledger.readWorkspace("workspace-r2");
        },
        (error: unknown) =>
          error instanceof ObservationLedgerCorruptionError &&
          error.rowId === 2 &&
          error.previousRowId === 1 &&
          error.previousSourceSequence === 2 &&
          error.currentSourceSequence === 1 &&
          error.stream?.workspaceId === "workspace-r2" &&
          error.stream.runtimeSessionId === "session-r2" &&
          error.stream.runtimeInstanceId === "instance-r2" &&
          error.stream.adapter === "pi-rpc-v1" &&
          error.stream.runtimeImplementation === "pi" &&
          error.stream.runtimeVersion === "0.84.1" &&
          error.stream.surface === "rpc" &&
          error.stream.sequenceDomain === "rpc-jsonl" &&
          /source sequence 1 is not greater/.test(error.message),
      );
      assert.deepEqual(rawRuntimeState(filePath), before);
      ledger.close();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("post-open migration history and user_version drift block reads and writes", () => {
  const mutations: ReadonlyArray<{
    readonly name: string;
    readonly mutate: (database: DatabaseSync) => void;
    readonly message: RegExp;
  }> = [
    {
      name: "unknown-version",
      mutate(database) {
        database
          .prepare(
            `INSERT INTO schema_migrations(version,name,checksum,applied_at)
             VALUES (2,'unknown',?,?)`,
          )
          .run("0".repeat(64), CLOCK.now());
      },
      message: /unknown migration version 2/,
    },
    {
      name: "version-gap",
      mutate(database) {
        restoreTrigger(database, "schema_migrations_reject_update", () => {
          database.exec("UPDATE schema_migrations SET version=2 WHERE version=1");
        });
      },
      message: /not a contiguous prefix/,
    },
    {
      name: "name",
      mutate(database) {
        restoreTrigger(database, "schema_migrations_reject_update", () => {
          database.exec("UPDATE schema_migrations SET name='drifted' WHERE version=1");
        });
      },
      message: /does not match the immutable source/,
    },
    {
      name: "checksum",
      mutate(database) {
        restoreTrigger(database, "schema_migrations_reject_update", () => {
          database.exec(`UPDATE schema_migrations SET checksum='${"0".repeat(64)}' WHERE version=1`);
        });
      },
      message: /does not match the immutable source/,
    },
    {
      name: "applied-at",
      mutate(database) {
        restoreTrigger(database, "schema_migrations_reject_update", () => {
          database.exec("UPDATE schema_migrations SET applied_at='not-a-time' WHERE version=1");
        });
      },
      message: /applied_at is not a canonical UTC timestamp/,
    },
    {
      name: "user-version",
      mutate(database) {
        database.exec("PRAGMA user_version=0");
      },
      message: /user_version=0/,
    },
  ];

  for (const item of mutations) {
    const root = tempRoot();
    const filePath = join(root, `${item.name}.sqlite`);
    const ledger = openFile(filePath);
    try {
      ledger.append(makeEvent(1));
      const external = new DatabaseSync(filePath);
      item.mutate(external);
      external.close();
      const before = rawRuntimeState(filePath);

      for (const operation of [
        () => ledger.appliedMigrations,
        () => ledger.schemaVersion,
        () => ledger.append(makeEvent(2)),
        () => ledger.appendBatch([makeEvent(2), makeEvent(3)]),
        () => ledger.readWorkspace("workspace-r2"),
      ]) {
        assert.throws(
          operation,
          (error: unknown) =>
            error instanceof ObservationLedgerMigrationError &&
            item.message.test(error.message),
          item.name,
        );
      }
      assert.deepEqual(rawRuntimeState(filePath), before);
    } finally {
      ledger.close();
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("zero and negative row cursors are rejected by SQL and by logical boundaries", () => {
  for (const rowId of [0, -1]) {
    const root = tempRoot();
    try {
      const sqlPath = join(root, `sql-${rowId}.sqlite`);
      openFile(sqlPath).close();
      const sqlDatabase = new DatabaseSync(sqlPath);
      assert.throws(
        () => insertRuntimeEvent(sqlDatabase, makeEvent(1), rowId),
        (error: unknown) =>
          error instanceof Error && /CHECK constraint failed/.test(error.message),
      );
      sqlDatabase.exec("PRAGMA ignore_check_constraints=ON");
      insertRuntimeEvent(sqlDatabase, makeEvent(1), rowId);
      sqlDatabase.close();
      assert.throws(
        () => openFile(sqlPath),
        (error: unknown) =>
          error instanceof ObservationLedgerCorruptionError &&
          error.rowId === rowId &&
          /Row cursor must be a positive integer/.test(error.message),
      );

      for (const mode of ["append", "batch", "read"] as const) {
        const filePath = join(root, `${mode}-${rowId}.sqlite`);
        const ledger = openFile(filePath);
        const external = new DatabaseSync(filePath);
        external.exec("PRAGMA ignore_check_constraints=ON");
        insertRuntimeEvent(external, makeEvent(1), rowId);
        external.close();
        const before = rawRuntimeState(filePath);
        assert.throws(
          () => {
            if (mode === "append") ledger.append(makeEvent(2));
            else if (mode === "batch") ledger.appendBatch([makeEvent(2), makeEvent(3)]);
            else ledger.readWorkspace("workspace-r2");
          },
          (error: unknown) =>
            error instanceof ObservationLedgerCorruptionError &&
            error.rowId === rowId &&
            /Row cursor must be a positive integer/.test(error.message),
        );
        assert.deepEqual(rawRuntimeState(filePath), before);
        ledger.close();
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("pending DDL is blocked by canonical row corruption before any migration write", () => {
  const root = tempRoot();
  const filePath = join(root, "future-prefix-corruption.sqlite");
  const database = new DatabaseSync(filePath);
  const future: ObservationLedgerMigration = {
    version: 2,
    name: "future-marker",
    sql: "CREATE TABLE future_marker(id INTEGER PRIMARY KEY) STRICT;",
  };
  try {
    applyObservationLedgerMigrations(database, {
      migrations: DEFAULT_OBSERVATION_LEDGER_MIGRATIONS,
      clock: CLOCK,
    });
    insertRuntimeEvent(database, makeEvent(2));
    insertRuntimeEvent(database, makeEvent(1));
    const before = userSchemaSnapshot(database);

    assert.throws(
      () =>
        applyObservationLedgerMigrations(database, {
          migrations: [...DEFAULT_OBSERVATION_LEDGER_MIGRATIONS, future],
          clock: CLOCK,
          validateBeforePending() {
            validateObservationLedgerRuntimeRowsForTest(database);
          },
        }),
      (error: unknown) =>
        error instanceof ObservationLedgerCorruptionError &&
        error.rowId === 2 &&
        error.previousRowId === 1 &&
        error.previousSourceSequence === 2 &&
        error.currentSourceSequence === 1,
    );
    assert.deepEqual(userSchemaSnapshot(database), before);
    assert.equal(
      Number(
        (
          database
            .prepare("SELECT count(*) AS count FROM sqlite_schema WHERE name='future_marker'")
            .get() as { count: number | bigint }
        ).count,
      ),
      0,
    );
  } finally {
    database.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("arbitrary metadata triggers fail through getters, reads, and writes", () => {
  const root = tempRoot();
  const filePath = join(root, "rogue-metadata-trigger.sqlite");
  const ledger = openFile(filePath);
  try {
    ledger.append(makeEvent(1));
    const external = new DatabaseSync(filePath);
    external.exec(`
      CREATE TRIGGER rogue_after_insert
      AFTER INSERT ON schema_migrations
      BEGIN
        SELECT 1;
      END;
    `);
    external.close();
    const before = rawRuntimeState(filePath);

    for (const operation of [
      () => ledger.appliedMigrations,
      () => ledger.schemaVersion,
      () => ledger.getByEventId(makeEvent(1).eventId),
      () => ledger.append(makeEvent(2)),
      () => ledger.appendBatch([makeEvent(2), makeEvent(3)]),
    ]) {
      assert.throws(
        operation,
        (error: unknown) =>
          error instanceof ObservationLedgerMigrationError &&
          /Migration metadata Schema manifest has drifted/.test(error.message),
      );
    }
    assert.deepEqual(rawRuntimeState(filePath), before);
  } finally {
    ledger.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("every business read uses one validated SQLite snapshot", () => {
  const operations = [
    {
      name: "getByEventId",
      run: (ledger: ReturnType<typeof openFile>, event: NormalizedRuntimeEventV1) =>
        ledger.getByEventId(event.eventId)?.event.sequence.value,
      expected: 2,
    },
    {
      name: "getByIdempotencyKey",
      run: (ledger: ReturnType<typeof openFile>, event: NormalizedRuntimeEventV1) =>
        ledger.getByIdempotencyKey(event.idempotencyKey)?.event.sequence.value,
      expected: 2,
    },
    {
      name: "readSession",
      run: (ledger: ReturnType<typeof openFile>) =>
        ledger.readSession("workspace-r2", "session-r2").map((row) => row.event.sequence.value),
      expected: [2],
    },
    {
      name: "readWorkspace",
      run: (ledger: ReturnType<typeof openFile>) =>
        ledger.readWorkspace("workspace-r2").map((row) => row.event.sequence.value),
      expected: [2],
    },
    {
      name: "countEvents",
      run: (ledger: ReturnType<typeof openFile>) => ledger.countEvents(),
      expected: 1,
    },
  ] as const;

  for (const item of operations) {
    const root = tempRoot();
    const filePath = join(root, `${item.name}.sqlite`);
    const ledger = openFile(filePath);
    const event = makeEvent(2);
    ledger.append(event);
    const external = new DatabaseSync(filePath);
    let injected = false;
    try {
      const result = withPrepareOverride(
        (sql) =>
          sql.includes("FROM runtime_events") &&
          sql.includes("ORDER BY row_id ASC"),
        (statement) =>
          new Proxy(statement, {
            get(target, property, receiver) {
              if (property !== "all") return Reflect.get(target, property, receiver);
              return (...args: unknown[]) => {
                const rows = target.all(...args);
                if (!injected) {
                  injected = true;
                  insertRuntimeEvent(external, makeEvent(1));
                }
                return rows;
              };
            },
          }),
        () => item.run(ledger, event),
      );
      assert.deepEqual(result, item.expected, item.name);
      assert.equal(injected, true);

      for (const integrityOperation of [
        () => ledger.integrityCheck(),
        () => ledger.assertIntegrity(),
      ]) {
        assert.throws(
          integrityOperation,
          (error: unknown) =>
            error instanceof ObservationLedgerCorruptionError &&
            error.rowId === 2 &&
            error.previousSourceSequence === 2 &&
            error.currentSourceSequence === 1,
        );
      }
    } finally {
      external.close();
      ledger.close();
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("batch conflicts and reverse sequence preserve the exact cursor state", () => {
  const root = tempRoot();
  try {
    const laterPath = join(root, "later.sqlite");
    const later = openFile(laterPath);
    later.append(makeEvent(1));
    const beforeLater = rawRuntimeState(laterPath);
    assert.throws(
      () => later.appendBatch([makeEvent(2), makeEvent(1, "conflict")]),
      (error: unknown) =>
        error instanceof ObservationLedgerConflictError &&
        error.code === "conflict" &&
        error.conflictKind === "source-slot" &&
        error.eventId === makeEvent(1, "conflict").eventId,
    );
    assert.deepEqual(rawRuntimeState(laterPath), beforeLater);
    later.close();

    const internalPath = join(root, "internal.sqlite");
    const internal = openFile(internalPath);
    const beforeInternal = rawRuntimeState(internalPath);
    assert.throws(
      () => internal.appendBatch([makeEvent(1), makeEvent(1, "conflict")]),
      (error: unknown) =>
        error instanceof ObservationLedgerConflictError &&
        error.code === "conflict" &&
        error.conflictKind === "source-slot",
    );
    assert.deepEqual(rawRuntimeState(internalPath), beforeInternal);

    assert.throws(
      () => internal.appendBatch([makeEvent(2), makeEvent(1)]),
      (error: unknown) =>
        error instanceof ObservationLedgerSequenceError &&
        error.code === "sequence" &&
        error.sourceSequence === 1 &&
        error.latestSourceSequence === 2 &&
        error.stream.sequenceDomain === "rpc-jsonl",
    );
    assert.deepEqual(rawRuntimeState(internalPath), beforeInternal);
    internal.close();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("DatabaseSync constructor and close failures use the stable sqlite contract", () => {
  const root = tempRoot();
  const directoryPath = join(root, "database-directory");
  mkdirSync(directoryPath);
  const parentFile = join(root, "parent-file");
  writeFileSync(parentFile, "not a directory", "utf8");
  try {
    assert.throws(
      () => openFile(join(parentFile, "ledger.sqlite")),
      (error: unknown) =>
        error instanceof ObservationLedgerError &&
        error.code === "sqlite" &&
        /Failed to open Observation Ledger/.test(error.message) &&
        (error as any).cause instanceof Error &&
        ["ENOTDIR", "EEXIST"].includes((error as any).cause.code),
    );

    assert.throws(
      () => openFile(directoryPath),
      (error: unknown) =>
        error instanceof ObservationLedgerError &&
        error.code === "sqlite" &&
        (error as any).cause instanceof Error &&
        (error as any).cause.code === "ERR_SQLITE_ERROR",
    );

    const ledger = openSqliteObservationLedgerV1({
      filePath: ":memory:",
      clock: CLOCK,
    });
    const originalClose = DatabaseSync.prototype.close;
    (DatabaseSync.prototype as any).close = function close() {
      const cause = new Error("simulated close failure");
      (cause as any).code = "ERR_SQLITE_ERROR";
      throw cause;
    };
    try {
      assert.throws(
        () => ledger.close(),
        (error: unknown) =>
          error instanceof ObservationLedgerError &&
          error.code === "sqlite" &&
          /close/.test(error.message) &&
          (error as any).cause?.code === "ERR_SQLITE_ERROR",
      );
    } finally {
      (DatabaseSync.prototype as any).close = originalClose;
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
