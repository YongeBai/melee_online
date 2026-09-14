import test from 'node:test';
import assert from 'node:assert/strict';
import {compareBrowserGpuStartDelay,verifyBrowserGpuStartDelay} from './browser-gpu-start-delay.js';
function fixture({failure=false,inactive=false}={}){
 const calls=[];let cycles=1000,starts=0,callbacks=0;
 const host={adapter:{request:async(type,data={})=>{calls.push([type,data]);
  if(data.action==='gpuStartDelay'){if(data.cycles!==undefined)cycles=data.cycles;return{cycles,starts,callbacks};}
  if(data.action==='frameInputStats')return{valid:true,startFrame:500,inputChanges:[30,30],observedActions:[[1,2,3],[1,2,3]],digests:[{frame:1200,input:10,state:20}],gaps:[]};
  return{};
 }}};
 const measure=async()=>{if(failure)throw Error('GPU probe failed');if(!inactive){starts+=1000000/cycles;callbacks+=1000000/cycles;}return{passed:true,simulationFps:60,seconds:30};};
 return{calls,host,measure};
}
test('matched GPU service comparison records actual callback reduction and restores baseline',async()=>{
 const f=fixture(),r=await compareBrowserGpuStartDelay(f.host,30,async()=>({}),{measure:f.measure});
 assert.equal(r.passed,true);assert.deepEqual(r.runs.map(r=>r.cycles),[1000,1000,4000,4000,4000,4000,1000,1000]);
 assert.deepEqual(r.runs.map(r=>r.gpuScheduling.callbacks),[1000,1000,250,250,250,250,1000,1000]);
 assert.equal(r.inputConsistency.checked,8);
 assert.deepEqual(f.calls.slice(-3),[['browserRollback',{action:'release',slot:5}],['browserRollback',{action:'gpuStartDelay',cycles:1000}],['start',{}]]);
});
test('measurement failure still clears input, releases checkpoint and restores GPU schedule',async()=>{
 const f=fixture({failure:true});await assert.rejects(compareBrowserGpuStartDelay(f.host,30,async()=>({}),{measure:f.measure}),/GPU probe failed/);
 assert.deepEqual(f.calls.slice(-4),[['browserRollback',{action:'frameInput',enabled:false}],['browserRollback',{action:'release',slot:5}],['browserRollback',{action:'gpuStartDelay',cycles:1000}],['start',{}]]);
});
test('unsupported candidate and inactive native counters cannot pass',async()=>{
 const f=fixture({inactive:true});await assert.rejects(compareBrowserGpuStartDelay(f.host,30,async()=>({}),{measure:f.measure,candidateCycles:32000}),/bounded candidate/);assert.equal(f.calls.length,0);
 await assert.rejects(compareBrowserGpuStartDelay(f.host,30,async()=>({}),{measure:f.measure}),/counters did not exercise/);
});
test('full-state replay changes only the service interval and preserves a failed equality gate',async()=>{
 const f=fixture();const r=await verifyBrowserGpuStartDelay(f.host,async()=>({}),{verify:async(send,inspect,opts)=>{
  assert.equal(opts.frames,600);const{gpustartdelay:a,...x}=opts.codegenReference,{gpustartdelay:b,...y}=opts.codegenComparison;
  assert.equal(a,1000);assert.equal(b,4000);assert.deepEqual(x,y);
  await send('codegen',opts.codegenReference);await send('codegen',opts.codegenComparison);return{passed:false,fullMachineBytesEqual:false};
 }});
 assert.equal(r.passed,false);assert.equal(f.calls.filter(([,d])=>d.action==='codegen').length,0);
 assert.deepEqual(f.calls.slice(-2),[['browserRollback',{action:'gpuStartDelay',cycles:1000}],['start',{}]]);
});
test('unchanged scheduling control and longer replay preserve the original raw verdict',async()=>{
 const f=fixture();const r=await verifyBrowserGpuStartDelay(f.host,async()=>({}),{candidateCycles:1000,frames:1800,verify:async(send,inspect,opts)=>{
  assert.equal(opts.frames,1800);assert.deepEqual(opts.codegenReference,opts.codegenComparison);
  await send('codegen',opts.codegenReference);await send('codegen',opts.codegenComparison);return{passed:false,fullMachineBytesEqual:false};
 }});
 assert.equal(r.passed,false);assert.equal(r.candidateCycles,1000);assert.equal(f.calls.filter(([,d])=>d.action==='codegen').length,0);
});
