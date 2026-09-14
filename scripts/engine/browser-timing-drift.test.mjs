import test from 'node:test';
import assert from 'node:assert/strict';
import {compareBrowserTimingDrift,verifyBrowserTimingDrift} from './browser-timing-drift.js';

function fixture({failMeasure=false,badCounter=false}={}) {
 const calls=[];let enabled=false,relaxCount=0,relaxUs=0;
 const host={adapter:{request:async(type,data={})=>{
  calls.push([type,data]);
  if(data.action==='timingDrift'){
   if(typeof data.enabled==='boolean')enabled=data.enabled;
   return{enabled,relaxCount,relaxUs,relaxMaxUs:1000};
  }
  if(data.action==='frameInputStats')return{valid:true,startFrame:400,inputChanges:[20,20],observedActions:[[1,2,3],[1,2,3]],digests:[{frame:1200,input:123,state:456}],gaps:[]};
  return{};
 }}};
 const measure=async()=>{if(failMeasure)throw Error('image probe failed');if(!enabled||badCounter){relaxCount++;relaxUs+=1000;}return{passed:true,simulationFps:60,visibleFps:60};};
 return{host,calls,measure};
}
test('timing comparison uses matching checkpoints and image gates in both orders',async()=>{
 const f=fixture(),r=await compareBrowserTimingDrift(f.host,30,async()=>({}),{measure:f.measure});
 assert.equal(r.passed,true);assert.equal(r.inputConsistency.checked,8);
 assert.deepEqual(r.runs.map(r=>r.enabled),[false,false,true,true,true,true,false,false]);
 assert.deepEqual(r.runs.map(r=>r.timingDrift.relaxUs),[1000,1000,0,0,0,0,1000,1000]);
 assert.equal(f.calls.filter(([,d])=>d.action==='restore').length,8);
 assert.deepEqual(f.calls.slice(-5),[['browserRollback',{action:'pause'}],['browserRollback',{action:'frameInput',enabled:false}],['browserRollback',{action:'release',slot:5}],['browserRollback',{action:'timingDrift',enabled:false}],['start',{}]]);
});
test('failed image capture still restores pacing and releases checkpoint',async()=>{
 const f=fixture({failMeasure:true});await assert.rejects(compareBrowserTimingDrift(f.host,30,async()=>({}),{measure:f.measure}),/image probe failed/);
 assert.deepEqual(f.calls.slice(-3),[['browserRollback',{action:'release',slot:5}],['browserRollback',{action:'timingDrift',enabled:false}],['start',{}]]);
});
test('counter activity while correction is enabled cannot pass',async()=>{
 const f=fixture({badCounter:true});await assert.rejects(compareBrowserTimingDrift(f.host,30,async()=>({}),{measure:f.measure}),/counters are inconsistent/);
});
test('replay applies both host pacing modes without changing instruction flags',async()=>{
 const f=fixture();const result=await verifyBrowserTimingDrift(f.host,async()=>({}),{verify:async(send,inspect,options)=>{
  assert.equal(options.frames,600);
  const{timingdrift:a,...reference}=options.codegenReference,{timingdrift:b,...candidate}=options.codegenComparison;
  assert.equal(a,false);assert.equal(b,true);assert.deepEqual(reference,candidate);
  await send('codegen',options.codegenReference);await send('codegen',options.codegenComparison);
  return{passed:false,fullMachineBytesEqual:false};
 }});
 assert.equal(result.passed,false);assert.equal(result.kind,'normal-running-browser-timing-drift-equivalence');
 assert.equal(f.calls.filter(([,d])=>d.action==='codegen').length,0);
 assert.deepEqual(f.calls.slice(-3),[['browserRollback',{action:'pause'}],['browserRollback',{action:'timingDrift',enabled:false}],['start',{}]]);
});
