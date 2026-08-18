import assert from "node:assert/strict";
import test from "node:test";

import { ids } from "../../domain/src/index.ts";
import type { NormalizedRuntimeCorrelationV1 } from "../../protocol/src/index.ts";
import { normalizePiRuntimeEventV1 } from "./normalized-runtime-event-v1.ts";

const workspaceId = ids.workspace("adapter-retry-correlation-workspace");
const runtimeSessionId = ids.session("adapter-retry-correlation-session");
const rejection = /Pi retry_completed must not contain normalized\.agentRunId or normalized\.turnId/;

function normalizeRetryCompleted(
  normalized: NormalizedRuntimeCorrelationV1["normalized"],
): void {
  normalizePiRuntimeEventV1({
    workspaceId,
    runtimeSessionId,
    runtimeInstanceId: "worker-1",
    runtimeVersion: "0.84.1",
    surface: "sdk",
    sequenceDomain: "sdk-public-events",
    sourceSequence: 1,
    sourceEventType: "auto_retry_end",
    observedAt: "2026-08-17T06:01:00.001Z",
    provenance: "observed",
    correlation: { observed: {}, normalized },
    event: {
      type: "retry_completed",
      attempt: 1,
      success: true,
    },
  });
}

test("Pi Adapter rejects retry_completed with injected Run or Turn correlation", () => {
  assert.throws(() => normalizeRetryCompleted({ agentRunId: "run-1" }), rejection);
  assert.throws(() => normalizeRetryCompleted({ turnId: "turn-2" }), rejection);
});
