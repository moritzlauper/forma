import {validateProduct,type Category,type Product,type Profile,type Key} from './fit';
import {measurementTable} from './chart-shape';
import type {Page,Chart} from './detect';
export type GoodFit={evidence?:Page['evidence'];evidenceObservedAt?:number;charts?:Chart[];images?:string[];url:string;name:string;category:Category|null;product:Product|null;description?:string;size:string;reason:string;savedAt:number};
export function productIdentity(url:string):string{try{const u=new URL(url);return u.origin+u.pathname.replace(/^\/collections\/[^/]+\/products\//,'/products/');}catch{return url;}}
export function saveGoodFit(entries:GoodFit[],entry:GoodFit):GoodFit[]{return [{...entry,reason:entry.reason.slice(0,1200)},...entries.filter(e=>productIdentity(e.url)!==productIdentity(entry.url))].slice(0,50);}
export function goodFitExamples(entries:GoodFit[],product:Product|null,profile:Profile){
 const category=product?.category||profile.category;
 const kind=(name:string)=>/hoodie/i.test(name)?'hoodie':/t[ -]?shirt|\btee\b/i.test(name)?'t-shirt':'';
 return entries.filter(e=>e&&e.category===category&&typeof e.name==='string').sort((a,b)=>Number(kind(b.name)===kind(product?.name||''))-Number(kind(a.name)===kind(product?.name||''))).slice(0,6).map(e=>{
  let source:Product|null=null;try{source=e.product?validateProduct(e.product):null;}catch{}
  const size=source?.sizes.find(s=>s.label===e.size);
  return {name:e.name,category:e.category,description:String(e.description||'').slice(0,600),reason:String(e.reason||'').slice(0,1200),size:e.size||null,
   listingEvidence:e.evidence?{models:e.evidence.models,fit:e.evidence.fit}:null,
   // A bookmark alone is a preference, not a known measurement or tried size.
   bodySizeGuide:size&&source?.measurementType==='body'?{values:size.measures,unit:source.unit,source:'Published body-size reference range for the size confirmed to fit; not a measurement of the user'}:e.size?(e.charts||[]).map(measurementTable).filter(t=>t?.subject==='body').map(t=>({...t,rows:t!.rows.filter(r=>r[t!.columns.findIndex(c=>/^INT(?:ERNATIONAL)?$/i.test(c))]===e.size),source:'Published reference rows for a confirmed fit; unknown units remain unknown'})).filter(t=>t.rows.length):null,
   measurements:size&&source?.measurementType==='garment'?{values:size.measures,unit:source.unit,flat:source.flat,source:'Published measurements for the size the user confirmed fits'}:null};
 });
}
export function hasComparableExample(examples:ReturnType<typeof goodFitExamples>,product:Product|null):boolean{
 if(!product||product.measurementType!=='garment')return false;
 const primary:Key=product.category==='trousers'?'waist':product.category==='shoes'?'foot':'chest';
 return examples.some(e=>e.measurements?.values[primary]!==undefined);
}
