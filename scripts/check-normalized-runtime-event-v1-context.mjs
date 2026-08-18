import { readFile } from "node:fs/promises";

import {
  assertReplayableNormalizedRuntimeEventTraceV1,
  canonicalJsonSha256V1,
  canonicalNormalizedRuntimeEventV1,
  classifyNormalizedRuntimeReplayV1,
  createNormalizedRuntimeEventV1,
  parseNormalizedRuntimeEventTraceV1,
} from "../packages/protocol/src/index.ts";
import {
  buildNormalizedRuntimeEventV1Fixture,
  NORMALIZED_RUNTIME_EVENT_V1_FIXTURE_SOURCE,
} from "../packages/protocol/fixtures/normalized-runtime-event-v1.fixture.ts";

export const EXPECTED_EVENT_COUNT = 74;
export const EXPECTED_FIXTURE_HASH = "b6630cff347af84e43eca74e2d76c1b786cbe8fab71b9eab4e76df10c8110d2b";
export const violations = [];
export function requireValue(condition, message) {
  if (!condition) violations.push(message);
}
export function indexOf(events, predicate) {
  return events.findIndex(predicate);
}
export { readFile, canonicalNormalizedRuntimeEventV1 };

let parsed = [];
try {
  parsed = [...parseNormalizedRuntimeEventTraceV1(buildNormalizedRuntimeEventV1Fixture())];
  assertReplayableNormalizedRuntimeEventTraceV1(parsed);
} catch (error) {
  violations.push(`Fixture trace failed validation: ${error.message}`);
}
export const events = parsed;
export const fixtureHash = canonicalJsonSha256V1(events);

requireValue(NORMALIZED_RUNTIME_EVENT_V1_FIXTURE_SOURCE.issue === 32, "Fixture must cite Issue #32 evidence.");
requireValue(
  NORMALIZED_RUNTIME_EVENT_V1_FIXTURE_SOURCE.mergeCommit === "374a27505c4a150cbcb63c1b8f6c1afb3bfb4448",
  "Fixture source merge commit drifted.",
);
requireValue(NORMALIZED_RUNTIME_EVENT_V1_FIXTURE_SOURCE.runtimeVersion === "0.84.1", "Fixture Pi version drifted.");
requireValue(events.length === EXPECTED_EVENT_COUNT, `Fixture event count drifted: ${events.length}.`);
requireValue(fixtureHash === EXPECTED_FIXTURE_HASH, `Fixture canonical hash drifted: ${fixtureHash}.`);

for (const evidence of Object.values(NORMALIZED_RUNTIME_EVENT_V1_FIXTURE_SOURCE.evidence)) {
  try {
    const value = JSON.parse(await readFile(evidence.path, "utf8"));
    requireValue(value[evidence.field] === evidence.value, `${evidence.path} ${evidence.field} drifted.`);
  } catch (error) {
    violations.push(`Could not validate Runtime evidence ${evidence.path}: ${error.message}`);
  }
}
for (const surface of ["sdk", "extension", "rpc", "host"]) {
  requireValue(events.some((event) => event.source.surface === surface), `Fixture does not cover ${surface}.`);
}
for (const kind of [
  "command.response", "agent.lifecycle", "turn.lifecycle", "message.lifecycle", "tool.lifecycle",
  "queue.changed", "retry.lifecycle", "compaction.lifecycle", "session.identity", "snapshot.state",
  "snapshot.messages", "process.boundary", "host.action", "runtime.unknown",
]) {
  requireValue(events.some((event) => event.data.kind === kind), `Fixture does not cover ${kind}.`);
}
const promptResponses = events.filter(
  (event) => event.data.kind === "command.response" && event.data.command === "prompt",
);
requireValue(promptResponses.length === 2, "Fixture must cover accepted and rejected Prompt Responses.");
requireValue(
  promptResponses.every((event) => event.data.kind === "command.response" && event.data.phase === "preflight-result"),
  "Prompt Responses must remain preflight results.",
);
requireValue(
  promptResponses.some((event) => event.data.kind === "command.response" && event.data.success) &&
    promptResponses.some((event) => event.data.kind === "command.response" && !event.data.success),
  "Fixture must preserve Prompt acceptance and rejection separately.",
);

export function verifySourceSlotConflict() {
  const sourceSlot = events.find(
    (event) => event.data.kind === "agent.lifecycle" && event.data.phase === "started",
  );
  if (!sourceSlot) return;
  const { eventId: _eventId, idempotencyKey: _idempotencyKey, ...draft } = sourceSlot;
  const conflict = createNormalizedRuntimeEventV1({
    ...draft,
    source: { ...draft.source, eventType: "different-source-type" },
  });
  requireValue(conflict.eventId === sourceSlot.eventId, "Source vocabulary drift must occupy one source slot.");
  requireValue(
    classifyNormalizedRuntimeReplayV1(sourceSlot, conflict) === "source-slot-conflict",
    "Source vocabulary drift must classify as a source-slot conflict.",
  );
}
