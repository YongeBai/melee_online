import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyBrowserRollbackTimeline} from './browser-rollback-probe.js';
function fixture() {
  let state={frame:300,x:[0,0],digest:0},pads,frameTag,suppressed=false;
  const saves=new Map(),output={videoSkipped:0,audioSamplesSkipped:0};
  const inspect=async()=>({sceneFrame:state.frame,fighters:state.x.map((x,port)=>({port,controllerIndex:port,slotType:0,x}))});
  const command=async(action,p={})=>{
    if(action==='advance'){
      await command('pads',p);
      const timing=await command('step',p);
      return {...timing,game:await inspect()};
    }
    if(action==='clear'){saves.clear();return {};}
    if(action==='release'){saves.delete(p.slot);return {};}
    if(action==='capture'){saves.set(p.slot,structuredClone(state));return {};}
    if(action==='restore'){assert.ok(saves.has(p.slot));state=structuredClone(saves.get(p.slot));return {};}
    if(action==='suppress'){suppressed=p.value;return {};}
    if(action==='pads'){pads=p.pads;frameTag=p.frame;return {};}
    if(action==='step'){
      assert.equal(frameTag,state.frame);
      state.x=state.x.map((x,port)=>x+pads[port].stickX-128);
      state.digest=(Math.imul(state.digest,31)+state.x[0]*7+state.x[1]*13+pads[0].mask+pads[1].mask)>>>0;
      state.frame++;
      if(suppressed){output.videoSkipped++;output.audioSamplesSkipped+=800;}
      return {milliseconds:1};
    }
    if(action==='equal')return {equal:JSON.stringify(saves.get(p.a))===JSON.stringify(saves.get(p.b)),comparison:{}};
    if(action==='outputStats')return {output:{...output,suppressed}};
    throw Error(action);
  };
  return {command,inspect};
}
test('batched correction is compared against the unbatched reference including final replay',async()=>{
  const f=fixture(),r=await verifyBrowserRollbackTimeline(f.command,f.inspect,
    {frames:240,checkpointPolicy:'prediction',batchAdvance:true});
  assert.equal(r.passed,true);
  assert.equal(r.commandTimings['reference:step'].count,240);
  assert.equal(r.commandTimings['reference:advance'],undefined);
  assert.equal(r.commandTimings['delayed:step'],undefined);
  assert.ok(r.commandTimings['delayed:advance'].count>=240);
  assert.ok(r.commandTimings['final correction:advance'].count>0);
});
test('real-engine probe preserves independent snapshots across checkpoint ring wraps',async()=>{
  const f=fixture(),r=await verifyBrowserRollbackTimeline(f.command,f.inspect);
  assert.equal(r.passed,true);assert.equal(r.fullMachineBytesEqual,true);
  assert.equal(r.referenceFrame,340);assert.equal(r.correctedFrame,340);
  assert.ok(r.stats.rollbacks>5);assert.ok(r.output.videoSkipped>0);
  assert.equal(r.networkTest,false);assert.equal(r.performanceTest,false);
});
test('probe refuses CPU slots instead of labeling AI as second-player input',async()=>{
  const f=fixture();await assert.rejects(verifyBrowserRollbackTimeline(f.command,async()=>({fighters:[{slotType:1}]})),/two human/);
});
test('probe identifies the failing reference frame without claiming a rollback failure',async()=>{
  const f=fixture();let steps=0;
  await assert.rejects(verifyBrowserRollbackTimeline(async(action,data)=>{
    if(action==='step'&&steps++===32)throw Error('core failed');
    return f.command(action,data);
  },f.inspect),/reference frame 32: step: core failed/);
});
test('prediction probe performs no fast captures for the fully known reference',async()=>{
  const f=fixture(),r=await verifyBrowserRollbackTimeline(f.command,f.inspect,{frames:240,checkpointPolicy:'prediction'});
  assert.equal(r.passed,true);assert.equal(r.referenceFrame,540);
  assert.equal(r.commandTimings['reference:capture'],undefined);
  assert.ok(r.commandTimings['delayed:capture'].count>0);
  assert.equal(r.checkpointPolicy,'prediction');
});
test('cache fast-path trial compares the original helper against the optimized correction',async()=>{
  const f=fixture(),calls=[];let optimized=true;
  const r=await verifyBrowserRollbackTimeline(async(action,data)=>{
    if(action==='cacheFastPath'){optimized=data.value;calls.push(optimized);return {enabled:optimized};}
    if(action==='step')calls.push(optimized?'optimized-step':'reference-step');
    return f.command(action,data);
  },f.inspect,{cacheFastPathComparison:true});
  assert.equal(r.passed,true);assert.equal(r.cacheFastPathComparison,true);
  assert.equal(calls[0],false);assert.equal(calls.filter(x=>x==='reference-step').length,40);
  assert.ok(calls.indexOf(true)>calls.lastIndexOf('reference-step'));
  assert.ok(calls.includes('optimized-step'));
});

test('dispatch comparison switches only between the complete reference and corrected replay',async()=>{
  const f=fixture(),calls=[];let optimized=true;
  const r=await verifyBrowserRollbackTimeline(async(action,data)=>{
    if(action==='inlineDispatch'){optimized=data.value;calls.push(optimized);return {enabled:optimized};}
    if(action==='step')calls.push(optimized?'optimized-step':'reference-step');
    return f.command(action,data);
  },f.inspect,{inlineDispatchComparison:true});
  assert.equal(r.passed,true);assert.equal(r.inlineDispatchComparison,true);
  assert.equal(calls[0],false);assert.equal(calls.filter(x=>x==='reference-step').length,40);
  assert.ok(calls.indexOf(true)>calls.lastIndexOf('reference-step'));
  assert.ok(calls.includes('optimized-step'));
});

test('codegen differential uses baseline compilation and then the requested candidate flags',async()=>{
  const f=fixture(),calls=[];let optimized=true;
  const r=await verifyBrowserRollbackTimeline(async(action,data)=>{
    if(action==='codegen'){optimized=data.regcache||data.fastmem;calls.push({...data});return data;}
    if(action==='step')calls.push(optimized?'optimized-step':'reference-step');
    return f.command(action,data);
  },f.inspect,{codegenComparison:{regcache:true,fastmem:false}});
  assert.equal(r.passed,true);assert.deepEqual(calls[0],{regcache:false,fastmem:false});
  assert.equal(calls.filter(x=>x==='reference-step').length,40);
  assert.deepEqual(calls[41],{regcache:true,fastmem:false});
  assert.ok(calls.includes('optimized-step'));
});

test('WASM loop comparison switches only between the complete reference and corrected replay',async()=>{
  const f=fixture(),calls=[];let optimized=true;
  const r=await verifyBrowserRollbackTimeline(async(action,data)=>{
    if(action==='wasmDispatch'){optimized=data.value;calls.push(optimized);return {enabled:optimized};}
    if(action==='step')calls.push(optimized?'optimized-step':'reference-step');
    return f.command(action,data);
  },f.inspect,{wasmDispatchComparison:true});
  assert.equal(r.passed,true);assert.equal(r.wasmDispatchComparison,true);
  assert.equal(calls[0],false);assert.equal(calls.filter(x=>x==='reference-step').length,40);
  assert.ok(calls.indexOf(true)>calls.lastIndexOf('reference-step'));
  assert.ok(calls.includes('optimized-step'));
});
