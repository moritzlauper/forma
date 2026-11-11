import {createLoadingIndicator} from './loading-indicator';
import {makePopupMovable} from './popup-position';
import {fitScore,overallScore,overallFit} from './fit-rating';
import {watchRuntimeInvalidation} from './runtime-lifecycle';
import {createRuntimeMessenger} from './runtime-messaging';
import {mergeCharts,mergeListing} from './evidence-merge';
import {productIdentity} from './good-fits';
import type {Page} from './detect';
import {discoverCharts,collectCharts,collectProductImages,productText} from './page-discovery';
import {collectProductEvidence} from './product-evidence';
import {detectClothingPage} from './product-page';
import {READER_PROTOCOL} from './page-connection';
(()=>{
 const w=window as unknown as {formaReader?:{protocol:string;dispose:()=>void}};if(w.formaReader?.protocol===READER_PROTOCOL)return;try{w.formaReader?.dispose();}catch{}
 const host=document.createElement('div');host.id='forma-fit-card';const shadow=host.attachShadow({mode:'closed'});
 const style=document.createElement('style');style.textContent=':host{position:fixed;bottom:18px;right:18px;z-index:2147483647;font:14px/1.5 system-ui;color:#251e32}article{position:relative;box-sizing:border-box;width:324px;max-width:calc(100vw - 16px);max-height:calc(100vh - 70px);overflow:auto;background:#ece7f3;border:1px solid #8d859e;box-shadow:3px 3px #251e3222;padding:16px}b{color:#6d3fd1;letter-spacing:2px}p{margin:8px 0 0}small{display:block;margin-top:8px}.close{position:absolute;right:8px;top:6px;width:30px;height:30px;border:0;background:transparent;color:#251e32;font:24px system-ui;cursor:pointer}.scores{margin-top:10px;padding:10px;background:#dcd7e6;border-left:3px solid #6d3fd1}.rating-row{display:grid;grid-template-columns:auto 1fr;gap:4px 16px;padding:8px 0;border-bottom:1px solid #8d859e55}.rating-row strong{font-size:13px;text-align:right}.rating-row small{grid-column:1/-1;margin:0;line-height:1.4;color:#625970}details{margin-top:12px}summary{cursor:pointer;font-weight:600}.drag-handle{cursor:grab;touch-action:none;user-select:none}.drag-handle:active{cursor:grabbing}.drag-handle:focus-visible{outline:2px solid #6d3fd1}nav{display:flex;gap:8px;margin-top:12px}nav button{padding:7px 10px;border:1px solid #8d859e;background:transparent;color:inherit;cursor:pointer}button:focus-visible{outline:2px solid #6d3fd1}b{display:block;padding-right:28px}';shadow.append(style);
 const card=document.createElement('article');shadow.append(card);let timer:ReturnType<typeof setTimeout>;let last='';let seq=0;let discovering=false;let pendingRetry=false;let pendingFresh=false;let guideURL='';let manualURL='';const attemptedGuides=new Set<HTMLElement>();
 let enabled=true;let cleanupDrag=()=>{};let disposed=false;let dismissedURL='';let retainedCharts:Page['charts']=[];let retainedEvidence:Page['evidence'];let rendered='';let retainedIdentity=productIdentity(location.href);
 const dismissalKey='forma-dismissed-products';
 const dismissed=()=>{try{const value=JSON.parse(sessionStorage.getItem(dismissalKey)||'[]');return Array.isArray(value)?value.filter((u:unknown)=>typeof u==='string'):[] as string[];}catch{return [] as string[];}};
 const setDismissed=(url:string,value:boolean)=>{dismissedURL=value?productIdentity(url):'';try{const list=dismissed().filter(u=>u!==productIdentity(url));if(value)list.push(productIdentity(url));sessionStorage.setItem(dismissalKey,JSON.stringify(list.slice(-50)));}catch{}};
 const loading=createLoadingIndicator(()=>{setDismissed(location.href,true);host.remove();});
 const messenger=createRuntimeMessenger(chrome.runtime,()=>dispose());
 watchRuntimeInvalidation(window,chrome.runtime,()=>dispose());
 async function safeScan(retry=false,fresh=false){try{await scan(retry,fresh);}catch(error){
  last='';host.remove();
  if(error instanceof Error&&/context invalidated/i.test(error.message)){dispose();return;}
  // sendMessage may throw synchronously after an extension reload; .catch()
  // on its return value cannot catch that. Stop the orphaned reader entirely.
  try{await messenger.send({type:'page-error',name:document.querySelector('h1')?.textContent||document.title});}catch{dispose();}
 }}
 async function scan(retry=false,fresh=false){
  if(disposed||!messenger.alive())return;
  const state=await messenger.send({type:'forma-state'});enabled=state?.enabled!==false;
  if(!enabled){loading.stop();host.remove();return;}
  if(discovering){pendingRetry ||=retry;pendingFresh ||=fresh;return;}
  const url=location.href;
  if(retainedIdentity!==productIdentity(url)){retainedIdentity=productIdentity(url);retainedCharts=[];retainedEvidence=undefined;rendered='';last='';host.remove();}
  const detection=detectClothingPage(document);let manual=manualURL===url;
  if(detection.kind!=='clothing'&&!manual){
   const signature=JSON.stringify([url,detection]);if(signature===last)return;last=signature;seq++;host.remove();
   await messenger.send({type:'page',name:detection.name,text:'',charts:[],images:[],detection,manual:false}).catch(()=>{});return;
  }
  let finishLoading=()=>{};let loadingStarted=false;
  const showLoading=()=>{if(!loadingStarted&&dismissedURL!==productIdentity(url)&&!dismissed().includes(productIdentity(url))){loadingStarted=true;finishLoading=loading.start();}};
  try{
  if(guideURL!==url||retry){guideURL=url;attemptedGuides.clear();}
  discovering=true;
  let charts;
  try{
   if(!last||retry||fresh){
    showLoading();
    await messenger.send({type:'page-progress',name:detection.name,detection,manual});
    charts=await discoverCharts(document,attemptedGuides);
   }else charts=collectCharts(document);
  }finally{
   discovering=false;
  }
  if(disposed||!enabled)return;
  retry ||=pendingRetry;fresh ||=pendingFresh;pendingRetry=false;pendingFresh=false;
  if(url!==location.href){last='';safeScan(retry,fresh);return;}
  manual=manualURL===url;
  const name=detection.name;
  const photos=collectProductImages(document);
  const description=productText(document);
  charts=mergeCharts(retainedCharts,charts);retainedCharts=charts;
  const evidence=mergeListing(retainedEvidence,collectProductEvidence(document));retainedEvidence=evidence;
  const signature=JSON.stringify([url,name,charts,photos,description,evidence,manual]);
  if(signature===last&&!retry&&!fresh)return;
  showLoading();last=signature;const id=++seq;
  try{const answer=await messenger.send({type:'page',name,charts,images:photos,text:description,evidence,retry,fresh,detection,manual});if(disposed||!enabled||id!==seq||url!==location.href||!answer?.result||(dismissedURL===productIdentity(url)||dismissed().includes(productIdentity(url))))return;
   renderResult(answer.result,url);
  }catch(error){throw error;}
  }finally{finishLoading();}
 }
 function renderResult(result:any,url:string){
   const presentation=JSON.stringify({...result,cached:undefined});if(presentation===rendered&&host.isConnected)return;rendered=presentation;
   cleanupDrag();card.replaceChildren();const close=document.createElement('button');close.type='button';close.className='close';close.textContent='×';close.setAttribute('aria-label','Close FORMA result');close.title='Close FORMA result';close.onclick=()=>{setDismissed(url,true);host.remove();};card.append(close);const b=document.createElement('b');b.textContent='FORMA';const p=document.createElement('p');p.textContent=result.message;card.append(b);cleanupDrag=makePopupMovable(host,b);
   const explanation=document.createElement('details');const explanationTitle=document.createElement('summary');explanationTitle.textContent='Fit summary';explanation.append(explanationTitle,p);
   if(result.model&&result.status==='ready'){card.append(explanation);{const heading=document.createElement('p');heading.textContent=result.size?'Size '+result.size:'No suitable size yet';card.insertBefore(heading,explanation);}}else card.append(p);
   if(result.model){const source=document.createElement('small');source.textContent=result.cached?'Saved assessment':'AI fit estimate';card.append(source);}
   if(result.model&&result.status==='ready'){
    const fit=overallFit({...result,ranked:result.scores});const rating=document.createElement('div');rating.className='scores';const title=document.createElement('strong');title.textContent='Overall fit · '+overallScore({...result,ranked:result.scores});const reason=document.createElement('small');reason.textContent=fit.reason;rating.append(title,reason);card.insertBefore(rating,explanation);
   }
   if(result.scores?.length>1){
    const comparison=document.createElement('details');const title=document.createElement('summary');title.textContent='Compare sizes';comparison.append(title);
    for(const score of result.scores){const row=document.createElement('div');row.className='rating-row';const size=document.createElement('span');size.textContent='Size '+score.size;const label=document.createElement('strong');label.textContent=fitScore(score.overall,score.eligible);row.append(size,label);if(score.reason){const reason=document.createElement('small');reason.textContent=score.reason;row.append(reason);}comparison.append(row);}card.append(comparison);
   }
   if(result.reasons?.length){const details=document.createElement('details');const title=document.createElement('summary');title.textContent='Why this fit?';details.append(title);for(const text of result.reasons.slice(0,3)){const reason=document.createElement('p');reason.textContent=text;details.append(reason);}card.append(details);}
   const row=result.ranked?.[0];if(row){const small=document.createElement('small');small.textContent=row.details.map((d:{key:string;text:string})=>d.key+': '+d.text).join(' · ')+(row.available?'':' · sold out');card.append(small);}
   const actions=document.createElement('nav');actions.setAttribute('aria-label','Record actual fit');
   for(const [kind,label] of [['good','Save as good fit'],['bad','Bad fit']] as const){const button=document.createElement('button');button.type='button';button.textContent=label;button.onclick=async()=>{button.disabled=true;try{const response=await messenger.send({type:'open-fit-editor',kind});if(!response?.ok)throw Error(response?.error||'Page connection ended.');button.textContent=kind==='good'?'Saved · add details':'Add fit details';}catch{button.textContent='Could not open · retry';}finally{button.disabled=false;}};actions.append(button);}card.append(actions);
   if(!host.isConnected)document.body.append(host);
 }
 const observer=new MutationObserver(m=>{
  if(m.every(r=>r.target===host||r.target===loading.host||(r.type==='childList'&&Array.from(r.addedNodes).concat(Array.from(r.removedNodes)).every(n=>n===host||n===loading.host))))return;
  if(discovering)return;
  // DOM animations and announcements must not reset a completed assessment.
  // Re-read locally and send only when the actual product evidence changes.
  clearTimeout(timer);timer=setTimeout(()=>{safeScan();},650);
 });
 observer.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['aria-selected','data-variant-id','hidden','aria-hidden','disabled','aria-disabled']});
 const onMessage=(m:any,_sender:chrome.runtime.MessageSender,reply:(response:unknown)=>void)=>{
  if(disposed)return;
  try{
  if(m.type==='forma-enabled'){enabled=m.enabled!==false;seq++;clearTimeout(timer);if(!enabled){loading.stop();host.remove();}else{last='';safeScan();}reply({accepted:true});return;}
  if(!enabled&&m.type!=='forma-ping'){reply({paused:true});return;}
  if(m.type==='show-result'&&m.url===location.href&&typeof m.result?.message==='string'){setDismissed(location.href,false);renderResult(m.result,location.href);reply({shown:true});return;}
  if(m.type==='forma-ping'){reply({protocol:READER_PROTOCOL,url:location.href});return;}
  if(m.type==='refresh'){reply({accepted:true,url:location.href});if(m.force===true)manualURL=location.href;if(m.fresh||m.retry||m.reassess||m.force)last='';if(m.fresh||m.force)setDismissed(location.href,false);safeScan(m.retry===true,m.fresh===true);}
  }catch{dispose();}
 };
 chrome.runtime.onMessage.addListener(onMessage);
 const navigated=()=>{if(productIdentity(previousURL)!==productIdentity(location.href)){loading.stop();dismissedURL='';manualURL='';last='';rendered='';retainedCharts=[];retainedEvidence=undefined;host.remove();}previousURL=location.href;safeScan();};window.addEventListener('popstate',navigated);
 let previousURL=location.href;const interval=setInterval(()=>{if(!messenger.alive())return;if(previousURL!==location.href){seq++;navigated();}},500);
 function dispose(){if(disposed)return;disposed=true;seq++;messenger.close();for(const cleanup of [loading.stop,cleanupDrag,()=>observer.disconnect(),()=>clearTimeout(timer),()=>clearInterval(interval),()=>host.remove(),()=>window.removeEventListener('popstate',navigated),()=>chrome.runtime.onMessage.removeListener(onMessage)])try{cleanup();}catch{}}
 w.formaReader={protocol:READER_PROTOCOL,dispose};safeScan();
})();
