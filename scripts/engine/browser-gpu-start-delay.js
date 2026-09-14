import {browserCodegenConfig,compareFrameInputDigests} from './browser-benchmark.js';
import {verifyBrowserRunningCodegen} from './browser-running-replay.js';
import {compareSavedEventQueues} from './browser-saved-events.js';

// QA only. Changes when a newly queued deterministic GPU service event runs;
// this is an emulated scheduling change, not a presentation-buffer adjustment.
export async function compareBrowserGpuStartDelay(host,seconds,inspect,{
  measure,onProgress=()=>{},onResult=()=>{},candidateCycles=4000,
}={}){
  if(typeof measure!=='function'||![2000,4000,8000].includes(candidateCycles))throw Error('GPU scheduling comparison requires image measurement and a bounded candidate');
  const command=(action,data={})=>host.adapter.request('browserRollback',{action,...data});
  const runs=[];let original,captured=false,result,failed;
  try{
    await command('pause');original=(await command('gpuStartDelay')).cycles;
    if(![1000,2000,4000,8000].includes(original))throw Error('GPU scheduling mode unavailable');
    await command('step');await command('capture',{slot:5});captured=true;
    for(const[index,cycles]of[1000,candidateCycles,candidateCycles,1000].entries())for(const warmup of[true,false]){
      const label=`GPU service delay ${cycles} ${warmup?'warmup':'measurement'} ${index+1}/4`;
      onProgress(label+': restore and settle');await command('pause');await command('restore',{slot:5});
      if((await command('gpuStartDelay',{cycles})).cycles!==cycles)throw Error('GPU scheduling mode did not apply');
      for(let frame=0;frame<120;frame++)await command('step');
      await command('frameInput',{enabled:true});const before=await command('gpuStartDelay');
      await host.adapter.request('start',{});
      const measured=await measure(host,seconds,inspect,{onPhase:phase=>onProgress(label+': '+phase)});
      await command('pause');const after=await command('gpuStartDelay');
      const starts=after.starts-before.starts,callbacks=after.callbacks-before.callbacks;
      if(before.cycles!==cycles||after.cycles!==cycles||![starts,callbacks].every(n=>Number.isSafeInteger(n)&&n>0))throw Error('GPU scheduling counters did not exercise the configured path');
      await command('frameInput',{enabled:false});const{id,ok,...input}=await command('frameInputStats');
      if(!input.valid||input.inputChanges?.length!==2||!input.inputChanges.every(n=>n>=8)||input.observedActions?.length!==2||!input.observedActions.every(a=>a.length>=3))throw Error('GPU scheduling comparison input was inactive');
      runs.push({...measured,cycles,warmup,gpuScheduling:{before,after,starts,callbacks,callbacksPerNativeFrame:callbacks/(measured.simulationFps*measured.seconds)},controllerStress:{...input,kind:'two native-frame human controller tracks',notHumanPlay:true,exercisedBothPlayers:true}});
      onResult({kind:'same-checkpoint-gpu-start-delay-abba',passed:false,runs});
    }
    const inputConsistency=compareFrameInputDigests(runs);
    result={kind:'same-checkpoint-gpu-start-delay-abba',passed:inputConsistency.passed&&runs.filter(r=>!r.warmup&&r.cycles===candidateCycles).every(r=>r.passed),runs,inputConsistency};
  }catch(error){failed=error;}
  const errors=[];
  for(const cleanup of[()=>command('pause'),()=>command('frameInput',{enabled:false}),()=>captured?command('release',{slot:5}):null,()=>Number.isInteger(original)?command('gpuStartDelay',{cycles:original}):null,()=>host.adapter.request('start',{})]){
    try{await cleanup();}catch(error){errors.push(error.message);}
  }
  if(failed||errors.length)throw Error([failed?.message,...errors].filter(Boolean).join('; '));
  return result;
}

export async function verifyBrowserGpuStartDelay(host,inspect,{onProgress=()=>{},verify=verifyBrowserRunningCodegen,candidateCycles=4000,frames=600}={}){
  if(![1000,2000,4000,8000].includes(candidateCycles)||!Number.isInteger(frames)||frames<120||frames>3600)throw Error('Invalid bounded GPU replay configuration');
  const command=(action,data={})=>host.adapter.request('browserRollback',{action,...data});
  const codegen=browserCodegenConfig(host),transitions=[],observations=[];let original,result,failed;
  try{
    await command('pause');original=(await command('gpuStartDelay')).cycles;
    if(![1000,2000,4000,8000].includes(original))throw Error('GPU scheduling mode unavailable');
    const send=async(action,data={})=>{
      if(action==='codegen'){
        const{gpustartdelay,...config}=data;
        if(![1000,2000,4000,8000].includes(gpustartdelay)||JSON.stringify(config)!==JSON.stringify(codegen))throw Error('GPU scheduling replay cannot change instruction configuration');
        const applied=await command('gpuStartDelay',{cycles:gpustartdelay});
        if(applied.cycles!==gpustartdelay)throw Error('GPU scheduling mode did not apply');
        transitions.push(applied);return applied;
      }
      return command(action,data);
    };
    result=await verify(send,inspect,{frames,codegenReference:{...codegen,gpustartdelay:1000},codegenComparison:{...codegen,gpustartdelay:candidateCycles},originalCodegen:{...codegen,gpustartdelay:original},onProgress,resume:()=>host.adapter.request('start',{}),diagnostics:async()=>{observations.push(await command('gpuStartDelay'));return host.adapter.request('rendererDiagnostics',{});}});
    if(!transitions.some(s=>s.cycles===1000)||!transitions.some(s=>s.cycles===candidateCycles))throw Error('Replay did not exercise both GPU scheduling modes');
  }catch(error){failed=error;}
  const errors=[];
  for(const cleanup of[()=>command('pause'),()=>Number.isInteger(original)?command('gpuStartDelay',{cycles:original}):null,()=>host.adapter.request('start',{})]){
    try{await cleanup();}catch(error){errors.push(error.message);}
  }
  if(failed||errors.length)throw Error([failed?.message,...errors].filter(Boolean).join('; '));
  let savedEventComparison=null;
  if(observations[1]?.savedTiming&&observations[3]?.savedTiming)savedEventComparison=compareSavedEventQueues(observations[1].savedTiming,observations[3].savedTiming);
  return{...result,kind:'normal-running-browser-gpu-scheduling-equivalence',candidateCycles,gpuSchedulingTransitions:transitions,gpuSchedulingObservations:observations,savedEventComparison};
}
