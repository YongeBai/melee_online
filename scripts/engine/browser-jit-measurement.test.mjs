import test from 'node:test';
import assert from 'node:assert/strict';
import {parseJitCounters,measureWithJitCounters} from './browser-jit-measurement.js';
const details=(compile,link,unique,reuse)=>`jit:mixed unique-instances:${unique}/65536 reused-instances:${reuse} modcompile:${compile}us/max500us modinst:${link}us/max50us`;
test('bracket synchronous JIT work without altering measured FPS or acceptance',async()=>{
 const calls=[],values=[details(1000,200,12,20),details(2500,350,14,30)];
 const host={adapter:{request:async(action)=>{calls.push(action);return{cpuDetails:values.shift()};}}};
 const result=await measureWithJitCounters(host,async()=>{calls.push('measure');return{passed:false,simulationFps:58,visibleFps:57};});
 assert.deepEqual(calls,['rendererDiagnostics','measure','rendererDiagnostics']);
 assert.deepEqual(result.jitWork.delta,{moduleUs:1500,instanceUs:150,uniqueInstances:2,reusedInstances:10});
 assert.equal(result.jitWork.synchronousCompileAndLinkMs,1.65);
 assert.equal(result.passed,false);assert.equal(result.simulationFps,58);assert.equal(result.visibleFps,57);
});
test('missing or reset counters cannot produce a misleading zero-cost result',async()=>{
 assert.throws(()=>parseJitCounters('unavailable'),/Missing JIT/);
 const values=[details(1000,200,12,20),details(0,0,0,0)];
 await assert.rejects(measureWithJitCounters({adapter:{request:async()=>({cpuDetails:values.shift()})}},async()=>({passed:true})),/reset or wrapped/);
});
