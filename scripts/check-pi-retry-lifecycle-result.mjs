import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const inputPath = resolve(
  process.argv[2] ??
    process.env.PI_RETRY_LIFECYCLE_OUTPUT ??
    "packages/pi-adapter/fixtures/pi-lifecycle-retry-success.json",
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
requireValue(result.schemaVersion === 1, "Retry lifecycle result schemaVersion must be 1.");
requireValue(result.status === "passed", `Retry lifecycle result status must be passed, got ${result.status}.`);
requireValue(result.scenario === "retry-success", "Retry lifecycle scenario must be retry-success.");
requireValue(
  result.upstream?.repository === "earendil-works/pi" &&
    result.upstream?.releaseTag === "v0.84.1" &&
    result.upstream?.commit === "53fa77ccd8a279eb87e92294ef3687b03ff80112",
  "Retry lifecycle upstream baseline is incorrect.",
);
requireValue(
  result.artifact?.name === "@earendil-works/pi-coding-agent" &&
    result.artifact?.version === "0.84.1",
  "Retry lifecycle Artifact identity is incorrect.",
);
requireValue(
  result.artifact?.integrity ===
    "sha512-ncAqFrG+iybuPGOhMiZoEHkEzTpJgz3guYD32pD+M7ucc0WeHmauP6wa7qwP8V/KWvsZDVNa5XGsdZ7fkC7w7A==",
  "Retry lifecycle Artifact integrity differs from the pinned registry evidence.",
);
requireValue(
  result.artifact?.shasum === "e098cada629fdeeb9df6e77c6d480d43e1b2c553",
  "Retry lifecycle Artifact shasum differs from the pinned registry evidence.",
);
requireValue(result.artifact?.installScriptsExecuted === false, "Retry lifecycle install scripts must remain disabled.");
requireValue(result.environment?.node === "22.23.1", `Retry lifecycle Node version must be 22.23.1, got ${result.environment?.node}.`);
requireValue(result.environment?.platform === "linux-x64", "Retry lifecycle platform must be linux-x64.");
requireValue(
  result.environment?.containerImage ===
    "node:22.23.1-bookworm-slim@sha256:6c74791e557ce11fc957704f6d4fe134a7bc8d6f5ca4403205b2966bd488f6b3",
  "Retry lifecycle container image is not the pinned digest.",
);
requireValue(result.isolation?.hostSecretsPassedToProbe === false, "Host secrets must not be passed to retry capture.");
requireValue(result.isolation?.hostWorkspaceMounted === false, "Host repository must not be mounted into retry capture.");
requireValue(result.isolation?.sourceBundleReadOnly === true, "Retry source bundle must be read-only.");
requireValue(result.isolation?.containerRootFilesystemReadOnly === true, "Retry container root must be read-only.");
requireValue(result.isolation?.containerCapabilitiesDropped === true, "Retry container capabilities must be dropped.");
requireValue(result.isolation?.containerNoNewPrivileges === true, "Retry container must use no-new-privileges.");

const capture = result.capture;
requireValue(capture?.schemaVersion === 1, "Nested retry capture schemaVersion must be 1.");
requireValue(capture?.status === "passed", `Nested retry capture status must be passed, got ${capture?.status}.`);
requireValue(capture?.scenario === "retry-success", "Nested retry capture scenario must be retry-success.");
requireValue(
  capture?.package?.name === "@earendil-works/pi-coding-agent" &&
    capture?.package?.version === "0.84.1",
  "Nested retry package identity is incorrect.",
);
requireValue(capture?.provider?.id === "zhiwei-retry-faux", "Retry capture must use the dedicated Faux provider.");
requireValue(capture?.provider?.api === "zhiwei-retry-faux-api", "Retry Faux API is incorrect.");
requireValue(capture?.provider?.callCount === 2, "Retry recovery must consume exactly two Faux responses.");
requireValue(capture?.provider?.pendingResponses === 0, "Retry recovery must consume all Faux responses.");
requireValue(capture?.provider?.promptsSentToExternalProvider === 0, "Retry capture must not contact an external provider.");
requireValue(capture?.prompt?.source === "interactive", "Retry prompt source must be interactive.");
requireValue(capture?.outcome?.finalText === "Retry recovered.", "Retry final assistant text is incorrect.");
requireValue(
  JSON.stringify(capture?.outcome?.messageRoles) === JSON.stringify(["user", "assistant"]),
  "Final Session messages must retain only the user prompt and recovered assistant answer.",
);
requireValue(capture?.outcome?.sessionWasIdleBeforeShutdown === true, "Retry prompt must resolve only after Session is idle.");
requireValue(capture?.outcome?.sessionWasRetryingBeforeShutdown === false, "Retry prompt must resolve after retry state clears.");

requireValue(
  JSON.stringify(capture?.retry?.settings) ===
    JSON.stringify({ enabled: true, maxRetries: 3, baseDelayMs: 1 }),
  "Retry settings differ from the fixed scenario.",
);
requireValue(capture?.retry?.retryableError === "overloaded_error", "Retryable error identity drifted.");
for (const [field, expected] of Object.entries({
  sessionEvents: 23,
  extensionEvents: 24,
  publicRetryStarts: 1,
  publicRetryEnds: 1,
  publicAgentEnds: 2,
  publicAgentSettled: 1,
  extensionRetryStarts: 0,
  extensionRetryEnds: 0,
  extensionAgentEnds: 2,
  extensionAgentSettled: 1,
  extensionSessionShutdowns: 1,
})) {
  requireValue(capture?.counts?.[field] === expected, `Retry counts.${field} must be ${expected}.`);
}
requireValue(
  JSON.stringify(capture?.retry?.public?.agentEndWillRetry) === JSON.stringify([true, false]),
  "Public agent_end willRetry sequence must be [true, false].",
);
requireValue(
  JSON.stringify(capture?.retry?.extension?.agentEndWillRetry) === JSON.stringify([null, null]),
  "Extension agent_end events must not claim the Session-only willRetry augmentation.",
);
requireValue(
  capture?.retry?.extension?.startEvents?.length === 0 &&
    capture?.retry?.extension?.endEvents?.length === 0,
  "Extension lifecycle must not invent public auto_retry_start/auto_retry_end events.",
);
const retryStart = capture?.retry?.public?.startEvents?.[0];
requireValue(retryStart?.sequence === 12, "auto_retry_start sequence must remain 12.");
requireValue(retryStart?.attempt === 1, "auto_retry_start attempt must be 1.");
requireValue(retryStart?.maxAttempts === 3, "auto_retry_start maxAttempts must be 3.");
requireValue(retryStart?.delayMs === 1, "auto_retry_start delayMs must be 1.");
requireValue(retryStart?.errorMessage === "overloaded_error", "auto_retry_start errorMessage drifted.");
const retryEnd = capture?.retry?.public?.endEvents?.[0];
requireValue(retryEnd?.sequence === 20, "auto_retry_end sequence must remain 20.");
requireValue(retryEnd?.success === true, "auto_retry_end must report success.");
requireValue(retryEnd?.attempt === 1, "auto_retry_end attempt must be 1.");
requireValue(retryEnd?.finalError === undefined, "Successful retry must not retain finalError.");

requireValue(
  JSON.stringify(capture?.ordering?.public) ===
    JSON.stringify({
      firstAgentEndIndex: 10,
      retryStartIndex: 11,
      retryEndIndex: 19,
      finalAgentEndIndex: 21,
      settledIndex: 22,
      retryStartBeforeSettled: true,
      retryEndBeforeSettled: true,
      finalAgentEndBeforeSettled: true,
    }),
  "Public retry ordering differs from the committed Runtime contract.",
);
requireValue(
  JSON.stringify(capture?.ordering?.extension) ===
    JSON.stringify({ settledIndex: 22, shutdownIndex: 23, settledBeforeShutdown: true }),
  "Extension settled/shutdown ordering differs from the committed Runtime contract.",
);

const sessionEvents = capture?.sessionEvents ?? [];
const extensionEvents = capture?.extensionEvents ?? [];
checkContiguousSequence(sessionEvents, "Retry Session events");
checkContiguousSequence(extensionEvents, "Retry Extension events");
const expectedSessionTypes = [
  "agent_start",
  "turn_start",
  "message_start",
  "message_end",
  "message_start",
  "message_update",
  "message_update",
  "message_update",
  "message_end",
  "turn_end",
  "agent_end",
  "auto_retry_start",
  "agent_start",
  "turn_start",
  "message_start",
  "message_update",
  "message_update",
  "message_update",
  "message_end",
  "auto_retry_end",
  "turn_end",
  "agent_end",
  "agent_settled",
];
requireValue(
  JSON.stringify(sessionEvents.map((event) => event.type)) === JSON.stringify(expectedSessionTypes),
  "Public retry event type sequence drifted.",
);
const expectedExtensionTypes = [
  "input",
  "before_agent_start",
  "agent_start",
  "turn_start",
  "message_start",
  "message_end",
  "message_start",
  "message_update",
  "message_update",
  "message_update",
  "message_end",
  "turn_end",
  "agent_end",
  "agent_start",
  "turn_start",
  "message_start",
  "message_update",
  "message_update",
  "message_update",
  "message_end",
  "turn_end",
  "agent_end",
  "agent_settled",
  "session_shutdown",
];
requireValue(
  JSON.stringify(extensionEvents.map((event) => event.type)) === JSON.stringify(expectedExtensionTypes),
  "Extension retry event type sequence drifted.",
);
requireValue(count(extensionEvents, "session_start") === 0, "Inline Extension must not claim an unobserved session_start.");
requireValue(count(extensionEvents, "auto_retry_start") === 0, "Extension must not claim auto_retry_start.");
requireValue(count(extensionEvents, "auto_retry_end") === 0, "Extension must not claim auto_retry_end.");
requireValue(
  sessionEvents[8]?.stopReason === "error" &&
    sessionEvents[8]?.messageError === "overloaded_error",
  "Failed Assistant event evidence is missing before the retry boundary.",
);
requireValue(
  sessionEvents[10]?.type === "agent_end" && sessionEvents[10]?.willRetry === true,
  "First public agent_end must expose willRetry=true before auto_retry_start.",
);
requireValue(
  sessionEvents[21]?.type === "agent_end" && sessionEvents[21]?.willRetry === false,
  "Final public agent_end must expose willRetry=false.",
);
requireValue(
  sessionEvents.every((event) => !event.type.startsWith("tool_execution_")),
  "Retry recovery scenario must not execute tools.",
);
requireValue(
  extensionEvents.every((event) => event.type !== "tool_call" && event.type !== "tool_result"),
  "Retry recovery Extension trace must not contain Tool events.",
);

for (const [field, expected] of Object.entries({
  absolutePathsIncluded: false,
  rawSessionIdIncluded: false,
  environmentDumpIncluded: false,
  credentialsIncluded: false,
  rawChainOfThoughtIncluded: false,
})) {
  requireValue(capture?.sanitization?.[field] === expected, `Retry sanitization.${field} must be ${expected}.`);
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
  requireValue(!pattern.test(serialized), `Retry lifecycle result contains forbidden pattern: ${pattern}`);
}
requireValue(!serialized.includes('"sessionId"'), "Retry lifecycle result must not contain a raw sessionId field.");
requireValue(result.contractFingerprint === fingerprint(result), "Outer retry contract fingerprint is invalid.");
requireValue(capture.contractFingerprint === fingerprint(capture), "Nested retry contract fingerprint is invalid.");

if (violations.length > 0) {
  console.error("Pi retry lifecycle result violations:\n" + violations.map((item) => `- ${item}`).join("\n"));
  process.exit(1);
}

console.log(`Pi retry lifecycle runtime result: OK (${result.contractFingerprint})`);
