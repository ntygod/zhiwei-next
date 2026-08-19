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

Historical Trace context never repairs an invalid row. Trace-level Retry, Tool Result, Compaction and Session Replacement relationships remain the responsibility of the protocol Trace parser after replay.

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

`appendBatch()` parses every candidate, then performs replay classification, sequence checks and inserts in one `BEGIN IMMEDIATE` transaction. An already-persisted exact-replay prefix may be followed by new events. Any later conflict or sequence failure rolls back every new row from that batch.

## Replay

Workspace and Session replay order is SQLite `row_id ASC`, with an optional exclusive `afterRowId` cursor and bounded `limit`. Row ID is an ingestion cursor, not a Runtime global sequence and not a semantic time order.

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

`PRAGMA integrity_check` must return exactly `ok`. UPDATE and DELETE triggers make both `runtime_events` and `schema_migrations` append-only at the SQL boundary.

## Migrations

Migration history stores:

```text
version
name
SHA-256(version + NUL + name + NUL + SQL)
applied_at
```

The migration set must be the contiguous prefix `1..N`. Applied rows must be an exact prefix of the current immutable sources, and `PRAGMA user_version` must equal the latest applied version. Each migration runs in its own `BEGIN IMMEDIATE` transaction; a failing migration leaves neither partial schema nor a migration record.

Changing an applied migration, deleting a known migration, introducing a version gap, changing history rows or changing `user_version` causes open to fail closed. Schema fixes are new forward migrations.

## Crash and corruption behavior

A process that exits with an uncommitted event transaction leaves no replayable row after reopen. SQLite structural corruption fails `integrity_check`; protocol, canonicalization, hash or projection corruption fails row decoding.

The Ledger does not persist raw Pi payloads, class instances, model reasoning, attachments, FTS/vector/graph projections or a derived replacement for original observations.
