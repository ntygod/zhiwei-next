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
  ObservationLedgerMigrationError,
  applyObservationLedgerMigrations,
  readAppliedObservationLedgerMigrations,
  type AppliedObservationLedgerMigration,
  type MigrationClock,
  type ObservationLedgerMigration,
} from "./migrations.ts";

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
  readonly migrations?: readonly ObservationLedgerMigration[];
  /** Defaults to true. Disable only in focused migration tests. */
  readonly verifyIntegrityOnOpen?: boolean;
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

function configureDatabase(
  database: DatabaseSync,
  options: { readonly filePath: string; readonly busyTimeoutMs: number },
): string {
  database.exec("PRAGMA foreign_keys = ON");
  database.exec(`PRAGMA busy_timeout = ${options.busyTimeoutMs}`);
  database.exec("PRAGMA synchronous = NORMAL");
  database.exec("PRAGMA trusted_schema = OFF");
  database.exec("PRAGMA temp_store = MEMORY");
  if (options.filePath !== ":memory:") {
    database.exec("PRAGMA journal_mode = WAL");
  }
  const row = database.prepare("PRAGMA journal_mode").get() as
    | { journal_mode?: string }
    | undefined;
  return String(row?.journal_mode ?? "unknown").toLowerCase();
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
  expectProjection(protocolVersion === event.protocolVersion, rowId, "protocol_version", protocolVersion, event.protocolVersion);
  expectProjection(row.event_id === event.eventId, rowId, "event_id", row.event_id, event.eventId);
  expectProjection(row.idempotency_key === event.idempotencyKey, rowId, "idempotency_key", row.idempotency_key, event.idempotencyKey);
  expectProjection(row.workspace_id === event.workspaceId, rowId, "workspace_id", row.workspace_id, event.workspaceId);
  expectProjection(row.runtime_session_id === event.runtimeSessionId, rowId, "runtime_session_id", row.runtime_session_id, event.runtimeSessionId);
  expectProjection(row.runtime_instance_id === event.runtimeInstanceId, rowId, "runtime_instance_id", row.runtime_instance_id, event.runtimeInstanceId);
  expectProjection(row.source_adapter === event.source.adapter, rowId, "source_adapter", row.source_adapter, event.source.adapter);
  expectProjection(
    row.runtime_implementation === event.source.runtime.implementation,
    rowId,
    "runtime_implementation",
    row.runtime_implementation,
    event.source.runtime.implementation,
  );
  expectProjection(row.runtime_version === event.source.runtime.version, rowId, "runtime_version", row.runtime_version, event.source.runtime.version);
  expectProjection(row.source_surface === event.source.surface, rowId, "source_surface", row.source_surface, event.source.surface);
  expectProjection(row.source_event_type === event.source.eventType, rowId, "source_event_type", row.source_event_type, event.source.eventType);
  expectProjection(row.sequence_domain === event.sequence.domain, rowId, "sequence_domain", row.sequence_domain, event.sequence.domain);
  expectProjection(sourceSequence === event.sequence.value, rowId, "source_sequence", sourceSequence, event.sequence.value);
  expectProjection(row.observed_at === event.observedAt, rowId, "observed_at", row.observed_at, event.observedAt);
  expectProjection(row.provenance === event.provenance, rowId, "provenance", row.provenance, event.provenance);
  expectProjection(row.persistence === event.persistence, rowId, "persistence", row.persistence, event.persistence);
  expectProjection(row.stability === event.stability, rowId, "stability", row.stability, event.stability);
  expectProjection(row.compatibility === event.compatibility, rowId, "compatibility", row.compatibility, event.compatibility);
  expectProjection(row.data_kind === event.data.kind, rowId, "data_kind", row.data_kind, event.data.kind);

  const correlationJson = canonicalJsonV1(event.correlation);
  const linksJson = event.links === undefined ? null : canonicalJsonV1(event.links);
  const dataJson = canonicalJsonV1(event.data);
  expectProjection(row.correlation_json === correlationJson, rowId, "correlation_json", row.correlation_json, correlationJson);
  expectProjection(row.links_json === linksJson, rowId, "links_json", row.links_json, linksJson);
  expectProjection(row.data_json === dataJson, rowId, "data_json", row.data_json, dataJson);

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

function requireIntegrity(database: DatabaseSync): void {
  const result = integrityCheckRows(database);
  if (result.length !== 1 || result[0] !== "ok") {
    throw new ObservationLedgerCorruptionError(
      `SQLite integrity_check failed: ${result.join("; ") || "no result"}.`,
    );
  }
}

function requireAppendOnlySchema(database: DatabaseSync): void {
  const requiredObjects = new Map([
    ["table:runtime_events", false],
    ["table:schema_migrations", false],
    ["trigger:runtime_events_reject_update", false],
    ["trigger:runtime_events_reject_delete", false],
    ["trigger:schema_migrations_reject_update", false],
    ["trigger:schema_migrations_reject_delete", false],
  ]);
  const rows = database
    .prepare(
      `SELECT type, name
       FROM sqlite_schema
       WHERE (type = 'table' OR type = 'trigger')`,
    )
    .all() as Array<{ type: string; name: string }>;
  for (const row of rows) {
    const key = `${row.type}:${row.name}`;
    if (requiredObjects.has(key)) requiredObjects.set(key, true);
  }
  const missing = [...requiredObjects]
    .filter(([, present]) => !present)
    .map(([key]) => key);
  if (missing.length > 0) {
    throw new ObservationLedgerCorruptionError(
      `Observation Ledger append-only schema objects are missing: ${missing.join(", ")}.`,
    );
  }
}

export class SqliteObservationLedgerV1 {
  readonly filePath: string;
  readonly journalMode: string;

  #database: DatabaseSync | undefined;

  private constructor(
    database: DatabaseSync,
    options: { readonly filePath: string; readonly journalMode: string },
  ) {
    this.#database = database;
    this.filePath = options.filePath;
    this.journalMode = options.journalMode;
  }

  static open(options: OpenSqliteObservationLedgerOptions): SqliteObservationLedgerV1 {
    const filePath = prepareFilePath(options.filePath);
    const busyTimeoutMs = options.busyTimeoutMs ?? DEFAULT_BUSY_TIMEOUT_MS;
    assertIntegerInRange(busyTimeoutMs, "busyTimeoutMs", 0, 2_147_483_647);

    const database = new DatabaseSync(filePath);
    try {
      const journalMode = configureDatabase(database, { filePath, busyTimeoutMs });
      applyObservationLedgerMigrations(database, {
        migrations: options.migrations ?? DEFAULT_OBSERVATION_LEDGER_MIGRATIONS,
        clock: options.clock ?? defaultClock(),
      });
      requireAppendOnlySchema(database);
      if (options.verifyIntegrityOnOpen !== false) requireIntegrity(database);
      return new SqliteObservationLedgerV1(database, { filePath, journalMode });
    } catch (error) {
      try {
        database.close();
      } catch {
        // Preserve the opening failure.
      }
      if (
        error instanceof ObservationLedgerMigrationError ||
        error instanceof ObservationLedgerError
      ) {
        throw error;
      }
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
    return readAppliedObservationLedgerMigrations(this.#requireDatabase());
  }

  close(): void {
    const database = this.#database;
    if (!database) return;
    this.#database = undefined;
    database.close();
  }

  append(input: unknown): AppendRuntimeEventResultV1 {
    const event = parseNormalizedRuntimeEventV1(input);
    return this.#transaction(() => this.#appendOne(event));
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
      const results = events.map((event) => this.#appendOne(event));
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
    const row = this.#requireDatabase()
      .prepare(
        `SELECT ${SELECT_COLUMNS}
         FROM runtime_events
         WHERE event_id = ?`,
      )
      .get(eventId) as RuntimeEventRow | undefined;
    return row === undefined ? undefined : decodeRow(row);
  }

  getByIdempotencyKey(idempotencyKey: string): StoredRuntimeEventV1 | undefined {
    assertNonEmpty(idempotencyKey, "idempotencyKey");
    const row = this.#requireDatabase()
      .prepare(
        `SELECT ${SELECT_COLUMNS}
         FROM runtime_events
         WHERE idempotency_key = ?`,
      )
      .get(idempotencyKey) as RuntimeEventRow | undefined;
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
    const rows = this.#requireDatabase()
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
      ) as RuntimeEventRow[];
    return rows.map(decodeRow);
  }

  readWorkspace(
    workspaceId: string,
    options: RuntimeEventReplayOptionsV1 = {},
  ): readonly StoredRuntimeEventV1[] {
    assertNonEmpty(workspaceId, "workspaceId");
    const { afterRowId, limit, sourceSurface } = this.#validateReplayOptions(options);
    const rows = this.#requireDatabase()
      .prepare(
        `SELECT ${SELECT_COLUMNS}
         FROM runtime_events
         WHERE workspace_id = ?
           AND row_id > ?
           AND (? IS NULL OR source_surface = ?)
         ORDER BY row_id ASC
         LIMIT ?`,
      )
      .all(workspaceId, afterRowId, sourceSurface, sourceSurface, limit) as RuntimeEventRow[];
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

    const database = this.#requireDatabase();
    let row: { count: number | bigint };
    if (workspaceId === undefined) {
      row = database.prepare("SELECT count(*) AS count FROM runtime_events").get() as {
        count: number | bigint;
      };
    } else if (runtimeSessionId === undefined) {
      row = database
        .prepare("SELECT count(*) AS count FROM runtime_events WHERE workspace_id = ?")
        .get(workspaceId) as { count: number | bigint };
    } else {
      row = database
        .prepare(
          `SELECT count(*) AS count
           FROM runtime_events
           WHERE workspace_id = ? AND runtime_session_id = ?`,
        )
        .get(workspaceId, runtimeSessionId) as { count: number | bigint };
    }
    return toSafeInteger(row.count, "count");
  }

  integrityCheck(): readonly string[] {
    return integrityCheckRows(this.#requireDatabase());
  }

  assertIntegrity(): void {
    requireIntegrity(this.#requireDatabase());
  }

  #requireDatabase(): DatabaseSync {
    if (!this.#database) throw new ObservationLedgerClosedError();
    return this.#database;
  }

  #transaction<T>(operation: () => T): T {
    const database = this.#requireDatabase();
    database.exec("BEGIN IMMEDIATE");
    try {
      const result = operation();
      database.exec("COMMIT");
      return result;
    } catch (error) {
      try {
        database.exec("ROLLBACK");
      } catch {
        // Preserve the original failure.
      }
      throw error;
    }
  }

  #appendOne(event: NormalizedRuntimeEventV1): AppendRuntimeEventResultV1 {
    const database = this.#requireDatabase();
    const canonicalEvent = canonicalNormalizedRuntimeEventV1(event);
    const fingerprint = sha256(canonicalEvent);
    const existingRows = database
      .prepare(
        `SELECT ${SELECT_COLUMNS}
         FROM runtime_events
         WHERE event_id = ? OR idempotency_key = ?
         ORDER BY row_id ASC`,
      )
      .all(event.eventId, event.idempotencyKey) as RuntimeEventRow[];

    if (existingRows.length > 1) {
      throw new ObservationLedgerCorruptionError(
        `Event identity ${event.eventId}/${event.idempotencyKey} resolves to multiple rows.`,
      );
    }
    if (existingRows.length === 1) {
      const stored = decodeRow(existingRows[0]);
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
    const latest = database
      .prepare(
        `SELECT source_sequence
         FROM runtime_events
         WHERE workspace_id = ?
           AND runtime_session_id = ?
           AND runtime_instance_id = ?
           AND source_adapter = ?
           AND runtime_implementation = ?
           AND runtime_version = ?
           AND source_surface = ?
           AND sequence_domain = ?
         ORDER BY source_sequence DESC
         LIMIT 1`,
      )
      .get(
        stream.workspaceId,
        stream.runtimeSessionId,
        stream.runtimeInstanceId,
        stream.adapter,
        stream.runtimeImplementation,
        stream.runtimeVersion,
        stream.surface,
        stream.sequenceDomain,
      ) as { source_sequence: number | bigint } | undefined;

    if (latest !== undefined) {
      const latestSequence = toSafeInteger(latest.source_sequence, "latest source_sequence");
      if (event.sequence.value <= latestSequence) {
        throw new ObservationLedgerSequenceError(event, latestSequence);
      }
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
      if (/UNIQUE constraint failed|SQLITE_CONSTRAINT/.test(message)) {
        throw new ObservationLedgerConflictError(
          event,
          "source-slot",
          `SQLite rejected a conflicting identity or source slot for ${event.eventId}.`,
          { cause: error },
        );
      }
      throw new ObservationLedgerError(
        "sqlite",
        `SQLite rejected event ${event.eventId}.`,
        { cause: error },
      );
    }

    const inserted = database
      .prepare(
        `SELECT ${SELECT_COLUMNS}
         FROM runtime_events
         WHERE event_id = ?`,
      )
      .get(event.eventId) as RuntimeEventRow | undefined;
    if (inserted === undefined) {
      throw new ObservationLedgerCorruptionError(
        `Inserted event ${event.eventId} could not be read back in its transaction.`,
      );
    }
    return { ...decodeRow(inserted), inserted: true };
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
