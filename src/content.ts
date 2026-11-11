import {discoverCharts,collectProductImages,productText} from './page-discovery';
import {detectClothingPage} from './product-page';
(()=>{
 const w=window as unknown as Record<string,unknown>;if(w.formaLoaded)return;w.formaLoaded=true;
 const host=document.createElement('div');host.id='forma-fit-card';const shadow=host.attachShadow({mode:'closed'});
 const style=document.createElement('style');style.textContent=':host{position:fixed;bottom:18px;right:18px;z-index:2147483647;font:14px/1.5 system-ui;color:#251e32}article{max-width:290px;background:#ece7f3;border:1px solid #8d859e;box-shadow:3px 3px #251e3222;padding:16px}b{color:#6d3fd1;letter-spacing:2px}p{margin:8px 0 0}small{display:block;margin-top:8px}';shadow.append(style);
 const card=document.createElement('article');shadow.append(card);let timer:ReturnType<typeof setTimeout>;let last='';let seq=0;let discovering=false;let pendingScan=false;let pendingRetry=false;let guideURL='';let manualURL='';const attemptedGuides=new Set<HTMLElement>();
 async function scan(retry=false){
  if(discovering){pendingScan=true;pendingRetry ||=retry;return;}
  const url=location.href;
  const detection=detectClothingPage(document);const manual=manualURL===url;
  if(detection.kind!=='clothing'&&!manual){
   const signature=JSON.stringify([url,detection]);if(signature===last)return;last=signature;seq++;host.remove();
   await chrome.runtime.sendMessage({type:'page',name:detection.name,text:'',charts:[],images:[],detection,manual:false}).catch(()=>{});return;
  }
  if(guideURL!==url||retry){guideURL=url;attemptedGuides.clear();}
  discovering=true;
  let charts;
  try{charts=await discoverCharts(document,attemptedGuides);}finally{
   discovering=false;
   if(pendingScan){const retryPending=pendingRetry;pendingScan=false;pendingRetry=false;setTimeout(()=>{last='';scan(retryPending);},0);}
  }
  if(url!==location.href){last='';scan();return;}
  const name=detection.name;
  const photos=collectProductImages(document);
  const description=productText(document);
  const signature=JSON.stringify([url,name,charts,photos,description,manual]);if(signature===last)return;last=signature;const id=++seq;host.remove();
  try{const answer=await chrome.runtime.sendMessage({type:'page',name,charts,images:photos,text:description,retry,detection,manual});if(id!==seq||url!==location.href||!answer.result)return;
   card.replaceChildren();const b=document.createElement('b');b.textContent='FORMA';const p=document.createElement('p');p.textContent=answer.result.message;card.append(b,p);
   if(answer.result.model){const source=document.createElement('small');source.textContent=answer.result.model+(answer.result.basis==='estimate'?' · tentative fit estimate':'')+(answer.result.cached?' · cached':'');card.append(source);}
   if(answer.result.scores?.length){const scores=document.createElement('small');scores.textContent='Relative fit scores: '+answer.result.scores.filter((s:{overall:number|null})=>s.overall!==null).slice(0,3).map((s:{size:string;overall:number})=>`${s.size} ${s.overall}/100`).join(' · ');card.append(scores);}
   if(answer.result.reasons?.length){const reasons=document.createElement('small');reasons.textContent=answer.result.reasons.slice(0,3).join(' · ');card.append(reasons);}
   const row=answer.result.ranked?.[0];if(row){const small=document.createElement('small');small.textContent=row.details.map((d:{key:string;text:string})=>d.key+': '+d.text).join(' · ')+(row.available?'':' · sold out');card.append(small);}
   document.body.append(host);
  }catch{/* extension reloaded */}
 }
 const observer=new MutationObserver(m=>{
  if(m.every(r=>r.target===host||(r.type==='childList'&&Array.from(r.addedNodes).concat(Array.from(r.removedNodes)).every(n=>n===host))))return;
  if(discovering)return;
  // Hide immediately while product/variant/chart changes are being resolved.
  seq++;host.remove();clearTimeout(timer);timer=setTimeout(()=>{last='';scan();},650);
 });
 observer.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['aria-selected','data-variant-id','hidden','aria-hidden']});
 chrome.runtime.onMessage.addListener(m=>{if(m.type==='refresh'){if(m.force===true)manualURL=location.href;last='';scan(m.retry===true);}});
 window.addEventListener('popstate',()=>{manualURL='';last='';host.remove();scan();});
 let previousURL=location.href;setInterval(()=>{if(previousURL!==location.href){previousURL=location.href;manualURL='';last='';seq++;host.remove();scan();}},500);scan();
})();
