import {test} from 'node:test';
import assert from 'node:assert/strict';
import {enableAutomaticDetection,automaticDetectionEnabled,allShopOrigins} from '../src/automatic-detection';
function mock(granted=true){
 const order:string[]=[];let scripts:any[]=[];
 const api:any={permissions:{request:()=>{order.push('request');return Promise.resolve(granted);},contains:async()=>granted},scripting:{getRegisteredContentScripts:async()=>scripts,registerContentScripts:async(s:any[])=>{order.push('register');scripts.push(...s);},updateContentScripts:async(s:any[])=>{order.push('update');scripts=s;},unregisterContentScripts:async()=>{}},tabs:{query:async()=>{order.push('query');return [{id:1,url:'chrome://extensions/'}];}}};return {api,order};
}
test('All-shop activation requests permission immediately and works from Chrome settings',async()=>{
 const {api,order}=mock();const task=enableAutomaticDetection(api,async()=>{throw Error('Must not read chrome://');});assert.deepEqual(order,['request']);await task;
 assert.equal(await automaticDetectionEnabled(api),true);assert.deepEqual((await api.scripting.getRegisteredContentScripts())[0].matches,allShopOrigins);
 await enableAutomaticDetection(api);assert.ok(order.includes('update'));
});
test('Denied permission is explicit and registers no reader',async()=>{
 const {api,order}=mock(false);await assert.rejects(enableAutomaticDetection(api),/not granted/);assert.deepEqual(order,['request']);assert.equal(await automaticDetectionEnabled(api),false);
});
