// Diagnostic deterministic stream transport. Requests are journaled, never
// presented during speculative/replay steps. This is not an audible SFX backend.
export function createRollbackAudio(){
 let state={active:false,paused:false,track:null,volume:0},events=[];
 return {request(r){if(r.action===4)return state.active;if(r.action===0){state={active:true,paused:false,track:r.path,volume:r.volume};}else if(r.action===1){state={active:false,paused:false,track:null,volume:0};}else if(r.action===2){if(!state.active)return false;state.paused=true;}else if(r.action===3){if(!state.active)return false;state.paused=false;}else throw Error('Unsupported rollback audio request');events.push({...r});return true;},capture:()=>({state:{...state},events:events.map(e=>({...e}))}),restore(value){state={...value.state};events=value.events.map(e=>({...e}));},snapshot:()=>({state:{...state},journaled:events.length,presented:0})};
}
