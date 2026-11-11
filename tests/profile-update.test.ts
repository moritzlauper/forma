import test from 'node:test';
import assert from 'node:assert/strict';
import {profileFeedbackUpdate} from '../src/profile-update';

test('personal feedback import replaces the same item and size across collection URLs and retains other evidence',()=>{
 const old={name:'Hoodie',url:'https://shop.example/collections/tops/products/hoodie',size:'L',value:'Fits',note:''};
 const other={...old,size:'XL'};
 const update={...old,url:'https://shop.example/products/hoodie',value:'Too short; Sleeves too short; Hem too tight',note:'Tried and returning it.'};
 const result=profileFeedbackUpdate({feedback:[update]},[old,other]);
 assert.deepEqual(result,[update,other]);
 assert.deepEqual(profileFeedbackUpdate({feedback:[update]},result),result);
 assert.deepEqual(old.value,'Fits');
});

test('invalid feedback imports fail without changing saved evidence',()=>{
 const previous=[{name:'Jeans',url:'https://shop.example/products/jeans',size:'33 x 32',value:'Fits',note:''}];
 assert.throws(()=>profileFeedbackUpdate({feedback:[{size:33}]},previous),/Invalid feedback/);
 assert.equal(previous[0].size,'33 x 32');
 assert.equal(profileFeedbackUpdate({},previous),previous);
});
