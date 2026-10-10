import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  assertMemoryClaimV2,
  DomainValidationErrorV2,
  type CriterionId,
  type MemoryClaimV2,
} from "../../domain/src/index.ts";
import {
  canonicalJsonV1,
  canonicalNormalizedRuntimeEventV1,
  CognitiveProtocolError,
  createNormalizedRuntimeEventV1,
  parseNormalizedRuntimeEventV1,
  parseObservationV2,
  serializeObservationV2,
  type NormalizedRuntimeEventV1,
  type ObservationV2,
} from "../../protocol/src/index.ts";
import {
  convertRuntimeV1ToObservationV2,
  cognitiveRecordMetadataV2,
  hydrateClaimV2,
  parseCognitiveRecordV2,
  parseCognitiveRecordMetadataV2,
  splitClaimV2,
  type ClaimLifecycleV2,
  type CognitiveRecordByKindV2,
  type CognitiveRecordKindV2,
  type RuntimeV1ObservationMappingV2,
} from "./cognitive-codec-v2.ts";

const fixture = JSON.parse(readFileSync(new URL("../fixtures/cognitive-v2/runtime-v1-conversion.json", import.meta.url), "utf8")) as {
  original: NormalizedRuntimeEventV1;
  mapping: RuntimeV1ObservationMappingV2;
  expected: ObservationV2;
};

function claim(overrides: Partial<MemoryClaimV2> = {}): MemoryClaimV2 {
  return {
    schemaVersion: 2, id: "claim-1", version: 1, revision: 1,
    scope: { kind: "workspace", workspaceId: "workspace-1" },
    privacy: "local-only", sourceTrust: "user-direct", kind: "preference", epistemic: "asserted",
    statement: "Synthetic preference: use the blue notebook.", status: "ACTIVE",
    validFrom: "2026-10-10T08:00:00.000Z", validUntil: "2027-10-10T08:00:00.000Z",
    createdAt: "2026-10-10T08:00:00.000Z", updatedAt: "2026-10-10T08:00:00.000Z",
    evidence: [{
      source: { kind: "observation", id: "observation-1", revision: 1 },
      scope: { kind: "workspace", workspaceId: "workspace-1" },
      privacy: "local-only", sourceTrust: "user-direct", role: "supports",
      observedAt: "2026-10-10T08:00:00.000Z", fragmentId: "selector-1",
    }],
    ...overrides,
  };
}

test("claim codec separates the only free-text body and returns canonical, frozen detached metadata", () => {
  const original = claim();
  const split = splitClaimV2(original);
  assert.equal(split.statement, original.statement);
  for (const key of ["statement", "status", "revision", "updatedAt", "supersededBy"]) {
    assert.equal(Object.hasOwn(split.metadata, key), false);
  }
  assert.equal(JSON.stringify(split.metadata), canonicalJsonV1(split.metadata));
  assert.equal(JSON.stringify(split.metadata).includes(original.statement), false);
  assert.equal(split.metadata.evidence[0].fragmentId, "selector-1");
  assert.notEqual(split.metadata.scope, original.scope);
  assert.notEqual(split.metadata.evidence, original.evidence);
  assert.equal(Object.isFrozen(split), true);
  assert.equal(Object.isFrozen(split.metadata.evidence[0].source), true);
  assert.deepEqual(hydrateClaimV2(split.metadata, split.statement, {
    status: split.status, revision: split.revision, updatedAt: split.updatedAt,
  }), original);
});

test("claim codec preserves correction lineage and separates content version from lifecycle revision", () => {
  const original = claim({
    version: 2, revision: 8, status: "SUPERSEDED", updatedAt: "2026-10-10T09:00:00.000Z",
    supersedes: { claimId: "claim-1", version: 1 }, supersededBy: { claimId: "claim-1", version: 3 },
  });
  const { metadata, statement, ...lifecycle } = splitClaimV2(original);
  assert.equal(metadata.version, 2);
  assert.deepEqual(metadata.supersedes, { claimId: "claim-1", version: 1 });
  assert.deepEqual(lifecycle, { status: "SUPERSEDED", revision: 8, updatedAt: original.updatedAt, supersededByVersion: 3 });
  const hydrated = hydrateClaimV2(metadata, statement, lifecycle);
  assertMemoryClaimV2(hydrated);
  assert.deepEqual(hydrated, original);
  assert.deepEqual(hydrateClaimV2(metadata, statement, { ...lifecycle, status: "FORGOTTEN", revision: 9 }), {
    ...original, status: "FORGOTTEN", revision: 9,
  });
});

test("split accepts domain-valid shared Scope instances without retaining aliases", () => {
  const original = claim();
  const shared = { ...original, evidence: [{ ...original.evidence[0], scope: original.scope }] };
  assertMemoryClaimV2(shared);
  const split = splitClaimV2(shared);
  assert.notEqual(split.metadata.scope, split.metadata.evidence[0].scope);
  assert.deepEqual(hydrateClaimV2(split.metadata, split.statement, {
    status: split.status, revision: split.revision, updatedAt: split.updatedAt,
  }), shared);
});

test("claim codec never makes an invalid claim valid by discarding fields", () => {
  const invalid = [
    { ...claim(), schemaVersion: 3 }, { ...claim(), evidence: [] }, { ...claim(), statement: "" },
    { ...claim(), sourceTrust: "model-derived" }, { ...claim(), privacy: "model-allowed" },
    { ...claim(), revision: 0 }, { ...claim(), status: "SUPERSEDED" },
    { ...claim(), supersededBy: { claimId: "claim-1", version: 2 } },
    { ...claim(), evidence: [{ ...claim().evidence[0], fragmentId: "inline quotation with spaces" }] },
    { ...claim(), evidence: [{ ...claim().evidence[0], snippet: "synthetic private fragment" }] },
    { ...claim(), summary: "synthetic private summary" },
  ];
  for (const value of invalid) assert.throws(() => splitClaimV2(value), DomainValidationErrorV2);
});

test("hydration rejects body/lifecycle smuggling, broken references and invalid reconstructed domain state", () => {
  const { metadata, statement, ...lifecycle } = splitClaimV2(claim());
  for (const field of ["statement", "status", "revision", "updatedAt", "supersededBy", "payload"]) {
    assert.throws(() => hydrateClaimV2({ ...metadata, [field]: "synthetic private value" }, statement, lifecycle), DomainValidationErrorV2);
  }
  const invalid = [
    { ...lifecycle, status: "SUPERSEDED" }, { ...lifecycle, revision: 0 },
    { ...lifecycle, status: "SUPERSEDED", supersededByVersion: 3 },
    { ...lifecycle, supersededByVersion: 2 }, { ...lifecycle, updatedAt: "2026-10-09T08:00:00.000Z" },
    { ...lifecycle, supersededByVersion: null }, { ...lifecycle, extra: "synthetic private value" },
  ];
  for (const value of invalid) assert.throws(() => hydrateClaimV2(metadata, statement, value as ClaimLifecycleV2), DomainValidationErrorV2);
  assert.throws(() => hydrateClaimV2(metadata, "", lifecycle), DomainValidationErrorV2);
  assert.throws(() => hydrateClaimV2({ ...metadata, schemaVersion: 99 }, statement, lifecycle), DomainValidationErrorV2);
  assert.throws(() => hydrateClaimV2({ ...metadata, evidence: [] }, statement, lifecycle), DomainValidationErrorV2);
});

test("claim codec rejects executable properties before evaluating them and uses safe fixed diagnostics", () => {
  let evaluated = false;
  const original = claim();
  Object.defineProperty(original, "statement", { enumerable: true, get() { evaluated = true; return "never read"; } });
  assert.throws(() => splitClaimV2(original), DomainValidationErrorV2);
  const { metadata, statement, ...lifecycle } = splitClaimV2(claim());
  const unsafe = { ...metadata };
  Object.defineProperty(unsafe, "synthetic-private-key", { enumerable: true, get() { evaluated = true; return "never read"; } });
  assert.throws(() => hydrateClaimV2(unsafe, statement, lifecycle), error => {
    assert.ok(error instanceof DomainValidationErrorV2);
    assert.equal(JSON.stringify(error).includes("synthetic-private-key"), false);
    assert.equal(error.message.includes("synthetic-private-key"), false);
    return true;
  });
  assert.equal(evaluated, false);
});

test("explicit v1 conversion matches fixture, retains the original inline contract and never copies its body", () => {
  const original = structuredClone(fixture.original);
  const before = canonicalNormalizedRuntimeEventV1(original);
  assert.equal(original.eventId, "nre1_eb621f6ba784efbd6e3a27518cebee971da7eb861e2e1769423d175cce04c718");
  assert.equal(original.idempotencyKey, "nre1b_f8e9ec0f98e8ca99a88c9af2ed67d01225ee7d88b0a4651a9d97eac60d873ace");
  const { eventId: _eventId, idempotencyKey: _idempotencyKey, ...draft } = original;
  assert.deepEqual(createNormalizedRuntimeEventV1(draft), original);
  const result = convertRuntimeV1ToObservationV2(original, fixture.mapping);
  assert.deepEqual(result, fixture.expected);
  assert.deepEqual(parseObservationV2(result), result);
  assert.equal(canonicalNormalizedRuntimeEventV1(original), before);
  assert.deepEqual(parseNormalizedRuntimeEventV1(original), fixture.original);
  const serialized = serializeObservationV2(result);
  for (const excluded of ["fixture response", original.eventId, original.idempotencyKey, "fixture-turn-a", "contentKinds", "stopReason", "sdk-public-events"]) {
    assert.equal(serialized.includes(excluded), false);
  }
  assert.notEqual(result.source.productSessionId, result.source.runtimeSessionId);
  assert.equal(result.correlation.turnId, "product-turn-1");
  assert.equal(Object.isFrozen(result.content), true);
  assert.notEqual(result.scope, fixture.mapping.scope);
});

test("converter requires every explicit decision, including null correlations and content unavailability", () => {
  for (const key of Object.keys(fixture.mapping)) {
    const missing = { ...fixture.mapping } as Record<string, unknown>;
    delete missing[key];
    assert.throws(() => convertRuntimeV1ToObservationV2(fixture.original, missing as unknown as RuntimeV1ObservationMappingV2), CognitiveProtocolError);
  }
  for (const key of Object.keys(fixture.mapping.correlation)) {
    const correlation = { ...fixture.mapping.correlation } as Record<string, unknown>;
    delete correlation[key];
    assert.throws(() => convertRuntimeV1ToObservationV2(fixture.original, { ...fixture.mapping, correlation } as RuntimeV1ObservationMappingV2), CognitiveProtocolError);
  }
  for (const reason of ["not-retained", "purged", "missing", "policy-blocked"] as const) {
    const result = convertRuntimeV1ToObservationV2(fixture.original, {
      ...fixture.mapping, content: { availability: "unavailable", reason },
    });
    assert.deepEqual(result.content, { availability: "unavailable", reason });
    assert.equal(JSON.stringify(result).includes("fixture response"), false);
  }
});

test("converter rejects invalid original versions, mismatched identities and legacy metadata incompatible with v2", () => {
  for (const original of [
    { ...fixture.original, protocolVersion: 2 },
    { ...fixture.original, idempotencyKey: "nre1b_" + "0".repeat(64) },
    { ...fixture.original, eventId: "nre1_" + "0".repeat(64) },
  ]) assert.throws(() => convertRuntimeV1ToObservationV2(original, fixture.mapping), CognitiveProtocolError);
  const mappings = [
    { ...fixture.mapping, scope: { kind: "workspace", workspaceId: "different-workspace" } },
    { ...fixture.mapping, productSessionId: "different-product-session" },
    { ...fixture.mapping, runtime: fixture.original.source.runtime.implementation },
    { ...fixture.mapping, scope: { kind: "task", workspaceId: "fixture-workspace", taskId: "task-1" }, correlation: {
      ...fixture.mapping.correlation, taskAttempt: { taskId: "different-task", attemptId: "attempt-1", intentRevision: 1 },
    } },
    { ...fixture.mapping, content: { availability: "available", body: "synthetic body" } },
    { ...fixture.mapping, integrity: { status: "incomplete", reason: "source-gap", missingSequences: [] } },
    { ...fixture.mapping, unsupported: "synthetic private value" },
  ];
  for (const mapping of mappings) assert.throws(() => convertRuntimeV1ToObservationV2(fixture.original, mapping as RuntimeV1ObservationMappingV2), CognitiveProtocolError);
});

test("converter preserves explicit incomplete source integrity without guessing completeness from a v1 event", () => {
  const mapping = {
    ...fixture.mapping, integrity: { status: "incomplete", reason: "source-gap", missingSequences: [2, 3] },
  } as const;
  const result = convertRuntimeV1ToObservationV2(fixture.original, mapping);
  assert.deepEqual(result.integrity, mapping.integrity);
  assert.equal(result.source.sourceSequence, 5);
  assert.equal(result.observedAt, fixture.original.observedAt);
  assert.equal(result.recordedAt, fixture.mapping.recordedAt);
});

test("converter sanitizes legacy diagnostics and never executes accessors in mapping or source", () => {
  let evaluated = false;
  for (const field of ["original", "mapping"] as const) {
    const unsafe = { ...fixture[field] };
    Object.defineProperty(unsafe, "synthetic-private-key", { enumerable: true, get() { evaluated = true; return "never read"; } });
    assert.throws(() => convertRuntimeV1ToObservationV2(
      field === "original" ? unsafe : fixture.original,
      field === "mapping" ? unsafe as RuntimeV1ObservationMappingV2 : fixture.mapping,
    ), error => {
      assert.ok(error instanceof CognitiveProtocolError);
      assert.equal(error.message, "Invalid protocol input");
      assert.equal(JSON.stringify(error).includes("synthetic-private-key"), false);
      return true;
    });
  }
  assert.equal(evaluated, false);
});

function cognitiveRecords(): CognitiveRecordByKindV2 {
  const original = claim();
  const base = {
    schemaVersion: 2 as const, id: "record-1", revision: 5, scope: original.scope,
    privacy: original.privacy, sourceTrust: original.sourceTrust,
    createdAt: original.createdAt, updatedAt: original.updatedAt,
  };
  const criterion = { id: "criterion-1" as CriterionId, revision: 1,
    description: "SYNTHETIC-PRIVATE-CRITERION", required: true, method: "artifact" as const };
  const task = { kind: "task" as const, id: "task-1", revision: 4 };
  const taskAttempt = { taskId: "task-1", attemptId: "attempt-1", intentRevision: 3 };
  const outcome = { kind: "outcome" as const, id: "outcome-1", revision: 2 };
  return {
    candidate: {
      ...base, kind: "preference", statement: "SYNTHETIC-PRIVATE-STATEMENT", epistemic: "asserted",
      confidence: 0.5, evidence: original.evidence, extractor: { kind: "extractor", id: "extractor-1", revision: 1 },
      status: "PENDING", validFrom: base.createdAt, expiresAt: "2026-10-11T08:00:00.000Z",
    },
    hypothesis: {
      ...base, version: 2, epistemic: "inferred", sourceTrust: "model-derived",
      proposition: "SYNTHETIC-PRIVATE-PROPOSITION", alternatives: ["SYNTHETIC-PRIVATE-ALTERNATIVE"],
      verificationQuestions: ["SYNTHETIC-PRIVATE-QUESTION"], evidence: original.evidence,
      expiresAt: "2026-10-11T08:00:00.000Z", status: "OPEN",
    },
    goal: { ...base, intent: "SYNTHETIC-PRIVATE-INTENT", criteria: [criterion], priority: "normal",
      confirmation: original.evidence[0], status: "PROPOSED" },
    episode: {
      ...base, version: 2, task, taskAttempt, goal: { kind: "goal", id: "goal-1", revision: 2 },
      intent: { revision: 3, request: "SYNTHETIC-PRIVATE-REQUEST", constraints: ["SYNTHETIC-PRIVATE-CONSTRAINT"], criteria: [criterion] },
      startedAt: base.createdAt, endedAt: base.createdAt, contextDifferences: ["SYNTHETIC-PRIVATE-DIFFERENCE"],
      actions: [{ kind: "action", id: "action-1", revision: 1 }],
      artifacts: [{ kind: "artifact", id: "artifact-1", version: 1 }], outcome, outcomeStatus: "unverifiable",
      unresolved: ["SYNTHETIC-PRIVATE-UNRESOLVED"], evidence: original.evidence,
      summary: { text: "SYNTHETIC-PRIVATE-SUMMARY", sourceRefs: [outcome], generatorRevision: 1 },
    },
    "working-state": {
      ...base, task, taskAttempt, intentRevision: 3, currentStep: "SYNTHETIC-PRIVATE-STEP",
      known: ["SYNTHETIC-PRIVATE-KNOWN"], unknown: ["SYNTHETIC-PRIVATE-UNKNOWN"],
      pendingInput: ["SYNTHETIC-PRIVATE-PENDING"], nextSteps: ["SYNTHETIC-PRIVATE-NEXT"], evidence: original.evidence,
    },
  };
}

test("five cognitive record codecs retain complete canonical bodies and strict body-free SQL metadata", () => {
  const records = cognitiveRecords();
  const expectedKeys = ["kind", "id", "revision", "version", "scope", "privacy", "sourceTrust", "createdAt", "updatedAt", "status", "evidence", "acceptedClaim"].sort();
  for (const kind of Object.keys(records) as CognitiveRecordKindV2[]) {
    const input = records[kind];
    const parsed = parseCognitiveRecordV2(kind, input);
    assert.deepEqual(parsed, input);
    assert.equal(JSON.stringify(parsed), canonicalJsonV1(parsed));
    assert.notEqual(parsed, input);
    assert.notEqual(parsed.scope, input.scope);
    assert.equal(Object.isFrozen(parsed), true);
    assert.equal(Object.isFrozen(parsed.scope), true);
    assert.equal(JSON.stringify(parsed).includes("SYNTHETIC-PRIVATE-"), true);
    const metadata = cognitiveRecordMetadataV2(kind, input);
    assert.deepEqual(Object.keys(metadata), expectedKeys);
    assert.equal(JSON.stringify(metadata), canonicalJsonV1(metadata));
    assert.equal(JSON.stringify(metadata).includes("SYNTHETIC-PRIVATE-"), false);
    assert.equal(metadata.revision, 5);
    assert.equal(metadata.version, kind === "hypothesis" || kind === "episode" ? 2 : null);
    assert.equal(metadata.status, kind === "episode" || kind === "working-state" ? null : "status" in input ? input.status : undefined);
    assert.equal(metadata.acceptedClaim, null);
    assert.deepEqual(metadata.evidence, "confirmation" in input ? [input.confirmation] : input.evidence);
    assert.equal(Object.isFrozen(metadata.evidence[0]), true);
    assert.notEqual(metadata.evidence[0], "confirmation" in input ? input.confirmation : input.evidence[0]);
    for (const field of ["statement", "proposition", "intent", "summary", "criteria", "task", "taskAttempt", "outcome", "goal", "contentRefs"]) {
      assert.equal(Object.hasOwn(metadata, field), false);
    }
  }
});

test("record codecs reject wrong kinds, unknown fields and bad evidence before projecting metadata", () => {
  const records = cognitiveRecords();
  for (const kind of Object.keys(records) as CognitiveRecordKindV2[]) {
    const input = records[kind];
    const invalidEvidence = "confirmation" in input ? { confirmation: { ...input.confirmation, sourceTrust: "model-derived" } } : { evidence: [] };
    for (const value of [null, { ...input, schemaVersion: 1 }, { ...input, granted: true }, { ...input, ...invalidEvidence }]) {
      assert.throws(() => parseCognitiveRecordV2(kind, value), DomainValidationErrorV2);
      assert.throws(() => cognitiveRecordMetadataV2(kind, value), DomainValidationErrorV2);
    }
    for (const other of Object.keys(records) as CognitiveRecordKindV2[]) {
      if (other !== kind) assert.throws(() => parseCognitiveRecordV2(kind, records[other]), DomainValidationErrorV2);
    }
  }
  for (const unsupported of ["procedure", "claim", "future-record", "__proto__"]) {
    assert.throws(() => parseCognitiveRecordV2(unsupported as CognitiveRecordKindV2, records.candidate), error => {
      assert.ok(error instanceof DomainValidationErrorV2);
      assert.equal(error.error.code, "unsupported");
      return true;
    });
  }
});

test("record codecs reject free-text accessors without invoking them or exposing their diagnostics", () => {
  let evaluated = false;
  for (const kind of Object.keys(cognitiveRecords()) as CognitiveRecordKindV2[]) {
    const input = { ...cognitiveRecords()[kind] };
    Object.defineProperty(input, "SYNTHETIC-PRIVATE-KEY", { enumerable: true, get() { evaluated = true; return "never read"; } });
    assert.throws(() => cognitiveRecordMetadataV2(kind, input), error => {
      assert.ok(error instanceof DomainValidationErrorV2);
      assert.equal(JSON.stringify(error).includes("SYNTHETIC-PRIVATE-KEY"), false);
      return true;
    });
  }
  assert.equal(evaluated, false);
});

test("retained cognitive metadata validates and detaches independently without any body or placeholder", () => {
  const records = cognitiveRecords();
  for (const kind of Object.keys(records) as CognitiveRecordKindV2[]) {
    const metadata = cognitiveRecordMetadataV2(kind, records[kind]);
    const parsed = parseCognitiveRecordMetadataV2(metadata);
    assert.deepEqual(parsed, metadata);
    assert.notEqual(parsed, metadata);
    assert.notEqual(parsed.evidence, metadata.evidence);
    assert.equal(Object.isFrozen(parsed.evidence[0].source), true);
    assert.equal(JSON.stringify(parsed), canonicalJsonV1(parsed));
    assert.equal(Object.keys(parsed).length, 12);
    assert.equal(JSON.stringify(parsed).includes("SYNTHETIC-PRIVATE-"), false);
  }
});

test("retained metadata requires every exact key and rejects invalid controlled values without body access", () => {
  const records = cognitiveRecords();
  for (const kind of Object.keys(records) as CognitiveRecordKindV2[]) {
    const metadata = cognitiveRecordMetadataV2(kind, records[kind]);
    for (const key of Object.keys(metadata)) {
      const missing = { ...metadata } as Record<string, unknown>;
      delete missing[key];
      assert.throws(() => parseCognitiveRecordMetadataV2(missing), DomainValidationErrorV2);
    }
    for (const invalid of [
      null, [], { ...metadata, statement: "SYNTHETIC-PRIVATE-STATEMENT" }, { ...metadata, kind: "procedure" },
      { ...metadata, revision: 0 }, { ...metadata, id: "../private/path" }, { ...metadata, privacy: "private" },
      { ...metadata, sourceTrust: "approved" }, { ...metadata, createdAt: "tomorrow" },
      { ...metadata, updatedAt: "2026-10-09T08:00:00.000Z" }, { ...metadata, evidence: [] },
      { ...metadata, scope: { kind: "workspace", workspaceId: "other-workspace" } },
      { ...metadata, privacy: "model-allowed" },
      { ...metadata, evidence: [{ ...metadata.evidence[0], observedAt: "2026-10-11T08:00:00.000Z" }] },
      { ...metadata, evidence: [{ ...metadata.evidence[0], fragmentId: "inline text is forbidden" }] },
    ]) assert.throws(() => parseCognitiveRecordMetadataV2(invalid), DomainValidationErrorV2);
    const versioned = kind === "hypothesis" || kind === "episode";
    for (const version of versioned ? [null, 0, 6, 1.5] : [1, 5]) {
      assert.throws(() => parseCognitiveRecordMetadataV2({ ...metadata, version }), DomainValidationErrorV2);
    }
    const badStatus = kind === "episode" || kind === "working-state" ? "ACTIVE" : null;
    assert.throws(() => parseCognitiveRecordMetadataV2({ ...metadata, status: badStatus }), DomainValidationErrorV2);
  }
});

test("retained metadata enforces kind-specific status, scope and Goal confirmation structure", () => {
  const records = cognitiveRecords();
  const statuses = { candidate: ["PENDING", "ACCEPTED", "REJECTED", "EXPIRED"],
    hypothesis: ["OPEN", "SUPPORTED", "REFUTED", "EXPIRED", "WITHDRAWN"],
    goal: ["PROPOSED", "ACTIVE", "PAUSED", "ACHIEVED", "ABANDONED"], episode: [null], "working-state": [null] };
  for (const kind of Object.keys(records) as CognitiveRecordKindV2[]) {
    const metadata = cognitiveRecordMetadataV2(kind, records[kind]);
    for (const status of statuses[kind]) assert.equal(parseCognitiveRecordMetadataV2({
      ...metadata, status, acceptedClaim: kind === "candidate" && status === "ACCEPTED" ? { claimId: "claim-1", version: 2 } : null,
    }).status, status);
    assert.throws(() => parseCognitiveRecordMetadataV2({ ...metadata, status: "future-state" }), DomainValidationErrorV2);
    if (kind === "episode" || kind === "working-state") {
      assert.throws(() => parseCognitiveRecordMetadataV2({
        ...metadata, scope: { kind: "global" }, evidence: metadata.evidence.map(ref => ({ ...ref, scope: { kind: "global" } })),
      }), DomainValidationErrorV2);
    }
  }
  const goal = cognitiveRecordMetadataV2("goal", records.goal);
  for (const invalid of [
    { ...goal, sourceTrust: "model-derived" },
    { ...goal, evidence: [{ ...goal.evidence[0], sourceTrust: "verified-tool" }] },
    { ...goal, evidence: [{ ...goal.evidence[0], role: "refutes" }] },
    { ...goal, evidence: [goal.evidence[0], { ...structuredClone(goal.evidence[0]), source: { kind: "observation", id: "observation-2", revision: 1 } }] },
  ]) assert.throws(() => parseCognitiveRecordMetadataV2(invalid), DomainValidationErrorV2);
});

test("retained metadata rejects executable values and redacts arbitrary input keys", () => {
  const metadata = { ...cognitiveRecordMetadataV2("candidate", cognitiveRecords().candidate) };
  let evaluated = false;
  Object.defineProperty(metadata, "SYNTHETIC-PRIVATE-METADATA-KEY", { enumerable: true, get() { evaluated = true; return "never read"; } });
  assert.throws(() => parseCognitiveRecordMetadataV2(metadata), error => {
    assert.ok(error instanceof DomainValidationErrorV2);
    assert.equal(error.message.includes("SYNTHETIC-PRIVATE-METADATA-KEY"), false);
    assert.equal(JSON.stringify(error).includes("SYNTHETIC-PRIVATE-METADATA-KEY"), false);
    return true;
  });
  assert.equal(evaluated, false);
});

test("accepted candidate metadata retains only the exact Claim version and requires null for all other states", () => {
  const records = cognitiveRecords();
  const acceptedClaim = { claimId: "accepted-claim-1", version: 3 };
  const candidate = { ...records.candidate, status: "ACCEPTED" as const, acceptedClaim };
  const metadata = cognitiveRecordMetadataV2("candidate", candidate);
  assert.deepEqual(metadata.acceptedClaim, acceptedClaim);
  assert.notEqual(metadata.acceptedClaim, acceptedClaim);
  assert.equal(Object.isFrozen(metadata.acceptedClaim), true);
  assert.deepEqual(parseCognitiveRecordMetadataV2(JSON.parse(JSON.stringify(metadata))), metadata);
  for (const invalid of [null, {}, { claimId: "../sensitive/path", version: 3 },
    { claimId: "accepted-claim-1", version: 0 }, { claimId: "accepted-claim-1", revision: 3 },
    { claimId: "accepted-claim-1", version: 3, statement: "SYNTHETIC-PRIVATE-CLAIM" }]) {
    assert.throws(() => parseCognitiveRecordMetadataV2({ ...metadata, acceptedClaim: invalid }), DomainValidationErrorV2);
  }
  for (const kind of Object.keys(records) as CognitiveRecordKindV2[]) {
    const other = cognitiveRecordMetadataV2(kind, records[kind]);
    assert.equal(other.acceptedClaim, null);
    assert.throws(() => parseCognitiveRecordMetadataV2({ ...other, acceptedClaim }), DomainValidationErrorV2);
    if (kind === "candidate") {
      for (const status of ["PENDING", "REJECTED", "EXPIRED"]) {
        assert.throws(() => parseCognitiveRecordMetadataV2({ ...other, status, acceptedClaim }), DomainValidationErrorV2);
      }
    }
  }
});
