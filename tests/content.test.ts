import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {setImmediate as tick} from 'node:timers/promises';
import {READER_PROTOCOL} from '../src/page-connection';

test('Manual activation reads a missed page, survives refresh, and resets on navigation',async()=>{
 const {window,document}=parseHTML('<html><head></head><body><main><h1>Archive 04</h1><p>CHF 80</p><button>Add to cart</button></main></body></html>');
 const location={href:'https://shop.test/archive'};
 Object.defineProperty(document,'URL',{get:()=>location.href});
 const sent:any[]=[];let refresh:(m:any,sender?:any,reply?:(v:any)=>void)=>void=()=>{};let checkURL:()=>void=()=>{};
 const globals={window,document,location,MutationObserver:class {observe(){}disconnect(){}},chrome:{runtime:{id:'test-extension',onMessage:{addListener:(fn:typeof refresh)=>refresh=fn,removeListener:()=>{}},sendMessage:(m:any,reply:(value:any)=>void)=>{if(m.type==='forma-state'){reply({enabled:true});return;}sent.push(m);reply({});}}},setInterval:((fn:()=>void)=>{checkURL=fn;return 0;})};
 const original=new Map(Object.keys(globals).map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 for(const [k,v]of Object.entries(globals))Object.defineProperty(globalThis,k,{value:v,configurable:true,writable:true});
 try{
  await import('../src/content');await tick();
  assert.equal(sent.length,1);assert.equal(sent[0].detection.kind,'unknown');assert.equal(sent[0].text,'');assert.equal(sent[0].manual,false);
  let ack:any;refresh({type:'forma-ping'},{},v=>ack=v);assert.equal(ack.protocol,READER_PROTOCOL);
  refresh({type:'refresh',force:true,retry:true},{},v=>ack=v);assert.equal(ack.accepted,true);await tick();
  assert.equal(sent[1].type,'page-progress');assert.equal(sent.at(-1).manual,true);assert.match(sent.at(-1).text,/Archive 04/);assert.equal(sent.at(-1).retry,true);
  refresh({type:'refresh'},{},()=>{});await tick();assert.equal(sent.at(-1).manual,true);
  location.href='https://shop.test/about';checkURL();await tick();
  assert.equal(sent.at(-1).manual,false);assert.equal(sent.at(-1).text,'');
  let invalidCalls=0;
  globals.chrome.runtime.sendMessage=()=>{invalidCalls++;throw Error('Extension context invalidated.');};
  globals.chrome.runtime.onMessage.removeListener=()=>{throw Error('Extension context invalidated.');};
  refresh({type:'refresh',force:true},{},()=>{});await tick();await tick();
  assert.equal(invalidCalls,1,'The orphaned reader stops instead of sending another error message');
  location.href='https://shop.test/next';checkURL();await tick();assert.equal(invalidCalls,1);
 }finally{
  for(const [key,descriptor]of original)if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete (globalThis as any)[key];
 }
});
