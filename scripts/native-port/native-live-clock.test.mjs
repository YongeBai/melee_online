import test from 'node:test';
import assert from 'node:assert/strict';
import {createNativeFrameClock} from '../../engines/browser-native/native-live.mjs';
test('one second produces exactly 60 native steps at 60, 120 and 144 Hz',()=>{
  for(const refresh of [60,120,144]){const c=createNativeFrameClock(0);let frames=0;for(let i=1;i<=refresh;i++)frames+=c.take(i*1000/refresh);assert.equal(frames,60);assert.ok(c.debtMs<1e-6);}
});
test('slow callbacks retain all simulation debt and cap work per callback',()=>{
  const c=createNativeFrameClock(0);assert.equal(c.take(1000),4);let frames=4;
  for(let i=0;i<14;i++)frames+=c.take(1000);assert.equal(frames,60);assert.ok(c.debtMs<1e-6);assert.equal(c.maxDebtMs,1000);
});
test('stale first rAF and hidden-tab resume cannot manufacture frames',()=>{
  const c=createNativeFrameClock(500);assert.equal(c.take(100),0);assert.equal(c.take(510),0);assert.equal(c.take(520),1);
  c.reset();assert.equal(c.take(100000),0);assert.equal(c.take(100000+1000/60),1);
});
test('bounded probe ends on the exact native frame without extra simulation',()=>{
  const c=createNativeFrameClock(0);assert.equal(c.take(1000,2),2);assert.equal(c.take(1000,0),0);assert.ok(c.debtMs>960);
});
test('quantized 60 Hz timestamps produce one step per callback without clock drift',()=>{
  const c=createNativeFrameClock(0);let frames=0;
  for(let i=1;i<=36000;i++){const steps=c.take(Math.floor(i*1000/60*10)/10);assert.equal(steps,1);frames+=steps;assert.ok(c.debtMs>=-.100001);}
  assert.equal(frames,36000);assert.ok(Math.abs(c.debtMs)<1e-6);
});
test('timestamp tolerance is repaid instead of compounding or reusing the same timestamp',()=>{
  const c=createNativeFrameClock(0);assert.equal(c.take(16.6),1);assert.ok(c.debtMs<0);
  assert.equal(c.take(16.6),0);assert.equal(c.take(33.2),0);assert.equal(c.take(33.3),1);
  let frames=2;for(let i=3;i<=3600;i++)frames+=c.take(i*16.6);
  assert.equal(frames,3585);assert.ok(c.debtMs<1000/60);
});
