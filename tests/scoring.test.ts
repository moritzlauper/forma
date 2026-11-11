import {test} from 'node:test';
import assert from 'node:assert/strict';
import {scoreSizes,fitWeights,type SizeRating} from '../src/scoring';
import type {Product} from '../src/fit';
const product:Product={name:'Box hoodie',category:'top',measurementType:'garment',unit:'cm',flat:true,source:'test',sizes:[{label:'A',available:true,measures:{chest:60,length:66}},{label:'B',available:true,measures:{chest:63,length:70}}]};
const ratings:SizeRating[]=[{size:'A',width:90,length:40,style:65,sleeves:100,reason:'Wide enough, but short.'},{size:'B',width:80,length:85,style:80,sleeves:null,reason:'More coverage with extra width.'}];
test('Weighted ranking considers length, not just the widest-fit score',()=>{
 const scores=scoreSizes(ratings,product,['A','B'],fitWeights(product,[]));assert.equal(scores[0].size,'B');assert.equal(scores[0].overall,82);assert.equal(scores[1].overall,40);
});
test('Missing sleeves cannot become a fabricated score or a zero-point penalty',()=>{
 const scores=scoreSizes(ratings,product,['A','B'],fitWeights(product,['sleeve']));assert.ok(scores.every(s=>s.sleeves===null));assert.equal(scores[0].overall,82);assert.equal(scores[0].assessed,3);assert.equal(scores[0].applicable,4);
});
test('Excluded sizes never win even if the AI gives them higher scores',()=>{
 const scores=scoreSizes(ratings,product,['A'],fitWeights(product,[]));assert.equal(scores[0].size,'A');assert.equal(scores[1].overall,null);
});
test('Unknown, duplicate, missing and out-of-range ratings are rejected',()=>{
 const weights=fitWeights(product,[]);
 for(const invalid of [[ratings[0]], [ratings[0],ratings[0]], [ratings[0],{...ratings[1],size:'Z'}],[ratings[0],{...ratings[1],width:101}]])assert.throws(()=>scoreSizes(invalid,product,['A','B'],weights));
});
test('Scores stay null when every applicable factor is unknown',()=>{
 const scores=scoreSizes(ratings.map(s=>({...s,width:null,length:null,style:null,sleeves:null})),product,['A','B'],fitWeights(product,[]));assert.ok(scores.every(s=>s.overall===null&&s.assessed===0));
});

test('Body reference leg lengths are not scored as garment coverage',()=>{
 const body:Product={name:'Shorts',category:'trousers',measurementType:'body',unit:'cm',flat:false,source:'https://shop.test',sizes:[{label:'L',available:true,measures:{waist:[84,88],inseam:[80,82]}}]};
 const scored=scoreSizes([{size:'L',width:70,length:95,style:70,sleeves:null,reason:'Body size reference.'}],body,['L'],{width:3,length:3,style:2,sleeves:0});
 assert.equal(scored[0].length,null);
});

test('A good length or style cannot average away a clearly poor chest fit',()=>{
 const scores=scoreSizes([{size:'A',width:25,length:100,style:100,sleeves:null,reason:'Too tight despite good length.'},{size:'B',width:100,length:25,style:100,sleeves:null,reason:'Too long despite room.'}],product,['A','B'],fitWeights(product,[]));
 assert.ok(scores.every(s=>s.overall===25));
});
