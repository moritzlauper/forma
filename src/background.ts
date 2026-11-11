import {migrateProfile} from './profile-migration';
import {withEstimates} from './estimates';
import {recommend,validateProduct,type Profile,type Product} from './fit';
import {detect,type Page} from './detect';
import {inputForReview,requestReview,type Assessment,type Feedback} from './assessment';
import {createRequestBudget} from './request-budget';
import {saveGoodFit,productIdentity,type GoodFit} from './good-fits';
import {recordScan,enrichGoodFits,type ScanRecord} from './scan-library';
const flights=new Map<string,Promise<Assessment>>();
const settled=new Set<string>();
const failed=new Set<string>();
const budgetBlocked=new Set<string>();
const reserveRequest=createRequestBudget(chrome.storage.local);
const revisions=new Map<number,number>();
let scanQueue:Promise<unknown>=Promise.resolve();
function saveScan(page:Page,product:Product|null,source:ScanRecord['measurements'][number]['source']):Promise<ScanRecord[]>{
 const job=scanQueue.then(async()=>{const saved=(await chrome.storage.local.get('scanLibrary')).scanLibrary;const previous=Array.isArray(saved)?saved as ScanRecord[]:[];const next=recordScan(previous,page,product,Date.now(),source);if(next!==previous)await chrome.storage.local.set({scanLibrary:next});const savedFits=(await chrome.storage.local.get('goodFits')).goodFits;if(Array.isArray(savedFits)){const enriched=enrichGoodFits(savedFits,next);if(JSON.stringify(enriched)!==JSON.stringify(savedFits))await chrome.storage.local.set({goodFits:enriched});}return next;});
 scanQueue=job.catch(()=>{});return job;
}
chrome.storage.local.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'});
chrome.storage.session.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'});
chrome.sidePanel.setPanelBehavior({openPanelOnActionClick:true});
chrome.runtime.onMessage.addListener((msg,sender,reply)=>{
 if(msg.type==='open-fit-editor'){
  if(!sender.tab?.id||sender.frameId&&sender.frameId!==0||!['good','bad'].includes(msg.kind))return;
  const tabId=sender.tab.id;
  // Invoke immediately while Chrome still associates this message with the click.
  const opened=chrome.sidePanel.open({tabId});
  const job=scanQueue.then(async()=>{
   const data=await chrome.storage.session.get('page:'+tabId);const page=data['page:'+tabId] as Page&{product:Product|null}|undefined;
   if(!page||productIdentity(page.url)!==productIdentity(sender.url||''))throw Error('Read this product first.');
   if(msg.kind==='good'){
    const data=await chrome.storage.local.get(['goodFits','scanLibrary']);const entries=(data.goodFits||[]) as GoodFit[];
    const previous=entries.find(e=>productIdentity(e.url)===productIdentity(page.url));
    const entry=previous||{url:page.url,name:page.name,size:'',reason:'',savedAt:Date.now(),category:page.product?.category||page.detection?.category||null,product:page.product,charts:page.charts,images:page.images,evidence:page.evidence,description:page.text};
    await chrome.storage.local.set({goodFits:saveGoodFit(entries,enrichGoodFits([entry],(data.scanLibrary||[]) as ScanRecord[])[0])});
   }
   await chrome.storage.session.set({['fit-editor:'+tabId]:{kind:msg.kind,url:page.url,id:crypto.randomUUID()}});
  });scanQueue=job.catch(()=>{});
  Promise.all([opened,job]).then(()=>reply({ok:true})).catch(()=>reply({error:'Could not open fit details. Open FORMA from its toolbar icon.'}));return true;
 }
 if(msg.type==='save-good-fit'||msg.type==='remove-good-fit'){
  if(sender.url!==chrome.runtime.getURL('index.html'))return;
  const job=scanQueue.then(async()=>{
   const data=await chrome.storage.local.get(['goodFits','scanLibrary']);const entries=Array.isArray(data.goodFits)?data.goodFits as GoodFit[]:[];const scans=Array.isArray(data.scanLibrary)?data.scanLibrary as ScanRecord[]:[];
   let next:GoodFit[];
   if(msg.type==='remove-good-fit')next=entries.filter(e=>productIdentity(e.url)!==productIdentity(String(msg.url||'')));
   else{
    const entry=msg.entry as GoodFit;if(!entry||typeof entry.url!=='string'||!/^https?:/.test(entry.url)||typeof entry.name!=='string'||typeof entry.size!=='string'||typeof entry.reason!=='string')throw Error('Invalid saved fit.');
    const previous=entries.find(e=>productIdentity(e.url)===productIdentity(entry.url));
    const merged=enrichGoodFits([{...previous,...entry}],scans)[0];next=saveGoodFit(entries,merged);
   }
   await chrome.storage.local.set({goodFits:next});return {goodFits:next};
  });scanQueue=job.catch(()=>{});job.then(reply).catch(()=>reply({error:'Could not save your good fit. Please retry.'}));return true;
 }
 if(msg.type==='reserve-ai-request'){
  if(sender.tab||sender.url!==chrome.runtime.getURL('index.html'))return;
  reserveRequest().then(reply).catch(()=>reply({error:'Could not read the request budget.'}));return true;
 }
 if(!['page','page-progress','page-error'].includes(msg.type)||!sender.tab?.id)return;
 const tab=sender.tab.id;
 const revision=(revisions.get(tab)||0)+1;revisions.set(tab,revision);
 (async()=>{
  const page:Page={url:sender.url||'',name:String(msg.name||'').slice(0,200),text:String(msg.text||'').slice(0,16000),charts:Array.isArray(msg.charts)?msg.charts.slice(0,12).map((t:{text?:unknown;context?:unknown})=>({text:String(t.text||'').slice(0,8000),context:String(t.context||'').slice(0,10000)})):[]};
  if(msg.evidence&&typeof msg.evidence==='object')page.evidence={sizes:Array.isArray(msg.evidence.sizes)?msg.evidence.sizes.filter((s:unknown)=>typeof s==='string'&&s.length<=30).slice(0,60):[],models:Array.isArray(msg.evidence.models)?msg.evidence.models.filter((m:any)=>Number.isFinite(m.heightCm)&&typeof m.size==='string'&&typeof m.quote==='string').slice(0,3).map((m:any)=>({heightCm:m.heightCm,size:m.size.slice(0,30),quote:m.quote.slice(0,250)})):[],fit:Array.isArray(msg.evidence.fit)?msg.evidence.fit.filter((s:unknown)=>typeof s==='string'&&s.length<=40).slice(0,12):[],sourceHTML:String(msg.evidence.sourceHTML||'').slice(0,12000)};
  page.detection=msg.detection;page.manual=msg.manual===true;
  if(msg.type!=='page'){
   const error=msg.type==='page-error';
   const previous=(await chrome.storage.session.get('page:'+tab))['page:'+tab] as (Page&{assessment?:Assessment})|undefined;
   if(revisions.get(tab)!==revision){reply({stale:true});return;}
   const retained=previous?.url===page.url&&previous?.assessment?.status==='ready'?previous:null;
   await chrome.storage.session.set({['page:'+tab]:{...(retained||{...page,product:null,result:null,reason:''}),scan:{status:error?'error':'reading',at:Date.now(),error:error?'Could not reread this page. Your last completed assessment is kept.':undefined}}});
   reply({accepted:true});return;
  }
  if(page.detection?.kind!=='clothing'&&!page.manual){
   await chrome.storage.session.set({['page:'+tab]:{...page,text:'',charts:[],images:[],product:null,result:null,reason:'No clothing product detected locally. Use “Analyse this page” to start manually.'}});
   reply({url:page.url,skipped:true});return;
  }
  page.images=Array.isArray(msg.images)?msg.images.filter((s:unknown)=>{if(typeof s!=='string')return false;try{const u=new URL(s);return u.protocol==='https:'&&!u.username&&!u.password&&!/^(localhost|127\.|192\.168\.|10\.)/.test(u.hostname);}catch{return false;}}).slice(0,2):[];
  const data=await chrome.storage.local.get(['profile','description','products','settings','apiKey','feedback','goodFits']);
  const saved=(data.products as Record<string,{product:Product;fingerprint:string}>|undefined)?.[page.url];
  const fingerprint=JSON.stringify([page.name,page.charts]);
  const found=detect(page);
  const product=saved?.fingerprint===fingerprint?validateProduct(saved.product):found.product;
  const scans=await saveScan(page,product,product===found.product?'shop-chart':'user-confirmed-chart');
  const settings=data.settings as {mode?:string;model?:string;limit?:number;assessmentVersion?:number}|undefined;
  const mode=settings?.assessmentVersion===1?(settings.mode||'anthropic'):(settings?.mode==='ollama'?'ollama':'anthropic');
  const model=mode==='ollama'?settings?.model||'':'claude-haiku-5-5';
  const key=typeof data.apiKey==='string'?data.apiKey:'';
  let assessment:Assessment|undefined;
  if(mode!=='none'){
   const origin=mode==='ollama'?'http://localhost:11434/*':'https://api.anthropic.com/*';
   if(!data.profile)assessment={status:'blocked',model,error:'Set up your fit profile first.'};
   else if(mode==='anthropic'&&!key)assessment={status:'blocked',model,error:'Add your API key in Settings to start AI fit assessment.'};
   else if(!await chrome.permissions.contains({origins:[origin]}))assessment={status:'blocked',model,error:'Allow the AI connection in Settings. No AI request has been sent.'};
   else{
    const input=inputForReview(page,product,withEstimates(migrateProfile(data.profile as Profile)),(data.feedback||[]) as Feedback[],typeof data.description==='string'?data.description:'',enrichGoodFits(Array.isArray(data.goodFits)?data.goodFits as GoodFit[]:[],scans));
    const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode('fit-v19|'+mode+'|'+model+'|'+JSON.stringify(input))))).map(b=>b.toString(16).padStart(2,'0')).join('');
    await chrome.storage.session.set({['page:'+tab]:{...page,product,result:null,reason:found.reason,assessment:{status:'running',model,startedAt:Date.now()}}});
    if(msg.fresh===true&&settled.has(digest)||msg.retry===true&&failed.has(digest)){flights.delete(digest);settled.delete(digest);failed.delete(digest);budgetBlocked.delete(digest);}
    let job=flights.get(digest);const reused=!!job&&settled.has(digest);
    if(!job){
     job=(async():Promise<Assessment>=>{
      const cache=(await chrome.storage.local.get('fitCache')).fitCache as Record<string,Assessment>|undefined;
      if(cache?.[digest]&&msg.fresh!==true)return {...cache[digest],cached:true};
      const budget=await reserveRequest();
      if(!budget.allowed)return {status:'blocked',model,code:'request_limit',usage:budget,error:`You have used ${budget.used} of ${budget.limit} AI requests. Add 100 more in the FORMA panel to continue.`};
      try{
       const review=await requestReview(input,mode,model,key,async()=>(await reserveRequest()).allowed);
       const entry:Assessment={status:'ready',model,cached:false,review};
       const latest=(await chrome.storage.local.get('fitCache')).fitCache as Record<string,Assessment>||{};
       latest[digest]=entry;await chrome.storage.local.set({fitCache:Object.fromEntries(Object.entries(latest).slice(-40))});
       return entry;
      }catch(e){return {status:'error',model,error:e instanceof Error?e.message:'AI assessment failed.'};}
     })().then(entry=>{settled.add(digest);if(entry.status==='error')failed.add(digest);if(entry.code==='request_limit')budgetBlocked.add(digest);return entry;});
     flights.set(digest,job);
     // Retain failed attempts in memory too: DOM updates must not trigger paid retries.
    }
    assessment=await job;
    if(reused&&assessment.status==='ready')assessment={...assessment,cached:true};
   }
  }
  const result=mode==='none'&&product&&data.profile?recommend(data.profile as Profile,product):null;
  if(revisions.get(tab)!==revision){reply({url:page.url,stale:true});return;}
  await chrome.storage.session.set({['page:'+tab]:{...page,product,result,reason:found.reason,assessment}});
  const message=assessment?assessment.status==='ready'?assessment.review!.summary:assessment.error||'AI is reviewing your fit…':result?.message||found.reason;
  reply({url:page.url,result:assessment?{message,ranked:[],status:assessment.status,overallFit:assessment.review?.overallFit,size:assessment.review?.size,scores:assessment.review?.ranked?.map(s=>({size:s.size,overall:s.overall,eligible:s.eligible,reason:s.reason})),reasons:assessment.review?.reasons||[],basis:assessment.review?.basis,model:assessment.model,cached:assessment.cached}:result||{message,ranked:[]}});

 })().catch(async()=>{
  if(revisions.get(tab)===revision)await chrome.storage.session.set({['page:'+tab]:{url:sender.url||'',name:String(msg.name||'').slice(0,200),text:'',charts:[],product:null,result:null,scan:{status:'error',at:Date.now(),error:'The assessment could not start. Press Refresh to reconnect.'}}}).catch(()=>{});
  reply({error:'The assessment could not start. Press Refresh to reconnect.'});
 });return true;
});
chrome.permissions.onRemoved.addListener(async()=>{
 const scripts=await chrome.scripting.getRegisteredContentScripts();
 for(const script of scripts)if(!await chrome.permissions.contains({origins:script.matches!}))await chrome.scripting.unregisterContentScripts({ids:[script.id]});
});
chrome.storage.onChanged.addListener(async(changes,area)=>{
 // Saved profile notes are applied on the next scan or by explicit request.
 if(area!=='local'||!['profile','settings','apiKey','feedback'].some(k=>{const change=changes[k];if(!change)return false;const canonical=(v:any)=>k==='profile'&&v?withEstimates(migrateProfile(v)):v;return JSON.stringify(canonical(change.oldValue))!==JSON.stringify(canonical(change.newValue));}))return;
 if(changes.apiKey){flights.clear();settled.clear();failed.clear();budgetBlocked.clear();}
 if(changes.settings){
  // Budget edits release blocked work, but must not duplicate running requests.
  for(const digest of budgetBlocked){flights.delete(digest);settled.delete(digest);}
  budgetBlocked.clear();
 }
 for(const tab of await chrome.tabs.query({}))if(tab.id)chrome.tabs.sendMessage(tab.id,{type:'refresh',reassess:true}).catch(()=>{});
});
