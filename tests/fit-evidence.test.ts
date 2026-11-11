import {test} from 'node:test';
import assert from 'node:assert/strict';
import {knownMeasures,sizeEvidence} from '../src/fit-evidence';
import {inputForReview,validateReview} from '../src/assessment';
import type {Profile,Product} from '../src/fit';
const profile:Profile={name:'Test',mode:'body',category:'top',fit:'relaxed',context:{height:182,weight:81,waistLabel:'',style:'',concerns:['Sleeves often too short','T-shirts often too long']},measures:{chest:{value:102,uncertainty:12,estimated:true},length:{value:67,uncertainty:7,estimated:true},sleeve:{value:62,uncertainty:6,estimated:true}}};
const product:Product={name:'Box hoodie',category:'top',measurementType:'garment',unit:'cm',flat:true,source:'https://example.test/hoodie',sizes:[{label:'M',available:true,measures:{chest:60.5,length:66}},{label:'L',available:true,measures:{chest:63,length:68}}]};
const page={url:product.source,name:product.name,text:'Box fit hoodie with a ribbed hem',charts:[]};
const checks={width:'Compare the listed garment widths for the preferred loose cut.',length:'The larger option adds length; a ribbed hem can sit higher.',sleeves:'Sleeve fit is unknown without sleeve measurements.'};
const ratings=(best:string)=>product.sizes.map(s=>({size:s.label,width:s.label===best?85:60,length:s.label===best?85:60,style:80,sleeves:null,reason:'Relative fit and coverage.'}));
test('Stature and chart allow a tentative choice without sending automatic body dimensions',()=>{
 assert.deepEqual(knownMeasures(profile),{});
 const evidence=sizeEvidence(product,profile,'',[]);assert.equal(evidence.canSelectSize,true);assert.deepEqual(evidence.eligibleSizes,['M','L']);assert.equal(evidence.basis,'estimate');assert.ok(evidence.unknowns.some(b=>/Sleeve/.test(b)));
});
test('A chest-only recommendation without length and sleeve checks is rejected',()=>{
 const input=inputForReview(page,product,profile,[]);
 assert.throws(()=>validateReview({size:'M',summary:'M is best against an estimated chest of 102 cm.',reasons:['Length is secondary.'],limitations:[]},product,input),/did not evaluate/);
});
test('Missing sleeve measurements lower certainty rather than vetoing every size',()=>{
 const measured={...profile,measures:{chest:{value:106,uncertainty:1}}};
 const evidence=sizeEvidence(product,measured,'',[]);assert.equal(evidence.canSelectSize,true);assert.equal(evidence.basis,'estimate');assert.ok(evidence.unknowns.length);
});
test('The rule is not a size blacklist: known comparable reference measurements can support M',()=>{
 const reference:Profile={name:'Favourite hoodie',mode:'reference',category:'top',fit:'relaxed',measures:{chest:{value:121,uncertainty:1},length:{value:66,uncertainty:1}}};
 const input=inputForReview(page,product,reference,[]);
 assert.equal(input.decision.canSelectSize,true);
 assert.equal(validateReview({size:'M',summary:'M matches the reference.',checks,ratings:ratings('M'),reasons:[],limitations:['Sleeves not compared']},product,input).size,'M');
});
test('A successfully tried size can anchor a comparison without measuring the body',()=>{
 assert.equal(sizeEvidence(product,profile,'',[{size:'L',value:'Fits'}]).canSelectSize,true);
 assert.ok(sizeEvidence(product,profile,'',[{size:'L',value:'Fits'}]).eligibleSizes.includes('L'));
});
test('A negative fit report never proves that a larger size fits',()=>{
 const decision=sizeEvidence(product,profile,'',[{size:'M',value:'Too short'}]);assert.equal(decision.basis,'estimate');assert.deepEqual(decision.eligibleSizes,['L']);
});
test('Trouser length concerns are not replaced by waist fit',()=>{
 const trousers:Product={...product,name:'Trousers',category:'trousers',sizes:[{label:'32',available:true,measures:{waist:41}}]};
 const p:Profile={...profile,category:'trousers',measures:{waist:{value:80,uncertainty:1}},context:{...profile.context!,concerns:['Avoid short trousers']}};
 assert.deepEqual(sizeEvidence(trousers,p,'',[]).priorities,['inseam']);assert.equal(sizeEvidence(trousers,p,'',[]).basis,'estimate');
});
test('Saved free text preserves a hoodie-length concern beyond parsed profile tags',()=>{
 const p:Profile={...profile,context:{...profile.context!,concerns:[]},measures:{chest:{value:106,uncertainty:1}}};
 const input=inputForReview(page,product,p,[],'Hoodies often feel too short.');
 assert.deepEqual(input.decision.priorities,['length']);assert.equal(input.decision.canSelectSize,true);assert.ok(input.decision.unknowns.length);
});
test('Tried-size feedback is matched independently of capitalisation',()=>{
 const input=inputForReview(page,product,profile,[{name:page.name,size:' l ',value:'Too tight'}]);
 assert.throws(()=>validateReview({size:'M',summary:'M fits',reasons:[],limitations:[]},product,input),/no larger/);
 assert.ok(sizeEvidence(product,profile,'',[{size:' l ',value:'Fits'}]).eligibleSizes.includes('L'));
});
test('Tentative selection carries uncertainty through the returned review',()=>{
 const input=inputForReview(page,product,profile,[]);
 const review=validateReview({size:'L',summary:'I would try L for more length.',checks,ratings:ratings('L'),reasons:[],limitations:[]},product,input);
 assert.equal(review.size,'L');assert.equal(review.basis,'estimate');assert.match(review.reasons[1],/^Length:/);assert.ok(review.limitations.some(x=>/Sleeve/.test(x)));assert.ok(review.limitations.some(x=>/not a confirmed fit/.test(x)));
});
test('Without chart or any personal context there is still no useful size choice',()=>{
 assert.equal(sizeEvidence(null,profile,'',[]).canSelectSize,false);
 assert.equal(sizeEvidence(product,{...profile,context:undefined,measures:{}},'',[]).canSelectSize,false);
});
test('The displayed recommendation follows the calculated scores without stale prose',()=>{
 const input=inputForReview(page,product,profile,[]);
 const review=validateReview({size:'M',summary:'M is the best choice.',checks,ratings:ratings('L'),reasons:['Choose M'],limitations:['M-specific limitation']},product,input);
 assert.equal(review.size,'L');assert.match(review.summary,/L has the highest/);assert.doesNotMatch(JSON.stringify(review.reasons),/Choose M/);assert.doesNotMatch(JSON.stringify(review.limitations),/M-specific/);
});
