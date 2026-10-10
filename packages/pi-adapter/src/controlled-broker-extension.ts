import { Socket } from "node:net";
import type { Duplex } from "node:stream";

// ADR0019: a runtime-validated first-party protocol, not copied SDK declarations.
// Source evidence: official Pi 0.84.1 model-runtime.js:133–144,461–465;
// pi-ai/api/lazy.js forwardStream; extensions/types.d.ts native provider/tool APIs.
// The official CLI owns the Agent Loop. This bridge performs one Broker request.
export const controlledExtensionEvidenceRevision = "pi-0.84.1-native-broker-source-v1";
const PROVIDER = "zhiwei-controlled", MODEL = "synthetic-v1", API = "zhiwei-controlled-broker-v1";
const NAMES = ["zhiwei_file_read", "zhiwei_memory_read", "zhiwei_draft_write"] as const;
const MAX_RECORD = 262_144, MAX_TEXT = 65_536, MAX_REQUESTS = 256, MAX_PENDING = 16;
const MAX_TOKENS = 512, REQUEST_TIMEOUT = 30_000;
const ERRORS = ["invalid_request", "unsupported", "closed", "expired", "budget_exceeded", "duplicate_request", "resource_unavailable", "io_unavailable"];
type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
function fail(): never { throw new Error("Controlled Pi extension unavailable."); }
function object(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) fail();
  const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of Reflect.ownKeys(input)) {
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (typeof key !== "string" || !descriptor || !("value" in descriptor) || !descriptor.enumerable) fail();
    result[key] = descriptor.value as unknown;
  }
  return result;
}
function keys(input: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []): void {
  if (required.some(key => !Object.hasOwn(input, key)) || Object.keys(input).some(key => !required.includes(key) && !optional.includes(key))) fail();
}
function text(input: unknown, max = MAX_TEXT, empty = false): string {
  if (typeof input !== "string" || (!empty && !input.length) || input.includes("\0") || Buffer.byteLength(input) > max) fail();
  return input;
}
function id(input: unknown): string {
  const value = text(input, 128);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)) fail();
  return value;
}
function integer(input: unknown): number {
  if (typeof input !== "number" || !Number.isSafeInteger(input) || input < 0) fail();
  return input;
}
function list(input: unknown, max = 128): unknown[] {
  if (!Array.isArray(input) || input.length > max) fail();
  return input;
}
function json(input: unknown, depth = 0, budget = { remaining: 8192 }): Json {
  if (++depth > 12 || --budget.remaining < 0) fail();
  if (input === null || typeof input === "boolean") return input;
  if (typeof input === "string") return text(input, MAX_RECORD, true);
  if (typeof input === "number") { if (!Number.isFinite(input)) fail(); return input; }
  if (Array.isArray(input)) return list(input).map(value => json(value, depth, budget));
  const value = object(input), result: { [key: string]: Json } = Object.create(null) as { [key: string]: Json };
  if (Object.keys(value).length > 128) fail();
  for (const [key, child] of Object.entries(value)) result[key] = json(child, depth, budget);
  return result;
}
function member(input: unknown, name: string): unknown {
  if (!input || (typeof input !== "object" && typeof input !== "function")) fail();
  // Pi context intentionally uses guarded getters; read only named API members.
  return Reflect.get(input, name) as unknown;
}
function method(input: unknown, name: string): (...args: unknown[]) => unknown {
  const value = member(input, name);
  if (typeof value !== "function") fail();
  return (...args: unknown[]) => Reflect.apply(value, input, args) as unknown;
}
function callable(input: unknown): ((...args: unknown[]) => unknown) | undefined {
  if (input === undefined) return undefined;
  if (typeof input !== "function") fail();
  return (...args: unknown[]) => Reflect.apply(input, undefined, args) as unknown;
}
function signal(input: unknown): AbortSignal | undefined {
  if (input === undefined) return undefined;
  if (!(input instanceof AbortSignal)) fail();
  return input;
}
function toolName(input: unknown): typeof NAMES[number] {
  for (const name of NAMES) if (input === name) return name;
  return fail();
}
function argumentsFor(name: typeof NAMES[number], input: unknown): { [key: string]: string } {
  const value = object(input);
  if (name === "zhiwei_draft_write") {
    keys(value, ["name", "text"]);
    const name = text(value.name, 64);
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(name)) fail();
    return { name, text: text(value.text, MAX_TEXT, true) };
  }
  keys(value, ["resourceId"]);
  return { resourceId: id(value.resourceId) };
}
function content(input: unknown, allowTools: boolean): Json[] {
  return list(input, 32).map((item): Json => {
    const value = object(item);
    if (value.type === "text") { keys(value, ["type", "text"]); return { type: "text", text: text(value.text, MAX_TEXT, true) }; }
    if (value.type !== "toolCall" || !allowTools) fail();
    keys(value, ["type", "id", "name", "arguments"]);
    const name = toolName(value.name);
    return { type: "toolCall", id: id(value.id), name, arguments: argumentsFor(name, value.arguments) };
  });
}
function usage(input: unknown): Json {
  const value = object(input);
  keys(value, ["input", "output", "cacheRead", "cacheWrite", "totalTokens", "cost"], ["cacheWrite1h", "reasoning"]);
  const cost = object(value.cost);
  keys(cost, ["input", "output", "cacheRead", "cacheWrite", "total"]);
  for (const [key, child] of Object.entries(value)) if (key !== "cost") integer(child);
  for (const child of Object.values(cost)) if (typeof child !== "number" || !Number.isFinite(child) || child < 0) fail();
  return json(value);
}
function message(input: unknown): Json {
  const value = object(input);
  if (value.role === "user") {
    keys(value, ["role", "content", "timestamp"]);
    return { role: "user", content: typeof value.content === "string" ? text(value.content, MAX_TEXT, true) : content(value.content, false), timestamp: integer(value.timestamp) };
  }
  if (value.role === "assistant") {
    keys(value, ["role", "content", "api", "provider", "model", "usage", "stopReason", "timestamp"]);
    if (value.api !== API || value.provider !== PROVIDER || value.model !== MODEL || (typeof value.stopReason !== "string" || !["stop", "length", "toolUse"].includes(value.stopReason))) fail();
    return { role: "assistant", content: content(value.content, true), api: API, provider: PROVIDER, model: MODEL, usage: usage(value.usage), stopReason: text(value.stopReason), timestamp: integer(value.timestamp) };
  }
  if (value.role !== "toolResult") fail();
  keys(value, ["role", "toolCallId", "toolName", "content", "isError", "timestamp"], ["details", "usage"]);
  // Upstream createToolResultMessage owns these optional keys even when undefined.
  // This synthetic profile has no tool token-usage contract; defined usage is unsupported.
  if (value.usage !== undefined) fail();
  if (typeof value.isError !== "boolean") fail();
  if (value.details !== undefined) { const details = object(value.details); keys(details, [], ["synthetic"]); if (Object.hasOwn(details, "synthetic") && details.synthetic !== true) fail(); }
  // Empty upstream error details and our synthetic marker are non-model metadata.
  return { role: "toolResult", toolCallId: id(value.toolCallId), toolName: toolName(value.toolName), content: content(value.content, false), isError: value.isError, timestamp: integer(value.timestamp) };
}
function schema(name: typeof NAMES[number]): Json {
  const fields = name === "zhiwei_draft_write" ? ["name", "text"] : ["resourceId"];
  return { type: "object", properties: Object.fromEntries(fields.map(field => [field, { type: "string" }])), required: fields, additionalProperties: false };
}
function projectContext(input: unknown, active: readonly string[]): Json {
  const value = object(input);
  keys(value, ["messages"], ["systemPrompt", "tools"]);
  const tools = value.tools === undefined ? [] : list(value.tools, 3).map(item => {
    const tool = object(item), name = toolName(tool.name);
    keys(tool, ["name", "description", "parameters"], ["label", "execute", "prepareArguments", "executionMode", "constrainedSampling"]);
    if (tool.execute !== undefined) callable(tool.execute);
    if (tool.prepareArguments !== undefined || tool.constrainedSampling !== undefined || (tool.executionMode !== undefined && tool.executionMode !== "sequential")) fail();
    const parameters = json(tool.parameters);
    if (JSON.stringify(parameters) !== JSON.stringify(schema(name))) fail();
    return { name, description: text(tool.description, 1024), parameters };
  });
  if (JSON.stringify(tools.map(tool => tool.name)) !== JSON.stringify(active)) fail();
  const projected = { ...(value.systemPrompt === undefined ? {} : { systemPrompt: text(value.systemPrompt, MAX_TEXT, true) }), messages: list(value.messages).map(message), tools };
  if (Buffer.byteLength(JSON.stringify(projected)) > MAX_RECORD - 1024) fail();
  return projected;
}
const FIXED_MODEL = Object.freeze({ id: MODEL, name: "Controlled synthetic model", api: API, provider: PROVIDER, baseUrl: "zhiwei-broker:fd3", reasoning: false, input: ["text"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 32768, maxTokens: MAX_TOKENS });
function checkModel(input: unknown): void {
  const value = object(input);
  keys(value, Object.keys(FIXED_MODEL));
  for (const [key, expected] of Object.entries(FIXED_MODEL)) if (JSON.stringify(value[key]) !== JSON.stringify(expected)) fail();
}
function assistant(parts: Json[], stopReason: string, now: () => number): { [key: string]: Json } {
  return { role: "assistant", content: parts, api: API, provider: PROVIDER, model: MODEL, usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }, stopReason, timestamp: integer(now()) };
}

interface Pending { resolve: (value: Record<string, unknown>) => void; reject: () => void; timer: ReturnType<typeof setTimeout>; cleanup: () => void; cancelled: boolean }
/** Own protocol seam for deterministic unit tests. The CLI default below fixes fd3. */
export function installControlledBrokerExtension(input: unknown, channel: Duplex, now: () => number = Date.now): void {
  const registerProvider = method(input, "registerProvider"), registerTool = method(input, "registerTool"), on = method(input, "on");
  const getAllTools = method(input, "getAllTools"), getActiveTools = method(input, "getActiveTools");
  let started = false, closed = false, failed = false, counter = 0, bytes = 0, sessionId = "";
  let active: string[] = [], tail = Buffer.alloc(0);
  const pending = new Map<string, Pending>();
  function stop(): void {
    if (failed) return;
    failed = true;
    for (const entry of pending.values()) { clearTimeout(entry.timer); entry.cleanup(); entry.reject(); }
    pending.clear(); channel.destroy();
  }
  function send(value: unknown): Promise<void> {
    const bytes = Buffer.from(`${JSON.stringify(value)}\n`);
    if (failed || closed || bytes.length > MAX_RECORD || channel.writableLength + bytes.length > 1_048_576) return Promise.reject(new Error("Controlled Pi extension unavailable."));
    return new Promise<void>((resolve, reject) => channel.write(bytes, error => { if (error) { stop(); reject(new Error("Controlled Pi extension unavailable.")); } else resolve(); }));
  }
  function response(input: unknown): void {
    const value = object(input); keys(value, ["type", "id", "response"]);
    if (value.type !== "broker_response") fail();
    const requestId = id(value.id), entry = pending.get(requestId);
    if (!entry) fail();
    const reply = object(value.response); keys(reply, ["requestId", "ok"], ["result", "error"]);
    if (reply.requestId !== requestId || typeof reply.ok !== "boolean") fail();
    if (reply.ok) { if (!Object.hasOwn(reply, "result") || Object.hasOwn(reply, "error")) fail(); }
    else { keys(reply, ["requestId", "ok", "error"]); const error = object(reply.error); keys(error, ["code"]); if ((typeof error.code !== "string" || !ERRORS.includes(error.code))) fail(); }
    pending.delete(requestId); clearTimeout(entry.timer); entry.cleanup();
    // Receipt only: this does not assert execution success or current-result eligibility.
    // fd3 acknowledgment lets the host order stdin EOF after this actual receipt.
    void send({ type: "broker_response_seen", id: requestId }).catch(stop);
    if (!entry.cancelled) entry.resolve(reply);
  }
  channel.on("data", (chunk: Buffer) => {
    if (failed || closed) return;
    try {
      if (!(chunk instanceof Uint8Array) || (bytes += chunk.length) > 4_194_304) fail();
      let offset = 0;
      for (let index = 0; index < chunk.length; index += 1) {
        if (chunk[index] !== 10) continue;
        if (tail.length + index - offset > MAX_RECORD) fail();
        const record = Buffer.concat([tail, chunk.subarray(offset, index)]);
        if (!record.length || record.includes(13)) fail();
        const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(record);
        if (!Buffer.from(text).equals(record)) fail();
        tail = Buffer.alloc(0); response(JSON.parse(text) as unknown); offset = index + 1;
      }
      if (tail.length + chunk.length - offset > MAX_RECORD) fail();
      tail = Buffer.concat([tail, chunk.subarray(offset)]);
    } catch { stop(); }
  });
  channel.on("end", () => { if (!closed || tail.length || pending.size) stop(); });
  channel.on("error", stop);
  channel.on("close", () => { if (!closed) stop(); });
  function request(body: Record<string, Json>, abort?: AbortSignal): Promise<Record<string, unknown>> {
    if (!started || failed || closed || abort?.aborted || counter >= MAX_REQUESTS || pending.size >= MAX_PENDING) return Promise.reject(new Error("Controlled Pi extension unavailable."));
    const requestId = `broker-${++counter}`;
    return new Promise((resolve, reject) => {
      const denied = () => reject(new Error("Controlled Pi extension unavailable."));
      const aborted = () => { const entry = pending.get(requestId); if (entry) { entry.cancelled = true; entry.reject(); } };
      const timer = setTimeout(stop, REQUEST_TIMEOUT);
      pending.set(requestId, { resolve, reject: denied, timer, cleanup: () => abort?.removeEventListener("abort", aborted), cancelled: false });
      abort?.addEventListener("abort", aborted, { once: true });
      void send({ type: "broker_request", id: requestId, request: { ...body, requestId } }).catch(stop);
    });
  }
  function stream(model: unknown, context: unknown, optionsInput?: unknown): AsyncIterable<Json> {
    return (async function* (): AsyncGenerator<Json> {
      let abort: AbortSignal | undefined;
      try {
        checkModel(model);
        const options = optionsInput === undefined ? {} : object(optionsInput);
        abort = signal(options.signal);
        if (options.apiKey !== undefined || options.fetch !== undefined || options.env !== undefined || (options.sessionId !== undefined && options.sessionId !== sessionId) || !started || failed || closed || abort?.aborted) fail();
        const onPayload = callable(options.onPayload), onResponse = callable(options.onResponse);
        const initial = projectContext(context, active);
        const replacement = onPayload ? await onPayload(initial, model) : undefined;
        const actual = projectContext(replacement === undefined ? initial : replacement, active);
        yield { type: "start", partial: assistant([], "pending", now) };
        const reply = await request({ kind: "model.invoke", context: actual, maxTokens: MAX_TOKENS }, abort);
        if (abort?.aborted || reply.ok !== true) fail();
        if (onResponse) await onResponse({ status: 200, headers: {} }, model);
        const result = object(reply.result); keys(result, ["kind"], ["text", "toolCalls"]);
        if (result.kind !== "model.result") fail();
        const parts: Json[] = [];
        if (result.text !== undefined) parts.push({ type: "text", text: text(result.text, MAX_TEXT, true) });
        const calls = result.toolCalls === undefined ? [] : list(result.toolCalls, 3);
        const seen = new Set<string>();
        for (const call of calls) {
          const value = object(call); keys(value, ["id", "name", "arguments"]);
          const name = toolName(value.name), callId = id(value.id);
          if (!active.includes(name) || seen.has(callId)) fail(); seen.add(callId);
          parts.push({ type: "toolCall", id: callId, name, arguments: argumentsFor(name, value.arguments) });
        }
        if (!parts.length) fail();
        if (abort?.aborted || failed || closed) fail();
        const reason = calls.length ? "toolUse" : "stop";
        yield { type: "done", reason, message: assistant(parts, reason, now) };
      } catch {
        const reason = abort?.aborted ? "aborted" : "error";
        yield { type: "error", reason, error: { ...assistant([], reason, now), errorMessage: "Controlled Pi request unavailable." } };
      }
    })();
  }
  registerProvider({ id: PROVIDER, name: "Controlled synthetic broker", auth: { apiKey: { name: "Inherited Broker", resolve: async () => ({ auth: {} }) } }, getModels: () => [FIXED_MODEL], stream, streamSimple: stream });
  for (const name of NAMES) registerTool({ name, label: name, description: `Use the fixed synthetic ${name === "zhiwei_file_read" ? "file fixture" : name === "zhiwei_memory_read" ? "memory fixture" : "draft directory"}.`, parameters: schema(name), executionMode: "sequential", execute: async (callId: unknown, params: unknown, abortInput: unknown, update: unknown, context: unknown) => {
    id(callId); callable(update); const abort = signal(abortInput);
    if (!active.includes(name) || id(method(member(context, "sessionManager"), "getSessionId")()) !== sessionId) fail();
    const args = argumentsFor(name, params);
    const reply = await request({ kind: name === "zhiwei_file_read" ? "file.read" : name === "zhiwei_memory_read" ? "memory.read" : "draft.write", ...args }, abort);
    if (abort?.aborted || reply.ok !== true) fail();
    const result = object(reply.result); keys(result, ["kind", "text"], ["draftId"]);
    if (result.kind !== "tool.result") fail();
    if (result.draftId !== undefined) id(result.draftId);
    return { content: [{ type: "text", text: text(result.text, MAX_TEXT, true) }] };
  } });
  on("session_start", async (eventInput: unknown, contextInput: unknown) => {
    try {
      const event = object(eventInput); keys(event, ["type", "reason"]);
      if (event.type !== "session_start" || event.reason !== "startup" || started || failed || closed) fail();
      checkModel(member(contextInput, "model"));
      if (member(contextInput, "mode") !== "rpc" || member(contextInput, "thinkingLevel") !== "off" || method(contextInput, "isIdle")() !== true) fail();
      sessionId = id(method(member(contextInput, "sessionManager"), "getSessionId")());
      const configured = list(getAllTools(), 3).map(input => {
        const tool = object(input), name = toolName(tool.name);
        text(tool.description, 1024);
        if (JSON.stringify(json(tool.parameters)) !== JSON.stringify(schema(name))) fail();
        return name;
      });
      active = list(getActiveTools(), 3).map(tool => toolName(tool));
      if (JSON.stringify(configured) !== JSON.stringify(active) || (active.length !== 0 && JSON.stringify(active) !== JSON.stringify(NAMES))) fail();
      started = true;
      await send({ type: "hello", protocolVersion: 1, profile: "zhiwei-controlled-synthetic-v1", provider: PROVIDER, model: MODEL, tools: active, registeredTools: configured, sessionId, capabilities: ["model-broker-v1", "tool-broker-v1", "abort", "progress"] });
    } catch { stop(); fail(); }
  });
  on("session_before_compact", () => ({ cancel: true }));
  on("user_bash", () => ({ result: { output: "Controlled Pi shell unavailable.", exitCode: 1, cancelled: false, truncated: false } }));
  on("session_shutdown", async (eventInput: unknown, contextInput: unknown) => {
    try {
      const event = object(eventInput); keys(event, ["type", "reason"]);
      if (!started || failed || closed || event.type !== "session_shutdown" || event.reason !== "quit" || id(method(member(contextInput, "sessionManager"), "getSessionId")()) !== sessionId || pending.size) fail();
      await send({ type: "lifecycle", event: { type: "session_shutdown", reason: "quit", sessionId } });
      closed = true; channel.end();
    } catch { stop(); fail(); }
  });
}

export default function controlledBrokerExtension(api: unknown): void {
  // This is an inherited OS handle, not an address, port, credential, or network client.
  installControlledBrokerExtension(api, new Socket({ fd: 3, readable: true, writable: true }));
}
