import type {Category} from './fit';
export function jeansLabel(label:string):{waist:number;length:number|null}|null{
 const pair=label.trim().match(/^(?:W\s*)?(\d{2,3})\s*(?:[x×/]\s*(?:L\s*)?|L\s*)(\d{2,3})$/i);
 if(pair)return {waist:Number(pair[1]),length:Number(pair[2])};
 const waist=label.trim().match(/^W\s*(\d{2,3})$/i);return waist?{waist:Number(waist[1]),length:null}:null;
}
export function usualWaists(label:string):number[]{
 if(/cm|inch|EU|EUR/i.test(label))return [];
 const pair=jeansLabel(label);if(pair&&/[x×]|\bL\s*\d/i.test(label))return [pair.waist];
 return /^(?:W\s*)?\d{2,3}(?:\s*(?:\/|[-–]|or)\s*(?:W\s*)?\d{2,3})*$/i.test(label.trim())?Array.from(new Set((label.match(/\d{2,3}/g)||[]).map(Number))):[];
}
export function sizeBaseline(category:Category,sizes:string[],usual:string,references:{size:string|null;name:string}[],fitted:string[]=[]){
 if(category!=='trousers')return {rejected:[] as {size:string;reason:string}[],preferred:[] as string[],references:[] as string[]};
 const known=references.flatMap(r=>{if(!r.size)return [];const pair=jeansLabel(r.size);return pair?[{...pair,name:r.name}]:[];});
 const waists=known.length?Array.from(new Set(known.map(r=>r.waist))):usualWaists(usual);
 const rejected=sizes.filter(s=>!fitted.includes(s)).flatMap(size=>{const pair=jeansLabel(size);return pair&&waists.length&&!waists.includes(pair.waist)?[{size,reason:`W${pair.waist} does not match ${known.length?'your saved good-fit waist labels':'your usual waist labels'} (${waists.map(w=>'W'+w).join(' / ')}). A loose cut does not establish a different waistband fit.`}]:[];});
 const allowed=sizes.filter(s=>!rejected.some(r=>r.size===s));
 const complete=known.filter(r=>r.length!==null);
 const preferred=complete.length?allowed.filter(s=>{const pair=jeansLabel(s);return pair&&complete.some(r=>r.waist===pair.waist&&r.length===pair.length);}):[];
 return {rejected,preferred,references:Array.from(new Set(known.map(r=>r.name)))};
}
