# SQLite Observation Ledger v1

`SqliteObservationLedgerV1` is the local append-only persistence boundary for already-normalized `NormalizedRuntimeEvent v1` facts. It stores Runtime evidence; it does not infer task success, create Cognition Observations, extract memory, or replace original events with Compaction or Snapshot projections.

## Source of truth

Every row stores the complete canonical `zhiwei-json-v1` event in `event_json`. Indexed columns are denormalized projections for identity, conflict detection and replay queries:

```text
event_id / idempotency_key / event_fingerprint
protocol_version
workspace_id / runtime_session_id / runtime_instance_id
source_adapter
runtime_implementation / runtime_version
source_surface / source_event_type
sequence_domain / source_sequence
observed_at
provenance / persistence / stability / compatibility
correlation_json / links_json / data_kind / data_json
event_json
```

A DB read succeeds only when all of the following hold:

1. `event_json` is valid JSON;
2. the public `parseNormalizedRuntimeEventV1()` accepts it as a self-contained event;
3. re-canonicalization produces exactly the stored `event_json` bytes;
4. SHA-256 matches `event_fingerprint`;
5. every denormalized column and JSON projection equals the parsed event.

Historical Trace context never repairs an invalid row. Opening a database validates every persisted row, and each write transaction repeats full-row validation before sequence or identity decisions so post-open projection drift cannot steer a new append. Trace-level Retry, Tool Result, Compaction and Session Replacement relationships remain the responsibility of the protocol Trace parser after replay.

## Append and conflict semantics

Identity is checked before source-sequence monotonicity so an older exact replay remains safe after later events have been persisted.

```text
same eventId + same idempotencyKey + same canonical event
  => existing row, inserted=false

same eventId + different idempotency/body
  => source-slot conflict

same idempotencyKey + different eventId/body
  => idempotency conflict

new identity + non-increasing sequence in its full source stream
  => sequence conflict

new identity + increasing sequence
  => append one new row
```

A source stream is the complete v1 identity:

```text
Workspace
Runtime Session
Runtime Instance
Adapter
Runtime implementation/version
Surface
sequence domain
```

`source.eventType` and semantic payload are body data, not source-stream identity. Independent streams may each begin at sequence 1; the Ledger creates no cross-domain total order.

`appendBatch()` parses every candidate, begins one `BEGIN IMMEDIATE` transaction, revalidates the installed Schema and every existing canonical row, then performs replay classification, sequence checks and inserts. An already-persisted exact-replay prefix may be followed by new events. Any later conflict or sequence failure rolls back every new row from that batch. Sequence decisions are derived from validated canonical events, never from unchecked projection-only queries.

## Replay

Workspace and Session replay order is SQLite `row_id ASC`, with an optional exclusive `afterRowId` cursor and bounded `limit`. Row IDs must be positive integers. Row ID is an ingestion cursor, not a Runtime global sequence and not a semantic time order. Every read first validates migration state, connection PRAGMAs, the Schema manifest, all rows, cross-row source-stream monotonicity and integrity so hidden or post-open corruption cannot produce a partial replay.

The Ledger preserves both durable boundaries and valid ephemeral/ignorable updates exactly as classified by the protocol. It never silently promotes, drops or rewrites their persistence semantics.

## SQLite operation

File databases use:

```text
PRAGMA journal_mode = WAL
PRAGMA synchronous = NORMAL
PRAGMA foreign_keys = ON
PRAGMA busy_timeout = 5000 (configurable)
PRAGMA trusted_schema = OFF
PRAGMA temp_store = MEMORY
```

`:memory:` databases keep SQLite's `memory` journal mode and are used only for focused tests. File restart tests are authoritative for durability and WAL behavior.

Every setting is read back on the actual connection. File databases require `journal_mode=wal`; memory databases require `journal_mode=memory`; `foreign_keys=1`, the exact requested `busy_timeout`, `synchronous=1` (`NORMAL`), `trusted_schema=0`, and `temp_store=2` (`MEMORY`) are mandatory. The public open API has no integrity-check bypass.

`PRAGMA integrity_check` must return exactly one row containing exactly `ok`.

## Installed Schema manifest

The database is not trusted merely because expected object names exist. Open and every write transaction compare the complete installed Schema with a reference Schema built from the immutable migration sources. The manifest covers:

- normalized `sqlite_schema.sql` for both tables, every explicit index, and every trigger;
- `PRAGMA table_xinfo` column order, affinity, nullability, defaults, primary-key and hidden flags;
- `PRAGMA table_list` `STRICT` state;
- `PRAGMA index_list` and `index_xinfo`, including auto-indexed event ID, idempotency and complete source-slot uniqueness;
- absence of unexpected user-defined tables, indexes, or triggers.

A same-name no-op trigger, quoted CHECK/RAISE literal drift, weakened CHECK/UNIQUE/STRICT table, changed index, missing guard, or extra mutating trigger is corruption. SQL signatures normalize comments, keyword case and unquoted whitespace only; quoted strings and identifiers remain byte-exact. Existing databases are never repaired with `CREATE ... IF NOT EXISTS`; migration metadata is created only for a provably empty database. Opening a damaged database must not modify its Schema.

## Migrations

Migration history stores:

```text
version
name
SHA-256(version + NUL + name + NUL + SQL)
applied_at
```

The public Ledger uses only module-private immutable migration sources; callers cannot replace them. The migration set must be the contiguous prefix `1..N`. Applied rows must be an exact prefix of the current immutable sources, every `applied_at` must be canonical UTC, and `PRAGMA user_version` must equal the latest applied version. Before pending migrations, the existing prefix is validated without mutation. Migration metadata, all pending DDL/history rows, `user_version`, final Schema/PRAGMA/row/integrity validation and commit form one `BEGIN IMMEDIATE` transaction; any failure rolls the complete pending installation back. Top-level PRAGMA and transaction-control SQL are forbidden in migration sources.

Changing an applied migration, deleting a known migration, introducing a version gap, changing history rows, removing or weakening migration-history guards, or changing `user_version` causes open, read and write boundaries to fail closed. Schema fixes are new forward migrations. A non-empty database without exact migration metadata is rejected rather than initialized or repaired. BEFORE INSERT replacement guards prevent `INSERT OR REPLACE` and `REPLACE` from deleting and replacing existing Runtime or migration rows even when an external connection leaves `recursive_triggers=0`.

## Crash and corruption behavior

A process that exits with an uncommitted event transaction leaves no replayable row after reopen. SQLite structural corruption fails `integrity_check`; protocol, canonicalization, hash, projection, PRAGMA or Schema-manifest corruption fails before the Ledger becomes writable. Operational SQLite failures at BEGIN, COMMIT, prepare, query, insert, integrity check or close are exposed as `ObservationLedgerError` with `code="sqlite"`; domain conflicts, sequence failures, migration failures and corruption retain their specific classes. Rollback failure never replaces the primary error.

## Runtime validation line

The supported execution line is Node.js 22.x. Exact-head CI records the resolved patch and runs the full real-`node:sqlite` suite; the initial bootstrap's Node.js 22.23.1 result is historical evidence only. A patch change is accepted only after the same HEAD passes the complete suite, rather than by assuming experimental API compatibility.

The Ledger does not persist raw Pi payloads, class instances, model reasoning, attachments, FTS/vector/graph projections or a derived replacement for original observations.
