import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  PI_PACKAGE_NAME,
  PI_PACKAGE_VERSION,
  SDK_RPC_PARITY_FINAL_TEXT,
  SDK_RPC_PARITY_MODEL_ID,
  SDK_RPC_PARITY_PROMPT,
  SDK_RPC_PARITY_PROVIDER_ID,
  SDK_RPC_PARITY_SCENARIO,
  SDK_RPC_PARITY_SCHEMA_VERSION,
} from "./pi-sdk-rpc-parity-contract.mjs";

const installDir = resolveRequiredPath("PI_INSTALL_DIR");
const outputPath = resolve(
  process.env.PI_LIFECYCLE_OUTPUT ?? join(process.cwd(), "pi-sdk-rpc-parity-result.json"),
);
const workspaceDir = resolve(
  process.env.PI_LIFECYCLE_WORKSPACE ?? join(dirname(outputPath), "workspace"),
);
const agentDir = resolve(
  process.env.PI_LIFECYCLE_AGENT_DIR ?? join(dirname(outputPath), "agent"),
);
const primaryCapturePath = fileURLToPath(
  new URL("./pi-sdk-rpc-parity-capture.mjs", import.meta.url),
);
const extensionPath = fileURLToPath(
  new URL("./pi-sdk-rpc-parity-faux-extension.mjs", import.meta.url),
);

let stage = "bootstrap";
let client;
let primary;

function resolveRequiredPath(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return resolve(value);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function stableResult(result) {
  const clone = structuredClone(result);
  delete clone.contractFingerprint;
  return JSON.stringify(clone);
}

function redactDynamicPaths(value) {
  let result = String(value);
  for (const [path, replacement] of [
    [installDir, "<pi-install-dir>"],
    [workspaceDir, "<workspace-dir>"],
    [agentDir, "<agent-dir>"],
    [dirname(outputPath), "<output-dir>"],
    [primaryCapturePath, "<primary-capture>"],
    [extensionPath, "<rpc-extension>"],
  ]) {
    if (path) result = result.split(path).join(replacement);
  }
  return result;
}

function normalizeError(error) {
  return {
    stage,
    name: error instanceof Error ? error.name : "Error",
    message: redactDynamicPaths(error instanceof Error ? error.message : String(error)),
  };
}

async function persist(result) {
  result.contractFingerprint = sha256(stableResult(result));
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
}

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}

function contentKinds(content) {
  if (!Array.isArray(content)) return [];
  return content.map((item) => item?.type ?? "unknown");
}

function textFromContent(content) {
  if (!Array.isArray(content)) return undefined;
  const text = content
    .filter((item) => item?.type === "text" && typeof item.text === "string")
    .map((item) => item.text)
    .join("");
  return text || undefined;
}

function textSummary(text) {
  return text === undefined || text === null
    ? undefined
    : {
        length: text.length,
        sha256: sha256(text),
        matchesExpected: text === SDK_RPC_PARITY_FINAL_TEXT,
      };
}

function messageSummary(message, index) {
  const text = textFromContent(message?.content);
  const summary = {
    index,
    role: message?.role,
    contentKinds: contentKinds(message?.content),
  };
  if (message?.stopReason !== undefined) summary.stopReason = message.stopReason;
  if (text !== undefined) summary.text = textSummary(text);
  return summary;
}

function sanitizeState(state) {
  return {
    model: state?.model
      ? { provider: state.model.provider, id: state.model.id, api: state.model.api }
      : null,
    thinkingLevel: state?.thinkingLevel,
    isStreaming: state?.isStreaming,
    isCompacting: state?.isCompacting,
    messageCount: state?.messageCount,
    pendingMessageCount: state?.pendingMessageCount,
    sessionIdPresent: typeof state?.sessionId === "string" && state.sessionId.length > 0,
    sessionFilePresent: typeof state?.sessionFile === "string" && state.sessionFile.length > 0,
  };
}

function sanitizeEvent(event, sequence) {
  const record = { sequence, type: event.type };
  for (const key of ["willRetry", "reason", "attempt", "success", "finalError"]) {
    if (event[key] !== undefined) record[key] = event[key];
  }
  if (event.message) record.message = messageSummary(event.message);
  if (event.assistantMessageEvent) {
    record.updateType = event.assistantMessageEvent.type;
    record.hasPartial = Object.hasOwn(event.assistantMessageEvent, "partial");
    if (typeof event.assistantMessageEvent.delta === "string") {
      record.delta = textSummary(event.assistantMessageEvent.delta);
    }
  }
  return record;
}

function runPrimaryCapture() {
  stage = "primary:capture";
  const primaryOutput = join(dirname(outputPath), "primary-sdk-rpc-parity.json");
  const result = spawnSync(process.execPath, [primaryCapturePath], {
    cwd: join(workspaceDir, "primary"),
    env: {
      ...process.env,
      PI_LIFECYCLE_OUTPUT: primaryOutput,
      PI_LIFECYCLE_WORKSPACE: join(workspaceDir, "primary"),
      PI_LIFECYCLE_AGENT_DIR: join(agentDir, "primary"),
      PI_LIFECYCLE_SCENARIO: SDK_RPC_PARITY_SCENARIO,
    },
    encoding: "utf8",
    timeout: 180_000,
    maxBuffer: 16 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${process.execPath} ${primaryCapturePath} exited ${result.status}: ${(result.stderr || result.stdout || "").trim()}`,
    );
  }
  return primaryOutput;
}

async function captureRpcClientMessages() {
  stage = "rpc-client:configure";
  const codingDir = join(installDir, "node_modules", "@earendil-works", "pi-coding-agent");
  const codingManifest = JSON.parse(await readFile(join(codingDir, "package.json"), "utf8"));
  requireValue(
    codingManifest.name === PI_PACKAGE_NAME && codingManifest.version === PI_PACKAGE_VERSION,
    `Unexpected coding-agent manifest: ${codingManifest.name}@${codingManifest.version}`,
  );
  const coding = await import(
    pathToFileURL(join(codingDir, codingManifest.main ?? "dist/index.js")).href
  );
  requireValue(typeof coding.RpcClient === "function", "Published RpcClient export is missing.");

  const rpcWorkspace = join(workspaceDir, "rpc-client-messages");
  const rpcHome = join(agentDir, "rpc-client-messages-home");
  const extensionEvidencePath = join(
    dirname(outputPath),
    "rpc-client-messages-extension-evidence.json",
  );
  await Promise.all([
    mkdir(rpcWorkspace, { recursive: true }),
    mkdir(rpcHome, { recursive: true }),
  ]);

  client = new coding.RpcClient({
    cliPath: join(codingDir, "dist", "cli.js"),
    cwd: rpcWorkspace,
    env: {
      HOME: rpcHome,
      PI_INSTALL_DIR: installDir,
      PI_RPC_EXTENSION_EVIDENCE: extensionEvidencePath,
      AI_AGENT: "zhiwei-sdk-rpc-client-messages-probe",
      CI: process.env.CI ?? "true",
      GITHUB_ACTIONS: process.env.GITHUB_ACTIONS ?? "true",
    },
    provider: SDK_RPC_PARITY_PROVIDER_ID,
    model: SDK_RPC_PARITY_MODEL_ID,
    args: [
      "--no-session",
      "--no-tools",
      "--no-extensions",
      "--extension",
      extensionPath,
      "--no-skills",
      "--no-prompt-templates",
      "--no-themes",
      "--no-context-files",
      "--offline",
      "--approve",
      "--thinking",
      "off",
    ],
  });

  stage = "rpc-client:start";
  await client.start();

  stage = "rpc-client:before";
  const [stateBeforeRaw, messagesBeforeRaw] = await Promise.all([
    client.getState(),
    client.getMessages(),
  ]);
  const stateBefore = sanitizeState(stateBeforeRaw);
  const messagesBefore = messagesBeforeRaw.map((message, index) => messageSummary(message, index));

  stage = "rpc-client:prompt";
  const eventsPromise = client.collectEvents(30_000);
  await client.prompt(SDK_RPC_PARITY_PROMPT);
  const stateAfterAcceptance = sanitizeState(await client.getState());
  const events = (await eventsPromise).map((event, index) => sanitizeEvent(event, index + 1));

  stage = "rpc-client:after";
  const [stateAfterRaw, messagesAfterRaw, lastTextAfterRaw] = await Promise.all([
    client.getState(),
    client.getMessages(),
    client.getLastAssistantText(),
  ]);
  const stateAfter = sanitizeState(stateAfterRaw);
  const messagesAfter = messagesAfterRaw.map((message, index) => messageSummary(message, index));
  const lastTextAfter = textSummary(lastTextAfterRaw);

  stage = "rpc-client:stop";
  await client.stop();
  const stderr = client.getStderr();
  client = undefined;

  requireValue(
    existsSync(extensionEvidencePath),
    "RpcClient Extension evidence was not durable after stop().",
  );
  const extensionEvidence = JSON.parse(await readFile(extensionEvidencePath, "utf8"));

  const eventTypes = events.map((event) => event.type);
  requireValue(
    stateBefore.isStreaming === false && stateBefore.messageCount === 0,
    "RpcClient initial State must be empty and not streaming.",
  );
  requireValue(messagesBefore.length === 0, "RpcClient getMessages() before Prompt must return [].");
  requireValue(
    stateAfterAcceptance.isStreaming === true && stateAfterAcceptance.messageCount === 1,
    "RpcClient State after Prompt acceptance must observe the running boundary.",
  );
  requireValue(eventTypes.includes("agent_start"), "RpcClient event stream is missing agent_start.");
  requireValue(eventTypes.includes("agent_settled"), "RpcClient event stream is missing agent_settled.");
  requireValue(
    stateAfter.isStreaming === false &&
      stateAfter.messageCount === 2 &&
      stateAfter.pendingMessageCount === 0,
    "RpcClient final State must be settled with two Messages.",
  );
  requireValue(
    JSON.stringify(messagesAfter.map((message) => message.role)) ===
      JSON.stringify(["user", "assistant"]),
    "RpcClient getMessages() after Prompt must return user → assistant.",
  );
  requireValue(lastTextAfter?.matchesExpected === true, "RpcClient final Assistant text drifted.");
  requireValue(stderr.length === 0, "RpcClient wrote unexpected stderr.");
  requireValue(
    extensionEvidence?.provider?.callCount === 1 &&
      extensionEvidence?.provider?.pendingResponses === 0 &&
      extensionEvidence?.provider?.promptsSentToExternalProvider === 0,
    "RpcClient Faux Provider evidence drifted.",
  );

  return {
    clientSurface: "published-RpcClient",
    before: {
      state: stateBefore,
      messages: messagesBefore,
    },
    acceptance: {
      promptReturned: true,
      state: stateAfterAcceptance,
    },
    after: {
      state: stateAfter,
      messages: messagesAfter,
      lastAssistantText: lastTextAfter,
    },
    events,
    extensionEvidence,
    shutdown: {
      mechanism: "RpcClient.stop",
      transport: "SIGTERM",
      stderrPresent: false,
      stderrLength: 0,
      stderrSha256: sha256(""),
    },
    sanitization: {
      absolutePathsIncluded: false,
      rawSessionIdIncluded: false,
      rawSessionFileIncluded: false,
      environmentDumpIncluded: false,
      credentialsIncluded: false,
      rawChainOfThoughtIncluded: false,
      rawStderrIncluded: false,
    },
  };
}

async function run() {
  if (
    (process.env.PI_LIFECYCLE_SCENARIO ?? SDK_RPC_PARITY_SCENARIO) !==
    SDK_RPC_PARITY_SCENARIO
  ) {
    throw new Error(
      `Unexpected lifecycle scenario: ${process.env.PI_LIFECYCLE_SCENARIO ?? "<missing>"}`,
    );
  }
  await Promise.all([
    mkdir(workspaceDir, { recursive: true }),
    mkdir(agentDir, { recursive: true }),
  ]);

  const primaryOutput = runPrimaryCapture();
  primary = JSON.parse(await readFile(primaryOutput, "utf8"));
  requireValue(primary.status === "passed", "Primary SDK/RPC parity capture did not pass.");

  const rpcClientMessages = await captureRpcClientMessages();
  primary.contract.rpcClientMessagesBoundary = {
    client: "published-RpcClient",
    command: "get_messages",
    phases: ["before-prompt", "after-settled"],
  };
  primary.cases.rpcClientMessages = rpcClientMessages;
  primary.comparison.rpcClientMessagesBeforeEmpty =
    rpcClientMessages.before.messages.length === 0;
  primary.comparison.rpcClientMessagesAfterMatchPrimary =
    JSON.stringify(rpcClientMessages.after.messages.map((message) => message.role)) ===
      JSON.stringify(primary.cases.rpc.messagesAfter.map((message) => message.role)) &&
    rpcClientMessages.after.lastAssistantText?.sha256 ===
      primary.cases.rpc.lastTextAfter?.sha256;
  primary.comparison.rpcClientAcceptanceStateObserved =
    rpcClientMessages.acceptance.state.isStreaming === true;

  delete primary.contractFingerprint;
  await persist(primary);
  await rm(primaryOutput, { force: true });
  process.stdout.write(`${JSON.stringify(primary)}\n`);
}

try {
  await run();
} catch (error) {
  try {
    await client?.stop();
  } catch {
    // Preserve the original failure.
  }
  const failure = {
    schemaVersion: SDK_RPC_PARITY_SCHEMA_VERSION,
    status: "failed",
    scenario: SDK_RPC_PARITY_SCENARIO,
    error: normalizeError(error),
    completed: primary ? { primary } : {},
    sanitization: {
      absolutePathsIncluded: false,
      rawSessionIdIncluded: false,
      rawSessionFileIncluded: false,
      environmentDumpIncluded: false,
      credentialsIncluded: false,
      rawChainOfThoughtIncluded: false,
      rawStderrIncluded: false,
    },
  };
  await persist(failure);
  console.error(`Pi SDK/RPC composite capture failed at ${stage}: ${failure.error.message}`);
  process.exitCode = 1;
}