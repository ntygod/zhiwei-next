import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const inputPath = resolve(
  process.argv[2] ??
    process.env.PI_FOLLOW_UP_LIFECYCLE_OUTPUT ??
    "packages/pi-adapter/fixtures/pi-lifecycle-follow-up-queue.json",
);
const violations = [];

function requireValue(condition, message) {
  if (!condition) violations.push(message);
}

function fingerprint(result) {
  const clone = structuredClone(result);
  delete clone.contractFingerprint;
  return createHash("sha256").update(JSON.stringify(clone)).digest("hex");
}

function count(events, type) {
  return events.filter((event) => event.type === type).length;
}

function checkContiguousSequence(events, label) {
  for (let index = 0; index < events.length; index += 1) {
    requireValue(
      events[index].sequence === index + 1,
      `${label} sequence is not contiguous at index ${index}.`,
    );
  }
}

const result = JSON.parse(await readFile(inputPath, "utf8"));
requireValue(result.schemaVersion === 1, "Follow-up lifecycle result schemaVersion must be 1.");
requireValue(result.status === "passed", `Follow-up lifecycle status must be passed, got ${result.status}.`);
requireValue(result.scenario === "follow-up-queue", "Follow-up scenario must be follow-up-queue.");
requireValue(
  result.upstream?.repository === "earendil-works/pi" &&
    result.upstream?.releaseTag === "v0.84.1" &&
    result.upstream?.commit === "53fa77ccd8a279eb87e92294ef3687b03ff80112",
  "Follow-up upstream baseline is incorrect.",
);
requireValue(
  result.artifact?.name === "@earendil-works/pi-coding-agent" &&
    result.artifact?.version === "0.84.1",
  "Follow-up Artifact identity is incorrect.",
);
requireValue(
  result.artifact?.integrity ===
    "sha512-ncAqFrG+iybuPGOhMiZoEHkEzTpJgz3guYD32pD+M7ucc0WeHmauP6wa7qwP8V/KWvsZDVNa5XGsdZ7fkC7w7A==",
  "Follow-up Artifact integrity differs from the pinned registry evidence.",
);
requireValue(
  result.artifact?.shasum === "e098cada629fdeeb9df6e77c6d480d43e1b2c553",
  "Follow-up Artifact shasum differs from the pinned registry evidence.",
);
requireValue(result.artifact?.installScriptsExecuted === false, "Follow-up install scripts must remain disabled.");
requireValue(result.environment?.node === "22.23.1", `Follow-up Node version must be 22.23.1, got ${result.environment?.node}.`);
requireValue(result.environment?.platform === "linux-x64", "Follow-up platform must be linux-x64.");
requireValue(
  result.environment?.containerImage ===
    "node:22.23.1-bookworm-slim@sha256:6c74791e557ce11fc957704f6d4fe134a7bc8d6f5ca4403205b2966bd488f6b3",
  "Follow-up container image is not the pinned digest.",
);
requireValue(result.isolation?.hostSecretsPassedToProbe === false, "Host secrets must not reach follow-up capture.");
requireValue(result.isolation?.hostWorkspaceMounted === false, "Host repository must not be mounted into follow-up capture.");
requireValue(result.isolation?.sourceBundleReadOnly === true, "Follow-up source bundle must be read-only.");
requireValue(result.isolation?.containerRootFilesystemReadOnly === true, "Follow-up container root must be read-only.");
requireValue(result.isolation?.containerCapabilitiesDropped === true, "Follow-up container capabilities must be dropped.");
requireValue(result.isolation?.containerNoNewPrivileges === true, "Follow-up container must use no-new-privileges.");

const capture = result.capture;
requireValue(capture?.schemaVersion === 1, "Nested follow-up capture schemaVersion must be 1.");
requireValue(capture?.status === "passed", `Nested follow-up capture status must be passed, got ${capture?.status}.`);
requireValue(capture?.scenario === "follow-up-queue", "Nested follow-up scenario must be follow-up-queue.");
requireValue(capture?.provider?.id === "zhiwei-follow-up-faux", "Follow-up capture must use the dedicated Faux provider.");
requireValue(capture?.provider?.api === "zhiwei-follow-up-faux-api", "Follow-up Faux API is incorrect.");
requireValue(capture?.provider?.callCount === 2, "Follow-up scenario must consume exactly two Faux responses.");
requireValue(capture?.provider?.pendingResponses === 0, "Follow-up scenario must consume all Faux responses.");
requireValue(capture?.provider?.promptsSentToExternalProvider === 0, "Follow-up capture must not contact an external provider.");
requireValue(capture?.outcome?.finalText === "Follow-up response complete.", "Follow-up final text is incorrect.");
requireValue(capture?.outcome?.sessionWasIdleBeforeShutdown === true, "Prompt must resolve only after Session is idle.");
requireValue(capture?.queue?.pendingMessageCountBeforeShutdown === 0, "Pending message count must be zero after follow-up.");
requireValue(
  Array.isArray(capture?.queue?.pendingFollowUpsBeforeShutdown) &&
    capture.queue.pendingFollowUpsBeforeShutdown.length === 0,
  "Follow-up queue must be empty when prompt resolves.",
);
requireValue(capture?.queue?.actions?.length === 1, "Follow-up must be queued exactly once.");
requireValue(
  capture?.queue?.actions?.[0]?.text === "Process the queued follow-up now.",
  "Follow-up queued text drifted.",
);
requireValue(capture?.counts?.publicAgentStarts === 1, "Expected one public agent_start.");
requireValue(capture?.counts?.publicAgentEnds === 1, "Expected one public agent_end.");
requireValue(capture?.counts?.publicAgentSettled === 1, "Expected one public agent_settled.");
requireValue(capture?.counts?.publicTurnStarts === 2, "Expected two public turn_start events.");
requireValue(capture?.counts?.publicTurnEnds === 2, "Expected two public turn_end events.");
requireValue(capture?.counts?.publicQueueUpdates >= 2, "Expected at least two public queue_update events.");
requireValue(capture?.ordering?.queueClearedBeforeFollowUpMessage === true, "Queue must clear before Follow-up message delivery.");
requireValue(capture?.ordering?.finalAssistantBeforeAgentEnd === true, "Follow-up response must precede agent_end.");
requireValue(capture?.ordering?.agentEndBeforeSettled === true, "agent_end must precede agent_settled.");
requireValue(capture?.ordering?.extensionSettledBeforeShutdown === true, "Extension settled must precede shutdown.");

const sessionEvents = capture?.sessionEvents ?? [];
const extensionEvents = capture?.extensionEvents ?? [];
checkContiguousSequence(sessionEvents, "Follow-up Session events");
checkContiguousSequence(extensionEvents, "Follow-up Extension events");
requireValue(
  sessionEvents.some(
    (event) =>
      event.type === "queue_update" &&
      event.followUp?.includes("Process the queued follow-up now."),
  ),
  "Public queue trace never exposed the queued Follow-up.",
);
requireValue(
  sessionEvents.some(
    (event) => event.type === "queue_update" && Array.isArray(event.followUp) && event.followUp.length === 0,
  ),
  "Public queue trace never exposed the cleared Follow-up queue.",
);
requireValue(count(sessionEvents, "agent_start") === 1, "Session trace must contain one agent_start.");
requireValue(count(sessionEvents, "agent_end") === 1, "Session trace must contain one agent_end.");
requireValue(count(sessionEvents, "agent_settled") === 1, "Session trace must contain one agent_settled.");
requireValue(count(extensionEvents, "session_shutdown") === 1, "Extension trace must contain one session_shutdown.");
requireValue(
  sessionEvents.every((event) => !event.type.startsWith("tool_execution_")),
  "Follow-up scenario must not execute tools.",
);
requireValue(
  extensionEvents.every((event) => event.type !== "tool_call" && event.type !== "tool_result"),
  "Follow-up Extension trace must not contain Tool events.",
);

for (const [field, expected] of Object.entries({
  absolutePathsIncluded: false,
  rawSessionIdIncluded: false,
  environmentDumpIncluded: false,
  credentialsIncluded: false,
  rawChainOfThoughtIncluded: false,
})) {
  requireValue(capture?.sanitization?.[field] === expected, `Follow-up sanitization.${field} must be ${expected}.`);
}

const serialized = JSON.stringify(result);
for (const pattern of [
  /\/home\/runner\//,
  /\/tmp\/zhiwei-pi-lifecycle-/,
  /[A-Za-z]:\\Users\\/,
  /GITHUB_TOKEN/i,
  /authorization:\s*bearer/i,
  /cookie:/i,
  /api[_-]?key/i,
]) {
  requireValue(!pattern.test(serialized), `Follow-up lifecycle result contains forbidden pattern: ${pattern}`);
}
requireValue(!serialized.includes('"sessionId"'), "Follow-up result must not contain a raw sessionId field.");
requireValue(result.contractFingerprint === fingerprint(result), "Outer follow-up contract fingerprint is invalid.");
requireValue(capture.contractFingerprint === fingerprint(capture), "Nested follow-up contract fingerprint is invalid.");

if (violations.length > 0) {
  console.error("Pi follow-up lifecycle result violations:\n" + violations.map((item) => `- ${item}`).join("\n"));
  process.exit(1);
}

console.log(`Pi follow-up lifecycle runtime result: OK (${result.contractFingerprint})`);
