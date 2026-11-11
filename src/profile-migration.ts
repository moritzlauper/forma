import type {Profile} from './fit';
export function migrateProfile(profile:Profile):Profile{
 const translations:Record<string,string>={'Ärmel oft zu kurz':'Sleeves often too short','Hosen nicht zu kurz':'Avoid short trousers','T-Shirts oft zu lang':'T-shirts often too long','T-Shirts lieber breit':'Prefer wider T-shirts'};
 return {...profile,name:['Mein Fit','Mein Lieblingsstück'].includes(profile.name)?'My fit':profile.name,context:profile.context?{...profile.context,style:profile.context.style.replace(/\bAlternativ(?:e+)?\b/g,'Alternative'),concerns:profile.context.concerns.map(x=>translations[x]||x)}:undefined};
}
