import {isSizeChart} from './chart-shape';
(()=>{
 const w=window as unknown as Record<string,unknown>;if(w.formaLoaded)return;w.formaLoaded=true;
 const host=document.createElement('div');host.id='forma-fit-card';const shadow=host.attachShadow({mode:'closed'});
 const style=document.createElement('style');style.textContent=':host{position:fixed;bottom:18px;right:18px;z-index:2147483647;font:14px/1.5 system-ui;color:#251e32}article{max-width:290px;background:#ece7f3;border:1px solid #8d859e;box-shadow:3px 3px #251e3222;padding:16px}b{color:#6d3fd1;letter-spacing:2px}p{margin:8px 0 0}small{display:block;margin-top:8px}';shadow.append(style);
 const card=document.createElement('article');shadow.append(card);let timer:ReturnType<typeof setTimeout>;let last='';let seq=0;
 async function scan(){
  const charts=Array.from(document.querySelectorAll('table,[role="table"]')).filter(t=>!t.closest('[hidden],[aria-hidden="true"]')&&t.getClientRects().length).map(t=>({
    text:Array.from(t.querySelectorAll('tr,[role="row"]')).map(r=>Array.from(r.querySelectorAll('th,td,[role="cell"],[role="columnheader"]')).map(c=>(c.textContent||'').replace(/\s+/g,' ').trim()).join(';')).join('\n'),
    context:(t.closest('dialog,[role="dialog"],section')?.textContent||t.parentElement?.textContent||t.textContent||'').slice(0,10000)
  })).filter(t=>isSizeChart(t.text));
  const name=document.querySelector('h1')?.textContent?.trim()||document.title;
  const url=location.href;const signature=JSON.stringify([url,name,charts]);if(signature===last)return;last=signature;const id=++seq;host.remove();
  if(!charts.length&&!document.querySelector('[itemtype*="Product"],form[action*="cart"],button[name="add"]')&&!Array.from(document.querySelectorAll('script[type="application/ld+json"]')).some(s=>/"@type"\s*:\s*"Product"/.test(s.textContent||'')))return;
  const description=(document.querySelector('main')||document.body).innerText.slice(0,12000);
  try{const answer=await chrome.runtime.sendMessage({type:'page',name,charts,text:description});if(id!==seq||url!==location.href||!answer.result)return;
   card.replaceChildren();const b=document.createElement('b');b.textContent='FORMA';const p=document.createElement('p');p.textContent=answer.result.message;card.append(b,p);
   const row=answer.result.ranked?.[0];if(row){const small=document.createElement('small');small.textContent=row.details.map((d:{key:string;text:string})=>d.key+': '+d.text).join(' · ')+(row.available?'':' · sold out');card.append(small);}
   document.body.append(host);
  }catch{/* extension reloaded */}
 }
 const observer=new MutationObserver(m=>{
  if(m.every(r=>r.target===host||(r.type==='childList'&&Array.from(r.addedNodes).concat(Array.from(r.removedNodes)).every(n=>n===host))))return;
  // Hide immediately while product/variant/chart changes are being resolved.
  seq++;host.remove();clearTimeout(timer);timer=setTimeout(()=>{last='';scan();},650);
 });
 observer.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['aria-selected','data-variant-id','hidden','aria-hidden']});
 chrome.runtime.onMessage.addListener(m=>{if(m.type==='refresh'){last='';scan();}});
 window.addEventListener('popstate',()=>{last='';host.remove();scan();});
 let previousURL=location.href;setInterval(()=>{if(previousURL!==location.href){previousURL=location.href;last='';seq++;host.remove();scan();}},500);scan();
})();
