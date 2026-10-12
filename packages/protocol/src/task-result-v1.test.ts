import assert from "node:assert/strict";
import test from "node:test";
import { CognitiveProtocolError, canonicalJsonV1, parseOutcomePlanCommandV1, deserializeOutcomePlanCommandV1, parseOutcomeFeedbackCommandV1, deserializeOutcomeFeedbackCommandV1,
  parseOutcomeVerifyCommandV1, parseCriterionObservationV1, parseOutcomeVerificationPlanV1 } from "./index.ts";
const common = { schemaVersion: 1, commandId: "command", idempotencyKey: "key", workspaceId: "workspace", taskId: "task", expectedRevision: 2 };
const plan = { ...common, checks: [{ criterionId: "artifact", criterionRevision: 1, kind: "artifact", resourceId: "sample", format: "json-equals", expectedText: '{"count":8}' }], adoptionChecks: [] };
const feedback = { ...common, attemptId: "attempt", intentRevision: 1, outcomeId: "outcome", outcomeRevision: 1, criterionId: "subjective", criterionRevision: 1, decision: "rejected" };
test("result commands round-trip with exact versions and detached immutable records", () => {
  const before = structuredClone(plan), parsed = deserializeOutcomePlanCommandV1(canonicalJsonV1(plan)); assert.deepEqual(parsed, before); assert.ok(Object.isFrozen(parsed.checks));
  assert.deepEqual(deserializeOutcomeFeedbackCommandV1(canonicalJsonV1(feedback)), feedback); assert.deepEqual(parseOutcomeVerifyCommandV1(common), common);
  plan.checks[0]!.expectedText = '{"count":9}'; assert.equal(parsed.checks[0]!.kind === "artifact" && parsed.checks[0]!.expectedText, '{"count":8}'); plan.checks[0]!.expectedText = before.checks[0]!.expectedText;
});
test("clients cannot submit results, authority overrides, resource paths or unknown feedback", () => {
  for (const patch of [{ results: [{ status: "pass" }] }, { authorized: true }, { profile: "production" }, { taskId: "../external" }, { schemaVersion: 2 }]) assert.throws(() => parseOutcomeVerifyCommandV1({ ...common, ...patch }), CognitiveProtocolError);
  for (const patch of [{ decision: "completed" }, { outcomeRevision: 0 }, { intentRevision: 2.5 }, { approved: true }]) assert.throws(() => parseOutcomeFeedbackCommandV1({ ...feedback, ...patch }), CognitiveProtocolError);
  assert.throws(() => parseOutcomePlanCommandV1({ ...plan, checks: [{ ...plan.checks[0], resourceId: "C:/private/file" }] }), CognitiveProtocolError);
});
test("duplicate fields, duplicate criteria, inner JSON ambiguity and getters are rejected without reading a getter", () => {
  assert.throws(() => deserializeOutcomePlanCommandV1(canonicalJsonV1(plan).replace('"commandId":"command"', '"commandId":"command","commandId":"other"')), CognitiveProtocolError);
  assert.throws(() => parseOutcomePlanCommandV1({ ...plan, checks: [plan.checks[0], plan.checks[0]] }), CognitiveProtocolError);
  assert.throws(() => parseOutcomePlanCommandV1({ ...plan, checks: [{ ...plan.checks[0], expectedText: '{"count":8,"count":9}' }] }), CognitiveProtocolError);
  let read = false; const raw = { ...common, get results() { read = true; return []; } }; assert.throws(() => parseOutcomeVerifyCommandV1(raw), CognitiveProtocolError); assert.equal(read, false);
});
test("observations and formal plans retain exact method and time contracts", () => {
  const observation = { schemaVersion: 1, id: "observed", workspaceId: "workspace", taskId: "task", attemptId: "attempt", intentRevision: 1, criterionId: "artifact", criterionRevision: 1,
    observedAt: "2026-10-12T00:00:00.000Z", notAfter: "2026-10-12T00:01:00.000Z", payload: { kind: "artifact", resourceId: "sample", artifact: { kind: "artifact", id: "versioned-sample", version: 1 }, text: "" } };
  assert.deepEqual(parseCriterionObservationV1(observation), observation); assert.throws(() => parseCriterionObservationV1({ ...observation, notAfter: observation.observedAt }), CognitiveProtocolError);
  const declared = { schemaVersion: 1, id: "plan", workspaceId: "workspace", task: { kind: "task", id: "task", revision: 2 }, taskAttempt: { taskId: "task", attemptId: "attempt", intentRevision: 1 },
    criteria: [{ id: "artifact", revision: 1, description: "Exact sample", required: true, method: "artifact" }], verifier: { id: "outcome-verifier-v1", revision: 1 }, checks: plan.checks, adoptionChecks: [], createdAt: observation.observedAt };
  assert.deepEqual(parseOutcomeVerificationPlanV1(declared), declared);
  assert.throws(() => parseOutcomeVerificationPlanV1({ ...declared, checks: [{ ...plan.checks[0], criterionRevision: 2 }] }), CognitiveProtocolError);
  assert.throws(() => parseOutcomeVerificationPlanV1({ ...declared, verifier: { id: "unproven", revision: 1 } }), CognitiveProtocolError);
});
