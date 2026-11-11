import type {Category} from './fit';
export type PageDetection={kind:'clothing'|'other'|'unknown';name:string;category:Category|null;signals:string[]};
export function clothingCategory(text:string):Category|null{
 const t=text.toLowerCase();
 if(/\b(jackets?|coats?|(?:winter|sommer|regen|jeans|leder|daunen|übergangs)?jacke[n]?|mantel|parka|blazer|anorak|outerwear)\b/.test(t))return 'jacket';
 if(/\b(jeans|trousers?|pants|hosen?|shorts|chinos?|leggings?|joggers?|sweatpants)\b/.test(t))return 'trousers';
 if(/\b(dress(?:es)?|jumpsuits?|overalls?|kleid(?:er)?|skirts?|rock|röcke)\b/.test(t))return 'dress';
 if(/\b(shoes?|sneakers?|boots?|schuhe|sandals?|loafers?)\b/.test(t))return 'shoes';
 if(/\b(hoodies?|t[ -]?shirts?|shirts?|sweaters?|sweatshirts?|pullovers?|tees?|hemden?|hemd|cardigans?|knitwear|tops?|tank tops?|blouses?|blusen?|jerseys?|fleece)\b/.test(t))return 'top';
 return null;
}
// This classifier uses only the DOM. No network, AI call or storage access.
export function detectClothingPage(doc:Document):PageDetection{
 const root=doc.querySelector('main')||doc.body;
 const heading=root.querySelector('h1')?.textContent?.trim()||doc.querySelector('h1')?.textContent?.trim()||doc.title;
 const nodes:any[]=[];
 for(const script of Array.from(doc.querySelectorAll('script[type="application/ld+json"]'))){try{
  if(script.closest('nav,footer,[class*="recommend"],[class*="related"]'))continue;
  let visited=0;const walk=(v:any,depth=0)=>{if(depth>8||++visited>500||!v||typeof v!=='object')return;
   const types=[v['@type']].flat();if(types.includes('ItemList')||types.includes('CollectionPage'))return;
   if(types.includes('Product')||types.includes('ProductGroup'))nodes.push(v);
   for(const [key,child] of Object.entries(v))if(!['itemListElement','isRelatedTo','isSimilarTo'].includes(key)&&typeof child==='object')walk(child,depth+1);
  };walk(JSON.parse(script.textContent||''));
 }catch{}}
 const normal=(s:unknown)=>typeof s==='string'?s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim():'';
 const pagePath=(()=>{try{return new URL(doc.URL).pathname;}catch{return '';}})();
 const productPath=/\/(?:products?|p|item|artikel)\/[^/]+/i.test(pagePath)||/\/[^/]+\.html$/i.test(pagePath);
 const samePage=(url:unknown)=>{try{return typeof url==='string'&&new URL(url,doc.URL).pathname===pagePath;}catch{return false;}};
 const named=nodes.find(n=>samePage(n.url)||normal(n.name)&&normal(heading).includes(normal(n.name)));
 const structured=named||(nodes.length===1&&(productPath||!heading)?nodes[0]:undefined);
 const name=heading||String(structured?.name||'');
 const breadcrumbs=Array.from(root.querySelectorAll('[class*="breadcrumb"],[aria-label*="readcrumb"]')).map(el=>el.textContent||'').join(' ');
 const metaCategory=doc.querySelector('meta[property="product:category"]')?.getAttribute('content')||'';
 const category=clothingCategory(name)||clothingCategory(String(structured?.category||''))||clothingCategory(metaCategory)||clothingCategory(breadcrumbs);
 const copy=root.cloneNode(true) as Element;copy.querySelectorAll('nav,footer,header,script,style,#forma-fit-card,[class*="recommend"],[class*="related"]').forEach(el=>el.remove());
 const text=(copy.textContent||'').replace(/\s+/g,' ').slice(0,16000);
 const purchase=!!copy.querySelector('form[action*="cart"],button[name="add"],[data-add-to-cart]')||Array.from(copy.querySelectorAll('button,[role="button"],input[type="submit"]')).some(el=>/^(add to (?:bag|cart|basket)|buy now|in den warenkorb|zum warenkorb hinzufügen|sold out|ausverkauft)$/i.test((el.textContent||el.getAttribute('value')||'').trim()));
 const price=!!structured?.offers||!!copy.querySelector('[itemprop="price"],[data-product-price]')||!!doc.querySelector('meta[property="product:price:amount"]')||/(?:CHF|USD|EUR|GBP|[$€£])\s*\d|\d[\d.,]*\s*(?:CHF|USD|EUR|GBP|€)/i.test(text);
 const sizes=!!copy.querySelector('select[name*="size" i],select[aria-label*="size" i],[data-size-selector]')||/\b(?:size|grösse|größe)\b.{0,30}\b(?:XS|S|M|L|XL|XXL)\b/i.test(text);
 const productMeta=/product/i.test(doc.querySelector('meta[property="og:type"]')?.getAttribute('content')||'')||!!root.querySelector('[itemtype$="/Product"]');
 const listing=/\/(?:collections|category|categories|search)(?:\/|$)/i.test(pagePath)&&!productPath;
 const itemCount=copy.querySelectorAll('[class*="product-card"],[data-product-card]').length;
 const clearlyOther=/\b(mug|poster|phone|laptop|camera|headphones|sofa|table|chair|perfume|candle)\b/i.test(name);
 const commerce=!!structured||productMeta||purchase&&(price||sizes||productPath)||productPath&&price;
 const garment=!!category||sizes&&/sleeve|garment|pit.to.pit|inseam|brustumfang|ärmellänge/i.test(text);
 const signals=[structured?'product data':'',productMeta?'product metadata':'',purchase?'purchase control':'',price?'price':'',sizes?'size selection':'',garment?'clothing details':''].filter(Boolean);
 const kind=listing||itemCount>2&&!named||clearlyOther?'other':commerce&&garment?'clothing':commerce?'unknown':'other';
 return {kind,name,category,signals};
}
