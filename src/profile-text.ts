export const initialText="";
export function understand(text:string){
 const t=text.toLowerCase();
 const height=t.match(/\b(1[2-9]\d|2[0-2]\d)\s*(?:cm|gross|groß|gross)/)?.[1];
 const weight=t.match(/\b(\d{2,3}(?:[.,]\d)?)\s*(?:kg|kilo)/)?.[1];
 const waist=t.match(/(?:waist|\bw)\s*(\d{2})(?:\s*[\/–-]\s*(\d{2}))?/);
 const concerns:string[]=[];
 if(/(?:ärmel|ärlem|sleeve)[^.\n]{0,45}(?:zu kurz|short)/.test(t))concerns.push('Sleeves often too short');
 if(/(?:t-?shirts?|shirts?)[^.\n]{0,65}(?:zu lang|long)/.test(t))concerns.push('T-shirts often too long');
 if(/breit|boxy|wider|wide/.test(t))concerns.push('Prefer wider T-shirts');
 if(/(?:trousers|pants)[^.\n]{0,50}short/.test(t)||/hosen[^.\n]{0,40}(?:nicht|nbicht|nicht gern)[^.\n]{0,20}zu kurz/.test(t)||/hosen[^.\n]{0,25}zu kurz/.test(t))concerns.push('Avoid short trousers');
 const fit=/loose|locker/.test(t)?'relaxed':/oversized/.test(t)?'oversized':/körpernah|slim/.test(t)?'close':undefined;
 return {height:height?+height:undefined,weight:weight?+weight.replace(',','.'):undefined,waistLabel:waist?'W'+waist[1]+(waist[2]?' / W'+waist[2]:''):undefined,style:[/urban/.test(t)?'Urban':'',/alternativ/.test(t)?'Alternative':''].filter(Boolean).join(' / '),concerns,fit};
}
