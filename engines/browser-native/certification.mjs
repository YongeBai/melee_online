import {loadDirtyCore} from './dirty-runtime.mjs';
import {createRenderReplica} from './render-replica.mjs';
import create from './melee-fighter-init.mjs';
import {runNativeConstructor} from './constructor-runner.mjs';
import {createSnapshotRuntime} from './wasm-snapshot.mjs';
import {createPagedWasmCheckpointStore} from './paged-snapshot.mjs';
import {createPresentationCache} from './presentation-cache.mjs';
import {createRollbackSession} from './rollback-session.mjs';
import {createRollbackAudio} from './rollback-audio.mjs';
import {combatWorkload} from './combat-workload.mjs';
import {completeNativeSample} from './native-input.mjs';
import {createNativeFrameClock} from './native-live.mjs';
import {distribution,cadence,observeCanvasFrames} from './frame-evidence.mjs';
const params=new URLSearchParams(location.search),picture=document.querySelector('#picture');
const frames=Number(params.get('frames')??1800),seat=Number(params.get('seat')??0),mode=params.get('mode')??'local',detached=mode!=='local',rollback=mode==='rollback';
const fail=e=>{globalThis.certificationFailure=String(e.stack??e);document.querySelector('#result').textContent=certificationFailure;};
if(mode==='calibration'){
 try{const gl=picture.getContext('webgl2',{alpha:false,antialias:false}),observer=observeCanvasFrames(picture),times=[];let n=0;const start=performance.now();
 await new Promise((resolve,reject)=>{function tick(){try{gl.clearColor((n%251+1)/252,((n*3)%241+1)/242,.2,1);gl.clear(gl.COLOR_BUFFER_BIT);times.push(performance.now());observer.request();if(++n<frames)requestAnimationFrame(tick);else resolve();}catch(e){reject(e);}}requestAnimationFrame(tick);});
 const elapsed=performance.now()-start,observation=await observer.stop();globalThis.certificationReport={mode,frames,elapsedMs:elapsed,simulationFps:frames*1000/elapsed,submissionCadence:cadence(times),observation,performanceCertified:false,scope:'WebGL test-pattern observer calibration only; no gameplay.'};
 document.querySelector('#result').textContent=JSON.stringify(certificationReport,null,2);
 }catch(e){fail(e);}
}else try{
 if(!Number.isInteger(frames)||frames<60||frames>3600||!['local','isolated','rollback'].includes(mode)||![0,1].includes(seat))throw Error('Certification configuration');
 const dirty=params.get('replicacopy')==='dirty'?await loadDirtyCore():null;const audio=createRollbackAudio(),bytes=dirty?.bytes??new Uint8Array(await(await fetch('./melee-fighter-init.wasm')).arrayBuffer());
 const runtime=await createSnapshotRuntime(create,bytes,{dirtyManifest:dirty?.manifest,onNativeMusic:r=>audio.request(r),onNativeAudioMode:()=>true}),module=runtime.module,cache=createPresentationCache({submissionOptimized:params.get('drawopt')!=='0',packedState:params.get('packedstate')!=='0',reuseImmediate:params.get('immediatereuse')==='0'?false:params.get('immediatereuse')==='1'?true:undefined});
 module._portMenuDiagnosticMute();
 const boot=await runNativeConstructor({module,presentationCache:cache,canvas:picture,params:{tournament:1,hud:1,damagehud:1,intro:1,stagecallbacks:1,render:1,rendersteps:1,map:params.get('map')??'battlefield',character:params.get('character')??'Fc',opponent:params.get('opponent')??'Fx',gpuerrors:'deferred',...(params.get('map')==='fountain'?{fountaincosmetics:'off',fountainscenery:'off'}:{})},onMatchBoundary:async boundary=>{
  for(const image of document.querySelectorAll('img[id^="native-preview-"]'))image.remove();
  // Constructor diagnostic wrappers must not change the requested presentation.
  document.querySelector('#presentation').append(picture);
  const replicaMode=params.get('presentation')==='replica';if(replicaMode&&!detached)throw Error('Replica requires isolated or rollback diagnostic');
  const replicaAudio=replicaMode?createRollbackAudio():null,replicaRuntime=replicaMode?await createSnapshotRuntime(create,bytes,{dirtyManifest:dirty?.manifest,memoryInitialPages:module.HEAPU8.length/65536,onNativeMusic:r=>replicaAudio.request(r),onNativeAudioMode:()=>true}):null;
  const replica=replicaMode?createRenderReplica(runtime,replicaRuntime,{sourceHost:audio,targetHost:replicaAudio,copyMode:dirty?'dirty':'full',auditDirty:params.get("dirtyaudit")==="1"}):null;
  const frameOracleEnabled=params.get('frameoracle')==='1';
  if(frameOracleEnabled&&(!replica||mode!=='isolated'||params.get('dirtyaudit')!=='1'))throw Error('Per-frame oracle requires isolated audited replica');
  const frameOracleCache=frameOracleEnabled?createPresentationCache({packedState:false,reuseImmediate:false}):null,frameOracle={enabled:frameOracleEnabled,frames:0,comparedBytes:0,differentBytes:0,cameraMismatches:0};
  const readPixels=()=>{const gl=picture.getContext('webgl2'),b=new Uint8Array(960*720*4);gl.readPixels(0,0,960,720,gl.RGBA,gl.UNSIGNED_BYTE,b);return b;};
  const store=createPagedWasmCheckpointStore({...runtime,host:audio,maxBytes:2*1024**3});
  const initial=store.capture(),packets=[],workload={hitlagFrames:0,damageFrames:0,attackFrames:0,stockChanges:0};
  const corrections=[],sim=[],replaySim=[],advance=[],copy=[],capture=[],rebind=[],draw=[],dispose=[],restore=[],total=[],times=[],cameras=[];
  let replayStart=0,replaying=false,measuring=false,previous=boundary.readPlayers(),lastDraw=null,forward=0,stopped=false,socket=null,kernel=null,persistent=null,observer=null,start=null,finishTime=null,clock=null;
  const rawStep=inputs=>{for(let p=0;p<2;p++){module._portTapJumpSet(p,inputs[p].tap);module._portControllerSample(p,...inputs[p].pad);}boundary.step();if(module._portTournamentRead(15,0))throw Error('Diagnostic reached match ending');};
  for(let f=0;f<frames;f++){packets[f]=combatWorkload(f,previous).map(pad=>({pad:completeNativeSample(pad),tap:1}));rawStep(packets[f]);const current=boundary.readPlayers();workload.hitlagFrames+=current.some(p=>p[14]>0);workload.damageFrames+=current.some(p=>p[13]>0);workload.attackFrames+=current.some(p=>p[0]>=44&&p[0]<=69);workload.stockChanges+=current.filter((p,i)=>p[18]!==previous[i][18]).length;previous=current;}
  const reference=store.capture(),referenceHash=await store.hash(reference),expectedPlayers=boundary.readPlayers();store.restore(initial);
  let lastForwardPlayers=boundary.readPlayers();const actualWorkload={hitlagFrames:0,damageFrames:0,attackFrames:0,stockChanges:0};
  const measuredStep=(inputs,{replay=false}={})=>{const t=performance.now();rawStep(inputs);if(measuring)(replay?replaySim:sim).push(performance.now()-t);};
  const camera=d=>({resolution:d.resolution,eye:d.eye,interest:d.interest,fov:d.fov,aspect:d.aspect,near:d.near,far:d.far});
  function drawFrame(preview){const t=performance.now();lastDraw=preview.draw();draw.push(performance.now()-t);observer.request();times.push(performance.now());cameras.push(camera(lastDraw));}
  function present(){if(replaying)throw Error('Presentation during replay');
   if(replica){const before=replica.metrics();replica.present(renderModule=>{const t=performance.now(),preview=boundary.createPreview(cache,renderModule);rebind.push(performance.now()-t);return {...preview,dispose(){const d=performance.now();preview.dispose();dispose.push(performance.now()-d);}};},drawFrame);copy.push(replica.metrics().copyCpuMs-before.copyCpuMs);
    if(frameOracleCache){
      const expected=readPixels(),expectedCamera=camera(lastDraw);let actual,actualCamera;
      replica.present(m=>boundary.createPreview(frameOracleCache,m),view=>{actualCamera=camera(view.draw());view.validateGpu();actual=readPixels();});
      let different=0;for(let i=0;i<expected.length;i++)different+=expected[i]!==actual[i];
      frameOracle.frames++;frameOracle.comparedBytes+=expected.length;frameOracle.differentBytes+=different;frameOracle.cameraMismatches+=JSON.stringify(expectedCamera)!==JSON.stringify(actualCamera);
      if(different||frameOracle.cameraMismatches){const firstDifferences=[];for(let i=0;i<expected.length&&firstDifferences.length<12;i++)if(expected[i]!==actual[i])firstDifferences.push({at:i,want:expected[i],got:actual[i]});throw Error('Per-frame staging oracle mismatch '+JSON.stringify({frame:forward,differentBytes:different,cameraMismatches:frameOracle.cameraMismatches,firstDifferences}));}
    }
    return;}
   let before=null,preview=persistent,t=performance.now();
   if(detached){before=store.capture();capture.push(performance.now()-t);t=performance.now();preview=boundary.createPreview(cache);rebind.push(performance.now()-t);}
   try{drawFrame(preview);}
   finally{if(detached){t=performance.now();preview?.dispose();dispose.push(performance.now()-t);t=performance.now();store.restore(before);restore.push(performance.now()-t);store.release(before);}}
  }
  async function finish(){stopped=true;finishTime=performance.now();const replicaMeasured=replica?.metrics()??null;const observation=await observer.stop();persistent?.validateGpu();persistent?.dispose();persistent=null;
   const actualPlayers=boundary.readPlayers(),final=store.capture(),finalHash=await store.hash(final);let oracle,oracleCamera,cachedCamera,cachedPixels,freshPixels;
   const pixels=readPixels;
   // Post-run corrected frame and independent fresh renderer, outside timing.
   if(replica)replica.present(m=>boundary.createPreview(cache,m),view=>{cachedCamera=camera(view.draw());view.validateGpu();cachedPixels=pixels();});
   else try{oracle=boundary.createPreview(cache);cachedCamera=camera(oracle.draw());oracle.validateGpu();cachedPixels=pixels();}finally{oracle?.dispose();store.restore(final);}
   try{oracle=boundary.createPreview(null);oracleCamera=camera(oracle.draw());oracle.validateGpu();freshPixels=pixels();}finally{oracle?.dispose();store.restore(final);}
   const differentBytes=cachedPixels.reduce((n,v,i)=>n+(v!==freshPixels[i]),0);
   const sameCamera=JSON.stringify(cachedCamera)===JSON.stringify(oracleCamera);
   const stateMatches=finalHash.stateSha256===referenceHash.stateSha256;
   const elapsed=finishTime-start,submission=cadence(times),failures=[];
   if(frames<1800)failures.push('Less than 1800 forward frames; short probe only');
   if(!actualWorkload.hitlagFrames||!actualWorkload.damageFrames)failures.push('Forward combat did not demonstrate contact');
   if(forward!==frames||draw.length!==frames)failures.push('Not every forward frame was drawn');
   if(differentBytes)failures.push('Final cached pixels differ from fresh native renderer');
   if(!sameCamera)failures.push('Final camera differs from fresh native reconstruction');
   if(detached&&!stateMatches)failures.push('Corrected complete-state mismatch');
   if(1000*forward/elapsed<59.5||submission.fps<59.5||submission.p95Ms>20||submission.maxMs>50)failures.push('Simulation/submission cadence below 720p60 gate');
   if(!observation.enabled||observation.error||observation.blackFrames||observation.wrongSize||observation.captured<frames*.99||observation.cadence.fps<59.5)failures.push('Browser captured-frame cadence/content gate failed');
   // Headless canvas capture cannot certify actual compositor scanout or
   // tournament completeness. Never promote this to production certification.
   globalThis.certificationReport={diagnosticPassed:!failures.length,performanceCertified:false,failures,mode,seat,frames,elapsedMs:elapsed,simulationFps:1000*forward/elapsed,drawSubmissions:draw.length,submissionCadence:submission,observation,workload,actualWorkload,referenceHash,finalHash,stateMatches,measuredPlayersMatchReference:JSON.stringify(actualPlayers)===JSON.stringify(expectedPlayers),expectedPlayers,actualPlayers,pixelOracle:{differentBytes,comparedBytes:cachedPixels.length},frameOracle,camera:{sameAsFresh:sameCamera,corrected:cachedCamera,first:cameras[0],last:cameras.at(-1),fresh:oracleCamera,validatedEveryDraw:true},costs:{simulation:distribution(sim),correction:distribution(corrections),replaySimulation:distribution(replaySim),advanceIncludingCorrections:distribution(advance),presentationCopy:distribution(copy),presentationCapture:distribution(capture),rendererRebind:distribution(rebind),drawSubmission:distribution(draw),rendererDispose:distribution(dispose),presentationRestore:distribution(restore),forwardCallback:distribution(total)},kernel:kernel?.snapshot()??null,presentationBoundary:replica?'independent-replica':'conservative',replica:replicaMeasured,snapshotCosts:store.metrics(),cache:cache.snapshot(),gpuInfo:lastDraw?.gpuInfo,browser:navigator.userAgent,presentation:{width:1280,height:720,picture:[960,720],rect:picture.getBoundingClientRect().toJSON()},inputToPhoton:{measured:false,reason:'No physical input/display sensor; canvas capture is not photon timing.'},scope:'Diagnostic only; local retains native draw writes; detached modes isolate draw writes using the recorded presentation boundary; audio journal only.'};
   document.querySelector('#result').textContent=JSON.stringify(certificationReport,null,2);kernel?.dispose();replica?.dispose();frameOracleCache?.dispose();cache.dispose();store.release(final);store.release(reference);store.release(initial);store.dispose();socket?.close();
  }
  function tick(now){if(stopped)return;try{if(!clock.take(now,1)){requestAnimationFrame(tick);return;}const t=performance.now();let advanced=true;
   if(rollback){if(sent<kernel.frame){sent=kernel.frame;socket.send(JSON.stringify({type:'input',frame:sent,value:packets[sent][seat]}));}const a=performance.now();advanced=kernel.advance(packets[kernel.frame][seat]);advance.push(performance.now()-a);forward=kernel.frame;}
   else{measuredStep(packets[forward]);forward++;}
   if(advanced){const current=boundary.readPlayers();actualWorkload.hitlagFrames+=current.some(p=>p[14]>0);actualWorkload.damageFrames+=current.some(p=>p[13]>0);actualWorkload.attackFrames+=current.some(p=>p[0]>=44&&p[0]<=69);actualWorkload.stockChanges+=current.filter((p,i)=>p[18]!==lastForwardPlayers[i][18]).length;lastForwardPlayers=current;present();}total.push(performance.now()-t);globalThis.certificationProgress={forward,draws:draw.length,elapsedMs:performance.now()-start,kernel:kernel?.snapshot()};
   if(forward===frames){if(rollback){drain();return;}void finish().catch(fail);return;}requestAnimationFrame(tick);
  }catch(e){stopped=true;fail(e);persistent?.dispose();void observer?.stop();kernel?.dispose();socket?.close();}}
  function drain(){if(stopped)return;try{const t=performance.now();kernel.reconcile();advance.push(performance.now()-t);if(kernel.confirmed===frames-1){void finish().catch(fail);return;}setTimeout(drain,5);}catch(e){fail(e);stopped=true;socket?.close();}}
  function begin(){if(measuring)return;observer=observeCanvasFrames(picture,{enabled:params.get('observer')!=='0'});if(!detached)persistent=boundary.createPreview(cache);measuring=true;start=performance.now();clock=createNativeFrameClock(start,60,{align:true,toleranceMs:.25});requestAnimationFrame(tick);}
  let sent=-1;
  if(rollback){kernel=createRollbackSession({seat,store,step:measuredStep,onReplay:v=>{replaying=v;if(v)replayStart=performance.now();else corrections.push(performance.now()-replayStart);}});socket=new WebSocket(new URL('/rollback-probe',location.href).href.replace(/^http/,'ws'));socket.onopen=()=>socket.send(JSON.stringify({type:'hello',seat,token:params.get('token')}));socket.onmessage=e=>{try{const m=JSON.parse(e.data);if(m.type==='start')begin();else if(m.type==='input')kernel.receive(m.frame,m.value);else if(m.type==='error')throw Error(m.message);}catch(e){stopped=true;fail(e);socket.close();}};socket.onerror=()=>fail(Error('Diagnostic relay failed'));}
  else begin();
 }});if(boot.error)throw Error(boot.error);globalThis.certificationBoot={fighterForms:boot.fighterForms,stage:params.get('map')??'battlefield'};
}catch(e){fail(e);}
