# ADR 0005: Freeze NormalizedRuntimeEvent v1

- Status: Accepted
- Date: 2026-08-17
- Related: Issue #49, Issue #32, downstream Issue #56

## Context

Pi exposes different facts through SDK, Extension, RPC and Host/process boundaries. Directly persisting Pi classes or raw JSON would couple the Ledger to an upstream runtime and would erase important negative evidence: Extension `agent_end` lacks the Public SDK `willRetry` field; successful `auto_retry_end` is independent from the final Agent end; Tool completion order differs from Tool Result Message order; Session Object replacement is not necessarily Worker restart.

## Decision

Adopt the versioned, closed and Runtime-neutral `NormalizedRuntimeEvent v1` contract.

1. A source slot is identified by Workspace, Runtime Session, Runtime Instance, Adapter/Runtime/Surface and sequence domain/value. `eventId` hashes the slot; `idempotencyKey` hashes the full canonical body. Same slot with a changed body is a conflict.
2. Sequence is monotonic only inside the declared source stream. v1 has no cross-domain `globalSequence`.
3. Time, correlation and identities are injected at the boundary. Protocol and Adapter code do not read the clock or invent IDs.
4. Known durable vocabulary is `required`; Message updates are `ephemeral + update + ignorable`; required unknown vocabulary blocks complete replay.
5. Message, State and Messages Snapshot data is projected field-by-field. Raw Pi objects are never part of the protocol.
6. Host Action, Extension Session identity and observed Process Boundary remain separate facts.
7. Compaction completion preserves derived source lineage and replaced original observations without deleting history.
8. Session Replacement is a Host aggregate that links exactly one earlier observed Extension shutdown and one earlier observed Extension start. Session Object replacement may occur in the same Runtime Instance.

### Agent end availability

`agent.lifecycle/ended.willRetry` is:

```text
boolean | "unavailable"
```

The string is valid only for `extension / observed` facts and explicitly means the source did not expose the field. It is not optional, a default, or a corruption escape hatch.

### Retry completion

Successful `auto_retry_end` maps to:

```text
{ kind: "retry.lifecycle", phase: "completed", attempt, success }
```

Trace validation requires an earlier matching Retry start in the same source stream and Runtime scope. Retry completion remains independent from both Agent Runs and final settled.

### Tool Result Message identity

Tool-role Message start/end requires `normalized.toolCallId`, Tool name, success/error state and exactly one link to the matching completed Tool event. Trace validation checks Workspace, Runtime Session, Runtime Instance and known Agent Run/Turn parents. Tool-role Message updates are rejected.

Messages Snapshot tool items retain `toolCallId`, `toolName` and `success`, so Tool Result Message ordering is verifiable by identity rather than text.

## Executable contract

The contract Fixture contains 74 events and binds accepted Runtime evidence from Issue #32. Its canonical hash is:

```text
b6630cff347af84e43eca74e2d76c1b786cbe8fab71b9eab4e76df10c8110d2b
```

It freezes:

- SDK `willRetry=[true,false]` and Extension `willRetry=["unavailable","unavailable"]`;
- Retry started → second Agent Run → Retry completed(success=true) → final end → settled;
- Tool completion `beta → gamma → alpha` and Tool Result Message/Snapshot identity order `alpha → beta → gamma`;
- same-Worker Session Object replacement with shutdown/invalidation/start/replacement/rebind lineage;
- Host/Process boundaries, Compaction lineage and compatibility behavior.

## Validation boundary

Single-event parsing enforces closed shape, source ownership, availability state and locally required links. Trace parsing enforces target existence, earlier ingestion, Runtime scope, lifecycle order and parent correlation. SQLite reads in Issue #56 must pass single-event validation; replay must additionally pass Trace validation.

## Consequences

- Issue #56 receives a stable durable boundary without importing Pi types.
- Source differences are represented explicitly instead of invented, omitted or downgraded to unknown.
- Tool completion and Tool Result Message ordering can be persisted independently.
- Future semantic changes require a new protocol version or an explicit superseding decision.
- v1 still does not define SQLite schema/revision/cursor, Daemon supervision, Cognition projection, long-term Message retention, model-request Steps, task success or cross-domain total order.

## Rejected alternatives

### Make `willRetry` optional

Rejected because absence cannot distinguish an unavailable source field from caller omission or damaged data.

### Drop Extension Agent end or successful Retry completion

Rejected because both are accepted stable Runtime facts and Issue #49 requires preservation of source differences.

### Keep only Tool Result text

Rejected because text cannot prove Tool Call ownership or preserve independent completion/message ordering.

### Require Worker restart for Session replacement

Rejected because Session Object, Runtime Session and Worker Instance are distinct identities.
