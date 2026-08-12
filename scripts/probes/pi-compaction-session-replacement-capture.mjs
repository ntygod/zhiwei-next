import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const SCHEMA_VERSION = 1;
const SCENARIO = "compaction-session-replacement";
const EXTERNAL_PROVIDER_PROMPTS = 0;

const COMPACTION_PROMPTS = Object.freeze([
  "Remember the first fixed compaction fact.",
  "Remember the second fixed compaction fact.",
]);
const COMPACTION_RESPONSES = Object.freeze([
  "First compaction response recorded.",
  "Second compaction response recorded.",
]);
const COMPACTION_SUMMARY = [
  "Verified extension summary.",
  "- First fixed compaction fact was recorded.",
  "- Second fixed compaction fact remains the recent turn.",
].join("\n");
const COMPACTION_USAGE = Object.freeze({
  input: 11,
  output: 7,
  cacheRead: 3,
  cacheWrite: 2,
  totalTokens: 23,
  cost: {
    input: 0.11,
    output: 0.07,
    cacheRead: 0.03,
    cacheWrite: 0.02,
    total: 0.23,
  },
});
const UNUSED_COMPACTION_PROVIDER_RESPONSE = "Compaction provider response must remain unused.";

const REPLACEMENT_PROMPTS = Object.freeze({
  original: "Create the original replacement session fact.",
  fresh: "Create the new replacement session fact.",
  resumed: "Append a fact after resuming the original session.",
});
const REPLACEMENT_RESPONSES = Object.freeze({
  original: "Original session response.",
  fresh: "New session response.",
  resumed: "Resumed original session response.",
});

const installDir = resolveRequiredPath("PI_INSTALL_DIR");
const outputPath = resolve(
  process.env.PI_LIFECYCLE_OUTPUT ?? join(process.cwd(), "pi-compaction-session-replacement-result.json"),
);
const workspaceDir = resolve(
  process.env.PI_LIFECYCLE_WORKSPACE ?? join(dirname(outputPath), "workspace"),
);
const agentDir = resolve(
  process.env.PI_LIFECYCLE_AGENT_DIR ?? join(dirname(outputPath), "agent"),
);

let stage = "bootstrap";
let activeDisposable;
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

function assertCase(condition, message) {
  if (!condition) throw new Error(message);
}

function contentKinds(content) {
  if (!Array.isArray(content)) return [];
  return content.map((part) => part?.type ?? "unknown");
}

function textFromContent(content) {
  if (typeof content === "string") return content || undefined;
  if (!Array.isArray(content)) return undefined;
  const text = content
    .filter((part) => part?.type === "text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("");
  return text || undefined;
}

function summarizeMessage(message, index) {
  const record = { index, role: message.role };
  if (message.stopReason !== undefined) record.stopReason = message.stopReason;
  if (message.errorMessage !== undefined) record.errorMessage = message.errorMessage;
  if (message.summary !== undefined) record.summary = message.summary;
  if (message.tokensBefore !== undefined) record.tokensBefore = message.tokensBefore;
  if (message.toolCallId !== undefined) record.toolCallId = message.toolCallId;
  if (message.toolName !== undefined) record.toolName = message.toolName;
  const kinds = contentKinds(message.content);
  if (kinds.length > 0) record.contentKinds = kinds;
  const text = textFromContent(message.content);
  if (text !== undefined) record.text = text;
  return record;
}

function summarizeMessages(messages) {
  return messages.map(summarizeMessage);
}

function summarizeStats(stats) {
  return {
    userMessages: stats.userMessages,
    assistantMessages: stats.assistantMessages,
    toolCalls: stats.toolCalls,
    toolResults: stats.toolResults,
    totalMessages: stats.totalMessages,
    tokens: stats.tokens,
    cost: stats.cost,
  };
}

function createAliasMap(prefix) {
  const aliases = new Map();
  return {
    alias(value) {
      if (value === undefined || value === null || value === "") return null;
      if (!aliases.has(value)) aliases.set(value, `${prefix}-${aliases.size + 1}`);
      return aliases.get(value);
    },
    values() {
      return [...aliases.values()];
    },
  };
}

function sanitizeUsage(usage) {
  if (!usage) return undefined;
  return {
    input: usage.input,
    output: usage.output,
    cacheRead: usage.cacheRead,
    cacheWrite: usage.cacheWrite,
    totalTokens: usage.totalTokens,
    cost: usage.cost
      ? {
          input: usage.cost.input,
          output: usage.cost.output,
          cacheRead: usage.cost.cacheRead,
          cacheWrite: usage.cost.cacheWrite,
          total: usage.cost.total,
        }
      : undefined,
  };
}

function eventTypeCounts(events) {
  const counts = {};
  for (const event of events) counts[event.type] = (counts[event.type] ?? 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}

async function loadInstalledModules() {
  const codingDir = join(installDir, "node_modules", "@earendil-works", "pi-coding-agent");
  const aiDir = join(installDir, "node_modules", "@earendil-works", "pi-ai");
  const [codingManifest, aiManifest] = await Promise.all([
    readFile(join(codingDir, "package.json"), "utf8").then(JSON.parse),
    readFile(join(aiDir, "package.json"), "utf8").then(JSON.parse),
  ]);
  if (codingManifest.name !== "@earendil-works/pi-coding-agent" || codingManifest.version !== "0.84.1") {
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

function summarizeCompactionEntry(entry, entryAliases) {
  const record = {
    entry: entryAliases.alias(entry.id),
    parent: entryAliases.alias(entry.parentId),
    type: entry.type,
  };
  if (entry.type === "message") {
    record.message = summarizeMessage(entry.message, 0);
    delete record.message.index;
  }
  if (entry.type === "model_change") {
    record.provider = entry.provider;
    record.modelId = entry.modelId;
  }
  if (entry.type === "thinking_level_change") record.thinkingLevel = entry.thinkingLevel;
  if (entry.type === "compaction") {
    record.summary = entry.summary;
    record.firstKeptEntry = entryAliases.alias(entry.firstKeptEntryId);
    record.tokensBefore = entry.tokensBefore;
    record.usage = sanitizeUsage(entry.usage);
    record.details = entry.details;
  }
  return record;
}

function sanitizeCompactionResult(result, entryAliases) {
  if (!result) return null;
  return {
    summary: result.summary,
    firstKeptEntry: entryAliases.alias(result.firstKeptEntryId),
    tokensBefore: result.tokensBefore,
    estimatedTokensAfter: result.estimatedTokensAfter,
    usage: sanitizeUsage(result.usage),
    details: result.details,
  };
}

async function runManualCompaction(coding, faux) {
  stage = "manual-compaction:configure";
  const caseWorkspace = join(workspaceDir, "manual-compaction");
  const caseAgentDir = join(agentDir, "manual-compaction");
  await Promise.all([
    mkdir(caseWorkspace, { recursive: true }),
    mkdir(caseAgentDir, { recursive: true }),
  ]);

  const {
    createAgentSession,
    DefaultResourceLoader,
    ModelRuntime,
    SessionManager,
    SettingsManager,
  } = coding;
  const { fauxProvider, fauxAssistantMessage } = faux;
  for (const [name, value] of Object.entries({
    createAgentSession,
    DefaultResourceLoader,
    ModelRuntime,
    SessionManager,
    SettingsManager,
    fauxProvider,
    fauxAssistantMessage,
  })) {
    if (value === undefined) throw new Error(`Required manual-compaction export is missing: ${name}`);
  }

  const entryAliases = createAliasMap("compaction-entry");
  const publicEvents = [];
  const extensionEvents = [];
  const lifecycleNotes = [];
  let extensionBeforeSnapshot;

  const fauxHandle = fauxProvider({
    api: "zhiwei-compaction-faux-api",
    provider: "zhiwei-compaction-faux",
    tokensPerSecond: 0,
    tokenSize: { min: 256, max: 256 },
  });
  fauxHandle.setResponses([
    fauxAssistantMessage(COMPACTION_RESPONSES[0], {
      stopReason: "stop",
      responseId: "zhiwei-compaction-response-1",
      timestamp: 1000,
    }),
    fauxAssistantMessage(COMPACTION_RESPONSES[1], {
      stopReason: "stop",
      responseId: "zhiwei-compaction-response-2",
      timestamp: 2000,
    }),
    fauxAssistantMessage(UNUSED_COMPACTION_PROVIDER_RESPONSE, {
      stopReason: "stop",
      responseId: "zhiwei-compaction-unused-response",
      timestamp: 3000,
    }),
  ]);

  const settingsManager = SettingsManager.inMemory({
    compaction: { keepRecentTokens: 1 },
  });
  const extensionFactory = (pi) => {
    pi.on("session_before_compact", async (event) => {
      extensionEvents.push({
        sequence: extensionEvents.length + 1,
        type: event.type,
        reason: event.reason,
        willRetry: event.willRetry,
        firstKeptEntry: entryAliases.alias(event.preparation.firstKeptEntryId),
        tokensBefore: event.preparation.tokensBefore,
        branchEntryTypes: event.branchEntries.map((entry) => entry.type),
        branchEntryAliases: event.branchEntries.map((entry) => entryAliases.alias(entry.id)),
        customInstructions: event.customInstructions,
        signalAborted: event.signal.aborted,
      });
      extensionBeforeSnapshot = {
        branchEntryTypes: event.branchEntries.map((entry) => entry.type),
        firstKeptEntry: entryAliases.alias(event.preparation.firstKeptEntryId),
      };
      return {
        compaction: {
          summary: COMPACTION_SUMMARY,
          firstKeptEntryId: event.preparation.firstKeptEntryId,
          tokensBefore: event.preparation.tokensBefore,
          usage: COMPACTION_USAGE,
          details: { source: "zhiwei-extension", schemaVersion: 1 },
        },
      };
    });
    pi.on("session_compact", async (event) => {
      extensionEvents.push({
        sequence: extensionEvents.length + 1,
        type: event.type,
        reason: event.reason,
        fromExtension: event.fromExtension,
        compactionEntry: entryAliases.alias(event.compactionEntry.id),
        firstKeptEntry: entryAliases.alias(event.compactionEntry.firstKeptEntryId),
        summary: event.compactionEntry.summary,
        tokensBefore: event.compactionEntry.tokensBefore,
        usage: sanitizeUsage(event.compactionEntry.usage),
        details: event.compactionEntry.details,
      });
    });
    pi.on("session_shutdown", async (event) => {
      extensionEvents.push({
        sequence: extensionEvents.length + 1,
        type: event.type,
        reason: event.reason,
      });
    });
  };

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
    throw new Error(`Manual-compaction extension failed to load: ${JSON.stringify(extensionLoad.errors)}`);
  }

  const modelRuntime = await ModelRuntime.create({
    authPath: join(caseAgentDir, "auth.json"),
    modelsPath: null,
    allowModelNetwork: false,
    refreshOnCreate: false,
  });
  modelRuntime.registerNativeProvider(fauxHandle.provider);
  const sessionManager = SessionManager.inMemory(caseWorkspace);
  const created = await createAgentSession({
    cwd: caseWorkspace,
    agentDir: caseAgentDir,
    modelRuntime,
    model: fauxHandle.getModel(),
    thinkingLevel: "off",
    tools: [],
    resourceLoader,
    sessionManager,
    settingsManager,
    sessionStartEvent: { type: "session_start", reason: "startup" },
  });
  const session = created.session;
  activeDisposable = session;
  const unsubscribe = session.subscribe((event) => {
    if (!["compaction_start", "entry_appended", "compaction_end"].includes(event.type)) return;
    const record = { sequence: publicEvents.length + 1, type: event.type };
    if (event.reason !== undefined) record.reason = event.reason;
    if (event.aborted !== undefined) record.aborted = event.aborted;
    if (event.willRetry !== undefined) record.willRetry = event.willRetry;
    if (event.errorMessage !== undefined) record.errorMessage = event.errorMessage;
    if (event.entry !== undefined) {
      record.entry = summarizeCompactionEntry(event.entry, entryAliases);
    }
    if (event.result !== undefined) record.result = sanitizeCompactionResult(event.result, entryAliases);
    publicEvents.push(record);
  });

  stage = "manual-compaction:seed-prompts";
  await session.prompt(COMPACTION_PROMPTS[0], { source: "interactive" });
  await session.prompt(COMPACTION_PROMPTS[1], { source: "interactive" });
  const providerCallsBeforeCompact = fauxHandle.state.callCount;
  const providerPendingBeforeCompact = fauxHandle.getPendingResponseCount();
  const entriesBefore = sessionManager.getEntries();
  for (const entry of entriesBefore) entryAliases.alias(entry.id);
  const before = {
    messages: summarizeMessages(session.messages),
    entries: entriesBefore.map((entry) => summarizeCompactionEntry(entry, entryAliases)),
    entryTypes: entriesBefore.map((entry) => entry.type),
    stats: summarizeStats(session.getSessionStats()),
    isIdle: session.isIdle,
    isCompacting: session.isCompacting,
  };

  stage = "manual-compaction:compact";
  const compactResult = await session.compact();
  const providerCallsAfterCompact = fauxHandle.state.callCount;
  const providerPendingAfterCompact = fauxHandle.getPendingResponseCount();
  const entriesAfter = sessionManager.getEntries();
  const after = {
    messages: summarizeMessages(session.messages),
    entries: entriesAfter.map((entry) => summarizeCompactionEntry(entry, entryAliases)),
    entryTypes: entriesAfter.map((entry) => entry.type),
    stats: summarizeStats(session.getSessionStats()),
    isIdle: session.isIdle,
    isCompacting: session.isCompacting,
  };

  assertCase(before.isIdle === true, "Manual compaction seed Session was not idle.");
  assertCase(before.isCompacting === false, "Manual compaction seed Session was already compacting.");
  assertCase(providerCallsBeforeCompact === 2, `Expected two seed Faux calls, got ${providerCallsBeforeCompact}.`);
  assertCase(providerPendingBeforeCompact === 1, "Compaction proof response was not pending before compact().");
  assertCase(providerCallsAfterCompact === providerCallsBeforeCompact, "Extension-provided compaction unexpectedly called the Faux provider.");
  assertCase(providerPendingAfterCompact === providerPendingBeforeCompact, "Extension-provided compaction consumed the proof response.");
  assertCase(compactResult?.summary === COMPACTION_SUMMARY, "Manual compaction summary drifted.");
  assertCase(after.isCompacting === false, "Manual compact() returned while Session was still compacting.");
  assertCase(after.isIdle === true, "Manual compact() did not return at an idle boundary.");
  assertCase(after.messages[0]?.role === "compactionSummary", "Compacted context does not start with compactionSummary.");
  assertCase(after.messages[0]?.summary === COMPACTION_SUMMARY, "CompactionSummary message does not preserve the extension summary.");
  assertCase(entriesAfter.filter((entry) => entry.type === "compaction").length === 1, "Expected one persisted compaction entry.");
  assertCase(extensionEvents.some((event) => event.type === "session_before_compact"), "Extension did not receive session_before_compact.");
  assertCase(extensionEvents.some((event) => event.type === "session_compact"), "Extension did not receive session_compact.");
  assertCase(publicEvents.some((event) => event.type === "compaction_start"), "Public trace did not include compaction_start.");
  assertCase(publicEvents.some((event) => event.type === "compaction_end"), "Public trace did not include compaction_end.");

  stage = "manual-compaction:shutdown";
  await session.extensionRunner.emit({ type: "session_shutdown", reason: "exit" });
  lifecycleNotes.push({
    type: "shutdown-host-boundary",
    mechanism: "session.extensionRunner.emit",
    reason: "exit",
  });
  unsubscribe();
  session.dispose();
  activeDisposable = undefined;

  return {
    prompts: [...COMPACTION_PROMPTS],
    responses: [...COMPACTION_RESPONSES],
    summary: COMPACTION_SUMMARY,
    summaryUsage: COMPACTION_USAGE,
    provider: {
      id: fauxHandle.provider.id,
      api: fauxHandle.api,
      callsBeforeCompact: providerCallsBeforeCompact,
      callsAfterCompact: providerCallsAfterCompact,
      pendingBeforeCompact: providerPendingBeforeCompact,
      pendingAfterCompact: providerPendingAfterCompact,
      promptsSentToExternalProvider: EXTERNAL_PROVIDER_PROMPTS,
    },
    before,
    compactResult: sanitizeCompactionResult(compactResult, entryAliases),
    after,
    extensionBeforeSnapshot,
    publicEvents,
    extensionEvents,
    counts: {
      public: eventTypeCounts(publicEvents),
      extension: eventTypeCounts(extensionEvents),
      entriesBefore: entriesBefore.length,
      entriesAfter: entriesAfter.length,
      compactionEntriesAfter: entriesAfter.filter((entry) => entry.type === "compaction").length,
    },
    aliases: {
      entries: entryAliases.values(),
    },
    lifecycleNotes,
  };
}

function sanitizeReplacementEvent(event, fileAliases, generation) {
  const record = {
    type: event.type,
    generation,
  };
  if (event.reason !== undefined) record.reason = event.reason;
  if (event.source !== undefined) record.source = event.source;
  if (event.targetSessionFile !== undefined) {
    record.targetSessionFile = fileAliases.alias(event.targetSessionFile);
  }
  if (event.previousSessionFile !== undefined) {
    record.previousSessionFile = fileAliases.alias(event.previousSessionFile);
  }
  if (event.message !== undefined) {
    record.messageRole = event.message.role;
    const text = textFromContent(event.message.content);
    if (text !== undefined) record.messageText = text;
    if (event.message.stopReason !== undefined) record.stopReason = event.message.stopReason;
  }
  return record;
}

function sanitizePublicReplacementEvent(event, sessionObject) {
  const record = { sessionObject, type: event.type };
  if (event.willRetry !== undefined) record.willRetry = event.willRetry;
  if (event.message !== undefined) {
    record.messageRole = event.message.role;
    const text = textFromContent(event.message.content);
    if (text !== undefined) record.messageText = text;
    if (event.message.stopReason !== undefined) record.stopReason = event.message.stopReason;
  }
  return record;
}

async function runSessionReplacement(coding, faux) {
  stage = "session-replacement:configure";
  const caseWorkspace = join(workspaceDir, "session-replacement");
  const caseAgentDir = join(agentDir, "session-replacement");
  const sessionDir = join(caseAgentDir, "sessions");
  await Promise.all([
    mkdir(caseWorkspace, { recursive: true }),
    mkdir(caseAgentDir, { recursive: true }),
    mkdir(sessionDir, { recursive: true }),
  ]);

  const {
    createAgentSessionFromServices,
    createAgentSessionRuntime,
    createAgentSessionServices,
    ModelRuntime,
    SessionManager,
    SettingsManager,
  } = coding;
  const { fauxProvider, fauxAssistantMessage } = faux;
  for (const [name, value] of Object.entries({
    createAgentSessionFromServices,
    createAgentSessionRuntime,
    createAgentSessionServices,
    ModelRuntime,
    SessionManager,
    SettingsManager,
    fauxProvider,
    fauxAssistantMessage,
  })) {
    if (value === undefined) throw new Error(`Required session-replacement export is missing: ${name}`);
  }

  const fileAliases = createAliasMap("session-file");
  const objectAliases = new WeakMap();
  const objectAliasValues = [];
  const sessionObjectAlias = (session) => {
    if (!objectAliases.has(session)) {
      const alias = `session-object-${objectAliasValues.length + 1}`;
      objectAliases.set(session, alias);
      objectAliasValues.push(alias);
    }
    return objectAliases.get(session);
  };

  const extensionEvents = [];
  const replacementPhases = [];
  const legacyPublicEvents = [];
  const reboundPublicEvents = [];
  const lifecycleNotes = [];
  let extensionGeneration = 0;
  let runtime;
  let reboundUnsubscribe;

  const recordPhase = (phase, details = {}) => {
    replacementPhases.push({ sequence: replacementPhases.length + 1, phase, ...details });
  };
  const extensionFactory = (pi) => {
    const generation = ++extensionGeneration;
    for (const eventType of [
      "session_start",
      "session_before_switch",
      "session_shutdown",
      "input",
      "message_end",
      "agent_end",
      "agent_settled",
    ]) {
      pi.on(eventType, async (event) => {
        extensionEvents.push({
          sequence: extensionEvents.length + 1,
          ...sanitizeReplacementEvent(event, fileAliases, generation),
        });
        if (["session_start", "session_before_switch", "session_shutdown"].includes(event.type)) {
          recordPhase(`extension:${event.type}`, {
            generation,
            reason: event.reason,
            targetSessionFile: fileAliases.alias(event.targetSessionFile),
            previousSessionFile: fileAliases.alias(event.previousSessionFile),
          });
        }
      });
    }
  };

  const fauxHandle = fauxProvider({
    api: "zhiwei-session-replacement-faux-api",
    provider: "zhiwei-session-replacement-faux",
    tokensPerSecond: 0,
    tokenSize: { min: 256, max: 256 },
  });
  fauxHandle.setResponses([
    fauxAssistantMessage(REPLACEMENT_RESPONSES.original, {
      stopReason: "stop",
      responseId: "zhiwei-replacement-original",
      timestamp: 4000,
    }),
    fauxAssistantMessage(REPLACEMENT_RESPONSES.fresh, {
      stopReason: "stop",
      responseId: "zhiwei-replacement-new",
      timestamp: 5000,
    }),
    fauxAssistantMessage(REPLACEMENT_RESPONSES.resumed, {
      stopReason: "stop",
      responseId: "zhiwei-replacement-resumed",
      timestamp: 6000,
    }),
  ]);

  const modelRuntime = await ModelRuntime.create({
    authPath: join(caseAgentDir, "auth.json"),
    modelsPath: null,
    allowModelNetwork: false,
    refreshOnCreate: false,
  });
  modelRuntime.registerNativeProvider(fauxHandle.provider);

  const createRuntime = async ({ cwd, sessionManager, sessionStartEvent }) => {
    const settingsManager = SettingsManager.inMemory({ retry: { enabled: false } });
    const services = await createAgentSessionServices({
      cwd,
      agentDir: caseAgentDir,
      modelRuntime,
      settingsManager,
      resourceLoaderOptions: {
        extensionFactories: [extensionFactory],
        noExtensions: true,
        noSkills: true,
        noPromptTemplates: true,
        noThemes: true,
        noContextFiles: true,
      },
    });
    const created = await createAgentSessionFromServices({
      services,
      sessionManager,
      sessionStartEvent,
      model: fauxHandle.getModel(),
      thinkingLevel: "off",
      tools: [],
    });
    return {
      ...created,
      services,
      diagnostics: services.diagnostics,
    };
  };

  runtime = await createAgentSessionRuntime(createRuntime, {
    cwd: caseWorkspace,
    agentDir: caseAgentDir,
    sessionManager: SessionManager.create(caseWorkspace, sessionDir),
    sessionStartEvent: { type: "session_start", reason: "startup" },
  });
  activeDisposable = runtime;

  function attachReboundPublicListener(session, bindingReason) {
    reboundUnsubscribe?.();
    const objectAlias = sessionObjectAlias(session);
    recordPhase("public-listener:attach", { sessionObject: objectAlias, bindingReason });
    reboundUnsubscribe = session.subscribe((event) => {
      if (!["agent_start", "turn_start", "message_end", "turn_end", "agent_end", "agent_settled"].includes(event.type)) return;
      reboundPublicEvents.push({
        sequence: reboundPublicEvents.length + 1,
        ...sanitizePublicReplacementEvent(event, objectAlias),
      });
    });
  }

  const initialSession = runtime.session;
  const initialObject = sessionObjectAlias(initialSession);
  recordPhase("initial:bind-extensions:start", { sessionObject: initialObject, generation: extensionGeneration });
  await initialSession.bindExtensions({});
  recordPhase("initial:bind-extensions:end", { sessionObject: initialObject, generation: extensionGeneration });
  attachReboundPublicListener(initialSession, "initial");
  const legacyUnsubscribe = initialSession.subscribe((event) => {
    if (!["agent_start", "turn_start", "message_end", "turn_end", "agent_end", "agent_settled"].includes(event.type)) return;
    legacyPublicEvents.push({
      sequence: legacyPublicEvents.length + 1,
      ...sanitizePublicReplacementEvent(event, initialObject),
    });
  });

  runtime.setBeforeSessionInvalidate(() => {
    recordPhase("before-session-invalidate", {
      sessionObject: sessionObjectAlias(runtime.session),
      sessionFile: fileAliases.alias(runtime.session.sessionFile),
    });
  });
  runtime.setRebindSession(async (session) => {
    const objectAlias = sessionObjectAlias(session);
    recordPhase("rebind-session:start", {
      sessionObject: objectAlias,
      sessionFile: fileAliases.alias(session.sessionFile),
      generation: extensionGeneration,
    });
    await session.bindExtensions({});
    recordPhase("rebind-session:extensions-bound", {
      sessionObject: objectAlias,
      generation: extensionGeneration,
    });
    attachReboundPublicListener(session, "replacement");
    recordPhase("rebind-session:end", {
      sessionObject: objectAlias,
      generation: extensionGeneration,
    });
  });

  stage = "session-replacement:original-prompt";
  await initialSession.prompt(REPLACEMENT_PROMPTS.original, { source: "interactive" });
  const originalFile = initialSession.sessionFile;
  assertCase(originalFile, "Original Session did not persist a session file.");
  const originalFileAlias = fileAliases.alias(originalFile);
  const legacyCountAfterOriginalPrompt = legacyPublicEvents.length;
  const initialSnapshot = {
    sessionObject: initialObject,
    sessionFile: originalFileAlias,
    messages: summarizeMessages(initialSession.messages),
    isIdle: initialSession.isIdle,
  };

  stage = "session-replacement:new-session";
  const newResult = await runtime.newSession({
    withSession: async (ctx) => {
      recordPhase("with-session:new", {
        sessionObject: sessionObjectAlias(runtime.session),
        sessionFile: fileAliases.alias(ctx.sessionManager.getSessionFile()),
        cwdMatches: ctx.cwd === caseWorkspace,
        isIdle: runtime.session.isIdle,
      });
    },
  });
  assertCase(newResult.cancelled === false, "newSession() was unexpectedly cancelled.");
  const newSession = runtime.session;
  const newObject = sessionObjectAlias(newSession);
  const newFile = newSession.sessionFile;
  const newFileAlias = fileAliases.alias(newFile);
  assertCase(newSession !== initialSession, "newSession() reused the original AgentSession object.");
  assertCase(newFile && newFile !== originalFile, "newSession() did not create a distinct session file.");
  assertCase(newSession.messages.length === 0, "New Session did not start with an empty message context.");
  const newBeforePrompt = {
    sessionObject: newObject,
    sessionFile: newFileAlias,
    messages: summarizeMessages(newSession.messages),
    isIdle: newSession.isIdle,
  };
  await newSession.prompt(REPLACEMENT_PROMPTS.fresh, { source: "interactive" });
  const newAfterPrompt = {
    sessionObject: newObject,
    sessionFile: newFileAlias,
    messages: summarizeMessages(newSession.messages),
    isIdle: newSession.isIdle,
  };
  const legacyCountAfterNewPrompt = legacyPublicEvents.length;

  stage = "session-replacement:resume-original";
  const switchResult = await runtime.switchSession(originalFile, {
    withSession: async (ctx) => {
      recordPhase("with-session:resume", {
        sessionObject: sessionObjectAlias(runtime.session),
        sessionFile: fileAliases.alias(ctx.sessionManager.getSessionFile()),
        cwdMatches: ctx.cwd === caseWorkspace,
        isIdle: runtime.session.isIdle,
      });
    },
  });
  assertCase(switchResult.cancelled === false, "switchSession() was unexpectedly cancelled.");
  const resumedSession = runtime.session;
  const resumedObject = sessionObjectAlias(resumedSession);
  const resumedFileAlias = fileAliases.alias(resumedSession.sessionFile);
  assertCase(resumedSession !== initialSession, "switchSession() reused the disposed original AgentSession object.");
  assertCase(resumedSession !== newSession, "switchSession() reused the New Session object.");
  assertCase(resumedFileAlias === originalFileAlias, "switchSession() did not restore the original Session file.");
  const resumedBeforePrompt = {
    sessionObject: resumedObject,
    sessionFile: resumedFileAlias,
    messages: summarizeMessages(resumedSession.messages),
    isIdle: resumedSession.isIdle,
  };
  assertCase(
    JSON.stringify(resumedBeforePrompt.messages) === JSON.stringify(initialSnapshot.messages),
    "Resumed Session messages differ from the original persisted context.",
  );
  await resumedSession.prompt(REPLACEMENT_PROMPTS.resumed, { source: "interactive" });
  const resumedAfterPrompt = {
    sessionObject: resumedObject,
    sessionFile: resumedFileAlias,
    messages: summarizeMessages(resumedSession.messages),
    isIdle: resumedSession.isIdle,
  };
  const legacyCountAfterResumePrompt = legacyPublicEvents.length;

  assertCase(fauxHandle.state.callCount === 3, `Expected three replacement Faux calls, got ${fauxHandle.state.callCount}.`);
  assertCase(fauxHandle.getPendingResponseCount() === 0, "Replacement Faux responses were not fully consumed.");
  assertCase(legacyCountAfterNewPrompt === legacyCountAfterOriginalPrompt, "Legacy Public listener received New Session events.");
  assertCase(legacyCountAfterResumePrompt === legacyCountAfterOriginalPrompt, "Legacy Public listener received resumed replacement events.");
  assertCase(objectAliasValues.length === 3, `Expected three AgentSession objects, got ${objectAliasValues.length}.`);
  assertCase(fileAliases.values().length === 2, `Expected two Session files, got ${fileAliases.values().length}.`);
  assertCase(extensionGeneration === 3, `Expected three Extension generations, got ${extensionGeneration}.`);
  assertCase(resumedAfterPrompt.isIdle === true, "Resumed Session prompt did not settle at an idle boundary.");
  assertCase(
    resumedAfterPrompt.messages.map((message) => message.role).join(",") === "user,assistant,user,assistant",
    `Unexpected resumed message roles: ${resumedAfterPrompt.messages.map((message) => message.role).join(",")}.`,
  );
  assertCase(
    replacementPhases.findIndex((item) => item.phase === "rebind-session:end" && item.sessionObject === newObject) <
      replacementPhases.findIndex((item) => item.phase === "with-session:new"),
    "newSession withSession ran before rebindSession completed.",
  );
  assertCase(
    replacementPhases.findIndex((item) => item.phase === "rebind-session:end" && item.sessionObject === resumedObject) <
      replacementPhases.findIndex((item) => item.phase === "with-session:resume"),
    "switchSession withSession ran before rebindSession completed.",
  );

  stage = "session-replacement:dispose";
  legacyUnsubscribe();
  reboundUnsubscribe?.();
  await runtime.dispose();
  lifecycleNotes.push({
    type: "runtime-dispose-boundary",
    mechanism: "AgentSessionRuntime.dispose",
    reason: "exit",
  });
  activeDisposable = undefined;

  return {
    prompts: REPLACEMENT_PROMPTS,
    responses: REPLACEMENT_RESPONSES,
    provider: {
      id: fauxHandle.provider.id,
      api: fauxHandle.api,
      callCount: fauxHandle.state.callCount,
      pendingResponses: fauxHandle.getPendingResponseCount(),
      promptsSentToExternalProvider: EXTERNAL_PROVIDER_PROMPTS,
    },
    snapshots: {
      initial: initialSnapshot,
      newBeforePrompt,
      newAfterPrompt,
      resumedBeforePrompt,
      resumedAfterPrompt,
    },
    operations: {
      newSession: { cancelled: newResult.cancelled },
      switchSession: { cancelled: switchResult.cancelled },
    },
    extensionEvents,
    replacementPhases,
    legacyPublicEvents,
    reboundPublicEvents,
    negativeEvidence: {
      legacySubscriptionMigrated: false,
      legacyCountAfterOriginalPrompt,
      legacyCountAfterNewPrompt,
      legacyCountAfterResumePrompt,
      publicSubscriptionRequiresRebind: true,
    },
    aliases: {
      sessionObjects: objectAliasValues,
      sessionFiles: fileAliases.values(),
    },
    counts: {
      extension: eventTypeCounts(extensionEvents),
      legacyPublic: eventTypeCounts(legacyPublicEvents),
      reboundPublic: eventTypeCounts(reboundPublicEvents),
      extensionGenerations: extensionGeneration,
      sessionObjects: objectAliasValues.length,
      sessionFiles: fileAliases.values().length,
    },
    lifecycleNotes,
  };
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
  completedCases.manualCompaction = await runManualCompaction(coding, faux);
  completedCases.sessionReplacement = await runSessionReplacement(coding, faux);

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
      rawSessionFileIncluded: false,
      rawEntryIdIncluded: false,
      environmentDumpIncluded: false,
      credentialsIncluded: false,
      rawChainOfThoughtIncluded: false,
    },
  };
  await writeResult(result);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

try {
  await run();
} catch (error) {
  try {
    await activeDisposable?.dispose?.();
  } catch {
    try {
      activeDisposable?.dispose?.();
    } catch {
      // Preserve the original failure.
    }
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
      rawSessionFileIncluded: false,
      rawEntryIdIncluded: false,
      environmentDumpIncluded: false,
      credentialsIncluded: false,
      rawChainOfThoughtIncluded: false,
    },
  };
  await writeResult(failure);
  console.error(`Pi compaction/session replacement capture failed at ${stage}: ${failure.error.message}`);
  process.exitCode = 1;
}
