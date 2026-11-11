import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createPageConnector,READER_PROTOCOL} from '../src/page-connection';
import {idlePageStatus} from '../src/page-status';
function browser({allowed=true,reader=false,broken=false}={}){
 let loaded=reader;let injections=0;const messages:any[]=[];
 const api:any={permissions:{contains:async()=>allowed},scripting:{executeScript:async()=>{injections++;if(broken)throw Error('Cannot access page');loaded=true;}},tabs:{sendMessage:async(_id:number,m:any)=>{messages.push(m);if(!loaded)throw Error('Receiving end does not exist');return m.type==='forma-ping'?{protocol:READER_PROTOCOL}:{accepted:true};}}};
 return {api,messages,get injections(){return injections;}};
}
const tab={id:4,url:'https://shop.test/products/jeans'};
test('An already-open permitted shop is injected and scanned when its reader is missing',async()=>{
 const b=browser();const result=await createPageConnector(b.api)(tab);
 assert.equal(result.status,'connected');assert.equal(b.injections,1);assert.equal(b.messages.at(-1).type,'refresh');
});
test('A live reader is reused and manual retry is acknowledged without reinjection',async()=>{
 const b=browser({reader:true});await createPageConnector(b.api)(tab,{force:true,retry:true});
 assert.equal(b.injections,0);assert.deepEqual(b.messages.at(-1),{type:'refresh',force:true,retry:true});
});
test('Automatic reconnect reports missing permission without requesting it or reading the page',async()=>{
 const b=browser({allowed:false});const result=await createPageConnector(b.api)(tab);
 assert.equal(result.status,'permission');assert.equal(b.injections,0);assert.equal(b.messages.length,0);
});
test('Concurrent reconnects share injection, while a later lost reader can be repaired again',async()=>{
 const b=browser();const connect=createPageConnector(b.api);await Promise.all([connect(tab),connect(tab)]);assert.equal(b.injections,1);
 assert.equal((await connect({id:4,url:'chrome://extensions'})).status,'unsupported');
});
test('Injection failure and unresponsive messages end in an actionable error',async()=>{
 const b=browser({broken:true});assert.equal((await createPageConnector(b.api)(tab)).status,'error');
 b.api.tabs.sendMessage=()=>new Promise(()=>{});b.api.scripting.executeScript=async()=>{};
 assert.equal((await createPageConnector(b.api,5)(tab)).status,'error');
});
test('Absent data and interrupted AI never display an endless Waiting for AI state',()=>{
 const c={status:'connected' as const,message:'',at:1000};
 assert.equal(idlePageStatus(c,undefined,undefined,1001).title,'Reading the size guide…');
 assert.equal(idlePageStatus(c,undefined,undefined,12000).title,'Page scan did not respond');
 assert.equal(idlePageStatus(c,undefined,{status:'running',model:'test',startedAt:1000},47000).title,'Assessment interrupted');
 assert.equal(idlePageStatus(c,undefined,{status:'running',model:'test',startedAt:1000},2000).title,'Reviewing garment and fit…');
 assert.equal(idlePageStatus(c,{status:'error',at:1000,error:'Read failed'},undefined,2000).text,'Read failed');
});
