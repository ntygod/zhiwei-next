# P1-01 synthetic wire fixtures

`observation-v2.json`, `local-api-v1-commands.json` and `local-api-v1-responses.json` are canonical JSON golden vectors. Their IDs, times, content references and sentences are synthetic. Tests exercise the public protocol entrypoint, strict object parsing, duplicate-key-aware JSON decoding and serialization.

## Version and compatibility decision

- Observation schema v2, Local API schema v1, Runtime event protocol v1 and diagnostics v1 are independent version axes.
- Observation v2 never reuses or upgrades a Runtime v1 parser. There is no implicit conversion, dual-write, database change or production consumer. A future v1-to-v2 projector needs explicit source mapping and fixtures; persistence migration belongs to P1-02.
- Original Runtime v1 and diagnostics files and their fixtures are unchanged. The new regression suite round-trips every existing Runtime v1 fixture through its original parser and rejects it as Observation v2.
- Immutable Observation `revision` is 1. Content references name a separate content version; Claim target versions are distinct from aggregate revision/CAS.

## Observation v2

The envelope contains controlled metadata and exact content references, never an arbitrary body, model reasoning, summary, tool parameters or body digest. IDs and event type are bounded opaque strings, not authorization, public log data or exempt from retention. Source identity is supplied by a trusted future ingress boundary; a parser cannot authenticate its assertions.

`streamId` identifies exactly one adapter/surface/runtime-instance sequence domain. `(streamId, sourceSequence)` is a source slot; duplicate slots or IDs with changed semantic input are conflicts, not overwrite requests. SDK, RPC, Extension and Host remain distinguishable. Product and Runtime session identities are separate. Missing Runtime, instance, task/attempt, turn, tool and causal associations are explicit nulls. A local API source carries no invented Runtime identity.

`observedAt` is the source's observation time and `recordedAt` is the trusted recording boundary time. Both are canonical UTC milliseconds; source clock skew can reverse them. Neither is a source order or proof of ingestion completeness. Missing sequences are explicit and precede the current source position. Availability states contain no fallback summary; unavailable/purged content cannot carry a usable content reference.

## Local API v1 subset

This first DTO slice covers Workspace-scoped Task creation/control/revision/criterion confirmation, Goal creation/control/revision, memory remember/correct/logical-forget, memory search, durable receipt representation and fixed code/reason error categories. All 16 command variants have golden vectors. Global search is expressible; installation-level/global write schemas, authentication, HTTP/SSE, services, persistence, grants and later-stage endpoints are not implemented.

Create commands require expectedRevision 0; existing targets bind exact aggregate revision and optional URL identities. Memory correction additionally names the immutable Claim content version. Task criteria/evidence and status types reuse P0-03 public contracts. Runtime completion or a caller boolean cannot become a completed Outcome. COMPLETED/PARTIAL/FAILED/UNVERIFIABLE receipts require their corresponding explicit Outcome. CANCELLED can omit Outcome, matching P0-03 confirm-stop without unknown actions; any supplied Outcome must have cancelled status.

Parsing establishes shape and local consistency only. It does not prove source truth, current resource ownership, permission, scope readability, evidence text matching, a verified result or a durable commit. Goal confirmation and result-confirmation requests still need trusted resolution. Core/Store must recheck authenticated evidence, scope, privacy, current revisions and durable transaction results. Error producers must supply reviewed safeMessage text; the parser never formats native exceptions or embeds rejected input in its own errors.
