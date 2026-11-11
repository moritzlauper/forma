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
   const chartRatings=input.decision.scoring.sizes.map(s=>({size:s.label,width:s.label==='34'||s.label==='L'?80:50,length:70,style:65,sleeves:null,reason:'Synthetic fit score.'}));
   if(globalThis.holdNext){globalThis.holdNext=false;globalThis.held=true;await new Promise(resolve=>globalThis.releaseHeld=resolve);}
   if(input.product.name==='Odessa Jeans')return new Response(JSON.stringify({content:[{type:'text',text:JSON.stringify({size:'34',summary:'I would try 34 from the read chart and usual waist label.',checks:{width:'Published waist value is 46 cm; the width convention is uncertain.',length:'Published length is 107 cm, longer than 32 at 105 cm; endpoints unknown.',sleeves:'Not applicable.'},ratings:chartRatings,reasons:[],limitations:[]})}]}));
   if(input.product.name==='Model Jeans')return new Response(JSON.stringify({content:[{type:'text',text:JSON.stringify({size:'34 x 32',summary:'I would try W34 L32 using your usual waist label and the similarly tall model.',checks:{width:'W34 matches the usual waist label; loose is a cut description.',length:'The 186 cm model wears L32; this is a tentative length reference.',sleeves:'Not applicable.'},ratings:[],reasons:[],limitations:[]})}]}));
   if(input.product.name==='Body Guide Shorts')return new Response(JSON.stringify({content:[{type:'text',text:JSON.stringify({size:input.product.parsed?null:'L',summary:input.product.parsed?'Body guide captured.':'I would try L from the guide labels.',checks:{width:'Body waist range read.',length:'Body leg length, not shorts length.',sleeves:'Not applicable.'},ratings:chartRatings,reasons:[],limitations:[]})}]}));
   if(input.product.name==='Denim Shorts'){
    globalThis.shortsRequests=(globalThis.shortsRequests||0)+1;
    if(input.product.images.length)return new Response(JSON.stringify({error:{type:'invalid_request_error',message:'Could not process image'}}),{status:400});
    return new Response(JSON.stringify({content:[{type:'text',text:JSON.stringify({size:null,summary:'No measurements read.',checks:{width:'No garment measurements.',length:'Knee length.',sleeves:'Not applicable.'},ratings:[],reasons:[],limitations:[]})}]}));
   }
   const sizes=input.product.parsed.sizes;
   return new Response(JSON.stringify({content:[{type:'text',text:JSON.stringify({size:'34',summary:'Test assessment completed #'+globalThis.testRequests,checks:{width:'Flat waist width read.',length:'Generic garment length, not inseam.',sleeves:'Not applicable.'},ratings:sizes.map(s=>({size:s.label,width:s.label==='34'?90:60,length:s.label==='34'?85:60,style:70,sleeves:null,reason:'Synthetic test score.'})),reasons:[],limitations:['Synthetic test response.']})}]}));
  };
  await chrome.storage.local.set({apiKey:'fake-test-key',settings:{mode:'anthropic',model:'claude-haiku-5-5',assessmentVersion:1,limit:100,limitVersion:1},profile:{mode:'body',category:'trousers',name:'Test',fit:'relaxed',measures:{},context:{height:180,weight:75,waistLabel:'',style:'Urban / Alternativeeeee',concerns:[]}}});
 });
 const chart='<table><tr><td></td><td>32</td><td>34</td><td>36</td></tr><tr><td>WAIST ACROSS FRONT (CM)</td><td>43.5</td><td>46</td><td>48.5</td></tr><tr><td>LENGTH (CM)</td><td>110</td><td>112</td><td>114</td></tr></table>';
 const html=`<html><body><main><h1>Director Paint-Splattered Jeans</h1><button id="sizing" type="button">Sizing</button><div id="chart"></div><p>CHF 226</p><button>Add to cart</button></main><script>window.guideClicks=0;document.getElementById('sizing').onclick=()=>{window.guideClicks++;document.getElementById('chart').innerHTML=${JSON.stringify(chart)};};</script></body></html>`;
 const conversion='<div role="dialog"><h2>Grössentabelle</h2><p>Grössen und Masse können je nach Brand variieren.</p><div><div><span>EU</span><span>INT</span><span>FR</span><span>IT</span><span>UK</span><span>JEANS</span></div><div><span>50</span><span>L</span><span>50</span><span>50</span><span>40</span><span>34</span></div></div></div>';
 const shorts=`<html><head><meta property="og:image" content="https://images.example.test/shorts.jpg"></head><body><main><h1>Denim Shorts</h1><button type="button" aria-haspopup="dialog" id="guide">Grössenberater öffnen</button><p>Relaxed, knee length. CHF 30.</p><button>Add to cart</button></main><script>window.guideClicks=0;document.getElementById('guide').onclick=()=>{window.guideClicks++;document.body.insertAdjacentHTML('beforeend',${JSON.stringify(conversion)});};</script></body></html>`;
 const bodyTable='<h2>Körpermasse (cm)</h2><table><tr><th>EU</th><th>INT</th><th>TAILLENUMFANG</th><th>HÜFTUMFANG</th><th>BEINLÄNGE AN DER INNENSEITE</th></tr><tr><td>40</td><td>XXS</td><td>58.5</td><td>82.5</td><td>79.75</td></tr><tr><td>40</td><td>XXS</td><td>61</td><td>84</td><td>80</td></tr><tr><td>50</td><td>L</td><td>84</td><td>102</td><td>83</td></tr></table>';
 const lowerGuide=`<html><body><main><h1>Body Guide Shorts</h1><button type="button" id="guide">Grössenberater öffnen</button><p>CHF 30</p><button>Add to cart</button></main><script>document.getElementById('guide').onclick=()=>{const modal=document.createElement('div');modal.setAttribute('role','dialog');modal.style='height:200px;overflow:auto';modal.innerHTML=${JSON.stringify(conversion.replace('<div role="dialog">','<div>')+'<div style="height:600px"></div><div id="body-measurements"></div>')};document.body.append(modal);modal.onscroll=()=>{if(modal.scrollTop>200&&!document.querySelector('#body-measurements table'))document.getElementById('body-measurements').innerHTML=${JSON.stringify(bodyTable)};};};</script></body></html>`;
 const modelPage='<html><body><main><h1>Model Jeans</h1><p>Loose baggy fit. CHF 60</p><p>The model is 1.86m tall and is wearing size 32 x 32 (Inches)</p><select aria-label="Size"><option selected>24 x 32</option><option>32 x 32</option><option>34 x 32</option></select><button>Add to cart</button><span aria-live="polite" id="clock">1</span></main></body></html>';
 const odessaChart='<table><tr><td></td><td>26</td><td>28</td><td>30</td><td>32</td><td>34</td><td>36</td></tr><tr><td>WAIST (CM)</td><td>36</td><td>38.5</td><td>41</td><td>43.5</td><td>46</td><td>48.5</td></tr><tr><td>LENGTH (CM)</td><td>99</td><td>101</td><td>103</td><td>105</td><td>107</td><td>108</td></tr><tr><td>THIGH (CM)</td><td>28</td><td>29</td><td>30</td><td>31</td><td>32</td><td>33</td></tr></table>';
 const odessa=html.replace('Director Paint-Splattered Jeans','Odessa Jeans').replace(JSON.stringify(chart),JSON.stringify(odessaChart));
 await context.route('http://127.0.0.1:43119/**',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:route.request().url().endsWith('/odessa')?odessa:route.request().url().endsWith('/model-jeans')?modelPage:route.request().url().endsWith('/body-unitless')?lowerGuide.replace('Körpermasse (cm)','Körpermasse'):route.request().url().endsWith('/body-shorts')?lowerGuide:route.request().url().endsWith('/denim-shorts')?shorts:html}));
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
 await panel.getByText('Test assessment completed #2',{exact:true}).waitFor({state:'attached',timeout:10000});
 assert.equal(await worker.evaluate(()=>globalThis.testRequests),2);
 await worker.evaluate(async()=>{const [tab]=await chrome.tabs.query({active:true,currentWindow:true});await chrome.tabs.sendMessage(tab.id,{type:'refresh',reassess:true});});
 await panel.getByText('AI ASSESSMENT · CACHED',{exact:true}).waitFor({timeout:10000});
 assert.equal(await worker.evaluate(()=>globalThis.testRequests),2);
 // Simulate the invalidated reader left in an open tab after extension reload:
 // matching guard, but no live message listener. Refresh must repair it.
 await worker.evaluate(async()=>{const [tab]=await chrome.tabs.query({active:true,currentWindow:true});await chrome.scripting.executeScript({target:{tabId:tab.id},func:()=>{window.formaReader.dispose();window.formaReader={protocol:'forma-reader-v2',dispose(){throw Error('Extension context invalidated');}};}});});
 await panel.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Refresh').click());
 await panel.getByText('Test assessment completed #3',{exact:true}).waitFor({state:'attached',timeout:10000});
 assert.equal(await worker.evaluate(()=>globalThis.testRequests),3);
 const beforeSave=await worker.evaluate(()=>globalThis.testRequests);
 await panel.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='☆ Save as a good fit').click());
 await panel.getByText('✓ Saved as a good fit',{exact:true}).waitFor();
 await panel.waitForTimeout(900);
 assert.equal(await worker.evaluate(()=>globalThis.testRequests),beforeSave,'Saving a scan must use no AI requests');
 const savedScan=await worker.evaluate(async()=> (await chrome.storage.local.get('scanLibrary')).scanLibrary.find(r=>r.url.endsWith('/director-jeans-grey')));
 assert.equal(savedScan.measurements.find(m=>m.size==='34'&&m.key==='waist').cm[0],92);
 await panel.getByText('Your good fit · optional details',{exact:true}).click();
 await panel.getByLabel('Size you wore · optional').fill('34');
 await panel.getByLabel('Fit details · optional').fill('Good full length and roomy legs.');
 await panel.getByRole('button',{name:'Save feedback',exact:true}).click();
 await panel.getByText('Feedback saved.',{exact:true}).waitFor();
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
 await panel.getByText('The AI service could not process the product photos. This assessment used text and sizing only.',{exact:true}).waitFor({state:'attached'});
 const shortsInput=await worker.evaluate(()=>globalThis.testInput);
 assert.equal(shortsInput.product.parsed,null);assert.equal(shortsInput.product.conversions.length,1);assert.equal(shortsInput.product.conversions[0].rows[0][1],'L');
 assert.equal(await shop.evaluate(()=>window.guideClicks),1);assert.equal(await worker.evaluate(()=>globalThis.shortsRequests),2);
 assert.equal(await worker.evaluate(async()=> (await chrome.storage.local.get('aiCount')).aiCount),await worker.evaluate(()=>globalThis.testRequests));
 await shop.goto('http://127.0.0.1:43119/products/body-shorts');await shop.bringToFront();
 await panel.getByText('Body guide captured.',{exact:true}).waitFor({state:'attached',timeout:15000});
 const bodyInput=await worker.evaluate(()=>globalThis.testInput);
 assert.equal(bodyInput.product.charts.length,2);assert.equal(bodyInput.product.parsed.measurementType,'body');assert.deepEqual(bodyInput.product.parsed.sizes[0].measures.waist,[58.5,61]);
 assert.equal(await panel.getByRole('button',{name:'✓ Analysed',exact:true}).isDisabled(),true);
 assert.equal(await panel.getByRole('button',{name:'✓ Analysed',exact:true}).getAttribute('class'),null);
 assert.equal(await shop.getByRole('dialog').evaluate(e=>e.scrollTop),0);
 await shop.goto('http://127.0.0.1:43119/products/body-unitless');await shop.bringToFront();
 await panel.getByRole('heading',{name:'Estimated size: L',exact:true}).waitFor({timeout:15000});
 const unitless=await worker.evaluate(()=>globalThis.testInput);assert.equal(unitless.product.parsed,null);assert.equal(unitless.decision.canSelectSize,true);assert.equal(unitless.product.measurementTables[0].unit,null);
 await shop.goto('http://127.0.0.1:43119/products/model-jeans');await shop.bringToFront();
 await panel.getByRole('heading',{name:'Estimated size: 34 x 32',exact:true}).waitFor({timeout:15000});
 const modelInput=await worker.evaluate(()=>globalThis.testInput);assert.equal(modelInput.product.listingEvidence.models[0].heightCm,186);assert.ok(modelInput.product.sourceHTML.includes('32 x 32'));assert.equal(modelInput.product.parsed,null);
 const stableRequests=await worker.evaluate(()=>globalThis.testRequests);
 await shop.evaluate(()=>{window.removedFitCards=0;new MutationObserver(records=>{for(const r of records)if([...r.removedNodes].some(n=>n.id==='forma-fit-card'))window.removedFitCards++;}).observe(document.body,{childList:true});});
 for(let i=0;i<3;i++){await shop.locator('#clock').evaluate((e,value)=>e.textContent=String(value),i);await panel.waitForTimeout(800);}
 assert.equal(await worker.evaluate(()=>globalThis.testRequests),stableRequests);assert.equal(await shop.evaluate(()=>window.removedFitCards),0,'Unrelated DOM changes must not flicker the card');
 const box=await shop.locator('#forma-fit-card').boundingBox();assert.ok(box);await shop.mouse.click(box.x+box.width-23,box.y+21);
 await shop.locator('#forma-fit-card').waitFor({state:'detached'});
 await shop.locator('#clock').evaluate(e=>e.textContent='changed after close');await panel.waitForTimeout(800);
 assert.equal(await shop.locator('#forma-fit-card').count(),0);assert.equal(await worker.evaluate(()=>globalThis.testRequests),stableRequests);
 await panel.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Show popup').click());
 await shop.locator('#forma-fit-card').waitFor();assert.equal(await worker.evaluate(()=>globalThis.testRequests),stableRequests,'Showing a saved popup uses zero AI requests');
 const reopened=await shop.locator('#forma-fit-card').boundingBox();await shop.mouse.click(reopened.x+reopened.width-23,reopened.y+21);
 await shop.reload();await shop.bringToFront();await panel.waitForTimeout(1200);
 assert.equal(await shop.locator('#forma-fit-card').count(),0,'Dismissal survives reader reinjection and reload');
 await panel.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Refresh').click());
 await shop.locator('#forma-fit-card').waitFor();assert.equal(await worker.evaluate(()=>globalThis.testRequests),stableRequests+1);

 // Opening the editor is stubbed in headless Chromium; the click, message,
 // saved evidence and mounted editor are real extension code.
 await worker.evaluate(()=>{chrome.sidePanel.open=async({tabId})=>{globalThis.openedFitTab=tabId;};});
 const popupRequests=await worker.evaluate(()=>globalThis.testRequests);
 let popupBox=await shop.locator('#forma-fit-card').boundingBox();
 await shop.mouse.click(popupBox.x+75,popupBox.y+popupBox.height-33);
 await panel.locator('#popup-fit-editor').getByRole('heading',{name:'Your fit feedback',exact:true}).waitFor();
 assert.ok(await worker.evaluate(()=>globalThis.openedFitTab));
 await panel.locator('#popup-fit-editor').getByLabel('Size you wore · optional').fill('34 x 32');
 await panel.locator('#popup-fit-editor').getByLabel('Fit details · optional').fill('Roomy legs');
 await panel.locator('#popup-fit-editor').getByRole('button',{name:'Save feedback',exact:true}).click();
 await panel.locator('#popup-fit-editor').getByText('Feedback saved.').waitFor();
 assert.equal(await worker.evaluate(()=>globalThis.testRequests),popupRequests);
 await shop.bringToFront();popupBox=await shop.locator('#forma-fit-card').boundingBox();
 await shop.mouse.click(popupBox.x+220,popupBox.y+popupBox.height-33);
 await panel.locator('#popup-fit-editor').getByRole('heading',{name:'Your fit feedback',exact:true}).waitFor();
 assert.equal(await worker.evaluate(()=>globalThis.testRequests),popupRequests);
 assert.ok(await panel.locator('#popup-fit-editor').getByRole('button',{name:'Save feedback',exact:true}).isDisabled(),'Never invent a tried size');
 const fitEditor=panel.locator('#popup-fit-editor');
 const feedbackBefore=await worker.evaluate(async()=>(await chrome.storage.local.get('feedback')).feedback||[]);
 assert.ok(await fitEditor.getByRole('button',{name:'Save feedback',exact:true}).isDisabled());
 await fitEditor.getByLabel('Size you wore',{exact:true}).fill('34 x 32');
 const fitComment='Gut, könnte 1–2 cm länger sein, aber auch so geht es. Die Breite ist gut.';
 await fitEditor.getByLabel('Fit details · optional').fill(fitComment);
 await fitEditor.getByText('Quick labels · optional',{exact:true}).click();
 await fitEditor.getByRole('button',{name:'Too short',exact:true}).click();
 assert.equal(await fitEditor.getByRole('button',{name:'Too short',exact:true}).getAttribute('aria-pressed'),'true');
 assert.deepEqual(await worker.evaluate(async()=>(await chrome.storage.local.get('feedback')).feedback||[]),feedbackBefore,'Selecting a category must not save prematurely');
 await fitEditor.getByRole('button',{name:'Too short',exact:true}).click();
 await fitEditor.getByRole('button',{name:'Save feedback',exact:true}).click();
 await fitEditor.waitFor({state:'detached'});
 const storedFeedback=await worker.evaluate(async()=>(await chrome.storage.local.get('feedback')).feedback);
 assert.equal(storedFeedback.length,feedbackBefore.length+1);
 assert.equal(storedFeedback[0].size,'34 x 32');assert.equal(storedFeedback[0].note,fitComment);
 assert.equal(storedFeedback[0].value,'Fit note','Free text must not be mislabelled as Too short or Fits');
 assert.equal(storedFeedback[0].url,'http://127.0.0.1:43119/products/model-jeans');
 for(let i=0;i<100;i++){if(await worker.evaluate(note=>globalThis.testInput?.feedback?.some(f=>f.note===note),fitComment))break;await panel.waitForTimeout(100);}
 assert.ok(await worker.evaluate(note=>globalThis.testInput.feedback.some(f=>f.note===note),fitComment),'The full note must reach the next assessment');
 await shop.goto('http://127.0.0.1:43119/products/odessa');await shop.bringToFront();
 await panel.getByRole('heading',{name:'Estimated size: 34',exact:true}).waitFor({timeout:15000});
 const odessaInput=await worker.evaluate(()=>globalThis.testInput);
 await panel.getByText('Compare sizes',{exact:true}).waitFor();
 await panel.locator('.fit-score').filter({hasText:/Fair fit|Good fit|Mostly good fit|Very good fit|Excellent fit/}).waitFor();
 assert.doesNotMatch(await panel.locator('.fit-score').innerText(),/\/100/);
 const explanation=panel.locator('.verdict details');assert.equal(await explanation.getAttribute('open'),null);
 await explanation.locator('summary').click();assert.notEqual(await explanation.getAttribute('open'),null);await explanation.locator('summary').click();
 const beforeDrag=await shop.locator('#forma-fit-card').boundingBox();
 await shop.mouse.move(beforeDrag.x+65,beforeDrag.y+25);await shop.mouse.down();await shop.mouse.move(beforeDrag.x-85,beforeDrag.y-75,{steps:8});await shop.mouse.up();
 const afterDrag=await shop.locator('#forma-fit-card').boundingBox();assert.ok(afterDrag.x<beforeDrag.x-100);assert.ok(afterDrag.y<beforeDrag.y-50);
 const requestsBeforeMove=await worker.evaluate(()=>globalThis.testRequests);
 await shop.mouse.move(afterDrag.x+65,afterDrag.y+25);await shop.mouse.down();await shop.mouse.move(-500,-500,{steps:8});await shop.mouse.up();
 const clamped=await shop.locator('#forma-fit-card').boundingBox();assert.ok(clamped.x>=0&&clamped.y>=0,'Dragged popup stays reachable');assert.equal(await worker.evaluate(()=>globalThis.testRequests),requestsBeforeMove);

 if(process.env.FORMA_FIT_SCREENSHOT){await panel.setViewportSize({width:430,height:900});await panel.locator('.fit-score').scrollIntoViewIfNeeded();await panel.screenshot({path:process.env.FORMA_FIT_SCREENSHOT});await shop.screenshot({path:process.env.FORMA_FIT_SCREENSHOT.replace('.png','-popup.png')});}
 assert.equal(odessaInput.product.parsed,null);assert.equal(odessaInput.product.measurementTables[0].rows.length,6);
 assert.equal(odessaInput.product.measurementTables[0].rows[4][2],'107');assert.equal(odessaInput.decision.canSelectSize,true);
 await panel.bringToFront();
 await panel.getByRole('button',{name:/03.*Settings/}).click();
 await panel.getByRole('button',{name:'Enable automatic detection on all shops',exact:true}).click();
 await panel.getByRole('button',{name:'✓ Automatic detection is active',exact:true}).waitFor();
 assert.ok((await worker.evaluate(()=>chrome.scripting.getRegisteredContentScripts())).some(s=>s.id==='all-shops'));
 await panel.getByRole('button',{name:/02.*Your profile/}).click();
 await panel.getByLabel('Usual shoe size · EU').fill('45');
 await panel.getByLabel('Build & proportions').fill('Broad shoulders and chest relative to height.');
 await panel.getByRole('button',{name:'Save profile',exact:true}).click();
 await panel.waitForFunction(async()=> (await chrome.storage.local.get('profile')).profile.context.shoeSizeEU==='45');
 // Notes saving must remain available while a real product request is pending.
 await shop.bringToFront();await panel.waitForTimeout(1000);
 await worker.evaluate(()=>{globalThis.holdNext=true;});
 await panel.getByRole('button',{name:/01.*Your fit/}).click();
 await panel.getByRole('button',{name:'Refresh',exact:true}).click();
 for(let i=0;i<100;i++){if(await worker.evaluate(()=>globalThis.held))break;await panel.waitForTimeout(100);}
 assert.ok(await worker.evaluate(()=>globalThis.held));
 await panel.getByRole('button',{name:/02.*Your profile/}).click();
 const beforeNotes=await worker.evaluate(()=>globalThis.testRequests);
 const notes='waist 46cm bei hosen sind mir gerade noch knapp okay, lieber bisschen grösser, darunter lieber nicht. Beine bitte nicht noch weiter.';
 await panel.getByLabel('Add a fit note').fill(notes);
 assert.ok(await panel.getByRole('button',{name:'Save note',exact:true}).isEnabled(),'Saving cannot wait for AI');
 await panel.getByRole('button',{name:'Save note',exact:true}).click();
 await panel.waitForFunction(async text=>(await chrome.storage.local.get('description')).description===text,notes);
 await panel.waitForFunction(()=>document.querySelector('.profile-notes textarea')?.value==='');
 assert.equal(await worker.evaluate(()=>globalThis.testRequests),beforeNotes,'Saving notes uses no AI');
 await panel.getByText('Saved fit notes',{exact:true}).click();
 await panel.getByText(notes,{exact:true}).waitFor();
 await panel.getByText('Optional: fill basic profile fields',{exact:true}).click();
 await panel.getByRole('button',{name:'Find basic details',exact:true}).click();
 await panel.getByText('No supported details found yet.',{exact:true}).waitFor();
 assert.notEqual(await worker.evaluate(async()=>(await chrome.storage.local.get('profile')).profile.context.waistLabel),'W46');
 await worker.evaluate(()=>globalThis.releaseHeld());
 await panel.waitForFunction(async()=>Object.values(await chrome.storage.session.get(null)).some(v=>v?.name==='Odessa Jeans'&&v.assessment?.status==='ready'));
 await panel.getByRole('button',{name:'Update this item with saved notes',exact:true}).click();
 await panel.getByText('AI ASSESSMENT · COMPLETED',{exact:true}).waitFor({timeout:15000});
 assert.equal(await worker.evaluate(()=>globalThis.testInput.profile.description),notes);
 assert.equal(await worker.evaluate(()=>globalThis.testInput.profile.context.bodyShape),'Broad shoulders and chest relative to height.');
 assert.equal(await worker.evaluate(()=>globalThis.testRequests),beforeNotes+1);
 assert.equal(await panel.getByRole('heading',{name:'Estimated size: 34',exact:true}).count(),1);
 const reopeningRequests=await worker.evaluate(()=>globalThis.testRequests);
 for(let i=0;i<3;i++){await panel.reload();await shop.bringToFront();await panel.waitForTimeout(700);}
 assert.equal(await worker.evaluate(()=>globalThis.testRequests),reopeningRequests,'Reopening the extension does not make AI calls');
 assert.equal(await worker.evaluate(async()=>(await chrome.storage.local.get('profile')).profile.context.style),'Urban / Alternative');
 await panel.getByRole('button',{name:/02.*Your profile/}).click();
 assert.equal(await panel.getByLabel('Add a fit note').inputValue(),'');
 await panel.getByText('Saved fit notes',{exact:true}).click();
 await panel.getByText(notes,{exact:true}).waitFor();
 await panel.getByRole('button',{name:'Update this item with saved notes',exact:true}).click();
 await panel.getByText('AI ASSESSMENT · CACHED',{exact:true}).waitFor({timeout:15000});
 assert.equal(await worker.evaluate(()=>globalThis.testRequests),beforeNotes+1,'Unchanged notes reuse the assessment');
 await panel.getByRole('button',{name:/02.*Your profile/}).click();
 assert.deepEqual(errors,[]);

 await panel.getByRole('button',{name:/03.*Settings/}).click();
 await panel.getByText('Move your profile to another computer',{exact:true}).click();
 const beforeImport=await worker.evaluate(async()=>(await chrome.storage.local.get(['profile','description','goodFits'])));
 await panel.getByLabel('Import profile').setInputFiles({name:'profile-update.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({kind:'forma-profile-update',bodyShape:'Broad shoulders; comfortable chest room.',fitNotes:'Prefer wider upper-body cuts without excess length.'}))});
 await panel.getByText('Profile updated. Your existing measurements, notes and saved fits are kept.',{exact:true}).waitFor();
 const afterImport=await worker.evaluate(async()=>(await chrome.storage.local.get(['profile','description','goodFits'])));
 assert.deepEqual(afterImport.profile.measures,beforeImport.profile.measures);assert.deepEqual(afterImport.goodFits,beforeImport.goodFits);assert.ok(afterImport.description.startsWith(beforeImport.description));assert.equal(afterImport.profile.context.bodyShape,'Broad shoulders; comfortable chest room.');
 await panel.getByRole('button',{name:/02.*Your profile/}).click();
 assert.equal(await panel.getByLabel('Build & proportions').inputValue(),'Broad shoulders; comfortable chest room.');
 assert.equal(await panel.getByLabel('Fit preferences & concerns').count(),0);
 if(process.env.FORMA_SCREENSHOT){await panel.setViewportSize({width:430,height:900});await panel.screenshot({path:process.env.FORMA_SCREENSHOT,fullPage:true});}
 // Invalidate the real isolated extension while keeping its shop tab open.
 const shopErrors=[];shop.on('pageerror',error=>shopErrors.push(error.message));
 const debuggerSession=await context.newCDPSession(shop);let readerContext;
 debuggerSession.on('Runtime.executionContextCreated',({context:c})=>{if(c.origin===`chrome-extension://${id}`)readerContext=c.id;});
 await debuggerSession.send('Runtime.enable');
 const isolatedErrors=[];debuggerSession.on('Runtime.exceptionThrown',event=>isolatedErrors.push(event.exceptionDetails.exception?.description||event.exceptionDetails.text));
 // Keep an actual content-script message pending during invalidation, not only an idle reader.
 await worker.evaluate(()=>{globalThis.holdNext=true;globalThis.held=false;});
 await panel.getByRole('button',{name:/01.*Your fit/}).click();
 await panel.getByRole('button',{name:'Refresh',exact:true}).click();
 for(let i=0;i<100&&!await worker.evaluate(()=>globalThis.held);i++)await shop.waitForTimeout(50);
 assert.equal(await worker.evaluate(()=>globalThis.held),true,'A request is pending when the extension reloads');
 await worker.evaluate(()=>chrome.runtime.reload()).catch(()=>{});
 await shop.waitForTimeout(1000);
 assert.ok(readerContext,'The test observes the extension isolated world');
 await debuggerSession.send('Runtime.evaluate',{contextId:readerContext,expression:"void Promise.reject(new Error('Extension context invalidated.'))"});
 await shop.waitForTimeout(100);
 for(let i=0;i<3;i++){await shop.evaluate(i=>document.querySelector('h1').textContent='Odessa Jeans '+i,i);await shop.waitForTimeout(700);}
 assert.equal(await shop.locator('#forma-fit-card').count(),0,'An invalidated reader disposes its popup');
 assert.deepEqual(shopErrors,[],'Reload must not leave uncaught context invalidation errors');
 assert.deepEqual(isolatedErrors,[],'The isolated content-script world must also have no unhandled rejections');
 console.log(JSON.stringify({result:'passed',freeTextFitFeedbackSaved:true,optionalCategoryDoesNotAutosave:true,saveNotesWhileAIIsRunning:true,notesComposerClearsAfterSaving:true,fullNotesReachAI:true,notesSurvivePanelReload:true,unchangedNotesReuseCache:true,reopenPopupWithoutAI:true,realExtensionReloadWithoutUncaughtErrors:true,transposedMeasurementsReachAI:true,popupFitActions:true,popupDismissalSurvivesReload:true,unitlessGuideEstimate:true,modelSizeFallback:true,sourceHTMLFallback:true,noMutationRefreshLoop:true,dismissableResult:true,automaticReaderInjection:true,lazySizingClicks:1,parsedWaist:46,parsedLength:112,freshRefresh:true,automaticCacheReuse:true,bookmarkUsesNoAI:true,evidenceSaved:true,allShopsEnabledFromExtensionPage:true,shoeSizeSaved:true,lowerBodyTableRead:true,analysedButtonDisabled:true,optionalSizeAndReasonSaved:true,futureAssessmentUsesSavedExample:true,germanModalOpens:true,conversionNotCentimetres:true,knownFitWithoutChart:true,rejectedPhotoRecovery:true,retryCountedInBudget:true,panelErrors:errors}));
}finally{await context.close();await rm(temp,{recursive:true,force:true});}
