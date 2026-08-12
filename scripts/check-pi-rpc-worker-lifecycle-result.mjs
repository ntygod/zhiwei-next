import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const DEFAULT_FIXTURE = "packages/pi-adapter/fixtures/pi-lifecycle-rpc-worker.json";
const suppliedPath = process.argv[2] ?? process.env.PI_RPC_WORKER_LIFECYCLE_OUTPUT;
const inputPath = resolve(suppliedPath ?? DEFAULT_FIXTURE);

if (!existsSync(inputPath) && suppliedPath === undefined) {
  console.log("Pi RPC Worker lifecycle Fixture: pending first isolated Runtime capture");
  process.exit(0);
}

const violations = [];

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function stableFingerprintValue(result) {
  const clone = structuredClone(result);
  delete clone.contractFingerprint;
  return JSON.stringify(clone);
}

function expect(condition, message) {
  if (!condition) violations.push(message);
}

function equal(actual, expected, message) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    violations.push(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function records(worker) {
  return Array.isArray(worker?.transcript) ? worker.transcript : [];
}

function responses(worker, id, command) {
  return records(worker).filter(
    (record) =>
      record.kind === "response" &&
      record.id === (id ?? null) &&
      (command === undefined || record.command === command),
  );
}

function events(worker, type) {
  return records(worker).filter((record) => record.kind === "event" && record.event?.type === type);
}

function extensionEvents(caseResult, type) {
  return (Array.isArray(caseResult?.extensionEvents) ? caseResult.extensionEvents : []).filter(
    (event) => event.type === type,
  );
}

function messageRoles(messages) {
  return Array.isArray(messages) ? messages.map((message) => message.role) : [];
}

function messageTexts(messages) {
  return Array.isArray(messages) ? messages.map((message) => message.text ?? "") : [];
}

let result;
try {
  result = JSON.parse(await readFile(inputPath, "utf8"));
} catch (error) {
  console.error(`Pi RPC Worker lifecycle result is unreadable: ${error.message}`);
  process.exit(1);
}

expect(result.schemaVersion === 1, "Outer schemaVersion must be 1");
expect(result.status === "passed", "Outer Runtime result must pass");
expect(result.scenario === "rpc-worker-lifecycle", "Outer scenario must be rpc-worker-lifecycle");
expect(
  result.contractFingerprint === sha256(stableFingerprintValue(result)),
  "Outer contractFingerprint does not match canonical content",
);

equal(
  result.upstream,
  {
    repository: "earendil-works/pi",
    releaseTag: "v0.84.1",
    commit: "53fa77ccd8a279eb87e92294ef3687b03ff80112",
  },
  "Pinned upstream identity drifted",
);
expect(result.artifact?.name === "@earendil-works/pi-coding-agent", "Unexpected Pi package name");
expect(result.artifact?.version === "0.84.1", "Unexpected Pi package version");
expect(result.artifact?.installScriptsExecuted === false, "Pi install scripts must stay disabled");
expect(result.environment?.node === "22.23.1", "Runtime Node version must be 22.23.1");
expect(result.environment?.platform === "linux-x64", "Runtime platform must be linux-x64");
expect(
  result.environment?.containerImage ===
    "node:22.23.1-bookworm-slim@sha256:6c74791e557ce11fc957704f6d4fe134a7bc8d6f5ca4403205b2966bd488f6b3",
  "Runtime container image drifted",
);
expect(result.isolation?.hostSecretsPassedToProbe === false, "Host secrets reached the probe");
expect(result.isolation?.hostWorkspaceMounted === false, "Host workspace was mounted into the probe");
expect(result.isolation?.sourceBundleReadOnly === true, "Probe source bundle was not read-only");
expect(result.isolation?.containerRootFilesystemReadOnly === true, "Container rootfs was not read-only");
expect(result.isolation?.containerCapabilitiesDropped === true, "Container capabilities were not dropped");
expect(result.isolation?.containerNoNewPrivileges === true, "Container no-new-privileges was not enabled");

const capture = result.capture;
expect(capture?.schemaVersion === 1, "Capture schemaVersion must be 1");
expect(capture?.status === "passed", "RPC Worker capture must pass");
expect(capture?.scenario === "rpc-worker-lifecycle", "Capture scenario drifted");
expect(
  capture?.contractFingerprint === sha256(stableFingerprintValue(capture)),
  "Capture contractFingerprint does not match canonical content",
);
expect(capture?.package?.name === "@earendil-works/pi-coding-agent", "Capture package name drifted");
expect(capture?.package?.version === "0.84.1", "Capture package version drifted");
expect(
  capture?.package?.executionMode === "node-cli-entry-real-subprocess",
  "Capture did not use a real RPC subprocess",
);
equal(
  capture?.protocol,
  {
    transport: "stdio-jsonl",
    framing: "lf-only",
    unicodeLineSeparatorsInsideJsonString: ["U+2028", "U+2029"],
    promptResponseMeaning: "preflight-acceptance-not-run-completion",
  },
  "RPC protocol contract drifted",
);

for (const [key, expected] of Object.entries({
  hostSecretsPassedToWorker: false,
  realProviderCredentialsUsed: false,
  promptsSentToExternalProvider: 0,
  businessFileWrites: false,
  networkCallsByWorkerProvider: false,
  rawEnvironmentDumpIncluded: false,
})) {
  expect(capture?.security?.[key] === expected, `Security invariant ${key} drifted`);
}
for (const key of [
  "absolutePathsIncluded",
  "rawSessionIdIncluded",
  "rawSessionFileIncluded",
  "processPidIncluded",
  "credentialsIncluded",
  "rawChainOfThoughtIncluded",
]) {
  expect(capture?.sanitization?.[key] === false, `Sanitization invariant ${key} drifted`);
}
expect(
  capture?.sanitization?.stderrLimitedToSanitizedLines === true,
  "stderr sanitization/limit marker drifted",
);
expect(Array.isArray(capture?.aliases?.sessionIds), "Session ID aliases are missing");
expect(Array.isArray(capture?.aliases?.sessionFiles), "Session file aliases are missing");
expect(Array.isArray(capture?.aliases?.extensionRequests), "Extension request aliases are missing");

const normalAndRestart = capture?.cases?.normalAndRestart;
const normal = normalAndRestart?.normalPromptEof;
const restart = normalAndRestart?.restartResumeSigterm;
const preflight = capture?.cases?.preflightRejection;
const providerError = capture?.cases?.acceptedProviderError;

expect(normalAndRestart?.provider?.promptsSentToExternalProvider === 0, "Normal workers used an external Provider");
expect(normal?.worker?.stderr?.present === false, "Normal RPC Worker wrote stderr");
expect(responses(normal?.worker, null, "parse").length === 1, "Malformed JSON must produce one parse response");
expect(responses(normal?.worker, null, "parse")[0]?.success === false, "Malformed JSON parse response must fail");
expect(
  responses(normal?.worker, "normal-unicode-unknown", "unknown").length === 1,
  "Unicode-separator unknown command must produce one correlated response",
);
expect(
  responses(normal?.worker, "normal-unicode-unknown", "unknown")[0]?.success === false,
  "Unknown command response must fail",
);
expect(responses(normal?.worker, "normal-prompt-1", "prompt").length === 1, "Normal Prompt response count drifted");
expect(responses(normal?.worker, "normal-prompt-1", "prompt")[0]?.success === true, "Normal Prompt was not accepted");
expect(events(normal?.worker, "agent_start").length === 1, "Normal Prompt must start one Agent Run");
expect(events(normal?.worker, "agent_settled").length === 1, "Normal Prompt must settle once");
expect(normal?.observations?.responsePrecedesSettled === true, "Prompt acceptance must precede agent_settled");
expect(
  normal?.observations?.framingUnicodeSeparatorsProducedOneResponse === true,
  "LF framing split a JSON string on U+2028/U+2029",
);
equal(messageRoles(normal?.finalMessages), ["user", "assistant"], "Normal final message roles drifted");
equal(
  messageTexts(normal?.finalMessages),
  [normalAndRestart?.prompts?.initial, normalAndRestart?.responses?.initial],
  "Normal final message text drifted",
);
expect(normal?.lastAssistantText === normalAndRestart?.responses?.initial, "Normal last Assistant text drifted");
expect(normal?.finalState?.isStreaming === false, "Normal Worker did not return to idle");
expect(normal?.finalState?.messageCount === 2, "Normal Worker message count drifted");
expect(normal?.exit?.code === 0 && normal?.exit?.signal === null, "stdin EOF must exit normally with code 0");
expect(
  extensionEvents(normal, "session_shutdown").some((event) => event.reason === "quit"),
  "Normal Worker Extension did not observe quit shutdown",
);

expect(restart?.worker?.stderr?.present === false, "Restart RPC Worker wrote stderr");
expect(responses(restart?.worker, "restart-prompt-2", "prompt").length === 1, "Restart Prompt response count drifted");
expect(responses(restart?.worker, "restart-prompt-2", "prompt")[0]?.success === true, "Restart Prompt was not accepted");
expect(events(restart?.worker, "agent_start").length === 1, "Restart Prompt must start one new Agent Run");
expect(events(restart?.worker, "agent_settled").length === 1, "Restart Prompt must settle once");
expect(restart?.observations?.responsePrecedesSettled === true, "Restart Prompt acceptance must precede settling");
equal(messageRoles(restart?.restoredMessages), ["user", "assistant"], "Restart did not restore original messages");
equal(
  messageRoles(restart?.finalMessages),
  ["user", "assistant", "user", "assistant"],
  "Restart final message roles drifted",
);
expect(restart?.lastAssistantText === normalAndRestart?.responses?.resumed, "Restart last Assistant text drifted");
expect(restart?.restoredState?.sessionId === normal?.finalState?.sessionId, "Restart changed Session ID alias");
expect(restart?.restoredState?.sessionFile === normal?.finalState?.sessionFile, "Restart changed Session file alias");
expect(restart?.finalState?.sessionId === normal?.finalState?.sessionId, "Restart final Session ID alias drifted");
expect(restart?.finalState?.sessionFile === normal?.finalState?.sessionFile, "Restart final Session file alias drifted");
expect(restart?.finalState?.isStreaming === false, "Restart Worker did not return to idle");
expect(restart?.finalState?.messageCount === 4, "Restart Worker message count drifted");
expect(restart?.exit?.code === 143 && restart?.exit?.signal === null, "SIGTERM must exit with code 143");
expect(
  extensionEvents(restart, "session_shutdown").some((event) => event.reason === "quit"),
  "Restart Worker Extension did not observe quit shutdown",
);

expect(preflight?.worker?.stderr?.present === false, "Preflight Worker wrote stderr");
expect(preflight?.response?.success === false, "Prompt without a model must fail preflight");
expect(preflight?.agentStartCount === 0, "Preflight rejection started an Agent Run");
expect(events(preflight?.worker, "agent_start").length === 0, "Preflight transcript contains agent_start");
expect(preflight?.beforeState?.isStreaming === false, "Preflight Worker was unexpectedly streaming before Prompt");
expect(preflight?.afterState?.isStreaming === false, "Preflight Worker streamed after rejection");
expect(preflight?.exit?.code === 0 && preflight?.exit?.signal === null, "Preflight Worker EOF exit drifted");

expect(providerError?.provider?.promptsSentToExternalProvider === 0, "Provider-error case used an external Provider");
expect(providerError?.worker?.stderr?.present === false, "Provider-error Worker wrote stderr");
expect(providerError?.observations?.promptResponseCount === 1, "Accepted Provider error emitted multiple Prompt responses");
expect(
  responses(providerError?.worker, "provider-error-prompt", "prompt").length === 1 &&
    responses(providerError?.worker, "provider-error-prompt", "prompt")[0]?.success === true,
  "Provider-error Prompt must have exactly one successful acceptance response",
);
expect(providerError?.observations?.responsePrecedesSettled === true, "Provider-error Prompt response must precede settling");
expect(events(providerError?.worker, "agent_start").length === 1, "Provider-error Prompt must start one Agent Run");
expect(events(providerError?.worker, "agent_end").length === 1, "Provider-error Prompt must end one Agent Run");
expect(events(providerError?.worker, "agent_end")[0]?.event?.willRetry === false, "Provider-error Agent Run must not retry");
expect(events(providerError?.worker, "agent_settled").length === 1, "Provider-error Prompt must settle once");
expect(
  providerError?.finalMessages?.some(
    (message) =>
      message.role === "assistant" &&
      message.stopReason === "error" &&
      message.errorMessage === providerError?.errorMessage,
  ),
  "Provider error was not persisted as an Assistant error message",
);
expect(providerError?.lastAssistantText === "", "Provider-error last Assistant text must be empty");
expect(providerError?.finalState?.isStreaming === false, "Provider-error Worker did not return to idle");
expect(providerError?.exit?.code === 0 && providerError?.exit?.signal === null, "Provider-error Worker EOF exit drifted");
expect(
  extensionEvents(providerError, "session_shutdown").some((event) => event.reason === "quit"),
  "Provider-error Extension did not observe quit shutdown",
);

if (violations.length > 0) {
  console.error("Pi RPC Worker lifecycle runtime result violations:");
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}

console.log(`Pi RPC Worker lifecycle runtime result: OK (${result.contractFingerprint})`);
