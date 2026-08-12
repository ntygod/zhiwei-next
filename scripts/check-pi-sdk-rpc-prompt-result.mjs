import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  SDK_RPC_API_ID,
  SDK_RPC_FINAL_TEXT,
  SDK_RPC_MODEL_ID,
  SDK_RPC_PROMPT_SCENARIO,
  SDK_RPC_PROMPT_SCHEMA_VERSION,
  SDK_RPC_PROMPT_TEXT,
  SDK_RPC_PROVIDER_ID,
} from "./probes/pi-sdk-rpc-prompt-contract.mjs";

const inputPath = resolve(
  process.argv[2] ??
    process.env.PI_SDK_RPC_PROMPT_OUTPUT ??
    "packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-prompt.json",
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

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function count(events, type) {
  return events.filter((event) => event.type === type).length;
}

function contiguous(events, label) {
  for (let index = 0; index < events.length; index += 1) {
    requireValue(events[index]?.sequence === index + 1, `${label} sequence drifted at index ${index}.`);
  }
}

const result = JSON.parse(await readFile(inputPath, "utf8"));
requireValue(result.schemaVersion === 1, "Outer SDK/RPC result schemaVersion must be 1.");
requireValue(result.status === "passed", `Outer SDK/RPC result must be passed, got ${result.status}.`);
requireValue(result.scenario === SDK_RPC_PROMPT_SCENARIO, "Outer SDK/RPC scenario is incorrect.");
requireValue(
  result.upstream?.repository === "earendil-works/pi" &&
    result.upstream?.releaseTag === "v0.84.1" &&
    result.upstream?.commit === "53fa77ccd8a279eb87e92294ef3687b03ff80112",
  "SDK/RPC upstream baseline is incorrect.",
);
requireValue(
  result.artifact?.name === "@earendil-works/pi-coding-agent" && result.artifact?.version === "0.84.1",
  "SDK/RPC Artifact identity is incorrect.",
);
requireValue(
  result.artifact?.integrity ===
    "sha512-ncAqFrG+iybuPGOhMiZoEHkEzTpJgz3guYD32pD+M7ucc0WeHmauP6wa7qwP8V/KWvsZDVNa5XGsdZ7fkC7w7A==",
  "SDK/RPC Artifact integrity differs from the pinned registry evidence.",
);
requireValue(
  result.artifact?.shasum === "e098cada629fdeeb9df6e77c6d480d43e1b2c553",
  "SDK/RPC Artifact shasum differs from the pinned registry evidence.",
);
requireValue(result.artifact?.installScriptsExecuted === false, "SDK/RPC install scripts must remain disabled.");
requireValue(result.environment?.node === "22.23.1", "SDK/RPC Node version must be 22.23.1.");
requireValue(result.environment?.npm === "10.9.8", "SDK/RPC npm version must be 10.9.8.");
requireValue(result.environment?.platform === "linux-x64", "SDK/RPC platform must be linux-x64.");
requireValue(
  result.environment?.containerImage ===
    "node:22.23.1-bookworm-slim@sha256:6c74791e557ce11fc957704f6d4fe134a7bc8d6f5ca4403205b2966bd488f6b3",
  "SDK/RPC container image is not the pinned digest.",
);
requireValue(result.isolation?.hostSecretsPassedToProbe === false, "Host secrets must not reach SDK/RPC capture.");
requireValue(result.isolation?.hostWorkspaceMounted === false, "Host checkout must not be mounted into SDK/RPC capture.");
requireValue(result.isolation?.sourceBundleReadOnly === true, "SDK/RPC source bundle must be read-only.");
requireValue(result.isolation?.containerRootFilesystemReadOnly === true, "SDK/RPC root filesystem must be read-only.");
requireValue(result.isolation?.containerCapabilitiesDropped === true, "SDK/RPC container capabilities must be dropped.");
requireValue(result.isolation?.containerNoNewPrivileges === true, "SDK/RPC container must use no-new-privileges.");

const capture = result.capture;
requireValue(capture?.schemaVersion === SDK_RPC_PROMPT_SCHEMA_VERSION, "Nested SDK/RPC schemaVersion is incorrect.");
requireValue(capture?.status === "passed", `Nested SDK/RPC capture must be passed, got ${capture?.status}.`);
requireValue(capture?.scenario === SDK_RPC_PROMPT_SCENARIO, "Nested SDK/RPC scenario is incorrect.");
requireValue(capture?.contract?.prompt === SDK_RPC_PROMPT_TEXT, "SDK/RPC Prompt drifted.");
requireValue(capture?.contract?.provider === SDK_RPC_PROVIDER_ID, "SDK/RPC provider drifted.");
requireValue(capture?.contract?.api === SDK_RPC_API_ID, "SDK/RPC API drifted.");
requireValue(capture?.contract?.modelId === SDK_RPC_MODEL_ID, "SDK/RPC model drifted.");
requireValue(capture?.contract?.finalText?.length === SDK_RPC_FINAL_TEXT.length, "SDK/RPC final text length drifted.");
requireValue(capture?.contract?.finalText?.sha256 === sha256(SDK_RPC_FINAL_TEXT), "SDK/RPC final text digest drifted.");

const sdk = capture?.cases?.sdk;
requireValue(Boolean(sdk), "SDK case is missing.");
requireValue(sdk?.provider?.id === SDK_RPC_PROVIDER_ID, "SDK did not use the dedicated Faux provider.");
requireValue(sdk?.provider?.callCount === 1, "SDK must consume exactly one Faux response.");
requireValue(sdk?.provider?.pendingResponses === 0, "SDK Faux response must be fully consumed.");
requireValue(sdk?.provider?.promptsSentToExternalProvider === 0, "SDK must not contact an external provider.");
requireValue(sdk?.before?.isStreaming === false && sdk?.before?.isIdle === true, "SDK initial state must be idle.");
requireValue(sdk?.preflight?.length === 1 && sdk.preflight[0]?.success === true, "SDK preflight must succeed once.");
requireValue(sdk?.firstStreamingState?.isStreaming === true, "SDK must expose isStreaming=true during message updates.");
requireValue(sdk?.after?.isStreaming === false && sdk?.after?.isIdle === true, "SDK Prompt must settle at an idle boundary.");
requireValue(sdk?.after?.finalText?.matchesExpected === true, "SDK final text is incorrect.");
requireValue(
  JSON.stringify(sdk?.after?.messages?.map((message) => message.role)) ===
    JSON.stringify(["user", "assistant"]),
  "SDK final message roles must be user → assistant.",
);
contiguous(sdk?.publicEvents ?? [], "SDK Public events");
contiguous(sdk?.extensionEvents ?? [], "SDK Extension events");
requireValue(count(sdk?.publicEvents ?? [], "agent_start") === 1, "SDK Public trace must contain one agent_start.");
requireValue(count(sdk?.publicEvents ?? [], "agent_end") === 1, "SDK Public trace must contain one agent_end.");
requireValue(count(sdk?.publicEvents ?? [], "agent_settled") === 1, "SDK Public trace must contain one agent_settled.");
requireValue(
  sdk?.publicEvents?.find((event) => event.type === "agent_end")?.willRetry === false,
  "SDK Public agent_end must have willRetry=false.",
);
requireValue(
  sdk?.lifecycleNotes?.some(
    (note) => note.type === "shutdown-host-boundary" && note.mechanism === "session.extensionRunner.emit",
  ),
  "SDK case must preserve the host shutdown boundary.",
);

const rpc = capture?.cases?.rpc;
requireValue(Boolean(rpc), "RPC case is missing.");
requireValue(rpc?.commandLine?.mode === "rpc", "RPC mode was not recorded.");
requireValue(rpc?.commandLine?.noSession === true, "RPC Worker must disable Session persistence.");
requireValue(rpc?.commandLine?.noTools === true, "RPC Worker must disable tools.");
requireValue(rpc?.commandLine?.offline === true, "RPC Worker must run offline.");
requireValue(rpc?.commandLine?.explicitExtension === true, "RPC Faux provider Extension must be explicit.");
requireValue(
  rpc?.commandLine?.automaticExtensionDiscoveryDisabled === true,
  "RPC automatic Extension discovery must be disabled.",
);
requireValue(rpc?.responses?.prompt?.success === true, "RPC Prompt response must report success.");
requireValue(rpc?.stateBefore?.isStreaming === false, "RPC initial state must not be streaming.");
requireValue(rpc?.stateDuring?.isStreaming === true, "RPC state after Prompt acceptance must observe streaming.");
requireValue(rpc?.stateAfter?.isStreaming === false, "RPC final state must not be streaming.");
requireValue(rpc?.stateAfter?.pendingMessageCount === 0, "RPC final pendingMessageCount must be zero.");
requireValue(rpc?.lastTextAfter?.matchesExpected === true, "RPC final text is incorrect.");
requireValue(
  JSON.stringify(rpc?.messagesAfter?.map((message) => message.role)) ===
    JSON.stringify(["user", "assistant"]),
  "RPC final message roles must be user → assistant.",
);
contiguous(rpc?.wire ?? [], "RPC wire records");
requireValue(
  rpc?.ordering?.promptResponseBeforeSettled === true,
  "RPC Prompt acceptance response must precede agent_settled.",
);
requireValue(
  rpc?.ordering?.eventCountAfterPromptResponseBeforeSettled > 0,
  "RPC must continue emitting Runtime events after Prompt acceptance.",
);
requireValue(rpc?.wireSemantics?.responseRecordsWithIds === true, "RPC Responses must preserve command IDs.");
requireValue(
  rpc?.wireSemantics?.runtimeEventsWithIds === false,
  "RPC Runtime events must not be conflated with command IDs.",
);
requireValue(
  rpc?.wireSemantics?.messageUpdatesContainPartial === false,
  "RPC message_update must omit cumulative partial snapshots.",
);
requireValue(
  rpc?.worker?.exitCode === 0 && rpc?.worker?.signal === null,
  "RPC Worker must exit 0 after stdin EOF.",
);
requireValue(rpc?.worker?.stdinClosedByHost === true, "RPC Worker shutdown must be initiated by stdin EOF.");
requireValue(
  rpc?.worker?.stdoutRemainderLength === 0,
  "RPC Worker must finish on a complete LF-delimited JSONL record.",
);
requireValue(rpc?.extensionEvidence?.status === "passed", "RPC Extension shutdown evidence must pass.");
requireValue(
  rpc?.extensionEvidence?.shutdown?.reason === "quit",
  "RPC Extension must observe shutdown(reason=quit).",
);
requireValue(
  rpc?.extensionEvidence?.provider?.id === SDK_RPC_PROVIDER_ID,
  "RPC Extension provider identity drifted.",
);
requireValue(
  rpc?.extensionEvidence?.provider?.callCount === 1,
  "RPC Extension Faux provider must consume one response.",
);
requireValue(
  rpc?.extensionEvidence?.provider?.pendingResponses === 0,
  "RPC Extension response must be fully consumed.",
);
requireValue(
  rpc?.extensionEvidence?.provider?.promptsSentToExternalProvider === 0,
  "RPC Extension must not contact an external provider.",
);
contiguous(rpc?.extensionEvidence?.events ?? [], "RPC Extension events");
requireValue(count(rpc?.wire ?? [], "agent_start") === 1, "RPC wire must contain one agent_start.");
requireValue(count(rpc?.wire ?? [], "agent_end") === 1, "RPC wire must contain one agent_end.");
requireValue(count(rpc?.wire ?? [], "agent_settled") === 1, "RPC wire must contain one agent_settled.");
requireValue(
  rpc?.wire?.find((event) => event.type === "agent_end")?.willRetry === false,
  "RPC wire agent_end must have willRetry=false.",
);

requireValue(
  capture?.comparison?.projectionsEqual === true,
  "SDK and RPC semantic event projections must match.",
);
requireValue(capture?.comparison?.finalTextEqual === true, "SDK and RPC final text must match.");
requireValue(
  capture?.comparison?.finalMessageRolesEqual === true,
  "SDK and RPC final message roles must match.",
);
requireValue(
  capture?.comparison?.rpcPromptResponseIsAcceptanceBoundary === true,
  "RPC Prompt response must be modeled as acceptance, not completion.",
);
requireValue(capture?.comparison?.rpcObservedStreamingState === true, "RPC streaming state was not observed.");
requireValue(capture?.comparison?.sdkObservedStreamingState === true, "SDK streaming state was not observed.");
requireValue(
  capture?.comparison?.rpcWireUsesDeltaOnlyUpdates === true,
  "RPC wire did not preserve delta-only update semantics.",
);
requireValue(
  capture?.comparison?.workerShutdownAfterSettled === true,
  "RPC Worker shutdown boundary is incomplete.",
);

for (const [field, expected] of Object.entries({
  absolutePathsIncluded: false,
  rawSessionIdIncluded: false,
  rawSessionFileIncluded: false,
  environmentDumpIncluded: false,
  credentialsIncluded: false,
  rawChainOfThoughtIncluded: false,
  rawStderrIncluded: false,
})) {
  requireValue(capture?.sanitization?.[field] === expected, `SDK/RPC sanitization.${field} must be ${expected}.`);
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
  /\.jsonl(?:(?:"|\\|\/))/i,
]) {
  requireValue(!pattern.test(serialized), `SDK/RPC result contains forbidden pattern: ${pattern}`);
}
requireValue(!serialized.includes('"sessionId"'), "SDK/RPC result must not contain a raw sessionId field.");
requireValue(!serialized.includes('"sessionFile"'), "SDK/RPC result must not contain a raw sessionFile field.");
requireValue(result.contractFingerprint === fingerprint(result), "Outer SDK/RPC contract fingerprint is invalid.");
requireValue(capture.contractFingerprint === fingerprint(capture), "Nested SDK/RPC contract fingerprint is invalid.");

if (violations.length > 0) {
  console.error("Pi SDK/RPC Prompt result violations:\n" + violations.map((item) => `- ${item}`).join("\n"));
  process.exit(1);
}

console.log(`Pi SDK/RPC Prompt runtime result: OK (${result.contractFingerprint})`);
