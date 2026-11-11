import {test} from 'node:test';
import assert from 'node:assert/strict';
import {installReaderStartup} from '../src/reader-startup';
import {READER_PROTOCOL} from '../src/page-connection';

test('Closed-panel startup repairs permitted active tabs, reuses readers and respects pause',async()=>{
 const events:Record<string,Function>={};const event=(name:string)=>({addListener:(f:Function)=>events[name]=f});
 let enabled=true,allowed=true,loaded=false,injections=0,scans=0;
 const tab={id:1,url:'https://shop.test/product',status:'complete',active:true};
 const api:any={tabs:{query:async()=>[tab],get:async()=>tab,onUpdated:event('updated'),onActivated:event('activated'),sendMessage:async(_id:number,msg:any)=>{
  if(!loaded)throw Error('Missing reader');if(msg.type==='refresh'){scans++;return {accepted:true};}return {protocol:READER_PROTOCOL};
 }},permissions:{contains:async()=>allowed,onAdded:event('permission')},runtime:{onInstalled:event('installed'),onStartup:event('startup')},scripting:{executeScript:async(args:any)=>{if(args.files){loaded=true;injections++;}}}};
 const tick=()=>new Promise(resolve=>setTimeout(resolve,10));
 installReaderStartup(api,async()=>enabled);await tick();assert.equal(injections,1);assert.equal(scans,1);
 events.activated({tabId:1});events.updated(1,{status:'complete'},tab);events.startup();await tick();assert.equal(scans,1);
 loaded=false;enabled=false;events.updated(1,{status:'complete'},tab);await tick();assert.equal(injections,1);
 enabled=true;allowed=false;events.activated({tabId:1});await tick();assert.equal(injections,1);
 allowed=true;events.updated(1,{status:'complete'},{...tab,active:false});await tick();assert.equal(injections,1);
 events.permission();await tick();assert.equal(injections,2);assert.equal(scans,2);
});
