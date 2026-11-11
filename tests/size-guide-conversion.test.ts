import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {discoverCharts} from '../src/page-discovery';
import {sizeConversion} from '../src/chart-shape';
import {detect} from '../src/detect';
import {inputForReview,validateReview} from '../src/assessment';
import type {Profile} from '../src/fit';
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
