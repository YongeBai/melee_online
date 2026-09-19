import {convertResultSceneAsset} from './menu-assets.mjs';
import {convertSisAsset} from './sis-assets.mjs';
import {installResidentFile} from './resident-files.mjs';
import {createNativeResultScenePreview} from './native-result-scene-preview.mjs';
import {createNativeFrameClock} from './native-live.mjs';
import {validateResults} from './native-results.mjs';

async function hosted(name){const response=await fetch('./fixtures/'+name);if(!response.ok)throw Error('Hosted result asset unavailable: '+name);return new Uint8Array(await response.arrayBuffer());}

// Product transition into the original GmRst panel. MatchEnd has already been
// copied into a small validated JS record, so the native initializer can retire
// the old match objects while keeping hosted resident data in the same WASM.
export async function startNativeResultLive({module,canvas,results}){
 results=validateResults(results);if(!module||!canvas)throw Error('Native result scene requires the live runtime and canvas');
 const [bytes,sisBytes]=await Promise.all([hosted('GmRst.usd'),hosted('SdRst.usd')]),asset=convertResultSceneAsset(bytes),sis=convertSisAsset(sisBytes,{symbol:'SIS_ResultData'});
 installResidentFile(module,'GmRst.usd',asset.image);installResidentFile(module,'SdRst.usd',sis.image);
 // The completed live scheduler closes over retired gameplay objects. Keep its
 // final report, but do not expose a stale snapshot function after transition.
 if(globalThis.nativeLive)globalThis.nativeLive=undefined;
 const winner=Math.max(0,results.players.findIndex(player=>player.winner));module._portResultSceneInitialize(results.players[0].character,results.players[1].character,winner);
 module._portResultSceneConfigureStats(results.players[0].kos,results.players[0].falls,results.players[0].selfDestructs,results.players[1].kos,results.players[1].falls,results.players[1].selfDestructs);
 const preview=createNativeResultScenePreview(module,canvas,bytes,asset);preview.draw();const started=performance.now(),clock=createNativeFrameClock(started,60,{align:true,toleranceMs:.25});let raf=0,disposed=false,frames=0,draws=0;
 function frame(now){if(disposed)return;const steps=clock.take(now,4);for(let i=0;i<steps;i++){module._portResultSceneStep();frames++;}if(steps){preview.draw();draws++;}raf=requestAnimationFrame(frame);}
 raf=requestAnimationFrame(frame);
 return {results,snapshot:()=>{const elapsedMs=performance.now()-started;return {frames,draws,elapsedMs,simulationFps:frames*1000/elapsedMs,presentationFps:draws*1000/elapsedMs,width:canvas.width,height:canvas.height};},dispose(){if(disposed)return;disposed=true;cancelAnimationFrame(raf);preview.dispose();module._portResultSceneFinish();}};
}
