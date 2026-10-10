import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { ContentFilesV2 } from "./content-files-v2.ts";
import type { ContentRefV2, CriterionId, GoalV2, HypothesisV2, MemoryCandidateV2, MemoryClaimV2, PrivacyV2, ScopeV2 } from "../../domain/src/index.ts";
import { canonicalJsonV1, parseObservationV2, type ObservationV2 } from "../../protocol/src/index.ts";
import {
  CognitiveStoreErrorV2,
  openSyntheticCognitionStoreV2,
  type CognitionFenceV2,
  type SyntheticCognitionStoreV2,
} from "./index.ts";

// Normal P1-02 development transactions only. Each test owns entirely synthetic
// temporary data. Restricted preintegration/backup/replacement diagnostics are not run.
const T0 = "2026-10-10T00:00:00.000Z";
const T1 = "2026-10-10T01:00:00.000Z";
const RETENTION = "2026-11-10T00:00:00.000Z";
const SCOPE: ScopeV2 = { kind: "workspace", workspaceId: "synthetic-workspace" };
const OBSERVATION_BODY = "SYNTHETIC_ONLY: The fictional lantern prefers violet reports.";
const CLAIM_BODY = "SYNTHETIC_ONLY: Use violet reports for the fictional lantern.";
const CORRECTED_BODY = "SYNTHETIC_ONLY: Use amber reports for the fictional lantern.";

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${value.toString(16).padStart(12, "0")}`;
}

function ref(value: number): ContentRefV2 {
  return { contentId: uuid(value), contentVersion: 1 };
}

function expectCode(action: () => unknown, code: string): void {
  assert.throws(action, (error: unknown) => {
    assert.ok(error instanceof CognitiveStoreErrorV2);
    assert.equal(error.code, code);
    return true;
  });
}

function createFixture(t: TestContext) {
  const root = mkdtempSync(join(tmpdir(), "zhiwei-normal-cognition-v2-"));
  const dataRoot = join(root, "data");
  const controlRoot = join(root, "control");
  mkdirSync(dataRoot, { mode: 0o700 });
  let at = T0;
  const clock = { now: () => at };
  let current: SyntheticCognitionStoreV2 | undefined;
  t.after(() => {
    try { current?.close(); }
    finally { rmSync(root, { recursive: true, force: true }); }
  });
  const options = { dataRoot, controlRoot, installationId: "synthetic-installation", clock };
  current = openSyntheticCognitionStoreV2({ ...options, mode: "create" });
  return {
    dataRoot,
    clock,
    get store(): SyntheticCognitionStoreV2 { assert.ok(current); return current; },
    setTime(value: string): void { at = value; },
    close(): void { current?.close(); current = undefined; },
    reopen(): SyntheticCognitionStoreV2 {
      current?.close();
      current = openSyntheticCognitionStoreV2({ ...options, mode: "open" });
      return current;
    },
  };
}

type Fixture = ReturnType<typeof createFixture>;

function stage(fixture: Fixture, content: ContentRefV2, reservation: number,
  body: string, purpose: "observation" | "claim" | "cognition", fence: CognitionFenceV2,
  privacy: PrivacyV2 = "local-only"): ContentRefV2 {
  return fixture.store.stageContent({
    ref: content, reservationId: uuid(reservation), fence, privacy, purpose,
    retentionUntil: RETENTION, bytes: new TextEncoder().encode(body),
  });
}

function observation(content: ContentRefV2, sequence = 1, observedAt = T0, privacy: PrivacyV2 = "local-only"): ObservationV2 {
  return parseObservationV2({
    schemaVersion: 2, id: `synthetic-observation-${sequence}`, revision: 1,
    scope: structuredClone(SCOPE), privacy, sourceTrust: "user-direct",
    observedAt, recordedAt: observedAt, actor: "user", kind: "user_input",
    source: {
      streamId: "synthetic-stream", adapter: "synthetic-adapter", surface: "synthetic",
      sourceSequence: sequence, runtime: null, productSessionId: null,
      runtimeSessionId: null, runtimeInstanceId: null, eventType: "synthetic-user-input",
    },
    correlation: { taskAttempt: null, turnId: null, toolCallId: null, causationId: null, correlationId: null },
    content: { availability: "available", ref: content }, integrity: { status: "complete" },
  });
}

function claim(source: ObservationV2, statement = CLAIM_BODY): MemoryClaimV2 {
  return {
    schemaVersion: 2, id: "synthetic-claim", revision: 1, version: 1,
    scope: structuredClone(SCOPE), privacy: source.privacy, sourceTrust: "user-direct",
    createdAt: T0, updatedAt: T0, kind: "preference", statement, epistemic: "asserted",
    evidence: [{
      source: { kind: "observation", id: source.id, revision: 1 },
      scope: structuredClone(SCOPE), privacy: source.privacy, sourceTrust: source.sourceTrust,
      role: "supports", observedAt: source.observedAt,
    }],
    status: "ACTIVE", validFrom: T0,
  };
}

function appendInitialObservation(fixture: Fixture, privacy: PrivacyV2 = "local-only") {
  const fence = fixture.store.registerScope(SCOPE);
  const content = ref(1);
  stage(fixture, content, 101, OBSERVATION_BODY, "observation", fence, privacy);
  const event = observation(content, 1, T0, privacy);
  const receipt = fixture.store.appendObservation(event, fence, "synthetic-observation-event-1");
  return { fence, content, event, receipt };
}

function commitInitialClaim(fixture: Fixture, privacy: PrivacyV2 = "local-only") {
  const initial = appendInitialObservation(fixture, privacy);
  const content = ref(2);
  const value = claim(initial.event);
  const fence = fixture.store.currentFence(SCOPE);
  stage(fixture, content, 102, value.statement, "claim", fence, privacy);
  const receipt = fixture.store.commitClaim({
    claim: value, expectedRevision: 0, content, fence, eventId: "synthetic-claim-event-1",
  });
  return { observation: initial, content, claim: value, receipt };
}

test("synthetic SQLite creation stages content before atomic Observation and claim publication", t => {
  const fixture = createFixture(t);
  const initialFence = fixture.store.registerScope(SCOPE);
  assert.deepEqual(initialFence, {
    installationId: "synthetic-installation", scope: SCOPE,
    cognitionEpoch: 0, policyEpoch: 0, recoveryEpoch: 0,
  });
  assert.deepEqual(fixture.store.registerScope(SCOPE), initialFence);
  assert.deepEqual(fixture.store.listObservations(SCOPE), []);
  assert.deepEqual(fixture.store.readOutbox(SCOPE), []);
  assert.equal(fixture.store.readClaim(SCOPE, "synthetic-claim"), undefined);

  const observationContent = ref(1);
  assert.deepEqual(stage(fixture, observationContent, 101, OBSERVATION_BODY, "observation", initialFence), observationContent);
  expectCode(() => fixture.store.readContent(SCOPE, observationContent), "unavailable");
  const event = observation(observationContent);
  const observationReceipt = fixture.store.appendObservation(event, initialFence, "synthetic-observation-event-1");
  assert.equal(observationReceipt.replay, false);
  assert.equal(observationReceipt.cognitionEpoch, 0);
  assert.deepEqual(fixture.store.listObservations(SCOPE), [event]);
  assert.equal(new TextDecoder().decode(fixture.store.readContent(SCOPE, observationContent)), OBSERVATION_BODY);
  assert.deepEqual(fixture.store.appendObservation(event, initialFence, "synthetic-observation-event-1"), {
    ...observationReceipt, replay: true,
  });

  const value = claim(event);
  const claimContent = ref(2);
  stage(fixture, claimContent, 102, value.statement, "claim", initialFence);
  expectCode(() => fixture.store.readContent(SCOPE, claimContent), "unavailable");
  const command = { claim: value, expectedRevision: 0, content: claimContent, fence: initialFence, eventId: "synthetic-claim-event-1" };
  const receipt = fixture.store.commitClaim(command);
  assert.equal(receipt.cursor, observationReceipt.cursor + 1);
  assert.equal(receipt.cognitionEpoch, 1);
  assert.equal(receipt.recoveryEpoch, 0);
  assert.equal(receipt.replay, false);
  assert.deepEqual(fixture.store.readClaim(SCOPE, value.id), value);
  assert.equal(new TextDecoder().decode(fixture.store.readContent(SCOPE, claimContent)), value.statement);
  assert.deepEqual(fixture.store.commitClaim(command), { ...receipt, replay: true });
  assert.equal(fixture.store.currentFence(SCOPE).cognitionEpoch, 1);
  assert.deepEqual(fixture.store.readOutbox(SCOPE).map(item => [item.type, item.version, item.publishState]), [
    ["observation.appended", 1, "pending"], ["claim.committed", 1, "pending"],
  ]);
});

test("ordinary close and reopen preserve claims, content, scope fence and outbox", t => {
  const fixture = createFixture(t);
  const initial = commitInitialClaim(fixture);
  const fence = fixture.store.currentFence(SCOPE);
  const outbox = fixture.store.readOutbox(SCOPE);
  const store = fixture.reopen();
  assert.deepEqual(store.currentFence(SCOPE), fence);
  assert.deepEqual(store.readClaim(SCOPE, initial.claim.id), initial.claim);
  assert.deepEqual(store.listObservations(SCOPE), [initial.observation.event]);
  assert.deepEqual(store.readOutbox(SCOPE), outbox);
  assert.equal(new TextDecoder().decode(store.readContent(SCOPE, initial.content)), CLAIM_BODY);
});

test("normal correction commits current version, superseded history, epoch and ordered outbox together", t => {
  const fixture = createFixture(t);
  const initial = commitInitialClaim(fixture);
  fixture.setTime(T1);
  const fence = fixture.store.currentFence(SCOPE);
  const correctionContent = ref(3);
  const corrected: MemoryClaimV2 = {
    ...initial.claim, version: 2, revision: 2, statement: CORRECTED_BODY,
    updatedAt: fixture.clock.now(), supersedes: { claimId: initial.claim.id, version: 1 },
  };
  stage(fixture, correctionContent, 103, corrected.statement, "claim", fence);
  const receipt = fixture.store.commitClaim({
    claim: corrected, expectedRevision: 1, content: correctionContent, fence, eventId: "synthetic-claim-event-2",
  });
  assert.equal(receipt.cognitionEpoch, fence.cognitionEpoch + 1);
  assert.equal(receipt.cursor, initial.receipt.cursor + 1);
  assert.deepEqual(fixture.store.readClaim(SCOPE, corrected.id), corrected);
  assert.deepEqual(fixture.store.readClaim(SCOPE, corrected.id, 1), {
    ...initial.claim, status: "SUPERSEDED", revision: 2, updatedAt: T1,
    supersededBy: { claimId: corrected.id, version: 2 },
  });
  assert.equal(new TextDecoder().decode(fixture.store.readContent(SCOPE, initial.content)), CLAIM_BODY);
  assert.deepEqual(fixture.store.listObservations(SCOPE), [initial.observation.event]);
  const events = fixture.store.readOutbox(SCOPE, initial.receipt.cursor);
  assert.equal(events.length, 1);
  assert.deepEqual(events[0], {
    ...receipt, scope: SCOPE, type: "claim.committed", entityKind: "claim", entityId: corrected.id, version: 2, publishState: "pending",
  });
  fixture.reopen();
  assert.deepEqual(fixture.store.readClaim(SCOPE, corrected.id), corrected);
  assert.equal(fixture.store.readClaim(SCOPE, corrected.id, 1)?.status, "SUPERSEDED");
  assert.equal(fixture.store.currentFence(SCOPE).cognitionEpoch, receipt.cognitionEpoch);
});

test("stale aggregate revision rejects a normal competing correction without publishing its staged content", t => {
  const fixture = createFixture(t);
  const initial = commitInitialClaim(fixture);
  fixture.setTime(T1);
  const fence = fixture.store.currentFence(SCOPE);
  const rejectedContent = ref(3);
  const proposed: MemoryClaimV2 = {
    ...initial.claim, revision: 2, version: 2, statement: CORRECTED_BODY, updatedAt: T1,
    supersedes: { claimId: initial.claim.id, version: 1 },
  };
  stage(fixture, rejectedContent, 103, proposed.statement, "claim", fence);
  const before = fixture.store.readOutbox(SCOPE);
  expectCode(() => fixture.store.commitClaim({
    claim: proposed, expectedRevision: 0, content: rejectedContent, fence, eventId: "synthetic-stale-correction",
  }), "revision_conflict");
  assert.deepEqual(fixture.store.readClaim(SCOPE, initial.claim.id), initial.claim);
  assert.deepEqual(fixture.store.currentFence(SCOPE), fence);
  assert.deepEqual(fixture.store.readOutbox(SCOPE), before);
  expectCode(() => fixture.store.readContent(SCOPE, rejectedContent), "unavailable");
  fixture.reopen();
  assert.deepEqual(fixture.store.readClaim(SCOPE, initial.claim.id), initial.claim);
  assert.deepEqual(fixture.store.readOutbox(SCOPE), before);
  expectCode(() => fixture.store.readContent(SCOPE, rejectedContent), "unavailable");
});

test("outbox consumers acknowledge in cursor order with independent durable cursors", t => {
  const fixture = createFixture(t);
  commitInitialClaim(fixture);
  const [first, second] = fixture.store.readOutbox(SCOPE);
  assert.ok(first && second);
  assert.ok(first.cursor < second.cursor);
  expectCode(() => fixture.store.acknowledgeOutbox(SCOPE, "synthetic-consumer-a", second.eventId, 0), "sequence");
  assert.ok(fixture.store.readOutbox(SCOPE).every(item => item.publishState === "pending"));
  assert.equal(fixture.store.acknowledgeOutbox(SCOPE, "synthetic-consumer-a", first.eventId, 0), first.cursor);
  expectCode(() => fixture.store.acknowledgeOutbox(SCOPE, "synthetic-consumer-a", second.eventId, 0), "revision_conflict");
  assert.deepEqual(fixture.store.readOutbox(SCOPE).map(item => item.publishState), ["published", "pending"]);
  assert.deepEqual(fixture.store.readOutbox(SCOPE, first.cursor).map(item => item.eventId), [second.eventId]);
  fixture.reopen();
  assert.equal(fixture.store.acknowledgeOutbox(SCOPE, "synthetic-consumer-a", second.eventId, first.cursor), second.cursor);
  assert.equal(fixture.store.acknowledgeOutbox(SCOPE, "synthetic-consumer-b", first.eventId, 0), first.cursor);
  assert.equal(fixture.store.acknowledgeOutbox(SCOPE, "synthetic-consumer-b", second.eventId, first.cursor), second.cursor);
  assert.deepEqual(fixture.store.readOutbox(SCOPE, second.cursor), []);
  assert.ok(fixture.store.readOutbox(SCOPE).every(item => item.publishState === "published"));
});

test("normal staged orphan collection removes only unpublished synthetic content", t => {
  const fixture = createFixture(t);
  const initial = commitInitialClaim(fixture);
  const orphan = ref(3);
  const fence = fixture.store.currentFence(SCOPE);
  stage(fixture, orphan, 103, "SYNTHETIC_ONLY: This staged draft was never committed.", "claim", fence);
  assert.deepEqual(fixture.store.collectStagedContent(SCOPE), [orphan]);
  expectCode(() => fixture.store.readContent(SCOPE, orphan), "unavailable");
  assert.deepEqual(fixture.store.readClaim(SCOPE, initial.claim.id), initial.claim);
  assert.equal(new TextDecoder().decode(fixture.store.readContent(SCOPE, initial.content)), CLAIM_BODY);
  assert.deepEqual(fixture.store.collectStagedContent(SCOPE), []);
  const copies = fixture.store.managedCopies(SCOPE, orphan);
  assert.equal(copies.find(item => item.copyKind === "file")?.state, "purged");
  assert.equal(copies.find(item => item.copyKind === "staging")?.state, "purged");
  assert.deepEqual(fixture.store.readOutbox(SCOPE, initial.receipt.cursor).map(item => [item.type, item.entityId]), [
    ["content.orphaned", orphan.contentId],
  ]);
});

test("claim and Observation body bytes remain outside SQLite metadata and its WAL", t => {
  const fixture = createFixture(t);
  const initial = commitInitialClaim(fixture);
  assert.equal(fixture.store.readClaim(SCOPE, initial.claim.id)?.statement, CLAIM_BODY);
  const verifyDatabaseBytes = () => {
    for (const name of ["product.sqlite", "product.sqlite-wal"]) {
      const path = join(fixture.dataRoot, name);
      if (name.endsWith("-wal") && !existsSync(path)) continue;
      const bytes = readFileSync(path);
      assert.equal(bytes.includes(Buffer.from(CLAIM_BODY)), false, `${name} must not contain the claim body`);
      assert.equal(bytes.includes(Buffer.from(OBSERVATION_BODY)), false, `${name} must not contain the Observation body`);
    }
  };
  verifyDatabaseBytes();
  fixture.close();
  verifyDatabaseBytes();
  assert.ok(readFileSync(join(fixture.dataRoot, "product.sqlite")).includes(Buffer.from("synthetic-claim")));
});

test("authorized synthetic logical forget makes content unavailable while managed copies remain pending", t => {
  const fixture = createFixture(t);
  const initial = commitInitialClaim(fixture);
  const before = fixture.store.currentFence(SCOPE);
  fixture.setTime(T1);
  const result = fixture.store.applyControlIntent({
    kind: "FORGET", operationId: "synthetic-user-forget-1", at: fixture.clock.now(),
    authorization: "synthetic-user-request",
    targets: [{ kind: "observation", scope: structuredClone(SCOPE), id: initial.observation.event.id }],
  });
  assert.equal(result.logicalCommitted, true);
  assert.equal(result.controlSequence, 1);
  assert.equal(result.recoveryEpoch, before.recoveryEpoch);
  expectCode(() => fixture.store.readContent(SCOPE, initial.observation.content), "unavailable");
  expectCode(() => fixture.store.readContent(SCOPE, initial.content), "unavailable");
  expectCode(() => fixture.store.readClaim(SCOPE, initial.claim.id), "unavailable");
  expectCode(() => fixture.store.readClaim(SCOPE, initial.claim.id, 1), "unavailable");
  assert.deepEqual(fixture.store.listObservations(SCOPE), [{
    ...initial.observation.event, content: { availability: "unavailable", reason: "policy-blocked" },
  }]);
  assert.ok(fixture.store.currentFence(SCOPE).cognitionEpoch > before.cognitionEpoch);
  for (const content of [initial.observation.content, initial.content]) {
    const copies = fixture.store.managedCopies(SCOPE, content);
    for (const kind of ["file", "staging", "database", "wal"]) {
      assert.equal(copies.find(item => item.copyKind === kind)?.state, "pending");
    }
  }
  const outbox = fixture.store.readOutbox(SCOPE, initial.receipt.cursor);
  assert.equal(outbox.length, 1);
  assert.equal(outbox[0]?.type, "content.forgotten");
  assert.equal(outbox[0]?.publishState, "pending");
  fixture.reopen();
  expectCode(() => fixture.store.readClaim(SCOPE, initial.claim.id), "unavailable");
  assert.equal(fixture.store.managedCopies(SCOPE, initial.content).find(item => item.copyKind === "file")?.state, "pending");
});

function candidate(source: ObservationV2): MemoryCandidateV2 {
  return {
    schemaVersion: 2, id: "synthetic-candidate", revision: 1,
    scope: structuredClone(SCOPE), privacy: source.privacy, sourceTrust: "user-direct",
    createdAt: T0, updatedAt: T0, kind: "preference", statement: CLAIM_BODY,
    epistemic: "asserted", confidence: 0.75, evidence: claim(source).evidence,
    extractor: { kind: "extractor", id: "synthetic-manual-extractor", revision: 1 },
    status: "PENDING", validFrom: T0, expiresAt: RETENTION,
  };
}

function commitCandidate(fixture: Fixture, source: ObservationV2) {
  const record = candidate(source);
  const content = ref(10);
  const fence = fixture.store.currentFence(SCOPE);
  stage(fixture, content, 110, canonicalJsonV1(record), "cognition", fence, record.privacy);
  const command = { record, expectedRevision: 0, content, fence, eventId: "synthetic-candidate-event-1" };
  const receipt = fixture.store.commitCognitiveRecord("candidate", command);
  return { record, content, command, receipt };
}

test("candidate rejection preserves its body and confidence across current and historical lifecycle reads", t => {
  const fixture = createFixture(t);
  const source = appendInitialObservation(fixture);
  assert.equal(fixture.store.readCognitiveRecord("candidate", SCOPE, "synthetic-candidate"), undefined);
  const initial = commitCandidate(fixture, source.event);
  assert.deepEqual(fixture.store.readCognitiveRecord("candidate", SCOPE, initial.record.id), initial.record);
  assert.equal(new TextDecoder().decode(fixture.store.readContent(SCOPE, initial.content)), canonicalJsonV1(initial.record));
  assert.deepEqual(fixture.store.commitCognitiveRecord("candidate", initial.command), { ...initial.receipt, replay: true });
  fixture.setTime(T1);
  const revised: MemoryCandidateV2 = {
    ...initial.record, revision: 2, updatedAt: T1, status: "REJECTED",
  };
  const content = ref(11);
  const fence = fixture.store.currentFence(SCOPE);
  stage(fixture, content, 111, canonicalJsonV1(revised), "cognition", fence);
  const receipt = fixture.store.commitCognitiveRecord("candidate", {
    record: revised, expectedRevision: 1, content, fence, eventId: "synthetic-candidate-event-2",
  });
  assert.equal(receipt.cognitionEpoch, initial.receipt.cognitionEpoch + 1);
  assert.deepEqual(fixture.store.readCognitiveRecord("candidate", SCOPE, revised.id), revised);
  assert.deepEqual(fixture.store.readCognitiveRecord("candidate", SCOPE, revised.id, 1), initial.record);
  assert.deepEqual(fixture.store.readOutbox(SCOPE, source.receipt.cursor).map(event => [event.type, event.version]), [
    ["cognition.committed", 1], ["cognition.committed", 2],
  ]);
  fixture.reopen();
  assert.deepEqual(fixture.store.readCognitiveRecord("candidate", SCOPE, revised.id), revised);
  assert.deepEqual(fixture.store.readCognitiveRecord("candidate", SCOPE, revised.id, 1), initial.record);
  for (const name of ["product.sqlite", "product.sqlite-wal"]) {
    const path = join(fixture.dataRoot, name);
    if (!existsSync(path)) continue;
    const bytes = readFileSync(path);
    assert.equal(bytes.includes(Buffer.from(CLAIM_BODY)), false);
    assert.equal(bytes.includes(Buffer.from(CORRECTED_BODY)), false);
  }
});

test("candidate lifecycle revisions reject statement or confidence changes without publishing staged bodies", t => {
  const fixture = createFixture(t);
  const source = appendInitialObservation(fixture);
  const initial = commitCandidate(fixture, source.event);
  fixture.setTime(T1);
  const fence = fixture.store.currentFence(SCOPE);
  const outbox = fixture.store.readOutbox(SCOPE);
  const changes = [{ statement: CORRECTED_BODY }, { confidence: 0.85 }];
  for (const [index, change] of changes.entries()) {
    const modified: MemoryCandidateV2 = { ...initial.record, revision: 2, updatedAt: T1, ...change };
    const content = ref(20 + index);
    stage(fixture, content, 120 + index, canonicalJsonV1(modified), "cognition", fence);
    expectCode(() => fixture.store.commitCognitiveRecord("candidate", {
      record: modified, expectedRevision: 1, content, fence, eventId: `synthetic-candidate-body-change-${index}`,
    }), "conflict");
    assert.deepEqual(fixture.store.readCognitiveRecord("candidate", SCOPE, initial.record.id), initial.record);
    assert.deepEqual(fixture.store.currentFence(SCOPE), fence);
    assert.deepEqual(fixture.store.readOutbox(SCOPE), outbox);
    expectCode(() => fixture.store.readContent(SCOPE, content), "unavailable");
  }
  fixture.reopen();
  assert.deepEqual(fixture.store.readCognitiveRecord("candidate", SCOPE, initial.record.id), initial.record);
  assert.deepEqual(fixture.store.currentFence(SCOPE), fence);
  assert.deepEqual(fixture.store.readOutbox(SCOPE), outbox);
});

test("ordinary hypothesis and goal snapshots persist their distinct domain roles", t => {
  const fixture = createFixture(t);
  const source = appendInitialObservation(fixture);
  const hypothesis: HypothesisV2 = {
    schemaVersion: 2, id: "synthetic-hypothesis", revision: 1, version: 1,
    scope: structuredClone(SCOPE), privacy: "local-only", sourceTrust: "model-derived",
    createdAt: T0, updatedAt: T0, epistemic: "inferred",
    proposition: "SYNTHETIC_ONLY: A concise lantern report may be useful.",
    evidence: claim(source.event).evidence,
    alternatives: ["SYNTHETIC_ONLY: A detailed lantern report may be useful."],
    verificationQuestions: ["Which fictional report length was requested?"],
    expiresAt: RETENTION, status: "OPEN",
  };
  const hypothesisContent = ref(12);
  let fence = fixture.store.currentFence(SCOPE);
  stage(fixture, hypothesisContent, 112, canonicalJsonV1(hypothesis), "cognition", fence);
  fixture.store.commitCognitiveRecord("hypothesis", {
    record: hypothesis, expectedRevision: 0, content: hypothesisContent, fence, eventId: "synthetic-hypothesis-event-1",
  });
  const goal: GoalV2 = {
    schemaVersion: 2, id: "synthetic-goal", revision: 1,
    scope: structuredClone(SCOPE), privacy: "local-only", sourceTrust: "user-direct",
    createdAt: T0, updatedAt: T0, intent: "Prepare the fictional lantern report.",
    criteria: [{
      id: "synthetic-report-criterion" as CriterionId, revision: 1,
      description: "The fictional report contains its requested color.", required: true, method: "artifact",
    }],
    priority: "normal", confirmation: claim(source.event).evidence[0]!, status: "PROPOSED",
  };
  const goalContent = ref(13);
  fence = fixture.store.currentFence(SCOPE);
  stage(fixture, goalContent, 113, canonicalJsonV1(goal), "cognition", fence);
  fixture.store.commitCognitiveRecord("goal", {
    record: goal, expectedRevision: 0, content: goalContent, fence, eventId: "synthetic-goal-event-1",
  });
  fixture.reopen();
  assert.deepEqual(fixture.store.readCognitiveRecord("hypothesis", SCOPE, hypothesis.id), hypothesis);
  assert.deepEqual(fixture.store.readCognitiveRecord("goal", SCOPE, goal.id), goal);
  assert.equal(fixture.store.readClaim(SCOPE, hypothesis.id), undefined);
  assert.equal(fixture.store.readClaim(SCOPE, goal.id), undefined);
});

test("episode and working-state persistence explicitly remain unsupported without durable Task dependencies", t => {
  const fixture = createFixture(t);
  fixture.store.registerScope(SCOPE);
  for (const kind of ["episode", "working-state"] as const) {
    expectCode(() => fixture.store.readCognitiveRecord(kind, SCOPE, "synthetic-unpersisted-record"), "unsupported");
  }
  assert.deepEqual(fixture.store.readOutbox(SCOPE), []);
});

test("ordinary privacy tightening preserves retained bodies and applies local-only to dependent reads", t => {
  const fixture = createFixture(t);
  const initial = commitInitialClaim(fixture, "model-allowed");
  const snapshot = commitCandidate(fixture, initial.observation.event);
  const before = fixture.store.currentFence(SCOPE);
  fixture.setTime(T1);
  fixture.store.applyControlIntent({
    kind: "PRIVACY_RESTRICT", operationId: "synthetic-privacy-tightening", at: fixture.clock.now(),
    authorization: "synthetic-user-request", privacy: "local-only",
    targets: [{ kind: "observation", scope: structuredClone(SCOPE), id: initial.observation.event.id }],
  });
  assert.deepEqual(fixture.store.readClaim(SCOPE, initial.claim.id), { ...initial.claim, privacy: "local-only" });
  assert.deepEqual(fixture.store.readCognitiveRecord("candidate", SCOPE, snapshot.record.id), { ...snapshot.record, privacy: "local-only" });
  assert.deepEqual(fixture.store.listObservations(SCOPE), [{ ...initial.observation.event, privacy: "local-only" }]);
  assert.equal(new TextDecoder().decode(fixture.store.readContent(SCOPE, initial.observation.content)), OBSERVATION_BODY);
  assert.equal(new TextDecoder().decode(fixture.store.readContent(SCOPE, initial.content)), CLAIM_BODY);
  assert.equal(new TextDecoder().decode(fixture.store.readContent(SCOPE, snapshot.content)), canonicalJsonV1(snapshot.record));
  assert.deepEqual(fixture.store.managedCopies(SCOPE, initial.content), []);
  const after = fixture.store.currentFence(SCOPE);
  assert.ok(after.cognitionEpoch > before.cognitionEpoch);
  assert.equal(after.policyEpoch, before.policyEpoch + 1);
  fixture.reopen();
  assert.equal(fixture.store.readClaim(SCOPE, initial.claim.id)?.privacy, "local-only");
  assert.equal(fixture.store.readCognitiveRecord("candidate", SCOPE, snapshot.record.id)?.privacy, "local-only");
});

test("retention shortening expires dependent reads at the injected time without corrupting the store", t => {
  const fixture = createFixture(t);
  const initial = commitInitialClaim(fixture);
  const snapshot = commitCandidate(fixture, initial.observation.event);
  fixture.store.applyControlIntent({
    kind: "RETENTION_SHORTEN", operationId: "synthetic-retention-shortening", at: fixture.clock.now(),
    authorization: "synthetic-retention-policy", retentionUntil: T1,
    targets: [{ kind: "observation", scope: structuredClone(SCOPE), id: initial.observation.event.id }],
  });
  assert.deepEqual(fixture.store.readClaim(SCOPE, initial.claim.id), initial.claim);
  assert.deepEqual(fixture.store.readCognitiveRecord("candidate", SCOPE, snapshot.record.id), snapshot.record);
  const fence = fixture.store.currentFence(SCOPE);
  const outbox = fixture.store.readOutbox(SCOPE);
  fixture.setTime(T1);
  for (const content of [initial.observation.content, initial.content, snapshot.content]) {
    expectCode(() => fixture.store.readContent(SCOPE, content), "unavailable");
  }
  expectCode(() => fixture.store.readClaim(SCOPE, initial.claim.id), "unavailable");
  expectCode(() => fixture.store.readCognitiveRecord("candidate", SCOPE, snapshot.record.id), "unavailable");
  assert.deepEqual(fixture.store.listObservations(SCOPE), [{
    ...initial.observation.event, content: { availability: "unavailable", reason: "policy-blocked" },
  }]);
  assert.deepEqual(fixture.store.currentFence(SCOPE), fence);
  assert.deepEqual(fixture.store.readOutbox(SCOPE), outbox);
  fixture.reopen();
  assert.deepEqual(fixture.store.currentFence(SCOPE), fence);
  assert.deepEqual(fixture.store.readOutbox(SCOPE), outbox);
  expectCode(() => fixture.store.readClaim(SCOPE, initial.claim.id), "unavailable");
  expectCode(() => fixture.store.readCognitiveRecord("candidate", SCOPE, snapshot.record.id), "unavailable");
});

test("future-valid claim is unavailable until its explicit validFrom time", t => {
  const fixture = createFixture(t);
  const source = appendInitialObservation(fixture);
  const future: MemoryClaimV2 = { ...claim(source.event), validFrom: T1 };
  const content = ref(2);
  const fence = fixture.store.currentFence(SCOPE);
  stage(fixture, content, 102, future.statement, "claim", fence);
  fixture.store.commitClaim({
    claim: future, expectedRevision: 0, content, fence, eventId: "synthetic-future-valid-claim",
  });
  expectCode(() => fixture.store.readClaim(SCOPE, future.id), "unavailable");
  expectCode(() => fixture.store.readClaim(SCOPE, future.id, 1), "unavailable");
  fixture.reopen();
  expectCode(() => fixture.store.readClaim(SCOPE, future.id), "unavailable");
  fixture.setTime(T1);
  assert.deepEqual(fixture.store.readClaim(SCOPE, future.id), future);
});

test("unsupported evidence fragment references leave ordinary staged claim and candidate unpublished", t => {
  const fixture = createFixture(t);
  const source = appendInitialObservation(fixture);
  const original = claim(source.event);
  const fragmented: MemoryClaimV2 = {
    ...original, evidence: original.evidence.map(item => ({ ...item, fragmentId: "synthetic-fragment" })),
  };
  const content = ref(2);
  const fence = fixture.store.currentFence(SCOPE);
  stage(fixture, content, 102, fragmented.statement, "claim", fence);
  const before = fixture.store.readOutbox(SCOPE);
  expectCode(() => fixture.store.commitClaim({
    claim: fragmented, expectedRevision: 0, content, fence, eventId: "synthetic-fragment-claim",
  }), "unsupported");
  const record: MemoryCandidateV2 = { ...candidate(source.event), evidence: fragmented.evidence };
  const candidateContent = ref(10);
  stage(fixture, candidateContent, 110, canonicalJsonV1(record), "cognition", fence);
  expectCode(() => fixture.store.commitCognitiveRecord("candidate", {
    record, expectedRevision: 0, content: candidateContent, fence, eventId: "synthetic-fragment-candidate",
  }), "unsupported");
  assert.equal(fixture.store.readClaim(SCOPE, original.id), undefined);
  assert.equal(fixture.store.readCognitiveRecord("candidate", SCOPE, record.id), undefined);
  for (const item of [content, candidateContent]) expectCode(() => fixture.store.readContent(SCOPE, item), "unavailable");
  assert.deepEqual(fixture.store.currentFence(SCOPE), fence);
  assert.deepEqual(fixture.store.readOutbox(SCOPE), before);
});

test("normal source forget and managed purge keep claim and candidate dependencies unavailable after reopen", t => {
  const fixture = createFixture(t);
  const initial = commitInitialClaim(fixture);
  const snapshot = commitCandidate(fixture, initial.observation.event);
  fixture.setTime(T1);
  fixture.store.applyControlIntent({
    kind: "FORGET", operationId: "synthetic-forget-derived-material", at: fixture.clock.now(),
    authorization: "synthetic-user-request",
    targets: [{ kind: "observation", scope: structuredClone(SCOPE), id: initial.observation.event.id }],
  });
  const contents = [initial.observation.content, initial.content, snapshot.content];
  for (const content of contents) expectCode(() => fixture.store.readContent(SCOPE, content), "unavailable");
  expectCode(() => fixture.store.readClaim(SCOPE, initial.claim.id), "unavailable");
  expectCode(() => fixture.store.readCognitiveRecord("candidate", SCOPE, snapshot.record.id), "unavailable");
  const fence = fixture.store.currentFence(SCOPE);
  const outbox = fixture.store.readOutbox(SCOPE);
  for (const content of contents) {
    const copies = fixture.store.purgeContent(SCOPE, content);
    for (const kind of ["file", "staging", "database", "wal"]) {
      assert.equal(copies.find(copy => copy.copyKind === kind)?.state, "purged");
    }
  }
  fixture.reopen();
  for (const content of contents) expectCode(() => fixture.store.readContent(SCOPE, content), "unavailable");
  expectCode(() => fixture.store.readClaim(SCOPE, initial.claim.id), "unavailable");
  expectCode(() => fixture.store.readClaim(SCOPE, initial.claim.id, 1), "unavailable");
  expectCode(() => fixture.store.readCognitiveRecord("candidate", SCOPE, snapshot.record.id), "unavailable");
  expectCode(() => fixture.store.readCognitiveRecord("candidate", SCOPE, snapshot.record.id, 1), "unavailable");
  assert.deepEqual(fixture.store.currentFence(SCOPE), fence);
  assert.deepEqual(fixture.store.readOutbox(SCOPE), outbox);
  assert.deepEqual(fixture.store.listObservations(SCOPE), [{
    ...initial.observation.event, content: { availability: "unavailable", reason: "purged" },
  }]);
  assert.deepEqual(fixture.store.collectOrphanFiles(), []);
});

test("explicit control epoch transition on the current store quarantines earlier projection events", t => {
  const fixture = createFixture(t);
  const initial = commitInitialClaim(fixture);
  const before = fixture.store.currentFence(SCOPE);
  const previousOutbox = fixture.store.readOutbox(SCOPE);
  fixture.setTime(T1);
  // Exercise the legitimate control transition only. No backup is created,
  // imported, substituted or restored by this test.
  const receipt = fixture.store.applyControlIntent({
    kind: "RESTORE_BEGIN", operationId: "synthetic-epoch-transition", at: fixture.clock.now(),
    authorization: "synthetic-recovery-request", expectedRecoveryEpoch: before.recoveryEpoch,
  });
  assert.equal(receipt.logicalCommitted, true);
  assert.equal(receipt.recoveryEpoch, before.recoveryEpoch + 1);
  const after = fixture.store.currentFence(SCOPE);
  assert.equal(after.recoveryEpoch, receipt.recoveryEpoch);
  assert.equal(after.cognitionEpoch, before.cognitionEpoch + 1);
  assert.equal(after.policyEpoch, before.policyEpoch + 1);
  assert.deepEqual(fixture.store.readOutbox(SCOPE), previousOutbox.map(event => ({ ...event, publishState: "quarantined" })));
  expectCode(() => stage(fixture, ref(3), 103, "SYNTHETIC_ONLY: A stale staged proposal.", "claim", before), "revision_conflict");
  assert.deepEqual(fixture.store.readClaim(SCOPE, initial.claim.id), initial.claim);
  const newScope: ScopeV2 = { kind: "workspace", workspaceId: "synthetic-new-workspace" };
  const newFence = fixture.store.registerScope(newScope);
  assert.equal(newFence.recoveryEpoch, receipt.recoveryEpoch);
  assert.equal(newFence.cognitionEpoch, 0);
  assert.equal(newFence.policyEpoch, 0);
  assert.deepEqual(fixture.store.listObservations(newScope), []);
  assert.deepEqual(fixture.store.readOutbox(newScope), []);
  const content = ref(4);
  stage(fixture, content, 104, "SYNTHETIC_ONLY: A new observation in the current epoch.", "observation", after);
  const event = observation(content, 2, T1);
  const appended = fixture.store.appendObservation(event, after, "synthetic-current-epoch-observation");
  assert.equal(appended.recoveryEpoch, receipt.recoveryEpoch);
  assert.equal(fixture.store.readOutbox(SCOPE).at(-1)?.publishState, "pending");
  fixture.reopen();
  assert.deepEqual(fixture.store.currentFence(SCOPE), after);
  assert.deepEqual(fixture.store.currentFence(newScope), newFence);
  assert.deepEqual(fixture.store.listObservations(SCOPE), [initial.observation.event, event]);
  assert.deepEqual(fixture.store.readOutbox(SCOPE).map(item => item.publishState), ["quarantined", "quarantined", "pending"]);
});

test("normal adapter-written unregistered fixture body is collected without removing registered content", t => {
  const fixture = createFixture(t);
  const initial = commitInitialClaim(fixture);
  const files = ContentFilesV2.open({ contentRoot: join(fixture.dataRoot, "content") });
  const orphan = { contentId: uuid(99), version: 1, reservationId: uuid(199) };
  // A valid new adapter-produced body that has no business reservation. This
  // does not edit, replace or corrupt any registered content or SQLite row.
  const descriptor = files.stage(orphan, new TextEncoder().encode("SYNTHETIC_ONLY: An unregistered fictional draft."));
  files.publish(descriptor);
  const fence = fixture.store.currentFence(SCOPE);
  const outbox = fixture.store.readOutbox(SCOPE);
  assert.deepEqual(fixture.store.collectOrphanFiles(), [{ contentId: orphan.contentId, version: orphan.version, state: "removed" }]);
  assert.deepEqual(fixture.store.collectOrphanFiles(), []);
  assert.deepEqual(fixture.store.readClaim(SCOPE, initial.claim.id), initial.claim);
  assert.equal(new TextDecoder().decode(fixture.store.readContent(SCOPE, initial.content)), CLAIM_BODY);
  assert.deepEqual(fixture.store.currentFence(SCOPE), fence);
  assert.deepEqual(fixture.store.readOutbox(SCOPE), outbox);
  fixture.reopen();
  assert.deepEqual(fixture.store.collectOrphanFiles(), []);
  assert.deepEqual(fixture.store.readClaim(SCOPE, initial.claim.id), initial.claim);
});
