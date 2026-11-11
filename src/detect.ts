import type {ProductEvidence} from './product-evidence';
import {parseTable,type Category,type Product,type Key} from './fit';
import {sizeLabel,sizeConversion} from './chart-shape';
import {clothingCategory,type PageDetection} from './product-page';
export type Chart={text:string;context:string};
export type Page={evidence?:ProductEvidence;url:string;name:string;text:string;charts:Chart[];images?:string[];detection?:PageDetection;manual?:boolean};
export function detect(page:Page):{product:Product|null;reason:string}{
 const category:Category|null=page.detection?.category||clothingCategory(page.name);
 if(!category)return {product:null,reason:'Product category not clear yet.'};
 const candidates:Product[]=[];let reason='FORMA could not read a size chart after checking this page’s size guide.';
 for(const chart of page.charts){
  const conversion=sizeConversion(chart.text);
  if(conversion){
   const eu=conversion.columns.findIndex(c=>/^EU(?:R)?(?:\s|$)/i.test(c));
   const foot=conversion.columns.findIndex(c=>/foot\s*length|fu(?:ss|ß)länge/i.test(c)&&/\bcm\b/i.test(c));
   if(category==='shoes'&&eu>=0&&foot>=0){
    try{candidates.push(parseTable('Size;foot\n'+conversion.rows.map(r=>r[eu]+';'+r[foot]).join('\n'),{name:page.name,category,measurementType:'body',unit:'cm',flat:false,source:page.url}));}catch{reason='Size labels were read, but foot lengths could not be parsed reliably.';}
   }else reason='Size conversion chart found. It maps size labels; no clearly labelled body or garment measurements were parsed.';
   continue;
  }
  const context=(chart.text+'\n'+chart.context).toLowerCase();const unit=/\bcm\b|centimet/.test(context)?'cm':/\binches\b|\binch\b|\bzoll\b/.test(context)?'in':null;
  if(!unit){reason='The chart does not specify cm or inches.';continue;}
  if((/\bcm\b|centimet/.test(context))&&/\binches\b|\binch\b|\bzoll\b/.test(context)){reason='This chart mixes units. Select one unit in the shop.';continue;}
  const body=/body measurements|body size|körperma|koerperma|to fit (?:chest|waist)/.test(context);
  const flat=/pit.to.pit|half chest|half waist|half hip|laid flat|measured flat|flach gemessen|halbe.*weite|(?:waist|chest|hip|bust)\s+(?:measured\s+)?across\s+(?:the\s+)?front|across\s+(?:the\s+)?front\s+of\s+(?:the\s+)?(?:waist|chest|hip|bust)/.test(context);
  const full=/circumference|umfang/.test(context);
  const garment=/garment measurements|product measurements|kleidungs.*ma/.test(context)||flat;
  if((body&&garment)||(flat&&full)||(!body&&!garment)||(garment&&!flat&&!full)){reason='The chart does not clearly distinguish body sizes, garment widths and circumferences.';continue;}
  let rows=chart.text.trim().split('\n').map(r=>r.split(';'));
  if(!rows.length)continue;
  // Common transposed charts: measurements in the first column, sizes across the top.
  if(rows[0].length>1&&rows[0].slice(1).every(s=>sizeLabel.test(s.trim()))&&rows.length>1){rows=rows[0].map((_,i)=>rows.map(r=>r[i]||''));rows[0][0]='Size';}
  const international=rows[0].findIndex(h=>/^INT(?:ERNATIONAL)?$/i.test(h.trim()));
  const european=rows[0].findIndex(h=>/^EU(?:R)?$/i.test(h.trim()));
  if(!rows[0].some(h=>/^(?:size|grösse|größe)$/i.test(h.trim()))){const index=category!=='shoes'&&international>=0?international:european;if(index>=0)rows[0][index]='Size';}
  rows[0]=rows[0].map(h=>{const t=h.toLowerCase().replace(/\([^)]*\)/g,'').replace(/\bcm\b|\binches\b/gi,'').trim();if(/size|grösse|größe/.test(t))return 'Size';if(/chest|bust|brust|pit.to.pit/.test(t))return 'chest';if(/waist|taille/.test(t))return 'waist';if(/hip|hüft/.test(t))return 'hip';if(/inseam|inside leg|innenbein|beinlänge.*innenseite/.test(t))return 'inseam';if(/shoulder|schulter/.test(t)&&!/sleeve|ärmel/.test(t))return 'shoulder';if(/sleeve|ärmel/.test(t))return /shoulder seam|schulternaht/.test(context)?'sleeve':'unknown sleeve method';if(/foot length|fu(?:ss|ß)länge/.test(t))return 'foot';if(/foot width|fussbreite/.test(t))return 'width';if(/length|länge/.test(t))return 'length';return t;});
  try{
   const meta:Omit<Product,'sizes'>={name:page.name,category,measurementType:body?'body' as const:'garment' as const,unit,flat,source:page.url};
   if(body){
    // Repeated INT labels represent a published body-size range. Keep the
    // bounds rather than rejecting duplicate labels or inventing an average.
    const sizes=new Map<string,Product['sizes'][number]>();
    for(const row of rows.slice(1)){
     const parsed=parseTable(rows[0].join(';')+'\n'+row.join(';'),meta).sizes[0];const old=sizes.get(parsed.label);
     if(!old){sizes.set(parsed.label,parsed);continue;}
     for(const [key,value]of Object.entries(parsed.measures)){
      const k=key as Key;const values=[old.measures[k],value].flat().filter((n):n is number=>typeof n==='number');if(values.length)old.measures[k]=[Math.min(...values),Math.max(...values)];
     }
    }
    candidates.push({...meta,sizes:[...sizes.values()]});
   }else candidates.push(parseTable(rows.map(r=>r.join(';')).join('\n'),meta));
  }catch{reason='The chart layout could not be read reliably.';}
 }
 if(candidates.length){const canonical=JSON.stringify(candidates[0].sizes);if(candidates.some(p=>JSON.stringify(p.sizes)!==canonical))return {product:null,reason:'Several different size charts found. Open the chart for this product only.'};return {product:candidates[0],reason:'Read automatically from the product size chart.'};}
 return {product:null,reason};
}
