import assert from "node:assert/strict";
import test from "node:test";

import { ids } from "../../domain/src/index.ts";
import { normalizePiRuntimeEventV1 } from "./normalized-runtime-event-v1.ts";

test("Pi Adapter cannot construct a Session Replacement without explicit lineage", () => {
  assert.throws(
    () => normalizePiRuntimeEventV1({
      workspaceId: ids.workspace("workspace-1"),
      runtimeSessionId: ids.session("runtime-session-1"),
      runtimeInstanceId: "worker-new",
      runtimeVersion: "0.84.1",
      surface: "host",
      sequenceDomain: "session-orchestration",
      sourceSequence: 1,
      sourceEventType: "session_replaced",
      observedAt: "2026-08-16T00:00:00.001Z",
      provenance: "host-synthesized",
      correlation: { observed: {}, normalized: {} },
      event: {
        type: "session_replaced",
        previousSessionIdentity: "session-object-old",
        nextSessionIdentity: "session-object-new",
        previousRuntimeInstanceId: "worker-old",
        nextRuntimeInstanceId: "worker-new",
      },
    }),
    /session replacement must link exactly two source events/,
  );
});
