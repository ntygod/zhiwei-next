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

const violations = [];

function requireValue(condition, message) {
  if (!condition) violations.push(message);
}

const fixtureEvents = buildNormalizedRuntimeEventV1Fixture();
let events = [];
try {
  events = [...parseNormalizedRuntimeEventTraceV1(fixtureEvents)];
  assertReplayableNormalizedRuntimeEventTraceV1(events);
} catch (error) {
  violations.push(`Fixture trace failed validation: ${error.message}`);
}

requireValue(
  NORMALIZED_RUNTIME_EVENT_V1_FIXTURE_SOURCE.issue === 32,
  "Fixture must cite Issue #32 evidence.",
);
requireValue(
  NORMALIZED_RUNTIME_EVENT_V1_FIXTURE_SOURCE.mergeCommit ===
    "374a27505c4a150cbcb63c1b8f6c1afb3bfb4448",
  "Fixture source merge commit drifted.",
);
requireValue(
  NORMALIZED_RUNTIME_EVENT_V1_FIXTURE_SOURCE.runtimeVersion === "0.84.1",
  "Fixture Pi version drifted.",
);
requireValue(events.length === 41, `Fixture event count drifted: ${events.length}.`);

const surfaces = new Set(events.map((event) => event.source.surface));
for (const surface of ["sdk", "extension", "rpc", "host"]) {
  requireValue(surfaces.has(surface), `Fixture does not cover ${surface} source surface.`);
}

const kinds = new Set(events.map((event) => event.data.kind));
for (const kind of [
  "command.response",
  "agent.lifecycle",
  "turn.lifecycle",
  "message.lifecycle",
  "tool.lifecycle",
  "queue.changed",
  "retry.lifecycle",
  "compaction.lifecycle",
  "session.identity",
  "snapshot.state",
  "snapshot.messages",
  "process.boundary",
  "host.action",
  "runtime.unknown",
]) {
  requireValue(kinds.has(kind), `Fixture does not cover ${kind}.`);
}

const promptResponses = events.filter(
  (event) => event.data.kind === "command.response" && event.data.command === "prompt",
);
requireValue(promptResponses.length === 2, "Fixture must cover accepted and rejected Prompt Responses.");
requireValue(
  promptResponses.every(
    (event) => event.data.kind === "command.response" && event.data.phase === "preflight-result",
  ),
  "Prompt Responses must remain preflight results.",
);
requireValue(
  promptResponses.some(
    (event) => event.data.kind === "command.response" && event.data.success === true,
  ) &&
    promptResponses.some(
      (event) => event.data.kind === "command.response" && event.data.success === false,
    ),
  "Fixture must preserve Prompt acceptance and rejection separately.",
);

const compaction = events.find(
  (event) => event.data.kind === "compaction.lifecycle" && event.data.phase === "completed",
);
requireValue(
  Boolean(compaction?.links?.sourceEventIds?.length && compaction.links.replacesEventIds?.length),
  "Compaction Fixture must retain source/replacement lineage.",
);

const hostActions = events.filter((event) => event.data.kind === "host.action");
for (const action of ["send-command", "close-stdin", "request-signal"]) {
  requireValue(
    hostActions.some(
      (event) => event.data.kind === "host.action" && event.data.action === action,
    ),
    `Fixture must preserve ${action} as a Host action.`,
  );
}
requireValue(
  hostActions.every(
    (event) => event.source.surface === "host" && event.provenance === "host-synthesized",
  ),
  "Host actions must remain Host-synthesized facts.",
);

const processBoundaries = events.filter((event) => event.data.kind === "process.boundary");
for (const boundary of ["spawn", "exit", "close"]) {
  requireValue(
    processBoundaries.some(
      (event) =>
        event.data.kind === "process.boundary" && event.data.boundary === boundary,
    ),
    `Fixture must preserve ${boundary} as a Process boundary.`,
  );
}
requireValue(
  processBoundaries.every(
    (event) => event.source.surface === "host" && event.provenance === "observed",
  ),
  "Process boundaries must remain Host-observed facts.",
);

requireValue(
  events.some(
    (event) =>
      event.source.eventType === "extension_shutdown" &&
      event.data.kind === "session.identity" &&
      event.data.action === "shutdown",
  ),
  "Extension shutdown must remain Session identity, not a Process boundary.",
);

const unknown = events.find((event) => event.data.kind === "runtime.unknown");
requireValue(
  unknown?.data.kind === "runtime.unknown" &&
    unknown.data.canonicalization === "zhiwei-json-v1" &&
    unknown.compatibility === "ignorable",
  "Unknown event diagnostic is missing or not explicitly ignorable.",
);

const sourceSlot = events.find(
  (event) => event.data.kind === "agent.lifecycle" && event.data.phase === "started",
);
if (sourceSlot) {
  const { eventId: _eventId, idempotencyKey: _idempotencyKey, ...draft } = sourceSlot;
  const sourceVocabularyConflict = createNormalizedRuntimeEventV1({
    ...draft,
    source: { ...draft.source, eventType: "different-source-type" },
  });
  requireValue(
    sourceVocabularyConflict.eventId === sourceSlot.eventId,
    "Source vocabulary drift must occupy the same source-slot eventId.",
  );
  requireValue(
    classifyNormalizedRuntimeReplayV1(sourceSlot, sourceVocabularyConflict) ===
      "source-slot-conflict",
    "Source vocabulary drift must classify as a source-slot conflict.",
  );
}

for (const [index, event] of events.entries()) {
  const canonical = canonicalNormalizedRuntimeEventV1(event);
  requireValue(!canonical.includes("globalSequence"), `Event ${index} contains globalSequence.`);
  requireValue(!canonical.includes("taskSucceeded"), `Event ${index} contains inferred task success.`);
  requireValue(!canonical.includes("sdkEvent"), `Event ${index} contains a raw SDK object.`);
}

for (const path of [
  "packages/protocol/src/sha256.ts",
  "packages/protocol/src/lossless-json.ts",
  "packages/protocol/src/runtime-event-payload-v1.ts",
  "packages/protocol/src/runtime-event-v1.ts",
  "packages/protocol/src/runtime-event-stream-v1.ts",
]) {
  const source = await readFile(path, "utf8");
  requireValue(!/from\s+["']node:/.test(source), `${path} must not import Node APIs.`);
  requireValue(!/from\s+["'][^"']*pi[^"']*["']/.test(source), `${path} must not import Pi.`);
  requireValue(!/\bDate\s*\./.test(source), `${path} must not read the system clock.`);
  requireValue(!/Math\.random/.test(source), `${path} must not generate random identity.`);
}

const adapterSource = await readFile(
  "packages/pi-adapter/src/normalized-runtime-event-v1.ts",
  "utf8",
);
requireValue(!/\bDate\s*\./.test(adapterSource), "Pi Adapter must not read the system clock.");
requireValue(!/Math\.random/.test(adapterSource), "Pi Adapter must not generate random IDs.");

const architecture = await readFile(
  "docs/architecture/normalized-runtime-event-v1.md",
  "utf8",
);
for (const token of [
  "source slot",
  "sourceEventIds",
  "replacesEventIds",
  "Host Action",
  "Process Boundary",
  "required unknown",
  "cross-domain",
]) {
  requireValue(architecture.includes(token), `Architecture document is missing token: ${token}.`);
}

if (violations.length > 0) {
  console.error(
    "NormalizedRuntimeEvent v1 contract violations:\n" +
      violations.map((violation) => `- ${violation}`).join("\n"),
  );
  process.exit(1);
}

const fixtureHash = canonicalJsonSha256V1(events);
console.log(
  `NormalizedRuntimeEvent v1 contract: OK (${events.length} events, ${fixtureHash})`,
);
