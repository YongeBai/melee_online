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
test('display-anchored clock preserves one step per rounded refresh at arbitrary startup phases',()=>{
  let rejectedPhases=0;
  for(let phase=0;phase<100;phase++){
    const quantized=i=>Math.floor((1000+phase/100+i*1000/60)*10)/10;
    let previous=quantized(0)+.07,debt=0;
    const arbitrary={take(now){debt+=now-previous;previous=now;const count=Math.max(0,Math.floor((debt+.1)/(1000/60)));debt-=count*1000/60;return count;}};
    const aligned=createNativeFrameClock(null);aligned.take(quantized(0));
    let zero=0,double=0;
    for(let i=1;i<=3600;i++){
      const steps=arbitrary.take(quantized(i));
      if(i>10){if(!steps)zero++;if(steps===2)double++;}
      assert.equal(aligned.take(quantized(i)),1);
    }
    if(zero&&double)rejectedPhases++;
    assert.ok(Math.abs(aligned.debtMs)<.1);
  }
  assert.ok(rejectedPhases>0,'arbitrary origins reproduce sustained zero/two-step callbacks');
});
test('display clock rejects stale startup timestamps before choosing its origin',()=>{
  const c=createNativeFrameClock(0,60,{align:true,toleranceMs:.25});
  // Actual Chrome startup sequence: first callback arrived now but carried a
  // timestamp 208 ms before live startup. It must not create catch-up debt.
  for(const t of [-208.062,-8.2,8.6])assert.equal(c.take(t),0);
  for(const t of [25.3,41.9,58.6,75.2,91.9])assert.equal(c.take(t),1);
  assert.ok(c.maxDebtMs<17);assert.ok(Math.abs(c.debtMs)<.25);
  c.reset();assert.equal(c.take(5000),0);assert.equal(c.take(5016.6),1);
});
test('display jitter tolerance stays bounded and repaid over long mixed-refresh runs',()=>{
  for(const refresh of [60,120,144]){
    const c=createNativeFrameClock(1000,60,{align:true,toleranceMs:.25});let frames=0;c.take(1000);
    for(let i=1;i<=refresh*60;i++){
      const now=1000+Math.floor(i*1000/refresh*10)/10+(i%2?.1:0);
      frames+=c.take(now);assert.ok(frames*1000/60<=now-1000+.250001);
    }
    assert.equal(frames,3600);assert.ok(Math.abs(c.debtMs)<1e-6);
  }
});

test('small display-frequency drift produces a single phase correction without zero/two oscillation',()=>{
  const c=createNativeFrameClock(0,60,{align:true,toleranceMs:.25});c.take(0);let zero=0,double=0,frames=0;
  for(let i=1;i<=3600;i++){
    const time=Math.floor((i*(1000/60-.0005)) * 10)/10;
    const n=c.take(time);frames+=n;if(!n)zero++;if(n>1)double++;
    assert.ok(frames*1000/60<=time+.250001);
  }
  assert.equal(zero,1);assert.equal(double,0);assert.equal(frames,3599);
  assert.ok(c.debtMs>14&&c.debtMs<1000/60);
});
