import {BrowserRollbackTimeline,neutralBrowserPad} from './browser-rollback.js';

// Local, real-engine late-input test. It does not claim network or FPS coverage.
export async function verifyBrowserRollbackTimeline(send,inspect,{frames=40,delay=3,prewarmFrames=0,checkpointPolicy='periodic',cacheFastPathComparison=false,cacheLoopComparison=false,inlineDispatchComparison=false,wasmDispatchComparison=false,idleChecksComparison=false,codegenComparison=null,codegenReference=null,batchAdvance=false,onProgress=()=>{}}={}) {
  if(!Number.isInteger(frames)||frames<4||frames>3600||!Number.isInteger(delay)||delay<1||delay>8||delay>=frames)
    throw Error('Invalid timeline probe duration or input delay');
  if(!Number.isInteger(prewarmFrames)||prewarmFrames<0||prewarmFrames>frames)throw Error('Invalid replay prewarm length');
  let phase='prepare',frame=-1,replaying=false,stepFrame=-1;
  const timings={},stepParts=[];
  const command=async(action,data)=>{
    const began=performance.now();
    const group=phase+':'+action;
    const context=`${phase} frame ${frame}${replaying?` replay ${stepFrame}`:''}: ${action}${data?.slot===undefined?'':` slot ${data.slot}`}`;
    try {
      const result=send(action,data);
      onProgress(context);
      return await result;
    }
    catch(error){throw new Error(`${context}: ${error.message}`,{cause:error});}
    finally {(timings[group]??=[]).push(performance.now()-began);}
  };
  const initial=await inspect();
  if(initial.fighters.length!==2||initial.fighters.some(f=>f.slotType!==0||f.controllerIndex!==f.port))
    throw Error('Timeline probe requires two human controller ports');
  const startFrame=initial.sceneFrame;
  const scripted=(frame,port)=>{
    const p=neutralBrowserPad();
    p.stickX=frame%16<8?(port===0?210:46):128;
    p.mask=frame%12===8?4:frame%12===10?(port===0?1:2):0;
    return p;
  };
  const adapter={
    capture:slot=>command('capture',{slot,gpuResident:true}),
    restore:slot=>command('restore',{slot}),
    suppress:value=>command('suppress',{value}),
    async advance(frame,pads,{replay}) {
      replaying=replay;stepFrame=frame;
      let timing, state;
      // The reference deliberately keeps the original three-RPC path. The
      // corrected run compares the one-RPC path against its full final state.
      if (batchAdvance && phase !== 'reference') {
        timing = await command('advance', {pads, frame:startFrame+frame, unthrottled:true});
        state = timing.game;
      } else {
        await command('pads',{pads,frame:startFrame+frame});
        timing=await command('step',{unthrottled:true});
        state=await inspect();
      }
      stepParts.push({phase,frame,replay,milliseconds:timing.milliseconds,coreTicks:timing.coreTicks,ppcPc:timing.ppcPc,
        transitionMilliseconds:timing.transitionMilliseconds,waitMilliseconds:timing.waitMilliseconds,
        waitStrategy:timing.waitStrategy,waitWakeups:timing.waitWakeups});
      if(state.sceneFrame!==startFrame+frame+1)throw Error('Rollback did not advance exactly one logic frame');
      return {milliseconds:timing.milliseconds,replay};
    },
  };
  // Four rotating fast checkpoints leave two slots for independent full-state
  // baseline/reference snapshots. Their byte comparison includes GPU content.
  await command('clear');
  if(cacheFastPathComparison)await command('cacheFastPath',{value:false});
  if(cacheLoopComparison)await command('cacheLoopBatch',{value:false});
  if(inlineDispatchComparison)await command('inlineDispatch',{value:false});
  if(wasmDispatchComparison)await command('wasmDispatch',{value:false});
  if(idleChecksComparison)await command('idleBatchChecks',{value:false});
  if(codegenComparison)await command('codegen',codegenReference??{regcache:false,fastmem:false});
  await command('capture',{slot:5});
  // Optional diagnostic control: execute the exact future input path, then
  // restore its initial state while retaining verified compiled code. This
  // does not erase a failure without prewarming or establish cold replay.
  if(prewarmFrames){
    phase='prewarm';
    for(let f=0;f<prewarmFrames;f++){frame=f;await adapter.advance(f,[scripted(f,0),scripted(f,1)],{replay:false});}
    await command('restore',{slot:5});
  }
  const reference=new BrowserRollbackTimeline(adapter,{window:8,checkpointInterval:4,checkpointPolicy});
  phase='reference';
  for(let f=0;f<frames;f++){
    frame=f;
    reference.input(0,f,scripted(f,0));reference.input(1,f,scripted(f,1));
    if(!(await reference.advance()).advanced)throw Error('Reference unexpectedly stalled');
  }
  const referenceState=await inspect();
  phase='restore baseline';
  await command('capture',{slot:4});
  await command('restore',{slot:5});
  await command('release',{slot:5});
  if(cacheFastPathComparison)await command('cacheFastPath',{value:true});
  if(cacheLoopComparison)await command('cacheLoopBatch',{value:true});
  if(inlineDispatchComparison)await command('inlineDispatch',{value:true});
  if(wasmDispatchComparison)await command('wasmDispatch',{value:true});
  if(idleChecksComparison)await command('idleBatchChecks',{value:true});
  if(codegenComparison)await command('codegen',codegenComparison);
  const before=await command('outputStats');
  const corrected=new BrowserRollbackTimeline(adapter,{window:8,checkpointInterval:4,checkpointPolicy});
  phase='delayed';
  for(let f=0;f<frames;f++) {
    frame=f;
    corrected.input(0,f,scripted(f,0));
    if(f>=delay)corrected.input(1,f-delay,scripted(f-delay,1));
    if(!(await corrected.advance()).advanced)throw Error('Delayed-input trial unexpectedly stalled');
  }
  for(let f=frames-delay;f<frames;f++)corrected.input(1,f,scripted(f,1));
  phase='final correction';frame=frames;
  if((await corrected.advance()).advanced)throw Error('Final correction advanced without local input');
  const correctedState=await inspect();
  // Correction is complete. Free the now-unused checkpoint ring before the
  // independent full capture; retaining it creates needless WASM heap peaks.
  for(let slot=0;slot<4;slot++)await command('release',{slot});
  await command('capture',{slot:5});
  const comparison=await command('equal',{a:4,b:5});
  const after=await command('outputStats');
  const output={
    videoSkipped:after.output.videoSkipped-before.output.videoSkipped,
    audioSamplesSkipped:after.output.audioSamplesSkipped-before.output.audioSamplesSkipped,
    suppressed:after.output.suppressed,
  };
  const referenceTicks=new Map(stepParts.filter(s=>s.phase==="reference").map(s=>[s.frame,s.coreTicks]));
  const correctedTicks=new Map(stepParts.filter(s=>s.phase!=="reference").map(s=>[s.frame,s.coreTicks]));
  const tickDifferences=[...referenceTicks].filter(([frame,ticks])=>Number.isFinite(ticks)&&Number.isFinite(correctedTicks.get(frame))&&ticks!==correctedTicks.get(frame)).map(([frame,ticks])=>({frame,reference:ticks,corrected:correctedTicks.get(frame),delta:correctedTicks.get(frame)-ticks}));
  return {
    tickDifferences,
    passed:comparison.equal&&tickDifferences.length===0&&corrected.stats.rollbacks>0&&output.videoSkipped>0&&output.audioSamplesSkipped>0&&!output.suppressed,
    kind:'local-browser-late-input-correction',networkTest:false,performanceTest:false,
    frames,delay,prewarmFrames,checkpointPolicy,cacheFastPathComparison,cacheLoopComparison,inlineDispatchComparison,wasmDispatchComparison,idleChecksComparison,codegenComparison,codegenReference,batchAdvance,stats:corrected.stats,output,fullMachineBytesEqual:comparison.equal,
    comparison:comparison.comparison,
    referenceFrame:referenceState.sceneFrame,correctedFrame:correctedState.sceneFrame,
    referenceFighters:referenceState.fighters,correctedFighters:correctedState.fighters,
    stepParts,
    commandTimings:Object.fromEntries(Object.entries(timings).map(([name,values])=>{
      const sorted=values.toSorted((a,b)=>a-b);
      return [name,{count:values.length,meanMs:values.reduce((a,b)=>a+b,0)/values.length,
        medianMs:sorted[Math.floor(sorted.length/2)],minMs:sorted[0],
        p95Ms:sorted[Math.ceil(sorted.length*.95)-1],maxMs:sorted.at(-1)}];
    })),
  };
}
