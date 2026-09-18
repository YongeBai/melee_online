import {loadDirtyCore} from './dirty-runtime.mjs';
import {createRenderReplica} from './render-replica.mjs';
import {createPagedWasmCheckpointStore} from './paged-snapshot.mjs';
import {createPresentationCache} from './presentation-cache.mjs';
import {combatWorkload} from './combat-workload.mjs';
import {completeNativeSample} from './native-input.mjs';
import create from './melee-fighter-init.mjs';
import {runNativeConstructor} from './constructor-runner.mjs';
import {createSnapshotRuntime,createWasmCheckpointStore} from './wasm-snapshot.mjs';
import {createRollbackSession} from './rollback-session.mjs';
import {createRollbackAudio} from './rollback-audio.mjs';
const picture=document.querySelector('#picture');
const params=new URLSearchParams(location.search),frames=Number(params.get('frames')??240),seat=Number(params.get('seat')??0);
const fail=error=>{globalThis.rollbackFailure=String(error.stack??error);document.querySelector('#result').textContent=rollbackFailure;};
try{
 if(!Number.isInteger(frames)||frames<60||frames>1800||![0,1].includes(seat))throw Error('Diagnostic configuration');
 const dirty=params.get('replicacopy')==='dirty'?await loadDirtyCore():null;const audio=createRollbackAudio(),bytes=dirty?.bytes??new Uint8Array(await(await fetch('./melee-fighter-init.wasm')).arrayBuffer());
 const runtime=await createSnapshotRuntime(create,bytes,{dirtyManifest:dirty?.manifest,onNativeMusic:r=>audio.request(r),onNativeAudioMode:()=>true});
 runtime.module._portMenuDiagnosticMute();
 const presentationCache=params.get('gpucache')==='0'?null:createPresentationCache();
 const boot=await runNativeConstructor({module:runtime.module,presentationCache,canvas:picture,params:{tournament:1,hud:1,damagehud:1,intro:1,stagecallbacks:1,render:1,rendersteps:1,...(params.has('illusionrestore')?{illusionattachments:1}:{}),map:params.get('map')??'battlefield',character:params.get('character')??'Fc',opponent:params.get('opponent')??'Fx',gpuerrors:'deferred',...(params.get('map')==='fountain'?{fountaincosmetics:'off',fountainscenery:'off'}:{})},onMatchBoundary:async boundary=>{
  // The standalone constructor inserts settled/Ready/Go still images before
  // the canvas. Remove those diagnostics so screenshots show the corrected
  // live canvas, not the pre-intro image with hidden fighters and an unset HUD.
  for(const image of document.querySelectorAll('img[id^="native-preview-"]'))image.remove();
  const replicaAudio=params.get('presentation')==='replica'?createRollbackAudio():null,replicaRuntime=replicaAudio?await createSnapshotRuntime(create,bytes,{dirtyManifest:dirty?.manifest,memoryInitialPages:runtime.module.HEAPU8.length/65536,onNativeMusic:r=>replicaAudio.request(r),onNativeAudioMode:()=>true}):null;
  const replica=replicaRuntime?createRenderReplica(runtime,replicaRuntime,{sourceHost:audio,targetHost:replicaAudio,copyMode:dirty?'dirty':'full',auditDirty:true}):null;
  const replicaAudit=[];
  const paged=params.get('snapshot')!=='full';
  const store=(paged?createPagedWasmCheckpointStore:createWasmCheckpointStore)({...runtime,host:audio,sparse:!!dirty&&params.get('sparserestore')!=='0',auditSparse:params.get('snapshotaudit')==='1',maxBytes:2*1024**3}),module=runtime.module;
  const stageState=()=>params.get('map')==='fountain'?[0,1].map(i=>module._portFountainPlatformRead(0,i)):params.get('map')==='story'?[0,1].map(i=>module._portRandallRead(i)):params.get('map')==='stadium'?[0,1,2,3,4,5].map(i=>module._portStadiumRead(i)):params.get('map')==='dreamland'?[0,1,2].map(i=>module._portDreamlandWindRead(i,0)):[];
  const read=()=>({players:boundary.readPlayers(),partners:[0,1].map(p=>{const o=module._Player_GetEntityAtIndex(p,1);return o?Array.from({length:19},(_,i)=>module._portFighterConstructRead(o,i)):null;}),stage:stageState(),clock:[12,13,14].map(f=>module._portTournamentRead(f,0)),objects:module._portRuntimeObjectsUsed(),procs:module._portRuntimeProcsUsed()});
  const initial=store.capture();const initialHash=await store.hash(initial),initialState=read();store.restore(initial);
  // Restore both sides of the short-lived secondary Illusion/Phantasm model.
  // This opt-in correctness probe uses controller samples only, before the
  // ordinary delayed-input trial, and restores the original full boundary.
  const illusionRestore=[];
  if(params.has('illusionrestore')){
   if(!replica||!['Fx','Fc'].includes(params.get('character')))throw Error('Illusion restore requires a Fox/Falco replica');
   const captures=[];
   const walk=(buttons=0,x=0)=>{module._portControllerSample(0,buttons,x,0,0,0,0,0);module._portControllerSample(1,0,0,0,0,0,0,0);boundary.step();};
   const count=()=>module._portItemAttachmentsList(0,0);
   const capture=label=>{const checkpoint=store.capture();const row={label,checkpoint,attachments:count()};captures.push(row);return row;};
   try{
    for(let f=0;f<90;f++)walk();
    const direction=boundary.readPlayers()[0][4]>=0?-1:1;
    for(let f=0;f<8;f++)walk(0,direction*.5);for(let f=0;f<20;f++)walk();
    const before=capture('before-birth');if(before.attachments)throw Error('Unexpected pre-Illusion attachment');
    walk(0x200,direction);walk(0x200,direction);
    for(let f=0;!count()&&f<80;f++)walk();
    if(!count())throw Error('Illusion restore never spawned a secondary model');
    const live=capture('live-ghost');
    for(let f=0;f<120;f++)walk();
    const retired=capture('after-retirement');if(retired.attachments)throw Error('Illusion did not retire');
    const camera=d=>({resolution:d.resolution,eye:d.eye,interest:d.interest,fov:d.fov,aspect:d.aspect});
    for(const row of [before,live,retired,live,before,retired,live]){
     store.restore(row.checkpoint);if(count()!==row.attachments)throw Error('Attachment lifetime failed to restore');
     const expected=await store.hash(row.checkpoint);let rendered,rgba;
     replica.present(m=>boundary.createPreview(presentationCache,m),p=>{rendered=p.draw();p.validateGpu();rgba=pixels();});
     const unchanged=store.capture();const hash=await store.hash(unchanged);store.release(unchanged);
     if(hash.stateSha256!==expected.stateSha256)throw Error('Illusion replica changed full source state');
     const drawn=rendered.attachmentDraws?.filter(r=>r.draws>0).length??0;
     if(row.attachments?drawn===0:rendered.attachmentDraws?.length)throw Error('Restored ghost draw/retirement mismatch');
     let fresh,freshPixels,p;
     try{p=boundary.createPreview(null);fresh=p.draw();p.validateGpu();freshPixels=pixels();}finally{p?.dispose();store.restore(row.checkpoint);}
     const differentBytes=rgba.reduce((n,v,i)=>n+(v!==freshPixels[i]),0),sameCamera=JSON.stringify(camera(rendered))===JSON.stringify(camera(fresh));
     if(differentBytes||!sameCamera)throw Error('Restored Illusion pixel/camera oracle mismatch');
     const restored=store.capture(),restoredHash=await store.hash(restored);store.release(restored);
     if(restoredHash.stateSha256!==expected.stateSha256)throw Error('Fresh Illusion renderer failed complete restore');
     illusionRestore.push({label:row.label,attachments:row.attachments,drawn,differentBytes,rgbaBytes:rgba.length,sameCamera,camera:camera(rendered),stateSha256:hash.stateSha256});
    }
   }finally{store.restore(initial);for(const row of captures)store.release(row.checkpoint);}
  }
  // Identical predetermined normalized controller packets on both browsers;
  // no fighter/timer writes and no dependence on a predicted opponent position.
  const packets=[],combat=params.get('workload')==='combat',workload={hitlagFrames:0,damageFrames:0,attackFrames:0,stockChanges:0};
  function input(frame,p){if(packets[frame])return packets[frame][p];const cycle=frame%120;let x=frame<45?(p?-.65:.65):0;const buttons=cycle>=48&&cycle<52?0x100:cycle>=72&&cycle<76?0x400:cycle>=94&&cycle<98?0x200:0;return {pad:[buttons,x,frame<4?-1:0,0,0,0,0],tap:1};}
  const step=inputs=>{for(let p=0;p<2;p++){module._portTapJumpSet(p,inputs[p].tap);module._portControllerSample(p,...inputs[p].pad);}boundary.step();if(module._portTournamentRead(15,0))throw Error('Rollback diagnostic does not support speculative match endings');};
  const trace=[];let previous=boundary.readPlayers();for(let frame=0;frame<frames;frame++){if(combat)packets[frame]=combatWorkload(frame,previous).map(pad=>({pad:completeNativeSample(pad),tap:1}));step([input(frame,0),input(frame,1)]);const current=boundary.readPlayers();workload.hitlagFrames+=current.some(p=>p[14]>0);workload.damageFrames+=current.some(p=>p[13]>0);workload.attackFrames+=current.some(p=>p[0]>=44&&p[0]<=69);workload.stockChanges+=current.filter((p,i)=>p[18]!==previous[i][18]).length;previous=current;if(frame%30===29)trace.push(read());}if(combat&&(!workload.hitlagFrames||!workload.damageFrames))throw Error('Combat rollback workload did not reach contact');
  const expectedState=read(),reference=store.capture(),referenceHash=await store.hash(reference);store.restore(initial);
  const stats={replayPresentationCalls:0,presentations:0,presentationFrames:[],presentationCpuMs:[],replaying:false,illusionRestore,referenceTrace:trace,workload,initialHash,referenceHash,initialState,expectedState,wasmAudit:runtime.audit,audio:audio.snapshot()};
  function pixels(){const gl=picture.getContext('webgl2'),bytes=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,bytes);return bytes;}
  function present(frame){
   if(stats.replaying){stats.replayPresentationCalls++;throw Error('Presentation during replay');}
   const before=store.capture(),start=performance.now();
   if(replica){replica.present(m=>boundary.createPreview(presentationCache,m),p=>{const drawn=p.draw();p.validateGpu();stats.presentations++;stats.presentationFrames.push(frame);stats.render={resolution:drawn.resolution,eye:drawn.eye,interest:drawn.interest,fov:drawn.fov,aspect:drawn.aspect,draws:drawn.materialDraws?.draws??null};});const after=store.capture(),diff=store.compare(before,after);replicaAudit.push({frame,...diff});if(diff.changedBytes||diff.globalsChanged.some(Boolean)||diff.hostChanged)throw Error('Replica mutated game state');store.release(after);store.release(before);stats.presentationCpuMs.push(performance.now()-start);return;}
   let preview;
   try{preview=boundary.createPreview(presentationCache);const drawn=preview.draw();preview.validateGpu();stats.presentations++;stats.presentationFrames.push(frame);stats.render={resolution:drawn.resolution,eye:drawn.eye,interest:drawn.interest,fov:drawn.fov,aspect:drawn.aspect,draws:drawn.materialDraws?.draws??null};}
   finally{preview?.dispose();store.restore(before);store.release(before);stats.presentationCpuMs.push(performance.now()-start);}
  }
  const kernel=createRollbackSession({seat,store,step,onReplay:v=>{stats.replaying=v;}});
  const socket=new WebSocket(new URL('/rollback-probe',location.href).href.replace(/^http/,'ws'));
  let running=false,scheduled=false,sent=-1;
  socket.onmessage=event=>{try{const m=JSON.parse(event.data);if(m.type==='start'){running=true;schedule();}else if(m.type==='input'){kernel.receive(m.frame,m.value);schedule();}else if(m.type==='error')throw Error(m.message);}catch(e){fail(e);}};
  socket.onopen=()=>socket.send(JSON.stringify({type:'hello',seat,token:params.get('token')}));socket.onerror=()=>fail(Error('Diagnostic relay failed'));
  const start=performance.now();
  function schedule(){if(!running||scheduled||globalThis.rollbackReport||globalThis.rollbackFailure)return;scheduled=true;setTimeout(tick,16);}
  async function tick(){scheduled=false;try{
   if(kernel.frame<frames){if(sent<kernel.frame){sent=kernel.frame;socket.send(JSON.stringify({type:'input',frame:sent,value:input(sent,seat)}));}const advanced=kernel.advance(input(kernel.frame,seat));if(advanced&&kernel.frame%60===0&&kernel.frame<frames)present(kernel.frame);}
   kernel.reconcile();globalThis.rollbackProgress=kernel.snapshot();
   if(kernel.frame===frames&&kernel.confirmed===frames-1){running=false;const actualState=read(),final=store.capture(),finalHash=await store.hash(final);
    if(JSON.stringify(finalHash)!==JSON.stringify(referenceHash))throw Error('Corrected full-state hash mismatch '+JSON.stringify({referenceHash,finalHash,diff:store.compare(reference,final),expectedState,actualState}));
    // Rendering after correction is isolated: renderer-owned allocations and C
    // render cache mutations are discarded only after disposing every JS owner.
    if(stats.replaying)stats.replayPresentationCalls++;let preview,correctedPixels;
    const record=p=>{const drawn=p.draw();p.validateGpu();correctedPixels=pixels();stats.presentations++;stats.presentationFrames.push(frames);stats.render={resolution:drawn.resolution,eye:drawn.eye,interest:drawn.interest,fov:drawn.fov,aspect:drawn.aspect,draws:drawn.materialDraws?.draws??null};};if(replica)replica.present(m=>boundary.createPreview(presentationCache,m),record);else try{preview=boundary.createPreview(presentationCache);record(preview);}finally{preview?.dispose();}
    const rendered=store.capture();stats.afterPresentationHash=await store.hash(rendered);stats.renderMutation=store.compare(final,rendered);if(replica&&(stats.renderMutation.changedBytes||stats.renderMutation.globalsChanged.some(Boolean)||stats.renderMutation.hostChanged))throw Error('Final replica draw changed gameplay');store.release(rendered);store.restore(final);const restored=store.capture();stats.afterPresentationRestoreHash=await store.hash(restored);store.release(restored);
    if(stats.afterPresentationRestoreHash.stateSha256!==finalHash.stateSha256)throw Error('Renderer-detached restore failed');
    // Independent fresh GPU resources at the identical restored C boundary.
    // This oracle is excluded from presentation timing and progress counts.
    let oracle,oraclePixels,oracleDraw;
    try{oracle=boundary.createPreview(null);oracleDraw=oracle.draw();oracle.validateGpu();oraclePixels=pixels();}finally{oracle?.dispose();}
    const camera=d=>({resolution:d.resolution,eye:d.eye,interest:d.interest,fov:d.fov,aspect:d.aspect});
    stats.cameraOracle={sameAsFresh:JSON.stringify(camera(stats.render))===JSON.stringify(camera(oracleDraw)),corrected:camera(stats.render),fresh:camera(oracleDraw)};if(!stats.cameraOracle.sameAsFresh)throw Error('Replica camera differs from fresh renderer');
    const different=correctedPixels.reduce((n,v,i)=>n+(v!==oraclePixels[i]),0);
    const pixelHash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
    stats.pixelOracle={differentBytes:different,bytes:correctedPixels.length,cached:await pixelHash(correctedPixels),fresh:await pixelHash(oraclePixels)};
    if(different)throw Error('Retained GPU assets differ from fresh reconstruction '+JSON.stringify(stats.pixelOracle));
    store.restore(final);
    stats.renderMutatedWasm=stats.afterPresentationHash.stateSha256!==finalHash.stateSha256;
    globalThis.rollbackReport={passed:true,seat,frames,elapsedMs:performance.now()-start,...stats,kernel:kernel.snapshot(),presentationBoundary:replica?'independent-replica':'conservative',replicaAudit,replica:replica?.metrics()??null,snapshotCosts:store.metrics(),snapshotMode:paged?'pages':'full',presentationCache:presentationCache?.snapshot()??null,finalHash,actualState,audio:audio.snapshot(),scope:'Experimental complete-state prediction/correction; presentation boundary recorded separately. Final frame reconstructed at 960x720. Audio journal only; production still uses lockstep.'};
    document.querySelector('#result').textContent=JSON.stringify(rollbackReport,null,2);kernel.dispose();replica?.dispose();presentationCache?.dispose();store.release(final);store.release(reference);store.release(initial);store.dispose();socket.send(JSON.stringify({type:'done',hash:finalHash.stateSha256}));socket.close();return;
   }schedule();
  }catch(e){running=false;fail(e);kernel.dispose();socket.close();}}
  globalThis.rollbackReady={initialHash,referenceHash,bytes:initial.byteLength};
 }});if(boot.error)throw Error(boot.error);globalThis.rollbackBoot={fighterForms:boot.fighterForms,selectedCostumes:boot.selectedCostumes,stage:params.get('map')??'battlefield'};
}catch(e){fail(e);}
