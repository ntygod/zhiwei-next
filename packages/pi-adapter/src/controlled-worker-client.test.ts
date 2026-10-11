import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { ids } from "../../domain/src/index.ts";
import { parseNormalizedRuntimeEventTraceV1, type NormalizedRuntimeEventV1 } from "../../protocol/src/index.ts";
import { ControlledPiLfReader, ControlledPiWorkerError, createControlledPiWorkerClient, parseControlledPiCommand, parseControlledPiMessage, type ControlledPiWorkerOptions } from "./controlled-worker-client.ts";

const manifest = { name: "@earendil-works/pi-coding-agent", version: "0.84.1", type: "module", bin: { pi: "dist/cli.js" } };
const now = () => "2026-10-10T00:00:00.000Z";
const hello = { type: "hello", protocolVersion: 1, profile: "zhiwei-controlled-synthetic-v1", provider: "zhiwei-controlled", model: "synthetic-v1", tools: [], registeredTools: [], sessionId: "synthetic-upstream-session", capabilities: ["model-broker-v1", "tool-broker-v1", "abort", "progress"] };
const stateData = { sessionId: hello.sessionId, model: { provider: hello.provider, id: hello.model }, thinkingLevel: "off", isStreaming: false, isCompacting: false, messageCount: 0, pendingMessageCount: 0, autoCompactionEnabled: false };
const isCode = (code: string) => (error: unknown) => error instanceof ControlledPiWorkerError && error.code === code;

async function fixture(t: TestContext, scenario = "normal") {
  const root = await mkdtemp(join(tmpdir(), "controlled-worker-ordinary-"));
  const packageDirectory = join(root, "package"), workspaceDirectory = join(root, "workspace"), stateDirectory = join(root, "state");
  await mkdir(join(packageDirectory, "dist"), { recursive: true });
  await mkdir(workspaceDirectory, { mode: 0o700 }); await mkdir(stateDirectory, { mode: 0o700 });
  await writeFile(join(packageDirectory, "package.json"), JSON.stringify(manifest));
  const observation = join(root, "observation.json");
  await writeFile(join(packageDirectory, "dist", "cli.js"), `
import assert from 'node:assert/strict';
import { Socket } from 'node:net';
import { writeFileSync } from 'node:fs';
const scenario = ${JSON.stringify(scenario)};
const fd = new Socket({fd:3, readable:true, writable:true});
const hello = ${JSON.stringify(hello)};
const state = ${JSON.stringify(stateData)};
const args = process.argv.slice(2);
assert.equal(process.env.PATH, undefined);
assert.equal(process.env.SYNTHETIC_SENTINEL, undefined);
assert.equal(process.env.HOME.startsWith(${JSON.stringify(stateDirectory)} + '/controlled-pi-'), true);
assert.equal(args.includes('--approve'), false);
assert.equal(args.includes('--no-tools'), true);
assert.equal(args.includes('--tools'), scenario === 'tools');
if (scenario === 'tools') { hello.tools = ['zhiwei_file_read','zhiwei_memory_read','zhiwei_draft_write']; hello.registeredTools = hello.tools; assert.equal(args[args.indexOf('--tools')+1], hello.tools.join(',')); }
assert.equal(args[args.indexOf('--extension') + 1].endsWith('/src/controlled-broker-extension.ts'), true);
assert.equal(process.cwd(), ${JSON.stringify(workspaceDirectory)});
const requests = [];
let responseSeen = false, ackSent = false;
const save = () => writeFileSync(${JSON.stringify(observation)}, JSON.stringify({requests,args,env:Object.keys(process.env).sort(),responseSeen,ackSent}));
const out = value => process.stdout.write(JSON.stringify(value)+'\\n');
const broker = value => fd.write(JSON.stringify(value)+'\\n');
if (scenario === 'unknown-capability') hello.capabilities.push('unrecognized');
if (scenario !== 'missing-hello') broker(hello);
if (scenario === 'term-resistant') process.on('SIGTERM', () => {});
const normalRun = () => {
out({type:'agent_start'}); out({type:'turn_start'});
if (scenario === 'tools') {
 out({type:'message_start',message:{role:'assistant',content:[]}});
 out({type:'message_end',message:{role:'assistant',content:[{type:'toolCall',id:'actual-tool-call-1',name:'zhiwei_file_read',arguments:{resourceId:'synthetic'}}],stopReason:'toolUse'}});
 out({type:'tool_execution_start',toolCallId:'actual-tool-call-1',toolName:'zhiwei_file_read'});
 out({type:'tool_execution_end',toolCallId:'actual-tool-call-1',toolName:'zhiwei_file_read',isError:false,result:{content:[{type:'text',text:'synthetic result'}]}});
 for (const type of ['message_start','message_end']) out({type,message:{role:'toolResult',toolCallId:'actual-tool-call-1',toolName:'zhiwei_file_read',isError:false,content:[{type:'text',text:'synthetic result'}]}});
 out({type:'turn_end',toolResults:[]}); out({type:'turn_start'});
}

   out({type:'message_start',message:{role:'assistant',content:[]}});
   out({type:'message_update',assistantMessageEvent:{type:'thinking_delta',delta:'SYNTHETIC_RAW_THINKING'}});
   out({type:'message_update',assistantMessageEvent:{type:'text_delta',delta:'hello'}});
   out({type:'message_end',message:{role:'assistant',content:[{type:'thinking',thinking:'SYNTHETIC_RAW_THINKING',thinkingSignature:'SYNTHETIC_RAW_SIGNATURE'},{type:'text',text:'hello'}],stopReason:'stop'}});
   out({type:'turn_end',toolResults:[]});out({type:'agent_end',willRetry:false});out({type:'agent_settled'});
};
let tail = '';
process.stdin.on('data', chunk => {
 tail += chunk.toString('utf8');
 while (tail.includes('\\n')) {
  const index = tail.indexOf('\\n'); const request = JSON.parse(tail.slice(0,index)); tail = tail.slice(index+1); requests.push(request); save();
  if (scenario === 'term-resistant') continue;
  if (request.type === 'get_state') { out({type:'response',id:request.id,command:request.type,success:true,data:state}); if (scenario === 'without-dispatch' && request.id === 'check-1') out({type:'agent_start'}); }
  else if (request.type === 'get_messages') {
   if (scenario === 'delayed-handshake') { setTimeout(() => out({type:'response',id:request.id,command:request.type,success:true,data:{messages:[]}}), 50); continue; }
   out({type:'response',id:request.id,command:request.type,success:true,data:{messages:[]}});
   if (scenario === 'late-duplicate') out({type:'response',id:request.id,command:request.type,success:true,data:{messages:[]}});
  } else if (request.type === 'prompt') {
   out({type:'response',id:request.id,command:request.type,success:true});
   if (scenario === 'duplicate-agent') { out({type:'agent_start'}); out({type:'agent_start'}); continue; }
   if (scenario === 'turn-without-agent') { out({type:'turn_start'}); continue; }
   if (scenario === 'end-with-open-turn') { out({type:'agent_start'}); out({type:'turn_start'}); out({type:'agent_end',willRetry:false}); continue; }
   if (scenario === 'settled-without-end') { out({type:'agent_start'}); out({type:'turn_start'}); out({type:'turn_end',toolResults:[]}); out({type:'agent_settled'}); continue; }
   if (scenario === 'message-end-without-start') { out({type:'agent_start'}); out({type:'turn_start'}); out({type:'message_end',message:{role:'assistant',content:[]}}); continue; }
   if (scenario === 'bad-utf8') { process.stdout.write(Buffer.from([0xff,10])); continue; }
   if (scenario === 'bad-tail') { process.stdout.write('{'); process.exit(0); }
   if (scenario === 'queue-bytes') { out({type:'agent_start'}); out({type:'turn_start'}); out({type:'message_start',message:{role:'assistant',content:[]}}); for(let i=0;i<7;i++) out({type:'message_update',assistantMessageEvent:{type:'text_delta',delta:'x'.repeat(190000)}}); continue; }
   if (scenario === 'queue-limit') { out({type:'agent_start'}); out({type:'turn_start'}); out({type:'message_start',message:{role:'assistant',content:[]}}); for(let i=0;i<300;i++) out({type:'message_update',assistantMessageEvent:{type:'text_delta',delta:'synthetic'}}); continue; }
   if (scenario === 'unexpected-close') { process.exit(0); }
   if (scenario === 'replacement') { broker(hello); continue; }
   if (scenario === 'unknown-event') { out({type:'agent_start'}); out({type:'turn_start'}); out({type:'new_required_event',thinking:'synthetic-private-content'}); continue; }
   if (scenario === 'stderr-limit') { process.stderr.write('x'.repeat(17000)); continue; }
   if (scenario === 'broker' || scenario === 'delayed-broker' || scenario === 'missing-broker-ack') {
    broker({type:'broker_request',id:'model-1',request:{kind:'model.invoke',requestId:'model-1',context:{},maxTokens:16}});
    continue;
   }
   normalRun(); if (scenario === 'duplicate-settled') out({type:'agent_settled'});
  } else if (request.type === 'abort') out({type:'response',id:request.id,command:'abort',success:true});
  else throw new Error('Only the explicit whitelist should reach a child');
 }
});
fd.on('data', chunk => { const response = JSON.parse(chunk.toString('utf8')); assert.equal(response.id,'model-1'); responseSeen = true;
 if (scenario === 'missing-broker-ack') { save(); return; }
 const complete = () => { ackSent = true; broker({type:'broker_response_seen',id:response.id}); save(); normalRun(); };
 if (scenario === 'delayed-broker') setTimeout(complete, 25); else complete();
});
process.stdin.on('end', () => { if (scenario === 'term-resistant') return; if (scenario === 'delayed-broker') { assert.equal(responseSeen,true); assert.equal(ackSent,true); } broker({type:'lifecycle',event:{type:'session_shutdown',reason:'quit',sessionId:hello.sessionId}}); fd.end(); });
`);
  const options: ControlledPiWorkerOptions = {
    packageDirectory, workspaceDirectory, stateDirectory, nodeExecutable: process.execPath, hostEnvironment: { HOME: "/unused", PATH: "/unused", SYNTHETIC_SENTINEL: "synthetic" },
    workspaceId: ids.workspace("synthetic-workspace"), workerInstanceId: "synthetic-worker", toolProfile: "none", maxOutputBytes: 1_048_576, maxDurationMs: 2500,
    now, onBrokerRecord: async request => ({ requestId: (request as { requestId: string }).requestId, ok: true, result: { kind: "model.result", text: "synthetic" } }),
  };
  const clients: ReturnType<typeof createControlledPiWorkerClient>[] = [];
  const client = (overrides: Partial<ControlledPiWorkerOptions> = {}) => { const value = createControlledPiWorkerClient({ ...options, ...overrides }); clients.push(value); return value; };
  t.after(async () => { for (const value of clients) await value.dispose().catch(() => {}); await rm(root, { recursive: true, force: true }); });
  return { root, options, client, observation, packageDirectory, workspaceDirectory, stateDirectory };
}

test("strict byte reader preserves split UTF-8 and Unicode line separators", () => {
  const records: unknown[] = [];
  const reader = new ControlledPiLfReader(value => records.push(value));
  for (const byte of Buffer.from('{"text":"知微\u2028\u2029"}\n')) reader.push(Buffer.from([byte]));
  reader.end(); assert.deepEqual(records, [{ text: "知微\u2028\u2029" }]);
});
for (const [label, bytes] of [["empty", Buffer.from("\n")], ["CRLF", Buffer.from("{}\r\n")], ["bad UTF8", Buffer.from([0xff,10])], ["bad JSON", Buffer.from("{\n")], ["BOM", Buffer.from("\uFEFF{}\n")]] as const) {
  test(`strict byte reader rejects ${label}`, () => assert.throws(() => new ControlledPiLfReader(() => {}).push(bytes), isCode("invalid-jsonl")));
}
test("strict byte reader rejects oversized and unterminated records", () => {
  assert.throws(() => new ControlledPiLfReader(() => {}, 2).push(Buffer.from("123")), isCode("output-limit"));
  const reader = new ControlledPiLfReader(() => {}); reader.push(Buffer.from("{}")); assert.throws(() => reader.end(), isCode("invalid-jsonl"));
});

test("handshake, acceptance, settlement and confirmed close remain separate with independent sequences", async t => {
  const setup = await fixture(t); const client = setup.client();
  const started = await client.start(); assert.equal(started.runtimeSessionId, hello.sessionId); assert.equal(client.state, "READY");
  await assert.rejects(client.start(), isCode("state"));
  const events: NormalizedRuntimeEventV1[] = [];
  const collecting = (async () => { for await (const event of client.events()) { events.push(event); if (event.data.kind === "agent.lifecycle" && event.data.phase === "settled") break; } })();
  const accepted = await client.request({ id: "prompt-1", type: "prompt", message: "ordinary synthetic text" });
  assert.equal(accepted.success, true); await collecting; assert.equal(client.state, "DRAINING");
  const close = await client.dispose(); assert.equal(close.closeObserved, true); assert.equal(close.processDisposition, undefined); assert.equal(close.stdoutEof, true); assert.equal(close.brokerEof, true); assert.equal(close.exitCode, 0); assert.equal(client.state, "STOPPED");
  assert.deepEqual(await readdir(setup.stateDirectory), []);
  assert.ok(events.some(event => event.data.kind === "command.response" && event.data.phase === "preflight-result"));
  const output = events.filter(event => event.sequence.domain === "worker-output-and-process-boundaries");
  const host = events.filter(event => event.sequence.domain === "host-client-actions");
  assert.deepEqual(host.map(event => event.sequence.value), host.map((_, i) => i + 1));
  assert.deepEqual(output.map(event => event.sequence.value), output.map((_, i) => i + 1));
  assert.ok(events.every(event => event.runtimeSessionId === hello.sessionId));
  assert.ok(events.every(event => event.correlation.normalized.agentRunId === undefined && event.correlation.normalized.turnId === undefined && event.correlation.normalized.messageId === undefined));
  const serialized = JSON.stringify(events); assert.equal(serialized.includes("SYNTHETIC_RAW_THINKING"), false); assert.equal(serialized.includes("SYNTHETIC_RAW_SIGNATURE"), false);
  const observation = JSON.parse(await readFile(setup.observation, "utf8")) as { requests: unknown[] };
  assert.equal(observation.requests.length, 3);
});

test("pure command boundary denies arbitrary RPC, extra prompt fields, slash commands and shell shortcuts", () => {
  for (const request of [{ id: "bad", type: "bash", command: "not executed" }, { id: "bad", type: "new_session" }, { id: "bad", type: "prompt", message: "text", images: [] }, { id: "bad", type: "prompt", message: " /extension" }, { id: "bad", type: "prompt", message: "!shortcut" }]) assert.throws(() => parseControlledPiCommand(request), isCode("command-denied"));
  assert.deepEqual(parseControlledPiCommand({ id: "good", type: "prompt", message: "ordinary synthetic text" }), { id: "good", type: "prompt", message: "ordinary synthetic text" });
});

test("dispose allocated client is idempotent and does not claim process close", async t => {
  const setup = await fixture(t), client = setup.client();
  const evidence = await client.dispose(); assert.equal(evidence.closeObserved, false); assert.equal(evidence.stdoutEof, false); assert.equal(evidence.processDisposition, "not_spawned"); assert.equal(client.state, "STOPPED");
  assert.deepEqual(await client.dispose(), evidence); await assert.rejects(client.start(), isCode("state")); assert.deepEqual(await readdir(setup.stateDirectory), []);
});
test("dispose during asynchronous launch preparation prevents later spawn and cleans only its directory", async t => {
  const setup = await fixture(t), client = setup.client();
  const start = client.start(); const rejected = assert.rejects(start, isCode("state"));
  const evidence = await client.dispose(); await rejected;
  assert.equal(evidence.closeObserved, false); assert.equal(evidence.processDisposition, "not_spawned"); assert.equal(client.state, "STOPPED"); assert.deepEqual(await readdir(setup.stateDirectory), []);
  await assert.rejects(readFile(setup.observation, "utf8"), error => (error as NodeJS.ErrnoException).code === "ENOENT");
});

for (const [scenario, expected] of [["unknown-capability", "capability"], ["missing-hello", "timeout"]] as const) {
  test(`startup fails closed for ${scenario} and confirms cleanup`, async t => {
    const setup = await fixture(t, scenario), client = setup.client({ maxDurationMs: 150 });
    await assert.rejects(client.start(), isCode(expected)); assert.equal((await client.dispose()).closeObserved, true); assert.equal(client.state, "FAILED"); assert.deepEqual(await readdir(setup.stateDirectory), []);
  });
}
for (const [scenario, expected] of [["bad-utf8", "invalid-jsonl"], ["bad-tail", "invalid-jsonl"], ["replacement", "session-replacement"], ["unknown-event", "unsupported-event"], ["stderr-limit", "output-limit"], ["unexpected-close", "unexpected-close"]] as const) {
  test(`running worker fails closed for ${scenario}`, async t => {
    const setup = await fixture(t, scenario), client = setup.client(); await client.start();
    const facts: NormalizedRuntimeEventV1[] = [];
    const observed = (async () => { for await (const event of client.events()) facts.push(event); })();
    const rejected = assert.rejects(observed, isCode(expected));
    await client.request({ id: "prompt-1", type: "prompt", message: "ordinary synthetic" }); await rejected;
    assert.equal((await client.dispose()).closeObserved, true); assert.equal(client.state, "FAILED"); assert.deepEqual(await readdir(setup.stateDirectory), []);
    assert.ok(facts.some(event => event.data.kind === "process.boundary" && event.data.boundary === "close"));
  });
}
test("slow consumer gets an explicit bounded queue failure rather than dropped output", async t => {
  const setup = await fixture(t, "queue-limit"), client = setup.client(); await client.start();
  await client.request({ id: "prompt-1", type: "prompt", message: "ordinary synthetic" });
  assert.equal((await client.dispose()).closeObserved, true); assert.equal(client.state, "FAILED");
  await assert.rejects(async () => { for await (const _ of client.events()) { /* Preserve available facts before incomplete. */ } }, isCode("queue-limit"));
});
test("TERM-resistant synthetic child reaches confirmed KILL close within cleanup bounds", async t => {
  const setup = await fixture(t, "term-resistant"), client = setup.client({ maxDurationMs: 150 });
  await assert.rejects(client.start(), isCode("timeout")); const close = await client.dispose(); assert.equal(close.closeObserved, true); assert.equal(close.signal, "SIGKILL"); assert.equal(client.state, "FAILED"); assert.deepEqual(await readdir(setup.stateDirectory), []);
});
test("broker envelope delegates only the validated request and preserves matching reply ID", async t => {
  const setup = await fixture(t, "broker"); const calls: unknown[] = [];
  const client = setup.client({ onBrokerRecord: async request => { calls.push(request); return { requestId: "model-1", ok: true, result: { kind: "model.result", text: "synthetic" } }; } });
  await client.start(); const events = (async () => { for await (const event of client.events()) if (event.data.kind === "agent.lifecycle" && event.data.phase === "settled") break; })();
  await client.request({ id: "prompt-1", type: "prompt", message: "ordinary synthetic" }); await events; await client.dispose(); assert.equal(calls.length, 1);
});
for (const field of ["NODE_OPTIONS", "HTTPS_PROXY", "API_KEY", "PI_EXECUTABLE"] as const) {
  test(`launch refuses explicit unsafe environment ${field}`, async t => {
    const setup = await fixture(t), client = setup.client({ hostEnvironment: { [field]: "SYNTHETIC_ONLY" } }); await assert.rejects(client.start(), isCode("environment"));
  });
}
test("version drift and prepopulated or writable directories fail before spawn", async t => {
  const setup = await fixture(t);
  await writeFile(join(setup.packageDirectory, "package.json"), JSON.stringify({ ...manifest, version: "0.84.2" })); await assert.rejects(setup.client().start(), isCode("package"));
  await writeFile(join(setup.packageDirectory, "package.json"), JSON.stringify(manifest)); await writeFile(join(setup.workspaceDirectory, "ordinary.txt"), "synthetic"); await assert.rejects(setup.client().start(), isCode("directories"));
  await rm(join(setup.workspaceDirectory, "ordinary.txt")); await chmod(setup.workspaceDirectory, 0o777); await assert.rejects(setup.client().start(), isCode("directories"));
});


test("controlled tool lifecycle preserves observed IDs, declaration links, result links, and exact allowlist", async t => {
  const setup = await fixture(t, "tools"), client = setup.client({ toolProfile: "controlled-read-memory-draft-v1" }); await client.start();
  const events: NormalizedRuntimeEventV1[] = [];
  const collecting = (async () => { for await (const event of client.events()) { events.push(event); if (event.data.kind === "agent.lifecycle" && event.data.phase === "settled") break; } })();
  await client.request({ id: "prompt-tools", type: "prompt", message: "ordinary synthetic tools" }); await collecting; await client.dispose();
  const tools = events.filter(event => event.data.kind === "tool.lifecycle");
  assert.deepEqual(tools.map(event => event.data.kind === "tool.lifecycle" && event.data.phase), ["declared", "started", "completed"]);
  assert.ok(tools.every(event => event.correlation.normalized.toolCallId === "actual-tool-call-1"));
  assert.deepEqual(tools[1].links?.sourceEventIds, [tools[0].eventId]); assert.deepEqual(tools[2].links?.sourceEventIds, [tools[0].eventId]);
  for (const event of events.filter(event => event.data.kind === "message.lifecycle" && event.data.role === "tool")) assert.deepEqual(event.links?.sourceEventIds, [tools[2].eventId]);
  assert.equal(parseNormalizedRuntimeEventTraceV1(events).length, events.length);
});


test("duplicate response fails even if startup completed before its separate output chunk arrived", async t => {
  const setup = await fixture(t, "late-duplicate"), client = setup.client();
  try { await client.start(); } catch (error: unknown) { assert.ok(isCode("correlation")(error)); }
  await assert.rejects(async () => { for await (const _ of client.events()) { /* Drain observations. */ } }, isCode("correlation"));
  assert.equal((await client.dispose()).closeObserved, true); assert.equal(client.state, "FAILED");
});
test("one MiB event byte bound is independent of record count and raw output bound", async t => {
  const setup = await fixture(t, "queue-bytes"), client = setup.client({ maxOutputBytes: 4_194_304 }); await client.start();
  await client.request({ id: "prompt-1", type: "prompt", message: "ordinary synthetic" });
  assert.equal((await client.dispose()).closeObserved, true); assert.equal(client.state, "FAILED");
  await assert.rejects(async () => { for await (const _ of client.events()) { /* Explicit incomplete after available facts. */ } }, isCode("queue-limit"));
});
test("total output bound applies to broker handshake before any prompt", async t => {
  const setup = await fixture(t), client = setup.client({ maxOutputBytes: 128 });
  await assert.rejects(client.start(), isCode("output-limit")); assert.equal((await client.dispose()).closeObserved, true); assert.deepEqual(await readdir(setup.stateDirectory), []);
});


test("abort closes admission synchronously while its receipt remains distinct from process close", async t => {
  const setup = await fixture(t), client = setup.client(); await client.start();
  const receipt = client.request({ id: "abort-1", type: "abort" });
  assert.equal(client.state, "DRAINING");
  await assert.rejects(client.request({ id: "prompt-after-abort", type: "prompt", message: "ordinary synthetic" }), isCode("state"));
  assert.deepEqual(await receipt, { id: "abort-1", command: "abort", success: true });
  assert.equal(client.state, "DRAINING"); assert.equal((await client.dispose()).closeObserved, true);
  const observed = JSON.parse(await readFile(setup.observation, "utf8")) as { requests: { type: string }[] };
  assert.deepEqual(observed.requests.map(request => request.type), ["get_state", "get_messages", "abort"]);
});


for (const type of ["image", "audio", "future-content"]) {
  test(`pure message projection rejects unsupported ${type} content`, () => {
    assert.throws(() => parseControlledPiMessage({ role: "assistant", content: [{ type }] }), isCode("unsupported-event"));
  });
}
test("pure message projection validates known blocks and omits only known signatures and thinking", () => {
  assert.deepEqual(parseControlledPiMessage({ role: "assistant", content: [{ type: "thinking", thinking: "synthetic thought", thinkingSignature: "synthetic signature", redacted: false }, { type: "text", text: "synthetic answer", textSignature: "synthetic text signature" }] }), { role: "assistant", contentKinds: ["thinking", "text"], text: "synthetic answer" });
  for (const block of [{ type: "text", text: 1 }, { type: "text", text: "synthetic", future: true }, { type: "thinking", thinking: 1 }, { type: "toolCall", id: "observed", name: "zhiwei_file_read", arguments: [] }]) assert.throws(() => parseControlledPiMessage({ role: "assistant", content: [block] }), isCode("invalid-response"));
  assert.deepEqual(parseControlledPiMessage({ role: "assistant", content: [{ type: "toolCall", id: "observed", name: "zhiwei_file_read", arguments: { resourceId: "synthetic" }, thoughtSignature: "omitted" }] }), { role: "assistant", contentKinds: ["toolCall"] });
});
for (const scenario of ["duplicate-agent", "turn-without-agent", "end-with-open-turn", "settled-without-end", "message-end-without-start", "duplicate-settled"]) {
  test(`lifecycle rejects ${scenario} without inventing missing source boundaries`, async t => {
    const setup = await fixture(t, scenario), client = setup.client(); await client.start();
    const observed = (async () => { for await (const _ of client.events()) { /* Drain before explicit incomplete. */ } })();
    const rejected = assert.rejects(observed, isCode("invalid-response"));
    await client.request({ id: "prompt-1", type: "prompt", message: "ordinary synthetic" }); await rejected;
    assert.equal((await client.dispose()).closeObserved, true); assert.equal(client.state, "FAILED");
  });
}
test("runtime lifecycle requires an actually dispatched and accepted prompt", async t => {
  const setup = await fixture(t, "without-dispatch"), client = setup.client(); await client.start();
  const observed = (async () => { for await (const _ of client.events()) { /* Drain before explicit incomplete. */ } })();
  const rejected = assert.rejects(observed, isCode("invalid-response"));
  await client.request({ id: "check-1", type: "get_state" }); await rejected;
  assert.equal((await client.dispose()).closeObserved, true); assert.equal(client.state, "FAILED");
});
test("abort and dispose drain an admitted delayed broker reply and its fd3 acknowledgement before stdin EOF", async t => {
  const setup = await fixture(t, "delayed-broker");
  let admittedResolve: (() => void) | undefined, replyResolve: ((value: unknown) => void) | undefined;
  const admitted = new Promise<void>(resolve => { admittedResolve = resolve; });
  const reply = new Promise<unknown>(resolve => { replyResolve = resolve; });
  const client = setup.client({ onBrokerRecord: async () => { admittedResolve?.(); return reply; } });
  await client.start(); await client.request({ id: "prompt-1", type: "prompt", message: "ordinary synthetic" }); await admitted;
  await client.request({ id: "abort-1", type: "abort" });
  const closing = client.dispose(); assert.equal(client.state, "DRAINING");
  replyResolve?.({ requestId: "model-1", ok: true, result: { kind: "model.result", text: "synthetic" } });
  const close = await closing; assert.equal(close.closeObserved, true); assert.equal(close.exitCode, 0); assert.equal(client.state, "STOPPED");
  const observation = JSON.parse(await readFile(setup.observation, "utf8")) as { responseSeen: boolean; ackSent: boolean };
  assert.equal(observation.responseSeen, true); assert.equal(observation.ackSent, true);
});
test("missing broker response acknowledgement is bounded and never guessed from a successful write", async t => {
  const setup = await fixture(t, "missing-broker-ack");
  let resolveAdmitted: (() => void) | undefined;
  const admitted = new Promise<void>(resolve => { resolveAdmitted = resolve; });
  const client = setup.client({ maxDurationMs: 150, onBrokerRecord: async () => { resolveAdmitted?.(); return { requestId: "model-1", ok: true, result: { kind: "model.result", text: "synthetic" } }; } });
  await client.start(); await client.request({ id: "prompt-1", type: "prompt", message: "ordinary synthetic" }); await admitted;
  const close = await client.dispose(); assert.equal(close.closeObserved, true); assert.equal(client.state, "FAILED");
  await assert.rejects(async () => { for await (const _ of client.events()) { /* Drain before timeout. */ } }, isCode("timeout"));
});


test("dispose after hello cannot publish READY from delayed handshake responses", async t => {
  const setup = await fixture(t, "delayed-handshake"), observedStates: string[] = [];
  let client: ReturnType<typeof createControlledPiWorkerClient> | undefined;
  client = setup.client({ now: () => { if (client) observedStates.push(client.state); return now(); } });
  const rejected = assert.rejects(client.start(), isCode("state"));
  const deadline = Date.now() + 1000;
  for (;;) {
    const requests = await readFile(setup.observation, "utf8").then(text => (JSON.parse(text) as { requests: { type: string }[] }).requests).catch(() => []);
    if (requests.some(request => request.type === "get_messages")) break;
    assert.ok(Date.now() < deadline, "ordinary synthetic handshake became observable"); await delay(2);
  }
  const close = await client.dispose(); await rejected;
  assert.equal(close.closeObserved, true); assert.equal(close.exitCode, 0); assert.equal(client.state, "STOPPED"); assert.equal(observedStates.includes("READY"), false);
});

test("Ordinary missing package failure proves not-spawned only after closing launch admission", async t => {
  const setup = await fixture(t), client = setup.client({ packageDirectory: join(setup.stateDirectory, "missing-synthetic-package") });
  await assert.rejects(client.start(), isCode("package"));
  const evidence = await client.dispose(); assert.equal(evidence.processDisposition, "not_spawned");
  assert.equal(evidence.closeObserved, false); assert.equal(evidence.stdoutEof, false); assert.equal(evidence.stderrEof, false); assert.equal(evidence.exitCode, null); assert.equal(evidence.signal, null);
  assert.deepEqual(await client.dispose(), evidence); await assert.rejects(client.start(), isCode("state"));
  await assert.rejects(readFile(setup.observation, "utf8"), error => (error as NodeJS.ErrnoException).code === "ENOENT");
});
