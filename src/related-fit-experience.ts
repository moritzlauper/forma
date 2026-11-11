import type {Feedback} from './assessment';
import type {Page} from './detect';
import type {ScanRecord} from './scan-library';
import {productIdentity} from './good-fits';
import {sameSize} from './fit-evidence';
import {clothingCategory} from './product-page';

function kind(name:string){
 for(const [kind,pattern] of [['hoodie',/hoodie|hooded sweat/i],['tee',/t[ -]?shirt|\btee\b/i],['shorts',/shorts/i],['sweatshirt',/sweat|knit|pullover/i]] as const)if(pattern.test(name))return kind;
 return clothingCategory(name);
}
/** Cross-item observations remain separate from exact-item size exclusions. */
export function relatedFitExperience(page:Page,feedback:Feedback[],scans:ScanRecord[]){
 const current=kind(page.name);
 if(!current)return [];
 return feedback.filter(f=>f.url?productIdentity(f.url)!==productIdentity(page.url):f.name!==page.name)
  .filter(f=>kind(f.name)===current).slice(-8).map(f=>{
   const scan=scans.find(s=>f.url?productIdentity(s.url)===productIdentity(f.url):s.name===f.name);
   return {name:f.name,size:f.size,value:f.value,note:f.note?.slice(0,1000),sourceURL:f.url,
    description:scan?.description.slice(0,1200),
    measurements:scan?.measurements.filter(m=>sameSize(m.size,f.size))||[]};
  });
}
