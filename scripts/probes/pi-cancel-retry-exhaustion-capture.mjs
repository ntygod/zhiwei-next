import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const SCHEMA_VERSION = 1;
const SCENARIO = "cancel-retry-exhaustion";
const RETRYABLE_ERROR = "overloaded_error";
const EXTERNAL_PROVIDER_PROMPTS = 0;

const ACTIVE_ABORT_PROMPT = "Stream a long response so the host can cancel after the first assistant update.";
const ACTIVE_ABORT_RESPONSE = "cancel-me-".repeat(4096);
const RETRY_ABORT_PROMPT = "Enter automatic retry backoff, then let the host cancel the pending retry.";
const RETRY_EXHAUSTION_PROMPT = "Exhaust the configured automatic retry budget.";
const UNUSED_SUCCESS = "This response must remain unused.";

const ACTIVE_ABORT_RETRY_SETTINGS = Object.freeze({ enabled: true, maxRetries: 3, baseDelayMs: 1 });
const RETRY_ABORT_SETTINGS = Object.freeze({ enabled: true, maxRetries: 3, baseDelayMs: 10_000 });
const RETRY_EXHAUSTION_SETTINGS = Object.freeze({ enabled: true, maxRetries: 2, baseDelayMs: 1 });

const installDir = resolveRequiredPath("PI_INSTALL_DIR");
const outputPath = resolve(
  process.env.PI_LIFECYCLE_OUTPUT ?? join(process.cwd(), "pi-cancel-retry-exhaustion-result.json"),
);
const workspaceDir = resolve(
  process.env.PI_LIFECYCLE_WORKSPACE ?? join(dirname(outputPath), "workspace"),
);
const agentDir = resolve(
  process.env.PI_LIFECYCLE_AGENT_DIR ?? join(dirname(outputPath), "agent"),
);

let stage = "bootstrap";
let activeSession;
const completedCases = {};

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

function addTextDigest(record, text, prefix = "text") {
  if (text === undefined) return;
  record[`${prefix}Length`] = text.length;
  record[`${prefix}Sha256`] = sha256(text);
}

function copyScalarFields(event, record) {
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
  addTextDigest(record, textFromContent(event.message.content), "messageText");
}

function sanitizeEvent(event, sequence) {
  const record = { sequence, type: event.type };
  copyScalarFields(event, record);
  addMessageSummary(event, record);
  if (event.event?.type) record.updateType = event.event.type;
  return record;
}

function sanitizeMessages(messages) {
  return messages.map((message, index) => {
    const record = {
      index,
      role: message.role,
      contentKinds: contentKinds(message.content),
    };
    if (message.stopReason !== undefined) record.stopReason = message.stopReason;
    if (message.errorMessage !== undefined) record.errorMessage = message.errorMessage;
    addTextDigest(record, textFromContent(message.content));
    return record;
  });
}

function eventTypeCounts(events) {
  const counts = {};
  for (const event of events) counts[event.type] = (counts[event.type] ?? 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}

function count(events, type) {
  return events.filter((event) => event.type === type).length;
}

function firstIndex(events, predicate) {
  return events.findIndex(predicate);
}

function lastIndex(events, predicate) {
  return events.findLastIndex(predicate);
}

function assertCase(condition, message) {
  if (!condition) throw new Error(message);
}

async function settle(promise, label) {
  try {
    await promise;
    return { status: "resolved" };
  } catch (error) {
    return { status: "rejected", error: normalizeError(error, label) };
  }
}

async function withTimeout(promise, milliseconds, label) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${milliseconds}ms.`)), milliseconds);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
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

  const codingEntry = join(codingDir, codingManifest.main ?? "dist/index.js");
  const fauxEntry = join(aiDir, "dist", "providers", "faux.js");
  const [coding, faux] = await Promise.all([
    import(pathToFileURL(codingEntry).href),
    import(pathToFileURL(fauxEntry).href),
  ]);
  return { coding, faux };
}

async function createRuntime({
  caseId,
  coding,
  faux,
  retrySettings,
  providerId,
  providerApi,
  responses,
  tokensPerSecond = 0,
  tokenSize = { min: 256, max: 256 },
  onPublicEvent,
}) {
  const caseWorkspace = join(workspaceDir, caseId);
  const caseAgentDir = join(agentDir, caseId);
  await Promise.all([
    mkdir(caseWorkspace, { recursive: true }),
    mkdir(caseAgentDir, { recursive: true }),
  ]);

  const {
    createAgentSession,
    DefaultResourceLoader,
    SessionManager,
    SettingsManager,
    ModelRuntime,
  } = coding;
  const { fauxProvider } = faux;

  for (const [name, value] of Object.entries({
    createAgentSession,
    DefaultResourceLoader,
    SessionManager,
    SettingsManager,
    ModelRuntime,
    fauxProvider,
  })) {
    if (value === undefined) throw new Error(`Required cancellation/retry export is missing: ${name}`);
  }
  if (typeof SettingsManager.inMemory !== "function") {
    throw new Error("SettingsManager.inMemory is not available in the verified Artifact.");
  }

  const sessionEvents = [];
  const extensionEvents = [];
  const lifecycleNotes = [];
  const fauxHandle = fauxProvider({
    api: providerApi,
    provider: providerId,
    tokensPerSecond,
    tokenSize,
  });
  fauxHandle.setResponses(responses);

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
        extensionEvents.push(sanitizeEvent(event, extensionEvents.length + 1));
      });
    }
  };

  const settingsManager = SettingsManager.inMemory({ retry: retrySettings });
  const resourceLoader = new DefaultResourceLoader({
    cwd: caseWorkspace,
    agentDir: caseAgentDir,
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
  const session = created.session;
  activeSession = session;
  const unsubscribe = session.subscribe((event) => {
    const record = sanitizeEvent(event, sessionEvents.length + 1);
    sessionEvents.push(record);
    onPublicEvent?.({ event, record, session });
  });

  return {
    session,
    unsubscribe,
    fauxHandle,
    sessionEvents,
    extensionEvents,
    lifecycleNotes,
    retrySettings,
    async shutdown() {
      await session.extensionRunner.emit({ type: "session_shutdown", reason: "exit" });
      lifecycleNotes.push({
        type: "shutdown-host-boundary",
        mechanism: "session.extensionRunner.emit",
        reason: "exit",
      });
      unsubscribe();
      session.dispose();
      if (activeSession === session) activeSession = undefined;
    },
  };
}

function summarizeRuntime(runtime, prompt, promptOutcome, actions) {
  const { session, fauxHandle, sessionEvents, extensionEvents, retrySettings, lifecycleNotes } = runtime;
  const publicAgentEnds = sessionEvents.filter((event) => event.type === "agent_end");
  const extensionAgentEnds = extensionEvents.filter((event) => event.type === "agent_end");
  const publicRetryStarts = sessionEvents.filter((event) => event.type === "auto_retry_start");
  const publicRetryEnds = sessionEvents.filter((event) => event.type === "auto_retry_end");
  const finalAssistant = session.messages.findLast((message) => message.role === "assistant");
  const finalText = finalAssistant ? textFromContent(finalAssistant.content) : undefined;

  return {
    prompt,
    retry: {
      settings: retrySettings,
      public: {
        startEvents: publicRetryStarts,
        endEvents: publicRetryEnds,
        agentEndWillRetry: publicAgentEnds.map((event) => event.willRetry),
      },
      extension: {
        startEvents: extensionEvents.filter((event) => event.type === "auto_retry_start"),
        endEvents: extensionEvents.filter((event) => event.type === "auto_retry_end"),
        agentEndWillRetry: extensionAgentEnds.map((event) => event.willRetry),
      },
    },
    actions,
    provider: {
      id: fauxHandle.provider.id,
      api: fauxHandle.api,
      callCount: fauxHandle.state.callCount,
      pendingResponses: fauxHandle.getPendingResponseCount(),
      promptsSentToExternalProvider: EXTERNAL_PROVIDER_PROMPTS,
    },
    outcome: {
      prompt: promptOutcome,
      sessionWasIdleBeforeShutdown: session.isIdle,
      sessionWasRetryingBeforeShutdown: session.isRetrying,
      pendingMessageCountBeforeShutdown: session.pendingMessageCount,
      messageRoles: session.messages.map((message) => message.role),
      finalMessages: sanitizeMessages(session.messages),
      finalAssistant: finalAssistant
        ? {
            stopReason: finalAssistant.stopReason,
            errorMessage: finalAssistant.errorMessage,
            contentKinds: contentKinds(finalAssistant.content),
            textLength: finalText?.length ?? 0,
            textSha256: finalText === undefined ? undefined : sha256(finalText),
          }
        : null,
    },
    counts: {
      sessionEvents: sessionEvents.length,
      extensionEvents: extensionEvents.length,
      public: eventTypeCounts(sessionEvents),
      extension: eventTypeCounts(extensionEvents),
    },
    ordering: {
      publicFirstAgentEndIndex: firstIndex(sessionEvents, (event) => event.type === "agent_end"),
      publicLastAgentEndIndex: lastIndex(sessionEvents, (event) => event.type === "agent_end"),
      publicFirstRetryStartIndex: firstIndex(sessionEvents, (event) => event.type === "auto_retry_start"),
      publicLastRetryStartIndex: lastIndex(sessionEvents, (event) => event.type === "auto_retry_start"),
      publicRetryEndIndex: firstIndex(sessionEvents, (event) => event.type === "auto_retry_end"),
      publicSettledIndex: firstIndex(sessionEvents, (event) => event.type === "agent_settled"),
      extensionSettledIndex: firstIndex(extensionEvents, (event) => event.type === "agent_settled"),
      extensionShutdownIndex: firstIndex(extensionEvents, (event) => event.type === "session_shutdown"),
    },
    sessionEvents,
    extensionEvents,
    lifecycleNotes,
  };
}

async function runActiveStreamAbort(coding, faux) {
  stage = "active-stream-abort:configure";
  const actions = [];
  let abortPromise = Promise.resolve();
  let abortTriggered = false;
  const response = faux.fauxAssistantMessage(ACTIVE_ABORT_RESPONSE, {
    stopReason: "stop",
    responseId: "zhiwei-faux-active-abort",
    timestamp: 1000,
  });

  const runtime = await createRuntime({
    caseId: "active-stream-abort",
    coding,
    faux,
    retrySettings: ACTIVE_ABORT_RETRY_SETTINGS,
    providerId: "zhiwei-active-abort-faux",
    providerApi: "zhiwei-active-abort-faux-api",
    responses: [response],
    tokensPerSecond: 0,
    tokenSize: { min: 32, max: 32 },
    onPublicEvent: ({ event, record, session }) => {
      if (
        !abortTriggered &&
        event.type === "message_update" &&
        event.message?.role === "assistant"
      ) {
        abortTriggered = true;
        const action = {
          type: "session.abort",
          triggerEvent: "message_update",
          triggerSequence: record.sequence,
          invoked: true,
          settled: false,
        };
        actions.push(action);
        abortPromise = session.abort().then(
          () => {
            action.settled = true;
            action.outcome = "resolved";
          },
          (error) => {
            action.settled = true;
            action.outcome = "rejected";
            action.error = normalizeError(error, "active-stream-abort:abort");
          },
        );
      }
    },
  });

  stage = "active-stream-abort:prompt";
  const promptOutcome = await settle(
    runtime.session.prompt(ACTIVE_ABORT_PROMPT, { source: "interactive" }),
    "active-stream-abort:prompt",
  );
  await withTimeout(abortPromise, 5_000, "active-stream-abort session.abort");

  const result = summarizeRuntime(runtime, {
    source: "interactive",
    text: ACTIVE_ABORT_PROMPT,
    responseTextLength: ACTIVE_ABORT_RESPONSE.length,
    responseTextSha256: sha256(ACTIVE_ABORT_RESPONSE),
  }, promptOutcome, actions);

  assertCase(abortTriggered, "Active-stream abort was never triggered.");
  assertCase(promptOutcome.status === "resolved", "Active-stream prompt did not resolve after abort.");
  assertCase(actions.length === 1 && actions[0].outcome === "resolved", "session.abort() did not resolve.");
  assertCase(result.provider.callCount === 1, `Active-stream abort expected one Faux call, got ${result.provider.callCount}.`);
  assertCase(result.outcome.sessionWasIdleBeforeShutdown === true, "Active-stream abort did not leave Session idle.");
  assertCase(result.outcome.sessionWasRetryingBeforeShutdown === false, "Active-stream abort left Session retrying.");
  assertCase(result.outcome.finalAssistant?.stopReason === "aborted", "Aborted Assistant message was not persisted with stopReason=aborted.");
  assertCase(result.outcome.finalAssistant.textLength > 0, "Aborted Assistant message did not preserve partial text.");
  assertCase(result.outcome.finalAssistant.textLength < ACTIVE_ABORT_RESPONSE.length, "Active-stream abort consumed the complete response.");
  assertCase(count(runtime.sessionEvents, "agent_end") === 1, "Active-stream abort must emit one public agent_end.");
  assertCase(count(runtime.sessionEvents, "agent_settled") === 1, "Active-stream abort must emit one public agent_settled.");

  stage = "active-stream-abort:shutdown";
  await runtime.shutdown();
  result.lifecycleNotes = runtime.lifecycleNotes;
  return result;
}

async function runRetryBackoffAbort(coding, faux) {
  stage = "retry-backoff-abort:configure";
  const actions = [];
  let resolveRetryStart;
  const retryStarted = new Promise((resolve) => {
    resolveRetryStart = resolve;
  });
  let retryStartSeen = false;

  const runtime = await createRuntime({
    caseId: "retry-backoff-abort",
    coding,
    faux,
    retrySettings: RETRY_ABORT_SETTINGS,
    providerId: "zhiwei-retry-abort-faux",
    providerApi: "zhiwei-retry-abort-faux-api",
    responses: [
      faux.fauxAssistantMessage("", {
        stopReason: "error",
        errorMessage: RETRYABLE_ERROR,
        responseId: "zhiwei-faux-retry-abort-error",
        timestamp: 2000,
      }),
      faux.fauxAssistantMessage(UNUSED_SUCCESS, {
        stopReason: "stop",
        responseId: "zhiwei-faux-retry-abort-unused",
        timestamp: 3000,
      }),
    ],
    onPublicEvent: ({ event, record }) => {
      if (!retryStartSeen && event.type === "auto_retry_start") {
        retryStartSeen = true;
        resolveRetryStart(record.sequence);
      }
    },
  });

  stage = "retry-backoff-abort:prompt";
  const promptPromise = settle(
    runtime.session.prompt(RETRY_ABORT_PROMPT, { source: "interactive" }),
    "retry-backoff-abort:prompt",
  );
  const triggerSequence = await withTimeout(retryStarted, 5_000, "retry-backoff-abort auto_retry_start");
  const action = {
    type: "session.abortRetry",
    triggerEvent: "auto_retry_start",
    triggerSequence,
    invoked: true,
  };
  actions.push(action);
  runtime.session.abortRetry();
  action.outcome = "returned";
  const promptOutcome = await withTimeout(promptPromise, 5_000, "retry-backoff-abort prompt settlement");

  const result = summarizeRuntime(runtime, {
    source: "interactive",
    text: RETRY_ABORT_PROMPT,
    retryableError: RETRYABLE_ERROR,
  }, promptOutcome, actions);

  const retryEnds = runtime.sessionEvents.filter((event) => event.type === "auto_retry_end");
  assertCase(retryStartSeen, "Retry backoff never emitted auto_retry_start.");
  assertCase(promptOutcome.status === "resolved", "Retry-backoff prompt did not resolve after abortRetry().");
  assertCase(result.provider.callCount === 1, `Retry abort expected one Faux call, got ${result.provider.callCount}.`);
  assertCase(result.provider.pendingResponses === 1, "Retry abort consumed the response reserved to prove no second run occurred.");
  assertCase(count(runtime.sessionEvents, "auto_retry_start") === 1, "Retry abort must emit one public auto_retry_start.");
  assertCase(count(runtime.sessionEvents, "auto_retry_end") === 1, "Retry abort must emit one public auto_retry_end.");
  assertCase(retryEnds[0]?.success === false, "Retry abort auto_retry_end must report success=false.");
  assertCase(retryEnds[0]?.finalError === "Retry cancelled", "Retry abort finalError must be Retry cancelled.");
  assertCase(result.retry.public.agentEndWillRetry.length === 1 && result.retry.public.agentEndWillRetry[0] === true, "Retry abort must preserve the preceding agent_end(willRetry=true).");
  assertCase(count(runtime.sessionEvents, "agent_settled") === 1, "Retry abort must emit one public agent_settled.");
  assertCase(result.outcome.sessionWasIdleBeforeShutdown === true, "Retry abort did not leave Session idle.");
  assertCase(result.outcome.sessionWasRetryingBeforeShutdown === false, "Retry abort left Session retrying.");

  stage = "retry-backoff-abort:shutdown";
  await runtime.shutdown();
  result.lifecycleNotes = runtime.lifecycleNotes;
  return result;
}

async function runRetryExhaustion(coding, faux) {
  stage = "retry-exhaustion:configure";
  const actions = [];
  const errorResponses = [4000, 5000, 6000].map((timestamp, index) =>
    faux.fauxAssistantMessage("", {
      stopReason: "error",
      errorMessage: RETRYABLE_ERROR,
      responseId: `zhiwei-faux-retry-exhaustion-error-${index + 1}`,
      timestamp,
    }),
  );
  const runtime = await createRuntime({
    caseId: "retry-exhaustion",
    coding,
    faux,
    retrySettings: RETRY_EXHAUSTION_SETTINGS,
    providerId: "zhiwei-retry-exhaustion-faux",
    providerApi: "zhiwei-retry-exhaustion-faux-api",
    responses: [
      ...errorResponses,
      faux.fauxAssistantMessage(UNUSED_SUCCESS, {
        stopReason: "stop",
        responseId: "zhiwei-faux-retry-exhaustion-unused",
        timestamp: 7000,
      }),
    ],
  });

  stage = "retry-exhaustion:prompt";
  const promptOutcome = await settle(
    runtime.session.prompt(RETRY_EXHAUSTION_PROMPT, { source: "interactive" }),
    "retry-exhaustion:prompt",
  );
  const result = summarizeRuntime(runtime, {
    source: "interactive",
    text: RETRY_EXHAUSTION_PROMPT,
    retryableError: RETRYABLE_ERROR,
  }, promptOutcome, actions);

  const retryEnds = runtime.sessionEvents.filter((event) => event.type === "auto_retry_end");
  assertCase(promptOutcome.status === "resolved", "Retry-exhaustion prompt did not resolve.");
  assertCase(result.provider.callCount === 3, `Retry exhaustion expected three Faux calls, got ${result.provider.callCount}.`);
  assertCase(result.provider.pendingResponses === 1, "Retry exhaustion consumed the response beyond maxRetries.");
  assertCase(count(runtime.sessionEvents, "auto_retry_start") === 2, "Retry exhaustion must emit two public auto_retry_start events.");
  assertCase(count(runtime.sessionEvents, "auto_retry_end") === 1, "Retry exhaustion must emit one terminal public auto_retry_end.");
  assertCase(retryEnds[0]?.success === false, "Retry exhaustion auto_retry_end must report success=false.");
  assertCase(retryEnds[0]?.finalError === RETRYABLE_ERROR, "Retry exhaustion finalError must preserve the provider error.");
  assertCase(
    JSON.stringify(result.retry.public.agentEndWillRetry) === JSON.stringify([true, true, false]),
    `Retry exhaustion agent_end.willRetry sequence drifted: ${JSON.stringify(result.retry.public.agentEndWillRetry)}.`,
  );
  assertCase(count(runtime.sessionEvents, "agent_settled") === 1, "Retry exhaustion must emit one public agent_settled.");
  assertCase(result.outcome.sessionWasIdleBeforeShutdown === true, "Retry exhaustion did not leave Session idle.");
  assertCase(result.outcome.sessionWasRetryingBeforeShutdown === false, "Retry exhaustion left Session retrying.");

  stage = "retry-exhaustion:shutdown";
  await runtime.shutdown();
  result.lifecycleNotes = runtime.lifecycleNotes;
  return result;
}

async function run() {
  if ((process.env.PI_LIFECYCLE_SCENARIO ?? SCENARIO) !== SCENARIO) {
    throw new Error(`Unexpected lifecycle scenario: ${process.env.PI_LIFECYCLE_SCENARIO ?? "<missing>"}`);
  }

  await Promise.all([
    mkdir(workspaceDir, { recursive: true }),
    mkdir(agentDir, { recursive: true }),
  ]);

  stage = "load-installed-modules";
  const { coding, faux } = await loadInstalledModules();

  completedCases.activeStreamAbort = await runActiveStreamAbort(coding, faux);
  completedCases.retryBackoffAbort = await runRetryBackoffAbort(coding, faux);
  completedCases.retryExhaustion = await runRetryExhaustion(coding, faux);

  const result = {
    schemaVersion: SCHEMA_VERSION,
    status: "passed",
    scenario: SCENARIO,
    package: {
      name: "@earendil-works/pi-coding-agent",
      version: "0.84.1",
    },
    cases: completedCases,
    sanitization: {
      absolutePathsIncluded: false,
      rawSessionIdIncluded: false,
      environmentDumpIncluded: false,
      credentialsIncluded: false,
      rawChainOfThoughtIncluded: false,
      fullActiveResponseIncluded: false,
    },
  };

  await writeResult(result);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

try {
  await run();
} catch (error) {
  try {
    activeSession?.dispose();
  } catch {
    // Preserve the original failure.
  }
  const failure = {
    schemaVersion: SCHEMA_VERSION,
    status: "failed",
    scenario: SCENARIO,
    error: normalizeError(error),
    completedCases,
    sanitization: {
      absolutePathsIncluded: false,
      rawSessionIdIncluded: false,
      environmentDumpIncluded: false,
      credentialsIncluded: false,
      rawChainOfThoughtIncluded: false,
      fullActiveResponseIncluded: false,
    },
  };
  await writeResult(failure);
  console.error(`Pi cancellation/retry exhaustion capture failed at ${stage}: ${failure.error.message}`);
  process.exitCode = 1;
}
