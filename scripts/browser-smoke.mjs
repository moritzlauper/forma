import {chromium} from 'playwright';
import {cp,readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const temp=await mkdtemp(join(tmpdir(),'forma-e2e-'));
const extension=join(temp,'extension');await cp(fileURLToPath(new URL('../dist',import.meta.url)),extension,{recursive:true});
const manifest=JSON.parse(await readFile(join(extension,'manifest.json'),'utf8'));
// Only this isolated test copy has pre-granted permissions. The shipped manifest
// continues to request optional site permissions through the normal user flow.
manifest.host_permissions=['http://*/*','https://*/*'];
await writeFile(join(extension,'manifest.json'),JSON.stringify(manifest));
const context=await chromium.launchPersistentContext(join(temp,'profile'),{channel:'chromium',headless:true,args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
try{
 const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
 const id=new URL(worker.url()).hostname;
 await worker.evaluate(async()=>{
  globalThis.testRequests=0;
  globalThis.fetch=async(_url,options)=>{
   globalThis.testRequests++;
   const body=JSON.parse(options.body);const content=body.messages[0].content;
   const input=JSON.parse(Array.isArray(content)?content[0].text:content);
   globalThis.testInput=input;
   if(input.product.name==='Body Guide Shorts')return new Response(JSON.stringify({content:[{type:'text',text:JSON.stringify({size:null,summary:'Body guide captured.',checks:{width:'Body waist range read.',length:'Body leg length, not shorts length.',sleeves:'Not applicable.'},ratings:[],reasons:[],limitations:[]})}]}));
   if(input.product.name==='Denim Shorts'){
    globalThis.shortsRequests=(globalThis.shortsRequests||0)+1;
    if(input.product.images.length)return new Response(JSON.stringify({error:{type:'invalid_request_error',message:'Could not process image'}}),{status:400});
    return new Response(JSON.stringify({content:[{type:'text',text:JSON.stringify({size:null,summary:'No measurements read.',checks:{width:'No garment measurements.',length:'Knee length.',sleeves:'Not applicable.'},ratings:[],reasons:[],limitations:[]})}]}));
   }
   const sizes=input.product.parsed.sizes;
   return new Response(JSON.stringify({content:[{type:'text',text:JSON.stringify({size:'34',summary:'Test assessment completed #'+globalThis.testRequests,checks:{width:'Flat waist width read.',length:'Generic garment length, not inseam.',sleeves:'Not applicable.'},ratings:sizes.map(s=>({size:s.label,width:s.label==='34'?90:60,length:s.label==='34'?85:60,style:70,sleeves:null,reason:'Synthetic test score.'})),reasons:[],limitations:['Synthetic test response.']})}]}));
  };
  await chrome.storage.local.set({apiKey:'fake-test-key',settings:{mode:'anthropic',model:'claude-haiku-5-5',assessmentVersion:1,limit:100,limitVersion:1},profile:{mode:'body',category:'trousers',name:'Test',fit:'relaxed',measures:{},context:{height:180,weight:75,waistLabel:'',style:'',concerns:[]}}});
 });
 const chart='<table><tr><td></td><td>32</td><td>34</td><td>36</td></tr><tr><td>WAIST ACROSS FRONT (CM)</td><td>43.5</td><td>46</td><td>48.5</td></tr><tr><td>LENGTH (CM)</td><td>110</td><td>112</td><td>114</td></tr></table>';
 const html=`<html><body><main><h1>Director Paint-Splattered Jeans</h1><button id="sizing" type="button">Sizing</button><div id="chart"></div><p>CHF 226</p><button>Add to cart</button></main><script>window.guideClicks=0;document.getElementById('sizing').onclick=()=>{window.guideClicks++;document.getElementById('chart').innerHTML=${JSON.stringify(chart)};};</script></body></html>`;
 const conversion='<div role="dialog"><h2>Grössentabelle</h2><p>Grössen und Masse können je nach Brand variieren.</p><div><div><span>EU</span><span>INT</span><span>FR</span><span>IT</span><span>UK</span><span>JEANS</span></div><div><span>50</span><span>L</span><span>50</span><span>50</span><span>40</span><span>34</span></div></div></div>';
 const shorts=`<html><head><meta property="og:image" content="https://images.example.test/shorts.jpg"></head><body><main><h1>Denim Shorts</h1><button type="button" aria-haspopup="dialog" id="guide">Grössenberater öffnen</button><p>Relaxed, knee length. CHF 30.</p><button>Add to cart</button></main><script>window.guideClicks=0;document.getElementById('guide').onclick=()=>{window.guideClicks++;document.body.insertAdjacentHTML('beforeend',${JSON.stringify(conversion)});};</script></body></html>`;
 const bodyTable='<h2>Körpermasse (cm)</h2><table><tr><th>EU</th><th>INT</th><th>TAILLENUMFANG</th><th>HÜFTUMFANG</th><th>BEINLÄNGE AN DER INNENSEITE</th></tr><tr><td>40</td><td>XXS</td><td>58.5</td><td>82.5</td><td>79.75</td></tr><tr><td>40</td><td>XXS</td><td>61</td><td>84</td><td>80</td></tr></table>';
 const lowerGuide=`<html><body><main><h1>Body Guide Shorts</h1><button type="button" id="guide">Grössenberater öffnen</button><p>CHF 30</p><button>Add to cart</button></main><script>document.getElementById('guide').onclick=()=>{const modal=document.createElement('div');modal.setAttribute('role','dialog');modal.style='height:200px;overflow:auto';modal.innerHTML=${JSON.stringify(conversion.replace('<div role="dialog">','<div>')+'<div style="height:600px"></div><div id="body-measurements"></div>')};document.body.append(modal);modal.onscroll=()=>{if(modal.scrollTop>200&&!document.querySelector('#body-measurements table'))document.getElementById('body-measurements').innerHTML=${JSON.stringify(bodyTable)};};};</script></body></html>`;
 await context.route('http://127.0.0.1:43119/**',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:route.request().url().endsWith('/body-shorts')?lowerGuide:route.request().url().endsWith('/denim-shorts')?shorts:html}));
 const shop=await context.newPage();await shop.goto('http://127.0.0.1:43119/collections/trousers/products/director-jeans-grey');
 assert.equal(await shop.evaluate(()=>!!window.formaReader),false);
 const panel=await context.newPage();const errors=[];panel.on('pageerror',e=>errors.push(e.message));
 await panel.goto(`chrome-extension://${id}/index.html`);await shop.bringToFront();
 await panel.getByRole('heading',{name:'Estimated size: 34',exact:true}).waitFor({timeout:15000});
 const input=await worker.evaluate(()=>globalThis.testInput);
 assert.equal(input.product.parsed.flat,true);assert.equal(input.product.parsed.category,'trousers');
 assert.equal(input.product.parsed.sizes[1].measures.waist,46);assert.equal(input.product.parsed.sizes[1].measures.length,112);assert.equal(input.product.parsed.sizes[1].measures.inseam,undefined);
 assert.equal(await shop.evaluate(()=>window.guideClicks),1);
 assert.equal(await worker.evaluate(()=>globalThis.testRequests),1);
 await panel.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Refresh').click());
 await panel.getByText('Test assessment completed #2',{exact:true}).waitFor({timeout:10000});
 assert.equal(await worker.evaluate(()=>globalThis.testRequests),2);
 await worker.evaluate(async()=>{const [tab]=await chrome.tabs.query({active:true,currentWindow:true});await chrome.tabs.sendMessage(tab.id,{type:'refresh'});});
 await panel.getByText('AI ASSESSMENT · CACHED',{exact:true}).waitFor({timeout:10000});
 assert.equal(await worker.evaluate(()=>globalThis.testRequests),2);
 // Simulate the invalidated reader left in an open tab after extension reload:
 // matching guard, but no live message listener. Refresh must repair it.
 await worker.evaluate(async()=>{const [tab]=await chrome.tabs.query({active:true,currentWindow:true});await chrome.scripting.executeScript({target:{tabId:tab.id},func:()=>{window.formaReader.dispose();window.formaReader={protocol:'forma-reader-v2',dispose(){throw Error('Extension context invalidated');}};}});});
 await panel.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Refresh').click());
 await panel.getByText('Test assessment completed #3',{exact:true}).waitFor({timeout:10000});
 assert.equal(await worker.evaluate(()=>globalThis.testRequests),3);
 const beforeSave=await worker.evaluate(()=>globalThis.testRequests);
 await panel.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='☆ Save as a good fit').click());
 await panel.getByText('✓ Saved as a good fit',{exact:true}).waitFor();
 await panel.waitForTimeout(900);
 assert.equal(await worker.evaluate(()=>globalThis.testRequests),beforeSave,'Saving a scan must use no AI requests');
 const savedScan=await worker.evaluate(async()=> (await chrome.storage.local.get('scanLibrary')).scanLibrary.find(r=>r.url.endsWith('/director-jeans-grey')));
 assert.equal(savedScan.measurements.find(m=>m.size==='34'&&m.key==='waist').cm[0],92);
 await panel.getByText('Your good fit · optional details',{exact:true}).click();
 await panel.getByLabel('Size that actually fits you · optional').selectOption('34');
 await panel.getByLabel('What do you like? · optional').fill('Good full length and roomy legs.');
 await panel.getByRole('button',{name:'Save details',exact:true}).click();
 await panel.getByText('Details saved. Future assessments use this example.',{exact:true}).waitFor();
 const favourites=await worker.evaluate(async()=> (await chrome.storage.local.get('goodFits')).goodFits);
 assert.equal(favourites.length,1);assert.equal(favourites[0].size,'34');assert.equal(favourites[0].reason,'Good full length and roomy legs.');
 await shop.goto('http://127.0.0.1:43119/products/another-jeans');await shop.bringToFront();
 for(let i=0;i<50;i++){if(await worker.evaluate(()=>globalThis.testInput?.product.parsed?.source.endsWith('/another-jeans')))break;await new Promise(resolve=>setTimeout(resolve,100));}
 const learned=await worker.evaluate(()=>globalThis.testInput);
 assert.ok(learned.product.parsed.source.endsWith('/another-jeans'));assert.equal(learned.profile.goodFits[0].size,'34');assert.equal(learned.profile.goodFits[0].reason,'Good full length and roomy legs.');assert.equal(learned.profile.goodFits[0].measurements.values.waist,46);
 await worker.evaluate(async()=>{const data=await chrome.storage.local.get('goodFits');await chrome.storage.local.set({goodFits:[...data.goodFits,{url:'http://127.0.0.1:43119/products/denim-shorts',name:'Denim Shorts',category:'trousers',product:null,size:'L',reason:'Fits well.',savedAt:1}]});});
 await shop.goto('http://127.0.0.1:43119/products/denim-shorts');await shop.bringToFront();
 await panel.getByRole('heading',{name:'Your recorded fit: L',exact:true}).waitFor({timeout:15000});
 await panel.getByText('No product photos assessed. Visual cut and hem details may be unknown.',{exact:true}).waitFor();
 await panel.getByText('The AI service could not process the product photos. This assessment used text and sizing only.',{exact:true}).waitFor();
 const shortsInput=await worker.evaluate(()=>globalThis.testInput);
 assert.equal(shortsInput.product.parsed,null);assert.equal(shortsInput.product.conversions.length,1);assert.equal(shortsInput.product.conversions[0].rows[0][1],'L');
 assert.equal(await shop.evaluate(()=>window.guideClicks),1);assert.equal(await worker.evaluate(()=>globalThis.shortsRequests),2);
 assert.equal(await worker.evaluate(async()=> (await chrome.storage.local.get('aiCount')).aiCount),await worker.evaluate(()=>globalThis.testRequests));
 await shop.goto('http://127.0.0.1:43119/products/body-shorts');await shop.bringToFront();
 await panel.getByText('Body guide captured.',{exact:true}).waitFor({timeout:15000});
 const bodyInput=await worker.evaluate(()=>globalThis.testInput);
 assert.equal(bodyInput.product.charts.length,2);assert.equal(bodyInput.product.parsed.measurementType,'body');assert.deepEqual(bodyInput.product.parsed.sizes[0].measures.waist,[58.5,61]);
 assert.equal(await panel.getByRole('button',{name:'✓ Analysed',exact:true}).isDisabled(),true);
 assert.equal(await panel.getByRole('button',{name:'✓ Analysed',exact:true}).getAttribute('class'),null);
 assert.equal(await shop.getByRole('dialog').evaluate(e=>e.scrollTop),0);
 await panel.bringToFront();
 await panel.getByRole('button',{name:/03.*Settings/}).click();
 await panel.getByRole('button',{name:'Enable automatic detection on all shops',exact:true}).click();
 await panel.getByRole('button',{name:'✓ Automatic detection is active',exact:true}).waitFor();
 assert.ok((await worker.evaluate(()=>chrome.scripting.getRegisteredContentScripts())).some(s=>s.id==='all-shops'));
 await panel.getByRole('button',{name:/02.*Your profile/}).click();
 await panel.getByLabel('Usual shoe size · EU').fill('45');
 await panel.getByLabel('Usual shoe size · EU').blur();
 await panel.waitForFunction(async()=> (await chrome.storage.local.get('profile')).profile.context.shoeSizeEU==='45');
 assert.deepEqual(errors,[]);
 if(process.env.FORMA_SCREENSHOT)await panel.screenshot({path:process.env.FORMA_SCREENSHOT,fullPage:true});
 console.log(JSON.stringify({result:'passed',automaticReaderInjection:true,lazySizingClicks:1,parsedWaist:46,parsedLength:112,freshRefresh:true,automaticCacheReuse:true,bookmarkUsesNoAI:true,evidenceSaved:true,allShopsEnabledFromExtensionPage:true,shoeSizeSaved:true,lowerBodyTableRead:true,analysedButtonDisabled:true,optionalSizeAndReasonSaved:true,futureAssessmentUsesSavedExample:true,germanModalOpens:true,conversionNotCentimetres:true,knownFitWithoutChart:true,rejectedPhotoRecovery:true,retryCountedInBudget:true,panelErrors:errors}));
}finally{await context.close();await rm(temp,{recursive:true,force:true});}
