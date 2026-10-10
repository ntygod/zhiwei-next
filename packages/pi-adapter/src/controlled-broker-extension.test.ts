import assert from "node:assert/strict";
import test from "node:test";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { Duplex } from "node:stream";
import { installControlledBrokerExtension, controlledExtensionEvidenceRevision } from "./controlled-broker-extension.ts";

type RecordValue = Record<string, unknown>;
function obj(input: unknown): RecordValue { assert.ok(input && typeof input === "object" && !Array.isArray(input)); return input as RecordValue; }
function invoke(input: unknown, name: string, ...args: unknown[]): unknown {
  const value = Reflect.get(obj(input), name) as unknown; assert.equal(typeof value, "function");
  return Reflect.apply(value as (...args: unknown[]) => unknown, input, args) as unknown;
}
async function collected(input: unknown): Promise<RecordValue[]> {
  assert.ok(input && typeof input === "object" && Symbol.asyncIterator in input);
  const results: RecordValue[] = [];
  for await (const value of input as AsyncIterable<unknown>) results.push(obj(value));
  return results;
}
function fixture(options: { none?: boolean; activeEmpty?: boolean; reply?: (request: RecordValue) => unknown; fragmented?: boolean } = {}) {
  const registrations: RecordValue[] = [], sent: RecordValue[] = [], callbacks = new Map<string, unknown>();
  let provider: unknown;
  const channel = new Duplex({ read() {}, write(chunk: Buffer, _encoding, done) {
    const record = obj(JSON.parse(chunk.toString("utf8")) as unknown); sent.push(record); done();
    if (record.type === "broker_request" && options.reply) {
      const result = options.reply(obj(record.request));
      if (result !== undefined) queueMicrotask(() => {
        const bytes = Buffer.from(`${JSON.stringify({ type: "broker_response", id: record.id, response: result })}\n`);
        if (options.fragmented) for (const byte of bytes) channel.push(Buffer.from([byte]));
        else channel.push(bytes);
      });
    }
  } });
  const api = {
    registerProvider(value: unknown) { provider = value; },
    registerTool(value: unknown) { registrations.push(obj(value)); },
    on(name: string, fn: unknown) { callbacks.set(name, fn); },
    getAllTools() { return options.none ? [] : registrations.map(tool => ({ name: tool.name, description: tool.description, parameters: tool.parameters })); },
    getActiveTools() { return options.none || options.activeEmpty ? [] : registrations.map(tool => tool.name); },
  };
  installControlledBrokerExtension(api, channel, () => 1234);
  const model = (invoke(provider, "getModels") as unknown[])[0];
  // Model/session members are guarded accessors in upstream ExtensionRunner.
  const context = { get model() { return model; }, get sessionManager() { return { getSessionId: () => "native-session-1" }; }, get mode() { return "rpc"; }, get thinkingLevel() { return "off"; }, isIdle: () => true };
  const lifecycle = (type: string, extra: RecordValue = {}) => {
    const callback = callbacks.get(type); assert.equal(typeof callback, "function");
    return Reflect.apply(callback as (...args: unknown[]) => unknown, undefined, [{ type, ...extra }, context]) as unknown;
  };
  const payload = () => ({ systemPrompt: "Synthetic system instructions.", messages: [{ role: "user", content: [{ type: "text", text: "Synthetic request." }], timestamp: 1000 }], tools: options.none ? [] : registrations.map(tool => ({ name: tool.name, label: tool.label, description: tool.description, parameters: tool.parameters, execute: tool.execute, executionMode: "sequential", prepareArguments: undefined, constrainedSampling: undefined })) });
  return { api, channel, sent, provider, model, context, callbacks, registrations, lifecycle, payload, ready: () => lifecycle("session_start", { reason: "startup" }), shutdown: () => lifecycle("session_shutdown", { reason: "quit" }) };
}
function ok(request: RecordValue, result: unknown): unknown { return { requestId: request.requestId, ok: true, result }; }

test("native provider registration and actual capability handshake use only the fixed runtime boundary", async t => {
  const f = fixture(); t.after(() => f.channel.destroy()); await f.ready();
  assert.equal(controlledExtensionEvidenceRevision, "pi-0.84.1-native-broker-source-v1");
  assert.equal(obj(f.provider).stream, obj(f.provider).streamSimple);
  assert.equal(obj(f.provider).fetchDeferred, undefined);
  assert.deepEqual(await invoke(obj(obj(f.provider).auth).apiKey, "resolve"), { auth: {} });
  assert.deepEqual(f.sent[0], { type: "hello", protocolVersion: 1, profile: "zhiwei-controlled-synthetic-v1", provider: "zhiwei-controlled", model: "synthetic-v1", tools: ["zhiwei_file_read", "zhiwei_memory_read", "zhiwei_draft_write"], registeredTools: ["zhiwei_file_read", "zhiwei_memory_read", "zhiwei_draft_write"], sessionId: "native-session-1", capabilities: ["model-broker-v1", "tool-broker-v1", "abort", "progress"] });
  await f.shutdown();
  assert.deepEqual(f.sent[1], { type: "lifecycle", event: { type: "session_shutdown", reason: "quit", sessionId: "native-session-1" } });
});

for (const surface of ["stream", "streamSimple"]) test(`${surface} performs one actual fd3 protocol round trip, including provider hooks`, async t => {
  const order: string[] = [];
  const f = fixture({ fragmented: true, reply: request => { order.push("receiver"); return ok(request, { kind: "model.result", text: "Synthetic response: 雪." }); } });
  t.after(() => f.channel.destroy()); await f.ready();
  const events = await collected(invoke(f.provider, surface, f.model, f.payload(), {
    onPayload(payload: unknown) { order.push("payload"); return { ...obj(payload), systemPrompt: "Synthetic replacement." }; },
    onResponse(response: unknown) { order.push("response"); assert.deepEqual(response, { status: 200, headers: {} }); },
  }));
  assert.deepEqual(order, ["payload", "receiver", "response"]);
  assert.deepEqual(events.map(event => event.type), ["start", "done"]);
  const request = obj(f.sent.find(record => record.type === "broker_request")!.request);
  assert.equal(request.kind, "model.invoke"); assert.equal(request.maxTokens, 512);
  assert.equal(obj(request.context).systemPrompt, "Synthetic replacement.");
  const tools = obj(request.context).tools as RecordValue[];
  assert.equal(tools.length, 3); assert.equal(tools[0]!.execute, undefined);
  assert.deepEqual(obj(events[1]!.message).content, [{ type: "text", text: "Synthetic response: 雪." }]);
  assert.equal(f.sent.filter(record => record.type === "broker_request").length, 1);
  await f.shutdown();
});

test("tool calls are returned to the upstream loop; each registered tool separately delegates once", async t => {
  const f = fixture({ reply: request => request.kind === "model.invoke"
    ? ok(request, { kind: "model.result", toolCalls: [{ id: "actual-call-1", name: "zhiwei_file_read", arguments: { resourceId: "fixture-file" } }] })
    : ok(request, { kind: "tool.result", text: "Synthetic tool result." }) });
  t.after(() => f.channel.destroy()); await f.ready();
  const events = await collected(invoke(f.provider, "streamSimple", f.model, f.payload()));
  assert.equal(events[1]!.reason, "toolUse");
  assert.equal(f.sent.filter(record => record.type === "broker_request").length, 1);
  const results = [];
  for (const definition of f.registrations) {
    const args = definition.name === "zhiwei_draft_write" ? { name: "synthetic-draft.txt", text: "Synthetic draft." } : { resourceId: definition.name === "zhiwei_file_read" ? "fixture-file" : "fixture-memory" };
    results.push(await invoke(definition, "execute", "actual-call-1", args, undefined, undefined, f.context));
  }
  assert.deepEqual(results, Array.from({ length: 3 }, () => ({ content: [{ type: "text", text: "Synthetic tool result." }] })));
  assert.deepEqual(f.sent.filter(record => record.type === "broker_request").map(record => obj(record.request).kind), ["model.invoke", "file.read", "memory.read", "draft.write"]);
  await f.shutdown();
});

test("toolProfile none is observed as empty registry and advertised model context", async t => {
  const f = fixture({ none: true, reply: request => ok(request, { kind: "model.result", text: "Synthetic no-tool response." }) });
  t.after(() => f.channel.destroy()); await f.ready();
  assert.deepEqual(f.sent[0]!.tools, []); assert.deepEqual(f.sent[0]!.registeredTools, []);
  const events = await collected(invoke(f.provider, "streamSimple", f.model, f.payload()));
  assert.equal(events[1]!.type, "done");
  assert.deepEqual(obj(obj(f.sent[1]!.request).context).tools, []);
  await assert.rejects(async () => invoke(f.registrations[0], "execute", "call-1", { resourceId: "fixture-file" }, undefined, undefined, f.context), /Controlled Pi extension unavailable/);
  await f.shutdown();
});

for (const outcome of ["denial", "missing-terminal-data", "unknown-result-kind", "invalid-tool-call"]) test(`one bounded failure terminal for ${outcome}`, async t => {
  const f = fixture({ reply: request => outcome === "denial" ? { requestId: request.requestId, ok: false, error: { code: "budget_exceeded" } }
    : ok(request, outcome === "missing-terminal-data" ? { kind: "model.result" } : outcome === "unknown-result-kind" ? { kind: "unknown" } : { kind: "model.result", toolCalls: [{ id: "call-1", name: "unavailable", arguments: {} }] }) });
  t.after(() => f.channel.destroy()); await f.ready();
  const events = await collected(invoke(f.provider, "streamSimple", f.model, f.payload()));
  assert.deepEqual(events.map(event => event.type), ["start", "error"]);
  assert.equal(obj(events[1]!.error).errorMessage, "Controlled Pi request unavailable.");
  await f.shutdown();
});

test("model identity mismatch and pre-aborted calls do not produce Broker requests", async t => {
  const f = fixture(); t.after(() => f.channel.destroy()); await f.ready();
  const wrong = await collected(invoke(f.provider, "streamSimple", { ...obj(f.model), id: "unknown-model" }, f.payload()));
  assert.deepEqual(wrong.map(value => value.type), ["error"]);
  const events = await collected(invoke(f.provider, "stream", f.model, f.payload(), { signal: AbortSignal.abort() }));
  assert.deepEqual(events.map(value => value.type), ["error"]); assert.equal(events[0]!.reason, "aborted");
  assert.equal(f.sent.length, 1); await f.shutdown();
});

test("abort yields one terminal and consumes the one already-in-flight reply without reissuing", async t => {
  const f = fixture(); t.after(() => f.channel.destroy()); await f.ready();
  const controller = new AbortController();
  const result = collected(invoke(f.provider, "stream", f.model, f.payload(), { signal: controller.signal }));
  while (f.sent.length < 2) await new Promise<void>(resolve => setImmediate(resolve));
  const request = obj(f.sent[1]!.request); controller.abort();
  const events = await result; assert.deepEqual(events.map(event => event.type), ["start", "error"]); assert.equal(events[1]!.reason, "aborted");
  f.channel.push(Buffer.from(`${JSON.stringify({ type: "broker_response", id: request.requestId, response: ok(request, { kind: "model.result", text: "Synthetic completed response." }) })}\n`));
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(f.sent.filter(record => record.type === "broker_request").length, 1);
  assert.deepEqual(f.sent.filter(record => record.type === "broker_response_seen"), [{ type: "broker_response_seen", id: request.requestId }]); await f.shutdown();
});

test("ordinary malformed fd3 reply closes the binding with a fixed failure terminal", async t => {
  const f = fixture(); t.after(() => f.channel.destroy()); await f.ready();
  const result = collected(invoke(f.provider, "stream", f.model, f.payload()));
  while (f.sent.length < 2) await new Promise<void>(resolve => setImmediate(resolve));
  f.channel.push(Buffer.from("{}\n"));
  const events = await result; assert.equal(events.at(-1)!.type, "error"); assert.equal(f.channel.destroyed, true);
});

test("startup rejects mismatched runtime tool lists before hello", async t => {
  const f = fixture({ activeEmpty: true }); t.after(() => f.channel.destroy());
  await assert.rejects(async () => f.ready(), /Controlled Pi extension unavailable/);
  assert.equal(f.sent.length, 0); assert.equal(f.channel.destroyed, true);
});

test("compaction and shell callback results remain explicitly unsupported", async t => {
  const f = fixture(); t.after(() => f.channel.destroy()); await f.ready();
  assert.deepEqual(await f.lifecycle("session_before_compact"), { cancel: true });
  assert.deepEqual(await f.lifecycle("user_bash"), { result: { output: "Controlled Pi shell unavailable.", exitCode: 1, cancelled: false, truncated: false } });
  assert.equal(f.sent.length, 1); await f.shutdown();
});


test("fixed extension default uses a real inherited fd3 duplex pipe with a synthetic API child", async t => {
  // This child imports only our extension and a fake API; it never imports or executes Pi.
  const source = `
    import assert from "node:assert/strict";
    import extension from ${JSON.stringify(new URL("./controlled-broker-extension.ts", import.meta.url).href)};
    let provider; const callbacks = new Map(); const tools = [];
    extension({ registerProvider(value) { provider = value; }, registerTool(value) { tools.push(value); },
      on(name, callback) { callbacks.set(name, callback); }, getAllTools() { return tools; },
      getActiveTools() { return tools.map(tool => tool.name); } });
    const model = provider.getModels()[0];
    const context = { model, sessionManager: { getSessionId: () => "synthetic-child-session" }, mode: "rpc", thinkingLevel: "off", isIdle: () => true };
    await callbacks.get("session_start")({type:"session_start",reason:"startup"},context);
    const payload = { systemPrompt:"Synthetic child system",messages:[{role:"user",content:"Synthetic child request",timestamp:1}],
      tools:tools.map(tool=>({name:tool.name,description:tool.description,parameters:tool.parameters})) };
    const events = [];
    for await (const event of provider.streamSimple(model,payload)) events.push(event);
    assert.deepEqual(events.map(event=>event.type),["start","done"]);
    assert.equal(events[1].message.content[0].text,"Synthetic fd3 response.");
    const result = await tools[0].execute("child-tool-1",{resourceId:"fixture-file"},undefined,undefined,context);
    assert.deepEqual(result,{content:[{type:"text",text:"Synthetic fd3 tool response."}]});
    await callbacks.get("session_shutdown")({type:"session_shutdown",reason:"quit"},context);
  `;
  const child = spawn(process.execPath, ["--experimental-strip-types", "--input-type=module", "--eval", source], { env: {}, stdio: ["ignore", "pipe", "pipe", "pipe"] });
  t.after(() => { if (child.exitCode === null) child.kill("SIGKILL"); });
  const pipe = child.stdio[3]; assert.ok(pipe instanceof Duplex);
  let stderr = "", stdout = "", tail = "";
  child.stderr!.setEncoding("utf8"); child.stderr!.on("data", (chunk: string) => { stderr += chunk; });
  child.stdout!.setEncoding("utf8"); child.stdout!.on("data", (chunk: string) => { stdout += chunk; });
  const records: RecordValue[] = [];
  pipe.setEncoding("utf8");
  pipe.on("data", (chunk: string) => {
    tail += chunk;
    while (tail.includes("\n")) {
      const index = tail.indexOf("\n"), record = obj(JSON.parse(tail.slice(0, index)) as unknown); tail = tail.slice(index + 1); records.push(record);
      if (record.type === "broker_request") {
        const request = obj(record.request);
        const result = request.kind === "model.invoke" ? { kind: "model.result", text: "Synthetic fd3 response." } : { kind: "tool.result", text: "Synthetic fd3 tool response." };
        pipe.write(`${JSON.stringify({ type: "broker_response", id: record.id, response: ok(request, result) })}\n`);
      }
    }
  });
  const timeout = setTimeout(() => child.kill("SIGKILL"), 5000); t.after(() => clearTimeout(timeout));
  const [code, signal] = await once(child, "close");
  assert.equal(code, 0, stderr); assert.equal(signal, null); assert.equal(stdout, ""); assert.equal(tail, "");
  assert.deepEqual(records.map(record => record.type), ["hello", "broker_request", "broker_response_seen", "broker_request", "broker_response_seen", "lifecycle"]);
  assert.equal(records[0]!.sessionId, "synthetic-child-session");
  assert.equal(records[2]!.id, records[1]!.id); assert.equal(records[4]!.id, records[3]!.id);
});


test("source-faithful successful tool result own undefined details and usage permit the next model request", async t => {
  let calls = 0;
  const f = fixture({ reply: request => request.kind === "model.invoke"
    ? ok(request, ++calls === 1 ? { kind: "model.result", toolCalls: [{ id: "source-tool-1", name: "zhiwei_file_read", arguments: { resourceId: "fixture-file" } }] } : { kind: "model.result", text: "Synthetic second model response." })
    : ok(request, { kind: "tool.result", text: "Synthetic file content." }) });
  t.after(() => f.channel.destroy()); await f.ready();
  const first = await collected(invoke(f.provider, "streamSimple", f.model, f.payload()));
  const result = obj(await invoke(f.registrations[0], "execute", "source-tool-1", { resourceId: "fixture-file" }, undefined, undefined, f.context));
  // Official pi-agent-core agent-loop.js createToolResultMessage preserves both own keys.
  const toolResult = { role: "toolResult", toolCallId: "source-tool-1", toolName: "zhiwei_file_read", content: result.content, details: result.details, usage: result.usage, isError: false, timestamp: 1234 };
  assert.equal(Object.hasOwn(toolResult, "details"), true); assert.equal(Object.hasOwn(toolResult, "usage"), true);
  const nextContext = { ...f.payload(), messages: [...f.payload().messages, first.at(-1)!.message, toolResult] };
  const second = await collected(invoke(f.provider, "streamSimple", f.model, nextContext));
  assert.deepEqual(second.map(event => event.type), ["start", "done"]);
  const requests = f.sent.filter(record => record.type === "broker_request").map(record => obj(record.request));
  assert.deepEqual(requests.map(request => request.kind), ["model.invoke", "file.read", "model.invoke"]);
  const messages = obj(requests.at(-1)!.context).messages as RecordValue[];
  const last = obj(messages.at(-1));
  assert.equal(last.role, "toolResult");
  assert.equal(Object.hasOwn(last, "details"), false); assert.equal(Object.hasOwn(last, "usage"), false);
  await f.shutdown();
});

test("defined tool usage remains unsupported rather than silently discarded", async t => {
  const f = fixture(); t.after(() => f.channel.destroy()); await f.ready();
  const toolResult = { role: "toolResult", toolCallId: "source-tool-1", toolName: "zhiwei_file_read", content: [{ type: "text", text: "Synthetic result." }], details: undefined, usage: { input: 1 }, isError: false, timestamp: 1234 };
  const context = { ...f.payload(), messages: [...f.payload().messages, toolResult] };
  const events = await collected(invoke(f.provider, "streamSimple", f.model, context));
  assert.deepEqual(events.map(event => event.type), ["error"]); assert.equal(f.sent.length, 1);
  await f.shutdown();
});


for (const details of [{}, { synthetic: true }]) test(`known tool-result metadata ${JSON.stringify(details)} is validated and projected out`, async t => {
  const f = fixture({ reply: request => ok(request, { kind: "model.result", text: "Synthetic response after tool result." }) });
  t.after(() => f.channel.destroy()); await f.ready();
  const toolResult = { role: "toolResult", toolCallId: "source-tool-1", toolName: "zhiwei_file_read", content: [{ type: "text", text: "Controlled Pi extension unavailable." }], details, usage: undefined, isError: true, timestamp: 1234 };
  const context = { ...f.payload(), messages: [...f.payload().messages, toolResult] };
  const events = await collected(invoke(f.provider, "streamSimple", f.model, context));
  assert.deepEqual(events.map(event => event.type), ["start", "done"]);
  const projected = (obj(obj(f.sent[1]!.request).context).messages as RecordValue[]).at(-1)!;
  assert.equal(projected.isError, true); assert.equal(Object.hasOwn(projected, "details"), false); assert.equal(Object.hasOwn(projected, "usage"), false);
  await f.shutdown();
});

test("unknown nonempty tool-result details remain unsupported", async t => {
  const f = fixture(); t.after(() => f.channel.destroy()); await f.ready();
  const toolResult = { role: "toolResult", toolCallId: "source-tool-1", toolName: "zhiwei_file_read", content: [{ type: "text", text: "Synthetic result." }], details: { unknown: true }, usage: undefined, isError: true, timestamp: 1234 };
  const events = await collected(invoke(f.provider, "streamSimple", f.model, { ...f.payload(), messages: [...f.payload().messages, toolResult] }));
  assert.deepEqual(events.map(event => event.type), ["error"]); assert.equal(f.sent.length, 1); await f.shutdown();
});
