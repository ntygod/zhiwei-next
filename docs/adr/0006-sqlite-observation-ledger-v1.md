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
