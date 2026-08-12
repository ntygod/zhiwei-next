import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const SCHEMA_VERSION = 1;
const SCENARIO = "rpc-worker-lifecycle";
const EXTERNAL_PROVIDER_PROMPTS = 0;
const COMMAND_TIMEOUT_MS = 30_000;
const PROCESS_TIMEOUT_MS = 45_000;

const NORMAL_PROMPTS = Object.freeze({
  initial: "Record the first fixed RPC worker fact.",
  resumed: "Append the second fixed RPC worker fact after restart.",
});
const NORMAL_RESPONSES = Object.freeze({
  initial: "First RPC worker response recorded.",
  resumed: "Second RPC worker response recorded after restart.",
});
const PROVIDER_ERROR_PROMPT = "Trigger the fixed accepted RPC provider error.";
const PROVIDER_ERROR_MESSAGE = "ZHIWEI_RPC_FIXED_PROVIDER_ERROR";

const installDir = resolve(process.env.PI_INSTALL_DIR ?? ".");
const outputPath = resolve(
  process.env.PI_LIFECYCLE_OUTPUT ?? join(process.cwd(), "pi-rpc-worker-lifecycle.json"),
);
const workspaceDir = resolve(process.env.PI_LIFECYCLE_WORKSPACE ?? process.cwd());
const agentDir = resolve(process.env.PI_LIFECYCLE_AGENT_DIR ?? join(workspaceDir, ".pi-agent"));

let stage = "bootstrap";
const completedCases = {};
const activeWorkers = new Set();

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function stableFingerprintValue(result) {
  const clone = structuredClone(result);
  delete clone.contractFingerprint;
  return JSON.stringify(clone);
}

function normalizeError(error) {
  return {
    stage,
    name: error instanceof Error ? error.name : "Error",
    message: error instanceof Error ? error.message : String(error),
  };
}

function assertCase(condition, message) {
  if (!condition) throw new Error(message);
}

function createAliasMap(prefix) {
  const aliases = new Map();
  return {
    alias(value) {
      if (value === undefined || value === null || value === "") return undefined;
      if (!aliases.has(value)) aliases.set(value, `${prefix}-${aliases.size + 1}`);
      return aliases.get(value);
    },
    values() {
      return [...aliases.values()];
    },
    rawValues() {
      return [...aliases.keys()];
    },
  };
}

function cleanEnvironment(overrides = {}) {
  const allowed = [
    "PATH",
    "HOME",
    "TMPDIR",
    "TMP",
    "TEMP",
    "LANG",
    "LC_ALL",
    "CI",
    "GITHUB_ACTIONS",
    "NODE_OPTIONS",
  ];
  const env = {};
  for (const key of allowed) {
    if (process.env[key] !== undefined) env[key] = process.env[key];
  }
  return {
    ...env,
    NO_COLOR: "1",
    TERM: "dumb",
    ...overrides,
  };
}

function extractText(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((part) => part?.type === "text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("");
}

function contentKinds(content) {
  if (typeof content === "string") return ["text"];
  if (!Array.isArray(content)) return [];
  return content.map((part) => part?.type ?? "unknown");
}

function sanitizeUsage(usage) {
  if (!usage || typeof usage !== "object") return undefined;
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

function summarizeMessage(message) {
  if (!message || typeof message !== "object") return undefined;
  const summary = {
    role: message.role,
  };
  if ("content" in message) {
    summary.contentKinds = contentKinds(message.content);
    summary.text = extractText(message.content);
  }
  if (typeof message.summary === "string") summary.summary = message.summary;
  if (typeof message.stopReason === "string") summary.stopReason = message.stopReason;
  if (typeof message.errorMessage === "string") summary.errorMessage = message.errorMessage;
  const usage = sanitizeUsage(message.usage);
  if (usage) summary.usage = usage;
  return summary;
}

function summarizeAssistantMessageEvent(event) {
  if (!event || typeof event !== "object") return undefined;
  const summary = { type: event.type };
  for (const key of ["delta", "reason", "errorMessage"]) {
    if (typeof event[key] === "string") summary[key] = event[key];
  }
  if (event.message) summary.message = summarizeMessage(event.message);
  return summary;
}

function summarizeEvent(event) {
  if (!event || typeof event !== "object") return { type: "unknown" };
  const summary = { type: event.type };
  if (event.message) summary.message = summarizeMessage(event.message);
  if (event.assistantMessageEvent) {
    summary.assistantMessageEvent = summarizeAssistantMessageEvent(event.assistantMessageEvent);
  }
  if (Array.isArray(event.messages)) summary.messages = event.messages.map(summarizeMessage);
  if (Array.isArray(event.toolResults)) {
    summary.toolResults = event.toolResults.map((result) => ({
      toolCallId: result?.toolCallId,
      toolName: result?.toolName,
      isError: result?.isError,
      contentKinds: contentKinds(result?.content),
      text: extractText(result?.content),
    }));
  }
  if (typeof event.willRetry === "boolean") summary.willRetry = event.willRetry;
  if (typeof event.isError === "boolean") summary.isError = event.isError;
  if (typeof event.toolCallId === "string") summary.toolCallId = event.toolCallId;
  if (typeof event.toolName === "string") summary.toolName = event.toolName;
  if (event.steering || event.followUp) {
    summary.steering = Array.isArray(event.steering) ? [...event.steering] : [];
    summary.followUp = Array.isArray(event.followUp) ? [...event.followUp] : [];
  }
  return summary;
}

function summarizeModel(model) {
  if (!model || typeof model !== "object") return undefined;
  return {
    provider: model.provider,
    id: model.id,
    api: model.api,
    reasoning: model.reasoning,
    contextWindow: model.contextWindow,
    maxTokens: model.maxTokens,
  };
}

function summarizeResponseData(command, data, aliases) {
  if (data === undefined) return undefined;
  if (command === "get_state") {
    return {
      model: summarizeModel(data.model),
      thinkingLevel: data.thinkingLevel,
      isStreaming: data.isStreaming,
      isCompacting: data.isCompacting,
      steeringMode: data.steeringMode,
      followUpMode: data.followUpMode,
      sessionFile: aliases.sessionFiles.alias(data.sessionFile),
      sessionId: aliases.sessionIds.alias(data.sessionId),
      sessionName: data.sessionName,
      autoCompactionEnabled: data.autoCompactionEnabled,
      messageCount: data.messageCount,
      pendingMessageCount: data.pendingMessageCount,
    };
  }
  if (command === "get_messages") {
    return {
      messages: Array.isArray(data.messages) ? data.messages.map(summarizeMessage) : [],
    };
  }
  if (command === "get_last_assistant_text") {
    return { text: data.text };
  }
  return data;
}

function summarizeProtocolObject(object, aliases) {
  if (object?.type === "response") {
    const summary = {
      kind: "response",
      id: object.id ?? null,
      command: object.command,
      success: object.success,
    };
    if (typeof object.error === "string") summary.error = object.error;
    const data = summarizeResponseData(object.command, object.data, aliases);
    if (data !== undefined) summary.data = data;
    return summary;
  }
  if (object?.type === "event") {
    return {
      kind: "event",
      event: summarizeEvent(object.event),
    };
  }
  if (object?.type === "extension_ui_request") {
    return {
      kind: "extension_ui_request",
      id: aliases.extensionRequests.alias(object.id),
      method: object.method,
      params: object.params,
    };
  }
  if (object?.type === "extension_ui_cancel") {
    return {
      kind: "extension_ui_cancel",
      id: aliases.extensionRequests.alias(object.id),
    };
  }
  return { kind: "unknown-output", value: object };
}

function sanitizeDiagnosticLine(line) {
  return line
    .replaceAll(installDir, "[install]")
    .replaceAll(workspaceDir, "[workspace]")
    .replaceAll(agentDir, "[agent]");
}

class RpcWorker {
  constructor({ name, cliEntry, args, cwd, env, aliases }) {
    this.name = name;
    this.cliEntry = cliEntry;
    this.args = args;
    this.cwd = cwd;
    this.env = env;
    this.aliases = aliases;
    this.records = [];
    this.waiters = new Set();
    this.stderr = "";
    this.stdoutBuffer = "";
    this.closed = false;
    this.fatalError = undefined;
    this.closeResolve = undefined;
    this.closeReject = undefined;
    this.closePromise = new Promise((resolveClose, rejectClose) => {
      this.closeResolve = resolveClose;
      this.closeReject = rejectClose;
    });
  }

  record(value, raw) {
    const record = {
      sequence: this.records.length + 1,
      ...value,
    };
    if (raw !== undefined) Object.defineProperty(record, "raw", { value: raw, enumerable: false });
    this.records.push(record);
    for (const waiter of [...this.waiters]) {
      let matched = false;
      try {
        matched = waiter.predicate(record);
      } catch (error) {
        clearTimeout(waiter.timer);
        this.waiters.delete(waiter);
        waiter.reject(error);
        continue;
      }
      if (matched) {
        clearTimeout(waiter.timer);
        this.waiters.delete(waiter);
        waiter.resolve(record);
      }
    }
    return record;
  }

  fail(error) {
    if (this.fatalError) return;
    this.fatalError = error instanceof Error ? error : new Error(String(error));
    for (const waiter of [...this.waiters]) {
      clearTimeout(waiter.timer);
      this.waiters.delete(waiter);
      waiter.reject(this.fatalError);
    }
    this.closeReject?.(this.fatalError);
    try {
      this.child?.kill("SIGKILL");
    } catch {
      // Preserve original failure.
    }
  }

  parseStdoutChunk(chunk) {
    this.stdoutBuffer += chunk.toString("utf8");
    while (true) {
      const newlineIndex = this.stdoutBuffer.indexOf("\n");
      if (newlineIndex === -1) break;
      let line = this.stdoutBuffer.slice(0, newlineIndex);
      this.stdoutBuffer = this.stdoutBuffer.slice(newlineIndex + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (line.length === 0) continue;
      let object;
      try {
        object = JSON.parse(line);
      } catch (error) {
        this.fail(new Error(`${this.name} emitted invalid JSONL: ${error.message}`));
        return;
      }
      this.record(summarizeProtocolObject(object, this.aliases), object);
    }
  }

  async start() {
    this.child = spawn(process.execPath, [this.cliEntry, ...this.args], {
      cwd: this.cwd,
      env: this.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    activeWorkers.add(this);
    this.child.stdout.on("data", (chunk) => this.parseStdoutChunk(chunk));
    this.child.stderr.on("data", (chunk) => {
      this.stderr += chunk.toString("utf8");
    });
    this.child.on("error", (error) => this.fail(error));
    this.child.on("exit", (code, signal) => {
      this.record({ kind: "process", event: "exit", code, signal: signal ?? null });
    });
    this.child.on("close", (code, signal) => {
      if (this.stdoutBuffer.trim().length > 0) {
        this.fail(new Error(`${this.name} closed with a non-LF-terminated stdout fragment.`));
        return;
      }
      this.closed = true;
      activeWorkers.delete(this);
      this.record({ kind: "process", event: "close", code, signal: signal ?? null });
      this.closeResolve?.({ code, signal: signal ?? null });
    });
    await new Promise((resolveStart, rejectStart) => {
      const timer = setTimeout(
        () => rejectStart(new Error(`${this.name} did not spawn within ${COMMAND_TIMEOUT_MS}ms.`)),
        COMMAND_TIMEOUT_MS,
      );
      this.child.once("spawn", () => {
        clearTimeout(timer);
        this.record({ kind: "process", event: "spawn" });
        resolveStart();
      });
      this.child.once("error", (error) => {
        clearTimeout(timer);
        rejectStart(error);
      });
    });
  }

  waitFor(predicate, label, timeoutMs = COMMAND_TIMEOUT_MS) {
    const existing = this.records.find(predicate);
    if (existing) return Promise.resolve(existing);
    if (this.fatalError) return Promise.reject(this.fatalError);
    if (this.closed) return Promise.reject(new Error(`${this.name} closed before ${label}.`));
    return new Promise((resolveWait, rejectWait) => {
      const waiter = {
        predicate,
        resolve: resolveWait,
        reject: rejectWait,
        timer: setTimeout(() => {
          this.waiters.delete(waiter);
          rejectWait(new Error(`${this.name} timed out waiting for ${label}.`));
        }, timeoutMs),
      };
      this.waiters.add(waiter);
    });
  }

  waitForResponse(id, command) {
    return this.waitFor(
      (record) =>
        record.kind === "response" &&
        record.id === (id ?? null) &&
        (command === undefined || record.command === command),
      `response ${command ?? "<any>"}:${id ?? "null"}`,
    );
  }

  waitForEvent(type, afterSequence = 0) {
    return this.waitFor(
      (record) => record.sequence > afterSequence && record.kind === "event" && record.event.type === type,
      `event ${type} after ${afterSequence}`,
    );
  }

  send(command) {
    assertCase(this.child?.stdin?.writable, `${this.name} stdin is not writable.`);
    this.record({ kind: "client", action: "send", id: command.id ?? null, command: command.type });
    this.child.stdin.write(`${JSON.stringify(command)}\n`, "utf8");
  }

  sendRaw(line, label) {
    assertCase(this.child?.stdin?.writable, `${this.name} stdin is not writable.`);
    this.record({ kind: "client", action: "send-raw", label });
    this.child.stdin.write(`${line}\n`, "utf8");
  }

  endInput() {
    if (!this.child?.stdin?.writableEnded) {
      this.record({ kind: "client", action: "stdin-end" });
      this.child.stdin.end();
    }
  }

  signal(signal) {
    this.record({ kind: "client", action: "signal", signal });
    const sent = this.child?.kill(signal);
    assertCase(sent === true, `${this.name} failed to send ${signal}.`);
  }

  async waitClosed(timeoutMs = PROCESS_TIMEOUT_MS) {
    let timer;
    try {
      return await Promise.race([
        this.closePromise,
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(new Error(`${this.name} did not close within ${timeoutMs}ms.`)),
            timeoutMs,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  snapshot() {
    return {
      name: this.name,
      transcript: this.records.map(({ raw: _raw, ...record }) => record),
      stderr: {
        present: this.stderr.trim().length > 0,
        lines: this.stderr
          .split(/\r?\n/)
          .filter(Boolean)
          .slice(0, 20)
          .map(sanitizeDiagnosticLine),
      },
    };
  }
}

async function writeResult(result) {
  result.contractFingerprint = sha256(stableFingerprintValue(result));
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
}

function packageRoot() {
  return join(installDir, "node_modules", "@earendil-works", "pi-coding-agent");
}

async function resolveCliEntry() {
  const root = packageRoot();
  const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  const target = typeof manifest.bin === "string" ? manifest.bin : manifest.bin?.pi;
  if (!target) throw new Error("Installed Pi package does not expose the pi binary.");
  return {
    root,
    cliEntry: resolve(root, target),
    name: manifest.name,
    version: manifest.version,
  };
}

async function writeSettings(targetAgentDir) {
  await mkdir(targetAgentDir, { recursive: true });
  await writeFile(
    join(targetAgentDir, "settings.json"),
    `${JSON.stringify({ retry: { enabled: false } }, null, 2)}\n`,
    "utf8",
  );
}

function serializeExtensionMessage(message) {
  return JSON.stringify({
    text: message.text,
    stopReason: message.stopReason,
    errorMessage: message.errorMessage,
    responseId: message.responseId,
    timestamp: message.timestamp,
  });
}

async function writeFauxExtension({ caseName, provider, api, message, targetPath }) {
  const fauxModuleUrl = pathToFileURL(
    join(installDir, "node_modules", "@earendil-works", "pi-ai", "dist", "providers", "faux.js"),
  ).href;
  const source = `import { appendFileSync } from "node:fs";\nimport { fauxAssistantMessage, fauxProvider } from ${JSON.stringify(fauxModuleUrl)};\n\nconst CASE_NAME = ${JSON.stringify(caseName)};\nconst LOG_PATH = process.env.ZHIWEI_RPC_EXTENSION_LOG;\nconst providerHandle = fauxProvider({\n  provider: ${JSON.stringify(provider)},\n  api: ${JSON.stringify(api)},\n  tokensPerSecond: 0,\n  tokenSize: { min: 256, max: 256 },\n});\nconst configuredMessage = ${serializeExtensionMessage(message)};\nproviderHandle.setResponses([\n  fauxAssistantMessage(configuredMessage.text, {\n    stopReason: configuredMessage.stopReason,\n    errorMessage: configuredMessage.errorMessage,\n    responseId: configuredMessage.responseId,\n    timestamp: configuredMessage.timestamp,\n  }),\n]);\n\nfunction textOf(content) {\n  if (typeof content === "string") return content;\n  if (!Array.isArray(content)) return "";\n  return content.filter((part) => part?.type === "text").map((part) => part.text).join("");\n}\n\nfunction record(value) {\n  if (!LOG_PATH) return;\n  appendFileSync(LOG_PATH, JSON.stringify({ caseName: CASE_NAME, ...value }) + "\\n", "utf8");\n}\n\nexport default function extension(pi) {\n  const model = providerHandle.getModel();\n  pi.registerProvider(model.provider, {\n    baseUrl: model.baseUrl,\n    apiKey: "zhiwei-rpc-internal-faux-key",\n    api: model.api,\n    models: [{\n      id: model.id,\n      name: model.name,\n      api: model.api,\n      reasoning: model.reasoning,\n      input: model.input,\n      cost: model.cost,\n      contextWindow: model.contextWindow,\n      maxTokens: model.maxTokens,\n    }],\n  });\n  pi.on("session_start", (event) => record({ type: event.type, reason: event.reason, previousSessionFile: event.previousSessionFile }));\n  pi.on("message_end", (event) => record({\n    type: event.type,\n    message: {\n      role: event.message.role,\n      text: "content" in event.message ? textOf(event.message.content) : undefined,\n      stopReason: event.message.stopReason,\n      errorMessage: event.message.errorMessage,\n    },\n  }));\n  pi.on("agent_end", (event) => record({ type: event.type, messageRoles: event.messages.map((item) => item.role) }));\n  pi.on("agent_settled", (event) => record({ type: event.type }));\n  pi.on("session_shutdown", (event) => record({ type: event.type, reason: event.reason, targetSessionFile: event.targetSessionFile }));\n}\n`;
  await writeFile(targetPath, source, "utf8");
}

async function readExtensionLog(logPath, aliases) {
  try {
    const text = await readFile(logPath, "utf8");
    return text
      .split("\n")
      .filter(Boolean)
      .map((line, index) => {
        const record = JSON.parse(line);
        return {
          sequence: index + 1,
          caseName: record.caseName,
          type: record.type,
          reason: record.reason,
          previousSessionFile: aliases.sessionFiles.alias(record.previousSessionFile),
          targetSessionFile: aliases.sessionFiles.alias(record.targetSessionFile),
          message: record.message,
          messageRoles: record.messageRoles,
        };
      });
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

function commandResponse(worker, id, command) {
  return worker.records.find(
    (record) => record.kind === "response" && record.id === (id ?? null) && record.command === command,
  );
}

function eventSequence(worker, type, predicate = () => true) {
  return worker.records.find(
    (record) => record.kind === "event" && record.event.type === type && predicate(record.event),
  )?.sequence;
}

function responseSequence(worker, id, command) {
  return commandResponse(worker, id, command)?.sequence;
}

function outputCount(worker, predicate) {
  return worker.records.filter(predicate).length;
}

async function createWorker({
  name,
  cliEntry,
  cwd,
  workerAgentDir,
  sessionDir,
  sessionFile,
  noSession = false,
  extensionPath,
  extensionLogPath,
  provider,
  aliases,
  noExtensions = false,
}) {
  const args = [
    "--mode",
    "rpc",
    "--agent-dir",
    workerAgentDir,
    "--no-tools",
    "--no-skills",
    "--no-prompt-templates",
    "--no-themes",
    "--thinking",
    "off",
  ];
  if (sessionDir) args.push("--session-dir", sessionDir);
  if (sessionFile) args.push("--session", sessionFile);
  if (noSession) args.push("--no-session");
  if (noExtensions) {
    args.push("--no-extensions");
  } else if (extensionPath) {
    args.push("--extension", extensionPath);
  }
  if (provider) args.push("--provider", provider, "--model", "faux-1");

  const worker = new RpcWorker({
    name,
    cliEntry,
    args,
    cwd,
    aliases,
    env: cleanEnvironment({
      HOME: join(workerAgentDir, "home"),
      ZHIWEI_RPC_EXTENSION_LOG: extensionLogPath,
    }),
  });
  await worker.start();
  return worker;
}

async function runNormalPromptAndRestart(cliEntry, aliases) {
  stage = "normal-restart:configure";
  const caseRoot = join(workspaceDir, "normal-restart");
  const caseAgentDir = join(agentDir, "normal-restart");
  const sessionDir = join(caseAgentDir, "sessions");
  const extensionOne = join(installDir, "zhiwei-rpc-normal-worker-1-extension.mjs");
  const extensionTwo = join(installDir, "zhiwei-rpc-normal-worker-2-extension.mjs");
  const extensionOneLog = join(caseRoot, "worker-1-extension.jsonl");
  const extensionTwoLog = join(caseRoot, "worker-2-extension.jsonl");
  const provider = "zhiwei-rpc-faux";
  const api = "zhiwei-rpc-faux-api";
  await Promise.all([
    mkdir(caseRoot, { recursive: true }),
    mkdir(sessionDir, { recursive: true }),
    writeSettings(caseAgentDir),
    writeFauxExtension({
      caseName: "normal-worker-1",
      provider,
      api,
      targetPath: extensionOne,
      message: {
        text: NORMAL_RESPONSES.initial,
        stopReason: "stop",
        responseId: "zhiwei-rpc-normal-response-1",
        timestamp: 1000,
      },
    }),
    writeFauxExtension({
      caseName: "normal-worker-2",
      provider,
      api,
      targetPath: extensionTwo,
      message: {
        text: NORMAL_RESPONSES.resumed,
        stopReason: "stop",
        responseId: "zhiwei-rpc-normal-response-2",
        timestamp: 2000,
      },
    }),
  ]);

  stage = "normal-restart:worker-1";
  const workerOne = await createWorker({
    name: "normal-worker-1",
    cliEntry,
    cwd: caseRoot,
    workerAgentDir: caseAgentDir,
    sessionDir,
    extensionPath: extensionOne,
    extensionLogPath: extensionOneLog,
    provider,
    aliases,
  });

  workerOne.sendRaw("{", "invalid-json");
  const parseResponse = await workerOne.waitForResponse(null, "parse");

  const unicodeUnknownLine = `{"id":"normal-unicode-unknown","type":"unknown_with_unicode_note","note":"alpha\u2028beta\u2029gamma"}`
    .replace("\\u2028", "\u2028")
    .replace("\\u2029", "\u2029");
  workerOne.sendRaw(unicodeUnknownLine, "unicode-separators-inside-json-string");
  const unknownResponse = await workerOne.waitForResponse("normal-unicode-unknown", "unknown");

  workerOne.send({ id: "normal-state-before", type: "get_state" });
  const stateBefore = await workerOne.waitForResponse("normal-state-before", "get_state");

  const promptStartSequence = workerOne.records.length;
  workerOne.send({ id: "normal-prompt-1", type: "prompt", message: NORMAL_PROMPTS.initial });
  const promptResponse = await workerOne.waitForResponse("normal-prompt-1", "prompt");
  await workerOne.waitForEvent("agent_settled", promptStartSequence);

  workerOne.send({ id: "normal-state-after", type: "get_state" });
  const stateAfter = await workerOne.waitForResponse("normal-state-after", "get_state");
  workerOne.send({ id: "normal-messages-after", type: "get_messages" });
  const messagesAfter = await workerOne.waitForResponse("normal-messages-after", "get_messages");
  workerOne.send({ id: "normal-last-after", type: "get_last_assistant_text" });
  const lastAfter = await workerOne.waitForResponse("normal-last-after", "get_last_assistant_text");

  const rawSessionFile = stateAfter.raw?.data?.sessionFile;
  assertCase(typeof rawSessionFile === "string" && rawSessionFile.length > 0, "normal worker did not persist a Session file.");
  aliases.sessionFiles.alias(rawSessionFile);

  workerOne.endInput();
  const closeOne = await workerOne.waitClosed();
  const extensionEventsOne = await readExtensionLog(extensionOneLog, aliases);

  assertCase(parseResponse.success === false, "Malformed JSON did not produce a failed parse response.");
  assertCase(unknownResponse.success === false, "Unknown command did not produce a failed response.");
  assertCase(promptResponse.success === true, "Normal Prompt was not accepted.");
  assertCase(stateBefore.success === true && stateAfter.success === true, "Normal state command failed.");
  assertCase(messagesAfter.success === true, "Normal get_messages failed.");
  assertCase(lastAfter.raw?.data?.text === NORMAL_RESPONSES.initial, "Normal last assistant text drifted.");
  assertCase(closeOne.code === 0 && closeOne.signal === null, `stdin EOF exit drifted: ${JSON.stringify(closeOne)}.`);
  assertCase(workerOne.stderr.trim().length === 0, `Normal worker wrote stderr: ${workerOne.stderr.trim()}`);
  assertCase(
    extensionEventsOne.some((event) => event.type === "session_shutdown" && event.reason === "quit"),
    "Normal worker extension did not observe quit shutdown.",
  );

  stage = "normal-restart:worker-2";
  const workerTwo = await createWorker({
    name: "normal-worker-2",
    cliEntry,
    cwd: caseRoot,
    workerAgentDir: caseAgentDir,
    sessionFile: rawSessionFile,
    extensionPath: extensionTwo,
    extensionLogPath: extensionTwoLog,
    provider,
    aliases,
  });

  workerTwo.send({ id: "restart-state-before", type: "get_state" });
  const restartStateBefore = await workerTwo.waitForResponse("restart-state-before", "get_state");
  workerTwo.send({ id: "restart-messages-before", type: "get_messages" });
  const restartMessagesBefore = await workerTwo.waitForResponse("restart-messages-before", "get_messages");

  const restartPromptStart = workerTwo.records.length;
  workerTwo.send({ id: "restart-prompt-2", type: "prompt", message: NORMAL_PROMPTS.resumed });
  const restartPromptResponse = await workerTwo.waitForResponse("restart-prompt-2", "prompt");
  await workerTwo.waitForEvent("agent_settled", restartPromptStart);

  workerTwo.send({ id: "restart-state-after", type: "get_state" });
  const restartStateAfter = await workerTwo.waitForResponse("restart-state-after", "get_state");
  workerTwo.send({ id: "restart-messages-after", type: "get_messages" });
  const restartMessagesAfter = await workerTwo.waitForResponse("restart-messages-after", "get_messages");
  workerTwo.send({ id: "restart-last-after", type: "get_last_assistant_text" });
  const restartLastAfter = await workerTwo.waitForResponse("restart-last-after", "get_last_assistant_text");

  workerTwo.signal("SIGTERM");
  const closeTwo = await workerTwo.waitClosed();
  const extensionEventsTwo = await readExtensionLog(extensionTwoLog, aliases);

  assertCase(restartStateBefore.success === true && restartStateAfter.success === true, "Restart state command failed.");
  assertCase(restartMessagesBefore.success === true && restartMessagesAfter.success === true, "Restart messages command failed.");
  assertCase(restartPromptResponse.success === true, "Restart Prompt was not accepted.");
  assertCase(restartLastAfter.raw?.data?.text === NORMAL_RESPONSES.resumed, "Restart last assistant text drifted.");
  assertCase(closeTwo.code === 143 && closeTwo.signal === null, `SIGTERM exit drifted: ${JSON.stringify(closeTwo)}.`);
  assertCase(workerTwo.stderr.trim().length === 0, `Restart worker wrote stderr: ${workerTwo.stderr.trim()}`);
  assertCase(
    extensionEventsTwo.some((event) => event.type === "session_shutdown" && event.reason === "quit"),
    "Restart worker extension did not observe quit shutdown.",
  );
  assertCase(
    restartMessagesBefore.data?.messages?.map((message) => message.role).join(",") === "user,assistant",
    "Restart worker did not restore the first Prompt messages.",
  );
  assertCase(
    restartMessagesAfter.data?.messages?.map((message) => message.role).join(",") ===
      "user,assistant,user,assistant",
    "Restart worker final messages drifted.",
  );
  assertCase(
    stateAfter.data?.sessionFile === restartStateBefore.data?.sessionFile &&
      stateAfter.data?.sessionId === restartStateBefore.data?.sessionId,
    "Restart worker did not preserve Session identity aliases.",
  );

  return {
    prompts: NORMAL_PROMPTS,
    responses: NORMAL_RESPONSES,
    provider: {
      id: provider,
      api,
      responsesConfiguredPerWorker: 1,
      promptsSentToExternalProvider: EXTERNAL_PROVIDER_PROMPTS,
    },
    normalPromptEof: {
      worker: workerOne.snapshot(),
      extensionEvents: extensionEventsOne,
      observations: {
        parseResponseSequence: parseResponse.sequence,
        unknownResponseSequence: unknownResponse.sequence,
        promptResponseSequence: responseSequence(workerOne, "normal-prompt-1", "prompt"),
        agentStartSequence: eventSequence(workerOne, "agent_start"),
        userMessageStartSequence: eventSequence(
          workerOne,
          "message_start",
          (event) => event.message?.role === "user",
        ),
        assistantMessageEndSequence: eventSequence(
          workerOne,
          "message_end",
          (event) => event.message?.role === "assistant",
        ),
        agentEndSequence: eventSequence(workerOne, "agent_end"),
        agentSettledSequence: eventSequence(workerOne, "agent_settled"),
        responsePrecedesSettled:
          responseSequence(workerOne, "normal-prompt-1", "prompt") < eventSequence(workerOne, "agent_settled"),
        framingUnicodeSeparatorsProducedOneResponse:
          outputCount(
            workerOne,
            (record) => record.kind === "response" && record.id === "normal-unicode-unknown",
          ) === 1,
      },
      finalState: stateAfter.data,
      finalMessages: messagesAfter.data.messages,
      lastAssistantText: lastAfter.data.text,
      exit: closeOne,
    },
    restartResumeSigterm: {
      worker: workerTwo.snapshot(),
      extensionEvents: extensionEventsTwo,
      observations: {
        promptResponseSequence: responseSequence(workerTwo, "restart-prompt-2", "prompt"),
        agentStartSequence: eventSequence(workerTwo, "agent_start"),
        agentSettledSequence: eventSequence(workerTwo, "agent_settled"),
        responsePrecedesSettled:
          responseSequence(workerTwo, "restart-prompt-2", "prompt") < eventSequence(workerTwo, "agent_settled"),
      },
      restoredState: restartStateBefore.data,
      restoredMessages: restartMessagesBefore.data.messages,
      finalState: restartStateAfter.data,
      finalMessages: restartMessagesAfter.data.messages,
      lastAssistantText: restartLastAfter.data.text,
      exit: closeTwo,
    },
  };
}

async function runPreflightRejection(cliEntry, aliases) {
  stage = "preflight-rejection:configure";
  const caseRoot = join(workspaceDir, "preflight-rejection");
  const caseAgentDir = join(agentDir, "preflight-rejection");
  await Promise.all([mkdir(caseRoot, { recursive: true }), writeSettings(caseAgentDir)]);

  stage = "preflight-rejection:run";
  const worker = await createWorker({
    name: "preflight-rejection-worker",
    cliEntry,
    cwd: caseRoot,
    workerAgentDir: caseAgentDir,
    noSession: true,
    noExtensions: true,
    aliases,
  });
  worker.send({ id: "preflight-state-before", type: "get_state" });
  const stateBefore = await worker.waitForResponse("preflight-state-before", "get_state");
  worker.send({ id: "preflight-prompt", type: "prompt", message: "This Prompt must fail preflight." });
  const promptResponse = await worker.waitForResponse("preflight-prompt", "prompt");
  worker.send({ id: "preflight-state-after", type: "get_state" });
  const stateAfter = await worker.waitForResponse("preflight-state-after", "get_state");
  worker.endInput();
  const close = await worker.waitClosed();

  assertCase(stateBefore.success === true && stateAfter.success === true, "Preflight state command failed.");
  assertCase(promptResponse.success === false, "Prompt without a model was unexpectedly accepted.");
  assertCase(
    outputCount(worker, (record) => record.kind === "event" && record.event.type === "agent_start") === 0,
    "Preflight rejection unexpectedly started an Agent Run.",
  );
  assertCase(close.code === 0 && close.signal === null, "Preflight worker did not exit cleanly on EOF.");
  assertCase(worker.stderr.trim().length === 0, `Preflight worker wrote stderr: ${worker.stderr.trim()}`);

  return {
    worker: worker.snapshot(),
    response: {
      sequence: promptResponse.sequence,
      success: promptResponse.success,
      error: promptResponse.error,
    },
    beforeState: stateBefore.data,
    afterState: stateAfter.data,
    agentStartCount: 0,
    exit: close,
  };
}

async function runAcceptedProviderError(cliEntry, aliases) {
  stage = "accepted-provider-error:configure";
  const caseRoot = join(workspaceDir, "accepted-provider-error");
  const caseAgentDir = join(agentDir, "accepted-provider-error");
  const extensionPath = join(installDir, "zhiwei-rpc-error-worker-extension.mjs");
  const extensionLog = join(caseRoot, "extension.jsonl");
  const provider = "zhiwei-rpc-error-faux";
  const api = "zhiwei-rpc-error-faux-api";
  await Promise.all([
    mkdir(caseRoot, { recursive: true }),
    writeSettings(caseAgentDir),
    writeFauxExtension({
      caseName: "accepted-provider-error",
      provider,
      api,
      targetPath: extensionPath,
      message: {
        text: "",
        stopReason: "error",
        errorMessage: PROVIDER_ERROR_MESSAGE,
        responseId: "zhiwei-rpc-provider-error-response",
        timestamp: 3000,
      },
    }),
  ]);

  stage = "accepted-provider-error:run";
  const worker = await createWorker({
    name: "accepted-provider-error-worker",
    cliEntry,
    cwd: caseRoot,
    workerAgentDir: caseAgentDir,
    noSession: true,
    extensionPath,
    extensionLogPath: extensionLog,
    provider,
    aliases,
  });

  const promptStart = worker.records.length;
  worker.send({ id: "provider-error-prompt", type: "prompt", message: PROVIDER_ERROR_PROMPT });
  const promptResponse = await worker.waitForResponse("provider-error-prompt", "prompt");
  await worker.waitForEvent("agent_settled", promptStart);
  worker.send({ id: "provider-error-state", type: "get_state" });
  const state = await worker.waitForResponse("provider-error-state", "get_state");
  worker.send({ id: "provider-error-messages", type: "get_messages" });
  const messages = await worker.waitForResponse("provider-error-messages", "get_messages");
  worker.send({ id: "provider-error-last", type: "get_last_assistant_text" });
  const last = await worker.waitForResponse("provider-error-last", "get_last_assistant_text");
  worker.endInput();
  const close = await worker.waitClosed();
  const extensionEvents = await readExtensionLog(extensionLog, aliases);

  const assistantMessages = messages.data.messages.filter((message) => message.role === "assistant");
  assertCase(promptResponse.success === true, "Provider-error Prompt was not accepted before execution.");
  assertCase(
    assistantMessages.some(
      (message) => message.stopReason === "error" && message.errorMessage === PROVIDER_ERROR_MESSAGE,
    ),
    "Provider error was not persisted as an Assistant error message.",
  );
  assertCase(
    outputCount(
      worker,
      (record) => record.kind === "response" && record.id === "provider-error-prompt",
    ) === 1,
    "Provider error produced more than one correlated Prompt response.",
  );
  assertCase(
    worker.records.some(
      (record) => record.kind === "event" && record.event.type === "agent_end" && record.event.willRetry === false,
    ),
    "Provider error did not finish with agent_end(willRetry=false).",
  );
  assertCase(state.data.isStreaming === false, "Provider-error worker did not return to idle state.");
  assertCase(last.data.text === "", "Provider-error last assistant text must be empty.");
  assertCase(close.code === 0 && close.signal === null, "Provider-error worker did not exit cleanly on EOF.");
  assertCase(worker.stderr.trim().length === 0, `Provider-error worker wrote stderr: ${worker.stderr.trim()}`);
  assertCase(
    extensionEvents.some((event) => event.type === "session_shutdown" && event.reason === "quit"),
    "Provider-error extension did not observe quit shutdown.",
  );

  return {
    prompt: PROVIDER_ERROR_PROMPT,
    errorMessage: PROVIDER_ERROR_MESSAGE,
    provider: {
      id: provider,
      api,
      responsesConfigured: 1,
      promptsSentToExternalProvider: EXTERNAL_PROVIDER_PROMPTS,
    },
    worker: worker.snapshot(),
    extensionEvents,
    observations: {
      promptResponseSequence: responseSequence(worker, "provider-error-prompt", "prompt"),
      assistantErrorMessageEndSequence: eventSequence(
        worker,
        "message_end",
        (event) => event.message?.role === "assistant" && event.message?.stopReason === "error",
      ),
      agentEndSequence: eventSequence(worker, "agent_end"),
      agentSettledSequence: eventSequence(worker, "agent_settled"),
      promptResponseCount: 1,
      responsePrecedesSettled:
        responseSequence(worker, "provider-error-prompt", "prompt") < eventSequence(worker, "agent_settled"),
    },
    finalState: state.data,
    finalMessages: messages.data.messages,
    lastAssistantText: last.data.text,
    exit: close,
  };
}

async function stopActiveWorkers() {
  for (const worker of [...activeWorkers]) {
    try {
      worker.signal("SIGKILL");
    } catch {
      // Best-effort cleanup after failure.
    }
  }
  await Promise.allSettled([...activeWorkers].map((worker) => worker.waitClosed(5_000)));
}

async function run() {
  if ((process.env.PI_LIFECYCLE_SCENARIO ?? SCENARIO) !== SCENARIO) {
    throw new Error(`Unexpected lifecycle scenario: ${process.env.PI_LIFECYCLE_SCENARIO ?? "<missing>"}`);
  }
  await Promise.all([mkdir(workspaceDir, { recursive: true }), mkdir(agentDir, { recursive: true })]);

  stage = "resolve-installed-cli";
  const installed = await resolveCliEntry();
  const aliases = {
    sessionIds: createAliasMap("session-id"),
    sessionFiles: createAliasMap("session-file"),
    extensionRequests: createAliasMap("extension-request"),
  };

  completedCases.normalAndRestart = await runNormalPromptAndRestart(installed.cliEntry, aliases);
  completedCases.preflightRejection = await runPreflightRejection(installed.cliEntry, aliases);
  completedCases.acceptedProviderError = await runAcceptedProviderError(installed.cliEntry, aliases);

  const result = {
    schemaVersion: SCHEMA_VERSION,
    status: "passed",
    scenario: SCENARIO,
    package: {
      name: installed.name,
      version: installed.version,
      executionMode: "node-cli-entry-real-subprocess",
    },
    protocol: {
      transport: "stdio-jsonl",
      framing: "lf-only",
      unicodeLineSeparatorsInsideJsonString: ["U+2028", "U+2029"],
      promptResponseMeaning: "preflight-acceptance-not-run-completion",
    },
    cases: completedCases,
    aliases: {
      sessionIds: aliases.sessionIds.values(),
      sessionFiles: aliases.sessionFiles.values(),
      extensionRequests: aliases.extensionRequests.values(),
    },
    security: {
      hostSecretsPassedToWorker: false,
      realProviderCredentialsUsed: false,
      promptsSentToExternalProvider: EXTERNAL_PROVIDER_PROMPTS,
      businessFileWrites: false,
      networkCallsByWorkerProvider: false,
      rawEnvironmentDumpIncluded: false,
    },
    sanitization: {
      absolutePathsIncluded: false,
      rawSessionIdIncluded: false,
      rawSessionFileIncluded: false,
      processPidIncluded: false,
      credentialsIncluded: false,
      rawChainOfThoughtIncluded: false,
      stderrLimitedToSanitizedLines: true,
    },
  };

  const serialized = JSON.stringify(result);
  for (const rawValue of [
    installDir,
    workspaceDir,
    agentDir,
    ...aliases.sessionIds.rawValues(),
    ...aliases.sessionFiles.rawValues(),
  ]) {
    if (rawValue && serialized.includes(rawValue)) {
      throw new Error(`Sanitization leaked a dynamic value: ${sanitizeDiagnosticLine(rawValue)}`);
    }
  }
  await writeResult(result);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

try {
  await run();
} catch (error) {
  await stopActiveWorkers();
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
      processPidIncluded: false,
      credentialsIncluded: false,
      rawChainOfThoughtIncluded: false,
    },
  };
  await writeResult(failure);
  console.error(`Pi RPC Worker lifecycle capture failed at ${stage}: ${failure.error.message}`);
  process.exitCode = 1;
} finally {
  for (const extensionPath of [
    join(installDir, "zhiwei-rpc-normal-worker-1-extension.mjs"),
    join(installDir, "zhiwei-rpc-normal-worker-2-extension.mjs"),
    join(installDir, "zhiwei-rpc-error-worker-extension.mjs"),
  ]) {
    await rm(extensionPath, { force: true });
  }
}
