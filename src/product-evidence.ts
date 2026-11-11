import {productRoot,readableText} from './page-discovery';
export type ProductEvidence={sizes:string[];models:{heightCm:number;size:string;quote:string}[];fit:string[];sourceHTML:string};
export const normaliseSize=(value:string)=>value.trim().replace(/(\d)\s*[x×]\s*(?=\d)/gi,'$1 x ').replace(/\s+/g,' ');
const sizePattern=/^(?:[2-6]?X{0,3}[SML](?:\/[2-6]?X{0,3}[SML])?|\d{2,3}(?:[.,]\d+)?(?:\s*[x×]\s*\d{2,3})?)$/i;
const excluded='nav,footer,header,#forma-fit-card,[class*="recommend"],[class*="related"],[data-product-card],[class*="product-card"]';
const clean=(text:string)=>(text||'').replace(/\s+/g,' ').trim();
export function collectProductEvidence(doc:Document):ProductEvidence{
 const root=productRoot(doc),sizes:string[]=[],models:ProductEvidence['models']=[];
 const add=(raw:string)=>{const size=normaliseSize(raw);if(sizePattern.test(size)&&!sizes.includes(size))sizes.push(size);};
 for(const el of Array.from(doc.querySelectorAll('select option,[role="option"],[data-size],input[type="radio"]+label,[role="radio"],button'))){
  if(el.closest(excluded)||!(root.contains(el)||el.closest('[role="listbox"],[role="dialog"]')))continue;
  if(el.hasAttribute('disabled')||el.getAttribute('aria-disabled')==='true'||el.querySelector('s,del'))continue;
  if(el.tagName==='BUTTON'&&!/size|grö(?:ss|ß)e/i.test(el.getAttribute('aria-label')||el.parentElement?.getAttribute('aria-label')||el.parentElement?.className||''))continue;
  add(el.getAttribute('data-size')||el.textContent||'');
 }
 const structured:{name:string;description:string;sizes:string[]}[]=[];
 const heading=clean(root.querySelector('h1')?.textContent||'').toLowerCase();
 for(const script of Array.from(doc.querySelectorAll('script[type="application/ld+json"]'))){
  if(script.closest(excluded))continue;
  try{let visited=0;const walk=(value:any,depth=0)=>{
   if(!value||typeof value!=='object'||depth>8||++visited>500)return;
   if([value['@type']].flat().some(t=>t==='Product'||t==='ProductGroup')&&typeof value.name==='string'&&heading&&(heading.includes(clean(value.name).toLowerCase())||clean(value.name).toLowerCase().includes(heading))){
    const labels=[value.size,...(Array.isArray(value.hasVariant)?value.hasVariant.slice(0,60).map((v:any)=>v.size):[])].map(s=>typeof s==='string'?s:typeof s?.name==='string'?s.name:'').filter(Boolean);
    labels.forEach(add);structured.push({name:value.name.slice(0,200),description:typeof value.description==='string'?value.description.slice(0,1500):'',sizes:labels.slice(0,60)});
   }
   for(const [key,child]of Object.entries(value))if(!['itemListElement','isRelatedTo','isSimilarTo','hasVariant'].includes(key))walk(child,depth+1);
  };walk(JSON.parse(script.textContent||''));}catch{}
 }
 const copy=root.cloneNode(true) as Element;
 copy.querySelectorAll(excluded+',script,style,noscript,input,textarea,[contenteditable],[aria-live],[role="status"]').forEach(el=>el.remove());
 // Keep product text beyond the first screen, including model annotations.
 const text=readableText(copy)+' '+structured.map(p=>p.description).join(' ');
 const pattern=/\bmodel\b[^.!?\n]{0,45}?(\d{3}|\d[.,]\d{1,2})\s*(cm|m)\b.{0,65}?(?:(?:wearing|wears)(?:\s+size)?|trägt(?:\s+(?:die\s+)?grö(?:ss|ß)e)?)\s*([2-6]?X{0,3}[SML](?:\/[2-6]?X{0,3}[SML])?|\d{2,3}(?:[.,]\d+)?(?:\s*[x×]\s*\d{2,3})?)(?=\s|[.,;(]|$)/gi;
 for(const match of text.matchAll(pattern)){
  const height=Number(match[1].replace(',','.'))*(match[2].toLowerCase()==='m'?100:1);
  if(height>=100&&height<=250)models.push({heightCm:Math.round(height),size:normaliseSize(match[3]),quote:match[0].slice(0,250)});
  if(models.length===3)break;
 }
 const fit=Array.from(new Set((text.match(/\b(?:loose|relaxed|baggy|oversized|slim|straight|regular|cropped|boxy)(?:[- ]fit)?\b/gi)||[]).map(value=>value.toLowerCase().replace(/[- ]fit$/,'')))).slice(0,12);
 // A bounded product-only HTML fallback. No page scripts, account forms,
 // cookies, input values, tracking URLs or arbitrary data attributes are sent.
 const snippets:string[]=[];let remaining=12000;
 const candidates=Array.from(copy.querySelectorAll('table,[role="table"],[role="listbox"],select,[itemprop],p,li,section,div')).filter(el=>el.matches('table,[role="table"],[role="listbox"],select')||/size|sizing|grö(?:ss|ß)e|model|waist|taille|hip|hüft|inseam|length|länge|fit|passform/i.test(el.textContent||''));
 const leaves=candidates.filter(el=>!candidates.some(other=>other!==el&&el.contains(other)));
 for(const el of leaves.slice(0,60)){
  const fragment=el.cloneNode(true) as Element;
  for(const node of [fragment,...Array.from(fragment.querySelectorAll('*'))])for(const attribute of Array.from(node.attributes))if(!['role','aria-label','colspan','rowspan','itemprop','data-size'].includes(attribute.name))node.removeAttribute(attribute.name);
  const html=fragment.outerHTML.replace(/\s+/g,' ').slice(0,remaining);if(!html)break;snippets.push(html);remaining-=html.length;if(remaining<=0)break;
 }
 return {sizes:sizes.slice(0,60),models,fit,sourceHTML:(snippets.join('\n')+(structured.length?'\nProduct JSON-LD fields: '+JSON.stringify(structured.slice(0,2)):'')).slice(0,12000)};
}
