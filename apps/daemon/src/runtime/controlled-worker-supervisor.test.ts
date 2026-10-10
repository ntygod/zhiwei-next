import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { createSyntheticControlledWorkerSupervisor, SyntheticSupervisorError, type SyntheticTaskRuntimeIdentity } from "./controlled-worker-supervisor.ts";
import type { NormalizedRuntimeEnvelopeV1 } from "../../../../packages/protocol/src/index.ts";

async function fixture(t: TestContext, scenario: "text" | "tools" = "text", taskIdentity?: SyntheticTaskRuntimeIdentity) {
  const root = await mkdtemp(join(tmpdir(), "zhiwei-supervisor-ordinary-test-"));
  await mkdir(join(root, "dist"));
  await writeFile(join(root, "package.json"), JSON.stringify({ name: "@earendil-works/pi-coding-agent", version: "0.84.1", type: "module", bin: { pi: "dist/cli.js" } }));
  // Deliberately a synthetic protocol peer, NOT a copy of Pi or official Runtime evidence.
  await writeFile(join(root, "dist", "cli.js"), `
import { pathToFileURL } from 'node:url';
const args=process.argv.slice(2),index=args.indexOf('--tools');
const active=index<0?[]:args[index+1].split(',');
const hooks=new Map(),registered=[];let provider;
const api={
 registerProvider:value=>{provider=value;},registerTool:value=>registered.push(value),
 on:(name,fn)=>hooks.set(name,fn),getAllTools:()=>registered.filter(tool=>active.includes(tool.name)),getActiveTools:()=>active,
};
const extension=(await import(pathToFileURL(args[args.indexOf('--extension')+1]).href)).default;
extension(api);
const model=provider.getModels()[0];
const sessionId='upstream-supervisor-synthetic-session';
const ctx={model,mode:'rpc',thinkingLevel:'off',isIdle:()=>true,sessionManager:{getSessionId:()=>sessionId}};
await hooks.get('session_start')({type:'session_start',reason:'startup'},ctx);
const send=value=>process.stdout.write(JSON.stringify(value)+'\\n');
async function handle(r){
 if(r.type==='get_state')send({type:'response',id:r.id,command:r.type,success:true,data:{sessionId,model,thinkingLevel:'off',autoCompactionEnabled:false,isStreaming:false,isCompacting:false,messageCount:0,pendingMessageCount:0}});
 else if(r.type==='get_messages')send({type:'response',id:r.id,command:r.type,success:true,data:{messages:[]}});
 else if(r.type==='abort')send({type:'response',id:r.id,command:r.type,success:true});
 else if(r.type==='prompt'){
  send({type:'response',id:r.id,command:r.type,success:true});send({type:'agent_start'});
  const tools=registered.filter(tool=>active.includes(tool.name));
  const context={systemPrompt:'Synthetic system prompt.',messages:[{role:'user',content:r.message,timestamp:0}],tools:tools.map(({name,description,parameters})=>({name,description,parameters}))};
  async function scriptedTurn(expectedTool){
   send({type:'turn_start'});let final;
   for await(const event of provider.streamSimple(model,context,{})){
    if(event.type==='start')send({type:'message_start',message:event.partial});
    else if(event.type==='done'){final=event.message;send({type:'message_end',message:final});}
    else if(event.type==='error')throw new Error('Synthetic extension round failed');
   }
   if(!final)throw new Error('Missing synthetic terminal');context.messages.push(final);
   const toolResults=[];
   if(expectedTool){
    const call=final.content.find(part=>part.type==='toolCall');
    if(!call||call.name!==expectedTool)throw new Error('Unexpected synthetic tool');
    const tool=tools.find(tool=>tool.name===expectedTool);
    send({type:'tool_execution_start',toolCallId:call.id,toolName:call.name,args:call.arguments});
    const result=await tool.execute(call.id,call.arguments,undefined,undefined,ctx);
    send({type:'tool_execution_end',toolCallId:call.id,toolName:call.name,result,isError:false});
    const message={role:'toolResult',toolCallId:call.id,toolName:call.name,content:result.content,details:result.details,usage:result.usage,isError:false,timestamp:0};
    send({type:'message_start',message});send({type:'message_end',message});context.messages.push(message);toolResults.push(message);
   }
   send({type:'turn_end',toolResults});
  }
  // Four explicitly scripted fixture turns, not a Runtime implementation or generic Agent Loop.
  if(active.length){await scriptedTurn('zhiwei_file_read');await scriptedTurn('zhiwei_memory_read');await scriptedTurn('zhiwei_draft_write');}
  await scriptedTurn();send({type:'agent_end',willRetry:false});send({type:'agent_settled'});
 } else process.exitCode=2;
}
let tail='',pending=Promise.resolve();
process.stdin.on('data',chunk=>{
 tail+=chunk.toString('utf8');
 while(tail.includes('\\n')){
  const end=tail.indexOf('\\n'),r=JSON.parse(tail.slice(0,end));tail=tail.slice(end+1);
  pending=pending.then(()=>handle(r));
 }
});
process.stdin.on('end',()=>{void pending.then(()=>hooks.get('session_shutdown')({type:'session_shutdown',reason:'quit'},ctx));});
`);
  const supervisor = await createSyntheticControlledWorkerSupervisor({ packageDirectory: root, nodeExecutable: process.execPath, scenario, ...(taskIdentity ? { taskIdentity } : {}) });
  t.after(async () => { await supervisor.close(); await rm(root, { recursive: true, force: true }); });
  return supervisor;
}

test("Supervisor composes connection-owned synthetic Broker and never promotes settlement to task success", async t => {
  const supervisor = await fixture(t);
  assert.equal(supervisor.snapshot().binding.state, "ALLOCATED");
  const capabilities = supervisor.runtime.capabilities();
  assert.equal(capabilities.resume.status, "unsupported"); assert.equal(capabilities.modelBoundaryCapture.status, "limited");
  const binding = await supervisor.runtime.start(supervisor.spec);
  assert.equal(binding.state, "READY");
  assert.notEqual(binding.sessionId, binding.observedRuntimeSessionIds[0]);
  const events: NormalizedRuntimeEnvelopeV1[] = [];
  const collecting = (async () => {
    for await (const event of supervisor.runtime.events(binding.bindingId)) {
      events.push(event);
      if (event.event.stability === "settled") break;
    }
  })();
  const accepted = await supervisor.runtime.dispatch(binding.bindingId);
  assert.equal(accepted.status, "accepted");
  await collecting;
  const snapshot = supervisor.snapshot();
  assert.equal(snapshot.binding.state, "DRAINING");
  assert.equal(snapshot.taskOutcome, "not_evaluated"); assert.equal(snapshot.production, "unsupported");
  assert.equal(snapshot.broker.modelRequests.length, 1);
  assert.deepEqual(snapshot.broker.receiverRequests, snapshot.broker.modelRequests);
  assert.equal(snapshot.broker.modelRequests[0]!.workspaceId, supervisor.spec.workspaceId);
  assert.ok(events.every(event => event.bindingId === binding.bindingId && event.workerInstanceId === binding.workerInstanceId));
  assert.ok(new Set(events.map(event => event.event.sequence.domain)).size >= 3);
  await assert.rejects(supervisor.runtime.dispatch(binding.bindingId), SyntheticSupervisorError);
  const close = await supervisor.runtime.dispose(binding.bindingId);
  assert.equal(close.closeObserved, true); assert.equal(close.stdoutEof, true); assert.equal(close.exitCode, 0);
  assert.equal(supervisor.snapshot().binding.state, "STOPPED");
  assert.equal(supervisor.snapshot().taskOutcome, "not_evaluated");
  await supervisor.close(); await supervisor.close();
  assert.equal(supervisor.snapshot().broker.cleanup, "disposed");
});

test("Supervisor accepts only its generated fixture spec and exact binding", async t => {
  const supervisor = await fixture(t);
  await assert.rejects(supervisor.runtime.start({ ...supervisor.spec, prompt: "different synthetic prompt" }), SyntheticSupervisorError);
  assert.equal(supervisor.snapshot().binding.state, "ALLOCATED");
  await assert.rejects(supervisor.runtime.dispatch("other-binding"), SyntheticSupervisorError);
  assert.throws(() => supervisor.runtime.events(supervisor.snapshot().binding.bindingId), SyntheticSupervisorError);
  await supervisor.close();
  assert.equal(supervisor.snapshot().binding.state, "STOPPED");
  assert.equal(supervisor.snapshot().broker.cleanup, "disposed");
});

test("Supervisor abort acknowledgement remains only a request", async t => {
  const supervisor = await fixture(t), binding = await supervisor.runtime.start(supervisor.spec);
  const ack = await supervisor.runtime.abort(binding.bindingId, "cancelled");
  assert.equal(ack.status, "requested"); assert.equal(supervisor.snapshot().taskOutcome, "not_evaluated");
  await assert.rejects(supervisor.runtime.dispatch(binding.bindingId), SyntheticSupervisorError);
  assert.equal(supervisor.snapshot().binding.state, "DRAINING");
  assert.equal(supervisor.snapshot().broker.state, "closed");
  await supervisor.close();
});


test("Supervisor carries fixed file-memory-draft fixture through actual extension and Broker", async t => {
  const supervisor = await fixture(t, "tools");
  const binding = await supervisor.runtime.start(supervisor.spec);
  const events: NormalizedRuntimeEnvelopeV1[] = [];
  const collecting = (async () => {
    for await (const event of supervisor.runtime.events(binding.bindingId)) {
      events.push(event); if (event.event.stability === "settled") break;
    }
  })();
  assert.equal((await supervisor.runtime.dispatch(binding.bindingId)).status, "accepted");
  await collecting;
  const snapshot = supervisor.snapshot();
  assert.equal(snapshot.broker.modelRequests.length, 4); assert.equal(snapshot.broker.toolCalls, 3);
  assert.equal(snapshot.broker.drafts.length, 1);
  assert.deepEqual(snapshot.broker.receiverRequests, snapshot.broker.modelRequests);
  assert.ok(JSON.stringify(snapshot.broker.modelRequests[3]!.context).includes("Synthetic draft:"));
  assert.equal(snapshot.taskOutcome, "not_evaluated");
  assert.equal(events.filter(event => event.event.data.kind === "tool.lifecycle" && event.event.data.phase === "completed").length, 3);
  await supervisor.close();
});

// Trusted identity binding is prepared before spawn; it cannot change the fixture's prompt or tools.
test("Supervisor accepts exact durable task identities without expanding the synthetic profile", async t => {
  const taskIdentity: SyntheticTaskRuntimeIdentity = {
    executionUnitId: "execution-persistent-1", workspaceId: "workspace-persistent-1", sessionId: "session-persistent-1",
    requestSnapshotRef: { contentId: "input-persistent-1", contentVersion: 1 },
    fence: { installationId: "installation-persistent-1", recoveryEpoch: "recovery-0",
      owner: { kind: "task_attempt", id: "attempt-persistent-1" },
      sourceTask: { taskId: "task-persistent-1", attemptId: "attempt-persistent-1", intentRevision: 1 },
      contractRevision: 1, leaseEpoch: 2, cognition: { global: 0, workspace: 0 }, policy: { global: 0, workspace: 0 },
      notAfter: new Date(Date.now() + 60_000).toISOString() },
  };
  const supervisor = await fixture(t, "text", taskIdentity);
  assert.equal(supervisor.snapshot().binding.state, "ALLOCATED");
  assert.equal(supervisor.spec.prompt, "Summarize the fixed synthetic sample.");
  assert.equal(supervisor.spec.toolProfile, "none");
  assert.deepEqual(supervisor.spec.fence, taskIdentity.fence);
  const binding = await supervisor.runtime.start(supervisor.spec);
  assert.equal(binding.workspaceId, taskIdentity.workspaceId);
  assert.equal(binding.sessionId, taskIdentity.sessionId);
  assert.equal(binding.owner.id, "attempt-persistent-1");
  assert.equal(binding.leaseEpoch, 2);
});
