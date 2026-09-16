import test from 'node:test';
import assert from 'node:assert/strict';
import {nativePositionRoundoffBound} from '../../engines/browser-native/material-gpu.mjs';
test('float32 cancellation uses operand magnitude without accepting a changed transform',()=>{
  // Synthetic matrix with a small real-valued dot product. Sequential
  // float32 arithmetic loses the unit term, while the forward bound contains it.
  const m=[1,1,-1,0],p=[2**24,1,2**24];
  const rounded=Math.fround(Math.fround(Math.fround(m[0]*p[0])+Math.fround(m[1]*p[1]))+Math.fround(m[2]*p[2]));
  const exact=m[0]*p[0]+m[1]*p[1]+m[2]*p[2],bound=nativePositionRoundoffBound(m,0,p);
  assert.equal(exact,1);assert.equal(rounded,0);assert.ok(Math.abs(rounded-exact)<=bound);
  assert.ok(bound<15);assert.ok(Math.abs(100-exact)>bound);
  assert.equal(nativePositionRoundoffBound([0,0,0,0],0,[1,2,3]),0);
  assert.ok(nativePositionRoundoffBound([1,0,0,0],0,[1,0,0])<0.000001);
});
