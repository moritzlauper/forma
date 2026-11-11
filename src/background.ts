import {recommend,validateProduct,type Profile,type Product} from './fit';
import {detect,type Page} from './detect';
import {inputForReview,requestReview,type Assessment,type Feedback} from './assessment';
const flights=new Map<string,Promise<Assessment>>();
let budgetQueue=Promise.resolve();
const revisions=new Map<number,number>();
chrome.storage.local.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'});
chrome.storage.session.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'});
chrome.sidePanel.setPanelBehavior({openPanelOnActionClick:true});
chrome.runtime.onMessage.addListener((msg,sender,reply)=>{
 if(msg.type!=='page'||!sender.tab?.id)return;
 const tab=sender.tab.id;
 const revision=(revisions.get(tab)||0)+1;revisions.set(tab,revision);
 (async()=>{
  const page:Page={url:sender.url||'',name:String(msg.name).slice(0,200),text:String(msg.text).slice(0,16000),charts:Array.isArray(msg.charts)?msg.charts.slice(0,12).map((t:{text?:unknown;context?:unknown})=>({text:String(t.text||'').slice(0,8000),context:String(t.context||'').slice(0,10000)})):[]};
  page.images=Array.isArray(msg.images)?msg.images.filter((s:unknown)=>{if(typeof s!=='string')return false;try{const u=new URL(s);return u.protocol==='https:'&&!u.username&&!u.password&&!/^(localhost|127\.|192\.168\.|10\.)/.test(u.hostname);}catch{return false;}}).slice(0,2):[];
  const data=await chrome.storage.local.get(['profile','products','settings','apiKey','feedback']);
  const saved=(data.products as Record<string,{product:Product;fingerprint:string}>|undefined)?.[page.url];
  const fingerprint=JSON.stringify([page.name,page.charts]);
  const found=detect(page);
  const product=saved?.fingerprint===fingerprint?validateProduct(saved.product):found.product;
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
    const input=inputForReview(page,product,data.profile as Profile,(data.feedback||[]) as Feedback[]);
    const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode('fit-v2|'+mode+'|'+model+'|'+JSON.stringify(input))))).map(b=>b.toString(16).padStart(2,'0')).join('');
    await chrome.storage.session.set({['page:'+tab]:{...page,product,result:null,reason:found.reason,assessment:{status:'running',model}}});
    let job=flights.get(digest);const reused=!!job;
    if(!job){
     job=(async():Promise<Assessment>=>{
      const cache=(await chrome.storage.local.get('fitCache')).fitCache as Record<string,Assessment>|undefined;
      if(cache?.[digest])return {...cache[digest],cached:true};
      let allowed=false;
      const reserve=budgetQueue.then(async()=>{const n=Number((await chrome.storage.local.get('aiCount')).aiCount||0);if(n<(settings?.limit??10)){await chrome.storage.local.set({aiCount:n+1});allowed=true;}});
      budgetQueue=reserve.catch(()=>{});await reserve;
      if(!allowed)return {status:'blocked',model,error:'Request limit reached. Increase it in Settings. No local recommendation is substituted.'};
      try{
       const review=await requestReview(input,mode,model,key);
       const entry:Assessment={status:'ready',model,cached:false,review};
       const latest=(await chrome.storage.local.get('fitCache')).fitCache as Record<string,Assessment>||{};
       latest[digest]=entry;await chrome.storage.local.set({fitCache:Object.fromEntries(Object.entries(latest).slice(-40))});
       return entry;
      }catch(e){return {status:'error',model,error:e instanceof Error?e.message:'AI assessment failed.'};}
     })();
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
  reply({url:page.url,result:assessment?{message,ranked:[],reasons:assessment.review?.reasons||[],model:assessment.model,cached:assessment.cached}:result||{message,ranked:[]}});

 })().catch(()=>reply({error:'No reliable recommendation yet.'}));return true;
});
chrome.permissions.onRemoved.addListener(async()=>{
 const scripts=await chrome.scripting.getRegisteredContentScripts();
 for(const script of scripts)if(!await chrome.permissions.contains({origins:script.matches!}))await chrome.scripting.unregisterContentScripts({ids:[script.id]});
});
chrome.storage.onChanged.addListener(async(changes,area)=>{
 if(area!=='local'||!['profile','settings','apiKey','feedback'].some(k=>changes[k]))return;
 if(changes.apiKey||changes.settings)flights.clear();
 for(const tab of await chrome.tabs.query({}))if(tab.id)chrome.tabs.sendMessage(tab.id,{type:'refresh'}).catch(()=>{});
});
