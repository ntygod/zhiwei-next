import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

import {
  normalizeSqlSchemaSignature,
  sqlStatementLeadingKeywords,
} from "./sqlite-schema-sql.ts";

export interface ObservationLedgerMigration {
  readonly version: number;
  readonly name: string;
  readonly sql: string;
}

export interface AppliedObservationLedgerMigration {
  readonly version: number;
  readonly name: string;
  readonly checksum: string;
  readonly appliedAt: string;
}

export interface MigrationClock {
  now(): string;
}

export interface ObservationLedgerMigrationValidationContext {
  readonly isNewDatabase: boolean;
  readonly migrations: readonly ObservationLedgerMigration[];
  readonly applied: readonly AppliedObservationLedgerMigration[];
  readonly pending: readonly ObservationLedgerMigration[];
}

export interface ApplyObservationLedgerMigrationsOptions {
  readonly migrations?: readonly ObservationLedgerMigration[];
  readonly clock: MigrationClock;
  readonly validateBeforePending?: (
    context: ObservationLedgerMigrationValidationContext,
  ) => void;
  readonly validateAfterPending?: (
    context: ObservationLedgerMigrationValidationContext,
  ) => void;
}

export class ObservationLedgerMigrationError extends Error {
  readonly migrationVersion?: number;

  constructor(message: string, migrationVersion?: number, options?: ErrorOptions) {
    super(message, options);
    this.name = "ObservationLedgerMigrationError";
    this.migrationVersion = migrationVersion;
  }
}

const MIGRATION_FILES = [
  {
    version: 1,
    name: "normalized-runtime-event-v1",
    url: new URL("../migrations/0001_normalized_runtime_event_v1.sql", import.meta.url),
  },
] as const;

export const DEFAULT_OBSERVATION_LEDGER_MIGRATIONS: readonly ObservationLedgerMigration[] =
  Object.freeze(
    MIGRATION_FILES.map(({ version, name, url }) =>
      Object.freeze({
        version,
        name,
        sql: readFileSync(url, "utf8"),
      }),
    ),
  );

const SCHEMA_MIGRATIONS_TABLE_SQL = `
CREATE TABLE schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  checksum TEXT NOT NULL CHECK (length(checksum) = 64),
  applied_at TEXT NOT NULL
) STRICT
`.trim();

const SCHEMA_MIGRATIONS_UPDATE_TRIGGER_SQL = `
CREATE TRIGGER schema_migrations_reject_update
BEFORE UPDATE ON schema_migrations
BEGIN
  SELECT RAISE(ABORT, 'schema_migrations is append-only');
END
`.trim();

const SCHEMA_MIGRATIONS_DELETE_TRIGGER_SQL = `
CREATE TRIGGER schema_migrations_reject_delete
BEFORE DELETE ON schema_migrations
BEGIN
  SELECT RAISE(ABORT, 'schema_migrations is append-only');
END
`.trim();

const SCHEMA_MIGRATIONS_VERSION_REPLACE_TRIGGER_SQL = `
CREATE TRIGGER schema_migrations_reject_version_replacement
BEFORE INSERT ON schema_migrations
WHEN EXISTS (
  SELECT 1 FROM schema_migrations WHERE version = NEW.version
)
BEGIN
  SELECT RAISE(ABORT, 'schema_migrations version replacement is forbidden');
END
`.trim();

const SCHEMA_MIGRATIONS_NAME_REPLACE_TRIGGER_SQL = `
CREATE TRIGGER schema_migrations_reject_name_replacement
BEFORE INSERT ON schema_migrations
WHEN EXISTS (
  SELECT 1 FROM schema_migrations WHERE name = NEW.name
)
BEGIN
  SELECT RAISE(ABORT, 'schema_migrations name replacement is forbidden');
END
`.trim();

/**
 * Migration metadata is installed only for a provably empty database. Existing
 * databases are validated and are never repaired with CREATE ... IF NOT EXISTS.
 */
export const OBSERVATION_LEDGER_MIGRATION_SCHEMA_SQL = [
  SCHEMA_MIGRATIONS_TABLE_SQL,
  SCHEMA_MIGRATIONS_UPDATE_TRIGGER_SQL,
  SCHEMA_MIGRATIONS_DELETE_TRIGGER_SQL,
  SCHEMA_MIGRATIONS_VERSION_REPLACE_TRIGGER_SQL,
  SCHEMA_MIGRATIONS_NAME_REPLACE_TRIGGER_SQL,
]
  .map((sql) => `${sql};`)
  .join("\n\n")
  .concat("\n");

const METADATA_TRIGGER_SQL = new Map<string, string>([
  ["schema_migrations_reject_update", SCHEMA_MIGRATIONS_UPDATE_TRIGGER_SQL],
  ["schema_migrations_reject_delete", SCHEMA_MIGRATIONS_DELETE_TRIGGER_SQL],
  [
    "schema_migrations_reject_version_replacement",
    SCHEMA_MIGRATIONS_VERSION_REPLACE_TRIGGER_SQL,
  ],
  [
    "schema_migrations_reject_name_replacement",
    SCHEMA_MIGRATIONS_NAME_REPLACE_TRIGGER_SQL,
  ],
]);

const FORBIDDEN_MIGRATION_STATEMENT_LEADERS = new Set([
  "attach",
  "begin",
  "commit",
  "detach",
  "pragma",
  "release",
  "rollback",
  "savepoint",
  "vacuum",
]);

export function checksumObservationLedgerMigration(
  migration: Pick<ObservationLedgerMigration, "version" | "name" | "sql">,
): string {
  return createHash("sha256")
    .update(`${migration.version}\0${migration.name}\0${migration.sql}`, "utf8")
    .digest("hex");
}

function migrationError(
  message: string,
  migrationVersion?: number,
  options?: ErrorOptions,
): never {
  throw new ObservationLedgerMigrationError(message, migrationVersion, options);
}

function safeInteger(value: number | bigint, label: string): number {
  const converted = typeof value === "bigint" ? Number(value) : value;
  if (!Number.isSafeInteger(converted)) {
    migrationError(`${label} is outside the JavaScript safe integer range.`);
  }
  return converted;
}

function canonicalAppliedAt(value: string, version: number, label: string): string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
  ) {
    migrationError(`${label} is not a canonical UTC timestamp: ${String(value)}.`, version);
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.valueOf()) || parsed.toISOString() !== value) {
    migrationError(`${label} is not a real canonical UTC timestamp: ${String(value)}.`, version);
  }
  return value;
}

function readUserVersion(database: DatabaseSync): number {
  const row = database.prepare("PRAGMA user_version").get() as
    | { user_version?: number | bigint }
    | undefined;
  return safeInteger(row?.user_version ?? 0, "PRAGMA user_version");
}

function readUserSchemaObjects(
  database: DatabaseSync,
): readonly { readonly type: string; readonly name: string }[] {
  return database
    .prepare(
      `SELECT type, name
       FROM sqlite_schema
       WHERE name NOT LIKE 'sqlite_%'
       ORDER BY type ASC, name ASC`,
    )
    .all() as Array<{ readonly type: string; readonly name: string }>;
}

function readSchemaObject(
  database: DatabaseSync,
  type: "table" | "trigger",
  name: string,
): { readonly type: string; readonly name: string; readonly sql: string | null } | undefined {
  return database
    .prepare(
      `SELECT type, name, sql
       FROM sqlite_schema
       WHERE type = ? AND name = ?`,
    )
    .get(type, name) as
    | { readonly type: string; readonly name: string; readonly sql: string | null }
    | undefined;
}

function assertSchemaObject(
  database: DatabaseSync,
  type: "table" | "trigger",
  name: string,
  expectedSql: string,
): void {
  const row = readSchemaObject(database, type, name);
  if (!row || typeof row.sql !== "string") {
    migrationError(`Migration metadata ${type} ${name} is missing.`);
  }
  let actualSignature: string;
  let expectedSignature: string;
  try {
    actualSignature = normalizeSqlSchemaSignature(row.sql);
    expectedSignature = normalizeSqlSchemaSignature(expectedSql);
  } catch (error) {
    migrationError(`Migration metadata ${type} ${name} SQL cannot be tokenized.`, undefined, {
      cause: error,
    });
  }
  if (actualSignature !== expectedSignature) {
    migrationError(`Migration metadata ${type} ${name} definition has drifted.`);
  }
}

function captureMetadataIndexManifest(database: DatabaseSync): unknown {
  const rows = database
    .prepare("PRAGMA index_list('schema_migrations')")
    .all() as Array<{
    readonly name: string;
    readonly unique: number | bigint;
    readonly origin: string;
    readonly partial: number | bigint;
  }>;
  return rows
    .map((row) => ({
      name: row.name,
      unique: Number(row.unique),
      origin: row.origin,
      partial: Number(row.partial),
      columns: (
        database
          .prepare(`PRAGMA index_xinfo('${row.name}')`)
          .all() as Array<{
          readonly seqno: number | bigint;
          readonly cid: number | bigint;
          readonly name: string | null;
          readonly desc: number | bigint;
          readonly coll: string | null;
          readonly key: number | bigint;
        }>
      ).map((column) => ({
        sequence: Number(column.seqno),
        columnId: Number(column.cid),
        name: column.name,
        descending: Number(column.desc),
        collation: column.coll,
        key: Number(column.key),
      })),
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function captureMigrationMetadataManifest(database: DatabaseSync): unknown {
  const table = database
    .prepare("PRAGMA table_list('schema_migrations')")
    .get() as { readonly strict?: number | bigint } | undefined;
  const columns = database
    .prepare("PRAGMA table_xinfo('schema_migrations')")
    .all() as Array<{
    readonly cid: number | bigint;
    readonly name: string;
    readonly type: string;
    readonly notnull: number | bigint;
    readonly dflt_value: unknown;
    readonly pk: number | bigint;
    readonly hidden: number | bigint;
  }>;
  const objects = database
    .prepare(
      `SELECT type, name, sql
       FROM sqlite_schema
       WHERE name = 'schema_migrations'
          OR name LIKE 'schema_migrations_reject_%'
       ORDER BY type ASC, name ASC`,
    )
    .all() as Array<{
    readonly type: string;
    readonly name: string;
    readonly sql: string | null;
  }>;

  return {
    strict: Number(table?.strict ?? 0),
    columns: columns.map((column) => ({
      cid: Number(column.cid),
      name: column.name,
      type: column.type.toUpperCase(),
      notNull: Number(column.notnull),
      defaultValue: column.dflt_value ?? null,
      primaryKey: Number(column.pk),
      hidden: Number(column.hidden),
    })),
    indexes: captureMetadataIndexManifest(database),
    objects: objects.map((row) => ({
      type: row.type,
      name: row.name,
      sql: normalizeSqlSchemaSignature(row.sql),
    })),
  };
}

const EXPECTED_MIGRATION_METADATA_MANIFEST = (() => {
  const database = new DatabaseSync(":memory:");
  try {
    database.exec(OBSERVATION_LEDGER_MIGRATION_SCHEMA_SQL);
    return JSON.stringify(captureMigrationMetadataManifest(database));
  } finally {
    database.close();
  }
})();

function assertMigrationMetadataSchema(database: DatabaseSync): void {
  assertSchemaObject(
    database,
    "table",
    "schema_migrations",
    SCHEMA_MIGRATIONS_TABLE_SQL,
  );
  for (const [name, sql] of METADATA_TRIGGER_SQL) {
    assertSchemaObject(database, "trigger", name, sql);
  }

  let actual: string;
  try {
    actual = JSON.stringify(captureMigrationMetadataManifest(database));
  } catch (error) {
    migrationError("Failed to read immutable migration metadata Schema.", undefined, {
      cause: error,
    });
  }
  if (actual !== EXPECTED_MIGRATION_METADATA_MANIFEST) {
    migrationError("Migration metadata Schema manifest has drifted.");
  }
}

function assertMigrationSqlSafe(migration: ObservationLedgerMigration): void {
  let leaders: readonly string[];
  try {
    leaders = sqlStatementLeadingKeywords(migration.sql);
  } catch (error) {
    migrationError(
      `Migration ${migration.version} SQL cannot be tokenized.`,
      migration.version,
      { cause: error },
    );
  }
  for (const leader of leaders) {
    if (FORBIDDEN_MIGRATION_STATEMENT_LEADERS.has(leader)) {
      migrationError(
        `Migration ${migration.version} contains forbidden top-level ${leader.toUpperCase()} SQL.`,
        migration.version,
      );
    }
  }
}

function assertMigrationSet(migrations: readonly ObservationLedgerMigration[]): void {
  if (!Array.isArray(migrations) || migrations.length === 0) {
    migrationError("Observation Ledger migrations must contain version 1.");
  }

  const names = new Set<string>();
  for (const [index, migration] of migrations.entries()) {
    const expectedVersion = index + 1;
    if (!Number.isSafeInteger(migration.version) || migration.version !== expectedVersion) {
      migrationError(
        `Migration versions must form the contiguous prefix 1..N; ` +
          `expected ${expectedVersion}, received ${String(migration.version)}.`,
        migration.version,
      );
    }
    if (
      typeof migration.name !== "string" ||
      migration.name.trim().length === 0 ||
      migration.name !== migration.name.trim()
    ) {
      migrationError(
        `Migration ${migration.version} must have a trimmed non-empty name.`,
        migration.version,
      );
    }
    if (names.has(migration.name)) {
      migrationError(`Duplicate migration name: ${migration.name}.`, migration.version);
    }
    if (typeof migration.sql !== "string" || migration.sql.trim().length === 0) {
      migrationError(`Migration ${migration.version} must not be empty.`, migration.version);
    }
    assertMigrationSqlSafe(migration);
    names.add(migration.name);
  }
}

function readMigrationRows(
  database: DatabaseSync,
): readonly AppliedObservationLedgerMigration[] {
  let rows: Array<{
    version: number | bigint;
    name: string;
    checksum: string;
    applied_at: string;
  }>;
  try {
    rows = database
      .prepare(
        `SELECT version, name, checksum, applied_at
         FROM schema_migrations
         ORDER BY version ASC`,
      )
      .all() as typeof rows;
  } catch (error) {
    migrationError("Failed to read immutable migration history.", undefined, {
      cause: error,
    });
  }

  return rows.map((row) => {
    const version = safeInteger(row.version, "schema_migrations.version");
    return {
      version,
      name: row.name,
      checksum: row.checksum,
      appliedAt: canonicalAppliedAt(
        row.applied_at,
        version,
        `Stored migration ${version} applied_at`,
      ),
    };
  });
}

function validateAppliedPrefix(
  migrations: readonly ObservationLedgerMigration[],
  applied: readonly AppliedObservationLedgerMigration[],
): void {
  if (applied.length > migrations.length) {
    const unknown = applied[migrations.length];
    migrationError(
      `Database contains unknown migration version ${unknown.version} (${unknown.name}).`,
      unknown.version,
    );
  }

  for (const [index, record] of applied.entries()) {
    const expectedVersion = index + 1;
    if (record.version !== expectedVersion) {
      migrationError(
        `Applied migration history is not a contiguous prefix: expected version ` +
          `${expectedVersion}, found ${record.version}.`,
        record.version,
      );
    }
    const migration = migrations[index];
    const expectedChecksum = checksumObservationLedgerMigration(migration);
    if (record.name !== migration.name || record.checksum !== expectedChecksum) {
      migrationError(
        `Applied migration ${record.version} does not match the immutable source ` +
          `(stored name=${record.name}, expected name=${migration.name}, ` +
          `stored checksum=${record.checksum}, expected checksum=${expectedChecksum}).`,
        record.version,
      );
    }
  }
}

function inspectMigrationState(
  database: DatabaseSync,
  migrations: readonly ObservationLedgerMigration[],
): {
  readonly isNewDatabase: boolean;
  readonly applied: readonly AppliedObservationLedgerMigration[];
} {
  const metadata = readSchemaObject(database, "table", "schema_migrations");
  if (!metadata) {
    const objects = readUserSchemaObjects(database);
    const userVersion = readUserVersion(database);
    if (objects.length !== 0 || userVersion !== 0) {
      migrationError(
        `Migration metadata is missing from a non-empty database ` +
          `(objects=${objects.map((row) => `${row.type}:${row.name}`).join(",") || "none"}, ` +
          `user_version=${userVersion}).`,
      );
    }
    return { isNewDatabase: true, applied: [] };
  }

  assertMigrationMetadataSchema(database);
  const applied = readMigrationRows(database);
  validateAppliedPrefix(migrations, applied);
  const userVersion = readUserVersion(database);
  const expectedVersion = applied.at(-1)?.version ?? 0;
  if (userVersion !== expectedVersion) {
    migrationError(
      `PRAGMA user_version=${userVersion} differs from immutable migration ` +
        `history version ${expectedVersion}.`,
      userVersion,
    );
  }
  return { isNewDatabase: false, applied };
}

export function readAppliedObservationLedgerMigrations(
  database: DatabaseSync,
): readonly AppliedObservationLedgerMigration[] {
  assertMigrationMetadataSchema(database);
  return readMigrationRows(database);
}

export function assertObservationLedgerMigrationState(
  database: DatabaseSync,
  migrations: readonly ObservationLedgerMigration[] =
    DEFAULT_OBSERVATION_LEDGER_MIGRATIONS,
): readonly AppliedObservationLedgerMigration[] {
  assertMigrationSet(migrations);
  const state = inspectMigrationState(database, migrations);
  if (state.isNewDatabase) {
    migrationError("Observation Ledger migration metadata is not installed.");
  }
  return state.applied;
}

export function applyObservationLedgerMigrations(
  database: DatabaseSync,
  options: ApplyObservationLedgerMigrationsOptions,
): readonly AppliedObservationLedgerMigration[] {
  const migrations = options.migrations ?? DEFAULT_OBSERVATION_LEDGER_MIGRATIONS;
  assertMigrationSet(migrations);

  const initial = inspectMigrationState(database, migrations);
  const pending = migrations.slice(initial.applied.length);
  const beforeContext: ObservationLedgerMigrationValidationContext = {
    isNewDatabase: initial.isNewDatabase,
    migrations,
    applied: initial.applied,
    pending,
  };

  if (!initial.isNewDatabase) {
    options.validateBeforePending?.(beforeContext);
  }

  if (pending.length === 0) {
    options.validateAfterPending?.(beforeContext);
    return initial.applied;
  }

  let began = false;
  let phase: "begin" | "install" | "validate" | "commit" = "begin";
  let currentVersion = pending[0]?.version;
  try {
    database.exec("BEGIN IMMEDIATE");
    began = true;
    phase = "install";

    if (initial.isNewDatabase) {
      database.exec(OBSERVATION_LEDGER_MIGRATION_SCHEMA_SQL);
    }

    for (const migration of pending) {
      currentVersion = migration.version;
      const checksum = checksumObservationLedgerMigration(migration);
      const appliedAt = canonicalAppliedAt(
        options.clock.now(),
        migration.version,
        `Migration ${migration.version} clock value`,
      );
      database.exec(migration.sql);
      database
        .prepare(
          `INSERT INTO schema_migrations (version, name, checksum, applied_at)
           VALUES (?, ?, ?, ?)`,
        )
        .run(migration.version, migration.name, checksum, appliedAt);
    }

    const finalVersion = migrations.length;
    database.exec(`PRAGMA user_version = ${finalVersion}`);
    const result = assertObservationLedgerMigrationState(database, migrations);

    phase = "validate";
    options.validateAfterPending?.({
      isNewDatabase: initial.isNewDatabase,
      migrations,
      applied: result,
      pending,
    });

    phase = "commit";
    database.exec("COMMIT");
    began = false;
    return result;
  } catch (error) {
    if (began) {
      try {
        database.exec("ROLLBACK");
      } catch {
        // Preserve the primary install or validation failure.
      }
    }
    if (phase === "validate") throw error;
    if (error instanceof ObservationLedgerMigrationError) throw error;
    migrationError(
      phase === "commit"
        ? "Failed to commit Observation Ledger migrations."
        : `Failed to apply migration ${String(currentVersion)}.`,
      currentVersion,
      { cause: error },
    );
  }
}
