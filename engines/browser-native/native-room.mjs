import {createDirectInputLink,defaultNetcode,menuBufferFor,canonicalPad} from './native-netcode.mjs';
// An input-only relay: each browser runs the original C game. The relay carries
// immutable inputs and confirmations for either lockstep or local rollback.
export async function connectNativeRoom({storage=globalThis.sessionStorage,onState=()=>{},onError=()=>{},reload=()=>location.reload(),diagnosticCpu=false,transport=null,netcode=defaultNetcode}={}) {
 const storageKey='native-melee-room-v1',requestedDiagnostic=diagnosticCpu===true;
 const post=transport?(path,body={})=>transport.post(path,body):async(path,body={})=>{const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),result=await response.json().catch(()=>({}));if(!response.ok)throw Error(result.error??'Room service unavailable');return result;};
 let saved;try{saved=JSON.parse(storage.getItem(storageKey));}catch{}
 let initial;
 if(saved?.token&&saved.diagnosticCpu===requestedDiagnostic){try{initial=await post('/native-rooms/resume',saved);}catch{storage.removeItem(storageKey);}}
 else if(saved?.token)storage.removeItem(storageKey);
 if(!initial)transport?.forget?.();
 initial??=await post('/native-rooms',{diagnosticCpu:requestedDiagnostic});
 let state=initial,ws,closed=false,sequence=-1,key=null,phaseReady=false,nextFrame=0,reloading=false,localTapJump=1,localDevice=null,lastSent=null,confirmedFrame=-1,rollbackSink,pendingEnding=null,reconnectTimer,reconnectAttempt=0,inPlace=null;
 const frames=new Map(),sent=new Map(),rollbackEvents=[];
 let rollbackPhase=false;
 // Rollback events can arrive over the room channel and the direct input link;
 // each remote frame and each acknowledgement reaches the session once.
 let remoteDelivered=-1,ackDelivered=-1,direct=null;const remoteSeen=new Set();
 // Peer-built menu lockstep (netcode mp/mpa): own inputs plus the opponent's
 // inputs as they arrive, without waiting for the owner's confirmed frames.
 const peerMenus=netcode.menu==='peer',peerInputs=new Map(),neutralInput=()=>({pad:[0,0,0,0,0,0,0],tap:1});let queuedThrough=2,menuBuffer=3;
 const peerInput=(frame,value)=>{if(frame>=nextFrame&&!peerInputs.has(frame))peerInputs.set(frame,value);};
 const persist=(value,syncedReload=false)=>storage.setItem(storageKey,JSON.stringify({token:value.token??initial.token,epoch:value.epoch,syncedReload,diagnosticCpu:requestedDiagnostic}));persist(initial);
 function send(value){if(ws?.readyState!==1)throw Error('Room connection unavailable');ws.send(JSON.stringify(value));}
 // The opponent's panel shows this seat's device; older authorities omit it.
 function syncDevice(){if(localDevice&&Array.isArray(state.devices)&&state.devices[state.seat]!==localDevice&&ws?.readyState===1)send({type:'device',value:localDevice});}
 function restart(value,syncedReload=true){if(reloading)return;reloading=true;persist(value,syncedReload);reload();}
 // A finished match returns both pages to character select without reloading.
 // The new epoch then starts this client's scene state from the beginning.
 function advanceEpoch(m){initial={...m,token:initial.token};sequence=-1;key=null;phaseReady=false;nextFrame=0;confirmedFrame=-1;lastSent=null;pendingEnding=null;rollbackPhase=false;frames.clear();sent.clear();rollbackEvents.length=0;peerInputs.clear();remoteDelivered=-1;ackDelivered=-1;remoteSeen.clear();queuedThrough=2;menuBuffer=3;direct?.end();}
 function requestReturn(){if(inPlace&&!inPlace.sent&&state.phase==='results'&&state.epoch===initial.epoch&&network.connected){inPlace.sent=true;send({type:'result-action',epoch:state.epoch,action:'characters'});}}
 const network={
  get code(){return state.code;},get seat(){return state.seat;},get state(){return state;},get active(){return state.hasGuest&&!state.cpu;},
  get connected(){return state.connected.every(Boolean);},netcode,
  // Median peer round trip, from the direct link when active, else room pings.
  rtt(){return direct?.active?direct.snapshot().rttP50Ms:transport?.stats?.().rttP50Ms??null;},
  // Frame-advantage exchange for time sync; null without a direct link.
  setFrameAdvantage(value){direct?.setAdvantage(value);},get peerFrameAdvantage(){return direct?.active?direct.peerAdvantage:null;},get peerInputDelay(){return direct?.active?direct.peerDelay:null;},get cpu(){return state.cpu;},get tapJump(){return localTapJump;},get phaseReady(){return phaseReady;},
  snapshot(){return {code:state.code,seat:state.seat,epoch:state.epoch,phase:key,phaseReady,nextFrame,buffered:frames.size,bufferedSent:sent.size,lastSent,confirmedFrame,pendingEnding:pendingEnding&&{frame:pendingEnding.frame,sent:pendingEnding.sent},bufferedRollbackEvents:rollbackEvents.length,mode:network.active?(rollbackPhase?'rollback':peerMenus?'peer-lockstep-'+menuBuffer:'lockstep-3'):'solo',netcode:netcode.name,direct:direct?.active?direct.snapshot():null,transport:network.active?'authenticated-inputs-v3':null,link:transport?.kind??'websocket-relay'};},
  async join(code){const result=await post('/native-rooms/join',{code});reloading=true;try{send({type:'leave'});}catch{}initial=result;persist(result,true);reloading=true;reload();},
  setDevice(value){if(!['keyboard','controller'].includes(value))throw Error('Invalid input device');localDevice=value;syncDevice();},
  setTapJump(value){if(value!==0&&value!==1)throw Error('Invalid tap jump setting');localTapJump=value;},
  endMatch(value,frame=nextFrame-1){if(!Number.isSafeInteger(frame)||frame<0)throw Error('Invalid match ending frame');const ending={frame,value:structuredClone(value),sent:false};if(pendingEnding){if(JSON.stringify({...pendingEnding,sent:false})!==JSON.stringify(ending))throw Error('Conflicting match ending');return;}pendingEnding=ending;flushEnding();},chooseResult(action){send({type:'result-action',epoch:state.epoch,action});},
  // Call before endMatch. Once both results match, asks the room for character
  // select; resolves when that epoch arrives, which then does not reload.
  returnToCharacters(){if(!network.active)throw Error('Room return requires a two-player match');return new Promise(resolve=>{inPlace={resolve,sent:false};});},
  // Reload into the current epoch, as a reload-based return would have.
  reload(){restart(state);},
  cpuMode(enabled){send({type:'cpu',enabled});},ready(){if(!state.ready[state.seat])send({type:'ready'});},kick(){send({type:'kick'});},
  newRoom(){reloading=true;try{send({type:'leave'});}catch{}storage.removeItem(storageKey);transport?.forget?.();closed=true;ws.close();reload();},
  leave(){reloading=true;try{send({type:'leave'});}finally{storage.removeItem(storageKey);transport?.forget?.();closed=true;ws.close();reload();}},
  begin(scene){if(!network.active)return;rollbackPhase=rollbackSink!==undefined;key=scene+':'+(++sequence);nextFrame=0;confirmedFrame=-1;pendingEnding=null;phaseReady=false;frames.clear();sent.clear();rollbackEvents.length=0;remoteDelivered=-1;ackDelivered=-1;remoteSeen.clear();peerInputs.clear();queuedThrough=2;menuBuffer=3;
   if((rollbackPhase||peerMenus)&&netcode.transport==='direct'&&transport?.fast){direct??=createDirectInputLink({channel:transport.fast,seat:state.seat,delay:()=>netcode.delay,onInput:(frame,value)=>rollbackPhase?queueRollback({type:'peer-input',frame,value}):peerInput(frame,value),onAck:frame=>{if(rollbackPhase)queueRollback({type:'confirmed-frame',frame});}});direct.begin(state.epoch,sequence);}else direct?.end();
   if(ws?.readyState===1)send({type:'phase',key,epoch:state.epoch,rollback:rollbackPhase});},// Otherwise sent on reconnect.
  bindRollback(sink){if(sink!==null&&(typeof sink!=='object'||typeof sink.receive!=='function'||typeof sink.acknowledge!=='function'))throw Error('Invalid rollback sink');rollbackSink=sink;while(rollbackSink&&rollbackEvents.length)deliverRollback(rollbackEvents.shift());return ()=>{if(rollbackSink===sink)rollbackSink=undefined;};},
  sendInput(frame,pad){if(!network.active||!phaseReady||!network.connected)return false;if(!Number.isSafeInteger(frame)||frame<0)throw Error('Invalid room input frame');
   // A stalled local advance can retry after the relay has confirmed its
   // immutable sample and released sent bookkeeping. Confirmation proves the
   // relay already owns that input; never retransmit it outside the live window.
   if(frame<=confirmedFrame)return true;
   transmit(frame,pad);return true;},
  take(samples,module){
   if(!network.active){if(!state.cpu){samples=samples.map(s=>[...s]);samples[0][0]&=~0x1000;samples[1].fill(0);}return samples;}
   if(!phaseReady||!network.connected)return null;
   // Each local sample is sent for frame nextFrame+buffer. A grown adaptive
   // buffer repeats the current sample for the frames it newly covers.
   if(peerMenus&&nextFrame%30===0)menuBuffer=netcode.menuBuffer==='auto'?menuBufferFor(direct?.active?direct.snapshot().rttP95Ms:transport?.stats?.().rttP95Ms):netcode.menuBuffer;
   for(let future=queuedThrough+1;future<=nextFrame+menuBuffer;future++){
    const pad=[...samples[state.seat]];
    if(key.startsWith('characters:')){if(pad[0]&0x1000)network.ready();pad[0]&=~0x1000;if(!state.seat&&state.ready.every(Boolean)&&future%20<2)pad[0]|=0x1000;}// Native CSS starts on a Start press after its ready banner; pulse, never hold.
    if(key.startsWith('stages:')&&state.seat===1)pad.fill(0);
    transmit(future,pad);queuedThrough=future;
   }
   let value;
   if(peerMenus){const own=nextFrame<3?neutralInput():sent.get(nextFrame),peer=nextFrame<3?neutralInput():peerInputs.get(nextFrame);if(!own||!peer)return null;value=[null,null];value[state.seat]=own;value[1-state.seat]=peer;peerInputs.delete(nextFrame);}
   else{value=frames.get(nextFrame);if(!value)return null;}
   frames.delete(nextFrame);sent.delete(nextFrame);nextFrame++;
   value.forEach((v,p)=>module._portTapJumpSet(p,v.tap));return value.map(v=>v.pad);
 },
  dispose(){closed=true;direct?.dispose();clearTimeout(reconnectTimer);ws?.close();transport?.dispose?.();},
 };
 function transmit(frame,pad){const value={pad:canonicalPad(pad),tap:localTapJump},previous=sent.get(frame);if(previous){if(JSON.stringify(previous)!==JSON.stringify(value))throw Error('Conflicting immutable local input');return;}lastSent={frame,pad:[...value.pad]};send({type:'input',key,epoch:state.epoch,frame,value});sent.set(frame,value);if(direct?.active)direct.send(frame,value);}
 function flushEnding(){if(pendingEnding&&!pendingEnding.sent&&confirmedFrame>=pendingEnding.frame&&network.connected){send({type:'ended',epoch:state.epoch,key,frame:pendingEnding.frame,value:pendingEnding.value});pendingEnding.sent=true;}}
 function deliverRollback(event){if(event.type==='peer-input')rollbackSink.receive(event.frame,event.value);else rollbackSink.acknowledge(event.frame);}
 function queueRollback(event){
  if(event.type==='peer-input'){if(event.frame<=remoteDelivered||remoteSeen.has(event.frame))return;remoteSeen.add(event.frame);globalThis.__meleeNetTrace?.peer(event.frame);while(remoteSeen.has(remoteDelivered+1))remoteSeen.delete(++remoteDelivered);}
  else{if(event.frame<=ackDelivered)return;// Acknowledgements are cumulative on either path.
   for(let frame=ackDelivered+1;frame<event.frame;frame++)queueRollback({type:'confirmed-frame',frame});ackDelivered=event.frame;}
  if(rollbackSink)deliverRollback(event);else if(rollbackSink===null){rollbackEvents.push(event);if(rollbackEvents.length>256)throw Error('Rollback transport event overflow');}}
 function open(initialConnect=false){return new Promise((resolve,reject)=>{
  const socket=transport?transport.socket():new WebSocket(new URL('/native-room',location.href).href.replace(/^http/,'ws'));ws=socket;let connected=false;
  const timeout=setTimeout(()=>{socket.close();if(initialConnect&&!connected)reject(Error('Room connection timed out'));},8000);
  socket.onopen=()=>{socket.send(JSON.stringify({type:'hello',token:initial.token,rollback:rollbackSink!==undefined,resume:{epoch:state.epoch,key,confirmedFrame}}));
   // A peer-hosted authority can lose messages that arrive while its page
   // reloads. Barriers and immutable inputs are idempotent, so repeat them.
   if(key&&!phaseReady)socket.send(JSON.stringify({type:'phase',key,epoch:state.epoch,rollback:rollbackPhase}));
   for(const [frame,value] of sent)if(frame>confirmedFrame)socket.send(JSON.stringify({type:'input',key,epoch:state.epoch,frame,value}));};
  socket.onerror=()=>{if(initialConnect&&!connected){clearTimeout(timeout);reject(Error('Room connection failed'));}};
  socket.onmessage=event=>{if(reloading||socket!==ws)return;try{
   const m=JSON.parse(event.data);
   if(m.type==='state'){
    const advanced=m.epoch!==initial.epoch;
    if(advanced){if(!inPlace){restart({...m,token:initial.token});return;}advanceEpoch(m);}
    state=m;persist(m);flushEnding();syncDevice();requestReturn();onState(network);clearTimeout(timeout);connected=true;reconnectAttempt=0;resolve(network);
    if(advanced){const done=inPlace.resolve;inPlace=null;done(network);}
   }else if(m.type==='frame'&&m.epoch===state.epoch&&m.key===key){if(rollbackSink===undefined&&!peerMenus)frames.set(m.frame,m.inputs);}
   else if(m.type==='peer-input'&&m.epoch===state.epoch&&m.key===key&&m.seat===1-state.seat){if(rollbackSink===undefined&&peerMenus)peerInput(m.frame,m.value);else queueRollback(m);}
   else if(m.type==='confirmed-frame'&&m.epoch===state.epoch&&m.key===key){if(!Number.isSafeInteger(m.frame)||m.frame!==confirmedFrame+1)throw Error('Non-contiguous room confirmation');confirmedFrame=m.frame;if(rollbackPhase)sent.delete(m.frame);queueRollback(m);flushEnding();}
   else if(m.type==='phase-ready'&&m.epoch===state.epoch&&m.key===key)phaseReady=true;
   else if(m.type==='resync-required')restart(state,false);
   else if(m.type==='removed'){state={...state,connected:[false,false]};storage.removeItem(storageKey);transport?.forget?.();closed=true;ws.close();onError(Error('You were removed from the room. Reload to start a new room.'));}
   else if(m.type==='error')onError(Error(m.message));
  }catch(e){onError(e);}};
  socket.onclose=()=>{clearTimeout(timeout);if(socket!==ws)return;if(!closed&&!reloading){state={...state,connected:[false,false]};onState(network);if(initialConnect&&!connected)reject(Error('Room connection closed'));else{const wait=Math.min(2000,250*2**Math.min(reconnectAttempt++,3));reconnectTimer=setTimeout(()=>{if(!closed&&!reloading)void open().catch(()=>{});},wait);}}};
 });}
 // A peer-hosted authority reloads on epoch changes, which can close the first
 // connection before its state arrives. Relay sockets keep the original rule.
 for(let attempt=0;;attempt++){try{await open(true);break;}catch(e){if(!transport||attempt>=8)throw e;await new Promise(r=>setTimeout(r,250*(attempt+1)));}}
 return network;
}

// An unavailable relay must not silently change the tournament-only product
// into a solo game. CPU play remains available only to the explicit diagnostic.
export function createLocalNativeRoom(reason='Room service unavailable',{diagnosticCpu=false}={}){
 const cpu=diagnosticCpu===true,state={seat:0,cpu,hasGuest:false,connected:[true,false],ready:[false,false]};
 const unavailable=()=>{throw Error(reason);};
 return {offline:true,reason,code:'',seat:0,cpu,active:false,connected:false,state,
  tapJump:1,phaseReady:false,snapshot:()=>({mode:cpu?'diagnostic-cpu':'unavailable',offline:true}),begin(){},take:s=>cpu?s:s.map((v,i)=>i?[0,0,0,0,0,0,0]:[v[0]&~0x1000,...v.slice(1)]),setTapJump(){},setDevice(){},bindRollback(){return ()=>{};},sendInput(){return false;},dispose(){},
  newRoom:()=>location.reload(),join:unavailable,cpuMode:unavailable,ready:unavailable,kick:unavailable,leave:unavailable};
}
