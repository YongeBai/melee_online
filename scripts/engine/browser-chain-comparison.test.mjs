import test from 'node:test';
import assert from 'node:assert/strict';
import {browserCodegenConfig,compareBrowserCodegen} from './browser-benchmark.js';

test('compiled-chain and call timing require coverage and restore original codegen after success or failure',async()=>{
 for(const feature of ['chainfusion','callfusion','constantaddr'])for(const failure of ['none','missing','wrong','measurement']){
  let config,enabled=false;const calls=[];
  const host={cachedInterpreterDisableMask:(1<<16)|(1<<18),fpuGuardHoist:true,adapter:{request:async(type,data)=>{
   calls.push([type,data]);
   if(data.action==='codegen'){config=data;enabled=data[feature];}
   if(type==='rendererDiagnostics')return{cpuDetails:feature+':'+Number(enabled&&failure!=='wrong')+(feature==='constantaddr'?' emit-ram/other:':feature==='chainfusion'?' emit-blocks/boundaries:':' emit-blocks:')+(enabled&&failure!=='missing'?10:0)+(feature==='constantaddr'?'/0':feature==='chainfusion'?'/30':'')};
   return {};
  }}};
  const options={feature,measure:async()=>{if(failure==='measurement')throw Error('capture failed');return{passed:true};}};
  if(failure==='none'){
   const r=await compareBrowserCodegen(host,45,()=>{},options);
   assert.equal(r.passed,true);assert.deepEqual(r.runs.map(r=>r.enabled),[false,false,true,true,true,true,false,false]);
   assert.ok(r.runs.every(r=>r.fpuguard&&r.blockmerge&&r.regcache&&!r.bswaprotate&&!r.branchfusion&&!r.readfusion));
  }else await assert.rejects(compareBrowserCodegen(host,45,()=>{},options),failure==='measurement'?/capture failed/:/coverage unavailable/);
  assert.deepEqual(config,{action:'codegen',...browserCodegenConfig(host)});
  assert.equal(calls.at(-1)[0],'start');assert.ok(calls.some(([,data])=>data.action==='release'));
 }
});
