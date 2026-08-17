import assert from "node:assert/strict";
import test from "node:test";

import { ids } from "../../domain/src/index.ts";
import {
  computeNormalizedRuntimeEventIdV1,
  computeNormalizedRuntimeIdempotencyKeyV1,
  createNormalizedRuntimeEventV1,
  parseNormalizedRuntimeEventV1,
  type NormalizedRuntimeCorrelationV1,
  type NormalizedRuntimeEventDraftV1,
  type NormalizedRuntimeEventV1,
} from "./index.ts";

const workspaceId = ids.workspace("retry-correlation-workspace");
const runtimeSessionId = ids.session("retry-correlation-session");
const rejection = /must not contain normalized\.agentRunId or normalized\.turnId/;

function retryCompletionDraft(
  normalized: NormalizedRuntimeCorrelationV1["normalized"],
): NormalizedRuntimeEventDraftV1 {
  return {
    protocolVersion: 1,
    workspaceId,
    runtimeSessionId,
    runtimeInstanceId: "worker-1",
    source: {
      adapter: "pi",
      runtime: {
        implementation: "@earendil-works/pi-coding-agent",
        version: "0.84.1",
      },
      surface: "sdk",
      eventType: "auto_retry_end",
    },
    sequence: { domain: "sdk-public-events", value: 1 },
    observedAt: "2026-08-17T06:00:00.001Z",
    provenance: "observed",
    persistence: "durable",
    stability: "boundary",
    compatibility: "required",
    correlation: { observed: {}, normalized },
    data: {
      kind: "retry.lifecycle",
      phase: "completed",
      attempt: 1,
      success: true,
    },
  };
}

function forgeEvent(draft: NormalizedRuntimeEventDraftV1): NormalizedRuntimeEventV1 {
  return {
    ...draft,
    eventId: computeNormalizedRuntimeEventIdV1(draft),
    idempotencyKey: computeNormalizedRuntimeIdempotencyKeyV1(draft),
  } as NormalizedRuntimeEventV1;
}

function assertSingleEventBoundaryRejects(
  normalized: NormalizedRuntimeCorrelationV1["normalized"],
): void {
  const draft = retryCompletionDraft(normalized);
  assert.throws(() => createNormalizedRuntimeEventV1(draft), rejection);
  assert.throws(() => parseNormalizedRuntimeEventV1(forgeEvent(draft)), rejection);
}

test("Retry completion cannot borrow the first Agent Run correlation", () => {
  assertSingleEventBoundaryRejects({ agentRunId: "run-1" });
});

test("Retry completion cannot borrow the second Agent Run correlation", () => {
  assertSingleEventBoundaryRejects({ agentRunId: "run-2" });
});

test("Retry completion cannot carry Turn correlation", () => {
  assertSingleEventBoundaryRejects({ turnId: "turn-2" });
});
