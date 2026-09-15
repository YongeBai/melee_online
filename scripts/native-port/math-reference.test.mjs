import test from 'node:test';
import assert from 'node:assert/strict';
import {referenceFma} from '../../engines/browser-native/math-reference.mjs';
test('exact FMA oracle preserves cancellation and avoids intermediate overflow',()=> {
  assert.equal(referenceFma(1+2**-23,1-2**-23,-1),-(2**-46));
  assert.equal(referenceFma(2**127,2,-(2**127)),2**127);
});
test('exact FMA oracle implements ties-to-even and signed zero',()=> {
  assert.equal(referenceFma(1,1,2**-24),1);
  assert.equal(referenceFma(1,1+2**-23,2**-24),1+2**-22);
  assert.ok(Object.is(referenceFma(-0,1,-0),-0));
  assert.ok(Object.is(referenceFma(-0,1,0),0));
  assert.equal(referenceFma(2**-126,0.5,0),2**-127);
  assert.throws(()=>referenceFma(Infinity,1,0),/finite/);
});
