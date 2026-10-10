import { constants } from "node:fs";
import { chmod, lstat, mkdir, mkdtemp, open, realpath, rm, type FileHandle } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  parseExecutionSpecV1, snapshotJsonValue,
  type ExecutionSpecV1, type JsonValue,
} from "../../../../packages/protocol/src/index.ts";

/** This module has deliberately NO production factory, provider URL, credential or durable authority seam.
 * A syntactically valid ExecutionSpec is NOT an authorized Task/Grant/action reservation. The only
 * composition here owns newly generated synthetic assets and a first-party, in-process receiver.
 * Durable admission, revocation, late-result acceptance and real data/model dispatch remain unsupported.
 */
export const controlledSyntheticToolNames = Object.freeze([
  "zhiwei_file_read", "zhiwei_memory_read", "zhiwei_draft_write",
] as const);
export type ControlledSyntheticToolName = typeof controlledSyntheticToolNames[number];
export type ControlledBrokerErrorCode = "invalid_request" | "unsupported" | "closed" | "expired"
  | "budget_exceeded" | "duplicate_request" | "resource_unavailable" | "io_unavailable";
export class ControlledBrokerError extends Error {
  readonly code: ControlledBrokerErrorCode;
  constructor(code: ControlledBrokerErrorCode) {
    super(`Controlled synthetic broker: ${code}`);
    this.name = "ControlledBrokerError";
    this.code = code;
  }
}
export interface ControlledModelToolCall {
  readonly id: string;
  readonly name: ControlledSyntheticToolName;
  readonly arguments: Readonly<Record<string, string>>;
}
export interface ControlledModelResult {
  readonly kind: "model.result";
  readonly text?: string;
  readonly toolCalls?: readonly ControlledModelToolCall[];
}
export type ControlledBrokerResponse =
  | Readonly<{ requestId: string; ok: true; result: ControlledModelResult | Readonly<{ kind: "tool.result"; text: string; draftId?: string }> }>
  | Readonly<{ requestId: string; ok: false; error: Readonly<{ code: ControlledBrokerErrorCode }> }>;
export type ControlledBrokerRequest =
  | Readonly<{ kind: "model.invoke"; requestId: string; context: JsonValue; maxTokens: number }>
  | Readonly<{ kind: "file.read"; requestId: string; resourceId: string }>
  | Readonly<{ kind: "memory.read"; requestId: string; resourceId: string }>
  | Readonly<{ kind: "draft.write"; requestId: string; name: string; text: string }>;
export interface SyntheticModelRequestRecord {
  readonly requestId: string;
  readonly executionUnitId: string;
  readonly workspaceId: string;
  readonly modelProfile: ExecutionSpecV1["selectedModelProfile"];
  readonly fence: ExecutionSpecV1["fence"];
  readonly maxTokens: number;
  /** Exact projected JSON consumed by the first-party receiver, not the earlier Runtime prompt. */
  readonly context: JsonValue;
  readonly serializedBytes: number;
}
export interface SyntheticBrokerSnapshot {
  readonly mode: "synthetic-fixtures-only";
  readonly durableAuthority: "unsupported";
  readonly state: "open" | "closed";
  readonly executionUnitId: string;
  readonly workspaceId: string;
  readonly modelRequests: readonly SyntheticModelRequestRecord[];
  readonly receiverRequests: readonly SyntheticModelRequestRecord[];
  readonly toolCalls: number;
  readonly reservedTokens: number;
  readonly drafts: readonly Readonly<{ draftId: string; name: string; bytes: number }>[];
  readonly cleanup: "pending" | "disposed" | "cleanup_failed";
}
export interface SyntheticControlledBroker {
  /** The transport binds this function once. Request bodies never supply identities or authority. */
  handle(request: unknown): Promise<ControlledBrokerResponse>;
  snapshot(): SyntheticBrokerSnapshot;
  dispose(): Promise<Readonly<{ status: "disposed" | "cleanup_failed" }>>;
}

const FILE_TEXT = "Synthetic file fixture: the sample project uses a blue notebook.\n";
const MEMORY_TEXT = "Synthetic memory fixture: summarize the sample project in three short sentences.";
const MAX_REQUEST_BYTES = 262_144;
const MAX_OUTPUT_BYTES = 65_536;
const MAX_ACTIONS = 256;
const MAX_QUEUED = 32;
const LIMITATIONS = ["durable-authority", "private-data", "injection", "link-substitution", "backup-recovery"] as const;
/** Evidence status only. These integration/adversarial exercises were intentionally not run here. */
export const controlledBrokerNotRun = Object.freeze(LIMITATIONS.map(scenario => Object.freeze({ scenario, status: "not_run" as const })));

function reject(code: ControlledBrokerErrorCode = "invalid_request"): never { throw new ControlledBrokerError(code); }
function obj(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) reject();
  return value as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []): void {
  if (required.some(key => !Object.hasOwn(value, key)) || Object.keys(value).some(key => !required.includes(key) && !optional.includes(key))) reject();
}
function text(value: unknown, max = MAX_OUTPUT_BYTES, empty = false): string {
  if (typeof value !== "string" || (!empty && value.length === 0) || Buffer.byteLength(value) > max) reject();
  return value;
}
function id(value: unknown): string {
  const result = text(value, 128);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(result)) reject();
  return result;
}
function number(value: unknown, max = Number.MAX_SAFE_INTEGER, zero = true): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < (zero ? 0 : 1) || value > max) reject();
  return value;
}
function array(value: unknown, max: number): readonly unknown[] {
  if (!Array.isArray(value) || value.length > max) reject();
  return value;
}
function toolName(value: unknown): ControlledSyntheticToolName {
  if (!controlledSyntheticToolNames.includes(value as ControlledSyntheticToolName)) reject("unsupported");
  return value as ControlledSyntheticToolName;
}
function freeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
function boundedSnapshot(input: unknown): JsonValue {
  try {
    const result = snapshotJsonValue(input, { maxDepth: 12, maxNodes: 8192, maxStringLength: MAX_REQUEST_BYTES, maxContainerEntries: 128 });
    // Reject a large aggregate before JSON.stringify allocates a serialized aggregate. Transport
    // framing also has a ceiling, but this public in-process boundary cannot assume that caller.
    let lowerBound = 0;
    function count(value: JsonValue): void {
      if (typeof value === "string") lowerBound += Buffer.byteLength(value) + 2;
      else if (value === null || typeof value !== "object") lowerBound += String(value).length;
      else {
        lowerBound += 2;
        if (Array.isArray(value)) for (const child of value) { count(child); lowerBound += 1; }
        else for (const [key, child] of Object.entries(value)) { lowerBound += Buffer.byteLength(key) + 3; count(child); lowerBound += 1; }
      }
      if (lowerBound > MAX_REQUEST_BYTES) reject();
    }
    count(result);
    if (Buffer.byteLength(JSON.stringify(result)) > MAX_REQUEST_BYTES) reject();
    return result;
  } catch (error) {
    if (error instanceof ControlledBrokerError) throw error;
    return reject();
  }
}
function argumentsFor(name: ControlledSyntheticToolName, input: unknown): Readonly<Record<string, string>> {
  const value = obj(input);
  if (name === "zhiwei_draft_write") {
    keys(value, ["name", "text"]);
    const name = text(value.name, 64);
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(name)) reject();
    return { name, text: text(value.text, MAX_OUTPUT_BYTES, true) };
  }
  keys(value, ["resourceId"]);
  return { resourceId: id(value.resourceId) };
}
function content(input: unknown, allowCalls: boolean): readonly JsonValue[] {
  return array(input, 32).map((item): JsonValue => {
    const value = obj(item);
    if (value.type === "text") {
      keys(value, ["type", "text"]);
      return { type: "text", text: text(value.text, MAX_OUTPUT_BYTES, true) };
    }
    if (value.type === "toolCall" && allowCalls) {
      keys(value, ["type", "id", "name", "arguments"]);
      const name = toolName(value.name);
      return { type: "toolCall", id: id(value.id), name, arguments: argumentsFor(name, value.arguments) };
    }
    // No signature, raw thinking, image, arbitrary part or hash surrogate is retained.
    return reject("unsupported");
  });
}
function usage(input: unknown): JsonValue {
  const value = obj(input);
  keys(value, ["input", "output", "cacheRead", "cacheWrite", "totalTokens", "cost"], ["cacheWrite1h", "reasoning"]);
  const result: Record<string, JsonValue> = {};
  for (const [key, child] of Object.entries(value)) {
    if (key === "cost") {
      const cost = obj(child);
      keys(cost, ["input", "output", "cacheRead", "cacheWrite", "total"]);
      for (const entry of Object.values(cost)) if (typeof entry !== "number" || !Number.isFinite(entry) || entry < 0) reject();
      result.cost = cost as Record<string, number>;
    } else result[key] = number(child);
  }
  return result;
}
function message(input: unknown): JsonValue {
  const value = obj(input);
  if (value.role === "user") {
    keys(value, ["role", "content", "timestamp"]);
    return { role: "user", content: typeof value.content === "string" ? text(value.content, MAX_OUTPUT_BYTES, true) : content(value.content, false), timestamp: number(value.timestamp) };
  }
  if (value.role === "assistant") {
    keys(value, ["role", "content", "api", "provider", "model", "usage", "stopReason", "timestamp"]);
    if (!["stop", "length", "toolUse", "error", "aborted"].includes(value.stopReason as string)) reject();
    return { role: "assistant", content: content(value.content, true), api: id(value.api), provider: id(value.provider), model: id(value.model), usage: usage(value.usage), stopReason: value.stopReason as string, timestamp: number(value.timestamp) };
  }
  if (value.role === "toolResult") {
    keys(value, ["role", "toolCallId", "toolName", "content", "isError", "timestamp"], ["details"]);
    if (typeof value.isError !== "boolean") reject();
    const result: Record<string, JsonValue> = { role: "toolResult", toolCallId: id(value.toolCallId), toolName: toolName(value.toolName), content: content(value.content, false), isError: value.isError, timestamp: number(value.timestamp) };
    if (value.details !== undefined) {
      const details = obj(value.details);
      keys(details, ["synthetic"]);
      if (details.synthetic !== true) reject();
      result.details = { synthetic: true };
    }
    return result;
  }
  return reject("unsupported");
}
function tool(input: unknown): JsonValue {
  const value = obj(input);
  keys(value, ["name", "description", "parameters"]);
  const name = toolName(value.name);
  const parameters = obj(value.parameters);
  keys(parameters, ["type", "properties", "required"], ["additionalProperties"]);
  if (parameters.type !== "object" || (parameters.additionalProperties !== undefined && parameters.additionalProperties !== false)) reject();
  const fields = name === "zhiwei_draft_write" ? ["name", "text"] : ["resourceId"];
  const properties = obj(parameters.properties);
  keys(properties, fields);
  for (const item of Object.values(properties)) {
    const property = obj(item);
    keys(property, ["type"], ["description"]);
    if (property.type !== "string") reject();
    if (property.description !== undefined) text(property.description, 1024);
  }
  const required = array(parameters.required, fields.length);
  if (required.length !== fields.length || new Set(required).size !== fields.length || required.some(field => !fields.includes(field as string))) reject();
  // Keep the full accepted schema and description, including optional descriptive text, exactly.
  return { name, description: text(value.description, 2048), parameters: parameters as JsonValue };
}
function context(input: unknown): JsonValue {
  const value = obj(input);
  keys(value, ["messages"], ["systemPrompt", "tools"]);
  const result: Record<string, JsonValue> = { messages: array(value.messages, 64).map(message) };
  if (value.systemPrompt !== undefined) result.systemPrompt = text(value.systemPrompt, MAX_OUTPUT_BYTES, true);
  if (value.tools !== undefined) {
    const tools = array(value.tools, 3).map(tool);
    const names = tools.map(item => (item as Record<string, JsonValue>).name);
    if (new Set(names).size !== names.length) reject();
    result.tools = tools;
  }
  return result;
}
/** Pure DTO validation. It confers no authority and touches no assets/receiver. */
export function parseControlledBrokerRequest(input: unknown): ControlledBrokerRequest {
  const value = obj(boundedSnapshot(input));
  const requestId = id(value.requestId);
  if (value.kind === "model.invoke") {
    keys(value, ["kind", "requestId", "context", "maxTokens"]);
    return freeze({ kind: "model.invoke", requestId, context: context(value.context), maxTokens: number(value.maxTokens, 65_536, false) });
  }
  if (value.kind === "file.read" || value.kind === "memory.read") {
    keys(value, ["kind", "requestId", "resourceId"]);
    return freeze({ kind: value.kind, requestId, resourceId: id(value.resourceId) });
  }
  if (value.kind === "draft.write") {
    keys(value, ["kind", "requestId", "name", "text"]);
    const argumentsValue = argumentsFor("zhiwei_draft_write", { name: value.name, text: value.text });
    return freeze({ kind: "draft.write", requestId, name: argumentsValue.name!, text: argumentsValue.text! });
  }
  return reject("unsupported");
}

/** Pure fixture-profile validation, never evidence of durable Task/Grant authority. */
export function parseSyntheticBrokerSpec(input: unknown): ExecutionSpecV1 {
  const spec = parseExecutionSpecV1(input);
  if (spec.selectedModelProfile.id !== "synthetic-v1" || spec.selectedModelProfile.revision !== 1) reject("unsupported");
  return spec;
}

/** Fixed scripted receiver, not an Agent loop, network provider, user-supplied callback or Agent SDK. */
function syntheticReplyFixture(index: number, scenario: "text" | "tools"): ControlledModelResult {
  if (scenario === "tools") {
    const calls: readonly ControlledModelToolCall[] = [
      { id: "synthetic-file-call", name: "zhiwei_file_read", arguments: { resourceId: "fixture-file" } },
      { id: "synthetic-memory-call", name: "zhiwei_memory_read", arguments: { resourceId: "fixture-memory" } },
      { id: "synthetic-draft-call", name: "zhiwei_draft_write", arguments: { name: "synthetic-draft.txt", text: "Synthetic draft: the sample project uses a blue notebook." } },
    ];
    if (index < calls.length) return freeze({ kind: "model.result", toolCalls: [calls[index]!] });
  }
  return freeze({ kind: "model.result", text: "Synthetic model fixture response." });
}

export async function createSyntheticControlledBroker(
  input: ExecutionSpecV1,
  options: Readonly<{ scenario?: "text" | "tools"; now?: () => number; beforeSyntheticModelReceive?: (record: SyntheticModelRequestRecord) => void }> = {},
): Promise<SyntheticControlledBroker> {
  const spec = parseSyntheticBrokerSpec(input);
  if (Object.keys(options).some(key => key !== "scenario" && key !== "now" && key !== "beforeSyntheticModelReceive")) reject();
  const scenario = options.scenario ?? "text";
  if (scenario !== "text" && scenario !== "tools") reject("unsupported");
  if (options.now !== undefined && typeof options.now !== "function") reject();
  if (options.beforeSyntheticModelReceive !== undefined && typeof options.beforeSyntheticModelReceive !== "function") reject();
  const beforeSyntheticModelReceive = options.beforeSyntheticModelReceive;
  const now = options.now ?? Date.now;
  const startedAt = now();
  if (!Number.isFinite(startedAt)) reject();
  const deadline = Math.min(Date.parse(spec.fence.notAfter), startedAt + spec.bounds.maxDurationMs);
  if (startedAt >= deadline) reject("expired");
  if (scenario === "tools" && spec.toolProfile !== "controlled-read-memory-draft-v1") reject("unsupported");
  // Linux descriptor/no-follow behavior is exercised by ordinary synthetic tests. Windows remains
  // unsupported pending platform-specific file identity and process-isolation evidence.
  if (process.platform !== "linux" || !constants.O_NOFOLLOW) reject("unsupported");
  let root: string | undefined;
  let file: FileHandle | undefined;
  try {
    root = await mkdtemp(join(await realpath(tmpdir()), "zhiwei-controlled-synthetic-"));
    await chmod(root, 0o700);
    const rootIdentity = await lstat(root);
    if (!rootIdentity.isDirectory() || rootIdentity.isSymbolicLink() || await realpath(root) !== root) reject("io_unavailable");
    await mkdir(join(root, "drafts"), { mode: 0o700 });
    const draftDirectoryIdentity = await lstat(join(root, "drafts"));
    const fixturePath = join(root, "fixture.txt");
    const writer = await open(fixturePath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
    try { await writer.writeFile(FILE_TEXT, "utf8"); await writer.sync(); } finally { await writer.close(); }
    file = await open(fixturePath, constants.O_RDONLY | constants.O_NOFOLLOW);
    const fileIdentity = await file.stat();
    if (!fileIdentity.isFile() || fileIdentity.nlink !== 1 || fileIdentity.size !== Buffer.byteLength(FILE_TEXT)) reject("io_unavailable");
    const ownedRoot = root;
    const ownedFile = file;
    const requests: SyntheticModelRequestRecord[] = [];
    const received: SyntheticModelRequestRecord[] = [];
    function receiveSyntheticModel(record: SyntheticModelRequestRecord, reply: ControlledModelResult): ControlledModelResult {
      // This is the complete local receiving boundary. It consumes the exact, already-recorded
      // model-visible projection and cannot reach an SDK, network, credential or host data source.
      received.push(record);
      return reply;
    }
    const drafts: { draftId: string; name: string; bytes: number }[] = [];
    const seen = new Set<string>();
    let toolCalls = 0;
    let reservedTokens = 0;
    let outputBytes = 0;
    let closed = false;
    let cleanup: SyntheticBrokerSnapshot["cleanup"] = "pending";
    let pending: Promise<unknown> = Promise.resolve();
    let queued = 0;
    let disposal: ReturnType<SyntheticControlledBroker["dispose"]> | undefined;
    function admit(): void {
      if (closed) reject("closed");
      const current = now();
      if (!Number.isFinite(current) || current < startedAt || current >= deadline) reject("expired");
    }
    function outputBudget(bytes: number): void {
      if (bytes > MAX_OUTPUT_BYTES || outputBytes + bytes > spec.bounds.maxOutputBytes) reject("budget_exceeded");
      outputBytes += bytes;
    }
    async function perform(request: ControlledBrokerRequest): Promise<ControlledBrokerResponse> {
      admit();
      if (seen.has(request.requestId)) reject("duplicate_request");
      if (seen.size >= MAX_ACTIONS) reject("budget_exceeded");
      seen.add(request.requestId);
      if (request.kind === "model.invoke") {
        if (requests.length >= spec.bounds.maxModelRequests || reservedTokens + request.maxTokens > spec.bounds.maxTokens) reject("budget_exceeded");
        const requestContext = request.context as Record<string, JsonValue>;
        if (spec.toolProfile === "none" && Array.isArray(requestContext.tools) && requestContext.tools.length) reject("unsupported");
        const reply = syntheticReplyFixture(received.length, scenario);
        const declaredTools = Array.isArray(requestContext.tools)
          ? requestContext.tools.map(item => (item as Record<string, JsonValue>).name) : [];
        if (reply.toolCalls?.some(call => !declaredTools.includes(call.name))) reject("unsupported");
        const bytes = Buffer.byteLength(JSON.stringify(reply));
        // A byte ceiling is deliberately conservative for the synthetic receiver; no provider token
        // accounting or monetary price is claimed. Reservations are never reset by retries.
        if (bytes > request.maxTokens) reject("budget_exceeded");
        outputBudget(bytes);
        reservedTokens += request.maxTokens;
        const record = freeze({ requestId: request.requestId, executionUnitId: spec.executionUnitId, workspaceId: spec.workspaceId, modelProfile: spec.selectedModelProfile, fence: spec.fence, maxTokens: request.maxTokens, context: request.context, serializedBytes: Buffer.byteLength(JSON.stringify(request.context)) });
        requests.push(record);
        // Trusted synchronous durable-input commit precedes the receiver. Async return is rejected.
        if (beforeSyntheticModelReceive?.(record) !== undefined) reject();
        const result = receiveSyntheticModel(record, reply);
        return freeze({ requestId: request.requestId, ok: true, result });
      }
      if (spec.fence.owner.kind === "cognitive_job" || spec.toolProfile !== "controlled-read-memory-draft-v1") reject("unsupported");
      if (toolCalls >= spec.bounds.maxToolCalls) reject("budget_exceeded");
      toolCalls += 1;
      if (request.kind === "memory.read") {
        if (request.resourceId !== "fixture-memory") reject("resource_unavailable");
        const result = { kind: "tool.result" as const, text: MEMORY_TEXT };
        outputBudget(Buffer.byteLength(JSON.stringify(result)));
        return freeze({ requestId: request.requestId, ok: true, result });
      }
      if (request.kind === "file.read") {
        if (request.resourceId !== "fixture-file") reject("resource_unavailable");
        const current = await ownedFile.stat();
        if (!current.isFile() || current.nlink !== 1 || current.dev !== fileIdentity.dev || current.ino !== fileIdentity.ino || current.size !== fileIdentity.size) reject("resource_unavailable");
        admit();
        outputBudget(Buffer.byteLength(JSON.stringify({ kind: "tool.result", text: FILE_TEXT })));
        const buffer = Buffer.alloc(current.size);
        const { bytesRead } = await ownedFile.read(buffer, 0, buffer.length, 0);
        if (bytesRead !== current.size || buffer.toString("utf8") !== FILE_TEXT) reject("io_unavailable");
        admit();
        return freeze({ requestId: request.requestId, ok: true, result: { kind: "tool.result", text: buffer.toString("utf8") } });
      }
      const bytes = Buffer.byteLength(request.text);
      // Both stored material and the emitted receipt have a bound, before any write starts.
      const draftId = `draft-${randomUUID()}`;
      const result = { kind: "tool.result" as const, text: "Synthetic draft saved in the isolated fixture directory.", draftId };
      outputBudget(bytes + Buffer.byteLength(JSON.stringify(result)));
      const currentRoot = await lstat(ownedRoot);
      if (!currentRoot.isDirectory() || currentRoot.isSymbolicLink() || currentRoot.dev !== rootIdentity.dev || currentRoot.ino !== rootIdentity.ino || await realpath(ownedRoot) !== ownedRoot) reject("resource_unavailable");
      const draftDirectory = join(ownedRoot, "drafts");
      const currentDraftDirectory = await lstat(draftDirectory);
      if (!currentDraftDirectory.isDirectory() || currentDraftDirectory.isSymbolicLink()
        || currentDraftDirectory.dev !== draftDirectoryIdentity.dev || currentDraftDirectory.ino !== draftDirectoryIdentity.ino
        || await realpath(draftDirectory) !== draftDirectory) reject("resource_unavailable");
      admit();
      // Display name is never a path. Exclusive generated names prevent overwrite/retry effects.
      const draft = await open(join(draftDirectory, `${draftId}.txt`), constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
      try { await draft.writeFile(request.text, "utf8"); await draft.sync(); } finally { await draft.close(); }
      drafts.push({ draftId, name: request.name, bytes });
      admit();
      return freeze({ requestId: request.requestId, ok: true, result });
    }
    const broker: SyntheticControlledBroker = {
      handle(input) {
        let request: ControlledBrokerRequest;
        try { request = parseControlledBrokerRequest(input); }
        catch (error) { return Promise.resolve(freeze({ requestId: "invalid", ok: false, error: { code: error instanceof ControlledBrokerError ? error.code : "invalid_request" } })); }
        if (queued >= MAX_QUEUED) return Promise.resolve(freeze({ requestId: request.requestId, ok: false, error: { code: "budget_exceeded" } }));
        queued += 1;
        const result = pending.then(() => perform(request)).catch((error: unknown): ControlledBrokerResponse => freeze({ requestId: request.requestId, ok: false, error: { code: error instanceof ControlledBrokerError ? error.code : "io_unavailable" } })).finally(() => { queued -= 1; });
        pending = result;
        return result;
      },
      snapshot() { return freeze({ mode: "synthetic-fixtures-only", durableAuthority: "unsupported", state: closed ? "closed" : "open", executionUnitId: spec.executionUnitId, workspaceId: spec.workspaceId, modelRequests: [...requests], receiverRequests: [...received], toolCalls, reservedTokens, drafts: drafts.map(draft => ({ ...draft })), cleanup }); },
      dispose() {
        if (disposal) return disposal;
        closed = true;
        disposal = (async () => {
          await pending;
          try {
            await ownedFile.close();
            const current = await lstat(ownedRoot);
            if (!current.isDirectory() || current.isSymbolicLink() || current.dev !== rootIdentity.dev || current.ino !== rootIdentity.ino || await realpath(ownedRoot) !== ownedRoot) reject("io_unavailable");
            await rm(ownedRoot, { recursive: true, force: false });
            cleanup = "disposed";
          } catch { cleanup = "cleanup_failed"; }
          return Object.freeze({ status: cleanup });
        })();
        return disposal;
      },
    };
    return Object.freeze(broker);
  } catch (error) {
    await file?.close().catch(() => undefined);
    // The newly created root has no caller-selected contents. Cleanup errors are never successful setup.
    if (root) await rm(root, { recursive: true, force: true }).catch(() => undefined);
    if (error instanceof ControlledBrokerError) throw error;
    throw new ControlledBrokerError("io_unavailable");
  }
}
