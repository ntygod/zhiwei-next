import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const inputPath = resolve(
  process.argv[2] ??
    process.env.PI_FOLLOW_UP_LIFECYCLE_OUTPUT ??
    "packages/pi-adapter/fixtures/pi-lifecycle-follow-up-queue.json",
);
const violations = [];

const INITIAL_PROMPT = "Produce the first response before processing the queued follow-up.";
const FOLLOW_UP_PROMPT = "Process the queued follow-up now.";
const FIRST_RESPONSE = "First response complete.";
const FOLLOW_UP_RESPONSE = "Follow-up response complete.";
const EXPECTED_OUTER_FINGERPRINT = "00c3f7916a129869b768f7e7147a55a8c783b33e5a55e0e79c13eb45a1d692e8";
const EXPECTED_CAPTURE_FINGERPRINT = "5b2e266feb27155b7ded59c33aa12e6cd060ce89201dc21a8cd35f49a8748386";

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

function eventTypes(events) {
  return events.map((event) => event.type);
}

const [resultText, followUpDocument, spikeReport, architecture, projectState] = await Promise.all([
  readFile(inputPath, "utf8"),
  readFile("docs/spikes/pi-runtime-contract/follow-up-queue-lifecycle.md", "utf8"),
  readFile("docs/spikes/pi-runtime-contract/README.md", "utf8"),
  readFile("docs/architecture/pi-integration.md", "utf8"),
  readFile("docs/harness/project-state.md", "utf8"),
]);
const result = JSON.parse(resultText);
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
requireValue(result.environment?.npm === "10.9.8", `Follow-up npm version must be 10.9.8, got ${result.environment?.npm}.`);
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
requireValue(
  capture?.package?.name === "@earendil-works/pi-coding-agent" && capture?.package?.version === "0.84.1",
  "Nested Follow-up package identity is incorrect.",
);
requireValue(capture?.provider?.id === "zhiwei-follow-up-faux", "Follow-up capture must use the dedicated Faux provider.");
requireValue(capture?.provider?.api === "zhiwei-follow-up-faux-api", "Follow-up Faux API is incorrect.");
requireValue(capture?.provider?.callCount === 2, "Follow-up scenario must consume exactly two Faux responses.");
requireValue(capture?.provider?.pendingResponses === 0, "Follow-up scenario must consume all Faux responses.");
requireValue(capture?.provider?.promptsSentToExternalProvider === 0, "Follow-up capture must not contact an external provider.");
requireValue(capture?.prompts?.initial === INITIAL_PROMPT, "Initial Follow-up prompt drifted.");
requireValue(capture?.prompts?.followUp === FOLLOW_UP_PROMPT, "Queued Follow-up prompt drifted.");
requireValue(capture?.responses?.first === FIRST_RESPONSE, "First Faux response drifted.");
requireValue(capture?.responses?.followUp === FOLLOW_UP_RESPONSE, "Follow-up Faux response drifted.");

requireValue(capture?.queue?.mode === "one-at-a-time", "Follow-up queue mode must be one-at-a-time.");
requireValue(capture?.queue?.actions?.length === 1, "Follow-up must be queued exactly once.");
requireValue(
  capture?.queue?.actions?.[0]?.phase === "queued" &&
    capture?.queue?.actions?.[0]?.text === FOLLOW_UP_PROMPT &&
    capture?.queue?.actions?.[0]?.triggerSequence === 5 &&
    capture?.queue?.actions?.[0]?.queueUpdateSequence === 6,
  "Follow-up queue action differs from the verified capture.",
);
requireValue(
  JSON.stringify(capture?.queue?.updates) ===
    JSON.stringify([
      { sequence: 6, type: "queue_update", steering: [], followUp: [FOLLOW_UP_PROMPT] },
      { sequence: 13, type: "queue_update", steering: [], followUp: [] },
    ]),
  "Follow-up queue updates differ from the verified fill/clear sequence.",
);
requireValue(capture?.queue?.pendingMessageCountBeforeShutdown === 0, "Pending message count must be zero after follow-up.");
requireValue(
  Array.isArray(capture?.queue?.pendingFollowUpsBeforeShutdown) &&
    capture.queue.pendingFollowUpsBeforeShutdown.length === 0,
  "Follow-up queue must be empty when prompt resolves.",
);

requireValue(capture?.outcome?.finalText === FOLLOW_UP_RESPONSE, "Follow-up final text is incorrect.");
requireValue(capture?.outcome?.expectedFinalText === FOLLOW_UP_RESPONSE, "Follow-up expected final text drifted.");
requireValue(capture?.outcome?.sessionWasIdleBeforeShutdown === true, "Prompt must resolve only after Session is idle.");
requireValue(
  JSON.stringify(capture?.outcome?.finalMessages) ===
    JSON.stringify([
      { index: 0, role: "user", text: INITIAL_PROMPT },
      { index: 1, role: "assistant", text: FIRST_RESPONSE, stopReason: "stop" },
      { index: 2, role: "user", text: FOLLOW_UP_PROMPT },
      { index: 3, role: "assistant", text: FOLLOW_UP_RESPONSE, stopReason: "stop" },
    ]),
  "Final Session messages differ from the verified two-turn conversation.",
);

const expectedCounts = {
  sessionEvents: 23,
  extensionEvents: 24,
  publicQueueUpdates: 2,
  publicAgentStarts: 1,
  publicAgentEnds: 1,
  publicAgentSettled: 1,
  publicTurnStarts: 2,
  publicTurnEnds: 2,
  extensionAgentStarts: 1,
  extensionAgentEnds: 1,
  extensionAgentSettled: 1,
  extensionTurnStarts: 2,
  extensionTurnEnds: 2,
  extensionQueueUpdates: 0,
  extensionSessionShutdowns: 1,
};
for (const [field, expected] of Object.entries(expectedCounts)) {
  requireValue(capture?.counts?.[field] === expected, `Follow-up counts.${field} must be ${expected}.`);
}

const expectedOrdering = {
  queueFilledSequence: 6,
  queueClearedSequence: 13,
  followUpMessageStartIndex: 13,
  finalAssistantEndIndex: 19,
  publicAgentEndIndex: 21,
  publicSettledIndex: 22,
  queueClearedBeforeFollowUpMessage: true,
  finalAssistantBeforeAgentEnd: true,
  agentEndBeforeSettled: true,
  extensionSettledBeforeShutdown: true,
};
for (const [field, expected] of Object.entries(expectedOrdering)) {
  requireValue(capture?.ordering?.[field] === expected, `Follow-up ordering.${field} must be ${expected}.`);
}
requireValue(
  capture?.ordering?.queueFilledSequence < capture?.ordering?.queueClearedSequence,
  "Follow-up queue must clear after it was filled.",
);

const sessionEvents = capture?.sessionEvents ?? [];
const extensionEvents = capture?.extensionEvents ?? [];
checkContiguousSequence(sessionEvents, "Follow-up Session events");
checkContiguousSequence(extensionEvents, "Follow-up Extension events");
requireValue(
  JSON.stringify(eventTypes(sessionEvents)) ===
    JSON.stringify([
      "agent_start",
      "turn_start",
      "message_start",
      "message_end",
      "message_start",
      "queue_update",
      "message_update",
      "message_update",
      "message_update",
      "message_end",
      "turn_end",
      "turn_start",
      "queue_update",
      "message_start",
      "message_end",
      "message_start",
      "message_update",
      "message_update",
      "message_update",
      "message_end",
      "turn_end",
      "agent_end",
      "agent_settled",
    ]),
  "Public Follow-up event type sequence differs from the verified capture.",
);
requireValue(
  JSON.stringify(eventTypes(extensionEvents)) ===
    JSON.stringify([
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
      "agent_settled",
      "session_shutdown",
    ]),
  "Extension Follow-up event type sequence differs from the verified capture.",
);
requireValue(count(sessionEvents, "agent_start") === 1, "Session trace must contain one agent_start.");
requireValue(count(sessionEvents, "agent_end") === 1, "Session trace must contain one agent_end.");
requireValue(count(sessionEvents, "agent_settled") === 1, "Session trace must contain one agent_settled.");
requireValue(count(extensionEvents, "session_shutdown") === 1, "Extension trace must contain one session_shutdown.");
requireValue(sessionEvents.at(-2)?.type === "agent_end" && sessionEvents.at(-2)?.willRetry === false, "Final public agent_end must have willRetry=false.");
requireValue(sessionEvents.at(-1)?.type === "agent_settled", "Public trace must end at agent_settled.");
const extensionAgentEnd = extensionEvents.find((event) => event.type === "agent_end");
requireValue(extensionAgentEnd && !("willRetry" in extensionAgentEnd), "Extension agent_end must not invent willRetry.");
requireValue(count(extensionEvents, "queue_update") === 0, "Extension trace must not expose public queue_update events.");
requireValue(
  sessionEvents.every((event) => !event.type.startsWith("tool_execution_")),
  "Follow-up scenario must not execute tools.",
);
requireValue(
  extensionEvents.every((event) => event.type !== "tool_call" && event.type !== "tool_result"),
  "Follow-up Extension trace must not contain Tool events.",
);
requireValue(
  sessionEvents.every((event) => !event.type.startsWith("auto_retry_")) &&
    extensionEvents.every((event) => !event.type.startsWith("auto_retry_")),
  "Follow-up scenario must not include Retry events.",
);
requireValue(
  JSON.stringify(capture?.lifecycleNotes) ===
    JSON.stringify([
      { type: "shutdown-host-boundary", mechanism: "session.extensionRunner.emit", reason: "exit" },
    ]),
  "Follow-up lifecycle notes differ from the verified host shutdown boundary.",
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
requireValue(result.contractFingerprint === EXPECTED_OUTER_FINGERPRINT, "Outer follow-up contract fingerprint drifted.");
requireValue(capture.contractFingerprint === EXPECTED_CAPTURE_FINGERPRINT, "Nested follow-up contract fingerprint drifted.");

for (const [name, document, tokens] of [
  [
    "follow-up lifecycle document",
    followUpDocument,
    [
      "runtime-verified",
      "一个 public agent_start",
      "两个 Turn",
      "queue_update(followUp=[])",
      "session.prompt()",
      "显式注册 `queue_update` Listener",
      EXPECTED_OUTER_FINGERPRINT,
      EXPECTED_CAPTURE_FINGERPRINT,
    ],
  ],
  [
    "Pi spike report",
    spikeReport,
    [
      "source-and-runtime-verified-follow-up-queue",
      "pi-lifecycle-follow-up-queue.json",
      "follow-up-queue-lifecycle.md",
      "一个公共 Agent Run内追加第二个 Turn",
      "队列清空不等于 Prompt结束",
      "Extension不接收 `queue_update`",
      "`session.prompt()`覆盖排入的 Follow-up",
      EXPECTED_OUTER_FINGERPRINT,
    ],
  ],
  [
    "Pi integration architecture",
    architecture,
    [
      "source-and-runtime-verified-follow-up-queue",
      "一个 Prompt可包含多个 Agent Run",
      "一个 Agent Run也可能包含多个 Turn",
      "显式注册 `queue_update` Listener",
      "队列为空不等于 Prompt完成",
      "不能把 Follow-up固定映射成新 Agent Run",
    ],
  ],
  [
    "project state",
    projectState,
    [
      "Follow-up队列 Fixture",
      "一个公共 Agent Run包含两个 Turn",
      "Extension没有 `queue_update`",
      "初始 `session.prompt()`会等到 Follow-up完成",
      "用户取消、`abortRetry()`和 retry exhaustion",
    ],
  ],
]) {
  for (const token of tokens) {
    requireValue(document.includes(token), `${name} is missing token: ${token}`);
  }
}

if (violations.length > 0) {
  console.error("Pi follow-up lifecycle result violations:\n" + violations.map((item) => `- ${item}`).join("\n"));
  process.exit(1);
}

console.log(`Pi follow-up lifecycle runtime result: OK (${result.contractFingerprint})`);
