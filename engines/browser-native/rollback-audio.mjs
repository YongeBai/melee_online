// Deterministic speculative journal. Presentation is outside captured state and
// happens once, only after the owning simulation frame is confirmed.
export function createRollbackAudio({present=()=>{},presentUnframed=false}={}){
 let state={active:false,paused:false,track:null,volume:0},events=[],frame=null,sequence=0,confirmed=-1,presented=0;
 const emitted=new Set();
 function beginFrame(value){if(!Number.isSafeInteger(value)||value<0)throw Error('Invalid rollback audio frame');frame=value;sequence=0;}
 function request(r){if(r.action===4)return state.active;if(r.action===0){state={active:true,paused:false,track:r.path,volume:r.volume};}else if(r.action===1){state={active:false,paused:false,track:null,volume:0};}else if(r.action===2){if(!state.active)return false;state.paused=true;}else if(r.action===3){if(!state.active)return false;state.paused=false;}else throw Error('Unsupported rollback audio request');const event={...r,frame,sequence:sequence++};events.push(event);if(frame===null&&presentUnframed){present({...event});presented++;}return true;}
 function confirm(value){if(!Number.isSafeInteger(value)||value<confirmed)throw Error('Invalid rollback audio confirmation');confirmed=value;for(const event of events)if(event.frame!==null&&event.frame<=confirmed){const key=event.frame+':'+event.sequence;if(!emitted.has(key)){present({...event});emitted.add(key);presented++;}}}
 return {beginFrame,request,confirm,capture:()=>({state:{...state},events:events.map(e=>({...e}))}),restore(value){state={...value.state};events=value.events.map(e=>({...e}));},snapshot:()=>({state:{...state},journaled:events.length,presented,confirmed,pending:events.filter(e=>e.frame!==null&&e.frame>confirmed).length})};
}
