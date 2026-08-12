import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, realpathSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  SDK_RPC_API_ID,
  SDK_RPC_COMMAND_IDS,
  SDK_RPC_FINAL_TEXT,
  SDK_RPC_MODEL_ID,
  SDK_RPC_MODEL_NAME,
  SDK_RPC_PROMPT_SCENARIO,
  SDK_RPC_PROMPT_SCHEMA_VERSION,
  SDK_RPC_PROMPT_TEXT,
  SDK_RPC_PROVIDER_ID,
  SDK_RPC_RESPONSE_ID,
  SDK_RPC_TOKEN_SIZE,
  SDK_RPC_TOKENS_PER_SECOND,
} from "./pi-sdk-rpc-prompt-contract.mjs";

const installDir = resolveRequiredPath("PI_INSTALL_DIR");
const outputPath = resolve(
  process.env.PI_LIFECYCLE_OUTPUT ?? join(process.cwd(), "pi-sdk-rpc-prompt-result.json"),
);
const workspaceDir = resolve(
  process.env.PI_LIFECYCLE_WORKSPACE ?? join(dirname(outputPath), "workspace"),
);
const agentDir = resolve(
  process.env.PI_LIFECYCLE_AGENT_DIR ?? join(dirname(outputPath), "agent"),
);
const extensionPath = fileURLToPath(
  new URL("./pi-sdk-rpc-prompt-faux-extension.mjs", import.meta.url),
);

let stage = "bootstrap";
let child;
let sdkSession;
const completed = {};

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
    [extensionPath, "<rpc-extension>"],
  ]) {
    if (path) result = result.split(path).join(replacement);
  }
  return result;
}

function normalizeError(error, errorStage = stage) {
  return {
    stage: errorStage,
    name: error instanceof Error ? error.name : "Error",
    message: redactDynamicPaths(error instanceof Error ? error.message : String(error)),
  };
}

async function persist(result) {
  result.contractFingerprint = sha256(stableResult(result));
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
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
  return text === undefined
    ? undefined
    : { length: text.length, sha256: sha256(text), matchesExpected: text === SDK_RPC_FINAL_TEXT };
}

function messageSummary(message, index) {
  const text = textFromContent(message?.content);
  const summary = {
    ...(index === undefined ? {} : { index }),
    role: message?.role,
    contentKinds: contentKinds(message?.content),
  };
  if (message?.stopReason !== undefined) summary.stopReason = message.stopReason;
  if (text !== undefined) summary.text = textSummary(text);
  return summary;
}

function sanitizePublicEvent(event, sequence) {
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
  if (Array.isArray(event.toolResults)) record.toolResultCount = event.toolResults.length;
  return record;
}

function sanitizeExtensionEvent(event, sequence) {
  const record = { sequence, type: event.type };
  for (const key of ["reason", "source", "fromExtension", "willRetry"]) {
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

function cleanChildEnvironment(overrides = {}) {
  const allowed = ["PATH", "LANG", "LC_ALL", "CI", "GITHUB_ACTIONS", "NODE_OPTIONS"];
  const env = {};
  for (const key of allowed) {
    if (process.env[key] !== undefined) env[key] = process.env[key];
  }
  return { ...env, ...overrides };
}

async function loadInstalledModules() {
  const codingDir = join(installDir, "node_modules", "@earendil-works", "pi-coding-agent");
  const aiDir = join(installDir, "node_modules", "@earendil-works", "pi-ai");
  const [codingManifest, aiManifest] = await Promise.all([
    readFile(join(codingDir, "package.json"), "utf8").then(JSON.parse),
    readFile(join(aiDir, "package.json"), "utf8").then(JSON.parse),
  ]);
  if (
    codingManifest.name !== "@earendil-works/pi-coding-agent" ||
    codingManifest.version !== "0.84.1"
  ) {
    throw new Error(`Unexpected coding-agent manifest: ${codingManifest.name}@${codingManifest.version}`);
  }
  if (aiManifest.name !== "@earendil-works/pi-ai" || aiManifest.version !== "0.84.1") {
    throw new Error(`Unexpected pi-ai manifest: ${aiManifest.name}@${aiManifest.version}`);
  }
  const [coding, faux] = await Promise.all([
    import(pathToFileURL(join(codingDir, codingManifest.main ?? "dist/index.js")).href),
    import(pathToFileURL(join(aiDir, "dist", "providers", "faux.js")).href),
  ]);
  return { coding, faux };
}

async function captureSdk() {
  stage = "sdk:configure";
  const sdkWorkspace = join(workspaceDir, "sdk");
  const sdkAgentDir = join(agentDir, "sdk");
  await Promise.all([
    mkdir(sdkWorkspace, { recursive: true }),
    mkdir(sdkAgentDir, { recursive: true }),
  ]);

  const { coding, faux } = await loadInstalledModules();
  const {
    createAgentSession,
    DefaultResourceLoader,
    SessionManager,
    SettingsManager,
    ModelRuntime,
  } = coding;
  const { fauxProvider, fauxAssistantMessage } = faux;
  for (const [name, value] of Object.entries({
    createAgentSession,
    DefaultResourceLoader,
    SessionManager,
    SettingsManager,
    ModelRuntime,
    fauxProvider,
    fauxAssistantMessage,
  })) {
    if (value === undefined) throw new Error(`Required SDK/RPC export is missing: ${name}`);
  }

  const provider = fauxProvider({
    api: SDK_RPC_API_ID,
    provider: SDK_RPC_PROVIDER_ID,
    models: [
      {
        id: SDK_RPC_MODEL_ID,
        name: SDK_RPC_MODEL_NAME,
        reasoning: false,
        input: ["text"],
        contextWindow: 128000,
        maxTokens: 4096,
      },
    ],
    tokensPerSecond: SDK_RPC_TOKENS_PER_SECOND,
    tokenSize: { min: SDK_RPC_TOKEN_SIZE, max: SDK_RPC_TOKEN_SIZE },
  });
  provider.setResponses([
    fauxAssistantMessage(SDK_RPC_FINAL_TEXT, {
      stopReason: "stop",
      responseId: SDK_RPC_RESPONSE_ID,
      timestamp: 2000,
    }),
  ]);

  const publicEvents = [];
  const extensionEvents = [];
  const timeline = [];
  let firstStreamingState;
  const extensionFactory = (pi) => {
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
        extensionEvents.push(sanitizeExtensionEvent(event, extensionEvents.length + 1));
      });
    }
  };

  const settingsManager = SettingsManager.create(sdkWorkspace, sdkAgentDir);
  const resourceLoader = new DefaultResourceLoader({
    cwd: sdkWorkspace,
    agentDir: sdkAgentDir,
    settingsManager,
    extensionFactories: [extensionFactory],
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
  });
  await resourceLoader.reload();
  const modelRuntime = await ModelRuntime.create({
    authPath: join(sdkAgentDir, "auth.json"),
    modelsPath: null,
    allowModelNetwork: false,
    refreshOnCreate: false,
  });
  modelRuntime.registerNativeProvider(provider.provider);
  const created = await createAgentSession({
    cwd: sdkWorkspace,
    agentDir: sdkAgentDir,
    modelRuntime,
    model: provider.getModel(),
    thinkingLevel: "off",
    tools: [],
    resourceLoader,
    sessionManager: SessionManager.inMemory(sdkWorkspace),
    settingsManager,
    sessionStartEvent: { type: "session_start", reason: "startup" },
  });
  sdkSession = created.session;

  const unsubscribe = sdkSession.subscribe((event) => {
    const record = sanitizePublicEvent(event, publicEvents.length + 1);
    publicEvents.push(record);
    timeline.push({ sequence: timeline.length + 1, kind: "event", type: event.type });
    if (!firstStreamingState && event.type === "message_update") {
      firstStreamingState = {
        triggerEventSequence: record.sequence,
        isStreaming: sdkSession.isStreaming,
        isIdle: sdkSession.isIdle,
        messageCount: sdkSession.messages.length,
        pendingMessageCount: sdkSession.pendingMessageCount,
      };
    }
  });

  const before = {
    isStreaming: sdkSession.isStreaming,
    isIdle: sdkSession.isIdle,
    messageCount: sdkSession.messages.length,
    pendingMessageCount: sdkSession.pendingMessageCount,
  };
  const preflight = [];
  stage = "sdk:prompt";
  await sdkSession.prompt(SDK_RPC_PROMPT_TEXT, {
    source: "interactive",
    preflightResult: (success) => {
      preflight.push({
        success,
        isStreaming: sdkSession.isStreaming,
        isIdle: sdkSession.isIdle,
        messageCount: sdkSession.messages.length,
      });
      timeline.push({ sequence: timeline.length + 1, kind: "preflight", success });
    },
  });

  const finalText = sdkSession.getLastAssistantText();
  const after = {
    isStreaming: sdkSession.isStreaming,
    isIdle: sdkSession.isIdle,
    messageCount: sdkSession.messages.length,
    pendingMessageCount: sdkSession.pendingMessageCount,
    messages: sdkSession.messages.map((message, index) => messageSummary(message, index)),
    finalText: textSummary(finalText),
  };

  stage = "sdk:shutdown";
  await sdkSession.extensionRunner.emit({ type: "session_shutdown", reason: "exit" });
  unsubscribe();
  sdkSession.dispose();
  sdkSession = undefined;

  return {
    provider: {
      id: provider.provider.id,
      api: provider.api,
      modelId: provider.getModel().id,
      callCount: provider.state.callCount,
      pendingResponses: provider.getPendingResponseCount(),
      promptsSentToExternalProvider: 0,
    },
    before,
    preflight,
    firstStreamingState,
    after,
    publicEvents,
    extensionEvents,
    timeline,
    lifecycleNotes: [
      { type: "shutdown-host-boundary", mechanism: "session.extensionRunner.emit", reason: "exit" },
    ],
  };
}

function rpcExecutable() {
  const packageBin = join(installDir, "node_modules", ".bin", process.platform === "win32" ? "pi.cmd" : "pi");
  if (!existsSync(packageBin)) throw new Error(`Pi executable is missing at ${packageBin}.`);
  if (process.platform === "win32") return { executable: packageBin, prefixArgs: [] };
  const real = realpathSync(packageBin);
  return /\.(?:c?m?js)$/.test(real)
    ? { executable: process.execPath, prefixArgs: [real] }
    : { executable: packageBin, prefixArgs: [] };
}

function sanitizeRpcState(data) {
  return {
    model: data?.model ? { provider: data.model.provider, id: data.model.id, api: data.model.api } : null,
    thinkingLevel: data?.thinkingLevel,
    isStreaming: data?.isStreaming,
    isCompacting: data?.isCompacting,
    messageCount: data?.messageCount,
    pendingMessageCount: data?.pendingMessageCount,
    sessionIdPresent: typeof data?.sessionId === "string" && data.sessionId.length > 0,
    sessionFilePresent: typeof data?.sessionFile === "string" && data.sessionFile.length > 0,
  };
}

function sanitizeRpcResponse(record, sequence) {
  const output = {
    sequence,
    type: "response",
    id: record.id,
    command: record.command,
    success: record.success,
  };
  if (!record.success) output.error = record.error;
  if (record.success && record.command === "get_state") output.state = sanitizeRpcState(record.data);
  if (record.success && record.command === "get_available_models") {
    const models = record.data?.models ?? [];
    const targetModel = models.find(
      (model) => model.provider === SDK_RPC_PROVIDER_ID && model.id === SDK_RPC_MODEL_ID,
    );
    output.modelCount = models.length;
    output.targetModel = targetModel
      ? {
          provider: targetModel.provider,
          id: targetModel.id,
          api: targetModel.api,
          reasoning: targetModel.reasoning,
        }
      : null;
  }
  if (record.success && record.command === "set_model" && record.data) {
    output.model = { provider: record.data.provider, id: record.data.id, api: record.data.api };
  }
  if (record.success && record.command === "get_messages") {
    output.messages = (record.data?.messages ?? []).map((message, index) => messageSummary(message, index));
  }
  if (record.success && record.command === "get_last_assistant_text") {
    output.text = textSummary(record.data?.text ?? undefined);
  }
  return output;
}

function sanitizeRpcEvent(record, sequence) {
  return sanitizePublicEvent(record, sequence);
}

async function captureRpc() {
  stage = "rpc:configure";
  const rpcWorkspace = join(workspaceDir, "rpc");
  const rpcHome = join(agentDir, "rpc-home");
  const extensionEvidencePath = join(dirname(outputPath), "rpc-extension-evidence.json");
  await Promise.all([
    mkdir(rpcWorkspace, { recursive: true }),
    mkdir(rpcHome, { recursive: true }),
  ]);

  const { executable, prefixArgs } = rpcExecutable();
  const args = [
    ...prefixArgs,
    "--mode",
    "rpc",
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
    "--provider",
    SDK_RPC_PROVIDER_ID,
    "--model",
    SDK_RPC_MODEL_ID,
    "--thinking",
    "off",
  ];

  child = spawn(executable, args, {
    cwd: rpcWorkspace,
    env: cleanChildEnvironment({
      HOME: rpcHome,
      PI_INSTALL_DIR: installDir,
      PI_RPC_EXTENSION_EVIDENCE: extensionEvidencePath,
      AI_AGENT: "zhiwei-sdk-rpc-prompt-probe",
    }),
    stdio: ["pipe", "pipe", "pipe"],
  });

  let stdoutBuffer = "";
  let stderr = "";
  const rawRecords = [];
  const wire = [];
  const commands = [];
  const waiters = new Set();

  function notify(record) {
    for (const waiter of [...waiters]) {
      if (waiter.predicate(record)) {
        waiters.delete(waiter);
        clearTimeout(waiter.timer);
        waiter.resolve(record);
      }
    }
  }

  function waitFor(predicate, label, timeout = 15_000) {
    const existing = rawRecords.find(predicate);
    if (existing) return Promise.resolve(existing);
    return new Promise((resolvePromise, reject) => {
      const waiter = {
        predicate,
        resolve: resolvePromise,
        reject,
        timer: setTimeout(() => {
          waiters.delete(waiter);
          reject(new Error(`Timed out waiting for ${label}.`));
        }, timeout),
      };
      waiters.add(waiter);
    });
  }

  function send(command) {
    commands.push({ sequence: commands.length + 1, id: command.id, type: command.type });
    child.stdin.write(`${JSON.stringify(command)}\n`);
  }

  function response(id) {
    return waitFor(
      (record) => record.type === "response" && record.id === id,
      `RPC response ${id}`,
    );
  }

  const exitPromise = new Promise((resolvePromise, reject) => {
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      const exit = { code, signal };
      if (waiters.size > 0) {
        const error = new Error(`RPC Worker exited before ${waiters.size} awaited record(s): code=${code}, signal=${signal}.`);
        for (const waiter of [...waiters]) {
          clearTimeout(waiter.timer);
          waiter.reject(error);
        }
        waiters.clear();
      }
      resolvePromise(exit);
    });
  });

  child.stderr.on("data", (chunk) => {
    stderr = (stderr + chunk.toString("utf8")).slice(-64 * 1024);
  });
  child.stdout.on("data", (chunk) => {
    stdoutBuffer += chunk.toString("utf8");
    while (true) {
      const newlineIndex = stdoutBuffer.indexOf("\n");
      if (newlineIndex < 0) break;
      let line = stdoutBuffer.slice(0, newlineIndex);
      stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (line.length === 0) continue;
      let record;
      try {
        record = JSON.parse(line);
      } catch {
        const error = new Error(`RPC emitted invalid JSONL record of length ${line.length}.`);
        for (const waiter of [...waiters]) {
          clearTimeout(waiter.timer);
          waiter.reject(error);
        }
        waiters.clear();
        child.kill();
        return;
      }
      rawRecords.push(record);
      wire.push(
        record.type === "response"
          ? sanitizeRpcResponse(record, wire.length + 1)
          : sanitizeRpcEvent(record, wire.length + 1),
      );
      notify(record);
    }
  });

  stage = "rpc:bootstrap-commands";
  send({ id: SDK_RPC_COMMAND_IDS.availableModels, type: "get_available_models" });
  const modelsResponse = await response(SDK_RPC_COMMAND_IDS.availableModels);
  if (!modelsResponse.success) throw new Error(`get_available_models failed: ${modelsResponse.error}`);
  const registeredModel = modelsResponse.data?.models?.find(
    (model) => model.provider === SDK_RPC_PROVIDER_ID && model.id === SDK_RPC_MODEL_ID,
  );
  if (!registeredModel) throw new Error("RPC Faux model was not registered before command handling.");

  send({
    id: SDK_RPC_COMMAND_IDS.setModel,
    type: "set_model",
    provider: SDK_RPC_PROVIDER_ID,
    modelId: SDK_RPC_MODEL_ID,
  });
  const setModelResponse = await response(SDK_RPC_COMMAND_IDS.setModel);
  if (!setModelResponse.success) throw new Error(`set_model failed: ${setModelResponse.error}`);

  send({ id: SDK_RPC_COMMAND_IDS.setThinking, type: "set_thinking_level", level: "off" });
  const setThinkingResponse = await response(SDK_RPC_COMMAND_IDS.setThinking);
  if (!setThinkingResponse.success) throw new Error(`set_thinking_level failed: ${setThinkingResponse.error}`);

  send({ id: SDK_RPC_COMMAND_IDS.stateBefore, type: "get_state" });
  const stateBeforeRaw = await response(SDK_RPC_COMMAND_IDS.stateBefore);
  const stateBefore = sanitizeRpcState(stateBeforeRaw.data);

  stage = "rpc:prompt";
  send({ id: SDK_RPC_COMMAND_IDS.prompt, type: "prompt", message: SDK_RPC_PROMPT_TEXT });
  const promptResponseRaw = await response(SDK_RPC_COMMAND_IDS.prompt);
  if (!promptResponseRaw.success) throw new Error(`RPC prompt preflight failed: ${promptResponseRaw.error}`);
  const promptResponseWireIndex = rawRecords.indexOf(promptResponseRaw);

  send({ id: SDK_RPC_COMMAND_IDS.stateDuring, type: "get_state" });
  const stateDuringRaw = await response(SDK_RPC_COMMAND_IDS.stateDuring);
  const stateDuring = sanitizeRpcState(stateDuringRaw.data);

  const settledRaw = await waitFor((record) => record.type === "agent_settled", "RPC agent_settled", 30_000);
  const settledWireIndex = rawRecords.indexOf(settledRaw);

  stage = "rpc:final-queries";
  send({ id: SDK_RPC_COMMAND_IDS.stateAfter, type: "get_state" });
  send({ id: SDK_RPC_COMMAND_IDS.messagesAfter, type: "get_messages" });
  send({ id: SDK_RPC_COMMAND_IDS.lastTextAfter, type: "get_last_assistant_text" });
  const [stateAfterRaw, messagesAfterRaw, lastTextAfterRaw] = await Promise.all([
    response(SDK_RPC_COMMAND_IDS.stateAfter),
    response(SDK_RPC_COMMAND_IDS.messagesAfter),
    response(SDK_RPC_COMMAND_IDS.lastTextAfter),
  ]);
  const stateAfter = sanitizeRpcState(stateAfterRaw.data);
  const messagesAfter = (messagesAfterRaw.data?.messages ?? []).map((message, index) =>
    messageSummary(message, index),
  );
  const lastTextAfter = textSummary(lastTextAfterRaw.data?.text ?? undefined);

  stage = "rpc:eof-shutdown";
  child.stdin.end();
  const exit = await Promise.race([
    exitPromise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("RPC Worker did not exit after stdin EOF.")), 15_000)),
  ]);
  child = undefined;
  const extensionEvidence = JSON.parse(await readFile(extensionEvidencePath, "utf8"));

  return {
    commandLine: {
      mode: "rpc",
      noSession: true,
      noTools: true,
      offline: true,
      explicitExtension: true,
      automaticExtensionDiscoveryDisabled: true,
    },
    commands,
    responses: {
      availableModels: sanitizeRpcResponse(modelsResponse, 1),
      setModel: sanitizeRpcResponse(setModelResponse, 2),
      setThinking: sanitizeRpcResponse(setThinkingResponse, 3),
      prompt: sanitizeRpcResponse(promptResponseRaw, 4),
    },
    stateBefore,
    stateDuring,
    stateAfter,
    messagesAfter,
    lastTextAfter,
    wire,
    ordering: {
      promptResponseWireIndex,
      settledWireIndex,
      promptResponseBeforeSettled:
        promptResponseWireIndex >= 0 && settledWireIndex > promptResponseWireIndex,
      eventCountAfterPromptResponseBeforeSettled:
        settledWireIndex > promptResponseWireIndex
          ? rawRecords
              .slice(promptResponseWireIndex + 1, settledWireIndex)
              .filter((record) => record.type !== "response").length
          : 0,
    },
    wireSemantics: {
      responseRecordsWithIds: wire.filter((record) => record.type === "response").every((record) =>
        typeof record.id === "string",
      ),
      runtimeEventsWithIds: rawRecords
        .filter((record) => record.type !== "response")
        .some((record) => Object.hasOwn(record, "id")),
      messageUpdatesContainPartial: rawRecords
        .filter((record) => record.type === "message_update")
        .some((record) => Object.hasOwn(record.assistantMessageEvent ?? {}, "partial")),
    },
    extensionEvidence,
    worker: {
      exitCode: exit.code,
      signal: exit.signal,
      stdinClosedByHost: true,
      stdoutRemainderLength: stdoutBuffer.length,
      stderrPresent: stderr.length > 0,
      stderrLength: stderr.length,
      stderrSha256: sha256(stderr),
    },
  };
}

function publicProjection(events) {
  return events
    .filter((event) =>
      [
        "agent_start",
        "turn_start",
        "message_start",
        "message_end",
        "turn_end",
        "agent_end",
        "agent_settled",
      ].includes(event.type),
    )
    .map((event) => ({
      type: event.type,
      ...(event.message?.role ? { messageRole: event.message.role } : {}),
      ...(event.message?.stopReason ? { stopReason: event.message.stopReason } : {}),
      ...(event.willRetry !== undefined ? { willRetry: event.willRetry } : {}),
    }));
}

async function run() {
  if ((process.env.PI_LIFECYCLE_SCENARIO ?? SDK_RPC_PROMPT_SCENARIO) !== SDK_RPC_PROMPT_SCENARIO) {
    throw new Error(
      `Unexpected lifecycle scenario: ${process.env.PI_LIFECYCLE_SCENARIO ?? "<missing>"}`,
    );
  }
  await Promise.all([
    mkdir(workspaceDir, { recursive: true }),
    mkdir(agentDir, { recursive: true }),
  ]);

  completed.sdk = await captureSdk();
  completed.rpc = await captureRpc();

  const rpcEvents = completed.rpc.wire.filter((record) => record.type !== "response");
  const sdkProjection = publicProjection(completed.sdk.publicEvents);
  const rpcProjection = publicProjection(rpcEvents);
  const result = {
    schemaVersion: SDK_RPC_PROMPT_SCHEMA_VERSION,
    status: "passed",
    scenario: SDK_RPC_PROMPT_SCENARIO,
    contract: {
      prompt: SDK_RPC_PROMPT_TEXT,
      finalText: textSummary(SDK_RPC_FINAL_TEXT),
      provider: SDK_RPC_PROVIDER_ID,
      api: SDK_RPC_API_ID,
      modelId: SDK_RPC_MODEL_ID,
      responseId: SDK_RPC_RESPONSE_ID,
      tokensPerSecond: SDK_RPC_TOKENS_PER_SECOND,
      tokenSize: SDK_RPC_TOKEN_SIZE,
    },
    cases: completed,
    comparison: {
      sdkProjection,
      rpcProjection,
      projectionsEqual: JSON.stringify(sdkProjection) === JSON.stringify(rpcProjection),
      finalTextEqual:
        completed.sdk.after.finalText?.sha256 === completed.rpc.lastTextAfter?.sha256 &&
        completed.sdk.after.finalText?.length === completed.rpc.lastTextAfter?.length,
      finalMessageRolesEqual:
        JSON.stringify(completed.sdk.after.messages.map((message) => message.role)) ===
        JSON.stringify(completed.rpc.messagesAfter.map((message) => message.role)),
      rpcPromptResponseIsAcceptanceBoundary:
        completed.rpc.ordering.promptResponseBeforeSettled &&
        completed.rpc.ordering.eventCountAfterPromptResponseBeforeSettled > 0,
      rpcObservedStreamingState: completed.rpc.stateDuring.isStreaming === true,
      sdkObservedStreamingState: completed.sdk.firstStreamingState?.isStreaming === true,
      rpcWireUsesDeltaOnlyUpdates:
        completed.rpc.wireSemantics.messageUpdatesContainPartial === false,
      workerShutdownAfterSettled:
        completed.rpc.ordering.settledWireIndex >= 0 &&
        completed.rpc.worker.exitCode === 0 &&
        completed.rpc.extensionEvidence.shutdown?.reason === "exit",
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

  const requirements = [
    [completed.sdk.provider.callCount === 1, "SDK must consume exactly one Faux response."],
    [completed.sdk.provider.pendingResponses === 0, "SDK Faux response must be fully consumed."],
    [completed.sdk.preflight.length === 1 && completed.sdk.preflight[0].success === true, "SDK preflight must succeed exactly once."],
    [completed.sdk.firstStreamingState?.isStreaming === true, "SDK did not expose a streaming state during message updates."],
    [completed.sdk.after.isIdle === true && completed.sdk.after.isStreaming === false, "SDK prompt did not settle at an idle boundary."],
    [completed.sdk.after.finalText?.matchesExpected === true, "SDK final text drifted."],
    [completed.rpc.responses.prompt.success === true, "RPC prompt response must report success."],
    [completed.rpc.stateBefore.isStreaming === false, "RPC initial state must not be streaming."],
    [completed.rpc.stateDuring.isStreaming === true, "RPC state after Prompt acceptance must observe streaming."],
    [completed.rpc.stateAfter.isStreaming === false, "RPC final state must not be streaming."],
    [completed.rpc.lastTextAfter?.matchesExpected === true, "RPC final text drifted."],
    [completed.rpc.ordering.promptResponseBeforeSettled === true, "RPC Prompt response must precede agent_settled."],
    [completed.rpc.ordering.eventCountAfterPromptResponseBeforeSettled > 0, "RPC Prompt response did not precede continuing Runtime events."],
    [completed.rpc.wireSemantics.messageUpdatesContainPartial === false, "RPC message_update leaked cumulative partial snapshots."],
    [completed.rpc.worker.exitCode === 0 && completed.rpc.worker.signal === null, "RPC Worker did not exit cleanly after stdin EOF."],
    [completed.rpc.extensionEvidence.shutdown?.reason === "exit", "RPC Extension did not observe shutdown(reason=exit)."],
    [completed.rpc.extensionEvidence.provider?.callCount === 1, "RPC Faux provider must consume exactly one response."],
    [result.comparison.projectionsEqual === true, "SDK and RPC semantic event projections differ."],
    [result.comparison.finalTextEqual === true, "SDK and RPC final text differs."],
    [result.comparison.finalMessageRolesEqual === true, "SDK and RPC final message roles differ."],
  ];
  const failed = requirements.find(([ok]) => !ok);
  if (failed) throw new Error(failed[1]);

  await persist(result);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

try {
  await run();
} catch (error) {
  try {
    sdkSession?.dispose();
  } catch {
    // Preserve original failure.
  }
  try {
    if (child && !child.killed) child.kill();
  } catch {
    // Preserve original failure.
  }
  const failure = {
    schemaVersion: SDK_RPC_PROMPT_SCHEMA_VERSION,
    status: "failed",
    scenario: SDK_RPC_PROMPT_SCENARIO,
    error: normalizeError(error),
    completed,
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
  console.error(`Pi SDK/RPC Prompt capture failed at ${stage}: ${failure.error.message}`);
  process.exitCode = 1;
}
