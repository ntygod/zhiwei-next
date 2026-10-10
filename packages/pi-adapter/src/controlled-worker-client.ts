import { spawn, type ChildProcess } from "node:child_process";
import { constants } from "node:fs";
import { access, lstat, mkdir, mkdtemp, open, readdir, realpath, rm, stat, writeFile } from "node:fs/promises";
import { isAbsolute, join, resolve, sep } from "node:path";
import { Duplex, Readable, Writable } from "node:stream";
import { fileURLToPath } from "node:url";
import { ids, type WorkspaceId } from "../../domain/src/index.ts";
import type {
  NormalizedRuntimeCorrelationV1, NormalizedRuntimeEventIdV1, NormalizedRuntimeEventV1,
  NormalizedRuntimeLinksV1, RuntimeToolProfileV1, RuntimeWorkerStateV1,
} from "../../protocol/src/index.ts";
import { normalizePiRuntimeEventV1, type PiRuntimeEventInputV1, type PiRuntimeMessageSnapshotInputV1 } from "./normalized-runtime-event-v1.ts";

// This transport is not an OS sandbox or package authenticator. The caller must
// supply a verified, isolated official installation. No SDK is loaded here.
const PACKAGE = "@earendil-works/pi-coding-agent";
const VERSION = "0.84.1";
const NODE = "22.23.1";
const PROFILE = "zhiwei-controlled-synthetic-v1";
const PROVIDER = "zhiwei-controlled";
const MODEL = "synthetic-v1";
const TOOLS = ["zhiwei_file_read", "zhiwei_memory_read", "zhiwei_draft_write"] as const;
const CAPABILITIES = ["model-broker-v1", "tool-broker-v1", "abort", "progress"] as const;
const EXTENSION = fileURLToPath(new URL("./controlled-broker-extension.ts", import.meta.url));
const MAX_RECORD = 262_144;
const QUEUE_BYTES = 1_048_576;
const QUEUE_COUNT = 256;
export type ControlledPiWorkerErrorCode = "configuration" | "environment" | "node-runtime" | "package" | "entry" | "directories" | "spawn" | "invalid-jsonl" | "output-limit" | "queue-limit" | "invalid-response" | "correlation" | "capability" | "session-replacement" | "unsupported-event" | "command-denied" | "state" | "transport" | "timeout" | "unexpected-close" | "cleanup" | "broker";
export class ControlledPiWorkerError extends Error {
  readonly code: ControlledPiWorkerErrorCode;
  constructor(code: ControlledPiWorkerErrorCode) {
    super(`Controlled Pi Worker failed: ${code}.`);
    this.name = "ControlledPiWorkerError";
    this.code = code;
  }
}
function fail(code: ControlledPiWorkerErrorCode): never { throw new ControlledPiWorkerError(code); }
function object(value: unknown, code: ControlledPiWorkerErrorCode = "configuration"): Record<string, unknown> {
  try {
    if (!value || typeof value !== "object" || Array.isArray(value)) fail(code);
    const output: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const key of Reflect.ownKeys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (typeof key !== "string" || !descriptor || !("value" in descriptor) || !descriptor.enumerable) fail(code);
      output[key] = descriptor.value as unknown;
    }
    return output;
  } catch { return fail(code); }
}
function exact(value: Record<string, unknown>, keys: readonly string[], code: ControlledPiWorkerErrorCode): void {
  if (Object.keys(value).some(key => !keys.includes(key))) fail(code);
}
function string(value: unknown, code: ControlledPiWorkerErrorCode = "invalid-response", max = 1024): string {
  if (typeof value !== "string" || value.length === 0 || value.length > max || value.includes("\0")) fail(code);
  return value;
}
function integer(value: unknown, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > max) fail("invalid-response");
  return value;
}
function absolute(value: unknown): string {
  const result = string(value, "configuration", 4096);
  if (!isAbsolute(result) || resolve(result) !== result) fail("configuration");
  return result;
}
async function checked<T>(code: ControlledPiWorkerErrorCode, fn: () => Promise<T>): Promise<T> {
  try { return await fn(); } catch (error: unknown) { if (error instanceof ControlledPiWorkerError) throw error; return fail(code); }
}
function errorCode(error: unknown, fallback: ControlledPiWorkerErrorCode): ControlledPiWorkerErrorCode {
  return error instanceof ControlledPiWorkerError ? error.code : fallback;
}
/** Full byte framing, including EOF. Never decodes a partial UTF-8 record. */
export class ControlledPiLfReader {
  private tail = Buffer.alloc(0);
  private ended = false;
  private readonly onRecord: (record: unknown) => void;
  private readonly maxRecord: number;
  constructor(onRecord: (record: unknown) => void, maxRecord = MAX_RECORD) {
    this.onRecord = onRecord;
    this.maxRecord = maxRecord;
  }
  push(chunk: Uint8Array): void {
    if (this.ended) fail("invalid-jsonl");
    let offset = 0;
    for (let i = 0; i < chunk.length; i += 1) {
      if (chunk[i] !== 10) continue;
      if (this.tail.length + i - offset > this.maxRecord) fail("output-limit");
      const bytes = Buffer.concat([this.tail, chunk.subarray(offset, i)]);
      this.tail = Buffer.alloc(0);
      if (!bytes.length || bytes.includes(13)) fail("invalid-jsonl");
      let value: unknown;
      try {
        const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
        if (!Buffer.from(text, "utf8").equals(bytes)) fail("invalid-jsonl");
        value = JSON.parse(text) as unknown;
      } catch { fail("invalid-jsonl"); }
      this.onRecord(value);
      offset = i + 1;
    }
    if (this.tail.length + chunk.length - offset > this.maxRecord) fail("output-limit");
    this.tail = Buffer.concat([this.tail, chunk.subarray(offset)]);
  }
  end(): void {
    if (this.ended || this.tail.length) fail("invalid-jsonl");
    this.ended = true;
  }
}

export interface ControlledPiWorkerOptions {
  readonly packageDirectory: string;
  readonly nodeExecutable: string;
  readonly workspaceDirectory: string;
  readonly stateDirectory: string;
  /** Explicit input is screened, never inherited or spread into the child env. */
  readonly hostEnvironment: Readonly<Record<string, unknown>>;
  readonly workspaceId: WorkspaceId;
  readonly workerInstanceId: string;
  readonly toolProfile: RuntimeToolProfileV1;
  readonly maxOutputBytes: number;
  readonly maxDurationMs: number;
  readonly now: () => string;
  readonly onBrokerRecord: (request: unknown) => Promise<unknown>;
}
type ControlledPiCommand = Readonly<{ id: string; type: "get_state" | "get_messages" | "abort" }> | Readonly<{ id: string; type: "prompt"; message: string }>;
/** Pure outbound check. Prompt remains data only; CLI slash/shell shortcuts are denied. */
export function parseControlledPiCommand(value: unknown): ControlledPiCommand {
  const command = object(value, "command-denied");
  const type = command.type;
  if (type !== "get_state" && type !== "get_messages" && type !== "prompt" && type !== "abort") fail("command-denied");
  exact(command, type === "prompt" ? ["id", "type", "message"] : ["id", "type"], "command-denied");
  const id = string(command.id, "command-denied", 128);
  if (!/^[A-Za-z0-9_.:-]+$/.test(id)) fail("command-denied");
  if (type !== "prompt") return Object.freeze({ id, type });
  const message = string(command.message, "command-denied", MAX_RECORD / 2);
  if (/^[\/!]/.test(message.trimStart())) fail("command-denied");
  return Object.freeze({ id, type, message });
}
export interface ControlledPiCommandReceipt {
  readonly id: string;
  readonly command: "get_state" | "get_messages" | "prompt" | "abort";
  readonly success: boolean;
}
export interface ControlledPiCloseEvidence {
  readonly processDisposition?: "not_spawned";
  readonly stdoutEof: boolean;
  readonly stderrEof: boolean;
  readonly brokerEof: boolean;
  readonly closeObserved: boolean;
  readonly exitCode: number | null;
  readonly signal: string | null;
  readonly observedAt: string;
}
export interface ControlledPiWorkerClient {
  readonly state: RuntimeWorkerStateV1;
  start(): Promise<{ readonly runtimeSessionId: string }>;
  request(command: unknown): Promise<ControlledPiCommandReceipt>;
  events(): AsyncIterable<NormalizedRuntimeEventV1>;
  dispose(): Promise<ControlledPiCloseEvidence>;
}
/** Field projection for the explicitly supported message content vocabulary. */
export function parseControlledPiMessage(input: unknown): PiRuntimeMessageSnapshotInputV1 {
  const rawMessage = object(input, "invalid-response");
  const role = rawMessage.role === "toolResult" ? "tool" : rawMessage.role;
  if (role !== "user" && role !== "assistant" && role !== "tool" && role !== "system") fail("invalid-response");
  const content = rawMessage.content;
  const kinds: string[] = [];
  const texts: string[] = [];
  if (typeof content === "string" && (role === "user" || role === "system")) { kinds.push("text"); texts.push(content); }
  else if (Array.isArray(content)) {
    for (const value of content) {
      const block = object(value, "invalid-response");
      const type = string(block.type);
      if (type === "text") {
        exact(block, ["type", "text", "textSignature"], "invalid-response");
        if (typeof block.text !== "string" || (block.textSignature !== undefined && typeof block.textSignature !== "string")) fail("invalid-response");
        texts.push(block.text);
      } else if (type === "toolCall") {
        exact(block, ["type", "id", "name", "arguments", "thoughtSignature"], "invalid-response");
        if (role !== "assistant" || !TOOLS.includes(string(block.name) as typeof TOOLS[number]) || (block.thoughtSignature !== undefined && typeof block.thoughtSignature !== "string")) fail("invalid-response");
        string(block.id); object(block.arguments, "invalid-response");
      } else if (type === "thinking") {
        exact(block, ["type", "thinking", "thinkingSignature", "redacted"], "invalid-response");
        if (role !== "assistant" || typeof block.thinking !== "string" || (block.thinkingSignature !== undefined && typeof block.thinkingSignature !== "string") || (block.redacted !== undefined && typeof block.redacted !== "boolean")) fail("invalid-response");
        // Known thinking is omitted deliberately. Bodies/signatures are never
        // copied, hashed, or persisted; only this vocabulary marker remains.
      } else fail("unsupported-event");
      if (!kinds.includes(type)) kinds.push(type);
    }
  } else fail("invalid-response");
  const common = { contentKinds: kinds, ...(texts.length ? { text: texts.join("\n") } : {}) };
  if (role === "tool") {
    if (typeof rawMessage.isError !== "boolean") fail("invalid-response");
    return { role, ...common, toolCallId: string(rawMessage.toolCallId), toolName: string(rawMessage.toolName), success: !rawMessage.isError };
  }
  return { role, ...common, ...(typeof rawMessage.stopReason === "string" ? { stopReason: rawMessage.stopReason } : {}), ...(rawMessage.errorMessage === undefined ? {} : { errorMessage: "runtime-error" }) };
}

interface Pending {
  readonly command: ControlledPiCommandReceipt["command"];
  readonly resolve: (receipt: ControlledPiCommandReceipt) => void;
  readonly reject: (error: ControlledPiWorkerError) => void;
}
interface Projected {
  readonly event: PiRuntimeEventInputV1;
  readonly sourceType: string;
  readonly host?: boolean;
  readonly extension?: boolean;
  readonly requestId?: string;
  readonly toolCallId?: string;
  readonly links?: NormalizedRuntimeLinksV1;
  readonly observedAt: string;
}

async function validateLaunch(options: ControlledPiWorkerOptions): Promise<{ entry: string; runDirectory: string }> {
  const node = absolute(options.nodeExecutable);
  const workspace = absolute(options.workspaceDirectory);
  const state = absolute(options.stateDirectory);
  const directory = absolute(options.packageDirectory);
  const env = object(options.hostEnvironment, "environment");
  if (Object.keys(env).length > 512) fail("environment");
  for (const [key, value] of Object.entries(env)) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || typeof value !== "string" || /^NODE_/i.test(key) || /proxy|KEY|TOKEN|SECRET|PASSW(?:OR)?D|CREDENTIAL|AUTH/i.test(key) || /^PI_/i.test(key)) fail("environment");
  }
  await checked("node-runtime", async () => {
    if (process.versions.node !== NODE || await realpath(node) !== await realpath(process.execPath) || !(await stat(node)).isFile()) fail("node-runtime");
    await access(node, constants.X_OK);
  });
  const root = await checked("package", () => realpath(directory));
  const entry = await checked("package", async () => {
    if (!(await stat(root)).isDirectory()) fail("package");
    const manifestPath = join(root, "package.json");
    if (!(await lstat(manifestPath)).isFile()) fail("package");
    const handle = await open(manifestPath, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    let manifest: Record<string, unknown>;
    try {
      const info = await handle.stat();
      if (!info.isFile() || info.size > 65_536) fail("package");
      const bytes = Buffer.alloc(65_537);
      let size = 0;
      while (size < bytes.length) {
        const read = await handle.read(bytes, size, bytes.length - size, null);
        if (read.bytesRead === 0) break;
        size += read.bytesRead;
      }
      if (size > 65_536) fail("package");
      manifest = object(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, size))) as unknown, "package");
    } finally { await handle.close(); }
    if (manifest.name !== PACKAGE || manifest.version !== VERSION) fail("package");
    const bin = object(manifest.bin, "entry");
    if (Object.keys(bin).length !== 1 || bin.pi !== "dist/cli.js") fail("entry");
    const path = join(root, "dist", "cli.js");
    await checked("entry", async () => {
      if (!(await lstat(path)).isFile() || await realpath(path) !== path) fail("entry");
      await access(path, constants.R_OK);
    });
    return path;
  });
  const contains = (a: string, b: string) => a === b || b.startsWith(a + sep);
  const overlaps = (a: string, b: string) => contains(a, b) || contains(b, a);
  if (overlaps(workspace, state) || overlaps(root, workspace) || overlaps(root, state)) fail("directories");
  for (const path of [workspace, state]) await checked("directories", async () => {
    const info = await lstat(path);
    if (!info.isDirectory() || await realpath(path) !== path || (typeof process.getuid === "function" && info.uid !== process.getuid()) || (info.mode & 0o022) !== 0 || (await readdir(path)).length !== 0) fail("directories");
  });
  const runDirectory = await checked("directories", () => mkdtemp(join(state, "controlled-pi-")));
  try {
    for (const path of ["home", "home/.config", "agent", "tmp", "sessions"]) await mkdir(join(runDirectory, path), { mode: 0o700 });
  } catch { await rm(runDirectory, { recursive: true, force: true }); fail("directories"); }
  return { entry, runDirectory };
}

/** Single-use internal client. Neither arbitrary RPC nor a configurable extension is exposed. */
export function createControlledPiWorkerClient(input: ControlledPiWorkerOptions): ControlledPiWorkerClient {
  const raw = object(input);
  exact(raw, ["packageDirectory", "nodeExecutable", "workspaceDirectory", "stateDirectory", "hostEnvironment", "workspaceId", "workerInstanceId", "toolProfile", "maxOutputBytes", "maxDurationMs", "now", "onBrokerRecord"], "configuration");
  for (const key of ["packageDirectory", "nodeExecutable", "workspaceDirectory", "stateDirectory", "workspaceId", "workerInstanceId"]) string(raw[key], "configuration", 4096);
  if (raw.toolProfile !== "none" && raw.toolProfile !== "controlled-read-memory-draft-v1") fail("configuration");
  if (typeof raw.maxOutputBytes !== "number" || !Number.isSafeInteger(raw.maxOutputBytes) || raw.maxOutputBytes < 1 || raw.maxOutputBytes > 16_777_216 || typeof raw.maxDurationMs !== "number" || !Number.isSafeInteger(raw.maxDurationMs) || raw.maxDurationMs < 50 || raw.maxDurationMs > 300_000 || typeof raw.now !== "function" || typeof raw.onBrokerRecord !== "function") fail("configuration");
  // Capture the host-owned configuration once, not a mutable caller object.
  const options: ControlledPiWorkerOptions = { ...input, hostEnvironment: object(raw.hostEnvironment, "environment") };
  let state: RuntimeWorkerStateV1 = "ALLOCATED";
  let child: ChildProcess | undefined;
  let stdin: Writable | undefined;
  let stdout: Readable | undefined;
  let stderr: Readable | undefined;
  let broker: Duplex | undefined;
  let runDirectory: string | undefined;
  let preparation: Promise<{ entry: string; runDirectory: string }> | undefined;
  let sessionId: string | undefined;
  let failure: ControlledPiWorkerError | undefined;
  let hostSequence = 0;
  let outputSequence = 0;
  let extensionSequence = 0;
  let shutdownObserved = false;
  let outputBytes = 0;
  let stderrBytes = 0;
  let queueBytes = 0;
  let stdoutEof = false;
  let stderrEof = false;
  let brokerEof = false;
  let closeObserved = false;
  let terminal = false;
  let closing = false;
  let promptSent = false;
  let cancellationRequested = false;
  let promptAccepted = false;
  let agentStarted = false;
  let agentOpen = false;
  let agentEnded = false;
  let turnOpen = false;
  let turnsObserved = 0;
  let settledObserved = false;
  let activeMessage: { readonly role: string; readonly toolCallId?: string } | undefined;
  let consumer = false;
  let wake: (() => void) | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let termTimer: ReturnType<typeof setTimeout> | undefined;
  let killTimer: ReturnType<typeof setTimeout> | undefined;
  let eofTimer: ReturnType<typeof setTimeout> | undefined;
  let startResolve: ((result: { runtimeSessionId: string }) => void) | undefined;
  let startReject: ((error: ControlledPiWorkerError) => void) | undefined;
  let closeResolve: ((result: ControlledPiCloseEvidence) => void) | undefined;
  let closeReject: ((error: ControlledPiWorkerError) => void) | undefined;
  let closePromise: Promise<ControlledPiCloseEvidence> | undefined;
  let unspawnedClose: Promise<ControlledPiCloseEvidence> | undefined;
  const queue: { event: NormalizedRuntimeEventV1; bytes: number }[] = [];
  const early: Projected[] = [];
  const pending = new Map<string, Pending>();
  const usedRequests = new Set<string>();
  const usedBrokerRequests = new Set<string>();
  const outstandingBroker = new Map<string, "handling" | "sent">();
  const toolDeclarations = new Map<string, { readonly eventId: NormalizedRuntimeEventIdV1; readonly name: string }>();
  const toolStarts = new Set<string>();
  const toolCompletions = new Map<string, NormalizedRuntimeEventIdV1>();
  let brokerPending = 0;
  let inputEnded = false;
  const tools: readonly string[] = options.toolProfile === "none" ? [] : TOOLS;

  function emit(item: Omit<Projected, "observedAt"> & { observedAt?: string }): NormalizedRuntimeEventV1 | undefined {
    if (failure && !["process_exit", "process_close", "host_request_signal", "host_close_stdin"].includes(item.event.type)) return;
    const observedAt = item.observedAt ?? options.now();
    if (!sessionId) { if (early.length >= 16) fail("queue-limit"); early.push({ ...item, observedAt }); return; }
    const correlation: NormalizedRuntimeCorrelationV1 = {
      observed: item.requestId ? { requestId: item.requestId } : {},
      normalized: { ...(item.requestId ? { rpcRequestId: item.requestId } : {}), ...(item.toolCallId ? { toolCallId: item.toolCallId } : {}) },
    };
    const event = normalizePiRuntimeEventV1({
      workspaceId: options.workspaceId, runtimeSessionId: ids.session(sessionId), runtimeInstanceId: options.workerInstanceId,
      runtimeVersion: VERSION, surface: item.extension ? "extension" : item.host || item.event.type.startsWith("process_") ? "host" : "rpc", sequenceDomain: item.extension ? "extension-lifecycle" : item.host ? "host-client-actions" : "worker-output-and-process-boundaries",
      sourceSequence: item.extension ? ++extensionSequence : item.host ? ++hostSequence : ++outputSequence, sourceEventType: item.sourceType, observedAt,
      provenance: item.host ? "host-synthesized" : "observed", correlation, ...(item.links ? { links: item.links } : {}), event: item.event,
    });
    const bytes = Buffer.byteLength(JSON.stringify(event));
    if (queue.length >= QUEUE_COUNT || queueBytes + bytes > QUEUE_BYTES) fail("queue-limit");
    queue.push({ event, bytes }); queueBytes += bytes; wake?.(); wake = undefined;
    return event;
  }
  function safelyEmit(item: Omit<Projected, "observedAt">): void {
    try { emit(item); } catch (error: unknown) { stop(errorCode(error, "invalid-response")); }
  }
  function signal(value: "SIGTERM" | "SIGKILL"): void {
    let accepted = false;
    try { accepted = child?.kill(value) ?? false; } catch { /* Confirm close separately. */ }
    safelyEmit({ host: true, sourceType: "host_request_signal", event: { type: "host_request_signal", signal: value, accepted } });
  }
  function clearTimers(): void { clearTimeout(timer); clearTimeout(termTimer); clearTimeout(killTimer); clearTimeout(eofTimer); }
  function rejectPending(error: ControlledPiWorkerError): void {
    for (const request of pending.values()) request.reject(error);
    pending.clear();
  }
  function stop(code: ControlledPiWorkerErrorCode): void {
    if (failure || closeObserved) return;
    clearTimeout(timer); clearTimeout(termTimer); clearTimeout(eofTimer);
    failure = new ControlledPiWorkerError(code); state = "FAILED";
    rejectPending(failure); startReject?.(failure); wake?.(); wake = undefined;
    if (!child) { terminal = true; closeReject?.(failure); return; }
    stdin?.destroy(); signal("SIGTERM");
    termTimer = setTimeout(() => {
      signal("SIGKILL");
      killTimer = setTimeout(() => {
        clearTimers(); stdout?.destroy(); stderr?.destroy(); broker?.destroy(); child?.unref();
        failure = new ControlledPiWorkerError("cleanup"); terminal = true; closeReject?.(failure); wake?.(); wake = undefined;
      }, 1000);
    }, 250);
  }
  function write(stream: Writable, value: unknown): void {
    let bytes: Buffer;
    try { bytes = Buffer.from(JSON.stringify(value) + "\n"); } catch { fail("broker"); }
    if (bytes.length > MAX_RECORD || stream.writableLength + bytes.length > QUEUE_BYTES) fail("output-limit");
    stream.write(bytes, error => { if (error && !closeObserved) stop("transport"); });
  }
  function send(value: unknown, handshake = false): Promise<ControlledPiCommandReceipt> {
    try {
      const command = parseControlledPiCommand(value);
      const { type, id } = command;
      if (!handshake && id.startsWith("handshake-")) fail("command-denied");
      if (failure) throw failure;
      if ((!handshake && state !== "READY" && state !== "BUSY" && state !== "DRAINING") || !stdin || closing || closeObserved) fail("state");
      if (usedRequests.has(id) || usedRequests.size >= 512 || pending.size >= 16) fail("correlation");
      if (type === "prompt") {
        if (state !== "READY" || promptSent || cancellationRequested) fail("state");
        promptSent = true; state = "BUSY";
      }
      if (type === "abort") { cancellationRequested = true; state = "DRAINING"; }
      usedRequests.add(id);
      const result = new Promise<ControlledPiCommandReceipt>((resolveReceipt, reject) => pending.set(id, { command: type, resolve: resolveReceipt, reject }));
      try {
        emit({ host: true, sourceType: "host_send_command", requestId: id, event: { type: "host_send_command", command: type, requestId: id } });
        write(stdin, command);
      } catch (error: unknown) { stop(errorCode(error, "transport")); }
      return result;
    } catch (error: unknown) { return Promise.reject(error instanceof ControlledPiWorkerError ? error : new ControlledPiWorkerError("command-denied")); }
  }

  function response(rawResponse: Record<string, unknown>): void {
    exact(rawResponse, ["type", "id", "command", "success", "data", "error"], "invalid-response");
    const id = string(rawResponse.id, "correlation", 128);
    const request = pending.get(id);
    if (!request || rawResponse.command !== request.command) fail("correlation");
    if (typeof rawResponse.success !== "boolean" || (rawResponse.success && rawResponse.error !== undefined)) fail("invalid-response");
    emit({ event: { type: "command_response", command: request.command, success: rawResponse.success, ...(rawResponse.success ? {} : { error: { code: "runtime-rejected", message: "Runtime command rejected." } }) }, sourceType: "response", requestId: id });
    if (rawResponse.success && request.command === "get_state") {
      const data = object(rawResponse.data, "invalid-response");
      if (data.sessionId !== sessionId) fail("session-replacement");
      const model = object(data.model, "capability");
      if (model.provider !== PROVIDER || model.id !== MODEL || data.thinkingLevel !== "off" || data.autoCompactionEnabled !== false) fail("capability");
      if (typeof data.isStreaming !== "boolean" || typeof data.isCompacting !== "boolean") fail("invalid-response");
      const messageCount = integer(data.messageCount), pendingMessageCount = integer(data.pendingMessageCount);
      if (id === "handshake-state" && (data.isStreaming || data.isCompacting || messageCount !== 0 || pendingMessageCount !== 0)) fail("capability");
      emit({ event: { type: "state_snapshot", state: { isStreaming: data.isStreaming, messageCount, pendingMessageCount, isCompacting: data.isCompacting } }, sourceType: "get_state", requestId: id });
    }
    if (rawResponse.success && request.command === "get_messages") {
      const data = object(rawResponse.data, "invalid-response");
      if (!Array.isArray(data.messages) || data.messages.length > 256 || (id === "handshake-messages" && data.messages.length !== 0)) fail("invalid-response");
      emit({ event: { type: "messages_snapshot", messages: data.messages.map(parseControlledPiMessage) }, sourceType: "get_messages", requestId: id });
    }
    if (request.command === "prompt") { promptAccepted = rawResponse.success; if (!rawResponse.success) state = "DRAINING"; }
    pending.delete(id); request.resolve({ id, command: request.command, success: rawResponse.success });
  }
  function runtimeRecord(input: unknown): void {
    const value = object(input, "invalid-response");
    const type = string(value.type);
    if (!sessionId) fail("capability");
    if (type === "response") { response(value); return; }
    if (type === "session_start" || type === "session_replaced" || type === "session_switch") fail("session-replacement");
    if (state === "STARTING") fail("capability");
    if (!promptSent || !promptAccepted || settledObserved) fail("invalid-response");
    if (type === "agent_start") {
      if (agentStarted || agentOpen || agentEnded) fail("invalid-response");
      agentStarted = true; agentOpen = true;
      emit({ event: { type }, sourceType: type }); return;
    }
    if (type === "turn_start") {
      if (!agentOpen || turnOpen || activeMessage) fail("invalid-response");
      turnOpen = true; turnsObserved += 1;
      emit({ event: { type }, sourceType: type }); return;
    }
    if (type === "agent_end") {
      if (!agentOpen || turnOpen || activeMessage || turnsObserved === 0 || typeof value.willRetry !== "boolean") fail("invalid-response");
      if (value.willRetry) fail("capability");
      agentOpen = false; agentEnded = true;
      emit({ event: { type, willRetry: value.willRetry }, sourceType: type }); return;
    }
    if (type === "agent_settled") {
      if (!agentEnded || agentOpen || turnOpen || activeMessage) fail("invalid-response");
      settledObserved = true; state = "DRAINING";
      emit({ event: { type }, sourceType: type }); return;
    }
    if (type === "turn_end") {
      if (!agentOpen || !turnOpen || activeMessage) fail("invalid-response");
      turnOpen = false;
      emit({ event: { type, ...(Array.isArray(value.toolResults) ? { toolResultCount: value.toolResults.length } : {}) }, sourceType: type }); return;
    }
    if (!agentOpen || !turnOpen) fail("invalid-response");
    if (type === "message_update") {
      if (activeMessage?.role !== "assistant") fail("invalid-response");
      const delta = object(value.assistantMessageEvent, "invalid-response");
      if (delta.type === "text_delta") { if (typeof delta.delta !== "string") fail("invalid-response"); emit({ event: { type, role: "assistant", delta: delta.delta }, sourceType: type }); }
      else if (typeof delta.type !== "string" || !["start", "text_start", "text_end", "thinking_start", "thinking_delta", "thinking_end", "toolcall_start", "toolcall_delta", "toolcall_end", "done", "error"].includes(delta.type)) fail("unsupported-event");
      return;
    }
    if (type === "message_start" || type === "message_end") {
      const item = parseControlledPiMessage(value.message);
      const rawMessage = object(value.message, "invalid-response");
      if (type === "message_start") {
        if (activeMessage) fail("invalid-response");
        activeMessage = { role: item.role, ...(item.role === "tool" ? { toolCallId: item.toolCallId } : {}) };
      } else {
        if (!activeMessage || activeMessage.role !== item.role || (item.role === "tool" && activeMessage.toolCallId !== item.toolCallId)) fail("invalid-response");
        activeMessage = undefined;
      }
      if (item.role === "tool") {
        const completed = toolCompletions.get(item.toolCallId);
        if (!completed || toolDeclarations.get(item.toolCallId)?.name !== item.toolName) fail("correlation");
        emit({ event: { type, role: "tool", toolName: item.toolName, success: item.success, contentKinds: item.contentKinds, ...(type === "message_end" && item.text !== undefined ? { body: { text: item.text } } : {}) }, sourceType: type, toolCallId: item.toolCallId, links: { sourceEventIds: [completed] } });
      } else {
        if (item.role === "compaction-summary") fail("unsupported-event");
        emit({ event: { type, role: item.role, contentKinds: item.contentKinds, ...(type === "message_end" ? { ...(item.stopReason ? { stopReason: item.stopReason } : {}), ...(item.errorMessage ? { errorMessage: item.errorMessage } : {}), ...(item.text !== undefined ? { body: { text: item.text } } : {}) } : {}) }, sourceType: type });
      }
      if (type === "message_end" && item.role === "assistant" && Array.isArray(rawMessage.content)) {
        for (const block of rawMessage.content) {
          const call = object(block, "invalid-response");
          if (call.type !== "toolCall") continue;
          const id = string(call.id), name = string(call.name);
          if (!tools.includes(name) || toolDeclarations.has(id) || toolDeclarations.size >= 512) fail("correlation");
          const declaration = emit({ event: { type: "tool_declared", toolName: name, input: call.arguments }, sourceType: "message_end", toolCallId: id });
          if (declaration) toolDeclarations.set(id, { eventId: declaration.eventId, name });
        }
      }
      return;
    }
    if (type === "tool_execution_start" || type === "tool_execution_end") {
      if (activeMessage) fail("invalid-response");
      const id = string(value.toolCallId), name = string(value.toolName), declaration = toolDeclarations.get(id);
      if (!tools.includes(name) || !declaration || declaration.name !== name || toolCompletions.has(id)) fail("correlation");
      if (type === "tool_execution_start") {
        if (toolStarts.has(id)) fail("correlation");
        toolStarts.add(id);
        emit({ event: { type: "tool_started", toolName: name }, sourceType: type, toolCallId: id, links: { sourceEventIds: [declaration.eventId] } });
      }
      else {
        if (!toolStarts.has(id)) fail("correlation");
        if (typeof value.isError !== "boolean") fail("invalid-response");
        const completion = emit({ event: { type: "tool_completed", toolName: name, success: !value.isError, result: value.result }, sourceType: type, toolCallId: id, links: { sourceEventIds: [declaration.eventId] } });
        if (completion) toolCompletions.set(id, completion.eventId);
      }
      return;
    }
    // Unknown output cannot be forwarded, hashed (it may contain thinking), or ignored.
    fail("unsupported-event");
  }
  function closeInputAfterBrokerDrain(): void {
    if (!closing || inputEnded || failure || closeObserved || outstandingBroker.size !== 0) return;
    inputEnded = true;
    safelyEmit({ host: true, sourceType: "host_close_stdin", event: { type: "host_close_stdin" } });
    stdin?.end();
    termTimer = setTimeout(() => stop("timeout"), 1000);
  }
  function brokerRecord(input: unknown): void {
    const value = object(input, "broker");
    if (value.type === "hello") {
      exact(value, ["type", "protocolVersion", "profile", "provider", "model", "tools", "registeredTools", "sessionId", "capabilities"], "capability");
      if (closing) fail("state");
      if (sessionId || state !== "STARTING") fail("session-replacement");
      if (value.protocolVersion !== 1 || value.profile !== PROFILE || value.provider !== PROVIDER || value.model !== MODEL || JSON.stringify(value.tools) !== JSON.stringify(tools) || JSON.stringify(value.registeredTools) !== JSON.stringify(tools) || JSON.stringify(value.capabilities) !== JSON.stringify(CAPABILITIES)) fail("capability");
      sessionId = string(value.sessionId, "capability");
      for (const item of early.splice(0)) emit(item);
      emit({ extension: true, sourceType: "session_start", event: { type: "session_start", nextSessionIdentity: sessionId } });
      void Promise.all([send({ id: "handshake-state", type: "get_state" }, true), send({ id: "handshake-messages", type: "get_messages" }, true)]).then(receipts => {
        if (failure) return;
        if (closing || terminal || state !== "STARTING") { startReject?.(new ControlledPiWorkerError("state")); return; }
        if (receipts.some(receipt => !receipt.success)) { stop("capability"); return; }
        state = "READY"; startResolve?.({ runtimeSessionId: sessionId! });
      }).catch((error: unknown) => stop(errorCode(error, "capability")));
      return;
    }
    if (value.type === "broker_response_seen") {
      exact(value, ["type", "id"], "broker");
      const id = string(value.id, "broker", 128);
      if (outstandingBroker.get(id) !== "sent") fail("correlation");
      outstandingBroker.delete(id); brokerPending -= 1;
      closeInputAfterBrokerDrain();
      return;
    }
    if (value.type === "lifecycle") {
      exact(value, ["type", "event"], "broker");
      const event = object(value.event, "broker");
      exact(event, ["type", "reason", "sessionId"], "broker");
      if (!sessionId || event.sessionId !== sessionId || event.type !== "session_shutdown" || event.reason !== "quit" || shutdownObserved) fail("session-replacement");
      if (!closing) fail("unexpected-close");
      shutdownObserved = true;
      emit({ extension: true, sourceType: "session_shutdown", event: { type: "session_shutdown", previousSessionIdentity: sessionId, reason: "quit" } });
      return;
    }
    exact(value, ["type", "id", "request"], "broker");
    if (value.type !== "broker_request" || !sessionId || state !== "BUSY" || cancellationRequested || closing) fail("broker");
    const id = string(value.id, "broker", 128);
    if (usedBrokerRequests.has(id) || usedBrokerRequests.size >= 512 || brokerPending >= 16) fail("broker");
    const request = object(value.request, "broker");
    if (request.requestId !== id) fail("correlation");
    usedBrokerRequests.add(id); outstandingBroker.set(id, "handling"); brokerPending += 1;
    void options.onBrokerRecord(request).then(result => {
      if (failure || closeObserved) return;
      const response = object(result, "broker");
      if (response.requestId !== id || !broker) fail("correlation");
      outstandingBroker.set(id, "sent");
      write(broker, { type: "broker_response", id, response });
    }).catch((error: unknown) => stop(errorCode(error, "broker")));
  }
  async function start(): Promise<{ readonly runtimeSessionId: string }> {
    if (state !== "ALLOCATED") fail("state");
    state = "STARTING";
    try {
      preparation = (async () => {
        const launch = await validateLaunch(options); runDirectory = launch.runDirectory;
        if (closing) fail("state");
        await writeFile(join(runDirectory, "agent", "settings.json"), JSON.stringify({ compaction: { enabled: false }, retry: { enabled: false }, enableAnalytics: false, enableInstallTelemetry: false }), { mode: 0o600, flag: "wx" });
        if (closing) fail("state");
        return launch;
      })();
      const launch = await preparation;
      if (closing) fail("state");
      runDirectory = launch.runDirectory;
      const env = {
        HOME: join(runDirectory, "home"), USERPROFILE: join(runDirectory, "home"), XDG_CONFIG_HOME: join(runDirectory, "home", ".config"),
        PI_CODING_AGENT_DIR: join(runDirectory, "agent"), TMPDIR: join(runDirectory, "tmp"), TMP: join(runDirectory, "tmp"), TEMP: join(runDirectory, "tmp"),
        LANG: "C.UTF-8", LC_ALL: "C.UTF-8", NO_COLOR: "1", FORCE_COLOR: "0", AI_AGENT: "zhiwei-controlled-worker",
      };
      const args = [launch.entry, "--mode", "rpc", "--no-session", "--no-tools", ...(tools.length ? ["--tools", tools.join(",")] : []), "--no-extensions", "--extension", EXTENSION, "--no-skills", "--no-prompt-templates", "--no-themes", "--no-context-files", "--offline", "--no-approve", "--system-prompt", "You are a controlled synthetic test worker. Use only the explicitly provided tools and synthetic data.", "--thinking", "off", "--provider", PROVIDER, "--model", MODEL, "--session-dir", join(runDirectory, "sessions")];
      closePromise = new Promise<ControlledPiCloseEvidence>((resolveClose, reject) => { closeResolve = resolveClose; closeReject = reject; });
      // Keep lifecycle failures observed even when the caller has not disposed yet.
      void closePromise.catch(() => {});
      const result = new Promise<{ runtimeSessionId: string }>((resolveStart, reject) => { startResolve = resolveStart; startReject = reject; });
      child = spawn(options.nodeExecutable, args, { cwd: options.workspaceDirectory, env, stdio: ["pipe", "pipe", "pipe", "pipe"], shell: false });
      if (!(child.stdin instanceof Writable) || !(child.stdout instanceof Readable) || !(child.stderr instanceof Readable) || !(child.stdio[3] instanceof Duplex)) fail("spawn");
      stdin = child.stdin; stdout = child.stdout; stderr = child.stderr; broker = child.stdio[3];
      const rpcReader = new ControlledPiLfReader(runtimeRecord), brokerReader = new ControlledPiLfReader(brokerRecord);
      const data = (reader: ControlledPiLfReader, chunk: Buffer) => {
        if (failure) return;
        outputBytes += chunk.length;
        if (outputBytes > options.maxOutputBytes) { stop("output-limit"); return; }
        try { reader.push(chunk); } catch (error: unknown) { stop(errorCode(error, "invalid-jsonl")); }
      };
      stdout.on("data", (chunk: Buffer) => data(rpcReader, chunk));
      broker.on("data", (chunk: Buffer) => data(brokerReader, chunk));
      stdout.on("end", () => { stdoutEof = true; try { rpcReader.end(); } catch (error: unknown) { stop(errorCode(error, "invalid-jsonl")); } if (!closing && !failure && !eofTimer) eofTimer = setTimeout(() => stop("unexpected-close"), 100); });
      broker.on("end", () => { brokerEof = true; try { brokerReader.end(); } catch (error: unknown) { stop(errorCode(error, "invalid-jsonl")); } if (!closing && !failure && !eofTimer) eofTimer = setTimeout(() => stop("unexpected-close"), 100); });
      stderr.on("end", () => { stderrEof = true; });
      stderr.on("data", (chunk: Buffer) => { stderrBytes += chunk.length; if (stderrBytes > 16_384) stop("output-limit"); });
      for (const stream of [stdin, stdout, stderr, broker]) stream.on("error", () => stop("transport"));
      child.on("error", () => stop("spawn"));
      child.on("spawn", () => safelyEmit({ sourceType: "process_spawn", event: { type: "process_spawn" } }));
      child.on("exit", (code, signalValue) => safelyEmit({ sourceType: "process_exit", event: { type: "process_exit", code, signal: signalValue } }));
      child.on("close", (code, signalValue) => {
        if (!closing && !failure) stop("unexpected-close");
        if ((!stdoutEof || !stderrEof || !brokerEof || !shutdownObserved || pending.size !== 0 || code !== 0 || signalValue !== null) && !failure) stop("unexpected-close");
        safelyEmit({ sourceType: "process_close", event: { type: "process_close", code, signal: signalValue } });
        closeObserved = true; clearTimers(); state = failure ? "FAILED" : "STOPPED";
        const evidence: ControlledPiCloseEvidence = { stdoutEof, stderrEof, brokerEof, closeObserved: true, exitCode: code, signal: signalValue, observedAt: options.now() };
        void (async () => {
          try { if (runDirectory) await rm(runDirectory, { recursive: true, force: true }); }
          catch { failure = new ControlledPiWorkerError("cleanup"); terminal = true; closeReject?.(failure); wake?.(); wake = undefined; return; }
          terminal = true; closeResolve?.(evidence);
          wake?.(); wake = undefined;
        })();
      });
      timer = setTimeout(() => stop("timeout"), options.maxDurationMs);
      return await result;
    } catch (error: unknown) {
      const code = errorCode(error, "spawn");
      if (!(closing && code === "state" && child)) stop(code);
      if (child && closePromise) {
        try { await closePromise; } catch (closeError: unknown) { throw new ControlledPiWorkerError(errorCode(closeError, "cleanup")); }
      }
      if (!child && runDirectory) await checked("cleanup", () => rm(runDirectory!, { recursive: true, force: true }));
      throw new ControlledPiWorkerError(code);
    }
  }
  async function* events(): AsyncIterable<NormalizedRuntimeEventV1> {
    if (consumer) fail("state"); consumer = true;
    for (;;) {
      const item = queue.shift();
      if (item) { queueBytes -= item.bytes; yield item.event; continue; }
      if (failure && terminal) throw failure;
      if (terminal) return;
      await new Promise<void>(resolveWake => { wake = resolveWake; });
    }
  }
  async function dispose(): Promise<ControlledPiCloseEvidence> {
    if (!closePromise) {
      unspawnedClose ??= (async () => {
        // Closing admission is synchronous. start() rechecks it after every preparation await
        // and immediately before its non-awaiting spawn boundary.
        closing = true;
        if (!failure) state = "DRAINING";
        await preparation?.catch(() => {});
        if (child || closePromise) fail("cleanup");
        if (runDirectory) await checked("cleanup", () => rm(runDirectory!, { recursive: true, force: true }));
        if (!failure || failure.code === "state") state = "STOPPED";
        terminal = true; wake?.(); wake = undefined;
        return { processDisposition: "not_spawned" as const, stdoutEof: false, stderrEof: false, brokerEof: false, closeObserved: false, exitCode: null, signal: null, observedAt: options.now() };
      })();
      return unspawnedClose;
    }
    if (!closing && !closeObserved && !failure) {
      const wasStarting = state === "STARTING";
      closing = true; state = "DRAINING";
      if (wasStarting) startReject?.(new ControlledPiWorkerError("state"));
      closeInputAfterBrokerDrain();
    }
    return closePromise;
  }
  return { get state() { return state; }, start, request: command => send(command), events, dispose };
}
