import assert from "node:assert/strict";
import test from "node:test";

import { ids } from "../../domain/src/index.ts";
import {
  canonicalJsonSha256V1,
  canonicalJsonV1,
  createNormalizedRuntimeEventV1,
  assertNormalizedRuntimeEventV1,
  parseNormalizedRuntimeEventV1,
  snapshotJsonValue,
  type NormalizedRuntimeEventDraftV1,
} from "./index.ts";

function draft(
  overrides: Partial<NormalizedRuntimeEventDraftV1> = {},
): NormalizedRuntimeEventDraftV1 {
  return {
    protocolVersion: 1,
    workspaceId: ids.workspace("workspace-1"),
    runtimeSessionId: ids.session("runtime-session-1"),
    runtimeInstanceId: "worker-1",
    source: {
      adapter: "pi",
      runtime: {
        implementation: "@earendil-works/pi-coding-agent",
        version: "0.84.1",
      },
      surface: "rpc",
      eventType: "agent_start",
    },
    sequence: { domain: "rpc-worker-output", value: 1 },
    observedAt: "2026-08-15T00:00:00.000Z",
    provenance: "observed",
    persistence: "durable",
    stability: "boundary",
    compatibility: "required",
    correlation: {
      observed: {},
      normalized: { agentRunId: "agent-run-1" },
    },
    data: { kind: "agent.lifecycle", phase: "started" },
    ...overrides,
  };
}

test("canonical JSON and SHA-256 are deterministic", () => {
  assert.equal(canonicalJsonV1({ b: 2, a: 1 }), '{"a":1,"b":2}');
  assert.equal(
    canonicalJsonSha256V1({ b: 2, a: 1 }),
    canonicalJsonSha256V1({ a: 1, b: 2 }),
  );
  assert.equal(
    canonicalJsonSha256V1("abc"),
    "6cc43f858fbb763301637b5af970e2a46b46f461f27e5a0f41e009c59b827b25",
  );
});

test("lossless JSON snapshot rejects values that JSON.stringify would silently alter", () => {
  const sparse = new Array(2);
  sparse[1] = "value";
  const getter = Object.defineProperty({}, "value", {
    enumerable: true,
    get() {
      return 1;
    },
  });
  const symbolKey = { ok: true } as Record<PropertyKey, unknown>;
  symbolKey[Symbol("hidden")] = true;
  const alias = { value: 1 };

  for (const value of [
    sparse,
    new Date("2026-08-15T00:00:00.000Z"),
    getter,
    symbolKey,
    -0,
    Number.NaN,
    { left: alias, right: alias },
  ]) {
    assert.throws(() => snapshotJsonValue(value));
  }

  const cycle: Record<string, unknown> = {};
  cycle.self = cycle;
  assert.throws(() => snapshotJsonValue(cycle));
});

test("event ID represents the source locator while idempotency includes the semantic body", () => {
  const first = createNormalizedRuntimeEventV1(draft());
  const exactReplay = createNormalizedRuntimeEventV1(draft());
  const conflictingBody = createNormalizedRuntimeEventV1(
    draft({ data: { kind: "agent.lifecycle", phase: "ended", willRetry: false } }),
  );
  const nextSequence = createNormalizedRuntimeEventV1(
    draft({ sequence: { domain: "rpc-worker-output", value: 2 } }),
  );

  assert.equal(first.eventId, exactReplay.eventId);
  assert.equal(first.idempotencyKey, exactReplay.idempotencyKey);
  assert.equal(first.eventId, conflictingBody.eventId);
  assert.notEqual(first.idempotencyKey, conflictingBody.idempotencyKey);
  assert.notEqual(first.eventId, nextSequence.eventId);
});

test("parser fails closed for protocol, identity, phase and global-order drift", () => {
  const valid = createNormalizedRuntimeEventV1(draft());
  assert.deepEqual(parseNormalizedRuntimeEventV1(valid), valid);

  for (const mutate of [
    (event: any) => { event.protocolVersion = 2; },
    (event: any) => { event.workspaceId = ""; },
    (event: any) => { event.sequence.value = 0; },
    (event: any) => { event.observedAt = "2026-02-30T00:00:00.000Z"; },
    (event: any) => { event.globalSequence = 1; },
    (event: any) => { event.eventId = `nre1_${"0".repeat(64)}`; },
  ]) {
    const candidate = structuredClone(valid);
    mutate(candidate);
    assert.throws(() => parseNormalizedRuntimeEventV1(candidate));
  }

  const prompt = createNormalizedRuntimeEventV1(
    draft({
      source: {
        ...draft().source,
        eventType: "prompt_response",
      },
      data: {
        kind: "command.response",
        command: "prompt",
        success: true,
        phase: "preflight-result",
      },
      correlation: {
        observed: { requestId: "request-1" },
        normalized: { rpcRequestId: "rpc-request-1", promptId: "prompt-1" },
      },
    }),
  );
  const invalidPrompt = structuredClone(prompt) as any;
  invalidPrompt.data.phase = "command-result";
  assert.throws(() => parseNormalizedRuntimeEventV1(invalidPrompt));
});

test("message updates are explicitly ephemeral and never masquerade as settled facts", () => {
  assert.throws(() =>
    createNormalizedRuntimeEventV1(
      draft({
        persistence: "durable",
        stability: "boundary",
        data: {
          kind: "message.lifecycle",
          phase: "updated",
          role: "assistant",
          delta: "partial",
        },
      }),
    ),
  );

  const update = createNormalizedRuntimeEventV1(
    draft({
      persistence: "ephemeral",
      stability: "update",
      compatibility: "ignorable",
      data: {
        kind: "message.lifecycle",
        phase: "updated",
        role: "assistant",
        delta: "partial",
      },
    }),
  );
  assert.equal(update.persistence, "ephemeral");
});


test("assertion rejects accessors without invoking them and permits multiline error text", () => {
  const valid = createNormalizedRuntimeEventV1(draft());
  let invoked = false;
  const candidate = structuredClone(valid) as Record<string, unknown>;
  Object.defineProperty(candidate, "data", {
    enumerable: true,
    get() {
      invoked = true;
      return valid.data;
    },
  });
  assert.throws(() => assertNormalizedRuntimeEventV1(candidate));
  assert.equal(invoked, false);

  assert.doesNotThrow(() =>
    createNormalizedRuntimeEventV1(
      draft({
        source: { ...draft().source, eventType: "response" },
        data: {
          kind: "command.response",
          command: "prompt",
          success: false,
          phase: "preflight-result",
          error: { message: "No API key.\n\nSee provider documentation.\n" },
        },
      }),
    ),
  );
});
