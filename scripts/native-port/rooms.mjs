import {returnTicket,validateResults} from '../../engines/browser-native/native-results.mjs';
// CPU-only room relay. Game simulation and rendering remain in each browser.
import {randomBytes} from 'node:crypto';
import {WebSocketServer} from '../../web/node_modules/ws/wrapper.mjs';
const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const code=()=>[...randomBytes(6)].map(b=>alphabet[b%alphabet.length]).join('');
const token=()=>randomBytes(24).toString('base64url');
function sameOrigin(req){if(!req.headers.origin)return true;try{const origin=new URL(req.headers.origin);return ['http:','https:'].includes(origin.protocol)&&origin.host===req.headers.host;}catch{return false;}}
const neutral=()=>({pad:[0,0,0,0,0,0,0],tap:1});
function validateInput(input){const p=input?.pad;if(!Array.isArray(p)||p.length!==7||!Number.isInteger(p[0])||p[0]<0||(p[0]&~0x1f7f)||p.slice(1).some((v,i)=>!Number.isFinite(v)||Math.abs(v)>1||(i>=4&&v<0))||![0,1].includes(input.tap))throw Error('Invalid controller input');return {pad:[...p],tap:input.tap};}
export function createNativeRoomRelay(server,{maxRooms=64,expiryMs=30000,deliveryDelayMs=null}={}){
 if(deliveryDelayMs!==null&&typeof deliveryDelayMs!=='function')throw Error('Room delivery delay must be a function');
 const rooms=new Map(),sessions=new Map(),wss=new WebSocketServer({noServer:true,maxPayload:8192}),deliveryAt=new WeakMap(),deliveryPending=new WeakMap(),deliveryTimers=new Set(),deliveryStats={configured:0,scheduled:0,delivered:0,configuredDelayTotalMs:0,configuredDelayMinMs:null,configuredDelayMaxMs:0,headOfLineDelayMaxMs:0,byType:{}};
 function send(ws,m){
  if(ws?.readyState!==1)return;if(!deliveryDelayMs){ws.send(JSON.stringify(m));return;}
  const configuredDelay=deliveryDelayMs(m),configured=configuredDelay!==null&&configuredDelay!==undefined;
  if(configured&&(!Number.isFinite(configuredDelay)||configuredDelay<0||configuredDelay>10000))throw Error('Invalid room delivery delay');
  const ms=configured?Math.ceil(configuredDelay):0,now=Date.now(),prior=deliveryAt.get(ws)??now,pending=deliveryPending.get(ws)??0,due=pending?Math.max(now+ms,prior+1,now+1):now+ms,wait=due-now;
  if(configured){deliveryStats.configured++;deliveryStats.configuredDelayTotalMs+=ms;deliveryStats.configuredDelayMinMs=Math.min(deliveryStats.configuredDelayMinMs??ms,ms);deliveryStats.configuredDelayMaxMs=Math.max(deliveryStats.configuredDelayMaxMs,ms);deliveryStats.byType[m.type]=(deliveryStats.byType[m.type]??0)+1;}
  if(!wait){ws.send(JSON.stringify(m));return;}
  deliveryAt.set(ws,due);deliveryPending.set(ws,pending+1);deliveryStats.scheduled++;deliveryStats.headOfLineDelayMaxMs=Math.max(deliveryStats.headOfLineDelayMaxMs,wait);
  const timer=setTimeout(()=>{deliveryTimers.delete(timer);const remaining=(deliveryPending.get(ws)??1)-1;if(remaining)deliveryPending.set(ws,remaining);else deliveryPending.delete(ws);if(ws.readyState===1){ws.send(JSON.stringify(m));deliveryStats.delivered++;}},wait);deliveryTimers.add(timer);
 }
 function view(r,seat){return {type:'state',code:r.code,seat,cpu:r.cpu,epoch:r.epoch,connected:r.players.map(p=>p?.ws?.readyState===1),hasGuest:!!r.players[1],ready:[...r.ready],phase:r.phase,selected:r.selected,returnTo:r.returnTo??null,rematchVotes:r.rematchVotes??[false,false]};}
 function state(r){r.players.forEach((p,i)=>send(p?.ws,view(r,i)));}
 function reset(r,returnTo=null){r.returnTo=returnTo;r.ended=[null,null];r.rematchVotes=[false,false];r.epoch++;r.ready=[false,false];r.phase='characters';r.barriers.clear();r.inputs.clear();r.lastFrame=-1;r.phaseKey=null;r.sequence=-1;state(r);}
 function create(){if(rooms.size>=maxRooms)throw Error('Room service is full');let id;do{id=code();}while(rooms.has(id));const r={code:id,cpu:true,epoch:0,players:[null,null],ready:[false,false],phase:'characters',selected:[{character:20,costume:0},{character:2,costume:0}],barriers:new Map(),inputs:new Map(),lastFrame:-1,phaseKey:null,sequence:-1,touched:Date.now(),ended:[null,null],rematchVotes:[false,false]};rooms.set(id,r);return r;}
 function reserve(r,seat){const key=token();r.players[seat]={token:key,ws:null};sessions.set(key,{r,seat});return {token:key,...view(r,seat)};}
 function removeGuest(r){const p=r.players[1];if(p){sessions.delete(p.token);send(p.ws,{type:'removed'});p.ws?.close();r.players[1]=null;}reset(r);}
 function action(session,m){const {r,seat}=session;r.touched=Date.now();
  if(m.type==='cpu'){if(seat||r.players[1]||r.phase!=='characters'||typeof m.enabled!=='boolean')throw Error('CPU changes require an empty guest seat at character select');r.cpu=m.enabled;r.ready=[false,false];state(r);}
  else if(m.type==='ready'){if(r.phase!=='characters'||r.cpu||!r.players[1]||!r.players.every(p=>p?.ws?.readyState===1))throw Error('Both players must be connected');r.ready[seat]=true;state(r);}
  else if(m.type==='kick'){if(seat)throw Error('Only P1 can remove a guest');removeGuest(r);}
  else if(m.type==='leave'){if(seat)removeGuest(r);else {removeGuest(r);sessions.delete(r.players[0].token);r.players[0].ws?.close();rooms.delete(r.code);}}
  else if(m.type==='selection'){const p=m.value;if(!p||!Number.isInteger(p.character)||p.character<0||p.character>25||!Number.isInteger(p.costume)||p.costume<0||p.costume>5)throw Error('Invalid character selection');r.selected[seat]={character:p.character,costume:p.costume};}
  else if(m.type==='phase'){
   if(m.epoch!==r.epoch||r.cpu||!r.players[1])return;
   if(!/^(characters|stages|match):[0-9]{1,6}$/.test(m.key))throw Error('Invalid scene barrier');
   if(r.phaseKey===m.key)return;
   const sequence=Number(m.key.split(':')[1]);if(sequence!==r.sequence+1)throw Error('Unexpected scene sequence');
   r.barriers.set(seat,m.key);if(r.barriers.get(0)!==m.key||r.barriers.get(1)!==m.key)return;
   r.sequence=sequence;r.phase=m.key.split(':')[0];r.phaseKey=m.key;r.inputs.clear();r.lastFrame=-1;r.ready=[false,false];
   for(let frame=0;frame<3;frame++){const inputs=[neutral(),neutral()];r.players.forEach((p,player)=>{send(p.ws,{type:'peer-input',key:m.key,epoch:r.epoch,frame,seat:1-player,value:inputs[1-player]});send(p.ws,{type:'frame',key:m.key,epoch:r.epoch,frame,inputs});send(p.ws,{type:'confirmed-frame',key:m.key,epoch:r.epoch,frame});});r.lastFrame=frame;}
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
   if(!Number.isSafeInteger(m.frame)||m.frame<=r.lastFrame||m.frame>r.lastFrame+120)throw Error('Input outside live window');
   const value=validateInput(m.value),entry=r.inputs.get(m.frame)??[null,null];
   if(entry[seat]&&JSON.stringify(entry[seat])!==JSON.stringify(value))throw Error('Conflicting immutable input');entry[seat]=value;r.inputs.set(m.frame,entry);
   send(r.players[1-seat]?.ws,{type:'peer-input',key:r.phaseKey,epoch:r.epoch,frame:m.frame,seat,value});
   while(r.inputs.get(r.lastFrame+1)?.every(Boolean)){
    const frame=++r.lastFrame,inputs=r.inputs.get(frame);r.inputs.delete(frame);for(const p of r.players){send(p?.ws,{type:'frame',key:r.phaseKey,epoch:r.epoch,frame,inputs});send(p?.ws,{type:'confirmed-frame',key:r.phaseKey,epoch:r.epoch,frame});}
   }
  }else throw Error('Unsupported room action');
 }
 function websocket(ws){let session=null,count=0,windowAt=Date.now();const timeout=setTimeout(()=>ws.close(1008,'Authentication required'),5000);
  ws.on('message',raw=>{try{if(Date.now()-windowAt>1000){windowAt=Date.now();count=0;}if(++count>240)throw Error('Room message rate exceeded');const m=JSON.parse(raw.toString());
   if(!session){session=sessions.get(m.token);if(m.type!=='hello'||!session)throw Error('Invalid room session');const p=session.r.players[session.seat];if(p.ws&&p.ws!==ws)p.ws.close(1000,'Reconnected');p.ws=ws;clearTimeout(timeout);session.r.touched=Date.now();state(session.r);return;}
   if(session.r.players[session.seat]?.ws!==ws||!sessions.has(session.r.players[session.seat]?.token))throw Error('Room session revoked');action(session,m);
  }catch(e){send(ws,{type:'error',message:e.message});}});
  ws.on('close',()=>{clearTimeout(timeout);if(session){const {r,seat}=session;if(r.players[seat]?.ws===ws){r.players[seat].ws=null;r.touched=Date.now();state(r);}}});
 }
 server.on('upgrade',(req,socket,head)=>{if(new URL(req.url,'http://localhost').pathname!=='/native-room'){socket.destroy();return;}if(!sameOrigin(req)){socket.destroy();return;}wss.handleUpgrade(req,socket,head,websocket);});
 let stopped=false;function stop(){if(stopped)return;stopped=true;clearInterval(sweep);for(const timer of deliveryTimers)clearTimeout(timer);deliveryTimers.clear();for(const client of wss.clients)client.terminate();wss.close();}
 const sweep=setInterval(()=>{for(const r of rooms.values())if(!r.players.some(p=>p?.ws?.readyState===1)&&Date.now()-r.touched>expiryMs){for(const p of r.players)if(p)sessions.delete(p.token);rooms.delete(r.code);}},5000);sweep.unref();server.on('close',stop);
 return {close:stop,deliverySnapshot(){return {...deliveryStats,byType:{...deliveryStats.byType}};},async handle(req,res){
  if(!['/native-rooms','/native-rooms/join','/native-rooms/resume'].includes(new URL(req.url,'http://localhost').pathname))return false;
  const reply=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
  if(req.method!=='POST'||req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host){reply(403,{error:'Same-origin POST required'});return true;}
  try{let body='';for await(const data of req){body+=data;if(body.length>4096)throw Error('Request too large');}const m=JSON.parse(body||'{}'),route=new URL(req.url,'http://localhost').pathname;
   if(route.endsWith('/resume')){const s=sessions.get(m.token);if(!s)throw Error('Room session expired');if(s.r.players[1]&&!(m.syncedReload===true&&m.epoch===s.r.epoch))reset(s.r);reply(200,{token:m.token,...view(s.r,s.seat)});}
   else if(route.endsWith('/join')){const r=rooms.get(m.code);if(!r)throw Error('Room not found');if(r.cpu)throw Error('P1 must remove the CPU first');if(r.players[1])throw Error('Room is full');const joined=reserve(r,1);reset(r);reply(200,{...joined,...view(r,1)});}
   else {const r=create();reply(200,reserve(r,0));}
  }catch(e){reply(400,{error:e.message});}return true;
 }};
}
