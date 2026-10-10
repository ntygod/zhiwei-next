import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildNormalizedRuntimeEventV1Fixture } from "../fixtures/normalized-runtime-event-v1.fixture.ts";
import {
  CognitiveProtocolError, parseObservationV2, serializeObservationV2, deserializeObservationV2, classifyObservationReplayV2,
  parseLocalApiCommandV1, serializeLocalApiCommandV1, deserializeLocalApiCommandV1,
  parseLocalApiReceiptV1, serializeLocalApiReceiptV1, deserializeLocalApiReceiptV1,
  parseLocalApiErrorV1, serializeLocalApiErrorV1, deserializeLocalApiErrorV1,
  parseLocalApiMemorySearchV1, serializeLocalApiMemorySearchV1, deserializeLocalApiMemorySearchV1,
  canonicalNormalizedRuntimeEventV1, parseNormalizedRuntimeEventV1, parseDiagnosticHealthV1,
} from "./index.ts";

const observationGolden = readFileSync(new URL("../fixtures/observation-v2.json", import.meta.url), "utf8").trim();
const commandsGolden = readFileSync(new URL("../fixtures/local-api-v1-commands.json", import.meta.url), "utf8").trim();
const observation = () => JSON.parse(observationGolden);
const commands = () => JSON.parse(commandsGolden) as Record<string, any>[];
const reject = (parse: (value: any) => unknown, value: unknown) => assert.throws(() => parse(value), CognitiveProtocolError);

test("Observation v2 has an independent golden serialization and immutable detached parse result", () => {
  const input = observation(), parsed = parseObservationV2(input);
  assert.equal(serializeObservationV2(input), observationGolden);
  assert.deepEqual(deserializeObservationV2(observationGolden), parsed);
  input.scope.sessionId = "changed";
  assert.equal(parsed.scope.kind === "session" && parsed.scope.sessionId, "session-1");
  assert.ok(Object.isFrozen(parsed)); assert.ok(Object.isFrozen(parsed.content));
  assert.equal(classifyObservationReplayV2(parsed, parsed), "exact-replay");
});
test("Observation replay conflicts never rewrite immutable source identity, scope or content", () => {
  for (const mutate of [
    (v: any) => { v.scope.workspaceId = "workspace-2"; },
    (v: any) => { v.content.ref.contentVersion = 2; },
    (v: any) => { v.id = "different-id"; },
    (v: any) => { v.source.sourceSequence = 2; },
  ]) {
    const candidate = observation(); mutate(candidate);
    assert.equal(classifyObservationReplayV2(observation(), candidate), "identity-conflict");
  }
  const next = observation(); next.id = "next-id"; next.source.sourceSequence = 2;
  assert.equal(classifyObservationReplayV2(observation(), next), "distinct");
});
test("Observation absent content and correlation are explicit; clock skew does not manufacture source ordering", () => {
  const input = observation();
  input.content = { availability: "unavailable", reason: "purged" };
  input.correlation.correlationId = null;
  input.observedAt = "2026-10-10T09:00:00.000Z";
  input.source.sourceSequence = 3;
  input.integrity = { status: "incomplete", reason: "source-gap", missingSequences: [2] };
  assert.deepEqual(deserializeObservationV2(serializeObservationV2(input)), input);
  reject(parseObservationV2, { ...input, content: { ...input.content, ref: { contentId: "content-1", contentVersion: 1 } } });
});
test("Observation rejects wrong version, scope drift, inferred authority, raw content and malformed integrity", () => {
  const mutations = [
    (v: any) => { v.schemaVersion = 1; }, (v: any) => { v.schemaVersion = 3; },
    (v: any) => { v.revision = 2; }, (v: any) => { v.authorized = true; },
    (v: any) => { v.payload = { thought: "raw hidden content" }; },
    (v: any) => { v.source.sourceSequence = 0; }, (v: any) => { v.source.sourceSequence = 1.5; },
    (v: any) => { v.source.productSessionId = "wrong-session"; },
    (v: any) => { v.scope.workspaceIds = ["workspace-1", "workspace-2"]; },
    (v: any) => { v.privacy = "local-model-allowed"; }, (v: any) => { v.sourceTrust = "trusted"; },
    (v: any) => { v.recordedAt = "2026-02-30T00:00:00.000Z"; },
    (v: any) => { v.content.ref.contentId = "../secret"; },
    (v: any) => { v.content.ref.contentVersion = Number.MAX_SAFE_INTEGER + 1; },
    (v: any) => { delete v.correlation.turnId; },
    (v: any) => { v.integrity = { status: "incomplete", reason: "source-gap", missingSequences: [] }; },
    (v: any) => { v.integrity = { status: "incomplete", reason: "source-gap", missingSequences: [2, 2] }; },
    (v: any) => { v.integrity = { status: "complete", missingSequences: [2] }; },
  ];
  for (const mutate of mutations) { const input = observation(); mutate(input); reject(parseObservationV2, input); }
});
test("every P1 command variant round-trips through one bounded strict envelope", () => {
  const fixtures = commands();
  assert.equal(fixtures.length, 16);
  const serialized = fixtures.map(value => serializeLocalApiCommandV1(value));
  assert.equal(`[${serialized.join(",")}]`, commandsGolden);
  for (const input of fixtures) {
    assert.deepEqual(deserializeLocalApiCommandV1(serializeLocalApiCommandV1(input)), input);
    assert.ok(Object.isFrozen(parseLocalApiCommandV1(input).payload));
  }
});
test("commands reject unknown fields, future commands, invalid enums and mismatched URL/revision identities", () => {
  const create = commands()[0], revise = commands().find(value => value.payload.kind === "task.revise-request")!;
  for (const input of [
    { ...create, authorized: true }, { ...create, schemaVersion: 2 }, { ...create, expectedRevision: 1 },
    { ...create, workspaceId: "../workspace-1" }, { ...create, idempotencyKey: "" },
    { ...create, payload: { ...create.payload, approved: true } },
    { ...create, payload: { ...create.payload, kind: "delegation.create" } },
    { ...create, payload: { ...create.payload, acceptanceChecks: [] } },
    { ...create, payload: { ...create.payload, executionProfile: { id: "profile-1", revision: 0 } } },
    { ...revise, expectedRevision: 4 }, { ...revise, payload: { ...revise.payload, intentRevision: 0 } },
  ]) reject(parseLocalApiCommandV1, input);
  reject(value => parseLocalApiCommandV1(value, { workspaceId: "workspace-2" }), create);
  reject(value => parseLocalApiCommandV1(value, { workspaceId: "workspace-1", targetId: "task-2" }), revise);
  assert.deepEqual(parseLocalApiCommandV1(revise, { workspaceId: "workspace-1", targetId: "task-1" }), revise);
});
test("memory correction targets an exact content version separately from aggregate CAS; source eligibility stays explicit", () => {
  const input = commands().find(value => value.payload.kind === "memory.correct")!;
  assert.equal(parseLocalApiCommandV1(input).expectedRevision, 3);
  for (const mutate of [
    (v: any) => { v.payload.targetVersion.claimId = "claim-2"; },
    (v: any) => { v.payload.targetVersion.version = 0; },
    (v: any) => { v.payload.scope.workspaceId = "workspace-2"; },
    (v: any) => { v.payload.evidenceRefs[0].scope.workspaceId = "workspace-2"; },
    (v: any) => { v.payload.evidenceRefs = []; },
    (v: any) => { v.payload.epistemic = "verified"; },
    (v: any) => { v.payload.validUntil = v.payload.validFrom; },
  ]) { const value = structuredClone(input); mutate(value); reject(parseLocalApiCommandV1, value); }
  // Valid syntax is not authority: Core must still resolve/check this claimed evidence.
  input.payload.evidenceRefs[0].sourceTrust = "model-derived";
  assert.equal(parseLocalApiCommandV1(input).payload.kind, "memory.correct");
});
test("result confirmations cannot set completed or approve unspecified actions", () => {
  const input = commands().find(value => value.payload.kind === "task.confirm-result")!;
  reject(parseLocalApiCommandV1, { ...input, payload: { ...input.payload, completed: true } });
  reject(parseLocalApiCommandV1, { ...input, payload: { ...input.payload, evidenceRefs: [] } });
  const respond = commands().find(value => value.payload.kind === "task.respond")!;
  delete respond.payload.pendingQuestionId; reject(parseLocalApiCommandV1, respond);
});

test("receipts keep task failure, unknown and cancellation distinct from completed", () => {
  const statuses = { COMPLETED: "completed", PARTIAL: "partial", FAILED: "failed", CANCELLED: "cancelled", UNVERIFIABLE: "unverifiable" };
  for (const [taskState, status] of Object.entries(statuses)) {
    const input = { schemaVersion: 1, commandId: "command-1", status: "committed", aggregate: { kind: "task", id: "task-1", revision: 4 }, eventCursor: "opaque-scoped-cursor", result: { kind: "task", taskState, intentRevision: 2, outcome: { ref: { kind: "outcome", id: "outcome-1", revision: 1 }, status } } };
    assert.deepEqual(deserializeLocalApiReceiptV1(serializeLocalApiReceiptV1(input)), input);
    reject(parseLocalApiReceiptV1, { ...input, result: { ...input.result, outcome: { ...input.result.outcome, status: "unknown" } } });
    const withoutOutcome = structuredClone(input) as any; delete withoutOutcome.result.outcome;
    if (taskState === "CANCELLED") assert.deepEqual(parseLocalApiReceiptV1(withoutOutcome), withoutOutcome);
    else reject(parseLocalApiReceiptV1, withoutOutcome);
  }
  const input = { schemaVersion: 1, commandId: "command-1", status: "committed", aggregate: { kind: "task", id: "task-1", revision: 4 }, eventCursor: "opaque-scoped-cursor", result: { kind: "task", taskState: "VERIFYING", intentRevision: 2 } };
  assert.deepEqual(parseLocalApiReceiptV1(input), input);
  reject(parseLocalApiReceiptV1, { ...input, status: "accepted-in-memory" });
  reject(parseLocalApiReceiptV1, { ...input, aggregate: { ...input.aggregate, kind: "goal" } });
  for (const result of [{ kind: "goal", status: "ACTIVE", affectedRefs: [] }, { kind: "memory", cognitionEpoch: 3, affectedRefs: [{ kind: "claim", id: "claim-1", revision: 4 }] }]) {
    const value = { ...input, aggregate: { ...input.aggregate, kind: result.kind === "goal" ? "goal" : "claim" }, result };
    assert.deepEqual(deserializeLocalApiReceiptV1(serializeLocalApiReceiptV1(value)), value);
  }
});
test("error code/reason and retry semantics stay explicit without native exception passthrough", () => {
  const input = { schemaVersion: 1, commandId: "command-1", error: { code: "revision_conflict", reason: "stale_intent", safeMessage: "Read the current task before retrying.", retryable: false, diagnosticId: "diagnostic-1" } };
  assert.deepEqual(deserializeLocalApiErrorV1(serializeLocalApiErrorV1(input)), input);
  for (const error of [{ ...input.error, code: "internal_error" }, { ...input.error, reason: "privacy_blocked" }, { ...input.error, retryable: true }, { ...input.error, stack: "/private/file:1" }]) reject(parseLocalApiErrorV1, { ...input, error });
  assert.deepEqual(parseLocalApiErrorV1({ ...input, error: { ...input.error, code: "unavailable", reason: "dependency_down", retryable: true } }).error.reason, "dependency_down");
});
test("search selects one explicit scope, exact time and bounded count", () => {
  const input = { schemaVersion: 1, query: "synthetic preference", scope: { kind: "global" }, kinds: ["preference"], limit: 50, validAt: "2026-10-10T08:00:00.000Z" };
  assert.deepEqual(deserializeLocalApiMemorySearchV1(serializeLocalApiMemorySearchV1(input)), input);
  for (const value of [{ ...input, limit: 51 }, { ...input, limit: 0 }, { ...input, kinds: ["goal"] }, { ...input, kinds: ["fact", "fact"] }, { ...input, scope: { kind: "workspace", workspaceIds: ["a", "b"] } }]) reject(parseLocalApiMemorySearchV1, value);
});
test("all new object parsers reject lossy JavaScript structures and do not invoke accessors", () => {
  let calls = 0;
  const accessor = Object.defineProperty(observation(), "id", { enumerable: true, get() { calls++; return "secret"; } });
  reject(parseObservationV2, accessor); assert.equal(calls, 0);
  const symbol = observation(); symbol[Symbol("hidden")] = true;
  const hidden = observation(); Object.defineProperty(hidden, "hidden", { value: true });
  const prototype = Object.assign(Object.create({ inherited: true }), observation());
  for (const value of [symbol, hidden, prototype, { ...observation(), source: { ...observation().source, sourceSequence: NaN } }]) reject(parseObservationV2, value);
  const sparse = commands()[0]; sparse.payload.constraints = new Array(1); reject(parseLocalApiCommandV1, sparse);
  const undefinedField = commands()[0]; undefinedField.payload.goalRef = undefined; reject(parseLocalApiCommandV1, undefinedField);
  const alias = commands()[0]; alias.payload.acceptanceChecks.push(alias.payload.acceptanceChecks[0]); reject(parseLocalApiCommandV1, alias);
  const huge = commands()[0]; huge.payload.request = "x".repeat(1_048_577); reject(parseLocalApiCommandV1, huge);
});
test("JSON decoders reject nested and escaped duplicate keys, unknown versions and non-finite values", () => {
  reject(deserializeObservationV2, observationGolden.replace('"schemaVersion":2', '"schemaVersion":1,"schemaVersion":2'));
  reject(deserializeObservationV2, observationGolden.replace('"schemaVersion":2', '"schemaVersion":2,"schema\\u0056ersion":2'));
  reject(deserializeObservationV2, observationGolden.replace('"contentVersion":1', '"contentVersion":1,"contentVersion":2'));
  reject(deserializeObservationV2, observationGolden.replace('"sourceSequence":1', '"sourceSequence":1e400'));
  reject(deserializeLocalApiCommandV1, serializeLocalApiCommandV1(commands()[0]).replace('"kind":"task.create"', '"kind":"task.pause","kind":"task.create"'));
  for (const parse of [deserializeObservationV2, deserializeLocalApiCommandV1, deserializeLocalApiReceiptV1, deserializeLocalApiErrorV1, deserializeLocalApiMemorySearchV1]) {
    reject(parse, '{"schemaVersion":1,"schemaVersion":1}'); reject(parse, '{');
  }
  const input = commands()[0]; input.payload.request = 'A quoted "key": [value], backslash \\ and Unicode \u4e2d';
  assert.deepEqual(deserializeLocalApiCommandV1(serializeLocalApiCommandV1(input)), input);
});
test("published Runtime v1 and diagnostics fixtures remain on their original parsers", () => {
  for (const event of buildNormalizedRuntimeEventV1Fixture()) {
    const serialized = canonicalNormalizedRuntimeEventV1(event);
    assert.equal(canonicalNormalizedRuntimeEventV1(parseNormalizedRuntimeEventV1(JSON.parse(serialized))), serialized);
    reject(parseObservationV2, event);
  }
  const health = { status: "ok", service: "zhiwei-daemon", version: "0.0.0", milestone: "M0-bootstrap" };
  assert.deepEqual(parseDiagnosticHealthV1(health), health);
  assert.equal(parseDiagnosticHealthV1({ ...health, schemaVersion: 1 }), undefined);
  assert.throws(() => parseNormalizedRuntimeEventV1(observation()));
});

test("source surfaces preserve known Runtime identities and never fill missing IDs with fabricated ones", () => {
  for (const surface of ["sdk", "rpc", "extension", "host"]) {
    const value = observation(); value.source.surface = surface;
    value.source.runtime = "pi"; value.source.runtimeSessionId = "runtime-session-1"; value.source.runtimeInstanceId = "worker-1";
    value.correlation.taskAttempt = { taskId: "task-1", attemptId: "attempt-1", intentRevision: 2 };
    assert.deepEqual(parseObservationV2(value), value);
  }
  const local = observation(); local.source.surface = "local-api";
  assert.equal(parseObservationV2(local).source.runtime, null);
  for (const mutate of [
    (v: any) => { v.source.surface = "rpc"; },
    (v: any) => { v.source.runtimeSessionId = "runtime-session-1"; },
    (v: any) => { v.source.surface = "local-api"; v.source.runtime = "pi"; },
    (v: any) => { v.scope = { kind: "task", workspaceId: "workspace-1", taskId: "task-1" }; v.correlation.taskAttempt = { taskId: "task-2", attemptId: "attempt-1", intentRevision: 1 }; },
    (v: any) => { v.correlation.taskAttempt = { taskId: "task-1", attemptId: "attempt-1", intentRevision: 0 }; },
  ]) { const value = observation(); mutate(value); reject(parseObservationV2, value); }
});
test("memory DTOs preserve the most restrictive evidence scope and privacy", () => {
  for (const mutate of [
    (v: any) => { v.payload.privacy = "model-allowed"; },
    (v: any) => { v.payload.evidenceRefs[0].scope = { kind: "task", workspaceId: "workspace-1", taskId: "task-1" }; },
    (v: any) => { v.payload.evidenceRefs[0].role = "refutes"; },
  ]) { const value = commands().find(value => value.payload.kind === "memory.remember")!; mutate(value); reject(parseLocalApiCommandV1, value); }
});

test("receipt, error and search wire fixtures preserve canonical representations", () => {
  const fixtures = JSON.parse(readFileSync(new URL("../fixtures/local-api-v1-responses.json", import.meta.url), "utf8"));
  for (const [field, serialize, deserialize] of [
    ["receipts", serializeLocalApiReceiptV1, deserializeLocalApiReceiptV1],
    ["errors", serializeLocalApiErrorV1, deserializeLocalApiErrorV1],
    ["searches", serializeLocalApiMemorySearchV1, deserializeLocalApiMemorySearchV1],
  ] as const) for (const input of fixtures[field]) {
    assert.equal(serialize(input), JSON.stringify(input));
    assert.deepEqual(deserialize(serialize(input)), input);
  }
});
test("wire failures expose fixed safe diagnostics and measure body limits as UTF-8 bytes", () => {
  const input = commands()[0]; input.payload.request = "中".repeat(400_000);
  assert.throws(() => parseLocalApiCommandV1(input), error => error instanceof CognitiveProtocolError && error.reason === "too_large");
  input.commandId = "/secret-private-value"; input.payload.request = "synthetic";
  assert.throws(() => parseLocalApiCommandV1(input), error => error instanceof CognitiveProtocolError
    && error.code === "validation" && error.reason === "invalid_shape" && error.retryable === false
    && !error.safeMessage.includes("secret-private-value"));
  input.commandId = "command-1"; input.payload.request = "illegal\u0000text";
  reject(parseLocalApiCommandV1, input);
});

test("the existing confirm-stop cancellation path has a receipt without inventing an Outcome", () => {
  // P0-03 task-transitions.ts confirm-stop -> CANCELLED with outcomes: [] is legal.
  // The original transition is independently covered in cognition-core's cancellation regression.
  const input = { schemaVersion: 1, commandId: "command-cancel-1", status: "committed", aggregate: { kind: "task", id: "task-1", revision: 6 }, eventCursor: "opaque-scoped-cursor", result: { kind: "task", taskState: "CANCELLED", intentRevision: 2 } };
  const parsed = deserializeLocalApiReceiptV1(serializeLocalApiReceiptV1(input));
  assert.deepEqual(parsed, input); assert.equal(Object.hasOwn(parsed.result, "outcome"), false);
  reject(parseLocalApiReceiptV1, { ...input, result: { ...input.result, outcome: { ref: { kind: "outcome", id: "outcome-1", revision: 1 }, status: "completed" } } });
});
