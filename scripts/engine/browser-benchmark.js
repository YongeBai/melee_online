// Sample the game canvas itself: emulation ticks and repeated black frames
// cannot establish a playable framerate. This probe is only used in QA mode.
export function summarizeCoreProfile(before, after, seconds) {
  if (!before?.enabled || !after?.enabled || !(seconds > 0)) return null;
  const stages = {};
  for (const [name, end] of Object.entries(after.stages || {})) {
    const start = before.stages?.[name];
    if (!start) continue;
    const count = end.count - start.count, us = end.totalUs - start.totalUs;
    if (count < 0 || us < 0) throw Error("Core profiler reset during measurement");
    stages[name] = { count, totalMs: us / 1000, meanUs: count ? us / count : 0,
      fractionOfWallTime: us / (seconds * 1e6) };
    if (name.endsWith("Sample1024")) Object.assign(stages[name], {sampleEvery:1024,
      estimatedCalls:count*1024, timing:"Raw sampled time; clock overhead and periodic sampling bias prevent additive time attribution."});
  }
  const { stages: ignored, ...configuration } = after;
  return { configuration, stages, timing: "Inclusive CPU wall time; overlapping scopes and threads must not be summed." };
}

export function summarizeBrowserRun(samples, before, after) {
  if (samples.length < 2) throw Error("Not enough visible frame samples");
  const seconds = (samples.at(-1).at - samples[0].at) / 1000;
  if (!(seconds > 0)) throw Error("Invalid measurement interval");
  let changes = 0, nonblack = 0, lastChange = samples[0].at;
  const gaps = [];
  for (let i = 0; i < samples.length; i++) {
    if (samples[i].nonblack) nonblack++;
    if (i && samples[i].hash !== samples[i - 1].hash) {
      changes++;
      gaps.push(samples[i].at - lastChange);
      lastChange = samples[i].at;
    }
  }
  gaps.push(samples.at(-1).at - lastChange);
  gaps.sort((a, b) => a - b);
  const simulationFps = (after.sceneFrame - before.sceneFrame) / seconds;
  const gameRenderFps = (after.renderFrame - before.renderFrame) / seconds;
  const visibleFps = changes / seconds;
  const minHeight = Math.min(...samples.map(s => s.sourceHeight));
  const minWidth = Math.min(...samples.map(s => s.sourceWidth));
  const sameMatch = before.major === 2 && before.minor === 2 &&
    after.major === 2 && after.minor === 2 && after.sceneFrame > before.sceneFrame;
  const p95GapMs = gaps[Math.floor((gaps.length - 1) * .95)];
  return {
    validGameplay: sameMatch, invalidReason: sameMatch ? undefined : "Match ended or scene changed during measurement",
    seconds, simulationFps, gameRenderFps, visibleFps, p95GapMs,
    maxGapMs: gaps.at(-1), sourceResolution: [minWidth, minHeight],
    nonblackFraction: nonblack / samples.length,
    passed: sameMatch && seconds >= 29.5 && simulationFps >= 59.5 && simulationFps <= 60.5 &&
      gameRenderFps >= 59.5 && gameRenderFps <= 60.5 &&
      visibleFps >= 59.5 && minWidth >= 960 && minHeight >= 720 &&
      nonblack / samples.length >= .99 && p95GapMs <= 20,
  };
}

export async function measureBrowserGameplay(host, seconds, inspect, {sampleWidth = 32} = {}) {
  if (document.hidden) throw Error("Keep the game tab visible during measurement");
  if (![32, 64, 96, 128].includes(sampleWidth)) throw Error("Unsupported image probe size");
  const sampleHeight = sampleWidth * 3 / 4;
  const probe = new OffscreenCanvas(sampleWidth, sampleHeight);
  const ctx = probe.getContext("2d", { willReadFrequently: true });
  const before = await inspect();
  const deliveryBefore = browserDeliveryCounter(host);
  const samples = [], started = performance.now();
  host.adapter.bitmapTiming?.begin();
  try {
  await new Promise((resolve, reject) => {
    const sample = () => {
      try {
        if (document.hidden) throw Error("Game tab became hidden during measurement");
        const probeStarted=host.adapter.bitmapTiming?.active ? performance.now() : 0;
        ctx.drawImage(host.canvas, 0, 0, sampleWidth, sampleHeight);
        const probeDrawn=probeStarted ? performance.now() : 0;
        const pixels = ctx.getImageData(0, 0, sampleWidth, sampleHeight).data;
        const probeRead=probeStarted ? performance.now() : 0;
        let hash = 2166136261, nonblack = false;
        for (let i = 0; i < pixels.length; i += 4) {
          for (let channel = 0; channel < 3; channel++) {
            const value = pixels[i + channel];
            if (value > 8) nonblack = true;
            hash = Math.imul(hash ^ value, 16777619);
          }
        }
        host.adapter.bitmapTiming?.sample(performance.timeOrigin+performance.now(),browserDeliveryCounter(host),hash>>>0,probeDrawn-probeStarted,probeRead-probeDrawn);
        samples.push({ at: performance.now(), hash: hash >>> 0, nonblack,
          sourceWidth: host.adapter.presentedWidth ?? host.adapter.width,
          sourceHeight: host.adapter.presentedHeight ?? host.adapter.height });
        if (performance.now() - started >= seconds * 1000) resolve();
        else requestAnimationFrame(sample);
      } catch (error) { reject(error); }
    };
    requestAnimationFrame(sample);
  });
  const result = summarizeBrowserRun(samples, before, await inspect());
  // Counts are diagnostics only; they cannot override the visible-image gate.
  result.imageProbe = [sampleWidth, sampleHeight];
  result.wallStartMs = performance.timeOrigin + samples[0].at;
  result.wallEndMs = performance.timeOrigin + samples.at(-1).at;
  result.canvasSubmissionFps = (browserDeliveryCounter(host) - deliveryBefore) / result.seconds;
  result.sampleCallbackFps = (samples.length - 1) / result.seconds;
  if(host.adapter.bitmapTiming){result.presentationTiming=host.adapter.bitmapTiming.finish();result.diagnosticOnly=true;result.passed=false;}
  return result;
  } finally {if(host.adapter.bitmapTiming?.active)host.adapter.bitmapTiming.finish();}
}

// Diagnostic control run: quantify whether synchronous pixel inspection itself
// limits emulation. Delivery counters do not prove distinct rendered images.
export function browserDeliveryCounter(host) {
  return host.oglSabEnabled ? host.oglPixelPresenter?.framesDrawn ?? host.oglSabFramesDrawn ?? 0 : host.adapter.detachedOglFramesDrawn || 0;
}
export async function measureBrowserDelivery(host, seconds, inspect) {
  if (document.hidden) throw Error("Keep the game tab visible during measurement");
  const pageState=()=>({visibility:document.visibilityState,focused:document.hasFocus()});
  const pageStart=pageState(),pageEvents=[],lifecycleStart=performance.now();
  const lifecycle=event=>{if(pageEvents.length<100)pageEvents.push({type:event.type,atMs:performance.now()-lifecycleStart,...pageState()});};
  const before = await inspect(), started = performance.now();
  let lastRaf=started,maxRafGapMs=0;
  document.addEventListener('visibilitychange',lifecycle);window.addEventListener('focus',lifecycle);window.addEventListener('blur',lifecycle);
  const firstCount = browserDeliveryCounter(host);
  let lastCount = firstCount, rafCount = 0, changedTicks = 0;
  host.adapter.bitmapTiming?.begin();
  try {
  await new Promise((resolve, reject) => {
    function sample() {
      if (document.hidden) return reject(Error("Game tab became hidden during measurement"));
      const at=performance.now();maxRafGapMs=Math.max(maxRafGapMs,at-lastRaf);lastRaf=at;
      rafCount++;
      const count = browserDeliveryCounter(host);
      host.adapter.bitmapTiming?.sample(performance.timeOrigin+performance.now(),count);
      if (count !== lastCount) changedTicks++;
      lastCount = count;
      if (performance.now() - started >= seconds * 1000) resolve();
      else requestAnimationFrame(sample);
    }
    requestAnimationFrame(sample);
  });
  const elapsed = (performance.now() - started) / 1000;
  const after = await inspect();
  return { seconds: elapsed, simulationFps: (after.sceneFrame - before.sceneFrame) / elapsed,
    maxRafGapMs,pageLifecycle:{start:pageStart,end:pageState(),events:pageEvents},
    deliveryFps: (lastCount - firstCount) / elapsed, rafFps: rafCount / elapsed,
    changedPresentationTicksFps: changedTicks / elapsed,
    sourceResolution: host.oglSabEnabled ? [host.oglSabWidth, host.oglSabHeight] :
      [host.adapter.presentedWidth, host.adapter.presentedHeight],
    presentationTiming:host.adapter.bitmapTiming?.finish(), diagnosticOnly: true, passed: false };
  } finally {document.removeEventListener('visibilitychange',lifecycle);window.removeEventListener('focus',lifecycle);window.removeEventListener('blur',lifecycle);if(host.adapter.bitmapTiming?.active)host.adapter.bitmapTiming.finish();}
}

// Reuse one complete machine state so compilation warm-up does not get
// confused with a different CPU opponent sequence. Run zero warms caches.
export async function measureBrowserRepeated(host, seconds, inspect, {
  runs = 3, measure = measureBrowserGameplay, onProgress = () => {},
} = {}) {
  if (!Number.isInteger(runs) || runs < 2 || runs > 8) throw Error('Expected 2–8 measured repeats');
  const command = (action, data = {}) => host.adapter.request('browserRollback', {action, ...data});
  let captured = false;
  const results = [];
  try {
    await command('pause');
    await command('step');
    await command('capture', {slot: 5});
    captured = true;
    for (let run = 0; run <= runs; run++) {
      onProgress(run === 0 ? 'Warming identical checkpoint…' : `Measuring repeat ${run}/${runs}…`);
      await command('pause');
      await command('restore', {slot: 5});
      // Fixed emulated-frame settling interval, outside the measured window.
      for (let frame = 0; frame < 120; frame++) await command('step');
      const before = (await host.adapter.request('rendererDiagnostics', {})).coreProfile;
      await host.adapter.request('start', {});
      const result = await measure(host, seconds, inspect);
      const after = (await host.adapter.request('rendererDiagnostics', {})).coreProfile;
      result.coreProfile = summarizeCoreProfile(before, after, result.seconds);
      result.warmup = run === 0;
      results.push(result);
    }
    return {kind: 'same-checkpoint-warmed-repeats', passed: results.slice(1).every(r => r.passed),
      warmup: results[0], runs: results.slice(1)};
  } finally {
    await command('pause');
    try { if (captured) await command('release', {slot: 5}); }
    finally { await host.adapter.request('start', {}); }
  }
}

export function browserCodegenConfig(host) {
 const mask=host.cachedInterpreterDisableMask>>>0;
 return {gxmatrixfast:host.gxMatrixFast===true,displaylistfast:host.displayListFast===true,animstatefast:host.meleeAnimStateFast===true,animcallbackfast:host.meleeAnimCallbackFast===true,matrixfast:host.matrixFast===true,constantaddr:host.constantAddress===true,callfusion:host.callFusion===true,chainfusion:host.chainFusion===true,bswaprotate:host.byteSwapRotate===true,qstatefull:host.qStateFull===true,qstatecache:host.qStateCache===true,cpformat:host.cpFormatReuse===true,leandispatch:host.leanDispatch===true,counterbatch:host.dispatchCounterBatch===true,fusionredispatch:host.fusionRedispatch===true,readfusion:host.readOnlyFusion===true,stepcheck:host.dispatchStepCheck===true,fpuguardwide:host.fpuGuardWide===true,branchfusion:host.conditionalFusion===true,fpuguard:host.fpuGuardHoist===true,blockmerge:!(mask&(1<<17)),regcache:!(mask&(1<<20)),fastmem:!!(mask&(1<<23)),integerfifo:!!(mask&(1<<16)),singleprefix:!!(mask&(1<<18)),fprcache:!!(mask&(1<<19)),compactgpr:host.compactGprLocals===true,pssimd:host.pairedSimd===true,psmemsimd:host.pairedMemorySimd===true,vectorfpr:host.vectorFprCache===true,psqhoist:host.pairedMemoryHoist===true,widemap:host.wideBlockMap===true,stateconst:host.constantStateBase===true,msrcache:host.blockMsrCache===true,fifocopy:host.fifoCopy===true,fifobatch:host.fifoBatch===true,frsqrtefast:host.frsqrteFast===true};
}

export function parseBlockMapCounters(details) {
 const match=/map-mask:(\d+) slow-empty\/collision:(\d+)\/(\d+)/.exec(details||'');
 if(!match)throw Error('Block-map counters unavailable');
 return {mask:Number(match[1]),empty:Number(match[2]),collision:Number(match[3])};
}

export async function compareBrowserCodegen(host, seconds, inspect, {onProgress=()=>{}, onResult=()=>{}, measure=measureBrowserGameplay, feature="integerfifo", frameInput=false, retainedFpuGuard=false, retainedBranchFusion=false,retainedReadFusion=false}={}) {
  const command=(action,data={})=>host.adapter.request('browserRollback',{action,...data});
  if (!["gxmatrixfast","displaylistfast","animstatefast","animcallbackfast","matrixfast","constantaddr","callfusion","chainfusion","bswaprotate","qstatefull","qstatecache","cpformat","leandispatch","counterbatch","fusionredispatch","readbranchfusionfast","readbranchfusion","readfusion","stepcheck","fpuguardwide","idlechecks","branchfusion","fpuguard","blockmerge","integerfifo","singleprefix","fprcache","regcache","compactgpr","pssimd","psmemsimd","vectorfpr","vectorfpronly","vectorfprarith","psqhoist","widemap","stateconst","msrcache","fifocopy","fifobatch","frsqrtefast"].includes(feature)) throw Error("Unsupported codegen comparison");
  const original=browserCodegenConfig(host);
  const common={...original,...(retainedFpuGuard?{fpuguard:true}:{}),...(retainedBranchFusion?{branchfusion:true}:{}),...(retainedReadFusion?{readfusion:true}:{})};
  const originalIdleChecks=!!((host.cachedInterpreterDisableMask>>>0)&0x80000000);
  const idleCounters=async()=>{const details=(await host.adapter.request("rendererDiagnostics",{})).cpuDetails;const match=/fastidlepoll[^|]*iters:(\d+) hoisted:(\d+)/.exec(details||"");if(!match)throw Error("Idle guard counters unavailable");return {iterations:Number(match[1]),hoisted:Number(match[2])};};
  const results=[]; let captured=false;
  try {
    await command('pause');
    if(retainedFpuGuard||retainedBranchFusion||retainedReadFusion)await command('codegen',common);
    await command('step');
    await command('capture',{slot:5}); captured=true;
    for (const [index,enabled] of [false,true,true,false].entries()) {
      await command('pause');
      const vectorFeature=feature.startsWith('vectorfpr');
      const config=feature==='readbranchfusionfast' ? {...common,readfusion:enabled,branchfusion:enabled,fusionredispatch:enabled} : feature==='readbranchfusion' ? {...common,readfusion:enabled,branchfusion:enabled} : vectorFeature ? {...common,vectorfpr:enabled,pssimd:enabled&&feature!=='vectorfpronly',psmemsimd:enabled&&feature==='vectorfpr'} : {...common,[feature]:enabled};
      await command('codegen',config);
      if(feature==='idlechecks'&&(await command('idleBatchChecks',{value:enabled})).enabled!==enabled)throw Error('Idle guard setting did not apply');
      for(const warmup of [true,false]) {
        const label=`${feature} ${enabled?'on':'off'} ${warmup?'warmup':'measurement'} ${index+1}/4`;
        const setupTiming={};const timed=async(phase,run)=>{onProgress(label+': '+phase+'…');const start=performance.now();const value=await run();setupTiming[phase]=performance.now()-start;return value;};
        await timed('pause',()=>command('pause'));await timed('restore',()=>command('restore',{slot:5}));
        await timed('settle 120 frames',async()=>{for(let frame=0;frame<120;frame++)await command('step');});
        if(frameInput)await timed('enable controller input',()=>command('frameInput',{enabled:true}));
        const cpBefore=feature==='cpformat'?await command('cpFormatStats'):null;
        await timed('resume',()=>host.adapter.request('start',{}));
        const idleBefore=feature==='idlechecks'?await idleCounters():null;
        const mapBefore=feature==='widemap' ? parseBlockMapCounters((await host.adapter.request('rendererDiagnostics',{})).cpuDetails) : null;
        const result=await measure(host,seconds,inspect,{onPhase:phase=>onProgress(label+': '+phase+'…')});result.setupTimingMs=setupTiming;
        if(cpBefore){
          await command('pause');const after=await command('cpFormatStats');
          const writes=after.writes-cpBefore.writes,unchanged=after.unchanged-cpBefore.unchanged,avoided=after.avoided-cpBefore.avoided;
          if(cpBefore.enabled!==enabled||after.enabled!==enabled||writes<=0||unchanged<=0||unchanged>writes||(enabled?avoided!==unchanged:avoided!==0))throw Error('CP format opportunity counters did not match the configured mode');
          result.cpFormat={writes,unchanged,avoided,interval:'Paused diagnostic boundaries bracket measurement; includes small start/stop overhead.'};
        }
        if(frameInput){
          await command('frameInput',{enabled:false});
          const stats=await command('frameInputStats');
          const exercised=stats.valid&&stats.inputChanges?.every(n=>n>=8)&&stats.observedActions?.every(a=>a.length>=3);
          result.controllerStress={...stats,kind:'two ordinary controller tracks sampled on native logic frames',notHumanPlay:true,exercisedBothPlayers:!!exercised};
          if(!exercised){result.passed=false;result.invalidWorkload='Frame-based controller workload was invalid or inactive';}
        }
        if(idleBefore){
          const after=await idleCounters();const iterations=after.iterations-idleBefore.iterations,hoisted=after.hoisted-idleBefore.hoisted;
          result.idleGuardCounters={iterations,hoisted,interval:'Diagnostic reads bracket the image measurement, including small RPC overhead.'};
          if(iterations<=0 || hoisted<0 || (enabled ? hoisted<=0 : hoisted!==0))throw Error('Idle guard execution did not match the configured mode');
        }
        if(mapBefore){
          const mapAfter=parseBlockMapCounters((await host.adapter.request('rendererDiagnostics',{})).cpuDetails);
          if(mapBefore.mask!==(enabled?1048575:65535)||mapAfter.mask!==mapBefore.mask||mapAfter.empty<mapBefore.empty||mapAfter.collision<mapBefore.collision)throw Error('Block-map configuration or counter changed during measurement');
          result.blockMap={mask:mapAfter.mask,emptyMisses:mapAfter.empty-mapBefore.empty,collisionMisses:mapAfter.collision-mapBefore.collision,interval:'Counter reads bracket image measurement; includes small RPC overhead, not exact per-frame CPU cost.'};
        }
        if(feature==='constantaddr'){
          const details=(await host.adapter.request('rendererDiagnostics',{})).cpuDetails||'';
          const match=/constantaddr:(\d+) emit-ram\/other:(\d+)\/(\d+)/.exec(details);
          if(!match||Number(match[1])!==Number(enabled)||(enabled&&Number(match[2])+Number(match[3])<=0))throw Error('Constant address coverage unavailable');
          result.constantAddressCoverage={enabled,ramSites:Number(match[2]),otherSites:Number(match[3]),scope:'Cumulative compilation coverage, not runtime share.'};
        }
        if(feature==='callfusion'){
          const details=(await host.adapter.request('rendererDiagnostics',{})).cpuDetails||'';
          const match=/callfusion:(\d+) emit-blocks:(\d+)/.exec(details);
          if(!match||Number(match[1])!==Number(enabled)||(enabled&&Number(match[2])<=0))throw Error('Call fusion coverage unavailable');
          result.callFusionCoverage={enabled,emittedBlocks:Number(match[2]),scope:'Cumulative compilation coverage, not runtime share.'};
        }
        if(feature==='matrixfast'){
          const details=(await host.adapter.request('rendererDiagnostics',{})).cpuDetails||'';
          const match=/matrixfast:(\d+) compile\/run\/fallback:(\d+)\/(\d+)\/(\d+)/.exec(details);
          const reasons=/fallback-reasons:(\d+)\/(\d+)\/(\d+)\/(\d+)\/(\d+)\/(\d+)/.exec(details);
          const runs=Number(match?.[3]||0),fallbacks=Number(match?.[4]||0);
          const fallbackReasons=['fp','stack','a','b','out','unit'].reduce((value,name,index)=>{value[name]=Number(reasons?.[index+1]||0);return value;},{});
          const accountedFallbacks=Object.values(fallbackReasons).reduce((total,count)=>total+count,0);
          const nonFpFallbacks=accountedFallbacks-fallbackReasons.fp;
          if(!match||Number(match[1])!==Number(enabled)||(enabled&&(Number(match[2])<=0||runs<=0||fallbacks!==accountedFallbacks||nonFpFallbacks!==0||fallbacks>Math.max(1,Math.ceil(runs/1000)))))throw Error('Melee matrix fast-path coverage unavailable');
          result.matrixFastCoverage={enabled,compiledBlocks:Number(match[2]),runs,fallbacks,fallbackReasons,scope:'Cumulative exact-function coverage; run count is not CPU time.'};
        }
        if(feature==='animstatefast'){
          const details=(await host.adapter.request('rendererDiagnostics',{})).cpuDetails||'';
          const match=/animstatefast:(\d+) compile\/run\/direct\/common\/callback\/no:(\d+)\/(\d+)\/(\d+)\/(\d+)\/(\d+)\/(\d+)/.exec(details);
          if(!match||Number(match[1])!==Number(enabled)||(enabled&&(Number(match[2])<=0||Number(match[3])<=0)))throw Error('Melee animation-state coverage unavailable');
          result.animStateCoverage={enabled,compiledBlocks:Number(match[2]),runs:Number(match[3]),direct:Number(match[4]),common:Number(match[5]),callback:Number(match[6]),noCallback:Number(match[7]),scope:'Cumulative exact-function coverage; guarded fallbacks execute the original guest function.'};
        }
        if(feature==='gxmatrixfast'){
          const details=(await host.adapter.request('rendererDiagnostics',{})).cpuDetails||'';
          const match=/gxmatrixfast:(\d+) compile\/run\/fallback\/loadpos\/setindex:(\d+)\/(\d+)\/(\d+)\/(\d+)\/(\d+)/.exec(details);
          const compiled=Number(match?.[2]||0),runs=Number(match?.[3]||0),fallbacks=Number(match?.[4]||0);
          const loadPos=Number(match?.[5]||0),setIndex=Number(match?.[6]||0);
          if(!match||Number(match[1])!==Number(enabled)||(enabled&&(compiled<2||runs<=0||loadPos<=0||setIndex<=0||fallbacks>Math.max(1,Math.ceil(runs/1000)))))
            throw Error('Melee GX matrix fast-path coverage unavailable');
          result.gxMatrixFastCoverage={enabled,compiledBlocks:compiled,runs,fallbacks,loadPos,setIndex,
            scope:'Cumulative exact-function coverage; guarded fallbacks execute the original guest functions.'};
        }
        if(feature==='displaylistfast'){
          const details=(await host.adapter.request('rendererDiagnostics',{})).cpuDetails||'';
          const primary=/displaylistfast:(\d+) compile\/run\/fallback\/dirty\/flush\/memory:(\d+)\/(\d+)\/(\d+)\/(\d+)\/(\d+)\/(\d+)/.exec(details);
          const continuation=/continuation\/suffix:(\d+)\/(\d+) flush-continuation\/tail:(\d+)\/(\d+)/.exec(details);
          const compiled=Number(primary?.[2]||0),runs=Number(primary?.[3]||0),fallbacks=Number(primary?.[4]||0);
          const dirty=Number(primary?.[5]||0),flush=Number(primary?.[6]||0),memory=Number(primary?.[7]||0);
          const continuations=Number(continuation?.[1]||0),suffixes=Number(continuation?.[2]||0);
          const flushContinuations=Number(continuation?.[3]||0),tails=Number(continuation?.[4]||0);
          const successful=runs-fallbacks;
          if(!primary||!continuation||Number(primary[1])!==Number(enabled)||
              (enabled&&(compiled<=0||runs<=0||fallbacks!==flush+memory||successful<=0||
                dirty<=0||continuations<=0||suffixes+flushContinuations<=0||tails<=0)))
            throw Error('Melee display-list fast-path coverage unavailable');
          result.displayListFastCoverage={enabled,compiledBlocks:compiled,runs,successful,fallbacks,
            fallbackReasons:{flush,memory},dirtyCalls:dirty,continuations,suffixes,flushContinuations,tails,
            scope:'Cumulative exact-wrapper coverage; dirty GX work still executes in the original guest handler.'};
        }
        if(feature==='chainfusion'){
          const details=(await host.adapter.request('rendererDiagnostics',{})).cpuDetails||'';
          const match=/chainfusion:(\d+) emit-blocks\/boundaries:(\d+)\/(\d+)/.exec(details);
          if(!match||Number(match[1])!==Number(enabled)||(enabled&&Number(match[2])<=0))throw Error('Chained fusion coverage unavailable');
          result.chainFusionCoverage={enabled,emittedBlocks:Number(match[2]),emittedBoundaries:Number(match[3]),scope:'Cumulative compile coverage of three or more original blocks, not runtime share.'};
        }
        if(feature==='bswaprotate'){
          const details=(await host.adapter.request('rendererDiagnostics',{})).cpuDetails||'';
          const match=/bswaprotate:(\d+) emit-sites:(\d+)/.exec(details);
          if(!match||Number(match[1])!==Number(enabled)||(enabled&&Number(match[2])<=0))throw Error('Byte-swap codegen coverage unavailable');
          result.byteSwapCoverage={enabled,emittedSites:Number(match[2]),scope:'Cumulative compile coverage, not runtime execution share.'};
        }
        if(feature==='qstatecache'||feature==='qstatefull'){
          const details=(await host.adapter.request('rendererDiagnostics',{})).cpuDetails||'';
          const match=new RegExp(feature+':(\\d+) emit-blocks/sites:(\\d+)/(\\d+)').exec(details);
          if(!match||Number(match[1])!==Number(enabled)||(enabled&&Number(match[3])<=0))throw Error('Q0 state-cache emitted coverage unavailable or configuration mismatched');
          result.qStateCoverage={enabled,emittedBlocks:Number(match[2]),emittedSites:Number(match[3]),scope:'Cumulative compiled coverage; not an execution count or CPU cost share.'};
        }
        Object.assign(result,config,{enabled,warmup});
        results.push(result); onResult({kind:'same-checkpoint-codegen-abba',feature,passed:false,runs:results});
      }
    }
    const inputConsistency=frameInput?compareFrameInputDigests(results):undefined;
    return {kind:'same-checkpoint-codegen-abba',feature,passed:results.filter(r=>!r.warmup&&r.enabled).every(r=>r.passed)&&(!frameInput||inputConsistency.passed),runs:results,...(frameInput?{inputConsistency}:{})};
  }finally {
    if(frameInput)await command('frameInput',{enabled:false});
    await command('pause');
    try{
      if(captured)await command('release',{slot:5});
      if(feature==='idlechecks')await command('idleBatchChecks',{value:originalIdleChecks});
      await command('codegen',original);
    }finally{await host.adapter.request('start',{});}
  }
}

// Wall-clock residency sampler. Reads the existing diagnostic PC export from
// the core host worker while its CPU pthread keeps running. PC denotes the last
// committed block/instruction, not an exact native stack or additive CPU cost.
export async function sampleBrowserCpuLocations(host, seconds) {
  const started=performance.now(), counts=new Map(); let samples=0;
  while(performance.now()-started<seconds*1000) {
    const sample=await host.adapter.request("validationReadCoreProgress",{});
    const pc=sample.ppcPc>>>0;
    if(pc>=0x80000000 && pc<0x81800000){counts.set(pc,(counts.get(pc)||0)+1);samples++;}
    await new Promise(resolve=>setTimeout(resolve,12+Math.random()*16));
  }
  return {kind:"asynchronous-pc-wall-residency",seconds:(performance.now()-started)/1000,samples,
    warning:"Last committed guest PC; includes host waits. Not exact instruction timing or a performance acceptance run.",
    locations:[...counts].sort((a,b)=>b[1]-a[1]).map(([pc,count])=>({pc:"0x"+pc.toString(16),count,fraction:count/samples}))};
}

// Compare rendering work at one fixed simulation checkpoint. Resolution
// changes are cosmetic; neither run changes speed, CPU clock or frame count.
export async function compareBrowserRenderScale(host, seconds, inspect, {onProgress=()=>{},onResult=()=>{},measure=measureBrowserGameplay}={}) {
  const command=(action,data={})=>host.adapter.request('browserRollback',{action,...data});
  const results=[];let captured=false,original;
  try {
    await command('pause');await command('step');
    original=(await command('renderScale')).percent;
    if(![150,200].includes(original))throw Error('Render-scale comparison requires 720p');
    await command('capture',{slot:5});captured=true;
    for(const [index,percent] of [200,150,150,200].entries()) {
      await command('pause');await command('renderScale',{percent});
      for(const warmup of [true,false]) {
        onProgress('Render scale '+percent+'% '+(warmup?'warmup':'measurement')+' '+(index+1)+'/4…');
        await command('pause');await command('restore',{slot:5});
        for(let frame=0;frame<120;frame++)await command('step');
        const profile=(await host.adapter.request('rendererDiagnostics',{})).coreProfile;
        const expected=[640*percent/100,528*percent/100];
        if(profile?.efbWidth!==expected[0]||profile?.efbHeight!==expected[1])throw Error('Internal render size did not update: '+JSON.stringify(profile));
        await host.adapter.request('start',{});
        const result=await measure(host,seconds,inspect);
        Object.assign(result,{percent,warmup,internalResolution:expected});
        results.push(result);onResult({kind:'same-checkpoint-render-scale-abba',passed:false,runs:results});
      }
    }
    return {kind:'same-checkpoint-render-scale-abba',passed:results.filter(r=>!r.warmup&&r.percent===150).every(r=>r.passed),runs:results};
  }finally {
    await command('pause');
    try {if(captured)await command('release',{slot:5});if(original)await command('renderScale',{percent:original});}
    finally{await host.adapter.request('start',{});}
  }
}

// Image inspection versus delivery-only control, with identical guest state.
export async function compareBrowserProbe(host,seconds,inspect,{onProgress=()=>{},onResult=()=>{},measureImage=measureBrowserGameplay,measureDelivery=measureBrowserDelivery,measureAsync=measureBrowserGameplayAsync,mode="overhead",frameInput=false}={}){
  const command=(action,data={})=>host.adapter.request('browserRollback',{action,...data});
  const runs=[];let captured=false;
  if(!['overhead','async','async-overhead','context','harvest','worker'].includes(mode))throw Error('Unknown probe comparison');
  const order=mode==='worker'?['async-raf','async-worker','async-worker','async-raf']:mode==='harvest'?['async-raf','async-task','async-task','async-raf']:mode==='context'?['async-fresh','async-reuse','async-reuse','async-fresh']:mode==='async'?['sync','async','async','sync']:mode==='async-overhead'?['async','delivery','delivery','async']:['image','delivery','delivery','image'];
  try{
    await command('pause');await command('step');await command('capture',{slot:5});captured=true;
    for(const [index,probe]of order.entries())for(const warmup of [true,false]){
      onProgress('Probe '+probe+' '+(warmup?'warmup':'measurement')+' '+(index+1)+'/4…');
      const setupTimingMs={};
      const timed=async(name,fn)=>{const t=performance.now();const r=await fn();setupTimingMs[name]=performance.now()-t;return r;};
      await timed('pause',()=>command('pause'));await timed('restore',()=>command('restore',{slot:5}));
      await timed('settle 120 frames',async()=>{for(let frame=0;frame<120;frame++)await command('step');});
      const measure=probe==='delivery'?measureDelivery:probe==='async'?measureAsync:probe.startsWith('async-')?(h,s,i,o={})=>measureAsync(h,s,i,{...o,reuseProbe:probe==='async-reuse',harvestInTask:probe==='async-task',workerProbe:probe==='async-worker'}):measureImage;
      let result;
      try{
        if(frameInput)result=await measureBrowserNativeInput(host,seconds,inspect,{measure});
        else{await host.adapter.request('start',{});result=await measure(host,seconds,inspect);}
      }catch(error){onResult({kind:'same-checkpoint-probe-abba',diagnosticOnly:true,passed:false,runs,
        failure:{probe,warmup,index,message:error.message,imageProbe:error.imageProbeFailure,setupTimingMs}});throw error;}
      runs.push({...result,probe,warmup,setupTimingMs});
      onResult({kind:'same-checkpoint-probe-abba',diagnosticOnly:true,passed:false,runs});
    }
    const inputConsistency=frameInput?compareFrameInputDigests(runs):undefined;
    return {kind:'same-checkpoint-probe-abba',diagnosticOnly:true,passed:false,runs,...(frameInput?{inputConsistency}:{})};
  }finally{
    if(frameInput)await command('frameInput',{enabled:false});
    host.adapter.bitmapTiming?.finish();
    await command('pause');try{if(captured)await command('release',{slot:5});}finally{await host.adapter.request('start',{});}
  }
}

// Same visible-image gate, with asynchronously harvested pixels timestamped
// when the canvas was sampled. Every sample must return; overflow is an error.
const reusableImageProbes=new WeakMap();
export async function measureBrowserGameplayAsync(host,seconds,inspect,{sampleWidth=32,onPhase=()=>{},reuseProbe=false,harvestInTask=false,workerProbe=false}={}) {
  if(document.hidden)throw Error('Keep the game tab visible during measurement');
  if(![32,64,96,128].includes(sampleWidth))throw Error('Unsupported image probe size');
  const {AsyncCanvasImageProbe,ImageHarvestTask}=await import('./browser-async-image-probe.js');
  if(workerProbe&&(reuseProbe||harvestInTask))throw Error('Worker image probe requires its own fresh context and worker harvesting');
  const Probe=workerProbe?(await import('./browser-worker-image-probe.js')).WorkerCanvasImageProbe:AsyncCanvasImageProbe;
  const {timingDistribution}=await import('./browser-presentation-timing.js');
  onPhase("creating image verifier");
  let probe=reuseProbe?reusableImageProbes.get(host):null;
  if(probe && probe.width!==sampleWidth){probe.dispose();reusableImageProbes.delete(host);probe=null;}
  if(probe)probe.reset();else{probe=new Probe({width:sampleWidth,height:sampleWidth*3/4});if(reuseProbe)reusableImageProbes.set(host,probe);}
  if(workerProbe){try{await probe.ready;}catch(error){probe.dispose();throw error;}}
  const samples=[];let afterPromise,presentationTiming,submissionEnd,raf,harvester,completed=false;
  let phase='initial counters',beforeSnapshot,afterSnapshot,captureStarted=0,captureEnded=0;
  const pageState=()=>({visibility:document.visibilityState,focused:document.hasFocus()});
  const {summarizeQueueInterval}=await import("./browser-frame-queue.js");
  const queueSnapshot=()=>{const stats=host.adapter.presentationQueue?.stats;return stats?{...stats,ageHistogram:[...stats.ageHistogram]}:null;};
  let queueEnd;
  const pageStart=pageState(),pageEvents=[],lifecycleStart=performance.now();
  const lifecycle=event=>{if(pageEvents.length<100)pageEvents.push({type:event.type,atMs:performance.now()-lifecycleStart,...pageState()});};
  document.addEventListener('visibilitychange',lifecycle);window.addEventListener('focus',lifecycle);window.addEventListener('blur',lifecycle);
  try {
    onPhase("reading initial counters");
    const before=await inspect(),submissionStart=browserDeliveryCounter(host),started=performance.now();beforeSnapshot=before;captureStarted=started;phase="capture";
    onPhase("capturing visible frames");
    const queueStart=queueSnapshot();
    host.adapter.bitmapTiming?.begin();
    await new Promise((resolve,reject)=>{
      if(harvestInTask)harvester=new ImageHarvestTask(probe,ready=>samples.push(...ready),reject);
      const sample=()=>{try{
        if(document.hidden)throw Error('Game tab became hidden during measurement');
        if(!harvester)samples.push(...probe.poll());
        const at=performance.now(),count=browserDeliveryCounter(host);
        probe.capture(host.canvas,{at,sourceWidth:host.adapter.presentedWidth??host.adapter.width,sourceHeight:host.adapter.presentedHeight??host.adapter.height});
        harvester?.request();
        host.adapter.bitmapTiming?.sample(performance.timeOrigin+at,count);
        if(performance.now()-started>=seconds*1000){
          captureEnded=performance.now();submissionEnd=browserDeliveryCounter(host);queueEnd=queueSnapshot();afterPromise=inspect();presentationTiming=host.adapter.bitmapTiming?.finish();resolve();
        }else raf=requestAnimationFrame(sample);
      }catch(error){reject(error);}};
      raf=requestAnimationFrame(sample);
    });
    harvester?.stop();
    // Snapshot simulation counters at the end of capture, before waiting for
    // remaining GPU results; drain time must not inflate simulation FPS.
    onPhase("reading final counters");
    phase="final counters";const after=await afterPromise,drainStarted=performance.now();afterSnapshot=after;phase="drain";
    onPhase("draining image samples");
    while(probe.pending.length){
      samples.push(...probe.poll());if(!probe.pending.length)break;
      if(performance.now()-drainStarted>2000)throw Error('Asynchronous image verification timed out');
      await new Promise(resolve=>{raf=requestAnimationFrame(resolve);});
    }
    if(samples.length!==probe.captureCount)throw Error('Image samples were lost');
    const result=summarizeBrowserRun(samples,before,after);
    if(queueStart&&queueEnd)result.queue={capacity:host.adapter.presentationQueue.capacity,rateLimited:host.adapter.presentationQueue.rateLimited,...summarizeQueueInterval(queueStart,queueEnd)};
    result.pageLifecycle={start:pageStart,end:pageState(),events:pageEvents};
    Object.assign(result,{imageProbe:[sampleWidth,sampleWidth*3/4],imageProbeMethod:workerProbe?'canvas-snapshot-worker-webgl2-pbo-fence':'webgl2-pbo-fence',imageContextReuse:reuseProbe,imageHarvest:workerProbe?'worker':harvestInTask?'task':'raf',
      wallStartMs:performance.timeOrigin+samples[0].at,wallEndMs:performance.timeOrigin+samples.at(-1).at,
      canvasSubmissionFps:(submissionEnd-submissionStart)/result.seconds,sampleCallbackFps:(samples.length-1)/result.seconds,
      asyncImageProbe:{samples:samples.length,maxPending:probe.maxPending,...(workerProbe?{snapshotMs:timingDistribution(samples.map(s=>s.snapshotMs))}:{}),enqueueMs:timingDistribution(samples.map(s=>s.enqueueMs)),harvestMs:timingDistribution(samples.map(s=>s.readMs)),completionDelayMs:timingDistribution(samples.map(s=>s.completionDelayMs))}});
    if(presentationTiming){result.presentationTiming=presentationTiming;result.diagnosticOnly=true;result.passed=false;}
    completed=true;return result;
  }catch(error){
    const times=samples.map(s=>s.at),gaps=times.slice(1).map((t,i)=>t-times[i]);
    error.imageProbeFailure={phase,reuseProbe,...probe.diagnostics(),harvested:samples.length,
      captureSeconds:captureEnded?(captureEnded-captureStarted)/1000:null,
      simulationFrames:afterSnapshot&&beforeSnapshot?afterSnapshot.sceneFrame-beforeSnapshot.sceneFrame:null,
      lastHarvestedAt:times.at(-1),maxHarvestedSampleGapMs:gaps.length?Math.max(...gaps):null,
      pageLifecycle:{start:pageStart,end:pageState(),events:pageEvents}};
    throw error;
  }finally{harvester?.stop();document.removeEventListener('visibilitychange',lifecycle);window.removeEventListener('focus',lifecycle);window.removeEventListener('blur',lifecycle);cancelAnimationFrame(raf);if(host.adapter.bitmapTiming?.active)host.adapter.bitmapTiming.finish();if(!reuseProbe||!completed){probe.dispose();if(reuseProbe)reusableImageProbes.delete(host);}}
}

// Compare immediate delivery with a two-image-bounded RAF queue. The queue
// preserves whole frames and adds presentation delay, never simulation steps.
export async function compareBrowserPacing(host,seconds,inspect,{onProgress=()=>{},onResult=()=>{},measure=measureBrowserGameplayAsync,QueueClass}={}){
  if(host.adapter.presentationQueue)throw Error('Start pacing comparison with immediate presentation');
  const {BrowserFrameQueue}=QueueClass?{BrowserFrameQueue:QueueClass}:await import('./browser-frame-queue.js');
  const command=(action,data={})=>host.adapter.request('browserRollback',{action,...data});
  const runs=[];let captured=false;const originalPacing=host.adapter.bitmapPresentationPacing;
  const clearQueue=()=>{host.adapter.presentationQueue?.close();host.adapter.presentationQueue=null;};
  try{
    await command('pause');await command('step');await command('capture',{slot:5});captured=true;
    for(const [index,paced]of [false,true,true,false].entries())for(const warmup of [true,false]){
      onProgress('Presentation '+(paced?'RAF':'immediate')+' '+(warmup?'warmup':'measurement')+' '+(index+1)+'/4…');
      await command('pause');clearQueue();await command('restore',{slot:5});
      for(let frame=0;frame<120;frame++)await command('step');
      if(paced)host.adapter.presentationQueue=new BrowserFrameQueue(bitmap=>host.adapter.drawDetachedOglBitmap(bitmap,bitmap.width,bitmap.height));
      host.adapter.bitmapPresentationPacing=paced?'raf-buffered':'immediate';
      await host.adapter.request('start',{});
      const result=await measure(host,seconds,inspect);
      const stats=host.adapter.presentationQueue?.stats;
      runs.push({...result,paced,warmup,queue:stats?{...stats,meanAgeMs:stats.presented?stats.ageTotalMs/stats.presented:0,capacity:host.adapter.presentationQueue.capacity}:null});
      onResult({kind:'same-checkpoint-presentation-abba',passed:false,runs});
    }
    return {kind:'same-checkpoint-presentation-abba',passed:runs.filter(r=>r.paced&&!r.warmup).every(r=>r.passed),runs};
  }finally{
    await command('pause');clearQueue();host.adapter.bitmapPresentationPacing=originalPacing;
    try{if(captured)await command('release',{slot:5});}finally{await host.adapter.request('start',{});}
  }
}

// Fountain's water reflection is a separate cosmetic render pass. Each run
// restores all machine/graphics state before changing only that pass.
export async function compareFountainReflection(host,seconds,inspect,{measure=measureBrowserGameplayAsync,feature="reflection",frameInput=false,onProgress=()=>{},onResult=()=>{}}={}){
 const command=(action,data={})=>host.adapter.request('browserRollback',{action,...data});
 if(!['reverb','reflection','scenery','modeldetail','animation','shadowdiag','decorations','particles','stadiumscreen','yoshianimation','staticbackground'].includes(feature))throw Error('Unknown cosmetic feature');
 const reverb=feature==='reverb',yoshi=feature==='yoshianimation',stadium=feature==='stadiumscreen',staticBackground=feature==='staticbackground';
 let stageName=reverb?'Tournament match':yoshi?'Yoshi':stadium?'Stadium':staticBackground?'Tournament stage':'Fountain';
 const reflection=enabled=>host.adapter.request('meleeControl',{action:reverb?'auxReverb':yoshi?'yoshiBackgroundAnimation':stadium?'stadiumScreen':staticBackground?'staticBackgroundAnimation':feature==='particles'?'fountainParticles':feature==='decorations'?'fountainDecorations':feature==='shadowdiag'?'shadowDiagnostic':feature==='animation'?'fountainAnimation':feature==='modeldetail'?'modelDetail':feature==='scenery'?'fountainScenery':'fountainReflection',enabled});
 const codegen=browserCodegenConfig(host);
 const runs=[];let captured=false;
 try{
  await command('pause');await command('step');
  const inspectedStage=(await inspect()).match?.stage;
  if(reverb){if(!Number.isInteger(inspectedStage))throw Error('Reverb comparison requires a live tournament match');}
  else if(staticBackground){if(![31,32].includes(inspectedStage))throw Error('Static background comparison requires Battlefield or Final Destination');stageName=inspectedStage===31?'Battlefield':'Final Destination';}
  else if(inspectedStage!==(yoshi?8:stadium?3:2))throw Error('Cosmetic comparison requires '+stageName);
  const initial=await reflection(true);if(initial.objects.length<1)throw Error('Fountain reflection camera was not identified');
  await command('capture',{slot:5});captured=true;
  for(const[index,enabled]of[true,false,false,true].entries())for(const warmup of[true,false]){
   const label=stageName+' '+feature+' '+(enabled?'on':'off')+' '+(warmup?'warmup':'measurement')+' '+(index+1)+'/4';
   const setupTiming={};const timed=async(phase,run)=>{onProgress(label+': '+phase+'…');const started=performance.now();const result=await run();setupTiming[phase]=performance.now()-started;return result;};
   await timed('pause',()=>command('pause'));await timed('restore',()=>command('restore',{slot:5}));
   const changed=await timed('apply change',()=>reflection(enabled));if(changed.objects.length<1)throw Error('Fountain reflection camera disappeared');
   await timed('settle 120 frames',async()=>{for(let frame=0;frame<120;frame++)await command('step');});
   if(frameInput)await timed('enable controller input',()=>command('frameInput',{enabled:true}));
   await timed('resume',()=>host.adapter.request('start',{}));
   const result=await measure(host,seconds,inspect,{onPhase:phase=>onProgress(label+': '+phase+'…')});result.setupTimingMs=setupTiming;
   if(frameInput){
    await command('frameInput',{enabled:false});const stats=await command('frameInputStats');
    const exercised=stats.valid&&stats.inputChanges?.every(n=>n>=8)&&stats.observedActions?.every(a=>a.length>=3);
    result.controllerStress={...stats,kind:'two ordinary controller tracks sampled on native logic frames',notHumanPlay:true,exercisedBothPlayers:!!exercised};
    if(!exercised){result.passed=false;result.invalidWorkload='Frame-based controller workload was invalid or inactive';}
   }
   if(yoshi){
    await command('pause');const verified=await reflection(enabled);
    if(verified.objects.length!==1||verified.objects[0].mapId!==1||verified.writes.length||verified.codeWrites.length)throw Error('Yoshi animation hook changed during measurement');
    result.cosmeticCoverage={mapId:1,animation:enabled,stableAtEnd:true};
   }
   if(stadium){
    await command('pause');const verified=await reflection(enabled);
    if(verified.objects.length!==1||verified.codeWrites.length||verified.writes.length)throw Error('Stadium screen hook changed during measurement');
    result.cosmeticCoverage={screen:enabled,stableAtEnd:true,copySites:verified.copySites};
   }
   if(staticBackground){
    await command('pause');const verified=await reflection(enabled);
    const expected=inspectedStage===31?1:7;
    if(verified.objects.length!==expected||verified.codeWrites.length||verified.writes.length)
      throw Error('Static background animation hook changed during measurement');
    result.cosmeticCoverage={stage:inspectedStage,objects:expected,animation:enabled,
      mapIds:verified.objects.map(object=>object.mapId),preserved:verified.preserved,stableAtEnd:true};
   }
   if(reverb){
    await command('pause');const verified=await reflection(enabled);
    if(verified.objects.length!==1||verified.writes.length)throw Error('Standard reverb state changed during measurement');
    result.cosmeticCoverage={reverb:enabled,dryMixPreserved:verified.dryMixPreserved,stableAtEnd:true};
   }
   if(feature==='particles'){
    await command('pause');const verified=await reflection(enabled);
    if(verified.objects.length!==1||verified.writes.length||verified.codeWrites.length)throw Error('Particle hook changed during measurement');
    result.cosmeticCoverage={particles:enabled,stableAtEnd:true,snapshot:verified.particles};
   }
   if(feature==='decorations'){
    await command('pause');const verified=await reflection(enabled);
    if(verified.drawCount!==38||verified.writes.length!==0)throw Error('Decoration visibility changed during measurement');
    result.cosmeticCoverage={drawCount:38,decorations:enabled,stableAtEnd:true};
   }
   if(feature==='shadowdiag'){result.diagnosticOnly=true;result.passed=false;}runs.push({...result,[feature]:enabled,warmup});
   onResult({kind:'same-checkpoint-'+stageName.toLowerCase()+'-'+feature+'-abba',codegen,passed:false,runs});
  }
  const inputConsistency=frameInput?compareFrameInputDigests(runs):undefined;
  return {kind:'same-checkpoint-'+stageName.toLowerCase()+'-'+feature+'-abba',codegen,diagnosticOnly:feature==='shadowdiag',passed:runs.filter(r=>!r[feature]&&!r.warmup).every(r=>r.passed)&&(!frameInput||inputConsistency.passed),runs,...(frameInput?{inputConsistency}:{})};
 }finally{
  if(frameInput)await command('frameInput',{enabled:false});
  await command('pause');try{if(captured){await command('restore',{slot:5});await reflection(true);await command('release',{slot:5});}}finally{await host.adapter.request('start',{});}
 }
}

// Fingerprints detect diverging test trajectories; they do not replace the
// independent byte-for-byte machine replay used for emulator correctness.
export function compareFrameInputDigests(runs){
 const first=runs.reduce((best,r)=>((r.controllerStress?.digests?.at(-1)?.frame??-1)>(best?.digests?.at(-1)?.frame??-1)?r.controllerStress:best),null);
 const byFrame=new Map((first?.digests??[]).map(d=>[d.frame,d]));
 const mismatches=[];let checked=0;
 for(const [index,run] of runs.entries()){
  const s=run.controllerStress;
  if(!s?.valid||s.startFrame!==first?.startFrame){mismatches.push({run:index,reason:'invalid frame sequence or checkpoint'});continue;}
  const shared=(s.digests??[]).filter(d=>byFrame.has(d.frame));
  const through=shared.at(-1)?.frame??0;
  const gaps=(stats)=>(stats.gaps??[]).filter(g=>g.before<=through);
  if(JSON.stringify(gaps(s))!==JSON.stringify(gaps(first)))mismatches.push({run:index,reason:'native polling gaps differ'});
  if(!shared.some(d=>d.frame>=1200))mismatches.push({run:index,reason:'fewer than 1200 common tracked frames'});
  for(const d of shared){checked++;const ref=byFrame.get(d.frame);if(d.input!==ref.input||d.state!==ref.state)mismatches.push({run:index,frame:d.frame,input:d.input!==ref.input,state:d.state!==ref.state});}
 }
 return {passed:runs.length>0&&mismatches.length===0,checked,mismatches,limits:'32-bit rolling fingerprints of sampled native-frame indices, inputs, positions, actions and stocks, plus exact polling gaps; not full machine equivalence.'};
}

// Single diagnostic/acceptance run with the same native-poll input producer
// used by matched comparisons. No host timer chooses gameplay inputs.
export async function measureBrowserNativeInput(host,seconds,inspect,{measure=measureBrowserGameplayAsync}={}){
 const command=(action,data={})=>host.adapter.request('browserRollback',{action,...data});
 try{
  await command('pause');await command('frameInput',{enabled:true});
  await host.adapter.request('start',{});
  const result=await measure(host,seconds,inspect);
  await command('frameInput',{enabled:false});
  const stats=await command('frameInputStats');
  const exercised=stats.valid&&stats.inputChanges?.every(n=>n>=8)&&stats.observedActions?.every(a=>a.length>=3);
  result.controllerStress={...stats,kind:'two ordinary controller tracks sampled on native logic frames',notHumanPlay:true,exercisedBothPlayers:!!exercised};
  if(!exercised){result.passed=false;result.invalidWorkload='Frame-based controller workload was invalid or inactive';}
  return result;
 }finally{
  try{await command('frameInput',{enabled:false});}finally{await host.adapter.request('start',{});}
 }
}

// The emulator already produces native-rate frames. Compare the extra queue
// clock against consuming one real image per browser paint, at the same capacity.
export async function compareBrowserQueueClock(host,seconds,inspect,{measure=measureBrowserGameplayAsync,onProgress=()=>{},onResult=()=>{}}={}){
 const queue=host.adapter.presentationQueue;
 if(queue?.capacity!==2||typeof queue.setRateLimited!=='function')throw Error('Queue-clock comparison requires the two-image RAF queue');
 const original=queue.rateLimited,command=(action,data={})=>host.adapter.request('browserRollback',{action,...data});
 const runs=[];let captured=false;
 try{
  await command('pause');await command('step');await command('capture',{slot:5});captured=true;
  for(const [index,rateLimited]of[true,false,false,true].entries())for(const warmup of[true,false]){
   const label='Queue '+(rateLimited?'clocked':'each RAF')+' '+(warmup?'warmup':'measurement')+' '+(index+1)+'/4';
   const setupTimingMs={};const timed=async(phase,fn)=>{onProgress(label+': '+phase+'…');const t=performance.now();const r=await fn();setupTimingMs[phase]=performance.now()-t;return r;};
   await timed('pause',()=>command('pause'));await timed('restore',()=>command('restore',{slot:5}));
   queue.setRateLimited(rateLimited);
   await timed('settle 120 frames',async()=>{for(let frame=0;frame<120;frame++)await command('step');});
   const result=await measureBrowserNativeInput(host,seconds,inspect,{measure:(h,s,i)=>measure(h,s,i,{onPhase:phase=>onProgress(label+': '+phase+'…')})});
   runs.push({...result,rateLimited,warmup,setupTimingMs});onResult({kind:'same-checkpoint-queue-clock-abba',passed:false,runs});
  }
  const inputConsistency=compareFrameInputDigests(runs);
  return {kind:'same-checkpoint-queue-clock-abba',passed:runs.filter(r=>!r.rateLimited&&!r.warmup).every(r=>r.passed)&&inputConsistency.passed,inputConsistency,runs};
 }finally{
  await command('pause');
  try{if(captured)await command('release',{slot:5});queue.setRateLimited(original);}
  finally{await host.adapter.request('start',{});}
 }
}

// Confirm the actual native scene rather than reporting unapplied UI labels.
export function verifyBenchmarkSelection(state,{stage,characters}) {
  if(state.major!==2||state.minor!==2||state.sceneKind!==2||state.match?.stage!==stage)
    throw Error('Benchmark stage differs from the selected native scene');
  if(state.match.timeLimit!==480||state.match.items!==-1||state.match.teams!==0)
    throw Error('Benchmark native tournament settings differ');
  const actual=state.fighters?.map(f=>f.character);
  if(actual?.length!==2||characters.length!==2||actual.some((id,i)=>id!==characters[i]))
    throw Error('Benchmark fighter selection differs: '+JSON.stringify(actual));
  return {stage:state.match.stage,characters:actual,slotTypes:state.fighters.map(f=>f.slotType),timeLimit:state.match.timeLimit,items:state.match.items,teams:state.match.teams};
}

// Capacity alone varies. Fixed code generation and native-frame inputs keep
// the emulation workload equal. Queue age is not input-to-photon latency.
export async function compareBrowserQueueCapacity(host,seconds,inspect,{measure=measureBrowserGameplayAsync,onProgress=()=>{},onResult=()=>{},candidateCapacity=3}={}){
 if(![3,4].includes(candidateCapacity))throw Error('Queue comparison candidate must be 3 or 4 images');
 const queue=host.adapter.presentationQueue;
 if(typeof queue?.setCapacity!=='function')throw Error('Queue-capacity comparison requires the RAF queue');
 const originalCapacity=queue.capacity,originalCodegen=browserCodegenConfig(host);
 if(originalCapacity===candidateCapacity)throw Error('Queue comparison requires different capacities');
 // Buffering is the only experimental variable. Do not silently enable
 // unrelated CPU experiments while measuring presentation capacity.
 const common={...originalCodegen};
 const command=(action,data={})=>host.adapter.request('browserRollback',{action,...data});
 const runs=[];let captured=false;
 try{
  await command('pause');await command('codegen',common);await command('step');await command('capture',{slot:5});captured=true;
  for(const [index,capacity]of[originalCapacity,candidateCapacity,candidateCapacity,originalCapacity].entries())for(const warmup of[true,false]){
   const label='Queue '+capacity+' '+(warmup?'warmup':'measurement')+' '+(index+1)+'/4';
   const setupTimingMs={};const timed=async(phase,fn)=>{onProgress(label+': '+phase+'…');const t=performance.now();const r=await fn();setupTimingMs[phase]=performance.now()-t;return r;};
   await timed('pause',()=>command('pause'));await timed('restore',()=>command('restore',{slot:5}));queue.setCapacity(capacity);
   await timed('settle 120 frames',async()=>{for(let frame=0;frame<120;frame++)await command('step');});
   const result=await measureBrowserNativeInput(host,seconds,inspect,{measure:(h,s,i)=>measure(h,s,i,{onPhase:phase=>onProgress(label+': '+phase+'…')})});
   runs.push({...result,capacity,warmup,codegen:common,setupTimingMs});onResult({kind:'same-checkpoint-queue-capacity-abba',passed:false,runs});
  }
  const inputConsistency=compareFrameInputDigests(runs);
  return {kind:'same-checkpoint-queue-capacity-abba',referenceCapacity:originalCapacity,candidateCapacity,passed:runs.filter(r=>r.capacity===candidateCapacity&&!r.warmup).every(r=>r.passed)&&inputConsistency.passed,inputConsistency,runs};
 }finally{
  // Attempt every restoration even if an earlier cleanup operation fails.
  const errors=[];
  for(const cleanup of[()=>command('pause'),()=>command('frameInput',{enabled:false}),()=>captured?command('release',{slot:5}):null,()=>queue.setCapacity(originalCapacity),()=>command('codegen',originalCodegen),()=>host.adapter.request('start',{})]){
   try{await cleanup();}catch(error){errors.push(error);}
  }
  if(errors.length)throw new AggregateError(errors,'Queue comparison cleanup failed');
 }
}
