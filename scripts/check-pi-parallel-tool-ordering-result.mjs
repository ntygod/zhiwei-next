import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const DEFAULT_FIXTURE = "packages/pi-adapter/fixtures/pi-lifecycle-parallel-tool-ordering.json";
const explicitInput = process.argv[2] ?? process.env.PI_PARALLEL_TOOL_ORDERING_OUTPUT;
const inputPath = resolve(explicitInput ?? DEFAULT_FIXTURE);
const violations = [];
const EXPECTED_DECLARATION_ORDER = [
  "zhiwei-parallel-tool-alpha",
  "zhiwei-parallel-tool-beta",
  "zhiwei-parallel-tool-gamma",
];
const EXPECTED_COMPLETION_ORDER = [
  "zhiwei-parallel-tool-beta",
  "zhiwei-parallel-tool-gamma",
  "zhiwei-parallel-tool-alpha",
];
const EXPECTED_IDS_SORTED = [...EXPECTED_DECLARATION_ORDER].sort();

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

function eventIds(events, type, field = "toolCallId") {
  return (events ?? []).filter((event) => event.type === type).map((event) => event[field]);
}

function sameExpectedIdSet(ids) {
  return (
    Array.isArray(ids) &&
    ids.length === EXPECTED_DECLARATION_ORDER.length &&
    new Set(ids).size === EXPECTED_DECLARATION_ORDER.length &&
    JSON.stringify([...ids].sort()) === JSON.stringify(EXPECTED_IDS_SORTED)
  );
}

function checkContiguousSequence(events, label) {
  for (let index = 0; index < (events ?? []).length; index += 1) {
    requireValue(events[index]?.sequence === index + 1, `${label} sequence is not contiguous at index ${index}.`);
  }
}

const [packageText, ci, captureSource] = await Promise.all([
  readFile("package.json", "utf8"),
  readFile(".github/workflows/pi-parallel-tool-ordering.yml", "utf8"),
  readFile("scripts/probes/pi-parallel-tool-ordering-capture.mjs", "utf8"),
]);
const packageJson = JSON.parse(packageText);

requireValue(
  packageJson.scripts?.["check:pi-parallel-tool-ordering"] ===
    "node scripts/check-pi-parallel-tool-ordering-result.mjs",
  "package.json must expose the exact check:pi-parallel-tool-ordering command.",
);
requireValue(
  packageJson.scripts?.check?.includes("npm run check:pi-parallel-tool-ordering"),
  "package.json scripts.check must execute check:pi-parallel-tool-ordering.",
);
requireValue(
  packageJson.scripts?.["probe:pi:parallel-tool-ordering"] ===
    "PI_LIFECYCLE_SCENARIO=parallel-tool-ordering PI_LIFECYCLE_CAPTURE_SCRIPT=scripts/probes/pi-parallel-tool-ordering-capture.mjs node scripts/probes/pi-lifecycle-ci.mjs",
  "package.json must expose the exact probe:pi:parallel-tool-ordering command.",
);

for (const required of [
  "name: Pi parallel Tool ordering contract",
  "probe:",
  "name: Pi parallel Tool ordering lifecycle probe",
  DEFAULT_FIXTURE,
  "scripts/check-pi-parallel-tool-ordering-result.mjs",
  "scripts/probes/pi-parallel-tool-ordering-capture.mjs",
  "PI_LIFECYCLE_SCENARIO=parallel-tool-ordering",
  "PI_LIFECYCLE_COMMITTED_FIXTURE=/probe/packages/pi-adapter/fixtures/pi-lifecycle-parallel-tool-ordering.json",
  "--network=bridge",
  "--read-only",
  "--user=1000:1000",
  "--cap-drop=ALL",
  "--security-opt=no-new-privileges",
  "persist-credentials: false",
]) {
  requireValue(ci.includes(required), `CI must preserve the parallel Tool ordering contract fragment: ${required}`);
}

for (const required of [
  'const SCENARIO = "parallel-tool-ordering";',
  'const DEADLOCK_GUARD_MS = 5_000;',
  '"zhiwei-parallel-tool-beta",\n  "zhiwei-parallel-tool-gamma",\n  "zhiwei-parallel-tool-alpha"',
  'recordBarrier("all-tools-started"',
  'if (event.type === "tool_execution_end") observePublicToolEnd(event);',
  "await waitForRelease(toolCallId, signal);",
  "allExecutionsStartedBeforeFirstCompletion",
]) {
  requireValue(captureSource.includes(required), `Capture must preserve the deterministic Barrier fragment: ${required}`);
}

if (!existsSync(inputPath)) {
  requireValue(
    explicitInput === undefined && inputPath === resolve(DEFAULT_FIXTURE),
    `Requested parallel Tool ordering result does not exist: ${inputPath}`,
  );
  if (violations.length > 0) {
    console.error(`Pi parallel Tool ordering contract violations:\n- ${violations.join("\n- ")}`);
    process.exit(1);
  }
  console.log("Pi parallel Tool ordering static contract passed; committed Runtime Fixture is pending Draft capture.");
  process.exit(0);
}

const resultText = await readFile(inputPath, "utf8");
const result = JSON.parse(resultText);

requireValue(result.schemaVersion === 1, "Parallel Tool ordering schemaVersion must be 1.");
requireValue(result.status === "passed", `Parallel Tool ordering status must be passed, got ${result.status}.`);
requireValue(result.scenario === "parallel-tool-ordering", "Scenario must be parallel-tool-ordering.");
requireValue(
  result.upstream?.repository === "earendil-works/pi" &&
    result.upstream?.releaseTag === "v0.84.1" &&
    result.upstream?.commit === "53fa77ccd8a279eb87e92294ef3687b03ff80112",
  "Parallel Tool ordering upstream baseline is incorrect.",
);
requireValue(
  result.artifact?.name === "@earendil-works/pi-coding-agent" && result.artifact?.version === "0.84.1",
  "Parallel Tool ordering Artifact identity is incorrect.",
);
requireValue(
  result.artifact?.integrity ===
    "sha512-ncAqFrG+iybuPGOhMiZoEHkEzTpJgz3guYD32pD+M7ucc0WeHmauP6wa7qwP8V/KWvsZDVNa5XGsdZ7fkC7w7A==",
  "Parallel Tool ordering Artifact integrity differs from pinned registry evidence.",
);
requireValue(
  result.artifact?.shasum === "e098cada629fdeeb9df6e77c6d480d43e1b2c553",
  "Parallel Tool ordering Artifact shasum differs from pinned registry evidence.",
);
requireValue(result.artifact?.installScriptsExecuted === false, "Parallel Tool ordering install scripts must remain disabled.");
requireValue(result.environment?.node === "22.23.1", "Parallel Tool ordering Node version must be 22.23.1.");
requireValue(result.environment?.npm === "10.9.8", "Parallel Tool ordering npm version must be 10.9.8.");
requireValue(result.environment?.platform === "linux-x64", "Parallel Tool ordering platform must be linux-x64.");
requireValue(
  result.environment?.containerImage ===
    "node:22.23.1-bookworm-slim@sha256:6c74791e557ce11fc957704f6d4fe134a7bc8d6f5ca4403205b2966bd488f6b3",
  "Parallel Tool ordering container image is not the pinned digest.",
);
requireValue(result.isolation?.hostSecretsPassedToProbe === false, "Host secrets must not reach parallel Tool capture.");
requireValue(result.isolation?.hostWorkspaceMounted === false, "Host checkout must not be mounted into parallel Tool capture.");
requireValue(result.isolation?.sourceBundleReadOnly === true, "Parallel Tool source bundle must be read-only.");
requireValue(result.isolation?.containerRootFilesystemReadOnly === true, "Parallel Tool root filesystem must be read-only.");
requireValue(result.isolation?.containerCapabilitiesDropped === true, "Parallel Tool container capabilities must be dropped.");
requireValue(result.isolation?.containerNoNewPrivileges === true, "Parallel Tool container must use no-new-privileges.");
requireValue(result.contractFingerprint === fingerprint(result), "Outer parallel Tool ordering fingerprint is invalid.");

const capture = result.capture;
requireValue(capture?.schemaVersion === 1, "Nested parallel Tool ordering schemaVersion must be 1.");
requireValue(capture?.status === "passed", `Nested parallel Tool ordering status must be passed, got ${capture?.status}.`);
requireValue(capture?.scenario === "parallel-tool-ordering", "Nested scenario must be parallel-tool-ordering.");
requireValue(
  capture?.package?.name === "@earendil-works/pi-coding-agent" && capture?.package?.version === "0.84.1",
  "Nested parallel Tool package identity is incorrect.",
);
requireValue(capture?.contractFingerprint === fingerprint(capture), "Nested parallel Tool ordering fingerprint is invalid.");
requireExact(
  capture?.provider,
  {
    id: "zhiwei-parallel-tool-faux",
    api: "zhiwei-parallel-tool-faux-api",
    callCount: 2,
    pendingResponses: 0,
    promptsSentToExternalProvider: 0,
  },
  "Parallel Tool Faux provider evidence drifted.",
);
requireExact(
  capture?.prompt,
  {
    source: "interactive",
    text: "Call ordered_echo for alpha, beta, and gamma in that order in one assistant response, then finish.",
  },
  "Parallel Tool prompt contract drifted.",
);
requireValue(capture?.toolBatch?.toolName === "ordered_echo", "Parallel Tool name must be ordered_echo.");
requireExact(
  capture?.toolBatch?.calls,
  [
    { lane: "alpha", toolCallId: "zhiwei-parallel-tool-alpha" },
    { lane: "beta", toolCallId: "zhiwei-parallel-tool-beta" },
    { lane: "gamma", toolCallId: "zhiwei-parallel-tool-gamma" },
  ],
  "Parallel Tool call declarations drifted.",
);
requireExact(capture?.toolBatch?.declarationOrder, EXPECTED_DECLARATION_ORDER, "Tool declaration order drifted.");
requireExact(capture?.toolBatch?.plannedCompletionOrder, EXPECTED_COMPLETION_ORDER, "Planned completion order drifted.");
requireValue(capture?.toolBatch?.deadlockGuardMs === 5_000, "Deadlock guard must remain 5000ms and must not drive success ordering.");
requireValue(capture?.toolBatch?.barrierFailure === null, "Parallel Tool Barrier reported a failure.");
requireValue(capture?.toolBatch?.activeBeforePrompt?.includes("ordered_echo"), "ordered_echo was not active before Prompt.");
requireValue(capture?.toolBatch?.activeAfterPrompt?.includes("ordered_echo"), "ordered_echo was not active after Prompt.");

const executions = capture?.toolBatch?.executions ?? [];
checkContiguousSequence(executions, "Tool execution");
requireExact(
  executions.filter((event) => event.phase === "start").map((event) => event.toolCallId),
  EXPECTED_DECLARATION_ORDER,
  "Tool execute() calls must all start in declaration order.",
);
requireExact(
  executions.filter((event) => event.phase === "end").map((event) => event.toolCallId),
  EXPECTED_COMPLETION_ORDER,
  "Tool execute() completion order must follow the explicit Barrier.",
);

const ordering = capture?.ordering ?? {};
requireExact(ordering.declarationOrder, EXPECTED_DECLARATION_ORDER, "Captured declaration order drifted.");
requireExact(ordering.plannedCompletionOrder, EXPECTED_COMPLETION_ORDER, "Captured completion plan drifted.");
requireExact(ordering.executeStartOrder, EXPECTED_DECLARATION_ORDER, "Captured execute start order drifted.");
requireExact(ordering.executeEndOrder, EXPECTED_COMPLETION_ORDER, "Captured execute end order drifted.");
requireExact(ordering.publicStartOrder, EXPECTED_DECLARATION_ORDER, "Public Tool start order drifted.");
requireExact(ordering.publicEndOrder, EXPECTED_COMPLETION_ORDER, "Public Tool end order must follow real completion.");
requireValue(ordering.allExecutionsStartedBeforeFirstCompletion === true, "All Tools must start before the first completion.");
requireValue(ordering.completionOrderDiffersFromDeclaration === true, "Completion order must intentionally differ from declaration order.");
requireValue(ordering.agentEndBeforeSettled === true, "agent_end must precede agent_settled.");
requireValue(ordering.settledBeforeShutdown === true, "agent_settled must precede session_shutdown.");
for (const [name, ids] of Object.entries(capture?.correlations?.observedOrders ?? {})) {
  requireValue(sameExpectedIdSet(ids), `${name} must contain each expected Tool Call ID exactly once.`);
}
requireValue(
  capture?.correlations?.everyObservedOrderUsesEachExpectedIdExactlyOnce === true,
  "Every captured Tool surface must preserve all three unique Tool Call IDs.",
);

requireValue(capture?.outcome?.finalText === "Parallel tool ordering capture complete.", "Final Assistant text drifted.");
requireValue(capture?.outcome?.expectedFinalText === "Parallel tool ordering capture complete.", "Expected final text drifted.");
requireValue(capture?.outcome?.sessionWasIdleBeforeShutdown === true, "Session must be idle before shutdown.");
requireValue(capture?.outcome?.pendingMessageCountBeforeShutdown === 0, "Pending message count must be zero before shutdown.");
requireExact(
  capture?.outcome?.messageRoles,
  ["user", "assistant", "toolResult", "toolResult", "toolResult", "assistant"],
  "Final Session role sequence must retain all three Tool Result messages.",
);
requireValue(
  sameExpectedIdSet(capture?.outcome?.finalMessages?.filter((message) => message.role === "toolResult").map((message) => message.toolCallId)),
  "Final Session messages must retain one Tool Result for every Tool Call ID.",
);

requireValue(capture?.counts?.sessionToolStarts === 3, "Expected three Public Tool starts.");
requireValue(capture?.counts?.sessionToolUpdates === 3, "Expected three Public Tool updates.");
requireValue(capture?.counts?.sessionToolEnds === 3, "Expected three Public Tool ends.");
requireValue(capture?.counts?.extensionToolCalls === 3, "Expected three Extension tool_call events.");
requireValue(capture?.counts?.extensionToolResults === 3, "Expected three Extension tool_result events.");
requireValue(capture?.counts?.extensionAgentEnds === 1, "Expected one Extension agent_end.");
requireValue(capture?.counts?.extensionAgentSettled === 1, "Expected one Extension agent_settled.");
requireValue(capture?.counts?.extensionSessionShutdowns === 1, "Expected one Extension session_shutdown.");

const sessionEvents = capture?.sessionEvents ?? [];
const extensionEvents = capture?.extensionEvents ?? [];
checkContiguousSequence(sessionEvents, "Public Session event");
checkContiguousSequence(extensionEvents, "Extension event");
requireExact(eventIds(sessionEvents, "tool_execution_start"), EXPECTED_DECLARATION_ORDER, "Public start event IDs drifted.");
requireExact(eventIds(sessionEvents, "tool_execution_end"), EXPECTED_COMPLETION_ORDER, "Public end event IDs drifted.");
requireValue(eventIds(extensionEvents, "tool_call").length === 3, "Extension must expose three tool_call events.");
requireValue(eventIds(extensionEvents, "tool_result").length === 3, "Extension must expose three tool_result events.");
requireValue(
  sessionEvents.filter((event) => event.type === "agent_settled").length === 1,
  "Public Session must emit one agent_settled.",
);
requireValue(
  extensionEvents.filter((event) => event.type === "agent_settled").length === 1,
  "Extension must emit one agent_settled.",
);
requireValue(
  extensionEvents.filter((event) => event.type === "session_shutdown").length === 1,
  "Extension must emit one session_shutdown.",
);
requireExact(
  capture?.lifecycleNotes,
  [{ type: "shutdown-host-boundary", mechanism: "session.extensionRunner.emit", reason: "exit" }],
  "Parallel Tool lifecycle notes must preserve the host shutdown boundary.",
);
requireExact(
  capture?.sanitization,
  {
    absolutePathsIncluded: false,
    rawSessionIdIncluded: false,
    environmentDumpIncluded: false,
    credentialsIncluded: false,
    rawChainOfThoughtIncluded: false,
  },
  "Parallel Tool sanitization contract drifted.",
);

if (violations.length > 0) {
  console.error(`Pi parallel Tool ordering contract violations:\n- ${violations.join("\n- ")}`);
  process.exit(1);
}

console.log(`Pi parallel Tool ordering contract passed: ${result.contractFingerprint}`);
