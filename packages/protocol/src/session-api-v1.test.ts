import assert from "node:assert/strict";
import { test } from "node:test";
import { parseSessionContractV1, parseSessionCreateCommandV1, parseSessionV1, parseProductEventV1, parseSessionTaskV1, deserializeProductEventV1, deserializeSessionCreateCommandV1, serializeSessionCreateCommandV1 } from "./session-api-v1.ts";
const profile = () => ({ id: "synthetic-profile", revision: 1 });
const contract = () => ({ schemaVersion: 1, runtimeProfile: profile(), modelProfile: profile(), toolProfile: profile(), policyProfile: profile(), dataProfile: profile(), compilerProfile: profile(), interactionKind: "interactive" });
const create = () => ({ schemaVersion: 1, commandId: "command-1", idempotencyKey: "key-1", workspaceId: "synthetic-workspace-a", expectedRevision: 0, payload: { kind: "session.create", contract: contract() } });
test("Session v1 is independently versioned, detached and losslessly serialized", () => {
  const input = create(); const parsed = parseSessionCreateCommandV1(input);
  assert.deepEqual(deserializeSessionCreateCommandV1(serializeSessionCreateCommandV1(parsed)), parsed);
  input.payload.contract.runtimeProfile.id = "changed"; assert.equal(parsed.payload.contract.runtimeProfile.id, "synthetic-profile");
  assert.ok(Object.isFrozen(parsed.payload.contract));
  assert.throws(() => deserializeSessionCreateCommandV1(JSON.stringify(create()).replace('"schemaVersion":1', '"schemaVersion":1,"schemaVersion":1')));
});
test("Session contracts reject unknown fields, versions and missing exact profile refs", () => {
  assert.throws(() => parseSessionContractV1({ ...contract(), accepted: true }));
  assert.throws(() => parseSessionContractV1({ ...contract(), toolProfile: undefined }));
  assert.throws(() => parseSessionContractV1({ ...contract(), schemaVersion: 2 }));
  assert.throws(() => parseSessionCreateCommandV1({ ...create(), principalId: "other" }));
  assert.throws(() => parseSessionCreateCommandV1({ ...create(), expectedRevision: 1 }));
  assert.throws(() => parseSessionV1({ schemaVersion: 1, id: "session", workspaceId: "workspace", revision: 1, ownerEpoch: 0, contract: contract(), createdAt: "2026-10-10T00:00:00.000Z", updatedAt: "2026-10-10T00:00:00.000Z" }));
});
test("Product events reject unknown vocabulary and cross-kind payloads without changing Runtime v1", () => {
  const event = { schemaVersion: 1, eventId: "event-1", workspaceId: "workspace-a", aggregate: { kind: "task", id: "task-1", revision: 1 }, occurredAt: "2026-10-10T00:00:00.000Z", type: "task.created", payload: { state: "READY", intentRevision: 1 } };
  assert.deepEqual(parseProductEventV1(event), event);
  assert.throws(() => parseProductEventV1({ ...event, type: "unknown.event" }));
  assert.throws(() => parseProductEventV1({ ...event, payload: { ...event.payload, modelThinking: "not permitted" } }));
  assert.throws(() => parseProductEventV1({ ...event, aggregate: { ...event.aggregate, kind: "session" } }));
  assert.throws(() => parseProductEventV1({ ...event, occurredAt: "2026-02-30T00:00:00.000Z" }));
});
test("Execution-close ProductEvent v1 carries a detached binding revision without Task state", () => {
  const event = { schemaVersion: 1, eventId: "event-close", workspaceId: "workspace-a", aggregate: { kind: "task", id: "task-1", revision: 2 }, occurredAt: "2026-10-10T00:00:00.000Z", type: "task.execution_closed", payload: { bindingId: "binding-1", executionRevision: 4 } };
  const parsed = parseProductEventV1(event);
  assert.deepEqual(parsed, event); assert.deepEqual(deserializeProductEventV1(JSON.stringify(parsed)), parsed);
  assert.equal(parsed.aggregate.revision, 2); assert.ok(Object.isFrozen(parsed.payload)); assert.ok(Object.isFrozen(parsed.aggregate));
  event.payload.bindingId = "changed"; event.aggregate.revision = 3;
  assert.equal(parsed.aggregate.revision, 2); assert.deepEqual(parsed.payload, { bindingId: "binding-1", executionRevision: 4 });
});
test("Execution-close ProductEvent v1 rejects invalid aggregates, payloads and extensions", () => {
  const event = { schemaVersion: 1, eventId: "event-close", workspaceId: "workspace-a", aggregate: { kind: "task", id: "task-1", revision: 2 }, occurredAt: "2026-10-10T00:00:00.000Z", type: "task.execution_closed", payload: { bindingId: "binding-1", executionRevision: 4 } };
  for (const aggregate of [
    { ...event.aggregate, kind: "session" }, { ...event.aggregate, kind: "execution" },
    { ...event.aggregate, id: "" }, { ...event.aggregate, revision: 0 },
    { ...event.aggregate, revision: 1.5 }, { ...event.aggregate, executionRevision: 4 },
  ]) assert.throws(() => parseProductEventV1({ ...event, aggregate }));
  for (const payload of [
    { executionRevision: 4 }, { bindingId: "binding-1" }, { ...event.payload, bindingId: "" },
    { ...event.payload, bindingId: 1 }, { ...event.payload, state: "CANCELLED" },
    { ...event.payload, intentRevision: 1 }, { ...event.payload, closed: true },
    ...[0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, "4", null].map(executionRevision => ({ ...event.payload, executionRevision })),
  ]) assert.throws(() => parseProductEventV1({ ...event, payload }));
  assert.throws(() => parseProductEventV1({ ...event, schemaVersion: 2 }));
  assert.throws(() => parseProductEventV1({ ...event, type: "task.execution_reopened" }));
  assert.throws(() => parseProductEventV1({ ...event, executionRevision: 4 }));
  assert.throws(() => deserializeProductEventV1(JSON.stringify(event).replace('"executionRevision":4', '"executionRevision":3,"executionRevision":4')));
});
test("Task transport rejects multiple active attempts and current intent drift", () => {
  const intent = { revision: 1, request: "Synthetic report", constraints: [], criteria: [{ id: "criterion", revision: 1, description: "Synthetic check", required: true, method: "artifact" }] };
  const time = "2026-10-10T00:00:00.000Z";
  const attempt = { id: "attempt-1", taskId: "task-1", workspaceId: "workspace-a", intent: structuredClone(intent), state: "READY", createdAt: time, updatedAt: time, pauseRequested: false, cancellationRequested: false, completeness: "not-settled", outcomes: [], unresolvedActions: [] };
  const task = { id: "task-1", workspaceId: "workspace-a", sessionId: "session-1", revision: 1, intent, state: "READY", attempts: [attempt], createdAt: time, updatedAt: time };
  assert.deepEqual(parseSessionTaskV1(task), task);
  assert.throws(() => parseSessionTaskV1({ ...task, attempts: [attempt, { ...structuredClone(attempt), id: "attempt-2" }] }));
  assert.throws(() => parseSessionTaskV1({ ...task, intent: { ...intent, request: "Changed" } }));
  assert.throws(() => parseSessionTaskV1({ ...task, hidden: "payload" }));
  for (const patch of [
    { state: "CANCELLED", cancellationRequested: true, completeness: "not-settled" },
    { state: "CANCELLED", cancellationRequested: false, completeness: "complete" },
    { state: "PAUSED", pauseRequested: true },
    { state: "CANCELLING", cancellationRequested: false },
    { state: "VERIFYING", completeness: "not-settled" },
    { state: "NEEDS_RECONCILIATION", completeness: "incomplete", unresolvedActions: [] },
    { state: "READY", completeness: "complete" },
  ]) assert.throws(() => parseSessionTaskV1({ ...task, state: patch.state, attempts: [{ ...attempt, ...patch }] }));
  const cancelled = { ...task, state: "CANCELLED", attempts: [{ ...attempt, state: "CANCELLED", cancellationRequested: true, completeness: "complete" }] };
  assert.equal(parseSessionTaskV1(cancelled).state, "CANCELLED");
});

test("Snapshot pages bound worst-case legal profile references without capping the assembled inventory at 100", async () => {
  const { parseSessionSnapshotPageV1, parseSessionSnapshotV1 } = await import("./session-api-v1.ts");
  const session = (index: number) => ({ schemaVersion: 1, id: `session-${index}`.padEnd(256, "s"), workspaceId: "w".repeat(256), revision: Number.MAX_SAFE_INTEGER, ownerEpoch: Number.MAX_SAFE_INTEGER, contract: { ...contract(), ...Object.fromEntries(["runtimeProfile", "modelProfile", "toolProfile", "policyProfile", "dataProfile", "compilerProfile"].map(key => [key, { id: "p".repeat(256), revision: Number.MAX_SAFE_INTEGER }])) }, createdAt: "2026-10-10T00:00:00.000Z", updatedAt: "2026-10-10T00:00:00.000Z" });
  const page = { schemaVersion: 1, workspaceId: "w".repeat(256), sessions: Array.from({ length: 50 }, (_, index) => session(index)), tasks: [], asOfCursor: "c".repeat(2048), nextCursor: "n".repeat(2048) };
  assert.equal(parseSessionSnapshotPageV1(page).sessions.length, 50); assert.ok(new TextEncoder().encode(JSON.stringify(page)).byteLength < 1_048_576);
  assert.throws(() => parseSessionSnapshotPageV1({ ...page, sessions: [...page.sessions, session(51)] }));
  assert.throws(() => parseSessionSnapshotPageV1({ ...page, sessions: [], nextCursor: "next" }));
  assert.equal(parseSessionSnapshotV1({ schemaVersion: 1, workspaceId: "w".repeat(256), sessions: Array.from({ length: 1001 }, (_, index) => session(index)), tasks: [], asOfCursor: "cursor" }).sessions.length, 1001);
});

test("Session error parser recognizes transport recovery reasons but rejects unknown and retryable-invalid extensions", async () => {
  const { parseSessionApiErrorV1 } = await import("./session-api-v1.ts");
  const input = { schemaVersion: 1, error: { code: "unavailable", reason: "snapshot_required", safeMessage: "Reload snapshot.", retryable: false, diagnosticId: "diagnostic-fixture" } };
  for (const reason of ["snapshot_required", "event_gap", "slow_consumer"]) assert.equal(parseSessionApiErrorV1({ ...input, error: { ...input.error, reason } }).error.reason, reason);
  assert.throws(() => parseSessionApiErrorV1({ ...input, error: { ...input.error, reason: "unknown_reason" } }));
  assert.throws(() => parseSessionApiErrorV1({ ...input, error: { ...input.error, retryable: true } }));
  assert.throws(() => parseSessionApiErrorV1({ ...input, error: { ...input.error, secret: "forbidden" } }));
});

test("Task recovery metadata is strict, detached read-side availability and never a new Task state", async () => {
  const { parseSessionTaskRecoveryV1, parseTaskSummaryV1 } = await import("./session-api-v1.ts");
  const recovery = { status: "blocked", reason: "worker_custody_required" }; const parsed = parseSessionTaskRecoveryV1(recovery); recovery.reason = "changed";
  assert.equal(parsed.reason, "worker_custody_required"); assert.ok(Object.isFrozen(parsed));
  for (const invalid of [{ status: "running", reason: "worker_custody_required" }, { status: "blocked", reason: "unknown" }, { status: "blocked", reason: "worker_custody_required", pid: 123 }]) assert.throws(() => parseSessionTaskRecoveryV1(invalid));
  const summary = { id: "task-1", workspaceId: "workspace-a", sessionId: "session-1", revision: 2, intentRevision: 1, state: "RUNNING", updatedAt: "2026-10-10T00:00:00.000Z", recovery: parsed };
  assert.deepEqual(parseTaskSummaryV1(summary), summary); assert.throws(() => parseTaskSummaryV1({ ...summary, state: "BLOCKED" }));
});
