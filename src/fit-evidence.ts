import type {Profile,Product,Key,Measure} from './fit';
export const sameSize=(a:string,b:string)=>a.trim().toUpperCase()===b.trim().toUpperCase();

export function knownMeasures(profile:Profile):Partial<Record<Key,Measure>>{
 return Object.fromEntries(Object.entries(profile.measures).filter(([,m])=>m&&!m.estimated));
}
// Eligibility is determined from evidence, not from an AI confidence claim or
// a hardcoded brand/size. A photo describes the garment, not the wearer's body.
export function sizeEvidence(product:Product|null,profile:Profile,description:string,feedback:{size:string;value:string}[]){
 const measures=knownMeasures(profile);
 const concerns=[...(profile.context?.concerns||[]),description].join('\n');
 const category=product?.category||profile.category;
 const primary:Key=category==='trousers'?'waist':category==='shoes'?'foot':'chest';
 const fitted=product?.sizes.filter(s=>feedback.some(f=>sameSize(f.size,s.label)&&/^fits$/i.test(f.value))).map(s=>s.label)||[];
 const priorities:Key[]=[];
 const shortSleeve=!!product&&/t[ -]?shirt|\btee\b/i.test(product.name)&&!/long[ -]?sleeve/i.test(product.name);
 if((category==='top'||category==='jacket')&&!shortSleeve&&/(?:sleeves?|ärmel|ärlem)[^.\n]{0,50}(?:short|zu kurz)/i.test(concerns))priorities.push('sleeve');
 if(category==='trousers'&&(/Avoid short trousers/i.test(concerns)||/(?:trousers|pants|hosen)[^.\n]{0,50}(?:short|zu kurz)/i.test(concerns)))priorities.push('inseam');
 if(product&&/hoodie/i.test(product.name)&&/hoodies?[^.\n]{0,50}(?:short|zu kurz)/i.test(concerns))priorities.push('length');
 const blockers:string[]=[];
 if(!product)blockers.push('No verified size measurements are available for comparison.');
 if(profile.mode==='reference'&&product&&(profile.category!==product.category||product.measurementType!=='garment'))blockers.push('The reference garment and product chart are not comparable.');
 if(!measures[primary]&&!fitted.length)blockers.push('Height and weight do not establish your personal fit. There is no known body/garment measurement or successfully tried size to anchor a size choice.');
 const eligibleSizes=product?.sizes.filter(s=>{
  if(fitted.includes(s.label))return true;
  return !!measures[primary]&&s.measures[primary]!==undefined&&priorities.every(k=>measures[k]&&s.measures[k]!==undefined);
 }).map(s=>s.label)||[];
 for(const k of priorities){
  if(!fitted.length&&(!measures[k]||!product?.sizes.some(s=>s.measures[k]!==undefined)))blockers.push(k==='sleeve'?'Sleeve length is a stated fit concern, but there is no reliable sleeve comparison. Chest width cannot settle it.':k==='inseam'?'Trouser length is a stated fit concern, but there is no reliable inseam comparison.':'Hoodie length is a stated fit concern, but there is no reliable length comparison.');
 }
 if(!eligibleSizes.length&&!blockers.length)blockers.push('The chart is missing measurements needed to check your fit priorities.');
 return {canSelectSize:blockers.length===0,eligibleSizes:blockers.length?[]:eligibleSizes,priorities,blockers};
}
