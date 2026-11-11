import {test} from 'node:test';import assert from 'node:assert/strict';import {constrainPopup} from '../src/popup-position';
test('Dragged popup stays reachable on every viewport edge, including oversized cards',()=>{
 assert.deepEqual(constrainPopup(-50,900,300,400,800,600),{x:8,y:192});assert.deepEqual(constrainPopup(999,-20,300,400,800,600),{x:492,y:8});assert.deepEqual(constrainPopup(400,400,500,800,320,600),{x:8,y:8});
});
