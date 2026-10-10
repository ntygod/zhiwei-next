import assert from "node:assert/strict";
import test from "node:test";
import {
  DomainValidationErrorV2,
  type MemoryCandidateV2, type MemoryClaimV2, type EvidenceRefV2, type ScopeV2,
  type HypothesisV2, type GoalV2, type AcceptanceCriterion, type CriterionId,
} from "../../domain/src/index.ts";
import {
  createMemoryCandidate, transitionMemoryCandidate, acceptMemoryCandidate, correctMemoryClaim,
  transitionMemoryClaim, createHypothesis, transitionHypothesis, createGoal, transitionGoal, reviseGoal,
  type CognitionChangeV2, type CandidateAcceptanceV2, type GoalCriterionResultV2,
  type GoalActionV2, type HypothesisActionV2, type ClaimLifecycleActionV2,
} from "./index.ts";

const T0 = "2026-10-01T00:00:00.000Z";
const T1 = "2026-10-02T00:00:00.000Z";
const T2 = "2026-10-03T00:00:00.000Z";
const T3 = "2026-10-04T00:00:00.000Z";
const T4 = "2026-10-05T00:00:00.000Z";
const END = "2026-10-31T00:00:00.000Z";
const scope: ScopeV2 = { kind: "workspace", workspaceId: "workspace-a" };
const otherScope: ScopeV2 = { kind: "workspace", workspaceId: "workspace-b" };

function evidence(id = "observation-source", overrides: Partial<EvidenceRefV2> = {}): EvidenceRefV2 {
  return { source: { kind: "observation", id, revision: 1 }, scope: { ...scope }, privacy: "model-allowed",
    sourceTrust: "user-direct", role: "supports", observedAt: T0, ...overrides };
}
function candidate(overrides: Partial<MemoryCandidateV2> = {}): MemoryCandidateV2 {
  return { schemaVersion: 2, id: "candidate-a", revision: 1, scope: { ...scope }, privacy: "model-allowed",
    sourceTrust: "user-direct", createdAt: T0, updatedAt: T0, kind: "preference", statement: "Use concise summaries",
    epistemic: "asserted", confidence: 0.9, evidence: [evidence()], extractor: { kind: "extractor", id: "explicit-input", revision: 1 },
    status: "PENDING", validFrom: T0, validUntil: END, expiresAt: END, ...overrides };
}
function change(revision = 1, now = T1): CognitionChangeV2 {
  return { expectedRevision: revision, nextRevision: revision + 1, now };
}
function confirmation(input: MemoryCandidateV2, at = T1): CandidateAcceptanceV2 {
  return { kind: "user-confirmation", candidate: { kind: "candidate", id: input.id, revision: input.revision },
    statement: input.statement, checkedAt: at, evidence: evidence("observation-confirm", { observedAt: at }) };
}
function claim(): MemoryClaimV2 {
  const input = candidate();
  return acceptMemoryCandidate(input, change(), "claim-a", confirmation(input)).claim;
}
function hypothesis(overrides: Partial<HypothesisV2> = {}): HypothesisV2 {
  return { schemaVersion: 2, id: "hypothesis-a", revision: 1, version: 1, scope: { ...scope }, privacy: "model-allowed",
    sourceTrust: "model-derived", createdAt: T0, updatedAt: T0, epistemic: "inferred", proposition: "The shorter draft may be clearer",
    evidence: [evidence("observation-inference", { sourceTrust: "model-derived" })], alternatives: ["The difference may be topic familiarity"],
    verificationQuestions: ["Does the user prefer the shorter draft?"], expiresAt: END, status: "OPEN", ...overrides };
}
function criterion(overrides: Partial<AcceptanceCriterion> = {}): AcceptanceCriterion {
  return { id: "criterion-a" as CriterionId, revision: 1, description: "User confirms the draft meets the goal",
    required: true, method: "user-confirmation", ...overrides };
}
function goal(overrides: Partial<GoalV2> = {}): GoalV2 {
  return { schemaVersion: 2, id: "goal-a", revision: 1, scope: { ...scope }, privacy: "model-allowed", sourceTrust: "user-direct",
    createdAt: T0, updatedAt: T0, intent: "Prepare a concise draft", criteria: [criterion()], priority: "normal", deadline: END,
    confirmation: evidence(), status: "PROPOSED", ...overrides };
}
function activeGoal(): GoalV2 {
  return transitionGoal(createGoal(goal()), change(), { kind: "activate", confirmation: evidence("activate", { observedAt: T1 }) }).current;
}
function result(input: GoalV2, overrides: Partial<GoalCriterionResultV2> = {}): GoalCriterionResultV2 {
  return { goal: { kind: "goal", id: input.id, revision: input.revision }, criterion: input.criteria[0], status: "pass",
    evidence: [evidence("verify-goal", { observedAt: T2 })], checkedAt: T2, validUntil: END, ...overrides };
}
function rejects(fn: () => unknown, code?: string): void {
  assert.throws(fn, (error: unknown) => error instanceof DomainValidationErrorV2 && (code === undefined || error.error.code === code));
}
function frozen(value: unknown): void {
  if (value !== null && typeof value === "object") {
    assert.equal(Object.isFrozen(value), true);
    for (const child of Object.values(value)) frozen(child);
  }
}

test("formal candidate creation and acceptance are deterministic, detached, and explicitly attributed", () => {
  const input = candidate();
  const original = structuredClone(input);
  const created = createMemoryCandidate(input);
  const proof = confirmation(created);
  const accepted = acceptMemoryCandidate(created, change(), "claim-a", proof);
  assert.deepEqual(accepted, acceptMemoryCandidate(created, change(), "claim-a", proof));
  assert.equal(accepted.candidate.status, "ACCEPTED");
  assert.equal(accepted.candidate.revision, 2);
  assert.deepEqual(accepted.candidate.acceptedClaim, { claimId: "claim-a", version: 1 });
  assert.equal(accepted.claim.epistemic, "asserted");
  assert.equal(accepted.claim.status, "ACTIVE");
  assert.equal(accepted.claim.validFrom, T0);
  assert.equal(accepted.claim.createdAt, T1);
  assert.equal(accepted.claim.evidence.length, 2);
  assert.equal("grant" in accepted.claim, false);
  assert.deepEqual(input, original);
  assert.equal(Object.isFrozen(input), false);
  assert.notEqual(created.scope, input.scope);
  assert.notEqual(accepted.claim.evidence[0], input.evidence[0]);
  frozen(created); frozen(accepted);
  (input.evidence[0].source as { id: string }).id = "changed-input";
  assert.equal(accepted.claim.evidence[0].source.id, "observation-source");
});

test("candidate construction refuses missing evidence, invalid confidence, inherited and unknown fields", () => {
  for (const confidence of [-1, 1.01, NaN, Infinity]) rejects(() => createMemoryCandidate(candidate({ confidence })));
  rejects(() => createMemoryCandidate(candidate({ evidence: [] })));
  rejects(() => createMemoryCandidate(candidate({ revision: 2 })));
  rejects(() => createMemoryCandidate(candidate({ status: "REJECTED" })), "invalid_transition");
  rejects(() => createMemoryCandidate(candidate({ expiresAt: T0 })));
  rejects(() => createMemoryCandidate({ ...candidate(), granted: true } as MemoryCandidateV2));
  rejects(() => createMemoryCandidate(Object.assign(Object.create({ admin: true }), candidate())));
});

test("candidate rejection/expiry preserves input and rejects terminal rollback and early expiry", () => {
  const input = candidate();
  const before = structuredClone(input);
  const rejected = transitionMemoryCandidate(input, change(), "REJECTED");
  const expired = transitionMemoryCandidate(input, change(1, END), "EXPIRED");
  assert.equal(rejected.status, "REJECTED"); assert.equal(expired.status, "EXPIRED");
  assert.deepEqual(input, before); frozen(rejected); frozen(expired);
  rejects(() => transitionMemoryCandidate(input, change(), "EXPIRED"), "invalid_transition");
  rejects(() => transitionMemoryCandidate(rejected, change(2, T2), "EXPIRED"), "invalid_transition");
  rejects(() => transitionMemoryCandidate(input, change(), "ACCEPTED" as "REJECTED"), "invalid_transition");
  rejects(() => acceptMemoryCandidate(input, change(1, END), "claim-a", confirmation(input, END)), "invalid_transition");
});

test("model-derived and external sources cannot self-confirm; independent confirmation retains their provenance", () => {
  const input = candidate({ sourceTrust: "model-derived", epistemic: "inferred",
    evidence: [evidence("model-observation", { sourceTrust: "model-derived" })] });
  const proof = confirmation(input);
  for (const sourceTrust of ["model-derived", "external-content", "verified-tool"] as const) {
    rejects(() => acceptMemoryCandidate(input, change(), "claim-a", { ...proof, evidence: evidence("source", { sourceTrust }) }), "evidence_invalid");
  }
  rejects(() => acceptMemoryCandidate(input, change(), "claim-a", { ...proof,
    evidence: evidence("model-observation", { observedAt: T1 }) }), "evidence_invalid");
  const accepted = acceptMemoryCandidate(input, change(), "claim-a", proof);
  assert.equal(accepted.claim.epistemic, "asserted");
  assert.equal(accepted.claim.sourceTrust, "user-direct");
  assert.equal(accepted.claim.evidence[0].sourceTrust, "model-derived");
  assert.equal(accepted.claim.evidence[1].sourceTrust, "user-direct");
  const verified = acceptMemoryCandidate(input, change(), "claim-b", {
    kind: "structured-verification", candidate: proof.candidate, statement: input.statement, checkedAt: T1,
    evidence: evidence("verification", { sourceTrust: "verified-tool", observedAt: T1 }),
    validator: { kind: "validator", id: "field-validator", revision: 3 },
  });
  assert.equal(verified.claim.epistemic, "verified");
  assert.equal(verified.acceptance.kind, "structured-verification");
});

test("acceptance requires exact binding, statement, current time and non-widening evidence", () => {
  const input = candidate(); const proof = confirmation(input);
  const invalid: CandidateAcceptanceV2[] = [
    { ...proof, candidate: { kind: "candidate", id: "other", revision: 1 } },
    { ...proof, candidate: { kind: "candidate", id: input.id, revision: 2 } },
    { ...proof, statement: "The opposite of the supplied statement" },
    { ...proof, checkedAt: T2 },
    { ...proof, evidence: evidence("refute", { role: "refutes" }) },
    { ...proof, evidence: evidence("future", { observedAt: T2 }) },
    { ...proof, evidence: evidence("other-workspace", { scope: otherScope }) },
    { ...proof, evidence: evidence("private", { privacy: "local-only" }) },
    { ...proof, authorized: true } as unknown as CandidateAcceptanceV2,
    { ...proof, kind: "model-confirmation" } as unknown as CandidateAcceptanceV2,
    { ...proof, kind: "structured-verification" } as CandidateAcceptanceV2,
  ];
  for (const item of invalid) rejects(() => acceptMemoryCandidate(input, change(), "claim-a", item));
  const later = candidate({ createdAt: T1, updatedAt: T1 });
  rejects(() => acceptMemoryCandidate(later, change(1, T2), "claim-a", confirmation(later, T0)), "evidence_invalid");
  rejects(() => acceptMemoryCandidate(candidate({ scope: { kind: "global" } }), change(), "claim-a", proof), "scope_conflict");
});

test("equivalent evidence property ordering deduplicates, conflicting same-source metadata fails", () => {
  const input = candidate();
  const source = input.evidence[0];
  const reordered = { observedAt: source.observedAt, role: source.role, sourceTrust: source.sourceTrust,
    privacy: source.privacy, scope: { workspaceId: "workspace-a", kind: "workspace" } as ScopeV2,
    source: { revision: 1, id: source.source.id, kind: "observation" } as const };
  const proof = { ...confirmation(input), evidence: reordered };
  assert.equal(acceptMemoryCandidate(input, change(), "claim-a", proof).claim.evidence.length, 1);
  rejects(() => acceptMemoryCandidate(input, change(), "claim-a", { ...proof,
    evidence: { ...source, observedAt: T1 } }), "evidence_invalid");
});

test("correction preserves immutable old content, changes version and aggregate CAS, and retains exact lineage", () => {
  const current = claim(); const before = structuredClone(current);
  const replacement = candidate({ id: "candidate-correction", statement: "Use detailed summaries", createdAt: T2,
    updatedAt: T2, validFrom: T0, evidence: [evidence("correction-source", { observedAt: T2 })] });
  const correction = correctMemoryClaim(current, change(1, T2), 1, replacement, change(1, T2), confirmation(replacement, T2));
  assert.deepEqual(current, before);
  assert.equal(correction.previous.status, "SUPERSEDED");
  assert.equal(correction.previous.version, 1);
  assert.equal(correction.previous.revision, 2);
  assert.equal(correction.current.version, 2);
  assert.equal(correction.current.revision, 2);
  assert.equal(correction.current.id, current.id);
  assert.deepEqual(correction.current.supersedes, { claimId: current.id, version: 1 });
  assert.deepEqual(correction.previous.supersededBy, { claimId: current.id, version: 2 });
  assert.equal(correction.previous.validUntil, END);
  assert.equal(correction.current.validFrom, T0);
  assert.deepEqual(correction.previous.evidence, current.evidence);
  assert.deepEqual(correction.current.scope, current.scope);
  frozen(correction);
  const third = candidate({ ...replacement, id: "candidate-third", createdAt: T3, updatedAt: T3,
    evidence: [evidence("third-source", { observedAt: T3 })] });
  const next = correctMemoryClaim(correction.current, change(2, T3), 2, third, change(1, T3), confirmation(third, T3));
  assert.equal(next.current.version, 3); assert.equal(next.current.revision, 3);
  assert.equal(correction.current.version, 2);
});

test("correction rejects scope/kind/privacy drift, stale version/time, model correction and overflow", () => {
  const current = claim();
  const replacement = candidate({ id: "correction", createdAt: T2, updatedAt: T2,
    evidence: [evidence("correction-source", { observedAt: T2 })] });
  const run = (input: MemoryCandidateV2, base = current, version = base.version, at = T2) =>
    correctMemoryClaim(base, change(base.revision, at), version, input, change(input.revision, at), confirmation(input, at));
  rejects(() => run(candidate({ ...replacement, scope: otherScope, evidence: [evidence("other", { scope: otherScope, observedAt: T2 })] })), "scope_conflict");
  rejects(() => run(candidate({ ...replacement, privacy: "local-only" })), "validation");
  rejects(() => run(candidate({ ...replacement, kind: "fact" })), "validation");
  rejects(() => run(replacement, current, 2), "revision_conflict");
  rejects(() => run(replacement, { ...current, status: "FORGOTTEN" }), "invalid_transition");
  rejects(() => correctMemoryClaim(current, change(1, T2), 1, replacement, change(1, T3), confirmation(replacement, T2)), "validation");
  const proof = confirmation(replacement, T2);
  rejects(() => correctMemoryClaim(current, change(1, T2), 1, replacement, change(1, T2), {
    ...proof, kind: "structured-verification", evidence: evidence("tool", { sourceTrust: "verified-tool", observedAt: T2 }),
    validator: { kind: "validator", id: "validator", revision: 1 },
  }), "evidence_invalid");
  rejects(() => run(replacement, { ...current, version: Number.MAX_SAFE_INTEGER,
    supersedes: { claimId: current.id, version: Number.MAX_SAFE_INTEGER - 1 } }));
});

test("claim lifecycle preserves immutable version evidence and carries new refutations separately", () => {
  const input = claim(); const before = structuredClone(input);
  const refuting = evidence("refutation", { role: "refutes", sourceTrust: "verified-tool", observedAt: T2 });
  const disputed = transitionMemoryClaim(input, change(1, T2), 1, { kind: "dispute", evidence: [refuting] });
  assert.equal(disputed.current.status, "DISPUTED");
  assert.deepEqual(disputed.current.evidence, input.evidence);
  assert.equal(disputed.current.version, input.version);
  assert.deepEqual(disputed.action, { kind: "dispute", evidence: [refuting] });
  assert.deepEqual(input, before); frozen(disputed);
  rejects(() => transitionMemoryClaim(input, change(1, T2), 1, { kind: "dispute", evidence: [] }));
  rejects(() => transitionMemoryClaim(input, change(1, T2), 1, { kind: "dispute", evidence: [evidence()] }), "evidence_invalid");
  rejects(() => transitionMemoryClaim(input, change(1, T2), 1, { kind: "dispute", evidence: [{ ...refuting, scope: otherScope }] }), "scope_conflict");
  rejects(() => transitionMemoryClaim(input, change(1, T2), 2, { kind: "expire" }), "revision_conflict");
  rejects(() => transitionMemoryClaim(input, change(1, T2), 1, { kind: "expire" }), "invalid_transition");
  const expired = transitionMemoryClaim(input, change(1, END), 1, { kind: "expire" });
  assert.equal(expired.current.status, "EXPIRED");
  const forgotten = transitionMemoryClaim(expired.current, change(2, END), 1,
    { kind: "forget", confirmation: evidence("forget", { observedAt: END }) });
  assert.equal(forgotten.current.status, "FORGOTTEN");
  assert.deepEqual(forgotten.current.evidence, input.evidence);
  rejects(() => transitionMemoryClaim(forgotten.current, change(3, END), 1, { kind: "dispute", evidence: [refuting] }), "invalid_transition");
  rejects(() => transitionMemoryClaim(input, change(1, T2), 1, { kind: "forget", confirmation: evidence("model", { sourceTrust: "model-derived" }) }), "evidence_invalid");
});

test("forgetting a superseded version retains its successor identity", () => {
  const input = claim(); const replacement = candidate({ id: "replacement", createdAt: T2, updatedAt: T2 });
  const corrected = correctMemoryClaim(input, change(1, T2), 1, replacement, change(1, T2), confirmation(replacement, T2));
  const forgotten = transitionMemoryClaim(corrected.previous, change(2, T3), 1,
    { kind: "forget", confirmation: evidence("forget-old", { observedAt: T3 }) });
  assert.deepEqual(forgotten.current.supersededBy, corrected.previous.supersededBy);
  assert.equal(corrected.previous.status, "SUPERSEDED");
});

test("hypothesis findings are independent, history-preserving and remain inferred", () => {
  const input = hypothesis(); const created = createHypothesis(input);
  const supporting = evidence("finding", { observedAt: T1, sourceTrust: "verified-tool" });
  const supported = transitionHypothesis(created, change(), 1, { kind: "support", evidence: [supporting] });
  assert.equal(supported.current.status, "SUPPORTED");
  assert.equal(supported.current.epistemic, "inferred");
  assert.deepEqual(supported.current.evidence, input.evidence);
  assert.equal("claim" in supported, false); assert.equal("grant" in supported, false);
  assert.equal(input.status, "OPEN"); assert.equal(Object.isFrozen(input), false); frozen(supported);
  const refuted = transitionHypothesis(created, change(), 1, { kind: "refute", evidence: [{ ...supporting, role: "refutes" }] });
  assert.equal(refuted.current.status, "REFUTED");
  assert.equal(transitionHypothesis(created, change(1, END), 1, { kind: "expire" }).current.status, "EXPIRED");
  assert.equal(transitionHypothesis(created, change(), 1, { kind: "withdraw", confirmation: evidence("withdraw", { observedAt: T1 }) }).current.status, "WITHDRAWN");
  rejects(() => transitionHypothesis(supported.current, change(2, T2), 1, { kind: "support", evidence: [supporting] }), "invalid_transition");
});

test("hypothesis invalid lifecycle, no evidence, wrong source, reused source and expired findings fail", () => {
  const input = hypothesis();
  rejects(() => createHypothesis(hypothesis({ evidence: [] })));
  rejects(() => createHypothesis(hypothesis({ version: 2 })));
  rejects(() => createHypothesis(hypothesis({ status: "SUPPORTED" })), "invalid_transition");
  rejects(() => transitionHypothesis(input, change(), 2, { kind: "expire" }), "revision_conflict");
  rejects(() => transitionHypothesis(input, change(), 1, { kind: "expire" }), "invalid_transition");
  rejects(() => transitionHypothesis(input, change(), 1, { kind: "support", evidence: [] }));
  for (const sourceTrust of ["external-content", "model-derived"] as const) {
    rejects(() => transitionHypothesis(input, change(), 1, { kind: "support", evidence: [evidence("finding", { sourceTrust })] }), "evidence_invalid");
  }
  rejects(() => transitionHypothesis(input, change(), 1, { kind: "support", evidence: [evidence("observation-inference")] }), "evidence_invalid");
  rejects(() => transitionHypothesis(input, change(), 1, { kind: "support", evidence: [evidence("other", { scope: otherScope })] }), "scope_conflict");
  rejects(() => transitionHypothesis(input, change(1, END), 1, { kind: "support", evidence: [evidence("finding", { observedAt: END })] }), "invalid_transition");
});

test("goal lifecycle requires direct confirmations and completion of bound criteria, preserving every snapshot", () => {
  const input = goal(); const created = createGoal(input);
  const active = transitionGoal(created, change(), { kind: "activate", confirmation: evidence("activate", { observedAt: T1 }) });
  const paused = transitionGoal(active.current, change(2, T2), { kind: "pause", confirmation: evidence("pause", { observedAt: T2 }) });
  const resumed = transitionGoal(paused.current, change(3, T3), { kind: "resume", confirmation: evidence("resume", { observedAt: T3 }) });
  const achieved = transitionGoal(resumed.current, change(4, T4), { kind: "achieve",
    results: [result(resumed.current, { checkedAt: T4, evidence: [evidence("complete", { observedAt: T4 })] })] });
  assert.equal(achieved.current.status, "ACHIEVED");
  assert.equal(achieved.current.revision, 5);
  assert.equal(achieved.action.kind, "achieve");
  assert.equal(input.status, "PROPOSED"); assert.equal(Object.isFrozen(input.criteria), false);
  assert.equal(paused.current.status, "PAUSED"); frozen(achieved);
  rejects(() => transitionGoal(achieved.current, change(5, T4), { kind: "resume", confirmation: evidence("resume-again", { observedAt: T4 }) }), "invalid_transition");
  const abandoned = transitionGoal(created, change(), { kind: "abandon", confirmation: evidence("abandon", { observedAt: T1 }) });
  assert.equal(abandoned.current.status, "ABANDONED");
  rejects(() => transitionGoal(abandoned.current, change(2, T2), { kind: "activate", confirmation: evidence("again", { observedAt: T2 }) }), "invalid_transition");
});

test("goal cannot be created or controlled by model evidence, and pause/resume edges are enforced", () => {
  rejects(() => createGoal(goal({ sourceTrust: "model-derived" })));
  rejects(() => createGoal(goal({ confirmation: evidence("model", { sourceTrust: "model-derived" }) })));
  rejects(() => createGoal(goal({ criteria: [] })));
  rejects(() => createGoal(goal({ criteria: [criterion({ revision: 2 })] })), "revision_conflict");
  rejects(() => createGoal(goal({ status: "ACHIEVED" })), "invalid_transition");
  const input = goal();
  rejects(() => transitionGoal(input, change(), { kind: "pause", confirmation: evidence("pause", { observedAt: T1 }) }), "invalid_transition");
  rejects(() => transitionGoal(input, change(), { kind: "activate", confirmation: evidence("model", { sourceTrust: "model-derived", observedAt: T1 }) }), "evidence_invalid");
  rejects(() => transitionGoal(input, change(), { kind: "activate", confirmation: evidence("other", { scope: otherScope, observedAt: T1 }) }), "scope_conflict");
});

test("unknown, failure, not-applicable and model self-report never satisfy required Goal criteria", () => {
  const input = activeGoal();
  for (const status of ["unknown", "fail", "not-applicable"] as const) {
    rejects(() => transitionGoal(input, change(2, T2), { kind: "achieve", results: [result(input, { status })] }), "invalid_transition");
  }
  rejects(() => transitionGoal(input, change(2, T2), { kind: "achieve", results: [] }), "evidence_invalid");
  rejects(() => transitionGoal(input, change(2, T2), { kind: "achieve", results: [result(input, { evidence: [] })] }), "evidence_invalid");
  rejects(() => transitionGoal(input, change(2, T2), { kind: "achieve", results: [result(input,
    { evidence: [evidence("model-says-complete", { sourceTrust: "model-derived", observedAt: T2 })] })] }), "evidence_invalid");
  const modelCriterion = { ...input, criteria: [criterion({ method: "model-assisted" })] };
  rejects(() => transitionGoal(modelCriterion, change(2, T2), { kind: "achieve", results: [result(modelCriterion)] }), "evidence_invalid");
});

test("goal results reject stale identity, changed criteria, duplicate/incomplete sets, stale time and widened scope", () => {
  const input = activeGoal();
  const invalid: GoalCriterionResultV2[] = [
    result(input, { goal: { kind: "goal", id: "other", revision: input.revision } }),
    result(input, { goal: { kind: "goal", id: input.id, revision: input.revision - 1 } }),
    result(input, { criterion: { ...input.criteria[0], description: "Easier replacement standard" } }),
    result(input, { criterion: { ...input.criteria[0], method: "model-assisted" } }),
    result(input, { checkedAt: T0 }), result(input, { checkedAt: T3 }), result(input, { validUntil: T2 }),
    result(input, { evidence: [evidence("future", { observedAt: T3 })] }),
    result(input, { evidence: [evidence("other", { scope: otherScope, observedAt: T2 })] }),
    result(input, { evidence: [evidence("local", { privacy: "local-only", observedAt: T2 })] }),
  ];
  for (const item of invalid) rejects(() => transitionGoal(input, change(2, T2), { kind: "achieve", results: [item] }));
  const two = { ...input, criteria: [...input.criteria, criterion({ id: "optional" as CriterionId, required: false })] };
  rejects(() => transitionGoal(two, change(2, T2), { kind: "achieve", results: [result(two), result(two)] }), "evidence_invalid");
  const achieved = transitionGoal(two, change(2, T2), { kind: "achieve", results: [result(two), result(two,
    { criterion: two.criteria[1], status: "not-applicable", evidence: [] })] });
  assert.equal(achieved.current.status, "ACHIEVED");
  const tool = { ...input, criteria: [criterion({ method: "deterministic-test" })] };
  assert.equal(transitionGoal(tool, change(2, T2), { kind: "achieve", results: [result(tool,
    { evidence: [evidence("test-result", { sourceTrust: "verified-tool", observedAt: T2 })] })] }).current.status, "ACHIEVED");
});

test("goal revision preserves history/scope, requires new direct confirmation, and resets for reactivation", () => {
  const input = activeGoal(); const before = structuredClone(input);
  const revision = { intent: "Prepare a more detailed draft", criteria: [criterion({ revision: 2, description: "User confirms the detailed draft" })],
    priority: "high" as const, confirmation: evidence("revision", { observedAt: T2 }) };
  const revised = reviseGoal(input, change(2, T2), revision);
  assert.deepEqual(input, before);
  assert.deepEqual(revised.previous, before);
  assert.equal(revised.current.status, "PROPOSED"); assert.equal(revised.current.revision, 3);
  assert.equal(revised.current.criteria[0].revision, 2);
  assert.deepEqual(revised.current.scope, input.scope);
  assert.equal("deadline" in revised.current, false);
  frozen(revised);
  rejects(() => reviseGoal(input, change(2, T2), { ...revision, confirmation: evidence("model", { sourceTrust: "model-derived", observedAt: T2 }) }), "evidence_invalid");
  rejects(() => reviseGoal(input, change(2, T2), { ...revision, confirmation: evidence("old", { observedAt: T0 }) }), "evidence_invalid");
  rejects(() => reviseGoal(input, change(2, T2), { ...revision, criteria: [criterion({ description: "Changed without new revision" })] }), "revision_conflict");
  rejects(() => reviseGoal(input, change(2, T2), { ...revision, scope: otherScope } as typeof revision), "validation");
  rejects(() => reviseGoal({ ...input, status: "ACHIEVED" }, change(2, T2), revision), "invalid_transition");
});

test("every mutation rejects stale CAS, revision jumps/overflow, backwards time and extra command fields", () => {
  const inputCandidate = candidate(); const inputClaim = claim(); const inputHypothesis = hypothesis(); const inputGoal = goal();
  const mutations = [
    (c: CognitionChangeV2) => transitionMemoryCandidate(inputCandidate, c, "REJECTED"),
    (c: CognitionChangeV2) => acceptMemoryCandidate(inputCandidate, c, "claim-a", confirmation(inputCandidate)),
    (c: CognitionChangeV2) => transitionMemoryClaim(inputClaim, c, 1, { kind: "forget", confirmation: evidence("forget", { observedAt: T1 }) }),
    (c: CognitionChangeV2) => transitionHypothesis(inputHypothesis, c, 1, { kind: "withdraw", confirmation: evidence("withdraw", { observedAt: T1 }) }),
    (c: CognitionChangeV2) => transitionGoal(inputGoal, c, { kind: "activate", confirmation: evidence("activate", { observedAt: T1 }) }),
  ];
  for (const mutation of mutations) {
    rejects(() => mutation({ ...change(), expectedRevision: 2 }), "revision_conflict");
    rejects(() => mutation({ ...change(), nextRevision: 3 }), "revision_conflict");
    rejects(() => mutation({ ...change(), nextRevision: Number.MAX_SAFE_INTEGER + 1 }));
    rejects(() => mutation({ ...change(), now: "2026-09-01T00:00:00.000Z" }), "validation");
    rejects(() => mutation({ ...change(), now: "2026-10-02T00:00:00Z" }), "validation");
    rejects(() => mutation({ ...change(), authorized: true } as CognitionChangeV2), "validation");
  }
  rejects(() => transitionMemoryCandidate(candidate({ revision: Number.MAX_SAFE_INTEGER }),
    { expectedRevision: Number.MAX_SAFE_INTEGER, nextRevision: Number.MAX_SAFE_INTEGER + 1, now: T1 }, "REJECTED"));
});

test("accessor discriminants, evidence-array getters, holes and unknown fields are rejected without execution", () => {
  let reads = 0;
  const accessor = { get kind() { reads += 1; return "forget"; } };
  rejects(() => transitionMemoryClaim(claim(), change(), 1, accessor as ClaimLifecycleActionV2));
  rejects(() => transitionHypothesis(hypothesis(), change(), 1, accessor as HypothesisActionV2));
  rejects(() => transitionGoal(goal(), change(), accessor as GoalActionV2));
  const input = candidate();
  const acceptance = { ...confirmation(input), get kind() { reads += 1; return "user-confirmation" as const; } };
  rejects(() => acceptMemoryCandidate(input, change(), "claim-a", acceptance));
  const refs: EvidenceRefV2[] = [];
  Object.defineProperty(refs, "0", { enumerable: true, get() { reads += 1; return evidence(); } });
  rejects(() => transitionMemoryClaim(claim(), change(), 1, { kind: "dispute", evidence: refs }));
  rejects(() => transitionHypothesis(hypothesis(), change(), 1, { kind: "support", evidence: refs }));
  const active = activeGoal();
  rejects(() => transitionGoal(active, change(2, T2), { kind: "achieve", results: [result(active, { evidence: refs })] }));
  rejects(() => transitionGoal(active, change(2, T2), { kind: "achieve", results: Array(1) }));
  rejects(() => transitionMemoryClaim(claim(), change(), 1, { kind: "expire", authorized: true } as ClaimLifecycleActionV2));
  assert.equal(reads, 0);
});

test("action evidence rejects duplicate identities and conflicting immutable Observation metadata", () => {
  const input = claim();
  const refuting = evidence("refuting", { role: "refutes", observedAt: T2 });
  rejects(() => transitionMemoryClaim(input, change(1, T2), 1,
    { kind: "dispute", evidence: [refuting, structuredClone(refuting)] }), "evidence_invalid");
  rejects(() => transitionMemoryClaim(input, change(1, T2), 1,
    { kind: "dispute", evidence: [evidence("observation-source", { role: "refutes", observedAt: T2 })] }), "evidence_invalid");
  const finding = evidence("finding", { observedAt: T1 });
  rejects(() => transitionHypothesis(hypothesis(), change(), 1,
    { kind: "support", evidence: [finding, finding] }), "evidence_invalid");
  const active = activeGoal();
  rejects(() => transitionGoal(active, change(2, T2), { kind: "achieve", results: [result(active,
    { evidence: [finding, finding] })] }), "evidence_invalid");
});

test("correction explicitly rejects a fully valid other-scope replacement and never relaxes local-only", () => {
  const input = claim();
  const replacement = candidate({ id: "other-candidate", scope: otherScope, createdAt: T2, updatedAt: T2,
    evidence: [evidence("other-source", { scope: otherScope, observedAt: T2 })] });
  const proof = { ...confirmation(replacement, T2), evidence: evidence("other-confirmation", { scope: otherScope, observedAt: T2 }) };
  rejects(() => correctMemoryClaim(input, change(1, T2), 1, replacement, change(1, T2), proof), "scope_conflict");
  const privateCandidate = candidate({ privacy: "local-only", evidence: [evidence("private-source", { privacy: "local-only" })] });
  const accepted = acceptMemoryCandidate(privateCandidate, change(), "private-claim", {
    ...confirmation(privateCandidate), evidence: evidence("private-confirm", { privacy: "local-only", observedAt: T1 }),
  });
  assert.equal(accepted.claim.privacy, "local-only");
  const publicReplacement = candidate({ id: "public-replacement", createdAt: T2, updatedAt: T2 });
  rejects(() => correctMemoryClaim(accepted.claim, change(1, T2), 1, publicReplacement, change(1, T2),
    confirmation(publicReplacement, T2)), "validation");
});

test("Goal achievement rejects one immutable Observation with conflicting metadata across criteria", () => {
  const input = { ...activeGoal(), privacy: "local-only" as const, criteria: [criterion(),
    criterion({ id: "criterion-b" as CriterionId, method: "deterministic-test" })] };
  const first = result(input, { evidence: [evidence("shared-proof", { observedAt: T2 })] });
  const second = result(input, { criterion: input.criteria[1],
    evidence: [evidence("shared-proof", { sourceTrust: "verified-tool", observedAt: T2 })] });
  rejects(() => transitionGoal(input, change(2, T2), { kind: "achieve", results: [first, second] }), "evidence_invalid");

  const sameMethods = { ...input, criteria: [criterion(), criterion({ id: "criterion-b" as CriterionId })] };
  for (const conflicting of [
    { privacy: "local-only" as const },
    { scope: { kind: "global" } as ScopeV2 },
    { observedAt: T3 },
  ]) {
    const other = result(sameMethods, { criterion: sameMethods.criteria[1], checkedAt: T3,
      evidence: [evidence("shared-proof", { observedAt: T2, fragmentId: "second-fragment", ...conflicting })] });
    rejects(() => transitionGoal(sameMethods, change(2, T3), { kind: "achieve", results: [first, other] }), "evidence_invalid");
  }
});

test("Goal completion cannot reuse its request confirmation or stale evidence by changing checkedAt", () => {
  const input = activeGoal();
  rejects(() => transitionGoal(input, change(2, T2), { kind: "achieve",
    results: [result(input, { evidence: [input.confirmation] })] }), "evidence_invalid");
  rejects(() => transitionGoal(input, change(2, T2), { kind: "achieve",
    results: [result(input, { evidence: [evidence("stale-independent-proof", { observedAt: T0 })] })] }), "evidence_invalid");
  // Even simultaneous creation/activation does not turn the original request into completion evidence.
  const simultaneous = transitionGoal(goal(), change(1, T0),
    { kind: "activate", confirmation: evidence("activate", { observedAt: T0 }) }).current;
  rejects(() => transitionGoal(simultaneous, change(2, T2), { kind: "achieve",
    results: [result(simultaneous, { evidence: [{ ...simultaneous.confirmation, fragmentId: "other-fragment" }] })] }), "evidence_invalid");
  const withOptional = { ...input, criteria: [criterion(), criterion({ id: "optional" as CriterionId, required: false })] };
  rejects(() => transitionGoal(withOptional, change(2, T2), { kind: "achieve", results: [result(withOptional),
    result(withOptional, { criterion: withOptional.criteria[1], status: "fail", evidence: [evidence("stale-failure", { observedAt: T0 })] })] }), "evidence_invalid");
});

test("multiple Goal criteria may reuse an identical current Observation regardless of result order", () => {
  const input = { ...activeGoal(), criteria: [criterion(), criterion({ id: "criterion-b" as CriterionId })] };
  const shared = evidence("shared-valid-proof", { observedAt: T2 });
  const results = [result(input, { evidence: [shared], checkedAt: T2 }),
    result(input, { criterion: input.criteria[1], evidence: [structuredClone(shared)], checkedAt: T3 })];
  const before = structuredClone(results);
  for (const ordered of [results, [...results].reverse()]) {
    const achieved = transitionGoal(input, change(2, T3), { kind: "achieve", results: ordered });
    assert.equal(achieved.current.status, "ACHIEVED");
    frozen(achieved);
  }
  assert.deepEqual(results, before);
  assert.equal(input.status, "ACTIVE");
});

test("Goal results must strictly postdate activation, resume and revision watermarks", () => {
  const activation = evidence("activation-confirmation", { observedAt: T1 });
  const active = transitionGoal(goal(), change(1, T1), { kind: "activate", confirmation: activation }).current;
  for (const proof of [activation, evidence("same-time-independent-source", { observedAt: T1 })]) {
    rejects(() => transitionGoal(active, change(2, T2), { kind: "achieve", results: [result(active, { evidence: [proof] })] }), "evidence_invalid");
  }
  const optional = { ...active, criteria: [...active.criteria, criterion({ id: "optional" as CriterionId, required: false })] };
  rejects(() => transitionGoal(optional, change(2, T2), { kind: "achieve", results: [result(optional),
    result(optional, { criterion: optional.criteria[1], status: "fail", evidence: [activation] })] }), "evidence_invalid");
  const paused = transitionGoal(active, change(2, T2),
    { kind: "pause", confirmation: evidence("pause-confirmation", { observedAt: T2 }) }).current;
  const resume = evidence("resume-confirmation", { observedAt: T3 });
  const resumed = transitionGoal(paused, change(3, T3), { kind: "resume", confirmation: resume }).current;
  rejects(() => transitionGoal(resumed, change(4, T4), { kind: "achieve",
    results: [result(resumed, { checkedAt: T4, evidence: [resume] })] }), "evidence_invalid");

  const revision = evidence("revision-confirmation", { observedAt: T2 });
  const revised = reviseGoal(active, change(2, T2), { intent: "Prepare a revised draft", criteria: active.criteria,
    priority: "normal", confirmation: revision }).current;
  const reactivated = transitionGoal(revised, change(3, T2),
    { kind: "activate", confirmation: evidence("revised-activation", { observedAt: T2 }) }).current;
  rejects(() => transitionGoal(reactivated, change(4, T3), { kind: "achieve",
    results: [result(reactivated, { checkedAt: T3, evidence: [revision] })] }), "evidence_invalid");
  assert.equal(transitionGoal(reactivated, change(4, T3), { kind: "achieve",
    results: [result(reactivated, { checkedAt: T3, evidence: [evidence("later-independent-verification", { observedAt: T3 })] })] }).current.status, "ACHIEVED");
});
