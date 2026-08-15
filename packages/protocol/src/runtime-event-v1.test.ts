import assert from "node:assert/strict";
import test from "node:test";

import { ids } from "../../domain/src/index.ts";
import {
  assertNormalizedRuntimeEventV1,
  canonicalJsonSha256V1,
  canonicalJsonV1,
  classifyNormalizedRuntimeReplayV1,
  createNormalizedRuntimeEventV1,
  parseNormalizedRuntimeEventV1,
  sha256HexUtf8,
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

test("canonical JSON and pure SHA-256 are deterministic", () => {
  assert.equal(canonicalJsonV1({ b: 2, a: 1 }), '{"a":1,"b":2}');
  assert.equal(
    canonicalJsonSha256V1({ b: 2, a: 1 }),
    canonicalJsonSha256V1({ a: 1, b: 2 }),
  );
  assert.equal(
    canonicalJsonSha256V1("abc"),
    "6cc43f858fbb763301637b5af970e2a46b46f461f27e5a0f41e009c59b827b25",
  );
  assert.equal(
    sha256HexUtf8(""),
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  );
  assert.equal(
    sha256HexUtf8("abc"),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
  assert.equal(
    sha256HexUtf8("The quick brown fox jumps over the lazy dog"),
    "d7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592",
  );
  assert.equal(
    sha256HexUtf8("a".repeat(1000)),
    "41edece42d63e8d9bf515a9ba6932e1c20cbc9f5a5d134645adb5db1b9737ea3",
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

test("v1 canonical body, source-slot event ID and idempotency key have fixed golden vectors", () => {
  const value = draft();
  assert.equal(
    canonicalJsonV1(value),
    '{"compatibility":"required","correlation":{"normalized":{"agentRunId":"agent-run-1"},"observed":{}},"data":{"kind":"agent.lifecycle","phase":"started"},"observedAt":"2026-08-15T00:00:00.000Z","persistence":"durable","protocolVersion":1,"provenance":"observed","runtimeInstanceId":"worker-1","runtimeSessionId":"runtime-session-1","sequence":{"domain":"rpc-worker-output","value":1},"source":{"adapter":"pi","eventType":"agent_start","runtime":{"implementation":"@earendil-works/pi-coding-agent","version":"0.84.1"},"surface":"rpc"},"stability":"boundary","workspaceId":"workspace-1"}',
  );
  const event = createNormalizedRuntimeEventV1(value);
  assert.equal(
    event.eventId,
    "nre1_686569f965b161714d6cb9b8254794cec29150f2f99f3027dcdc9373ab113f72",
  );
  assert.equal(
    event.idempotencyKey,
    "nre1b_1dfaad5b4c81202799eca00cb58b9e0e94dcd9037e18dc019b1408ffa912e146",
  );
});

test("event ID identifies a source slot while idempotency includes source vocabulary and body", () => {
  const first = createNormalizedRuntimeEventV1(draft());
  const exactReplay = createNormalizedRuntimeEventV1(draft());
  const conflictingBody = createNormalizedRuntimeEventV1(
    draft({ data: { kind: "agent.lifecycle", phase: "ended", willRetry: false } }),
  );
  const conflictingSourceType = createNormalizedRuntimeEventV1(
    draft({ source: { ...draft().source, eventType: "different_source_type" } }),
  );
  const nextSequence = createNormalizedRuntimeEventV1(
    draft({ sequence: { domain: "rpc-worker-output", value: 2 } }),
  );

  assert.equal(first.eventId, exactReplay.eventId);
  assert.equal(first.idempotencyKey, exactReplay.idempotencyKey);
  assert.equal(first.eventId, conflictingBody.eventId);
  assert.equal(first.eventId, conflictingSourceType.eventId);
  assert.notEqual(first.idempotencyKey, conflictingBody.idempotencyKey);
  assert.notEqual(first.idempotencyKey, conflictingSourceType.idempotencyKey);
  assert.notEqual(first.eventId, nextSequence.eventId);
  assert.equal(classifyNormalizedRuntimeReplayV1(first, exactReplay), "exact-replay");
  assert.equal(classifyNormalizedRuntimeReplayV1(first, conflictingBody), "source-slot-conflict");
  assert.equal(classifyNormalizedRuntimeReplayV1(first, conflictingSourceType), "source-slot-conflict");
  assert.equal(classifyNormalizedRuntimeReplayV1(first, nextSequence), "distinct");
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
});

test("phase-specific payloads reject fields from another lifecycle phase", () => {
  assert.throws(() =>
    createNormalizedRuntimeEventV1(
      draft({ data: { kind: "turn.lifecycle", phase: "started", toolResultCount: 1 } as any }),
    ),
  );
  assert.throws(() =>
    createNormalizedRuntimeEventV1(
      draft({
        data: {
          kind: "message.lifecycle",
          phase: "ended",
          role: "assistant",
          delta: "not valid after end",
        } as any,
      }),
    ),
  );
  assert.throws(() =>
    createNormalizedRuntimeEventV1(
      draft({
        data: {
          kind: "tool.lifecycle",
          phase: "started",
          toolName: "read",
          result: { invalid: true },
        } as any,
        correlation: { observed: {}, normalized: { toolCallId: "tool-1" } },
        links: { sourceEventIds: [`nre1_${"1".repeat(64)}`] },
      }),
    ),
  );
});

test("known vocabulary is required while message updates and unknown events retain explicit exceptions", () => {
  assert.throws(() =>
    createNormalizedRuntimeEventV1(draft({ compatibility: "ignorable" })),
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
      correlation: { observed: {}, normalized: {} },
    }),
  );
  assert.equal(update.persistence, "ephemeral");
  const unknown = createNormalizedRuntimeEventV1(
    draft({
      source: { ...draft().source, surface: "extension", eventType: "future-info" },
      compatibility: "ignorable",
      data: {
        kind: "runtime.unknown",
        sourceType: "future-info",
        keys: ["type"],
        payloadSha256: "0".repeat(64),
        canonicalization: "zhiwei-json-v1",
      },
      correlation: { observed: {}, normalized: {} },
    }),
  );
  assert.equal(unknown.compatibility, "ignorable");
});

test("message, state and messages snapshots accept only Runtime-neutral projected fields", () => {
  assert.doesNotThrow(() =>
    createNormalizedRuntimeEventV1(
      draft({
        source: { ...draft().source, eventType: "message_end" },
        data: {
          kind: "message.lifecycle",
          phase: "ended",
          role: "assistant",
          body: { text: "projected" },
        },
        correlation: { observed: {}, normalized: {} },
      }),
    ),
  );
  assert.throws(() =>
    createNormalizedRuntimeEventV1(
      draft({
        source: { ...draft().source, eventType: "message_end" },
        data: {
          kind: "message.lifecycle",
          phase: "ended",
          role: "assistant",
          body: { text: "projected", rawSdkMessage: {} } as any,
        },
        correlation: { observed: {}, normalized: {} },
      }),
    ),
  );
  assert.throws(() =>
    createNormalizedRuntimeEventV1(
      draft({
        source: { ...draft().source, eventType: "state_snapshot" },
        data: {
          kind: "snapshot.state",
          state: {
            isStreaming: false,
            messageCount: 0,
            pendingMessageCount: 0,
            provider: { raw: true },
          } as any,
        },
        correlation: { observed: {}, normalized: {} },
      }),
    ),
  );
  assert.throws(() =>
    createNormalizedRuntimeEventV1(
      draft({
        source: { ...draft().source, eventType: "messages_snapshot" },
        data: {
          kind: "snapshot.messages",
          messages: [{ role: "assistant", text: "ok", raw: {} } as any],
        },
        correlation: { observed: {}, normalized: {} },
      }),
    ),
  );
});

test("single-event parser enforces Tool, Compaction and Session identity structure", () => {
  assert.throws(() =>
    createNormalizedRuntimeEventV1(
      draft({
        data: { kind: "tool.lifecycle", phase: "declared", toolName: "read" },
        correlation: { observed: {}, normalized: {} },
      }),
    ),
    /toolCallId/,
  );
  assert.throws(() =>
    createNormalizedRuntimeEventV1(
      draft({
        data: { kind: "tool.lifecycle", phase: "completed", toolName: "read", success: true },
        correlation: { observed: {}, normalized: { toolCallId: "tool-1" } },
      }),
    ),
    /link exactly one declaration/,
  );
  assert.throws(() =>
    createNormalizedRuntimeEventV1(
      draft({
        data: { kind: "compaction.lifecycle", phase: "completed" },
        correlation: { observed: {}, normalized: {} },
      }),
    ),
    /cite source and replaced events/,
  );
  assert.throws(() =>
    createNormalizedRuntimeEventV1(
      draft({
        source: { ...draft().source, surface: "host", eventType: "session_invalidated" },
        provenance: "host-synthesized",
        data: {
          kind: "session.identity",
          action: "invalidated",
          reason: "new",
          previousSessionIdentity: "",
        },
        correlation: { observed: {}, normalized: {} },
      }),
    ),
  );
});

test("Host actions, Process boundaries and Session actions retain source/provenance distinctions", () => {
  const hostBase = {
    source: { ...draft().source, surface: "host" as const, eventType: "host_send_command" },
    provenance: "host-synthesized" as const,
    correlation: { observed: {}, normalized: {} },
  };
  assert.doesNotThrow(() =>
    createNormalizedRuntimeEventV1(
      draft({ ...hostBase, data: { kind: "host.action", action: "send-command", command: "prompt" } }),
    ),
  );
  assert.throws(() =>
    createNormalizedRuntimeEventV1(
      draft({
        source: { ...hostBase.source, eventType: "process_exit" },
        provenance: "observed",
        data: { kind: "process.boundary", boundary: "exit", code: null, signal: null },
      }),
    ),
  );
  assert.throws(() =>
    createNormalizedRuntimeEventV1(
      draft({
        source: { ...draft().source, surface: "extension", eventType: "listener_rebound" },
        provenance: "observed",
        data: {
          kind: "session.identity",
          action: "listener-rebound",
          previousSessionIdentity: "old",
          nextSessionIdentity: "new",
        },
        correlation: { observed: {}, normalized: {} },
      }),
    ),
    /host\/host-synthesized/,
  );
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
