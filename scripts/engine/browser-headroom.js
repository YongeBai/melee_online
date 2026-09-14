// Diagnostic only: temporarily remove host pacing for a fixed native workload.
// Keep virtual CPU clock, instructions, GPU rendering and native input polling.
export async function measureBrowserHeadroom(host, inspect, {
  frames=1200, onProgress=()=>{}, sleep=ms=>new Promise(r=>setTimeout(r,ms)),
  now=()=>performance.now(), timeoutMs=90000,
}={}) {
  if(!Number.isInteger(frames)||frames<1200||frames>3600)
    throw Error('Headroom requires 1200–3600 native frames');
  const command=(action,data={})=>host.adapter.request('browserRollback',{action,...data});
  const initial=await inspect();
  if(initial.major!==2||initial.minor!==2||initial.fighters?.length!==2||
      initial.fighters.some(f=>f.slotType!==0||f.controllerIndex!==f.port))
    throw Error('Headroom requires a live match with two human controller ports');
  let result,failed;
  try {
    await command('pause');
    // Stop immediately after the native logic counter advances, before its
    // next input poll. Arming in the middle of a frame can miss the first tick.
    await command('step');
    await command('frameInput',{enabled:true});
    await command('frameInputStop',{frames});
    await command('unthrottled',{enabled:true});
    const started=now();await host.adapter.request('start',{});
    let input;
    for(;;) {
      await sleep(100);
      const{id,ok,...stats}=await command('frameInputStats');input=stats;
      onProgress(`Uncapped diagnostic: native frame ${stats.lastFrame-stats.startFrame}/${frames}`);
      if(!stats.active||!stats.valid)throw Error('Headroom input became invalid');
      if(stats.completed)break;
      if(now()-started>timeoutMs)throw Error('Headroom workload timed out');
    }
    await command('pause');
    // The paused-only setter takes CPUThreadGuard, acknowledging that the CPU
    // relinquished ownership before inspection. It also restores normal pacing.
    await command('unthrottled',{enabled:false});
    const{id,ok,...timing}=await command('frameInputTiming');
    const state=await inspect();
    if(!timing.valid||timing.frames!==frames||timing.startFrame!==input.startFrame||
       timing.stopFrame!==input.stoppedFrame||timing.stopFrame-timing.startFrame!==frames||
       state.sceneFrame!==input.stoppedFrame||!Number.isFinite(timing.elapsedMs)||timing.elapsedMs<=0||
       input.inputChanges?.length!==2||!input.inputChanges.every(n=>n>=8)||
       input.observedActions?.length!==2||!input.observedActions.every(a=>a.length>=3))
      throw Error('Headroom verification failed: '+JSON.stringify({timing,
        inputStart:input.startFrame,inputStop:input.stoppedFrame,stateFrame:state.sceneFrame,
        inputChanges:input.inputChanges,actionCounts:input.observedActions?.map(a=>a.length)}));
    result={kind:'uncapped-native-work-headroom',diagnosticOnly:true,passed:false,
      frames,nativeWorkFps:frames*1000/timing.elapsedMs,timing,controllerStress:input,
      limits:'Uncapped host pacing and no image verifier. Real rendered-image FPS, normal pacing, and physical input latency require separate tests.'};
  } catch(error) {failed=error;}
  const errors=[];
  // Attempt every restoration even if a previous cleanup fails.
  for(const cleanup of[()=>command('pause'),()=>command('unthrottled',{enabled:false}),
    ()=>command('frameInput',{enabled:false}),()=>host.adapter.request('start',{})]) {
    try{await cleanup();}catch(error){errors.push(error.message);}
  }
  if(failed||errors.length)throw Error([failed?.message,...errors].filter(Boolean).join('; '));
  return result;
}
