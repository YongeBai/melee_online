import create from './melee-fighter-init.mjs';
import {createPagedWasmCheckpointStore} from './paged-snapshot.mjs';
import {createPresentationCache} from './presentation-cache.mjs';
import {createRenderReplica} from './render-replica.mjs';
import {createRollbackAudio} from './rollback-audio.mjs';
import {createNativeRollbackDriver} from './native-rollback-driver.mjs';
import {createRollbackSession} from './rollback-session.mjs';
import {createSnapshotRuntime} from './wasm-snapshot.mjs';
import {createDirtyRangeTracker} from './dirty-runtime.mjs';

// Correctness-first product bridge. Simulation/checkpoints stay in the menu
// runtime; every visible frame is reconstructed in an independent WASM heap.
// This is the default two-player room path after clearing the product gate.
export async function createNativeProductRollback({source,wasmBytes,dirtyManifest=null,audio,network,step,createPreview,presentationCache=null}){
 if(!source?.module||!(wasmBytes instanceof Uint8Array)||!audio||!network?.active||typeof step!=='function'||typeof createPreview!=='function')throw Error('Incomplete product rollback boundary');
 const replicaAudio=createRollbackAudio(),target=await createSnapshotRuntime(create,wasmBytes,{dirtyManifest,memoryInitialPages:source.module.HEAPU8.length/65536,onNativeMusic:r=>replicaAudio.request(r),onNativeAudioMode:()=>true}),dirty=!!dirtyManifest;
 const cache=presentationCache??createPresentationCache();if(dirty)cache.trackDirty(createDirtyRangeTracker(target));const replica=createRenderReplica(source,target,{sourceHost:audio,targetHost:replicaAudio,copyMode:dirty?'dirty':'full'});
 const store=createPagedWasmCheckpointStore({...source,host:audio,sparse:dirty,maxBytes:1024**3});let session,driver,closed=false,lastCoverage=null,lastDraw=null;const warmup={frames:30,cpuMs:0},rollbackConfig={predictionWindow:3,receiveWindow:12,checkpointInterval:3};
 const present=()=>replica.present(module=>createPreview(cache,module),renderer=>{lastDraw=renderer.draw();renderer.validateGpu();lastCoverage=renderer.shaderCoverage?.()??null;return lastDraw;});
 try{
  const initial=store.capture(),began=performance.now();try{for(let frame=0;frame<warmup.frames;frame++){audio.beginFrame(frame);for(let seat=0;seat<2;seat++){source.module._portTapJumpSet(seat,1);source.module._portControllerSample(seat,0,0,0,0,0,0,0);}step();present();}}finally{store.restore(initial);store.release(initial);}warmup.cpuMs=performance.now()-began;
  session=createRollbackSession({seat:network.seat,store,window:rollbackConfig.predictionWindow,receiveWindow:rollbackConfig.receiveWindow,checkpointInterval:rollbackConfig.checkpointInterval,requireAcknowledgement:true,step(inputs,{frame}){audio.beginFrame(frame);for(const [seat,input]of inputs.entries()){source.module._portTapJumpSet(seat,input.tap);source.module._portControllerSample(seat,...input.pad);}step();},onConfirm:frame=>audio.confirm(frame)});
  driver=createNativeRollbackDriver({network,session});
 }catch(error){session?.dispose();replica.dispose();cache.dispose();store.dispose();throw error;}
 const preview={
  resetImmediateStats(){},
  draw(){if(closed)throw Error('Product rollback presentation disposed');return present();},
  validateGpu:()=>true,shaderCoverage:()=>lastCoverage,
  dispose(){if(closed)return;closed=true;driver.dispose();session.dispose();replica.dispose();cache.dispose();store.dispose();},
 };
 return {driver,preview,snapshot:()=>({warmup:{...warmup},rollbackConfig:{...rollbackConfig},session:session.snapshot(),replica:replica.metrics(),snapshots:store.metrics(),presentationCache:cache.snapshot(),lastDraw:lastDraw&&{resolution:lastDraw.resolution,eye:lastDraw.eye,interest:lastDraw.interest,fov:lastDraw.fov,aspect:lastDraw.aspect,gpuInfo:lastDraw.gpuInfo}})};
}
