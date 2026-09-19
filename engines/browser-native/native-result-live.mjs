import {convertResultSceneAsset} from './menu-assets.mjs';
import {convertSisAsset} from './sis-assets.mjs';
import {convertResultMotionAsset} from './result-motion-assets.mjs';
import {installResidentFile} from './resident-files.mjs';
import {createNativeResultScenePreview} from './native-result-scene-preview.mjs';
import {createNativeMatchPreview} from './native-match-preview.mjs';
import {installResultEfbCopy} from './result-efb.mjs';
import {createNativeFrameClock} from './native-live.mjs';
import {validateResults} from './native-results.mjs';
import {decodeGX} from './texture.mjs';
const characterCodes=['Ca','Dk','Fx','Gw','Kb','Kp','Lk','Lg','Mr','Ms','Mt','Ns','Pe','Pk','Pp','Pr','Ss','Ys','Zd','Sk','Fc','Cl','Dr','Fe','Pc','Gn'];

async function hosted(name){const response=await fetch('./fixtures/'+name);if(!response.ok)throw Error('Hosted result asset unavailable: '+name);return new Uint8Array(await response.arrayBuffer());}

// Product transition into the original GmRst panel. MatchEnd has already been
// copied into a small validated JS record, so the native initializer can retire
// the old match objects while keeping hosted resident data in the same WASM.
export async function startNativeResultLive({module,canvas,results,context=null}){
 results=validateResults(results);if(!module||!canvas)throw Error('Native result scene requires the live runtime and canvas');
 const [bytes,sisBytes]=await Promise.all([hosted('GmRst.usd'),hosted('SdRst.usd')]),asset=convertResultSceneAsset(bytes),sis=convertSisAsset(sisBytes,{symbol:'SIS_ResultData'});
 installResidentFile(module,'GmRst.usd',asset.image);installResidentFile(module,'SdRst.usd',sis.image);
 // The completed live scheduler closes over retired gameplay objects. Keep its
 // final report, but do not expose a stale snapshot function after transition.
 if(globalThis.nativeLive)globalThis.nativeLive=undefined;
 const winner=Math.max(0,results.players.findIndex(player=>player.winner)),codes=results.players.map(player=>characterCodes[player.character]);let actors=null,portraitCopies=[];
 if(context){if(!Array.isArray(context.packages)||!Array.isArray(context.costumes)||context.costumes.length!==2)throw Error('Invalid live result context');for(const code of [...new Set(codes.map(code=>code==='Pp'?'Pn':code))]){const name='GmRstM'+code+'.dat';installResidentFile(module,name,convertResultMotionAsset(await hosted(name),name).image);}actors=codes.map((code,slot)=>{const pkg=context.packages.find(row=>row.code===code);if(!pkg)throw Error('Missing live result package '+code);return {slot,pkg};});}
 // Match end pauses scheduler links. A fresh Melee scene starts them runnable;
 // restore that state before constructing the same-runtime result actors.
 for(let link=0;link<64;link++)module._portRuntimeProbePause(link,0);
 module._portResultSceneInitialize(results.players[0].character,results.players[1].character,winner);
 module._portResultSceneConfigureStats(results.players[0].kos,results.players[0].falls,results.players[0].selfDestructs,results.players[1].kos,results.players[1].falls,results.players[1].selfDestructs);
 function resultActor(slot){const {pkg}=actors[slot],owner=module._portResultFighter(slot),actor={owner,bytes:pkg.modelBytes,nativeDraw:pass=>module._portResultFighterNativeDraw(slot,pass)};if(!['Lk','Cl'].includes(pkg.code))return actor;return {...actor,collectNodes:(target,nodes)=>{const scratch=module._malloc((nodes.length+1)*4);if(!scratch)throw Error('Live result Link node allocation');try{const root=module._portSceneObjectRoot(owner),count=module._portSceneCollect(root,scratch,nodes.length+1),live=new Uint32Array(module.HEAPU8.buffer,scratch,count),byDescriptor=new Map(),memory=new DataView(module.HEAPU8.buffer);for(const joint of live){const descriptor=memory.getUint32(joint+0x84,true);if(byDescriptor.has(descriptor))throw Error('Duplicate live result Link descriptor');byDescriptor.set(descriptor,joint);}const pointers=new Uint32Array(module.HEAPU8.buffer,target,nodes.length),base=memory.getUint32(root+0x84,true)-nodes[0].offset;for(let i=0;i<nodes.length;i++){const joint=byDescriptor.get(base+nodes[i].offset);if(!joint)throw Error('Missing live result Link descriptor '+i);pointers[i]=joint;byDescriptor.delete(base+nodes[i].offset);}if(byDescriptor.size!==1)throw Error('Unexpected live result Link attachments '+byDescriptor.size);}finally{module._free(scratch);}}};}
 if(actors){module._portResultFightersInitialize(results.players[0].character,results.players[1].character,winner,...context.costumes);for(let frame=0;frame<60;frame++)module._portResultSceneStep();const descriptor=module._malloc(24);if(!descriptor)throw Error('Live result portrait descriptor allocation');try{for(let slot=0;slot<2;slot++){const capture=document.createElement('canvas');capture.width=960;capture.height=720;const actor=resultActor(slot),capturePreview=createNativeMatchPreview(module,capture,[{name:codes[slot]+' result portrait',object:actor.owner,bytes:actor.bytes,collectNodes:actor.collectNodes,nativeDraw:actor.nativeDraw}],{cameraRead:pointer=>module._portResultFighterCameraProjectionSnapshot(slot,0,pointer),renderBegin:()=>module._portResultFighterRenderBegin(slot,0),cameraValidation:{clipPlanes:[1,5000],aspect:1.2166670560836792},nativeViewport:true,transparent:true});try{const captureDraw=capturePreview.draw(),efb=installResultEfbCopy(module,capture.getContext('webgl2'));try{module._portResultPortraitCopy(slot);module._portResultPortraitDescriptor(slot,descriptor);const row=Array.from(new Uint32Array(module.HEAPU8.buffer,descriptor,6)),encoded=module.HEAPU8.subarray(row[1],row[1]+row[5]),pixels=decodeGX(encoded,row[2],row[3],row[4]);let colored=0;for(let i=0;i<row[2]*row[3];i++)if(pixels[i*4]||pixels[i*4+1]||pixels[i*4+2])colored++;portraitCopies.push({...efb.snapshot(),nativeCopies:module._portEfbCopyCount(),draws:captureDraw.actors[0].draws,materialDraws:captureDraw.materialDraws.draws,colored});module._portResultPortraitAttach(slot);}finally{efb.dispose();}}finally{capturePreview.dispose();}}}finally{module._free(descriptor);}}
 const winnerActor=actors?resultActor(winner):null,preview=createNativeResultScenePreview(module,canvas,bytes,asset,{winner:winnerActor?{owner:winnerActor.owner,bytes:winnerActor.bytes,collectNodes:winnerActor.collectNodes,cameraRead:pointer=>module._portResultFighterCameraProjectionSnapshot(winner,1,pointer),renderBegin:()=>module._portResultFighterRenderBegin(winner,1),nativeDraw:winnerActor.nativeDraw}:null});let lastDraw=preview.draw();const started=performance.now(),clock=createNativeFrameClock(started,60,{align:true,toleranceMs:.25});let raf=0,disposed=false,frames=0,draws=0;
 function frame(now){if(disposed)return;const steps=clock.take(now,4);for(let i=0;i<steps;i++){module._portResultSceneStep();frames++;}if(steps){lastDraw=preview.draw();draws++;}raf=requestAnimationFrame(frame);}
 raf=requestAnimationFrame(frame);
 return {results,snapshot:()=>{const elapsedMs=performance.now()-started;return {frames,draws,elapsedMs,simulationFps:frames*1000/elapsedMs,presentationFps:draws*1000/elapsedMs,width:canvas.width,height:canvas.height,winnerDraws:lastDraw.winnerDraws,portraitCopies};},dispose(){if(disposed)return;disposed=true;cancelAnimationFrame(raf);preview.dispose();module._portResultSceneFinish();}};
}
