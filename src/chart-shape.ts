// Shared by the page collector and parser so transposed charts are not lost
// before detection/AI sees them. No explicit "Size" heading is required.
export const sizeLabel = /^(?:[2-6]?X{1,3}[SL]|[SML]|\d{2,3})$/i;
export function isSizeChart(text:string):boolean {
 const rows=text.trim().split('\n').map(row=>row.split(';').map(cell=>cell.trim()));
 if(rows.length<2)return false;
 if(/size|grösse|größe/i.test(rows[0].join(' ')))return true;
 const sizes=rows[0].slice(1);
 const hasMeasurements=/(?:^|\s)(?:pit[\s-]+to[\s-]+pit|chest|bust|waist|hips?|sleeves?|length|brust\w*|taille\w*|hüft\w*|ärmel\w*|länge)(?:\s|\(|$)/i.test(rows.slice(1).map(row=>row[0]).join(' '));
 return sizes.length>0&&sizes.every(size=>sizeLabel.test(size))&&hasMeasurements&&rows.slice(1).some(row=>row.slice(1).some(cell=>/\d/.test(cell)));
}
