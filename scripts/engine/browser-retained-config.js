import {browserCodegenConfig, compareFrameInputDigests, measureBrowserGameplayAsync, measureBrowserNativeInput} from './browser-benchmark.js';

// Revision-safe CPU/JIT settings already exercised individually in the lab.
// Keep experimental GX matrix and animation callback shortcuts out of this
// group: their exact replay or performance evidence is still incomplete.
const RETAINED_CPU_GROUP = Object.freeze({
  integerfifo:true, singleprefix:true, fpuguard:true, blockmerge:true,
  animstatefast:true, displaylistfast:true, leandispatch:true,
  gxmatrixfast:false, animcallbackfast:false, animfusion:false, hotfusion:false,
});

export async function compareRetainedBrowserConfig(host,seconds,inspect,{
  measure=measureBrowserGameplayAsync,onProgress=()=>{},onResult=()=>{},
}={}){
  if(seconds<30)throw Error('Retained CPU comparison requires at least 30 seconds per leg');
  const original=browserCodegenConfig(host);
  const candidate={...original,...RETAINED_CPU_GROUP};
  if(Object.entries(RETAINED_CPU_GROUP).every(([key,value])=>original[key]===value))
    throw Error('Retained CPU comparison needs an unoptimized baseline');
  const command=(action,data={})=>host.adapter.request('browserRollback',{action,...data});
  const runs=[];let captured=false;
  try{
    await command('pause');await command('step');await command('capture',{slot:5});captured=true;
    for(const [index,enabled] of[false,true,true,false].entries())for(const warmup of[true,false]){
      const label='Retained CPU '+(enabled?'enabled':'baseline')+' '+(warmup?'warmup':'measurement')+' '+(index+1)+'/4';
      onProgress(label+': applying codegen…');
      await command('pause');await command('codegen',enabled?candidate:original);
      await command('restore',{slot:5});
      onProgress(label+': settle 120 frames…');
      for(let frame=0;frame<120;frame++)await command('step');
      const measured=await measureBrowserNativeInput(host,seconds,inspect,{
        measure:(h,s,i)=>measure(h,s,i,{onPhase:phase=>onProgress(label+': '+phase+'…')}),
      });
      runs.push({...measured,enabled,warmup,codegen:enabled?candidate:original});
      onResult({kind:'same-checkpoint-retained-browser-config-abba',passed:false,runs});
    }
    const inputConsistency=compareFrameInputDigests(runs);
    return {kind:'same-checkpoint-retained-browser-config-abba',passed:inputConsistency.passed&&
      runs.filter(r=>r.enabled&&!r.warmup).every(r=>r.passed),inputConsistency,
      original,candidate,runs};
  }finally{
    const errors=[];
    for(const cleanup of[()=>command('pause'),()=>command('frameInput',{enabled:false}),
      ()=>captured?command('release',{slot:5}):null,()=>command('codegen',original),
      ()=>host.adapter.request('start',{})])try{await cleanup();}catch(error){errors.push(error);}
    if(errors.length)throw new AggregateError(errors,'Retained CPU comparison cleanup failed');
  }
}
