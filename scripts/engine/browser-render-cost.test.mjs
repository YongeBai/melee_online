import test from 'node:test';
import assert from 'node:assert/strict';
import {measureBrowserRenderCost} from './browser-render-cost.js';
test('render ablation cannot pass image acceptance and always restores original draw dispatch',async()=>{
  for(const failure of['none','measurement','hook','cleanup']){
    const calls=[];let enabled=true,drift=false;
    const host={adapter:{request:async(type,data={})=>{
      calls.push([type,data]);
      if(type==='rendererDiagnostics')return{cpuDetails:'modcompile:0us/max modinst:0us/max unique-instances:0/65536 reused-instances:0'};
      if(data.action==='release'&&failure==='cleanup')throw Error('cleanup failed');
      if(data.action==='renderCostDiagnostic'){
        const changed=enabled!==data.enabled;enabled=data.enabled;
        return{writes:changed||drift?[[1,2]]:[]};
      }
      return{};
    }}};
    const measure=async(_h,_i,{frames})=>{
      assert.equal(frames,1200);
      if(failure==='measurement')throw Error('measurement failed');
      if(failure==='hook')drift=true;
      return{passed:true,nativeWorkFps:enabled?40:80,controllerStress:{valid:true,startFrame:400,digests:[{frame:1200,input:1,state:2}],gaps:[]}};
    };
    if(failure==='none'){
      const result=await measureBrowserRenderCost(host,()=>{}, {measure});
      assert.equal(result.passed,false);assert.equal(result.diagnosticOnly,true);assert.equal(result.inputConsistency.passed,true);
      assert.ok(result.runs.every(r=>!r.passed&&r.diagnosticOnly));
      assert.deepEqual(result.runs.filter(r=>!r.warmup).map(r=>r.renderDispatch),[true,false,false,true]);
    }else await assert.rejects(measureBrowserRenderCost(host,()=>{}, {measure}),new RegExp(failure));
    assert.equal(enabled,true);
    assert.deepEqual(calls.slice(-7).map(([t,d])=>d.action||t),['pause','unthrottled','frameInput','restore','renderCostDiagnostic','release','start']);
    assert.equal(calls.filter(([,d])=>d.action==='codegen').length,0);
  }
});
