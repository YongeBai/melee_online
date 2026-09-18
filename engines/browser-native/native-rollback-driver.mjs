import {completeNativeSample,neutralNativeSample} from './native-input.mjs';

// Match-scoped bridge between the authenticated room transport and the
// correction kernel. The relay owns neutral frames 0-2; subsequent local
// samples are immutable and tagged with the exact simulation frame.
export function createNativeRollbackDriver({network,session,neutralFrames=3}){
 if(!network?.active||![0,1].includes(network.seat)||typeof network.bindRollback!=='function'||typeof network.sendInput!=='function'||typeof network.begin!=='function')throw Error('Rollback driver requires an active native room');
 if(!session||typeof session.advance!=='function'||typeof session.receive!=='function'||typeof session.acknowledge!=='function'||typeof session.reconcile!=='function')throw Error('Rollback driver requires a correction session');
 if(!Number.isInteger(neutralFrames)||neutralFrames<0)throw Error('Invalid rollback neutral prefix');
 network.bindRollback(null);network.begin('match');const unbind=network.bindRollback(session);let closed=false;
 function advance(frame,samples){
  if(closed)throw Error('Rollback driver closed');
  if(frame!==session.frame||!Array.isArray(samples)||samples.length!==2)throw Error('Rollback driver frame/input mismatch');
  const pad=frame<neutralFrames?neutralNativeSample():completeNativeSample(samples[network.seat]);
  if(frame>=neutralFrames&&!network.sendInput(frame,pad))return false;
  return session.advance({pad,tap:network.tapJump});
 }
 function canFinish(frame){if(closed)throw Error('Rollback driver closed');if(!Number.isSafeInteger(frame)||frame<0)throw Error('Invalid rollback ending frame');session.reconcile();return session.confirmed>=frame;}
 return {advance,canFinish,reconcile:()=>session.reconcile(),get seat(){return network.seat;},snapshot:()=>({seat:network.seat,neutralFrames,session:session.snapshot(),room:network.snapshot()}),dispose(){if(closed)return;closed=true;unbind();}};
}
