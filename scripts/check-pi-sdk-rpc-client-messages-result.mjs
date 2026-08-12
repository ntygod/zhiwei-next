import { createHash } from "node:crypto";
import { lstat, open } from "node:fs/promises";
import { resolve } from "node:path";
import {
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

const inputPath = resolve(
  process.argv[2] ??
    process.env.PI_SDK_RPC_PARITY_OUTPUT ??
    "packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity.json",
);
const violations = [];

function requireValue(condition, message) {
  if (!condition) violations.push(message);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function contiguous(events, label) {
  for (let index = 0; index < events.length; index += 1) {
    requireValue(events[index]?.sequence === index + 1, `${label} sequence drifted at index ${index}.`);
  }
}

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

async function readBoundedRegularResult(path) {
  const before = await lstat(path, { bigint: true });
  if (!before.isFile() || before.isSymbolicLink()) {
    throw new Error("RpcClient evidence must be a regular file.");
  }
  if (before.size > BigInt(SDK_RPC_PARITY_MAX_RESULT_JSON_BYTES)) {
    throw new Error("RpcClient evidence exceeds its byte limit.");
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
      throw new Error("RpcClient evidence changed while it was opened.");
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
        throw new Error("RpcClient evidence exceeds its byte limit.");
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
      throw new Error("RpcClient evidence changed while it was read.");
    }
    const text = bytes.toString("utf8");
    if (!Buffer.from(text, "utf8").equals(bytes)) {
      throw new Error("RpcClient evidence must be valid UTF-8.");
    }
    return text;
  } finally {
    await handle.close();
  }
}

const rawText = await readBoundedRegularResult(inputPath);
const result = JSON.parse(rawText);
const capture = result.capture;
const rpcClient = capture?.cases?.rpcClientMessages;

requireValue(
  result.contractFingerprint === SDK_RPC_PARITY_EXPECTED_OUTER_CONTRACT_FINGERPRINT,
  "Outer contract fingerprint differs from the frozen SDK/RPC parity contract.",
);
requireValue(
  capture?.contractFingerprint === SDK_RPC_PARITY_EXPECTED_CAPTURE_CONTRACT_FINGERPRINT,
  "Nested contract fingerprint differs from the frozen SDK/RPC parity contract.",
);

requireValue(result.status === "passed", `Outer result must be passed, got ${result.status}.`);
requireValue(result.scenario === SDK_RPC_PARITY_SCENARIO, "Outer scenario drifted.");
requireValue(capture?.status === "passed", `Nested capture must be passed, got ${capture?.status}.`);
requireValue(capture?.scenario === SDK_RPC_PARITY_SCENARIO, "Nested scenario drifted.");
requireValue(capture?.contract?.prompt === SDK_RPC_PARITY_PROMPT, "Prompt drifted.");
requireValue(
  JSON.stringify(capture?.contract?.rpcClientMessagesBoundary) ===
    JSON.stringify({
      client: "published-RpcClient",
      command: "get_messages",
      phases: ["before-prompt", "after-settled"],
    }),
  "RpcClient get_messages boundary contract drifted.",
);

requireValue(Boolean(rpcClient), "Published RpcClient messages case is missing.");
requireValue(
  rpcClient?.clientSurface === "published-RpcClient",
  "Messages case must execute the published RpcClient export.",
);
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
requireValue(
  JSON.stringify(messagesAfter.map((message) => message.role)) ===
    JSON.stringify(["user", "assistant"]),
  "RpcClient getMessages() after Prompt must return user → assistant.",
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

const events = rpcClient?.events ?? [];
contiguous(events, "RpcClient Runtime events");
requireValue(events[0]?.type === "agent_start", "RpcClient Runtime trace must begin at agent_start.");
requireValue(
  events.at(-1)?.type === "agent_settled",
  "RpcClient Runtime trace must end at agent_settled before stop().",
);
requireValue(
  events.filter((event) => event.type === "agent_start").length === 1 &&
    events.filter((event) => event.type === "agent_end").length === 1 &&
    events.filter((event) => event.type === "agent_settled").length === 1,
  "RpcClient Runtime trace must contain one Agent Run and one settled boundary.",
);
requireValue(
  events.find((event) => event.type === "agent_end")?.willRetry === false,
  "RpcClient agent_end must preserve willRetry=false.",
);
requireValue(
  events
    .filter((event) => event.type === "message_update")
    .every((event) => event.hasPartial === false),
  "RpcClient Runtime message_update records must omit cumulative partial snapshots.",
);

requireValue(
  rpcClient?.shutdown?.mechanism === "RpcClient.stop" &&
    rpcClient?.shutdown?.instrumentationSurface ===
      "published-js-private-process-field" &&
    JSON.stringify(rpcClient?.shutdown?.requestedSignals) ===
      JSON.stringify([{ signal: "SIGTERM", accepted: true }]) &&
    JSON.stringify(rpcClient?.shutdown?.process?.processBoundaries) ===
      JSON.stringify([
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
      ]) &&
    rpcClient?.shutdown?.stderrPresent === false &&
    rpcClient?.shutdown?.stderrLength === 0 &&
    rpcClient?.shutdown?.stderrSha256 === sha256(""),
  "RpcClient.stop() shutdown evidence drifted.",
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

requireValue(
  capture?.comparison?.rpcClientMessagesBeforeEmpty === true,
  "Comparison must preserve empty messages before Prompt.",
);
requireValue(
  capture?.comparison?.rpcClientMessagesAfterMatchPrimary === true,
  "Published RpcClient final Messages must match the raw RPC case.",
);
requireValue(
  capture?.comparison?.rpcClientAcceptanceStateObserved === true,
  "Published RpcClient must observe the running State after Prompt acceptance.",
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
requireValue(
  !rawText.includes('"runIdentity"'),
  "RpcClient evidence must not contain the per-run Extension nonce.",
);

if (violations.length > 0) {
  console.error(
    "Pi RpcClient messages result violations:\n" +
      violations.map((item) => `- ${item}`).join("\n"),
  );
  process.exit(1);
}

console.log(
  `Pi RpcClient messages boundaries: OK (${capture.contractFingerprint})`,
);
