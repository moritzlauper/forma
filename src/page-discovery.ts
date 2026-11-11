import {isSizeChart} from './chart-shape';
import type {Chart} from './detect';

const excluded='nav,footer,header,[id*="recommend"],[class*="recommend"],[id*="related"],[class*="related"]';
const guideLabel=/^(?:(?:view|open|show)\s+)?(?:sizing|size\s*(?:guide|chart|&\s*fit)|fit\s*guide|measurements|grö(?:ss|ß)en(?:tabelle|berater|beratung)|grö(?:ss|ß)e\s*(?:&|und)\s*passform|ma(?:ss|ß)tabelle)(?:\s+(?:öffnen|anzeigen|ansehen))?$/i;
const guideControls='button,a,summary,label,[role="tab"],[role="button"],[data-tab],[data-target],[aria-controls],[tabindex],[class*="tab"]';
function isGuide(el:Element){return guideLabel.test((el.getAttribute('aria-label')||el.textContent||'').replace(/\s+/g,' ').trim());}
export function productRoot(doc:Document):Element{return doc.querySelector('main')||doc.querySelector('[itemtype*="Product"]')||doc.body;}
export function productText(doc:Document):string{
 const copy=productRoot(doc).cloneNode(true) as Element;
 copy.querySelectorAll('script,style,noscript,nav,footer,header,#forma-fit-card').forEach(el=>el.remove());
 return (copy.textContent||'').replace(/\s+/g,' ').trim().slice(0,12000);
}
function visible(el:Element){
 for(let p:Element|null=el;p;p=p.parentElement){
  if(p.hasAttribute('hidden')||p.getAttribute('aria-hidden')==='true')return false;
  const style=el.ownerDocument.defaultView?.getComputedStyle?.(p);
  if(style?.display==='none'||style?.visibility==='hidden'||(p as HTMLElement).style?.display==='none')return false;
 }
 return true;
}
export function collectCharts(doc:Document):Chart[]{
 const root=productRoot(doc);
 const targets=Array.from(root.querySelectorAll(guideControls)).filter(isGuide).flatMap(el=>['aria-controls','data-target','data-tab','href'].map(attr=>{const id=el.getAttribute(attr)?.replace(/^#/,'');return id?doc.getElementById(id):null;})).filter((el):el is HTMLElement=>!!el);
 const dialogs='dialog,[role="dialog"],[aria-modal="true"]';
 const tables=Array.from(doc.querySelectorAll('table,[role="table"],[role="grid"]')).filter(t=>!t.closest(excluded)&&(root.contains(t)||!!t.closest(dialogs)||targets.some(target=>target.contains(t))));
 const context=(t:Element)=>(t.closest(`${dialogs},[role="tabpanel"],[id*="sizing"],[id*="size-guide"],[id*="size-chart"],section`)?.textContent||t.parentElement?.textContent||'').slice(0,10000);
 const cell=(c:Element)=>(c.textContent||'').replace(/\s+/g,' ').trim();
 const charts=tables.map(t=>({visible:visible(t),text:Array.from(t.querySelectorAll('tr,[role="row"]')).map(r=>Array.from(r.querySelectorAll('th,td,[role="cell"],[role="gridcell"],[role="columnheader"],[role="rowheader"]')).map(cell).join(';')).join('\n'),context:context(t)})).filter(c=>isSizeChart(c.text));
 // Some shop modals use plain CSS grids, with no table/ARIA semantics.
 // Require a recognisable header and consistent cells; never infer a chart
 // from arbitrary prose or unrelated product grids.
 for(const container of Array.from(doc.querySelectorAll(`${dialogs}`)).flatMap(d=>Array.from(d.querySelectorAll('div,section')))){
  if(container.closest('table,[role="table"],[role="grid"],#forma-fit-card'))continue;
  const rows=Array.from(container.children).map(row=>Array.from(row.children).map(cell));
  if(rows.length<2||rows[0].length<2||!rows.every(row=>row.length===rows[0].length&&row.every(c=>c.length<100)))continue;
  const text=rows.map(row=>row.join(';')).join('\n');
  if(isSizeChart(text))charts.push({visible:visible(container),text,context:context(container)});
 }
 // Closed tabs often already contain the actual product chart. Reading them
 // requires no interaction and avoids an empty paid assessment.
 const chosen=charts.some(c=>c.visible)?charts.filter(c=>c.visible):charts;
 return chosen.filter((c,i)=>chosen.findIndex(other=>other.text===c.text&&other.context===c.context)===i).map(({text,context})=>({text,context}));
}
export function findSizeGuide(doc:Document,attempted:Set<HTMLElement>=new Set()):HTMLElement|null{
 const roots=[productRoot(doc),...Array.from(doc.querySelectorAll('dialog,[role="dialog"],[aria-modal="true"]'))];
 return roots.flatMap(root=>Array.from(root.querySelectorAll<HTMLElement>(guideControls))).find(el=>{
  if(attempted.has(el))return false;
  if(el.closest(excluded)||!visible(el)||el.hasAttribute('disabled')||el.getAttribute('aria-disabled')==='true')return false;
  if(!isGuide(el))return false;
  if(el.tagName==='BUTTON'&&el.closest('form')&&el.getAttribute('type')!=='button'&&el.getAttribute('role')!=='tab')return false;
  if(el.tagName==='A'){
   const href=el.getAttribute('href');
   if(href&&href!=='#'&&!/^javascript:void\(0\);?$/.test(href))try{const target=new URL(href,doc.URL);const current=new URL(doc.URL);if(target.origin!==current.origin||target.pathname!==current.pathname||target.search!==current.search||!target.hash)return false;}catch{return false;}
  }
  return true;
 })||null;
}
export async function discoverCharts(doc:Document,attempted:Set<HTMLElement>,wait=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms))):Promise<Chart[]>{
 let charts=collectCharts(doc);if(charts.length)return charts;
 while(attempted.size<3){
 const control=findSizeGuide(doc,attempted);if(!control)return charts;
 attempted.add(control);
 if(control.tagName==='SUMMARY'&&control.parentElement?.tagName==='DETAILS')(control.parentElement as HTMLDetailsElement).open=true;
 else control.click();
 // Lazy-loaded guides can arrive after the click. Wait before sending to AI.
 for(let i=0;i<8;i++){await wait(250);charts=collectCharts(doc);if(charts.length)return charts;}
 }
 return charts;
}
export function collectProductImages(doc:Document):string[]{
 const images:string[]=[];
 const add=(raw:unknown)=>{if(typeof raw!=='string')return;try{const u=new URL(raw,doc.URL);if(u.protocol==='https:'&&!u.username&&!u.password&&!images.includes(u.href))images.push(u.href);}catch{}};
 for(const script of Array.from(doc.querySelectorAll('script[type="application/ld+json"]'))){
  try{let visited=0;const walk=(v:any,depth=0)=>{if(depth>8||++visited>500||!v||typeof v!=='object')return;
   if(v['@type']==='Product'||Array.isArray(v['@type'])&&v['@type'].includes('Product'))for(const item of [v.image].flat())add(typeof item==='string'?item:item?.url||item?.contentUrl);
   for(const child of Object.values(v))if(typeof child==='object')walk(child,depth+1);
  };walk(JSON.parse(script.textContent||''));}catch{}
 }
 for(const meta of Array.from(doc.querySelectorAll('meta[property="og:image:secure_url"],meta[property="og:image"],meta[name="twitter:image"]')))add(meta.getAttribute('content'));
 // Some shops expose no usable image metadata. Read the actual gallery too.
 const root=productRoot(doc);
 const photos=Array.from(root.querySelectorAll<HTMLImageElement>('img')).filter(img=>!img.closest(excluded)&&!/logo|icon|swatch|avatar|payment/i.test(img.alt+' '+img.className));
 const scored=photos.map(img=>{const box=img.getBoundingClientRect?.();const width=box?.width||img.width||img.naturalWidth||Number(img.getAttribute('width'))||0;const height=box?.height||img.height||img.naturalHeight||Number(img.getAttribute('height'))||0;const gallery=!!img.closest('[class*="gallery"],[id*="gallery"],[class*="product-media"],[class*="product__media"],[data-product-media]');return {img,score:width*height+(gallery?1000000:0),qualifies:gallery||width>=240&&height>=240};}).filter(p=>p.qualifies).sort((a,b)=>b.score-a.score);
 for(const {img} of scored){add(img.currentSrc||img.getAttribute('data-src')||img.getAttribute('src'));if(images.length>=2)break;}
 return images.slice(0,2);
}
