// Shared by the page collector and parser so transposed charts are not lost
// before detection/AI sees them. No explicit "Size" heading is required.
export const sizeLabel = /^(?:[2-6]?X{1,3}[SL]|[SML]|\d{2,3}(?:[.,]\d+)?)$/i;
const sizeSystem=(label:string)=>/^(?:EU|EUR|INT|INTERNATIONAL|FR|IT|UK|US|JEANS)(?:\s+(?:SIZE|GRÖSSE|GRÖßE))?(?:\s*\([^)]*\))?$/i.test(label);
export function hasMeasurementColumns(text:string){
 const header=text.trim().split('\n')[0]?.split(';')||[];
 return header.some(c=>sizeSystem(c)||/^(?:size|grösse|größe)$/i.test(c.trim()))&&header.some(c=>/waist|taille|hüft|hip|chest|brust|foot.length|fu(?:ss|ß)länge|beinlänge|inseam|sleeve|ärmel/i.test(c));
}
export function measurementTable(chart:{text:string;context:string}){
 if(!hasMeasurementColumns(chart.text))return null;
 const [columns,...rows]=chart.text.trim().split('\n').map(row=>row.split(';').map(c=>c.trim()));
 const context=chart.text+' '+chart.context;
 const cm=/\bcm\b|centimet/i.test(context),inch=/\binch(?:es)?\b|\bzoll\b/i.test(context);
 return {columns,rows,subject:/körperma|koerperma|body measurements|body size/i.test(context)?'body':'unspecified',unit:cm&&!inch?'cm':inch&&!cm?'in':null};
}
export function sizeConversion(text:string){
 let rows=text.trim().split('\n').map(row=>row.split(';').map(cell=>cell.trim()));
 if(rows.filter(row=>sizeSystem(row[0]||'')).length>=3&&rows.every(r=>r.length===rows[0].length))rows=rows[0].map((_,i)=>rows.map(r=>r[i]));
 const columns=rows[0]||[];
 const systems=columns.filter(sizeSystem);
 // A guide may combine conversion labels with a separately labelled foot
 // length. Preserve both; unit parsing decides whether cm are usable.
 if(systems.length<3)return null;
 const values=rows.slice(1).filter(row=>row.length===columns.length&&row.filter(Boolean).length>=3);
 if(!values.length)return null;
 return {kind:'size-conversion' as const,columns,rows:values.filter((r,i)=>values.findIndex(other=>JSON.stringify(other)===JSON.stringify(r))===i)};
}
export function isSizeChart(text:string):boolean {
 if(hasMeasurementColumns(text))return true;
 if(sizeConversion(text))return true;
 const rows=text.trim().split('\n').map(row=>row.split(';').map(cell=>cell.trim()));
 if(rows.length<2)return false;
 if(/size|grösse|größe/i.test(rows[0].join(' ')))return true;
 const sizes=rows[0].slice(1);
 const hasMeasurements=/(?:^|\s)(?:pit[\s-]+to[\s-]+pit|chest|bust|waist|hips?|sleeves?|length|brust\w*|taille\w*|hüft\w*|ärmel\w*|länge)(?:\s|\(|$)/i.test(rows.slice(1).map(row=>row[0]).join(' '));
 return sizes.length>0&&sizes.every(size=>sizeLabel.test(size))&&hasMeasurements&&rows.slice(1).some(row=>row.slice(1).some(cell=>/\d/.test(cell)));
}

// Read labels independently of measurement units. This supports a tentative
// choice without promoting unlabelled numbers to verified centimetres.
export function guideSizeEvidence(charts:{text:string;context:string}[],category:string,waistLabel='',feedback:{size:string;value:string}[]=[]){
 const tables=charts.map(measurementTable).filter(t=>t?.subject==='body');
 const labels=(column:string)=>category==='shoes'?/^EU(?:R)?$/i.test(column):/^INT(?:ERNATIONAL)?$/i.test(column);
 const valid=(label:string)=>sizeLabel.test(label)||/^[2-6]?X{0,3}[SML](?:\/[2-6]?X{0,3}[SML])+$/i.test(label);
 const sizes=Array.from(new Set(tables.flatMap(t=>{
  const index=t!.columns.findIndex(labels);
  return index<0?[]:t!.rows.filter(r=>r.length===t!.columns.length).map(r=>r[index]).filter(valid);
 })));
 const usual=new Set(waistLabel.match(/\d{2,3}(?:[.,]\d+)?/g)||[]);
 const matches=category==='trousers'?charts.flatMap(c=>{
  const guide=sizeConversion(c.text);if(!guide)return [];
  const jeans=guide.columns.findIndex(c=>/^JEANS$/i.test(c)),international=guide.columns.findIndex(c=>/^INT(?:ERNATIONAL)?$/i.test(c));
  if(jeans<0||international<0)return [];
  return guide.rows.filter(r=>usual.has(r[jeans])&&sizes.includes(r[international])).map(r=>({size:r[international],system:'JEANS',label:r[jeans]}));
 }):[];
 const excludedSizes=new Set<string>();
 // Within one reference table, relative widths remain comparable even when
 // the unit is unstated. A smaller range cannot fix reported tightness.
 for(const t of tables){
  const label=t!.columns.findIndex(labels),width=t!.columns.findIndex(c=>category==='trousers'?/waist|taille/i.test(c):/chest|bust|brust/i.test(c));
  if(label<0||width<0)continue;
  const widths=new Map<string,number[]>();
  for(const row of t!.rows){const cell=(row[width]||'').replace(',','.');if(!/^\d+(?:\.\d+)?$/.test(cell))continue;const values=widths.get(row[label])||[];values.push(Number(cell));widths.set(row[label],values);}
  for(const f of feedback.filter(f=>/too tight|zu eng/i.test(f.value))){const tried=[...widths].find(([size])=>size.toUpperCase()===f.size.trim().toUpperCase())?.[1];if(!tried)continue;for(const [size,values]of widths)if(Math.max(...values)<=Math.min(...tried))excludedSizes.add(size);}
 }
 return {sizes,matches,excludedSizes:[...excludedSizes],uncertainties:tables.some(t=>!t!.unit)?['The body-size table does not state a single measurement unit. Its values are retained as published, not verified centimetres.']:[]};
}
