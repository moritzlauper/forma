import type {Key,Product} from './fit';
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
export function scoreSizes(value:unknown,product:Product,eligibleSizes:string[],weights:Weights):ScoredSize[]{
 if(!Array.isArray(value)||value.length!==product.sizes.length)throw Error('The AI did not score every chart size. Press Refresh to retry.');
 const seen=new Set<string>();
 const scored=value.map((rating:SizeRating)=>{
  const size=product.sizes.find(s=>s.label===rating?.size);
  if(!size||seen.has(rating.size)||typeof rating.reason!=='string'||!rating.reason.trim()||rating.reason.length>500)throw Error('The AI returned invalid size scores.');
  seen.add(rating.size);
  for(const k of scoreKeys)if(rating[k]!==null&&(typeof rating[k]!=='number'||!Number.isFinite(rating[k])||rating[k]!<0||rating[k]!>100))throw Error('The AI returned a score outside 0–100.');
  const scores={...rating};
  const width:Key=product.category==='trousers'?'waist':product.category==='shoes'?'foot':'chest';
  const length:Key=product.category==='trousers'&&size.measures.inseam!==undefined?'inseam':'length';
  // Missing garment dimensions cannot become invented numeric fit scores.
  if(size.measures[width]===undefined)scores.width=null;
  if(size.measures[length]===undefined||product.measurementType==='body')scores.length=null;
  if(size.measures.sleeve===undefined||weights.sleeves===0)scores.sleeves=null;
  const applicable=scoreKeys.filter(k=>weights[k]>0);
  const assessed=applicable.filter(k=>scores[k]!==null);
  const total=assessed.reduce((sum,k)=>sum+weights[k],0);
  const eligible=eligibleSizes.includes(size.label);
  return {...scores,reason:eligible?scores.reason:'Excluded by recorded fit feedback or missing sizing evidence.',overall:eligible&&total?Math.round(assessed.reduce((sum,k)=>sum+scores[k]!*weights[k],0)/total):null,assessed:assessed.length,applicable:applicable.length,eligible};
 });
 // Missing values do not earn points and are not scored as a bad fit. Coverage
 // stays visible alongside the relative score, which is not a probability.
 return scored.sort((a,b)=>(b.overall??-1)-(a.overall??-1)||(b.length??-1)-(a.length??-1));
}
