import assert from "node:assert/strict";
import test from "node:test";

import { ids } from "../../domain/src/index.ts";
import {
  createNormalizedRuntimeEventV1,
  parseNormalizedRuntimeEventTraceV1,
  type NormalizedRuntimeEventDraftV1,
  type NormalizedRuntimeEventV1,
} from "./index.ts";

const workspaceId = ids.workspace("replacement-workspace");
const runtimeSessionId = ids.session("replacement-session");
const runtime = { implementation: "pi", version: "0.84.1" } as const;

function make(
  data: NormalizedRuntimeEventDraftV1["data"],
  overrides: Partial<NormalizedRuntimeEventDraftV1> = {},
): NormalizedRuntimeEventV1 {
  return createNormalizedRuntimeEventV1({
    protocolVersion: 1,
    workspaceId,
    runtimeSessionId,
    runtimeInstanceId: "worker-default",
    source: { adapter: "pi", runtime, surface: "sdk", eventType: data.kind },
    sequence: { domain: "sdk-public-events", value: 1 },
    observedAt: "2026-08-16T00:00:00.001Z",
    provenance: "observed",
    persistence: "durable",
    stability: "boundary",
    compatibility: "required",
    correlation: { observed: {}, normalized: {} },
    data,
    ...overrides,
  });
}

function shutdown(overrides: Partial<NormalizedRuntimeEventDraftV1> = {}) {
  return make({
    kind: "session.identity",
    action: "shutdown",
    reason: "new",
    previousSessionIdentity: "session-old",
  }, {
    runtimeInstanceId: "worker-old",
    source: { adapter: "pi", runtime, surface: "extension", eventType: "session_shutdown" },
    sequence: { domain: "extension-events", value: 1 },
    ...overrides,
  });
}

function started(overrides: Partial<NormalizedRuntimeEventDraftV1> = {}) {
  return make({
    kind: "session.identity",
    action: "started",
    previousSessionIdentity: "session-old",
    nextSessionIdentity: "session-new",
  }, {
    runtimeInstanceId: "worker-new",
    source: { adapter: "pi", runtime, surface: "extension", eventType: "session_start" },
    sequence: { domain: "extension-events", value: 1 },
    ...overrides,
  });
}

function replacement(
  sources: readonly NormalizedRuntimeEventV1[],
  data: Partial<Extract<NormalizedRuntimeEventDraftV1["data"], {
    kind: "session.identity";
    action: "replaced";
  }>> = {},
  overrides: Partial<NormalizedRuntimeEventDraftV1> = {},
) {
  return make({
    kind: "session.identity",
    action: "replaced",
    previousSessionIdentity: "session-old",
    nextSessionIdentity: "session-new",
    previousRuntimeInstanceId: "worker-old",
    nextRuntimeInstanceId: "worker-new",
    ...data,
  }, {
    runtimeInstanceId: "worker-new",
    source: { adapter: "pi", runtime, surface: "host", eventType: "session_replaced" },
    sequence: { domain: "session-orchestration", value: 1 },
    provenance: "host-synthesized",
    links: { sourceEventIds: sources.map((event) => event.eventId) },
    ...overrides,
  });
}

function rejects(
  sources: readonly NormalizedRuntimeEventV1[],
  aggregate: NormalizedRuntimeEventV1,
  pattern: RegExp,
): void {
  assert.throws(() => parseNormalizedRuntimeEventTraceV1([...sources, aggregate]), pattern);
}

test("Session Replacement requires exactly two source links and no replacement links", () => {
  const old = shutdown();
  const next = started();
  const draft = {
    kind: "session.identity" as const,
    action: "replaced" as const,
    previousSessionIdentity: "session-old",
    nextSessionIdentity: "session-new",
  };
  const base = {
    runtimeInstanceId: "worker-new",
    source: { adapter: "pi", runtime, surface: "host" as const, eventType: "session_replaced" },
    sequence: { domain: "session-orchestration", value: 1 },
    provenance: "host-synthesized" as const,
  };
  assert.throws(() => make(draft, base), /link exactly two source events/);
  assert.throws(
    () => make(draft, { ...base, links: { sourceEventIds: [old.eventId] } }),
    /link exactly two source events/,
  );
  assert.throws(
    () => make(draft, {
      ...base,
      links: {
        sourceEventIds: [old.eventId, next.eventId],
        replacesEventIds: [old.eventId],
      },
    }),
    /must not replace events/,
  );
});

test("Session Replacement accepts matching observed Extension shutdown/start lineage", () => {
  const old = shutdown();
  const next = started();
  assert.equal(parseNormalizedRuntimeEventTraceV1([old, next, replacement([old, next])]).length, 3);
});

test("Session Replacement rejects unrelated facts and cross-session sources", () => {
  const old = shutdown();
  const next = started();
  const invalidated = make({
    kind: "session.identity",
    action: "invalidated",
    reason: "new",
    previousSessionIdentity: "session-old",
  }, {
    runtimeInstanceId: "worker-old",
    source: { adapter: "pi", runtime, surface: "host", eventType: "session_invalidated" },
    sequence: { domain: "session-orchestration", value: 1 },
    provenance: "host-synthesized",
  });
  rejects([invalidated, next], replacement([invalidated, next]), /one observed Extension shutdown/);

  const other = started({ runtimeSessionId: ids.session("other-session") });
  rejects([old, other], replacement([old, other]), /one Runtime Session/);
});

test("Session Replacement rejects mismatched Session identities", () => {
  const old = shutdown();
  const next = started();
  rejects([old, next], replacement([old, next], {
    previousSessionIdentity: "wrong-old",
  }), /previous identity/);
  rejects([old, next], replacement([old, next], {
    nextSessionIdentity: "wrong-new",
  }), /old\/new identities/);
});

test("Session Replacement rejects mismatched Runtime instance identities", () => {
  const old = shutdown();
  const next = started();
  rejects([old, next], replacement([old, next], {
    previousRuntimeInstanceId: "wrong-old",
    nextRuntimeInstanceId: "worker-new",
  }), /previous Runtime instance/);
  rejects([old, next], replacement([old, next], {
    previousRuntimeInstanceId: "worker-old",
    nextRuntimeInstanceId: "wrong-new",
  }), /next Runtime instance/);
  rejects([old, next], replacement([old, next], {}, {
    runtimeInstanceId: "wrong-aggregate",
  }), /emitted by the new Runtime instance/);
});

test("Session Replacement rejects wrong source ownership and reverse order", () => {
  const old = shutdown();
  const next = started();
  rejects([next, old], replacement([old, next]), /shutdown must precede/);

  const invalid = structuredClone(old) as any;
  invalid.source.surface = "host";
  invalid.provenance = "host-synthesized";
  assert.throws(
    () => parseNormalizedRuntimeEventTraceV1([invalid, next, replacement([old, next])]),
    /session shutdown must use extension\/observed/,
  );
});
