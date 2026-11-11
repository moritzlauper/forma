import {mergeCharts,mergeListing,mergeProduct} from './evidence-merge';
import {normalise,type Product,type Key} from './fit';
import type {Page} from './detect';
import {measurementTable} from './chart-shape';
import {productIdentity,type GoodFit} from './good-fits';
export type ScanRecord={category?:Product['category']|null;evidence?:Page['evidence'];url:string;name:string;observedAt:number;description:string;charts:Page['charts'];images:string[];product:Product|null;measurementTables:ReturnType<typeof measurementTable>[];measurements:{size:string;key:Key;raw:number|[number,number];unit:'cm'|'in';flat:boolean;cm:[number,number];subject:'body'|'garment';source:'shop-chart'|'user-confirmed-chart';sourceURL:string}[]};
// Published chart values are evidence, not measurements of the user's body.
// AI conclusions deliberately do not enter this evidence store.
export function recordScan(previous:ScanRecord[],page:Page,product:Product|null,now=Date.now(),source:ScanRecord['measurements'][number]['source']='shop-chart'):ScanRecord[]{
 const url=productIdentity(page.url);const old=previous.find(r=>r.url===url);
 if(old){page={...page,charts:mergeCharts(old.charts,page.charts),evidence:mergeListing(old.evidence,page.evidence),images:page.images?.length?page.images:old.images};product=mergeProduct(old.product,product);}
 const record:ScanRecord={category:product?.category||page.detection?.category||old?.category||null,evidence:page.evidence,url,name:page.name,observedAt:now,description:page.text.slice(0,6000),charts:page.charts.slice(0,12).map(c=>({text:c.text.slice(0,8000),context:c.context.slice(0,2000)})),images:(page.images||[]).slice(0,2),product,measurementTables:page.charts.slice(0,12).map(measurementTable).filter(Boolean),
  measurements:product?product.sizes.flatMap(s=>Object.entries(s.measures).map(([key,raw])=>({size:s.label,key:key as Key,raw:raw!,unit:product.unit,flat:product.flat,cm:normalise(raw!,product.unit,product.flat,key as Key),subject:product.measurementType,source,sourceURL:page.url}))):[]};
 if(old&&JSON.stringify({...old,observedAt:0})===JSON.stringify({...record,observedAt:0}))return previous;
 return [record,...previous.filter(r=>r.url!==url)].slice(0,50);
}
export function enrichGoodFits(goodFits:GoodFit[],scans:ScanRecord[]):GoodFit[]{
 return goodFits.map(entry=>{
  const scan=scans.find(s=>s.url===productIdentity(entry.url));
  if(!scan)return entry;
  const next={...entry,category:entry.category||scan.product?.category||scan.category||null,evidence:mergeListing(entry.evidence,scan.evidence),product:mergeProduct(entry.product,scan.product),charts:mergeCharts(entry.charts,scan.charts),images:Array.from(new Set([...(entry.images||[]),...scan.images])).slice(0,2),description:scan.description||entry.description};
  if(JSON.stringify(next)===JSON.stringify(entry))return entry;
  return {...next,evidenceObservedAt:scan.observedAt};
 });
}
