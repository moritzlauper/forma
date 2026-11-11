import {test} from 'node:test';import assert from 'node:assert/strict';import {fitRating,overallFit} from '../src/fit-rating';
test('Eight fit bands distinguish nearby estimates without promising perfection',()=>{
 const bands:[number,string][]=[[100,'Excellent fit'],[90,'Excellent fit'],[89,'Very good fit'],[85,'Very good fit'],[84,'Good fit'],[80,'Good fit'],[79,'Mostly good fit'],[75,'Mostly good fit'],[74,'Fair fit'],[70,'Fair fit'],[69,'Mixed fit'],[60,'Mixed fit'],[59,'Poor fit'],[40,'Poor fit'],[39,'Very poor fit'],[0,'Very poor fit']];
 for(const [score,label]of bands)assert.equal(fitRating(score),label);
 assert.equal(fitRating(null),'Not enough data');assert.equal(fitRating(95,false),'Not recommended');
});

test('Overall item fit is independent of being the only size or winning a comparison',()=>{
 assert.deepEqual(overallFit({size:null,overallFit:{label:'Poor fit',reason:'Only available size is too short.'}}),{label:'Poor fit',reason:'Only available size is too short.'});
 assert.equal(overallFit({size:'L',basis:'tried'}).label,'Confirmed good fit');
 assert.equal(overallFit({size:'L'}).label,'Not enough data');
 assert.equal(overallFit({size:null,ranked:[{size:'L',overall:40,eligible:true,reason:'Too short.'}]}).label,'Not enough data');
});

test('Ten-point display preserves numeric estimates and never invents scores from labels',async()=>{
 const {fitScore,overallScore}=await import('../src/fit-rating');
 assert.equal(fitScore(79),'7.9/10');assert.equal(fitScore(0),'0.0/10');assert.equal(fitScore(null),'Not enough data');assert.equal(fitScore(90,false),'Not recommended');
 assert.equal(overallScore({size:'L',overallFit:{label:'Good fit',reason:'Test'}}),'Not enough data');
 assert.equal(overallScore({size:'L',overallFit:{label:'Good fit',reason:'Test',score:8.1}}),'8.1/10');
 assert.equal(overallScore({size:null,ranked:[{size:'L',eligible:true,overall:30,reason:'Too short'}]}),'Not enough data');
});

 test('Cut score stays independent from size scores and stock',async()=>{
 const {overallScore}=await import('../src/fit-rating');
 for(const score of [20,95])assert.equal(overallScore({size:'L',overallFit:{score:6.5,label:'Mixed fit',reason:'Cropped proportions'},ranked:[{size:'L',overall:score,eligible:true,reason:'Size fit'}]}),'6.5/10');
 assert.equal(overallScore({size:null,overallFit:{score:8,label:'Good fit',reason:'Suitable cut, wrong stock'},ranked:[{size:'S',overall:null,eligible:false,reason:'Too small'}]}),'8.0/10');
 });
