# Cognitive v2 storage codec fixtures

All data is synthetic. `runtime-v1-conversion.json` freezes an unchanged original
`message_end` event from the existing Runtime v1 fixture, an explicit caller mapping,
and the expected independent Observation v2 representation. Its source is
`packages/protocol/fixtures/normalized-runtime-event-v1.fixture-primary-command.ts`;
the original event ID and idempotency key are checked through the original public
v1 parser and generator. No old protocol fixture, parser, body or table is rewritten.

The converter does not infer authority, privacy, trust, product session, correlation,
content retention, or source completeness from old event fields or inline text.
Every such decision is explicit in the mapping. The caller authenticates that
mapping and performs any content authorization and materialization separately.
An `available` content reference does not itself prove content exists or may be read.
The converter performs no migration, file write, database write, or model invocation.

`streamId` must be bound by the trusted adapter to the complete v1 source identity:
workspace, adapter, runtime implementation and version, source surface, runtime
instance, runtime session, and sequence domain. Runtime version is not a separate
Observation v2 field, so dropping it from that binding would incorrectly merge
source streams. The explicit controlled `runtime` alias (`pi` here) is necessary
because a v1 implementation package name is not necessarily a valid v2 identifier.
The converter copies source sequence and observed time without inventing a global
order. It cannot infer a complete stream from a single event.

Only a reference or explicit unavailability enters the Observation. Inline body,
body fingerprints, raw v1 correlations and links stay out of the v2 representation.
The old inline v1 original remains an audit/compatibility fixture; this does not make
an unknown historical database safe for real product data or selective purge.

Claim codec tests separately prove that statement text is detached from immutable
metadata, lifecycle columns cannot hide inside metadata, and domain validation is
applied both before splitting and after hydration. Evidence `fragmentId` is a
controlled opaque selector identity, never an inline snippet, path, or quotation.

The candidate/hypothesis/goal/episode/working-state codecs validate the entire DTO
before producing a canonical content-file snapshot. Their SQL metadata projection
has only kind, id, revision, version, scope, privacy, sourceTrust, createdAt,
updatedAt, status, evidence, and acceptedClaim. Goal confirmation is projected as its one evidence
reference. Episode and working-state have `status: null`; candidate, goal and
working-state have `version: null`, because they have no separate domain content
version. Aggregate revision is the storage snapshot key and is never substituted
for content version. All statements, hypotheses, goals, criteria, summaries and
working-state text stay in the managed full-DTO content file. Procedure/P2 is not
part of this codec. Reading a DTO requires an exact comparison of its re-derived
metadata projection with the stored projection.

The retained 12-field projection has its own strict parser for states where the
body is unavailable or purged. It checks identity, version/revision, kind/status,
scope/privacy/trust, times and evidence without fabricating a replacement body.
All five kinds require at least one supporting evidence reference, including
working-state; Goal retains exactly one user-direct supporting confirmation.
Body-only invariants such as expiry details or exact task/attempt bindings cannot
be revalidated from that minimal projection and are checked when parsing an
available full DTO. A valid projection is not proof that its body is available.
`acceptedClaim` is mandatory: an ACCEPTED candidate retains its exact Claim ID and
content version for body-free dependency validation; every other kind/state stores
explicit null. The reference carries no Claim text or permission to read it.
