import {completeNativeSample,neutralNativeSample} from './native-input.mjs';
const copy=v=>({pad:completeNativeSample(v.pad).slice(),tap:v.tap});
const equal=(a,b)=>a.tap===b.tap&&a.pad.every((v,i)=>v===b.pad[i]);
function value(v){if(!v||![0,1].includes(v.tap))throw Error('Invalid rollback input');return copy(v);}
// Experimental correction kernel. The supplied state boundary must capture all
// deterministic state. Transport, rendering and audio commitment are separate.
export function createRollbackSession({seat,store,step,window=12,checkpointInterval=4,onReplay=()=>{}}){
 if(![0,1].includes(seat)||!Number.isInteger(window)||window<1||!Number.isInteger(checkpointInterval)||checkpointInterval<1||checkpointInterval>window)throw Error('Invalid rollback configuration');
 let frame=0,confirmed=-1,dirty=null,closed=false;
 const local=new Map(),remote=new Map(),used=new Map(),checkpoints=new Map([[0,store.capture()]]),neutral={pad:neutralNativeSample(),tap:1};
 const stats={forwardFrames:0,predictedFrames:0,corrections:0,replayedFrames:0,maxReplay:0,rejectedLateInputs:0,peakSnapshotBytes:store.retainedBytes??0};
 function prediction(f){if(remote.has(f))return remote.get(f);for(let n=f-1;n>=Math.max(0,f-window-checkpointInterval);n--)if(remote.has(n))return remote.get(n);return neutral;}
 function execute(f,replay){const peer=prediction(f),input=[null,null];input[seat]=local.get(f);input[1-seat]=peer;used.set(f,copy(peer));step(input.map(copy),{frame:f,replay});}
 function trim(){const floor=Math.max(0,confirmed+1-window),keep=Math.floor(floor/checkpointInterval)*checkpointInterval;for(const [f,s] of checkpoints)if(f<keep){store.release(s);checkpoints.delete(f);}for(const map of [local,remote,used])for(const f of map.keys())if(f<keep-1)map.delete(f);}
 function checkpoint(f){if(f%checkpointInterval===0&&!checkpoints.has(f)){checkpoints.set(f,store.capture());stats.peakSnapshotBytes=Math.max(stats.peakSnapshotBytes,store.retainedBytes??0);}}
 function reconcile(){if(dirty===null)return;const from=[...checkpoints.keys()].filter(f=>f<=dirty).at(-1);if(from===undefined)throw Error('Rollback checkpoint unavailable');const end=frame,rewind=checkpoints.get(from);onReplay(true);try{store.restore(rewind);for(const [f,s]of checkpoints)if(f>from){store.release(s);checkpoints.delete(f);}for(let f=from;f<end;f++){checkpoint(f);execute(f,true);}stats.corrections++;stats.replayedFrames+=end-from;stats.maxReplay=Math.max(stats.maxReplay,end-from);dirty=null;}finally{onReplay(false);}}
 function receive(f,input){if(closed)throw Error('Rollback session closed');if(!Number.isSafeInteger(f)||f<0||f>frame+window)throw Error('Remote input outside window');const v=value(input);if(remote.has(f)){if(!equal(remote.get(f),v))throw Error('Conflicting immutable rollback input');return;}if(f<frame-window){stats.rejectedLateInputs++;throw Error('Remote input too old for rollback');}remote.set(f,v);if(f<frame&&!equal(used.get(f),v))dirty=dirty===null?f:Math.min(dirty,f);while(remote.has(confirmed+1))confirmed++;}
 function advance(input){if(closed)throw Error('Rollback session closed');reconcile();if(frame>confirmed+window)return false;checkpoint(frame);local.set(frame,value(input));if(!remote.has(frame))stats.predictedFrames++;execute(frame,false);frame++;stats.forwardFrames++;trim();return true;}
 return {advance,receive,reconcile,get frame(){return frame;},get confirmed(){return confirmed;},snapshot:()=>({frame,confirmed,pendingCorrection:dirty,...stats,retainedSnapshots:checkpoints.size,retainedBytes:store.retainedBytes??0}),dispose(){if(closed)return;closed=true;for(const s of checkpoints.values())store.release(s);checkpoints.clear();}};
}
