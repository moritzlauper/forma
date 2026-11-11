export const labels = {chest:'Chest circumference',waist:'Waist circumference',hip:'Hip circumference',shoulder:'Shoulder width',sleeve:'Sleeve from shoulder seam',length:'Back length',inseam:'Inseam',foot:'Foot length',width:'Foot width'};
export type Key = keyof typeof labels;
export type Category = 'top'|'jacket'|'trousers'|'dress'|'shoes';
export type Measure = {value:number; uncertainty:number; locked?:boolean;estimated?:boolean};
export type Profile = {mode:'body'|'reference';category:Category;fit:'close'|'regular'|'relaxed'|'oversized'; measures:Partial<Record<Key,Measure>>;name:string; context?:{height:number;weight:number;waistLabel:string;style:string;concerns:string[]}};
export type Product = {name:string;category:Category;measurementType:'body'|'garment';unit:'cm'|'in';flat:boolean;source:string;sizes:{label:string;available:boolean;measures:Partial<Record<Key,number|[number,number]>>}[]};
export const keys:Record<Category,Key[]>={top:['chest','shoulder','sleeve','length'],jacket:['chest','shoulder','sleeve','length'],trousers:['waist','hip','inseam'],dress:['chest','waist','hip','length'],shoes:['foot','width']};
const circumferences:Key[]=['chest','waist','hip'];
export function normalise(value:number|[number,number],unit:string,flat:boolean,key:Key):[number,number]{const a=Array.isArray(value)?value:[value,value]; const f=(unit==='in'?2.54:1)*(flat&&circumferences.includes(key)?2:1);return [a[0]*f,a[1]*f];}
export function validateProduct(p:unknown):Product {
 const x=p as Product;
 if(!x||!keys[x.category]||!['body','garment'].includes(x.measurementType)||!['cm','in'].includes(x.unit)||typeof x.flat!=='boolean'||typeof x.name!=='string'||!Array.isArray(x.sizes)||!x.sizes.length||x.sizes.length>60)throw Error('Incomplete chart: check category, units, measurement type and sizes.');
 if(x.flat&&x.measurementType==='body')throw Error('Body circumferences cannot be flat garment widths.');
 const seen=new Set();for(const s of x.sizes){if(typeof s.label!=='string'||!s.label.trim()||seen.has(s.label)||typeof s.available!=='boolean'||!s.measures)throw Error('Size labels must be unique.');seen.add(s.label);for(const [k,v]of Object.entries(s.measures)){if(!(k in labels)||(!Array.isArray(v)&&typeof v!=='number')||(Array.isArray(v)&&(v.length!==2||v[0]>v[1]))||[v].flat().some(n=>typeof n!=='number'||!Number.isFinite(n)||n<=0||n>400))throw Error('Invalid measurement in '+s.label);}}
 return x;
}
export function recommend(profile:Profile,product:Product){
 validateProduct(product);
 const missing=keys[product.category].filter(k=>!profile.measures[k]||!product.sizes.every(s=>s.measures[k]!==undefined));
 const base={missing,ranked:[] as {label:string;available:boolean;score:number;details:{key:Key;delta:number;text:string;uncertain:boolean;bad:boolean}[]}[],quality:'limited',message:''};
 if(profile.mode==='reference'&&(profile.category!==product.category||product.measurementType!=='garment'))return {...base,message:'A reference garment needs matching categories and garment measurements.'};
 if(profile.mode==='body'&&product.category==='shoes'&&product.measurementType==='garment')return {...base,message:'Shoes need a manufacturer chart with recommended foot measurements.'};
 const primary=keys[product.category][0];
 if(!profile.measures[primary]||!product.sizes.every(s=>s.measures[primary]!==undefined))return {...base,message:`A recommendation needs ${labels[primary]}.`};
 const comparisons=keys[product.category].filter(k=>profile.measures[k]&&product.sizes.every(s=>s.measures[k]!==undefined));
 const rows=product.sizes.map(s=>{
  const details=comparisons.map(k=>{
   const m=profile.measures[k]!;const [lo,hi]=normalise(s.measures[k]!,product.unit,product.flat,k);
   let target=m.value;let tolerance=circumferences.includes(k)?4:2;
   if(product.measurementType==='garment'&&profile.mode==='body'&&circumferences.includes(k))target+=k==='waist'&&product.category==='trousers'?2:({close:4,regular:10,relaxed:18,oversized:28}[profile.fit]+(product.category==='jacket'?6:0));
   if(product.measurementType==='body')tolerance=0;
   const delta=target<lo?lo-target:target>hi?hi-target:0;
   const uncertain=m.uncertainty>0 && Math.abs(delta)<=m.uncertainty+tolerance;
   const bad=Math.abs(delta)>tolerance+m.uncertainty;
   const length=['sleeve','length','inseam','foot'].includes(k);
   return {key:k,delta,text:Math.abs(delta)<=tolerance?'within target':delta>0?(length?'likely longer':'likely wider'):(length?'likely shorter':'likely tighter'),uncertain,bad};
  });
  return {label:s.label,available:s.available,details,score:details.reduce((sum,d)=>{const concern=profile.context?.concerns||[];const extra=(d.delta<0&&d.key==='sleeve'&&concern.includes('Sleeves often too short'))||(d.delta<0&&d.key==='inseam'&&concern.includes('Avoid short trousers'))||(d.delta>0&&d.key==='length'&&product.category==='top'&&concern.includes('T-shirts often too long'));return sum+Math.abs(d.delta)*(d.key===primary?2:1)*(extra?2:1);},0)};
 }).sort((a,b)=>a.score-b.score);
 const guessed=comparisons.some(k=>profile.measures[k]!.estimated);
 const good=!missing.length&&comparisons.every(k=>profile.measures[k]!.uncertainty<=1);
 const anyFit=rows.some(r=>!r.details.some(d=>d.bad));
 return {...base,ranked:rows,quality:guessed?'rough estimate':good?'good':comparisons.length>1?'limited':'weak',message:guessed?`${rows[0].label} is a tentative starting point, based on estimated measurements.`:anyFit?`${rows[0].label} is the closest comparison.`:'No size meets all checked targets.'};
}
export function parseTable(text:string,meta:Omit<Product,'sizes'>):Product {
 const rows=text.trim().split(/\n/).map(l=>l.split(/\t|;/).map(s=>s.trim()));
 const header=rows.shift()!.map(h=>h.toLowerCase());
 const aliases:Record<string,Key>={chest:'chest',brust:'chest',brustumfang:'chest','pit to pit':'chest',waist:'waist',taille:'waist',hip:'hip',hips:'hip',hüfte:'hip',shoulder:'shoulder',schulter:'shoulder',sleeve:'sleeve',ärmel:'sleeve',length:'length',länge:'length',inseam:'inseam',innenbein:'inseam',foot:'foot',fuss:'foot',width:'width',fussbreite:'width'};
 if(header.length<2)throw Error('Separate columns with semicolons or tabs: Size; Chest; Sleeve; Length.');
 const sizeIndex=header.findIndex(h=>/^(size|grösse|größe|label)$/.test(h));if(sizeIndex<0)throw Error('Missing Size column.');
 const sizes=rows.filter(r=>r.some(Boolean)).map(r=>{const measures:Product['sizes'][0]['measures']={};header.forEach((h,i)=>{const key=aliases[h];if(!key||!r[i]||r[i]==='?')return;const raw=r[i].replace(/,/g,'.').replace(/cm|inches|inch/gi,'').trim();if(!/^\d+(\.\d+)?(\s*[-–]\s*\d+(\.\d+)?)?$/.test(raw))throw Error('Unreadable measurement: '+r[i]);const a=raw.split(/[-–]/).map(Number);measures[key]=a.length===2?[a[0],a[1]]:a[0];});return {label:r[sizeIndex],available:!r.some(v=>/^(sold out|ausverkauft)$/.test(v.toLowerCase())),measures};});
 return validateProduct({...meta,sizes});
}
