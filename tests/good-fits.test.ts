import {test} from 'node:test';
import assert from 'node:assert/strict';
import {saveGoodFit,goodFitExamples,type GoodFit} from '../src/good-fits';
import {inputForReview} from '../src/assessment';
import type {Product,Profile} from '../src/fit';
const product:Product={name:'Cotton Hoodie',category:'top',measurementType:'garment',unit:'cm',flat:true,source:'https://shop.test/favourite',sizes:[{label:'L',available:true,measures:{chest:63,length:74}}]};
const favourite:GoodFit={url:'https://shop.test/favourite',name:product.name,category:'top',product,description:'Loose hoodie with straight hem.',size:'',reason:'Great sleeve length.',savedAt:1};
const profile:Profile={name:'Test',mode:'body',category:'top',fit:'relaxed',measures:{}};
test('One-click saves deduplicate product variants and retain optional notes',()=>{
 const result=saveGoodFit([favourite],{...favourite,url:favourite.url+'?variant=42',reason:'Good length.',size:'L'});
 assert.equal(result.length,1);assert.equal(result[0].size,'L');assert.equal(result[0].reason,'Good length.');
});
test('An unsized bookmark teaches preferences but supplies no body or garment measurement anchor',()=>{
 const example=goodFitExamples([favourite],product,profile)[0];assert.equal(example.measurements,null);assert.equal(example.reason,'Great sleeve length.');
 const input=inputForReview({url:'https://shop.test/new',name:product.name,text:'',charts:[]},product,profile,[],'',[favourite]);
 assert.equal(input.decision.canSelectSize,false);assert.deepEqual(input.profile.measures,{});
});
test('A confirmed good fit becomes a reusable cross-product comparison with its original units and convention',()=>{
 const input=inputForReview({url:'https://other.test/new-hoodie',name:product.name,text:'',charts:[]},product,profile,[],'',[{...favourite,size:'L'}]);
 assert.equal(input.decision.canSelectSize,true);assert.equal(input.profile.goodFits[0].measurements?.flat,true);assert.equal(input.profile.goodFits[0].measurements?.values.chest,63);assert.equal(input.feedback.length,0);
});
test('Only the current product gets a tried-size report; unrelated clothing categories are excluded',()=>{
 const input=inputForReview({url:favourite.url+'?variant=9',name:product.name,text:'',charts:[]},product,profile,[],'',[{...favourite,size:'L'}]);
 assert.equal(input.feedback[0].value,'Fits');assert.deepEqual(input.decision.fittedSizes,['L']);
 assert.equal(goodFitExamples([{...favourite,category:'trousers'}],product,profile).length,0);
});
test('Invalid or missing worn sizes cannot create comparable chart measurements',()=>{
 assert.equal(goodFitExamples([{...favourite,size:'XXL'}],product,profile)[0].measurements,null);
 assert.equal(goodFitExamples([{...favourite,size:'L',product:null}],product,profile)[0].measurements,null);
});
