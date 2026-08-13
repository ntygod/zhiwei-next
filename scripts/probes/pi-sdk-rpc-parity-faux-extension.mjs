import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  PI_PACKAGE_INTEGRITY,
  PI_PACKAGE_NAME,
  PI_PACKAGE_SHASUM,
  PI_PACKAGE_VERSION,
  PI_RELEASE_COMMIT,
  PI_RELEASE_TAG,
  RPC_WORKER_COMMAND_TIMEOUT_MS,
  RPC_WORKER_ERROR_PROVIDER_API_ID,
  RPC_WORKER_ERROR_PROVIDER_ID,
  RPC_WORKER_LIFECYCLE_SCENARIO,
  RPC_WORKER_LIFECYCLE_SCHEMA_VERSION,
  RPC_WORKER_MODEL_ID,
  RPC_WORKER_MODEL_NAME,
  RPC_WORKER_NORMAL_PROMPTS,
  RPC_WORKER_NORMAL_RESPONSES,
  RPC_WORKER_PROCESS_TIMEOUT_MS,
  RPC_WORKER_PROVIDER_API_ID,
  RPC_WORKER_PROVIDER_ERROR_MESSAGE,
  RPC_WORKER_PROVIDER_ERROR_PROMPT,
  RPC_WORKER_PROVIDER_ID,
  RPC_WORKER_TOKEN_SIZE,
  RPC_WORKER_TOKENS_PER_SECOND,
  SDK_RPC_PARITY_API_ID,
  SDK_RPC_PARITY_FINAL_TEXT,
  SDK_RPC_PARITY_MODEL_ID,
  SDK_RPC_PARITY_MODEL_NAME,
  SDK_RPC_PARITY_PROVIDER_ID,
  SDK_RPC_PARITY_RESPONSE_ID,
  SDK_RPC_PARITY_SCENARIO,
  SDK_RPC_PARITY_SCHEMA_VERSION,
  SDK_RPC_PARITY_TOKEN_SIZE,
  SDK_RPC_PARITY_TOKENS_PER_SECOND,
} from "./pi-sdk-rpc-parity-contract.mjs";

const thisFile = fileURLToPath(import.meta.url);
const isDirectExecution =
  typeof process.argv[1] === "string" && resolve(process.argv[1]) === resolve(thisFile);

function resolveRequiredPath(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return resolve(value);
}

function resolveRequiredRunIdentity(name) {
  const value = process.env[name];
  if (!/^[a-f0-9]{64}$/.test(value ?? "")) {
    throw new Error(`${name} must be a 64-character lowercase hexadecimal nonce.`);
  }
  return value;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function stableResult(result) {
  const clone = structuredClone(result);
  delete clone.contractFingerprint;
  return JSON.stringify(clone);
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
  if (typeof content === "string") return ["text"];
  if (!Array.isArray(content)) return [];
  return content.map((item) => item?.type ?? "unknown");
}

async function loadFauxProvider(installDir) {
  const fauxEntry = join(
    installDir,
    "node_modules",
    "@earendil-works",
    "pi-ai",
    "dist",
    "providers",
    "faux.js",
  );
  return import(pathToFileURL(fauxEntry).href);
}

async function registerSdkRpcParityExtension(pi) {
  const installDir = resolveRequiredPath("PI_INSTALL_DIR");
  const evidencePath = resolveRequiredPath("PI_RPC_EXTENSION_EVIDENCE");
  const runIdentity = resolveRequiredRunIdentity("PI_RPC_EXTENSION_RUN_IDENTITY");
  const events = [];
  const { fauxProvider, fauxAssistantMessage } = await loadFauxProvider(installDir);
  const fauxHandle = fauxProvider({
    api: SDK_RPC_PARITY_API_ID,
    provider: SDK_RPC_PARITY_PROVIDER_ID,
    models: [
      {
        id: SDK_RPC_PARITY_MODEL_ID,
        name: SDK_RPC_PARITY_MODEL_NAME,
        reasoning: false,
        input: ["text"],
        contextWindow: 128000,
        maxTokens: 4096,
      },
    ],
    tokensPerSecond: SDK_RPC_PARITY_TOKENS_PER_SECOND,
    tokenSize: {
      min: SDK_RPC_PARITY_TOKEN_SIZE,
      max: SDK_RPC_PARITY_TOKEN_SIZE,
    },
  });
  fauxHandle.setResponses([
    fauxAssistantMessage(SDK_RPC_PARITY_FINAL_TEXT, {
      stopReason: "stop",
      responseId: SDK_RPC_PARITY_RESPONSE_ID,
      timestamp: 2000,
    }),
  ]);
  pi.registerProvider(fauxHandle.provider);

  function sanitizeParityEvent(event) {
    const record = { sequence: events.length + 1, type: event.type };
    for (const key of ["reason", "source", "fromExtension", "willRetry"]) {
      if (event[key] !== undefined) record[key] = event[key];
    }
    if (event.message) {
      record.messageRole = event.message.role;
      if (event.message.stopReason !== undefined) record.stopReason = event.message.stopReason;
      const kinds = contentKinds(event.message.content);
      if (kinds.length > 0) record.contentKinds = kinds;
      const text = textFromContent(event.message.content);
      if (text !== undefined) {
        record.messageTextLength = text.length;
        record.messageTextSha256 = sha256(text);
      }
    }
    if (event.assistantMessageEvent) {
      record.updateType = event.assistantMessageEvent.type;
      record.hasPartial = Object.hasOwn(event.assistantMessageEvent, "partial");
      if (typeof event.assistantMessageEvent.delta === "string") {
        record.deltaLength = event.assistantMessageEvent.delta.length;
        record.deltaSha256 = sha256(event.assistantMessageEvent.delta);
      }
    }
    return record;
  }

  async function writeParityEvidence(shutdownReason) {
    const result = {
      schemaVersion: SDK_RPC_PARITY_SCHEMA_VERSION,
      status: "passed",
      scenario: SDK_RPC_PARITY_SCENARIO,
      runIdentity,
      provider: {
        id: fauxHandle.provider.id,
        api: fauxHandle.api,
        modelId: fauxHandle.getModel().id,
        callCount: fauxHandle.state.callCount,
        pendingResponses: fauxHandle.getPendingResponseCount(),
        promptsSentToExternalProvider: 0,
      },
      shutdown: {
        observed: true,
        reason: shutdownReason,
      },
      events,
      sanitization: {
        absolutePathsIncluded: false,
        rawSessionIdIncluded: false,
        rawSessionFileIncluded: false,
        environmentDumpIncluded: false,
        credentialsIncluded: false,
        rawChainOfThoughtIncluded: false,
      },
    };
    await mkdir(dirname(evidencePath), { recursive: true });
    await writeFile(evidencePath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  }

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
      events.push(sanitizeParityEvent(event));
      if (event.type === "session_shutdown") {
        await writeParityEvidence(event.reason);
      }
    });
  }
}

const RPC_WORKER_EXTENSION_CASES = Object.freeze({
  "normal-worker-1": {
    provider: RPC_WORKER_PROVIDER_ID,
    api: RPC_WORKER_PROVIDER_API_ID,
    text: RPC_WORKER_NORMAL_RESPONSES.initial,
    stopReason: "stop",
    responseId: "zhiwei-rpc-worker-response-1",
    timestamp: 1000,
  },
  "normal-worker-2": {
    provider: RPC_WORKER_PROVIDER_ID,
    api: RPC_WORKER_PROVIDER_API_ID,
    text: RPC_WORKER_NORMAL_RESPONSES.resumed,
    stopReason: "stop",
    responseId: "zhiwei-rpc-worker-response-2",
    timestamp: 2000,
  },
  "accepted-provider-error": {
    provider: RPC_WORKER_ERROR_PROVIDER_ID,
    api: RPC_WORKER_ERROR_PROVIDER_API_ID,
    text: "",
    stopReason: "error",
    errorMessage: RPC_WORKER_PROVIDER_ERROR_MESSAGE,
    responseId: "zhiwei-rpc-worker-provider-error-response",
    timestamp: 3000,
  },
});

async function registerRpcWorkerExtension(pi) {
  const installDir = resolveRequiredPath("PI_INSTALL_DIR");
  const logPath = resolveRequiredPath("ZHIWEI_RPC_WORKER_EXTENSION_LOG");
  const evidencePath = resolveRequiredPath("ZHIWEI_RPC_WORKER_EXTENSION_EVIDENCE");
  const runIdentity = resolveRequiredRunIdentity("ZHIWEI_RPC_WORKER_EXTENSION_RUN_IDENTITY");
  const caseName = process.env.ZHIWEI_RPC_WORKER_EXTENSION_CASE;
  const configuration = RPC_WORKER_EXTENSION_CASES[caseName];
  if (!configuration) {
    throw new Error(`Unknown RPC Worker Extension case: ${caseName ?? "<missing>"}.`);
  }

  const { fauxProvider, fauxAssistantMessage } = await loadFauxProvider(installDir);
  const providerHandle = fauxProvider({
    api: configuration.api,
    provider: configuration.provider,
    models: [
      {
        id: RPC_WORKER_MODEL_ID,
        name: RPC_WORKER_MODEL_NAME,
        reasoning: false,
        input: ["text"],
        contextWindow: 128000,
        maxTokens: 4096,
      },
    ],
    tokensPerSecond: RPC_WORKER_TOKENS_PER_SECOND,
    tokenSize: {
      min: RPC_WORKER_TOKEN_SIZE,
      max: RPC_WORKER_TOKEN_SIZE,
    },
  });
  providerHandle.setResponses([
    fauxAssistantMessage(configuration.text, {
      stopReason: configuration.stopReason,
      errorMessage: configuration.errorMessage,
      responseId: configuration.responseId,
      timestamp: configuration.timestamp,
    }),
  ]);
  pi.registerProvider(providerHandle.provider);

  function record(value) {
    appendFileSync(
      logPath,
      `${JSON.stringify({ runIdentity, caseName, ...value })}\n`,
      "utf8",
    );
  }

  function writeShutdownEvidence(reason) {
    const temporaryPath = `${evidencePath}.${runIdentity}.tmp`;
    const evidence = {
      schemaVersion: RPC_WORKER_LIFECYCLE_SCHEMA_VERSION,
      status: "passed",
      scenario: RPC_WORKER_LIFECYCLE_SCENARIO,
      runIdentity,
      caseName,
      provider: {
        id: providerHandle.provider.id,
        api: providerHandle.api,
        modelId: providerHandle.getModel().id,
        callCount: providerHandle.state.callCount,
        pendingResponses: providerHandle.getPendingResponseCount(),
        promptsSentToExternalProvider: 0,
      },
      shutdown: {
        observed: true,
        reason,
      },
    };
    writeFileSync(temporaryPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
    renameSync(temporaryPath, evidencePath);
  }

  for (const eventType of [
    "session_start",
    "message_end",
    "agent_end",
    "agent_settled",
    "session_shutdown",
  ]) {
    pi.on(eventType, async (event) => {
      if (event.type === "session_start") {
        record({
          type: event.type,
          reason: event.reason,
          previousSessionFile: event.previousSessionFile,
        });
      } else if (event.type === "message_end") {
        record({
          type: event.type,
          message: {
            role: event.message?.role,
            text: textFromContent(event.message?.content),
            stopReason: event.message?.stopReason,
            errorMessage: event.message?.errorMessage,
          },
        });
      } else if (event.type === "agent_end") {
        record({
          type: event.type,
          messageRoles: Array.isArray(event.messages)
            ? event.messages.map((message) => message?.role)
            : [],
          willRetry: event.willRetry,
        });
      } else if (event.type === "session_shutdown") {
        record({
          type: event.type,
          reason: event.reason,
          targetSessionFile: event.targetSessionFile,
        });
        writeShutdownEvidence(event.reason);
      } else {
        record({ type: event.type });
      }
    });
  }
}

export default async function registerSdkRpcProbe(pi) {
  if (process.env.ZHIWEI_RPC_WORKER_EXTENSION_CASE) {
    await registerRpcWorkerExtension(pi);
    return;
  }
  await registerSdkRpcParityExtension(pi);
}

let rpcInstallDir;
let rpcOutputPath;
let rpcWorkspaceDir;
let rpcAgentDir;
let rpcStage = "bootstrap";
const rpcCompletedCases = {};
const activeWorkers = new Set();
const rpcRunIdentities = new Set();

function requireValue(condition, message) {
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

function cleanChildEnvironment(overrides = {}) {
  const allowed = [
    "PATH",
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

function redactDynamicPaths(value) {
  let result = String(value);
  for (const [path, replacement] of [
    [rpcInstallDir, "<pi-install-dir>"],
    [rpcWorkspaceDir, "<workspace-dir>"],
    [rpcAgentDir, "<agent-dir>"],
    [rpcOutputPath ? dirname(rpcOutputPath) : undefined, "<output-dir>"],
    [thisFile, "<capture-extension>"],
  ]) {
    if (path) result = result.split(path).join(replacement);
  }
  for (const runIdentity of rpcRunIdentities) {
    result = result.split(runIdentity).join("<run-identity>");
  }
  return result;
}

function normalizeRpcError(error) {
  return {
    stage: rpcStage,
    name: error instanceof Error ? error.name : "Error",
    message: redactDynamicPaths(error instanceof Error ? error.message : String(error)),
  };
}

function summarizeUsage(usage) {
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
  const summary = { role: message.role };
  if (Object.hasOwn(message, "content")) {
    summary.contentKinds = contentKinds(message.content);
    summary.text = textFromContent(message.content) ?? "";
  }
  if (typeof message.summary === "string") summary.summary = message.summary;
  if (typeof message.stopReason === "string") summary.stopReason = message.stopReason;
  if (typeof message.errorMessage === "string") summary.errorMessage = message.errorMessage;
  const usage = summarizeUsage(message.usage);
  if (usage) summary.usage = usage;
  return summary;
}

function summarizeAssistantMessageEvent(event) {
  if (!event || typeof event !== "object") return undefined;
  const summary = {
    type: event.type,
    hasPartial: Object.hasOwn(event, "partial"),
  };
  for (const key of ["delta", "reason", "errorMessage"]) {
    if (typeof event[key] === "string") summary[key] = event[key];
  }
  if (event.message) summary.message = summarizeMessage(event.message);
  return summary;
}

function summarizeEvent(event) {
  if (!event || typeof event !== "object") return { type: "unknown" };
  const summary = { type: event.type };
  for (const key of ["willRetry", "reason", "attempt", "success", "finalError"]) {
    if (event[key] !== undefined) summary[key] = event[key];
  }
  if (event.message) summary.message = summarizeMessage(event.message);
  if (event.assistantMessageEvent) {
    summary.assistantMessageEvent = summarizeAssistantMessageEvent(
      event.assistantMessageEvent,
    );
  }
  if (Array.isArray(event.messages)) {
    summary.messages = event.messages.map(summarizeMessage);
  }
  if (Array.isArray(event.toolResults)) {
    summary.toolResultCount = event.toolResults.length;
  }
  return summary;
}

function summarizeModel(model) {
  if (!model || typeof model !== "object") return null;
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
    return { text: data.text ?? "" };
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
    if (typeof object.error === "string") {
      summary.error = redactDynamicPaths(object.error);
    }
    const data = summarizeResponseData(object.command, object.data, aliases);
    if (data !== undefined) summary.data = data;
    return summary;
  }
  if (object?.type === "extension_ui_request") {
    return {
      kind: "extension_ui_request",
      id: aliases.extensionRequests.alias(object.id),
      method: object.method,
    };
  }
  if (object?.type === "extension_ui_cancel") {
    return {
      kind: "extension_ui_cancel",
      id: aliases.extensionRequests.alias(object.id),
    };
  }
  if (typeof object?.type === "string") {
    return { kind: "event", event: summarizeEvent(object) };
  }
  return { kind: "unknown-output" };
}

function hasMatchingExtensionEvidence(path, runIdentity) {
  if (!path || !runIdentity) return undefined;
  try {
    const evidence = JSON.parse(readFileSync(path, "utf8"));
    return (
      evidence?.runIdentity === runIdentity &&
      evidence?.shutdown?.observed === true &&
      evidence.shutdown.reason === "quit"
    );
  } catch {
    return false;
  }
}

class RpcWorker {
  constructor({
    name,
    cliEntry,
    args,
    cwd,
    env,
    aliases,
    extensionEvidencePath,
    extensionRunIdentity,
  }) {
    this.name = name;
    this.cliEntry = cliEntry;
    this.args = args;
    this.cwd = cwd;
    this.env = env;
    this.aliases = aliases;
    this.extensionEvidencePath = extensionEvidencePath;
    this.extensionRunIdentity = extensionRunIdentity;
    this.records = [];
    this.waiters = new Set();
    this.stderr = "";
    this.stdoutBuffer = "";
    this.closed = false;
    this.fatalError = undefined;
    this.closePromise = new Promise((resolveClose, rejectClose) => {
      this.closeResolve = resolveClose;
      this.closeReject = rejectClose;
    });
  }

  record(value, raw) {
    const record = { sequence: this.records.length + 1, ...value };
    if (raw !== undefined) {
      Object.defineProperty(record, "raw", { value: raw, enumerable: false });
    }
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
      // Preserve the original failure.
    }
  }

  parseStdoutChunk(chunk) {
    this.stdoutBuffer += chunk.toString("utf8");
    while (true) {
      const newlineIndex = this.stdoutBuffer.indexOf("\n");
      if (newlineIndex < 0) break;
      let line = this.stdoutBuffer.slice(0, newlineIndex);
      this.stdoutBuffer = this.stdoutBuffer.slice(newlineIndex + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (line.length === 0) continue;
      let object;
      try {
        object = JSON.parse(line);
      } catch (error) {
        this.fail(
          new Error(
            `${this.name} emitted invalid JSONL record of length ${line.length}: ${error.message}`,
          ),
        );
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
      this.stderr = (this.stderr + chunk.toString("utf8")).slice(-64 * 1024);
    });
    this.child.on("error", (error) => this.fail(error));
    this.child.on("exit", (code, signal) => {
      this.record({
        kind: "process",
        event: "exit",
        code,
        signal: signal ?? null,
        extensionShutdownRunIdentityMatched: hasMatchingExtensionEvidence(
          this.extensionEvidencePath,
          this.extensionRunIdentity,
        ),
      });
      if (this.waiters.size > 0) {
        const stderrLines = this.stderr
          .split(/\r?\n/)
          .filter(Boolean)
          .slice(-10)
          .map(redactDynamicPaths);
        const stderrSummary =
          stderrLines.length > 0 ? ` stderr=${JSON.stringify(stderrLines)}` : "";
        this.fail(
          new Error(
            `${this.name} exited before ${this.waiters.size} awaited protocol record(s): ` +
              `code=${code}, signal=${signal ?? "null"}.${stderrSummary}`,
          ),
        );
      }
    });
    this.child.on("close", (code, signal) => {
      if (this.stdoutBuffer.length > 0) {
        this.fail(
          new Error(
            `${this.name} closed with a non-LF-terminated stdout fragment of length ${this.stdoutBuffer.length}.`,
          ),
        );
        return;
      }
      this.closed = true;
      activeWorkers.delete(this);
      this.record({
        kind: "process",
        event: "close",
        code,
        signal: signal ?? null,
        extensionShutdownRunIdentityMatched: hasMatchingExtensionEvidence(
          this.extensionEvidencePath,
          this.extensionRunIdentity,
        ),
      });
      this.closeResolve?.({ code, signal: signal ?? null });
    });

    await new Promise((resolveStart, rejectStart) => {
      const timer = setTimeout(
        () => rejectStart(new Error(`${this.name} did not spawn.`)),
        RPC_WORKER_COMMAND_TIMEOUT_MS,
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

  waitFor(predicate, label, timeoutMs = RPC_WORKER_COMMAND_TIMEOUT_MS) {
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
      (record) =>
        record.sequence > afterSequence &&
        record.kind === "event" &&
        record.event?.type === type,
      `event ${type} after ${afterSequence}`,
    );
  }

  send(command) {
    requireValue(this.child?.stdin?.writable, `${this.name} stdin is not writable.`);
    this.record({
      kind: "client",
      action: "send",
      id: command.id ?? null,
      command: command.type,
    });
    this.child.stdin.write(`${JSON.stringify(command)}\n`, "utf8");
  }

  sendRaw(line, label) {
    requireValue(this.child?.stdin?.writable, `${this.name} stdin is not writable.`);
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
    requireValue(sent === true, `${this.name} failed to send ${signal}.`);
  }

  async waitClosed(timeoutMs = RPC_WORKER_PROCESS_TIMEOUT_MS) {
    let timer;
    try {
      return await Promise.race([
        this.closePromise,
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(new Error(`${this.name} did not close.`)),
            timeoutMs,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  snapshot() {
    const transcript = this.records.map(({ raw: _raw, ...record }) => record);
    const processBoundaries = transcript.filter(
      (record) => record.kind === "process" && ["exit", "close"].includes(record.event),
    );
    return {
      alias: this.name,
      transcript,
      processBoundaries,
      exitBeforeClose:
        processBoundaries.findIndex((record) => record.event === "exit") >= 0 &&
        processBoundaries.findIndex((record) => record.event === "close") >
          processBoundaries.findIndex((record) => record.event === "exit"),
      stderr: {
        present: this.stderr.length > 0,
        length: this.stderr.length,
        sha256: sha256(this.stderr),
        lines: this.stderr
          .split(/\r?\n/)
          .filter(Boolean)
          .slice(0, 20)
          .map(redactDynamicPaths),
      },
    };
  }
}

function responseRecord(worker, id, command) {
  return worker.records.find(
    (record) =>
      record.kind === "response" &&
      record.id === (id ?? null) &&
      (command === undefined || record.command === command),
  );
}

function responseSequence(worker, id, command) {
  return responseRecord(worker, id, command)?.sequence;
}

function eventRecords(worker, type, predicate = () => true) {
  return worker.records.filter(
    (record) =>
      record.kind === "event" &&
      record.event?.type === type &&
      predicate(record.event),
  );
}

function eventSequence(worker, type, predicate = () => true) {
  return eventRecords(worker, type, predicate)[0]?.sequence;
}

function outputCount(worker, predicate) {
  return worker.records.filter(predicate).length;
}

function strictlyIncreasing(values) {
  return values.every(
    (value, index) =>
      Number.isInteger(value) && (index === 0 || value > values[index - 1]),
  );
}

function promptOrdering(worker, promptId, stateDuringId) {
  const assistantUpdateSequences = eventRecords(worker, "message_update").map(
    (record) => record.sequence,
  );
  const ordering = {
    promptResponseSequence: responseSequence(worker, promptId, "prompt"),
    agentStartSequence: eventSequence(worker, "agent_start"),
    turnStartSequence: eventSequence(worker, "turn_start"),
    userMessageStartSequence: eventSequence(
      worker,
      "message_start",
      (event) => event.message?.role === "user",
    ),
    userMessageEndSequence: eventSequence(
      worker,
      "message_end",
      (event) => event.message?.role === "user",
    ),
    assistantMessageStartSequence: eventSequence(
      worker,
      "message_start",
      (event) => event.message?.role === "assistant",
    ),
    firstAssistantUpdateSequence: assistantUpdateSequences[0],
    lastAssistantUpdateSequence: assistantUpdateSequences.at(-1),
    assistantMessageEndSequence: eventSequence(
      worker,
      "message_end",
      (event) => event.message?.role === "assistant",
    ),
    turnEndSequence: eventSequence(worker, "turn_end"),
    agentEndSequence: eventSequence(worker, "agent_end"),
    agentSettledSequence: eventSequence(worker, "agent_settled"),
    stateDuringResponseSequence: responseSequence(worker, stateDuringId, "get_state"),
  };
  ordering.promptResponsePrecedesAgentStart =
    ordering.promptResponseSequence < ordering.agentStartSequence;
  ordering.publicLifecycleStrictlyOrdered = strictlyIncreasing([
    ordering.promptResponseSequence,
    ordering.agentStartSequence,
    ordering.turnStartSequence,
    ordering.userMessageStartSequence,
    ordering.userMessageEndSequence,
    ordering.assistantMessageStartSequence,
    ordering.firstAssistantUpdateSequence,
    ordering.assistantMessageEndSequence,
    ordering.turnEndSequence,
    ordering.agentEndSequence,
    ordering.agentSettledSequence,
  ]);
  ordering.stateDuringAfterAcceptanceBeforeSettled =
    ordering.stateDuringResponseSequence > ordering.promptResponseSequence &&
    ordering.stateDuringResponseSequence < ordering.agentSettledSequence;
  return ordering;
}

async function readExtensionLog(path, aliases, runIdentity) {
  const text = await readFile(path, "utf8");
  const records = text
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  requireValue(records.length > 0, "RPC Worker Extension log is empty.");
  requireValue(
    records.every((record) => record.runIdentity === runIdentity),
    "RPC Worker Extension log mixed run identities.",
  );
  return records.map((record, index) => ({
    sequence: index + 1,
    caseName: record.caseName,
    type: record.type,
    reason: record.reason,
    previousSessionFile: aliases.sessionFiles.alias(record.previousSessionFile),
    targetSessionFile: aliases.sessionFiles.alias(record.targetSessionFile),
    message: record.message,
    messageRoles: record.messageRoles,
    willRetry: record.willRetry,
  }));
}

async function readExtensionEvidence(path, runIdentity) {
  const evidence = JSON.parse(await readFile(path, "utf8"));
  requireValue(
    evidence?.runIdentity === runIdentity,
    "RPC Worker Extension evidence run identity drifted.",
  );
  const { runIdentity: observedRunIdentity, ...withoutRunIdentity } = evidence;
  return {
    ...withoutRunIdentity,
    runIdentityMatched: observedRunIdentity === runIdentity,
  };
}

async function persistRpcResult(result) {
  result.contractFingerprint = sha256(stableResult(result));
  await mkdir(dirname(rpcOutputPath), { recursive: true });
  await writeFile(rpcOutputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
}

async function resolveInstalledCli() {
  const packageRoot = join(
    rpcInstallDir,
    "node_modules",
    "@earendil-works",
    "pi-coding-agent",
  );
  const manifest = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8"));
  requireValue(
    manifest.name === PI_PACKAGE_NAME && manifest.version === PI_PACKAGE_VERSION,
    `Unexpected Pi package: ${manifest.name}@${manifest.version}.`,
  );
  const target = typeof manifest.bin === "string" ? manifest.bin : manifest.bin?.pi;
  requireValue(typeof target === "string" && target.length > 0, "Pi package bin is missing.");
  return {
    name: manifest.name,
    version: manifest.version,
    cliEntry: resolve(packageRoot, target),
  };
}

async function writeSettings(targetAgentDir) {
  await Promise.all([
    mkdir(targetAgentDir, { recursive: true }),
    mkdir(join(targetAgentDir, "home"), { recursive: true }),
  ]);
  await writeFile(
    join(targetAgentDir, "settings.json"),
    `${JSON.stringify({ retry: { enabled: false } }, null, 2)}\n`,
    "utf8",
  );
}

async function createWorker({
  name,
  cliEntry,
  cwd,
  workerAgentDir,
  aliases,
  sessionDir,
  sessionFile,
  noSession = false,
  extensionCase,
  extensionLogPath,
  extensionEvidencePath,
  extensionRunIdentity,
  provider,
  noExtensions = false,
}) {
  const args = [
    "--mode",
    "rpc",
    "--no-tools",
    "--no-extensions",
    "--no-skills",
    "--no-prompt-templates",
    "--no-themes",
    "--no-context-files",
    "--offline",
    "--approve",
    "--thinking",
    "off",
  ];
  if (sessionDir) args.push("--session-dir", sessionDir);
  if (sessionFile) args.push("--session", sessionFile);
  if (noSession) args.push("--no-session");
  if (!noExtensions && extensionCase) args.push("--extension", thisFile);
  if (provider) args.push("--provider", provider, "--model", RPC_WORKER_MODEL_ID);

  const worker = new RpcWorker({
    name,
    cliEntry,
    args,
    cwd,
    aliases,
    extensionEvidencePath,
    extensionRunIdentity,
    env: cleanChildEnvironment({
      HOME: join(workerAgentDir, "home"),
      PI_CODING_AGENT_DIR: workerAgentDir,
      PI_INSTALL_DIR: rpcInstallDir,
      AI_AGENT: "zhiwei-rpc-worker-lifecycle-probe",
      ...(extensionCase
        ? {
            ZHIWEI_RPC_WORKER_EXTENSION_CASE: extensionCase,
            ZHIWEI_RPC_WORKER_EXTENSION_LOG: extensionLogPath,
            ZHIWEI_RPC_WORKER_EXTENSION_EVIDENCE: extensionEvidencePath,
            ZHIWEI_RPC_WORKER_EXTENSION_RUN_IDENTITY: extensionRunIdentity,
          }
        : {}),
    }),
  });
  await worker.start();
  return worker;
}

function assertShutdownEvidence(worker, expectedCode) {
  const snapshot = worker.snapshot();
  requireValue(snapshot.exitBeforeClose === true, `${worker.name} exit/close ordering drifted.`);
  requireValue(
    JSON.stringify(
      snapshot.processBoundaries.map((boundary) => ({
        event: boundary.event,
        code: boundary.code,
        signal: boundary.signal,
      })),
    ) ===
      JSON.stringify([
        { event: "exit", code: expectedCode, signal: null },
        { event: "close", code: expectedCode, signal: null },
      ]),
    `${worker.name} process boundaries drifted.`,
  );
  if (worker.extensionEvidencePath) {
    requireValue(
      snapshot.processBoundaries.every(
        (boundary) => boundary.extensionShutdownRunIdentityMatched === true,
      ),
      `${worker.name} Extension shutdown evidence was not durable at exit/close.`,
    );
  }
}

async function runNormalPromptAndRestart(cliEntry, aliases) {
  rpcStage = "normal-restart:configure";
  const caseRoot = join(rpcWorkspaceDir, "normal-restart");
  const caseAgentDir = join(rpcAgentDir, "normal-restart");
  const sessionDir = join(caseAgentDir, "sessions");
  const workerOneLog = join(caseRoot, "worker-1-extension.jsonl");
  const workerOneEvidence = join(caseRoot, "worker-1-extension-evidence.json");
  const workerTwoLog = join(caseRoot, "worker-2-extension.jsonl");
  const workerTwoEvidence = join(caseRoot, "worker-2-extension-evidence.json");
  const workerOneRunIdentity = randomBytes(32).toString("hex");
  const workerTwoRunIdentity = randomBytes(32).toString("hex");
  rpcRunIdentities.add(workerOneRunIdentity);
  rpcRunIdentities.add(workerTwoRunIdentity);
  await Promise.all([
    mkdir(caseRoot, { recursive: true }),
    mkdir(sessionDir, { recursive: true }),
    writeSettings(caseAgentDir),
    rm(workerOneLog, { force: true }),
    rm(workerOneEvidence, { force: true }),
    rm(workerTwoLog, { force: true }),
    rm(workerTwoEvidence, { force: true }),
  ]);

  rpcStage = "normal-restart:worker-1";
  const workerOne = await createWorker({
    name: "rpc-worker-1",
    cliEntry,
    cwd: caseRoot,
    workerAgentDir: caseAgentDir,
    aliases,
    sessionDir,
    extensionCase: "normal-worker-1",
    extensionLogPath: workerOneLog,
    extensionEvidencePath: workerOneEvidence,
    extensionRunIdentity: workerOneRunIdentity,
    provider: RPC_WORKER_PROVIDER_ID,
  });

  workerOne.sendRaw("{", "invalid-json");
  const parseResponse = await workerOne.waitForResponse(null, "parse");

  const unicodeUnknownLine =
    '{"id":"normal-unicode-unknown","type":"unknown_with_unicode_note","note":"alpha\\u2028beta\\u2029gamma"}'
      .replace("\\u2028", "\u2028")
      .replace("\\u2029", "\u2029");
  workerOne.sendRaw(unicodeUnknownLine, "unicode-separators-inside-json-string");
  const unknownResponse = await workerOne.waitForResponse(
    "normal-unicode-unknown",
    "unknown",
  );

  workerOne.send({ id: "normal-state-before", type: "get_state" });
  const stateBefore = await workerOne.waitForResponse(
    "normal-state-before",
    "get_state",
  );
  workerOne.send({ id: "normal-messages-before", type: "get_messages" });
  const messagesBefore = await workerOne.waitForResponse(
    "normal-messages-before",
    "get_messages",
  );

  const promptStartSequence = workerOne.records.length;
  workerOne.send({
    id: "normal-prompt-1",
    type: "prompt",
    message: RPC_WORKER_NORMAL_PROMPTS.initial,
  });
  const promptResponse = await workerOne.waitForResponse("normal-prompt-1", "prompt");
  workerOne.send({ id: "normal-state-during", type: "get_state" });
  const stateDuring = await workerOne.waitForResponse(
    "normal-state-during",
    "get_state",
  );
  await workerOne.waitForEvent("agent_settled", promptStartSequence);

  workerOne.send({ id: "normal-state-after", type: "get_state" });
  const stateAfter = await workerOne.waitForResponse("normal-state-after", "get_state");
  workerOne.send({ id: "normal-messages-after", type: "get_messages" });
  const messagesAfter = await workerOne.waitForResponse(
    "normal-messages-after",
    "get_messages",
  );
  workerOne.send({ id: "normal-last-after", type: "get_last_assistant_text" });
  const lastAfter = await workerOne.waitForResponse(
    "normal-last-after",
    "get_last_assistant_text",
  );

  const rawSessionFile = stateAfter.raw?.data?.sessionFile;
  requireValue(
    typeof rawSessionFile === "string" && rawSessionFile.length > 0,
    "Normal RPC Worker did not persist a Session file.",
  );
  aliases.sessionFiles.alias(rawSessionFile);

  workerOne.endInput();
  const closeOne = await workerOne.waitClosed();
  const workerOneExtensionEvents = await readExtensionLog(
    workerOneLog,
    aliases,
    workerOneRunIdentity,
  );
  const workerOneExtensionEvidence = await readExtensionEvidence(
    workerOneEvidence,
    workerOneRunIdentity,
  );

  const normalOrdering = promptOrdering(
    workerOne,
    "normal-prompt-1",
    "normal-state-during",
  );
  requireValue(parseResponse.success === false, "Malformed JSON parse response must fail.");
  requireValue(unknownResponse.success === false, "Unknown command response must fail.");
  requireValue(
    outputCount(
      workerOne,
      (record) =>
        record.kind === "response" && record.id === null && record.command === "parse",
    ) === 1,
    "Malformed JSON must produce exactly one parse response.",
  );
  requireValue(
    outputCount(
      workerOne,
      (record) =>
        record.kind === "response" && record.id === "normal-unicode-unknown",
    ) === 1,
    "Unknown Unicode command must produce exactly one correlated response.",
  );
  requireValue(stateBefore.success === true, "State after protocol errors failed.");
  requireValue(
    messagesBefore.data?.messages?.length === 0,
    "Normal RPC Worker messages before Prompt must be empty.",
  );
  requireValue(promptResponse.success === true, "Normal Prompt was not accepted.");
  requireValue(
    stateDuring.data?.isStreaming === true && stateDuring.data?.messageCount === 1,
    "State immediately after Prompt acceptance must observe streaming with one User Message.",
  );
  requireValue(
    normalOrdering.promptResponsePrecedesAgentStart === true &&
      normalOrdering.publicLifecycleStrictlyOrdered === true &&
      normalOrdering.stateDuringAfterAcceptanceBeforeSettled === true,
    "Normal Prompt acceptance/Event/State ordering drifted.",
  );
  requireValue(
    stateAfter.data?.isStreaming === false &&
      stateAfter.data?.messageCount === 2 &&
      stateAfter.data?.pendingMessageCount === 0,
    "Normal final State must be idle with two Messages.",
  );
  requireValue(
    JSON.stringify(messagesAfter.data?.messages?.map((message) => message.role)) ===
      JSON.stringify(["user", "assistant"]),
    "Normal final Message roles drifted.",
  );
  requireValue(
    lastAfter.data?.text === RPC_WORKER_NORMAL_RESPONSES.initial,
    "Normal final Assistant text drifted.",
  );
  requireValue(closeOne.code === 0 && closeOne.signal === null, "EOF exit drifted.");
  requireValue(workerOne.stderr.length === 0, "Normal RPC Worker wrote stderr.");
  requireValue(
    workerOneExtensionEvents.some(
      (event) => event.type === "session_shutdown" && event.reason === "quit",
    ),
    "Normal RPC Worker Extension did not observe quit shutdown.",
  );
  requireValue(
    workerOneExtensionEvidence?.runIdentityMatched === true &&
      workerOneExtensionEvidence?.provider?.callCount === 1 &&
      workerOneExtensionEvidence?.provider?.pendingResponses === 0,
    "Normal RPC Worker Extension evidence drifted.",
  );
  assertShutdownEvidence(workerOne, 0);

  rpcStage = "normal-restart:worker-2";
  const workerTwo = await createWorker({
    name: "rpc-worker-2",
    cliEntry,
    cwd: caseRoot,
    workerAgentDir: caseAgentDir,
    aliases,
    sessionFile: rawSessionFile,
    extensionCase: "normal-worker-2",
    extensionLogPath: workerTwoLog,
    extensionEvidencePath: workerTwoEvidence,
    extensionRunIdentity: workerTwoRunIdentity,
    provider: RPC_WORKER_PROVIDER_ID,
  });

  workerTwo.send({ id: "restart-state-before", type: "get_state" });
  const restartStateBefore = await workerTwo.waitForResponse(
    "restart-state-before",
    "get_state",
  );
  workerTwo.send({ id: "restart-messages-before", type: "get_messages" });
  const restartMessagesBefore = await workerTwo.waitForResponse(
    "restart-messages-before",
    "get_messages",
  );

  const restartPromptStart = workerTwo.records.length;
  workerTwo.send({
    id: "restart-prompt-2",
    type: "prompt",
    message: RPC_WORKER_NORMAL_PROMPTS.resumed,
  });
  const restartPromptResponse = await workerTwo.waitForResponse(
    "restart-prompt-2",
    "prompt",
  );
  workerTwo.send({ id: "restart-state-during", type: "get_state" });
  const restartStateDuring = await workerTwo.waitForResponse(
    "restart-state-during",
    "get_state",
  );
  await workerTwo.waitForEvent("agent_settled", restartPromptStart);

  workerTwo.send({ id: "restart-state-after", type: "get_state" });
  const restartStateAfter = await workerTwo.waitForResponse(
    "restart-state-after",
    "get_state",
  );
  workerTwo.send({ id: "restart-messages-after", type: "get_messages" });
  const restartMessagesAfter = await workerTwo.waitForResponse(
    "restart-messages-after",
    "get_messages",
  );
  workerTwo.send({ id: "restart-last-after", type: "get_last_assistant_text" });
  const restartLastAfter = await workerTwo.waitForResponse(
    "restart-last-after",
    "get_last_assistant_text",
  );

  workerTwo.signal("SIGTERM");
  const closeTwo = await workerTwo.waitClosed();
  const workerTwoExtensionEvents = await readExtensionLog(
    workerTwoLog,
    aliases,
    workerTwoRunIdentity,
  );
  const workerTwoExtensionEvidence = await readExtensionEvidence(
    workerTwoEvidence,
    workerTwoRunIdentity,
  );
  const restartOrdering = promptOrdering(
    workerTwo,
    "restart-prompt-2",
    "restart-state-during",
  );

  requireValue(
    restartMessagesBefore.data?.messages?.map((message) => message.role).join(",") ===
      "user,assistant",
    "Restart RPC Worker did not restore the first Prompt Messages.",
  );
  requireValue(restartPromptResponse.success === true, "Restart Prompt was not accepted.");
  requireValue(
    restartStateDuring.data?.isStreaming === true &&
      restartStateDuring.data?.messageCount === 3,
    "Restart State immediately after Prompt acceptance drifted.",
  );
  requireValue(
    restartOrdering.promptResponsePrecedesAgentStart === true &&
      restartOrdering.publicLifecycleStrictlyOrdered === true &&
      restartOrdering.stateDuringAfterAcceptanceBeforeSettled === true,
    "Restart Prompt acceptance/Event/State ordering drifted.",
  );
  requireValue(
    restartMessagesAfter.data?.messages?.map((message) => message.role).join(",") ===
      "user,assistant,user,assistant",
    "Restart final Message roles drifted.",
  );
  requireValue(
    restartLastAfter.data?.text === RPC_WORKER_NORMAL_RESPONSES.resumed,
    "Restart final Assistant text drifted.",
  );
  requireValue(
    stateAfter.data?.sessionFile === restartStateBefore.data?.sessionFile &&
      stateAfter.data?.sessionId === restartStateBefore.data?.sessionId &&
      restartStateAfter.data?.sessionFile === stateAfter.data?.sessionFile &&
      restartStateAfter.data?.sessionId === stateAfter.data?.sessionId,
    "Restart RPC Worker did not preserve Session identity aliases.",
  );
  requireValue(
    restartStateAfter.data?.isStreaming === false &&
      restartStateAfter.data?.messageCount === 4,
    "Restart final State drifted.",
  );
  requireValue(
    closeTwo.code === 143 && closeTwo.signal === null,
    "Idle SIGTERM exit boundary drifted.",
  );
  requireValue(workerTwo.stderr.length === 0, "Restart RPC Worker wrote stderr.");
  requireValue(
    workerTwoExtensionEvents.some(
      (event) => event.type === "session_shutdown" && event.reason === "quit",
    ),
    "Restart RPC Worker Extension did not observe quit shutdown.",
  );
  requireValue(
    workerTwoExtensionEvidence?.runIdentityMatched === true &&
      workerTwoExtensionEvidence?.provider?.callCount === 1 &&
      workerTwoExtensionEvidence?.provider?.pendingResponses === 0,
    "Restart RPC Worker Extension evidence drifted.",
  );
  assertShutdownEvidence(workerTwo, 143);

  return {
    protocolErrors: {
      workerAlias: workerOne.name,
      malformedJson: {
        responseSequence: parseResponse.sequence,
        command: parseResponse.command,
        success: parseResponse.success,
        error: parseResponse.error,
        responseCount: 1,
      },
      unknownCommand: {
        responseSequence: unknownResponse.sequence,
        id: unknownResponse.id,
        command: unknownResponse.command,
        success: unknownResponse.success,
        error: unknownResponse.error,
        responseCount: 1,
        unicodeSeparatorsInsideJsonString: ["U+2028", "U+2029"],
      },
      validStateAfterErrors: stateBefore.data,
      workerRemainedUsable: stateBefore.success === true,
    },
    normalPromptEof: {
      worker: workerOne.snapshot(),
      extensionEvents: workerOneExtensionEvents,
      extensionEvidence: workerOneExtensionEvidence,
      prompt: RPC_WORKER_NORMAL_PROMPTS.initial,
      responseText: RPC_WORKER_NORMAL_RESPONSES.initial,
      stateBefore: stateBefore.data,
      messagesBefore: messagesBefore.data?.messages ?? [],
      stateDuring: stateDuring.data,
      ordering: normalOrdering,
      finalState: stateAfter.data,
      finalMessages: messagesAfter.data?.messages ?? [],
      lastAssistantText: lastAfter.data?.text ?? "",
      shutdown: {
        mechanism: "stdin-eof",
        close: closeOne,
      },
    },
    restartResumeSigterm: {
      worker: workerTwo.snapshot(),
      extensionEvents: workerTwoExtensionEvents,
      extensionEvidence: workerTwoExtensionEvidence,
      restoredState: restartStateBefore.data,
      restoredMessages: restartMessagesBefore.data?.messages ?? [],
      prompt: RPC_WORKER_NORMAL_PROMPTS.resumed,
      responseText: RPC_WORKER_NORMAL_RESPONSES.resumed,
      stateDuring: restartStateDuring.data,
      ordering: restartOrdering,
      finalState: restartStateAfter.data,
      finalMessages: restartMessagesAfter.data?.messages ?? [],
      lastAssistantText: restartLastAfter.data?.text ?? "",
      shutdown: {
        mechanism: "idle-sigterm",
        requestedSignal: "SIGTERM",
        close: closeTwo,
      },
      identity: {
        workerChanged: workerOne.name !== workerTwo.name,
        sessionIdPreserved:
          restartStateBefore.data?.sessionId === stateAfter.data?.sessionId,
        sessionFilePreserved:
          restartStateBefore.data?.sessionFile === stateAfter.data?.sessionFile,
      },
    },
  };
}

async function runPreflightRejection(cliEntry, aliases) {
  rpcStage = "preflight-rejection:configure";
  const caseRoot = join(rpcWorkspaceDir, "preflight-rejection");
  const caseAgentDir = join(rpcAgentDir, "preflight-rejection");
  await Promise.all([mkdir(caseRoot, { recursive: true }), writeSettings(caseAgentDir)]);

  rpcStage = "preflight-rejection:run";
  const worker = await createWorker({
    name: "rpc-worker-preflight",
    cliEntry,
    cwd: caseRoot,
    workerAgentDir: caseAgentDir,
    aliases,
    noSession: true,
    noExtensions: true,
  });
  worker.send({ id: "preflight-state-before", type: "get_state" });
  const stateBefore = await worker.waitForResponse(
    "preflight-state-before",
    "get_state",
  );
  worker.send({
    id: "preflight-prompt",
    type: "prompt",
    message: "This Prompt must fail preflight.",
  });
  const promptResponse = await worker.waitForResponse("preflight-prompt", "prompt");
  worker.send({ id: "preflight-state-after", type: "get_state" });
  const stateAfter = await worker.waitForResponse(
    "preflight-state-after",
    "get_state",
  );
  worker.send({ id: "preflight-messages-after", type: "get_messages" });
  const messagesAfter = await worker.waitForResponse(
    "preflight-messages-after",
    "get_messages",
  );
  worker.endInput();
  const close = await worker.waitClosed();

  const promptResponseCount = outputCount(
    worker,
    (record) => record.kind === "response" && record.id === "preflight-prompt",
  );
  const agentStartCount = eventRecords(worker, "agent_start").length;
  requireValue(promptResponse.success === false, "Preflight Prompt was unexpectedly accepted.");
  requireValue(promptResponseCount === 1, "Preflight must return exactly one Prompt response.");
  requireValue(agentStartCount === 0, "Preflight rejection unexpectedly started an Agent Run.");
  requireValue(
    stateAfter.success === true && stateAfter.data?.isStreaming === false,
    "Preflight RPC Worker was not usable after rejection.",
  );
  requireValue(
    messagesAfter.data?.messages?.length === 0,
    "Preflight rejection must not persist Messages.",
  );
  requireValue(close.code === 0 && close.signal === null, "Preflight EOF exit drifted.");
  requireValue(worker.stderr.length === 0, "Preflight RPC Worker wrote stderr.");
  assertShutdownEvidence(worker, 0);

  return {
    worker: worker.snapshot(),
    response: {
      sequence: promptResponse.sequence,
      success: promptResponse.success,
      error: promptResponse.error,
      responseCount: promptResponseCount,
    },
    stateBefore: stateBefore.data,
    stateAfter: stateAfter.data,
    messagesAfter: messagesAfter.data?.messages ?? [],
    agentStartCount,
    workerRemainedUsable: stateAfter.success === true,
    shutdown: {
      mechanism: "stdin-eof",
      close,
    },
  };
}

async function runAcceptedProviderError(cliEntry, aliases) {
  rpcStage = "accepted-provider-error:configure";
  const caseRoot = join(rpcWorkspaceDir, "accepted-provider-error");
  const caseAgentDir = join(rpcAgentDir, "accepted-provider-error");
  const extensionLogPath = join(caseRoot, "extension.jsonl");
  const extensionEvidencePath = join(caseRoot, "extension-evidence.json");
  const extensionRunIdentity = randomBytes(32).toString("hex");
  rpcRunIdentities.add(extensionRunIdentity);
  await Promise.all([
    mkdir(caseRoot, { recursive: true }),
    writeSettings(caseAgentDir),
    rm(extensionLogPath, { force: true }),
    rm(extensionEvidencePath, { force: true }),
  ]);

  rpcStage = "accepted-provider-error:run";
  const worker = await createWorker({
    name: "rpc-worker-provider-error",
    cliEntry,
    cwd: caseRoot,
    workerAgentDir: caseAgentDir,
    aliases,
    noSession: true,
    extensionCase: "accepted-provider-error",
    extensionLogPath,
    extensionEvidencePath,
    extensionRunIdentity,
    provider: RPC_WORKER_ERROR_PROVIDER_ID,
  });

  const promptStart = worker.records.length;
  worker.send({
    id: "provider-error-prompt",
    type: "prompt",
    message: RPC_WORKER_PROVIDER_ERROR_PROMPT,
  });
  const promptResponse = await worker.waitForResponse(
    "provider-error-prompt",
    "prompt",
  );
  worker.send({ id: "provider-error-state-during", type: "get_state" });
  const stateDuring = await worker.waitForResponse(
    "provider-error-state-during",
    "get_state",
  );
  await worker.waitForEvent("agent_settled", promptStart);
  worker.send({ id: "provider-error-state", type: "get_state" });
  const state = await worker.waitForResponse("provider-error-state", "get_state");
  worker.send({ id: "provider-error-messages", type: "get_messages" });
  const messages = await worker.waitForResponse(
    "provider-error-messages",
    "get_messages",
  );
  worker.send({ id: "provider-error-last", type: "get_last_assistant_text" });
  const last = await worker.waitForResponse(
    "provider-error-last",
    "get_last_assistant_text",
  );
  worker.endInput();
  const close = await worker.waitClosed();
  const extensionEvents = await readExtensionLog(
    extensionLogPath,
    aliases,
    extensionRunIdentity,
  );
  const extensionEvidence = await readExtensionEvidence(
    extensionEvidencePath,
    extensionRunIdentity,
  );

  const promptResponseCount = outputCount(
    worker,
    (record) => record.kind === "response" && record.id === "provider-error-prompt",
  );
  const assistantMessages = messages.data?.messages?.filter(
    (message) => message.role === "assistant",
  );
  const ordering = {
    promptResponseSequence: responseSequence(worker, "provider-error-prompt", "prompt"),
    agentStartSequence: eventSequence(worker, "agent_start"),
    assistantErrorMessageEndSequence: eventSequence(
      worker,
      "message_end",
      (event) =>
        event.message?.role === "assistant" && event.message?.stopReason === "error",
    ),
    agentEndSequence: eventSequence(worker, "agent_end"),
    agentSettledSequence: eventSequence(worker, "agent_settled"),
    stateDuringResponseSequence: responseSequence(
      worker,
      "provider-error-state-during",
      "get_state",
    ),
  };
  ordering.promptResponsePrecedesAgentStart =
    ordering.promptResponseSequence < ordering.agentStartSequence;
  ordering.failureExpressedAfterAcceptance = strictlyIncreasing([
    ordering.promptResponseSequence,
    ordering.agentStartSequence,
    ordering.assistantErrorMessageEndSequence,
    ordering.agentEndSequence,
    ordering.agentSettledSequence,
  ]);
  ordering.stateDuringAfterAcceptanceBeforeSettled =
    ordering.stateDuringResponseSequence > ordering.promptResponseSequence &&
    ordering.stateDuringResponseSequence < ordering.agentSettledSequence;

  requireValue(promptResponse.success === true, "Provider-error Prompt was not accepted.");
  requireValue(
    promptResponseCount === 1,
    "Accepted Provider error produced more than one Prompt response.",
  );
  requireValue(
    stateDuring.data?.isStreaming === true && stateDuring.data?.messageCount === 1,
    "Provider-error State after acceptance drifted.",
  );
  requireValue(
    ordering.promptResponsePrecedesAgentStart === true &&
      ordering.failureExpressedAfterAcceptance === true &&
      ordering.stateDuringAfterAcceptanceBeforeSettled === true,
    "Provider-error acceptance/failure ordering drifted.",
  );
  requireValue(
    assistantMessages?.some(
      (message) =>
        message.stopReason === "error" &&
        message.errorMessage === RPC_WORKER_PROVIDER_ERROR_MESSAGE,
    ),
    "Provider error was not persisted as an Assistant error Message.",
  );
  requireValue(
    eventRecords(
      worker,
      "agent_end",
      (event) => event.willRetry === false,
    ).length === 1,
    "Provider error must end with agent_end(willRetry=false).",
  );
  requireValue(
    state.success === true && state.data?.isStreaming === false,
    "Provider-error RPC Worker was not usable after settling.",
  );
  requireValue(last.data?.text === "", "Provider-error last Assistant text must be empty.");
  requireValue(close.code === 0 && close.signal === null, "Provider-error EOF exit drifted.");
  requireValue(worker.stderr.length === 0, "Provider-error RPC Worker wrote stderr.");
  requireValue(
    extensionEvents.some(
      (event) => event.type === "session_shutdown" && event.reason === "quit",
    ),
    "Provider-error Extension did not observe quit shutdown.",
  );
  requireValue(
    extensionEvidence?.runIdentityMatched === true &&
      extensionEvidence?.provider?.callCount === 1 &&
      extensionEvidence?.provider?.pendingResponses === 0,
    "Provider-error Extension evidence drifted.",
  );
  assertShutdownEvidence(worker, 0);

  return {
    worker: worker.snapshot(),
    extensionEvents,
    extensionEvidence,
    prompt: RPC_WORKER_PROVIDER_ERROR_PROMPT,
    errorMessage: RPC_WORKER_PROVIDER_ERROR_MESSAGE,
    promptResponse: {
      sequence: promptResponse.sequence,
      success: promptResponse.success,
      responseCount: promptResponseCount,
    },
    stateDuring: stateDuring.data,
    ordering,
    finalState: state.data,
    finalMessages: messages.data?.messages ?? [],
    lastAssistantText: last.data?.text ?? "",
    workerRemainedUsable: state.success === true && messages.success === true,
    shutdown: {
      mechanism: "stdin-eof",
      close,
    },
  };
}

async function stopActiveWorkers() {
  const workers = [...activeWorkers];
  for (const worker of workers) {
    try {
      worker.signal("SIGKILL");
    } catch {
      // Best-effort cleanup after a failed capture; SIGKILL is not a recorded case.
    }
  }
  await Promise.allSettled(workers.map((worker) => worker.waitClosed(5_000)));
}

async function runRpcWorkerLifecycleCapture() {
  const scenario = process.env.PI_LIFECYCLE_SCENARIO ?? RPC_WORKER_LIFECYCLE_SCENARIO;
  if (scenario !== RPC_WORKER_LIFECYCLE_SCENARIO) {
    throw new Error(`Unexpected lifecycle scenario: ${scenario}.`);
  }
  rpcInstallDir = resolveRequiredPath("PI_INSTALL_DIR");
  rpcOutputPath = resolve(
    process.env.PI_LIFECYCLE_OUTPUT ??
      join(process.cwd(), "pi-rpc-worker-lifecycle-result.json"),
  );
  rpcWorkspaceDir = resolve(
    process.env.PI_LIFECYCLE_WORKSPACE ?? join(dirname(rpcOutputPath), "workspace"),
  );
  rpcAgentDir = resolve(
    process.env.PI_LIFECYCLE_AGENT_DIR ?? join(dirname(rpcOutputPath), "agent"),
  );
  await Promise.all([
    mkdir(rpcWorkspaceDir, { recursive: true }),
    mkdir(rpcAgentDir, { recursive: true }),
  ]);

  rpcStage = "resolve-installed-cli";
  const installed = await resolveInstalledCli();
  const aliases = {
    sessionIds: createAliasMap("session-id"),
    sessionFiles: createAliasMap("session-file"),
    extensionRequests: createAliasMap("extension-request"),
  };

  const normalAndRestart = await runNormalPromptAndRestart(installed.cliEntry, aliases);
  rpcCompletedCases.protocolErrors = normalAndRestart.protocolErrors;
  rpcCompletedCases.normalPromptEof = normalAndRestart.normalPromptEof;
  rpcCompletedCases.restartResumeSigterm = normalAndRestart.restartResumeSigterm;
  rpcCompletedCases.preflightRejection = await runPreflightRejection(
    installed.cliEntry,
    aliases,
  );
  rpcCompletedCases.acceptedProviderError = await runAcceptedProviderError(
    installed.cliEntry,
    aliases,
  );

  const result = {
    schemaVersion: RPC_WORKER_LIFECYCLE_SCHEMA_VERSION,
    status: "passed",
    scenario: RPC_WORKER_LIFECYCLE_SCENARIO,
    contract: {
      package: {
        name: installed.name,
        version: installed.version,
        integrity: PI_PACKAGE_INTEGRITY,
        shasum: PI_PACKAGE_SHASUM,
        releaseTag: PI_RELEASE_TAG,
        releaseCommit: PI_RELEASE_COMMIT,
        executionMode: "node-cli-entry-real-subprocess",
      },
      protocol: {
        transport: "stdio-jsonl",
        framing: "lf-only",
        unicodeLineSeparatorsInsideJsonString: ["U+2028", "U+2029"],
        promptResponseMeaning: "preflight-acceptance-not-run-completion",
      },
      providers: {
        normal: {
          id: RPC_WORKER_PROVIDER_ID,
          api: RPC_WORKER_PROVIDER_API_ID,
          modelId: RPC_WORKER_MODEL_ID,
        },
        error: {
          id: RPC_WORKER_ERROR_PROVIDER_ID,
          api: RPC_WORKER_ERROR_PROVIDER_API_ID,
          modelId: RPC_WORKER_MODEL_ID,
        },
        promptsSentToExternalProvider: 0,
      },
    },
    cases: rpcCompletedCases,
    aliases: {
      sessionIds: aliases.sessionIds.values(),
      sessionFiles: aliases.sessionFiles.values(),
      extensionRequests: aliases.extensionRequests.values(),
    },
    security: {
      hostSecretsPassedToWorker: false,
      realProviderCredentialsUsed: false,
      promptsSentToExternalProvider: 0,
      businessFileWrites: false,
      networkCallsByWorkerProvider: false,
      rawEnvironmentDumpIncluded: false,
    },
    sanitization: {
      absolutePathsIncluded: false,
      rawSessionIdIncluded: false,
      rawSessionFileIncluded: false,
      rawResponseIdIncluded: false,
      processPidIncluded: false,
      extensionRunIdentityIncluded: false,
      credentialsIncluded: false,
      rawChainOfThoughtIncluded: false,
      stderrLimitedToSanitizedLines: true,
    },
  };

  const serialized = JSON.stringify(result);
  for (const rawValue of [
    rpcInstallDir,
    rpcWorkspaceDir,
    rpcAgentDir,
    dirname(rpcOutputPath),
    thisFile,
    ...aliases.sessionIds.rawValues(),
    ...aliases.sessionFiles.rawValues(),
    ...rpcRunIdentities,
  ]) {
    if (rawValue && serialized.includes(rawValue)) {
      throw new Error(`Sanitization leaked a dynamic value: ${redactDynamicPaths(rawValue)}`);
    }
  }
  await persistRpcResult(result);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (isDirectExecution) {
  try {
    await runRpcWorkerLifecycleCapture();
  } catch (error) {
    await stopActiveWorkers();
    if (!rpcOutputPath) {
      rpcOutputPath = resolve(
        process.env.PI_LIFECYCLE_OUTPUT ??
          join(process.cwd(), "pi-rpc-worker-lifecycle-result.json"),
      );
    }
    const failure = {
      schemaVersion: RPC_WORKER_LIFECYCLE_SCHEMA_VERSION,
      status: "failed",
      scenario: RPC_WORKER_LIFECYCLE_SCENARIO,
      error: normalizeRpcError(error),
      completedCases: rpcCompletedCases,
      sanitization: {
        absolutePathsIncluded: false,
        rawSessionIdIncluded: false,
        rawSessionFileIncluded: false,
        rawResponseIdIncluded: false,
        processPidIncluded: false,
        extensionRunIdentityIncluded: false,
        credentialsIncluded: false,
        rawChainOfThoughtIncluded: false,
      },
    };
    await persistRpcResult(failure);
    console.error(
      `Pi RPC Worker lifecycle capture failed at ${rpcStage}: ${failure.error.message}`,
    );
    process.exitCode = 1;
  }
}
