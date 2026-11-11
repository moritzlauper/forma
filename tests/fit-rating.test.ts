import {test} from 'node:test';import assert from 'node:assert/strict';import {fitRating} from '../src/fit-rating';
test('Fit labels distinguish poor, mixed and good estimates without promising perfection',()=>{
 assert.equal(fitRating(79),'Good fit');assert.equal(fitRating(90),'Very good fit');assert.equal(fitRating(100),'Very good fit');assert.equal(fitRating(55),'Mixed fit');assert.equal(fitRating(20),'Poor fit');assert.equal(fitRating(null),'Not enough data');assert.equal(fitRating(95,false),'Not recommended');
});
