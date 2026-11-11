import type {Key,Product,Category} from './fit';
import {measurementTable,sizeLabel} from './chart-shape';
export const scoreKeys=['width','length','style','sleeves'] as const;
export type ScoreKey=typeof scoreKeys[number];
export type SizeRating={size:string;reason:string}&Record<ScoreKey,number|null>;
export type ScoredSize=SizeRating&{overall:number|null;assessed:number;applicable:number;eligible:boolean};
export type Weights=Record<ScoreKey,number>;
export function fitWeights(product:Product|null,priorities:Key[]):Weights{
 const upper=product?.category==='top'||product?.category==='jacket';
 const sleeves=upper&&!(/t[ -]?shirt|\btee\b/i.test(product?.name||'')&&!/long[ -]?sleeve/i.test(product?.name||''));
 return {width:3,length:priorities.includes('length')||priorities.includes('inseam')?5:/hoodie/i.test(product?.name||'')?4:3,style:2,sleeves:sleeves?(priorities.includes('sleeve')?4:2):0};
}
export type ScoreEvidence={category:Category;body:boolean;sizes:{label:string;factors:ScoreKey[]}[]};
export function scoringEvidence(product:Product|null,charts:{text:string;context:string}[],category:Category):ScoreEvidence{
 if(product)return {category:product.category,body:product.measurementType==='body',sizes:product.sizes.map(s=>({label:s.label,factors:([
  s.measures[product.category==='trousers'?'waist':product.category==='shoes'?'foot':'chest']!==undefined?'width':null,
  s.measures.length!==undefined||s.measures.inseam!==undefined?'length':null,
  s.measures.sleeve!==undefined?'sleeves':null,'style'
 ].filter(Boolean) as ScoreKey[])}))};
 const sizes=new Map<string,Set<ScoreKey>>();let body=false;
 for(const chart of charts){const t=measurementTable(chart);if(!t)continue;body ||=t.subject==='body';
  let label=t.columns.findIndex(c=>category==='shoes'?/^EU(?:R)?$/i.test(c):/^INT(?:ERNATIONAL)?$/i.test(c));
  if(label<0)label=t.columns.findIndex(c=>/^(size|standardgrösse|standardgröße|grösse|größe)$/i.test(c));if(label<0)continue;
  for(const row of t.rows){if(!row[label]||row.length!==t.columns.length||!(sizeLabel.test(row[label])||/^[2-6]?X{0,3}[SML](?:\/[2-6]?X{0,3}[SML])+$/i.test(row[label])))continue;const factors=sizes.get(row[label])||new Set<ScoreKey>(['style']);
   t.columns.forEach((c,i)=>{if(i===label||!/^\d+(?:[.,]\d+)?(?:\s*[–-]\s*\d+(?:[.,]\d+)?)?$/.test(row[i]))return;
    if(category==='trousers'?/waist|taille/i.test(c):category==='shoes'?/foot|fu(?:ss|ß)/i.test(c):/chest|bust|brust|pit.to.pit/i.test(c))factors.add('width');
    if(/length|länge|inseam/i.test(c)&&!/sleeve|ärmel|foot|fu(?:ss|ß)/i.test(c))factors.add('length');
    if(/sleeve|ärmel/i.test(c))factors.add('sleeves');});
   sizes.set(row[label],factors);
  }
 }
 return {category,body,sizes:[...sizes].map(([label,factors])=>({label,factors:[...factors]}))};
}
export function scoreSizes(value:unknown,product:Product,eligibleSizes:string[],weights:Weights):ScoredSize[]{return scoreEvidence(value,scoringEvidence(product,[],product.category),eligibleSizes,weights);}
export function scoreEvidence(value:unknown,evidence:ScoreEvidence,eligibleSizes:string[],weights:Weights):ScoredSize[]{
 if(!Array.isArray(value)||value.length!==evidence.sizes.length)throw Error('The AI did not score every chart size. Press Refresh to retry.');
 const seen=new Set<string>();
 const scored=value.map((rating:SizeRating)=>{
  const size=evidence.sizes.find(s=>s.label===rating?.size);
  if(!size||seen.has(rating.size)||typeof rating.reason!=='string'||!rating.reason.trim()||rating.reason.length>500)throw Error('The AI returned invalid size scores.');
  seen.add(rating.size);
  for(const k of scoreKeys)if(rating[k]!==null&&(typeof rating[k]!=='number'||!Number.isFinite(rating[k])||rating[k]!<0||rating[k]!>100))throw Error('The AI returned a score outside 0–100.');
  const scores={...rating};
  for(const k of scoreKeys)if(!size.factors.includes(k)||weights[k]===0||(k==='length'&&evidence.body))scores[k]=null;
  const applicable=scoreKeys.filter(k=>weights[k]>0),assessed=applicable.filter(k=>scores[k]!==null);
  const total=assessed.reduce((sum,k)=>sum+weights[k],0),eligible=eligibleSizes.includes(size.label);
  const weighted=eligible&&total?Math.round(assessed.reduce((sum,k)=>sum+scores[k]!*weights[k],0)/total):null;
  // A clearly poor essential dimension cannot be averaged into a good fit.
  const critical=(['width','length','sleeves'] as const).flatMap(k=>scores[k]!==null&&scores[k]!<60?[scores[k]!]:[]);
  const overall=weighted===null?null:Math.min(weighted,...critical);
  return {...scores,reason:eligible?scores.reason:'Excluded by recorded fit feedback or missing sizing evidence.',overall,assessed:assessed.length,applicable:applicable.length,eligible};
 });
 return scored.sort((a,b)=>(b.overall??-1)-(a.overall??-1)||(b.length??-1)-(a.length??-1));
}
