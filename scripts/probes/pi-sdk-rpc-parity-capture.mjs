import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCHEMA_VERSION = 1;
const SCENARIO = "sdk-rpc-parity";
const PROMPT = "Return the deterministic Pi SDK and RPC parity response.";
const RESPONSE = "Pi SDK and RPC parity complete.";
const EXTERNAL_PROVIDER_PROMPTS = 0;
const SERVER_READY = "ZHIWEI_RPC_SERVER_READY";
const SERVER_METRICS = "ZHIWEI_RPC_SERVER_METRICS ";
const SERVER_ERROR = "ZHIWEI_RPC_SERVER_ERROR ";
const THIS_FILE = fileURLToPath(import.meta.url);

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

let stage = "bootstrap";
let activeSession;
const partial = {};

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
  ]) {
    if (path) result = result.split(path).join(replacement);
  }
  return result;
}

function normalizeError(error, errorStage = stage) {
  return {
    name: error instanceof Error ? error.name : "Error",
    message: redactDynamicPaths(error instanceof Error ? error.message : String(error)),
    stage: errorStage,
  };
}

async function writeResult(result) {
  result.contractFingerprint = sha256(stableResult(result));
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
}

function textFromContent(content) {
  if (typeof content === "string") return content;
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

function sanitizeMessage(message, index) {
  const record = {
    index,
    role: message.role,
  };
  if (message.stopReason !== undefined) record.stopReason = message.stopReason;
  if (message.errorMessage !== undefined) record.errorMessage = message.errorMessage;
  const kinds = contentKinds(message.content);
  if (kinds.length > 0) record.contentKinds = kinds;
  const text = textFromContent(message.content);
  if (text !== undefined) {
    record.text = text;
    record.textSha256 = sha256(text);
  }
  return record;
}

function sanitizeSdkEvent(event, sequence) {
  const record = { sequence, type: event.type };
  for (const key of [
    "reason",
    "willRetry",
    "attempt",
    "maxAttempts",
    "delayMs",
    "success",
    "errorMessage",
    "finalError",
    "source",
  ]) {
    if (event[key] !== undefined) record[key] = event[key];
  }
  if (event.message) {
    record.messageRole = event.message.role;
    if (event.message.stopReason !== undefined) record.stopReason = event.message.stopReason;
    const text = textFromContent(event.message.content);
    if (text !== undefined) record.messageText = text;
    const kinds = contentKinds(event.message.content);
    if (kinds.length > 0) record.contentKinds = kinds;
  }
  return record;
}

function aliasFactory(prefix) {
  const aliases = new Map();
  return (value) => {
    if (!aliases.has(value)) aliases.set(value, `${prefix}-${aliases.size + 1}`);
    return aliases.get(value);
  };
}

const aliasSessionId = aliasFactory("session");
const aliasPath = aliasFactory("path");

function sanitizeRpcValue(value, key = "", seen = new WeakSet()) {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    const lower = key.toLowerCase();
    if (lower.includes("sessionid") || lower === "session_id") return aliasSessionId(value);
    if (
      lower.endsWith("path") ||
      lower.endsWith("file") ||
      lower.includes("sessionfile") ||
      value.includes(workspaceDir) ||
      value.includes(agentDir) ||
      value.includes(installDir)
    ) {
      return aliasPath(redactDynamicPaths(value));
    }
    return redactDynamicPaths(value);
  }
  if (typeof value === "number") {
    const lower = key.toLowerCase();
    if (lower.includes("timestamp") || lower.endsWith("at") || lower.includes("time")) {
      return "<time>";
    }
    return value;
  }
  if (typeof value !== "object") return value;
  if (seen.has(value)) return "<cycle>";
  seen.add(value);
  if (Array.isArray(value)) {
    const result = value.map((item) => sanitizeRpcValue(item, key, seen));
    seen.delete(value);
    return result;
  }
  const result = {};
  for (const [childKey, childValue] of Object.entries(value)) {
    const lower = childKey.toLowerCase();
    if (
      lower === "createdat" ||
      lower === "updatedat" ||
      lower === "timestamp" ||
      lower === "startedat" ||
      lower === "completedat"
    ) {
      result[childKey] = "<time>";
      continue;
    }
    result[childKey] = sanitizeRpcValue(childValue, childKey, seen);
  }
  seen.delete(value);
  return result;
}

function visitObjects(value, visitor, seen = new WeakSet()) {
  if (!value || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  visitor(value);
  if (Array.isArray(value)) {
    for (const item of value) visitObjects(item, visitor, seen);
  } else {
    for (const item of Object.values(value)) visitObjects(item, visitor, seen);
  }
}

function deepHasType(value, type) {
  let found = false;
  visitObjects(value, (candidate) => {
    if (candidate.type === type) found = true;
  });
  return found;
}

function deepContainsString(value, expected) {
  if (typeof value === "string") return value.includes(expected);
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some((item) => deepContainsString(item, expected));
  return Object.values(value).some((item) => deepContainsString(item, expected));
}

function extractRecordId(record) {
  if (typeof record?.id === "string") return record.id;
  let result;
  visitObjects(record, (candidate) => {
    if (result === undefined && typeof candidate.id === "string") result = candidate.id;
  });
  return result;
}

function eventTypeCounts(records) {
  const counts = {};
  for (const record of records) {
    const types = new Set();
    visitObjects(record, (candidate) => {
      if (typeof candidate.type === "string") types.add(candidate.type);
    });
    for (const type of types) counts[type] = (counts[type] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

function waitFor(predicate, timeoutMs, label) {
  const started = Date.now();
  return new Promise((resolvePromise, rejectPromise) => {
    const interval = setInterval(() => {
      try {
        const value = predicate();
        if (value) {
          clearInterval(interval);
          resolvePromise(value);
          return;
        }
        if (Date.now() - started > timeoutMs) {
          clearInterval(interval);
          rejectPromise(new Error(`${label} timed out after ${timeoutMs}ms.`));
        }
      } catch (error) {
        clearInterval(interval);
        rejectPromise(error);
      }
    }, 10);
  });
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
  return { coding, faux, codingDir, codingManifest };
}

async function createFauxSession({
  coding,
  faux,
  caseId,
  providerId,
  providerApi,
  responseId,
  extensionEvents,
}) {
  const caseWorkspace = join(workspaceDir, caseId);
  const caseAgentDir = join(agentDir, caseId);
  await Promise.all([mkdir(caseWorkspace, { recursive: true }), mkdir(caseAgentDir, { recursive: true })]);

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
    if (value === undefined) throw new Error(`Required SDK/RPC parity export is missing: ${name}`);
  }

  const fauxHandle = fauxProvider({
    api: providerApi,
    provider: providerId,
    tokensPerSecond: 0,
    tokenSize: { min: 256, max: 256 },
  });
  fauxHandle.setResponses([
    fauxAssistantMessage(RESPONSE, {
      stopReason: "stop",
      responseId,
      timestamp: 1000,
    }),
  ]);

  const extensionEventTypes = [
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
  ];
  const extensionFactory = (pi) => {
    for (const eventType of extensionEventTypes) {
      pi.on(eventType, async (event) => {
        extensionEvents?.push(sanitizeSdkEvent(event, extensionEvents.length + 1));
      });
    }
  };

  const settingsManager =
    typeof SettingsManager.inMemory === "function"
      ? SettingsManager.inMemory({})
      : SettingsManager.create(caseWorkspace, caseAgentDir);
  const resourceLoader = new DefaultResourceLoader({
    cwd: caseWorkspace,
    agentDir: caseAgentDir,
    settingsManager,
    extensionFactories: extensionEvents ? [extensionFactory] : [],
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
  });
  await resourceLoader.reload();
  const extensionLoad = resourceLoader.getExtensions();
  if (extensionLoad.errors.length > 0) {
    throw new Error(`Inline parity extension failed to load: ${JSON.stringify(extensionLoad.errors)}`);
  }

  const modelRuntime = await ModelRuntime.create({
    authPath: join(caseAgentDir, "auth.json"),
    modelsPath: null,
    allowModelNetwork: false,
    refreshOnCreate: false,
  });
  modelRuntime.registerNativeProvider(fauxHandle.provider);
  const created = await createAgentSession({
    cwd: caseWorkspace,
    agentDir: caseAgentDir,
    modelRuntime,
    model: fauxHandle.getModel(),
    thinkingLevel: "off",
    tools: [],
    resourceLoader,
    sessionManager: SessionManager.inMemory(caseWorkspace),
    settingsManager,
    sessionStartEvent: { type: "session_start", reason: "startup" },
  });
  return { session: created.session, fauxHandle };
}

async function runSdk(coding, faux) {
  stage = "sdk:create-session";
  const events = [];
  const extensionEvents = [];
  const { session, fauxHandle } = await createFauxSession({
    coding,
    faux,
    caseId: "sdk",
    providerId: "zhiwei-sdk-parity-faux",
    providerApi: "zhiwei-sdk-parity-faux-api",
    responseId: "zhiwei-sdk-parity-response",
    extensionEvents,
  });
  activeSession = session;
  const unsubscribe = session.subscribe((event) => {
    events.push(sanitizeSdkEvent(event, events.length + 1));
  });

  stage = "sdk:prompt";
  await session.prompt(PROMPT, { source: "interactive" });
  const beforeShutdown = {
    isIdle: session.isIdle,
    pendingMessageCount: session.pendingMessageCount,
    finalText: session.getLastAssistantText(),
    messages: session.messages.map(sanitizeMessage),
  };
  stage = "sdk:shutdown";
  await session.extensionRunner.emit({ type: "session_shutdown", reason: "exit" });
  unsubscribe();
  session.dispose();
  activeSession = undefined;

  return {
    provider: {
      id: fauxHandle.provider.id,
      api: fauxHandle.api,
      callCount: fauxHandle.state.callCount,
      pendingResponses: fauxHandle.getPendingResponseCount(),
      promptsSentToExternalProvider: EXTERNAL_PROVIDER_PROMPTS,
    },
    outcome: beforeShutdown,
    events,
    extensionEvents,
    counts: {
      events: events.length,
      extensionEvents: extensionEvents.length,
      agentStarts: events.filter((event) => event.type === "agent_start").length,
      agentEnds: events.filter((event) => event.type === "agent_end").length,
      agentSettled: events.filter((event) => event.type === "agent_settled").length,
      extensionShutdowns: extensionEvents.filter((event) => event.type === "session_shutdown").length,
    },
  };
}

async function runRpcServer(coding, faux) {
  const extensionEvents = [];
  const { session, fauxHandle } = await createFauxSession({
    coding,
    faux,
    caseId: "rpc-server",
    providerId: "zhiwei-rpc-parity-faux",
    providerApi: "zhiwei-rpc-parity-faux-api",
    responseId: "zhiwei-rpc-parity-response",
    extensionEvents,
  });
  activeSession = session;
  if (typeof coding.runRpcMode !== "function") {
    throw new Error("runRpcMode is not exported by the pinned Artifact.");
  }
  process.stderr.write(`${SERVER_READY}\n`);
  await coding.runRpcMode(session);
  const metrics = {
    provider: {
      id: fauxHandle.provider.id,
      api: fauxHandle.api,
      callCount: fauxHandle.state.callCount,
      pendingResponses: fauxHandle.getPendingResponseCount(),
      promptsSentToExternalProvider: EXTERNAL_PROVIDER_PROMPTS,
    },
    outcome: {
      isIdle: session.isIdle,
      pendingMessageCount: session.pendingMessageCount,
      finalText: session.getLastAssistantText(),
      messages: session.messages.map(sanitizeMessage),
    },
    extensionEvents,
  };
  process.stderr.write(`${SERVER_METRICS}${JSON.stringify(metrics)}\n`);
  session.dispose();
  activeSession = undefined;
}

async function runRpc(coding, codingManifest) {
  stage = "rpc:spawn";
  const records = [];
  const parseErrors = [];
  const stderrLines = [];
  let stdoutBuffer = "";
  let stderrBuffer = "";
  let ready = false;
  let serverMetrics;

  const child = spawn(process.execPath, [THIS_FILE, "--rpc-server"], {
    cwd: workspaceDir,
    env: {
      ...process.env,
      PI_INSTALL_DIR: installDir,
      PI_LIFECYCLE_OUTPUT: join(dirname(outputPath), "rpc-server-unused.json"),
      PI_LIFECYCLE_WORKSPACE: workspaceDir,
      PI_LIFECYCLE_AGENT_DIR: agentDir,
      ZHIWEI_RPC_SERVER: "true",
    },
    stdio: ["pipe", "pipe", "pipe"],
  });

  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdoutBuffer += chunk;
    while (true) {
      const lineEnd = stdoutBuffer.indexOf("\n");
      if (lineEnd < 0) break;
      let line = stdoutBuffer.slice(0, lineEnd);
      stdoutBuffer = stdoutBuffer.slice(lineEnd + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (!line.trim()) continue;
      try {
        records.push({
          sequence: records.length + 1,
          value: sanitizeRpcValue(JSON.parse(line)),
        });
      } catch (error) {
        parseErrors.push({ lineSha256: sha256(line), error: normalizeError(error, "rpc:parse-stdout") });
      }
    }
  });
  child.stderr.on("data", (chunk) => {
    stderrBuffer += chunk;
    while (true) {
      const lineEnd = stderrBuffer.indexOf("\n");
      if (lineEnd < 0) break;
      const line = stderrBuffer.slice(0, lineEnd);
      stderrBuffer = stderrBuffer.slice(lineEnd + 1);
      if (line === SERVER_READY) {
        ready = true;
      } else if (line.startsWith(SERVER_METRICS)) {
        serverMetrics = JSON.parse(line.slice(SERVER_METRICS.length));
      } else if (line.startsWith(SERVER_ERROR)) {
        stderrLines.push(line);
      } else if (line.trim()) {
        stderrLines.push(redactDynamicPaths(line));
      }
    }
  });

  const writeCommand = (command) => {
    child.stdin.write(`${JSON.stringify(command)}\n`);
  };
  const hasResponse = (id) => records.some((record) => extractRecordId(record.value) === id);

  await waitFor(() => ready, 10_000, "RPC server ready");
  stage = "rpc:get-state-before";
  writeCommand({ type: "get_state", id: "rpc-state-before" });
  await waitFor(() => hasResponse("rpc-state-before"), 5_000, "RPC get_state before response");

  stage = "rpc:get-messages-before";
  writeCommand({ type: "get_messages", id: "rpc-messages-before" });
  await waitFor(() => hasResponse("rpc-messages-before"), 5_000, "RPC get_messages before response");

  stage = "rpc:prompt";
  writeCommand({ type: "prompt", message: PROMPT, id: "rpc-prompt-1" });
  await waitFor(() => hasResponse("rpc-prompt-1"), 5_000, "RPC prompt acceptance response");
  await waitFor(
    () => records.some((record) => deepHasType(record.value, "agent_end")),
    10_000,
    "RPC agent_end",
  );

  stage = "rpc:get-state-after";
  writeCommand({ type: "get_state", id: "rpc-state-after" });
  await waitFor(() => hasResponse("rpc-state-after"), 5_000, "RPC get_state after response");

  stage = "rpc:get-messages-after";
  writeCommand({ type: "get_messages", id: "rpc-messages-after" });
  await waitFor(() => hasResponse("rpc-messages-after"), 5_000, "RPC get_messages after response");

  stage = "rpc:close-stdin";
  child.stdin.end();
  const exit = await new Promise((resolvePromise, rejectPromise) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      rejectPromise(new Error("RPC child did not exit after stdin EOF."));
    }, 10_000);
    child.once("error", (error) => {
      clearTimeout(timer);
      rejectPromise(error);
    });
    child.once("exit", (code, signal) => {
      clearTimeout(timer);
      resolvePromise({ code, signal });
    });
  });

  if (stdoutBuffer.trim()) {
    parseErrors.push({
      lineSha256: sha256(stdoutBuffer),
      error: { name: "FramingError", message: "RPC stdout ended without LF.", stage: "rpc:eof" },
    });
  }
  if (stderrBuffer.trim()) stderrLines.push(redactDynamicPaths(stderrBuffer.trim()));

  const promptResponseIndex = records.findIndex(
    (record) => extractRecordId(record.value) === "rpc-prompt-1",
  );
  const agentEndIndex = records.findIndex((record) => deepHasType(record.value, "agent_end"));
  const responseTextObserved = records.some((record) => deepContainsString(record.value, RESPONSE));

  return {
    surface: {
      runRpcModeType: typeof coding.runRpcMode,
      runRpcModeArity: coding.runRpcMode?.length,
      rpcClientType: typeof coding.RpcClient,
      rpcClientPrototypeMethods:
        typeof coding.RpcClient === "function"
          ? Object.getOwnPropertyNames(coding.RpcClient.prototype).sort()
          : [],
      packageMain: codingManifest.main,
    },
    commands: [
      { sequence: 1, type: "get_state", id: "rpc-state-before" },
      { sequence: 2, type: "get_messages", id: "rpc-messages-before" },
      { sequence: 3, type: "prompt", id: "rpc-prompt-1", message: PROMPT },
      { sequence: 4, type: "get_state", id: "rpc-state-after" },
      { sequence: 5, type: "get_messages", id: "rpc-messages-after" },
    ],
    records,
    parseErrors,
    stderrLines,
    exit,
    metrics: serverMetrics,
    counts: {
      records: records.length,
      eventTypes: eventTypeCounts(records.map((record) => record.value)),
      promptResponses: records.filter(
        (record) => extractRecordId(record.value) === "rpc-prompt-1",
      ).length,
      agentEnds: records.filter((record) => deepHasType(record.value, "agent_end")).length,
    },
    ordering: {
      promptResponseIndex,
      agentEndIndex,
      promptResponseBeforeAgentEnd:
        promptResponseIndex >= 0 && agentEndIndex >= 0 && promptResponseIndex < agentEndIndex,
    },
    responseTextObserved,
  };
}

async function runCapture() {
  if ((process.env.PI_LIFECYCLE_SCENARIO ?? SCENARIO) !== SCENARIO) {
    throw new Error(`Unexpected lifecycle scenario: ${process.env.PI_LIFECYCLE_SCENARIO ?? "<missing>"}`);
  }
  await Promise.all([mkdir(workspaceDir, { recursive: true }), mkdir(agentDir, { recursive: true })]);
  stage = "load-installed-modules";
  const { coding, faux, codingDir, codingManifest } = await loadInstalledModules();

  partial.surface = {
    packageRoot: "@earendil-works/pi-coding-agent",
    packageVersion: codingManifest.version,
    packageMain: codingManifest.main,
    rootExportPresence: {
      createAgentSession: typeof coding.createAgentSession,
      runRpcMode: typeof coding.runRpcMode,
      RpcClient: typeof coding.RpcClient,
    },
    rpcImplementationFiles: [
      join(codingDir, "dist", "modes", "rpc", "rpc-mode.js"),
      join(codingDir, "dist", "modes", "rpc", "rpc-client.js"),
      join(codingDir, "dist", "modes", "rpc", "rpc-types.js"),
    ].map((path) => redactDynamicPaths(path)),
  };

  partial.sdk = await runSdk(coding, faux);
  partial.rpc = await runRpc(coding, codingManifest);

  const assertions = [
    [partial.sdk.provider.callCount === 1, "SDK must consume exactly one Faux response."],
    [partial.sdk.provider.pendingResponses === 0, "SDK Faux response must be fully consumed."],
    [partial.sdk.outcome.finalText === RESPONSE, "SDK final text differs from the parity response."],
    [partial.sdk.outcome.isIdle === true, "SDK Session must be idle after prompt."],
    [partial.sdk.counts.agentStarts === 1, "SDK must emit one agent_start."],
    [partial.sdk.counts.agentEnds === 1, "SDK must emit one agent_end."],
    [partial.sdk.counts.agentSettled === 1, "SDK must emit one agent_settled."],
    [partial.rpc.exit.code === 0 && partial.rpc.exit.signal === null, "RPC child must exit cleanly."],
    [partial.rpc.parseErrors.length === 0, "RPC stdout must be valid LF-delimited JSONL."],
    [partial.rpc.stderrLines.length === 0, "RPC child emitted unexpected stderr."],
    [partial.rpc.metrics?.provider?.callCount === 1, "RPC must consume exactly one Faux response."],
    [partial.rpc.metrics?.provider?.pendingResponses === 0, "RPC Faux response must be fully consumed."],
    [partial.rpc.metrics?.outcome?.finalText === RESPONSE, "RPC final text differs from the parity response."],
    [partial.rpc.metrics?.outcome?.isIdle === true, "RPC Session must be idle after prompt."],
    [partial.rpc.counts.promptResponses === 1, "RPC prompt must have exactly one correlated response."],
    [partial.rpc.counts.agentEnds === 1, "RPC must expose one agent_end record."],
    [partial.rpc.ordering.promptResponseBeforeAgentEnd, "RPC prompt response must precede agent_end."],
    [partial.rpc.responseTextObserved, "RPC records must expose the deterministic final response."],
    [
      deepContainsString(partial.rpc.records, RESPONSE) &&
        partial.sdk.outcome.messages.some((message) => message.text === RESPONSE),
      "SDK and RPC must expose the same final Assistant content.",
    ],
  ];
  const failure = assertions.find(([ok]) => !ok);
  if (failure) throw new Error(failure[1]);

  const result = {
    schemaVersion: SCHEMA_VERSION,
    status: "passed",
    scenario: SCENARIO,
    prompt: PROMPT,
    expectedResponse: RESPONSE,
    sourceSurface: {
      sdk: "AgentSession.subscribe",
      rpc: "runRpcMode JSONL over child stdin/stdout",
    },
    ...partial,
    sanitization: {
      absolutePathsIncluded: false,
      rawSessionIdIncluded: false,
      environmentDumpIncluded: false,
      credentialsIncluded: false,
      rawChainOfThoughtIncluded: false,
      timestampsNormalized: true,
    },
  };
  await writeResult(result);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv.includes("--rpc-server") || process.env.ZHIWEI_RPC_SERVER === "true") {
  try {
    stage = "rpc-server:load-modules";
    const { coding, faux } = await loadInstalledModules();
    stage = "rpc-server:run";
    await runRpcServer(coding, faux);
  } catch (error) {
    process.stderr.write(`${SERVER_ERROR}${JSON.stringify(normalizeError(error))}\n`);
    process.exitCode = 1;
  }
} else {
  try {
    await runCapture();
  } catch (error) {
    try {
      activeSession?.dispose();
    } catch {
      // Preserve original failure.
    }
    const failure = {
      schemaVersion: SCHEMA_VERSION,
      status: "failed",
      scenario: SCENARIO,
      error: normalizeError(error),
      partial,
      sanitization: {
        absolutePathsIncluded: false,
        rawSessionIdIncluded: false,
        environmentDumpIncluded: false,
        credentialsIncluded: false,
        rawChainOfThoughtIncluded: false,
        timestampsNormalized: true,
      },
    };
    await writeResult(failure);
    console.error(`Pi SDK/RPC parity capture failed at ${stage}: ${failure.error.message}`);
    process.exitCode = 1;
  }
}
