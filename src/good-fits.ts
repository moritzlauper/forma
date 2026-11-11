import {validateProduct,type Category,type Product,type Profile,type Key} from './fit';
import type {Chart} from './detect';
export type GoodFit={charts?:Chart[];images?:string[];url:string;name:string;category:Category|null;product:Product|null;description?:string;size:string;reason:string;savedAt:number};
export function productIdentity(url:string):string{try{const u=new URL(url);return u.origin+u.pathname;}catch{return url;}}
export function saveGoodFit(entries:GoodFit[],entry:GoodFit):GoodFit[]{return [{...entry,reason:entry.reason.slice(0,1200)},...entries.filter(e=>productIdentity(e.url)!==productIdentity(entry.url))].slice(0,50);}
export function goodFitExamples(entries:GoodFit[],product:Product|null,profile:Profile){
 const category=product?.category||profile.category;
 const kind=(name:string)=>/hoodie/i.test(name)?'hoodie':/t[ -]?shirt|\btee\b/i.test(name)?'t-shirt':'';
 return entries.filter(e=>e&&e.category===category&&typeof e.name==='string').sort((a,b)=>Number(kind(b.name)===kind(product?.name||''))-Number(kind(a.name)===kind(product?.name||''))).slice(0,6).map(e=>{
  let source:Product|null=null;try{source=e.product?validateProduct(e.product):null;}catch{}
  const size=source?.sizes.find(s=>s.label===e.size);
  return {name:e.name,category:e.category,description:String(e.description||'').slice(0,600),reason:String(e.reason||'').slice(0,1200),size:e.size||null,
   // A bookmark alone is a preference, not a known measurement or tried size.
   measurements:size&&source?.measurementType==='garment'?{values:size.measures,unit:source.unit,flat:source.flat,source:'Published measurements for the size the user confirmed fits'}:null};
 });
}
export function hasComparableExample(examples:ReturnType<typeof goodFitExamples>,product:Product|null):boolean{
 if(!product||product.measurementType!=='garment')return false;
 const primary:Key=product.category==='trousers'?'waist':product.category==='shoes'?'foot':'chest';
 return examples.some(e=>e.measurements?.values[primary]!==undefined);
}
