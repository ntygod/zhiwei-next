import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const inputPath = resolve(
  process.argv[2] ??
    process.env.PI_SDK_RPC_PARITY_OUTPUT ??
    "packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity.json",
);
const violations = [];
const PROMPT = "Return the deterministic Pi SDK and RPC parity response.";
const RESPONSE = "Pi SDK and RPC parity complete.";

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
      events[index]?.sequence === index + 1,
      `${label} sequence is not contiguous at index ${index}.`,
    );
  }
}

function deepContainsString(value, expected) {
  if (typeof value === "string") return value.includes(expected);
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some((item) => deepContainsString(item, expected));
  return Object.values(value).some((item) => deepContainsString(item, expected));
}

const result = JSON.parse(await readFile(inputPath, "utf8"));
requireValue(result.schemaVersion === 1, "SDK/RPC parity outer schemaVersion must be 1.");
requireValue(result.status === "passed", `SDK/RPC parity outer status must be passed, got ${result.status}.`);
requireValue(result.scenario === "sdk-rpc-parity", "SDK/RPC parity outer scenario is incorrect.");
requireValue(
  result.upstream?.repository === "earendil-works/pi" &&
    result.upstream?.releaseTag === "v0.84.1" &&
    result.upstream?.commit === "53fa77ccd8a279eb87e92294ef3687b03ff80112",
  "SDK/RPC parity upstream baseline is incorrect.",
);
requireValue(
  result.artifact?.name === "@earendil-works/pi-coding-agent" &&
    result.artifact?.version === "0.84.1",
  "SDK/RPC parity Artifact identity is incorrect.",
);
requireValue(
  result.artifact?.integrity ===
    "sha512-ncAqFrG+iybuPGOhMiZoEHkEzTpJgz3guYD32pD+M7ucc0WeHmauP6wa7qwP8V/KWvsZDVNa5XGsdZ7fkC7w7A==",
  "SDK/RPC parity Artifact integrity differs from pinned registry evidence.",
);
requireValue(
  result.artifact?.shasum === "e098cada629fdeeb9df6e77c6d480d43e1b2c553",
  "SDK/RPC parity Artifact shasum differs from pinned registry evidence.",
);
requireValue(result.artifact?.installScriptsExecuted === false, "SDK/RPC parity install scripts must remain disabled.");
requireValue(result.environment?.node === "22.23.1", "SDK/RPC parity Node version must be 22.23.1.");
requireValue(result.environment?.npm === "10.9.8", "SDK/RPC parity npm version must be 10.9.8.");
requireValue(result.environment?.platform === "linux-x64", "SDK/RPC parity platform must be linux-x64.");
requireValue(
  result.environment?.containerImage ===
    "node:22.23.1-bookworm-slim@sha256:6c74791e557ce11fc957704f6d4fe134a7bc8d6f5ca4403205b2966bd488f6b3",
  "SDK/RPC parity container image is not the pinned digest.",
);
requireValue(result.isolation?.hostSecretsPassedToProbe === false, "Host secrets must not reach SDK/RPC parity capture.");
requireValue(result.isolation?.hostWorkspaceMounted === false, "Host checkout must not be mounted into SDK/RPC parity capture.");
requireValue(result.isolation?.sourceBundleReadOnly === true, "SDK/RPC parity source bundle must be read-only.");
requireValue(result.isolation?.containerRootFilesystemReadOnly === true, "SDK/RPC parity container root must be read-only.");
requireValue(result.isolation?.containerCapabilitiesDropped === true, "SDK/RPC parity container capabilities must be dropped.");
requireValue(result.isolation?.containerNoNewPrivileges === true, "SDK/RPC parity container must use no-new-privileges.");

const capture = result.capture;
requireValue(capture?.schemaVersion === 1, "Nested SDK/RPC parity schemaVersion must be 1.");
requireValue(capture?.status === "passed", `Nested SDK/RPC parity status must be passed, got ${capture?.status}.`);
requireValue(capture?.scenario === "sdk-rpc-parity", "Nested SDK/RPC parity scenario is incorrect.");
requireValue(capture?.prompt === PROMPT, "SDK/RPC parity Prompt drifted.");
requireValue(capture?.expectedResponse === RESPONSE, "SDK/RPC parity expected response drifted.");
requireValue(
  capture?.sourceSurface?.sdk === "AgentSession.subscribe" &&
    capture?.sourceSurface?.rpc === "runRpcMode JSONL over child stdin/stdout",
  "SDK/RPC parity source surfaces are not explicit.",
);
requireValue(
  capture?.surface?.rootExportPresence?.createAgentSession === "function" &&
    capture?.surface?.rootExportPresence?.runRpcMode === "function" &&
    capture?.surface?.rootExportPresence?.RpcClient === "function",
  "Pinned Artifact is missing a required SDK/RPC root export.",
);

const sdk = capture?.sdk;
requireValue(sdk?.provider?.id === "zhiwei-sdk-parity-faux", "SDK parity must use its dedicated Faux provider.");
requireValue(sdk?.provider?.callCount === 1, "SDK parity must consume exactly one Faux response.");
requireValue(sdk?.provider?.pendingResponses === 0, "SDK parity must consume its Faux response.");
requireValue(sdk?.provider?.promptsSentToExternalProvider === 0, "SDK parity must not contact an external provider.");
requireValue(sdk?.outcome?.isIdle === true, "SDK Session must be idle after the Prompt.");
requireValue(sdk?.outcome?.pendingMessageCount === 0, "SDK pending message count must be zero.");
requireValue(sdk?.outcome?.finalText === RESPONSE, "SDK final Assistant text is incorrect.");
requireValue(
  JSON.stringify(sdk?.outcome?.messages?.map((message) => message.role)) ===
    JSON.stringify(["user", "assistant"]),
  "SDK final message roles must be user → assistant.",
);
requireValue(sdk?.outcome?.messages?.[1]?.text === RESPONSE, "SDK final message does not contain the parity response.");
const sdkEvents = sdk?.events ?? [];
const sdkExtensionEvents = sdk?.extensionEvents ?? [];
checkContiguousSequence(sdkEvents, "SDK Public events");
checkContiguousSequence(sdkExtensionEvents, "SDK Extension events");
requireValue(count(sdkEvents, "agent_start") === 1, "SDK must emit one agent_start.");
requireValue(count(sdkEvents, "agent_end") === 1, "SDK must emit one agent_end.");
requireValue(count(sdkEvents, "agent_settled") === 1, "SDK must emit one agent_settled.");
requireValue(sdkEvents.at(-2)?.type === "agent_end", "SDK penultimate Public event must be agent_end.");
requireValue(sdkEvents.at(-2)?.willRetry === false, "SDK final agent_end must have willRetry=false.");
requireValue(sdkEvents.at(-1)?.type === "agent_settled", "SDK Public trace must end at agent_settled.");
requireValue(count(sdkExtensionEvents, "session_shutdown") === 1, "SDK Extension trace must contain one host shutdown.");

const rpc = capture?.rpc;
requireValue(rpc?.surface?.runRpcModeType === "function", "RPC runRpcMode runtime surface is unavailable.");
requireValue(rpc?.surface?.rpcClientType === "function", "RPC RpcClient runtime surface is unavailable.");
requireValue(Array.isArray(rpc?.surface?.rpcClientPrototypeMethods), "RPC Client method surface is missing.");
requireValue(
  JSON.stringify(rpc?.commands?.map((command) => command.type)) ===
    JSON.stringify(["get_state", "get_messages", "prompt", "get_state", "get_messages"]),
  "RPC command sequence must be state/messages/prompt/state/messages.",
);
requireValue(rpc?.exit?.code === 0 && rpc?.exit?.signal === null, "RPC child must exit cleanly after stdin EOF.");
requireValue(Array.isArray(rpc?.parseErrors) && rpc.parseErrors.length === 0, "RPC stdout must be valid LF-only JSONL.");
requireValue(Array.isArray(rpc?.stderrLines) && rpc.stderrLines.length === 0, "RPC child emitted unexpected stderr.");
requireValue(rpc?.metrics?.provider?.id === "zhiwei-rpc-parity-faux", "RPC parity must use its dedicated Faux provider.");
requireValue(rpc?.metrics?.provider?.callCount === 1, "RPC parity must consume exactly one Faux response.");
requireValue(rpc?.metrics?.provider?.pendingResponses === 0, "RPC parity must consume its Faux response.");
requireValue(rpc?.metrics?.provider?.promptsSentToExternalProvider === 0, "RPC parity must not contact an external provider.");
requireValue(rpc?.metrics?.outcome?.isIdle === true, "RPC Session must be idle after the Prompt.");
requireValue(rpc?.metrics?.outcome?.pendingMessageCount === 0, "RPC pending message count must be zero.");
requireValue(rpc?.metrics?.outcome?.finalText === RESPONSE, "RPC final Assistant text is incorrect.");
requireValue(
  JSON.stringify(rpc?.metrics?.outcome?.messages?.map((message) => message.role)) ===
    JSON.stringify(["user", "assistant"]),
  "RPC final message roles must be user → assistant.",
);
requireValue(rpc?.metrics?.outcome?.messages?.[1]?.text === RESPONSE, "RPC final message does not contain the parity response.");
requireValue(rpc?.counts?.promptResponses === 1, "RPC Prompt must have exactly one ID-correlated response.");
requireValue(rpc?.counts?.agentEnds === 1, "RPC records must expose one agent_end.");
requireValue(rpc?.ordering?.promptResponseBeforeAgentEnd === true, "RPC Prompt response must precede agent_end.");
requireValue(rpc?.responseTextObserved === true, "RPC records must expose the deterministic Assistant response.");
requireValue(deepContainsString(rpc?.records, RESPONSE), "RPC records are missing the deterministic response text.");
requireValue(
  rpc?.records?.every((record, index) => record.sequence === index + 1),
  "RPC record sequence must be contiguous.",
);

for (const [field, expected] of Object.entries({
  absolutePathsIncluded: false,
  rawSessionIdIncluded: false,
  environmentDumpIncluded: false,
  credentialsIncluded: false,
  rawChainOfThoughtIncluded: false,
  timestampsNormalized: true,
})) {
  requireValue(capture?.sanitization?.[field] === expected, `SDK/RPC parity sanitization.${field} must be ${expected}.`);
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
  requireValue(!pattern.test(serialized), `SDK/RPC parity result contains forbidden pattern: ${pattern}`);
}
requireValue(!serialized.includes('"sessionId"'), "SDK/RPC parity result must not contain a raw sessionId field.");
requireValue(result.contractFingerprint === fingerprint(result), "Outer SDK/RPC parity contract fingerprint is invalid.");
requireValue(capture.contractFingerprint === fingerprint(capture), "Nested SDK/RPC parity contract fingerprint is invalid.");

if (violations.length > 0) {
  console.error(
    "Pi SDK/RPC parity result violations:\n" + violations.map((item) => `- ${item}`).join("\n"),
  );
  process.exit(1);
}

console.log(`Pi SDK/RPC parity runtime result: OK (${result.contractFingerprint})`);
