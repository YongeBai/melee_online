import {nativeKeyboardCodes,neutralNativeSample,keyboardNativeSample,standardNativeSample,completeNativeSample} from './native-input.mjs';
import {isNormalAttackState} from './combat-workload.mjs';

// Fixed simulation cadence. Retain backlog under load; pause explicitly when
// hidden. Old rAF timestamps must not move the wall-clock origin backwards.
export function createNativeFrameClock(start,rate=60,{align=false,toleranceMs=.1}={}) {
  const duration=1000/rate;let previous=start,debt=0,maxDebt=0,waitingForOrigin=align;
  if(!Number.isFinite(toleranceMs)||toleranceMs<0||toleranceMs>=duration/2)throw Error('Native frame clock tolerance');
  return {
    take(now,limit=4){
      if(!Number.isFinite(now)||!Number.isInteger(limit)||limit<0)throw Error('Native frame clock input');
      if(previous!==null&&now<previous)return 0;
      if(previous===null||waitingForOrigin){previous=now;waitingForOrigin=false;return 0;}
      debt+=now-previous;previous=now;maxDebt=Math.max(maxDebt,debt);
      // rAF timestamps can be quantized to 0.1 ms. At a frame boundary that
      // otherwise alternates zero/two steps even at a perfect 60 Hz cadence.
      // Retain any negative debt: the bounded tolerance is repaid and never
      // accumulates into faster simulation time.
      // Borrow only for the first step, never to add a catch-up step. Borrowing
      // for a second step oscillates zero/two callbacks when display phase
      // drifts across the tolerance boundary, despite a stable refresh cadence.
      const whole=Math.max(0,Math.floor((debt+1e-6)/duration));
      const count=Math.min(limit,whole||(debt+toleranceMs>=duration?1:0));debt-=count*duration;return count;
    },
    reset(){previous=null;debt=0;},
    get debtMs(){return debt;},get maxDebtMs(){return maxDebt;},
  };
}

// Interactive development fixture, not complete competitive match startup.
// Input samples enter the existing normalized HSD boundary; no game-state
// positions, action states, damage or velocities are assigned here.
export function startNativeLive(module,preview,objects,{frameLimit=0,onProgress=()=>{},onComplete=()=>{},onError=()=>{},step=()=>module._portRuntimeStep(),inputProvider=null,resolveObjects=null,readMatch=null,unlockInput=true}={}) {
  // The first callback can carry a timestamp from before lengthy startup work.
  // Discard such timestamps, then anchor to the first valid display callback.
  // A quarter millisecond of repaid tolerance covers observed display jitter.
  preview.resetImmediateStats?.();
  const slowDraws=[],shaderCompilations=[];
  const stateChanges=[],inputChanges=[],keys=new Set(),clock=createNativeFrameClock(performance.now(),60,{align:true,toleranceMs:.25}),stepTimes=[],drawTimes=[],intervals=[];
  let raf=0,stopped=false,frames=0,draws=0,started=performance.now(),lastDraw=null,lastCallback=null,lastRender=null;
  const cadence={callbacks:0,zeroStepCallbacks:0,multiStepCallbacks:0,rafGapsOver25Ms:0,timingSamples:[]};
  const readState=()=>{const current=resolveObjects?resolveObjects():objects;if(current.length!==objects.length||current.some(o=>!o))throw Error('Native player ownership changed unexpectedly');return current.map(o=>Array.from({length:19},(_,i)=>module._portFighterConstructRead(o,i)));};
  const initial=readState();
  const handled=nativeKeyboardCodes;let focused=true;
  let movement=false,jump=false,attack=false,final=null;
  const workload={framesWithAttack:0,framesWithHitlag:0,framesWithDamage:0,stockChanges:[],windows:[]};
  function input(event){if(!handled.has(event.code))return;event.preventDefault();event.type==='keydown'?keys.add(event.code):keys.delete(event.code);if(inputChanges.length<256)inputChanges.push({frame:frames,type:event.type,code:event.code});}
  function reset(){keys.clear();clock.reset();lastDraw=null;lastCallback=null;}
  function blur(){focused=false;reset();}
  function focus(){focused=true;reset();}
  const cursors=new Map();
  function sample(values,value){const index=cursors.get(values)??0;if(values.length<3600)values.push(value);else values[index%3600]=value;cursors.set(values,index+1);}
  function distribution(values){const v=[...values].sort((a,b)=>a-b);return {samples:v.length,meanMs:v.reduce((a,b)=>a+b,0)/(v.length||1),p50Ms:v[Math.floor((v.length-1)*.5)]??0,p95Ms:v[Math.floor((v.length-1)*.95)]??0,maxMs:v.at(-1)??0};}
  function snapshot(){return {match:readMatch?.()??null,frames,draws,elapsedMs:performance.now()-started,initial,final,stateChanges,inputChanges,movement,jump,attack,inputSource:inputProvider?'scripted normalized controller samples':'browser keyboard and standard gamepad samples',workload,cadence,maxDebtMs:clock.maxDebtMs,stepCpu:distribution(stepTimes),drawSubmissionCpu:distribution(drawTimes),rafDrawIntervals:distribution(intervals),resolution:[960,720],gpuReadbacks:false,playable:false,performanceCertified:false,presentationFpsMeasured:false,inputToPhotonMeasured:false,immediateStats:lastRender?.immediateStats??null,particleStats:lastRender?.particleStats??null,afterimageStats:lastRender?.afterimageStats??null,slowDraws,shaderCompilations,modelCache:lastRender?.modelCache??null,shaderCoverage:preview.shaderCoverage?.()??null};}
  function stop(){if(stopped)return;stopped=true;cancelAnimationFrame(raf);removeEventListener('keydown',input);removeEventListener('keyup',input);removeEventListener('blur',blur);removeEventListener('focus',focus);document.removeEventListener('visibilitychange',reset);keys.clear();for(let i=0;i<objects.length;i++)module._portControllerSample(i,...neutralNativeSample());}
  function frame(now){
    if(stopped)return;
    try {
      if(document.hidden){reset();raf=requestAnimationFrame(frame);return;}
      const steps=clock.take(now,frameLimit?Math.min(4,frameLimit-frames):4);
      cadence.callbacks++;if(!steps)cadence.zeroStepCallbacks++;if(steps>1)cadence.multiStepCallbacks++;
      if(cadence.timingSamples.length<128&&(cadence.callbacks<=8||steps!==1))cadence.timingSamples.push({callback:cadence.callbacks,frame:frames,steps,timestamp:now-started,callbackTime:performance.now()-started,interval:lastCallback===null?null:now-lastCallback,debt:clock.debtMs});
      if(lastCallback!==null&&now-lastCallback>25)cadence.rafGapsOver25Ms++;lastCallback=now;
      // Bound work per callback while retaining debt: never skip simulation
      // frames to inflate the rendered frame rate. Hidden tabs pause explicitly.
      for(let index=0;index<steps;index++) {
        const previous=final??initial;
        const pads=!inputProvider&&focused?(globalThis.navigator?.getGamepads?.()??[]):[];
        const samples=(inputProvider?inputProvider(frames,previous):objects.map((_,i)=>!focused?neutralNativeSample():i===0&&keys.size?keyboardNativeSample(keys):standardNativeSample(pads[i]))).map(completeNativeSample);
        if(samples.length!==objects.length)throw Error('Controller sample count differs from players');
        for(let i=0;i<objects.length;i++)module._portControllerSample(i,...samples[i]);
        const before=performance.now();step();sample(stepTimes,performance.now()-before);frames++;
        final=readState();
        if(!final.flat().every(Number.isFinite))throw Error('Nonfinite interactive fighter state');
        if(final.some(isNormalAttackState))workload.framesWithAttack++;
        if(final.some(s=>s[14]>0))workload.framesWithHitlag++;
        if(final.some(s=>s[13]>0))workload.framesWithDamage++;
        const wi=Math.floor((frames-1)/600),slot=wi%60;
        if(workload.windows[slot]?.firstFrame!==wi*600+1)workload.windows[slot]={firstFrame:wi*600+1,frames:0,hitlag:0,attack:0};
        workload.windows[slot].frames++;
        if(final.some(s=>s[14]>0))workload.windows[slot].hitlag++;
        if(final.some(isNormalAttackState))workload.windows[slot].attack++;
        final.forEach((s,i)=>{if(s[18]!==previous[i][18]&&workload.stockChanges.length<256)workload.stockChanges.push({frame:frames,slot:i,stocks:s[18]});});
        if(stateChanges.length<256&&stateChanges.at(-1)?.state!==final[0][0])stateChanges.push({frame:frames,state:final[0][0],x:final[0][4],y:final[0][5],buttons:samples[0][0]});
        movement ||= Math.abs(final[0][4]-initial[0][4])>.1;
        jump ||= final[0][3]===1&&final[0][5]>initial[0][5]+1;
        attack ||= isNormalAttackState(final[0]);
      }
      if(steps){const before=performance.now();lastRender=preview.draw();const cost=performance.now()-before;sample(drawTimes,cost);for(const entry of lastRender.materialDraws?.shaderCompilations??[])shaderCompilations.push({frame:frames,...entry});if(cost>1000/60&&slowDraws.length<64)slowDraws.push({frame:frames,costMs:cost,materials:lastRender.materialDraws,resources:lastRender.resourceStats});draws++;if(lastDraw!==null)sample(intervals,now-lastDraw);lastDraw=now;if(draws%30===0)onProgress(snapshot());}
      if(frameLimit&&frames>=frameLimit){stop();onComplete(snapshot());return;}
      raf=requestAnimationFrame(frame);
    }catch(error){stop();onError(error,snapshot());}
  }
  // Isolated post-intro fixtures explicitly unlock input. Real scene startup
  // keeps the original gate until the Ready callback releases it.
  if(unlockInput)for(let i=0;i<objects.length;i++)module._Player_80031848(i);
  addEventListener('keydown',input);addEventListener('keyup',input);addEventListener('blur',blur);addEventListener('focus',focus);document.addEventListener('visibilitychange',reset);
  raf=requestAnimationFrame(frame);
  return {snapshot,stop(){stop();onComplete(snapshot());}};
}
