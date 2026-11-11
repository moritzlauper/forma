import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {discoverCharts} from '../src/page-discovery';
import {sizeConversion} from '../src/chart-shape';
import {detect} from '../src/detect';
import {inputForReview,validateReview} from '../src/assessment';
import type {Profile} from '../src/fit';
import {understand} from '../src/profile-text';
import {measurementTable} from '../src/chart-shape';
const rows=[['EU','INT','FR','IT','UK','JEANS'],['40','XXS','40','40','30','26'],['50','L','50','50','40','34']];
const conversion=rows.map(row=>row.join(';')).join('\n');
function doc(html:string){const {document}=parseHTML('<html><body>'+html+'</body></html>');Object.defineProperty(document,'URL',{value:'https://shop.test/shorts'});return document as unknown as Document;}
test('German guide opens a lazy conversion dialog outside main, including plain CSS rows',async()=>{
 for(const plain of [false,true]){
  const document=doc('<main><h1>Denim Shorts</h1><button type="button" aria-haspopup="dialog">Grössenberater öffnen</button></main>');
  let clicks=0;
  document.querySelector('button')!.addEventListener('click',()=>{
   clicks++;const dialog=document.createElement('div');dialog.setAttribute('role','dialog');
   const [table,row,cell]=plain?['div','div','span']:['table','tr','td'];
   dialog.innerHTML='<h2>Grössentabelle</h2><'+table+'>'+rows.map(r=>'<'+row+'>'+r.map(c=>'<'+cell+'>'+c+'</'+cell+'>').join('')+'</'+row+'>').join('')+'</'+table+'>';document.body.append(dialog);
  });
  const attempted=new Set<HTMLElement>();const charts=await discoverCharts(document,attempted,async()=>{});
  assert.equal(clicks,1);assert.equal(charts.length,1);assert.deepEqual(sizeConversion(charts[0].text)?.columns,rows[0]);
  const found=detect({url:document.URL,name:'Denim Shorts',text:'garment measurements cm',charts});assert.equal(found.product,null);assert.match(found.reason,/conversion/);
  await discoverCharts(document,attempted,async()=>{});assert.equal(clicks,1);
 }
});
test('Discovery continues past an attempted accordion to a newly revealed guide',async()=>{
 const document=doc('<main><button type="button">Grösse & Passform</button><div id="next"></div></main>');
 document.querySelector('button')!.addEventListener('click',()=>{
  document.getElementById('next')!.innerHTML='<button type="button">Größentabelle anzeigen</button>';
  document.getElementById('next')!.querySelector('button')!.addEventListener('click',()=>{document.body.insertAdjacentHTML('beforeend','<div role="dialog"><table>'+rows.map(r=>'<tr>'+r.map(c=>'<td>'+c+'</td>').join('')+'</tr>').join('')+'</table></div>');});
 });
 assert.equal((await discoverCharts(document,new Set(),async()=>{})).length,1);
});
const profile:Profile={mode:'body',name:'Test',category:'top',fit:'relaxed',measures:{}};
const page={url:'https://shop.test/shorts',name:'Denim Shorts',text:'Relaxed, knee length',charts:[{text:conversion,context:'Size conversions'}]};
test('Same-product L fits is preserved without fabricating cm or scores; unrelated L is not transferred',()=>{
 const feedback=[{url:page.url,name:page.name,size:'L',value:'Fits'}];
 const input=inputForReview(page,null,profile,feedback);assert.equal(input.profile.category,'trousers');assert.deepEqual(input.decision.fittedSizes,['L']);assert.equal(input.product.conversions.length,1);
 const review=validateReview({size:null,summary:'Cannot choose without measurements',reasons:[],limitations:[]},null,input);
 assert.equal(review.size,'L');assert.equal(review.basis,'tried');assert.deepEqual(review.ranked,[]);assert.match(review.summary,/recorded L/);assert.match(review.limitations[0],/converts size labels/);
 assert.equal(inputForReview({...page,url:'https://shop.test/other'},null,profile,feedback).decision.canSelectSize,false);
 assert.equal(inputForReview(page,null,profile,[...feedback,{...feedback[0],value:'Too tight'}]).decision.canSelectSize,false);
});
test('Shoe conversion guides with fractional sizes and extra length columns are read',()=>{
 const text='EU;FR;IT;UK;US;Foot length (cm)\n45;45;45;11;12;29\n46.5;46.5;46.5;12;13;30';
 const parsed=detect({...page,name:'Unisex Sneakers',charts:[{text,context:'Size guide'}]});
 assert.equal(parsed.product?.sizes[0].label,'45');assert.equal(parsed.product?.sizes[0].measures.foot,29);
 assert.equal(parsed.product?.measurementType,'body');
 const noUnit=text.replace('Foot length (cm)','Foot length');assert.equal(detect({...page,name:'Sneakers',charts:[{text:noUnit,context:''}]}).product,null);assert.equal(sizeConversion(noUnit)?.rows.length,2);
});
test('Usual EU shoe size matches the read conversion guide without inventing foot length',()=>{
 const shoePage={...page,name:'Unisex Sneakers',charts:[{text:'EU;FR;IT;UK;US\n44;44;44;10;11\n45;45;45;11;12',context:''}]};
 const p={...profile,context:{height:185,weight:83,waistLabel:'',style:'',concerns:[],shoeSizeEU:'45'}};
 const input=inputForReview(shoePage,null,p,[]);const raw={size:null,summary:'No table was read',reasons:[],limitations:[]};
 const result=validateReview(raw,null,input);assert.equal(result.size,'45');assert.equal(result.basis,'estimate');assert.match(result.reasons[0],/UK 11/);assert.doesNotMatch(JSON.stringify(result),/Sleeves|No table was read/);
 const missing=validateReview(raw,null,inputForReview(shoePage,null,profile,[]));assert.match(missing.summary,/Size guide read/);assert.match(missing.summary,/usual EU shoe size/);
 assert.equal(understand('meine schuhgrösse ist 45').shoeSizeEU,'45');assert.equal(understand('shoe size EU 46.5').shoeSizeEU,'46.5');
});
test('A server-rendered guide is retried after hydration when the first click did nothing',async()=>{
 const document=doc('<main><button type="button">Grössenberater öffnen</button></main>');let clicks=0,waits=0;
 document.querySelector('button')!.addEventListener('click',()=>{clicks++;if(clicks===2)document.body.insertAdjacentHTML('beforeend','<div role="dialog"><table>'+rows.map(r=>'<tr>'+r.map(c=>'<td>'+c+'</td>').join('')+'</tr>').join('')+'</table></div>');});
 assert.equal((await discoverCharts(document,new Set(),async()=>{waits++;})).length,1);assert.equal(clicks,2);assert.ok(waits>=9);
});
test('The lower body-measurement table is collected alongside conversions and repeated INT labels become ranges',async()=>{
 const body='EU;INT;TAILLENUMFANG;HÜFTUMFANG;BEINLÄNGE AN DER INNENSEITE\n40;XXS;58.5;82.5;79.75\n40;XXS;61;84;80\n42;XS;63.5;85.5;80.25\n42;XS;66;87;80.5';
 const table=(text:string)=>'<table>'+text.split('\n').map(r=>'<tr>'+r.split(';').map(c=>'<td>'+c+'</td>').join('')+'</tr>').join('')+'</table>';
 const document=doc('<main><h1>Denim Shorts</h1></main><div role="dialog">'+table(conversion)+'<h2>Körpermasse (cm)</h2>'+table(body)+'</div>');
 const charts=await discoverCharts(document,new Set(),async()=>{});assert.equal(charts.length,2);
 const found=detect({...page,charts});assert.equal(found.product?.measurementType,'body');assert.equal(found.product?.flat,false);
 assert.deepEqual(found.product?.sizes[0].measures.waist,[58.5,61]);assert.deepEqual(found.product?.sizes[0].measures.hip,[82.5,84]);assert.equal(found.product?.sizes[0].label,'XXS');
 // Missing units are retained as unresolved evidence, not silently dropped or
 // misreported as a label-only conversion guide.
 const unknown={text:body,context:'Körpermasse'};assert.equal(measurementTable(unknown)?.unit,null);
 const input=inputForReview({...page,charts:[page.charts[0],unknown]},null,profile,[]);
 assert.equal(input.product.measurementTables[0]?.unit,null);assert.equal(input.decision.canSelectSize,false);assert.match(input.decision.blockers.join(' '),/height and weight/);
});
