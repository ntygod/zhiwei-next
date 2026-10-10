import assert from "node:assert/strict";
import { test } from "node:test";
import { parseSessionContractV1, parseSessionCreateCommandV1, parseSessionV1, parseProductEventV1, parseSessionTaskV1, deserializeSessionCreateCommandV1, serializeSessionCreateCommandV1 } from "./session-api-v1.ts";
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
