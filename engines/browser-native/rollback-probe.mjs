import {combatWorkload} from './combat-workload.mjs';
import {completeNativeSample} from './native-input.mjs';
import create from './melee-fighter-init.mjs';
import {runNativeConstructor} from './constructor-runner.mjs';
import {createSnapshotRuntime,createWasmCheckpointStore} from './wasm-snapshot.mjs';
import {createRollbackSession} from './rollback-session.mjs';
import {createRollbackAudio} from './rollback-audio.mjs';
const params=new URLSearchParams(location.search),frames=Number(params.get('frames')??240),seat=Number(params.get('seat')??0);
const fail=error=>{globalThis.rollbackFailure=String(error.stack??error);document.querySelector('#result').textContent=rollbackFailure;};
try{
 if(!Number.isInteger(frames)||frames<60||frames>1800||![0,1].includes(seat))throw Error('Diagnostic configuration');
 const audio=createRollbackAudio(),bytes=new Uint8Array(await(await fetch('./melee-fighter-init.wasm')).arrayBuffer());
 const runtime=await createSnapshotRuntime(create,bytes,{onNativeMusic:r=>audio.request(r),onNativeAudioMode:()=>true});
 runtime.module._portMenuDiagnosticMute();
 const boot=await runNativeConstructor({module:runtime.module,canvas:document.querySelector('#picture'),params:{tournament:1,hud:1,damagehud:1,intro:1,stagecallbacks:1,render:1,rendersteps:1,map:params.get('map')??'battlefield',character:params.get('character')??'Fc',opponent:params.get('opponent')??'Fx',gpuerrors:'deferred',...(params.get('map')==='fountain'?{fountaincosmetics:'off',fountainscenery:'off'}:{})},onMatchBoundary:async boundary=>{
  // The standalone constructor inserts settled/Ready/Go still images before
  // the canvas. Remove those diagnostics so screenshots show the corrected
  // live canvas, not the pre-intro image with hidden fighters and an unset HUD.
  for(const image of document.querySelectorAll('img[id^="native-preview-"]'))image.remove();
  const store=createWasmCheckpointStore({...runtime,host:audio,maxBytes:2*1024**3}),module=runtime.module;
  const stageState=()=>params.get('map')==='fountain'?[0,1].map(i=>module._portFountainPlatformRead(0,i)):params.get('map')==='story'?[0,1].map(i=>module._portRandallRead(i)):params.get('map')==='stadium'?[0,1,2,3,4,5].map(i=>module._portStadiumRead(i)):params.get('map')==='dreamland'?[0,1,2].map(i=>module._portDreamlandWindRead(i,0)):[];
  const read=()=>({players:boundary.readPlayers(),partners:[0,1].map(p=>{const o=module._Player_GetEntityAtIndex(p,1);return o?Array.from({length:19},(_,i)=>module._portFighterConstructRead(o,i)):null;}),stage:stageState(),clock:[12,13,14].map(f=>module._portTournamentRead(f,0)),objects:module._portRuntimeObjectsUsed(),procs:module._portRuntimeProcsUsed()});
  const initial=store.capture();const initialHash=await store.hash(initial),initialState=read();store.restore(initial);
  // Identical predetermined normalized controller packets on both browsers;
  // no fighter/timer writes and no dependence on a predicted opponent position.
  const packets=[],combat=params.get('workload')==='combat',workload={hitlagFrames:0,damageFrames:0,attackFrames:0,stockChanges:0};
  function input(frame,p){if(packets[frame])return packets[frame][p];const cycle=frame%120;let x=frame<45?(p?-.65:.65):0;const buttons=cycle>=48&&cycle<52?0x100:cycle>=72&&cycle<76?0x400:cycle>=94&&cycle<98?0x200:0;return {pad:[buttons,x,frame<4?-1:0,0,0,0,0],tap:1};}
  const step=inputs=>{for(let p=0;p<2;p++){module._portTapJumpSet(p,inputs[p].tap);module._portControllerSample(p,...inputs[p].pad);}boundary.step();if(module._portTournamentRead(15,0))throw Error('Rollback diagnostic does not support speculative match endings');};
  const trace=[];let previous=boundary.readPlayers();for(let frame=0;frame<frames;frame++){if(combat)packets[frame]=combatWorkload(frame,previous).map(pad=>({pad:completeNativeSample(pad),tap:1}));step([input(frame,0),input(frame,1)]);const current=boundary.readPlayers();workload.hitlagFrames+=current.some(p=>p[14]>0);workload.damageFrames+=current.some(p=>p[13]>0);workload.attackFrames+=current.some(p=>p[0]>=44&&p[0]<=69);workload.stockChanges+=current.filter((p,i)=>p[18]!==previous[i][18]).length;previous=current;if(frame%30===29)trace.push(read());}if(combat&&(!workload.hitlagFrames||!workload.damageFrames))throw Error('Combat rollback workload did not reach contact');
  const expectedState=read(),reference=store.capture(),referenceHash=await store.hash(reference);store.restore(initial);
  const stats={replayPresentationCalls:0,presentations:0,presentationFrames:[],presentationCpuMs:[],replaying:false,referenceTrace:trace,workload,initialHash,referenceHash,initialState,expectedState,wasmAudit:runtime.audit,audio:audio.snapshot()};
  function present(frame){
   if(stats.replaying){stats.replayPresentationCalls++;throw Error('Presentation during replay');}
   const before=store.capture(),start=performance.now();let preview;
   try{preview=boundary.createPreview();const drawn=preview.draw();preview.validateGpu();stats.presentations++;stats.presentationFrames.push(frame);stats.render={resolution:drawn.resolution,eye:drawn.eye,interest:drawn.interest,fov:drawn.fov,aspect:drawn.aspect,draws:drawn.materialDraws?.draws??null};}
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
    if(stats.replaying)stats.replayPresentationCalls++;let preview;
    try{preview=boundary.createPreview();const drawn=preview.draw();preview.validateGpu();stats.presentations++;stats.presentationFrames.push(frames);stats.render={resolution:drawn.resolution,eye:drawn.eye,interest:drawn.interest,fov:drawn.fov,aspect:drawn.aspect,draws:drawn.materialDraws?.draws??null};}finally{preview?.dispose();}
    const rendered=store.capture();stats.afterPresentationHash=await store.hash(rendered);stats.renderMutation=store.compare(final,rendered);store.release(rendered);store.restore(final);const restored=store.capture();stats.afterPresentationRestoreHash=await store.hash(restored);store.release(restored);
    if(stats.afterPresentationRestoreHash.stateSha256!==finalHash.stateSha256)throw Error('Renderer-detached restore failed');
    stats.renderMutatedWasm=stats.afterPresentationHash.stateSha256!==finalHash.stateSha256;
    globalThis.rollbackReport={passed:true,seat,frames,elapsedMs:performance.now()-start,...stats,kernel:kernel.snapshot(),snapshotCosts:store.metrics(),finalHash,actualState,audio:audio.snapshot(),scope:'Experimental same-instance snapshot + prediction/correction with renderer detached. Final frame reconstructed at 960x720. Audio journal only; production still uses lockstep.'};
    document.querySelector('#result').textContent=JSON.stringify(rollbackReport,null,2);kernel.dispose();store.release(final);store.release(reference);store.release(initial);socket.send(JSON.stringify({type:'done',hash:finalHash.stateSha256}));socket.close();return;
   }schedule();
  }catch(e){running=false;fail(e);kernel.dispose();socket.close();}}
  globalThis.rollbackReady={initialHash,referenceHash,bytes:initial.byteLength};
 }});if(boot.error)throw Error(boot.error);globalThis.rollbackBoot={fighterForms:boot.fighterForms,selectedCostumes:boot.selectedCostumes,stage:params.get('map')??'battlefield'};
}catch(e){fail(e);}
