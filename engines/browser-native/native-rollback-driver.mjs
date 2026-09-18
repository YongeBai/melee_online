import {completeNativeSample,neutralNativeSample} from './native-input.mjs';

// Match-scoped bridge between the authenticated room transport and the
// correction kernel. The relay owns neutral frames 0-2; subsequent local
// samples are immutable and tagged with the exact simulation frame.
export function createNativeRollbackDriver({network,session,neutralFrames=3}){
 if(!network?.active||![0,1].includes(network.seat)||typeof network.bindRollback!=='function'||typeof network.sendInput!=='function'||typeof network.begin!=='function')throw Error('Rollback driver requires an active native room');
 if(!session||typeof session.advance!=='function'||typeof session.receive!=='function'||typeof session.acknowledge!=='function'||typeof session.reconcile!=='function')throw Error('Rollback driver requires a correction session');
 if(!Number.isInteger(neutralFrames)||neutralFrames<0)throw Error('Invalid rollback neutral prefix');
 let closed=false,pendingFrame=-1,pending=null;const transportEvents=[];
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
  if(network.phaseReady===false)return false;
  if(pendingFrame!==frame){pendingFrame=frame;pending={pad:frame<neutralFrames?neutralNativeSample():completeNativeSample(samples[network.seat]),tap:network.tapJump};}
  if(frame>=neutralFrames&&!network.sendInput(frame,pending.pad))return false;
  const advanced=session.advance(pending);if(advanced){pendingFrame=-1;pending=null;}return advanced;
 }
 function reconcile(){if(closed)throw Error('Rollback driver closed');flushTransport();return session.reconcile();}
 function canFinish(frame){if(closed)throw Error('Rollback driver closed');if(!Number.isSafeInteger(frame)||frame<0)throw Error('Invalid rollback ending frame');reconcile();return session.confirmed>=frame;}
 return {advance,canFinish,reconcile,get seat(){return network.seat;},snapshot:()=>({seat:network.seat,neutralFrames,bufferedTransportEvents:transportEvents.length,session:session.snapshot(),room:network.snapshot()}),dispose(){if(closed)return;closed=true;transportEvents.length=0;unbind();}};
}
