import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  SDK_RPC_PARITY_API_ID,
  SDK_RPC_PARITY_FINAL_TEXT,
  SDK_RPC_PARITY_MODEL_ID,
  SDK_RPC_PARITY_MODEL_NAME,
  SDK_RPC_PARITY_PROVIDER_ID,
  SDK_RPC_PARITY_RESPONSE_ID,
  SDK_RPC_PARITY_SCENARIO,
  SDK_RPC_PARITY_SCHEMA_VERSION,
  SDK_RPC_PARITY_TOKEN_SIZE,
  SDK_RPC_PARITY_TOKENS_PER_SECOND,
} from "./pi-sdk-rpc-parity-contract.mjs";

const installDir = resolveRequiredPath("PI_INSTALL_DIR");
const evidencePath = resolveRequiredPath("PI_RPC_EXTENSION_EVIDENCE");
const events = [];
let fauxHandle;

function resolveRequiredPath(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return resolve(value);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function textFromContent(content) {
  if (!Array.isArray(content)) return undefined;
  const text = content
    .filter((item) => item?.type === "text" && typeof item.text === "string")
    .map((item) => item.text)
    .join("");
  return text || undefined;
}

function contentKinds(content) {
  if (!Array.isArray(content)) return [];
  return content.map((item) => item?.type ?? "unknown");
}

function sanitizeEvent(event) {
  const record = { sequence: events.length + 1, type: event.type };
  for (const key of ["reason", "source", "fromExtension", "willRetry"]) {
    if (event[key] !== undefined) record[key] = event[key];
  }
  if (event.message) {
    record.messageRole = event.message.role;
    if (event.message.stopReason !== undefined) record.stopReason = event.message.stopReason;
    const kinds = contentKinds(event.message.content);
    if (kinds.length > 0) record.contentKinds = kinds;
    const text = textFromContent(event.message.content);
    if (text !== undefined) {
      record.messageTextLength = text.length;
      record.messageTextSha256 = sha256(text);
    }
  }
  if (event.assistantMessageEvent) {
    record.updateType = event.assistantMessageEvent.type;
    record.hasPartial = Object.hasOwn(event.assistantMessageEvent, "partial");
    if (typeof event.assistantMessageEvent.delta === "string") {
      record.deltaLength = event.assistantMessageEvent.delta.length;
      record.deltaSha256 = sha256(event.assistantMessageEvent.delta);
    }
  }
  return record;
}

async function writeEvidence(shutdownReason) {
  const result = {
    schemaVersion: SDK_RPC_PARITY_SCHEMA_VERSION,
    status: "passed",
    scenario: SDK_RPC_PARITY_SCENARIO,
    provider: {
      id: fauxHandle.provider.id,
      api: fauxHandle.api,
      modelId: fauxHandle.getModel().id,
      callCount: fauxHandle.state.callCount,
      pendingResponses: fauxHandle.getPendingResponseCount(),
      promptsSentToExternalProvider: 0,
    },
    shutdown: {
      observed: true,
      reason: shutdownReason,
    },
    events,
    sanitization: {
      absolutePathsIncluded: false,
      rawSessionIdIncluded: false,
      rawSessionFileIncluded: false,
      environmentDumpIncluded: false,
      credentialsIncluded: false,
      rawChainOfThoughtIncluded: false,
    },
  };
  await mkdir(dirname(evidencePath), { recursive: true });
  await writeFile(evidencePath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
}

export default async function registerSdkRpcParityProbe(pi) {
  const fauxEntry = join(
    installDir,
    "node_modules",
    "@earendil-works",
    "pi-ai",
    "dist",
    "providers",
    "faux.js",
  );
  const { fauxProvider, fauxAssistantMessage } = await import(pathToFileURL(fauxEntry).href);
  fauxHandle = fauxProvider({
    api: SDK_RPC_PARITY_API_ID,
    provider: SDK_RPC_PARITY_PROVIDER_ID,
    models: [
      {
        id: SDK_RPC_PARITY_MODEL_ID,
        name: SDK_RPC_PARITY_MODEL_NAME,
        reasoning: false,
        input: ["text"],
        contextWindow: 128000,
        maxTokens: 4096,
      },
    ],
    tokensPerSecond: SDK_RPC_PARITY_TOKENS_PER_SECOND,
    tokenSize: {
      min: SDK_RPC_PARITY_TOKEN_SIZE,
      max: SDK_RPC_PARITY_TOKEN_SIZE,
    },
  });
  fauxHandle.setResponses([
    fauxAssistantMessage(SDK_RPC_PARITY_FINAL_TEXT, {
      stopReason: "stop",
      responseId: SDK_RPC_PARITY_RESPONSE_ID,
      timestamp: 2000,
    }),
  ]);
  pi.registerProvider(fauxHandle.provider);

  for (const eventType of [
    "session_start",
    "input",
    "before_agent_start",
    "agent_start",
    "turn_start",
    "message_start",
    "message_update",
    "message_end",
    "turn_end",
    "agent_end",
    "agent_settled",
    "session_shutdown",
  ]) {
    pi.on(eventType, async (event) => {
      events.push(sanitizeEvent(event));
      if (event.type === "session_shutdown") {
        await writeEvidence(event.reason);
      }
    });
  }
}
