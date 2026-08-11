import assert from "node:assert/strict";
import test from "node:test";

import { normalizePiEvent } from "./index.ts";
import { ids } from "../../domain/src/index.ts";

test("Pi input is normalized without exposing Pi-specific types to the protocol", () => {
  const event = normalizePiEvent(
    { type: "input", text: "记住这个项目使用 TypeScript" },
    {
      eventId: "event-1",
      sessionId: ids.session("session-1"),
      workspaceId: ids.workspace("workspace-1"),
      occurredAt: "2026-08-11T12:00:00.000Z",
    },
  );

  assert.equal(event.type, "input.observed");
  assert.equal(event.runtime, "pi");
  assert.deepEqual(event.observation.payload, { text: "记住这个项目使用 TypeScript" });
});
