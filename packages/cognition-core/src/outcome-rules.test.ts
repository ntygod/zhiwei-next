import assert from "node:assert/strict";
import test from "node:test";
import {
  ids, type CriterionId, type CriterionResult, type OutcomeId,
  type TaskAttempt, type TaskAttemptId, type TaskId, type VerificationMethod,
} from "../../domain/src/index.ts";
import { deriveOutcome } from "./outcome-rules.ts";

const createdAt = "2026-10-01T00:00:00.000Z";
const checkedAt = "2026-10-01T00:01:00.000Z";
const now = "2026-10-01T00:02:00.000Z";
const validUntil = "2026-10-01T00:03:00.000Z";
const outcomeId = "outcome-1" as OutcomeId;

function attempt(method: VerificationMethod = "artifact"): TaskAttempt {
  return {
    id: "attempt-1" as TaskAttemptId, taskId: "task-1" as TaskId,
    workspaceId: ids.workspace("workspace-1"), state: "VERIFYING",
    intent: {
      revision: 2, request: "Produce two independently checked artifacts", constraints: ["Stay in scope"],
      criteria: ["first", "second"].map(id => ({
        id: id as CriterionId, revision: 3, description: `Check ${id}`, required: true, method,
      })),
    },
    createdAt, updatedAt: checkedAt, pauseRequested: false, cancellationRequested: false,
    completeness: "complete", unresolvedActions: [], outcomes: [],
  };
}

function result(a: TaskAttempt, index = 0, status: CriterionResult["status"] = "pass"): CriterionResult {
  const criterion = a.intent.criteria[index];
  const base = {
    taskId: a.taskId, attemptId: a.id, workspaceId: a.workspaceId, intentRevision: a.intent.revision,
    criterionId: criterion.id, criterionRevision: criterion.revision, method: criterion.method,
    checkedAt, explanation: `Independent check for ${criterion.description}`,
    evidence: [{ id: `evidence-${index}`, revision: 1 }],
  };
  if (status === "unknown") return { ...base, status, reason: "validator-error", evidence: [] };
  if (status === "not-applicable") return { ...base, status, evidence: [] };
  return { ...base, status, validUntil };
}

function derive(a: TaskAttempt = attempt(), results = [result(a), result(a, 1)]) {
  return deriveOutcome(a, { id: outcomeId, revision: 1, now, results });
}

for (const method of ["artifact", "deterministic-test", "tool-receipt", "user-confirmation"] as const) {
  test(`${method} can complete only the exact required criteria checked`, () => {
    const a = attempt(method);
    assert.equal(derive(a).status, "completed");
    assert.equal(derive(a, [result(a), result(a, 1, "unknown")]).status, "partial");
  });
}

for (const first of ["pass", "fail", "unknown", "not-applicable"] as const) {
  for (const second of ["pass", "fail", "unknown", "not-applicable"] as const) {
    test(`required results ${first}/${second} reduce deterministically`, () => {
      const a = attempt();
      const expected = first === "pass" && second === "pass" ? "completed"
        : first === "pass" || second === "pass" ? "partial"
          : first === "fail" || second === "fail" ? "failed" : "unverifiable";
      assert.equal(derive(a, [result(a, 0, first), result(a, 1, second)]).status, expected);
    });
  }
}

test("optional non-pass results do not erase completion of every required criterion", () => {
  const original = attempt();
  const a = { ...original, intent: { ...original.intent, criteria: original.intent.criteria.map((c, i) => ({ ...c, required: i === 0 })) } };
  for (const status of ["fail", "unknown", "not-applicable"] as const) {
    assert.equal(derive(a, [result(a), result(a, 1, status)]).status, "completed");
  }
  assert.equal(derive(a, [result(a, 0, "not-applicable"), result(a, 1)]).status, "partial");
});

test("missing required criteria cannot be satisfied vacuously", () => {
  const original = attempt();
  const a = { ...original, intent: { ...original.intent, criteria: original.intent.criteria.map(c => ({ ...c, required: false })) } };
  assert.throws(() => derive(a), /required criterion/);
});

test("model-assisted assertions are recorded as unknown, never independent pass or fail", () => {
  const a = attempt("model-assisted");
  for (const status of ["pass", "fail"] as const) {
    const outcome = derive(a, [result(a, 0, status), result(a, 1, status)]);
    assert.equal(outcome.status, "unverifiable");
    for (const item of outcome.criteriaResults) {
      assert.equal(item.status, "unknown");
      assert.ok(item.status === "unknown");
      assert.equal(item.reason, "model-only");
      assert.equal("validUntil" in item, false);
      assert.equal(item.evidence.length, 1);
    }
  }
});

test("validator failures remain unknown without being inferred from evidence presence", () => {
  const a = attempt();
  for (const reason of ["validator-error", "validator-unavailable", "missing-evidence", "incomplete", "model-only"] as const) {
    const r = { ...result(a, 0, "unknown"), status: "unknown" as const, reason, evidence: [{ id: "receipt", revision: 1 }] };
    assert.equal(derive(a, [r, result(a, 1, "unknown")]).status, "unverifiable");
  }
});

test("incomplete execution can never produce completed", () => {
  const a = { ...attempt(), completeness: "incomplete" as const };
  assert.equal(derive(a).status, "partial");
  assert.equal(derive(a, [result(a, 0, "unknown"), result(a, 1, "unknown")]).status, "unverifiable");
  assert.equal(derive(a, [result(a, 0, "fail"), result(a, 1, "unknown")]).status, "failed");
});

test("confirmed cancellation has precedence while retaining observed partial effects", () => {
  for (const state of ["VERIFYING", "CANCELLED"] as const) {
    const a = { ...attempt(), state, cancellationRequested: true };
    const outcome = derive(a, [result(a), result(a, 1, "fail")]);
    assert.equal(outcome.status, "cancelled");
    assert.deepEqual(outcome.criteriaResults.map(r => r.status), ["pass", "fail"]);
    assert.equal(derive(a).status, "cancelled");
  }
});

test("invalid cancellation states and unsettled attempts cannot produce an Outcome", () => {
  assert.throws(() => derive({ ...attempt(), state: "CANCELLED" }), /Cancellation/);
  assert.throws(() => derive({ ...attempt(), cancellationRequested: true, completeness: "incomplete" }), /Cancellation/);
  assert.throws(() => derive({ ...attempt(), completeness: "not-settled" }), /settled/);
  for (const state of ["CREATED", "READY", "RUNNING", "WAITING_INPUT", "WAITING_APPROVAL", "PAUSED", "CANCELLING", "NEEDS_RECONCILIATION", "COMPLETED", "PARTIAL", "FAILED", "UNVERIFIABLE"] as const) {
    assert.throws(() => derive({ ...attempt(), state }), /verifying or cancelled/);
  }
});

test("results must cover each criterion exactly once", () => {
  const a = attempt();
  assert.throws(() => derive(a, [result(a)]), /cover every/);
  assert.throws(() => derive(a, [result(a), result(a), result(a, 1)]), /cover every/);
  assert.throws(() => derive(a, [result(a), result(a)]), /Duplicate/);
  assert.throws(() => derive(a, [result(a), { ...result(a, 1), criterionId: "unknown" as CriterionId }]), /cover every/);
  assert.deepEqual(derive(a, [result(a, 1), result(a)]).criteriaResults.map(r => r.criterionId), ["first", "second"]);
});

test("every exact identity and version boundary is enforced", () => {
  const a = attempt();
  for (const patch of [
    { taskId: "other-task" }, { attemptId: "other-attempt" }, { workspaceId: "other-workspace" },
    { intentRevision: 1 }, { criterionRevision: 2 }, { method: "tool-receipt" },
  ]) {
    assert.throws(() => derive(a, [{ ...result(a), ...patch } as CriterionResult, result(a, 1)]), /match/);
  }
});

test("pass and fail require nonempty exact-version evidence and explanations", () => {
  const a = attempt();
  for (const status of ["pass", "fail"] as const) {
    const r = result(a, 0, status);
    for (const evidence of [[], [{ id: " ", revision: 1 }], [{ id: "e", revision: 0 }], [{ id: "e", revision: 1 }, { id: "e", revision: 2 }]]) {
      assert.throws(() => derive(a, [{ ...r, evidence }, result(a, 1)]));
    }
    assert.throws(() => derive(a, [{ ...r, explanation: " " }, result(a, 1)]), /explanation/);
  }
});

test("verification freshness uses an exclusive expiry boundary", () => {
  const a = attempt();
  for (const deadline of [createdAt, checkedAt, now]) {
    assert.throws(() => derive(a, [{ ...result(a), validUntil: deadline } as CriterionResult, result(a, 1)]), /expired/);
  }
  assert.equal(derive(a, [{ ...result(a), validUntil: "2026-10-01T00:02:00.001Z" } as CriterionResult, result(a, 1)]).status, "completed");
  for (const time of ["2026-09-30T23:59:59.999Z", "2026-10-01T00:02:00.001Z"]) {
    assert.throws(() => derive(a, [{ ...result(a), checkedAt: time }, result(a, 1)]), /Verification time/);
  }
});

test("noncanonical and impossible timestamps or reversed attempt times fail closed", () => {
  const a = attempt();
  for (const time of ["bad", "2026-10-01", "2026-02-30T00:00:00.000Z", "2026-10-01T00:01:00Z"]) {
    assert.throws(() => deriveOutcome(a, { id: outcomeId, revision: 1, now: time, results: [result(a), result(a, 1)] }), /timestamp/);
    assert.throws(() => derive(a, [{ ...result(a), checkedAt: time }, result(a, 1)]), /timestamp/);
  }
  assert.throws(() => derive({ ...a, updatedAt: validUntil }), /precede/);
  assert.throws(() => derive({ ...a, createdAt: now }), /precede/);
});

test("new evidence creates exactly the next same-id revision without overwriting history", () => {
  const a = attempt();
  const old = derive(a, [result(a, 0, "unknown"), result(a, 1, "unknown")]);
  const continued = { ...a, updatedAt: now, outcomes: [old] };
  const before = JSON.stringify(continued);
  const current = deriveOutcome(continued, { id: outcomeId, revision: 2, now, results: [result(a), result(a, 1)] });
  assert.equal(current.status, "completed");
  assert.equal(current.revision, 2);
  assert.equal(old.status, "unverifiable");
  assert.equal(JSON.stringify(continued), before);
  for (const revision of [0, 1, 3, 1.5, NaN, Infinity]) {
    assert.throws(() => deriveOutcome(continued, { id: outcomeId, revision, now, results: [result(a), result(a, 1)] }), /revision/);
  }
  assert.throws(() => deriveOutcome(continued, { id: "other" as OutcomeId, revision: 2, now, results: [result(a), result(a, 1)] }), /same id/);
  assert.throws(() => deriveOutcome(a, { id: outcomeId, revision: 2, now, results: [result(a), result(a, 1)] }), /starting at one/);
});

test("invalid historical identity, revision gaps and future history are rejected", () => {
  const a = attempt();
  const old = derive(a);
  for (const previous of [
    { ...old, workspaceId: ids.workspace("other") }, { ...old, revision: 2 },
    { ...old, recordedAt: validUntil }, { ...old, recordedAt: "2026-09-30T00:00:00.000Z" },
  ]) {
    assert.throws(() => deriveOutcome({ ...a, updatedAt: now, outcomes: [previous] }, { id: outcomeId, revision: 2, now, results: [result(a), result(a, 1)] }));
  }
});

test("new evidence can revise terminal Outcomes without changing terminal attempt history", () => {
  const a = attempt();
  for (const state of ["COMPLETED", "PARTIAL", "FAILED", "UNVERIFIABLE"] as const) {
    const statuses = state === "COMPLETED" ? ["pass", "pass"] as const
      : state === "PARTIAL" ? ["pass", "unknown"] as const
        : state === "FAILED" ? ["fail", "unknown"] as const : ["unknown", "unknown"] as const;
    const previous = derive(a, [result(a, 0, statuses[0]), result(a, 1, statuses[1])]);
    const terminal = { ...a, state, updatedAt: now, outcomes: [previous] };
    const before = JSON.stringify(terminal);
    const revised = deriveOutcome(terminal, {
      id: outcomeId, revision: 2, now,
      results: [result(a, 0, "fail"), result(a, 1, "fail")],
    });
    assert.equal(revised.status, "failed");
    assert.equal(revised.revision, 2);
    assert.equal(JSON.stringify(terminal), before);
    assert.equal(terminal.state, state);
    assert.equal(terminal.outcomes[0], previous);
    assert.throws(() => deriveOutcome({ ...terminal, cancellationRequested: true }, {
      id: outcomeId, revision: 2, now, results: [result(a), result(a, 1)],
    }), /Cancellation/);
  }
});

test("unknown in-flight effects block every terminal Outcome, including cancellation", () => {
  for (const state of ["VERIFYING", "CANCELLED", "COMPLETED", "PARTIAL", "FAILED", "UNVERIFIABLE"] as const) {
    const a = attempt();
    const withUnknown = {
      ...a, state, cancellationRequested: state === "CANCELLED",
      outcomes: [derive(a)], unresolvedActions: [{ id: "in-flight-action", revision: 1 }],
    };
    assert.throws(() => deriveOutcome(withUnknown, {
      id: outcomeId, revision: 2, now, results: [result(a), result(a, 1)],
    }), /Unresolved actions/);
  }
  assert.throws(() => derive({ ...attempt(), unresolvedActions: undefined } as unknown as TaskAttempt), /Unresolved actions/);
});

test("terminal rechecks require the original terminal status and valid completeness", () => {
  const a = attempt();
  const previous = derive(a);
  const snapshot = { ...a, state: "COMPLETED" as const, updatedAt: now, outcomes: [previous] };
  const input = { id: outcomeId, revision: 2, now, results: [result(a), result(a, 1)] };
  assert.throws(() => deriveOutcome({ ...snapshot, state: "FAILED" }, input), /initial Outcome/);
  assert.throws(() => deriveOutcome({ ...snapshot, completeness: "incomplete" }, input), /complete execution/);
  assert.throws(() => deriveOutcome({ ...snapshot, completeness: "not-settled" }, input), /settled/);
});

test("historical criterion corruption is rejected before deriving a replacement", () => {
  const a = attempt();
  const previous = derive(a);
  const corruptions = [
    { criteriaResults: [] },
    { criteriaResults: [previous.criteriaResults[0], previous.criteriaResults[0]] },
    { criteriaResults: [{ ...previous.criteriaResults[0], workspaceId: ids.workspace("other") }, previous.criteriaResults[1]] },
    { criteriaResults: [{ ...previous.criteriaResults[0], criterionRevision: 99 }, previous.criteriaResults[1]] },
    { criteriaResults: [{ ...previous.criteriaResults[0], evidence: [] }, previous.criteriaResults[1]] },
    { criteriaResults: [{ ...previous.criteriaResults[0], validUntil: now }, previous.criteriaResults[1]] },
    { criteriaResults: [{ ...previous.criteriaResults[0], checkedAt: validUntil }, previous.criteriaResults[1]] },
    { criteriaResults: [{ ...previous.criteriaResults[0], method: "model-assisted" }, previous.criteriaResults[1]] },
  ];
  for (const corrupt of corruptions) {
    assert.throws(() => deriveOutcome({
      ...a, updatedAt: now, outcomes: [{ ...previous, ...corrupt } as typeof previous],
    }, { id: outcomeId, revision: 2, now, results: [result(a), result(a, 1)] }));
  }
});

test("historical evidence need only have been fresh when its own Outcome was recorded", () => {
  const a = attempt();
  const previous = derive(a);
  const later = "2026-10-01T01:00:00.000Z";
  const snapshot = { ...a, state: "COMPLETED" as const, updatedAt: now, outcomes: [previous] };
  const next = deriveOutcome(snapshot, {
    id: outcomeId, revision: 2, now: later,
    results: [result(a, 0, "unknown"), result(a, 1, "unknown")],
  });
  assert.equal(next.status, "unverifiable");
  assert.equal(previous.status, "completed");
});

test("historical statuses cannot contradict their checked results", () => {
  const a = attempt();
  const input = { id: outcomeId, revision: 2, now, results: [result(a), result(a, 1)] };
  for (const originalStatus of ["pass", "fail", "unknown", "not-applicable"] as const) {
    const previous = derive(a, [result(a, 0, originalStatus), result(a, 1, originalStatus)]);
    for (const status of ["completed", "partial", "failed", "unverifiable", "cancelled"] as const) {
      if (status === previous.status) continue;
      assert.throws(() => deriveOutcome({
        ...a, updatedAt: now, outcomes: [{ ...previous, status }],
      }, input), /Historical/);
    }
  }
  const previous = derive(a);
  assert.throws(() => deriveOutcome({
    ...a, completeness: "incomplete", updatedAt: now, outcomes: [previous],
  }, input), /Historical Outcome status/);
});

test("untyped invalid result statuses and reasons cannot become success", () => {
  const a = attempt();
  for (const invalid of [
    { ...result(a), status: "success" },
    { ...result(a, 0, "unknown"), reason: "successful-error" },
  ]) assert.throws(() => derive(a, [invalid as CriterionResult, result(a, 1)]), /Unknown/);
});

test("inputs remain unchanged and deeply frozen output owns all nested records", () => {
  const a = attempt();
  const results = [result(a), result(a, 1)];
  const before = JSON.stringify({ a, results });
  const output = derive(a, results);
  assert.equal(JSON.stringify({ a, results }), before);
  assert.equal(Object.isFrozen(a), false);
  assert.equal(Object.isFrozen(results[0].evidence[0]), false);
  assert.ok(Object.isFrozen(output));
  assert.ok(Object.isFrozen(output.criteriaResults));
  for (const item of output.criteriaResults) {
    assert.ok(Object.isFrozen(item));
    assert.ok(Object.isFrozen(item.evidence));
    assert.ok(Object.isFrozen(item.evidence[0]));
  }
  assert.notEqual(output.criteriaResults[0], results[0]);
  assert.notEqual(output.criteriaResults[0].evidence[0], results[0].evidence[0]);
  assert.throws(() => { (output.criteriaResults[0].evidence[0] as { revision: number }).revision = 99; }, TypeError);
  (results[0].evidence[0] as { revision: number }).revision = 9;
  assert.equal(output.criteriaResults[0].evidence[0].revision, 1);
});

test("cancelled history cannot later claim success and verification cannot retain a pause request", () => {
  const a = { ...attempt(), state: "CANCELLED" as const, cancellationRequested: true };
  const first = derive(a);
  const corrupted = { ...first, revision: 2, status: "completed" as const };
  assert.throws(() => deriveOutcome({ ...a, updatedAt: now, outcomes: [first, corrupted] }, {
    id: outcomeId, revision: 3, now, results: [result(a), result(a, 1)],
  }), /Cancellation/);
  assert.throws(() => derive({ ...attempt(), pauseRequested: true }), /pending pause/);
});
