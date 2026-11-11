import {test} from 'node:test';import assert from 'node:assert/strict';
import {sizeBaseline} from '../src/size-baseline';
test('Only listed W29 is rejected against usual W33/34',()=>{const b=sizeBaseline('trousers',['29 x 32'],'33/34',[]);assert.equal(b.rejected[0].size,'29 x 32');assert.deepEqual(b.preferred,[]);});
test('Confirmed W/L good fit outranks generic waist range without hardcoding a size',()=>{for(const waist of [30,33,36]){const size=`${waist} x 32`;const b=sizeBaseline('trousers',[size,`${waist+1} x 32`],`${waist}/${waist+1}`,[{name:'Known trousers',size}]);assert.deepEqual(b.preferred,[size]);assert.equal(b.rejected.length,1);}});
test('Plain numeric EU sizes are not interpreted as jeans waist inches',()=>{assert.deepEqual(sizeBaseline('trousers',['44','46'],'33/34',[]).rejected,[]);});
