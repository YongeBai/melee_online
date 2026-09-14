import test from'node:test';import assert from'node:assert/strict';import{verifyBrowserRunningCodegen as verify}from'./browser-running-replay.js';
const reference={regcache:true,fastmem:false,stepcheck:false},candidate={...reference,stepcheck:true},original={...reference,regcache:false};
function fixture({differ=false,fingerprint=false,miss=false,timeout=false,failAction=null,cleanupFail=false}={}){
 const calls=[];let trial=0,t=0,cleanup=false,polls=0;const input={active:true,valid:true,completed:true,startFrame:300,lastFrame:900,stoppedFrame:900,stopAfterFrames:600,frames:601,inputHash:2,stateHash:3,gaps:[],digests:[]};
 const send=async(action,data={})=>{calls.push({action,...data});if(action===failAction)throw Error('injected failure');if(action==='pause')cleanup=true;if(cleanupFail&&cleanup&&action==='frameInput')throw Error('cleanup failure');if(action==='restore')trial++;if(action==='frameInputStats'){polls++;return{...input,id:100+polls,ok:true,completed:!timeout,stoppedFrame:miss?901:900,inputHash:trial&&fingerprint?7:2};}if(action==='equal')return{equal:!differ,comparison:{sizeA:107000000,sizeB:107000000}};return{};};
 const inspect=async()=>({sceneFrame:trial?900:300,fighters:[0,1].map(port=>({port,slotType:0,controllerIndex:port}))});
 // Captured endpoint frame is equal in each trial.
 const read=async()=>{const s=await inspect();if(polls)s.sceneFrame=900;return s;};
 const options={frames:600,codegenReference:reference,codegenComparison:candidate,originalCodegen:original,resume:async()=>{calls.push({action:'resume'});},sleep:async()=>{t+=150;},now:()=>t,timeoutMs:300};
 return{calls,send,read,options};
}
test('ordinary running comparison never frame-steps; compares full endpoints and restores original settings',async()=>{
 const f=fixture(),r=await verify(f.send,f.read,f.options);assert.equal(r.passed,true);assert.equal(r.fingerprintsEqual,true);
 assert.ok(!f.calls.some(c=>c.action==='step'||c.action==='advance'||c.action==='pads'));
 assert.deepEqual(f.calls.filter(c=>c.action==='capture').map(c=>c.slot),[5,4,0]);
 assert.deepEqual(f.calls.filter(c=>c.action==='codegen').map(({action,...c})=>c),[reference,candidate,original]);
 assert.deepEqual(f.calls.slice(-5).map(c=>c.action),['pause','frameInput','clear','codegen','resume']);
 for(let i=0;i<f.calls.length;i++)if(f.calls[i].action==='frameInputStop')assert.equal(f.calls[i+1].action,'resume');
});
for(const kind of ['differ','fingerprint'])test(`${kind} mismatch cannot pass`,async()=>{const f=fixture({[kind]:true});assert.equal((await verify(f.send,f.read,f.options)).passed,false);});
for(const config of [{miss:true},{timeout:true},{failAction:'capture'},{cleanupFail:true}])test(`failure cleans up all ownership and flags: ${JSON.stringify(config)}`,async()=>{
 const f=fixture(config);await assert.rejects(verify(f.send,f.read,f.options));assert.deepEqual(f.calls.slice(-5).map(c=>c.action),['pause','frameInput','clear','codegen','resume']);assert.deepEqual(f.calls.at(-2),{action:'codegen',...original});
});
test('bad configuration rejected before mutating the emulator',async()=>{const f=fixture();await assert.rejects(verify(f.send,f.read,{...f.options,frames:119}));assert.equal(f.calls.length,0);});

test('real dispatcher coverage is mandatory when supplied, mismatches are rejected',async()=>{for(const wrong of [false,true]){const f=fixture();let n=0;f.options.diagnostics=async()=>{const step=n>=2?1:0;return{cpuDetails:'stepcheck:'+step+' wasm-dispatch:2/'+(++n*10*(wrong?0:1))+'calls'};};if(wrong)await assert.rejects(verify(f.send,f.read,f.options),/configured dispatcher/);else{const r=await verify(f.send,f.read,f.options);assert.ok(r.passed);assert.deepEqual(r.runs.map(r=>r.execution.calls),[10,10]);}}});

test('read fusion reports actual compiler coverage and rejects an unexercised candidate',async()=>{for(const missing of [false,true]){const f=fixture();f.options.codegenReference={...reference,readfusion:false};f.options.codegenComparison={...candidate,readfusion:true};let n=0;f.options.diagnostics=async()=>{const on=n>=2;return{cpuDetails:'stepcheck:'+Number(on)+' wasm-dispatch:2/'+(++n*10)+'calls readfusion:'+Number(on)+' emitted:'+(on&&!missing?n*3:0)};};if(missing)await assert.rejects(verify(f.send,f.read,f.options),/configured read fusion/);else assert.ok((await verify(f.send,f.read,f.options)).passed);}});

test('fusion redispatch coverage rejects a mode that did not compile',async()=>{for(const missing of [false,true]){const f=fixture();f.options.codegenReference={...reference,fusionredispatch:false};f.options.codegenComparison={...candidate,fusionredispatch:true};let n=0;f.options.diagnostics=async()=>{const on=n>=2;return{cpuDetails:'stepcheck:'+Number(on)+' wasm-dispatch:2/'+(++n*10)+'calls fusionredispatch:'+Number(on)+' emitted:'+(on&&!missing?n*3:0)};};if(missing)await assert.rejects(verify(f.send,f.read,f.options),/configured fusion redispatch/);else assert.ok((await verify(f.send,f.read,f.options)).passed);}});

test('Q0 cache replay requires new emitted sites after codegen changes',async()=>{
 for(const feature of ['qstatecache','qstatefull'])for(const failure of ['none','missing','stale','wrong']){
  const f=fixture();f.options.codegenReference={...reference,[feature]:false};f.options.codegenComparison={...reference,[feature]:true};let n=0;
  f.options.diagnostics=async()=>{const i=n++,on=i>=2;return{cpuDetails:'stepcheck:0 wasm-dispatch:2/'+((i+1)*10)+'calls '+feature+':'+Number(on&&failure!=='wrong')+' emit-blocks/sites:4/'+(failure==='missing'?0:failure==='stale'?50:(i+1)*20)};};
  if(failure==='none'){const r=await verify(f.send,f.read,f.options);assert.ok(r.passed);assert.deepEqual(r.runs.map(r=>r.execution[feature==='qstatecache'?'newQStateEmittedSites':'newQStateFullEmittedSites']),[20,20]);}
  else await assert.rejects(verify(f.send,f.read,f.options),/configured (full )?Q0 state cache/);
 }
});

test('counter batch replay requires actual publication and rejects wrong modes',async()=>{for(const failure of['none','missing','wrong']){const f=fixture();f.options.codegenReference={...reference,counterbatch:false};f.options.codegenComparison={...candidate,counterbatch:true};let n=0;f.options.diagnostics=async()=>{const on=n>=2;return{cpuDetails:'stepcheck:'+Number(on)+' wasm-dispatch:2/'+(++n*10)+'calls counterbatch:'+Number(on&&failure!=='wrong')+' batches:'+(on&&failure!=='missing'?n*2:0)};};if(failure==='none'){const r=await verify(f.send,f.read,f.options);assert.ok(r.passed);assert.deepEqual(r.runs.map(r=>r.execution.counterBatches),[0,2]);}else await assert.rejects(verify(f.send,f.read,f.options),/counter publication/);}});

test('counter-only replay preserves existing compiled fusion without requiring a redundant recompile',async()=>{const f=fixture();const ref={...reference,readfusion:true,counterbatch:false};f.options.codegenReference=ref;f.options.codegenComparison={...ref,counterbatch:true};let n=0;f.options.diagnostics=async()=>{const on=n>=2,emitted=n?5:0;return{cpuDetails:'stepcheck:0 wasm-dispatch:2/'+(++n*10)+'calls readfusion:1 emitted:'+emitted+' counterbatch:'+Number(on)+' batches:'+(on?n*2:0)};};const r=await verify(f.send,f.read,f.options);assert.ok(r.passed);assert.deepEqual(r.runs.map(r=>r.execution.newReadFusionEmissions),[5,0]);});

test('lean replay proves specializer telemetry is absent and requires ordinary-mode counter coverage',async()=>{
 for(const failure of ['none','missing','wrong','counting']){
  const f=fixture();f.options.codegenReference={...reference,leandispatch:false,counterbatch:false};f.options.codegenComparison={...reference,leandispatch:true,counterbatch:false};let n=0;
  f.options.diagnostics=async()=>{const i=n++,on=i>=2,base=on?(failure==='counting'?(i+1)*10:20):(failure==='missing'?20:(i+1)*10);return{cpuDetails:'dispatchcounts:off stepcheck:0 wasm-dispatch:2/0calls counterbatch:0 batches:0 leandispatch:'+Number(on&&failure!=='wrong')+' scopes:0 animstatefast:1 compile/run/direct/common/callback/no:1/'+base+'/0/0/0/0'};};
  if(failure==='none'){const r=await verify(f.send,f.read,f.options);assert.ok(r.passed);assert.deepEqual(r.runs.map(r=>r.execution.calls),[0,0]);assert.deepEqual(r.runs.map(r=>r.execution.specializerCounterRuns),[10,0]);}
  else await assert.rejects(verify(f.send,f.read,f.options),/configured (lean )?dispatcher/);
 }
});

test('lean replay retains precompiled GX specialization without demanding unpublished run counters',async()=>{
 const f=fixture(),ref={...reference,gxmatrixfast:true,leandispatch:false};
 f.options.codegenReference=ref;f.options.codegenComparison={...ref,leandispatch:true};f.options.originalCodegen={...ref,leandispatch:true};let n=0;
 f.options.diagnostics=async()=>{const i=n++,lean=i>=2,runs=i===0?100:200;return{cpuDetails:`dispatchcounts:off stepcheck:0 wasm-dispatch:2/0calls leandispatch:${Number(lean)} scopes:0 gxmatrixfast:1 compile/run/fallback/loadpos/setindex:2/${runs}/0/${runs*3/5}/${runs*2/5}`};};
 const r=await verify(f.send,f.read,f.options);assert.ok(r.passed);assert.deepEqual(r.runs.map(run=>run.execution.gxMatrixFastRuns),[100,0]);assert.deepEqual(r.runs.map(run=>run.execution.specializerCounterRuns),[100,0]);
});

test('CP format replay requires unchanged-write opportunities and actual avoided invalidations',async()=>{
 for(const failure of ['none','missing','wrong']){
  const f=fixture();f.options.codegenReference={...reference,cpformat:false};f.options.codegenComparison={...reference,cpformat:true};const send=f.send;let mode=false,n=0;
  f.send=async(action,data)=>{if(action==='codegen')mode=data.cpformat;if(action==='cpFormatStats'){const i=++n;return{enabled:failure==='wrong'?false:mode,writes:i*20,unchanged:i*10,avoided:mode&&failure!=='missing'?i*10:0};}return send(action,data);};
  if(failure==='none'){const r=await verify(f.send,f.read,f.options);assert.ok(r.passed);assert.deepEqual(r.runs.map(r=>r.cpFormat),[{writes:20,unchanged:10,avoided:0},{writes:20,unchanged:10,avoided:10}]);}
  else await assert.rejects(verify(f.send,f.read,f.options),/configured CP format reuse/);
 }
});

test('byte-swap replay rejects missing, stale, or wrong candidate compiler coverage',async()=>{
 for(const failure of ['none','missing','stale','wrong']){
  const f=fixture();f.options.codegenReference={...reference,bswaprotate:false};f.options.codegenComparison={...reference,bswaprotate:true};let n=0;
  f.options.diagnostics=async()=>{const i=n++,on=i>=2;return{cpuDetails:'stepcheck:0 wasm-dispatch:2/'+((i+1)*10)+'calls bswaprotate:'+Number(on&&failure!=='wrong')+' emit-sites:'+(failure==='missing'?0:failure==='stale'?50:(i+1)*20)};};
  if(failure==='none'){const r=await verify(f.send,f.read,f.options);assert.ok(r.passed);assert.deepEqual(r.runs.map(r=>r.execution.newByteSwapSites),[20,20]);}
  else await assert.rejects(verify(f.send,f.read,f.options),/configured byte swaps/);
 }
});

test('chained fusion replay rejects missing, stale, or wrong compiled chain coverage',async()=>{
 for(const failure of ['none','missing','stale','wrong']){
  const f=fixture();f.options.codegenReference={...reference,chainfusion:false};f.options.codegenComparison={...reference,chainfusion:true};let n=0;
  f.options.diagnostics=async()=>{const i=n++,on=i>=2;return{cpuDetails:'stepcheck:0 wasm-dispatch:2/'+((i+1)*10)+'calls chainfusion:'+Number(on&&failure!=='wrong')+' emit-blocks/boundaries:'+(failure==='missing'?0:failure==='stale'?50:(i+1)*20)+'/1000'};};
  if(failure==='none'){const r=await verify(f.send,f.read,f.options);assert.ok(r.passed);assert.deepEqual(r.runs.map(r=>r.execution.newChainFusionBlocks),[20,20]);}
  else await assert.rejects(verify(f.send,f.read,f.options),/configured chained fusion/);
 }
});

test('constant address replay rejects missing, stale, or wrong compilation coverage',async()=>{
 for(const failure of ['none','missing','stale','wrong']){
  const f=fixture();f.options.codegenReference={...reference,constantaddr:false};f.options.codegenComparison={...reference,constantaddr:true};let n=0;
  f.options.diagnostics=async()=>{const i=n++,on=i>=2;return{cpuDetails:'stepcheck:0 wasm-dispatch:2/'+((i+1)*10)+'calls constantaddr:'+Number(on&&failure!=='wrong')+' emit-ram/other:0/'+(failure==='missing'?0:failure==='stale'?50:(i+1)*20)};};
  if(failure==='none'){const r=await verify(f.send,f.read,f.options);assert.ok(r.passed);assert.deepEqual(r.runs.map(r=>r.execution.newConstantAddressSites),[20,20]);}
  else await assert.rejects(verify(f.send,f.read,f.options),/configured constant addresses/);
 }
});

test('call fusion replay rejects missing, stale, or wrong compilation coverage',async()=>{
 for(const failure of ['none','missing','stale','wrong']){
  const f=fixture();f.options.codegenReference={...reference,callfusion:false};f.options.codegenComparison={...reference,callfusion:true};let n=0;
  f.options.diagnostics=async()=>{const i=n++,on=i>=2;return{cpuDetails:'stepcheck:0 wasm-dispatch:2/'+((i+1)*10)+'calls callfusion:'+Number(on&&failure!=='wrong')+' emit-blocks:'+(failure==='missing'?0:failure==='stale'?50:(i+1)*20)};};
  if(failure==='none'){const r=await verify(f.send,f.read,f.options);assert.ok(r.passed);assert.deepEqual(r.runs.map(r=>r.execution.newCallFusionBlocks),[20,20]);}
  else await assert.rejects(verify(f.send,f.read,f.options),/configured call fusion/);
 }
});

test('Melee animation-state replay requires fresh compilation and accounted accelerated calls',async()=>{
 for(const failure of ['none','missing','wrong','unaccounted','nolinear']){
  const f=fixture();f.options.codegenReference={...reference,stepcheck:false,animstatefast:false};f.options.codegenComparison={...reference,stepcheck:false,animstatefast:true};let n=0;
  f.options.diagnostics=async()=>{const i=n++,on=i>=2,after=i>=3;return{cpuDetails:'stepcheck:0 wasm-dispatch:2/'+((i+1)*10)+'calls animstatefast:'+Number(on&&failure!=='wrong')+' compile/run/direct/common/callback/no:'+(after&&failure!=='missing'?1:0)+'/'+(after?100:0)+'/'+(after?99:0)+'/'+(after?80:0)+'/'+(after?60:0)+'/'+(after?(failure==='unaccounted'?10:20):0)+' linear:'+(after&&failure!=='nolinear'?40:0)};};
  if(failure==='none'){
   const r=await verify(f.send,f.read,f.options);assert.ok(r.passed);assert.deepEqual(r.runs.map(r=>r.execution.animStateRuns),[0,100]);assert.equal(r.runs[1].execution.animStateFallbacks,1);assert.equal(r.runs[1].execution.animStateCommon,80);assert.equal(r.runs[1].execution.animStateLinearDirect,40);
  }else await assert.rejects(verify(f.send,f.read,f.options),/animation-state/);
 }
});

test('Melee display-list replay requires fresh compilation, accounted fallbacks, and accelerated calls',async()=>{
 for(const failure of ['none','missing','wrong','unaccounted','all-fallback']){
  const f=fixture();f.options.codegenReference={...reference,displaylistfast:false};f.options.codegenComparison={...reference,displaylistfast:true};let n=0;
  f.options.diagnostics=async()=>{const i=n++,on=i>=2,after=i>=3,runs=after?100:0,fallbacks=after?(failure==='all-fallback'?100:3):0,dirty=after?1:0,flush=after?1:0,memory=after?(failure==='unaccounted'?0:1):0;return{cpuDetails:'stepcheck:0 wasm-dispatch:2/'+((i+1)*10)+'calls displaylistfast:'+Number(on&&failure!=='wrong')+' compile/run/fallback/dirty/flush/memory:'+(after&&failure!=='missing'?1:0)+'/'+runs+'/'+fallbacks+'/'+dirty+'/'+flush+'/'+memory};};
  if(failure==='none'){
   const r=await verify(f.send,f.read,f.options);assert.ok(r.passed);assert.deepEqual(r.runs.map(r=>r.execution.displayListFastRuns),[0,100]);assert.deepEqual(r.runs[1].execution.displayListFastFallbackReasons,{dirty:1,flush:1,memory:1});
  }else await assert.rejects(verify(f.send,f.read,f.options),/display-list/);
 }
});

test('Melee display-list replay counts dirty continuations as accelerated calls',async()=>{
  const f=fixture();f.options.codegenReference={...reference,displaylistfast:false};f.options.codegenComparison={...reference,displaylistfast:true};let n=0;
  f.options.diagnostics=async()=>{const i=n++,on=i>=2,after=i>=3;return{cpuDetails:'stepcheck:0 wasm-dispatch:2/'+((i+1)*10)+'calls displaylistfast:'+Number(on)+' compile/run/fallback/dirty/flush/memory:'+(after?3:0)+'/'+(after?100:0)+'/0/'+(after?80:0)+'/0/0 continuation/suffix:'+(after?80:0)+'/'+(after?20:0)+' flush-continuation/tail:'+(after?60:0)+'/'+(after?60:0)};};
  const r=await verify(f.send,f.read,f.options);assert.ok(r.passed);assert.equal(r.runs[1].execution.displayListFastDirtyCalls,80);assert.equal(r.runs[1].execution.displayListFastContinuations,80);assert.equal(r.runs[1].execution.displayListFastSuffixes,20);assert.equal(r.runs[1].execution.displayListFastFlushContinuations,60);assert.equal(r.runs[1].execution.displayListFastTails,60);assert.deepEqual(r.runs[1].execution.displayListFastFallbackReasons,{dirty:0,flush:0,memory:0});
});

test('unchanged replay control uses the reference config twice; logical event equality never overrides raw failure',async()=>{
 const f=fixture({differ:true}),send=f.send;let eventRead=0;
 f.send=async(action,data)=>{
  if(action==='gpuStartDelay')return{savedTiming:{globalTimer:'12345678901234',idleCycles:'7',nextOrder:String(100+eventRead),ordersValid:true,events:[{time:'12345678901235',order:String(98+eventRead++),name:'VI',userdata:'0'}]}};
  return send(action,data);
 };
 const r=await verify(f.send,f.read,{...f.options,unchangedControl:true,inspectSavedEvents:true});
 assert.equal(r.passed,false);assert.equal(r.fullMachineBytesEqual,false);assert.equal(r.unchangedCodegenControl,true);
 assert.deepEqual(f.calls.filter(c=>c.action==='codegen').map(({action,...c})=>c),[reference,reference,original]);
 assert.equal(r.savedEventComparison.logicalQueueEqual,true);assert.equal(r.savedEventComparison.rawOrderCounterEqual,false);
 assert.equal(r.runs.length,2);assert.ok(r.runs.every(r=>r.savedTiming));
});

test('requested missing scheduler diagnostics fail and still restore original codegen',async()=>{
 const f=fixture();await assert.rejects(verify(f.send,f.read,{...f.options,inspectSavedEvents:true}),/scheduler snapshot unavailable/);
 assert.deepEqual(f.calls.slice(-5).map(c=>c.action),['pause','frameInput','clear','codegen','resume']);
});
