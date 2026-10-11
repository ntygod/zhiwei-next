import assert from "node:assert/strict";
import test from "node:test";
import { buildNormalizedRuntimeEventV1Fixture } from "../fixtures/normalized-runtime-event-v1.fixture.ts";
import {
  CognitiveProtocolError, parseExecutionFenceV1, parseExecutionSpecV1,
  parseRuntimeCapabilityProfileV1, parseRuntimeBindingV1, parseNormalizedRuntimeEnvelopeV1,
  parseRuntimeStopAcknowledgementV1, parseRuntimeProcessCloseEvidenceV1, parseRuntimeCommandAcceptanceV1,
  canonicalNormalizedRuntimeEventV1, createNormalizedRuntimeEventV1,
  type ExecutionSpecV1, type RuntimeCapabilityProfileV1, type RuntimeBindingV1,
} from "./index.ts";

// Pure invented contract examples. No process, model, account, storage or credentials are used.
const spec = (): ExecutionSpecV1 => ({
  schemaVersion: 1, executionUnitId: "execution-synthetic-1", workspaceId: "workspace-synthetic-1", sessionId: "session-product-1",
  prompt: "Summarize the synthetic sample.", requestSnapshotRef: { contentId: "snapshot-synthetic-1", contentVersion: 1 },
  fence: {
    installationId: "installation-synthetic-1", recoveryEpoch: "recovery-synthetic-1", owner: { kind: "task_attempt", id: "attempt-synthetic-1" },
    sourceTask: { taskId: "task-synthetic-1", attemptId: "attempt-synthetic-1", intentRevision: 2 },
    contractRevision: 1, leaseEpoch: 3, cognition: { global: 0, workspace: 2 }, policy: { global: 1, workspace: 2 }, notAfter: "2026-10-10T12:00:00.000Z",
  },
  selectedModelProfile: { id: "synthetic-model-v1", revision: 1 }, toolProfile: "none",
  bounds: { maxOutputBytes: 65_536, maxDurationMs: 5000, maxTokens: 1000, maxModelRequests: 2, maxToolCalls: 0 },
  controlledCwdRef: "cwd-synthetic-1",
});
const capability = (): RuntimeCapabilityProfileV1 => ({
  schemaVersion: 1, profileId: "synthetic-runtime-v1", profileRevision: 1, runtime: { implementation: "synthetic", version: "1.0.0" },
  structuredDecision: { status: "supported", evidenceRevision: "fixture-1", limitations: [] },
  modelBoundaryCapture: { status: "limited", evidenceRevision: "fixture-1", limitations: ["synthetic-input-only"] },
  toolInterception: { status: "limited", evidenceRevision: "fixture-1", limitations: ["fixed-tools-only"] },
  abort: { status: "limited", evidenceRevision: "fixture-1", limitations: ["runtime-boundary-only"] },
  resume: { status: "unsupported", evidenceRevision: "fixture-1", limitations: ["no-checkpoint-contract"] },
  progress: { status: "supported", evidenceRevision: "fixture-1", limitations: [] },
  nativeCompaction: { status: "unsupported", evidenceRevision: "fixture-1", limitations: [] },
});
const binding = (): RuntimeBindingV1 => ({
  schemaVersion: 1, bindingId: "binding-1", executionUnitId: "execution-synthetic-1", workspaceId: "workspace-synthetic-1", sessionId: "session-product-1",
  owner: { kind: "task_attempt", id: "attempt-synthetic-1" }, workerInstanceId: "worker-synthetic-1", leaseEpoch: 3, profileRevision: 1,
  runtime: { implementation: "synthetic", version: "1.0.0" }, state: "READY",
  observedRuntimeSessionIds: ["runtime-native-1"],
  sourceStreams: [{ sourceStreamId: "stream-1", surface: "rpc", runtimeInstanceId: "runtime-instance-1", sequenceDomain: "rpc-source-1" }],
});
const mutable = (value: unknown): Record<string, any> => JSON.parse(JSON.stringify(value));
const reject = (parse: (value: unknown) => unknown, input: unknown) => assert.throws(() => parse(input), CognitiveProtocolError);

test("ExecutionSpec round-trips exact identity and bounded inputs without inferring authorization", () => {
  const input = mutable(spec());
  const result = parseExecutionSpecV1(input);
  assert.deepEqual(result, spec());
  assert.deepEqual(parseExecutionSpecV1(JSON.parse(JSON.stringify(result))), result);
  input.fence.policy.workspace = 99;
  input.requestSnapshotRef.contentVersion = 99;
  assert.equal(result.fence.policy.workspace, 2);
  assert.equal(result.requestSnapshotRef.contentVersion, 1);
  assert.ok(Object.isFrozen(result)); assert.ok(Object.isFrozen(result.fence.policy)); assert.ok(Object.isFrozen(result.bounds));
  // The DTO records expiry but deliberately neither consults a clock nor asserts the lease is current.
  assert.equal(parseExecutionFenceV1({ ...result.fence, notAfter: "2000-01-01T00:00:00.000Z" }).notAfter, "2000-01-01T00:00:00.000Z");
});

test("cognitive jobs keep their exact owner and optional source instead of fabricating a task", () => {
  const input = mutable(spec());
  input.fence.owner = { kind: "cognitive_job", id: "job-1" };
  delete input.fence.sourceTask;
  assert.equal(parseExecutionSpecV1(input).fence.owner.kind, "cognitive_job");
  assert.equal(Object.hasOwn(parseExecutionSpecV1(input).fence, "sourceTask"), false);
  input.fence.sourceTask = { taskId: "task-source-1", intentRevision: 4 };
  assert.deepEqual(parseExecutionSpecV1(input).fence.sourceTask, input.fence.sourceTask);
  input.toolProfile = "controlled-read-memory-draft-v1";
  reject(parseExecutionSpecV1, input);
});

test("ExecutionSpec rejects authority flags, identity drift, paths, unknown enums and unbounded counters", () => {
  const mutations = [
    (v: any) => { v.schemaVersion = 2; }, (v: any) => { v.authorized = true; },
    (v: any) => { v.credentials = "synthetic-secret"; }, (v: any) => { v.cwd = "/synthetic/path"; },
    (v: any) => { v.controlledCwdRef = "/synthetic/path"; }, (v: any) => { v.controlledCwdRef = "../synthetic"; },
    (v: any) => { v.requestSnapshotRef.contentId = "https://synthetic.invalid/snapshot"; },
    (v: any) => { v.requestSnapshotRef.contentVersion = 0; },
    (v: any) => { v.fence.owner = { kind: "task", id: "task-1" }; },
    (v: any) => { v.fence.owner.id = "wrong-attempt"; }, (v: any) => { delete v.fence.sourceTask; },
    (v: any) => { delete v.fence.sourceTask.attemptId; },
    (v: any) => { v.fence.cognition.otherWorkspace = 1; }, (v: any) => { v.fence.cognition.global = -1; },
    (v: any) => { v.fence.leaseEpoch = 0; }, (v: any) => { v.fence.notAfter = "2026-02-30T12:00:00.000Z"; },
    (v: any) => { v.toolProfile = "all-tools"; }, (v: any) => { v.bounds.maxToolCalls = 1; },
    (v: any) => { v.bounds.maxOutputBytes = 0; }, (v: any) => { v.bounds.maxDurationMs = 0.5; },
    (v: any) => { v.bounds.maxTokens = Number.MAX_SAFE_INTEGER + 1; }, (v: any) => { v.bounds.maxModelRequests = 0; },
    (v: any) => { v.bounds.maxTokens = Infinity; }, (v: any) => { delete v.bounds.maxModelRequests; },
    (v: any) => { v.selectedModelProfile.revision = 0; }, (v: any) => { v.prompt = ""; },
  ];
  for (const mutate of mutations) { const input = mutable(spec()); mutate(input); reject(parseExecutionSpecV1, input); }
  const controlled = mutable(spec()); controlled.toolProfile = "controlled-read-memory-draft-v1"; controlled.bounds.maxToolCalls = 2;
  assert.equal(parseExecutionSpecV1(controlled).bounds.maxToolCalls, 2);
});

test("each capability independently records support and a versioned evidence reference", () => {
  const input = mutable(capability()), parsed = parseRuntimeCapabilityProfileV1(input);
  assert.deepEqual(parsed, capability());
  assert.deepEqual(parseRuntimeCapabilityProfileV1(JSON.parse(JSON.stringify(parsed))), parsed);
  input.abort.limitations.push("changed"); assert.equal(parsed.abort.limitations.length, 1);
  assert.ok(Object.isFrozen(parsed.abort.limitations));
  for (const mutate of [
    (v: any) => { v.supportsEverything = true; }, (v: any) => { v.structuredDecision = true; },
    (v: any) => { delete v.modelBoundaryCapture; }, (v: any) => { v.abort.status = "best-effort"; },
    (v: any) => { v.abort.limitations = []; }, (v: any) => { v.progress.limitations = ["limited-scope"]; },
    (v: any) => { v.resume.evidenceRevision = ""; }, (v: any) => { v.nativeCompaction.evidenceRevision = 1; },
    (v: any) => { v.toolInterception.limitations.push(v.toolInterception.limitations[0]); },
  ]) { const changed = mutable(capability()); mutate(changed); reject(parseRuntimeCapabilityProfileV1, changed); }
});

test("binding records observed session, instance and source sequence domains independently", () => {
  const parsed = parseRuntimeBindingV1(binding());
  assert.deepEqual(parsed, binding());
  assert.notEqual(parsed.sessionId, parsed.observedRuntimeSessionIds[0]);
  assert.notEqual(parsed.workerInstanceId, parsed.sourceStreams[0].runtimeInstanceId);
  const allocated = { ...binding(), state: "ALLOCATED", observedRuntimeSessionIds: [], sourceStreams: [] };
  assert.equal(parseRuntimeBindingV1(allocated).state, "ALLOCATED");
  for (const mutate of [
    (v: any) => { v.state = "RUNNING"; }, (v: any) => { v.observedRuntimeSessionIds = []; },
    (v: any) => { v.sourceStreams = []; }, (v: any) => { v.observedRuntimeSessionIds.push(v.observedRuntimeSessionIds[0]); },
    (v: any) => { v.sourceStreams.push({ ...v.sourceStreams[0], sequenceDomain: "different" }); },
    (v: any) => { v.sourceStreams.push({ ...v.sourceStreams[0], sourceStreamId: "different" }); },
    (v: any) => { v.sourceStreams[0].surface = "stdio"; }, (v: any) => { v.processHandle = 42; },
    (v: any) => { v.owner.id = ""; }, (v: any) => { v.leaseEpoch = 0; },
  ]) { const input = mutable(binding()); mutate(input); reject(parseRuntimeBindingV1, input); }
});

test("neutral binding envelope preserves the original Runtime v1 bytes and source vocabulary", () => {
  const event = buildNormalizedRuntimeEventV1Fixture()[0];
  const input = {
    schemaVersion: 1, bindingId: "binding-1", executionUnitId: "execution-synthetic-1", workerInstanceId: "worker-synthetic-1", sourceStreamId: "stream-1", event,
  };
  const parsed = parseNormalizedRuntimeEnvelopeV1(input);
  assert.equal(canonicalNormalizedRuntimeEventV1(parsed.event), canonicalNormalizedRuntimeEventV1(event));
  assert.equal(Object.hasOwn(parsed.event, "bindingId"), false);
  assert.equal(Object.hasOwn(parsed.event, "owner"), false);
  assert.ok(Object.isFrozen(parsed.event.source));
  reject(parseNormalizedRuntimeEnvelopeV1, { ...input, authorized: true });
  reject(parseNormalizedRuntimeEnvelopeV1, { ...input, event: { ...event, bindingId: "binding-1" } });
  reject(parseNormalizedRuntimeEnvelopeV1, { ...input, event: { ...event, protocolVersion: 2 } });
});

test("stop acknowledgement and close evidence cannot assert task completion or cancelled effects", () => {
  const acknowledgement = { schemaVersion: 1, bindingId: "binding-1", reason: "cancelled", status: "requested", observedAt: "2026-10-10T10:00:00.000Z" };
  assert.deepEqual(parseRuntimeStopAcknowledgementV1(acknowledgement), acknowledgement);
  for (const status of ["observed-stopped", "unsupported"]) assert.equal(parseRuntimeStopAcknowledgementV1({ ...acknowledgement, status }).status, status);
  reject(parseRuntimeStopAcknowledgementV1, { ...acknowledgement, externalEffectsCancelled: true });
  reject(parseRuntimeStopAcknowledgementV1, { ...acknowledgement, status: "completed" });
  const close = { schemaVersion: 1, bindingId: "binding-1", stdoutEof: true, stderrEof: true, closeObserved: true, exitCode: 0, signal: null, observedAt: "2026-10-10T10:00:00.000Z" };
  assert.deepEqual(parseRuntimeProcessCloseEvidenceV1(close), close);
  assert.equal(parseRuntimeProcessCloseEvidenceV1({ ...close, exitCode: null, signal: "SIGTERM" }).signal, "SIGTERM");
  assert.equal(parseRuntimeProcessCloseEvidenceV1({ ...close, stdoutEof: false, closeObserved: false, exitCode: null }).closeObserved, false);
  reject(parseRuntimeProcessCloseEvidenceV1, { ...close, signal: "SIGTERM" });
  reject(parseRuntimeProcessCloseEvidenceV1, { ...close, closeObserved: false });
  reject(parseRuntimeProcessCloseEvidenceV1, { ...close, success: true });
  reject(parseRuntimeProcessCloseEvidenceV1, { ...close, stdoutEof: 1 });
});

test("strict DTO boundary rejects hidden/accessor/symbol/cyclic data without evaluating accessors", () => {
  let reads = 0;
  const accessor = mutable(spec());
  Object.defineProperty(accessor, "prompt", { enumerable: true, get() { reads++; return "read"; } });
  reject(parseExecutionSpecV1, accessor); assert.equal(reads, 0);
  const hidden = mutable(spec()); Object.defineProperty(hidden, "grant", { value: true, enumerable: false }); reject(parseExecutionSpecV1, hidden);
  const symbol = mutable(spec()); Object.defineProperty(symbol, Symbol("grant"), { value: true }); reject(parseExecutionSpecV1, symbol);
  const cyclic = mutable(spec()); cyclic.fence.owner = cyclic; reject(parseExecutionSpecV1, cyclic);
  const inherited = Object.assign(Object.create({ authorized: true }), spec()); reject(parseExecutionSpecV1, inherited);
});

test("dispatch acknowledgement retains request identity without pretending Runtime settlement or task success", () => {
  const accepted = { schemaVersion: 1, bindingId: "binding-1", requestId: "request-1", status: "accepted" };
  assert.deepEqual(parseRuntimeCommandAcceptanceV1(accepted), accepted);
  const rejected = { ...accepted, status: "rejected", errorCode: "runtime_rejected" };
  assert.deepEqual(parseRuntimeCommandAcceptanceV1(rejected), rejected);
  reject(parseRuntimeCommandAcceptanceV1, { ...accepted, errorCode: "runtime_rejected" });
  reject(parseRuntimeCommandAcceptanceV1, { ...accepted, status: "rejected" });
  reject(parseRuntimeCommandAcceptanceV1, { ...accepted, taskSucceeded: true });
  reject(parseRuntimeCommandAcceptanceV1, { ...accepted, status: "settled" });
  reject(parseRuntimeCommandAcceptanceV1, { ...rejected, errorCode: "arbitrary diagnostic text" });
});

test("reasoning omission is explicit in the neutral envelope without changing Runtime v1 or keeping body/hash", () => {
  const fixtures = buildNormalizedRuntimeEventV1Fixture();
  const message = fixtures.find(event => event.data.kind === "message.lifecycle" && event.data.phase === "ended" && event.data.role === "assistant")!;
  const snapshot = fixtures.find(event => event.data.kind === "snapshot.messages")!;
  assert.ok(message); assert.ok(snapshot);
  const { eventId: messageId, idempotencyKey: messageKey, ...messageDraft } = message;
  const { eventId: snapshotId, idempotencyKey: snapshotKey, ...snapshotDraft } = snapshot;
  assert.equal(message.data.kind, "message.lifecycle");
  if (message.data.kind !== "message.lifecycle" || message.data.phase !== "ended") throw new Error("Expected message fixture");
  const events = [
    createNormalizedRuntimeEventV1({ ...messageDraft, data: { ...message.data, contentKinds: ["text", "thinking"] } }),
    createNormalizedRuntimeEventV1({ ...snapshotDraft, data: { kind: "snapshot.messages", messages: [{ role: "assistant", contentKinds: ["text", "thinking"], text: "Synthetic visible answer." }] } }),
  ];
  const marker = { category: "model-reasoning", reason: "not-retained" };
  for (const event of events) {
    const envelope = { schemaVersion: 1, bindingId: "binding-1", executionUnitId: "execution-synthetic-1", workerInstanceId: "worker-synthetic-1", sourceStreamId: "stream-1", event };
    reject(parseNormalizedRuntimeEnvelopeV1, envelope);
    const parsed = parseNormalizedRuntimeEnvelopeV1({ ...envelope, omissions: [marker] });
    assert.deepEqual(parsed.omissions, [marker]);
    assert.ok(Object.isFrozen(parsed.omissions)); assert.ok(Object.isFrozen(parsed.omissions![0]));
    assert.equal(canonicalNormalizedRuntimeEventV1(parsed.event), canonicalNormalizedRuntimeEventV1(event));
    assert.equal(Object.hasOwn(parsed.event, "omissions"), false);
    for (const omissions of [[], [marker, marker], [{ category: "model-reasoning", reason: "unknown" }],
      [{ category: "other", reason: "not-retained" }], [{ ...marker, body: "synthetic forbidden payload" }],
      [{ ...marker, hash: "synthetic-forbidden-digest" }]]) reject(parseNormalizedRuntimeEnvelopeV1, { ...envelope, omissions });
  }
});

test("Explicit not-spawned disposal preserves old close fixtures and cannot fabricate process EOF or exit", () => {
  const evidence = { schemaVersion: 1, bindingId: "binding-1", processDisposition: "not_spawned", stdoutEof: false, stderrEof: false, closeObserved: false, exitCode: null, signal: null, observedAt: "2026-10-10T10:00:00.000Z" };
  assert.deepEqual(parseRuntimeProcessCloseEvidenceV1(evidence), evidence);
  for (const patch of [{ processDisposition: "unknown" }, { processDisposition: "spawned" }, { stdoutEof: true }, { stderrEof: true }, { closeObserved: true }, { exitCode: 0 }, { signal: "SIGTERM" }, { noProcess: true }]) reject(parseRuntimeProcessCloseEvidenceV1, { ...evidence, ...patch });
  const { processDisposition: _, ...legacyUnknown } = evidence;
  assert.equal(parseRuntimeProcessCloseEvidenceV1(legacyUnknown).processDisposition, undefined);
  assert.equal(parseRuntimeProcessCloseEvidenceV1({ ...legacyUnknown, stdoutEof: true, stderrEof: true, closeObserved: true, exitCode: 0 }).processDisposition, undefined);
});
