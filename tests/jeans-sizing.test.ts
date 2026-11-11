import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {discoverCharts} from '../src/page-discovery';
import {detect} from '../src/detect';
import {detectClothingPage} from '../src/product-page';
import {normalise} from '../src/fit';
import {scoreSizes,fitWeights} from '../src/scoring';
// Published numeric chart at scrt.onl/collections/trousers/products/director-jeans-grey,
// checked 2026-11-11. DOM wrapper is a synthetic closed/lazy-tab fixture.
const rows=[['','26','28','30','32','34','36'],['WAIST ACROSS FRONT (CM)','36','38.5','41','43.5','46','48.5'],['LENGTH (CM)','104','106','108','110','112','114'],['THIGH (CM)','28','29','30','31','32','33'],['LEG OPENING (CM)','23.5','24','24.5','25','25.5','26']];
const table='<table>'+rows.map(row=>'<tr>'+row.map(cell=>'<td>'+cell+'</td>').join('')+'</tr>').join('')+'</table>';
function documentFor(lazy=false){
 const {document}=parseHTML('<html><body><main><h1>Director Paint-Splattered Jeans</h1><button role="tab" aria-controls="sizing">Sizing</button><div id="sizing" role="tabpanel" hidden>'+(lazy?'':table)+'</div><p>CHF 226.00</p><button>Add to cart</button></main></body></html>');
 Object.defineProperty(document,'URL',{value:'https://scrt.onl/collections/trousers/products/director-jeans-grey'});return document as unknown as Document;
}
test('Jeans chart in closed Sizing tab is read and across-front waist is interpreted as flat garment width',async()=>{
 const doc=documentFor();let clicks=0;doc.querySelector('button')!.addEventListener('click',()=>clicks++);
 const detection=detectClothingPage(doc);assert.equal(detection.kind,'clothing');assert.equal(detection.category,'trousers');
 const charts=await discoverCharts(doc,new Set());assert.equal(clicks,0);assert.equal(charts.length,1);
 const product=detect({url:doc.URL,name:detection.name,detection,text:'',charts}).product;assert.ok(product);
 assert.equal(product.flat,true);assert.equal(product.measurementType,'garment');assert.equal(product.unit,'cm');
 const size=product.sizes.find(s=>s.label==='34')!;assert.equal(size.measures.waist,46);assert.deepEqual(normalise(size.measures.waist!,'cm',true,'waist'),[92,92]);
 assert.equal(size.measures.length,112);assert.equal(size.measures.inseam,undefined);assert.equal(product.sizes.some(s=>s.label==='38'),false);
 const ratings=product.sizes.map(s=>({size:s.label,width:70,length:60,style:70,sleeves:null,reason:'Relative garment coverage; inseam unknown.'}));
 const scores=scoreSizes(ratings,product,product.sizes.map(s=>s.label),fitWeights(product,['inseam']));assert.ok(scores.every(s=>s.length===60&&s.sleeves===null));
});
test('Sizing is clicked automatically when the jeans table loads on demand',async()=>{
 const doc=documentFor(true);let clicks=0;
 doc.querySelector('button')!.addEventListener('click',()=>{clicks++;doc.getElementById('sizing')!.innerHTML=table;});
 const charts=await discoverCharts(doc,new Set(),async()=>{});
 assert.equal(clicks,1);assert.equal(charts.length,1);assert.ok(detect({url:doc.URL,name:'Director Jeans',text:'',charts}).product);
});
