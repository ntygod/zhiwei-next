# NormalizedRuntimeEvent v1

`NormalizedRuntimeEvent v1` is the durable Runtime-neutral boundary between Pi SDK / Extension / RPC / Host facts and the future Observation Ledger. Consumers must not depend on Pi classes, raw RPC objects, SQLite rows, wall-clock reads, or generated correlation IDs.

## Envelope and identity

Each event contains:

```text
protocolVersion = 1
eventId / idempotencyKey
workspaceId
runtimeSessionId
runtimeInstanceId
source { adapter, runtime implementation/version, surface, eventType }
sequence { domain, value }
observedAt
provenance
persistence / stability / compatibility
correlation { observed, normalized }
links { sourceEventIds, replacesEventIds }
data (closed, phase-discriminated union)
```

`eventId` identifies the source slot: Workspace + Runtime Session + Runtime Instance + Adapter/Runtime/Surface + sequence domain/value. `source.eventType`, correlation, links and payload belong to the canonical body. Same slot and different body is a `source-slot-conflict`; byte-equivalent canonical bodies are exact replay.

Sequence is strict only inside the declared source stream. There is no `globalSequence` and no cross-domain total order.

## Stable payload vocabulary

Known durable facts are `compatibility=required`. Message updates are exactly `ephemeral + update + ignorable`. Required unknown vocabulary blocks complete replay.

The closed union contains command response, Agent/Turn/Message/Tool lifecycle, Queue, Retry, Compaction, Session identity, State/Messages Snapshot, Host Action, Process Boundary and diagnostic unknown events.

### Agent end source availability

Public SDK exposes `agent_end.willRetry`; the Extension surface does not. v1 preserves the difference explicitly:

```text
willRetry: true | false | "unavailable"
```

`"unavailable"` is valid only for `extension / observed` Agent end. It is not optional and cannot be used by SDK, RPC or Host callers. `willRetry=true` is an observed plan, not a guarantee of another Agent Run.

### Retry completion

A successful `auto_retry_end` is an independent stable fact:

```text
{ kind: "retry.lifecycle", phase: "completed", attempt, success }
```

Trace validation requires an earlier matching Retry start in the same Workspace, Runtime Session, Runtime Instance, Adapter/Runtime/Surface and sequence domain. Retry completion does not borrow an Agent Run correlation. The accepted success chain remains:

```text
Agent Run 1 end(willRetry=true)
→ Retry started(attempt=1)
→ Agent Run 2
→ Retry completed(attempt=1, success=true)
→ Agent Run 2 end(willRetry=false)
→ Agent settled
```

### Tool lifecycle and Tool Result Message

Tool started/completed explicitly link one matching declaration in the same Workspace, Runtime Session and Runtime Instance, with matching Tool Call ID, name and known Agent Run/Turn parents.

Tool completion order and Tool Result Message order are independent. Every tool-role Message start/end must preserve:

```text
correlation.normalized.toolCallId
data.toolName
data.success
data.errorMessage?   // failed result only
links.sourceEventIds = [matching completed Tool event]
```

Tool Result Messages do not support `message_update`. Trace validation checks the completed Tool target, Runtime scope, Tool Call ID, name, success, known Run/Turn parents, and stable start/end metadata.

Messages Snapshot tool items must preserve at least:

```text
role = "tool"
toolCallId
toolName
success
contentKinds?
errorMessage?
text?
```

Thus `alpha → beta → gamma` Tool Result Message order is verified by identity, while completion may remain `beta → gamma → alpha`.

### Runtime-neutral projections

Message bodies retain projected text only. State Snapshot has fixed streaming/message/pending/queue/compaction fields. Non-tool Messages Snapshot items retain role/content/stop/error/text. Tool items use the identity-bearing shape above. Adapter code projects fields individually and never snapshots a raw Pi State or Message object wholesale.

Tool input/result may contain bounded `zhiwei-json-v1` contract JSON; they are not Runtime envelopes.

## Session Replacement and Invalidation

The real replacement chain is:

```text
Extension session_shutdown(old)
→ Host Session Invalidation(old)
→ Extension session_start(new, previous=old)
→ Host session_replaced aggregate + sourceEventIds
→ Host listener-rebound(old → new)
```

The replacement aggregate must have exactly two source links—one earlier observed Extension shutdown and one earlier observed Extension start—and no `replacesEventIds`. Trace validation checks one Workspace and Runtime Session, shutdown-before-start, old/new Session Object identity, optional previous/next Runtime Instance identity and the aggregate's top-level instance.

Session Object replacement does not imply Worker restart. The 74-event Fixture includes a same-Runtime-Instance replacement to prove that Session Object, Runtime Session and Worker Instance are distinct identities.

Host close-stdin/request-signal, Extension session shutdown, and observed process spawn/exit/close remain separate facts.

## Compaction

Compaction completion retains both derived source lineage (`sourceEventIds`, including the earlier Compaction start) and original observations that are replaced for context (`replacesEventIds`). Original facts are never deleted or overwritten.

## JSON and validation layers

`zhiwei-json-v1` rejects accessors, exotic prototypes, sparse arrays, alias/cycle, Symbol, non-finite numbers and `-0`. IDs use deterministic pure TypeScript SHA-256.

Single-event parsing validates closed shape, source ownership, phase semantics and locally required links. Trace parsing validates target existence, earlier ingestion, Workspace/Session/Instance scope, lifecycle ordering and parent correlation. A corrupt database object cannot borrow historical context to become valid.

## Contract Fixture

The executable Fixture contains **74 events**, binds six accepted Runtime evidence fingerprints, and fixes this canonical hash:

```text
b6630cff347af84e43eca74e2d76c1b786cbe8fab71b9eab4e76df10c8110d2b
```

It freezes SDK/Extension Agent end availability, successful Retry completion, Tool completion and Tool Result Message identity/order, Compaction lineage, same-instance Session Replacement, Host/Process boundaries and required/ignorable compatibility behavior.

## Non-goals

v1 does not define SQLite schema/revision/cursor/migration, Daemon supervision, Cognition Observation/MemoryClaim projection, long-term Message retention policy, model-request Steps, task success, or a cross-domain total order.
