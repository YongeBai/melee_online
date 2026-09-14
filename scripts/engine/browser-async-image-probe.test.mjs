import test from'node:test';import assert from'node:assert/strict';import{AsyncCanvasImageProbe,ImageHarvestTask}from'./browser-async-image-probe.js';
test('reusing a verifier rejects outstanding samples instead of dropping them',()=>{
 const p=Object.assign(Object.create(AsyncCanvasImageProbe.prototype),{gl:{isContextLost:()=>false},pending:[],capacity:8,free:Array(8),captureCount:120,maxPending:3});
 p.reset();assert.equal(p.captureCount,0);assert.equal(p.maxPending,0);
 p.pending=[{}];assert.throws(()=>p.reset(),/outstanding samples/);p.pending=[];p.free.pop();assert.throws(()=>p.reset(),/outstanding samples/);
 p.free.push({});p.gl.isContextLost=()=>true;assert.throws(()=>p.reset(),/context lost/);
});

test('task harvesting is bounded, preserves sample order, and leaves undrained GPU work intact',()=>{
 const timers=new Map(),samples=[],pending=[{at:1,hash:10},{at:2,hash:20}];let next=0,polls=0;
 const task=new ImageHarvestTask({poll:()=>{polls++;return pending.splice(0,1);}},ready=>samples.push(...ready),assert.fail,
  {schedule:fn=>{timers.set(++next,fn);return next;},cancel:id=>timers.delete(id)});
 task.request();task.request();assert.equal(timers.size,1);assert.equal(polls,0);
 const first=timers.get(1);timers.delete(1);first();assert.deepEqual(samples,[{at:1,hash:10}]);
 task.request();const cancelled=timers.get(2);task.stop();assert.equal(timers.size,0);
 cancelled();task.request();assert.equal(polls,1);assert.equal(timers.size,0);
 assert.deepEqual(pending,[{at:2,hash:20}]);
});

test('task readback failures propagate once and stop future work',()=>{
 let run;const errors=[],failure=Error('GPU read failed');
 const task=new ImageHarvestTask({poll:()=>{throw failure;}},assert.fail,e=>errors.push(e),{schedule:fn=>{run=fn;return 1;},cancel:()=>{}});
 task.request();run();task.request();run();assert.deepEqual(errors,[failure]);assert.equal(task.closed,true);
});
