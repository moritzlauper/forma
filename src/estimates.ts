import type {Profile,Key,Measure} from './fit';
// Broad, unvalidated starting heuristics, not anthropometric measurements.
// No sex/gender inference; measured values always take precedence.
export function withEstimates(profile:Profile):Profile {
 if(profile.mode!=='body')return profile;
 const h=profile.context?.height,w=profile.context?.weight;
 if(!h||!w||h<140||h>210||w<40||w>160)return profile;
 const chest=102*Math.sqrt(w/83)*Math.pow(185/h,.25);
 const candidates:Partial<Record<Key,Measure>>={
  chest:{value:Math.round(chest),uncertainty:12,estimated:true},
  waist:{value:Math.round(chest*.84),uncertainty:14,estimated:true},
  hip:{value:Math.round(chest*1.02),uncertainty:14,estimated:true},
  shoulder:{value:Math.round(h*.245),uncertainty:5,estimated:true},
  sleeve:{value:Math.round(h*.34),uncertainty:6,estimated:true},
  inseam:{value:Math.round(h*.46),uncertainty:7,estimated:true}
 };
 const measures={...profile.measures};
 // Stature cannot establish a preferred garment length across tees, hoodies and jackets.
 if(measures.length?.estimated&&!measures.length.locked)delete measures.length;
 for(const [key,value] of Object.entries(candidates) as [Key,Measure][]){const current=measures[key];if(!current||(current.estimated&&!current.locked))measures[key]=value;}
 return {...profile,measures};
}
