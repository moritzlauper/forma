import {test} from 'node:test';
import assert from 'node:assert/strict';
import {recordScan,enrichGoodFits} from '../src/scan-library';
import type {Product} from '../src/fit';
const page={url:'https://shop.test/jeans?variant=1',name:'Jeans',text:'Straight cut',charts:[{text:'Size;Waist;Length\n34;46;112',context:'Flat garment measurements cm'}],images:['https://shop.test/photo.jpg']};
const product:Product={source:page.url,name:page.name,category:'trousers',measurementType:'garment',flat:true,unit:'cm',sizes:[{label:'34',available:true,measures:{waist:46,length:112}}]};
test('Evidence stores published values, normalised units and provenance without AI-derived measurements',()=>{
 const record=recordScan([],page,product,100)[0];
 assert.equal(record.measurements[0].raw,46);assert.deepEqual(record.measurements[0].cm,[92,92]);assert.equal(record.measurements[0].source,'shop-chart');assert.equal(record.measurements[0].subject,'garment');assert.equal(record.observedAt,100);
 assert.deepEqual(record.measurements[1].cm,[112,112]);assert.equal(record.images[0],page.images[0]);assert.deepEqual(record.charts,page.charts);
 const noMeasures=recordScan([],{...page,charts:[{text:'EU;UK;US\n45;11;12',context:'Size labels'}]},null)[0];assert.deepEqual(noMeasures.measurements,[]);
});
test('Identical scans do not rewrite evidence and a temporarily closed guide cannot erase it',()=>{
 const records=recordScan([],page,product);assert.equal(recordScan(records,page,product),records);assert.equal(recordScan(records,{...page,charts:[]},null),records);
});
test('Saving a good fit can reuse the scan without a network call, and retains its worn size and notes',()=>{
 const scans=recordScan([],page,product);const [entry]=enrichGoodFits([{url:'https://shop.test/jeans',name:'Jeans',category:'trousers',product:null,size:'34',reason:'Roomy legs',savedAt:1}],scans);
 assert.equal(entry.product?.sizes[0].measures.waist,46);assert.equal(entry.size,'34');assert.equal(entry.reason,'Roomy legs');assert.equal(entry.charts?.length,1);
});
test('A later body table enriches an existing bookmark without erasing its actual fit feedback',()=>{
 const original={url:page.url,name:page.name,category:'trousers' as const,product:null,charts:[{text:'EU;INT;UK\n50;L;40',context:''}],size:'L',reason:'Good length',savedAt:1};
 const body={...product,measurementType:'body' as const,flat:false,sizes:[{label:'L',available:true,measures:{waist:[84,88] as [number,number]}}]};
 const records=recordScan([],{...page,charts:[...original.charts,{text:'EU;INT;TAILLENUMFANG\n50;L;84\n50;L;88',context:'Körpermasse cm'}]},body,200);
 const [updated]=enrichGoodFits([original],records);assert.equal(updated.charts?.length,2);assert.equal(updated.product?.measurementType,'body');assert.equal(updated.evidenceObservedAt,200);assert.equal(updated.size,'L');assert.equal(updated.reason,'Good length');
});
