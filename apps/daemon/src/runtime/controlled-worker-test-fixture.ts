// Synthetic protocol peer only; never official Pi Runtime acceptance evidence.
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
export async function createSyntheticWorkerTestPackage(options: Readonly<{pauseHandshake?:boolean;pausePrompt?:boolean}> = {}) {
  const root = await mkdtemp(join(tmpdir(), "zhiwei-supervisor-ordinary-test-"));
  await mkdir(join(root, "dist"));
  await writeFile(join(root, "package.json"), JSON.stringify({ name: "@earendil-works/pi-coding-agent", version: "0.84.1", type: "module", bin: { pi: "dist/cli.js" } }));
  // Deliberately a synthetic protocol peer, NOT a copy of Pi or official Runtime evidence.
  await writeFile(join(root, "dist", "cli.js"), `
import { pathToFileURL } from 'node:url';
import { access, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
async function barrier(name) {
 await writeFile(${JSON.stringify(root)}+'/'+name+'-started','synthetic');
 const deadline=Date.now()+30000;
 while(true) { try { await access(${JSON.stringify(root)}+'/'+name+'-release'); return; } catch { if(Date.now()>deadline)process.exit(3); await delay(5); } }
}
if(${JSON.stringify(options.pauseHandshake===true)}) await barrier('handshake');
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
  if(${JSON.stringify(options.pausePrompt===true)}) await barrier('prompt');
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
  const wait = async (name:string) => { const deadline=Date.now()+10000; while(true) { try { await access(join(root,name)); return; } catch { if(Date.now()>deadline) throw new Error("Synthetic barrier not reached."); await delay(5); } } };
  return {root,remove:()=>rm(root,{recursive:true,force:true}),waitForHandshake:()=>wait("handshake-started"),waitForPrompt:()=>wait("prompt-started"),releaseHandshake:()=>writeFile(join(root,"handshake-release"),"synthetic")};
}
