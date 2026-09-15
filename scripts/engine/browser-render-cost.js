import {measureBrowserHeadroom} from './browser-headroom.js';
import {measureWithJitCounters} from './browser-jit-measurement.js';
import {compareFrameInputDigests,summarizeCoreProfile} from './browser-benchmark.js';

// Coarse opportunity bound: identical fixed native work with and without
// scene-object draw dispatch. Every result is diagnostic, including controls.
export async function measureBrowserRenderCost(host,inspect,{
  frames=1200,scope='scene',onProgress=()=>{},onResult=()=>{},measure=measureBrowserHeadroom,
}={}){
  if(!Number.isInteger(frames)||frames<1200||frames>3600)throw Error('Render cost requires 1200–3600 native frames');
  const links=scope.startsWith('link-'),group=links?scope.slice(5):'';
  if(!['scene','mesh','matrixsetup','rigidmatrix','sharedmatrix','envelope','drawable','texture','tev','link-stage','link-fighters','link-effects','link-hud','link-shadows','link-environment','yoshi-static'].includes(scope))throw Error('Unknown render-cost scope');
  const command=(action,data={})=>host.adapter.request('browserRollback',{action,...data});
  const render=enabled=>host.adapter.request('meleeControl',scope==='yoshi-static'
    ?{action:'yoshiStableDrawCostDiagnostic',enabled}
    :links?{action:'renderLinkDiagnostic',enabled,group}:{action:'renderCostDiagnostic',enabled,scope});
  const runs=[];let captured=false,failed,result;
  try{
    await command('pause');await command('step');await render(true);
    await command('capture',{slot:5});captured=true;
    for(const[index,enabled]of[true,false,false,true].entries())for(const warmup of[true,false]){
      const label=`Render ${scope} ${enabled?'normal':'bypassed'} ${warmup?'warmup':'measurement'} ${index+1}/4`;
      onProgress(label+': restoring checkpoint');
      await command('pause');await command('restore',{slot:5});await render(enabled);
      const coreBefore=(await host.adapter.request('rendererDiagnostics',{})).coreProfile;
      const measured=await measureWithJitCounters(host,()=>measure(host,inspect,{
        frames,onProgress:text=>onProgress(label+': '+text),
      }));
      const coreAfter=(await host.adapter.request('rendererDiagnostics',{})).coreProfile;
      measured.coreProfile=summarizeCoreProfile(coreBefore,coreAfter,measured.timing?.elapsedMs/1000);
      await command('pause');
      const verified=await render(enabled);
      if((verified.writes||verified.codeWrites).length)throw Error('Render diagnostic hook changed during the workload');
      runs.push({...measured,renderDispatch:enabled,warmup,diagnosticOnly:true,passed:false});
      onResult({kind:'render-dispatch-cost-abba',scope,frames,runs,diagnosticOnly:true,passed:false});
    }
    result={kind:'render-dispatch-cost-abba',scope,frames,runs,diagnosticOnly:true,passed:false,
      inputConsistency:compareFrameInputDigests(runs),
      limits:'Uncapped host pacing; blank/incomplete images when dispatch is bypassed. Combined guest render callbacks and downstream graphics opportunity, not GPU-only or additive CPU time. Divergent gameplay fingerprints invalidate a matched-work interpretation. No image acceptance or physical latency claim.'};
  }catch(error){failed=error;}
  const errors=[];
  for(const cleanup of[()=>command('pause'),()=>command('unthrottled',{enabled:false}),
    ()=>command('frameInput',{enabled:false}),()=>captured?command('restore',{slot:5}):null,
    ()=>render(true),()=>captured?command('release',{slot:5}):null,()=>host.adapter.request('start',{})]){
    try{await cleanup();}catch(error){errors.push(error.message);}
  }
  if(failed||errors.length)throw Error([failed?.message,...errors].filter(Boolean).join('; '));
  return result;
}
