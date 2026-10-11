import assert from "node:assert/strict";
import test from "node:test";
import type { ExecutionSpecV1, JsonValue } from "../../../../packages/protocol/src/index.ts";
import {
  ControlledBrokerError, controlledBrokerNotRun, createSyntheticControlledBroker,
  parseControlledBrokerRequest, parseSyntheticBrokerSpec,
} from "./controlled-broker.ts";

const NOW = Date.parse("2026-10-10T00:00:00.000Z");
function spec(): ExecutionSpecV1 {
  return {
    schemaVersion: 1, executionUnitId: "synthetic-execution", workspaceId: "synthetic-workspace", sessionId: "synthetic-session",
    prompt: "Complete the synthetic sample project.", requestSnapshotRef: { contentId: "synthetic-input", contentVersion: 1 },
    fence: {
      installationId: "synthetic-installation", recoveryEpoch: "synthetic-recovery", owner: { kind: "task_attempt", id: "synthetic-attempt" },
      sourceTask: { taskId: "synthetic-task", attemptId: "synthetic-attempt", intentRevision: 1 }, contractRevision: 1, leaseEpoch: 1,
      cognition: { global: 1, workspace: 1 }, policy: { global: 1, workspace: 1 }, notAfter: "2026-10-10T00:10:00.000Z",
    },
    selectedModelProfile: { id: "synthetic-v1", revision: 1 }, toolProfile: "controlled-read-memory-draft-v1",
    bounds: { maxOutputBytes: 8192, maxDurationMs: 60_000, maxTokens: 4096, maxModelRequests: 4, maxToolCalls: 3 },
    controlledCwdRef: "synthetic-directory",
  };
}
function modelRequest(requestId = "model-1", context: JsonValue = { systemPrompt: "Synthetic instructions.", messages: [{ role: "user", content: "Synthetic sample prompt.", timestamp: NOW }], tools: [] }) {
  return { kind: "model.invoke", requestId, context, maxTokens: 512 };
}
const tools: JsonValue[] = [
  { name: "zhiwei_file_read", description: "Read the synthetic fixture.", parameters: { type: "object", properties: { resourceId: { type: "string" } }, required: ["resourceId"], additionalProperties: false } },
  { name: "zhiwei_memory_read", description: "Read the synthetic memory.", parameters: { type: "object", properties: { resourceId: { type: "string" } }, required: ["resourceId"], additionalProperties: false } },
  { name: "zhiwei_draft_write", description: "Create a synthetic isolated draft.", parameters: { type: "object", properties: { name: { type: "string" }, text: { type: "string" } }, required: ["name", "text"], additionalProperties: false } },
];

test("ordinary synthetic file, memory and isolated draft lifecycle", async () => {
  const broker = await createSyntheticControlledBroker(spec(), { now: () => NOW });
  try {
    const file = await broker.handle({ kind: "file.read", requestId: "read-file", resourceId: "fixture-file" });
    assert(file.ok && file.result.kind === "tool.result");
    assert.equal(file.result.text, "Synthetic file fixture: the sample project uses a blue notebook.\n");
    const memory = await broker.handle({ kind: "memory.read", requestId: "read-memory", resourceId: "fixture-memory" });
    assert(memory.ok && memory.result.kind === "tool.result");
    assert.match(memory.result.text, /^Synthetic memory fixture:/);
    const draftText = "A synthetic sample draft.";
    const draft = await broker.handle({ kind: "draft.write", requestId: "write-draft", name: "sample.txt", text: draftText });
    assert(draft.ok && draft.result.kind === "tool.result");
    assert.match(draft.result.draftId!, /^draft-/);
    const snapshot = broker.snapshot();
    assert.equal(snapshot.toolCalls, 3);
    assert.equal(snapshot.mode, "synthetic-fixtures-only");
    assert.equal(snapshot.durableAuthority, "unsupported");
    assert.deepEqual(snapshot.drafts, [{ draftId: draft.result.draftId, name: "sample.txt", bytes: Buffer.byteLength(draftText) }]);
    assert.deepEqual(await broker.handle({ kind: "draft.write", requestId: "write-draft", name: "sample.txt", text: draftText }), { requestId: "write-draft", ok: false, error: { code: "duplicate_request" } });
    assert.equal(broker.snapshot().drafts.length, 1);
    assert.deepEqual(await broker.handle({ kind: "memory.read", requestId: "over-budget", resourceId: "fixture-memory" }), { requestId: "over-budget", ok: false, error: { code: "budget_exceeded" } });
    assert.deepEqual(await broker.dispose(), { status: "disposed" });
    assert.deepEqual(await broker.dispose(), { status: "disposed" });
    assert.equal(broker.snapshot().cleanup, "disposed");
    assert.deepEqual(await broker.handle(modelRequest()), { requestId: "model-1", ok: false, error: { code: "closed" } });
  } finally { await broker.dispose(); }
});

test("actual synthetic model request is captured before receiver delivery and retained immutably", async () => {
  const broker = await createSyntheticControlledBroker(spec(), { now: () => NOW });
  try {
    const request = modelRequest();
    const response = await broker.handle(request);
    assert(response.ok && response.result.kind === "model.result");
    assert.equal(response.result.text, "Synthetic model fixture response.");
    const snapshot = broker.snapshot();
    assert.equal(snapshot.modelRequests.length, 1);
    assert.equal(snapshot.receiverRequests.length, 1);
    assert.strictEqual(snapshot.modelRequests[0], snapshot.receiverRequests[0]);
    assert.deepEqual(snapshot.receiverRequests[0]!.context, request.context);
    assert.equal(snapshot.receiverRequests[0]!.serializedBytes, Buffer.byteLength(JSON.stringify(request.context)));
    assert.equal(snapshot.receiverRequests[0]!.workspaceId, spec().workspaceId);
    assert.equal(snapshot.receiverRequests[0]!.executionUnitId, spec().executionUnitId);
    assert.deepEqual(snapshot.receiverRequests[0]!.fence, spec().fence);
    assert.equal(snapshot.reservedTokens, 512);
    assert(Object.isFrozen(snapshot.receiverRequests[0]!.context));
    assert(Object.isFrozen(snapshot.receiverRequests[0]!.fence));
  } finally { assert.deepEqual(await broker.dispose(), { status: "disposed" }); }
});

test("bounded actual context includes system text, tool schemas, assistant calls and results", async () => {
  const broker = await createSyntheticControlledBroker(spec(), { now: () => NOW, scenario: "tools" });
  try {
    const messages: JsonValue[] = [{ role: "user", content: [{ type: "text", text: "Complete the synthetic sample." }], timestamp: NOW }];
    const first = await broker.handle(modelRequest("model-1", { systemPrompt: "Synthetic fixed instructions.", tools, messages }));
    assert(first.ok && first.result.kind === "model.result");
    assert.deepEqual(first.result.toolCalls, [{ id: "synthetic-file-call", name: "zhiwei_file_read", arguments: { resourceId: "fixture-file" } }]);
    const file = await broker.handle({ kind: "file.read", requestId: "file-1", resourceId: "fixture-file" });
    assert(file.ok && file.result.kind === "tool.result");
    messages.push({ role: "assistant", content: [{ type: "toolCall", ...first.result.toolCalls![0]! }], api: "synthetic", provider: "zhiwei-controlled", model: "synthetic-v1", usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }, stopReason: "toolUse", timestamp: NOW });
    messages.push({ role: "toolResult", toolCallId: "synthetic-file-call", toolName: "zhiwei_file_read", content: [{ type: "text", text: file.result.text }], details: { synthetic: true }, isError: false, timestamp: NOW });
    const actual = { systemPrompt: "Synthetic fixed instructions.", tools, messages };
    const second = await broker.handle(modelRequest("model-2", actual));
    assert(second.ok && second.result.kind === "model.result");
    assert.equal(second.result.toolCalls![0]!.name, "zhiwei_memory_read");
    const captured = broker.snapshot().receiverRequests[1]!.context;
    assert.deepEqual(captured, actual);
    assert.equal((captured as Record<string, JsonValue>).systemPrompt, actual.systemPrompt);
    assert.deepEqual((captured as Record<string, JsonValue>).tools, tools);
  } finally { await broker.dispose(); }
});

test("synthetic request count, token reservation, output and deadline bounds are explicit", async () => {
  let now = NOW;
  const original = spec();
  const broker = await createSyntheticControlledBroker({ ...original, bounds: { ...original.bounds, maxModelRequests: 1 } }, { now: () => now });
  try {
    assert((await broker.handle(modelRequest())).ok);
    assert.deepEqual(await broker.handle(modelRequest("model-2")), { requestId: "model-2", ok: false, error: { code: "budget_exceeded" } });
    assert.deepEqual(await broker.handle(modelRequest()), { requestId: "model-1", ok: false, error: { code: "duplicate_request" } });
    now += 60_000;
    assert.deepEqual(await broker.handle({ kind: "memory.read", requestId: "expired-memory", resourceId: "fixture-memory" }), { requestId: "expired-memory", ok: false, error: { code: "expired" } });
    assert.equal(broker.snapshot().receiverRequests.length, 1);
    assert.equal(broker.snapshot().toolCalls, 0);
  } finally { await broker.dispose(); }
  const small = await createSyntheticControlledBroker({ ...original, bounds: { ...original.bounds, maxTokens: 128, maxOutputBytes: 16 } }, { now: () => NOW });
  try {
    assert.deepEqual(await small.handle({ ...modelRequest(), maxTokens: 128 }), { requestId: "model-1", ok: false, error: { code: "budget_exceeded" } });
    assert.equal(small.snapshot().receiverRequests.length, 0);
  } finally { await small.dispose(); }
  const reservation = await createSyntheticControlledBroker({ ...original, bounds: { ...original.bounds, maxTokens: 512 } }, { now: () => NOW });
  try {
    assert((await reservation.handle(modelRequest())).ok);
    assert.deepEqual(await reservation.handle(modelRequest("model-2")), { requestId: "model-2", ok: false, error: { code: "budget_exceeded" } });
    assert.equal(reservation.snapshot().reservedTokens, 512);
    assert.equal(reservation.snapshot().receiverRequests.length, 1);
  } finally { await reservation.dispose(); }
});

test("pure DTO checks reject unknown capability and malformed shape without I/O", () => {
  for (const input of [null, {}, { kind: "unknown", requestId: "request" }, { ...modelRequest(), extra: true }, { ...modelRequest(), maxTokens: 0 }, { ...modelRequest(), context: { messages: "bad" } }]) {
    assert.throws(() => parseControlledBrokerRequest(input), error => error instanceof ControlledBrokerError);
  }
  assert.deepEqual(parseControlledBrokerRequest({ kind: "memory.read", requestId: "read", resourceId: "fixture-memory" }), { kind: "memory.read", requestId: "read", resourceId: "fixture-memory" });
  const oversized = { messages: Array.from({ length: 5 }, () => ({ role: "user", content: "x".repeat(65_536), timestamp: NOW })) };
  assert.throws(() => parseControlledBrokerRequest(modelRequest("large", oversized)), error => error instanceof ControlledBrokerError && error.code === "invalid_request");
});

test("pure fixture-profile validation requires the exact synthetic model revision", () => {
  assert.deepEqual(parseSyntheticBrokerSpec(spec()).selectedModelProfile, { id: "synthetic-v1", revision: 1 });
  for (const selectedModelProfile of [{ id: "synthetic-v2", revision: 1 }, { id: "synthetic-v1", revision: 2 }]) {
    assert.throws(() => parseSyntheticBrokerSpec({ ...spec(), selectedModelProfile }), error => error instanceof ControlledBrokerError && error.code === "unsupported");
  }
});

test("coverage status does not claim restricted adversarial or production authority validation", () => {
  assert.deepEqual(controlledBrokerNotRun.map(row => row.scenario), ["durable-authority", "private-data", "injection", "link-substitution", "backup-recovery"]);
  assert(controlledBrokerNotRun.every(row => row.status === "not_run"));
});

test("Synchronous durable input commit precedes first-party synthetic reception", async () => {
  let committed = false;
  const broker = await createSyntheticControlledBroker(spec(), { now: () => NOW,
    beforeSyntheticModelReceive(record) { assert.equal(record.requestId, "model-1"); committed = true; } });
  try { const response = await broker.handle(modelRequest()); assert.equal(response.ok, true); assert.equal(committed, true); assert.equal(broker.snapshot().receiverRequests.length, 1); }
  finally { await broker.dispose(); }
});

test("Failed or asynchronous durable input hook prevents synthetic reception", async () => {
  for (const beforeSyntheticModelReceive of [() => { throw new Error("synthetic transaction rejected"); }, (() => Promise.resolve()) as unknown as () => void]) {
    const broker = await createSyntheticControlledBroker(spec(), { now: () => NOW, beforeSyntheticModelReceive });
    try { assert.equal((await broker.handle(modelRequest())).ok, false); assert.equal(broker.snapshot().receiverRequests.length, 0); }
    finally { await broker.dispose(); }
  }
});
