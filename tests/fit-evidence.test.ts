import {test} from 'node:test';
import assert from 'node:assert/strict';
import {knownMeasures,sizeEvidence} from '../src/fit-evidence';
import {inputForReview,validateReview} from '../src/assessment';
import type {Profile,Product} from '../src/fit';
const profile:Profile={name:'Test',mode:'body',category:'top',fit:'relaxed',context:{height:182,weight:81,waistLabel:'',style:'',concerns:['Sleeves often too short','T-shirts often too long']},measures:{chest:{value:102,uncertainty:12,estimated:true},length:{value:67,uncertainty:7,estimated:true},sleeve:{value:62,uncertainty:6,estimated:true}}};
const product:Product={name:'Box hoodie',category:'top',measurementType:'garment',unit:'cm',flat:true,source:'https://example.test/hoodie',sizes:[{label:'M',available:true,measures:{chest:60.5,length:66}},{label:'L',available:true,measures:{chest:63,length:68}}]};
const page={url:product.source,name:product.name,text:'Box fit hoodie with a ribbed hem',charts:[]};
test('A broad automatic body prior cannot authorize any personal size choice',()=>{
 assert.deepEqual(knownMeasures(profile),{});
 const evidence=sizeEvidence(product,profile,'',[]);assert.equal(evidence.canSelectSize,false);assert.deepEqual(evidence.eligibleSizes,[]);assert.ok(evidence.blockers.some(b=>/Sleeve/.test(b)));
});
test('Screenshot regression: a chest-only M claim is withheld even if the AI proposes it',()=>{
 const input=inputForReview(page,product,profile,[]);
 const checked=validateReview({size:'M',summary:'M is best against an estimated chest of 102 cm.',reasons:['Length is secondary.'],limitations:[]},product,input);
 assert.equal(checked.size,null);assert.doesNotMatch(JSON.stringify(checked),/M is best|102 cm|Length is secondary/);
});
test('Reliable chest alone cannot bypass a stated sleeve priority',()=>{
 const measured={...profile,measures:{chest:{value:106,uncertainty:1}}};
 assert.equal(sizeEvidence(product,measured,'',[]).canSelectSize,false);
});
test('The rule is not a size blacklist: known comparable reference measurements can support M',()=>{
 const reference:Profile={name:'Favourite hoodie',mode:'reference',category:'top',fit:'relaxed',measures:{chest:{value:121,uncertainty:1},length:{value:66,uncertainty:1}}};
 const input=inputForReview(page,product,reference,[]);
 assert.equal(input.decision.canSelectSize,true);
 assert.equal(validateReview({size:'M',summary:'M matches the reference.',reasons:[],limitations:['Sleeves not compared']},product,input).size,'M');
});
test('A successfully tried size can anchor a comparison without measuring the body',()=>{
 assert.equal(sizeEvidence(product,profile,'',[{size:'L',value:'Fits'}]).canSelectSize,true);
 assert.deepEqual(sizeEvidence(product,profile,'',[{size:'L',value:'Fits'}]).eligibleSizes,['L']);
});
test('A negative fit report never proves that a larger size fits',()=>{
 assert.equal(sizeEvidence(product,profile,'',[{size:'M',value:'Too short'}]).canSelectSize,false);
});
test('Trouser length concerns are not replaced by waist fit',()=>{
 const trousers:Product={...product,name:'Trousers',category:'trousers',sizes:[{label:'32',available:true,measures:{waist:41}}]};
 const p:Profile={...profile,category:'trousers',measures:{waist:{value:80,uncertainty:1}},context:{...profile.context!,concerns:['Avoid short trousers']}};
 assert.deepEqual(sizeEvidence(trousers,p,'',[]).priorities,['inseam']);assert.equal(sizeEvidence(trousers,p,'',[]).canSelectSize,false);
});
test('Saved free text preserves a hoodie-length concern beyond parsed profile tags',()=>{
 const p:Profile={...profile,context:{...profile.context!,concerns:[]},measures:{chest:{value:106,uncertainty:1}}};
 const input=inputForReview(page,product,p,[],'Hoodies often feel too short.');
 assert.deepEqual(input.decision.priorities,['length']);assert.equal(input.decision.canSelectSize,false);
});
test('Tried-size feedback is matched independently of capitalisation',()=>{
 const input=inputForReview(page,product,profile,[{name:page.name,size:' l ',value:'Too tight'}]);
 assert.throws(()=>validateReview({size:'M',summary:'M fits',reasons:[],limitations:[]},product,input),/no larger/);
 assert.deepEqual(sizeEvidence(product,profile,'',[{size:' l ',value:'Fits'}]).eligibleSizes,['L']);
});
