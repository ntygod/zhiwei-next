import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  canonicalNormalizedRuntimeEventV1,
  parseNormalizedRuntimeEventTraceV1,
} from "../packages/protocol/src/index.ts";

const fixturePath = resolve("packages/protocol/fixtures/normalized-runtime-event-v1.json");
const fixture = JSON.parse(await readFile(fixturePath, "utf8"));
const violations = [];

function requireValue(condition, message) {
  if (!condition) violations.push(message);
}

requireValue(fixture.schemaVersion === 1, "Fixture schemaVersion must be 1.");
requireValue(fixture.contract === "NormalizedRuntimeEvent v1", "Fixture contract name drifted.");
requireValue(fixture.sourceEvidence?.issue === 32, "Fixture must cite Issue #32 evidence.");
requireValue(
  fixture.sourceEvidence?.mergeCommit === "374a27505c4a150cbcb63c1b8f6c1afb3bfb4448",
  "Fixture source merge commit drifted.",
);
requireValue(fixture.sourceEvidence?.runtimeVersion === "0.84.1", "Fixture Pi version drifted.");

let events = [];
try {
  events = [...parseNormalizedRuntimeEventTraceV1(fixture.events)];
} catch (error) {
  violations.push(`Fixture trace failed validation: ${error.message}`);
}

const surfaces = new Set(events.map((event) => event.source.surface));
for (const surface of ["sdk", "extension", "rpc", "host"]) {
  requireValue(surfaces.has(surface), `Fixture does not cover ${surface} source surface.`);
}
const kinds = new Set(events.map((event) => event.data.kind));
for (const kind of [
  "command.response",
  "agent.lifecycle",
  "message.lifecycle",
  "tool.lifecycle",
  "retry.lifecycle",
  "compaction.lifecycle",
  "session.identity",
  "process.boundary",
  "host.action",
  "runtime.unknown",
]) {
  requireValue(kinds.has(kind), `Fixture does not cover ${kind}.`);
}

const prompt = events.find(
  (event) => event.data.kind === "command.response" && event.data.command === "prompt",
);
requireValue(
  prompt?.data.kind === "command.response" && prompt.data.phase === "preflight-result",
  "Prompt Response must remain a preflight result.",
);
const compaction = events.find(
  (event) => event.data.kind === "compaction.lifecycle" && event.data.phase === "completed",
);
requireValue(
  Boolean(compaction?.links?.sourceEventIds?.length && compaction.links.replacesEventIds?.length),
  "Compaction Fixture must retain source/replacement lineage.",
);
const unknown = events.find((event) => event.data.kind === "runtime.unknown");
requireValue(
  unknown?.data.kind === "runtime.unknown" && unknown.data.canonicalization === "zhiwei-json-v1",
  "Unknown event diagnostic is missing.",
);
const hostActions = events.filter((event) => event.data.kind === "host.action");
requireValue(
  hostActions.some((event) => event.data.kind === "host.action" && event.data.action === "close-stdin"),
  "Fixture must preserve stdin EOF as a Host action.",
);
requireValue(
  hostActions.some((event) => event.data.kind === "host.action" && event.data.action === "request-signal"),
  "Fixture must preserve signal request as a Host action.",
);
const processBoundaries = events.filter((event) => event.data.kind === "process.boundary");
requireValue(
  processBoundaries.some((event) => event.data.kind === "process.boundary" && event.data.boundary === "exit") &&
    processBoundaries.some((event) => event.data.kind === "process.boundary" && event.data.boundary === "close"),
  "Fixture must preserve exit and close as observed Process boundaries.",
);
requireValue(
  processBoundaries.every(
    (event) =>
      event.data.kind === "process.boundary" &&
      !["stdin-eof", "signal-requested"].includes(event.data.boundary),
  ),
  "Host actions must not be collapsed into Process boundaries.",
);

for (const [index, event] of events.entries()) {
  const canonical = canonicalNormalizedRuntimeEventV1(event);
  requireValue(!canonical.includes("globalSequence"), `Event ${index} contains globalSequence.`);
  requireValue(!canonical.includes("taskSucceeded"), `Event ${index} contains inferred task success.`);
  requireValue(!canonical.includes("sdkEvent"), `Event ${index} contains a raw SDK object.`);
}

for (const path of [
  "packages/protocol/src/lossless-json.ts",
  "packages/protocol/src/sha256.ts",
  "packages/protocol/src/runtime-event-v1.ts",
  "packages/protocol/src/runtime-event-stream-v1.ts",
]) {
  const source = await readFile(path, "utf8");
  requireValue(!/from\s+["']node:/.test(source), `${path} must not import Node APIs.`);
  requireValue(!/from\s+["'][^"']*pi[^"']*["']/.test(source), `${path} must not import Pi.`);
  requireValue(!/\bDate\s*\./.test(source), `${path} must not read the system clock.`);
}

const adapterSource = await readFile(
  "packages/pi-adapter/src/normalized-runtime-event-v1.ts",
  "utf8",
);
requireValue(!/\bDate\s*\./.test(adapterSource), "Pi Adapter must not read the system clock.");
requireValue(!/Math\.random/.test(adapterSource), "Pi Adapter must not generate random IDs.");

if (violations.length > 0) {
  console.error(
    "NormalizedRuntimeEvent v1 contract violations:\n" +
      violations.map((violation) => `- ${violation}`).join("\n"),
  );
  process.exit(1);
}

console.log(`NormalizedRuntimeEvent v1 contract: OK (${events.length} events)`);
