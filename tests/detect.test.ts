import {test} from 'node:test';
import assert from 'node:assert/strict';
import {detect,type Page} from '../src/detect';
import {isSizeChart} from '../src/chart-shape';
const page:Page={name:'Heavyweight Hoodie',url:'https://example.test/hoodie',text:'',charts:[{text:'Size;Chest;Sleeve;Length\nM;57;64;68\nL;60;65;71',context:'Garment measurements in cm, measured flat. Sleeve from shoulder seam.'}]};
test('Automatically extracts an explicit flat garment chart',()=>{const r=detect(page);assert.equal(r.product?.flat,true);assert.equal(r.product?.sizes[0].measures.chest,57);assert.equal(r.product?.sizes[0].measures.sleeve,64);});
test('Does not guess units or measurement type',()=>{assert.equal(detect({...page,charts:[{...page.charts[0],context:'Size guide'}]}).product,null);assert.equal(detect({...page,charts:[{...page.charts[0],context:'Size guide cm'}]}).product,null);});
test('Conflicting charts are not silently combined',()=>{assert.equal(detect({...page,charts:[...page.charts,{...page.charts[0],text:'Size;Chest\nM;40'}]}).product,null);});
test('Unknown sleeve protocol stays unknown',()=>{assert.equal(detect({...page,charts:[{...page.charts[0],context:'Garment measurements cm measured flat'}]}).product?.sizes[0].measures.sleeve,undefined);});
test('Body ranges are recognised',()=>{const r=detect({...page,charts:[{text:'Size;Chest (cm)\nM;90-96',context:'Body measurements cm'}]});assert.equal(r.product?.measurementType,'body');assert.deepEqual(r.product?.sizes[0].measures.chest,[90,96]);});
test('Transposed size tables are recognised',()=>{const r=detect({...page,charts:[{text:'Measurement;M;L\nChest;57;60',context:'Garment measurements cm measured flat'}]});assert.equal(r.product?.sizes[0].label,'M');assert.equal(r.product?.sizes[0].measures.chest,57);});
test('SCRT screenshot: empty heading and XS/S/M/L survive collection and parse',()=>{
 const text=';XS;S;M;L\nPIT TO PIT (CM);55.5;58;60.5;63\nBODY LENGTH HPS* (CM);61;64;66;68';
 assert.equal(isSizeChart(text),true);
 const product=detect({...page,name:'Android Dreams Hoodie - Black',charts:[{text,context:'Body length measured from the highest point of the shoulder (HPS) to hem. Width measured across the front of the chest, pit-to-pit.'}]}).product;
 assert.ok(product);assert.equal(product.unit,'cm');assert.equal(product.flat,true);
 assert.equal(product.sizes.find(s=>s.label==='M')?.measures.chest,60.5);
 assert.equal(product.sizes.find(s=>s.label==='M')?.measures.length,66);
 assert.equal(product.sizes[0].measures.sleeve,undefined);
});
test('XXL transposed headers work and unrelated tables are ignored',()=>{
 assert.equal(isSizeChart(';XL;XXL\nPIT TO PIT (CM);64;67'),true);
 assert.equal(isSizeChart(';XS;M\nShipping price;4;6'),false);
});
