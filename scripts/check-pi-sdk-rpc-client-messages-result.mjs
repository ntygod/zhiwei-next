import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  SDK_RPC_PARITY_API_ID,
  SDK_RPC_PARITY_FINAL_TEXT,
  SDK_RPC_PARITY_MODEL_ID,
  SDK_RPC_PARITY_PROMPT,
  SDK_RPC_PARITY_PROVIDER_ID,
  SDK_RPC_PARITY_SCENARIO,
} from "./probes/pi-sdk-rpc-parity-contract.mjs";

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

const rawText = await readFile(inputPath, "utf8");
const result = JSON.parse(rawText);
const capture = result.capture;
const rpcClient = capture?.cases?.rpcClientMessages;

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
    rpcClient?.shutdown?.transport === "SIGTERM" &&
    rpcClient?.shutdown?.stderrPresent === false &&
    rpcClient?.shutdown?.stderrLength === 0 &&
    rpcClient?.shutdown?.stderrSha256 === sha256(""),
  "RpcClient.stop() shutdown evidence drifted.",
);
requireValue(
  rpcClient?.extensionEvidence?.status === "passed" &&
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
