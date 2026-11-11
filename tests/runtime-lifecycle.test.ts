import {test} from 'node:test';import assert from 'node:assert/strict';
import {watchRuntimeInvalidation} from '../src/runtime-lifecycle';
test('Late shutdown rejections are handled only after this runtime has gone',()=>{
 let handler:any,stops=0,prevented=0;const runtime={id:'live'};
 watchRuntimeInvalidation({addEventListener:(_event:any,fn:any)=>handler=fn} as any,runtime,()=>stops++);
 const send=(message:string)=>handler({reason:Error(message),preventDefault:()=>prevented++});
 send('Extension context invalidated.');assert.equal(stops,0);assert.equal(prevented,0);
 runtime.id='';send('Network failed');assert.equal(stops,0);assert.equal(prevented,0);
 send('Extension context invalidated.');assert.equal(stops,1);assert.equal(prevented,1);
});
