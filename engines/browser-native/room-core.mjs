import {returnTicket,validateResults} from './native-results.mjs';
// Input-only room authority. Game simulation and rendering remain in each
// browser. The same core runs in the Node relay and, for peer-to-peer rooms,
// inside the room owner's page. Peers are socket-like objects exposing
// readyState (1 = open), send(text), close(code,reason) and terminate().
const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const bytes=n=>crypto.getRandomValues(new Uint8Array(n));
export const roomCode=()=>[...bytes(6)].map(b=>alphabet[b%alphabet.length]).join('');
const token=()=>btoa(String.fromCharCode(...bytes(24))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const neutral=()=>({pad:[0,0,0,0,0,0,0],tap:1});
function validateInput(input){const p=input?.pad;if(!Array.isArray(p)||p.length!==7||!Number.isInteger(p[0])||p[0]<0||(p[0]&~0x1f7f)||p.slice(1).some((v,i)=>!Number.isFinite(v)||Math.abs(v)>1||(i>=4&&v<0))||![0,1].includes(input.tap))throw Error('Invalid controller input');return {pad:[...p],tap:input.tap};}
export class RoomError extends Error{constructor(message,status=400){super(message);this.status=status;}}

export function createRoomCore({maxRooms=64,expiryMs=30000,deliveryDelayMs=null,receiveDelayMs=null,allowDiagnosticCpu=true,createCode=roomCode}={}){
 if(deliveryDelayMs!==null&&typeof deliveryDelayMs!=='function')throw Error('Room delivery delay must be a function');
 if(receiveDelayMs!==null&&typeof receiveDelayMs!=='function')throw Error('Room receive delay must be a function');
 const rooms=new Map(),sessions=new Map(),peers=new Set(),delayTimers=new Set(),listeners=new Set();
 const changed=()=>{for(const f of listeners)f();};
 const delayState=()=>({at:new WeakMap(),pending:new WeakMap(),stats:{configured:0,scheduled:0,delivered:0,configuredDelayTotalMs:0,configuredDelayMinMs:null,configuredDelayMaxMs:0,headOfLineDelayMaxMs:0,byType:{}}}),delivery=delayState(),receive=delayState();
 function schedule(ws,m,delayMs,state,run,fail){
  if(!delayMs){run();return;}const configuredDelay=delayMs(m),configured=configuredDelay!==null&&configuredDelay!==undefined,{stats}=state;
  if(configured&&(!Number.isFinite(configuredDelay)||configuredDelay<0||configuredDelay>10000))throw Error('Invalid room delivery delay');
  const ms=configured?Math.ceil(configuredDelay):0,now=Date.now(),prior=state.at.get(ws)??now,pending=state.pending.get(ws)??0,due=pending?Math.max(now+ms,prior+1,now+1):now+ms,wait=due-now;
  if(configured){stats.configured++;stats.configuredDelayTotalMs+=ms;stats.configuredDelayMinMs=Math.min(stats.configuredDelayMinMs??ms,ms);stats.configuredDelayMaxMs=Math.max(stats.configuredDelayMaxMs,ms);stats.byType[m.type]=(stats.byType[m.type]??0)+1;}
  if(!wait){run();return;}state.at.set(ws,due);state.pending.set(ws,pending+1);stats.scheduled++;stats.headOfLineDelayMaxMs=Math.max(stats.headOfLineDelayMaxMs,wait);
  const timer=setTimeout(()=>{delayTimers.delete(timer);const remaining=(state.pending.get(ws)??1)-1;if(remaining)state.pending.set(ws,remaining);else state.pending.delete(ws);try{run();stats.delivered++;}catch(e){fail?.(e);}},wait);delayTimers.add(timer);
 }
 function send(ws,m){
  if(ws?.rollback&&m.type==='frame'&&m.key?.startsWith('match:'))return;
  if(ws?.readyState!==1)return;if(!deliveryDelayMs){ws.send(JSON.stringify(m));return;}schedule(ws,m,deliveryDelayMs,delivery,()=>{if(ws.readyState===1)ws.send(JSON.stringify(m));});
 }
 function view(r,seat){return {type:'state',code:r.code,seat,cpu:r.cpu,epoch:r.epoch,connected:r.players.map(p=>p?.ws?.readyState===1),hasGuest:!!r.players[1],ready:[...r.ready],phase:r.phase,selected:r.selected,returnTo:r.returnTo??null,rematchVotes:r.rematchVotes??[false,false],devices:[...(r.devices??['keyboard','keyboard'])]};}
 function state(r){r.players.forEach((p,i)=>send(p?.ws,view(r,i)));changed();}
 function reset(r,returnTo=null){r.returnTo=returnTo;r.ended=[null,null];r.rematchVotes=[false,false];r.epoch++;r.ready=[false,false];r.phase='characters';r.barriers.clear();r.inputs.clear();r.history.clear();r.lastFrame=-1;r.phaseKey=null;r.sequence=-1;state(r);}
 function create(diagnosticCpu=false){if(rooms.size>=maxRooms)throw Error('Room service is full');let id;do{id=createCode();}while(rooms.has(id));const r={code:id,cpu:diagnosticCpu,diagnosticCpu,epoch:0,players:[null,null],ready:[false,false],phase:'characters',selected:[{character:20,costume:0},{character:2,costume:0}],barriers:new Map(),inputs:new Map(),history:new Map(),lastFrame:-1,phaseKey:null,sequence:-1,touched:Date.now(),ended:[null,null],rematchVotes:[false,false],devices:['keyboard','keyboard']};rooms.set(id,r);return r;}
 function reserve(r,seat){const key=token();r.players[seat]={token:key,ws:null};sessions.set(key,{r,seat});changed();return {token:key,...view(r,seat)};}
 function removeGuest(r){const p=r.players[1];if(r.devices)r.devices[1]='keyboard';if(p){sessions.delete(p.token);send(p.ws,{type:'removed'});p.ws?.close();r.players[1]=null;}reset(r);}
 function action(session,m){const {r,seat}=session;r.touched=Date.now();
  if(m.type==='cpu'){if(m.enabled&&!r.diagnosticCpu)throw Error('CPU mode is unavailable in tournament rooms');if(seat||r.players[1]||r.phase!=='characters'||typeof m.enabled!=='boolean')throw Error('CPU changes require an empty guest seat at character select');r.cpu=m.enabled;r.ready=[false,false];state(r);}
  else if(m.type==='ready'){if(r.phase!=='characters'||r.cpu||!r.players[1]||!r.players.every(p=>p?.ws?.readyState===1))throw Error('Both players must be connected');r.ready[seat]=true;state(r);}
  else if(m.type==='kick'){if(seat)throw Error('Only P1 can remove a guest');removeGuest(r);}
  else if(m.type==='leave'){if(seat)removeGuest(r);else {removeGuest(r);sessions.delete(r.players[0].token);r.players[0].ws?.close();rooms.delete(r.code);changed();}}
  // Shown on the opponent's character panel only; never affects inputs.
  else if(m.type==='device'){if(!['keyboard','controller'].includes(m.value))throw Error('Invalid input device');r.devices??=['keyboard','keyboard'];if(r.devices[seat]!==m.value){r.devices[seat]=m.value;state(r);}}
  else if(m.type==='selection'){const p=m.value;if(!p||!Number.isInteger(p.character)||p.character<0||p.character>25||!Number.isInteger(p.costume)||p.costume<0||p.costume>5)throw Error('Invalid character selection');r.selected[seat]={character:p.character,costume:p.costume};changed();}
  else if(m.type==='phase'){
   if(m.epoch!==r.epoch||r.cpu||!r.players[1])return;
   if(!/^(characters|stages|match):[0-9]{1,6}$/.test(m.key))throw Error('Invalid scene barrier');
   r.players[seat].ws.rollback=m.rollback===true;
   if(r.phaseKey===m.key)return;
   const sequence=Number(m.key.split(':')[1]);if(sequence!==r.sequence+1)throw Error('Unexpected scene sequence');
   r.barriers.set(seat,m.key);if(r.barriers.get(0)!==m.key||r.barriers.get(1)!==m.key)return;
   r.sequence=sequence;r.phase=m.key.split(':')[0];r.phaseKey=m.key;r.inputs.clear();r.history.clear();r.lastFrame=-1;r.ready=[false,false];
   for(let frame=0;frame<3;frame++){const inputs=[neutral(),neutral()];r.history.set(frame,inputs);r.players.forEach((p,player)=>{send(p.ws,{type:'peer-input',key:m.key,epoch:r.epoch,frame,seat:1-player,value:inputs[1-player]});send(p.ws,{type:'frame',key:m.key,epoch:r.epoch,frame,inputs});send(p.ws,{type:'confirmed-frame',key:m.key,epoch:r.epoch,frame});});r.lastFrame=frame;}
   for(const p of r.players)send(p.ws,{type:'phase-ready',key:m.key,epoch:r.epoch});state(r);
  }else if(m.type==='ended'){
   if(m.epoch!==r.epoch)return;
   if(!r.players[1]||r.cpu||r.phase!=='match'||m.key!==r.phaseKey)throw Error('Results require an active match');
   if(!Number.isSafeInteger(m.frame)||m.frame<0||m.frame>r.lastFrame)throw Error('Match ending frame is not confirmed');
   const value={results:validateResults(m.value?.results),selection:returnTicket('rematch',m.value?.selection)};
   if(value.selection.players.some(p=>p.kind!==0))throw Error('Room results require human players');
   if(r.ended[seat]&&JSON.stringify(r.ended[seat])!==JSON.stringify({frame:m.frame,value}))throw Error('Conflicting match results');
   r.ended[seat]={frame:m.frame,value};
   if(r.ended.every(Boolean)){
    if(JSON.stringify(r.ended[0].value)!==JSON.stringify(r.ended[1].value)){for(const p of r.players)send(p.ws,{type:'error',message:'Native match results diverged; rematch stopped'});return;}
    r.phase='results';r.inputs.clear();state(r);
   }
  }else if(m.type==='result-action'){
   if(m.epoch!==r.epoch)return;
   if(r.phase!=='results'||!r.ended.every(Boolean)||!r.players.every(p=>p?.ws?.readyState===1))throw Error('Both matching results and connected players are required');
   if(!['rematch','characters'].includes(m.action))throw Error('Invalid result action');
   if(m.action==='characters')reset(r,returnTicket('characters',r.ended[0].value.selection));
   else {r.rematchVotes[seat]=true;if(r.rematchVotes.every(Boolean))reset(r,returnTicket('rematch',r.ended[0].value.selection));else state(r);}
  }else if(m.type==='input'){
   if(r.phase==='results'||m.epoch!==r.epoch||m.key!==r.phaseKey||r.cpu||!r.players[1])return;
   if(!r.players.every(p=>p?.ws?.readyState===1))return;
   if(Number.isSafeInteger(m.frame)&&m.frame<=r.lastFrame&&r.history.has(m.frame)&&JSON.stringify(r.history.get(m.frame)[seat])===JSON.stringify(validateInput(m.value)))return;// Repeated after reconnect.
   if(!Number.isSafeInteger(m.frame)||m.frame<=r.lastFrame||m.frame>r.lastFrame+120)throw Error('Input outside live window');
   const value=validateInput(m.value),entry=r.inputs.get(m.frame)??[null,null];
   if(entry[seat]&&JSON.stringify(entry[seat])!==JSON.stringify(value))throw Error('Conflicting immutable input');entry[seat]=value;r.inputs.set(m.frame,entry);
   send(r.players[1-seat]?.ws,{type:'peer-input',key:r.phaseKey,epoch:r.epoch,frame:m.frame,seat,value});
   while(r.inputs.get(r.lastFrame+1)?.every(Boolean)){
    const frame=++r.lastFrame,inputs=r.inputs.get(frame);r.inputs.delete(frame);r.history.set(frame,inputs);while(r.history.size>512)r.history.delete(r.history.keys().next().value);for(const p of r.players){send(p?.ws,{type:'frame',key:r.phaseKey,epoch:r.epoch,frame,inputs});send(p?.ws,{type:'confirmed-frame',key:r.phaseKey,epoch:r.epoch,frame});}
   }
  }else throw Error('Unsupported room action');
 }
 function replay(session,resume){
  const {r,seat}=session;if(!r.phaseKey)return true;
  const fail=()=>{send(r.players[seat].ws,{type:'resync-required'});return false;};
  if(!resume||resume.epoch!==r.epoch||resume.key!==r.phaseKey||!Number.isSafeInteger(resume.confirmedFrame)||resume.confirmedFrame < -1||resume.confirmedFrame>r.lastFrame)return fail();
  const oldest=r.history.keys().next().value??r.lastFrame+1;if(resume.confirmedFrame<oldest-1)return fail();
  for(let frame=resume.confirmedFrame+1;frame<=r.lastFrame;frame++){const inputs=r.history.get(frame);if(!inputs)return fail();send(r.players[seat].ws,{type:'peer-input',key:r.phaseKey,epoch:r.epoch,frame,seat:1-seat,value:inputs[1-seat]});send(r.players[seat].ws,{type:'frame',key:r.phaseKey,epoch:r.epoch,frame,inputs});send(r.players[seat].ws,{type:'confirmed-frame',key:r.phaseKey,epoch:r.epoch,frame});}
  for(const [frame,inputs] of r.inputs)if(frame>r.lastFrame&&inputs[1-seat])send(r.players[seat].ws,{type:'peer-input',key:r.phaseKey,epoch:r.epoch,frame,seat:1-seat,value:inputs[1-seat]});
  send(r.players[seat].ws,{type:'phase-ready',key:r.phaseKey,epoch:r.epoch});return true;
 }
 // Attach a newly opened peer. The returned handlers receive its raw
 // messages and its close notification.
 function attach(ws){let session=null,count=0,windowAt=Date.now();peers.add(ws);const timeout=setTimeout(()=>ws.close(1008,'Authentication required'),5000),fail=e=>send(ws,{type:'error',message:e.message});
  function dispatch(m){if(session.r.players[session.seat]?.ws!==ws||!sessions.has(session.r.players[session.seat]?.token))throw Error('Room session revoked');action(session,m);}
  return {message(raw){try{if(Date.now()-windowAt>1000){windowAt=Date.now();count=0;}if(++count>240)throw Error('Room message rate exceeded');const m=typeof raw==='string'?JSON.parse(raw):raw;
   if(!session){const candidate=sessions.get(m.token);if(m.type!=='hello'||!candidate)throw Error('Invalid room session');session=candidate;ws.rollback=m.rollback===true;const p=session.r.players[session.seat];if(p.ws&&p.ws!==ws)p.ws.close(1000,'Reconnected');p.ws=ws;clearTimeout(timeout);session.r.touched=Date.now();if(replay(session,m.resume))state(session.r);return;}
   if(receiveDelayMs)schedule(ws,m,receiveDelayMs,receive,()=>dispatch(m),fail);else dispatch(m);
  }catch(e){fail(e);}},
  close(){peers.delete(ws);clearTimeout(timeout);if(session){const {r,seat}=session;if(r.players[seat]?.ws===ws){r.players[seat].ws=null;r.touched=Date.now();state(r);}}}};
 }
 // Room creation, joining and resumption (the HTTP routes of the Node relay).
 function request(route,m){
  try{
   if(route==='resume'){const s=sessions.get(m.token);if(!s)throw Error('Room session expired');if(s.r.players[1]&&!(m.syncedReload===true&&m.epoch===s.r.epoch))reset(s.r);return {status:200,body:{token:m.token,...view(s.r,s.seat)}};}
   if(route==='join'){const r=rooms.get(m.code);if(!r)throw Error('Room not found');if(r.cpu)throw Error('P1 must remove the CPU first');if(r.players[1])throw Error('Room is full');const joined=reserve(r,1);reset(r);return {status:200,body:{...joined,...view(r,1)}};}
   if(route==='create'){if(m.diagnosticCpu!==undefined&&typeof m.diagnosticCpu!=='boolean')throw Error('Invalid diagnostic CPU option');if(m.diagnosticCpu&&!allowDiagnosticCpu)throw Error('CPU mode is unavailable on this server');const r=create(m.diagnosticCpu===true);return {status:200,body:reserve(r,0)};}
   throw Error('Unsupported room route');
  }catch(e){return {status:400,body:{error:e.message}};}
 }
 // Owner pages reload on every epoch change. Serialize everything except
 // the live peer objects so the authority survives those reloads.
 function serialize(){return [...rooms.values()].map(r=>({...r,players:r.players.map(p=>p&&{token:p.token}),barriers:[...r.barriers],inputs:[...r.inputs],history:[...r.history]}));}
 function restore(list){for(const saved of list){const r={...saved,players:saved.players.map(p=>p&&{token:p.token,ws:null}),barriers:new Map(saved.barriers),inputs:new Map(saved.inputs),history:new Map(saved.history),touched:Date.now()};rooms.set(r.code,r);r.players.forEach((p,seat)=>{if(p)sessions.set(p.token,{r,seat});});}}
 let stopped=false;
 const sweep=setInterval(()=>{for(const r of rooms.values())if(!r.players.some(p=>p?.ws?.readyState===1)&&Date.now()-r.touched>expiryMs){for(const p of r.players)if(p)sessions.delete(p.token);rooms.delete(r.code);changed();}},5000);sweep.unref?.();
 function close(){if(stopped)return;stopped=true;clearInterval(sweep);for(const timer of delayTimers)clearTimeout(timer);delayTimers.clear();for(const ws of peers)ws.terminate?.();peers.clear();}
 const snapshot=state=>({...state.stats,byType:{...state.stats.byType}});
 return {attach,request,serialize,restore,close,rooms,
  onChange(f){listeners.add(f);return ()=>listeners.delete(f);},
  deliverySnapshot(){return snapshot(delivery);},receiveSnapshot(){return snapshot(receive);},
  testDisconnectSeat(roomCode,seat){const ws=rooms.get(roomCode)?.players[seat]?.ws;if(!ws||ws.readyState!==1)return false;ws.terminate();return true;}};
}
