import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import {
  type ContentRefV2, type CriterionId, type EvidenceRefV2, type GoalV2,
  type HypothesisV2, type MemoryCandidateV2, type MemoryClaimV2, type ScopeV2,
} from "../../domain/src/index.ts";
import {
  acceptMemoryCandidate, correctMemoryClaim, createGoal, createHypothesis, createMemoryCandidate,
  reviseGoal, transitionGoal, transitionHypothesis,
  type CandidateAcceptanceV2, type CognitionChangeV2,
} from "../../cognition-core/src/index.ts";
import { canonicalJsonV1, parseObservationV2 } from "../../protocol/src/index.ts";
import { CognitiveStoreErrorV2, openSyntheticCognitionStoreV2, type SyntheticCognitionStoreV2 } from "../../memory-store/src/index.ts";

// Development integration through public package entrances only. All inputs,
// times and identities are fictional. These tests do not certify product scenarios
// or run restricted backup/replacement/preintegration diagnostics.
const T0 = "2026-10-10T00:00:00.000Z";
const T1 = "2026-10-10T01:00:00.000Z";
const T2 = "2026-10-10T02:00:00.000Z";
const T3 = "2026-10-10T03:00:00.000Z";
const END = "2026-11-10T00:00:00.000Z";
const SCOPE: ScopeV2 = { kind: "workspace", workspaceId: "synthetic-core-store-workspace" };

function uuid(value: number): string {
  return `10000000-0000-4000-8000-${value.toString(16).padStart(12, "0")}`;
}

function fixture(t: TestContext) {
  const root = mkdtempSync(join(tmpdir(), "zhiwei-core-store-v2-"));
  const dataRoot = join(root, "data");
  mkdirSync(dataRoot, { mode: 0o700 });
  let at = T0;
  let nextContent = 0;
  let nextSource = 0;
  let store: SyntheticCognitionStoreV2 | undefined;
  const options = { dataRoot, controlRoot: join(root, "control"), installationId: "synthetic-core-store-installation", clock: { now: () => at } };
  t.after(() => {
    try { store?.close(); }
    finally { rmSync(root, { recursive: true, force: true }); }
  });
  store = openSyntheticCognitionStoreV2({ ...options, mode: "create" });
  store.registerScope(SCOPE);
  return {
    get store(): SyntheticCognitionStoreV2 { assert.ok(store); return store; },
    now: () => at,
    setTime(value: string): void { at = value; },
    reopen(): void {
      store?.close();
      store = openSyntheticCognitionStoreV2({ ...options, mode: "open" });
    },
    stage(body: string, purpose: "observation" | "claim" | "cognition"): ContentRefV2 {
      assert.ok(store);
      const number = ++nextContent;
      const ref = { contentId: uuid(number), contentVersion: 1 };
      store.stageContent({
        ref, reservationId: uuid(1000 + number), fence: store.currentFence(SCOPE),
        privacy: "local-only", purpose, retentionUntil: END, bytes: new TextEncoder().encode(body),
      });
      return ref;
    },
    observe(statement: string): EvidenceRefV2 {
      assert.ok(store);
      const sequence = ++nextSource;
      const content = this.stage(statement, "observation");
      const observation = parseObservationV2({
        schemaVersion: 2, id: `synthetic-source-${sequence}`, revision: 1,
        scope: structuredClone(SCOPE), privacy: "local-only", sourceTrust: "user-direct",
        observedAt: at, recordedAt: at, actor: "user", kind: "user_input",
        source: {
          streamId: "synthetic-core-store-stream", adapter: "synthetic-adapter", surface: "synthetic",
          sourceSequence: sequence, runtime: null, productSessionId: null,
          runtimeSessionId: null, runtimeInstanceId: null, eventType: "synthetic-user-input",
        },
        correlation: { taskAttempt: null, turnId: null, toolCallId: null, causationId: null, correlationId: null },
        content: { availability: "available", ref: content }, integrity: { status: "complete" },
      });
      store.appendObservation(observation, store.currentFence(SCOPE), `synthetic-observation-event-${sequence}`);
      return {
        source: { kind: "observation", id: observation.id, revision: 1 },
        scope: structuredClone(SCOPE), privacy: observation.privacy, sourceTrust: observation.sourceTrust,
        role: "supports", observedAt: at,
      };
    },
  };
}

type Fixture = ReturnType<typeof fixture>;

function change(revision: number, now: string): CognitionChangeV2 {
  return { expectedRevision: revision, nextRevision: revision + 1, now };
}

function candidate(id: string, statement: string, evidence: EvidenceRefV2, now: string): MemoryCandidateV2 {
  return createMemoryCandidate({
    schemaVersion: 2, id, revision: 1, scope: structuredClone(SCOPE), privacy: "local-only",
    sourceTrust: "user-direct", createdAt: now, updatedAt: now, kind: "preference", statement,
    epistemic: "asserted", confidence: 0.8, evidence: [evidence],
    extractor: { kind: "extractor", id: "synthetic-manual-extractor", revision: 1 },
    status: "PENDING", validFrom: now, expiresAt: END,
  });
}

function confirmation(record: MemoryCandidateV2, evidence: EvidenceRefV2, now: string): CandidateAcceptanceV2 {
  return {
    kind: "user-confirmation", candidate: { kind: "candidate", id: record.id, revision: record.revision },
    statement: record.statement, checkedAt: now, evidence,
  };
}

function saveCandidate(f: Fixture, record: MemoryCandidateV2) {
  const content = f.stage(canonicalJsonV1(record), "cognition");
  return f.store.commitCognitiveRecord("candidate", {
    record, expectedRevision: record.revision - 1, content, fence: f.store.currentFence(SCOPE),
    eventId: `synthetic-candidate-${record.id}-${record.revision}`,
  });
}

function saveGoal(f: Fixture, record: GoalV2) {
  const content = f.stage(canonicalJsonV1(record), "cognition");
  return f.store.commitCognitiveRecord("goal", {
    record, expectedRevision: record.revision - 1, content, fence: f.store.currentFence(SCOPE),
    eventId: `synthetic-goal-${record.id}-${record.revision}`,
  });
}

function saveHypothesis(f: Fixture, record: HypothesisV2) {
  const content = f.stage(canonicalJsonV1(record), "cognition");
  return f.store.commitCognitiveRecord("hypothesis", {
    record, expectedRevision: record.revision - 1, content, fence: f.store.currentFence(SCOPE),
    eventId: `synthetic-hypothesis-${record.id}-${record.revision}`,
  });
}

function saveAcceptance(f: Fixture, record: MemoryCandidateV2, claim: MemoryClaimV2, eventId: string) {
  const candidateContent = f.stage(canonicalJsonV1(record), "cognition");
  const claimContent = f.stage(claim.statement, "claim");
  const command = {
    candidate: record, candidateExpectedRevision: record.revision - 1, candidateContent,
    claim, claimExpectedRevision: claim.revision - 1, claimContent,
    fence: f.store.currentFence(SCOPE), eventId,
  };
  return { receipt: f.store.commitCandidateAcceptance(command), command };
}

test("actual core acceptance and correction snapshots commit candidate and claim together through public SQLite store", t => {
  const f = fixture(t);
  const originalText = "SYNTHETIC_ONLY: Use violet reports for the fictional lantern.";
  const initial = candidate("synthetic-original-candidate", originalText, f.observe(originalText), f.now());
  saveCandidate(f, initial);
  f.setTime(T1);
  const acceptanceEvidence = f.observe("SYNTHETIC_ONLY: I confirm the fictional violet-report preference.");
  const accepted = acceptMemoryCandidate(initial, change(initial.revision, f.now()), "synthetic-core-claim",
    confirmation(initial, acceptanceEvidence, f.now()));
  const first = saveAcceptance(f, accepted.candidate, accepted.claim, "synthetic-acceptance-1");
  assert.equal(first.receipt.candidate.replay, false);
  assert.equal(first.receipt.claim.replay, false);
  assert.notEqual(first.receipt.candidate.cursor, first.receipt.claim.cursor);
  assert.deepEqual(f.store.readCognitiveRecord("candidate", SCOPE, initial.id), accepted.candidate);
  assert.deepEqual(f.store.readCognitiveRecord("candidate", SCOPE, initial.id, 1), initial);
  assert.deepEqual(f.store.readClaim(SCOPE, accepted.claim.id), accepted.claim);
  const replay = f.store.commitCandidateAcceptance(first.command);
  assert.deepEqual(replay, {
    candidate: { ...first.receipt.candidate, replay: true }, claim: { ...first.receipt.claim, replay: true },
  });
  f.reopen();
  assert.deepEqual(f.store.readCognitiveRecord("candidate", SCOPE, initial.id), accepted.candidate);
  assert.deepEqual(f.store.readClaim(SCOPE, accepted.claim.id), accepted.claim);

  f.setTime(T2);
  const revisedText = "SYNTHETIC_ONLY: Use amber reports for the fictional lantern.";
  const revisedCandidate = candidate("synthetic-correction-candidate", revisedText, f.observe(revisedText), f.now());
  saveCandidate(f, revisedCandidate);
  f.setTime(T3);
  const correctionEvidence = f.observe("SYNTHETIC_ONLY: I confirm replacing the fictional violet preference with amber.");
  const corrected = correctMemoryClaim(accepted.claim, change(accepted.claim.revision, f.now()), accepted.claim.version,
    revisedCandidate, change(revisedCandidate.revision, f.now()), confirmation(revisedCandidate, correctionEvidence, f.now()));
  const correctedReceipt = saveAcceptance(f, corrected.candidate, corrected.current, "synthetic-acceptance-2").receipt;
  assert.equal(correctedReceipt.candidate.replay, false);
  assert.equal(correctedReceipt.claim.replay, false);
  assert.equal(corrected.current.createdAt, T3, "Store must preserve the actual core correction snapshot without rewriting its creation time");
  assert.deepEqual(f.store.readClaim(SCOPE, corrected.current.id), corrected.current);
  assert.deepEqual(f.store.readClaim(SCOPE, corrected.current.id, 1), corrected.previous);
  assert.deepEqual(f.store.readCognitiveRecord("candidate", SCOPE, revisedCandidate.id), corrected.candidate);
  assert.deepEqual(f.store.readCognitiveRecord("candidate", SCOPE, revisedCandidate.id, 1), revisedCandidate);
  f.reopen();
  assert.deepEqual(f.store.readClaim(SCOPE, corrected.current.id), corrected.current);
  assert.deepEqual(f.store.readClaim(SCOPE, corrected.current.id, 1), corrected.previous);
  assert.deepEqual(f.store.readCognitiveRecord("candidate", SCOPE, revisedCandidate.id), corrected.candidate);
  const committed = f.store.readOutbox(SCOPE).filter(event => event.type === "claim.committed");
  assert.deepEqual(committed.map(event => event.version), [1, 2]);
});

for (const initialStatus of ["ACTIVE", "PAUSED"] as const) {
  test(`actual core ${initialStatus} goal revision persists its reset to PROPOSED and prior history`, t => {
    const f = fixture(t);
    const initial = createGoal({
      schemaVersion: 2, id: `synthetic-goal-${initialStatus.toLowerCase()}`, revision: 1,
      scope: structuredClone(SCOPE), privacy: "local-only", sourceTrust: "user-direct",
      createdAt: T0, updatedAt: T0, intent: "Prepare a concise fictional lantern report.",
      criteria: [{ id: "synthetic-report-criterion" as CriterionId, revision: 1,
        description: "The fictional report includes the requested color.", required: true, method: "user-confirmation" }],
      priority: "normal", deadline: END, confirmation: f.observe("SYNTHETIC_ONLY: Prepare the fictional report."), status: "PROPOSED",
    });
    saveGoal(f, initial);
    f.setTime(T1);
    let current = transitionGoal(initial, change(initial.revision, f.now()), {
      kind: "activate", confirmation: f.observe("SYNTHETIC_ONLY: Activate the fictional report goal."),
    }).current;
    saveGoal(f, current);
    if (initialStatus === "PAUSED") {
      f.setTime(T2);
      current = transitionGoal(current, change(current.revision, f.now()), {
        kind: "pause", confirmation: f.observe("SYNTHETIC_ONLY: Pause the fictional report goal."),
      }).current;
      saveGoal(f, current);
    }
    f.setTime(T3);
    const revised = reviseGoal(current, change(current.revision, f.now()), {
      intent: "Prepare a detailed fictional lantern report.",
      criteria: [{ ...current.criteria[0]!, revision: 2, description: "The detailed fictional report includes the requested color." }],
      priority: "high", confirmation: f.observe("SYNTHETIC_ONLY: Revise the goal to request a detailed report."),
    });
    assert.equal(revised.current.status, "PROPOSED");
    saveGoal(f, revised.current);
    assert.deepEqual(f.store.readCognitiveRecord("goal", SCOPE, initial.id), revised.current);
    assert.deepEqual(f.store.readCognitiveRecord("goal", SCOPE, initial.id, current.revision), revised.previous);
    assert.deepEqual(f.store.readCognitiveRecord("goal", SCOPE, initial.id, 1), initial);
    f.reopen();
    assert.deepEqual(f.store.readCognitiveRecord("goal", SCOPE, initial.id), revised.current);
    assert.deepEqual(f.store.readCognitiveRecord("goal", SCOPE, initial.id, current.revision), revised.previous);
  });
}

for (const target of ["SUPPORTED", "WITHDRAWN"] as const) {
  test(`actual core hypothesis ${target} transition preserves immutable version while advancing revision`, t => {
    const f = fixture(t);
    const initial = createHypothesis({
      schemaVersion: 2, id: `synthetic-hypothesis-${target.toLowerCase()}`, revision: 1, version: 1,
      scope: structuredClone(SCOPE), privacy: "local-only", sourceTrust: "model-derived",
      createdAt: T0, updatedAt: T0, epistemic: "inferred",
      proposition: "SYNTHETIC_ONLY: A concise fictional lantern report may be clearer.",
      evidence: [f.observe("SYNTHETIC_ONLY: The fictional lantern report can be concise or detailed.")],
      alternatives: ["A detailed fictional report may be clearer."],
      verificationQuestions: ["Which fictional report is preferred?"], expiresAt: END, status: "OPEN",
    });
    saveHypothesis(f, initial);
    f.setTime(T1);
    const evidence = f.observe(`SYNTHETIC_ONLY: The fictional hypothesis is ${target.toLowerCase()}.`);
    const transitioned = transitionHypothesis(initial, change(initial.revision, f.now()), initial.version,
      target === "SUPPORTED" ? { kind: "support", evidence: [evidence] } : { kind: "withdraw", confirmation: evidence });
    assert.equal(transitioned.current.version, initial.version);
    assert.equal(transitioned.current.revision, initial.revision + 1);
    assert.equal(transitioned.current.status, target);
    saveHypothesis(f, transitioned.current);
    assert.deepEqual(f.store.readCognitiveRecord("hypothesis", SCOPE, initial.id), transitioned.current);
    assert.deepEqual(f.store.readCognitiveRecord("hypothesis", SCOPE, initial.id, 1), initial);
    f.reopen();
    assert.deepEqual(f.store.readCognitiveRecord("hypothesis", SCOPE, initial.id), transitioned.current);
    assert.deepEqual(f.store.readCognitiveRecord("hypothesis", SCOPE, initial.id, 1), initial);
    assert.equal(f.store.readClaim(SCOPE, initial.id), undefined);
  });
}

test("candidate acceptance rolls back the new claim when its second aggregate has a stale revision", t => {
  const f = fixture(t);
  const text = "SYNTHETIC_ONLY: Use green reports for the fictional lantern.";
  const initial = candidate("synthetic-competing-candidate", text, f.observe(text), f.now());
  saveCandidate(f, initial);
  f.setTime(T1);
  const accepted = acceptMemoryCandidate(initial, change(initial.revision, f.now()), "synthetic-rollback-claim",
    confirmation(initial, f.observe("SYNTHETIC_ONLY: I confirm the fictional green-report preference."), f.now()));
  const candidateContent = f.stage(canonicalJsonV1(accepted.candidate), "cognition");
  const claimContent = f.stage(accepted.claim.statement, "claim");
  const fence = f.store.currentFence(SCOPE);
  const outbox = f.store.readOutbox(SCOPE);
  const command = {
    candidate: accepted.candidate, candidateExpectedRevision: 0, candidateContent,
    claim: accepted.claim, claimExpectedRevision: 0, claimContent, fence,
    eventId: "synthetic-atomic-acceptance-retry",
  };
  assert.throws(() => f.store.commitCandidateAcceptance(command), (error: unknown) => {
    assert.ok(error instanceof CognitiveStoreErrorV2);
    assert.equal(error.code, "revision_conflict");
    return true;
  });
  assert.equal(f.store.readClaim(SCOPE, accepted.claim.id), undefined);
  assert.deepEqual(f.store.readCognitiveRecord("candidate", SCOPE, initial.id), initial);
  assert.deepEqual(f.store.currentFence(SCOPE), fence);
  assert.deepEqual(f.store.readOutbox(SCOPE), outbox);
  for (const content of [candidateContent, claimContent]) {
    assert.throws(() => f.store.readContent(SCOPE, content), (error: unknown) => {
      assert.ok(error instanceof CognitiveStoreErrorV2);
      assert.equal(error.code, "unavailable");
      return true;
    });
  }
  f.reopen();
  assert.equal(f.store.readClaim(SCOPE, accepted.claim.id), undefined);
  assert.deepEqual(f.store.readCognitiveRecord("candidate", SCOPE, initial.id), initial);
  assert.deepEqual(f.store.currentFence(SCOPE), fence);
  assert.deepEqual(f.store.readOutbox(SCOPE), outbox);
  const receipt = f.store.commitCandidateAcceptance({ ...command, candidateExpectedRevision: initial.revision });
  assert.equal(receipt.claim.replay, false);
  assert.equal(receipt.candidate.replay, false);
  assert.deepEqual(f.store.readClaim(SCOPE, accepted.claim.id), accepted.claim);
  assert.deepEqual(f.store.readCognitiveRecord("candidate", SCOPE, initial.id), accepted.candidate);
  assert.equal(f.store.readOutbox(SCOPE).length, outbox.length + 2);
});

test("actual accepted candidate requires the joint commit and remains pending after a separate commit attempt", t => {
  const f = fixture(t);
  const statement = "SYNTHETIC_ONLY: Use silver reports for the fictional lantern.";
  const initial = candidate("synthetic-joint-only-candidate", statement, f.observe(statement), f.now());
  saveCandidate(f, initial);
  f.setTime(T1);
  const accepted = acceptMemoryCandidate(initial, change(initial.revision, f.now()), "synthetic-joint-only-claim",
    confirmation(initial, f.observe("SYNTHETIC_ONLY: I confirm the fictional silver-report preference."), f.now()));
  const candidateContent = f.stage(canonicalJsonV1(accepted.candidate), "cognition");
  const fence = f.store.currentFence(SCOPE);
  const outbox = f.store.readOutbox(SCOPE);
  assert.throws(() => f.store.commitCognitiveRecord("candidate", {
    record: accepted.candidate, expectedRevision: initial.revision, content: candidateContent, fence,
    eventId: "synthetic-separate-accepted-candidate",
  }), (error: unknown) => {
    assert.ok(error instanceof CognitiveStoreErrorV2);
    assert.equal(error.code, "unsupported");
    return true;
  });
  assert.deepEqual(f.store.readCognitiveRecord("candidate", SCOPE, initial.id), initial);
  assert.equal(f.store.readClaim(SCOPE, accepted.claim.id), undefined);
  assert.deepEqual(f.store.currentFence(SCOPE), fence);
  assert.deepEqual(f.store.readOutbox(SCOPE), outbox);
  assert.throws(() => f.store.readContent(SCOPE, candidateContent), (error: unknown) => {
    assert.ok(error instanceof CognitiveStoreErrorV2);
    assert.equal(error.code, "unavailable");
    return true;
  });
  const claimContent = f.stage(accepted.claim.statement, "claim");
  const receipt = f.store.commitCandidateAcceptance({
    candidate: accepted.candidate, candidateExpectedRevision: initial.revision, candidateContent,
    claim: accepted.claim, claimExpectedRevision: 0, claimContent, fence,
    eventId: "synthetic-joint-only-acceptance",
  });
  assert.equal(receipt.candidate.replay, false);
  assert.equal(receipt.claim.replay, false);
  assert.deepEqual(f.store.readCognitiveRecord("candidate", SCOPE, initial.id), accepted.candidate);
  assert.deepEqual(f.store.readClaim(SCOPE, accepted.claim.id), accepted.claim);
  assert.equal(new TextDecoder().decode(f.store.readContent(SCOPE, candidateContent)), canonicalJsonV1(accepted.candidate));
  assert.equal(f.store.readOutbox(SCOPE).length, outbox.length + 2);
  f.reopen();
  assert.deepEqual(f.store.readCognitiveRecord("candidate", SCOPE, initial.id), accepted.candidate);
  assert.deepEqual(f.store.readClaim(SCOPE, accepted.claim.id), accepted.claim);
});
