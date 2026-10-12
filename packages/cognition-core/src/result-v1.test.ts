import assert from "node:assert/strict";
import test from "node:test";
import { ids, type AcceptanceCriterion, type CriterionObservationV1, type OutcomeVerificationPlanV1, type Task, type TaskAttemptId, type TaskId, type OutcomeId, type MemoryClaimV2, type MemoryAdoptionCheckV1, type EvidenceRefV2 } from "../../domain/src/index.ts";
import { createTask, transitionTask, appendTaskOutcome, evaluateCriterionObservationsV1, buildResultEpisodeV1, deriveMemoryAdoptionV1, currentCriterionObservationsV1 } from "./index.ts";
const t0 = "2026-10-12T00:00:00.000Z", t1 = "2026-10-12T00:00:01.000Z", t2 = "2026-10-12T00:00:02.000Z", t3 = "2026-10-12T00:00:03.000Z", t4 = "2026-10-12T00:00:04.000Z", deadline = "2026-10-12T00:01:00.000Z";
const checks: readonly AcceptanceCriterion[] = [{ id: "artifact" as AcceptanceCriterion["id"], revision: 1, description: "Exact synthetic JSON content", required: true, method: "artifact" },
  { id: "test" as AcceptanceCriterion["id"], revision: 1, description: "The fixed independent check exits zero", required: true, method: "deterministic-test" }];
const change = (task: Task, now: string) => ({ expectedRevision: task.revision, nextRevision: task.revision + 1, expectedIntentRevision: task.intent.revision, attemptId: task.attempts.at(-1)!.id, now, trigger: { id: `change-${task.revision}`, revision: 1 } });
function setup(criteria = checks) {
  let task = createTask({ id: "task" as TaskId, attemptId: "attempt" as TaskAttemptId, workspaceId: ids.workspace("workspace"), sessionId: ids.session("session"), revision: 1, now: t0,
    intent: { revision: 1, request: "SYNTHETIC_ONLY produce a checked sample", constraints: [], criteria } });
  task = transitionTask(task, change(task, t1), { kind: "prepare" }).task;
  const plan: OutcomeVerificationPlanV1 = { schemaVersion: 1, id: "plan", workspaceId: "workspace", task: { kind: "task", id: task.id, revision: task.revision },
    taskAttempt: { taskId: task.id, attemptId: "attempt", intentRevision: 1 }, criteria, verifier: { id: "outcome-verifier-v1", revision: 1 }, adoptionChecks: [], createdAt: t1,
    checks: criteria.map(criterion => criterion.method === "artifact" ? { criterionId: criterion.id, criterionRevision: 1, kind: "artifact", resourceId: "sample", format: "json-equals", expectedText: '{"count":8}' }
      : criterion.method === "deterministic-test" ? { criterionId: criterion.id, criterionRevision: 1, kind: "deterministic-test", resourceId: "sample-check" }
        : { criterionId: criterion.id, criterionRevision: 1, kind: criterion.method as "user-confirmation" | "model-assisted" }) };
  const receipt = (now: string) => ({ taskId: task.id, attemptId: task.attempts.at(-1)!.id, workspaceId: task.workspaceId, intentRevision: 1, at: now, evidence: [{ id: "observed-runtime", revision: 1 }] });
  task = transitionTask(task, change(task, t2), { kind: "start", preparation: receipt(t2) }).task;
  task = transitionTask(task, change(task, t3), { kind: "settled", completeness: "complete", receipt: receipt(t3) }).task;
  return { task, plan };
}
function observation(criterionId: string, payload: CriterionObservationV1["payload"], observedAt = t3): CriterionObservationV1 {
  return { schemaVersion: 1, id: `observation-${criterionId}`, workspaceId: "workspace", taskId: "task", attemptId: "attempt", intentRevision: 1,
    criterionId, criterionRevision: 1, observedAt, notAfter: deadline, payload };
}
const artifact = (text = '{"count":8}') => observation("artifact", { kind: "artifact", resourceId: "sample", artifact: { kind: "artifact", id: "sample-version", version: 1 }, text });
const checked = (exitCode = 0) => observation("test", { kind: "deterministic-test", resourceId: "sample-check", exitCode });
function finish(task: Task, plan: OutcomeVerificationPlanV1, observations: readonly CriterionObservationV1[], now = t4) {
  const prior = task.attempts.at(-1)!.outcomes.at(-1); return appendTaskOutcome(task, change(task, now), { outcomeId: prior?.id ?? "outcome" as OutcomeId,
    outcomeRevision: (prior?.revision ?? 0) + 1, results: evaluateCriterionObservationsV1(task.attempts.at(-1)!, plan, observations, now) }).task;
}
test("independent artifact content and the declared test produce a completed result without mutating the input", () => {
  const { task, plan } = setup(), before = JSON.stringify(task), after = finish(task, plan, [artifact(' {"count": 8} '), checked()]);
  assert.equal(task.state, "VERIFYING"); assert.equal(JSON.stringify(task), before); assert.equal(after.state, "COMPLETED"); assert.equal(after.attempts.at(-1)!.outcomes[0]!.status, "completed");
  assert.ok(Object.isFrozen(after)); assert.ok(Object.isFrozen(after.attempts.at(-1)!.outcomes));
});
test("file presence and a successful tool do not prove wrong artifact content", () => {
  const { task, plan } = setup(), after = finish(task, plan, [artifact('{"count":9}'), checked(1)]);
  assert.equal(after.state, "FAILED"); assert.equal(after.attempts.at(-1)!.outcomes[0]!.criteriaResults[0]!.status, "fail");
  assert.throws(() => finish(task, plan, [observation("artifact", { kind: "tool-receipt", toolName: "read", argumentsJson: "{}", succeeded: true, action: { kind: "action", id: "tool", revision: 1 }, sourceEvent: { id: "event", revision: 1 } }), checked()]), /method/);
});
test("a supported criterion with a failed or unavailable check remains partial", () => {
  const { task, plan } = setup(); for (const item of [checked(1), observation("test", { kind: "unknown", reason: "validator-error" }), observation("test", { kind: "unknown", reason: "validator-unavailable" })]) {
    const result = finish(task, plan, [artifact(), item]).attempts.at(-1)!.outcomes[0]!; assert.equal(result.status, "partial"); assert.notEqual(result.criteriaResults[1]!.status, "pass");
  }
});
test("missing observations and malformed artifact JSON produce unverifiable, never an inverse success", () => {
  const { task, plan } = setup(); assert.equal(finish(task, plan, []).state, "UNVERIFIABLE");
  const after = finish(task, plan, [artifact("not JSON"), observation("test", { kind: "unknown", reason: "missing-evidence" })]);
  assert.equal(after.state, "UNVERIFIABLE"); assert.equal(after.attempts.at(-1)!.outcomes[0]!.criteriaResults[0]!.status, "unknown");
});
test("exact standard revisions, resource identities, scope and freshness are checked before reduction", () => {
  const { task, plan } = setup(); for (const patch of [{ workspaceId: "other" }, { intentRevision: 2 }, { criterionRevision: 2 }, { taskId: "other" }, { notAfter: t4 }])
    assert.throws(() => finish(task, plan, [{ ...artifact(), ...patch }, checked()]));
  assert.throws(() => finish(task, { ...plan, criteria: [{ ...checks[0]!, description: "Changed after execution" }, checks[1]!] }, [artifact(), checked()]), /plan/);
  assert.throws(() => finish(task, plan, [artifact(), artifact(), checked()]));
  assert.throws(() => finish(task, plan, [observation("artifact", { ...artifact().payload as Extract<CriterionObservationV1["payload"], { kind: "artifact" }>, resourceId: "other" }), checked()]));
});
test("model-assisted checks remain unknown and cannot finalize a required criterion", () => {
  const { task, plan } = setup([{ id: "model" as AcceptanceCriterion["id"], revision: 1, description: "Unverified model proposal", required: true, method: "model-assisted" }]);
  const after = finish(task, plan, [observation("model", { kind: "unknown", reason: "model-only" })]); assert.equal(after.state, "UNVERIFIABLE");
});
test("later subjective denial appends the same Outcome ID and preserves the original terminal state", () => {
  const { task, plan } = setup([{ id: "subjective" as AcceptanceCriterion["id"], revision: 1, description: "The paired user approves this specific subjective result", required: true, method: "user-confirmation" }]);
  const accepted = observation("subjective", { kind: "user-confirmation", decision: "accepted", principalId: "owner", input: { id: "actual-confirmation", revision: 1 } });
  const initial = finish(task, plan, [accepted]), original = JSON.stringify(initial), rejected = { ...accepted, id: "actual-denial", observedAt: "2026-10-12T00:00:05.000Z", payload: { ...accepted.payload as Extract<CriterionObservationV1["payload"], { kind: "user-confirmation" }>, decision: "rejected" as const } };
  const revised = finish(initial, plan, [rejected], "2026-10-12T00:00:06.000Z"), outcomes = revised.attempts.at(-1)!.outcomes;
  assert.equal(revised.state, "COMPLETED"); assert.equal(outcomes.length, 2); assert.equal(outcomes[1]!.status, "failed"); assert.equal(outcomes[1]!.id, outcomes[0]!.id);
  assert.deepEqual(outcomes[0], initial.attempts.at(-1)!.outcomes[0]); assert.equal(JSON.stringify(initial), original);
});
test("expired observations are not carried forward as current passes", () => {
  const { task, plan } = setup(), initial = finish(task, plan, [artifact(), checked()]);
  const current = currentCriterionObservationsV1([artifact(), checked()], deadline); assert.deepEqual(current, []);
  const revised = finish(initial, plan, current, deadline); assert.equal(revised.attempts.at(-1)!.outcomes.at(-1)!.status, "unverifiable"); assert.equal(revised.state, "COMPLETED");
});
test("confirmed cancellation receives a cancelled Outcome and retains all unknown checks", () => {
  const { task, plan } = setup(); let cancelled = transitionTask(task, change(task, t4), { kind: "cancel" }).task;
  const receipt = { taskId: cancelled.id, attemptId: cancelled.attempts.at(-1)!.id, workspaceId: cancelled.workspaceId, intentRevision: 1, at: t4, evidence: [{ id: "closed-worker", revision: 1 }] };
  cancelled = transitionTask(cancelled, change(cancelled, t4), { kind: "confirm-stop", receipt, unresolvedActions: [] }).task;
  const result = finish(cancelled, plan, []); assert.equal(result.state, "CANCELLED"); assert.equal(result.attempts.at(-1)!.outcomes[0]!.status, "cancelled"); assert.equal(result.attempts.at(-1)!.outcomes[0]!.criteriaResults.length, 2);
});
test("Episode versions bind exact result revisions and retain failure and unknown criteria", () => {
  const { task, plan } = setup(), initial = finish(task, plan, [artifact(), checked()]);
  const evidence: EvidenceRefV2[] = [{ source: { kind: "observation", id: "observation-artifact", revision: 1 }, scope: { kind: "task", workspaceId: "workspace", taskId: "task" }, privacy: "model-allowed", sourceTrust: "verified-tool", role: "supports", observedAt: t3 }];
  const episode = buildResultEpisodeV1({ id: "episode", task: initial, endedAt: t3, recordedAt: t4, privacy: "model-allowed", evidence, actions: [], artifacts: [], contextDifferences: ["capsule:synthetic"], unresolved: [] });
  const revised = finish(initial, plan, [], "2026-10-12T00:00:05.000Z"), next = buildResultEpisodeV1({ id: "episode", task: revised, previous: episode, endedAt: t3, recordedAt: revised.updatedAt,
    privacy: "model-allowed", evidence, actions: [], artifacts: [], contextDifferences: ["capsule:synthetic"], unresolved: ["Independent evidence is still required"] });
  assert.equal(episode.version, 1); assert.equal(next.version, 2); assert.equal(next.outcome.revision, 2); assert.equal(next.outcomeStatus, "unverifiable"); assert.equal(next.unresolved.length, 3);
});
test("only the exact exposed constraint can be proven in an observed action parameter", () => {
  const evidence: EvidenceRefV2 = { source: { kind: "observation", id: "user-constraint", revision: 1 }, scope: { kind: "task", workspaceId: "workspace", taskId: "task" }, privacy: "model-allowed", sourceTrust: "user-direct", role: "supports", observedAt: t0 };
  const claim: MemoryClaimV2 = { schemaVersion: 2, id: "claim", revision: 1, version: 1, scope: evidence.scope, privacy: "model-allowed", sourceTrust: "user-direct", createdAt: t0, updatedAt: t0,
    kind: "constraint", statement: 'SYNTHETIC_ONLY: parameter name = "fixed-note.md"', epistemic: "asserted", evidence: [evidence], status: "ACTIVE", validFrom: t0 };
  const check: MemoryAdoptionCheckV1 = { material: { kind: "claim", id: claim.id, revision: 1, version: 1 }, toolName: "draft.write", parameter: "name", expectedJson: '"fixed-note.md"', profile: "synthetic-parameter-v1" };
  const observed = observation("tool", { kind: "tool-receipt", toolName: "draft.write", argumentsJson: '{"name":"fixed-note.md","text":"SYNTHETIC_ONLY"}', succeeded: true, action: { kind: "action", id: "actual-draft", revision: 1 }, sourceEvent: { id: "actual-tool-event", revision: 1 } });
  assert.equal(deriveMemoryAdoptionV1({ claim, check, observations: [observed], now: t4 }).status, "verified");
  assert.equal(deriveMemoryAdoptionV1({ claim: { ...claim, id: "other-claim" }, check, observations: [observed], now: t4 }).status, "unknown");
  assert.equal(deriveMemoryAdoptionV1({ claim, check, observations: [observed], now: deadline }).status, "unknown");
  assert.equal(deriveMemoryAdoptionV1({ claim, observations: [], now: t4, claimedStep: { id: "assistant-self-report", revision: 1 } }).status, "claimed");
});
