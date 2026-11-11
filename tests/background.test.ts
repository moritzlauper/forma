import {test} from 'node:test';
import assert from 'node:assert/strict';
test('Recognised chart triggers AI by default, caches it, and reports provenance',async()=>{
 const local:Record<string,unknown>={profile:{mode:'body',name:'Test',category:'top',fit:'relaxed',measures:{chest:{value:102,uncertainty:12,estimated:true}}},description:'Loose hoodies, not cropped.',settings:{mode:'anthropic',model:'claude-haiku-5-5',assessmentVersion:1,limit:10},apiKey:'fake-test-key'};
 const session:Record<string,any>={};let listener:Function=()=>{};let calls=0;
 const area=(data:Record<string,unknown>)=>({setAccessLevel:async()=>{},get:async(keys:string|string[])=>Object.fromEntries((Array.isArray(keys)?keys:[keys]).map(k=>[k,data[k]])),set:async(p:Record<string,unknown>)=>Object.assign(data,p)});
 const previousFetch=globalThis.fetch;
 (globalThis as any).chrome={storage:{local:area(local),session:area(session),onChanged:{addListener:()=>{}}},sidePanel:{setPanelBehavior:()=>{}},runtime:{onMessage:{addListener:(fn:Function)=>listener=fn}},permissions:{contains:async()=>true,onRemoved:{addListener:()=>{}}}};
 globalThis.fetch=async(_url,init)=>{calls++;const input=JSON.parse(JSON.parse(String(init?.body)).messages[0].content);assert.equal(input.profile.description,local.description);assert.equal(input.profile.measures.chest,undefined);assert.equal(input.decision.canSelectSize,false);return new Response(JSON.stringify({content:[{type:'text',text:JSON.stringify({size:null,summary:'Need measured evidence for this hoodie',reasons:['Cut and length matter'],limitations:['Sleeves unknown']})}]}));};
 try{
  await import('../src/background');
  const msg={type:'page',name:'Cotton hoodie',text:'Cotton hoodie, box fit',charts:[{text:'Size;Chest\nM;60',context:'Garment measurements cm measured flat'}]};
  const send=()=>new Promise<any>(resolve=>listener(msg,{tab:{id:1},url:'https://example.test/hoodie'},resolve));
  const first=await send();assert.equal(calls,1);assert.equal(first.result.model,'claude-haiku-5-5');assert.equal(session['page:1'].assessment.status,'ready');assert.equal(local.aiCount,1);
  const repeated=await send();assert.equal(calls,1);assert.equal(local.aiCount,1);assert.equal(repeated.result.cached,true);
  // A different product fails once. DOM updates must not spend more tokens;
  // an explicit Refresh can retry, within the same request budget.
  msg.name='Another hoodie';
  globalThis.fetch=async()=>{calls++;return new Response(JSON.stringify({stop_reason:'max_tokens',content:[{type:'text',text:'{"summary":"unfinished'}]}));};
  const broken=await send();assert.match(broken.result.message,/cut off/);assert.equal(calls,2);
  await send();assert.equal(calls,2);assert.equal(session['page:1'].assessment.status,'error');
  assert.equal(Object.keys(local.fitCache as object).length,1);
  globalThis.fetch=async()=>{calls++;return new Response(JSON.stringify({stop_reason:'end_turn',content:[{type:'text',text:JSON.stringify({size:null,summary:'Complete assessment',reasons:[],limitations:[]})}]}));};
  const retry=()=>new Promise<any>(resolve=>listener({...msg,retry:true},{tab:{id:1},url:'https://example.test/hoodie'},resolve));
  const fixed=await retry();assert.equal(calls,3);assert.equal(local.aiCount,3);assert.equal(fixed.result.message,'Complete assessment');
  await retry();assert.equal(calls,3);
 }finally{globalThis.fetch=previousFetch;delete (globalThis as any).chrome;}
});
