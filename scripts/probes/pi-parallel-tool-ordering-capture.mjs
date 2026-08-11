import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const SCHEMA_VERSION = 1;
const SCENARIO = "parallel-tool-ordering";
const TOOL_NAME = "ordered_echo";
const FINAL_TEXT = "Parallel tool ordering capture complete.";
const PROMPT_TEXT =
  "Call ordered_echo for alpha, beta, and gamma in that order in one assistant response, then finish.";
const EXTERNAL_PROVIDER_PROMPTS = 0;
const DEADLOCK_GUARD_MS = 5_000;
const CALLS = Object.freeze([
  Object.freeze({ lane: "alpha", toolCallId: "zhiwei-parallel-tool-alpha" }),
  Object.freeze({ lane: "beta", toolCallId: "zhiwei-parallel-tool-beta" }),
  Object.freeze({ lane: "gamma", toolCallId: "zhiwei-parallel-tool-gamma" }),
]);
const DECLARATION_ORDER = Object.freeze(CALLS.map((call) => call.toolCallId));
const COMPLETION_ORDER = Object.freeze([
  "zhiwei-parallel-tool-beta",
  "zhiwei-parallel-tool-gamma",
  "zhiwei-parallel-tool-alpha",
]);
const CALL_BY_ID = new Map(CALLS.map((call) => [call.toolCallId, call]));
const CALL_BY_LANE = new Map(CALLS.map((call) => [call.lane, call]));

const installDir = resolveRequiredPath("PI_INSTALL_DIR");
const outputPath = resolve(process.env.PI_LIFECYCLE_OUTPUT ?? join(process.cwd(), "pi-lifecycle-result.json"));
const workspaceDir = resolve(process.env.PI_LIFECYCLE_WORKSPACE ?? join(dirname(outputPath), "workspace"));
const agentDir = resolve(process.env.PI_LIFECYCLE_AGENT_DIR ?? join(dirname(outputPath), "agent"));

let stage = "bootstrap";
let session;
const sessionEvents = [];
const extensionEvents = [];
const toolExecutions = [];
const barrierTrace = [];
const lifecycleNotes = [];
const releaseGates = new Map(CALLS.map((call) => [call.toolCallId, createDeferred()]));
const startedToolCallIds = new Set();
let releaseSequenceStarted = false;
let nextCompletionIndex = 0;
let barrierFailure;

function resolveRequiredPath(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return resolve(value);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function createDeferred() {
  let resolvePromise;
  let settled = false;
  const promise = new Promise((resolvePromiseValue) => {
    resolvePromise = resolvePromiseValue;
  });
  return {
    promise,
    resolve() {
      if (settled) return;
      settled = true;
      resolvePromise();
    },
  };
}

function normalizeError(error) {
  return {
    name: error instanceof Error ? error.name : "Error",
    message: error instanceof Error ? error.message : String(error),
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

function toolCallsFromContent(content) {
  if (!Array.isArray(content)) return [];
  return content
    .filter((item) => item?.type === "toolCall")
    .map((item) => ({
      toolCallId: item.id,
      toolName: item.name,
      input: structuredClone(item.arguments),
    }));
}

function applyMessageSummary(record, message) {
  if (!message) return;
  record.messageRole = message.role;
  if (message.stopReason !== undefined) record.stopReason = message.stopReason;
  if (message.toolCallId !== undefined) record.messageToolCallId = message.toolCallId;
  if (message.toolName !== undefined) record.messageToolName = message.toolName;
  if (message.isError !== undefined) record.messageIsError = message.isError;
  const kinds = contentKinds(message.content);
  if (kinds.length > 0) record.contentKinds = kinds;
  const text = textFromContent(message.content);
  if (text !== undefined) record.messageText = text;
  const toolCalls = toolCallsFromContent(message.content);
  if (toolCalls.length > 0) {
    record.assistantToolCallIds = toolCalls.map((call) => call.toolCallId);
    record.assistantToolNames = toolCalls.map((call) => call.toolName);
  }
}

function sanitizeSessionEvent(event) {
  const record = { sequence: sessionEvents.length + 1, type: event.type };
  for (const key of ["toolCallId", "toolName", "isError", "reason", "willRetry", "attempt"]) {
    if (event[key] !== undefined) record[key] = event[key];
  }
  applyMessageSummary(record, event.message);
  if (event.event?.type) record.updateType = event.event.type;
  if (event.result?.content) {
    record.resultKinds = contentKinds(event.result.content);
    const text = textFromContent(event.result.content);
    if (text !== undefined) record.resultText = text;
  }
  if (Array.isArray(event.toolResults)) {
    record.turnToolResultIds = event.toolResults.map((result) => result.toolCallId);
    record.turnToolResultNames = event.toolResults.map((result) => result.toolName);
  }
  return record;
}

function sanitizeExtensionEvent(event) {
  const record = { sequence: extensionEvents.length + 1, type: event.type };
  for (const key of [
    "toolCallId",
    "toolName",
    "isError",
    "reason",
    "willRetry",
    "attempt",
    "source",
    "fromExtension",
  ]) {
    if (event[key] !== undefined) record[key] = event[key];
  }
  applyMessageSummary(record, event.message);
  if (event.input !== undefined) record.input = structuredClone(event.input);
  if (event.result?.content) {
    record.resultKinds = contentKinds(event.result.content);
    const text = textFromContent(event.result.content);
    if (text !== undefined) record.resultText = text;
  }
  if (event.content) {
    record.contentKinds = contentKinds(event.content);
    const text = textFromContent(event.content);
    if (text !== undefined) record.contentText = text;
  }
  if (Array.isArray(event.toolResults)) {
    record.turnToolResultIds = event.toolResults.map((result) => result.toolCallId);
    record.turnToolResultNames = event.toolResults.map((result) => result.toolName);
  }
  return record;
}

function summarizeFinalMessage(message, index) {
  const summary = { index, role: message.role };
  if (message.stopReason !== undefined) summary.stopReason = message.stopReason;
  if (message.toolCallId !== undefined) summary.toolCallId = message.toolCallId;
  if (message.toolName !== undefined) summary.toolName = message.toolName;
  if (message.isError !== undefined) summary.isError = message.isError;
  const kinds = contentKinds(message.content);
  if (kinds.length > 0) summary.contentKinds = kinds;
  const text = textFromContent(message.content);
  if (text !== undefined) summary.text = text;
  const toolCalls = toolCallsFromContent(message.content);
  if (toolCalls.length > 0) {
    summary.toolCallIds = toolCalls.map((call) => call.toolCallId);
    summary.toolNames = toolCalls.map((call) => call.toolName);
  }
  return summary;
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
  const aiEntry = join(aiDir, aiManifest.main ?? "dist/index.js");
  const fauxEntry = join(aiDir, "dist", "providers", "faux.js");
  const [coding, ai, faux] = await Promise.all([
    import(pathToFileURL(codingEntry).href),
    import(pathToFileURL(aiEntry).href),
    import(pathToFileURL(fauxEntry).href),
  ]);
  return { coding, ai, faux };
}

function recordBarrier(type, details = {}) {
  barrierTrace.push({ sequence: barrierTrace.length + 1, type, ...details });
}

function releaseCurrentExpected(reason) {
  const toolCallId = COMPLETION_ORDER[nextCompletionIndex];
  if (toolCallId === undefined) {
    recordBarrier("completion-plan-finished", { reason });
    return;
  }
  recordBarrier("release", { toolCallId, reason, completionIndex: nextCompletionIndex });
  releaseGates.get(toolCallId)?.resolve();
}

function maybeStartReleaseSequence() {
  if (releaseSequenceStarted || startedToolCallIds.size !== CALLS.length) return;
  releaseSequenceStarted = true;
  recordBarrier("all-tools-started", { toolCallIds: [...startedToolCallIds] });
  releaseCurrentExpected("all-tools-started");
}

function observePublicToolEnd(event) {
  const expectedToolCallId = COMPLETION_ORDER[nextCompletionIndex];
  recordBarrier("public-tool-end", {
    toolCallId: event.toolCallId,
    expectedToolCallId,
    completionIndex: nextCompletionIndex,
  });
  if (event.toolCallId !== expectedToolCallId) {
    barrierFailure = `Expected public tool end ${expectedToolCallId}, got ${event.toolCallId}.`;
    for (const gate of releaseGates.values()) gate.resolve();
    return;
  }
  nextCompletionIndex += 1;
  releaseCurrentExpected(`public-tool-end:${event.toolCallId}`);
}

async function waitForRelease(toolCallId, signal) {
  const gate = releaseGates.get(toolCallId);
  if (!gate) throw new Error(`Missing release gate for ${toolCallId}.`);
  let timeout;
  let abortListener;
  const timeoutPromise = new Promise((_, reject) => {
    timeout = setTimeout(() => {
      reject(
        new Error(
          `Parallel Tool barrier timed out after ${DEADLOCK_GUARD_MS}ms while waiting to release ${toolCallId}.`,
        ),
      );
    }, DEADLOCK_GUARD_MS);
  });
  const abortPromise = new Promise((_, reject) => {
    if (!signal) return;
    if (signal.aborted) {
      reject(new Error(`Parallel Tool ${toolCallId} was unexpectedly aborted.`));
      return;
    }
    abortListener = () => reject(new Error(`Parallel Tool ${toolCallId} was unexpectedly aborted.`));
    signal.addEventListener("abort", abortListener, { once: true });
  });
  try {
    await Promise.race([gate.promise, timeoutPromise, abortPromise]);
  } finally {
    clearTimeout(timeout);
    if (signal && abortListener) signal.removeEventListener("abort", abortListener);
  }
}

function idsFor(events, type, field = "toolCallId") {
  return events.filter((event) => event.type === type).map((event) => event[field]);
}

function toolResultMessageIds(events, type) {
  return events
    .filter((event) => event.type === type && event.messageRole === "toolResult")
    .map((event) => event.messageToolCallId);
}

function sameArray(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function sameIdSet(actual) {
  return (
    actual.length === DECLARATION_ORDER.length &&
    new Set(actual).size === DECLARATION_ORDER.length &&
    sameArray([...new Set(actual)].sort(), [...DECLARATION_ORDER].sort())
  );
}

function countByType(events) {
  return Object.fromEntries(
    [...new Set(events.map((event) => event.type))]
      .sort()
      .map((type) => [type, events.filter((event) => event.type === type).length]),
  );
}

async function run() {
  await mkdir(workspaceDir, { recursive: true });
  await mkdir(agentDir, { recursive: true });

  stage = "load-installed-modules";
  const { coding, ai, faux } = await loadInstalledModules();
  const {
    createAgentSession,
    DefaultResourceLoader,
    SessionManager,
    SettingsManager,
    ModelRuntime,
    defineTool,
  } = coding;
  const { Type } = ai;
  const { fauxProvider, fauxAssistantMessage, fauxToolCall } = faux;

  for (const [name, value] of Object.entries({
    createAgentSession,
    DefaultResourceLoader,
    SessionManager,
    SettingsManager,
    ModelRuntime,
    defineTool,
    Type,
    fauxProvider,
    fauxAssistantMessage,
    fauxToolCall,
  })) {
    if (value === undefined) throw new Error(`Required parallel lifecycle export is missing: ${name}`);
  }

  stage = "configure-faux-provider";
  const fauxHandle = fauxProvider({
    api: "zhiwei-parallel-tool-faux-api",
    provider: "zhiwei-parallel-tool-faux",
    tokensPerSecond: 0,
    tokenSize: { min: 256, max: 256 },
  });
  fauxHandle.setResponses([
    fauxAssistantMessage(
      CALLS.map((call) => fauxToolCall(TOOL_NAME, { lane: call.lane }, { id: call.toolCallId })),
      {
        stopReason: "toolUse",
        responseId: "zhiwei-parallel-tool-response-batch",
        timestamp: 1000,
      },
    ),
    fauxAssistantMessage(FINAL_TEXT, {
      stopReason: "stop",
      responseId: "zhiwei-parallel-tool-response-final",
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
    "tool_call",
    "tool_result",
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

    pi.registerTool(
      defineTool({
        name: TOOL_NAME,
        label: "Ordered Echo",
        description: "Return a named lane after an in-memory host-controlled release barrier.",
        parameters: Type.Object({ lane: Type.String() }),
        async execute(toolCallId, params, signal, onUpdate) {
          const expectedCall = CALL_BY_ID.get(toolCallId);
          if (!expectedCall) throw new Error(`Unexpected parallel toolCallId: ${toolCallId}`);
          if (CALL_BY_LANE.get(params.lane)?.toolCallId !== toolCallId) {
            throw new Error(`Parallel Tool lane/id mismatch: ${params.lane}/${toolCallId}`);
          }

          toolExecutions.push({
            sequence: toolExecutions.length + 1,
            phase: "start",
            toolCallId,
            toolName: TOOL_NAME,
            lane: params.lane,
          });
          recordBarrier("execute-start", { toolCallId, lane: params.lane });
          startedToolCallIds.add(toolCallId);
          onUpdate?.({
            content: [{ type: "text", text: `ordered echo update: ${params.lane}` }],
            details: { phase: "started", lane: params.lane },
          });
          maybeStartReleaseSequence();

          await waitForRelease(toolCallId, signal);
          toolExecutions.push({
            sequence: toolExecutions.length + 1,
            phase: "end",
            toolCallId,
            toolName: TOOL_NAME,
            lane: params.lane,
          });
          recordBarrier("execute-end", { toolCallId, lane: params.lane });
          return {
            content: [{ type: "text", text: `ordered echo result: ${params.lane}` }],
            details: { phase: "complete", lane: params.lane },
          };
        },
      }),
    );
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
    tools: [TOOL_NAME],
    resourceLoader,
    sessionManager: SessionManager.inMemory(workspaceDir),
    settingsManager,
    sessionStartEvent: { type: "session_start", reason: "startup" },
  });
  session = created.session;
  const activeToolsBeforePrompt = session.getActiveToolNames();
  const unsubscribe = session.subscribe((event) => {
    sessionEvents.push(sanitizeSessionEvent(event));
    if (event.type === "tool_execution_end") observePublicToolEnd(event);
  });

  stage = "prompt";
  await session.prompt(PROMPT_TEXT, { source: "interactive" });
  if (!session.isIdle) throw new Error("Session did not become idle after the parallel Tool prompt.");

  const finalText = session.getLastAssistantText();
  const activeToolsAfterPrompt = session.getActiveToolNames();
  const sessionWasIdleBeforeShutdown = session.isIdle;
  const pendingMessageCountBeforeShutdown = session.getPendingMessageCount();
  const finalMessages = session.messages.map(summarizeFinalMessage);

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

  stage = "summarize-capture";
  const sessionToolStarts = sessionEvents.filter((event) => event.type === "tool_execution_start");
  const sessionToolUpdates = sessionEvents.filter((event) => event.type === "tool_execution_update");
  const sessionToolEnds = sessionEvents.filter((event) => event.type === "tool_execution_end");
  const extensionToolCalls = extensionEvents.filter((event) => event.type === "tool_call");
  const extensionToolResults = extensionEvents.filter((event) => event.type === "tool_result");
  const extensionAgentEnds = extensionEvents.filter((event) => event.type === "agent_end");
  const extensionAgentSettled = extensionEvents.filter((event) => event.type === "agent_settled");
  const extensionShutdowns = extensionEvents.filter((event) => event.type === "session_shutdown");
  const publicTurnWithResults = sessionEvents.find(
    (event) => event.type === "turn_end" && Array.isArray(event.turnToolResultIds),
  );
  const extensionTurnWithResults = extensionEvents.find(
    (event) => event.type === "turn_end" && Array.isArray(event.turnToolResultIds),
  );

  const ordering = {
    declarationOrder: [...DECLARATION_ORDER],
    plannedCompletionOrder: [...COMPLETION_ORDER],
    executeStartOrder: toolExecutions.filter((event) => event.phase === "start").map((event) => event.toolCallId),
    executeEndOrder: toolExecutions.filter((event) => event.phase === "end").map((event) => event.toolCallId),
    publicStartOrder: idsFor(sessionEvents, "tool_execution_start"),
    publicUpdateOrder: idsFor(sessionEvents, "tool_execution_update"),
    publicEndOrder: idsFor(sessionEvents, "tool_execution_end"),
    extensionCallOrder: idsFor(extensionEvents, "tool_call"),
    extensionResultOrder: idsFor(extensionEvents, "tool_result"),
    publicResultMessageStartOrder: toolResultMessageIds(sessionEvents, "message_start"),
    publicResultMessageEndOrder: toolResultMessageIds(sessionEvents, "message_end"),
    extensionResultMessageStartOrder: toolResultMessageIds(extensionEvents, "message_start"),
    extensionResultMessageEndOrder: toolResultMessageIds(extensionEvents, "message_end"),
    publicTurnToolResultOrder: publicTurnWithResults?.turnToolResultIds ?? [],
    extensionTurnToolResultOrder: extensionTurnWithResults?.turnToolResultIds ?? [],
    finalSessionToolResultOrder: finalMessages
      .filter((message) => message.role === "toolResult")
      .map((message) => message.toolCallId),
    allExecutionsStartedBeforeFirstCompletion:
      toolExecutions.findIndex((event) => event.phase === "end") >
      toolExecutions.reduce((lastIndex, event, index) => (event.phase === "start" ? index : lastIndex), -1),
    completionOrderDiffersFromDeclaration: !sameArray(COMPLETION_ORDER, DECLARATION_ORDER),
    agentEndBeforeSettled:
      extensionEvents.findIndex((event) => event.type === "agent_end") >= 0 &&
      extensionEvents.findIndex((event) => event.type === "agent_end") <
        extensionEvents.findIndex((event) => event.type === "agent_settled"),
    settledBeforeShutdown:
      extensionEvents.findIndex((event) => event.type === "agent_settled") >= 0 &&
      extensionEvents.findIndex((event) => event.type === "agent_settled") <
        extensionEvents.findIndex((event) => event.type === "session_shutdown"),
  };

  const observedOrders = Object.fromEntries(
    Object.entries(ordering).filter(([, value]) => Array.isArray(value)),
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
    prompt: {
      source: "interactive",
      text: PROMPT_TEXT,
    },
    toolBatch: {
      toolName: TOOL_NAME,
      calls: CALLS.map((call) => ({ ...call })),
      declarationOrder: [...DECLARATION_ORDER],
      plannedCompletionOrder: [...COMPLETION_ORDER],
      deadlockGuardMs: DEADLOCK_GUARD_MS,
      activeBeforePrompt: activeToolsBeforePrompt,
      activeAfterPrompt: activeToolsAfterPrompt,
      executions: toolExecutions,
      barrierTrace,
      barrierFailure: barrierFailure ?? null,
    },
    outcome: {
      finalText,
      expectedFinalText: FINAL_TEXT,
      sessionWasIdleBeforeShutdown,
      pendingMessageCountBeforeShutdown,
      messageRoles: finalMessages.map((message) => message.role),
      finalMessages,
    },
    counts: {
      sessionEvents: sessionEvents.length,
      extensionEvents: extensionEvents.length,
      publicByType: countByType(sessionEvents),
      extensionByType: countByType(extensionEvents),
      sessionToolStarts: sessionToolStarts.length,
      sessionToolUpdates: sessionToolUpdates.length,
      sessionToolEnds: sessionToolEnds.length,
      extensionToolCalls: extensionToolCalls.length,
      extensionToolResults: extensionToolResults.length,
      extensionAgentEnds: extensionAgentEnds.length,
      extensionAgentSettled: extensionAgentSettled.length,
      extensionSessionShutdowns: extensionShutdowns.length,
    },
    correlations: {
      expectedToolCallIds: [...DECLARATION_ORDER].sort(),
      observedOrders,
      everyObservedOrderUsesEachExpectedIdExactlyOnce: Object.values(observedOrders).every(sameIdSet),
    },
    ordering,
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

  stage = "validate-capture";
  const assertions = [
    [finalText === FINAL_TEXT, `Unexpected final text: ${finalText}`],
    [fauxHandle.state.callCount === 2, `Expected two faux calls, got ${fauxHandle.state.callCount}`],
    [fauxHandle.getPendingResponseCount() === 0, "Faux responses were not fully consumed."],
    [activeToolsBeforePrompt.includes(TOOL_NAME), "Ordered echo tool was not active before the prompt."],
    [sessionToolStarts.length === 3, `Expected three public Tool starts, got ${sessionToolStarts.length}`],
    [sessionToolUpdates.length === 3, `Expected three public Tool updates, got ${sessionToolUpdates.length}`],
    [sessionToolEnds.length === 3, `Expected three public Tool ends, got ${sessionToolEnds.length}`],
    [extensionToolCalls.length === 3, `Expected three Extension tool_call events, got ${extensionToolCalls.length}`],
    [extensionToolResults.length === 3, `Expected three Extension tool_result events, got ${extensionToolResults.length}`],
    [extensionAgentEnds.length === 1, `Expected one Extension agent_end, got ${extensionAgentEnds.length}`],
    [extensionAgentSettled.length === 1, `Expected one Extension agent_settled, got ${extensionAgentSettled.length}`],
    [extensionShutdowns.length === 1, `Expected one Extension session_shutdown, got ${extensionShutdowns.length}`],
    [releaseSequenceStarted, "Parallel release sequence never started; all Tools were not concurrently active."],
    [nextCompletionIndex === COMPLETION_ORDER.length, `Only ${nextCompletionIndex} planned completions were observed.`],
    [barrierFailure === undefined, barrierFailure ?? "Parallel barrier failed."],
    [sameArray(ordering.executeStartOrder, DECLARATION_ORDER), "Tool execute() start order drifted from declaration order."],
    [sameArray(ordering.executeEndOrder, COMPLETION_ORDER), "Tool execute() completion order ignored the explicit Barrier."],
    [sameArray(ordering.publicStartOrder, DECLARATION_ORDER), "Public Tool start order drifted from declaration order."],
    [sameArray(ordering.publicEndOrder, COMPLETION_ORDER), "Public Tool end order drifted from actual completion order."],
    [ordering.allExecutionsStartedBeforeFirstCompletion, "A Tool completed before all three execute() calls had started."],
    [result.correlations.everyObservedOrderUsesEachExpectedIdExactlyOnce, "At least one Tool surface lost or duplicated a Tool Call ID."],
    [ordering.agentEndBeforeSettled, "agent_end did not precede agent_settled."],
    [ordering.settledBeforeShutdown, "agent_settled did not precede session_shutdown."],
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
    for (const gate of releaseGates.values()) gate.resolve();
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
    toolExecutions,
    barrierTrace,
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
  console.error(`Pi parallel Tool ordering capture failed at ${stage}: ${failure.error.message}`);
  process.exitCode = 1;
}
