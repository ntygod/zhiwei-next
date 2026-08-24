# ADR 0006: Use node:sqlite for the append-only Observation Ledger v1

- Status: Accepted
- Date: 2026-08-18
- Risk: R2

## Context

`NormalizedRuntimeEvent v1` is now the merged Runtime-neutral boundary. M0 needs a real local Ledger that survives restart, rejects replay conflicts and out-of-order source facts, preserves Workspace/Session isolation, and makes migration history immutable without introducing a native third-party driver or lock-file change.

The fixed Runtime validation environment is Node.js 22.23.1, which exposes `node:sqlite`. The implementation must prove this dynamically rather than assume API availability.

## Decision

Use synchronous `node:sqlite` `DatabaseSync` inside `packages/memory-store` for Observation Ledger v1.

- The complete canonical protocol event is the row truth; indexed columns are checked projections.
- Writes use `BEGIN IMMEDIATE`; batch append is all-or-nothing.
- Exact replay is handled before full-source-stream monotonicity.
- File databases use WAL, `synchronous=NORMAL`, foreign keys, busy timeout and integrity checks.
- Migration sources are versioned SQL files whose version/name/SHA-256 are stored in an append-only history table.
- Reads invoke the public single-event v1 parser and recheck canonical bytes, hash and every projection.
- Trace-level relationship validation remains separate and may be applied to replayed sequences by consumers.
- A temporary exact-runtime CI proof may be used during delivery, but no long-lived workflow or third-party SQLite dependency is required.

## Consequences

The Ledger has deterministic synchronous transaction semantics and no native addon lifecycle. Database access must remain behind the memory-store API so later asynchronous scheduling or Worker isolation can be introduced without changing the v1 row contract.

The schema deliberately includes Runtime Instance, Adapter, Runtime implementation/version, Surface and sequence domain. The older prototype scope of only Workspace/Session/Surface is invalid for the merged protocol and is not migrated forward.

Both durable and ephemeral protocol events can be stored losslessly; their `persistence`, `stability` and `compatibility` classifications remain explicit. The Ledger does not decide retention or cognition meaning.

Once a real database has applied migration 1, that migration can never be edited or removed. Future schema changes are new migrations. Reverting application code does not authorize rewriting an existing database history.

## Rejected alternatives

- **Third-party native SQLite driver:** unnecessary dependency and lock-file/native build surface in M0.
- **JSONL files:** no transactional batch, uniqueness or migration guarantees.
- **Only normalized columns without full event JSON:** cannot prove lossless readback or reject projection drift.
- **Only full JSON without indexed source identity:** cannot mechanically enforce conflicts, monotonic streams or isolated replay efficiently.
- **Trace validation during each append batch:** a batch may legitimately reference facts already persisted outside the batch; single-row DB validity and complete-Trace validity are separate protocol layers.

## R2 hardening amendment

The accepted decision includes the following fail-closed installation and operation rules:

- migration metadata is created only when the database has no user Schema objects and `user_version=0`; an existing database is never repaired with `IF NOT EXISTS`;
- the installed tables, explicit indexes, auto-index semantics, STRICT state, CHECK/UNIQUE structure and trigger bodies are compared with an immutable reference manifest;
- opening validates every row, and every write transaction revalidates the Schema, connection PRAGMAs and all canonical rows before sequence or identity decisions;
- file/memory journal mode, foreign keys, busy timeout, synchronous mode, trusted schema and temp store are all read back and asserted;
- `integrity_check` is mandatory in the public open API and accepts only one exact `ok` row;
- all operational SQLite exceptions are normalized to the stable `sqlite` error category without swallowing domain conflicts or corruption.

These checks intentionally trade startup and append throughput for a mechanically trustworthy M0 Ledger. A future performance optimization requires new evidence that it cannot miss projection or Schema drift.
