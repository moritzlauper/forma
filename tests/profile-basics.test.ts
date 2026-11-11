import {test} from 'node:test';import assert from 'node:assert/strict';import {migrateProfile,consolidateFitNotes} from '../src/profile-migration';import type {Profile} from '../src/fit';
test('Profile style migration is repeatable and repairs the previous repeated-e corruption',()=>{for(const style of ['Urban / Alternativ','Urban / Alternative','Urban / Alternativeeeeeeeee']){const original:Profile={mode:'body',category:'top',name:'My fit',fit:'relaxed',measures:{},context:{height:185,weight:83,waistLabel:'W33',style,concerns:['Ärmel oft zu kurz']}};let next=migrateProfile(original);for(let i=0;i<10;i++)next=migrateProfile(next);assert.equal(next.context?.style,'Urban / Alternative');assert.deepEqual(next.context?.concerns,['Sleeves often too short']);assert.equal(original.context?.style,style);}});

import {applyProfileUpdate} from '../src/profile-update';
import {inputForReview} from '../src/assessment';
test('Personal build updates preserve measurements and preferences and reach AI without invented cm',()=>{
 const original:Profile={mode:'body',category:'jacket',name:'My fit',fit:'relaxed',measures:{chest:{value:108,uncertainty:12,estimated:true}},context:{height:185,weight:83,waistLabel:'W33 / W34',shoeSizeEU:'45',style:'Alternative',concerns:['Sleeves often too short']}};
 const next=applyProfileUpdate(original,{kind:'forma-profile-update',bodyShape:'Broad shoulders and broad chest relative to height.'});
 assert.deepEqual(next.measures,original.measures);assert.equal(next.context?.shoeSizeEU,'45');assert.deepEqual(next.context?.concerns,original.context?.concerns);assert.equal(original.context?.bodyShape,undefined);
 const input=inputForReview({url:'https://shop.test/jacket',name:'Jacket',text:'',charts:[]},null,next,[]);
 assert.equal(input.profile.context?.bodyShape,next.context?.bodyShape);assert.equal(input.profile.measures.chest,undefined);assert.equal(input.profile.estimates.chest?.value,108);
 assert.deepEqual(applyProfileUpdate(next,{kind:'forma-profile-update',bodyShape:next.context?.bodyShape}),next);
 assert.throws(()=>applyProfileUpdate(original,{kind:'forma-profile-update',bodyShape:45}));
});

test('Duplicate preference fields consolidate once into editable notes without losing legacy concerns',()=>{
 const profile:Profile={mode:'body',category:'top',name:'Test',fit:'relaxed',measures:{},context:{height:185,weight:83,waistLabel:'',style:'',concerns:['Sleeves often too short','Prefer wider T-shirts']}};
 const merged=consolidateFitNotes(profile,'Prefer wider T-shirts. Keep coverage.');
 assert.equal(merged.description,'Prefer wider T-shirts. Keep coverage.\n\nSleeves often too short');assert.deepEqual(merged.profile.context?.concerns,[]);assert.deepEqual(consolidateFitNotes(merged.profile,merged.description),merged);
});
