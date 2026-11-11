import {test} from 'node:test';
import assert from 'node:assert/strict';
import {requestLimit,createRequestBudget,additionalRequests} from '../src/request-budget';
function storage(initial:Record<string,unknown>){return {data:initial,async get(keys:string[]){return Object.fromEntries(keys.map(k=>[k,initial[k]]));},async set(values:Record<string,unknown>){Object.assign(initial,values);}};}
test('Fresh installs and the original stored default both use 100 requests',()=>{
 assert.equal(requestLimit(),100);assert.equal(requestLimit({limit:10}),100);assert.equal(requestLimit({limit:NaN}),100);
});
test('Custom and deliberately paused budgets are preserved',()=>{
 assert.equal(requestLimit({limit:0}),0);assert.equal(requestLimit({limit:25}),25);assert.equal(requestLimit({limit:10,limitVersion:1}),10);assert.equal(requestLimit({limit:500}),500);
});
test('Migrating the old allowance retains consumed requests',async()=>{
 const store=storage({settings:{limit:10},aiCount:10});const reserve=createRequestBudget(store);
 assert.deepEqual(await reserve(),{allowed:true,used:11,limit:100});assert.equal(store.data.aiCount,11);
});
test('Concurrent manual and automatic attempts cannot exceed the limit',async()=>{
 const store=storage({settings:{limit:100,limitVersion:1},aiCount:99});const reserve=createRequestBudget(store);
 const answers=await Promise.all([reserve(),reserve(),reserve()]);assert.equal(answers.filter(a=>a.allowed).length,1);assert.equal(store.data.aiCount,100);
});
test('A saved increase applies to the next request without resetting usage',async()=>{
 const store=storage({settings:{limit:100,limitVersion:1},aiCount:100});const reserve=createRequestBudget(store);
 assert.equal((await reserve()).allowed,false);
 await store.set({settings:{limit:200,limitVersion:1}});
 assert.deepEqual(await reserve(),{allowed:true,used:101,limit:200});
});
test('One-click extension creates headroom even if count already exceeds the limit',()=>{
 assert.equal(additionalRequests(100,100),200);assert.equal(additionalRequests(10,27),127);assert.equal(additionalRequests(100,10),200);
});
test('An explicitly uncapped budget keeps counting without blocking, and can be capped again',async()=>{
 const store=storage({settings:{limit:100,limitVersion:1,unlimited:true},aiCount:100});const reserve=createRequestBudget(store);
 assert.deepEqual(await reserve(),{allowed:true,used:101,limit:100});
 assert.deepEqual(await reserve(),{allowed:true,used:102,limit:100});
 await store.set({settings:{limit:100,limitVersion:1,unlimited:false}});
 assert.equal((await reserve()).allowed,false);assert.equal(store.data.aiCount,102);
});
