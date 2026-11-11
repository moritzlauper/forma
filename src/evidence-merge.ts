import type {Chart,Page} from './detect';
import type {Product} from './fit';
export function mergeCharts(previous:Chart[]=[],incoming:Chart[]=[]):Chart[]{
 const charts=[...previous];
 for(const chart of incoming){const header=chart.text.split('\n')[0].trim();const index=charts.findIndex(c=>c.text.split('\n')[0].trim()===header);if(index<0)charts.push(chart);else{const oldRows=charts[index].text.split('\n'),newRows=chart.text.split('\n');charts[index]=oldRows.length>newRows.length&&newRows.every(row=>oldRows.includes(row))?{...chart,text:charts[index].text}:chart;}}
 return charts.slice(-12);
}
export function mergeListing(previous:Page['evidence'],incoming:Page['evidence']):Page['evidence']{
 if(!previous)return incoming;if(!incoming)return previous;
 const unique=<T>(items:T[])=>items.filter((value,index)=>items.findIndex(other=>JSON.stringify(other)===JSON.stringify(value))===index);
 return {sizes:unique([...previous.sizes,...incoming.sizes]).slice(0,60),models:unique([...previous.models,...incoming.models]).slice(0,3),fit:unique([...previous.fit,...incoming.fit]).slice(0,12),sourceHTML:incoming.sourceHTML||previous.sourceHTML};
}
export function mergeProduct(previous:Product|null,incoming:Product|null):Product|null{
 if(!previous)return incoming;if(!incoming)return previous;
 if(previous.category!==incoming.category||previous.unit!==incoming.unit||previous.flat!==incoming.flat||previous.measurementType!==incoming.measurementType)return incoming;
 const sizes=[...previous.sizes];for(const size of incoming.sizes){const i=sizes.findIndex(s=>s.label===size.label);if(i<0)sizes.push(size);else sizes[i]={...size,measures:{...sizes[i].measures,...size.measures}};}
 return {...incoming,sizes};
}
