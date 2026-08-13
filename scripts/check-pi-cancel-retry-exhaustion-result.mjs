import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const inputPath = resolve(
  process.argv[2] ??
    process.env.PI_CANCEL_RETRY_EXHAUSTION_OUTPUT ??
    "packages/pi-adapter/fixtures/pi-lifecycle-cancel-retry-exhaustion.json",
);
const violations = [];

const EXPECTED_OUTER_FINGERPRINT = "b866798d18569c78d5c712254c3ecdecd7a3e02c0ef11458e6b97b0863b1f6e0";
const EXPECTED_CAPTURE_FINGERPRINT = "b544631413935d2b3f55f9f9f8bcf15a06944bba682cf48471902e4726f79609";
const RETRYABLE_ERROR = "overloaded_error";
const ACTIVE_PARTIAL_LENGTH = 128;
const ACTIVE_PARTIAL_SHA256 = "2b17e35a5f170b2a63aa9a1ce3ce8ca82c338b034c6dc1ebc7c2fe5326eadade";

const ACTIVE_SESSION_TYPES = [
  "agent_start",
  "turn_start",
  "message_start",
  "message_end",
  "message_start",
  "message_update",
  "message_update",
  "message_end",
  "turn_end",
  "agent_end",
  "agent_settled",
];
const ACTIVE_EXTENSION_TYPES = [
  "input",
  "before_agent_start",
  "agent_start",
  "turn_start",
  "message_start",
  "message_end",
  "message_start",
  "message_update",
  "message_update",
  "message_end",
  "turn_end",
  "agent_end",
  "agent_settled",
  "session_shutdown",
];
const RETRY_ABORT_SESSION_TYPES = [
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
  "auto_retry_end",
  "agent_settled",
];
const RETRY_ABORT_EXTENSION_TYPES = [
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
  "agent_settled",
  "session_shutdown",
];
const EXHAUSTION_SESSION_TYPES = [
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
  "turn_end",
  "agent_end",
  "auto_retry_end",
  "agent_settled",
];
const EXHAUSTION_EXTENSION_TYPES = [
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

function requireValue(condition, message) {
  if (!condition) violations.push(message);
}

function requireExact(actual, expected, message) {
  requireValue(JSON.stringify(actual) === JSON.stringify(expected), message);
}

function fingerprint(result) {
  const clone = structuredClone(result);
  delete clone.contractFingerprint;
  return createHash("sha256").update(JSON.stringify(clone)).digest("hex");
}

function count(events, type) {
  return events.filter((event) => event.type === type).length;
}

function eventTypes(events) {
  return events.map((event) => event.type);
}

function checkContiguousSequence(events, label) {
  for (let index = 0; index < events.length; index += 1) {
    requireValue(
      events[index]?.sequence === index + 1,
      `${label} sequence is not contiguous at index ${index}.`,
    );
  }
}

function checkCommonCase({ caseId, result, expectedCounts, expectedOrdering, sessionTypes, extensionTypes }) {
  requireValue(result?.provider?.promptsSentToExternalProvider === 0, `${caseId} must not contact an external provider.`);
  requireValue(result?.outcome?.prompt?.status === "resolved", `${caseId} prompt must resolve.`);
  requireValue(result?.outcome?.sessionWasIdleBeforeShutdown === true, `${caseId} must be idle before shutdown.`);
  requireValue(result?.outcome?.sessionWasRetryingBeforeShutdown === false, `${caseId} must not be retrying before shutdown.`);
  requireValue(result?.outcome?.pendingMessageCountBeforeShutdown === 0, `${caseId} pending message count must be zero.`);
  requireExact(result?.counts, expectedCounts, `${caseId} event counts differ from the verified capture.`);
  requireExact(result?.ordering, expectedOrdering, `${caseId} ordering differs from the verified capture.`);

  const sessionEvents = result?.sessionEvents ?? [];
  const extensionEvents = result?.extensionEvents ?? [];
  checkContiguousSequence(sessionEvents, `${caseId} Session events`);
  checkContiguousSequence(extensionEvents, `${caseId} Extension events`);
  requireExact(eventTypes(sessionEvents), sessionTypes, `${caseId} public event type sequence drifted.`);
  requireExact(eventTypes(extensionEvents), extensionTypes, `${caseId} Extension event type sequence drifted.`);
  requireValue(count(sessionEvents, "agent_settled") === 1, `${caseId} must emit one public agent_settled.`);
  requireValue(count(extensionEvents, "agent_settled") === 1, `${caseId} must emit one Extension agent_settled.`);
  requireValue(count(extensionEvents, "session_shutdown") === 1, `${caseId} must emit one Extension session_shutdown.`);
  requireValue(sessionEvents.at(-1)?.type === "agent_settled", `${caseId} public trace must end at agent_settled.`);
  requireValue(
    extensionEvents.at(-2)?.type === "agent_settled" && extensionEvents.at(-1)?.type === "session_shutdown",
    `${caseId} Extension trace must settle before host shutdown.`,
  );
  requireValue(
    sessionEvents.every((event) => !event.type.startsWith("tool_execution_")),
    `${caseId} must not execute tools.`,
  );
  requireValue(
    extensionEvents.every((event) => event.type !== "tool_call" && event.type !== "tool_result"),
    `${caseId} Extension trace must not contain Tool events.`,
  );
  requireExact(
    result?.lifecycleNotes,
    [{ type: "shutdown-host-boundary", mechanism: "session.extensionRunner.emit", reason: "exit" }],
    `${caseId} lifecycle notes must preserve the host shutdown boundary.`,
  );
}

const [resultText, packageText, ci, spikeReport, lifecycleDocument, architecture, projectState] =
  await Promise.all([
    readFile(inputPath, "utf8"),
    readFile("package.json", "utf8"),
    readFile(".github/workflows/ci.yml", "utf8"),
    readFile("docs/spikes/pi-runtime-contract/README.md", "utf8"),
    readFile("docs/spikes/pi-runtime-contract/cancel-retry-exhaustion-lifecycle.md", "utf8"),
    readFile("docs/architecture/pi-integration.md", "utf8"),
    readFile("docs/harness/project-state.md", "utf8"),
  ]);
const result = JSON.parse(resultText);
const packageJson = JSON.parse(packageText);

requireValue(
  packageJson.scripts?.["check:pi-cancel-retry-exhaustion"] ===
    "node scripts/check-pi-cancel-retry-exhaustion-result.mjs",
  "package.json must expose the exact check:pi-cancel-retry-exhaustion command.",
);
requireValue(
  packageJson.scripts?.check?.includes("npm run check:pi-cancel-retry-exhaustion"),
  "package.json scripts.check must execute check:pi-cancel-retry-exhaustion.",
);
requireValue(
  packageJson.scripts?.["probe:pi:cancel-retry-exhaustion"] ===
    "PI_LIFECYCLE_SCENARIO=cancel-retry-exhaustion PI_LIFECYCLE_CAPTURE_SCRIPT=scripts/probes/pi-cancel-retry-exhaustion-capture.mjs node scripts/probes/pi-lifecycle-ci.mjs",
  "package.json must expose the exact probe:pi:cancel-retry-exhaustion command.",
);

for (const required of [
  "pi-cancel-retry-exhaustion-probe:",
  "name: Pi cancellation and retry exhaustion lifecycle probe",
  "needs.static-contracts.outputs.pi-lifecycle-probe == 'true'",
  "packages/pi-adapter/fixtures/pi-lifecycle-cancel-retry-exhaustion.json",
  "scripts/check-pi-cancel-retry-exhaustion-result.mjs",
  "scripts/probes/pi-cancel-retry-exhaustion-capture.mjs",
  "PI_LIFECYCLE_SCENARIO=cancel-retry-exhaustion",
  "PI_LIFECYCLE_COMMITTED_FIXTURE=/probe/packages/pi-adapter/fixtures/pi-lifecycle-cancel-retry-exhaustion.json",
  "node scripts/probes/pi-lifecycle-ci.mjs",
  "node scripts/check-pi-cancel-retry-exhaustion-result.mjs \"$PI_CANCEL_RETRY_EXHAUSTION_OUTPUT\"",
  "Upload sanitized cancellation and retry exhaustion evidence",
  "actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02",
  "if: success()",
]) {
  requireValue(ci.includes(required), `CI workflow is missing cancellation/retry token: ${required}`);
}
requireValue(!ci.includes("pull_request_target:"), "CI cancellation/retry capture must not use pull_request_target.");
requireValue(!/\$\{\{\s*secrets\./.test(ci), "CI cancellation/retry capture must not inject repository secrets.");
const jobStart = ci.indexOf("  pi-cancel-retry-exhaustion-probe:");
const job = jobStart >= 0 ? ci.slice(jobStart) : "";
for (const required of [
  "permissions:\n      contents: read",
  "persist-credentials: false",
  "--read-only",
  "--user=1000:1000",
  "--cap-drop=ALL",
  "--security-opt=no-new-privileges",
  "PI_PROBE_HOST_WORKSPACE_MOUNTED=false",
]) {
  requireValue(job.includes(required), `Cancellation/retry job is missing trust-boundary token: ${required}`);
}

requireValue(result.schemaVersion === 1, "Cancellation/retry result schemaVersion must be 1.");
requireValue(result.status === "passed", `Cancellation/retry status must be passed, got ${result.status}.`);
requireValue(result.scenario === "cancel-retry-exhaustion", "Scenario must be cancel-retry-exhaustion.");
requireValue(
  result.upstream?.repository === "earendil-works/pi" &&
    result.upstream?.releaseTag === "v0.84.1" &&
    result.upstream?.commit === "53fa77ccd8a279eb87e92294ef3687b03ff80112",
  "Cancellation/retry upstream baseline is incorrect.",
);
requireValue(
  result.artifact?.name === "@earendil-works/pi-coding-agent" && result.artifact?.version === "0.84.1",
  "Cancellation/retry Artifact identity is incorrect.",
);
requireValue(
  result.artifact?.integrity ===
    "sha512-ncAqFrG+iybuPGOhMiZoEHkEzTpJgz3guYD32pD+M7ucc0WeHmauP6wa7qwP8V/KWvsZDVNa5XGsdZ7fkC7w7A==",
  "Cancellation/retry Artifact integrity differs from pinned registry evidence.",
);
requireValue(
  result.artifact?.shasum === "e098cada629fdeeb9df6e77c6d480d43e1b2c553",
  "Cancellation/retry Artifact shasum differs from pinned registry evidence.",
);
requireValue(result.artifact?.installScriptsExecuted === false, "Cancellation/retry install scripts must remain disabled.");
requireValue(result.environment?.node === "22.23.1", "Cancellation/retry Node version must be 22.23.1.");
requireValue(result.environment?.npm === "10.9.8", "Cancellation/retry npm version must be 10.9.8.");
requireValue(result.environment?.platform === "linux-x64", "Cancellation/retry platform must be linux-x64.");
requireValue(
  result.environment?.containerImage ===
    "node:22.23.1-bookworm-slim@sha256:6c74791e557ce11fc957704f6d4fe134a7bc8d6f5ca4403205b2966bd488f6b3",
  "Cancellation/retry container image is not the pinned digest.",
);
requireValue(result.isolation?.hostSecretsPassedToProbe === false, "Host secrets must not reach cancellation/retry capture.");
requireValue(result.isolation?.hostWorkspaceMounted === false, "Host checkout must not be mounted into cancellation/retry capture.");
requireValue(result.isolation?.sourceBundleReadOnly === true, "Cancellation/retry source bundle must be read-only.");
requireValue(result.isolation?.containerRootFilesystemReadOnly === true, "Cancellation/retry root filesystem must be read-only.");
requireValue(result.isolation?.containerCapabilitiesDropped === true, "Cancellation/retry container capabilities must be dropped.");
requireValue(result.isolation?.containerNoNewPrivileges === true, "Cancellation/retry container must use no-new-privileges.");

const capture = result.capture;
requireValue(capture?.schemaVersion === 1, "Nested cancellation/retry schemaVersion must be 1.");
requireValue(capture?.status === "passed", `Nested cancellation/retry status must be passed, got ${capture?.status}.`);
requireValue(capture?.scenario === "cancel-retry-exhaustion", "Nested scenario must be cancel-retry-exhaustion.");
requireValue(
  capture?.package?.name === "@earendil-works/pi-coding-agent" && capture?.package?.version === "0.84.1",
  "Nested cancellation/retry package identity is incorrect.",
);
requireExact(
  Object.keys(capture?.cases ?? {}),
  ["activeStreamAbort", "retryBackoffAbort", "retryExhaustion"],
  "Cancellation/retry capture must contain the three ordered cases.",
);

const active = capture?.cases?.activeStreamAbort;
checkCommonCase({
  caseId: "active-stream-abort",
  result: active,
  expectedCounts: {
    sessionEvents: 11,
    extensionEvents: 14,
    public: {
      agent_end: 1,
      agent_settled: 1,
      agent_start: 1,
      message_end: 2,
      message_start: 2,
      message_update: 2,
      turn_end: 1,
      turn_start: 1,
    },
    extension: {
      agent_end: 1,
      agent_settled: 1,
      agent_start: 1,
      before_agent_start: 1,
      input: 1,
      message_end: 2,
      message_start: 2,
      message_update: 2,
      session_shutdown: 1,
      turn_end: 1,
      turn_start: 1,
    },
  },
  expectedOrdering: {
    publicFirstAgentEndIndex: 9,
    publicLastAgentEndIndex: 9,
    publicFirstRetryStartIndex: -1,
    publicLastRetryStartIndex: -1,
    publicRetryEndIndex: -1,
    publicSettledIndex: 10,
    extensionSettledIndex: 12,
    extensionShutdownIndex: 13,
  },
  sessionTypes: ACTIVE_SESSION_TYPES,
  extensionTypes: ACTIVE_EXTENSION_TYPES,
});
requireExact(
  active?.prompt,
  {
    source: "interactive",
    text: "Stream a long response so the host can cancel after the first assistant update.",
    responseTextLength: 10240,
    responseTextSha256: "ef6245444e0ce6f9da76bdde762850873c29004674a4498240034516c4fd2563",
  },
  "Active abort prompt contract drifted.",
);
requireExact(
  active?.provider,
  {
    id: "zhiwei-active-abort-faux",
    api: "zhiwei-active-abort-faux-api",
    callCount: 1,
    pendingResponses: 0,
    promptsSentToExternalProvider: 0,
  },
  "Active abort Faux provider evidence drifted.",
);
requireExact(
  active?.actions,
  [
    {
      type: "session.abort",
      triggerEvent: "message_update",
      triggerSequence: 7,
      triggerMessageTextLength: ACTIVE_PARTIAL_LENGTH,
      triggerMessageTextSha256: ACTIVE_PARTIAL_SHA256,
      outcome: { status: "resolved" },
    },
  ],
  "Active abort action differs from the verified partial-stream trigger.",
);
requireExact(
  active?.retry,
  {
    settings: { enabled: true, maxRetries: 3, baseDelayMs: 1 },
    public: { startEvents: [], endEvents: [], agentEndWillRetry: [false] },
    extension: { startEvents: [], endEvents: [], agentEndWillRetry: [null] },
  },
  "Active abort Retry surface drifted.",
);
requireExact(
  active?.outcome,
  {
    prompt: { status: "resolved" },
    abort: { status: "resolved" },
    sessionWasIdleBeforeShutdown: true,
    sessionWasRetryingBeforeShutdown: false,
    pendingMessageCountBeforeShutdown: 0,
    messageRoles: ["user", "assistant"],
    finalMessages: [
      {
        index: 0,
        role: "user",
        contentKinds: ["text"],
        textLength: 79,
        textSha256: "18a8270d0b70640f05182e57cb26dc556481fadfa8243e707cf10b5ac0578b8d",
      },
      {
        index: 1,
        role: "assistant",
        contentKinds: ["text"],
        stopReason: "aborted",
        errorMessage: "Request was aborted",
        textLength: ACTIVE_PARTIAL_LENGTH,
        textSha256: ACTIVE_PARTIAL_SHA256,
      },
    ],
    finalAssistant: {
      stopReason: "aborted",
      errorMessage: "Request was aborted",
      contentKinds: ["text"],
      textLength: ACTIVE_PARTIAL_LENGTH,
      textSha256: ACTIVE_PARTIAL_SHA256,
    },
  },
  "Active abort final Session state differs from the verified capture.",
);
requireValue(
  active?.sessionEvents?.[5]?.type === "message_update" &&
    active.sessionEvents[5]?.messageTextLength === undefined &&
    active?.sessionEvents?.[6]?.messageTextLength === ACTIVE_PARTIAL_LENGTH,
  "Active abort must ignore the initial empty update and trigger on the first text-bearing update.",
);
requireValue(
  active?.sessionEvents?.[7]?.stopReason === "aborted" &&
    active?.sessionEvents?.[8]?.stopReason === "aborted" &&
    active?.sessionEvents?.[9]?.willRetry === false,
  "Active abort must persist partial aborted Message/Turn evidence before agent_end(willRetry=false).",
);
requireValue(
  !Object.hasOwn(active?.extensionEvents?.[11] ?? {}, "willRetry"),
  "Active abort Extension agent_end must not invent public willRetry.",
);

const retryAbort = capture?.cases?.retryBackoffAbort;
checkCommonCase({
  caseId: "retry-backoff-abort",
  result: retryAbort,
  expectedCounts: {
    sessionEvents: 14,
    extensionEvents: 15,
    public: {
      agent_end: 1,
      agent_settled: 1,
      agent_start: 1,
      auto_retry_end: 1,
      auto_retry_start: 1,
      message_end: 2,
      message_start: 2,
      message_update: 3,
      turn_end: 1,
      turn_start: 1,
    },
    extension: {
      agent_end: 1,
      agent_settled: 1,
      agent_start: 1,
      before_agent_start: 1,
      input: 1,
      message_end: 2,
      message_start: 2,
      message_update: 3,
      session_shutdown: 1,
      turn_end: 1,
      turn_start: 1,
    },
  },
  expectedOrdering: {
    publicFirstAgentEndIndex: 10,
    publicLastAgentEndIndex: 10,
    publicFirstRetryStartIndex: 11,
    publicLastRetryStartIndex: 11,
    publicRetryEndIndex: 12,
    publicSettledIndex: 13,
    extensionSettledIndex: 13,
    extensionShutdownIndex: 14,
  },
  sessionTypes: RETRY_ABORT_SESSION_TYPES,
  extensionTypes: RETRY_ABORT_EXTENSION_TYPES,
});
requireExact(
  retryAbort?.prompt,
  {
    source: "interactive",
    text: "Enter automatic retry backoff, then let the host cancel the pending retry.",
    retryableError: RETRYABLE_ERROR,
  },
  "Retry backoff abort prompt contract drifted.",
);
requireExact(
  retryAbort?.provider,
  {
    id: "zhiwei-retry-abort-faux",
    api: "zhiwei-retry-abort-faux-api",
    callCount: 1,
    pendingResponses: 1,
    promptsSentToExternalProvider: 0,
  },
  "Retry backoff abort provider evidence drifted.",
);
requireExact(
  retryAbort?.actions,
  [
    {
      type: "session.abortRetry",
      triggerEvent: "auto_retry_start",
      triggerSequence: 12,
      outcome: "returned",
    },
  ],
  "abortRetry() action differs from the verified backoff cancellation boundary.",
);
requireExact(
  retryAbort?.retry,
  {
    settings: { enabled: true, maxRetries: 3, baseDelayMs: 10000 },
    public: {
      startEvents: [
        {
          sequence: 12,
          type: "auto_retry_start",
          attempt: 1,
          maxAttempts: 3,
          delayMs: 10000,
          errorMessage: RETRYABLE_ERROR,
        },
      ],
      endEvents: [
        {
          sequence: 13,
          type: "auto_retry_end",
          attempt: 1,
          success: false,
          finalError: "Retry cancelled",
        },
      ],
      agentEndWillRetry: [true],
    },
    extension: { startEvents: [], endEvents: [], agentEndWillRetry: [null] },
  },
  "Retry backoff abort public/Extension Retry contract drifted.",
);
requireExact(
  retryAbort?.outcome,
  {
    prompt: { status: "resolved" },
    sessionWasIdleBeforeShutdown: true,
    sessionWasRetryingBeforeShutdown: false,
    pendingMessageCountBeforeShutdown: 0,
    messageRoles: ["user"],
    finalMessages: [
      {
        index: 0,
        role: "user",
        contentKinds: ["text"],
        textLength: 74,
        textSha256: "88711f7c8e5401eb1cca306ff06eb7cf53c9716224eabf7f3abe4ae9026b7efc",
      },
    ],
    finalAssistant: null,
  },
  "Retry backoff abort final Session state differs from the verified capture.",
);
requireValue(
  retryAbort?.sessionEvents?.[10]?.willRetry === true &&
    retryAbort?.sessionEvents?.[11]?.type === "auto_retry_start" &&
    retryAbort?.sessionEvents?.[12]?.finalError === "Retry cancelled" &&
    retryAbort?.sessionEvents?.[13]?.type === "agent_settled",
  "Retry backoff abort must retain willRetry=true, cancel the pending attempt, then settle without a second Run.",
);
requireValue(count(retryAbort?.sessionEvents ?? [], "agent_start") === 1, "Retry backoff abort must not create a second Agent Run.");
requireValue(
  !Object.hasOwn(retryAbort?.extensionEvents?.[12] ?? {}, "willRetry") &&
    count(retryAbort?.extensionEvents ?? [], "auto_retry_start") === 0 &&
    count(retryAbort?.extensionEvents ?? [], "auto_retry_end") === 0,
  "Retry backoff abort Extension trace must preserve the absence of Session-level Retry fields/events.",
);

const exhaustion = capture?.cases?.retryExhaustion;
checkCommonCase({
  caseId: "retry-exhaustion",
  result: exhaustion,
  expectedCounts: {
    sessionEvents: 33,
    extensionEvents: 33,
    public: {
      agent_end: 3,
      agent_settled: 1,
      agent_start: 3,
      auto_retry_end: 1,
      auto_retry_start: 2,
      message_end: 4,
      message_start: 4,
      message_update: 9,
      turn_end: 3,
      turn_start: 3,
    },
    extension: {
      agent_end: 3,
      agent_settled: 1,
      agent_start: 3,
      before_agent_start: 1,
      input: 1,
      message_end: 4,
      message_start: 4,
      message_update: 9,
      session_shutdown: 1,
      turn_end: 3,
      turn_start: 3,
    },
  },
  expectedOrdering: {
    publicFirstAgentEndIndex: 10,
    publicLastAgentEndIndex: 30,
    publicFirstRetryStartIndex: 11,
    publicLastRetryStartIndex: 21,
    publicRetryEndIndex: 31,
    publicSettledIndex: 32,
    extensionSettledIndex: 31,
    extensionShutdownIndex: 32,
  },
  sessionTypes: EXHAUSTION_SESSION_TYPES,
  extensionTypes: EXHAUSTION_EXTENSION_TYPES,
});
requireExact(
  exhaustion?.prompt,
  {
    source: "interactive",
    text: "Exhaust the configured automatic retry budget.",
    retryableError: RETRYABLE_ERROR,
  },
  "Retry exhaustion prompt contract drifted.",
);
requireExact(
  exhaustion?.provider,
  {
    id: "zhiwei-retry-exhaustion-faux",
    api: "zhiwei-retry-exhaustion-faux-api",
    callCount: 3,
    pendingResponses: 1,
    promptsSentToExternalProvider: 0,
  },
  "Retry exhaustion provider evidence drifted.",
);
requireExact(exhaustion?.actions, [], "Retry exhaustion must not use a host cancellation action.");
requireExact(
  exhaustion?.retry,
  {
    settings: { enabled: true, maxRetries: 2, baseDelayMs: 1 },
    public: {
      startEvents: [
        {
          sequence: 12,
          type: "auto_retry_start",
          attempt: 1,
          maxAttempts: 2,
          delayMs: 1,
          errorMessage: RETRYABLE_ERROR,
        },
        {
          sequence: 22,
          type: "auto_retry_start",
          attempt: 2,
          maxAttempts: 2,
          delayMs: 2,
          errorMessage: RETRYABLE_ERROR,
        },
      ],
      endEvents: [
        {
          sequence: 32,
          type: "auto_retry_end",
          attempt: 2,
          success: false,
          finalError: RETRYABLE_ERROR,
        },
      ],
      agentEndWillRetry: [true, true, false],
    },
    extension: { startEvents: [], endEvents: [], agentEndWillRetry: [null, null, null] },
  },
  "Retry exhaustion public/Extension Retry contract drifted.",
);
requireExact(
  exhaustion?.outcome,
  {
    prompt: { status: "resolved" },
    sessionWasIdleBeforeShutdown: true,
    sessionWasRetryingBeforeShutdown: false,
    pendingMessageCountBeforeShutdown: 0,
    messageRoles: ["user", "assistant"],
    finalMessages: [
      {
        index: 0,
        role: "user",
        contentKinds: ["text"],
        textLength: 46,
        textSha256: "483bbe164ad3ab4ca65c8119f87db90e8e36bd91ada2c677601e91fe7d38b142",
      },
      {
        index: 1,
        role: "assistant",
        contentKinds: ["text"],
        stopReason: "error",
        errorMessage: RETRYABLE_ERROR,
      },
    ],
    finalAssistant: {
      stopReason: "error",
      errorMessage: RETRYABLE_ERROR,
      contentKinds: ["text"],
      textLength: 0,
    },
  },
  "Retry exhaustion final Session state differs from the verified capture.",
);
requireExact(
  (exhaustion?.sessionEvents ?? [])
    .filter((event) => event.type === "agent_end")
    .map((event) => event.willRetry),
  [true, true, false],
  "Retry exhaustion public agent_end.willRetry sequence must be [true,true,false].",
);
requireValue(
  exhaustion?.sessionEvents?.[30]?.type === "agent_end" &&
    exhaustion?.sessionEvents?.[30]?.willRetry === false &&
    exhaustion?.sessionEvents?.[31]?.type === "auto_retry_end" &&
    exhaustion?.sessionEvents?.[31]?.success === false &&
    exhaustion?.sessionEvents?.[32]?.type === "agent_settled",
  "Retry exhaustion must terminate with agent_end(willRetry=false), one failed auto_retry_end, then agent_settled.",
);
requireValue(
  count(exhaustion?.extensionEvents ?? [], "auto_retry_start") === 0 &&
    count(exhaustion?.extensionEvents ?? [], "auto_retry_end") === 0 &&
    (exhaustion?.extensionEvents ?? [])
      .filter((event) => event.type === "agent_end")
      .every((event) => !Object.hasOwn(event, "willRetry")),
  "Retry exhaustion Extension trace must not invent Session-level Retry fields/events.",
);

for (const [field, expected] of Object.entries({
  absolutePathsIncluded: false,
  rawSessionIdIncluded: false,
  environmentDumpIncluded: false,
  credentialsIncluded: false,
  rawChainOfThoughtIncluded: false,
  fullActiveResponseIncluded: false,
})) {
  requireValue(capture?.sanitization?.[field] === expected, `Cancellation/retry sanitization.${field} must be ${expected}.`);
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
  requireValue(!pattern.test(serialized), `Cancellation/retry result contains forbidden pattern: ${pattern}`);
}
requireValue(!serialized.includes('"sessionId"'), "Cancellation/retry result must not contain a raw sessionId field.");
requireValue(
  !serialized.includes("cancel-me-".repeat(32)),
  "Cancellation/retry result must not contain the full active streaming response.",
);
requireValue(result.contractFingerprint === fingerprint(result), "Outer cancellation/retry contract fingerprint is invalid.");
requireValue(capture.contractFingerprint === fingerprint(capture), "Nested cancellation/retry contract fingerprint is invalid.");
requireValue(result.contractFingerprint === EXPECTED_OUTER_FINGERPRINT, "Outer cancellation/retry contract fingerprint drifted.");
requireValue(capture.contractFingerprint === EXPECTED_CAPTURE_FINGERPRINT, "Nested cancellation/retry contract fingerprint drifted.");

for (const [name, document, tokens] of [
  [
    "cancellation/retry lifecycle document",
    lifecycleDocument,
    [
      "runtime-verified",
      "stopReason=aborted",
      "Request was aborted",
      "agent_end(willRetry=true)",
      "Retry cancelled",
      "[true, true, false]",
      "session.prompt()",
      EXPECTED_OUTER_FINGERPRINT,
      EXPECTED_CAPTURE_FINGERPRINT,
    ],
  ],
  [
    "Pi spike report",
    spikeReport,
    [
      "source-and-runtime-verified-cancel-retry-exhaustion",
      "pi-lifecycle-cancel-retry-exhaustion.json",
      "cancel-retry-exhaustion-lifecycle.md",
      "部分 Assistant",
      "willRetry=true 但没有后续 Run",
      "最终一次失败的 Assistant",
      EXPECTED_OUTER_FINGERPRINT,
    ],
  ],
  [
    "Pi integration architecture",
    architecture,
    [
      "source-and-runtime-verified-cancel-retry-exhaustion",
      "被取消的部分 Assistant",
      "willRetry=true 不保证后续 Agent Run",
      "Retry exhaustion",
      "Prompt Promise仍正常 resolve",
      "Extension仍不提供 `auto_retry_start/end`",
    ],
  ],
  [
    "project state",
    projectState,
    [
      "取消、abortRetry与 Retry exhaustion Fixture",
      "部分 Assistant消息以 `stopReason=aborted`保留",
      "willRetry=true 但没有后续 Agent Run",
      "Retry exhaustion最终保留最后一次失败 Assistant",
      "并行 Tool ordering Fixture",
      "验证 Compaction与 Session Replacement",
    ],
  ],
]) {
  for (const token of tokens) {
    requireValue(document.includes(token), `${name} is missing token: ${token}`);
  }
}

if (violations.length > 0) {
  console.error(
    "Pi cancellation/retry exhaustion result violations:\n" +
      violations.map((item) => `- ${item}`).join("\n"),
  );
  process.exit(1);
}

console.log(`Pi cancellation/retry exhaustion runtime result: OK (${result.contractFingerprint})`);
