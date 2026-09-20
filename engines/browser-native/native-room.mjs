// An input-only relay: each browser runs the original C game. The relay carries
// immutable inputs and confirmations for either lockstep or local rollback.
export async function connectNativeRoom({storage=globalThis.sessionStorage,onState=()=>{},onError=()=>{},reload=()=>location.reload(),diagnosticCpu=false}={}) {
 const storageKey='native-melee-room-v1',requestedDiagnostic=diagnosticCpu===true;
 const post=async(path,body={})=>{const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),result=await response.json().catch(()=>({}));if(!response.ok)throw Error(result.error??'Room service unavailable');return result;};
 let saved;try{saved=JSON.parse(storage.getItem(storageKey));}catch{}
 let initial;
 if(saved?.token&&saved.diagnosticCpu===requestedDiagnostic){try{initial=await post('/native-rooms/resume',saved);}catch{storage.removeItem(storageKey);}}
 else if(saved?.token)storage.removeItem(storageKey);
 initial??=await post('/native-rooms',{diagnosticCpu:requestedDiagnostic});
 let state=initial,ws,closed=false,sequence=-1,key=null,phaseReady=false,nextFrame=0,reloading=false,localTapJump=1,lastSent=null,confirmedFrame=-1,rollbackSink,pendingEnding=null,reconnectTimer,reconnectAttempt=0;
 const frames=new Map(),sent=new Map(),rollbackEvents=[];
 let rollbackPhase=false;
 const persist=(value,syncedReload=false)=>storage.setItem(storageKey,JSON.stringify({token:value.token??initial.token,epoch:value.epoch,syncedReload,diagnosticCpu:requestedDiagnostic}));persist(initial);
 function send(value){if(ws?.readyState!==WebSocket.OPEN)throw Error('Room connection unavailable');ws.send(JSON.stringify(value));}
 function restart(value,syncedReload=true){if(reloading)return;reloading=true;persist(value,syncedReload);reload();}
 const network={
  get code(){return state.code;},get seat(){return state.seat;},get state(){return state;},get active(){return state.hasGuest&&!state.cpu;},
  get connected(){return state.connected.every(Boolean);},get cpu(){return state.cpu;},get tapJump(){return localTapJump;},get phaseReady(){return phaseReady;},
  snapshot(){return {code:state.code,seat:state.seat,epoch:state.epoch,phase:key,phaseReady,nextFrame,buffered:frames.size,bufferedSent:sent.size,lastSent,confirmedFrame,pendingEnding:pendingEnding&&{frame:pendingEnding.frame,sent:pendingEnding.sent},bufferedRollbackEvents:rollbackEvents.length,mode:network.active?(rollbackPhase?'rollback':'lockstep-3'):'solo',transport:network.active?'authenticated-inputs-v3':null};},
  async join(code){const result=await post('/native-rooms/join',{code});reloading=true;try{send({type:'leave'});}catch{}initial=result;persist(result,true);reloading=true;reload();},
  setTapJump(value){if(value!==0&&value!==1)throw Error('Invalid tap jump setting');localTapJump=value;},
  endMatch(value,frame=nextFrame-1){if(!Number.isSafeInteger(frame)||frame<0)throw Error('Invalid match ending frame');const ending={frame,value:structuredClone(value),sent:false};if(pendingEnding){if(JSON.stringify({...pendingEnding,sent:false})!==JSON.stringify(ending))throw Error('Conflicting match ending');return;}pendingEnding=ending;flushEnding();},chooseResult(action){send({type:'result-action',epoch:state.epoch,action});},
  cpuMode(enabled){send({type:'cpu',enabled});},ready(){if(!state.ready[state.seat])send({type:'ready'});},kick(){send({type:'kick'});},
  newRoom(){reloading=true;try{send({type:'leave'});}catch{}storage.removeItem(storageKey);closed=true;ws.close();reload();},
  leave(){reloading=true;try{send({type:'leave'});}finally{storage.removeItem(storageKey);closed=true;ws.close();reload();}},
  begin(scene){if(!network.active)return;rollbackPhase=rollbackSink!==undefined;key=scene+':'+(++sequence);nextFrame=0;confirmedFrame=-1;pendingEnding=null;phaseReady=false;frames.clear();sent.clear();rollbackEvents.length=0;send({type:'phase',key,epoch:state.epoch,rollback:rollbackPhase});},
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
   const future=nextFrame+3;
   if(!sent.has(future)){
    const pad=[...samples[state.seat]];
    if(key.startsWith('characters:')){if(pad[0]&0x1000)network.ready();pad[0]&=~0x1000;if(!state.seat&&state.ready.every(Boolean))pad[0]|=0x1000;}
    if(key.startsWith('stages:')&&state.seat===1)pad.fill(0);
    transmit(future,pad);
   }
   const value=frames.get(nextFrame);if(!value)return null;
   frames.delete(nextFrame);sent.delete(nextFrame);nextFrame++;
   value.forEach((v,p)=>module._portTapJumpSet(p,v.tap));return value.map(v=>v.pad);
 },
  dispose(){closed=true;clearTimeout(reconnectTimer);ws?.close();},
 };
 function transmit(frame,pad){const value={pad:[...pad],tap:localTapJump},previous=sent.get(frame);if(previous){if(JSON.stringify(previous)!==JSON.stringify(value))throw Error('Conflicting immutable local input');return;}lastSent={frame,pad:[...value.pad]};send({type:'input',key,epoch:state.epoch,frame,value});sent.set(frame,value);}
 function flushEnding(){if(pendingEnding&&!pendingEnding.sent&&confirmedFrame>=pendingEnding.frame&&network.connected){send({type:'ended',epoch:state.epoch,key,frame:pendingEnding.frame,value:pendingEnding.value});pendingEnding.sent=true;}}
 function deliverRollback(event){if(event.type==='peer-input')rollbackSink.receive(event.frame,event.value);else rollbackSink.acknowledge(event.frame);}
 function queueRollback(event){if(rollbackSink)deliverRollback(event);else if(rollbackSink===null){rollbackEvents.push(event);if(rollbackEvents.length>256)throw Error('Rollback transport event overflow');}}
 function open(initialConnect=false){return new Promise((resolve,reject)=>{
  const socket=new WebSocket(new URL('/native-room',location.href).href.replace(/^http/,'ws'));ws=socket;let connected=false;
  const timeout=setTimeout(()=>{socket.close();if(initialConnect&&!connected)reject(Error('Room connection timed out'));},8000);
  socket.onopen=()=>socket.send(JSON.stringify({type:'hello',token:initial.token,rollback:rollbackSink!==undefined,resume:{epoch:state.epoch,key,confirmedFrame}}));
  socket.onerror=()=>{if(initialConnect&&!connected){clearTimeout(timeout);reject(Error('Room connection failed'));}};
  socket.onmessage=event=>{if(reloading||socket!==ws)return;try{
   const m=JSON.parse(event.data);
   if(m.type==='state'){
    if(m.epoch!==initial.epoch){restart({...m,token:initial.token});return;}
    state=m;persist(m);flushEnding();onState(network);clearTimeout(timeout);connected=true;reconnectAttempt=0;resolve(network);
   }else if(m.type==='frame'&&m.epoch===state.epoch&&m.key===key){if(rollbackSink===undefined)frames.set(m.frame,m.inputs);}
   else if(m.type==='peer-input'&&m.epoch===state.epoch&&m.key===key&&m.seat===1-state.seat)queueRollback(m);
   else if(m.type==='confirmed-frame'&&m.epoch===state.epoch&&m.key===key){if(!Number.isSafeInteger(m.frame)||m.frame!==confirmedFrame+1)throw Error('Non-contiguous room confirmation');confirmedFrame=m.frame;if(rollbackSink!==undefined)sent.delete(m.frame);queueRollback(m);flushEnding();}
   else if(m.type==='phase-ready'&&m.epoch===state.epoch&&m.key===key)phaseReady=true;
   else if(m.type==='resync-required')restart(state,false);
   else if(m.type==='removed'){state={...state,connected:[false,false]};storage.removeItem(storageKey);closed=true;ws.close();onError(Error('You were removed from the room. Reload to start a new room.'));}
   else if(m.type==='error')onError(Error(m.message));
  }catch(e){onError(e);}};
  socket.onclose=()=>{clearTimeout(timeout);if(socket!==ws)return;if(!closed&&!reloading){state={...state,connected:[false,false]};onState(network);if(initialConnect&&!connected)reject(Error('Room connection closed'));else{const wait=Math.min(2000,250*2**Math.min(reconnectAttempt++,3));reconnectTimer=setTimeout(()=>{if(!closed&&!reloading)void open().catch(()=>{});},wait);}}};
 });}
 await open(true);
 return network;
}

// An unavailable relay must not silently change the tournament-only product
// into a solo game. CPU play remains available only to the explicit diagnostic.
export function createLocalNativeRoom(reason='Room service unavailable',{diagnosticCpu=false}={}){
 const cpu=diagnosticCpu===true,state={seat:0,cpu,hasGuest:false,connected:[true,false],ready:[false,false]};
 const unavailable=()=>{throw Error(reason);};
 return {offline:true,reason,code:'',seat:0,cpu,active:false,connected:false,state,
  tapJump:1,phaseReady:false,snapshot:()=>({mode:cpu?'diagnostic-cpu':'unavailable',offline:true}),begin(){},take:s=>cpu?s:s.map((v,i)=>i?[0,0,0,0,0,0,0]:[v[0]&~0x1000,...v.slice(1)]),setTapJump(){},bindRollback(){return ()=>{};},sendInput(){return false;},dispose(){},
  newRoom:()=>location.reload(),join:unavailable,cpuMode:unavailable,ready:unavailable,kick:unavailable,leave:unavailable};
}
