// QA only: ordinary controller input creates activity without changing game
// rules, physics, RNG, damage or the camera. This is stress, not skilled play.
const neutral=()=>({mask:0,stickX:128,stickY:128,cStickX:128,cStickY:128,triggerLeft:0,triggerRight:0,analogA:0,analogB:0});
export function benchmarkPad(state, port=0) {
 if(port!==0&&port!==1)throw Error("Invalid benchmark controller port");
 const pad=neutral();
 if(state?.major!==2||state.minor!==2||state.sceneKind!==2)return pad;
 const player=state.fighters?.find(f=>f.port===port),opponent=state.fighters?.find(f=>f.port===(1-port));
 if(!player||!opponent||!player.stocks)return pad;
 const phase=(Math.floor(state.sceneFrame/9)+port*7)%24;
 const inward=player.x>0?-1:1,toward=opponent.x>=player.x?1:-1;
 if(Math.abs(player.x)>50){pad.stickX=128+inward*96;if(phase%3===0)pad.mask=4;return pad;}
 if(phase<6||phase>=20)pad.stickX=128+toward*80;
 if([3,7,11,17,21].includes(phase)){pad.mask=1;pad.analogA=255;}
 if([6,15].includes(phase))pad.mask=4;
 if([9,18].includes(phase)){pad.mask=2;pad.analogB=255;}
 if(phase===13){pad.mask=32;pad.triggerLeft=255;}
 if(phase===23)pad.cStickX=128+toward*96;
 return pad;
}
export async function withBenchmarkInput(readState,sendInput,measure,{schedule=setInterval,cancel=clearInterval}={}) {
 let changes=0,last='',timer;
 const update=()=>{const pad=benchmarkPad(readState()),key=JSON.stringify(pad);if(key!==last){last=key;changes++;sendInput(pad);}};
 try {update();timer=schedule(update,100);const result=await measure();result.controllerStress={kind:'scripted normal P1 controls versus CPU9',inputChanges:changes};return result;}
 finally {if(timer!==undefined)cancel(timer);sendInput(neutral());}
}

// QA only: two active human slots, native partner AI unchanged. Controller
// messages are bounded to one request in flight; no per-update CPU pause.
export async function withTwoPlayerBenchmarkInput(host,readState,measure,{schedule=setInterval,cancel=clearInterval}={}) {
 const initial=readState();
 if(initial?.fighters?.length!==2||initial.fighters.some(f=>f.slotType!==0||f.controllerIndex!==f.port))throw Error('Two human controller slots are required for this workload');
 const command=(action,data={})=>host.adapter.request('browserRollback',{action,...data});
 const changes=[0,0],last=['',''],observed=[new Set(),new Set()];let pending=null,failure=null,timer,active=true;
 const send=async(force=false)=>{
  const state=readState(),pads=[benchmarkPad(state,0),benchmarkPad(state,1)];let changed=force;
  for(let port=0;port<2;port++){
   const actor=state?.fighters?.find(f=>f.port===port);if(actor)observed[port].add(actor.action);
   const key=JSON.stringify(pads[port]);if(key!==last[port]){last[port]=key;changes[port]++;changed=true;}
  }
  if(changed)await command('livePads',{pads,frame:(state?.sceneFrame??0)>>>0});
 };
 const update=()=>{if(!active||pending)return;pending=send().catch(error=>{failure=error;}).finally(()=>{pending=null;});};
 try{
  await send(true);timer=schedule(update,100);const result=await measure();active=false;if(pending)await pending;if(failure)throw failure;
  result.controllerStress={kind:'two scripted human controller tracks; native partner AI retained',inputChanges:changes,observedActions:observed.map(s=>[...s]),notHumanPlay:true};
  const exercised=changes.every(n=>n>=8)&&observed.every(s=>s.size>=3);
  result.controllerStress.exercisedBothPlayers=exercised;
  if(!exercised){result.passed=false;result.invalidWorkload='Both human controller tracks must produce varied inputs and actions';}
  return result;
 }finally{
  active=false;if(timer!==undefined)cancel(timer);if(pending)await pending;
  host.setInputState?.(neutral());
  try{await command('livePads',{pads:[neutral(),neutral()],frame:0});}finally{await command('releaseLivePads');}
 }
}
