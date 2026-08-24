import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

import {
  NORMALIZED_RUNTIME_EVENT_PROTOCOL_VERSION,
  NORMALIZED_RUNTIME_SOURCE_SURFACES_V1,
  canonicalJsonV1,
  canonicalNormalizedRuntimeEventV1,
  parseNormalizedRuntimeEventV1,
  type NormalizedRuntimeEventV1,
  type NormalizedRuntimeSourceSurfaceV1,
} from "../../protocol/src/index.ts";
import {
  DEFAULT_OBSERVATION_LEDGER_MIGRATIONS,
  OBSERVATION_LEDGER_MIGRATION_SCHEMA_SQL,
  ObservationLedgerMigrationError,
  applyObservationLedgerMigrations,
  assertObservationLedgerMigrationState,
  type AppliedObservationLedgerMigration,
  type MigrationClock,
  type ObservationLedgerMigration,
} from "./migrations.ts";
import { normalizeSqlSchemaSignature } from "./sqlite-schema-sql.ts";

export type ObservationLedgerErrorCode =
  | "closed"
  | "conflict"
  | "sequence"
  | "corruption"
  | "invalid-query"
  | "sqlite";

export class ObservationLedgerError extends Error {
  readonly code: ObservationLedgerErrorCode;

  constructor(
    code: ObservationLedgerErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "ObservationLedgerError";
    this.code = code;
  }
}

export class ObservationLedgerClosedError extends ObservationLedgerError {
  constructor() {
    super("closed", "Observation Ledger is closed.");
    this.name = "ObservationLedgerClosedError";
  }
}

export type ObservationLedgerConflictKind =
  | "source-slot"
  | "idempotency-key"
  | "canonical-body";

export class ObservationLedgerConflictError extends ObservationLedgerError {
  readonly eventId: string;
  readonly idempotencyKey: string;
  readonly conflictKind: ObservationLedgerConflictKind;
  readonly existingRowId?: number;

  constructor(
    event: Pick<NormalizedRuntimeEventV1, "eventId" | "idempotencyKey">,
    conflictKind: ObservationLedgerConflictKind,
    message: string,
    options?: ErrorOptions & { readonly existingRowId?: number },
  ) {
    super("conflict", message, options);
    this.name = "ObservationLedgerConflictError";
    this.eventId = event.eventId;
    this.idempotencyKey = event.idempotencyKey;
    this.conflictKind = conflictKind;
    this.existingRowId = options?.existingRowId;
  }
}

export interface RuntimeSourceStreamIdentityV1 {
  readonly workspaceId: string;
  readonly runtimeSessionId: string;
  readonly runtimeInstanceId: string;
  readonly adapter: string;
  readonly runtimeImplementation: string;
  readonly runtimeVersion: string;
  readonly surface: NormalizedRuntimeSourceSurfaceV1;
  readonly sequenceDomain: string;
}

export class ObservationLedgerSequenceError extends ObservationLedgerError {
  readonly sourceSequence: number;
  readonly latestSourceSequence: number;
  readonly stream: RuntimeSourceStreamIdentityV1;

  constructor(event: NormalizedRuntimeEventV1, latestSourceSequence: number) {
    const stream = sourceStreamIdentity(event);
    super(
      "sequence",
      `Source sequence ${event.sequence.value} is not greater than persisted sequence ` +
        `${latestSourceSequence} for ${formatSourceStream(stream)}.`,
    );
    this.name = "ObservationLedgerSequenceError";
    this.sourceSequence = event.sequence.value;
    this.latestSourceSequence = latestSourceSequence;
    this.stream = stream;
  }
}

export class ObservationLedgerCorruptionError extends ObservationLedgerError {
  readonly rowId?: number;

  constructor(message: string, rowId?: number, options?: ErrorOptions) {
    super("corruption", message, options);
    this.name = "ObservationLedgerCorruptionError";
    this.rowId = rowId;
  }
}

export class ObservationLedgerQueryError extends ObservationLedgerError {
  constructor(message: string) {
    super("invalid-query", message);
    this.name = "ObservationLedgerQueryError";
  }
}

export interface OpenSqliteObservationLedgerOptions {
  readonly filePath: string;
  readonly busyTimeoutMs?: number;
  readonly clock?: MigrationClock;
}

export interface StoredRuntimeEventV1 {
  readonly rowId: number;
  readonly fingerprint: string;
  readonly event: NormalizedRuntimeEventV1;
}

export interface AppendRuntimeEventResultV1 extends StoredRuntimeEventV1 {
  readonly inserted: boolean;
}

export interface AppendRuntimeEventBatchResultV1 {
  readonly results: readonly AppendRuntimeEventResultV1[];
  readonly insertedCount: number;
  readonly replayedCount: number;
  readonly firstRowId?: number;
  readonly lastRowId?: number;
}

export interface RuntimeEventReplayOptionsV1 {
  readonly afterRowId?: number;
  readonly limit?: number;
  readonly sourceSurface?: NormalizedRuntimeSourceSurfaceV1;
}

interface RuntimeEventRow {
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

interface PragmaSnapshot {
  readonly journalMode: string;
  readonly foreignKeys: number;
  readonly busyTimeoutMs: number;
  readonly synchronous: number;
  readonly trustedSchema: number;
  readonly tempStore: number;
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

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1_000;
const DEFAULT_BUSY_TIMEOUT_MS = 5_000;
const SQLITE_SYNCHRONOUS_NORMAL = 1;
const SQLITE_TEMP_STORE_MEMORY = 2;
const SCHEMA_TABLES = ["runtime_events", "schema_migrations"] as const;

function defaultClock(): MigrationClock {
  return { now: () => new Date().toISOString() };
}

function assertNonEmpty(value: string, label: string): void {
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    value !== value.trim()
  ) {
    throw new ObservationLedgerQueryError(`${label} must be a trimmed non-empty string.`);
  }
}

function assertIntegerInRange(
  value: number,
  label: string,
  minimum: number,
  maximum: number,
): void {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new ObservationLedgerQueryError(
      `${label} must be a safe integer between ${minimum} and ${maximum}.`,
    );
  }
}

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

export function fingerprintNormalizedRuntimeEventV1(input: unknown): string {
  return sha256(canonicalNormalizedRuntimeEventV1(input));
}

function prepareFilePath(filePath: string): string {
  assertNonEmpty(filePath, "filePath");
  if (filePath === ":memory:") return filePath;
  const resolved = resolve(filePath);
  mkdirSync(dirname(resolved), { recursive: true });
  return resolved;
}

function isKnownLedgerError(error: unknown): boolean {
  return (
    error instanceof ObservationLedgerError ||
    error instanceof ObservationLedgerMigrationError
  );
}

function throwSqliteError(message: string, error: unknown): never {
  if (isKnownLedgerError(error)) throw error;
  throw new ObservationLedgerError("sqlite", message, { cause: error });
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

function readPragmaSnapshot(database: DatabaseSync): PragmaSnapshot {
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
  return {
    journalMode,
    foreignKeys,
    busyTimeoutMs,
    synchronous,
    trustedSchema,
    tempStore,
  };
}

function requirePragmaSnapshot(
  actual: PragmaSnapshot,
  expected: PragmaSnapshot,
): void {
  for (const key of Object.keys(expected) as Array<keyof PragmaSnapshot>) {
    if (actual[key] !== expected[key]) {
      throw new ObservationLedgerCorruptionError(
        `SQLite PRAGMA ${key} differs from the required value ` +
          `(actual=${String(actual[key])}, expected=${String(expected[key])}).`,
      );
    }
  }
}

function configureDatabase(
  database: DatabaseSync,
  options: { readonly filePath: string; readonly busyTimeoutMs: number },
): PragmaSnapshot {
  database.exec("PRAGMA foreign_keys = ON");
  database.exec(`PRAGMA busy_timeout = ${options.busyTimeoutMs}`);
  database.exec("PRAGMA synchronous = NORMAL");
  database.exec("PRAGMA trusted_schema = OFF");
  database.exec("PRAGMA temp_store = MEMORY");
  if (options.filePath !== ":memory:") {
    database.exec("PRAGMA journal_mode = WAL");
  }

  const expected: PragmaSnapshot = {
    journalMode: options.filePath === ":memory:" ? "memory" : "wal",
    foreignKeys: 1,
    busyTimeoutMs: options.busyTimeoutMs,
    synchronous: SQLITE_SYNCHRONOUS_NORMAL,
    trustedSchema: 0,
    tempStore: SQLITE_TEMP_STORE_MEMORY,
  };
  const actual = readPragmaSnapshot(database);
  requirePragmaSnapshot(actual, expected);
  return actual;
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

function sameSourceStream(
  event: NormalizedRuntimeEventV1,
  stream: RuntimeSourceStreamIdentityV1,
): boolean {
  return (
    event.workspaceId === stream.workspaceId &&
    event.runtimeSessionId === stream.runtimeSessionId &&
    event.runtimeInstanceId === stream.runtimeInstanceId &&
    event.source.adapter === stream.adapter &&
    event.source.runtime.implementation === stream.runtimeImplementation &&
    event.source.runtime.version === stream.runtimeVersion &&
    event.source.surface === stream.surface &&
    event.sequence.domain === stream.sequenceDomain
  );
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

function requireIntegrity(database: DatabaseSync): void {
  const result = integrityCheckRows(database);
  if (result.length !== 1 || result[0] !== "ok") {
    throw new ObservationLedgerCorruptionError(
      `SQLite integrity_check failed: ${result.join("; ") || "no result"}.`,
    );
  }
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
    .prepare(`PRAGMA index_list('${tableName}')`)
    .all() as Array<{
    readonly name: string;
    readonly unique: number | bigint;
    readonly origin: string;
    readonly partial: number | bigint;
  }>;
  return rows
    .map((row) => {
      const columns = database
        .prepare(`PRAGMA index_xinfo('${row.name}')`)
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
    .prepare(`PRAGMA table_list('${tableName}')`)
    .get() as { readonly strict?: number | bigint } | undefined;
  if (!table) {
    throw new ObservationLedgerCorruptionError(
      `Observation Ledger table ${tableName} is missing.`,
    );
  }
  const columns = database
    .prepare(`PRAGMA table_xinfo('${tableName}')`)
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
  tableNames: readonly string[] = SCHEMA_TABLES,
): ObservationLedgerSchemaManifest {
  const objects = database
    .prepare(
      `SELECT type, name, sql
       FROM sqlite_schema
       WHERE name NOT LIKE 'sqlite_%'
         AND type IN ('table', 'index', 'trigger')
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

function buildExpectedSchemaManifest(
  migrations: readonly ObservationLedgerMigration[],
): ObservationLedgerSchemaManifest {
  const reference = new DatabaseSync(":memory:");
  try {
    reference.exec(OBSERVATION_LEDGER_MIGRATION_SCHEMA_SQL);
    for (const migration of migrations) reference.exec(migration.sql);
    const tableNames =
      migrations.length === 0 ? (["schema_migrations"] as const) : SCHEMA_TABLES;
    return captureSchemaManifest(reference, tableNames);
  } finally {
    reference.close();
  }
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

function validateInstalledLedgerState(
  database: DatabaseSync,
  options: {
    readonly expectedPragmas: PragmaSnapshot;
    readonly expectedSchema: ObservationLedgerSchemaManifest;
    readonly migrations: readonly ObservationLedgerMigration[];
    readonly validateRuntimeRows: boolean;
  },
): StoredRuntimeEventV1[] {
  assertObservationLedgerMigrationState(database, options.migrations);
  requirePragmaSnapshot(readPragmaSnapshot(database), options.expectedPragmas);
  requireSchemaManifest(database, options.expectedSchema);
  const rows = options.validateRuntimeRows ? validateAllRuntimeRows(database) : [];
  requireIntegrity(database);
  return rows;
}

export class SqliteObservationLedgerV1 {
  readonly filePath: string;
  readonly journalMode: string;

  #database: DatabaseSync | undefined;
  readonly #expectedPragmas: PragmaSnapshot;
  readonly #expectedSchema: ObservationLedgerSchemaManifest;

  private constructor(
    database: DatabaseSync,
    options: {
      readonly filePath: string;
      readonly pragmas: PragmaSnapshot;
      readonly schema: ObservationLedgerSchemaManifest;
    },
  ) {
    this.#database = database;
    this.filePath = options.filePath;
    this.journalMode = options.pragmas.journalMode;
    this.#expectedPragmas = options.pragmas;
    this.#expectedSchema = options.schema;
  }

  static open(options: OpenSqliteObservationLedgerOptions): SqliteObservationLedgerV1 {
    const filePath = prepareFilePath(options.filePath);
    const busyTimeoutMs = options.busyTimeoutMs ?? DEFAULT_BUSY_TIMEOUT_MS;
    assertIntegerInRange(busyTimeoutMs, "busyTimeoutMs", 0, 2_147_483_647);
    const migrations = DEFAULT_OBSERVATION_LEDGER_MIGRATIONS;

    let database: DatabaseSync | undefined;
    try {
      database = new DatabaseSync(filePath);
      const pragmas = configureDatabase(database, { filePath, busyTimeoutMs });
      const schema = buildExpectedSchemaManifest(migrations);

      applyObservationLedgerMigrations(database, {
        migrations,
        clock: options.clock ?? defaultClock(),
        validateBeforePending: ({ applied }) => {
          const prefixSchema = buildExpectedSchemaManifest(
            migrations.slice(0, applied.length),
          );
          validateInstalledLedgerState(database!, {
            expectedPragmas: pragmas,
            expectedSchema: prefixSchema,
            migrations,
            validateRuntimeRows: applied.length > 0,
          });
        },
        validateAfterPending: () => {
          validateInstalledLedgerState(database!, {
            expectedPragmas: pragmas,
            expectedSchema: schema,
            migrations,
            validateRuntimeRows: true,
          });
        },
      });

      // Re-read every connection and persistence invariant after COMMIT.
      validateInstalledLedgerState(database, {
        expectedPragmas: pragmas,
        expectedSchema: schema,
        migrations,
        validateRuntimeRows: true,
      });
      return new SqliteObservationLedgerV1(database, { filePath, pragmas, schema });
    } catch (error) {
      if (database !== undefined) {
        try {
          database.close();
        } catch {
          // Preserve the opening failure.
        }
      }
      if (isKnownLedgerError(error)) throw error;
      throw new ObservationLedgerError(
        "sqlite",
        `Failed to open Observation Ledger at ${filePath}.`,
        { cause: error },
      );
    }
  }

  get isOpen(): boolean {
    return this.#database !== undefined;
  }

  get schemaVersion(): number {
    return this.appliedMigrations.at(-1)?.version ?? 0;
  }

  get appliedMigrations(): readonly AppliedObservationLedgerMigration[] {
    return this.#sqlite("Failed to read applied Observation Ledger migrations.", () =>
      assertObservationLedgerMigrationState(
        this.#requireDatabase(),
        DEFAULT_OBSERVATION_LEDGER_MIGRATIONS,
      ),
    );
  }

  close(): void {
    const database = this.#database;
    if (!database) return;
    this.#database = undefined;
    this.#sqliteWithDatabase(database, "Failed to close Observation Ledger.", () =>
      database.close(),
    );
  }

  append(input: unknown): AppendRuntimeEventResultV1 {
    const event = parseNormalizedRuntimeEventV1(input);
    return this.#transaction(() => {
      const rows = this.#validateWriteBoundary();
      return this.#appendOne(event, rows);
    });
  }

  appendBatch(inputs: readonly unknown[]): AppendRuntimeEventBatchResultV1 {
    this.#requireDatabase();
    if (!Array.isArray(inputs)) {
      throw new TypeError("appendBatch inputs must be an array.");
    }
    const events = inputs.map((input) => parseNormalizedRuntimeEventV1(input));
    if (events.length === 0) {
      return { results: [], insertedCount: 0, replayedCount: 0 };
    }

    return this.#transaction(() => {
      const rows = this.#validateWriteBoundary();
      const results = events.map((event) => this.#appendOne(event, rows));
      const insertedCount = results.filter((result) => result.inserted).length;
      const rowIds = results.map((result) => result.rowId);
      return {
        results,
        insertedCount,
        replayedCount: results.length - insertedCount,
        firstRowId: Math.min(...rowIds),
        lastRowId: Math.max(...rowIds),
      };
    });
  }

  getByEventId(eventId: string): StoredRuntimeEventV1 | undefined {
    assertNonEmpty(eventId, "eventId");
    this.#validateReadBoundary();
    const row = this.#sqlite(`Failed to read event ${eventId}.`, () =>
      this.#requireDatabase()
        .prepare(
          `SELECT ${SELECT_COLUMNS}
           FROM runtime_events
           WHERE event_id = ?`,
        )
        .get(eventId) as RuntimeEventRow | undefined,
    );
    return row === undefined ? undefined : decodeRow(row);
  }

  getByIdempotencyKey(idempotencyKey: string): StoredRuntimeEventV1 | undefined {
    assertNonEmpty(idempotencyKey, "idempotencyKey");
    this.#validateReadBoundary();
    const row = this.#sqlite(`Failed to read idempotency key ${idempotencyKey}.`, () =>
      this.#requireDatabase()
        .prepare(
          `SELECT ${SELECT_COLUMNS}
           FROM runtime_events
           WHERE idempotency_key = ?`,
        )
        .get(idempotencyKey) as RuntimeEventRow | undefined,
    );
    return row === undefined ? undefined : decodeRow(row);
  }

  readSession(
    workspaceId: string,
    runtimeSessionId: string,
    options: RuntimeEventReplayOptionsV1 = {},
  ): readonly StoredRuntimeEventV1[] {
    assertNonEmpty(workspaceId, "workspaceId");
    assertNonEmpty(runtimeSessionId, "runtimeSessionId");
    const { afterRowId, limit, sourceSurface } = this.#validateReplayOptions(options);
    this.#validateReadBoundary();
    const rows = this.#sqlite(
      `Failed to replay Workspace ${workspaceId} Runtime Session ${runtimeSessionId}.`,
      () =>
        this.#requireDatabase()
          .prepare(
            `SELECT ${SELECT_COLUMNS}
             FROM runtime_events
             WHERE workspace_id = ?
               AND runtime_session_id = ?
               AND row_id > ?
               AND (? IS NULL OR source_surface = ?)
             ORDER BY row_id ASC
             LIMIT ?`,
          )
          .all(
            workspaceId,
            runtimeSessionId,
            afterRowId,
            sourceSurface,
            sourceSurface,
            limit,
          ) as RuntimeEventRow[],
    );
    return rows.map(decodeRow);
  }

  readWorkspace(
    workspaceId: string,
    options: RuntimeEventReplayOptionsV1 = {},
  ): readonly StoredRuntimeEventV1[] {
    assertNonEmpty(workspaceId, "workspaceId");
    const { afterRowId, limit, sourceSurface } = this.#validateReplayOptions(options);
    this.#validateReadBoundary();
    const rows = this.#sqlite(`Failed to replay Workspace ${workspaceId}.`, () =>
      this.#requireDatabase()
        .prepare(
          `SELECT ${SELECT_COLUMNS}
           FROM runtime_events
           WHERE workspace_id = ?
             AND row_id > ?
             AND (? IS NULL OR source_surface = ?)
           ORDER BY row_id ASC
           LIMIT ?`,
        )
        .all(
          workspaceId,
          afterRowId,
          sourceSurface,
          sourceSurface,
          limit,
        ) as RuntimeEventRow[],
    );
    return rows.map(decodeRow);
  }

  countEvents(options: {
    readonly workspaceId?: string;
    readonly runtimeSessionId?: string;
  } = {}): number {
    const { workspaceId, runtimeSessionId } = options;
    if (runtimeSessionId !== undefined && workspaceId === undefined) {
      throw new ObservationLedgerQueryError("runtimeSessionId requires workspaceId.");
    }
    if (workspaceId !== undefined) assertNonEmpty(workspaceId, "workspaceId");
    if (runtimeSessionId !== undefined) {
      assertNonEmpty(runtimeSessionId, "runtimeSessionId");
    }
    this.#validateReadBoundary();

    const row = this.#sqlite("Failed to count Observation Ledger events.", () => {
      const database = this.#requireDatabase();
      if (workspaceId === undefined) {
        return database.prepare("SELECT count(*) AS count FROM runtime_events").get() as {
          count: number | bigint;
        };
      }
      if (runtimeSessionId === undefined) {
        return database
          .prepare("SELECT count(*) AS count FROM runtime_events WHERE workspace_id = ?")
          .get(workspaceId) as { count: number | bigint };
      }
      return database
        .prepare(
          `SELECT count(*) AS count
           FROM runtime_events
           WHERE workspace_id = ? AND runtime_session_id = ?`,
        )
        .get(workspaceId, runtimeSessionId) as { count: number | bigint };
    });
    return toSafeInteger(row.count, "count");
  }

  integrityCheck(): readonly string[] {
    return this.#sqlite("Failed to execute SQLite integrity_check.", () =>
      integrityCheckRows(this.#requireDatabase()),
    );
  }

  assertIntegrity(): void {
    this.#sqlite("Failed to assert SQLite integrity.", () =>
      requireIntegrity(this.#requireDatabase()),
    );
  }

  #requireDatabase(): DatabaseSync {
    if (!this.#database) throw new ObservationLedgerClosedError();
    return this.#database;
  }

  #sqlite<T>(message: string, operation: () => T): T {
    return this.#sqliteWithDatabase(this.#requireDatabase(), message, operation);
  }

  #sqliteWithDatabase<T>(
    _database: DatabaseSync,
    message: string,
    operation: () => T,
  ): T {
    try {
      return operation();
    } catch (error) {
      throwSqliteError(message, error);
    }
  }

  #transaction<T>(operation: () => T): T {
    const database = this.#requireDatabase();
    let began = false;
    try {
      this.#sqlite("Failed to begin Observation Ledger transaction.", () =>
        database.exec("BEGIN IMMEDIATE"),
      );
      began = true;
      const result = operation();
      this.#sqlite("Failed to commit Observation Ledger transaction.", () =>
        database.exec("COMMIT"),
      );
      began = false;
      return result;
    } catch (error) {
      if (began) {
        try {
          database.exec("ROLLBACK");
        } catch {
          // Preserve the primary failure.
        }
      }
      if (isKnownLedgerError(error)) throw error;
      throw new ObservationLedgerError(
        "sqlite",
        "Observation Ledger transaction failed.",
        { cause: error },
      );
    }
  }

  #validateReadBoundary(): void {
    this.#sqlite("Failed to validate Observation Ledger read boundary.", () => {
      const database = this.#requireDatabase();
      assertObservationLedgerMigrationState(
        database,
        DEFAULT_OBSERVATION_LEDGER_MIGRATIONS,
      );
      requirePragmaSnapshot(readPragmaSnapshot(database), this.#expectedPragmas);
      requireSchemaManifest(database, this.#expectedSchema);
      validateAllRuntimeRows(database);
      requireIntegrity(database);
    });
  }

  #validateWriteBoundary(): StoredRuntimeEventV1[] {
    return this.#sqlite("Failed to validate Observation Ledger write boundary.", () => {
      const database = this.#requireDatabase();
      assertObservationLedgerMigrationState(
        database,
        DEFAULT_OBSERVATION_LEDGER_MIGRATIONS,
      );
      requirePragmaSnapshot(readPragmaSnapshot(database), this.#expectedPragmas);
      requireSchemaManifest(database, this.#expectedSchema);
      const rows = validateAllRuntimeRows(database);
      requireIntegrity(database);
      return rows;
    });
  }

  #appendOne(
    event: NormalizedRuntimeEventV1,
    validatedRows: StoredRuntimeEventV1[],
  ): AppendRuntimeEventResultV1 {
    const database = this.#requireDatabase();
    const canonicalEvent = canonicalNormalizedRuntimeEventV1(event);
    const fingerprint = sha256(canonicalEvent);
    const existingRows = validatedRows.filter(
      (stored) =>
        stored.event.eventId === event.eventId ||
        stored.event.idempotencyKey === event.idempotencyKey,
    );

    if (existingRows.length > 1) {
      throw new ObservationLedgerCorruptionError(
        `Event identity ${event.eventId}/${event.idempotencyKey} resolves to multiple rows.`,
      );
    }
    if (existingRows.length === 1) {
      const stored = existingRows[0];
      if (stored.event.eventId !== event.eventId) {
        throw new ObservationLedgerConflictError(
          event,
          "idempotency-key",
          `Idempotency key ${event.idempotencyKey} is already bound to event ` +
            `${stored.event.eventId} at row ${stored.rowId}.`,
          { existingRowId: stored.rowId },
        );
      }
      if (stored.event.idempotencyKey !== event.idempotencyKey) {
        throw new ObservationLedgerConflictError(
          event,
          "source-slot",
          `Source slot ${event.eventId} is already bound to idempotency key ` +
            `${stored.event.idempotencyKey} at row ${stored.rowId}.`,
          { existingRowId: stored.rowId },
        );
      }
      if (
        stored.fingerprint !== fingerprint ||
        canonicalNormalizedRuntimeEventV1(stored.event) !== canonicalEvent
      ) {
        throw new ObservationLedgerConflictError(
          event,
          "canonical-body",
          `Exact identity replay differs from canonical body at row ${stored.rowId}.`,
          { existingRowId: stored.rowId },
        );
      }
      return { ...stored, inserted: false };
    }

    const stream = sourceStreamIdentity(event);
    const latestSequence = validatedRows
      .filter((stored) => sameSourceStream(stored.event, stream))
      .reduce(
        (latest, stored) => Math.max(latest, stored.event.sequence.value),
        0,
      );
    if (latestSequence > 0 && event.sequence.value <= latestSequence) {
      throw new ObservationLedgerSequenceError(event, latestSequence);
    }

    const correlationJson = canonicalJsonV1(event.correlation);
    const linksJson = event.links === undefined ? null : canonicalJsonV1(event.links);
    const dataJson = canonicalJsonV1(event.data);
    try {
      database
        .prepare(
          `INSERT INTO runtime_events (
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
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          event.eventId,
          event.idempotencyKey,
          fingerprint,
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
          correlationJson,
          linksJson,
          event.data.kind,
          dataJson,
          canonicalEvent,
        );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/UNIQUE constraint failed|SQLITE_CONSTRAINT/u.test(message)) {
        const conflictKind: ObservationLedgerConflictKind =
          /idempotency_key/u.test(message) ? "idempotency-key" : "source-slot";
        throw new ObservationLedgerConflictError(
          event,
          conflictKind,
          `SQLite rejected a conflicting identity or source slot for ${event.eventId}.`,
          { cause: error },
        );
      }
      throwSqliteError(`SQLite rejected event ${event.eventId}.`, error);
    }

    const inserted = this.#sqlite(`Failed to read back inserted event ${event.eventId}.`, () =>
      database
        .prepare(
          `SELECT ${SELECT_COLUMNS}
           FROM runtime_events
           WHERE event_id = ?`,
        )
        .get(event.eventId) as RuntimeEventRow | undefined,
    );
    if (inserted === undefined) {
      throw new ObservationLedgerCorruptionError(
        `Inserted event ${event.eventId} could not be read back in its transaction.`,
      );
    }
    const stored = decodeRow(inserted);
    validatedRows.push(stored);
    return { ...stored, inserted: true };
  }

  #validateReplayOptions(options: RuntimeEventReplayOptionsV1): {
    afterRowId: number;
    limit: number;
    sourceSurface: NormalizedRuntimeSourceSurfaceV1 | null;
  } {
    if (options === null || typeof options !== "object" || Array.isArray(options)) {
      throw new ObservationLedgerQueryError("Replay options must be an object.");
    }
    const afterRowId = options.afterRowId ?? 0;
    const limit = options.limit ?? DEFAULT_LIMIT;
    assertIntegerInRange(afterRowId, "afterRowId", 0, Number.MAX_SAFE_INTEGER);
    assertIntegerInRange(limit, "limit", 1, MAX_LIMIT);
    if (
      options.sourceSurface !== undefined &&
      !NORMALIZED_RUNTIME_SOURCE_SURFACES_V1.includes(options.sourceSurface)
    ) {
      throw new ObservationLedgerQueryError(
        `Unknown sourceSurface: ${String(options.sourceSurface)}.`,
      );
    }
    return {
      afterRowId,
      limit,
      sourceSurface: options.sourceSurface ?? null,
    };
  }
}

export function openSqliteObservationLedgerV1(
  options: OpenSqliteObservationLedgerOptions,
): SqliteObservationLedgerV1 {
  return SqliteObservationLedgerV1.open(options);
}

export const OBSERVATION_LEDGER_PROTOCOL_VERSION =
  NORMALIZED_RUNTIME_EVENT_PROTOCOL_VERSION;
