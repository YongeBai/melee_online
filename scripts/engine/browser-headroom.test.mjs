import test from 'node:test';
import assert from 'node:assert/strict';
import {measureBrowserHeadroom} from './browser-headroom.js';
function fixture(fail=false){
 const calls=[],start=300,frames=1200;
 const input={active:true,valid:true,completed:true,startFrame:start,lastFrame:start+frames,stoppedFrame:start+frames,inputChanges:[80,80],observedActions:[[1,2,3],[1,2,3]]};
 const host={adapter:{request:async(type,data={})=>{calls.push([type,data]);if(data.action==='frameInputStats'){if(fail)throw Error('lost worker');return input;}if(data.action==='frameInputTiming')return{valid:true,frames,startFrame:start,stopFrame:start+frames,elapsedMs:15000};return{};}}};
 const inspect=async()=>({major:2,minor:2,sceneFrame:start+frames,fighters:[0,1].map(port=>({port,controllerIndex:port,slotType:0}))});
 return{calls,host,inspect};
}
test('uncapped workload reports native throughput but cannot pass image acceptance',async()=>{
 const f=fixture();const result=await measureBrowserHeadroom(f.host,f.inspect,{sleep:async()=>{}});
 assert.equal(result.nativeWorkFps,80);assert.equal(result.passed,false);assert.equal(result.diagnosticOnly,true);
 assert.deepEqual(f.calls.slice(0,3),[['browserRollback',{action:'pause'}],['browserRollback',{action:'step'}],['browserRollback',{action:'frameInput',enabled:true}]]);
 const timingAt=f.calls.findIndex(([,d])=>d.action==='frameInputTiming');
 assert.deepEqual(f.calls[timingAt-1],['browserRollback',{action:'unthrottled',enabled:false}]);
 assert.deepEqual(f.calls.slice(-4),[['browserRollback',{action:'pause'}],['browserRollback',{action:'unthrottled',enabled:false}],['browserRollback',{action:'frameInput',enabled:false}],['start',{}]]);
});
test('worker failure still restores pacing, clears scripted input and resumes',async()=>{
 const f=fixture(true);await assert.rejects(measureBrowserHeadroom(f.host,f.inspect,{sleep:async()=>{}}),/lost worker/);
 assert.deepEqual(f.calls.slice(-4),[['browserRollback',{action:'pause'}],['browserRollback',{action:'unthrottled',enabled:false}],['browserRollback',{action:'frameInput',enabled:false}],['start',{}]]);
});
test('invalid workload is rejected before altering pacing',async()=>{
 const f=fixture();await assert.rejects(measureBrowserHeadroom(f.host,f.inspect,{frames:60}),/1200/);assert.equal(f.calls.length,0);
 await assert.rejects(measureBrowserHeadroom(f.host,async()=>({major:2,minor:2,fighters:[]})),/two human/);assert.equal(f.calls.length,0);
});
