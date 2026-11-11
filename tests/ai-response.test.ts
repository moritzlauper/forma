import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readAIJSON} from '../src/ai-response';
const reply=(text:string,stop_reason='end_turn')=>new Response(JSON.stringify({stop_reason,content:[{type:'text',text}]}));
test('Truncated JSON is rejected without exposing a parser exception',async()=>{
 await assert.rejects(readAIJSON(reply('{"size":"L","summary":"unfinished'),false),/incomplete or invalid answer/);
});
test('Token-limited output is rejected even if its JSON happens to be valid',async()=>{
 await assert.rejects(readAIJSON(reply('{"size":"L"}','max_tokens'),false),/cut off/);
});
test('Refusals and missing content are handled before JSON parsing',async()=>{
 await assert.rejects(readAIJSON(reply('Cannot assess','refusal'),false),/declined/);
 await assert.rejects(readAIJSON(new Response('{}'),false),/no assessment/);
});
test('Invalid service envelope does not leak a JSON parser error',async()=>{
 await assert.rejects(readAIJSON(new Response('{"content":'),false),/incomplete response/);
});
test('Completed answers preserve escaped quotes and Unicode',async()=>{
 const data={size:null,summary:'A "boxy" hoodie — Ärmel',reasons:[],limitations:[]};
 assert.deepEqual(await readAIJSON(reply(JSON.stringify(data)),false),data);
});
test('Ollama length stops are rejected and complete fenced JSON remains readable',async()=>{
 await assert.rejects(readAIJSON(new Response(JSON.stringify({done_reason:'length',message:{content:'{"size":null}'}})),true),/cut off/);
 assert.deepEqual(await readAIJSON(new Response(JSON.stringify({done:true,done_reason:'stop',message:{content:'  ```json\n{"size":null}\n```  '}})),true),{size:null});
});
