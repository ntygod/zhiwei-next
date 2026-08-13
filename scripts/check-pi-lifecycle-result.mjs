import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const inputPath = resolve(
  process.argv[2] ??
    process.env.PI_LIFECYCLE_OUTPUT ??
    "packages/pi-adapter/fixtures/pi-lifecycle-normal-tool.json",
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

function eventIndex(events, type) {
  return events.findIndex((event) => event.type === type);
}

function count(events, type) {
  return events.filter((event) => event.type === type).length;
}

function checkContiguousSequence(events, label) {
  for (let index = 0; index < events.length; index += 1) {
    requireValue(events[index].sequence === index + 1, `${label} sequence is not contiguous at index ${index}.`);
  }
}

const [resultText, packageText, ci] = await Promise.all([
  readFile(inputPath, "utf8"),
  readFile("package.json", "utf8"),
  readFile(".github/workflows/ci.yml", "utf8"),
]);
const result = JSON.parse(resultText);
const packageJson = JSON.parse(packageText);

requireValue(
  packageJson.scripts?.["check:pi-lifecycle"] === "node scripts/check-pi-lifecycle-result.mjs",
  "package.json must expose the exact check:pi-lifecycle command.",
);
requireValue(
  packageJson.scripts?.check?.includes("npm run check:pi-lifecycle"),
  "package.json scripts.check must execute check:pi-lifecycle.",
);
requireValue(
  packageJson.scripts?.["probe:pi:lifecycle"] === "node scripts/probes/pi-lifecycle-ci.mjs",
  "package.json must expose the exact probe:pi:lifecycle command.",
);

for (const required of [
  "run_pi_lifecycle_probe:",
  "pi-lifecycle-probe: ${{ steps.probe-gate.outputs.lifecycle-required }}",
  "pi-lifecycle-probe:",
  "name: Pi SDK and Extension lifecycle probe",
  "needs.static-contracts.outputs.pi-lifecycle-probe == 'true'",
  "packages/pi-adapter/fixtures/pi-lifecycle-normal-tool.json",
  "scripts/check-pi-lifecycle-result.mjs",
  "scripts/probes/pi-lifecycle-ci.mjs",
  "scripts/probes/pi-lifecycle-capture.mjs",
  "node scripts/probes/pi-lifecycle-ci.mjs",
  "node scripts/check-pi-lifecycle-result.mjs \"$PI_LIFECYCLE_OUTPUT\"",
  "PI_LIFECYCLE_COMMITTED_FIXTURE=/probe/packages/pi-adapter/fixtures/pi-lifecycle-normal-tool.json",
  "Upload sanitized lifecycle evidence",
  "actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02",
  "if: success()",
]) {
  requireValue(ci.includes(required), `CI workflow is missing lifecycle token: ${required}`);
}
requireValue(!ci.includes("pull_request_target:"), "CI lifecycle capture must not use pull_request_target.");
requireValue(!/\$\{\{\s*secrets\./.test(ci), "CI lifecycle capture must not inject repository secrets.");

const lifecycleJobStart = ci.indexOf("  pi-lifecycle-probe:");
const lifecycleJob = lifecycleJobStart >= 0 ? ci.slice(lifecycleJobStart) : "";
for (const required of [
  "permissions:\n      contents: read",
  "Checkout without persisted credentials",
  "persist-credentials: false",
  "node-version: 22.23.1",
  "node:22.23.1-bookworm-slim@sha256:6c74791e557ce11fc957704f6d4fe134a7bc8d6f5ca4403205b2966bd488f6b3",
  "--read-only",
  "--user=1000:1000",
  "--cap-drop=ALL",
  "--security-opt=no-new-privileges",
  "--mount type=bind,src=\"$BUNDLE\",dst=/probe,readonly",
  "PI_PROBE_SOURCE_READ_ONLY=true",
  "PI_PROBE_HOST_WORKSPACE_MOUNTED=false",
  "PI_PROBE_CONTAINER_ROOT_READ_ONLY=true",
  "PI_PROBE_CAPABILITIES_DROPPED=true",
  "PI_PROBE_NO_NEW_PRIVILEGES=true",
]) {
  requireValue(lifecycleJob.includes(required), `Lifecycle job is missing trust-boundary token: ${required}`);
}
requireValue(
  !lifecycleJob.includes("$GITHUB_WORKSPACE") && !lifecycleJob.includes("src=\"$PWD\""),
  "Lifecycle container must not mount the host repository workspace.",
);

requireValue(result.schemaVersion === 1, "Lifecycle result schemaVersion must be 1.");
requireValue(result.status === "passed", `Lifecycle result status must be passed, got ${result.status}.`);
requireValue(result.scenario === "normal-tool", "Lifecycle scenario must be normal-tool.");
requireValue(
  result.upstream?.repository === "earendil-works/pi" &&
    result.upstream?.releaseTag === "v0.84.1" &&
    result.upstream?.commit === "53fa77ccd8a279eb87e92294ef3687b03ff80112",
  "Lifecycle result upstream baseline is incorrect.",
);
requireValue(result.artifact?.name === "@earendil-works/pi-coding-agent", "Lifecycle Artifact name is incorrect.");
requireValue(result.artifact?.version === "0.84.1", "Lifecycle Artifact version is incorrect.");
requireValue(
  result.artifact?.integrity ===
    "sha512-ncAqFrG+iybuPGOhMiZoEHkEzTpJgz3guYD32pD+M7ucc0WeHmauP6wa7qwP8V/KWvsZDVNa5XGsdZ7fkC7w7A==",
  "Lifecycle Artifact integrity differs from the pinned registry evidence.",
);
requireValue(
  result.artifact?.shasum === "e098cada629fdeeb9df6e77c6d480d43e1b2c553",
  "Lifecycle Artifact shasum differs from the pinned registry evidence.",
);
requireValue(result.artifact?.installScriptsExecuted === false, "Lifecycle installation must not execute scripts.");
requireValue(result.environment?.node === "22.23.1", `Lifecycle Node version must be 22.23.1, got ${result.environment?.node}.`);
requireValue(result.environment?.platform === "linux-x64", "Lifecycle platform must be linux-x64.");
requireValue(
  result.environment?.containerImage ===
    "node:22.23.1-bookworm-slim@sha256:6c74791e557ce11fc957704f6d4fe134a7bc8d6f5ca4403205b2966bd488f6b3",
  "Lifecycle container image is not the pinned digest.",
);
requireValue(result.isolation?.hostSecretsPassedToProbe === false, "Host secrets must not be passed to lifecycle capture.");
requireValue(result.isolation?.hostWorkspaceMounted === false, "Host repository must not be mounted into lifecycle capture.");
requireValue(result.isolation?.sourceBundleReadOnly === true, "Lifecycle source bundle must be read-only.");
requireValue(result.isolation?.containerRootFilesystemReadOnly === true, "Lifecycle container root must be read-only.");
requireValue(result.isolation?.containerCapabilitiesDropped === true, "Lifecycle container capabilities must be dropped.");
requireValue(result.isolation?.containerNoNewPrivileges === true, "Lifecycle container must use no-new-privileges.");

const capture = result.capture;
requireValue(capture?.schemaVersion === 1, "Nested capture schemaVersion must be 1.");
requireValue(capture?.status === "passed", `Nested capture status must be passed, got ${capture?.status}.`);
requireValue(capture?.scenario === "normal-tool", "Nested capture scenario must be normal-tool.");
requireValue(capture?.provider?.id === "zhiwei-faux", "Capture must use the zhiwei-faux provider.");
requireValue(capture?.provider?.api === "zhiwei-faux-api", "Capture Faux API is incorrect.");
requireValue(capture?.provider?.callCount === 2, "Normal tool scenario must consume exactly two Faux responses.");
requireValue(capture?.provider?.pendingResponses === 0, "Normal tool scenario must consume all Faux responses.");
requireValue(capture?.provider?.promptsSentToExternalProvider === 0, "Lifecycle capture must not contact an external provider.");
requireValue(capture?.prompt?.source === "interactive", "Lifecycle prompt source must be interactive.");
requireValue(capture?.tool?.name === "echo", "Lifecycle tool must be echo.");
requireValue(capture?.tool?.expectedToolCallId === "zhiwei-tool-call-1", "Expected toolCallId is incorrect.");
requireValue(capture?.tool?.expectedValue === "lifecycle-input", "Expected tool input is incorrect.");
requireValue(capture?.tool?.activeBeforePrompt?.includes("echo"), "Echo tool must be active before the prompt.");
requireValue(capture?.tool?.activeAfterPrompt?.includes("echo"), "Echo tool must remain active after the prompt.");
requireValue(capture?.outcome?.finalText === "Lifecycle capture complete.", "Final assistant text is incorrect.");
requireValue(capture?.outcome?.sessionWasIdleBeforeShutdown === true, "Session must be idle before shutdown.");
requireValue(
  JSON.stringify(capture?.correlations?.observedToolCallIds) === JSON.stringify(["zhiwei-tool-call-1"]),
  "All lifecycle surfaces must expose one stable toolCallId.",
);
requireValue(capture?.correlations?.allToolSurfacesUseExpectedId === true, "Tool correlation invariant failed.");
requireValue(capture?.ordering?.agentEndBeforeSettled === true, "agent_end must precede agent_settled.");
requireValue(capture?.ordering?.settledBeforeShutdown === true, "agent_settled must precede session_shutdown.");

const sessionEvents = capture?.sessionEvents ?? [];
const extensionEvents = capture?.extensionEvents ?? [];
const toolExecutions = capture?.tool?.executions ?? [];
const lifecycleNotes = capture?.lifecycleNotes ?? [];
checkContiguousSequence(sessionEvents, "Session events");
checkContiguousSequence(extensionEvents, "Extension events");
checkContiguousSequence(toolExecutions, "Tool executions");

requireValue(count(sessionEvents, "tool_execution_start") === 1, "Expected one session tool_execution_start.");
requireValue(count(sessionEvents, "tool_execution_update") >= 1, "Expected at least one session tool_execution_update.");
requireValue(count(sessionEvents, "tool_execution_end") === 1, "Expected one session tool_execution_end.");
requireValue(count(extensionEvents, "tool_call") === 1, "Expected one extension tool_call.");
requireValue(count(extensionEvents, "tool_result") === 1, "Expected one extension tool_result.");
requireValue(count(extensionEvents, "agent_end") === 1, "Expected one extension agent_end.");
requireValue(count(extensionEvents, "agent_settled") === 1, "Expected one extension agent_settled.");
requireValue(count(extensionEvents, "session_shutdown") === 1, "Expected one extension session_shutdown.");
requireValue(
  count(extensionEvents, "session_start") === 0,
  "Pinned SDK createAgentSession normal-tool capture must not expose session_start to the inline extension handler.",
);
requireValue(
  extensionEvents[0]?.type === "input",
  `Pinned SDK inline extension event surface must begin at input, got ${extensionEvents[0]?.type ?? "<empty>"}.`,
);
requireValue(eventIndex(extensionEvents, "agent_start") >= 0, "Extension agent_start was not captured.");
requireValue(eventIndex(extensionEvents, "turn_start") >= 0, "Extension turn_start was not captured.");
requireValue(eventIndex(extensionEvents, "tool_call") < eventIndex(extensionEvents, "tool_result"), "Extension tool_call must precede tool_result.");
requireValue(eventIndex(extensionEvents, "agent_end") < eventIndex(extensionEvents, "agent_settled"), "Extension agent_end must precede agent_settled.");
requireValue(eventIndex(extensionEvents, "agent_settled") < eventIndex(extensionEvents, "session_shutdown"), "Extension agent_settled must precede session_shutdown.");
requireValue(
  lifecycleNotes.some(
    (note) =>
      note.type === "shutdown-host-boundary" &&
      note.mechanism === "session.extensionRunner.emit" &&
      note.reason === "exit",
  ),
  "Lifecycle capture must disclose the explicit host-owned session_shutdown boundary.",
);

requireValue(toolExecutions.length === 2, "Echo execution trace must contain start and end records.");
requireValue(toolExecutions[0]?.phase === "start" && toolExecutions[1]?.phase === "end", "Echo execution phases are incorrect.");
requireValue(toolExecutions.every((event) => event.toolCallId === "zhiwei-tool-call-1"), "Echo execution toolCallId drifted.");
requireValue(toolExecutions.every((event) => event.value === "lifecycle-input"), "Echo execution value drifted.");

for (const [field, expected] of Object.entries({
  absolutePathsIncluded: false,
  rawSessionIdIncluded: false,
  environmentDumpIncluded: false,
  credentialsIncluded: false,
  rawChainOfThoughtIncluded: false,
})) {
  requireValue(capture?.sanitization?.[field] === expected, `Capture sanitization.${field} must be ${expected}.`);
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
  requireValue(!pattern.test(serialized), `Lifecycle result contains forbidden pattern: ${pattern}`);
}
requireValue(!serialized.includes('"sessionId"'), "Lifecycle result must not contain a raw sessionId field.");
requireValue(result.contractFingerprint === fingerprint(result), "Outer lifecycle contract fingerprint is invalid.");
requireValue(capture.contractFingerprint === fingerprint(capture), "Nested lifecycle contract fingerprint is invalid.");

if (violations.length > 0) {
  console.error("Pi lifecycle result violations:\n" + violations.map((item) => `- ${item}`).join("\n"));
  process.exit(1);
}

console.log(`Pi lifecycle runtime result: OK (${result.contractFingerprint})`);
