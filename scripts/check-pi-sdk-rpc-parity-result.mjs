import { createHash } from "node:crypto";
import { lstat, open } from "node:fs/promises";
import { resolve } from "node:path";
import {
  PI_PACKAGE_INTEGRITY,
  PI_PACKAGE_NAME,
  PI_PACKAGE_SHASUM,
  PI_PACKAGE_VERSION,
  PI_RELEASE_COMMIT,
  PI_RELEASE_TAG,
  SDK_RPC_PARITY_API_ID,
  SDK_RPC_PARITY_COMMAND_IDS,
  SDK_RPC_PARITY_EXPECTED_CAPTURE_CONTRACT_FINGERPRINT,
  SDK_RPC_PARITY_EXPECTED_OUTER_CONTRACT_FINGERPRINT,
  SDK_RPC_PARITY_FINAL_TEXT,
  SDK_RPC_PARITY_MODEL_ID,
  SDK_RPC_PARITY_PROMPT,
  SDK_RPC_PARITY_PROVIDER_ID,
  SDK_RPC_PARITY_REQUIRED_RPC_CLIENT_METHODS,
  SDK_RPC_PARITY_SCENARIO,
  SDK_RPC_PARITY_SCHEMA_VERSION,
  SDK_RPC_PARITY_STRUCTURED_SIGNAL_KEYS,
  SDK_RPC_PARITY_SURFACE_FILES,
} from "./probes/pi-sdk-rpc-parity-contract.mjs";
import { SDK_RPC_PARITY_MAX_RESULT_JSON_BYTES } from "./pi-sdk-rpc-parity-fixture.mjs";

const inputPath = resolve(
  process.argv[2] ??
    process.env.PI_SDK_RPC_PARITY_OUTPUT ??
    "packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity.json",
);
const violations = [];

function requireValue(condition, message) {
  if (!condition) violations.push(message);
}

function fingerprint(result) {
  if (!result || typeof result !== "object") return undefined;
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

async function readBoundedRegularResult(path) {
  const before = await lstat(path, { bigint: true });
  if (!before.isFile() || before.isSymbolicLink()) {
    throw new Error("SDK/RPC parity result must be a regular file.");
  }
  if (before.size > BigInt(SDK_RPC_PARITY_MAX_RESULT_JSON_BYTES)) {
    throw new Error("SDK/RPC parity result exceeds its byte limit.");
  }
  const handle = await open(path, "r");
  try {
    const opened = await handle.stat({ bigint: true });
    if (
      !opened.isFile() ||
      opened.dev !== before.dev ||
      opened.ino !== before.ino ||
      opened.size > BigInt(SDK_RPC_PARITY_MAX_RESULT_JSON_BYTES)
    ) {
      throw new Error("SDK/RPC parity result changed while it was opened.");
    }
    const chunks = [];
    let total = 0;
    while (true) {
      const buffer = Buffer.allocUnsafe(
        Math.min(64 * 1024, SDK_RPC_PARITY_MAX_RESULT_JSON_BYTES + 1 - total),
      );
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
      if (bytesRead === 0) break;
      total += bytesRead;
      if (total > SDK_RPC_PARITY_MAX_RESULT_JSON_BYTES) {
        throw new Error("SDK/RPC parity result exceeds its byte limit.");
      }
      chunks.push(buffer.subarray(0, bytesRead));
    }
    const bytes = Buffer.concat(chunks, total);
    const after = await handle.stat({ bigint: true });
    if (
      after.dev !== opened.dev ||
      after.ino !== opened.ino ||
      after.size !== opened.size ||
      bytes.length > SDK_RPC_PARITY_MAX_RESULT_JSON_BYTES
    ) {
      throw new Error("SDK/RPC parity result changed while it was read.");
    }
    const text = bytes.toString("utf8");
    if (!Buffer.from(text, "utf8").equals(bytes)) {
      throw new Error("SDK/RPC parity result must be valid UTF-8.");
    }
    return text;
  } finally {
    await handle.close();
  }
}

const result = JSON.parse(await readBoundedRegularResult(inputPath));
requireValue(result.schemaVersion === 1, "Outer SDK/RPC parity schemaVersion must be 1.");
requireValue(
  result.status === "passed",
  `Outer SDK/RPC parity result must be passed, got ${result.status}.`,
);
requireValue(result.scenario === SDK_RPC_PARITY_SCENARIO, "Outer SDK/RPC parity scenario is incorrect.");
requireValue(
  result.upstream?.repository === "earendil-works/pi" &&
    result.upstream?.releaseTag === PI_RELEASE_TAG &&
    result.upstream?.commit === PI_RELEASE_COMMIT,
  "SDK/RPC parity upstream baseline is incorrect.",
);
requireValue(
  result.artifact?.name === PI_PACKAGE_NAME && result.artifact?.version === PI_PACKAGE_VERSION,
  "SDK/RPC parity Artifact identity is incorrect.",
);
requireValue(
  result.artifact?.integrity === PI_PACKAGE_INTEGRITY,
  "SDK/RPC parity Artifact integrity differs from the pinned registry evidence.",
);
requireValue(
  result.artifact?.shasum === PI_PACKAGE_SHASUM,
  "SDK/RPC parity Artifact shasum differs from the pinned registry evidence.",
);
requireValue(
  result.artifact?.installScriptsExecuted === false,
  "SDK/RPC parity install scripts must remain disabled.",
);
requireValue(result.environment?.node === "22.23.1", "SDK/RPC parity Node version must be 22.23.1.");
requireValue(result.environment?.npm === "10.9.8", "SDK/RPC parity npm version must be 10.9.8.");
requireValue(result.environment?.platform === "linux-x64", "SDK/RPC parity platform must be linux-x64.");
requireValue(
  result.environment?.containerImage ===
    "node:22.23.1-bookworm-slim@sha256:6c74791e557ce11fc957704f6d4fe134a7bc8d6f5ca4403205b2966bd488f6b3",
  "SDK/RPC parity container image is not the pinned digest.",
);
requireValue(
  result.isolation?.hostSecretsPassedToProbe === false,
  "Host secrets must not reach SDK/RPC parity capture.",
);
requireValue(
  result.isolation?.hostWorkspaceMounted === false,
  "Host checkout must not be mounted into SDK/RPC parity capture.",
);
requireValue(
  result.isolation?.sourceBundleReadOnly === true,
  "SDK/RPC parity source bundle must be read-only.",
);
requireValue(
  result.isolation?.containerRootFilesystemReadOnly === true,
  "SDK/RPC parity root filesystem must be read-only.",
);
requireValue(
  result.isolation?.containerCapabilitiesDropped === true,
  "SDK/RPC parity container capabilities must be dropped.",
);
requireValue(
  result.isolation?.containerNoNewPrivileges === true,
  "SDK/RPC parity container must use no-new-privileges.",
);

const capture = result.capture;
requireValue(
  capture?.schemaVersion === SDK_RPC_PARITY_SCHEMA_VERSION,
  "Nested SDK/RPC parity schemaVersion is incorrect.",
);
requireValue(
  capture?.status === "passed",
  `Nested SDK/RPC parity capture must be passed, got ${capture?.status}.`,
);
requireValue(
  capture?.scenario === SDK_RPC_PARITY_SCENARIO,
  "Nested SDK/RPC parity scenario is incorrect.",
);
requireValue(capture?.contract?.prompt === SDK_RPC_PARITY_PROMPT, "SDK/RPC parity Prompt drifted.");
requireValue(
  capture?.contract?.provider === SDK_RPC_PARITY_PROVIDER_ID,
  "SDK/RPC parity provider drifted.",
);
requireValue(capture?.contract?.api === SDK_RPC_PARITY_API_ID, "SDK/RPC parity API drifted.");
requireValue(
  capture?.contract?.modelId === SDK_RPC_PARITY_MODEL_ID,
  "SDK/RPC parity model drifted.",
);
requireValue(
  capture?.contract?.package?.integrity === PI_PACKAGE_INTEGRITY &&
    capture?.contract?.package?.shasum === PI_PACKAGE_SHASUM,
  "Nested SDK/RPC parity Artifact identity drifted.",
);
requireValue(
  capture?.contract?.finalText?.length === SDK_RPC_PARITY_FINAL_TEXT.length,
  "SDK/RPC parity final text length drifted.",
);
requireValue(
  capture?.contract?.finalText?.sha256 === sha256(SDK_RPC_PARITY_FINAL_TEXT),
  "SDK/RPC parity final text digest drifted.",
);
requireValue(
  Array.isArray(capture?.contract?.tools) && capture.contract.tools.length === 0,
  "SDK/RPC parity contract must remain tool-free.",
);

const surface = capture?.cases?.surface;
requireValue(Boolean(surface), "Published RPC surface case is missing.");
requireValue(
  surface?.package?.name === PI_PACKAGE_NAME && surface?.package?.version === PI_PACKAGE_VERSION,
  "Published RPC surface package identity drifted.",
);
requireValue(
  surface?.package?.expected?.integrity === PI_PACKAGE_INTEGRITY &&
    surface?.package?.expected?.shasum === PI_PACKAGE_SHASUM &&
    surface?.package?.expected?.releaseCommit === PI_RELEASE_COMMIT,
  "Published RPC surface expected identity drifted.",
);
requireValue(
  surface?.rootExports?.runRpcModeType === "function",
  "Published package root must export runRpcMode.",
);
requireValue(
  surface?.rootExports?.rpcClientType === "function",
  "Published package root must export RpcClient.",
);
requireValue(
  JSON.stringify(surface?.rpcClient?.requiredMethods) ===
    JSON.stringify(SDK_RPC_PARITY_REQUIRED_RPC_CLIENT_METHODS),
  "RpcClient required method set drifted.",
);
requireValue(
  Array.isArray(surface?.rpcClient?.missingRequiredMethods) &&
    surface.rpcClient.missingRequiredMethods.length === 0,
  "RpcClient is missing a required method.",
);
requireValue(
  JSON.stringify(surface?.files?.map((file) => file.path)) ===
    JSON.stringify(SDK_RPC_PARITY_SURFACE_FILES),
  "Published RPC surface file list drifted.",
);
requireValue(
  surface?.files?.every(
    (file) => Number.isInteger(file.size) && file.size > 0 && /^[0-9a-f]{64}$/.test(file.sha256),
  ),
  "Published RPC surface file metadata is invalid.",
);
requireValue(
  new Set(surface?.files?.map((file) => file.sha256)).size === SDK_RPC_PARITY_SURFACE_FILES.length,
  "Published RPC surface files must retain distinct digests.",
);
requireValue(
  JSON.stringify(Object.keys(surface?.structuredSignals ?? {})) ===
    JSON.stringify(SDK_RPC_PARITY_STRUCTURED_SIGNAL_KEYS),
  "Published RPC structured signal key set drifted.",
);
for (const [signal, observed] of Object.entries(surface?.structuredSignals ?? {})) {
  requireValue(observed === true, `Published RPC structured signal is false: ${signal}.`);
}
requireValue(
  surface?.structuredSignals?.rpcClientProcessFieldDeclaredPrivate === true &&
    surface?.structuredSignals?.rpcClientStopRequestsSigterm === true &&
    surface?.structuredSignals?.rpcClientStopHasSigkillFallback === true,
  "Published RpcClient shutdown source signals drifted.",
);
requireValue(
  surface?.sanitization?.sourceBodiesIncluded === false,
  "Published source bodies must not be stored in the Fixture.",
);

const sdk = capture?.cases?.sdk;
requireValue(Boolean(sdk), "SDK case is missing.");
requireValue(
  sdk?.provider?.id === SDK_RPC_PARITY_PROVIDER_ID,
  "SDK did not use the dedicated Faux provider.",
);
requireValue(sdk?.provider?.callCount === 1, "SDK must consume exactly one Faux response.");
requireValue(sdk?.provider?.pendingResponses === 0, "SDK Faux response must be fully consumed.");
requireValue(
  sdk?.provider?.promptsSentToExternalProvider === 0,
  "SDK must not contact an external provider.",
);
requireValue(
  sdk?.before?.isStreaming === false && sdk?.before?.isIdle === true,
  "SDK initial state must be idle.",
);
requireValue(
  sdk?.preflight?.length === 1 && sdk.preflight[0]?.success === true,
  "SDK preflight must succeed once.",
);
requireValue(
  sdk?.firstStreamingState?.isStreaming === true,
  "SDK must expose isStreaming=true during message updates.",
);
requireValue(
  sdk?.after?.isStreaming === false && sdk?.after?.isIdle === true,
  "SDK Prompt must settle at an idle boundary.",
);
requireValue(sdk?.after?.finalText?.matchesExpected === true, "SDK final text is incorrect.");
requireValue(
  JSON.stringify(sdk?.after?.messages?.map((message) => message.role)) ===
    JSON.stringify(["user", "assistant"]),
  "SDK final message roles must be user → assistant.",
);
contiguous(sdk?.publicEvents ?? [], "SDK Public events");
contiguous(sdk?.extensionEvents ?? [], "SDK Extension events");
requireValue(
  count(sdk?.publicEvents ?? [], "agent_start") === 1,
  "SDK Public trace must contain one agent_start.",
);
requireValue(
  count(sdk?.publicEvents ?? [], "agent_end") === 1,
  "SDK Public trace must contain one agent_end.",
);
requireValue(
  count(sdk?.publicEvents ?? [], "agent_settled") === 1,
  "SDK Public trace must contain one agent_settled.",
);
requireValue(
  sdk?.publicEvents?.find((event) => event.type === "agent_end")?.willRetry === false,
  "SDK Public agent_end must have willRetry=false.",
);
requireValue(
  sdk?.lifecycleNotes?.some(
    (note) =>
      note.type === "shutdown-host-boundary" &&
      note.mechanism === "session.extensionRunner.emit" &&
      note.reason === "exit",
  ),
  "SDK case must preserve the host shutdown boundary.",
);
requireValue(
  sdk?.lifecycleNotes?.some(
    (note) => note.type === "dispose-host-boundary" && note.mechanism === "session.dispose",
  ),
  "SDK case must preserve the host dispose boundary.",
);

const rpc = capture?.cases?.rpc;
requireValue(Boolean(rpc), "RPC case is missing.");
requireValue(rpc?.commandLine?.mode === "rpc", "RPC mode was not recorded.");
requireValue(rpc?.commandLine?.noSession === true, "RPC Worker must disable Session persistence.");
requireValue(rpc?.commandLine?.noTools === true, "RPC Worker must disable tools.");
requireValue(rpc?.commandLine?.offline === true, "RPC Worker must run offline.");
requireValue(
  rpc?.commandLine?.explicitExtension === true,
  "RPC Faux provider Extension must be explicit.",
);
for (const field of [
  "automaticExtensionDiscoveryDisabled",
  "automaticSkillDiscoveryDisabled",
  "automaticTemplateDiscoveryDisabled",
  "automaticThemeDiscoveryDisabled",
  "automaticContextDiscoveryDisabled",
]) {
  requireValue(rpc?.commandLine?.[field] === true, `RPC commandLine.${field} must be true.`);
}
requireValue(
  JSON.stringify(rpc?.commands?.map(({ id, type }) => ({ id, type }))) ===
    JSON.stringify([
      { id: SDK_RPC_PARITY_COMMAND_IDS.availableModels, type: "get_available_models" },
      { id: SDK_RPC_PARITY_COMMAND_IDS.setModel, type: "set_model" },
      { id: SDK_RPC_PARITY_COMMAND_IDS.setThinking, type: "set_thinking_level" },
      { id: SDK_RPC_PARITY_COMMAND_IDS.stateBefore, type: "get_state" },
      { id: SDK_RPC_PARITY_COMMAND_IDS.prompt, type: "prompt" },
      { id: SDK_RPC_PARITY_COMMAND_IDS.stateDuring, type: "get_state" },
      { id: SDK_RPC_PARITY_COMMAND_IDS.stateAfter, type: "get_state" },
      { id: SDK_RPC_PARITY_COMMAND_IDS.messagesAfter, type: "get_messages" },
      { id: SDK_RPC_PARITY_COMMAND_IDS.lastTextAfter, type: "get_last_assistant_text" },
    ]),
  "RPC command sequence drifted.",
);
requireValue(rpc?.responses?.prompt?.success === true, "RPC Prompt response must report success.");
requireValue(rpc?.stateBefore?.isStreaming === false, "RPC initial state must not be streaming.");
requireValue(
  rpc?.stateDuring?.isStreaming === true,
  "RPC state after Prompt acceptance must observe streaming.",
);
requireValue(rpc?.stateAfter?.isStreaming === false, "RPC final state must not be streaming.");
requireValue(rpc?.stateAfter?.pendingMessageCount === 0, "RPC final pendingMessageCount must be zero.");
requireValue(rpc?.lastTextAfter?.matchesExpected === true, "RPC final text is incorrect.");
requireValue(
  JSON.stringify(rpc?.messagesAfter?.map((message) => message.role)) ===
    JSON.stringify(["user", "assistant"]),
  "RPC final message roles must be user → assistant.",
);
contiguous(rpc?.wire ?? [], "RPC wire records");
for (const field of [
  "promptResponseBeforeAgentStart",
  "promptResponseBeforeDuringStateResponse",
  "stateDuringResponseBeforeSettled",
  "promptResponseBeforeSettled",
]) {
  requireValue(rpc?.ordering?.[field] === true, `RPC ordering.${field} must be true.`);
}
requireValue(
  rpc?.ordering?.eventCountAfterPromptResponseBeforeSettled > 0,
  "RPC must continue emitting Runtime events after Prompt acceptance.",
);
requireValue(
  rpc?.wireSemantics?.responseRecordsWithIds === true,
  "RPC Responses must preserve command IDs.",
);
requireValue(
  rpc?.wireSemantics?.responseIdsExactlyMatchCommands === true,
  "RPC Response IDs must exactly match the sent command IDs.",
);
requireValue(
  rpc?.wireSemantics?.runtimeEventsContainIds === false,
  "RPC Runtime events must not be conflated with command IDs.",
);
requireValue(
  rpc?.wireSemantics?.messageUpdatesContainPartial === false,
  "RPC message_update must omit cumulative partial snapshots.",
);
contiguous(rpc?.worker?.processBoundaries ?? [], "RPC process boundaries");
requireValue(
  rpc?.worker?.exit?.code === 0 && rpc?.worker?.exit?.signal === null,
  "RPC Worker exit boundary must be clean after stdin EOF.",
);
requireValue(
  rpc?.worker?.close?.code === 0 && rpc?.worker?.close?.signal === null,
  "RPC Worker close boundary must be clean after stdin EOF.",
);
requireValue(rpc?.worker?.exitBeforeClose === true, "RPC Worker exit must precede close.");
requireValue(
  rpc?.worker?.extensionShutdownRunIdentityMatchedAtExit === true &&
    rpc?.worker?.extensionShutdownRunIdentityMatchedAtClose === true,
  "Current-run RPC Extension shutdown evidence must be durable by exit and close.",
);
requireValue(
  rpc?.worker?.stdinClosedByHost === true,
  "RPC Worker shutdown must be initiated by stdin EOF.",
);
requireValue(
  rpc?.worker?.stdoutRemainderLength === 0,
  "RPC Worker must finish on a complete LF-delimited JSONL record.",
);
requireValue(rpc?.worker?.stderrPresent === false, "RPC Worker must not write unexpected stderr.");
requireValue(
  rpc?.worker?.stderrLength === 0 && rpc?.worker?.stderrSha256 === sha256(""),
  "RPC Worker stderr summary drifted.",
);
requireValue(
  rpc?.extensionEvidence?.status === "passed" &&
    rpc?.extensionEvidence?.runIdentityMatched === true,
  "RPC Extension shutdown evidence must pass.",
);
requireValue(
  rpc?.extensionEvidence?.shutdown?.reason === "quit",
  "RPC Extension must observe shutdown(reason=quit).",
);
requireValue(
  rpc?.extensionEvidence?.provider?.id === SDK_RPC_PARITY_PROVIDER_ID,
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
requireValue(
  count(rpc?.wire ?? [], "agent_settled") === 1,
  "RPC wire must contain one agent_settled.",
);
requireValue(
  rpc?.wire?.find((event) => event.type === "agent_end")?.willRetry === false,
  "RPC wire agent_end must have willRetry=false.",
);

requireValue(
  capture?.comparison?.surfaceAvailable === true,
  "Published runRpcMode / RpcClient surface was not available.",
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
requireValue(
  capture?.comparison?.rpcObservedStreamingState === true,
  "RPC streaming state was not observed.",
);
requireValue(
  capture?.comparison?.sdkObservedStreamingState === true,
  "SDK streaming state was not observed.",
);
requireValue(
  capture?.comparison?.rpcWireUsesDeltaOnlyUpdates === true,
  "RPC wire did not preserve delta-only update semantics.",
);
requireValue(
  capture?.comparison?.workerShutdownAfterSettled === true,
  "RPC Worker shutdown boundary is incomplete.",
);
requireValue(
  Object.values(capture?.comparison?.sourcesRemainDistinct ?? {}).every(Boolean),
  "SDK/RPC source surfaces must remain explicitly distinct.",
);

for (const [field, expected] of Object.entries({
  absolutePathsIncluded: false,
  rawSessionIdIncluded: false,
  rawSessionFileIncluded: false,
  environmentDumpIncluded: false,
  credentialsIncluded: false,
  rawChainOfThoughtIncluded: false,
  rawStderrIncluded: false,
  sourceBodiesIncluded: false,
})) {
  requireValue(
    capture?.sanitization?.[field] === expected,
    `SDK/RPC parity sanitization.${field} must be ${expected}.`,
  );
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
  requireValue(!pattern.test(serialized), `SDK/RPC parity result contains forbidden pattern: ${pattern}`);
}
requireValue(
  !serialized.includes('"sessionId"'),
  "SDK/RPC parity result must not contain a raw sessionId field.",
);
requireValue(
  !serialized.includes('"sessionFile"'),
  "SDK/RPC parity result must not contain a raw sessionFile field.",
);
requireValue(
  !serialized.includes('"runIdentity"'),
  "SDK/RPC parity result must not contain a per-run Extension nonce.",
);
requireValue(
  result.contractFingerprint === fingerprint(result),
  "Outer SDK/RPC parity contract fingerprint is invalid.",
);
requireValue(
  result.contractFingerprint === SDK_RPC_PARITY_EXPECTED_OUTER_CONTRACT_FINGERPRINT,
  "Outer SDK/RPC parity contract fingerprint differs from the frozen contract.",
);
requireValue(
  capture &&
    typeof capture === "object" &&
    capture.contractFingerprint === fingerprint(capture),
  "Nested SDK/RPC parity contract fingerprint is invalid.",
);
requireValue(
  capture?.contractFingerprint === SDK_RPC_PARITY_EXPECTED_CAPTURE_CONTRACT_FINGERPRINT,
  "Nested SDK/RPC parity contract fingerprint differs from the frozen contract.",
);

if (violations.length > 0) {
  console.error(
    "Pi SDK/RPC parity result violations:\n" +
      violations.map((item) => `- ${item}`).join("\n"),
  );
  process.exit(1);
}

console.log(`Pi SDK/RPC parity runtime result: OK (${result.contractFingerprint})`);
