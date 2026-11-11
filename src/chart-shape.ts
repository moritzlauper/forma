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
