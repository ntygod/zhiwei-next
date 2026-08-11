import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryCognitionStore } from "./index.ts";
import { ids, type Observation } from "../../domain/src/index.ts";

test("observation ledger preserves session order and rejects duplicate ids", async () => {
  const store = new InMemoryCognitionStore();
  const sessionId = ids.session("session-1");
  const later: Observation = {
    id: ids.observation("obs-2"),
    sessionId,
    actor: "tool",
    kind: "tool_result",
    payload: { ok: true },
    occurredAt: "2026-08-11T10:00:02.000Z",
  };
  const earlier: Observation = {
    id: ids.observation("obs-1"),
    sessionId,
    actor: "user",
    kind: "user_input",
    payload: { text: "hello" },
    occurredAt: "2026-08-11T10:00:01.000Z",
  };

  await store.appendObservation(later);
  await store.appendObservation(earlier);

  assert.deepEqual(
    (await store.listSessionObservations(sessionId)).map((item) => item.id),
    [earlier.id, later.id],
  );
  await assert.rejects(() => store.appendObservation(earlier), /already exists/);
});
