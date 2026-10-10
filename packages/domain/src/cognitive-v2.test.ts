import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assertIdentifierV2, assertRevisionV2, assertIsoTimestampV2, assertExpectedRevisionV2,
  assertPrivacyV2, assertSourceTrustV2, assertEpistemicV2, assertScopeV2, scopeKeyV2,
  sameScopeV2, isScopeWithinV2, assertEntityRefV2, assertContentRefV2, assertVersionRefV2,
  assertTaskAttemptRefV2, assertClaimVersionRefV2, assertEvidenceRefV2, assertEvidenceForScopeV2,
  assertMemoryCandidateV2, assertMemoryClaimV2, assertHypothesisV2, assertGoalV2,
  assertEpisodeV2, assertWorkingStateV2, assertProcedureV2, DomainValidationErrorV2,
  ids, scopeKey, type ScopeV2, type EvidenceRefV2, type MemoryCandidateV2,
  type MemoryClaimV2, type HypothesisV2, type GoalV2, type EpisodeV2,
  type WorkingStateV2, type ProcedureV2, type AcceptanceCriterion, type CriterionId,
  type CandidateStatusV2, type ClaimStatusV2, type HypothesisStatusV2, type GoalStatusV2, type ProcedureStatusV2,
} from "./index.ts";

const t0 = "2026-10-10T00:00:00.000Z";
const t1 = "2026-10-10T01:00:00.000Z";
const t2 = "2026-10-11T00:00:00.000Z";
const scope: ScopeV2 = { kind: "workspace", workspaceId: "workspace-a" };
const evidence: EvidenceRefV2 = { source: { kind: "observation", id: "observation-user", revision: 1 }, scope,
  privacy: "model-allowed", sourceTrust: "user-direct", role: "supports", observedAt: t0 };
const base = { schemaVersion: 2 as const, id: "synthetic", revision: 1, scope, privacy: "model-allowed" as const,
  sourceTrust: "user-direct" as const, createdAt: t0, updatedAt: t0 };
const criterion: AcceptanceCriterion = { id: "criterion-report" as CriterionId, revision: 1,
  description: "The report contains the required field", required: true, method: "artifact" };
const candidate: MemoryCandidateV2 = { ...base, kind: "preference", statement: "Use concise reports", epistemic: "asserted",
  confidence: 0.5, evidence: [evidence], extractor: { kind: "extractor", id: "manual", revision: 1 },
  status: "PENDING", validFrom: t0, expiresAt: t2 };
const claim: MemoryClaimV2 = { ...base, version: 1, kind: "preference", statement: candidate.statement,
  epistemic: "asserted", evidence: [evidence], status: "ACTIVE", validFrom: t0 };
const hypothesis: HypothesisV2 = { ...base, sourceTrust: "model-derived", version: 1, epistemic: "inferred",
  proposition: "A shorter report may be more useful", evidence: [evidence], alternatives: ["The long report may be useful"],
  verificationQuestions: ["Did the user find it useful?"], expiresAt: t2, status: "OPEN" };
const goal: GoalV2 = { ...base, intent: "Produce the report", criteria: [criterion], priority: "normal",
  confirmation: evidence, status: "PROPOSED" };
const task = { kind: "task" as const, id: "task-a", revision: 2 };
const attempt = { taskId: task.id, attemptId: "attempt-a", intentRevision: 1 };
const outcome = { kind: "outcome" as const, id: "outcome-a", revision: 1 };
const episode: EpisodeV2 = { ...base, createdAt: t1, updatedAt: t1, version: 1, task, taskAttempt: attempt,
  intent: { revision: 1, request: goal.intent, constraints: [], criteria: [criterion] }, startedAt: t0, endedAt: t1,
  contextDifferences: [], actions: [{ kind: "action", id: "action-a", revision: 1 }],
  artifacts: [{ kind: "artifact", id: "artifact-a", version: 1 }], outcome, outcomeStatus: "unverifiable",
  unresolved: ["Artifact verification remains unknown"], evidence: [evidence],
  summary: { text: "A synthetic report was produced; verification is unknown.", sourceRefs: [outcome], generatorRevision: 1 } };
const working: WorkingStateV2 = { ...base, task, taskAttempt: attempt, intentRevision: 1,
  currentStep: "Check the report", known: [], unknown: ["Report correctness"], pendingInput: [], nextSteps: ["Verify the report"], evidence: [evidence] };
const procedure: ProcedureV2 = { ...base, version: 1, category: "report-generation", prerequisites: ["Known report fields"],
  requiredCapabilities: ["artifact-read"], steps: [{ id: "check", instruction: "Read the report", checks: ["Match required fields"], onFailure: "Stop and report missing fields" }],
  validators: [{ kind: "validator", id: "field-validator", revision: 1 }], failureConditions: ["Missing fields"],
  prohibitedActions: ["Do not publish an unverified report"], expectedBenefits: ["Fewer missing fields"], evidence: [evidence],
  sourceEpisodes: [{ kind: "episode", id: episode.id, version: 1 }],
  trialStatistics: { attempts: 0, tasks: 0, verifiable: 0, adoptedVerified: 0, succeeded: 0, failed: 0, cancelled: 0, unknown: 0 }, status: "CANDIDATE" };
const contracts = [
  [candidate, assertMemoryCandidateV2], [claim, assertMemoryClaimV2], [hypothesis, assertHypothesisV2], [goal, assertGoalV2],
  [episode, assertEpisodeV2], [working, assertWorkingStateV2], [procedure, assertProcedureV2],
] as const;
function rejects(check: (value: unknown) => void, value: unknown, reason?: string): void {
  assert.throws(() => check(value), (error: unknown) => {
    assert.ok(error instanceof DomainValidationErrorV2);
    if (reason) assert.equal(error.error.reason, reason);
    assert.equal(error.error.retryable, false);
    return true;
  });
}

test("formal cognitive contracts preserve each of the five material roles through JSON", () => {
  for (const [value, check] of contracts) {
    check(value);
    const encoded = JSON.stringify(value); const copy: unknown = JSON.parse(encoded);
    check(copy); assert.deepEqual(copy, value); assert.equal(JSON.stringify(value), encoded);
  }
});
test("every cognitive boundary rejects null, wrong versions, missing fields and undeclared authority", () => {
  for (const [value, check] of contracts) {
    for (const invalid of [null, [], { ...value, schemaVersion: 1 }, { ...value, schemaVersion: 3 },
      { ...value, id: "" }, { ...value, scope: { kind: "private" } }, { ...value, authorized: true },
      { ...value, grant: "all-tools" }, { ...value, unknown: undefined }, { ...value, createdAt: t2 }]) rejects(check, invalid);
    const missing = { ...value } as Record<string, unknown>; delete missing.revision; rejects(check, missing);
    const inherited = Object.create(value) as unknown; rejects(check, inherited);
  }
});
test("formal IDs are bounded opaque values, not paths or normalized display text", () => {
  for (const id of ["a", "task:synthetic_1.2", "x".repeat(256)]) assertIdentifierV2(id);
  for (const id of ["", " ", " a", "a ", "../a", "folder\\a", "a/b", "x".repeat(257), 1, null]) rejects(assertIdentifierV2, id);
});
test("safe revision bounds and CAS reject stale, skipped, overflow and nonnumeric values", () => {
  assertRevisionV2(1); assertRevisionV2(Number.MAX_SAFE_INTEGER); assertRevisionV2(0, true);
  assertExpectedRevisionV2(0, 0, 1); assertExpectedRevisionV2(5, 5, 6);
  for (const value of [0, -1, 0.5, Number.NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, "1", null]) rejects(assertRevisionV2, value);
  for (const args of [[2, 1, 3], [2, 2, 4], [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER + 1]]) {
    assert.throws(() => assertExpectedRevisionV2(...args as [number, number, number]), DomainValidationErrorV2);
  }
});
test("canonical UTC milliseconds reject ambiguous and impossible instants without consulting a clock", () => {
  assertIsoTimestampV2(t0); assertIsoTimestampV2("2024-02-29T00:00:00.000Z");
  for (const time of ["2026-02-29T00:00:00.000Z", "2026-02-30T00:00:00.000Z", "2026-10-10", "2026-10-10T00:00:00Z",
    "2026-10-10T00:00:00.000+00:00", "2026-10-10T00:00:60.000Z", "2026-13-01T00:00:00.000Z", null]) rejects(assertIsoTimestampV2, time);
});
test("scope/privacy/trust/epistemic are independently validated closed dimensions", () => {
  for (const value of ["local-only", "model-allowed"]) assertPrivacyV2(value);
  for (const value of ["user-direct", "verified-tool", "external-content", "model-derived"]) assertSourceTrustV2(value);
  for (const value of ["asserted", "verified", "inferred"]) assertEpistemicV2(value);
  rejects(assertPrivacyV2, "private"); rejects(assertPrivacyV2, "local-model-allowed");
  rejects(assertSourceTrustV2, "system"); rejects(assertEpistemicV2, "certain");
  assertMemoryClaimV2({ ...claim, privacy: "local-only", sourceTrust: "external-content" });
});
test("all scope identities retain their workspace and never collide on delimiters", () => {
  const scopes: ScopeV2[] = [{ kind: "global" }, scope, { kind: "session", workspaceId: "workspace-a", sessionId: "x" },
    { kind: "task", workspaceId: "workspace-a", taskId: "x" }, { kind: "session", workspaceId: "workspace-b", sessionId: "x" },
    { kind: "task", workspaceId: "a:b", taskId: "c" }, { kind: "task", workspaceId: "a", taskId: "b:c" }];
  for (const item of scopes) { assertScopeV2(item); assert.deepEqual(JSON.parse(JSON.stringify(item)), item); }
  assert.equal(new Set(scopes.map(scopeKeyV2)).size, scopes.length);
  assert.equal(sameScopeV2(scopes[2], scopes[4]), false);
  for (const invalid of [{ kind: "session", sessionId: "x" }, { kind: "task", taskId: "x" },
    { kind: "global", workspaceId: "a" }, { kind: "workspace", workspaceId: "a", taskId: "x" },
    { kind: "session", workspaceId: "a", sessionId: "x", taskId: "x" }, { kind: "private" }, null]) rejects(assertScopeV2, invalid);
});
test("structural scope containment never promotes task/session or crosses workspaces", () => {
  const taskScope: ScopeV2 = { kind: "task", workspaceId: "workspace-a", taskId: "x" };
  const sessionScope: ScopeV2 = { kind: "session", workspaceId: "workspace-a", sessionId: "x" };
  assert.equal(isScopeWithinV2(taskScope, scope), true); assert.equal(isScopeWithinV2(scope, { kind: "global" }), true);
  for (const [inner, outer] of [[scope, taskScope], [scope, sessionScope], [taskScope, sessionScope],
    [taskScope, { kind: "workspace", workspaceId: "b" }], [{ kind: "global" }, scope]] as [ScopeV2, ScopeV2][]) {
    assert.equal(isScopeWithinV2(inner, outer), false);
  }
});
test("aggregate revision, immutable content version and attempt identity cannot be substituted", () => {
  assertEntityRefV2(task); assertContentRefV2({ contentId: "body", contentVersion: 1 });
  assertClaimVersionRefV2({ claimId: claim.id, version: 1 }); assertVersionRefV2({ kind: "episode", id: "episode", version: 1 });
  assertTaskAttemptRefV2(attempt);
  rejects(assertEntityRefV2, { ...task, version: 1 }); rejects(assertContentRefV2, { kind: "content", id: "body", version: 1 });
  rejects(assertVersionRefV2, { kind: "artifact", id: "artifact", revision: 1 });
  rejects(assertTaskAttemptRefV2, { kind: "task-attempt", id: "attempt", revision: 1 });
  rejects(assertEntityRefV2, { kind: "task-attempt", id: "attempt", revision: 1 });
  rejects(assertEntityRefV2, { kind: "observation", id: "observation", revision: 2 });
  rejects(assertEntityRefV2, { kind: "unknown", id: "x", revision: 1 });
});
test("evidence qualification blocks widened scope/privacy, duplicates, absent support and conflicting metadata", () => {
  assertEvidenceRefV2(evidence); assertEvidenceForScopeV2([evidence], scope, "model-allowed", t0);
  for (const refs of [[], [{ ...evidence, role: "refutes" }], [evidence, evidence], [{ ...evidence, observedAt: t1 }],
    [{ ...evidence, scope: { kind: "workspace", workspaceId: "b" } }], [{ ...evidence, privacy: "local-only" }],
    [evidence, { ...evidence, sourceTrust: "verified-tool", role: "refutes" }]]) {
    assert.throws(() => assertEvidenceForScopeV2(refs, scope, "model-allowed", t0), DomainValidationErrorV2);
  }
  assert.throws(() => assertEvidenceForScopeV2([evidence], { kind: "global" }, "model-allowed"), DomainValidationErrorV2);
  assertEvidenceForScopeV2([{ ...evidence, privacy: "local-only" }], scope, "local-only");
});
test("candidate confidence is not truth and goal/procedure are never claim kinds", () => {
  for (const confidence of [0, 1]) assertMemoryCandidateV2({ ...candidate, confidence });
  for (const confidence of [-0.1, 1.1, NaN, Infinity, "1"]) rejects(assertMemoryCandidateV2, { ...candidate, confidence });
  for (const kind of ["goal", "procedure", "hypothesis", "unknown"]) {
    rejects(assertMemoryCandidateV2, { ...candidate, kind }); rejects(assertMemoryClaimV2, { ...claim, kind });
  }
  assertMemoryCandidateV2({ ...candidate, statement: "🧠".repeat(2048) });
  rejects(assertMemoryCandidateV2, { ...candidate, statement: "🧠".repeat(2049) });
  rejects(assertMemoryCandidateV2, { ...candidate, statement: "\u0000" });
});
test("every candidate status carries its own terminal/expiry conditions", () => {
  const statuses: Record<CandidateStatusV2, Partial<MemoryCandidateV2>> = {
    PENDING: {}, ACCEPTED: { acceptedClaim: { claimId: claim.id, version: 1 } }, REJECTED: {}, EXPIRED: { updatedAt: t2 },
  };
  for (const [status, patch] of Object.entries(statuses)) assertMemoryCandidateV2({ ...candidate, status, ...patch });
  rejects(assertMemoryCandidateV2, { ...candidate, status: "ACCEPTED" });
  rejects(assertMemoryCandidateV2, { ...candidate, acceptedClaim: { claimId: "x", version: 1 } });
  rejects(assertMemoryCandidateV2, { ...candidate, status: "EXPIRED" });
  rejects(assertMemoryCandidateV2, { ...candidate, updatedAt: t2 });
  rejects(assertMemoryCandidateV2, { ...candidate, status: "pending" });
});
test("model-only evidence never becomes a formal claim and inferred claims require a hypothesis", () => {
  const model = { ...evidence, sourceTrust: "model-derived" as const };
  assertMemoryCandidateV2({ ...candidate, sourceTrust: "model-derived", epistemic: "inferred", evidence: [model] });
  assertHypothesisV2({ ...hypothesis, evidence: [model] });
  for (const patch of [{ epistemic: "inferred" }, { sourceTrust: "model-derived" }, { evidence: [model] },
    { epistemic: "verified", evidence: [{ ...evidence, sourceTrust: "external-content" }] }]) rejects(assertMemoryClaimV2, { ...claim, ...patch });
  assertMemoryClaimV2({ ...claim, epistemic: "verified", evidence: [{ ...evidence, sourceTrust: "verified-tool" }] });
});
test("claim lineage keeps version distinct from lifecycle revision and forbids self/foreign lineage", () => {
  const v2 = { ...claim, version: 2, revision: 5, supersedes: { claimId: claim.id, version: 1 } };
  assertMemoryClaimV2(v2);
  for (const patch of [{ supersedes: { claimId: "other", version: 1 } }, { supersedes: { claimId: claim.id, version: 2 } },
    { supersedes: { claimId: claim.id, version: 0 } }, { supersedes: undefined }]) rejects(assertMemoryClaimV2, { ...v2, ...patch });
  const statuses: Record<ClaimStatusV2, Partial<MemoryClaimV2>> = {
    ACTIVE: {}, SUPERSEDED: { supersededBy: { claimId: claim.id, version: 2 } }, DISPUTED: {}, EXPIRED: {}, FORGOTTEN: {},
  };
  for (const [status, patch] of Object.entries(statuses)) assertMemoryClaimV2({ ...claim, status, ...patch });
  assertMemoryClaimV2({ ...claim, status: "FORGOTTEN", supersededBy: { claimId: claim.id, version: 2 } });
  rejects(assertMemoryClaimV2, { ...claim, status: "SUPERSEDED" });
  rejects(assertMemoryClaimV2, { ...claim, supersededBy: { claimId: claim.id, version: 2 } });
  rejects(assertMemoryClaimV2, { ...claim, validUntil: t0 });
});
test("hypotheses remain explicitly falsifiable and use a closed status set", () => {
  const statuses: Record<HypothesisStatusV2, Partial<HypothesisV2>> = { OPEN: {}, SUPPORTED: {}, REFUTED: {}, EXPIRED: { updatedAt: t2 }, WITHDRAWN: {} };
  for (const [status, patch] of Object.entries(statuses)) assertHypothesisV2({ ...hypothesis, status, ...patch });
  for (const patch of [{ epistemic: "verified" }, { alternatives: [] }, { verificationQuestions: [] }, { expiresAt: t0 }, { status: "ACTIVE" }]) rejects(assertHypothesisV2, { ...hypothesis, ...patch });
});
test("goals keep existing criteria but require user confirmation, never model/tool authority", () => {
  const statuses: Record<GoalStatusV2, true> = { PROPOSED: true, ACTIVE: true, PAUSED: true, ACHIEVED: true, ABANDONED: true };
  for (const status of Object.keys(statuses)) assertGoalV2({ ...goal, status });
  for (const patch of [{ criteria: [] }, { criteria: [{ ...criterion, required: false }] }, { criteria: [criterion, criterion] },
    { confirmation: { ...evidence, sourceTrust: "model-derived" } }, { sourceTrust: "verified-tool" }, { priority: 1 }, { status: "COMPLETED" },
    { criteria: [{ ...criterion, grant: "execute" }] }, { deadline: "tomorrow" }]) rejects(assertGoalV2, { ...goal, ...patch });
});
test("episode captures unknown outcomes and only derives summaries from exact structural records", () => {
  for (const patch of [{ taskAttempt: { ...attempt, taskId: "other" } }, { taskAttempt: { ...attempt, intentRevision: 2 } },
    { endedAt: t2 }, { startedAt: t2 }, { scope: { kind: "global" } }, { outcomeStatus: "success" },
    { artifacts: [{ kind: "artifact", id: "a", revision: 1 }] },
    { summary: { ...episode.summary, sourceRefs: [{ kind: "observation", id: "hallucinated", revision: 1 }] } },
    { summary: { ...episode.summary, sourceRefs: [{ ...outcome, revision: 2 }] } }]) rejects(assertEpisodeV2, { ...episode, ...patch });
  assertEpisodeV2({ ...episode, summary: { ...episode.summary, sourceRefs: [...episode.artifacts] } });
});
test("working state binds current task revision and exact attempt intent without fake completion", () => {
  for (const patch of [{ taskAttempt: { ...attempt, taskId: "other" } }, { intentRevision: 2 },
    { scope: { kind: "task", workspaceId: "workspace-a", taskId: "other" } }, { unknown: [""] }, { pendingInput: "missing" }, { completed: true }]) rejects(assertWorkingStateV2, { ...working, ...patch });
});
test("procedure describes bounded steps and complete trial counts without scripts or authority", () => {
  const statuses: Record<ProcedureStatusV2, true> = { CANDIDATE: true, TRIAL: true, ACTIVE: true, SUSPENDED: true, RETIRED: true };
  for (const status of Object.keys(statuses)) assertProcedureV2({ ...procedure, status });
  for (const patch of [{ steps: [] }, { steps: [procedure.steps[0], procedure.steps[0]] }, { script: "execute()" },
    { steps: [{ ...procedure.steps[0], code: "execute()" }] }, { sourceEpisodes: [{ kind: "episode", id: "episode", revision: 1 }] },
    { trialStatistics: { ...procedure.trialStatistics, attempts: 2 } }, { trialStatistics: { ...procedure.trialStatistics, unknown: -1 } },
    { previousActiveVersion: 1 }, { prohibitedActions: [] }, { validators: [] }]) rejects(assertProcedureV2, { ...procedure, ...patch });
  assertProcedureV2({ ...procedure, version: 2, revision: 2, previousActiveVersion: 1 });
});
test("strict object boundaries reject accessors, symbols and nonenumerable extras before invoking getters", () => {
  let reads = 0;
  const getterScope = Object.defineProperty({}, "kind", { enumerable: true, get() { reads += 1; return "global"; } });
  rejects(assertScopeV2, getterScope);
  const inherited = Object.create({ get kind() { reads += 1; return "global"; } }); rejects(assertScopeV2, inherited);
  for (const [value, check] of contracts) {
    const accessor = Object.defineProperty({ ...value }, "scope", { enumerable: true, get() { reads += 1; return scope; } });
    rejects(check, accessor);
    rejects(check, Object.defineProperty({ ...value }, "hidden", { value: "secret" }));
    rejects(check, { ...value, [Symbol("hidden")]: true });
  }
  assert.equal(reads, 0);
});
test("nested arrays reject holes, subclassing, getters and unserializable properties without reads", () => {
  let reads = 0;
  const accessor: unknown[] = [];
  Object.defineProperty(accessor, "0", { enumerable: true, get() { reads += 1; return evidence; } });
  class EvidenceArray extends Array<unknown> {}
  for (const value of [accessor, new Array(1), new EvidenceArray(evidence),
    Object.defineProperty([evidence], "hidden", { value: true }), Object.assign([evidence], { [Symbol("hidden")]: true })]) {
    rejects(assertMemoryCandidateV2, { ...candidate, evidence: value });
  }
  assert.equal(reads, 0);
});
test("safe validation errors are structured and never echo hostile input", () => {
  try { assertScopeV2({ kind: "secret-personal-value" }); assert.fail("invalid input was accepted"); }
  catch (error) {
    assert.ok(error instanceof DomainValidationErrorV2);
    assert.deepEqual(error.error, { code: "validation", reason: "invalid_scope", safeMessage: "The cognitive contract is invalid.", retryable: false });
    assert.equal(JSON.stringify(error.error).includes("secret-personal-value"), false);
  }
});
test("bootstrap scope and ID exports keep their original behavior", () => {
  assert.equal(ids.workspace(" workspace-a "), "workspace-a");
  assert.equal(scopeKey({ kind: "session", sessionId: ids.session("same") }), "session:same");
  assert.equal(scopeKey({ kind: "private" }), "private:local");
});

test("content versions cannot exceed the same aggregate CAS revision", () => {
  for (const [value, check] of [[claim, assertMemoryClaimV2], [hypothesis, assertHypothesisV2],
    [episode, assertEpisodeV2], [procedure, assertProcedureV2]] as const) {
    rejects(check, { ...value, version: 6, revision: 1 }, "version_exceeds_revision");
    rejects(check, { ...value, version: 2, revision: 1 }, "version_exceeds_revision");
    check({ ...value, revision: 6 });
  }
});
