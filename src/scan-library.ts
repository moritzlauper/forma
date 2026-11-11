import {normalise,type Product,type Key} from './fit';
import type {Page} from './detect';
import {productIdentity,type GoodFit} from './good-fits';
export type ScanRecord={url:string;name:string;observedAt:number;description:string;charts:Page['charts'];images:string[];product:Product|null;measurements:{size:string;key:Key;raw:number|[number,number];unit:'cm'|'in';flat:boolean;cm:[number,number];subject:'body'|'garment';source:'shop-chart'|'user-confirmed-chart';sourceURL:string}[]};
// Published chart values are evidence, not measurements of the user's body.
// AI conclusions deliberately do not enter this evidence store.
export function recordScan(previous:ScanRecord[],page:Page,product:Product|null,now=Date.now(),source:ScanRecord['measurements'][number]['source']='shop-chart'):ScanRecord[]{
 const url=productIdentity(page.url);const old=previous.find(r=>r.url===url);
 if(!page.charts.length&&old?.charts.length)return previous; // A closed/unloaded guide must not erase evidence.
 const record:ScanRecord={url,name:page.name,observedAt:now,description:page.text.slice(0,6000),charts:page.charts.slice(0,4).map(c=>({text:c.text.slice(0,8000),context:c.context.slice(0,2000)})),images:(page.images||[]).slice(0,2),product,
  measurements:product?product.sizes.flatMap(s=>Object.entries(s.measures).map(([key,raw])=>({size:s.label,key:key as Key,raw:raw!,unit:product.unit,flat:product.flat,cm:normalise(raw!,product.unit,product.flat,key as Key),subject:product.measurementType,source,sourceURL:page.url}))):[]};
 if(old&&JSON.stringify({...old,observedAt:0})===JSON.stringify({...record,observedAt:0}))return previous;
 return [record,...previous.filter(r=>r.url!==url)].slice(0,50);
}
export function enrichGoodFits(goodFits:GoodFit[],scans:ScanRecord[]):GoodFit[]{
 return goodFits.map(entry=>{
  const scan=scans.find(s=>s.url===productIdentity(entry.url));
  if(!scan)return entry;
  return {...entry,product:entry.product||scan.product,charts:entry.charts?.length?entry.charts:scan.charts,images:entry.images?.length?entry.images:scan.images,description:entry.description||scan.description};
 });
}
