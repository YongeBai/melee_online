import {browserCodegenConfig,compareFrameInputDigests} from './browser-benchmark.js';

// Execution-throughput diagnostic only. Browser image cadence and physical
// input latency require their separate measurements; this can never pass60fps.
export async function compareFixedNativeWork(host,frames,inspect,{feature='counterbatch',retainedFpuGuard=false,retainedBranchFusion=false,retainedReadFusion=false,onProgress=()=>{},onResult=()=>{},sleep=ms=>new Promise(r=>setTimeout(r,ms)),now=()=>performance.now(),timeoutMs=120000}={}){
 if(!Number.isInteger(frames)||frames<1200||frames>3600)throw Error('Fixed work requires1200–3600 native frames');
 const original=browserCodegenConfig(host);
 if(typeof original[feature]!=='boolean')throw Error('Unsupported fixed-work feature');
 const common={...original,...(retainedFpuGuard?{fpuguard:true}:{}),...(retainedBranchFusion?{branchfusion:true}:{}),...(retainedReadFusion?{readfusion:true}:{})};
 const command=(action,data={})=>host.adapter.request('browserRollback',{action,...data});
 const runs=[];let captured=false,referenceCaptured=false,candidateCaptured=false;
 try{
  await command('pause');await command('codegen',{...common,[feature]:false});await command('step');
  await command('capture',{slot:5});captured=true;
  for(const[index,enabled]of[false,true,true,false].entries())for(const warmup of[true,false]){
   const label=feature+' '+(enabled?'on':'off')+' '+(warmup?'warmup':'measurement')+' '+(index+1)+'/4';
   onProgress(label+': restore and settle');await command('pause');await command('restore',{slot:5});
   const config={...common,[feature]:enabled};await command('codegen',config);
   for(let frame=0;frame<120;frame++)await command('step');
   await command('frameInput',{enabled:true});await command('frameInputStop',{frames});
   const start=now();await host.adapter.request('start',{});
   let stats;
   for(;;){
    await sleep(100);const{id,ok,...input}=await command('frameInputStats');stats=input;
    onProgress(label+': native frame '+(stats.lastFrame-stats.startFrame)+'/'+frames);
    if(stats.completed)break;
    if(!stats.active||!stats.valid)throw Error('Fixed workload became invalid');
    if(now()-start>timeoutMs)throw Error('Fixed workload timed out');
   }
   await command('pause');
   const{id,ok,...timing}=await command('frameInputTiming');
   if(!timing.valid||timing.frames!==frames||timing.startFrame!==stats.startFrame||timing.stopFrame!==stats.stoppedFrame||timing.stopFrame-timing.startFrame!==frames||!Number.isFinite(timing.elapsedMs)||timing.elapsedMs<=0)throw Error('Native timer did not bracket the exact workload');
   const state=await inspect();
   const exercised=stats.valid&&stats.inputChanges?.every(n=>n>=8)&&stats.observedActions?.every(a=>a.length>=3);
   if(!exercised||state.sceneFrame!==stats.stoppedFrame)throw Error('Fixed workload was inactive or stopped outside its target frame');
   const result={enabled,warmup,config,frames,nativeWorkFps:frames*1000/timing.elapsedMs,timing,diagnosticOnly:true,passed:false,controllerStress:{...stats,kind:'two native-frame controller tracks',notHumanPlay:true,exercisedBothPlayers:true}};
   if(!warmup){
    if(!referenceCaptured){await command('capture',{slot:4});referenceCaptured=true;result.referenceCapture=true;}
    else{candidateCaptured=true;await command('capture',{slot:0});const comparison=await command('equal',{a:4,b:0});result.fullMachineBytesEqual=comparison.equal;result.comparison=comparison.comparison;await command('release',{slot:0});candidateCaptured=false;}
   }
   await command('frameInput',{enabled:false});runs.push(result);
   onResult({kind:'fixed-native-work-abba',feature,frames,diagnosticOnly:true,passed:false,runs});
  }
  const inputConsistency=compareFrameInputDigests(runs);
  return{kind:'fixed-native-work-abba',feature,frames,diagnosticOnly:true,passed:false,equivalencePassed:inputConsistency.passed&&runs.filter(r=>!r.warmup&&!r.referenceCapture).every(r=>r.fullMachineBytesEqual),inputConsistency,runs};
 }finally{
  const errors=[];
  for(const cleanup of[()=>command('pause'),()=>command('frameInput',{enabled:false}),()=>captured?command('release',{slot:5}):null,()=>referenceCaptured?command('release',{slot:4}):null,()=>candidateCaptured?command('release',{slot:0}):null,()=>command('codegen',original),()=>host.adapter.request('start',{})]){
   try{await cleanup();}catch(error){errors.push(error);}
  }
  if(errors.length)throw new AggregateError(errors,'Fixed-work cleanup failed');
 }
}
