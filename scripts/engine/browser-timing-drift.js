import {browserCodegenConfig,compareFrameInputDigests} from './browser-benchmark.js';
import {verifyBrowserRunningCodegen} from './browser-running-replay.js';

export async function compareBrowserTimingDrift(host, seconds, inspect, {
  measure,onProgress=()=>{},onResult=()=>{},
}={}) {
  if(typeof measure!=='function')throw Error('Timing comparison requires image measurement');
  const command=(action,data={})=>host.adapter.request('browserRollback',{action,...data});
  const runs=[];let original,captured=false,result,failed;
  try {
    await command('pause');original=(await command('timingDrift')).enabled;
    if(typeof original!=='boolean')throw Error('Timing mode unavailable');
    await command('step');await command('capture',{slot:5});captured=true;
    for(const[index,enabled]of[false,true,true,false].entries())for(const warmup of[true,false]) {
      const label=`Time-drift correction ${enabled?'on':'off'} ${warmup?'warmup':'measurement'} ${index+1}/4`;
      onProgress(label+': restore and settle');
      await command('pause');await command('restore',{slot:5});
      if((await command('timingDrift',{enabled})).enabled!==enabled)throw Error('Timing mode did not apply');
      for(let frame=0;frame<120;frame++)await command('step');
      await command('frameInput',{enabled:true});
      const before=await command('timingDrift');
      await host.adapter.request('start',{});
      const measured=await measure(host,seconds,inspect,{onPhase:phase=>onProgress(label+': '+phase)});
      await command('pause');const after=await command('timingDrift');
      if(before.enabled!==enabled||after.enabled!==enabled)throw Error('Timing mode changed during capture');
      const relaxCount=after.relaxCount-before.relaxCount,relaxUs=after.relaxUs-before.relaxUs;
      if(!Number.isSafeInteger(relaxCount)||!Number.isSafeInteger(relaxUs)||relaxCount<0||relaxUs<0||enabled&&(relaxCount!==0||relaxUs!==0))
        throw Error('Timing relaxation counters are inconsistent');
      await command('frameInput',{enabled:false});
      const{id,ok,...input}=await command('frameInputStats');
      const exercised=input.valid&&input.inputChanges?.length===2&&input.inputChanges.every(n=>n>=8)&&input.observedActions?.length===2&&input.observedActions.every(a=>a.length>=3);
      if(!exercised)throw Error('Timing comparison input was inactive');
      runs.push({...measured,enabled,warmup,timingDrift:{before,after,relaxCount,relaxUs,
        scope:'Paused diagnostic boundaries bracket the image interval. Host time conceded by pacing, not skipped game instructions.'},
        controllerStress:{...input,kind:'two native-frame human controller tracks',notHumanPlay:true,exercisedBothPlayers:true}});
      onResult({kind:'same-checkpoint-timing-drift-abba',passed:false,runs});
    }
    const inputConsistency=compareFrameInputDigests(runs);
    result={kind:'same-checkpoint-timing-drift-abba',passed:inputConsistency.passed&&runs.filter(r=>!r.warmup&&r.enabled).every(r=>r.passed),runs,inputConsistency};
  }catch(error){failed=error;}
  const errors=[];
  for(const cleanup of[()=>command('pause'),()=>command('frameInput',{enabled:false}),
    ()=>captured?command('release',{slot:5}):null,
    ()=>typeof original==='boolean'?command('timingDrift',{enabled:original}):null,
    ()=>host.adapter.request('start',{})]){
    try{await cleanup();}catch(error){errors.push(error.message);}
  }
  if(failed||errors.length)throw Error([failed?.message,...errors].filter(Boolean).join('; '));
  return result;
}

export async function verifyBrowserTimingDrift(host,inspect,{onProgress=()=>{},
  verify=verifyBrowserRunningCodegen}={}) {
  const command=(action,data={})=>host.adapter.request('browserRollback',{action,...data});
  const codegen=browserCodegenConfig(host),transitions=[];
  let original,result,failed;
  try {
    await command('pause');original=(await command('timingDrift')).enabled;
    if(typeof original!=='boolean')throw Error('Timing mode unavailable');
    const send=async(action,data={})=>{
      if(action==='codegen'){
        const{timingdrift,...config}=data;
        if(typeof timingdrift!=='boolean')throw Error('Replay timing mode missing');
        if(JSON.stringify(config)!==JSON.stringify(codegen))throw Error('Timing replay cannot change instruction configuration');
        const applied=await command('timingDrift',{enabled:timingdrift});
        if(applied.enabled!==timingdrift)throw Error('Replay timing mode did not apply');
        // Instruction configuration is identical throughout this experiment.
        // Avoid the codegen setter, which unnecessarily invalidates compiled
        // descriptors even when every instruction flag is unchanged.
        transitions.push(applied);return applied;
      }
      return command(action,data);
    };
    result=await verify(send,inspect,{frames:600,
      codegenReference:{...codegen,timingdrift:false},codegenComparison:{...codegen,timingdrift:true},
      originalCodegen:{...codegen,timingdrift:original},onProgress,
      resume:()=>host.adapter.request('start',{}),
      diagnostics:()=>host.adapter.request('rendererDiagnostics',{})});
    if(!transitions.some(s=>s.enabled)||!transitions.some(s=>!s.enabled))throw Error('Replay did not exercise both timing modes');
  }catch(error){failed=error;}
  const errors=[];
  for(const cleanup of[()=>command('pause'),()=>typeof original==='boolean'?command('timingDrift',{enabled:original}):null,()=>host.adapter.request('start',{})]){
    try{await cleanup();}catch(error){errors.push(error.message);}
  }
  if(failed||errors.length)throw Error([failed?.message,...errors].filter(Boolean).join('; '));
  return{...result,kind:'normal-running-browser-timing-drift-equivalence',timingTransitions:transitions};
}
