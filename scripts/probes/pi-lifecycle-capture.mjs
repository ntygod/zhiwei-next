import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const SCHEMA_VERSION = 1;
const SCENARIO = "normal-tool";
const TOOL_NAME = "echo";
const TOOL_CALL_ID = "zhiwei-tool-call-1";
const TOOL_VALUE = "lifecycle-input";
const FINAL_TEXT = "Lifecycle capture complete.";
const PROMPT_TEXT = "Use the echo tool exactly once with value lifecycle-input, then finish.";
const EXTERNAL_PROVIDER_PROMPTS = 0;

const installDir = resolveRequiredPath("PI_INSTALL_DIR");
const outputPath = resolve(process.env.PI_LIFECYCLE_OUTPUT ?? join(process.cwd(), "pi-lifecycle-result.json"));
const workspaceDir = resolve(process.env.PI_LIFECYCLE_WORKSPACE ?? join(dirname(outputPath), "workspace"));
const agentDir = resolve(process.env.PI_LIFECYCLE_AGENT_DIR ?? join(dirname(outputPath), "agent"));

let stage = "bootstrap";
const sessionEvents = [];
const extensionEvents = [];
const toolExecutions = [];
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

function sanitizeSessionEvent(event) {
  const record = { sequence: sessionEvents.length + 1, type: event.type };
  for (const key of ["toolCallId", "toolName", "isError", "reason", "willRetry", "attempt"]) {
    if (event[key] !== undefined) record[key] = event[key];
  }
  if (event.message) {
    record.messageRole = event.message.role;
    if (event.message.stopReason !== undefined) record.stopReason = event.message.stopReason;
    const kinds = contentKinds(event.message.content);
    if (kinds.length > 0) record.contentKinds = kinds;
  }
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
  if (event.message) {
    record.messageRole = event.message.role;
    if (event.message.stopReason !== undefined) record.stopReason = event.message.stopReason;
    const kinds = contentKinds(event.message.content);
    if (kinds.length > 0) record.contentKinds = kinds;
  }
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
    if (value === undefined) throw new Error(`Required lifecycle export is missing: ${name}`);
  }

  stage = "configure-faux-provider";
  const fauxHandle = fauxProvider({
    api: "zhiwei-faux-api",
    provider: "zhiwei-faux",
    tokensPerSecond: 0,
    tokenSize: { min: 256, max: 256 },
  });
  fauxHandle.setResponses([
    fauxAssistantMessage(
      fauxToolCall(TOOL_NAME, { value: TOOL_VALUE }, { id: TOOL_CALL_ID }),
      {
        stopReason: "toolUse",
        responseId: "zhiwei-faux-response-tool",
        timestamp: 1000,
      },
    ),
    fauxAssistantMessage(FINAL_TEXT, {
      stopReason: "stop",
      responseId: "zhiwei-faux-response-final",
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
        label: "Echo",
        description: "Return the provided value without external side effects.",
        parameters: Type.Object({ value: Type.String() }),
        async execute(toolCallId, params, _signal, onUpdate) {
          toolExecutions.push({
            sequence: toolExecutions.length + 1,
            phase: "start",
            toolCallId,
            toolName: TOOL_NAME,
            value: params.value,
          });
          onUpdate?.({
            content: [{ type: "text", text: `echo update: ${params.value}` }],
            details: { phase: "update", value: params.value },
          });
          toolExecutions.push({
            sequence: toolExecutions.length + 1,
            phase: "end",
            toolCallId,
            toolName: TOOL_NAME,
            value: params.value,
          });
          return {
            content: [{ type: "text", text: `echo result: ${params.value}` }],
            details: { phase: "complete", value: params.value },
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
  });

  stage = "prompt";
  await session.prompt(PROMPT_TEXT, { source: "interactive" });
  if (!session.isIdle) throw new Error("Session did not become idle after the scripted prompt.");

  const finalText = session.getLastAssistantText();
  const activeToolsAfterPrompt = session.getActiveToolNames();
  const messageRoles = session.messages.map((message) => message.role);
  const sessionWasIdleBeforeShutdown = session.isIdle;

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
  const sessionToolStarts = sessionEvents.filter((event) => event.type === "tool_execution_start");
  const sessionToolUpdates = sessionEvents.filter((event) => event.type === "tool_execution_update");
  const sessionToolEnds = sessionEvents.filter((event) => event.type === "tool_execution_end");
  const extensionToolCalls = extensionEvents.filter((event) => event.type === "tool_call");
  const extensionToolResults = extensionEvents.filter((event) => event.type === "tool_result");
  const agentEnds = extensionEvents.filter((event) => event.type === "agent_end");
  const agentSettled = extensionEvents.filter((event) => event.type === "agent_settled");
  const shutdowns = extensionEvents.filter((event) => event.type === "session_shutdown");

  const correlationIds = new Set(
    [
      ...sessionToolStarts,
      ...sessionToolUpdates,
      ...sessionToolEnds,
      ...extensionToolCalls,
      ...extensionToolResults,
      ...toolExecutions,
    ]
      .map((event) => event.toolCallId)
      .filter(Boolean),
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
    tool: {
      name: TOOL_NAME,
      expectedToolCallId: TOOL_CALL_ID,
      expectedValue: TOOL_VALUE,
      activeBeforePrompt: activeToolsBeforePrompt,
      activeAfterPrompt: activeToolsAfterPrompt,
      executions: toolExecutions,
    },
    outcome: {
      finalText,
      expectedFinalText: FINAL_TEXT,
      messageRoles,
      sessionWasIdleBeforeShutdown,
    },
    counts: {
      sessionEvents: sessionEvents.length,
      extensionEvents: extensionEvents.length,
      sessionToolStarts: sessionToolStarts.length,
      sessionToolUpdates: sessionToolUpdates.length,
      sessionToolEnds: sessionToolEnds.length,
      extensionToolCalls: extensionToolCalls.length,
      extensionToolResults: extensionToolResults.length,
      extensionAgentEnds: agentEnds.length,
      extensionAgentSettled: agentSettled.length,
      extensionSessionShutdowns: shutdowns.length,
    },
    correlations: {
      observedToolCallIds: [...correlationIds].sort(),
      allToolSurfacesUseExpectedId:
        correlationIds.size === 1 && correlationIds.has(TOOL_CALL_ID),
    },
    ordering: {
      agentEndBeforeSettled:
        extensionEvents.findIndex((event) => event.type === "agent_end") >= 0 &&
        extensionEvents.findIndex((event) => event.type === "agent_end") <
          extensionEvents.findIndex((event) => event.type === "agent_settled"),
      settledBeforeShutdown:
        extensionEvents.findIndex((event) => event.type === "agent_settled") >= 0 &&
        extensionEvents.findIndex((event) => event.type === "agent_settled") <
          extensionEvents.findIndex((event) => event.type === "session_shutdown"),
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
    [fauxHandle.state.callCount === 2, `Expected two faux calls, got ${fauxHandle.state.callCount}`],
    [fauxHandle.getPendingResponseCount() === 0, "Faux responses were not fully consumed."],
    [activeToolsBeforePrompt.includes(TOOL_NAME), "Echo tool was not active before the prompt."],
    [sessionToolStarts.length === 1, `Expected one session tool start, got ${sessionToolStarts.length}`],
    [sessionToolUpdates.length >= 1, "Expected at least one session tool update."],
    [sessionToolEnds.length === 1, `Expected one session tool end, got ${sessionToolEnds.length}`],
    [extensionToolCalls.length === 1, `Expected one extension tool_call, got ${extensionToolCalls.length}`],
    [extensionToolResults.length === 1, `Expected one extension tool_result, got ${extensionToolResults.length}`],
    [agentEnds.length === 1, `Expected one extension agent_end, got ${agentEnds.length}`],
    [agentSettled.length === 1, `Expected one extension agent_settled, got ${agentSettled.length}`],
    [shutdowns.length === 1, `Expected one extension session_shutdown, got ${shutdowns.length}`],
    [result.correlations.allToolSurfacesUseExpectedId, `Unexpected tool correlation IDs: ${[...correlationIds].join(",")}`],
    [result.ordering.agentEndBeforeSettled, "agent_end did not precede agent_settled."],
    [result.ordering.settledBeforeShutdown, "agent_settled did not precede session_shutdown."],
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
    toolExecutions,
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
  console.error(`Pi lifecycle capture failed at ${stage}: ${failure.error.message}`);
  process.exitCode = 1;
}
