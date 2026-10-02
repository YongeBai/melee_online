import {completeNativeSample,neutralNativeSample} from './native-input.mjs';
import {canonicalPad} from './native-netcode.mjs';

// Match-scoped bridge between the authenticated room transport and the
// correction kernel. The relay owns neutral frames 0-2; subsequent local
// samples are immutable and tagged with the exact simulation frame. With an
// input delay of D frames, the sample taken at frame f is played at f+D and
// sent immediately, giving the opponent D frames of notice.
export function createNativeRollbackDriver({network,session,neutralFrames=3,delay=0,sync=false}){
 if(!network?.active||![0,1].includes(network.seat)||typeof network.bindRollback!=='function'||typeof network.sendInput!=='function'||typeof network.begin!=='function')throw Error('Rollback driver requires an active native room');
 if(!session||typeof session.advance!=='function'||typeof session.receive!=='function'||typeof session.acknowledge!=='function'||typeof session.reconcile!=='function')throw Error('Rollback driver requires a correction session');
 if(!Number.isInteger(neutralFrames)||neutralFrames<0)throw Error('Invalid rollback neutral prefix');
 if(!Number.isInteger(delay)||delay<0||delay>6)throw Error('Invalid rollback input delay');
 let closed=false,pendingFrame=-1,pending=null,sentThrough=neutralFrames-1,rttMs=null,advantage=0;const queued=new Map();
 // Frame advantage: how far our simulation is ahead of the peer's. The peer
 // sent its newest known input at its frame remoteKnown minus its own input
 // delay, half a round trip ago; smoothed so single late packets do not
 // trigger adjustments. Players may choose different delays.
 function measureAdvantage(){if(session.frame%30===1)rttMs=network.rtt?.()??rttMs;const peerDelay=network.peerInputDelay??delay;if(session.remoteKnown<neutralFrames+peerDelay)return;const peer=session.remoteKnown-peerDelay+(rttMs??0)/2/(1000/60);advantage+=(session.frame-peer-advantage)*.1;network.setFrameAdvantage?.(advantage);}const stalls={phase:0,transport:0,window:0};const transportEvents=[];
 const transportSink={
  receive(frame,value){if(closed)throw Error('Rollback driver closed');if(transportEvents.length>=4096)throw Error('Rollback transport backlog');transportEvents.push({type:'input',frame,value});},
  acknowledge(frame){if(closed)throw Error('Rollback driver closed');if(transportEvents.length>=4096)throw Error('Rollback transport backlog');transportEvents.push({type:'ack',frame});}
 };
 function flushTransport(){
  if(!transportEvents.length)return;
  const batch=transportEvents.splice(0);
  // The relay sends input before its matching acknowledgement. Install every
  // input already delivered in this task before acknowledgements reconcile so
  // one late packet burst produces one correction instead of one per frame.
  for(const event of batch)if(event.type==='input')session.receive(event.frame,event.value);
  for(const event of batch)if(event.type==='ack')session.acknowledge(event.frame);
 }
 network.bindRollback(null);network.begin('match');const unbind=network.bindRollback(transportSink);
 function advance(frame,samples){
  if(closed)throw Error('Rollback driver closed');
  flushTransport();
  if(frame!==session.frame||!Array.isArray(samples)||samples.length!==2)throw Error('Rollback driver frame/input mismatch');
  if(network.phaseReady===false){stalls.phase++;return false;}
  if(pendingFrame!==frame){
   pendingFrame=frame;
   if(frame>=neutralFrames){const target=frame+delay;for(let f=neutralFrames;f<target;f++)if(!queued.has(f))queued.set(f,{pad:neutralNativeSample(),tap:network.tapJump});if(!queued.has(target))queued.set(target,{pad:canonicalPad(completeNativeSample(samples[network.seat])),tap:network.tapJump});}
   pending=frame<neutralFrames?{pad:neutralNativeSample(),tap:network.tapJump}:queued.get(frame);
  }
  // Re-offer the newest frame on a stalled retry: transmission is idempotent and
  // a closed room link must still hold the frame.
  for(let f=Math.min(sentThrough+1,frame+delay);f<=frame+delay&&frame>=neutralFrames;f++){if(!network.sendInput(f,queued.get(f).pad)){stalls.transport++;return false;}sentThrough=f;}
  const advanced=session.advance(pending);if(advanced){measureAdvantage();queued.delete(frame);pendingFrame=-1;pending=null;}else stalls.window++;return advanced;
 }
 function reconcile(){if(closed)throw Error('Rollback driver closed');flushTransport();return session.reconcile();}
 function canFinish(frame){if(closed)throw Error('Rollback driver closed');if(!Number.isSafeInteger(frame)||frame<0)throw Error('Invalid rollback ending frame');reconcile();return session.confirmed>=frame;}
 // Frames the opponent has already simulated beyond ours (its inputs arrived).
 return {advance,canFinish,reconcile,get seat(){return network.seat;},get remoteLead(){return session.remoteKnown-delay-session.frame;},// Half the difference of the two peers' estimates cancels the bias both share
 // (input processing latency); a lone estimate is used without a direct link.
 get frameAdvantage(){const peer=network.peerFrameAdvantage;return peer===null||peer===undefined?advantage:(advantage-peer)/2;},
 get advantageShared(){return network.peerFrameAdvantage!==null&&network.peerFrameAdvantage!==undefined;},delay,sync,snapshot:()=>({seat:network.seat,neutralFrames,stalls:{...stalls},bufferedTransportEvents:transportEvents.length,session:session.snapshot(),room:network.snapshot()}),dispose(){if(closed)return;closed=true;transportEvents.length=0;unbind();}};
}
