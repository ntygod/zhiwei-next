/** Internal fixed v2 schema boundary; the public v1 ledger remains unchanged. */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { DatabaseSync, type SQLOutputValue } from "node:sqlite";
import {
  canonicalJsonV1, canonicalNormalizedRuntimeEventV1, parseNormalizedRuntimeEventV1,
  type NormalizedRuntimeEventV1, type NormalizedRuntimeSourceSurfaceV1,
} from "../../protocol/src/index.ts";
import {
  DEFAULT_OBSERVATION_LEDGER_MIGRATIONS, OBSERVATION_LEDGER_MIGRATION_SCHEMA_SQL,
  applyObservationLedgerMigrations, assertObservationLedgerMigrationSet,
  assertObservationLedgerMigrationState, ObservationLedgerMigrationError,
  type AppliedObservationLedgerMigration, type MigrationClock, type ObservationLedgerMigration,
} from "./migrations.ts";
import {
  ObservationLedgerCorruptionError, ObservationLedgerError,
  type RuntimeSourceStreamIdentityV1, type StoredRuntimeEventV1,
} from "./sqlite-observation-ledger.ts";
import { normalizeSqlSchemaSignature } from "./sqlite-schema-sql.ts";

const COGNITIVE_MIGRATIONS_V2: readonly ObservationLedgerMigration[] = Object.freeze([
  ...DEFAULT_OBSERVATION_LEDGER_MIGRATIONS,
  Object.freeze({
    version: 2,
    name: "cognitive-persistence-v2",
    sql: readFileSync(new URL("../migrations/0002_cognitive_persistence_v2.sql", import.meta.url), "utf8"),
  }),
]);

export interface CognitivePragmaSnapshotV2 {
  readonly journalMode: string;
  readonly foreignKeys: number;
  readonly busyTimeoutMs: number;
  readonly synchronous: number;
  readonly trustedSchema: number;
  readonly tempStore: number;
  readonly secureDelete: number;
}

export interface VerifiedCognitiveDatabaseV2 {
  readonly migrations: readonly AppliedObservationLedgerMigration[];
  readonly legacyRows: readonly StoredRuntimeEventV1[];
  readonly integrity: readonly string[];
}

interface RuntimeEventRow extends Record<string, SQLOutputValue> {
  row_id: number | bigint;
  event_id: string;
  idempotency_key: string;
  event_fingerprint: string;
  protocol_version: number | bigint;
  workspace_id: string;
  runtime_session_id: string;
  runtime_instance_id: string;
  source_adapter: string;
  runtime_implementation: string;
  runtime_version: string;
  source_surface: NormalizedRuntimeSourceSurfaceV1;
  source_event_type: string;
  sequence_domain: string;
  source_sequence: number | bigint;
  observed_at: string;
  provenance: NormalizedRuntimeEventV1["provenance"];
  persistence: NormalizedRuntimeEventV1["persistence"];
  stability: NormalizedRuntimeEventV1["stability"];
  compatibility: NormalizedRuntimeEventV1["compatibility"];
  correlation_json: string;
  links_json: string | null;
  data_kind: NormalizedRuntimeEventV1["data"]["kind"];
  data_json: string;
  event_json: string;
}

interface SchemaObjectManifest {
  readonly type: string;
  readonly name: string;
  readonly sql: string;
}

interface TableColumnManifest {
  readonly cid: number;
  readonly name: string;
  readonly type: string;
  readonly notNull: number;
  readonly defaultValue: unknown;
  readonly primaryKey: number;
  readonly hidden: number;
}

interface IndexColumnManifest {
  readonly sequence: number;
  readonly columnId: number;
  readonly name: string | null;
  readonly descending: number;
  readonly collation: string | null;
  readonly key: number;
}

interface IndexManifest {
  readonly name: string;
  readonly unique: number;
  readonly origin: string;
  readonly partial: number;
  readonly columns: readonly IndexColumnManifest[];
}

interface TableManifest {
  readonly name: string;
  readonly strict: number;
  readonly columns: readonly TableColumnManifest[];
  readonly indexes: readonly IndexManifest[];
}

interface ObservationLedgerSchemaManifest {
  readonly objects: readonly SchemaObjectManifest[];
  readonly tables: readonly TableManifest[];
}

const SELECT_COLUMNS = `
  row_id,
  event_id,
  idempotency_key,
  event_fingerprint,
  protocol_version,
  workspace_id,
  runtime_session_id,
  runtime_instance_id,
  source_adapter,
  runtime_implementation,
  runtime_version,
  source_surface,
  source_event_type,
  sequence_domain,
  source_sequence,
  observed_at,
  provenance,
  persistence,
  stability,
  compatibility,
  correlation_json,
  links_json,
  data_kind,
  data_json,
  event_json
`;

function toSafeInteger(
  value: number | bigint,
  label: string,
  rowId?: number,
): number {
  const converted = typeof value === "bigint" ? Number(value) : value;
  if (!Number.isSafeInteger(converted)) {
    throw new ObservationLedgerCorruptionError(
      `${label} is outside the JavaScript safe integer range: ${String(value)}.`,
      rowId,
    );
  }
  return converted;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function readPragmaScalar(
  database: DatabaseSync,
  sql: string,
  key: string,
): unknown {
  const row = database.prepare(sql).get() as Record<string, unknown> | undefined;
  if (!row || !(key in row)) {
    throw new ObservationLedgerCorruptionError(
      `${sql} did not return the required ${key} value.`,
    );
  }
  return row[key];
}

function readCognitivePragmaSnapshotV2(database: DatabaseSync): CognitivePragmaSnapshotV2 {
  const journalMode = String(
    readPragmaScalar(database, "PRAGMA journal_mode", "journal_mode"),
  ).toLowerCase();
  const foreignKeys = Number(
    readPragmaScalar(database, "PRAGMA foreign_keys", "foreign_keys"),
  );
  const busyTimeoutMs = Number(
    readPragmaScalar(database, "PRAGMA busy_timeout", "timeout"),
  );
  const synchronous = Number(
    readPragmaScalar(database, "PRAGMA synchronous", "synchronous"),
  );
  const trustedSchema = Number(
    readPragmaScalar(database, "PRAGMA trusted_schema", "trusted_schema"),
  );
  const tempStore = Number(
    readPragmaScalar(database, "PRAGMA temp_store", "temp_store"),
  );
  const secureDelete = Number(
    readPragmaScalar(database, "PRAGMA secure_delete", "secure_delete"),
  );
  return {
    journalMode,
    foreignKeys,
    busyTimeoutMs,
    synchronous,
    trustedSchema,
    tempStore,
    secureDelete,
  };
}

function requireCognitivePragmaSnapshotV2(
  actual: CognitivePragmaSnapshotV2,
  expected: CognitivePragmaSnapshotV2,
): void {
  for (const key of Object.keys(expected) as Array<keyof CognitivePragmaSnapshotV2>) {
    if (actual[key] !== expected[key]) {
      throw new ObservationLedgerCorruptionError(
        `SQLite PRAGMA ${key} differs from the required value ` +
          `(actual=${String(actual[key])}, expected=${String(expected[key])}).`,
      );
    }
  }
}

function parseJson(text: string, label: string, rowId: number): unknown {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new ObservationLedgerCorruptionError(
      `Row ${rowId} contains invalid ${label} JSON.`,
      rowId,
      { cause: error },
    );
  }
}

function expectProjection(
  condition: boolean,
  rowId: number,
  label: string,
  stored: unknown,
  eventValue: unknown,
): void {
  if (!condition) {
    throw new ObservationLedgerCorruptionError(
      `Row ${rowId} projection ${label} differs from event_json ` +
        `(stored=${String(stored)}, event=${String(eventValue)}).`,
      rowId,
    );
  }
}

function decodeRow(row: RuntimeEventRow): StoredRuntimeEventV1 {
  const rowId = toSafeInteger(row.row_id, "row_id");
  if (rowId < 1) {
    throw new ObservationLedgerCorruptionError(
      `Row cursor must be a positive integer; received ${rowId}.`,
      rowId,
    );
  }
  const parsedJson = parseJson(row.event_json, "event", rowId);
  let event: NormalizedRuntimeEventV1;
  try {
    event = parseNormalizedRuntimeEventV1(parsedJson);
  } catch (error) {
    throw new ObservationLedgerCorruptionError(
      `Row ${rowId} does not satisfy NormalizedRuntimeEvent v1.`,
      rowId,
      { cause: error },
    );
  }

  const canonicalEvent = canonicalNormalizedRuntimeEventV1(event);
  if (canonicalEvent !== row.event_json) {
    throw new ObservationLedgerCorruptionError(
      `Row ${rowId} event_json is valid but not canonical zhiwei-json-v1.`,
      rowId,
    );
  }
  const fingerprint = sha256(canonicalEvent);
  expectProjection(
    fingerprint === row.event_fingerprint,
    rowId,
    "event_fingerprint",
    row.event_fingerprint,
    fingerprint,
  );

  const sourceSequence = toSafeInteger(row.source_sequence, "source_sequence", rowId);
  const protocolVersion = toSafeInteger(row.protocol_version, "protocol_version", rowId);
  expectProjection(
    protocolVersion === event.protocolVersion,
    rowId,
    "protocol_version",
    protocolVersion,
    event.protocolVersion,
  );
  expectProjection(row.event_id === event.eventId, rowId, "event_id", row.event_id, event.eventId);
  expectProjection(
    row.idempotency_key === event.idempotencyKey,
    rowId,
    "idempotency_key",
    row.idempotency_key,
    event.idempotencyKey,
  );
  expectProjection(
    row.workspace_id === event.workspaceId,
    rowId,
    "workspace_id",
    row.workspace_id,
    event.workspaceId,
  );
  expectProjection(
    row.runtime_session_id === event.runtimeSessionId,
    rowId,
    "runtime_session_id",
    row.runtime_session_id,
    event.runtimeSessionId,
  );
  expectProjection(
    row.runtime_instance_id === event.runtimeInstanceId,
    rowId,
    "runtime_instance_id",
    row.runtime_instance_id,
    event.runtimeInstanceId,
  );
  expectProjection(
    row.source_adapter === event.source.adapter,
    rowId,
    "source_adapter",
    row.source_adapter,
    event.source.adapter,
  );
  expectProjection(
    row.runtime_implementation === event.source.runtime.implementation,
    rowId,
    "runtime_implementation",
    row.runtime_implementation,
    event.source.runtime.implementation,
  );
  expectProjection(
    row.runtime_version === event.source.runtime.version,
    rowId,
    "runtime_version",
    row.runtime_version,
    event.source.runtime.version,
  );
  expectProjection(
    row.source_surface === event.source.surface,
    rowId,
    "source_surface",
    row.source_surface,
    event.source.surface,
  );
  expectProjection(
    row.source_event_type === event.source.eventType,
    rowId,
    "source_event_type",
    row.source_event_type,
    event.source.eventType,
  );
  expectProjection(
    row.sequence_domain === event.sequence.domain,
    rowId,
    "sequence_domain",
    row.sequence_domain,
    event.sequence.domain,
  );
  expectProjection(
    sourceSequence === event.sequence.value,
    rowId,
    "source_sequence",
    sourceSequence,
    event.sequence.value,
  );
  expectProjection(
    row.observed_at === event.observedAt,
    rowId,
    "observed_at",
    row.observed_at,
    event.observedAt,
  );
  expectProjection(
    row.provenance === event.provenance,
    rowId,
    "provenance",
    row.provenance,
    event.provenance,
  );
  expectProjection(
    row.persistence === event.persistence,
    rowId,
    "persistence",
    row.persistence,
    event.persistence,
  );
  expectProjection(
    row.stability === event.stability,
    rowId,
    "stability",
    row.stability,
    event.stability,
  );
  expectProjection(
    row.compatibility === event.compatibility,
    rowId,
    "compatibility",
    row.compatibility,
    event.compatibility,
  );
  expectProjection(
    row.data_kind === event.data.kind,
    rowId,
    "data_kind",
    row.data_kind,
    event.data.kind,
  );

  const correlationJson = canonicalJsonV1(event.correlation);
  const linksJson = event.links === undefined ? null : canonicalJsonV1(event.links);
  const dataJson = canonicalJsonV1(event.data);
  expectProjection(
    row.correlation_json === correlationJson,
    rowId,
    "correlation_json",
    row.correlation_json,
    correlationJson,
  );
  expectProjection(
    row.links_json === linksJson,
    rowId,
    "links_json",
    row.links_json,
    linksJson,
  );
  expectProjection(
    row.data_json === dataJson,
    rowId,
    "data_json",
    row.data_json,
    dataJson,
  );

  return { rowId, fingerprint, event };
}

function sourceStreamIdentity(event: NormalizedRuntimeEventV1): RuntimeSourceStreamIdentityV1 {
  return {
    workspaceId: event.workspaceId,
    runtimeSessionId: event.runtimeSessionId,
    runtimeInstanceId: event.runtimeInstanceId,
    adapter: event.source.adapter,
    runtimeImplementation: event.source.runtime.implementation,
    runtimeVersion: event.source.runtime.version,
    surface: event.source.surface,
    sequenceDomain: event.sequence.domain,
  };
}

function formatSourceStream(stream: RuntimeSourceStreamIdentityV1): string {
  return [
    stream.workspaceId,
    stream.runtimeSessionId,
    stream.runtimeInstanceId,
    stream.adapter,
    `${stream.runtimeImplementation}@${stream.runtimeVersion}`,
    stream.surface,
    stream.sequenceDomain,
  ].join("/");
}

function integrityCheckRows(database: DatabaseSync): readonly string[] {
  const rows = database
    .prepare("PRAGMA integrity_check")
    .all() as Array<Record<string, unknown>>;
  return rows.map((row) => String(Object.values(row)[0]));
}

function requireIntegrity(database: DatabaseSync): readonly string[] {
  const result = integrityCheckRows(database);
  if (result.length !== 1 || result[0] !== "ok") {
    throw new ObservationLedgerCorruptionError(
      `SQLite integrity_check failed: ${result.join("; ") || "no result"}.`,
    );
  }
  return result;
}

function normalizeSchemaSql(sql: string | null): string {
  try {
    return normalizeSqlSchemaSignature(sql);
  } catch (error) {
    throw new ObservationLedgerCorruptionError(
      "Observation Ledger Schema SQL could not be tokenized.",
      undefined,
      { cause: error },
    );
  }
}

function captureIndexManifest(database: DatabaseSync, tableName: string): readonly IndexManifest[] {
  const rows = database
    .prepare(`PRAGMA main.index_list('${tableName.replaceAll("'", "''")}')`)
    .all() as Array<{
    readonly name: string;
    readonly unique: number | bigint;
    readonly origin: string;
    readonly partial: number | bigint;
  }>;
  return rows
    .map((row) => {
      const columns = database
        .prepare(`PRAGMA main.index_xinfo('${row.name.replaceAll("'", "''")}')`)
        .all() as Array<{
        readonly seqno: number | bigint;
        readonly cid: number | bigint;
        readonly name: string | null;
        readonly desc: number | bigint;
        readonly coll: string | null;
        readonly key: number | bigint;
      }>;
      return {
        name: row.name,
        unique: Number(row.unique),
        origin: row.origin,
        partial: Number(row.partial),
        columns: columns.map((column) => ({
          sequence: Number(column.seqno),
          columnId: Number(column.cid),
          name: column.name,
          descending: Number(column.desc),
          collation: column.coll,
          key: Number(column.key),
        })),
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}

function captureTableManifest(database: DatabaseSync, tableName: string): TableManifest {
  const table = database
    .prepare(`PRAGMA main.table_list('${tableName.replaceAll("'", "''")}')`)
    .get() as { readonly strict?: number | bigint } | undefined;
  if (!table) {
    throw new ObservationLedgerCorruptionError(
      `Observation Ledger table ${tableName} is missing.`,
    );
  }
  const columns = database
    .prepare(`PRAGMA main.table_xinfo('${tableName.replaceAll("'", "''")}')`)
    .all() as Array<{
    readonly cid: number | bigint;
    readonly name: string;
    readonly type: string;
    readonly notnull: number | bigint;
    readonly dflt_value: unknown;
    readonly pk: number | bigint;
    readonly hidden: number | bigint;
  }>;
  return {
    name: tableName,
    strict: Number(table.strict ?? 0),
    columns: columns.map((column) => ({
      cid: Number(column.cid),
      name: column.name,
      type: column.type.toUpperCase(),
      notNull: Number(column.notnull),
      defaultValue: column.dflt_value ?? null,
      primaryKey: Number(column.pk),
      hidden: Number(column.hidden),
    })),
    indexes: captureIndexManifest(database, tableName),
  };
}

function captureSchemaManifest(
  database: DatabaseSync,
  tableNames: readonly string[],
): ObservationLedgerSchemaManifest {
  const objects = database
    .prepare(
      `SELECT type, name, sql
       FROM sqlite_schema
       WHERE name NOT GLOB 'sqlite_*'
         AND type IN ('table', 'index', 'trigger', 'view')
       ORDER BY type ASC, name ASC`,
    )
    .all() as Array<{
    readonly type: string;
    readonly name: string;
    readonly sql: string | null;
  }>;
  return {
    objects: objects.map((row) => ({
      type: row.type,
      name: row.name,
      sql: normalizeSchemaSql(row.sql),
    })),
    tables: tableNames.map((tableName) =>
      captureTableManifest(database, tableName),
    ).sort((left, right) => left.name.localeCompare(right.name)),
  };
}

function requireSchemaManifest(
  database: DatabaseSync,
  expected: ObservationLedgerSchemaManifest,
): void {
  const actual = captureSchemaManifest(
    database,
    expected.tables.map((table) => table.name),
  );
  const expectedJson = JSON.stringify(expected);
  const actualJson = JSON.stringify(actual);
  if (actualJson !== expectedJson) {
    throw new ObservationLedgerCorruptionError(
      `Observation Ledger schema manifest has drifted ` +
        `(actual=${sha256(actualJson)}, expected=${sha256(expectedJson)}).`,
    );
  }
}

function validateAllRuntimeRows(database: DatabaseSync): StoredRuntimeEventV1[] {
  const rows = database
    .prepare(
      `SELECT ${SELECT_COLUMNS}
       FROM runtime_events
       ORDER BY row_id ASC`,
    )
    .all() as RuntimeEventRow[];
  const decoded = rows.map(decodeRow);
  const latestByStream = new Map<
    string,
    { readonly rowId: number; readonly sequence: number; readonly stream: RuntimeSourceStreamIdentityV1 }
  >();

  for (const stored of decoded) {
    const stream = sourceStreamIdentity(stored.event);
    const key = canonicalJsonV1(stream);
    const previous = latestByStream.get(key);
    if (
      previous !== undefined &&
      stored.event.sequence.value <= previous.sequence
    ) {
      throw new ObservationLedgerCorruptionError(
        `Row ${stored.rowId} source sequence ${stored.event.sequence.value} is not greater ` +
          `than earlier row ${previous.rowId} sequence ${previous.sequence} for ` +
          `${formatSourceStream(stream)}.`,
        stored.rowId,
        {
          previousRowId: previous.rowId,
          previousSourceSequence: previous.sequence,
          currentSourceSequence: stored.event.sequence.value,
          stream,
        },
      );
    }
    latestByStream.set(key, {
      rowId: stored.rowId,
      sequence: stored.event.sequence.value,
      stream,
    });
  }

  return decoded;
}


function safeSqliteBoundary<T>(message: string, work: () => T): T {
  try {
    return work();
  } catch (error) {
    if (error instanceof ObservationLedgerError || error instanceof ObservationLedgerMigrationError) throw error;
    throw new ObservationLedgerError("sqlite", message, { cause: error });
  }
}

/** Every real connection is configured and mechanically read back, never inferred. */
export function configureCognitiveDatabaseV2(
  database: DatabaseSync,
  options: { readonly filePath: string; readonly busyTimeoutMs: number },
): CognitivePragmaSnapshotV2 {
  if (!Number.isSafeInteger(options.busyTimeoutMs) || options.busyTimeoutMs < 0 || options.busyTimeoutMs > 2_147_483_647) {
    throw new ObservationLedgerError("invalid-query", "Invalid SQLite busy timeout.");
  }
  return safeSqliteBoundary("Could not configure cognitive SQLite persistence.", () => {
    database.exec("PRAGMA foreign_keys = ON");
    database.exec(`PRAGMA busy_timeout = ${options.busyTimeoutMs}`);
    database.exec("PRAGMA synchronous = FULL");
    database.exec("PRAGMA trusted_schema = OFF");
    database.exec("PRAGMA temp_store = MEMORY");
    database.exec("PRAGMA secure_delete = ON");
    if (options.filePath !== ":memory:") database.exec("PRAGMA journal_mode = WAL");
    const expected = Object.freeze({
      journalMode: options.filePath === ":memory:" ? "memory" : "wal",
      foreignKeys: 1,
      busyTimeoutMs: options.busyTimeoutMs,
      synchronous: 2,
      trustedSchema: 0,
      tempStore: 2,
      secureDelete: 1,
    });
    requireCognitivePragmaSnapshotV2(readCognitivePragmaSnapshotV2(database), expected);
    return expected;
  });
}

const expectedSchemas = new Map<number, ObservationLedgerSchemaManifest>();

function buildExpectedSchemaManifest(version: number): ObservationLedgerSchemaManifest {
  const cached = expectedSchemas.get(version);
  if (cached !== undefined) return cached;
  const migrations = COGNITIVE_MIGRATIONS_V2.slice(0, version);
  // Reject forbidden top-level transaction/PRAGMA SQL before executing reference DDL.
  if (migrations.length > 0) assertObservationLedgerMigrationSet(migrations);
  const reference = new DatabaseSync(":memory:");
  try {
    configureCognitiveDatabaseV2(reference, { filePath: ":memory:", busyTimeoutMs: 5_000 });
    // Only the module-owned fixed prefix is ever applied, including to references.
    if (migrations.length === 0) {
      reference.exec("BEGIN IMMEDIATE");
      reference.exec(OBSERVATION_LEDGER_MIGRATION_SCHEMA_SQL);
      if (!reference.isTransaction) throw new ObservationLedgerCorruptionError("Reference schema transaction ended unexpectedly.");
      reference.exec("COMMIT");
    } else {
      applyObservationLedgerMigrations(reference, {
        migrations,
        clock: { now: () => "2026-01-01T00:00:00.000Z" },
      });
    }
    const tableNames = reference.prepare(
      "SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT GLOB 'sqlite_*' ORDER BY name",
    ).all().map(row => String(row.name));
    const manifest = captureSchemaManifest(reference, tableNames);
    expectedSchemas.set(version, manifest);
    return manifest;
  } finally {
    reference.close();
  }
}

function verifyInstalledPrefix(
  database: DatabaseSync,
  expectedPragmas: CognitivePragmaSnapshotV2,
  version: number,
): VerifiedCognitiveDatabaseV2 {
  const migrations = assertObservationLedgerMigrationState(database, COGNITIVE_MIGRATIONS_V2);
  if (migrations.length !== version) {
    throw new ObservationLedgerCorruptionError("Cognitive persistence schema version is inconsistent.");
  }
  requireCognitivePragmaSnapshotV2(readCognitivePragmaSnapshotV2(database), expectedPragmas);
  requireSchemaManifest(database, buildExpectedSchemaManifest(version));
  const legacyRows = version > 0 ? validateAllRuntimeRows(database) : [];
  const integrity = requireIntegrity(database);
  if (database.prepare("PRAGMA foreign_key_check").all().length !== 0) {
    throw new ObservationLedgerCorruptionError("Cognitive persistence foreign-key integrity failed.");
  }
  return { migrations, legacyRows, integrity };
}

function inSnapshot<T>(database: DatabaseSync, read: () => T): T {
  // A caller's write transaction already supplies the exact snapshot to validate.
  if (safeSqliteBoundary("Could not inspect cognitive SQLite snapshot.", () => database.isTransaction)) return read();
  safeSqliteBoundary("Could not begin cognitive SQLite snapshot.", () => database.exec("BEGIN"));
  try {
    const result = read();
    if (!safeSqliteBoundary("Could not inspect cognitive SQLite snapshot.", () => database.isTransaction)) {
      throw new ObservationLedgerCorruptionError("Cognitive snapshot ended before validation completed.");
    }
    safeSqliteBoundary("Could not commit cognitive SQLite snapshot.", () => database.exec("COMMIT"));
    return result;
  } catch (error) {
    try { if (database.isTransaction) database.exec("ROLLBACK"); } catch { /* Preserve the primary error. */ }
    throw error;
  }
}

/** Forward migration and legacy validation are inseparable and use only fixed sources. */
export function applyCognitiveMigrationsV2(
  database: DatabaseSync,
  options: { readonly clock: MigrationClock; readonly expectedPragmas: CognitivePragmaSnapshotV2 },
): readonly AppliedObservationLedgerMigration[] {
  return safeSqliteBoundary("Could not migrate cognitive SQLite persistence.", () => {
    const migrations = applyObservationLedgerMigrations(database, {
      migrations: COGNITIVE_MIGRATIONS_V2,
      clock: options.clock,
      validateBeforePending: ({ applied }) => {
        inSnapshot(database, () => verifyInstalledPrefix(database, options.expectedPragmas, applied.length));
      },
      validateAfterPending: () => {
        inSnapshot(database, () => verifyInstalledPrefix(database, options.expectedPragmas, 2));
      },
    });
    withCognitiveSnapshotV2(database, options.expectedPragmas, () => undefined);
    return migrations;
  });
}

/** The caller must hold an explicit read/write snapshot before consuming verified rows. */
export function verifyCognitiveDatabaseV2(
  database: DatabaseSync,
  expectedPragmas: CognitivePragmaSnapshotV2,
): VerifiedCognitiveDatabaseV2 {
  return safeSqliteBoundary("Could not verify cognitive SQLite persistence.", () => {
    if (!database.isTransaction) throw new ObservationLedgerCorruptionError("Cognitive verification requires an explicit SQLite snapshot.");
    return verifyInstalledPrefix(database, expectedPragmas, 2);
  });
}

/** Validate and read through the same snapshot; a reader can add v2 row validation here. */
export function withCognitiveSnapshotV2<T>(
  database: DatabaseSync,
  expectedPragmas: CognitivePragmaSnapshotV2,
  reader: (verified: VerifiedCognitiveDatabaseV2) => T,
): T {
  // The callback belongs to the caller: preserve its domain/error category.
  return inSnapshot(database, () => reader(verifyCognitiveDatabaseV2(database, expectedPragmas)));
}
