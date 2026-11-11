import {test} from 'node:test';
import assert from 'node:assert/strict';
import {inputForReview} from '../src/assessment';
import {recordScan} from '../src/scan-library';
import type {Profile,Product} from '../src/fit';

test('Another hoodie carries tried negative evidence and chart provenance without excluding its size label',()=>{
 const old={url:'https://shop.test/products/old',name:'Old hoodie',text:'Box fit, ribbed hem',charts:[]};
 const product:Product={name:old.name,source:old.url,category:'top',measurementType:'garment',unit:'cm',flat:true,sizes:[{label:'L',available:true,measures:{length:68,chest:63}}]};
 const scans=recordScan([],old,product);
 const current={...old,url:'https://shop.test/products/new',name:'New cropped hoodie'};
 const profile:Profile={mode:'body',name:'Test',category:'top',fit:'relaxed',context:{height:185,weight:83,waistLabel:'',style:'',concerns:[]},measures:{chest:{value:108,uncertainty:12,estimated:true}}};
 const feedback=[{...old,size:'L',value:'Too short',note:'Hem tight; returning it.'},{name:'Jeans',url:'https://shop.test/jeans',size:'34',value:'Too tight'}];
 const input=inputForReview(current,{...product,name:current.name,source:current.url},profile,feedback,'',[],scans);
 assert.equal(input.feedback.length,0);assert.ok(input.decision.eligibleSizes.includes('L'));
 assert.equal(input.profile.relatedFitExperience.length,1);
 const experience=input.profile.relatedFitExperience[0];assert.equal(experience.value,'Too short');assert.match(experience.note!,/returning/);
 const length=experience.measurements.find(m=>m.key==='length')!;
 assert.deepEqual(length.cm,[68,68]);assert.equal(length.subject,'garment');assert.equal(length.sourceURL,old.url);
});
