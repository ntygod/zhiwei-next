import assert from "node:assert/strict";
import test from "node:test";
import type { Task, CriterionId } from "../../../../packages/domain/src/index.ts";
import type { LocalApiCommandV1, SessionV1 } from "../../../../packages/protocol/src/index.ts";
import { reducePersistentTask } from "./task-reducer.ts";
import { syntheticTaskSessionContract, syntheticTaskPrompt } from "./application.ts";
const at = "2026-10-10T12:00:00.000Z";
const session: SessionV1 = { schemaVersion: 1, id: "session-test", workspaceId: "synthetic-workspace-a", revision: 1, ownerEpoch: 1, contract: syntheticTaskSessionContract, createdAt: at, updatedAt: at };
const context = { now: at, session, taskId: "task-test", attemptId: "attempt-one", nextRevision: 1, outcomeId: "outcome-test", requiresReauthorization: false, evidence: [], privacy: "local-only" as const };
const create: LocalApiCommandV1 = { schemaVersion: 1, commandId: "command-create", idempotencyKey: "key-create", workspaceId: session.workspaceId, expectedRevision: 0, payload: { kind: "task.create", sessionId: session.id, executionProfile: syntheticTaskSessionContract.runtimeProfile, request: syntheticTaskPrompt, constraints: [], acceptanceChecks: [{ id: "criterion-test" as CriterionId, revision: 1, description: "Synthetic check", required: true, method: "deterministic-test" }] } };
function command(task: Task, kind: "task.cancel" | "task.retry"): LocalApiCommandV1 { return { schemaVersion: 1, commandId: `command-${kind}`, idempotencyKey: `key-${kind}`, workspaceId: task.workspaceId, expectedRevision: task.revision, payload: { kind, targetRef: { kind: "task", id: task.id, revision: task.revision } } }; }
test("Reducer retains every CREATED/READY, cancel and fresh retry version", () => {
 const created = reducePersistentTask(undefined, create, context); assert.deepEqual(created.versions.map(task => [task.revision, task.state]), [[1, "CREATED"], [2, "READY"]]);
 const task = created.versions.at(-1)!, cancelled = reducePersistentTask(task, command(task, "task.cancel"), context); assert.deepEqual(cancelled.versions.map(task => task.state), ["CANCELLING", "CANCELLED"]);
 const old = cancelled.versions.at(-1)!, retry = reducePersistentTask(old, command(old, "task.retry"), { ...context, attemptId: "attempt-two" }).versions.at(-1)!; assert.deepEqual(retry.attempts[0], old.attempts[0]); assert.equal(retry.attempts[1]!.id, "attempt-two");
});
test("Live execution does not become CANCELLED on a cancellation request", () => {
 const task = reducePersistentTask(undefined, create, context).versions.at(-1)!; const result = reducePersistentTask(task, command(task, "task.cancel"), { ...context, activeExecution: { bindingId: "binding-one", state: "BUSY", dispatched: true, closed: false } }); assert.deepEqual(result.versions.map(task => task.state), ["CANCELLING"]);
});
test("Settled is VERIFYING and interruption yields only unknown criteria", () => {
 const task = reducePersistentTask(undefined, create, context).versions.at(-1)!;
 const runtime = (task: Task, event: "start" | "settled" | "interrupted") => reducePersistentTask(task, { schemaVersion: 1, commandId: `runtime-${event}`, idempotencyKey: `runtime-key-${event}`, workspaceId: task.workspaceId, expectedRevision: task.revision, payload: { kind: "task.runtime", taskId: task.id, event, completeness: "incomplete", evidenceRefs: [{ id: "stored-runtime-record", revision: 1 }] } }, context).versions.at(-1)!;
 const verifying = runtime(runtime(task, "start"), "settled"); assert.equal(verifying.state, "VERIFYING"); assert.equal(verifying.attempts[0]!.outcomes.length, 0);
 const unknown = runtime(verifying, "interrupted"); assert.equal(unknown.state, "UNVERIFIABLE"); assert.ok(unknown.attempts[0]!.outcomes[0]!.criteriaResults.every(row => row.status === "unknown"));
});
