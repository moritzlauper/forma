import {test} from 'node:test';
import assert from 'node:assert/strict';
import {inputForReview,validateReview,requestReview,reviewSchema} from '../src/assessment';
import type {Profile,Product} from '../src/fit';
const profile:Profile={mode:'body',name:'private name',category:'top',fit:'relaxed',measures:{chest:{value:100,uncertainty:12,estimated:true}}};
const page={url:'https://example.test/products/hoodie?variant=1',name:'Box hoodie',text:'Heavyweight box fit hoodie',charts:[]};
const product:Product={name:page.name,category:'top',measurementType:'garment',unit:'cm',flat:true,source:page.url,sizes:[{label:'M',available:true,measures:{chest:60}},{label:'L',available:true,measures:{chest:63}}]};
test('Overall score uses API-supported schema fields and local range validation',()=>{
 const schema=reviewSchema.properties.overallFit.properties.score;
 assert.equal('minimum' in schema,false);assert.equal('maximum' in schema,false);
 const input=inputForReview(page,product,profile,[]);
 for(const score of [-1,11,Infinity,NaN])assert.throws(()=>validateReview({overallFit:{score,label:'Good fit',reason:'Test'},size:null,summary:'Test',reasons:[],limitations:[]},product,input),/Invalid overall fit score/);
});
test('Fit assessment requests schema-constrained JSON from both providers',async()=>{
 const previous=globalThis.fetch;let local=false;
 globalThis.fetch=async(_url,init)=>{
  const body=JSON.parse(String(init?.body));
  if(local){assert.deepEqual(body.format,reviewSchema);assert.equal(body.options.num_predict,4000);}
  else{assert.deepEqual(body.output_config.format,{type:'json_schema',schema:reviewSchema});assert.equal(body.max_tokens,4000);}
  const text=JSON.stringify({size:null,summary:'Insufficient evidence',reasons:[],limitations:[]});
  return new Response(JSON.stringify(local?{done_reason:'stop',message:{content:text}}:{stop_reason:'end_turn',content:[{type:'text',text}]}));
 };
 try{for(const mode of ['anthropic','ollama']){local=mode==='ollama';await requestReview(inputForReview(page,product,profile,[]),mode,'test-model','test-key');}}
 finally{globalThis.fetch=previous;}
});
test('AI receives garment context but no invented body-measurement anchor',()=>{const input=inputForReview(page,product,profile,[],'Loose hoodies, not cropped.');assert.equal(input.product.parsed,product);assert.equal(input.profile.measures.chest,undefined);assert.equal(input.profile.description,'Loose hoodies, not cropped.');assert.equal(input.decision.canSelectSize,true);assert.equal(input.decision.basis,'estimate');assert.equal('name' in input.profile,false);});
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

test('Raw personal tolerances reach AI without basic-field extraction or fabricated measurements',()=>{const words='waist 46cm bei hosen sind mir gerade noch knapp okay, lieber bisschen grösser, darunter lieber nicht';const empty:Profile={mode:'body',name:'My fit',category:'trousers',fit:'relaxed',measures:{}};const trousers:Product={...product,category:'trousers',sizes:[{label:'34',available:true,measures:{waist:46}},{label:'36',available:true,measures:{waist:48.5}}]};const input=inputForReview(page,trousers,empty,[],words);assert.equal(input.profile.description,words);assert.deepEqual(input.profile.measures,{});assert.equal(input.profile.context,undefined);assert.equal(input.decision.canSelectSize,true);assert.equal(inputForReview(page,trousers,empty,[]).decision.canSelectSize,false);});

test('Broad estimates reach AI separately from known measurements, including fixed estimates',()=>{const input=inputForReview(page,product,{...profile,measures:{chest:{value:102,uncertainty:12,estimated:true,locked:true},shoulder:{value:46,uncertainty:1,estimated:false}}},[]);assert.equal(input.profile.measures.chest,undefined);assert.deepEqual(input.profile.estimates.chest,{value:102,uncertainty:12,estimated:true,locked:true});assert.equal(input.profile.measures.shoulder?.value,46);assert.equal(input.profile.estimates.shoulder,undefined);});

test('Output truncation retries once with a larger budget and the same evidence',async()=>{
 const old=globalThis.fetch,bodies:any[]=[];let reservations=0;
 globalThis.fetch=async(_u,init)=>{bodies.push(JSON.parse(String(init?.body)));return new Response(JSON.stringify({stop_reason:bodies.length===1?'max_tokens':'end_turn',content:[{type:'text',text:JSON.stringify({size:null,summary:'Completed assessment',reasons:[],limitations:[]})}]}));};
 try{await requestReview(inputForReview(page,product,profile,[]),'anthropic','test','fake',async()=>{reservations++;return true;});assert.equal(bodies.length,2);assert.equal(reservations,1);assert.ok(bodies[1].max_tokens>bodies[0].max_tokens);assert.deepEqual(bodies[1].messages,bodies[0].messages);}finally{globalThis.fetch=old;}
});
test('Repeated truncation stops and a denied retry budget makes no extra request',async()=>{
 const old=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;return new Response(JSON.stringify({stop_reason:'max_tokens',content:[]}));};
 try{const input=inputForReview(page,product,profile,[]);await assert.rejects(requestReview(input,'anthropic','test','fake',async()=>false),/limit prevents/);assert.equal(calls,1);calls=0;await assert.rejects(requestReview(input,'anthropic','test','fake',async()=>true),/cut off/);assert.equal(calls,2);}finally{globalThis.fetch=old;}
});

test('A poor overall garment match cannot recommend the only available size',()=>{
 const one={...product,sizes:[{...product.sizes[0],measures:{...product.sizes[0].measures,length:66}}]};const input=inputForReview(page,one,profile,[],'Loose fit, adequate coverage.');
 const review=validateReview({size:one.sizes[0].label,summary:'Only size',overallFit:{label:'Poor fit',reason:'The cut is too short for your desired coverage.'},checks:{width:'Roomy',length:'Too short',sleeves:'Unknown'},ratings:input.decision.scoring.sizes.map(s=>({size:s.label,width:90,length:25,style:30,sleeves:null,reason:'Too short despite adequate chest room.'})),reasons:[],limitations:[]},one,input);
 assert.equal(review.size,null);assert.equal(review.overallFit?.label,'Poor fit');assert.match(review.summary,/Too short/i);
});

test('Chest room uses actual arithmetic and keeps shoulder fit separate',()=>{
 const tee:Product={...product,name:'T-shirt',sizes:[{label:'M',available:true,measures:{chest:56,length:70}},{label:'L',available:true,measures:{chest:58.5,length:72}}]};
 const user:Profile={...profile,measures:{chest:{value:108,uncertainty:0}}};
 const input=inputForReview(page,tee,user,[]);
 assert.deepEqual(input.decision.chestRoom.map(s=>s.easeAtCentralValue),[4,9]);assert.deepEqual(input.decision.chestRoom[0].easeRange,[4,4]);assert.match(input.decision.chestRoom[0].shoulderFit,/Not established/);
 const estimated=inputForReview(page,tee,{...user,measures:{chest:{value:108,uncertainty:12,estimated:true}}},[]);
 assert.deepEqual(estimated.decision.chestRoom[0].easeRange,[-8,16]);assert.equal(estimated.decision.chestRoom[0].bodySource,'estimate');
 assert.deepEqual(inputForReview(page,{...tee,measurementType:'body',flat:false},user,[]).decision.chestRoom,[]);
});

test('Returned hoodie feedback excludes tried and shorter sizes across collection URLs',()=>{
 const hoodie={...product,sizes:[{label:'M',available:true,measures:{chest:60.5,length:66}},{label:'L',available:true,measures:{chest:63,length:68}},{label:'XL',available:true,measures:{chest:65.5,length:70}}]};
 const input=inputForReview({...page,url:'https://example.test/collections/hoodies/products/hoodie'},hoodie,profile,[{name:page.name,url:page.url,size:'L',value:'Too short; Sleeves too short; Hem too tight',note:'Returning it.'}], 'Prefer wider, not too long.',[{name:page.name,url:page.url,size:'L',reason:'Old bookmark',category:'top',product:hoodie,savedAt:1}]);
 assert.deepEqual(input.decision.eligibleSizes,['XL']);assert.equal(input.decision.fittedSizes.length,0);
 assert.throws(()=>validateReview({size:'L',summary:'L fits',reasons:[],limitations:[]},hoodie,input),/contradicted/);
});
