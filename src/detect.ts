import {parseTable,type Category,type Product} from './fit';
import {sizeLabel} from './chart-shape';
export type Chart={text:string;context:string};
export type Page={url:string;name:string;text:string;charts:Chart[]};
export function detect(page:Page):{product:Product|null;reason:string}{
 const name=page.name.toLowerCase();
 const category:Category|null=/hoodie|t-shirt|shirt|sweater|pullover|tee|hemd/.test(name)?'top':/jacket|coat|jacke|mantel/.test(name)?'jacket':/jeans|trousers|pants|hose|shorts/.test(name)?'trousers':/dress|overall|kleid|jumpsuit/.test(name)?'dress':/shoes|sneaker|boots|schuhe/.test(name)?'shoes':null;
 if(!category)return {product:null,reason:'Product category not clear yet.'};
 const candidates:Product[]=[];let reason='No readable size chart yet. Open the shop’s size guide; FORMA will read it automatically.';
 for(const chart of page.charts){
  const context=(chart.text+'\n'+chart.context).toLowerCase();const unit=/\bcm\b|centimet/.test(context)?'cm':/\binches\b|\binch\b|\bzoll\b/.test(context)?'in':null;
  if(!unit){reason='The chart does not specify cm or inches.';continue;}
  if((/\bcm\b|centimet/.test(context))&&/\binches\b|\binch\b|\bzoll\b/.test(context)){reason='This chart mixes units. Select one unit in the shop.';continue;}
  const body=/body measurements|body size|körperma|koerperma|to fit (?:chest|waist)/.test(context);
  const flat=/pit.to.pit|half chest|half waist|half hip|laid flat|measured flat|flach gemessen|halbe.*weite/.test(context);
  const full=/circumference|umfang/.test(context);
  const garment=/garment measurements|product measurements|kleidungs.*ma/.test(context)||flat;
  if((body&&garment)||(flat&&full)||(!body&&!garment)||(garment&&!flat&&!full)){reason='The chart does not clearly distinguish body sizes, garment widths and circumferences.';continue;}
  let rows=chart.text.trim().split('\n').map(r=>r.split(';'));
  if(!rows.length)continue;
  // Common transposed charts: measurements in the first column, sizes across the top.
  if(rows[0].length>1&&rows[0].slice(1).every(s=>sizeLabel.test(s.trim()))&&rows.length>1){rows=rows[0].map((_,i)=>rows.map(r=>r[i]||''));rows[0][0]='Size';}
  rows[0]=rows[0].map(h=>{const t=h.toLowerCase().replace(/\([^)]*\)/g,'').replace(/\bcm\b|\binches\b/gi,'').trim();if(/size|grösse|größe/.test(t))return 'Size';if(/chest|bust|brust|pit.to.pit/.test(t))return 'chest';if(/waist|taille/.test(t))return 'waist';if(/hip|hüft/.test(t))return 'hip';if(/inseam|inside leg|innenbein/.test(t))return 'inseam';if(/shoulder|schulter/.test(t)&&!/sleeve|ärmel/.test(t))return 'shoulder';if(/sleeve|ärmel/.test(t))return /shoulder seam|schulternaht/.test(context)?'sleeve':'unknown sleeve method';if(/foot length|fusslänge/.test(t))return 'foot';if(/foot width|fussbreite/.test(t))return 'width';if(/length|länge/.test(t))return 'length';return t;});
  try{candidates.push(parseTable(rows.map(r=>r.join(';')).join('\n'),{name:page.name,category,measurementType:body?'body':'garment',unit,flat,source:page.url}));}catch{reason='The chart layout could not be read reliably.';}
 }
 if(candidates.length){const canonical=JSON.stringify(candidates[0].sizes);if(candidates.some(p=>JSON.stringify(p.sizes)!==canonical))return {product:null,reason:'Several different size charts found. Open the chart for this product only.'};return {product:candidates[0],reason:'Read automatically from the product size chart.'};}
 return {product:null,reason};
}
