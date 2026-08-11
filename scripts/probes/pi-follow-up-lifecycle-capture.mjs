import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const SCHEMA_VERSION = 1;
const SCENARIO = "follow-up-queue";
const INITIAL_PROMPT = "Produce the first response before processing the queued follow-up.";
const FOLLOW_UP_PROMPT = "Process the queued follow-up now.";
const FIRST_RESPONSE = "First response complete.";
const FOLLOW_UP_RESPONSE = "Follow-up response complete.";
const EXTERNAL_PROVIDER_PROMPTS = 0;

const installDir = resolveRequiredPath("PI_INSTALL_DIR");
const outputPath = resolve(
  process.env.PI_LIFECYCLE_OUTPUT ?? join(process.cwd(), "pi-follow-up-lifecycle-result.json"),
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
const followUpActions = [];
const lifecycleNotes = [];
let session;
let followUpPromise;
let followUpQueued = false;

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

function addMessageSummary(event, record) {
  if (!event.message) return;
  record.messageRole = event.message.role;
  if (event.message.stopReason !== undefined) record.stopReason = event.message.stopReason;
  const kinds = contentKinds(event.message.content);
  if (kinds.length > 0) record.contentKinds = kinds;
  const text = textFromContent(event.message.content);
  if (text) record.messageText = text;
}

function sanitizeSessionEvent(event) {
  const record = { sequence: sessionEvents.length + 1, type: event.type };
  for (const key of ["reason", "willRetry", "source"]) {
    if (event[key] !== undefined) record[key] = event[key];
  }
  if (event.type === "queue_update") {
    record.steering = [...event.steering];
    record.followUp = [...event.followUp];
  }
  addMessageSummary(event, record);
  return record;
}

function sanitizeExtensionEvent(event) {
  const record = { sequence: extensionEvents.length + 1, type: event.type };
  for (const key of ["reason", "source", "fromExtension"]) {
    if (event[key] !== undefined) record[key] = event[key];
  }
  addMessageSummary(event, record);
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

function count(events, type) {
  return events.filter((event) => event.type === type).length;
}

function firstIndex(events, predicate) {
  return events.findIndex(predicate);
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
    if (value === undefined) {
      throw new Error(`Required follow-up lifecycle export is missing: ${name}`);
    }
  }

  stage = "configure-faux-provider";
  const fauxHandle = fauxProvider({
    api: "zhiwei-follow-up-faux-api",
    provider: "zhiwei-follow-up-faux",
    tokensPerSecond: 0,
    tokenSize: { min: 256, max: 256 },
  });
  fauxHandle.setResponses([
    fauxAssistantMessage(FIRST_RESPONSE, {
      stopReason: "stop",
      responseId: "zhiwei-faux-response-first",
      timestamp: 1000,
    }),
    fauxAssistantMessage(FOLLOW_UP_RESPONSE, {
      stopReason: "stop",
      responseId: "zhiwei-faux-response-follow-up",
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
  const settingsManager = SettingsManager.create(workspaceDir, agentDir);
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
    const record = sanitizeSessionEvent(event);
    sessionEvents.push(record);

    if (
      !followUpQueued &&
      event.type === "message_start" &&
      event.message?.role === "assistant"
    ) {
      followUpQueued = true;
      const triggerSequence = record.sequence;
      followUpPromise = session.followUp(FOLLOW_UP_PROMPT);
      const queuedUpdate = sessionEvents.findLast(
        (candidate) =>
          candidate.type === "queue_update" && candidate.followUp?.includes(FOLLOW_UP_PROMPT),
      );
      followUpActions.push({
        phase: "queued",
        text: FOLLOW_UP_PROMPT,
        triggerSequence,
        queueUpdateSequence: queuedUpdate?.sequence,
      });
    }
  });

  stage = "prompt";
  await session.prompt(INITIAL_PROMPT, { source: "interactive" });
  await followUpPromise;

  const finalText = session.getLastAssistantText();
  const finalMessages = session.messages.map((message, index) => ({
    index,
    role: message.role,
    text: textFromContent(message.content),
    stopReason: message.stopReason,
  }));
  const sessionWasIdleBeforeShutdown = session.isIdle;
  const pendingMessageCountBeforeShutdown = session.pendingMessageCount;
  const pendingFollowUpsBeforeShutdown = [...session.getFollowUpMessages()];

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
  const queueUpdates = sessionEvents.filter((event) => event.type === "queue_update");
  const queueFilled = queueUpdates.find((event) => event.followUp?.includes(FOLLOW_UP_PROMPT));
  const queueCleared = queueUpdates.find(
    (event) => Array.isArray(event.followUp) && event.followUp.length === 0,
  );
  const followUpMessageStartIndex = firstIndex(
    sessionEvents,
    (event) =>
      event.type === "message_start" &&
      event.messageRole === "user" &&
      event.messageText === FOLLOW_UP_PROMPT,
  );
  const finalAssistantEndIndex = sessionEvents.findLastIndex(
    (event) =>
      event.type === "message_end" &&
      event.messageRole === "assistant" &&
      event.messageText === FOLLOW_UP_RESPONSE,
  );
  const publicAgentEndIndex = firstIndex(
    sessionEvents,
    (event) => event.type === "agent_end",
  );
  const publicSettledIndex = firstIndex(
    sessionEvents,
    (event) => event.type === "agent_settled",
  );
  const extensionSettledIndex = firstIndex(
    extensionEvents,
    (event) => event.type === "agent_settled",
  );
  const extensionShutdownIndex = firstIndex(
    extensionEvents,
    (event) => event.type === "session_shutdown",
  );

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
    prompts: {
      initial: INITIAL_PROMPT,
      followUp: FOLLOW_UP_PROMPT,
    },
    responses: {
      first: FIRST_RESPONSE,
      followUp: FOLLOW_UP_RESPONSE,
    },
    queue: {
      mode: session?.followUpMode ?? "one-at-a-time",
      actions: followUpActions,
      updates: queueUpdates,
      pendingMessageCountBeforeShutdown,
      pendingFollowUpsBeforeShutdown,
    },
    outcome: {
      finalText,
      expectedFinalText: FOLLOW_UP_RESPONSE,
      finalMessages,
      sessionWasIdleBeforeShutdown,
    },
    counts: {
      sessionEvents: sessionEvents.length,
      extensionEvents: extensionEvents.length,
      publicQueueUpdates: queueUpdates.length,
      publicAgentStarts: count(sessionEvents, "agent_start"),
      publicAgentEnds: count(sessionEvents, "agent_end"),
      publicAgentSettled: count(sessionEvents, "agent_settled"),
      publicTurnStarts: count(sessionEvents, "turn_start"),
      publicTurnEnds: count(sessionEvents, "turn_end"),
      extensionAgentStarts: count(extensionEvents, "agent_start"),
      extensionAgentEnds: count(extensionEvents, "agent_end"),
      extensionAgentSettled: count(extensionEvents, "agent_settled"),
      extensionTurnStarts: count(extensionEvents, "turn_start"),
      extensionTurnEnds: count(extensionEvents, "turn_end"),
      extensionQueueUpdates: count(extensionEvents, "queue_update"),
      extensionSessionShutdowns: count(extensionEvents, "session_shutdown"),
    },
    ordering: {
      queueFilledSequence: queueFilled?.sequence,
      queueClearedSequence: queueCleared?.sequence,
      followUpMessageStartIndex,
      finalAssistantEndIndex,
      publicAgentEndIndex,
      publicSettledIndex,
      queueClearedBeforeFollowUpMessage:
        queueCleared !== undefined &&
        followUpMessageStartIndex >= 0 &&
        queueCleared.sequence - 1 < followUpMessageStartIndex,
      finalAssistantBeforeAgentEnd:
        finalAssistantEndIndex >= 0 && finalAssistantEndIndex < publicAgentEndIndex,
      agentEndBeforeSettled:
        publicAgentEndIndex >= 0 && publicAgentEndIndex < publicSettledIndex,
      extensionSettledBeforeShutdown:
        extensionSettledIndex >= 0 && extensionSettledIndex < extensionShutdownIndex,
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
    [followUpQueued === true, "Follow-up was never queued."],
    [finalText === FOLLOW_UP_RESPONSE, `Unexpected final text: ${finalText}`],
    [fauxHandle.state.callCount === 2, `Expected two Faux calls, got ${fauxHandle.state.callCount}`],
    [fauxHandle.getPendingResponseCount() === 0, "Faux responses were not fully consumed."],
    [sessionWasIdleBeforeShutdown === true, "Session was not idle when prompt resolved."],
    [pendingMessageCountBeforeShutdown === 0, "Pending message count was not zero after follow-up processing."],
    [pendingFollowUpsBeforeShutdown.length === 0, "Follow-up queue was not empty after prompt resolution."],
    [queueFilled !== undefined, "No public queue_update exposed the queued follow-up."],
    [queueCleared !== undefined, "No public queue_update exposed the cleared follow-up queue."],
    [count(sessionEvents, "agent_start") === 1, "Expected one public agent_start for the combined run."],
    [count(sessionEvents, "agent_end") === 1, "Expected one public agent_end after the queue drained."],
    [count(sessionEvents, "agent_settled") === 1, "Expected one public agent_settled."],
    [count(sessionEvents, "turn_start") === 2, "Expected two public turns."],
    [count(sessionEvents, "turn_end") === 2, "Expected two public turn_end events."],
    [result.ordering.queueClearedBeforeFollowUpMessage, "Queue did not clear before follow-up message delivery."],
    [result.ordering.finalAssistantBeforeAgentEnd, "Final follow-up assistant response did not precede agent_end."],
    [result.ordering.agentEndBeforeSettled, "agent_end did not precede agent_settled."],
    [result.ordering.extensionSettledBeforeShutdown, "Extension settled did not precede shutdown."],
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
    await followUpPromise;
  } catch {
    // Preserve the original failure.
  }
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
    followUpActions,
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
  console.error(`Pi follow-up lifecycle capture failed at ${stage}: ${failure.error.message}`);
  process.exitCode = 1;
}
