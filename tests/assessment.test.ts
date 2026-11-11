import {test} from 'node:test';
import assert from 'node:assert/strict';
import {inputForReview,validateReview,requestReview,reviewSchema} from '../src/assessment';
import type {Profile,Product} from '../src/fit';
const profile:Profile={mode:'body',name:'private name',category:'top',fit:'relaxed',measures:{chest:{value:100,uncertainty:12,estimated:true}}};
const page={url:'https://example.test/products/hoodie?variant=1',name:'Box hoodie',text:'Heavyweight box fit hoodie',charts:[]};
const product:Product={name:page.name,category:'top',measurementType:'garment',unit:'cm',flat:true,source:page.url,sizes:[{label:'M',available:true,measures:{chest:60}},{label:'L',available:true,measures:{chest:63}}]};
test('Fit assessment requests schema-constrained JSON from both providers',async()=>{
 const previous=globalThis.fetch;let local=false;
 globalThis.fetch=async(_url,init)=>{
  const body=JSON.parse(String(init?.body));
  if(local){assert.deepEqual(body.format,reviewSchema);assert.equal(body.options.num_predict,3000);}
  else{assert.deepEqual(body.output_config.format,{type:'json_schema',schema:reviewSchema});assert.equal(body.max_tokens,3000);}
  const text=JSON.stringify({size:null,summary:'Insufficient evidence',reasons:[],limitations:[]});
  return new Response(JSON.stringify(local?{done_reason:'stop',message:{content:text}}:{stop_reason:'end_turn',content:[{type:'text',text}]}));
 };
 try{for(const mode of ['anthropic','ollama']){local=mode==='ollama';await requestReview(inputForReview(page,product,profile,[]),mode,'test-model','test-key');}}
 finally{globalThis.fetch=previous;}
});
test('AI receives garment context but no invented body-measurement anchor',()=>{const input=inputForReview(page,product,profile,[],'Loose hoodies, not cropped.');assert.equal(input.product.parsed,product);assert.equal(input.profile.measures.chest,undefined);assert.equal(input.profile.description,'Loose hoodies, not cropped.');assert.equal(input.decision.canSelectSize,false);assert.equal('name' in input.profile,false);});
test('Only matching-product feedback enters assessment; URL variant does not split history',()=>{const input=inputForReview(page,product,profile,[{name:'other',url:'https://example.test/products/hoodie?variant=2',size:'L',value:'Too tight'},{name:'other',url:'https://example.test/products/other',size:'L',value:'Fits'}]);assert.equal(input.feedback.length,1);});
test('Rejects invented sizes and direct feedback contradictions',()=>{const input=inputForReview(page,product,profile,[{name:page.name,size:'L',value:'Too tight'}]);const base={summary:'Test',reasons:[],limitations:[]};assert.throws(()=>validateReview({...base,size:'XL'},product,input));assert.throws(()=>validateReview({...base,size:'L'},product,input));assert.equal(validateReview({...base,size:null},product,input).size,null);});
test('A parsed table still makes a real transport call for AI fit assessment',async()=>{const previous=globalThis.fetch;let calls=0;globalThis.fetch=async(_url,init)=>{calls++;const body=JSON.parse(String(init?.body));assert.equal(body.model,'claude-haiku-5-5');assert.match(body.messages[0].content,/Heavyweight box fit hoodie/);return new Response(JSON.stringify({content:[{type:'text',text:JSON.stringify({size:null,summary:'Not enough measured evidence',reasons:['Hoodie fit requires more than chest width'],limitations:['Sleeve length missing']})}]}));};try{const review=await requestReview(inputForReview(page,product,profile,[]),'anthropic','claude-haiku-5-5','test-key');assert.equal(calls,1);assert.equal(review.size,null);}finally{globalThis.fetch=previous;}});
test('HTTP failures remain errors instead of local recommendations',async()=>{const previous=globalThis.fetch;globalThis.fetch=async()=>new Response('',{status:401});try{await assert.rejects(requestReview(inputForReview(page,product,profile,[]),'anthropic','claude-haiku-5-5','test-key'),/401/);}finally{globalThis.fetch=previous;}});
test('General comparison rejects any narrower size after a too-tight report',()=>{const input=inputForReview(page,product,profile,[{name:page.name,size:'L',value:'Too tight'}]);assert.throws(()=>validateReview({size:'M',summary:'Test',reasons:[],limitations:[]},product,input),/no larger/);});
test('Anthropic receives product photos as image blocks rather than URL text',async()=>{const previous=globalThis.fetch;globalThis.fetch=async(_url,init)=>{const body=JSON.parse(String(init?.body));assert.equal(body.messages[0].content[1].type,'image');assert.equal(body.messages[0].content[1].source.url,'https://example.test/hoodie.jpg');return new Response(JSON.stringify({content:[{type:'text',text:JSON.stringify({size:null,summary:'Cannot determine size from silhouette',reasons:['Hem looks tapered'],limitations:['Photo provides no exact measurements']})}]}));};try{await requestReview(inputForReview({...page,images:['https://example.test/hoodie.jpg']},product,profile,[]),'anthropic','claude-haiku-5-5','test-key');}finally{globalThis.fetch=previous;}});
test('Rejected product images get one budgeted text-only attempt with honest image metadata',async()=>{
 const previous=globalThis.fetch;let calls=0,reservations=0;
 globalThis.fetch=async(_url,init)=>{
  calls++;const body=JSON.parse(String(init?.body));
  if(calls===1){assert.equal(body.messages[0].content[1].type,'image');return new Response(JSON.stringify({error:{type:'invalid_request_error',message:'Could not process image'}}),{status:400});}
  assert.equal(typeof body.messages[0].content,'string');assert.deepEqual(JSON.parse(body.messages[0].content).product.images,[]);
  return new Response(JSON.stringify({content:[{type:'text',text:JSON.stringify({size:null,summary:'Text-only assessment',reasons:[],limitations:[]})}]}));
 };
 try{const review=await requestReview(inputForReview({...page,images:['https://shop.test/photo.jpg']},product,profile,[]),'anthropic','test','fake-key',async()=>{reservations++;return true;});assert.equal(calls,2);assert.equal(reservations,1);assert.equal(review.imageCount,0);assert.match(review.limitations.join(' '),/text and sizing only/);}finally{globalThis.fetch=previous;}
});
test('Non-image HTTP 400 shows the provider reason with secrets removed and does not retry',async()=>{
 const previous=globalThis.fetch;let calls=0;
 globalThis.fetch=async()=>{calls++;return new Response(JSON.stringify({error:{message:'Invalid model parameter. fake-secret https://private.test/photo?token=secret'}}),{status:400});};
 try{await assert.rejects(requestReview(inputForReview({...page,images:['https://shop.test/photo.jpg']},product,profile,[]),'anthropic','test','fake-secret'),e=>{assert.match(String(e),/Invalid model parameter/);assert.doesNotMatch(String(e),/fake-secret|private.test|token=secret/);return true;});assert.equal(calls,1);}finally{globalThis.fetch=previous;}
});
test('Photo recovery respects the request limit and never loops on a second failure',async()=>{
 const previous=globalThis.fetch;let calls=0;
 globalThis.fetch=async()=>{calls++;return new Response(JSON.stringify({error:{message:'Could not process image'}}),{status:400});};
 const input=inputForReview({...page,images:['https://shop.test/photo.jpg']},product,profile,[]);
 try{await assert.rejects(requestReview(input,'anthropic','test','fake',async()=>false),/limit prevents/);assert.equal(calls,1);calls=0;await assert.rejects(requestReview(input,'anthropic','test','fake',async()=>true),/Could not process image/);assert.equal(calls,2);}finally{globalThis.fetch=previous;}
});
test('Farfetch file-download error retries with the already scraped table and no photos',async()=>{
 const previous=globalThis.fetch;let calls=0;
 globalThis.fetch=async(_url,init)=>{calls++;const body=JSON.parse(String(init?.body));if(calls===1)return new Response(JSON.stringify({error:{message:'Unable to download the file. Please verify the URL and try again.'}}),{status:400});const input=JSON.parse(body.messages[0].content);assert.deepEqual(input.product.charts,page.charts);assert.deepEqual(input.product.images,[]);return new Response(JSON.stringify({content:[{type:'text',text:JSON.stringify({size:null,summary:'Table retained',reasons:[],limitations:[]})}]}));};
 try{const review=await requestReview(inputForReview({...page,images:['https://cdn.test/jacket.jpg']},product,profile,[]),'anthropic','test','fake',async()=>true);assert.equal(calls,2);assert.equal(review.imageCount,0);}finally{globalThis.fetch=previous;}
});
