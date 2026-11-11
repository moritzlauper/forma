import {normalise,type Profile,type Product,type Key,type Measure} from './fit';
import {fitWeights} from './scoring';
export const sameSize=(a:string,b:string)=>a.trim().toUpperCase()===b.trim().toUpperCase();

export function knownMeasures(profile:Profile):Partial<Record<Key,Measure>>{
 return Object.fromEntries(Object.entries(profile.measures).filter(([,m])=>m&&!m.estimated));
}
// Distinguish an estimate from a measured comparison without requiring users
// to measure themselves. Missing dimensions remain explicit uncertainties.
export function sizeEvidence(product:Product|null,profile:Profile,description:string,feedback:{size:string;value:string}[],hasGoodFitExample=false){
 const measures=knownMeasures(profile);
 const concerns=[...(profile.context?.concerns||[]),description].join('\n');
 const category=product?.category||profile.category;
 const primary:Key=category==='trousers'?'waist':category==='shoes'?'foot':'chest';
 const fits=feedback.filter(f=>f.size.trim()&&/^fits$/i.test(f.value)&&!feedback.some(other=>sameSize(other.size,f.size)&&/too |zu /i.test(other.value)));
 const fitted=product?product.sizes.filter(s=>fits.some(f=>sameSize(f.size,s.label))).map(s=>s.label):Array.from(new Set(fits.map(f=>f.size.trim())));
 const priorities:Key[]=[];
 const shortSleeve=!!product&&/t[ -]?shirt|\btee\b/i.test(product.name)&&!/long[ -]?sleeve/i.test(product.name);
 if((category==='top'||category==='jacket')&&!shortSleeve&&/(?:sleeves?|ärmel|ärlem)[^.\n]{0,50}(?:short|zu kurz)/i.test(concerns))priorities.push('sleeve');
 if(category==='trousers'&&(/Avoid short trousers/i.test(concerns)||/(?:trousers|pants|hosen)[^.\n]{0,50}(?:short|zu kurz)/i.test(concerns)))priorities.push('inseam');
 if(product&&/hoodie/i.test(product.name)&&/hoodies?[^.\n]{0,50}(?:short|zu kurz)/i.test(concerns))priorities.push('length');
 const blockers:string[]=[];
 if(!product&&!fitted.length)blockers.push('No verified size measurements are available for comparison.');
 if(profile.mode==='reference'&&product&&(profile.category!==product.category||product.measurementType!=='garment'))blockers.push('The reference garment and product chart are not comparable.');
 const hasBodyContext=!!profile.context?.height&&!!profile.context?.weight;
 if(!measures[primary]&&!fitted.length&&!hasBodyContext&&!hasGoodFitExample)blockers.push('Add height and weight, a known measurement, or a tried size to personalise the estimate.');
 const eligibleSizes=product?.sizes.filter(s=>{
  if(feedback.some(f=>{
   if(!/too (tight|short|small)|zu (eng|kurz|klein)/i.test(f.value))return false;
   if(sameSize(f.size,s.label))return true;
   const tried=product.sizes.find(other=>sameSize(other.label,f.size));if(!tried)return false;
   const dimensions:Key[]=[];
   if(/too tight|zu eng/i.test(f.value))dimensions.push(primary);
   if(/sleeve.*short|ärmel.*kurz/i.test(f.value))dimensions.push('sleeve');
   else if(/too short|zu kurz/i.test(f.value))dimensions.push(category==='trousers'?'inseam':'length');
   return dimensions.some(k=>s.measures[k]!==undefined&&tried.measures[k]!==undefined&&normalise(s.measures[k]!,product.unit,product.flat,k)[1]<=normalise(tried.measures[k]!,product.unit,product.flat,k)[0]);
  }))return false;
  return fitted.includes(s.label)||s.measures[primary]!==undefined;
 }).map(s=>s.label)||fitted;
 const unknowns:string[]=[];
 for(const k of priorities){
  if(!fitted.length&&(!measures[k]||!product?.sizes.some(s=>s.measures[k]!==undefined)))unknowns.push(k==='sleeve'?'Sleeve length is unverified. Wider chest measurements do not establish longer sleeves.':k==='inseam'?'Trouser length is uncertain without a comparable inseam.':'Preferred hoodie length is estimated from stature and preferences, not a measured reference.');
 }
 if(!eligibleSizes.length&&!blockers.length)blockers.push('No chart size remains supported after checking the available measurements and your recorded fit feedback.');
 const anchored=!!measures[primary]&&priorities.every(k=>!!measures[k]&&product?.sizes.every(s=>s.measures[k]!==undefined));
 return {canSelectSize:blockers.length===0,eligibleSizes:blockers.length?[]:eligibleSizes,priorities,blockers,unknowns,fittedSizes:fitted,basis:anchored?'comparison' as const:'estimate' as const,weights:fitWeights(product,priorities)};
}
