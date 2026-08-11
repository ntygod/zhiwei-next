import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const SCHEMA_VERSION = 1;
const SCENARIO = "retry-success";
const PROMPT_TEXT = "Recover from one transient provider error, then answer with Retry recovered.";
const FINAL_TEXT = "Retry recovered.";
const RETRYABLE_ERROR = "overloaded_error";
const EXTERNAL_PROVIDER_PROMPTS = 0;
const RETRY_SETTINGS = Object.freeze({
  enabled: true,
  maxRetries: 3,
  baseDelayMs: 1,
});

const installDir = resolveRequiredPath("PI_INSTALL_DIR");
const outputPath = resolve(
  process.env.PI_LIFECYCLE_OUTPUT ?? join(process.cwd(), "pi-retry-lifecycle-result.json"),
);
const workspaceDir = resolve(
  process.env.PI_LIFECYCLE_WORKSPACE ?? join(dirname(outputPath), "workspace"),
);
const agentDir = resolve(
  process.env.PI_LIFECYCLE_AGENT_DIR ?? join(dirname(outputPath), "agent"),
);

let stage = "bootstrap";
const sessionEvents = [];
const extensionEvents = [];
const lifecycleNotes = [];
let session;

function resolveRequiredPath(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return resolve(value);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
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

function normalizeError(error) {
  return {
    name: error instanceof Error ? error.name : "Error",
    message: redactDynamicPaths(error instanceof Error ? error.message : String(error)),
    stage,
  };
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

function copyScalarFields(event, record) {
  for (const key of [
    "toolCallId",
    "toolName",
    "isError",
    "reason",
    "willRetry",
    "attempt",
    "maxAttempts",
    "delayMs",
    "success",
    "errorMessage",
    "finalError",
    "source",
    "fromExtension",
  ]) {
    if (event[key] !== undefined) record[key] = event[key];
  }
}

function addMessageSummary(event, record) {
  if (!event.message) return;
  record.messageRole = event.message.role;
  if (event.message.stopReason !== undefined) record.stopReason = event.message.stopReason;
  if (event.message.errorMessage !== undefined) record.messageError = event.message.errorMessage;
  const kinds = contentKinds(event.message.content);
  if (kinds.length > 0) record.contentKinds = kinds;
}

function sanitizeSessionEvent(event) {
  const record = { sequence: sessionEvents.length + 1, type: event.type };
  copyScalarFields(event, record);
  addMessageSummary(event, record);
  if (event.event?.type) record.updateType = event.event.type;
  if (event.result?.content) {
    record.resultKinds = contentKinds(event.result.content);
    const text = textFromContent(event.result.content);
    if (text) record.resultText = text;
  }
  return record;
}

function sanitizeExtensionEvent(event) {
  const record = { sequence: extensionEvents.length + 1, type: event.type };
  copyScalarFields(event, record);
  addMessageSummary(event, record);
  if (event.input !== undefined) record.input = structuredClone(event.input);
  if (event.result?.content) {
    record.resultKinds = contentKinds(event.result.content);
    const text = textFromContent(event.result.content);
    if (text) record.resultText = text;
  }
  if (event.content) {
    const kinds = contentKinds(event.content);
    if (kinds.length > 0) record.contentKinds = kinds;
  }
  return record;
}

function stableResult(result) {
  const clone = structuredClone(result);
  delete clone.contractFingerprint;
  return JSON.stringify(clone);
}

async function writeResult(result) {
  result.contractFingerprint = sha256(stableResult(result));
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
}

async function loadInstalledModules() {
  const codingDir = join(
    installDir,
    "node_modules",
    "@earendil-works",
    "pi-coding-agent",
  );
  const aiDir = join(installDir, "node_modules", "@earendil-works", "pi-ai");
  const [codingManifest, aiManifest] = await Promise.all([
    readFile(join(codingDir, "package.json"), "utf8").then(JSON.parse),
    readFile(join(aiDir, "package.json"), "utf8").then(JSON.parse),
  ]);
  if (
    codingManifest.name !== "@earendil-works/pi-coding-agent" ||
    codingManifest.version !== "0.84.1"
  ) {
    throw new Error(
      `Unexpected coding-agent manifest: ${codingManifest.name}@${codingManifest.version}`,
    );
  }
  if (aiManifest.name !== "@earendil-works/pi-ai" || aiManifest.version !== "0.84.1") {
    throw new Error(`Unexpected pi-ai manifest: ${aiManifest.name}@${aiManifest.version}`);
  }
  const codingEntry = join(codingDir, codingManifest.main ?? "dist/index.js");
  const fauxEntry = join(aiDir, "dist", "providers", "faux.js");
  const [coding, faux] = await Promise.all([
    import(pathToFileURL(codingEntry).href),
    import(pathToFileURL(fauxEntry).href),
  ]);
  return { coding, faux };
}

function firstIndex(events, type) {
  return events.findIndex((event) => event.type === type);
}

function lastIndex(events, type) {
  return events.findLastIndex((event) => event.type === type);
}

async function run() {
  if ((process.env.PI_LIFECYCLE_SCENARIO ?? SCENARIO) !== SCENARIO) {
    throw new Error(
      `Unexpected lifecycle scenario: ${process.env.PI_LIFECYCLE_SCENARIO ?? "<missing>"}`,
    );
  }

  await mkdir(workspaceDir, { recursive: true });
  await mkdir(agentDir, { recursive: true });

  stage = "load-installed-modules";
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
    if (value === undefined) throw new Error(`Required retry lifecycle export is missing: ${name}`);
  }
  if (typeof SettingsManager.inMemory !== "function") {
    throw new Error("SettingsManager.inMemory is not available in the verified Artifact.");
  }

  stage = "configure-faux-provider";
  const fauxHandle = fauxProvider({
    api: "zhiwei-retry-faux-api",
    provider: "zhiwei-retry-faux",
    tokensPerSecond: 0,
    tokenSize: { min: 256, max: 256 },
  });
  fauxHandle.setResponses([
    fauxAssistantMessage("", {
      stopReason: "error",
      errorMessage: RETRYABLE_ERROR,
      responseId: "zhiwei-faux-response-transient-error",
      timestamp: 1000,
    }),
    fauxAssistantMessage(FINAL_TEXT, {
      stopReason: "stop",
      responseId: "zhiwei-faux-response-recovered",
      timestamp: 2000,
    }),
  ]);

  stage = "configure-extension";
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
    "auto_retry_start",
    "auto_retry_end",
    "session_shutdown",
  ];
  const extensionFactory = (pi) => {
    for (const eventType of extensionEventTypes) {
      pi.on(eventType, async (event) => {
        extensionEvents.push(sanitizeExtensionEvent(event));
      });
    }
  };

  stage = "configure-runtime";
  const settingsManager = SettingsManager.inMemory({ retry: RETRY_SETTINGS });
  const resourceLoader = new DefaultResourceLoader({
    cwd: workspaceDir,
    agentDir,
    settingsManager,
    extensionFactories: [extensionFactory],
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
  });
  await resourceLoader.reload();
  const extensionLoad = resourceLoader.getExtensions();
  if (extensionLoad.errors.length > 0) {
    throw new Error(`Inline extension failed to load: ${JSON.stringify(extensionLoad.errors)}`);
  }

  const modelRuntime = await ModelRuntime.create({
    authPath: join(agentDir, "auth.json"),
    modelsPath: null,
    allowModelNetwork: false,
    refreshOnCreate: false,
  });
  modelRuntime.registerNativeProvider(fauxHandle.provider);

  stage = "create-agent-session";
  const created = await createAgentSession({
    cwd: workspaceDir,
    agentDir,
    modelRuntime,
    model: fauxHandle.getModel(),
    thinkingLevel: "off",
    tools: [],
    resourceLoader,
    sessionManager: SessionManager.inMemory(workspaceDir),
    settingsManager,
    sessionStartEvent: { type: "session_start", reason: "startup" },
  });
  session = created.session;
  const unsubscribe = session.subscribe((event) => {
    sessionEvents.push(sanitizeSessionEvent(event));
  });

  stage = "prompt";
  await session.prompt(PROMPT_TEXT, { source: "interactive" });

  const finalText = session.getLastAssistantText();
  const messageRoles = session.messages.map((message) => message.role);
  const sessionWasIdleBeforeShutdown = session.isIdle;
  const sessionWasRetryingBeforeShutdown = session.isRetrying;

  stage = "session-shutdown";
  await session.extensionRunner.emit({ type: "session_shutdown", reason: "exit" });
  lifecycleNotes.push({
    type: "shutdown-host-boundary",
    mechanism: "session.extensionRunner.emit",
    reason: "exit",
  });
  unsubscribe();
  session.dispose();
  session = undefined;

  stage = "validate-capture";
  const publicRetryStarts = sessionEvents.filter((event) => event.type === "auto_retry_start");
  const publicRetryEnds = sessionEvents.filter((event) => event.type === "auto_retry_end");
  const publicAgentEnds = sessionEvents.filter((event) => event.type === "agent_end");
  const publicAgentSettled = sessionEvents.filter((event) => event.type === "agent_settled");
  const extensionRetryStarts = extensionEvents.filter((event) => event.type === "auto_retry_start");
  const extensionRetryEnds = extensionEvents.filter((event) => event.type === "auto_retry_end");
  const extensionAgentEnds = extensionEvents.filter((event) => event.type === "agent_end");
  const extensionAgentSettled = extensionEvents.filter((event) => event.type === "agent_settled");
  const extensionShutdowns = extensionEvents.filter((event) => event.type === "session_shutdown");

  const publicFirstAgentEndIndex = firstIndex(sessionEvents, "agent_end");
  const publicLastAgentEndIndex = lastIndex(sessionEvents, "agent_end");
  const publicRetryStartIndex = firstIndex(sessionEvents, "auto_retry_start");
  const publicRetryEndIndex = firstIndex(sessionEvents, "auto_retry_end");
  const publicSettledIndex = firstIndex(sessionEvents, "agent_settled");
  const extensionSettledIndex = firstIndex(extensionEvents, "agent_settled");
  const extensionShutdownIndex = firstIndex(extensionEvents, "session_shutdown");

  const result = {
    schemaVersion: SCHEMA_VERSION,
    status: "passed",
    scenario: SCENARIO,
    package: {
      name: "@earendil-works/pi-coding-agent",
      version: "0.84.1",
    },
    provider: {
      id: fauxHandle.provider.id,
      api: fauxHandle.api,
      callCount: fauxHandle.state.callCount,
      pendingResponses: fauxHandle.getPendingResponseCount(),
      promptsSentToExternalProvider: EXTERNAL_PROVIDER_PROMPTS,
    },
    prompt: {
      source: "interactive",
      text: PROMPT_TEXT,
    },
    retry: {
      settings: RETRY_SETTINGS,
      retryableError: RETRYABLE_ERROR,
      public: {
        startEvents: publicRetryStarts,
        endEvents: publicRetryEnds,
        agentEndWillRetry: publicAgentEnds.map((event) => event.willRetry),
      },
      extension: {
        startEvents: extensionRetryStarts,
        endEvents: extensionRetryEnds,
        agentEndWillRetry: extensionAgentEnds.map((event) => event.willRetry),
      },
    },
    outcome: {
      finalText,
      expectedFinalText: FINAL_TEXT,
      messageRoles,
      sessionWasIdleBeforeShutdown,
      sessionWasRetryingBeforeShutdown,
    },
    counts: {
      sessionEvents: sessionEvents.length,
      extensionEvents: extensionEvents.length,
      publicRetryStarts: publicRetryStarts.length,
      publicRetryEnds: publicRetryEnds.length,
      publicAgentEnds: publicAgentEnds.length,
      publicAgentSettled: publicAgentSettled.length,
      extensionRetryStarts: extensionRetryStarts.length,
      extensionRetryEnds: extensionRetryEnds.length,
      extensionAgentEnds: extensionAgentEnds.length,
      extensionAgentSettled: extensionAgentSettled.length,
      extensionSessionShutdowns: extensionShutdowns.length,
    },
    ordering: {
      public: {
        firstAgentEndIndex: publicFirstAgentEndIndex,
        retryStartIndex: publicRetryStartIndex,
        retryEndIndex: publicRetryEndIndex,
        finalAgentEndIndex: publicLastAgentEndIndex,
        settledIndex: publicSettledIndex,
        retryStartBeforeSettled:
          publicRetryStartIndex >= 0 && publicRetryStartIndex < publicSettledIndex,
        retryEndBeforeSettled:
          publicRetryEndIndex >= 0 && publicRetryEndIndex < publicSettledIndex,
        finalAgentEndBeforeSettled:
          publicLastAgentEndIndex >= 0 && publicLastAgentEndIndex < publicSettledIndex,
      },
      extension: {
        settledIndex: extensionSettledIndex,
        shutdownIndex: extensionShutdownIndex,
        settledBeforeShutdown:
          extensionSettledIndex >= 0 && extensionSettledIndex < extensionShutdownIndex,
      },
    },
    sessionEvents,
    extensionEvents,
    lifecycleNotes,
    sanitization: {
      absolutePathsIncluded: false,
      rawSessionIdIncluded: false,
      environmentDumpIncluded: false,
      credentialsIncluded: false,
      rawChainOfThoughtIncluded: false,
    },
  };

  const assertions = [
    [finalText === FINAL_TEXT, `Unexpected final text: ${finalText}`],
    [fauxHandle.state.callCount === 2, `Expected two Faux calls, got ${fauxHandle.state.callCount}`],
    [fauxHandle.getPendingResponseCount() === 0, "Faux responses were not fully consumed."],
    [sessionWasIdleBeforeShutdown === true, "Session was not idle when prompt resolved."],
    [sessionWasRetryingBeforeShutdown === false, "Session was still retrying when prompt resolved."],
    [publicRetryStarts.length === 1, `Expected one public retry start, got ${publicRetryStarts.length}`],
    [publicRetryStarts[0]?.attempt === 1, "Public retry start attempt must be 1."],
    [publicRetryStarts[0]?.maxAttempts === 3, "Public retry maxAttempts must be 3."],
    [publicRetryStarts[0]?.delayMs === 1, "Public retry delayMs must be 1."],
    [publicRetryStarts[0]?.errorMessage === RETRYABLE_ERROR, "Public retry error message drifted."],
    [publicRetryEnds.length === 1, `Expected one public retry end, got ${publicRetryEnds.length}`],
    [publicRetryEnds[0]?.success === true, "Public retry end must report success."],
    [publicRetryEnds[0]?.attempt === 1, "Public retry end attempt must be 1."],
    [
      JSON.stringify(publicAgentEnds.map((event) => event.willRetry)) ===
        JSON.stringify([true, false]),
      `Unexpected public agent_end willRetry sequence: ${JSON.stringify(publicAgentEnds)}`,
    ],
    [publicAgentSettled.length === 1, `Expected one public agent_settled, got ${publicAgentSettled.length}`],
    [extensionShutdowns.length === 1, `Expected one extension session_shutdown, got ${extensionShutdowns.length}`],
    [result.ordering.public.retryStartBeforeSettled, "Retry start did not precede final settled boundary."],
    [result.ordering.public.retryEndBeforeSettled, "Retry end did not precede final settled boundary."],
    [result.ordering.public.finalAgentEndBeforeSettled, "Final agent_end did not precede settled."],
    [result.ordering.extension.settledBeforeShutdown, "Extension settled did not precede shutdown."],
  ];
  const failure = assertions.find(([ok]) => !ok);
  if (failure) throw new Error(failure[1]);

  await writeResult(result);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

try {
  await run();
} catch (error) {
  try {
    session?.dispose();
  } catch {
    // Preserve the original failure.
  }
  const failure = {
    schemaVersion: SCHEMA_VERSION,
    status: "failed",
    scenario: SCENARIO,
    error: normalizeError(error),
    sessionEvents,
    extensionEvents,
    lifecycleNotes,
    sanitization: {
      absolutePathsIncluded: false,
      rawSessionIdIncluded: false,
      environmentDumpIncluded: false,
      credentialsIncluded: false,
      rawChainOfThoughtIncluded: false,
    },
  };
  await writeResult(failure);
  console.error(`Pi retry lifecycle capture failed at ${stage}: ${failure.error.message}`);
  process.exitCode = 1;
}
