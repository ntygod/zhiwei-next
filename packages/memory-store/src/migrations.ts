import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import type { DatabaseSync } from "node:sqlite";

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
    names.add(migration.name);
  }
}

function ensureMigrationTable(database: DatabaseSync): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      checksum TEXT NOT NULL CHECK (length(checksum) = 64),
      applied_at TEXT NOT NULL
    ) STRICT;

    CREATE TRIGGER IF NOT EXISTS schema_migrations_reject_update
    BEFORE UPDATE ON schema_migrations
    BEGIN
      SELECT RAISE(ABORT, 'schema_migrations is append-only');
    END;

    CREATE TRIGGER IF NOT EXISTS schema_migrations_reject_delete
    BEFORE DELETE ON schema_migrations
    BEGIN
      SELECT RAISE(ABORT, 'schema_migrations is append-only');
    END;
  `);
}

function safeInteger(value: number | bigint, label: string): number {
  const converted = typeof value === "bigint" ? Number(value) : value;
  if (!Number.isSafeInteger(converted)) {
    migrationError(`${label} is outside the JavaScript safe integer range.`);
  }
  return converted;
}

export function readAppliedObservationLedgerMigrations(
  database: DatabaseSync,
): readonly AppliedObservationLedgerMigration[] {
  ensureMigrationTable(database);
  const rows = database
    .prepare(
      `SELECT version, name, checksum, applied_at
       FROM schema_migrations
       ORDER BY version ASC`,
    )
    .all() as Array<{
    version: number | bigint;
    name: string;
    checksum: string;
    applied_at: string;
  }>;

  return rows.map((row) => ({
    version: safeInteger(row.version, "schema_migrations.version"),
    name: row.name,
    checksum: row.checksum,
    appliedAt: row.applied_at,
  }));
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

function canonicalAppliedAt(value: string, version: number): string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) ||
    !Number.isFinite(Date.parse(value))
  ) {
    migrationError(
      `Migration clock returned a non-canonical UTC timestamp: ${String(value)}.`,
      version,
    );
  }
  return value;
}

function readUserVersion(database: DatabaseSync): number {
  const row = database.prepare("PRAGMA user_version").get() as
    | { user_version?: number | bigint }
    | undefined;
  return safeInteger(row?.user_version ?? 0, "PRAGMA user_version");
}

export function applyObservationLedgerMigrations(
  database: DatabaseSync,
  options: {
    readonly migrations?: readonly ObservationLedgerMigration[];
    readonly clock: MigrationClock;
  },
): readonly AppliedObservationLedgerMigration[] {
  const migrations = options.migrations ?? DEFAULT_OBSERVATION_LEDGER_MIGRATIONS;
  assertMigrationSet(migrations);
  ensureMigrationTable(database);

  const applied = readAppliedObservationLedgerMigrations(database);
  validateAppliedPrefix(migrations, applied);
  const initialUserVersion = readUserVersion(database);
  const expectedInitialVersion = applied.at(-1)?.version ?? 0;
  if (initialUserVersion !== expectedInitialVersion) {
    migrationError(
      `PRAGMA user_version=${initialUserVersion} differs from immutable migration ` +
        `history version ${expectedInitialVersion}.`,
      initialUserVersion,
    );
  }

  for (const migration of migrations.slice(applied.length)) {
    const checksum = checksumObservationLedgerMigration(migration);
    const appliedAt = canonicalAppliedAt(options.clock.now(), migration.version);
    database.exec("BEGIN IMMEDIATE");
    try {
      database.exec(migration.sql);
      database
        .prepare(
          `INSERT INTO schema_migrations (version, name, checksum, applied_at)
           VALUES (?, ?, ?, ?)`,
        )
        .run(migration.version, migration.name, checksum, appliedAt);
      database.exec(`PRAGMA user_version = ${migration.version}`);
      database.exec("COMMIT");
    } catch (error) {
      try {
        database.exec("ROLLBACK");
      } catch {
        // Preserve the migration failure as the primary error.
      }
      migrationError(
        `Failed to apply migration ${migration.version} (${migration.name}).`,
        migration.version,
        { cause: error },
      );
    }
  }

  const result = readAppliedObservationLedgerMigrations(database);
  validateAppliedPrefix(migrations, result);
  const finalVersion = result.at(-1)?.version ?? 0;
  if (readUserVersion(database) !== finalVersion) {
    migrationError(
      `PRAGMA user_version differs from applied migration history after migration.`,
      finalVersion,
    );
  }
  return result;
}
