import test from 'node:test';import assert from 'node:assert/strict';
import {compareBrowserRushPresentation,verifyBrowserRushPresentation} from './browser-rush-presentation.js';
function fixture({fail=false,badSkip=false}={}){
 let enabled=true,calls=0,skips=0;const commands=[];
 const host={adapter:{request:async(type,data={})=>{commands.push([type,data]);
  if(data.action==='rushPresentation'){if(data.enabled!==undefined)enabled=data.enabled;return{enabled,calls,skips};}
  if(data.action==='frameInputStats')return{valid:true,inputChanges:[30,30],observedActions:[[1,2,3],[1,2,3]],digests:[{frame:1200,input:10,state:20}],gaps:[]};
  return{};
 }}};
 return{host,commands,measure:async()=>{if(fail)throw Error('capture failed');calls+=100;skips+=enabled?20:badSkip?1:0;return{passed:true};}};
}
test('rush policy compares on/off/off/on with measured skip counters and exact cleanup',async()=>{
 const f=fixture(),r=await compareBrowserRushPresentation(f.host,45,async()=>({}),{measure:f.measure});
 assert.equal(r.passed,true);assert.deepEqual(r.runs.map(r=>r.enabled),[true,true,false,false,false,false,true,true]);
 assert.deepEqual(r.runs.map(r=>r.rushPresentation.skips),[20,20,0,0,0,0,20,20]);assert.equal(r.inputConsistency.checked,8);
 assert.deepEqual(f.commands.slice(-3),[['browserRollback',{action:'release',slot:5}],['browserRollback',{action:'rushPresentation',enabled:true}],['start',{}]]);
});
test('capture failure and invalid skip counters both restore the original host policy',async()=>{
 for(const opts of[{fail:true},{badSkip:true}]){const f=fixture(opts);await assert.rejects(compareBrowserRushPresentation(f.host,45,async()=>({}),{measure:f.measure}));assert.deepEqual(f.commands.slice(-2),[['browserRollback',{action:'rushPresentation',enabled:true}],['start',{}]]);}
});
test('replay toggles only host pacing and leaves raw correctness failures failed',async()=>{
 const f=fixture(),r=await verifyBrowserRushPresentation(f.host,async()=>({}),{verify:async(send,inspect,options)=>{
  assert.equal(options.frames,600);const{rushpresentation:a,...x}=options.codegenReference,{rushpresentation:b,...y}=options.codegenComparison;assert.equal(a,true);assert.equal(b,false);assert.deepEqual(x,y);
  await send('codegen',options.codegenReference);await send('codegen',options.codegenComparison);return{passed:false,fullMachineBytesEqual:false};
 }});assert.equal(r.passed,false);assert.equal(f.commands.filter(([,d])=>d.action==='codegen').length,0);
});
