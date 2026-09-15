import { test } from "node:test";
import assert from "node:assert/strict";
import { summarizeBrowserRun, summarizeCoreProfile, browserDeliveryCounter } from "./browser-benchmark.js";

test("delivery diagnostics use the active transport, never stale bitmap counts", () => {
  assert.equal(browserDeliveryCounter({oglSabEnabled:true, oglSabFramesDrawn:60,
    adapter:{detachedOglFramesDrawn:10}}), 60);
  assert.equal(browserDeliveryCounter({oglSabEnabled:true, adapter:{detachedOglFramesDrawn:10}}), 0);
  assert.equal(browserDeliveryCounter({oglSabEnabled:false, oglSabFramesDrawn:60,
    adapter:{detachedOglFramesDrawn:10}}), 10);
});
const before = { major: 2, minor: 2, sceneFrame: 100, renderFrame: 100 };
const after = { ...before, sceneFrame: 1900, renderFrame: 1900 };
const samples = () => Array.from({ length: 1801 }, (_, i) => ({
  at: i * 1000 / 60, hash: i, nonblack: true, sourceWidth: 960, sourceHeight: 720,
}));
test("accepts 30 seconds of changing 720p60 gameplay", () => {
  assert.equal(summarizeBrowserRun(samples(), before, after).passed, true);
});
test("rejects 60 simulation ticks with black, repeated, low-resolution, or slow frames", () => {
  for (const alter of [
    s => ({ ...s, nonblack: false, hash: 1 }),
    s => ({ ...s, hash: 1 }),
    s => ({ ...s, sourceWidth: 320, sourceHeight: 240 }),
    (s, i) => ({ ...s, hash: Math.floor(i / 2) }),
  ]) assert.equal(summarizeBrowserRun(samples().map(alter), before, after).passed, false);
});
test("rejects measurements outside a match and short runs", () => {
  assert.equal(summarizeBrowserRun(samples(), before, { ...after, minor: 0 }).passed, false);
  assert.equal(summarizeBrowserRun(samples().slice(0, 61), before, { ...after, sceneFrame: 160 }).passed, false);
});
test("rejects fast-forward simulation even if presentation is 60 FPS", () => {
  assert.equal(summarizeBrowserRun(samples(), before, { ...after, sceneFrame: 3700 }).passed, false);
});
test("rejects a game rendering at 30 FPS even if the canvas changes at 60 FPS", () => {
  assert.equal(summarizeBrowserRun(samples(), before, { ...after, renderFrame: 1000 }).passed, false);
});
test("core profiling uses interval deltas rather than boot-time totals", () => {
  const a = { enabled: true, stages: { glPresent: { count: 100, totalUs: 900000 } } };
  const b = { enabled: true, stages: { glPresent: { count: 160, totalUs: 930000 } } };
  assert.deepEqual(summarizeCoreProfile(a, b, 1).stages.glPresent,
    { count: 60, totalMs: 30, meanUs: 500, fractionOfWallTime: .03 });
  assert.equal(summarizeCoreProfile({ enabled: false }, b, 1), null);
  assert.throws(() => summarizeCoreProfile(b, a, 1), /reset/);
});

test('checkpoint repeats exclude warmup and require every measured run to pass',async()=>{
 const {measureBrowserRepeated}=await import('./browser-benchmark.js');
 const calls=[];let iteration=0;
 const host={adapter:{request:async(type,data)=>{calls.push([type,data]);return {};}}};
 const result=await measureBrowserRepeated(host,30,()=>{}, {runs:2,
  measure:async()=>({seconds:30,passed:iteration++ !== 2})});
 assert.equal(result.passed,false);
 assert.equal(result.warmup.warmup,true);
 assert.equal(result.runs.length,2);
 assert.equal(calls.filter(([t,d])=>d.action==='restore').length,3);
 assert.equal(calls.filter(([t,d])=>d.action==='step').length,361);
 assert.deepEqual(calls.at(-2),['browserRollback',{action:'release',slot:5}]);
 assert.deepEqual(calls.at(-1),['start',{}]);
});
test('failed repeated benchmark releases its snapshot and resumes gameplay',async()=>{
 const {measureBrowserRepeated}=await import('./browser-benchmark.js');
 const calls=[];
 const host={adapter:{request:async(type,data)=>{calls.push([type,data]);return {};}}};
 await assert.rejects(measureBrowserRepeated(host,30,()=>{}, {runs:2,
  measure:async()=>{throw Error('lost frame source');}}),/lost frame source/);
 assert.deepEqual(calls.at(-2),['browserRollback',{action:'release',slot:5}]);
 assert.deepEqual(calls.at(-1),['start',{}]);
});

test('FIFO A/B/B/A uses one state and restores original codegen settings',async()=>{
 const {compareBrowserCodegen}=await import('./browser-benchmark.js');
 const calls=[];const host={cachedInterpreterDisableMask:(1<<16)|(1<<23),adapter:{request:async(type,data)=>{calls.push([type,data]);return {};}}};
 const result=await compareBrowserCodegen(host,30,()=>{}, {measure:async()=>({seconds:30,passed:true})});
 assert.deepEqual(result.runs.map(r=>[r.integerfifo,r.warmup]),[[false,true],[false,false],[true,true],[true,false],[true,true],[true,false],[false,true],[false,false]]);
 assert.equal(calls.filter(([t,d])=>d.action==='capture').length,1);
 assert.equal(calls.filter(([t,d])=>d.action==='restore').length,8);
 assert.deepEqual(calls.at(-2),['browserRollback',{action:'codegen',gxmatrixfast:false,displaylistfast:false,animstatefast:false,animcallbackfast:false,animfusion:false,hotfusion:false,matrixfast:false,constantaddr:false,callfusion:false,chainfusion:false,bswaprotate:false,qstatefull:false,qstatecache:false,cpformat:false,leandispatch:false,counterbatch:false,fusionredispatch:false,readfusion:false,stepcheck:false,fpuguardwide:false,branchfusion:false,fpuguard:false,blockmerge:true,regcache:true,fastmem:true,integerfifo:true,singleprefix:false,fprcache:false,compactgpr:false,pssimd:false,psmemsimd:false,vectorfpr:false,psqhoist:false,widemap:false,stateconst:false,msrcache:false,fifocopy:false,fifobatch:false,frsqrtefast:false}]);
 assert.deepEqual(calls.at(-1),['start',{}]);
});

test('Q0 cache comparison verifies compiled coverage and restores flags after rejection',async()=>{
 const {compareBrowserCodegen,browserCodegenConfig}=await import('./browser-benchmark.js');
 for(const feature of ['qstatecache','qstatefull']){
 let config,bad=false;const calls=[];
 const host={cachedInterpreterDisableMask:(1<<16)|(1<<18),fpuGuardHoist:true,adapter:{request:async(t,d)=>{
  if(d.action==='codegen'){config=d;calls.push(d);}
  return t==='rendererDiagnostics'?{cpuDetails:`${feature}:${Number(config[feature])} emit-blocks/sites:12/${bad?0:90}`} : {};
 }}};
 const options={feature,measure:async()=>({passed:true})};
 const r=await compareBrowserCodegen(host,30,()=>{},options);
 assert.deepEqual(r.runs.map(r=>r[feature]),[false,false,true,true,true,true,false,false]);
 assert.ok(r.runs.every(r=>r.integerfifo&&r.singleprefix&&r.fpuguard&&!r.psqhoist&&!r.counterbatch));
 bad=true;await assert.rejects(compareBrowserCodegen(host,30,()=>{},options),/coverage/);
 assert.deepEqual(calls.at(-1),{action:'codegen',...browserCodegenConfig(host)});
 }
});

test('single-prefix A/B preserves the independent FIFO optimization',async()=>{
 const {compareBrowserCodegen}=await import('./browser-benchmark.js');
 const calls=[];const host={cachedInterpreterDisableMask:1<<16,adapter:{request:async(type,data)=>{if(data.action==='codegen')calls.push(data);return {};}}};
 const result=await compareBrowserCodegen(host,30,()=>{}, {feature:'singleprefix',measure:async()=>({seconds:30,passed:true})});
 assert.deepEqual(calls.map(c=>c.singleprefix),[false,true,true,false,false]);
 assert.ok(calls.every(c=>c.integerfifo===true&&c.regcache===true));
 assert.equal(result.feature,'singleprefix');
 assert.equal(result.passed,true);
});

test('FPR A/B toggles only its cache and restores the previous flags',async()=>{
 const {compareBrowserCodegen}=await import('./browser-benchmark.js');
 const calls=[];const host={cachedInterpreterDisableMask:(1<<16)|(1<<18)|(1<<19),adapter:{request:async(t,d)=>{if(d.action==='codegen')calls.push(d);return {};}}};
 await compareBrowserCodegen(host,30,()=>{},{feature:'fprcache',measure:async()=>({seconds:30,passed:true})});
 assert.deepEqual(calls.map(c=>c.fprcache),[false,true,true,false,true]);
 assert.ok(calls.every(c=>c.integerfifo&&c.singleprefix&&c.regcache));
});

test('render-scale A/B keeps a fixed checkpoint and verifies real internal dimensions',async()=>{
 const {compareBrowserRenderScale}=await import('./browser-benchmark.js');
 let percent=200;const calls=[];
 const host={adapter:{request:async(type,data)=>{calls.push([type,data]);if(type==='rendererDiagnostics')return{coreProfile:{efbWidth:640*percent/100,efbHeight:528*percent/100}};if(data.action==='renderScale'){if(data.percent)percent=data.percent;return{percent};}return{};}}};
 const result=await compareBrowserRenderScale(host,30,()=>{},{measure:async()=>({seconds:30,passed:true})});
 assert.equal(result.passed,true);assert.equal(percent,200);
 assert.deepEqual(result.runs.map(x=>x.percent),[200,200,150,150,150,150,200,200]);
 assert.ok(result.runs.filter(x=>x.percent===150).every(x=>x.internalResolution[0]===960&&x.internalResolution[1]===792));
 assert.equal(calls.filter(([,d])=>d.action==='capture').length,1);
 assert.ok(!calls.some(([,d])=>d.action==='codegen'));
});

test('probe comparison never treats delivery counters as acceptance and releases on failure',async()=>{
 const {compareBrowserProbe}=await import('./browser-benchmark.js');const calls=[];const host={adapter:{request:async(t,d)=>{calls.push([t,d]);return{};}}};
 const result=await compareBrowserProbe(host,30,()=>{},{measureImage:async()=>({passed:true}),measureDelivery:async()=>({passed:true})});
 assert.equal(result.passed,false);assert.equal(result.diagnosticOnly,true);assert.deepEqual(result.runs.filter(r=>!r.warmup).map(r=>r.probe),['image','delivery','delivery','image']);assert.equal(calls.filter(([,d])=>d.action==='capture').length,1);assert.equal(calls.filter(([,d])=>d.action==='restore').length,8);
 await assert.rejects(compareBrowserProbe(host,30,()=>{},{measureImage:async()=>{throw Error('probe failed');}}),/probe failed/);assert.equal(calls.at(-2)[1].action,'release');assert.equal(calls.at(-1)[0],'start');
});

test('pacing comparison restores immediate presentation on failure and keeps the strict gate',async()=>{
 const {compareBrowserPacing}=await import('./browser-benchmark.js');const calls=[];const host={adapter:{presentationQueue:null,bitmapPresentationPacing:'immediate',request:async(t,d)=>{calls.push([t,d]);return{};}}};
 class Queue {constructor(){this.stats={presented:0,ageTotalMs:0};this.capacity=2;}close(){calls.push(['close',{}]);}}
 let n=0;const r=await compareBrowserPacing(host,30,()=>{},{QueueClass:Queue,measure:async()=>({passed:++n!==6})});assert.equal(r.passed,false);assert.equal(host.adapter.presentationQueue,null);assert.equal(host.adapter.bitmapPresentationPacing,'immediate');assert.deepEqual(r.runs.filter(x=>!x.warmup).map(x=>x.paced),[false,true,true,false]);
 await assert.rejects(compareBrowserPacing(host,30,()=>{},{QueueClass:Queue,measure:async()=>{throw Error('capture failed');}}),/capture failed/);assert.equal(host.adapter.presentationQueue,null);assert.equal(calls.at(-2)[1].action,'release');assert.equal(calls.at(-1)[0],'start');
});

test('Fountain comparison holds one checkpoint and restores reflection even after failure',async()=>{
 const {compareFountainReflection}=await import('./browser-benchmark.js');const calls=[];
 const host={adapter:{request:async(t,d)=>{calls.push([t,d]);return t==='meleeControl'?{objects:[{}]}:{};}}};
 const result=await compareFountainReflection(host,30,async()=>({match:{stage:2}}),{measure:async()=>({passed:true})});
 assert.deepEqual(result.runs.map(r=>[r.reflection,r.warmup]),[[true,true],[true,false],[false,true],[false,false],[false,true],[false,false],[true,true],[true,false]]);
 assert.equal(calls.filter(([,d])=>d.action==='capture').length,1);
 assert.equal(calls.at(-3)[1].enabled,true);assert.equal(calls.at(-2)[1].action,'release');assert.equal(calls.at(-1)[0],'start');
 await assert.rejects(compareFountainReflection(host,30,async()=>({match:{stage:2}}),{measure:async()=>{throw Error('scene changed');}}),/scene changed/);
 assert.equal(calls.at(-3)[1].enabled,true);assert.equal(calls.at(-1)[0],'start');
 await assert.rejects(compareFountainReflection(host,30,async()=>({match:{stage:31}})),/requires Fountain/);
});

test('fighter model comparison accepts Dream Land and restores native detail',async()=>{
 const {compareFountainReflection}=await import('./browser-benchmark.js');const settings=[];
 const host={adapter:{request:async(t,d)=>{
   if(t==='meleeControl'){settings.push(d);return{objects:[{}]};}
   return{};
 }}};
 const result=await compareFountainReflection(host,30,async()=>({match:{stage:28}}),
   {feature:'modeldetail',measure:async()=>({passed:true})});
 assert.equal(result.kind,'same-checkpoint-dream land-modeldetail-abba');
 assert.deepEqual(result.runs.filter(r=>!r.warmup).map(r=>r.modeldetail),[true,false,false,true]);
 assert.equal(settings.at(-1).enabled,true);
});

test('GPR comparison toggles only GPR caching and restores the original configuration',async()=>{
 const {compareBrowserCodegen}=await import('./browser-benchmark.js');const changes=[];const host={cachedInterpreterDisableMask:(1<<16)|(1<<18),adapter:{request:async(t,d)=>{if(d.action==='codegen')changes.push(d);return {};}}};
 const result=await compareBrowserCodegen(host,30,()=>{},{feature:'regcache',measure:async()=>({passed:true})});
 assert.deepEqual(changes.map(c=>c.regcache),[false,true,true,false,true]);assert.ok(changes.every(c=>c.integerfifo&&c.singleprefix&&!c.fprcache&&!c.fastmem));assert.deepEqual(result.runs.filter(r=>!r.warmup).map(r=>r.regcache),[false,true,true,false]);
});

test('compact integer locals compare independently and restore all flags',async()=>{
 const {compareBrowserCodegen,browserCodegenConfig}=await import('./browser-benchmark.js');const calls=[];
 const host={cachedInterpreterDisableMask:(1<<16)|(1<<18),compactGprLocals:false,adapter:{request:async(t,d)=>{if(d.action==='codegen')calls.push(d);return {};}}};
 const result=await compareBrowserCodegen(host,30,()=>{},{feature:'compactgpr',measure:async()=>({passed:true})});
 assert.deepEqual(calls.map(c=>c.compactgpr),[false,true,true,false,false]);assert.ok(calls.every(c=>c.regcache&&c.integerfifo&&c.singleprefix&&!c.fprcache&&!c.fastmem));
 assert.deepEqual(result.runs.filter(r=>!r.warmup).map(r=>r.compactgpr),[false,true,true,false]);
 assert.equal(browserCodegenConfig(host).regcache,true);host.cachedInterpreterDisableMask|=1<<20;assert.equal(browserCodegenConfig(host).regcache,false);
});

test('paired SIMD compares independently and restores startup flags',async()=>{
 const {compareBrowserCodegen,browserCodegenConfig}=await import('./browser-benchmark.js');const calls=[];
 const host={cachedInterpreterDisableMask:(1<<16)|(1<<18),adapter:{request:async(t,d)=>{if(d.action==='codegen')calls.push(d);return {};}}};
 const result=await compareBrowserCodegen(host,30,()=>{},{feature:'pssimd',measure:async()=>({passed:true})});
 assert.deepEqual(calls.map(c=>c.pssimd),[false,true,true,false,false]);
 assert.ok(calls.every(c=>c.regcache&&c.integerfifo&&c.singleprefix&&!c.fprcache&&!c.compactgpr));
 assert.deepEqual(result.runs.filter(r=>!r.warmup).map(r=>r.pssimd),[false,true,true,false]);
 assert.equal(browserCodegenConfig(host).pssimd,false);
});

test('paired memory SIMD compares independently of arithmetic SIMD',async()=>{
 const {compareBrowserCodegen}=await import('./browser-benchmark.js');const calls=[];
 const host={cachedInterpreterDisableMask:(1<<16)|(1<<18),adapter:{request:async(t,d)=>{if(d.action==='codegen')calls.push(d);return {};}}};
 const result=await compareBrowserCodegen(host,30,()=>{},{feature:'psmemsimd',measure:async()=>({passed:true})});
 assert.deepEqual(calls.map(c=>c.psmemsimd),[false,true,true,false,false]);
 assert.ok(calls.every(c=>c.regcache&&c.integerfifo&&c.singleprefix&&!c.pssimd&&!c.fprcache&&!c.compactgpr));
 assert.deepEqual(result.runs.filter(r=>!r.warmup).map(r=>r.psmemsimd),[false,true,true,false]);
});

test('shadow ablation is diagnostic even at 60 fps and always restores normal shadows',async()=>{const {compareFountainReflection}=await import('./browser-benchmark.js');const calls=[],phases=[];const host={adapter:{request:async(t,d)=>{calls.push([t,d]);return t==='meleeControl'?{objects:[{}]}:{};}}};const result=await compareFountainReflection(host,30,async()=>({match:{stage:2}}),{feature:'shadowdiag',onProgress:p=>phases.push(p),measure:async()=>({passed:true,simulationFps:60,visibleFps:60})});assert.equal(result.passed,false);assert.equal(result.diagnosticOnly,true);assert.ok(result.runs.every(r=>r.diagnosticOnly&&!r.passed));assert.ok(result.runs.every(r=>r.setupTimingMs.restore>=0));assert.ok(phases.some(p=>p.includes('settle 120 frames')));assert.deepEqual(calls.at(-3)[1],{action:'shadowDiagnostic',enabled:true});await assert.rejects(compareFountainReflection(host,30,async()=>({match:{stage:2}}),{feature:'shadowdiag',measure:async()=>{throw Error('capture failure');}}),/capture failure/);assert.deepEqual(calls.at(-3)[1],{action:'shadowDiagnostic',enabled:true});});

test('vector-register comparison bundles both SIMD paths and restores independent startup flags even on failure',async()=>{
 const {compareBrowserCodegen,browserCodegenConfig}=await import('./browser-benchmark.js');const calls=[];
 const host={cachedInterpreterDisableMask:(1<<16)|(1<<18),pairedSimd:true,adapter:{request:async(t,d)=>{calls.push([t,d]);return {};}}};
 const original=browserCodegenConfig(host);
 const result=await compareBrowserCodegen(host,30,()=>{},{feature:'vectorfpr',measure:async()=>({passed:true})});
 const changes=calls.filter(([,d])=>d.action==='codegen').map(([,d])=>d);
 assert.deepEqual(changes.slice(0,4).map(d=>[d.vectorfpr,d.pssimd,d.psmemsimd]),[[false,false,false],[true,true,true],[true,true,true],[false,false,false]]);
 assert.deepEqual(changes.at(-1),{action:'codegen',...original});
 assert.deepEqual(result.runs.filter(r=>!r.warmup).map(d=>[d.vectorfpr,d.pssimd,d.psmemsimd]),[[false,false,false],[true,true,true],[true,true,true],[false,false,false]]);
 assert.ok(changes.every(d=>d.regcache&&d.integerfifo&&d.singleprefix&&!d.fprcache&&!d.compactgpr));
 await assert.rejects(compareBrowserCodegen(host,30,()=>{},{feature:'vectorfpr',measure:async()=>{throw Error('probe failure');}}),/probe failure/);
 assert.deepEqual(calls.at(-2),['browserRollback',{action:'codegen',...original}]);assert.deepEqual(calls.at(-1),['start',{}]);
});

test('vector-only and vector-arithmetic comparisons exclude the unselected SIMD paths',async()=>{
 const {compareBrowserCodegen}=await import('./browser-benchmark.js');
 for(const feature of ['vectorfpronly','vectorfprarith']){
  const changes=[],host={cachedInterpreterDisableMask:(1<<16)|(1<<18),adapter:{request:async(t,d)=>{if(d.action==='codegen')changes.push(d);return {};}}};
  const result=await compareBrowserCodegen(host,30,()=>{},{feature,measure:async()=>({passed:true})});
  assert.deepEqual(changes.map(d=>d.vectorfpr),[false,true,true,false,false]);assert.ok(changes.every(d=>!d.psmemsimd));
  assert.deepEqual(changes.map(d=>d.pssimd),feature==='vectorfprarith'?[false,true,true,false,false]:[false,false,false,false,false]);
  assert.ok(result.runs.every(d=>!d.psmemsimd&&d.vectorfpr===d.enabled&&d.pssimd===(feature==='vectorfprarith'&&d.enabled)));
 }
});

test('paired-memory guards compare alone and preserve other CPU flags',async()=>{
 const {compareBrowserCodegen,browserCodegenConfig}=await import('./browser-benchmark.js');const calls=[];
 const host={cachedInterpreterDisableMask:(1<<16)|(1<<18),adapter:{request:async(t,d)=>{if(d.action==='codegen')calls.push(d);return {};}}};
 const result=await compareBrowserCodegen(host,30,()=>{},{feature:'psqhoist',measure:async()=>({passed:true})});
 assert.deepEqual(calls.map(d=>d.psqhoist),[false,true,true,false,false]);assert.ok(calls.every(d=>d.regcache&&d.integerfifo&&d.singleprefix&&!d.fprcache&&!d.vectorfpr&&!d.pssimd&&!d.psmemsimd));
 assert.deepEqual(result.runs.filter(r=>!r.warmup).map(r=>r.psqhoist),[false,true,true,false]);assert.equal(browserCodegenConfig(host).psqhoist,false);
});

test('wide map comparison verifies applied mask, captures miss deltas and restores on failure',async()=>{
 const {compareBrowserCodegen,parseBlockMapCounters}=await import('./browser-benchmark.js');
 let wide=false,empty=10,collision=20;const changes=[];
 const host={cachedInterpreterDisableMask:(1<<16)|(1<<18),adapter:{request:async(t,d)=>{
   if(d.action==='codegen'){wide=d.widemap;changes.push(d);}
   if(t==='rendererDiagnostics')return{cpuDetails:'map-mask:'+(wide?1048575:65535)+' slow-empty/collision:'+empty+'/'+collision};return{};
 }}};
 const result=await compareBrowserCodegen(host,30,()=>{},{feature:'widemap',measure:async()=>{empty++;collision+=wide?2:7;return{passed:true};}});
 assert.deepEqual(changes.map(d=>d.widemap),[false,true,true,false,false]);
 assert.deepEqual(result.runs.map(r=>r.blockMap.collisionMisses),[7,7,2,2,2,2,7,7]);
 assert.ok(changes.every(d=>d.regcache&&d.integerfifo&&d.singleprefix&&!d.pssimd&&!d.psmemsimd&&!d.psqhoist));
 await assert.rejects(compareBrowserCodegen(host,30,()=>{},{feature:'widemap',measure:async()=>{throw Error('image lost');}}),/image lost/);assert.equal(wide,false);
 assert.throws(()=>parseBlockMapCounters('fbmap:off'),/unavailable/);
});

test('constant-state comparison changes only binding and restores the original map',async()=>{
 const {compareBrowserCodegen,browserCodegenConfig}=await import('./browser-benchmark.js');const calls=[];
 const host={cachedInterpreterDisableMask:(1<<16)|(1<<18),wideBlockMap:true,adapter:{request:async(t,d)=>{if(d.action==='codegen')calls.push(d);return {};}}};
 const original=browserCodegenConfig(host);
 const result=await compareBrowserCodegen(host,30,()=>{},{feature:'stateconst',measure:async()=>({passed:true})});
 assert.deepEqual(calls.map(d=>d.stateconst),[false,true,true,false,false]);assert.ok(calls.every(d=>d.widemap&&d.regcache&&d.integerfifo&&d.singleprefix&&!d.psqhoist&&!d.vectorfpr&&!d.pssimd&&!d.psmemsimd));
 assert.deepEqual(result.runs.filter(r=>!r.warmup).map(r=>r.stateconst),[false,true,true,false]);
 await assert.rejects(compareBrowserCodegen(host,30,()=>{},{feature:'stateconst',measure:async()=>{throw Error('capture failed');}}),/capture failed/);assert.deepEqual(calls.at(-1),{action:'codegen',...original});
});

test('frame-based codegen comparison enables only after settling and verifies common fingerprints',async()=>{
 const {compareBrowserCodegen,compareFrameInputDigests}=await import('./browser-benchmark.js');const calls=[];let active=false,steps=0;
 const stats=()=>({valid:true,skipped:0,startFrame:300,inputChanges:[20,20],observedActions:[[14,20,24],[14,20,24]],digests:[{frame:120,input:1,state:2},{frame:1200,input:3,state:4}]});
 const host={adapter:{request:async(t,d)=>{calls.push([t,d]);if(d.action==='step')steps++;if(d.action==='frameInput'){active=d.enabled;if(active)assert.ok(steps>=120);}if(d.action==='frameInputStats')return stats();return {};}}};
 const result=await compareBrowserCodegen(host,30,()=>{},{feature:'stateconst',frameInput:true,measure:async()=>{assert.equal(active,true);return{passed:true};}});
 assert.equal(result.passed,true);assert.equal(result.inputConsistency.passed,true);assert.equal(active,false);assert.equal(result.runs.length,8);
 const altered=structuredClone(result.runs);altered[2].controllerStress.digests[1].state=9;assert.equal(compareFrameInputDigests(altered).passed,false);
 altered[2].controllerStress=stats();altered[2].controllerStress.skipped=1;altered[2].controllerStress.gaps=[{after:601,before:603}];assert.equal(compareFrameInputDigests(altered).passed,false);
 assert.equal(compareFrameInputDigests([]).passed,false);
 await assert.rejects(compareBrowserCodegen(host,30,()=>{},{feature:'stateconst',frameInput:true,measure:async()=>{throw Error('capture failed');}}),/capture failed/);assert.equal(active,false);
});

test('matching native polling gaps are reproducible; differing gaps are rejected',async()=>{
 const {compareFrameInputDigests}=await import('./browser-benchmark.js');
 const make=()=>({controllerStress:{valid:true,startFrame:300,skipped:1,gaps:[{after:601,before:603}],digests:[{frame:1200,input:123,state:456}]}});
 const a=make(),b=make();assert.equal(compareFrameInputDigests([a,b]).passed,true);
 b.controllerStress.gaps=[{after:701,before:703}];assert.equal(compareFrameInputDigests([a,b]).passed,false);
});

test('MSR cache comparison preserves independent flags and restores after failure',async()=>{
 const {compareBrowserCodegen,browserCodegenConfig}=await import('./browser-benchmark.js');const calls=[];
 const host={constantStateBase:true,adapter:{request:async(t,d)=>{if(d.action==='codegen')calls.push(d);return {};}}};
 const original=browserCodegenConfig(host);
 const result=await compareBrowserCodegen(host,30,()=>{},{feature:'msrcache',measure:async()=>({passed:true})});
 assert.deepEqual(calls.map(d=>d.msrcache),[false,true,true,false,false]);assert.ok(calls.every(d=>d.stateconst&&!d.widemap&&!d.vectorfpr&&!d.pssimd&&!d.psqhoist));
 assert.deepEqual(result.runs.filter(r=>!r.warmup).map(r=>r.msrcache),[false,true,true,false]);
 await assert.rejects(compareBrowserCodegen(host,30,()=>{},{feature:'msrcache',measure:async()=>{throw Error('capture failed');}}),/capture failed/);assert.deepEqual(calls.at(-1),{action:'codegen',...original});
});

test('FIFO copy comparison is isolated and restored on error',async()=>{
 const {compareBrowserCodegen,browserCodegenConfig}=await import('./browser-benchmark.js');const calls=[];
 const host={blockMsrCache:true,adapter:{request:async(t,d)=>{if(d.action==='codegen')calls.push(d);return {};}}};
 const original=browserCodegenConfig(host);
 const result=await compareBrowserCodegen(host,30,()=>{},{feature:'fifocopy',measure:async()=>({passed:true})});
 assert.deepEqual(calls.map(d=>d.fifocopy),[false,true,true,false,false]);assert.ok(calls.every(d=>d.msrcache&&!d.widemap&&!d.vectorfpr&&!d.pssimd));
 assert.deepEqual(result.runs.filter(r=>!r.warmup).map(r=>r.fifocopy),[false,true,true,false]);
 await assert.rejects(compareBrowserCodegen(host,30,()=>{},{feature:'fifocopy',measure:async()=>{throw Error('capture failed');}}),/capture failed/);assert.deepEqual(calls.at(-1),{action:'codegen',...original});
});

test('cosmetic comparisons use matched native polling and release ownership on failure',async()=>{
 const {compareFountainReflection}=await import('./browser-benchmark.js');
 for(const mismatch of [false,true]){
  let polled=0,steps=0;const calls=[];
  const host={adapter:{request:async(type,d)=>{calls.push([type,d]);
   if(type==='meleeControl')return {objects:[{}]};
   if(d.action==='step')steps++;
   if(d.action==='frameInput'&&d.enabled)assert.ok(steps>=120);
   if(d.action==='frameInputStats'){polled++;return {valid:true,startFrame:42,inputChanges:[10,10],observedActions:[[1,2,3],[2,3,4]],gaps:[],digests:[{frame:1200,input:1,state:mismatch&&polled===3?2:1}]};}
   return {};}}};
  const result=await compareFountainReflection(host,30,async()=>({match:{stage:2}}),{feature:'animation',frameInput:true,measure:async()=>({passed:true})});
  assert.equal(result.passed,!mismatch);assert.equal(result.inputConsistency.passed,!mismatch);assert.equal(result.runs.length,8);
  assert.equal(calls.filter(([,d])=>d.action==='frameInput'&&d.enabled).length,8);
  assert.equal(calls.filter(([,d])=>d.action==='frameInput').at(-1)[1].enabled,false);
  await assert.rejects(compareFountainReflection(host,30,async()=>({match:{stage:2}}),{feature:'animation',frameInput:true,measure:async()=>{throw Error('sample failed');}}),/sample failed/);
  assert.equal(calls.filter(([,d])=>d.action==='frameInput').at(-1)[1].enabled,false);
  assert.equal(calls.filter(([type])=>type==='meleeControl').at(-1)[1].enabled,true);
 }
});

test('single native-input measurement admits while paused and releases on inactive workload or error',async()=>{
 const {measureBrowserNativeInput}=await import('./browser-benchmark.js');
 for(const mode of ['valid','inactive','invalid','failed']){
  const calls=[];let input=false,paused=false;
  const host={adapter:{request:async(type,d)=>{calls.push([type,d]);
   if(d.action==='pause')paused=true;
   if(d.action==='frameInput'){if(d.enabled)assert.equal(paused,true);input=d.enabled;}
   if(type==='start')paused=false;
   if(d.action==='frameInputStats'){assert.equal(input,false);return {valid:mode!=='invalid',inputChanges:mode==='inactive'?[0,9]:[8,9],observedActions:[[1,2,3],[4,5,6]]};}
   return {};
  }}};
  const measure=async()=>{assert.equal(input,true);assert.equal(paused,false);if(mode==='failed')throw Error('image source lost');return {passed:true};};
  if(mode==='failed')await assert.rejects(measureBrowserNativeInput(host,30,()=>{},{measure}),/image source lost/);
  else{const r=await measureBrowserNativeInput(host,30,()=>{},{measure});assert.equal(r.passed,mode==='valid');assert.equal(r.controllerStress.exercisedBothPlayers,mode==='valid');}
  assert.equal(input,false);assert.equal(paused,false);
  assert.deepEqual(calls.at(-2),['browserRollback',{action:'frameInput',enabled:false}]);
  assert.deepEqual(calls.at(-1),['start',{}]);
 }
});

test('FIFO prefetch comparison keeps other settings and restores after errors',async()=>{
 const {compareBrowserCodegen,browserCodegenConfig}=await import('./browser-benchmark.js');const calls=[];
 const host={fifoCopy:true,adapter:{request:async(t,d)=>{if(d.action==='codegen')calls.push(d);return {};}}};
 const original=browserCodegenConfig(host);
 const result=await compareBrowserCodegen(host,30,()=>{},{feature:'fifobatch',measure:async()=>({passed:true})});
 assert.deepEqual(calls.map(d=>d.fifobatch),[false,true,true,false,false]);assert.ok(calls.every(d=>d.fifocopy&&!d.msrcache&&!d.pssimd));
 assert.deepEqual(result.runs.filter(r=>!r.warmup).map(r=>r.fifobatch),[false,true,true,false]);
 await assert.rejects(compareBrowserCodegen(host,30,()=>{},{feature:'fifobatch',measure:async()=>{throw Error('capture failed');}}),/capture failed/);assert.deepEqual(calls.at(-1),{action:'codegen',...original});
});

test('queue clock ABBA preserves capacity and native inputs, rejecting mismatches and cleaning up',async()=>{
 const {compareBrowserQueueClock}=await import('./browser-benchmark.js');
 for(const mismatch of[false,true]){
  const modes=[],calls=[];let polls=0;
  const q={capacity:2,rateLimited:true,setRateLimited(v){this.rateLimited=v;modes.push(v);}};
  const host={adapter:{presentationQueue:q,request:async(type,d)=>{
   calls.push([type,d]);
   if(d.action==='frameInputStats'){polls++;return {valid:true,startFrame:11,inputChanges:[12,14],observedActions:[[1,2,3],[2,3,4]],gaps:[],digests:[{frame:1200,input:1,state:mismatch&&polls===4?2:1}]};}
   return {};
  }}};
  const result=await compareBrowserQueueClock(host,30,()=>{},{measure:async()=>({passed:true,seenClock:q.rateLimited})});
  assert.deepEqual(modes,[true,true,false,false,false,false,true,true,true]);assert.equal(q.capacity,2);
  assert.deepEqual(result.runs.map(r=>r.seenClock),[true,true,false,false,false,false,true,true]);
  assert.equal(result.passed,!mismatch);assert.equal(result.inputConsistency.passed,!mismatch);
  assert.ok(!calls.some(([,d])=>['codegen','renderScale'].includes(d.action)));
  assert.equal(calls.filter(([,d])=>d.action==='frameInput'&&d.enabled).length,8);
  assert.equal(calls.filter(([,d])=>d.action==='frameInput').at(-1)[1].enabled,false);
  await assert.rejects(compareBrowserQueueClock(host,30,()=>{},{measure:async()=>{throw Error('capture failed');}}),/capture failed/);
  assert.equal(q.rateLimited,true);assert.equal(calls.filter(([,d])=>d.action==='frameInput').at(-1)[1].enabled,false);
  assert.equal(calls.at(-1)[0],'start');
 }
 await assert.rejects(compareBrowserQueueClock({adapter:{presentationQueue:{capacity:3}}},30,()=>{}),/two-image/);
});

test('async image versus delivery control keeps native inputs and never becomes an acceptance result',async()=>{
 const {compareBrowserProbe}=await import('./browser-benchmark.js');
 for(const mismatch of[false,true]){
  let enabled=false,paused=false,stats=0;const calls=[],seen=[];
  const host={adapter:{request:async(type,d)=>{
   calls.push([type,d]);if(d.action==='pause')paused=true;if(type==='start')paused=false;
   if(d.action==='frameInput'){if(d.enabled)assert.equal(paused,true);enabled=d.enabled;}
   if(d.action==='frameInputStats'){stats++;assert.equal(enabled,false);return {valid:true,startFrame:12,inputChanges:[12,14],observedActions:[[1,2,3],[2,3,4]],gaps:[],digests:[{frame:1200,input:1,state:mismatch&&stats===4?2:1}]};}
   return {};
  }}};
  const measure=name=>async()=>{assert.equal(enabled,true);assert.equal(paused,false);seen.push(name);return {passed:true};};
  const result=await compareBrowserProbe(host,30,()=>{},{mode:'async-overhead',frameInput:true,measureAsync:measure('async'),measureDelivery:measure('delivery')});
  assert.deepEqual(seen,['async','async','delivery','delivery','delivery','delivery','async','async']);
  assert.equal(result.passed,false);assert.equal(result.diagnosticOnly,true);assert.equal(result.inputConsistency.passed,!mismatch);
  assert.equal(enabled,false);assert.equal(paused,false);assert.ok(result.runs.every(r=>r.setupTimingMs['settle 120 frames']>=0));
  assert.ok(!calls.some(([,d])=>['codegen','renderScale'].includes(d.action)));
  await assert.rejects(compareBrowserProbe(host,30,()=>{},{mode:'async-overhead',frameInput:true,measureAsync:async()=>{throw Error('readback failed');}}),/readback failed/);
  assert.equal(enabled,false);assert.equal(paused,false);assert.equal(calls.at(-2)[1].action,'release');
 }
});

test('benchmark identity checks reject unapplied roster labels, wrong stages and rules',async()=>{
 const {verifyBenchmarkSelection}=await import('./browser-benchmark.js');
 const s={major:2,minor:2,sceneKind:2,match:{stage:2,timeLimit:480,items:-1,teams:0},fighters:[{character:14,slotType:0},{character:14,slotType:0}]};
 assert.deepEqual(verifyBenchmarkSelection(s,{stage:2,characters:[14,14]}).characters,[14,14]);
 assert.throws(()=>verifyBenchmarkSelection(s,{stage:2,characters:[2,20]}),/fighter selection/);
 assert.throws(()=>verifyBenchmarkSelection(s,{stage:31,characters:[14,14]}),/stage/);
 for(const field of ['timeLimit','items','teams'])assert.throws(()=>verifyBenchmarkSelection({...s,match:{...s.match,[field]:1}},{stage:2,characters:[14,14]}),/settings/);
});

test('context reuse comparison keeps native inputs and reports failed sample drains',async()=>{
 const {compareBrowserProbe}=await import('./browser-benchmark.js');const calls=[],seen=[];let input=false;
 const host={adapter:{request:async(t,d)=>{calls.push([t,d]);if(d.action==='frameInput')input=d.enabled;if(d.action==='frameInputStats')return{valid:true,startFrame:20,inputChanges:[12,12],observedActions:[[1,2,3],[1,2,3]],gaps:[],digests:[{frame:1200,input:1,state:1}]};return{};}}};
 const r=await compareBrowserProbe(host,30,()=>{},{mode:'context',frameInput:true,measureAsync:async(h,s,i,o)=>{assert.equal(input,true);seen.push(o.reuseProbe);return{passed:true};}});
 assert.deepEqual(seen,[false,false,true,true,true,true,false,false]);assert.equal(r.inputConsistency.passed,true);assert.equal(r.passed,false);assert.equal(r.diagnosticOnly,true);assert.ok(!calls.some(([,d])=>['codegen','renderScale'].includes(d.action)));
 let reported;const failure=Object.assign(Error('GPU drain timeout'),{imageProbeFailure:{phase:'drain',pending:1}});
 await assert.rejects(compareBrowserProbe(host,30,()=>{},{mode:'context',frameInput:true,onResult:r=>reported=r,measureAsync:async()=>{throw failure;}}),/GPU drain timeout/);
 assert.deepEqual(reported.failure.imageProbe,{phase:'drain',pending:1});assert.equal(reported.passed,false);assert.equal(input,false);assert.equal(calls.at(-1)[0],'start');
});

test('harvest scheduling varies only the verifier and keeps native inputs and conservative acceptance',async()=>{
 const {compareBrowserProbe}=await import('./browser-benchmark.js');const calls=[],seen=[];let input=false;
 const host={adapter:{request:async(t,d)=>{calls.push([t,d]);if(d.action==='frameInput')input=d.enabled;if(d.action==='frameInputStats')return{valid:true,startFrame:20,inputChanges:[12,12],observedActions:[[1,2,3],[1,2,3]],gaps:[],digests:[{frame:1200,input:1,state:1}]};return{};}}};
 const r=await compareBrowserProbe(host,30,()=>{},{mode:'harvest',frameInput:true,measureAsync:async(h,s,i,o)=>{assert.equal(input,true);assert.equal(o.reuseProbe,false);seen.push(o.harvestInTask);return{passed:true};}});
 assert.deepEqual(seen,[false,false,true,true,true,true,false,false]);assert.equal(r.inputConsistency.passed,true);assert.equal(r.passed,false);assert.equal(r.diagnosticOnly,true);
 assert.ok(!calls.some(([,d])=>['codegen','renderScale'].includes(d.action)));assert.equal(input,false);assert.equal(calls.at(-1)[0],'start');
});

test('worker verifier comparison keeps image acceptance and holds all emulator settings fixed',async()=>{
 const {compareBrowserProbe}=await import('./browser-benchmark.js');const calls=[],seen=[];let input=false;
 const host={adapter:{request:async(t,d)=>{calls.push([t,d]);if(d.action==='frameInput')input=d.enabled;if(d.action==='frameInputStats')return{valid:true,startFrame:20,inputChanges:[12,12],observedActions:[[1,2,3],[1,2,3]],gaps:[],digests:[{frame:1200,input:1,state:1}]};return{};}}};
 const r=await compareBrowserProbe(host,30,()=>{},{mode:'worker',frameInput:true,measureAsync:async(h,s,i,o)=>{assert.equal(input,true);assert.equal(o.reuseProbe,false);assert.equal(o.harvestInTask,false);seen.push(o.workerProbe);return{passed:true};},measureDelivery:assert.fail,measureImage:assert.fail});
 assert.deepEqual(seen,[false,false,true,true,true,true,false,false]);assert.equal(r.inputConsistency.passed,true);assert.equal(r.passed,false);assert.equal(r.diagnosticOnly,true);
 assert.ok(!calls.some(([,d])=>['codegen','renderScale'].includes(d.action)));assert.equal(input,false);assert.equal(calls.at(-1)[0],'start');
});

test('timed fusion compares independently and restores the original disable bit on failure',async()=>{
 const {compareBrowserCodegen,browserCodegenConfig}=await import('./browser-benchmark.js');const calls=[];
 const host={cachedInterpreterDisableMask:(1<<17)|(1<<16)|(1<<18),adapter:{request:async(t,d)=>{if(d.action==='codegen')calls.push(d);return {};}}};
 const result=await compareBrowserCodegen(host,30,()=>{},{feature:'blockmerge',measure:async()=>({passed:true})});
 assert.deepEqual(calls.map(d=>d.blockmerge),[false,true,true,false,false]);assert.ok(calls.every(d=>d.regcache&&d.integerfifo&&d.singleprefix&&!d.fprcache&&!d.fifobatch));
 assert.deepEqual(result.runs.filter(r=>!r.warmup).map(r=>r.blockmerge),[false,true,true,false]);
 await assert.rejects(compareBrowserCodegen(host,30,()=>{},{feature:'blockmerge',measure:async()=>{throw Error('capture failed');}}),/capture failed/);
 assert.deepEqual(calls.at(-1),{action:'codegen',...browserCodegenConfig(host)});
});

test('display-list comparison verifies dirty-state continuations and restores the accepted base',async()=>{
 const {compareBrowserCodegen,browserCodegenConfig}=await import('./browser-benchmark.js');
 const calls=[];let config={};let bad=false;
 const host={cachedInterpreterDisableMask:(1<<16)|(1<<18),meleeAnimStateFast:true,
  adapter:{request:async(type,data)=>{
   if(data.action==='codegen'){config=data;calls.push(data);return{};}
   if(type==='rendererDiagnostics')return{cpuDetails:config.displaylistfast
    ? `displaylistfast:1 compile/run/fallback/dirty/flush/memory:3/200/5/160/3/2 continuation/suffix:160/${bad?0:140} flush-continuation/tail:${bad?0:20}/180`
    : 'displaylistfast:0 compile/run/fallback/dirty/flush/memory:0/0/0/0/0/0 continuation/suffix:0/0 flush-continuation/tail:0/0'};
   return{};
  }}};
 const options={feature:'displaylistfast',retainedFpuGuard:true,measure:async()=>({passed:true})};
 const result=await compareBrowserCodegen(host,30,()=>{},options);
 assert.deepEqual(result.runs.map(run=>run.displaylistfast),[false,false,true,true,true,true,false,false]);
 assert.ok(result.runs.every(run=>run.animstatefast&&run.fpuguard&&run.blockmerge));
 for(const run of result.runs.filter(run=>run.enabled)){
  assert.equal(run.displayListFastCoverage.successful,195);
  assert.deepEqual(run.displayListFastCoverage.fallbackReasons,{flush:3,memory:2});
  assert.equal(run.displayListFastCoverage.dirtyCalls,160);
 }
 bad=true;
 await assert.rejects(compareBrowserCodegen(host,30,()=>{},options),/display-list fast-path coverage/);
 assert.deepEqual(calls.at(-1),{action:'codegen',...browserCodegenConfig(host)});
});

test('FPU proof comparison preserves retained fusion and restores on failure',async()=>{
 const {compareBrowserCodegen,browserCodegenConfig}=await import('./browser-benchmark.js');const calls=[];
 const host={cachedInterpreterDisableMask:(1<<16)|(1<<18),adapter:{request:async(t,d)=>{if(d.action==='codegen')calls.push(d);return {};}}};
 const result=await compareBrowserCodegen(host,30,()=>{},{feature:'fpuguard',measure:async()=>({passed:true})});
 assert.deepEqual(calls.map(d=>d.fpuguard),[false,true,true,false,false]);assert.ok(calls.every(d=>d.blockmerge&&d.regcache&&d.integerfifo&&d.singleprefix&&!d.fprcache&&!d.msrcache));
 await assert.rejects(compareBrowserCodegen(host,30,()=>{},{feature:'fpuguard',measure:async()=>{throw Error('capture failure');}}),/capture failure/);assert.deepEqual(calls.at(-1),{action:'codegen',...browserCodegenConfig(host)});
});

test('conditional fusion comparison keeps unconditional fusion and restores on error',async()=>{
 const {compareBrowserCodegen,browserCodegenConfig}=await import('./browser-benchmark.js');const calls=[];const host={cachedInterpreterDisableMask:(1<<16)|(1<<18),adapter:{request:async(t,d)=>{if(d.action==='codegen')calls.push(d);return {};}}};
 const result=await compareBrowserCodegen(host,30,()=>{},{feature:'branchfusion',measure:async()=>({passed:true})});assert.deepEqual(calls.map(d=>d.branchfusion),[false,true,true,false,false]);assert.ok(calls.every(d=>d.blockmerge&&d.regcache&&d.integerfifo&&d.singleprefix&&!d.fpuguard));
 await assert.rejects(compareBrowserCodegen(host,30,()=>{},{feature:'branchfusion',measure:async()=>{throw Error('capture failed');}}),/capture failed/);assert.deepEqual(calls.at(-1),{action:'codegen',...browserCodegenConfig(host)});
});

test('conditional comparison applies retained FPU base before capture and restores original settings',async()=>{
 const {compareBrowserCodegen,browserCodegenConfig}=await import('./browser-benchmark.js');const calls=[];const host={cachedInterpreterDisableMask:(1<<16)|(1<<18),adapter:{request:async(t,d)=>{calls.push({type:t,...d});return {};}}};
 const result=await compareBrowserCodegen(host,30,()=>{},{feature:'branchfusion',retainedFpuGuard:true,measure:async()=>({passed:true})});
 assert.deepEqual(calls.slice(0,4).map(c=>c.action),['pause','codegen','step','capture']);
 assert.ok(result.runs.every(r=>r.fpuguard&&r.blockmerge));
 assert.deepEqual(calls.filter(c=>c.action==='codegen').map(c=>[c.branchfusion,c.fpuguard]),[[false,true],[false,true],[true,true],[true,true],[false,true],[false,false]]);
 await assert.rejects(compareBrowserCodegen(host,30,()=>{},{feature:'branchfusion',retainedFpuGuard:true,measure:async()=>{throw Error('capture failed');}}),/capture failed/);
 assert.deepEqual(calls.filter(c=>c.action==='codegen').at(-1),{type:'browserRollback',action:'codegen',...browserCodegenConfig(host)});
});

test('idle guard comparison proves execution and restores independent retained flags',async()=>{
 const {compareBrowserCodegen,browserCodegenConfig}=await import('./browser-benchmark.js');const calls=[];let enabled=false,iterations=0,hoisted=0;const host={cachedInterpreterDisableMask:(1<<16)|(1<<18),adapter:{request:async(t,d)=>{calls.push({type:t,...d});if(d.action==='idleBatchChecks'){enabled=d.value;return {enabled};}if(t==='rendererDiagnostics'){iterations+=100;if(enabled)hoisted+=90;return{cpuDetails:'fastidlepoll attempts:4 iters:'+iterations+' hoisted:'+hoisted+' exits:0'};}return {};}}};
 const result=await compareBrowserCodegen(host,30,()=>{},{feature:'idlechecks',retainedFpuGuard:true,retainedBranchFusion:true,measure:async()=>({passed:true})});assert.deepEqual(calls.filter(c=>c.action==='idleBatchChecks').map(c=>c.value),[false,true,true,false,false]);assert.ok(result.runs.every(r=>r.fpuguard&&r.branchfusion&&r.blockmerge));assert.ok(result.runs.every(r=>r.idleGuardCounters.hoisted===(r.enabled?90:0)));assert.equal(enabled,false);
 await assert.rejects(compareBrowserCodegen(host,30,()=>{},{feature:'idlechecks',retainedFpuGuard:true,measure:async()=>{throw Error('capture failed');}}),/capture failed/);assert.equal(enabled,false);assert.deepEqual(calls.filter(c=>c.action==='codegen').at(-1),{type:'browserRollback',action:'codegen',...browserCodegenConfig(host)});
});
test('idle guard comparison rejects a setting that did not apply',async()=>{
 const {compareBrowserCodegen}=await import('./browser-benchmark.js');const host={adapter:{request:async(t,d)=>d.action==='idleBatchChecks'?{enabled:!d.value}:{}},cachedInterpreterDisableMask:0};await assert.rejects(compareBrowserCodegen(host,30,()=>{},{feature:'idlechecks'}),/did not apply/);
});

test('wide FPU admission compares with retained proof and fusion, and cleans up',async()=>{
 const {compareBrowserCodegen,browserCodegenConfig}=await import('./browser-benchmark.js');const calls=[];const host={cachedInterpreterDisableMask:(1<<16)|(1<<18),adapter:{request:async(t,d)=>{if(d.action==='codegen')calls.push(d);return {};}}};
 const result=await compareBrowserCodegen(host,30,()=>{},{feature:'fpuguardwide',retainedFpuGuard:true,measure:async()=>({passed:true})});assert.ok(result.runs.every(r=>r.fpuguard&&r.blockmerge&&!r.branchfusion));assert.deepEqual(result.runs.map(r=>r.fpuguardwide),[false,false,true,true,true,true,false,false]);
 await assert.rejects(compareBrowserCodegen(host,30,()=>{},{feature:'fpuguardwide',retainedFpuGuard:true,measure:async()=>{throw Error('capture failed');}}),/capture failed/);assert.deepEqual(calls.at(-1),{action:'codegen',...browserCodegenConfig(host)});
});

test('step-check comparison preserves retained optimizations and restores on error',async()=>{
 const {compareBrowserCodegen,browserCodegenConfig}=await import('./browser-benchmark.js');const calls=[];const host={cachedInterpreterDisableMask:(1<<16)|(1<<18),adapter:{request:async(t,d)=>{if(d.action==='codegen')calls.push(d);return {};}}};
 const result=await compareBrowserCodegen(host,30,()=>{},{feature:'stepcheck',retainedFpuGuard:true,measure:async()=>({passed:true})});assert.ok(result.runs.every(r=>r.fpuguard&&r.blockmerge&&!r.branchfusion&&!r.fpuguardwide));assert.deepEqual(result.runs.map(r=>r.stepcheck),[false,false,true,true,true,true,false,false]);
 await assert.rejects(compareBrowserCodegen(host,30,()=>{},{feature:'stepcheck',retainedFpuGuard:true,measure:async()=>{throw Error('capture failed');}}),/capture failed/);assert.deepEqual(calls.at(-1),{action:'codegen',...browserCodegenConfig(host)});
});

test('read-only fusion comparison preserves retained settings and restores on error',async()=>{const {compareBrowserCodegen,browserCodegenConfig}=await import('./browser-benchmark.js');const calls=[];const host={cachedInterpreterDisableMask:(1<<16)|(1<<18),adapter:{request:async(t,d)=>{if(d.action==='codegen')calls.push(d);return {};}}};const r=await compareBrowserCodegen(host,30,()=>{},{feature:'readfusion',retainedFpuGuard:true,measure:async()=>({passed:true})});assert.ok(r.runs.every(r=>r.fpuguard&&r.blockmerge&&!r.branchfusion&&!r.fpuguardwide&&!r.stepcheck));assert.deepEqual(r.runs.map(r=>r.readfusion),[false,false,true,true,true,true,false,false]);await assert.rejects(compareBrowserCodegen(host,30,()=>{},{feature:'readfusion',retainedFpuGuard:true,measure:async()=>{throw Error('capture failed');}}),/capture failed/);assert.deepEqual(calls.at(-1),{action:'codegen',...browserCodegenConfig(host)});});

test('conditional read fusion compares both flags together against the retained baseline',async()=>{const {compareBrowserCodegen,browserCodegenConfig}=await import('./browser-benchmark.js');const calls=[];const host={cachedInterpreterDisableMask:(1<<16)|(1<<18),adapter:{request:async(t,d)=>{if(d.action==='codegen')calls.push(d);return {};}}};const r=await compareBrowserCodegen(host,30,()=>{},{feature:'readbranchfusion',retainedFpuGuard:true,measure:async()=>({passed:true})});for(const run of r.runs){assert.equal(run.readfusion,run.enabled);assert.equal(run.branchfusion,run.enabled);assert.ok(run.fpuguard&&run.blockmerge&&!run.stepcheck&&!run.fpuguardwide);}await assert.rejects(compareBrowserCodegen(host,30,()=>{},{feature:'readbranchfusion',retainedFpuGuard:true,measure:async()=>{throw Error('capture failed');}}),/capture failed/);assert.deepEqual(calls.at(-1),{action:'codegen',...browserCodegenConfig(host)});});

test('fusion redispatch isolates safe exits within combined fusion and restores all settings',async()=>{const {compareBrowserCodegen,browserCodegenConfig}=await import('./browser-benchmark.js');const calls=[];const host={cachedInterpreterDisableMask:(1<<16)|(1<<18),adapter:{request:async(t,d)=>{if(d.action==='codegen')calls.push(d);return {};}}};const options={feature:'fusionredispatch',retainedFpuGuard:true,retainedBranchFusion:true,retainedReadFusion:true,measure:async()=>({passed:true})};const r=await compareBrowserCodegen(host,30,()=>{},options);for(const run of r.runs){assert.ok(run.readfusion&&run.branchfusion&&run.fpuguard&&run.blockmerge);assert.equal(run.fusionredispatch,run.enabled);}await assert.rejects(compareBrowserCodegen(host,30,()=>{},{...options,measure:async()=>{throw Error('capture failed');}}),/capture failed/);assert.deepEqual(calls.at(-1),{action:'codegen',...browserCodegenConfig(host)});const bundle=await compareBrowserCodegen(host,30,()=>{},{feature:'readbranchfusionfast',retainedFpuGuard:true,measure:async()=>({passed:true})});for(const run of bundle.runs){assert.equal(run.readfusion,run.enabled);assert.equal(run.branchfusion,run.enabled);assert.equal(run.fusionredispatch,run.enabled);}});

test('queue capacity compares matched native inputs with fixed codegen and restores after failure',async()=>{
 const {compareBrowserQueueCapacity,browserCodegenConfig}=await import('./browser-benchmark.js');
 for(const [referenceCapacity,candidateCapacity] of[[2,3],[2,4],[4,3]])for(const mismatch of[false,true]){
  const calls=[],capacities=[];let active=false,polls=0;
  const q={capacity:referenceCapacity,setCapacity(v){this.capacity=v;capacities.push(v);}};
  const host={cachedInterpreterDisableMask:(1<<16)|(1<<18),fusionRedispatch:true,adapter:{presentationQueue:q,request:async(type,d)=>{
   calls.push({type,...d});if(d.action==='frameInput')active=d.enabled;
   if(d.action==='frameInputStats'){polls++;return{valid:true,startFrame:11,inputChanges:[12,14],observedActions:[[1,2,3],[2,3,4]],gaps:[],digests:[{frame:1200,input:1,state:mismatch&&polls===4?2:1}]};}return{};
  }}};
  const r=await compareBrowserQueueCapacity(host,30,()=>{},{candidateCapacity,measure:async()=>{assert.equal(active,true);return{passed:true,seen:q.capacity};}});
  const order=[referenceCapacity,referenceCapacity,candidateCapacity,candidateCapacity,candidateCapacity,candidateCapacity,referenceCapacity,referenceCapacity];
  assert.deepEqual(capacities,[...order,referenceCapacity]);assert.deepEqual(r.runs.map(r=>r.seen),order);assert.equal(r.passed,!mismatch);assert.equal(r.inputConsistency.passed,!mismatch);assert.equal(r.candidateCapacity,candidateCapacity);
  for(const run of r.runs)assert.deepEqual(run.codegen,browserCodegenConfig(host));
  assert.equal(active,false);assert.equal(calls.at(-1).type,'start');assert.deepEqual(calls.filter(c=>c.action==='codegen').at(-1),{type:'browserRollback',action:'codegen',...browserCodegenConfig(host)});
  await assert.rejects(compareBrowserQueueCapacity(host,30,()=>{},{candidateCapacity,measure:async()=>{throw Error('capture failed');}}),/capture failed/);assert.equal(q.capacity,referenceCapacity);assert.equal(active,false);assert.equal(calls.at(-1).type,'start');
 }
});
test('queue comparison attempts remaining cleanup after release failure',async()=>{
 const {compareBrowserQueueCapacity,browserCodegenConfig}=await import('./browser-benchmark.js');const calls=[];
 const q={capacity:2,setCapacity(v){this.capacity=v;}};
 const host={adapter:{presentationQueue:q,request:async(type,d)=>{calls.push({type,...d});if(d.action==='release')throw Error('release failed');return{};}}};
 await assert.rejects(compareBrowserQueueCapacity(host,30,()=>{},{measure:async()=>{throw Error('capture failed');}}),/cleanup failed/);
 assert.equal(q.capacity,2);assert.equal(calls.at(-1).type,'start');assert.deepEqual(calls.filter(c=>c.action==='codegen').at(-1),{type:'browserRollback',action:'codegen',...browserCodegenConfig(host)});
});

test('counter batching preserves fixed emulation settings and restores on error',async()=>{const {compareBrowserCodegen,browserCodegenConfig}=await import('./browser-benchmark.js');const calls=[];const host={cachedInterpreterDisableMask:(1<<16)|(1<<18),adapter:{request:async(t,d)=>{if(d.action==='codegen')calls.push(d);return{};}}};const options={feature:'counterbatch',retainedFpuGuard:true,retainedBranchFusion:true,retainedReadFusion:true,measure:async()=>({passed:true})};const r=await compareBrowserCodegen(host,30,()=>{},options);assert.deepEqual(r.runs.map(r=>r.counterbatch),[false,false,true,true,true,true,false,false]);assert.ok(r.runs.every(r=>r.fpuguard&&r.blockmerge&&r.branchfusion&&r.readfusion&&!r.fusionredispatch));await assert.rejects(compareBrowserCodegen(host,30,()=>{},{...options,measure:async()=>{throw Error('capture failed');}}),/capture failed/);assert.deepEqual(calls.at(-1),{action:'codegen',...browserCodegenConfig(host)});});

test('lean dispatcher comparison changes only its runtime flag and restores original settings',async()=>{
 const {compareBrowserCodegen,browserCodegenConfig}=await import('./browser-benchmark.js');const calls=[];
 const host={cachedInterpreterDisableMask:(1<<16)|(1<<18),adapter:{request:async(t,d)=>{if(d.action==='codegen')calls.push(d);return{};}}};
 const options={feature:'leandispatch',retainedFpuGuard:true,retainedBranchFusion:true,retainedReadFusion:true,measure:async()=>({passed:true})};
 const r=await compareBrowserCodegen(host,30,()=>{},options);assert.deepEqual(r.runs.map(r=>r.leandispatch),[false,false,true,true,true,true,false,false]);assert.ok(r.runs.every(r=>!r.counterbatch&&r.fpuguard&&r.blockmerge&&r.readfusion&&r.branchfusion));
 await assert.rejects(compareBrowserCodegen(host,30,()=>{},{...options,measure:async()=>{throw Error('measurement failed');}}),/measurement failed/);assert.deepEqual(calls.at(-1),{action:'codegen',...browserCodegenConfig(host)});
});

test('CP format comparison verifies actual reuse, holds timing settings and restores on failure',async()=>{
 const {compareBrowserCodegen,browserCodegenConfig}=await import('./browser-benchmark.js');const calls=[];let config={},n=0,bad=false;
 const host={cachedInterpreterDisableMask:(1<<16)|(1<<18),adapter:{request:async(t,d)=>{calls.push([t,d]);if(d.action==='codegen')config=d;if(d.action==='cpFormatStats'){const i=++n;return{enabled:config.cpformat,writes:i*20,unchanged:i*10,avoided:config.cpformat&&!bad?i*10:0};}return{};}}};
 const options={feature:'cpformat',retainedFpuGuard:true,measure:async()=>({passed:true})};const result=await compareBrowserCodegen(host,30,()=>{},options);assert.deepEqual(result.runs.map(r=>r.cpformat),[false,false,true,true,true,true,false,false]);assert.deepEqual(result.runs.map(r=>r.cpFormat.avoided),[0,0,10,10,10,10,0,0]);assert.ok(result.runs.every(r=>r.cpFormat.writes===20&&r.cpFormat.unchanged===10&&!r.leandispatch&&!r.readfusion&&!r.branchfusion));
 bad=true;await assert.rejects(compareBrowserCodegen(host,30,()=>{},options),/opportunity counters/);assert.deepEqual(calls.filter(([t,d])=>d.action==='codegen').at(-1)[1],{action:'codegen',...browserCodegenConfig(host)});
});

test('particle comparison verifies installed hook, uses one checkpoint, and restores after drift',async()=>{
 const {compareFountainReflection}=await import('./browser-benchmark.js');
 const calls=[];let enabled=true,drift=false,measured=0;
 const host={adapter:{request:async(type,data)=>{
  calls.push([type,data]);
  if(data.action==='fountainParticles'){
   const changing=enabled!==data.enabled;enabled=data.enabled;
   return {objects:[{bank:30}],writes:changing||drift?[[1,1]]:[],codeWrites:[],particles:{total:100,banks:[{bank:30,particles:100}]}};
  }return {};
 }}};
 const result=await compareFountainReflection(host,30,async()=>({match:{stage:2}}),{feature:'particles',measure:async()=>({passed:true})});
 assert.equal(result.passed,true);assert.deepEqual(result.runs.filter(r=>!r.warmup).map(r=>r.particles),[true,false,false,true]);
 assert.ok(result.runs.every(r=>r.cosmeticCoverage.stableAtEnd));assert.equal(calls.filter(([,d])=>d.action==='capture').length,1);
 assert.equal(enabled,true);assert.equal(calls.at(-1)[0],'start');
 await assert.rejects(compareFountainReflection(host,30,async()=>({match:{stage:2}}),{feature:'particles',measure:async()=>{if(++measured===2)drift=true;return {passed:true};}}),/Particle hook changed/);
 assert.equal(enabled,true);assert.equal(calls.at(-2)[1].action,'release');assert.equal(calls.at(-1)[0],'start');
});

test('hot-function fusion compares independently and verifies compiled coverage',async()=>{
 const {compareBrowserCodegen}=await import('./browser-benchmark.js');let enabled=false;const changes=[];
 const host={meleeAnimFusion:true,cachedInterpreterDisableMask:(1<<16)|(1<<18),adapter:{request:async(type,data)=>{
  if(data.action==='codegen'){enabled=data.hotfusion;changes.push(data);return data;}
  if(type==='rendererDiagnostics')return{cpuDetails:`hotfusion:${enabled?1:0} emitted:${enabled?37:0}`};return{};
 }}};
 const result=await compareBrowserCodegen(host,1,()=>{},{feature:'hotfusion',measure:async()=>({passed:true})});
 assert.deepEqual(changes.map(d=>d.hotfusion),[false,true,true,false,false]);
 assert.ok(changes.every(d=>d.animfusion===true));
 assert.deepEqual(result.runs.filter(r=>!r.warmup).map(r=>r.hotFusionCoverage.enabled),[false,true,true,false]);
 assert.equal(result.runs[2].hotFusionCoverage.emittedBlocks,37);
});
