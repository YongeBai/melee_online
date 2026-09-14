import {browserCodegenConfig,compareFrameInputDigests} from './browser-benchmark.js';
import {verifyBrowserRunningCodegen} from './browser-running-replay.js';

export async function compareBrowserFrameRingLogging(host, seconds, inspect, {
  measure,onProgress=()=>{},onResult=()=>{},
}={}) {
  if(typeof measure!=='function')throw Error('Timing comparison requires image measurement');
  const command=(action,data={})=>action==='frameRingLogging'?host.adapter.request('frameRingLogging',data):host.adapter.request('browserRollback',{action,...data});
  const runs=[];let original,captured=false,result,failed;
  try {
    await command('pause');original=(await command('frameRingLogging')).enabled;
    if(typeof original!=='boolean')throw Error('Timing mode unavailable');
    await command('step');await command('capture',{slot:5});captured=true;
    for(const[index,enabled]of[true,false,false,true].entries())for(const warmup of[true,false]) {
      const label=`Frame-ring logging ${enabled?'on':'off'} ${warmup?'warmup':'measurement'} ${index+1}/4`;
      onProgress(label+': restore and settle');
      await command('pause');await command('restore',{slot:5});
      if((await command('frameRingLogging',{enabled})).enabled!==enabled)throw Error('Timing mode did not apply');
      for(let frame=0;frame<120;frame++)await command('step');
      await command('frameInput',{enabled:true});
      const before=await command('frameRingLogging');
      await host.adapter.request('start',{});
      const measured=await measure(host,seconds,inspect,{onPhase:phase=>onProgress(label+': '+phase)});
      await command('pause');const after=await command('frameRingLogging');
      if(before.enabled!==enabled||after.enabled!==enabled)throw Error('Timing mode changed during capture');
      const batches=after.batches-before.batches,rows=after.rows-before.rows,drainMs=after.drainMs-before.drainMs;
      if(!Number.isSafeInteger(batches)||!Number.isSafeInteger(rows)||!Number.isFinite(drainMs)||batches<0||rows<0||drainMs<0||(enabled?(batches===0||rows===0):(batches!==0||rows!==0)))throw Error('Frame logging counters are inconsistent');
      await command('frameInput',{enabled:false});
      const{id,ok,...input}=await command('frameInputStats');
      const exercised=input.valid&&input.inputChanges?.length===2&&input.inputChanges.every(n=>n>=8)&&input.observedActions?.length===2&&input.observedActions.every(a=>a.length>=3);
      if(!exercised)throw Error('Timing comparison input was inactive');
      runs.push({...measured,enabled,warmup,frameRingLogging:{before,after,batches,rows,drainMs,
        scope:'Paused diagnostic boundaries bracket the image interval. Worker console rows and time spent in the log drain; excludes downstream browser log processing. No emulator state changes.'},
        controllerStress:{...input,kind:'two native-frame human controller tracks',notHumanPlay:true,exercisedBothPlayers:true}});
      onResult({kind:'same-checkpoint-frame-ring-logging-abba',passed:false,runs});
    }
    const inputConsistency=compareFrameInputDigests(runs);
    result={kind:'same-checkpoint-frame-ring-logging-abba',passed:inputConsistency.passed&&runs.filter(r=>!r.warmup&&!r.enabled).every(r=>r.passed),runs,inputConsistency};
  }catch(error){failed=error;}
  const errors=[];
  for(const cleanup of[()=>command('pause'),()=>command('frameInput',{enabled:false}),
    ()=>captured?command('release',{slot:5}):null,
    ()=>typeof original==='boolean'?command('frameRingLogging',{enabled:original}):null,
    ()=>host.adapter.request('start',{})]){
    try{await cleanup();}catch(error){errors.push(error.message);}
  }
  if(failed||errors.length)throw Error([failed?.message,...errors].filter(Boolean).join('; '));
  return result;
}

export async function verifyBrowserFrameRingLogging(host,inspect,{onProgress=()=>{},
  verify=verifyBrowserRunningCodegen}={}) {
  const command=(action,data={})=>action==='frameRingLogging'?host.adapter.request('frameRingLogging',data):host.adapter.request('browserRollback',{action,...data});
  const codegen=browserCodegenConfig(host),transitions=[];
  let original,result,failed;
  try {
    await command('pause');original=(await command('frameRingLogging')).enabled;
    if(typeof original!=='boolean')throw Error('Timing mode unavailable');
    const send=async(action,data={})=>{
      if(action==='codegen'){
        const{frameringlogging,...config}=data;
        if(typeof frameringlogging!=='boolean')throw Error('Replay timing mode missing');
        if(JSON.stringify(config)!==JSON.stringify(codegen))throw Error('Timing replay cannot change instruction configuration');
        const applied=await command('frameRingLogging',{enabled:frameringlogging});
        if(applied.enabled!==frameringlogging)throw Error('Replay timing mode did not apply');
        // Instruction configuration is identical throughout this experiment.
        // Avoid the codegen setter, which unnecessarily invalidates compiled
        // descriptors even when every instruction flag is unchanged.
        transitions.push(applied);return applied;
      }
      return command(action,data);
    };
    result=await verify(send,inspect,{frames:600,
      codegenReference:{...codegen,frameringlogging:true},codegenComparison:{...codegen,frameringlogging:false},
      originalCodegen:{...codegen,frameringlogging:original},onProgress,
      resume:()=>host.adapter.request('start',{}),
      diagnostics:()=>host.adapter.request('rendererDiagnostics',{})});
    if(!transitions.some(s=>s.enabled)||!transitions.some(s=>!s.enabled))throw Error('Replay did not exercise both timing modes');
  }catch(error){failed=error;}
  const errors=[];
  for(const cleanup of[()=>command('pause'),()=>typeof original==='boolean'?command('frameRingLogging',{enabled:original}):null,()=>host.adapter.request('start',{})]){
    try{await cleanup();}catch(error){errors.push(error.message);}
  }
  if(failed||errors.length)throw Error([failed?.message,...errors].filter(Boolean).join('; '));
  return{...result,kind:'normal-running-browser-frame-ring-logging-equivalence',timingTransitions:transitions};
}
