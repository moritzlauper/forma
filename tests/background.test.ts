import {test} from 'node:test';
import assert from 'node:assert/strict';
test('Recognised chart triggers AI by default, caches it, and reports provenance',async()=>{
 const local:Record<string,unknown>={profile:{mode:'body',name:'Test',category:'top',fit:'relaxed',measures:{chest:{value:102,uncertainty:12,estimated:true}}},description:'Loose hoodies, not cropped.',settings:{mode:'anthropic',model:'claude-haiku-5-5',assessmentVersion:1,limit:10},apiKey:'fake-test-key'};
 const session:Record<string,any>={};let listener:Function=()=>{};let storageListener:Function=()=>{};let calls=0;
 const area=(data:Record<string,unknown>)=>({setAccessLevel:async()=>{},get:async(keys:string|string[])=>Object.fromEntries((Array.isArray(keys)?keys:[keys]).map(k=>[k,data[k]])),set:async(p:Record<string,unknown>)=>Object.assign(data,p)});
 const previousFetch=globalThis.fetch;
 (globalThis as any).chrome={storage:{local:area(local),session:area(session),onChanged:{addListener:(fn:Function)=>storageListener=fn}},tabs:{query:async()=>[]},sidePanel:{setPanelBehavior:()=>{},open:async()=>{}},runtime:{getURL:(path:string)=>'chrome-extension://test/'+path,onMessage:{addListener:(fn:Function)=>listener=fn}},permissions:{contains:async()=>true,onRemoved:{addListener:()=>{}}}};
 globalThis.fetch=async(_url,init)=>{calls++;const input=JSON.parse(JSON.parse(String(init?.body)).messages[0].content);assert.equal(input.profile.description,local.description);assert.equal(input.profile.measures.chest,undefined);assert.equal(input.decision.canSelectSize,true);return new Response(JSON.stringify({content:[{type:'text',text:JSON.stringify({size:null,summary:'Need measured evidence for this hoodie',reasons:['Cut and length matter'],limitations:['Sleeves unknown']})}]}));};
 try{
  await import('../src/background');
  const msg={type:'page',name:'Cotton hoodie',text:'Cotton hoodie, box fit',detection:{kind:'clothing',name:'Cotton hoodie',category:'top',signals:['product data']},charts:[{text:'Size;Chest\nM;60',context:'Garment measurements cm measured flat'}]};
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
  local.settings={...(local.settings as object),limit:100,limitVersion:1};local.aiCount=100;msg.name='Budget-limited hoodie';
  await send();assert.equal(session['page:1'].assessment.code,'request_limit');assert.equal(calls,3);
  const oldSettings=local.settings;local.settings={...(oldSettings as object),limit:200};
  await storageListener({settings:{oldValue:oldSettings,newValue:local.settings}},'local');
  await send();assert.equal(calls,4);assert.equal(local.aiCount,101);assert.equal(session['page:1'].assessment.status,'ready');
  const manual=await new Promise<any>(resolve=>listener({type:'reserve-ai-request'},{url:'chrome-extension://test/index.html'},resolve));
  assert.equal(manual.allowed,true);assert.equal(local.aiCount,102);
  let pageReserved=false;listener({type:'reserve-ai-request'},{tab:{id:1},url:'https://example.test/'},()=>pageReserved=true);
  assert.equal(pageReserved,false);assert.equal(local.aiCount,102);
  // Raising the limit must not drop an in-flight assessment and pay twice.
  let started!:()=>void;const startedPromise=new Promise<void>(resolve=>started=resolve);
  let complete!:()=>void;const pending=new Promise<Response>(resolve=>complete=()=>resolve(new Response(JSON.stringify({content:[{type:'text',text:JSON.stringify({size:null,summary:'Finished once',reasons:[],limitations:[]})}]}))));
  globalThis.fetch=async()=>{calls++;started();return pending;};msg.name='Pending hoodie';
  const firstPending=send();await startedPromise;
  local.settings={...(local.settings as object),limit:300};await storageListener({settings:{newValue:local.settings}},'local');
  const secondPending=send();complete();await Promise.all([firstPending,secondPending]);
  assert.equal(calls,5);assert.equal(local.aiCount,103);
  // Local negatives do not spend tokens. The user's manual activation bypasses
  // classification, but shares normal budget, cache and assessment handling.
  const missed={...msg,name:'Archive 04',detection:{kind:'unknown',name:'Archive 04',category:null,signals:['price']}};
  const skipped=await new Promise<any>(resolve=>listener(missed,{tab:{id:1},url:'https://example.test/archive'},resolve));
  assert.equal(skipped.skipped,true);assert.equal(calls,5);assert.equal(local.aiCount,103);assert.equal(session['page:1'].assessment,undefined);
  globalThis.fetch=async()=>{calls++;return new Response(JSON.stringify({content:[{type:'text',text:JSON.stringify({size:null,summary:'Finished once',reasons:[],limitations:[]})}]}));};
  const forced=await new Promise<any>(resolve=>listener({...missed,manual:true},{tab:{id:1},url:'https://example.test/archive'},resolve));
  assert.equal(forced.result.message,'Finished once');assert.equal(calls,6);assert.equal(local.aiCount,104);assert.equal(session['page:1'].manual,true);
  const fresh=()=>new Promise<any>(resolve=>listener({...missed,manual:true,fresh:true,retry:true},{tab:{id:1},url:'https://example.test/archive'},resolve));
  const refreshed=await fresh();assert.equal(calls,7);assert.equal(local.aiCount,105);assert.equal(refreshed.result.cached,false);
  // Several explicit refreshes while the request is active share that request.
  let freshStarted!:()=>void;const freshStart=new Promise<void>(resolve=>freshStarted=resolve);
  let finishFresh!:()=>void;const freshResponse=new Promise<Response>(resolve=>finishFresh=()=>resolve(new Response(JSON.stringify({content:[{type:'text',text:JSON.stringify({size:null,summary:'Fresh assessment',reasons:[],limitations:[]})}]}))));
  globalThis.fetch=async()=>{calls++;freshStarted();return freshResponse;};
  const a=fresh();await freshStart;const b=fresh();await new Promise(resolve=>setTimeout(resolve,10));finishFresh();
  const answers=await Promise.all([a,b]);assert.equal(calls,8);assert.equal(local.aiCount,106);assert.ok(answers.some(v=>v.result?.cached===false));assert.ok(answers.every(v=>v.stale||v.result?.cached===false));
  const beforeBookmark=calls;
  const saved=await new Promise<any>(resolve=>listener({type:'open-fit-editor',kind:'good'},{tab:{id:1},url:'https://example.test/archive',frameId:0},resolve));
  assert.equal(saved.ok,true);assert.equal(calls,beforeBookmark);assert.equal((local.goodFits as any[])[0].url,'https://example.test/archive');assert.equal(session['fit-editor:1'].kind,'good');
  const edit=await new Promise<any>(resolve=>listener({type:'save-good-fit',entry:{...(local.goodFits as any[])[0],size:'L',reason:'Great sleeves'}},{tab:{id:99},url:'chrome-extension://test/index.html'},resolve));assert.equal(edit.goodFits[0].size,'L');
  await new Promise<any>(resolve=>listener({type:'open-fit-editor',kind:'good'},{tab:{id:1},url:'https://example.test/archive',frameId:0},resolve));assert.equal((local.goodFits as any[])[0].size,'L');assert.equal((local.goodFits as any[])[0].reason,'Great sleeves');
  await new Promise<any>(resolve=>listener({type:'open-fit-editor',kind:'bad'},{tab:{id:1},url:'https://example.test/archive',frameId:0},resolve));assert.equal(session['fit-editor:1'].kind,'bad');assert.equal(calls,beforeBookmark);
  await new Promise<any>(resolve=>listener({type:'page-error',name:'Unreadable product'},{tab:{id:1},url:'https://example.test/error'},resolve));
  assert.equal(session['page:1'].scan.status,'error');assert.equal(calls,8);
 }finally{globalThis.fetch=previousFetch;delete (globalThis as any).chrome;}
});
