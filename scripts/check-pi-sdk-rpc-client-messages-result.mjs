import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { lstat, open } from "node:fs/promises";
import { resolve } from "node:path";
import {
  PI_PACKAGE_INTEGRITY,
  PI_PACKAGE_NAME,
  PI_PACKAGE_SHASUM,
  PI_PACKAGE_VERSION,
  PI_RELEASE_COMMIT,
  PI_RELEASE_TAG,
  RPC_WORKER_ERROR_PROVIDER_API_ID,
  RPC_WORKER_ERROR_PROVIDER_ID,
  RPC_WORKER_LIFECYCLE_SCENARIO,
  RPC_WORKER_LIFECYCLE_SCHEMA_VERSION,
  RPC_WORKER_MODEL_ID,
  RPC_WORKER_NORMAL_PROMPTS,
  RPC_WORKER_NORMAL_RESPONSES,
  RPC_WORKER_PROVIDER_API_ID,
  RPC_WORKER_PROVIDER_ERROR_MESSAGE,
  RPC_WORKER_PROVIDER_ERROR_PROMPT,
  RPC_WORKER_PROVIDER_ID,
  RPC_WORKER_UNKNOWN_COMMAND_TYPE,
  SDK_RPC_PARITY_API_ID,
  SDK_RPC_PARITY_EXPECTED_CAPTURE_CONTRACT_FINGERPRINT,
  SDK_RPC_PARITY_EXPECTED_OUTER_CONTRACT_FINGERPRINT,
  SDK_RPC_PARITY_FINAL_TEXT,
  SDK_RPC_PARITY_MODEL_ID,
  SDK_RPC_PARITY_PROMPT,
  SDK_RPC_PARITY_PROVIDER_ID,
  SDK_RPC_PARITY_SCENARIO,
} from "./probes/pi-sdk-rpc-parity-contract.mjs";
import { SDK_RPC_PARITY_MAX_RESULT_JSON_BYTES } from "./pi-sdk-rpc-parity-fixture.mjs";

const RPC_WORKER_MAX_RESULT_JSON_BYTES = 4 * 1024 * 1024;
const RPC_WORKER_DEFAULT_FIXTURE =
  "packages/pi-adapter/fixtures/pi-lifecycle-rpc-worker.json";
const PINNED_CONTAINER_IMAGE =
  "node:22.23.1-bookworm-slim@sha256:6c74791e557ce11fc957704f6d4fe134a7bc8d6f5ca4403205b2966bd488f6b3";

const rpcWorkerMode = process.argv[2] === "--rpc-worker-lifecycle";
const suppliedPath = rpcWorkerMode ? process.argv[3] : process.argv[2];
const environmentPath = rpcWorkerMode
  ? process.env.PI_RPC_WORKER_LIFECYCLE_OUTPUT
  : process.env.PI_SDK_RPC_PARITY_OUTPUT;
const defaultPath = rpcWorkerMode
  ? RPC_WORKER_DEFAULT_FIXTURE
  : "packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity.json";
const inputPath = resolve(suppliedPath ?? environmentPath ?? defaultPath);

if (rpcWorkerMode && suppliedPath === undefined && environmentPath === undefined && !existsSync(inputPath)) {
  console.log("Pi RPC Worker lifecycle Fixture: pending first isolated Runtime capture");
  process.exit(0);
}

const violations = [];

function requireValue(condition, message) {
  if (!condition) violations.push(message);
}

function equal(actual, expected, message) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    violations.push(
      `${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function fingerprint(value) {
  if (!value || typeof value !== "object") return undefined;
  const clone = structuredClone(value);
  delete clone.contractFingerprint;
  return sha256(JSON.stringify(clone));
}

function contiguous(records, label) {
  for (let index = 0; index < records.length; index += 1) {
    requireValue(
      records[index]?.sequence === index + 1,
      `${label} sequence drifted at index ${index}.`,
    );
  }
}

function count(records, predicate) {
  return records.filter(predicate).length;
}

function transcript(worker) {
  return Array.isArray(worker?.transcript) ? worker.transcript : [];
}

function responses(worker, id, command) {
  return transcript(worker).filter(
    (record) =>
      record.kind === "response" &&
      record.id === (id ?? null) &&
      (command === undefined || record.command === command),
  );
}

function events(worker, type, predicate = () => true) {
  return transcript(worker).filter(
    (record) =>
      record.kind === "event" &&
      record.event?.type === type &&
      predicate(record.event),
  );
}

function messageRoles(messages) {
  return Array.isArray(messages) ? messages.map((message) => message?.role) : [];
}

function messageTexts(messages) {
  return Array.isArray(messages) ? messages.map((message) => message?.text ?? "") : [];
}

function extensionShutdownObserved(caseResult) {
  return (caseResult?.extensionEvents ?? []).some(
    (event) => event?.type === "session_shutdown" && event.reason === "quit",
  );
}

function exactProcessBoundaries(worker, expectedCode, requireExtensionEvidence) {
  const expected = [
    {
      sequence: worker?.processBoundaries?.[0]?.sequence,
      kind: "process",
      event: "exit",
      code: expectedCode,
      signal: null,
      ...(requireExtensionEvidence
        ? { extensionShutdownRunIdentityMatched: true }
        : { extensionShutdownRunIdentityMatched: undefined }),
    },
    {
      sequence: worker?.processBoundaries?.[1]?.sequence,
      kind: "process",
      event: "close",
      code: expectedCode,
      signal: null,
      ...(requireExtensionEvidence
        ? { extensionShutdownRunIdentityMatched: true }
        : { extensionShutdownRunIdentityMatched: undefined }),
    },
  ];
  const actual = (worker?.processBoundaries ?? []).map((boundary) => ({
    sequence: boundary.sequence,
    kind: boundary.kind,
    event: boundary.event,
    code: boundary.code,
    signal: boundary.signal,
    extensionShutdownRunIdentityMatched:
      boundary.extensionShutdownRunIdentityMatched,
  }));
  equal(actual, expected, `${worker?.alias ?? "Worker"} process boundaries drifted`);
  requireValue(worker?.exitBeforeClose === true, `${worker?.alias ?? "Worker"} exit must precede close.`);
}

async function readBoundedRegularResult(path, maximumBytes, label) {
  const before = await lstat(path, { bigint: true });
  if (!before.isFile() || before.isSymbolicLink()) {
    throw new Error(`${label} must be a regular file.`);
  }
  if (before.size > BigInt(maximumBytes)) {
    throw new Error(`${label} exceeds its byte limit.`);
  }
  const handle = await open(path, "r");
  try {
    const opened = await handle.stat({ bigint: true });
    if (
      !opened.isFile() ||
      opened.dev !== before.dev ||
      opened.ino !== before.ino ||
      opened.size > BigInt(maximumBytes)
    ) {
      throw new Error(`${label} changed while it was opened.`);
    }
    const chunks = [];
    let total = 0;
    while (true) {
      const buffer = Buffer.allocUnsafe(Math.min(64 * 1024, maximumBytes + 1 - total));
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
      if (bytesRead === 0) break;
      total += bytesRead;
      if (total > maximumBytes) throw new Error(`${label} exceeds its byte limit.`);
      chunks.push(buffer.subarray(0, bytesRead));
    }
    const bytes = Buffer.concat(chunks, total);
    const after = await handle.stat({ bigint: true });
    if (
      after.dev !== opened.dev ||
      after.ino !== opened.ino ||
      after.size !== opened.size ||
      bytes.length > maximumBytes
    ) {
      throw new Error(`${label} changed while it was read.`);
    }
    const text = bytes.toString("utf8");
    if (!Buffer.from(text, "utf8").equals(bytes)) {
      throw new Error(`${label} must be valid UTF-8.`);
    }
    return text;
  } finally {
    await handle.close();
  }
}

function validateSdkRpcParity(result, rawText) {
  const capture = result.capture;
  const rpcClient = capture?.cases?.rpcClientMessages;

  requireValue(
    result.contractFingerprint === SDK_RPC_PARITY_EXPECTED_OUTER_CONTRACT_FINGERPRINT,
    "Outer contract fingerprint differs from the frozen SDK/RPC parity contract.",
  );
  requireValue(
    result.contractFingerprint === fingerprint(result),
    "Outer SDK/RPC parity contract fingerprint is invalid.",
  );
  requireValue(
    capture?.contractFingerprint === SDK_RPC_PARITY_EXPECTED_CAPTURE_CONTRACT_FINGERPRINT,
    "Nested contract fingerprint differs from the frozen SDK/RPC parity contract.",
  );
  requireValue(
    capture?.contractFingerprint === fingerprint(capture),
    "Nested SDK/RPC parity contract fingerprint is invalid.",
  );

  requireValue(result.status === "passed", `Outer result must be passed, got ${result.status}.`);
  requireValue(result.scenario === SDK_RPC_PARITY_SCENARIO, "Outer scenario drifted.");
  requireValue(capture?.status === "passed", `Nested capture must be passed, got ${capture?.status}.`);
  requireValue(capture?.scenario === SDK_RPC_PARITY_SCENARIO, "Nested scenario drifted.");
  requireValue(capture?.contract?.prompt === SDK_RPC_PARITY_PROMPT, "Prompt drifted.");
  equal(
    capture?.contract?.rpcClientMessagesBoundary,
    {
      client: "published-RpcClient",
      command: "get_messages",
      phases: ["before-prompt", "after-settled"],
    },
    "RpcClient get_messages boundary contract drifted",
  );

  requireValue(Boolean(rpcClient), "Published RpcClient messages case is missing.");
  requireValue(
    rpcClient?.clientSurface === "published-RpcClient",
    "Messages case must execute the published RpcClient export.",
  );

  function expectedState(state, { streaming, messageCount }) {
    return (
      state?.model?.provider === SDK_RPC_PARITY_PROVIDER_ID &&
      state?.model?.id === SDK_RPC_PARITY_MODEL_ID &&
      state?.model?.api === SDK_RPC_PARITY_API_ID &&
      state?.thinkingLevel === "off" &&
      state?.isStreaming === streaming &&
      state?.isCompacting === false &&
      state?.messageCount === messageCount &&
      state?.pendingMessageCount === 0 &&
      state?.sessionIdPresent === true &&
      state?.sessionFilePresent === false
    );
  }

  requireValue(
    expectedState(rpcClient?.before?.state, { streaming: false, messageCount: 0 }),
    "RpcClient State before Prompt drifted.",
  );
  requireValue(
    Array.isArray(rpcClient?.before?.messages) && rpcClient.before.messages.length === 0,
    "RpcClient getMessages() before Prompt must return an empty array.",
  );
  requireValue(
    rpcClient?.acceptance?.promptReturned === true,
    "RpcClient prompt() must return at the acceptance boundary.",
  );
  requireValue(
    expectedState(rpcClient?.acceptance?.state, { streaming: true, messageCount: 1 }),
    "RpcClient State immediately after Prompt acceptance must observe streaming.",
  );
  requireValue(
    expectedState(rpcClient?.after?.state, { streaming: false, messageCount: 2 }),
    "RpcClient State after agent_settled drifted.",
  );

  const messagesAfter = rpcClient?.after?.messages ?? [];
  equal(
    messagesAfter.map((message) => message.role),
    ["user", "assistant"],
    "RpcClient getMessages() after Prompt roles drifted",
  );
  requireValue(
    messagesAfter[0]?.text?.length === SDK_RPC_PARITY_PROMPT.length &&
      messagesAfter[0]?.text?.sha256 === sha256(SDK_RPC_PARITY_PROMPT),
    "RpcClient final user Message drifted.",
  );
  requireValue(
    messagesAfter[1]?.stopReason === "stop" &&
      messagesAfter[1]?.text?.length === SDK_RPC_PARITY_FINAL_TEXT.length &&
      messagesAfter[1]?.text?.sha256 === sha256(SDK_RPC_PARITY_FINAL_TEXT) &&
      messagesAfter[1]?.text?.matchesExpected === true,
    "RpcClient final assistant Message drifted.",
  );
  requireValue(
    rpcClient?.after?.lastAssistantText?.length === SDK_RPC_PARITY_FINAL_TEXT.length &&
      rpcClient?.after?.lastAssistantText?.sha256 === sha256(SDK_RPC_PARITY_FINAL_TEXT) &&
      rpcClient?.after?.lastAssistantText?.matchesExpected === true,
    "RpcClient getLastAssistantText() drifted.",
  );

  const runtimeEvents = rpcClient?.events ?? [];
  contiguous(runtimeEvents, "RpcClient Runtime events");
  requireValue(runtimeEvents[0]?.type === "agent_start", "RpcClient trace must begin at agent_start.");
  requireValue(runtimeEvents.at(-1)?.type === "agent_settled", "RpcClient trace must end at agent_settled.");
  requireValue(
    count(runtimeEvents, (event) => event.type === "agent_start") === 1 &&
      count(runtimeEvents, (event) => event.type === "agent_end") === 1 &&
      count(runtimeEvents, (event) => event.type === "agent_settled") === 1,
    "RpcClient Runtime trace must contain one Agent Run and one settled boundary.",
  );
  requireValue(
    runtimeEvents.find((event) => event.type === "agent_end")?.willRetry === false,
    "RpcClient agent_end must preserve willRetry=false.",
  );
  requireValue(
    runtimeEvents
      .filter((event) => event.type === "message_update")
      .every((event) => event.hasPartial === false),
    "RpcClient message_update records must omit cumulative partial snapshots.",
  );

  equal(
    rpcClient?.shutdown?.requestedSignals,
    [{ signal: "SIGTERM", accepted: true }],
    "RpcClient.stop() signal requests drifted",
  );
  requireValue(
    rpcClient?.shutdown?.mechanism === "RpcClient.stop" &&
      rpcClient?.shutdown?.instrumentationSurface === "published-js-private-process-field",
    "RpcClient.stop() shutdown mechanism drifted.",
  );
  equal(
    rpcClient?.shutdown?.process?.processBoundaries,
    [
      {
        sequence: 1,
        type: "exit",
        code: 143,
        signal: null,
        extensionShutdownRunIdentityMatched: true,
      },
      {
        sequence: 2,
        type: "close",
        code: 143,
        signal: null,
        extensionShutdownRunIdentityMatched: true,
      },
    ],
    "RpcClient.stop() process boundaries drifted",
  );
  requireValue(
    rpcClient?.shutdown?.stderrPresent === false &&
      rpcClient?.shutdown?.stderrLength === 0 &&
      rpcClient?.shutdown?.stderrSha256 === sha256(""),
    "RpcClient.stop() stderr evidence drifted.",
  );
  requireValue(
    rpcClient?.extensionEvidence?.status === "passed" &&
      rpcClient?.extensionEvidence?.runIdentityMatched === true &&
      rpcClient?.extensionEvidence?.shutdown?.observed === true &&
      rpcClient?.extensionEvidence?.shutdown?.reason === "quit",
    "RpcClient Extension shutdown evidence drifted.",
  );
  requireValue(
    rpcClient?.extensionEvidence?.provider?.id === SDK_RPC_PARITY_PROVIDER_ID &&
      rpcClient?.extensionEvidence?.provider?.modelId === SDK_RPC_PARITY_MODEL_ID &&
      rpcClient?.extensionEvidence?.provider?.callCount === 1 &&
      rpcClient?.extensionEvidence?.provider?.pendingResponses === 0 &&
      rpcClient?.extensionEvidence?.provider?.promptsSentToExternalProvider === 0,
    "RpcClient Faux Provider evidence drifted.",
  );

  requireValue(capture?.comparison?.rpcClientMessagesBeforeEmpty === true, "Comparison lost empty-before Prompt evidence.");
  requireValue(capture?.comparison?.rpcClientMessagesAfterMatchPrimary === true, "RpcClient final Messages differ from raw RPC.");
  requireValue(capture?.comparison?.rpcClientAcceptanceStateObserved === true, "RpcClient acceptance State was not observed.");

  for (const [field, expected] of Object.entries({
    absolutePathsIncluded: false,
    rawSessionIdIncluded: false,
    rawSessionFileIncluded: false,
    environmentDumpIncluded: false,
    credentialsIncluded: false,
    rawChainOfThoughtIncluded: false,
    rawStderrIncluded: false,
  })) {
    requireValue(
      rpcClient?.sanitization?.[field] === expected,
      `RpcClient sanitization.${field} must be ${expected}.`,
    );
  }

  for (const pattern of [
    /\/home\/runner\//,
    /\/tmp\/zhiwei-pi-lifecycle-/,
    /[A-Za-z]:\\Users\\/,
    /GITHUB_TOKEN/i,
    /authorization:\s*bearer/i,
    /cookie:/i,
    /api[_-]?key/i,
  ]) {
    requireValue(!pattern.test(rawText), `RpcClient evidence contains forbidden pattern: ${pattern}`);
  }
  requireValue(!rawText.includes('"sessionId"'), "RpcClient evidence must not contain a raw sessionId field.");
  requireValue(!rawText.includes('"sessionFile"'), "RpcClient evidence must not contain a raw sessionFile field.");
  requireValue(!rawText.includes('"runIdentity"'), "RpcClient evidence must not contain the per-run Extension nonce.");
}

function validateOuterRuntimeEnvelope(result, scenario) {
  requireValue(result.schemaVersion === 1, "Outer Runtime schemaVersion must be 1.");
  requireValue(result.status === "passed", `Outer Runtime result must pass, got ${result.status}.`);
  requireValue(result.scenario === scenario, `Outer Runtime scenario must be ${scenario}.`);
  requireValue(result.contractFingerprint === fingerprint(result), "Outer Runtime fingerprint is invalid.");
  equal(
    result.upstream,
    {
      repository: "earendil-works/pi",
      releaseTag: PI_RELEASE_TAG,
      commit: PI_RELEASE_COMMIT,
    },
    "Pinned upstream identity drifted",
  );
  requireValue(
    result.artifact?.name === PI_PACKAGE_NAME && result.artifact?.version === PI_PACKAGE_VERSION,
    "Pinned Pi Artifact name/version drifted.",
  );
  requireValue(
    result.artifact?.integrity === PI_PACKAGE_INTEGRITY &&
      result.artifact?.shasum === PI_PACKAGE_SHASUM,
    "Pinned Pi Artifact digest drifted.",
  );
  requireValue(result.artifact?.installScriptsExecuted === false, "Pi install scripts must stay disabled.");
  requireValue(result.environment?.node === "22.23.1", "Runtime Node version must be 22.23.1.");
  requireValue(result.environment?.npm === "10.9.8", "Runtime npm version must be 10.9.8.");
  requireValue(result.environment?.platform === "linux-x64", "Runtime platform must be linux-x64.");
  requireValue(result.environment?.containerImage === PINNED_CONTAINER_IMAGE, "Runtime container image drifted.");
  for (const [field, expected] of Object.entries({
    hostSecretsPassedToProbe: false,
    hostWorkspaceMounted: false,
    sourceBundleReadOnly: true,
    containerRootFilesystemReadOnly: true,
    containerCapabilitiesDropped: true,
    containerNoNewPrivileges: true,
  })) {
    requireValue(result.isolation?.[field] === expected, `Isolation.${field} must be ${expected}.`);
  }
}

function validateWorkerState(state, { provider, api, streaming, messageCount, persistent }) {
  requireValue(state?.model?.provider === provider, `State Provider must be ${provider}.`);
  requireValue(state?.model?.id === RPC_WORKER_MODEL_ID, "State model ID drifted.");
  requireValue(state?.model?.api === api, `State API must be ${api}.`);
  requireValue(state?.thinkingLevel === "off", "State thinking level must be off.");
  requireValue(state?.isStreaming === streaming, `State isStreaming must be ${streaming}.`);
  requireValue(state?.isCompacting === false, "State must not be compacting.");
  requireValue(state?.messageCount === messageCount, `State messageCount must be ${messageCount}.`);
  requireValue(state?.pendingMessageCount === 0, "State pendingMessageCount must be zero.");
  requireValue(/^session-id-[1-9]\d*$/.test(state?.sessionId ?? ""), "State Session ID must be a stable alias.");
  if (persistent) {
    requireValue(/^session-file-[1-9]\d*$/.test(state?.sessionFile ?? ""), "Persistent State Session file must be a stable alias.");
  } else {
    requireValue(state?.sessionFile === undefined, "No-session State must not expose a Session file alias.");
  }
}

function validateExtensionEvidence(caseResult, provider, api, expectedCalls = 1) {
  const evidence = caseResult?.extensionEvidence;
  requireValue(evidence?.schemaVersion === RPC_WORKER_LIFECYCLE_SCHEMA_VERSION, "Extension evidence schema drifted.");
  requireValue(evidence?.status === "passed", "Extension evidence must pass.");
  requireValue(evidence?.scenario === RPC_WORKER_LIFECYCLE_SCENARIO, "Extension evidence scenario drifted.");
  requireValue(evidence?.runIdentityMatched === true, "Extension evidence must match the current run identity.");
  requireValue(evidence?.shutdown?.observed === true && evidence.shutdown.reason === "quit", "Extension must observe quit shutdown.");
  requireValue(
    evidence?.provider?.id === provider &&
      evidence?.provider?.api === api &&
      evidence?.provider?.modelId === RPC_WORKER_MODEL_ID &&
      evidence?.provider?.callCount === expectedCalls &&
      evidence?.provider?.pendingResponses === 0 &&
      evidence?.provider?.promptsSentToExternalProvider === 0,
    "Extension Faux Provider evidence drifted.",
  );
  requireValue(extensionShutdownObserved(caseResult), "Extension event log is missing session_shutdown(reason=quit)." );
}

function validateRpcWorkerLifecycle(result, rawText) {
  validateOuterRuntimeEnvelope(result, RPC_WORKER_LIFECYCLE_SCENARIO);
  const capture = result.capture;
  requireValue(capture?.schemaVersion === RPC_WORKER_LIFECYCLE_SCHEMA_VERSION, "RPC Worker capture schemaVersion drifted.");
  requireValue(capture?.status === "passed", `RPC Worker capture must pass, got ${capture?.status}.`);
  requireValue(capture?.scenario === RPC_WORKER_LIFECYCLE_SCENARIO, "RPC Worker capture scenario drifted.");
  requireValue(capture?.contractFingerprint === fingerprint(capture), "RPC Worker capture fingerprint is invalid.");
  equal(
    capture?.contract?.package,
    {
      name: PI_PACKAGE_NAME,
      version: PI_PACKAGE_VERSION,
      integrity: PI_PACKAGE_INTEGRITY,
      shasum: PI_PACKAGE_SHASUM,
      releaseTag: PI_RELEASE_TAG,
      releaseCommit: PI_RELEASE_COMMIT,
      executionMode: "node-cli-entry-real-subprocess",
    },
    "RPC Worker package contract drifted",
  );
  equal(
    capture?.contract?.protocol,
    {
      transport: "stdio-jsonl",
      framing: "lf-only",
      unicodeLineSeparatorsInsideJsonString: ["U+2028", "U+2029"],
      unknownCommandResponseCommand: "echo-request-type",
      promptResponseMeaning: "preflight-acceptance-not-run-completion",
    },
    "RPC Worker protocol contract drifted",
  );
  equal(
    capture?.contract?.providers,
    {
      normal: {
        id: RPC_WORKER_PROVIDER_ID,
        api: RPC_WORKER_PROVIDER_API_ID,
        modelId: RPC_WORKER_MODEL_ID,
      },
      error: {
        id: RPC_WORKER_ERROR_PROVIDER_ID,
        api: RPC_WORKER_ERROR_PROVIDER_API_ID,
        modelId: RPC_WORKER_MODEL_ID,
      },
      promptsSentToExternalProvider: 0,
    },
    "RPC Worker Provider contract drifted",
  );

  for (const [field, expected] of Object.entries({
    hostSecretsPassedToWorker: false,
    realProviderCredentialsUsed: false,
    promptsSentToExternalProvider: 0,
    businessFileWrites: false,
    networkCallsByWorkerProvider: false,
    rawEnvironmentDumpIncluded: false,
  })) {
    requireValue(capture?.security?.[field] === expected, `Security.${field} must be ${expected}.`);
  }
  for (const [field, expected] of Object.entries({
    absolutePathsIncluded: false,
    rawSessionIdIncluded: false,
    rawSessionFileIncluded: false,
    rawResponseIdIncluded: false,
    processPidIncluded: false,
    extensionRunIdentityIncluded: false,
    credentialsIncluded: false,
    rawChainOfThoughtIncluded: false,
    stderrLimitedToSanitizedLines: true,
  })) {
    requireValue(capture?.sanitization?.[field] === expected, `Sanitization.${field} must be ${expected}.`);
  }
  requireValue(
    Array.isArray(capture?.aliases?.sessionIds) &&
      capture.aliases.sessionIds.length > 0 &&
      capture.aliases.sessionIds.every((value) => /^session-id-[1-9]\d*$/.test(value)),
    "Session IDs must be stable aliases.",
  );
  requireValue(
    Array.isArray(capture?.aliases?.sessionFiles) &&
      capture.aliases.sessionFiles.length > 0 &&
      capture.aliases.sessionFiles.every((value) => /^session-file-[1-9]\d*$/.test(value)),
    "Session files must be stable aliases.",
  );
  requireValue(
    Array.isArray(capture?.aliases?.extensionRequests),
    "Extension request alias set is missing.",
  );

  const protocol = capture?.cases?.protocolErrors;
  const normal = capture?.cases?.normalPromptEof;
  const restart = capture?.cases?.restartResumeSigterm;
  const preflight = capture?.cases?.preflightRejection;
  const providerError = capture?.cases?.acceptedProviderError;

  requireValue(protocol?.malformedJson?.command === "parse", "Malformed JSON command must be parse.");
  requireValue(protocol?.malformedJson?.success === false && protocol?.malformedJson?.responseCount === 1, "Malformed JSON must produce one failed response.");
  requireValue(protocol?.unknownCommand?.id === "normal-unicode-unknown", "Unknown command correlation ID drifted.");
  requireValue(protocol?.unknownCommand?.command === RPC_WORKER_UNKNOWN_COMMAND_TYPE, "Unknown command response must echo the request type.");
  requireValue(protocol?.unknownCommand?.success === false && protocol?.unknownCommand?.responseCount === 1, "Unknown command must produce one failed response.");
  equal(protocol?.unknownCommand?.unicodeSeparatorsInsideJsonString, ["U+2028", "U+2029"], "Unicode JSONL framing evidence drifted");
  requireValue(protocol?.workerRemainedUsable === true, "Protocol errors made the Worker unusable.");
  validateWorkerState(protocol?.validStateAfterErrors, {
    provider: RPC_WORKER_PROVIDER_ID,
    api: RPC_WORKER_PROVIDER_API_ID,
    streaming: false,
    messageCount: 0,
    persistent: true,
  });

  requireValue(Boolean(normal), "normal-prompt-eof case is missing.");
  contiguous(transcript(normal?.worker), "Normal RPC Worker transcript");
  requireValue(normal?.worker?.alias === "rpc-worker-1", "Normal Worker alias drifted.");
  requireValue(normal?.worker?.stderr?.present === false && normal?.worker?.stderr?.length === 0 && normal?.worker?.stderr?.sha256 === sha256(""), "Normal Worker stderr drifted.");
  requireValue(responses(normal?.worker, null, "parse").length === 1, "Normal transcript must retain one parse failure response.");
  requireValue(responses(normal?.worker, "normal-unicode-unknown", RPC_WORKER_UNKNOWN_COMMAND_TYPE).length === 1, "Normal transcript must retain one correlated unknown-command response.");
  requireValue(responses(normal?.worker, "normal-prompt-1", "prompt").length === 1 && responses(normal?.worker, "normal-prompt-1", "prompt")[0]?.success === true, "Normal Prompt must have one successful acceptance response.");
  for (const type of ["agent_start", "turn_start", "message_start", "message_end", "turn_end", "agent_end", "agent_settled"]) {
    requireValue(events(normal?.worker, type).length > 0, `Normal transcript is missing ${type}.`);
  }
  requireValue(events(normal?.worker, "agent_start").length === 1 && events(normal?.worker, "agent_end").length === 1 && events(normal?.worker, "agent_settled").length === 1, "Normal transcript must contain exactly one Agent Run.");
  requireValue(events(normal?.worker, "message_update").length > 0, "Normal transcript must retain Assistant streaming updates.");
  requireValue(normal?.prompt === RPC_WORKER_NORMAL_PROMPTS.initial && normal?.responseText === RPC_WORKER_NORMAL_RESPONSES.initial, "Normal Prompt/response constants drifted.");
  validateWorkerState(normal?.stateBefore, { provider: RPC_WORKER_PROVIDER_ID, api: RPC_WORKER_PROVIDER_API_ID, streaming: false, messageCount: 0, persistent: true });
  requireValue(Array.isArray(normal?.messagesBefore) && normal.messagesBefore.length === 0, "Normal Messages before Prompt must be empty.");
  validateWorkerState(normal?.stateDuring, { provider: RPC_WORKER_PROVIDER_ID, api: RPC_WORKER_PROVIDER_API_ID, streaming: true, messageCount: 1, persistent: true });
  for (const field of [
    "promptResponsePrecedesAgentStart",
    "publicLifecycleStrictlyOrdered",
    "stateDuringAfterAcceptanceBeforeSettled",
  ]) {
    requireValue(normal?.ordering?.[field] === true, `Normal ordering.${field} must be true.`);
  }
  validateWorkerState(normal?.finalState, { provider: RPC_WORKER_PROVIDER_ID, api: RPC_WORKER_PROVIDER_API_ID, streaming: false, messageCount: 2, persistent: true });
  equal(messageRoles(normal?.finalMessages), ["user", "assistant"], "Normal final Message roles drifted");
  equal(messageTexts(normal?.finalMessages), [RPC_WORKER_NORMAL_PROMPTS.initial, RPC_WORKER_NORMAL_RESPONSES.initial], "Normal final Message text drifted");
  requireValue(normal?.lastAssistantText === RPC_WORKER_NORMAL_RESPONSES.initial, "Normal last Assistant text drifted.");
  requireValue(normal?.shutdown?.mechanism === "stdin-eof" && normal?.shutdown?.close?.code === 0 && normal?.shutdown?.close?.signal === null, "Normal EOF shutdown drifted.");
  exactProcessBoundaries(normal?.worker, 0, true);
  validateExtensionEvidence(normal, RPC_WORKER_PROVIDER_ID, RPC_WORKER_PROVIDER_API_ID);

  requireValue(Boolean(restart), "restart-resume-sigterm case is missing.");
  contiguous(transcript(restart?.worker), "Restart RPC Worker transcript");
  requireValue(restart?.worker?.alias === "rpc-worker-2", "Restart Worker alias drifted.");
  requireValue(restart?.worker?.stderr?.present === false && restart?.worker?.stderr?.length === 0 && restart?.worker?.stderr?.sha256 === sha256(""), "Restart Worker stderr drifted.");
  requireValue(responses(restart?.worker, "restart-prompt-2", "prompt").length === 1 && responses(restart?.worker, "restart-prompt-2", "prompt")[0]?.success === true, "Restart Prompt must have one successful acceptance response.");
  requireValue(events(restart?.worker, "agent_start").length === 1 && events(restart?.worker, "agent_end").length === 1 && events(restart?.worker, "agent_settled").length === 1, "Restart transcript must contain exactly one new Agent Run.");
  requireValue(restart?.prompt === RPC_WORKER_NORMAL_PROMPTS.resumed && restart?.responseText === RPC_WORKER_NORMAL_RESPONSES.resumed, "Restart Prompt/response constants drifted.");
  validateWorkerState(restart?.restoredState, { provider: RPC_WORKER_PROVIDER_ID, api: RPC_WORKER_PROVIDER_API_ID, streaming: false, messageCount: 2, persistent: true });
  equal(messageRoles(restart?.restoredMessages), ["user", "assistant"], "Restart restored Message roles drifted");
  equal(messageTexts(restart?.restoredMessages), [RPC_WORKER_NORMAL_PROMPTS.initial, RPC_WORKER_NORMAL_RESPONSES.initial], "Restart restored Message text drifted");
  validateWorkerState(restart?.stateDuring, { provider: RPC_WORKER_PROVIDER_ID, api: RPC_WORKER_PROVIDER_API_ID, streaming: true, messageCount: 3, persistent: true });
  for (const field of [
    "promptResponsePrecedesAgentStart",
    "publicLifecycleStrictlyOrdered",
    "stateDuringAfterAcceptanceBeforeSettled",
  ]) {
    requireValue(restart?.ordering?.[field] === true, `Restart ordering.${field} must be true.`);
  }
  validateWorkerState(restart?.finalState, { provider: RPC_WORKER_PROVIDER_ID, api: RPC_WORKER_PROVIDER_API_ID, streaming: false, messageCount: 4, persistent: true });
  equal(messageRoles(restart?.finalMessages), ["user", "assistant", "user", "assistant"], "Restart final Message roles drifted");
  equal(messageTexts(restart?.finalMessages), [RPC_WORKER_NORMAL_PROMPTS.initial, RPC_WORKER_NORMAL_RESPONSES.initial, RPC_WORKER_NORMAL_PROMPTS.resumed, RPC_WORKER_NORMAL_RESPONSES.resumed], "Restart final Message text drifted");
  requireValue(restart?.lastAssistantText === RPC_WORKER_NORMAL_RESPONSES.resumed, "Restart last Assistant text drifted.");
  requireValue(restart?.identity?.workerChanged === true && restart?.identity?.sessionIdPreserved === true && restart?.identity?.sessionFilePreserved === true, "Restart Session/Worker identity evidence drifted.");
  requireValue(restart?.restoredState?.sessionId === normal?.finalState?.sessionId && restart?.restoredState?.sessionFile === normal?.finalState?.sessionFile && restart?.finalState?.sessionId === normal?.finalState?.sessionId && restart?.finalState?.sessionFile === normal?.finalState?.sessionFile, "Restart did not preserve Session aliases.");
  requireValue(restart?.shutdown?.mechanism === "idle-sigterm" && restart?.shutdown?.requestedSignal === "SIGTERM" && restart?.shutdown?.close?.code === 143 && restart?.shutdown?.close?.signal === null, "Restart idle SIGTERM shutdown drifted.");
  exactProcessBoundaries(restart?.worker, 143, true);
  validateExtensionEvidence(restart, RPC_WORKER_PROVIDER_ID, RPC_WORKER_PROVIDER_API_ID);

  requireValue(Boolean(preflight), "preflight-rejection case is missing.");
  contiguous(transcript(preflight?.worker), "Preflight RPC Worker transcript");
  requireValue(preflight?.worker?.stderr?.present === false && preflight?.worker?.stderr?.length === 0, "Preflight Worker wrote stderr.");
  requireValue(preflight?.response?.success === false && preflight?.response?.responseCount === 1, "Preflight Prompt must return one failure response.");
  requireValue(preflight?.agentStartCount === 0 && events(preflight?.worker, "agent_start").length === 0, "Preflight rejection must not start an Agent Run.");
  requireValue(preflight?.workerRemainedUsable === true, "Preflight rejection made the Worker unusable.");
  requireValue(preflight?.stateBefore?.isStreaming === false && preflight?.stateAfter?.isStreaming === false, "Preflight State streaming boundary drifted.");
  requireValue(Array.isArray(preflight?.messagesAfter) && preflight.messagesAfter.length === 0, "Preflight rejection must not persist Messages.");
  requireValue(preflight?.shutdown?.mechanism === "stdin-eof" && preflight?.shutdown?.close?.code === 0 && preflight?.shutdown?.close?.signal === null, "Preflight EOF shutdown drifted.");
  exactProcessBoundaries(preflight?.worker, 0, false);

  requireValue(Boolean(providerError), "accepted-provider-error case is missing.");
  contiguous(transcript(providerError?.worker), "Provider-error RPC Worker transcript");
  requireValue(providerError?.worker?.stderr?.present === false && providerError?.worker?.stderr?.length === 0, "Provider-error Worker wrote stderr.");
  requireValue(providerError?.prompt === RPC_WORKER_PROVIDER_ERROR_PROMPT && providerError?.errorMessage === RPC_WORKER_PROVIDER_ERROR_MESSAGE, "Provider-error constants drifted.");
  requireValue(providerError?.promptResponse?.success === true && providerError?.promptResponse?.responseCount === 1, "Provider-error Prompt must have one successful acceptance response.");
  requireValue(responses(providerError?.worker, "provider-error-prompt", "prompt").length === 1 && responses(providerError?.worker, "provider-error-prompt", "prompt")[0]?.success === true, "Provider-error transcript must preserve one acceptance response.");
  requireValue(events(providerError?.worker, "agent_start").length === 1 && events(providerError?.worker, "agent_end").length === 1 && events(providerError?.worker, "agent_settled").length === 1, "Provider-error transcript must contain one Agent Run.");
  requireValue(events(providerError?.worker, "agent_end", (event) => event.willRetry === false).length === 1, "Provider error must finish with agent_end(willRetry=false)." );
  validateWorkerState(providerError?.stateDuring, { provider: RPC_WORKER_ERROR_PROVIDER_ID, api: RPC_WORKER_ERROR_PROVIDER_API_ID, streaming: true, messageCount: 1, persistent: false });
  for (const field of [
    "promptResponsePrecedesAgentStart",
    "failureExpressedAfterAcceptance",
    "stateDuringAfterAcceptanceBeforeSettled",
  ]) {
    requireValue(providerError?.ordering?.[field] === true, `Provider-error ordering.${field} must be true.`);
  }
  validateWorkerState(providerError?.finalState, { provider: RPC_WORKER_ERROR_PROVIDER_ID, api: RPC_WORKER_ERROR_PROVIDER_API_ID, streaming: false, messageCount: 2, persistent: false });
  equal(messageRoles(providerError?.finalMessages), ["user", "assistant"], "Provider-error final Message roles drifted");
  requireValue(providerError?.finalMessages?.[0]?.text === RPC_WORKER_PROVIDER_ERROR_PROMPT, "Provider-error User Message drifted.");
  requireValue(providerError?.finalMessages?.[1]?.stopReason === "error" && providerError?.finalMessages?.[1]?.errorMessage === RPC_WORKER_PROVIDER_ERROR_MESSAGE, "Provider error was not persisted as an Assistant error Message.");
  requireValue(providerError?.lastAssistantText === "", "Provider-error last Assistant text must be empty.");
  requireValue(providerError?.workerRemainedUsable === true, "Provider-error Worker was not usable after settling.");
  requireValue(providerError?.shutdown?.mechanism === "stdin-eof" && providerError?.shutdown?.close?.code === 0 && providerError?.shutdown?.close?.signal === null, "Provider-error EOF shutdown drifted.");
  exactProcessBoundaries(providerError?.worker, 0, true);
  validateExtensionEvidence(providerError, RPC_WORKER_ERROR_PROVIDER_ID, RPC_WORKER_ERROR_PROVIDER_API_ID);

  for (const pattern of [
    /\/home\/runner\//,
    /\/tmp\/zhiwei-pi-lifecycle-/,
    /\/probe\/scripts\//,
    /[A-Za-z]:\\Users\\/,
    /GITHUB_TOKEN/i,
    /authorization:\s*bearer/i,
    /cookie:/i,
    /api[_-]?key/i,
    /zhiwei-rpc-internal-faux-key/i,
  ]) {
    requireValue(!pattern.test(rawText), `RPC Worker evidence contains forbidden pattern: ${pattern}`);
  }
  requireValue(!rawText.includes('"runIdentity"'), "RPC Worker evidence must not contain an Extension run identity.");
  requireValue(!rawText.includes('"pid"'), "RPC Worker evidence must not contain process PIDs.");
  requireValue(!rawText.includes("<pi-install-dir>"), "RPC Worker evidence must not retain redacted absolute path placeholders.");
}

const maximumBytes = rpcWorkerMode
  ? RPC_WORKER_MAX_RESULT_JSON_BYTES
  : SDK_RPC_PARITY_MAX_RESULT_JSON_BYTES;
const rawText = await readBoundedRegularResult(
  inputPath,
  maximumBytes,
  rpcWorkerMode ? "RPC Worker lifecycle evidence" : "RpcClient evidence",
);
const result = JSON.parse(rawText);
if (rpcWorkerMode) {
  validateRpcWorkerLifecycle(result, rawText);
} else {
  validateSdkRpcParity(result, rawText);
}

if (violations.length > 0) {
  console.error(
    `${rpcWorkerMode ? "Pi RPC Worker lifecycle" : "Pi RpcClient messages"} result violations:\n` +
      violations.map((item) => `- ${item}`).join("\n"),
  );
  process.exit(1);
}

console.log(
  rpcWorkerMode
    ? `Pi RPC Worker lifecycle boundaries: OK (${result.capture?.contractFingerprint})`
    : `Pi RpcClient messages boundaries: OK (${result.capture?.contractFingerprint})`,
);
