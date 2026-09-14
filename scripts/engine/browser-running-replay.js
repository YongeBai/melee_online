// QA correctness comparison. Native input polls stop ordinary emulation at a
// deterministic boundary; no frame-step arming runs inside either trial.
import {compareSavedEventQueues} from './browser-saved-events.js';
import {differsOnlyInUnusedIdleAccounting} from './browser-replay-accounting.js';
export async function verifyBrowserRunningCodegen(send,inspect,{frames=600,codegenReference,codegenComparison,originalCodegen,resume,diagnostics=null,unchangedControl=false,inspectSavedEvents=false,onProgress=()=>{},sleep=ms=>new Promise(r=>setTimeout(r,ms)),now=()=>performance.now(),timeoutMs=90000}={}) {
  if(!Number.isInteger(frames)||frames<120||frames>3600||!codegenReference||!codegenComparison||!originalCodegen||typeof resume!=='function')throw Error('Running replay requires both configurations, original configuration, and 120–3600 frames');
  const initial=await inspect();
  if(initial.fighters.length!==2||initial.fighters.some(f=>f.slotType!==0||f.controllerIndex!==f.port))throw Error('Running replay requires two human controller ports');
  if(unchangedControl)codegenComparison={...codegenReference};
  const runtimeOnlyComparison=Object.keys({...codegenReference,...codegenComparison}).every(
    key=>["counterbatch","leandispatch","cpformat","animcallbackfast"].includes(key)||codegenReference[key]===codegenComparison[key]);
  const comparisonChangedKeys=Object.keys({...codegenReference,...codegenComparison}).filter(
    key=>codegenReference[key]!==codegenComparison[key]);
  const runs=[];let result,failed;
  try {
    await send('clear');
    await send('codegen',codegenReference);
    await send('capture',{slot:5});
    for(const [index,config]of [codegenReference,codegenComparison].entries()) {
      if(index){await send('restore',{slot:5});await send('codegen',config);}
      await send('frameInput',{enabled:true});
      await send('frameInputStop',{frames});
      const cpBefore=typeof config.cpformat==='boolean'?await send('cpFormatStats'):null;
      const beforeDetails=diagnostics?(await diagnostics()).cpuDetails:'';
      const started=now();await resume();
      let input;
      for(;;){
        await sleep(150);
        const {id:requestId,ok:transportOk,...nativeInput}=await send('frameInputStats');
        input=nativeInput;
        onProgress(`${index?'candidate':'reference'} native frame ${input.lastFrame-input.startFrame}/${frames}`);
        if(input.completed)break;
        if(!input.active||!input.valid)throw Error('Native running replay input became invalid');
        if(now()-started>timeoutMs)throw Error('Native running replay did not stop before timeout');
      }
      if(!input.valid||input.stopAfterFrames!==frames||input.stoppedFrame-input.startFrame!==frames)throw Error('Native replay missed the exact stopping frame');
      // Paused capture takes CPUThreadGuard and waits until execution really
      // relinquishes ownership. A status read alone is not that acknowledgment.
      await send('capture',{slot:index?0:4});
      const savedTiming=inspectSavedEvents?(await send('gpuStartDelay')).savedTiming:null;
      if(inspectSavedEvents&&!savedTiming)throw Error('Saved scheduler snapshot unavailable');
      const game=await inspect();
      const afterDetails=diagnostics?(await diagnostics()).cpuDetails:'';
      const previousConfig=index===0?originalCodegen:codegenReference;
      // animcallbackfast is a runtime gate inside the already compiled Melee
      // animation callback. Toggling it does not invalidate or rebuild guest
      // blocks, just like the other telemetry/runtime-only controls here.
      const compilationChanged=!runtimeOnlyComparison&&Object.keys({...previousConfig,...config}).some(key=>!["counterbatch","leandispatch","cpformat","animcallbackfast"].includes(key)&&previousConfig[key]!==config[key]);
      let execution=null;
      if(diagnostics){
        const before=/wasm-dispatch:(\d+)\/(\d+)calls/.exec(beforeDetails),after=/wasm-dispatch:(\d+)\/(\d+)calls/.exec(afterDetails);
        execution={stepcheck:Number(/stepcheck:(\d+)/.exec(afterDetails)?.[1]),dispatcherHandle:Number(after?.[1]||0),calls:Number(after?.[2]||0)-Number(before?.[2]||0)};
        if(typeof config.constantaddr==='boolean'){
          const pattern=/constantaddr:(\d+) emit-ram\/other:(\d+)\/(\d+)/;
          const a=pattern.exec(afterDetails),b=pattern.exec(beforeDetails);
          execution.constantaddr=Number(a?.[1]);execution.constantAddressSites=Number(a?.[2]||0)+Number(a?.[3]||0);execution.newConstantAddressSites=execution.constantAddressSites-Number(b?.[2]||0)-Number(b?.[3]||0);
          if(execution.constantaddr!==Number(config.constantaddr)||config.constantaddr&&(execution.constantAddressSites<=0||compilationChanged&&execution.newConstantAddressSites<=0))throw Error('Running replay did not compile configured constant addresses');
        }
        if(typeof config.callfusion==='boolean'){
          const a=/callfusion:(\d+) emit-blocks:(\d+)/.exec(afterDetails),b=/callfusion:(\d+) emit-blocks:(\d+)/.exec(beforeDetails);
          execution.callfusion=Number(a?.[1]);execution.callFusionBlocks=Number(a?.[2]||0);execution.newCallFusionBlocks=execution.callFusionBlocks-Number(b?.[2]||0);
          if(execution.callfusion!==Number(config.callfusion)||config.callfusion&&!config.matrixfast&&(execution.callFusionBlocks<=0||compilationChanged&&execution.newCallFusionBlocks<=0))throw Error('Running replay did not compile configured call fusion');
        }
        if(typeof config.matrixfast==='boolean'){
          const pattern=/matrixfast:(\d+) compile\/run\/fallback:(\d+)\/(\d+)\/(\d+)/;
          const a=pattern.exec(afterDetails),b=pattern.exec(beforeDetails);
          execution.matrixfast=Number(a?.[1]);execution.matrixFastCompiles=Number(a?.[2]||0);execution.matrixFastRuns=Number(a?.[3]||0)-Number(b?.[3]||0);execution.matrixFastFallbacks=Number(a?.[4]||0)-Number(b?.[4]||0);
          const reasonPattern=/fallback-reasons:(\d+)\/(\d+)\/(\d+)\/(\d+)\/(\d+)\/(\d+)/;
          const afterReasons=reasonPattern.exec(afterDetails),beforeReasons=reasonPattern.exec(beforeDetails);
          execution.matrixFastFallbackReasons=['fp','stack','a','b','out','unit'].reduce((reasons,name,reasonIndex)=>{
            reasons[name]=Number(afterReasons?.[reasonIndex+1]||0)-Number(beforeReasons?.[reasonIndex+1]||0);return reasons;
          },{});
          if(execution.matrixfast!==Number(config.matrixfast))throw Error(`Running replay matrix mode mismatch: requested ${Number(config.matrixfast)}, observed ${execution.matrixfast}`);
          const accountedFallbacks=Object.values(execution.matrixFastFallbackReasons).reduce((total,count)=>total+count,0);
          const nonFpFallbacks=accountedFallbacks-execution.matrixFastFallbackReasons.fp;
          const fallbackLimit=Math.max(1,Math.ceil(execution.matrixFastRuns/1000));
          const matrixRunInvalid=!config.leandispatch&&(execution.matrixFastRuns<=0||execution.matrixFastFallbacks!==accountedFallbacks||nonFpFallbacks!==0||execution.matrixFastFallbacks>fallbackLimit);
          if(config.matrixfast&&(execution.matrixFastCompiles<=0||matrixRunInvalid))throw Error(`Running replay matrix coverage invalid: compiles ${execution.matrixFastCompiles}, runs ${execution.matrixFastRuns}, fallbacks ${execution.matrixFastFallbacks}, reasons ${JSON.stringify(execution.matrixFastFallbackReasons)}`);
        }
        if(typeof config.gxmatrixfast==='boolean'){
          const pattern=/gxmatrixfast:(\d+) compile\/run\/fallback\/loadpos\/setindex:(\d+)\/(\d+)\/(\d+)\/(\d+)\/(\d+)/;
          const a=pattern.exec(afterDetails),b=pattern.exec(beforeDetails);
          execution.gxmatrixfast=Number(a?.[1]);
          execution.gxMatrixFastCompiles=Number(a?.[2]||0);
          execution.newGxMatrixFastCompiles=execution.gxMatrixFastCompiles-Number(b?.[2]||0);
          execution.gxMatrixFastRuns=Number(a?.[3]||0)-Number(b?.[3]||0);
          execution.gxMatrixFastFallbacks=Number(a?.[4]||0)-Number(b?.[4]||0);
          execution.gxMatrixFastLoadPos=Number(a?.[5]||0)-Number(b?.[5]||0);
          execution.gxMatrixFastSetIndex=Number(a?.[6]||0)-Number(b?.[6]||0);
          if(execution.gxmatrixfast!==Number(config.gxmatrixfast))throw Error(`Running replay GX matrix mode mismatch: requested ${Number(config.gxmatrixfast)}, observed ${execution.gxmatrixfast}`);
          const fallbackLimit=Math.max(1,Math.ceil(execution.gxMatrixFastRuns/1000));
          const gxRunInvalid=!config.leandispatch&&(execution.gxMatrixFastRuns<=0||execution.gxMatrixFastLoadPos<=0||execution.gxMatrixFastSetIndex<=0||execution.gxMatrixFastFallbacks>fallbackLimit);
          if(config.gxmatrixfast&&(execution.gxMatrixFastCompiles<2||compilationChanged&&execution.newGxMatrixFastCompiles<2||gxRunInvalid))throw Error(`Running replay GX matrix coverage invalid: compiles ${execution.gxMatrixFastCompiles}, new ${execution.newGxMatrixFastCompiles}, runs ${execution.gxMatrixFastRuns}, fallbacks ${execution.gxMatrixFastFallbacks}, load-pos ${execution.gxMatrixFastLoadPos}, set-index ${execution.gxMatrixFastSetIndex}, comparison changes ${comparisonChangedKeys.join(',')}`);
        }
        if(typeof config.displaylistfast==='boolean'){
          const pattern=/displaylistfast:(\d+) compile\/run\/fallback\/dirty\/flush\/memory:(\d+)\/(\d+)\/(\d+)\/(\d+)\/(\d+)\/(\d+)/;
          const a=pattern.exec(afterDetails),b=pattern.exec(beforeDetails);
          execution.displaylistfast=Number(a?.[1]);
          execution.displayListFastCompiles=Number(a?.[2]||0);
          execution.newDisplayListFastCompiles=execution.displayListFastCompiles-Number(b?.[2]||0);
          execution.displayListFastRuns=Number(a?.[3]||0)-Number(b?.[3]||0);
          execution.displayListFastFallbacks=Number(a?.[4]||0)-Number(b?.[4]||0);
          const continuationPattern=/continuation\/suffix:(\d+)\/(\d+)/;
          const afterContinuation=continuationPattern.exec(afterDetails),beforeContinuation=continuationPattern.exec(beforeDetails);
          const flushContinuationPattern=/flush-continuation\/tail:(\d+)\/(\d+)/;
          const afterFlushContinuation=flushContinuationPattern.exec(afterDetails),beforeFlushContinuation=flushContinuationPattern.exec(beforeDetails);
          const dirtyCalls=Number(a?.[5]||0)-Number(b?.[5]||0);
          const continuations=Number(afterContinuation?.[1]||0)-Number(beforeContinuation?.[1]||0);
          const suffixes=Number(afterContinuation?.[2]||0)-Number(beforeContinuation?.[2]||0);
          const flushContinuations=Number(afterFlushContinuation?.[1]||0)-Number(beforeFlushContinuation?.[1]||0);
          const tails=Number(afterFlushContinuation?.[2]||0)-Number(beforeFlushContinuation?.[2]||0);
          execution.displayListFastDirtyCalls=dirtyCalls;
          execution.displayListFastContinuations=continuations;
          execution.displayListFastSuffixes=suffixes;
          execution.displayListFastFlushContinuations=flushContinuations;
          execution.displayListFastTails=tails;
          execution.displayListFastFallbackReasons={
            dirty:dirtyCalls-continuations,
            flush:Number(a?.[6]||0)-Number(b?.[6]||0),
            memory:Number(a?.[7]||0)-Number(b?.[7]||0),
          };
          if(execution.displaylistfast!==Number(config.displaylistfast))throw Error(`Running replay display-list mode mismatch: requested ${Number(config.displaylistfast)}, observed ${execution.displaylistfast}`);
          const accountedFallbacks=Object.values(execution.displayListFastFallbackReasons).reduce((total,count)=>total+count,0);
          const successfulCalls=execution.displayListFastRuns-execution.displayListFastFallbacks;
          const continuationInvalid=afterContinuation&&(continuations<=0||suffixes<0||suffixes>continuations||afterFlushContinuation&&(flushContinuations<=0||tails<=0||tails>flushContinuations||suffixes+tails>continuations||continuations-suffixes-tails>execution.displayListFastFallbackReasons.flush+execution.displayListFastFallbackReasons.memory+1));
          const displayListRunInvalid=!config.leandispatch&&(execution.displayListFastRuns<=0||execution.displayListFastFallbacks!==accountedFallbacks||successfulCalls<=0||continuationInvalid);
          if(config.displaylistfast&&(execution.displayListFastCompiles<=0||compilationChanged&&execution.newDisplayListFastCompiles<=0||displayListRunInvalid))throw Error(`Running replay display-list coverage invalid: compiles ${execution.displayListFastCompiles}, new ${execution.newDisplayListFastCompiles}, runs ${execution.displayListFastRuns}, successful ${successfulCalls}, fallbacks ${execution.displayListFastFallbacks}, dirty ${dirtyCalls}, continuation/suffix ${continuations}/${suffixes}, flush-continuation/tail ${flushContinuations}/${tails}, reasons ${JSON.stringify(execution.displayListFastFallbackReasons)}`);
        }
        if(typeof config.animstatefast==='boolean'){
          const pattern=/animstatefast:(\d+) compile\/run\/direct\/common\/callback\/no:(\d+)\/(\d+)\/(\d+)\/(\d+)\/(\d+)\/(\d+)/;
          const a=pattern.exec(afterDetails),b=pattern.exec(beforeDetails);
          execution.animstatefast=Number(a?.[1]);
          execution.animStateCompiles=Number(a?.[2]||0);
          execution.newAnimStateCompiles=execution.animStateCompiles-Number(b?.[2]||0);
          execution.animStateRuns=Number(a?.[3]||0)-Number(b?.[3]||0);
          execution.animStateDirect=Number(a?.[4]||0)-Number(b?.[4]||0);
          execution.animStateFallbacks=execution.animStateRuns-execution.animStateDirect;
          execution.animStateCommon=Number(a?.[5]||0)-Number(b?.[5]||0);
          execution.animStateCallbacks=Number(a?.[6]||0)-Number(b?.[6]||0);
          execution.animStateNoCallbacks=Number(a?.[7]||0)-Number(b?.[7]||0);
          const linearPattern=/\blinear:(\d+)/;
          const afterLinear=linearPattern.exec(afterDetails),beforeLinear=linearPattern.exec(beforeDetails);
          execution.animStateLinearDirect=Number(afterLinear?.[1]||0)-Number(beforeLinear?.[1]||0);
          if(execution.animstatefast!==Number(config.animstatefast))throw Error(`Running replay animation-state mode mismatch: requested ${Number(config.animstatefast)}, observed ${execution.animstatefast}`);
          const fallbackLimit=Math.max(1,Math.ceil(execution.animStateRuns/1000));
          const animRunInvalid=!config.leandispatch&&(execution.animStateRuns<=0||execution.animStateDirect<=0||execution.animStateDirect>execution.animStateRuns||execution.animStateFallbacks>fallbackLimit||execution.animStateCommon<=0||execution.animStateCommon>execution.animStateDirect||execution.animStateCallbacks<=0||execution.animStateCallbacks+execution.animStateNoCallbacks!==execution.animStateCommon||execution.animStateLinearDirect<=0||execution.animStateLinearDirect>execution.animStateCallbacks);
          if(config.animstatefast&&(execution.animStateCompiles<=0||compilationChanged&&execution.newAnimStateCompiles<=0||animRunInvalid))throw Error(`Running replay animation-state coverage invalid: compiles ${execution.animStateCompiles}, new ${execution.newAnimStateCompiles}, runs ${execution.animStateRuns}, direct ${execution.animStateDirect}, fallbacks ${execution.animStateFallbacks}, common ${execution.animStateCommon}, callbacks ${execution.animStateCallbacks}, no-callback ${execution.animStateNoCallbacks}, linear ${execution.animStateLinearDirect}`);
        }
        if(typeof config.chainfusion==='boolean'){
          const a=/chainfusion:(\d+) emit-blocks\/boundaries:(\d+)\/(\d+)/.exec(afterDetails),b=/chainfusion:(\d+) emit-blocks\/boundaries:(\d+)\/(\d+)/.exec(beforeDetails);
          execution.chainfusion=Number(a?.[1]);execution.chainFusionBlocks=Number(a?.[2]||0);execution.newChainFusionBlocks=execution.chainFusionBlocks-Number(b?.[2]||0);execution.chainFusionBoundaries=Number(a?.[3]||0);
          if(execution.chainfusion!==Number(config.chainfusion)||config.chainfusion&&(execution.chainFusionBlocks<=0||compilationChanged&&execution.newChainFusionBlocks<=0))throw Error('Running replay did not compile configured chained fusion');
        }
        if(typeof config.bswaprotate==='boolean'){
          const a=/bswaprotate:(\d+) emit-sites:(\d+)/.exec(afterDetails),b=/bswaprotate:(\d+) emit-sites:(\d+)/.exec(beforeDetails);
          execution.bswaprotate=Number(a?.[1]);execution.byteSwapSites=Number(a?.[2]||0);execution.newByteSwapSites=execution.byteSwapSites-Number(b?.[2]||0);
          if(execution.bswaprotate!==Number(config.bswaprotate)||config.bswaprotate&&(execution.byteSwapSites<=0||compilationChanged&&execution.newByteSwapSites<=0))throw Error('Running replay did not compile configured byte swaps');
        }
        if(typeof config.qstatefull==='boolean'){
          const a=/qstatefull:(\d+) emit-blocks\/sites:(\d+)\/(\d+)/.exec(afterDetails),b=/qstatefull:(\d+) emit-blocks\/sites:(\d+)\/(\d+)/.exec(beforeDetails);
          execution.qstatefull=Number(a?.[1]);execution.qStateFullEmittedSites=Number(a?.[3]||0);execution.newQStateFullEmittedSites=execution.qStateFullEmittedSites-Number(b?.[3]||0);
          if(execution.qstatefull!==Number(config.qstatefull)||config.qstatefull&&(execution.qStateFullEmittedSites<=0||compilationChanged&&execution.newQStateFullEmittedSites<=0))throw Error('Running replay did not compile the configured full Q0 state cache');
        }
        if(typeof config.qstatecache==='boolean'){
          const a=/qstatecache:(\d+) emit-blocks\/sites:(\d+)\/(\d+)/.exec(afterDetails),b=/qstatecache:(\d+) emit-blocks\/sites:(\d+)\/(\d+)/.exec(beforeDetails);
          execution.qstatecache=Number(a?.[1]);execution.qStateEmittedSites=Number(a?.[3]||0);execution.newQStateEmittedSites=execution.qStateEmittedSites-Number(b?.[3]||0);
          if(execution.qstatecache!==Number(config.qstatecache)||config.qstatecache&&(execution.qStateEmittedSites<=0||compilationChanged&&execution.newQStateEmittedSites<=0))throw Error('Running replay did not compile the configured Q0 state cache');
        }
        if(typeof config.leandispatch==='boolean'){
          const a=/leandispatch:(\d+) scopes:(\d+)/.exec(afterDetails),b=/leandispatch:(\d+) scopes:(\d+)/.exec(beforeDetails);
          const specializerRuns=details=>[
            /animstatefast:\d+ compile\/run\/direct\/common\/callback\/no:\d+\/(\d+)/,
            /jobj-update compile\/run\/direct\/fallback:\d+\/(\d+)/,
            /displaylistfast:\d+ compile\/run\/fallback\/dirty\/flush\/memory:\d+\/(\d+)/,
            /gxmatrixfast:\d+ compile\/run\/fallback\/loadpos\/setindex:\d+\/(\d+)/,
          ].reduce((total,pattern)=>total+Number(pattern.exec(details)?.[1]||0),0);
          execution.leandispatch=Number(a?.[1]);
          execution.specializerCounterRuns=specializerRuns(afterDetails)-specializerRuns(beforeDetails);
          if(execution.leandispatch!==Number(config.leandispatch)||
             (config.leandispatch?execution.specializerCounterRuns!==0:execution.specializerCounterRuns<=0))
            throw Error('Running replay did not exercise the configured lean dispatcher telemetry policy');
        }
        const dispatchCountersEnabled=!/\bdispatchcounts:off\b/.test(afterDetails);
        if(execution.stepcheck!==Number(config.stepcheck===true)||execution.dispatcherHandle<=0||
           dispatchCountersEnabled&&(config.leandispatch?execution.calls!==0:execution.calls<=0))throw Error('Running replay did not exercise the configured dispatcher');
        if(typeof config.counterbatch==='boolean'){
          const a=/counterbatch:(\d+) batches:(\d+)/.exec(afterDetails),b=/counterbatch:(\d+) batches:(\d+)/.exec(beforeDetails);
          execution.counterbatch=Number(a?.[1]);execution.counterBatches=Number(a?.[2]||0)-Number(b?.[2]||0);
          if(execution.counterbatch!==Number(config.counterbatch)||(config.counterbatch&&!config.leandispatch?execution.counterBatches<=0:execution.counterBatches!==0))throw Error('Running replay did not exercise the configured counter publication');
        }
        if(typeof config.fusionredispatch==='boolean'){
          const a=/fusionredispatch:(\d+) emitted:(\d+)/.exec(afterDetails),b=/fusionredispatch:(\d+) emitted:(\d+)/.exec(beforeDetails);
          execution.fusionredispatch=Number(a?.[1]);execution.fusionRedispatchEmissions=Number(a?.[2]||0);execution.newFusionRedispatchEmissions=execution.fusionRedispatchEmissions-Number(b?.[2]||0);
          if(execution.fusionredispatch!==Number(config.fusionredispatch)||config.fusionredispatch&&(execution.fusionRedispatchEmissions<=0||compilationChanged&&execution.newFusionRedispatchEmissions<=0))throw Error('Running replay did not compile the configured fusion redispatch');
        }
        if(typeof config.readfusion==='boolean'){
          const a=/readfusion:(\d+) emitted:(\d+)/.exec(afterDetails),b=/readfusion:(\d+) emitted:(\d+)/.exec(beforeDetails);
          execution.readfusion=Number(a?.[1]);execution.readFusionEmissions=Number(a?.[2]||0);execution.newReadFusionEmissions=execution.readFusionEmissions-Number(b?.[2]||0);
          if(execution.readfusion!==Number(config.readfusion)||config.readfusion&&(execution.readFusionEmissions<=0||compilationChanged&&execution.newReadFusionEmissions<=0))throw Error('Running replay did not compile the configured read fusion');
        }
      }
      let cpFormat;
      if(cpBefore){
        const after=await send('cpFormatStats');const writes=after.writes-cpBefore.writes,unchanged=after.unchanged-cpBefore.unchanged,avoided=after.avoided-cpBefore.avoided;
        if(cpBefore.enabled!==config.cpformat||after.enabled!==config.cpformat||writes<=0||unchanged<=0||unchanged>writes||(config.cpformat?avoided!==unchanged:avoided!==0))throw Error('Running replay did not exercise configured CP format reuse');
        cpFormat={writes,unchanged,avoided};
      }
      runs.push({config,input,sceneFrame:game.sceneFrame,fighters:game.fighters,execution,...(cpFormat?{cpFormat}:{}),...(inspectSavedEvents?{savedTiming}:{})});
      await send('frameInput',{enabled:false});
    }
    const comparison=await send('equal',{a:4,b:0});
    const fingerprintsEqual=JSON.stringify(runs[0].input)===JSON.stringify(runs[1].input);
    result={passed:comparison.equal&&fingerprintsEqual&&runs[0].sceneFrame===runs[1].sceneFrame,kind:'normal-running-browser-codegen-equivalence',performanceTest:false,networkTest:false,frames,fullMachineBytesEqual:comparison.equal,fingerprintsEqual,comparison:comparison.comparison,runs};
    result.idleAccountingOnlyDifference=differsOnlyInUnusedIdleAccounting(result.comparison);
    result.executionStateEqual=(result.fullMachineBytesEqual||result.idleAccountingOnlyDifference)&&fingerprintsEqual&&runs[0].sceneFrame===runs[1].sceneFrame;
    // Keep result.passed/fullMachineBytesEqual as the original strict raw gate.
    if(unchangedControl)result.unchangedCodegenControl=true;
    if(inspectSavedEvents)result.savedEventComparison=compareSavedEventQueues(runs[0].savedTiming,runs[1].savedTiming);
  }catch(error){failed=error;}
  // Attempt every cleanup, but never report PASS after a cleanup failure.
  const cleanupErrors=[];
  for(const [action,data]of [['pause',{}],['frameInput',{enabled:false}],['clear',{}],['codegen',originalCodegen]]){
    try{await send(action,data);}catch(error){cleanupErrors.push(`${action}: ${error.message}`);}
  }
  try{await resume();}catch(error){cleanupErrors.push(`resume: ${error.message}`);}
  if(failed||cleanupErrors.length)throw Error([failed?.message,...cleanupErrors].filter(Boolean).join('; '),{cause:failed});
  return result;
}
