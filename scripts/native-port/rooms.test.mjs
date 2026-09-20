import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {WebSocket} from '../../web/node_modules/ws/wrapper.mjs';
import {createNativeRoomRelay} from './rooms.mjs';
async function fixture(t,options){
 const server=createServer((req,res)=>void relay.handle(req,res)),relay=createNativeRoomRelay(server,options);
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>{relay.close();server.close();});
 const base='http://127.0.0.1:'+server.address().port;
 const post=async(route,body={})=>{const r=await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:r.status,...await r.json()};};
 async function socket(token,hello={}){const ws=new WebSocket(base.replace('http','ws')+'/native-room'),queue=[],pending=[];
  ws.on('message',b=>{const value=JSON.parse(b);const index=pending.findIndex(p=>p.check(value));if(index>=0)pending.splice(index,1)[0].resolve(value);else queue.push(value);});
  const take=(check)=>{const index=queue.findIndex(check);if(index>=0)return Promise.resolve(queue.splice(index,1)[0]);return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Missing relay event '+check)),3000);pending.push({check,resolve:m=>{clearTimeout(timer);resolve(m);}});});};
  await new Promise(r=>ws.on('open',r));const send=m=>ws.send(JSON.stringify(m));send({type:'hello',token,...hello});await take(m=>m.type==='state');return {ws,take,send,queue};
 }
 return {post,socket,relay,base};
}
test('an invalid hello cannot poison a later valid session handshake',async t=>{
 const {post,base}=await fixture(t),owner=await post('/native-rooms'),ws=new WebSocket(base.replace('http','ws')+'/native-room');
 await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);});
 const next=()=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Missing handshake response')),1000);ws.once('message',raw=>{clearTimeout(timer);resolve(JSON.parse(raw));});});
 let response=next();ws.send(JSON.stringify({type:'invalid',token:owner.token}));assert.equal((await response).type,'error');
 response=next();ws.send(JSON.stringify({type:'hello',token:owner.token}));assert.equal((await response).type,'state');ws.close();
});
test('native rooms protect seats, require both Ready, and relay ordered immutable inputs',async t=>{
 const {post,socket}=await fixture(t),owner=await post('/native-rooms',{diagnosticCpu:true}),a=await socket(owner.token);
 assert.equal(owner.cpu,true);assert.equal(owner.seat,0);assert.equal((await post('/native-rooms/join',{code:owner.code})).status,400);
 a.send({type:'cpu',enabled:false});await a.take(m=>m.type==='state'&&!m.cpu);
 const guest=await post('/native-rooms/join',{code:owner.code}),b=await socket(guest.token);assert.equal(guest.seat,1);
 assert.equal((await post('/native-rooms/join',{code:owner.code})).status,400);
 const epoch=guest.epoch;assert.equal(epoch,1);
 for(const type of ['cpu','kick']){b.send({type,enabled:true});assert.equal((await b.take(m=>m.type==='error')).type,'error');}
 for(const peer of [a,b])peer.send({type:'phase',epoch,key:'characters:0'});
 for(const peer of [a,b]){for(let frame=0;frame<3;frame++)assert.equal((await peer.take(m=>m.type==='frame')).frame,frame);await peer.take(m=>m.type==='phase-ready');}
 a.send({type:'ready'});let ready=await a.take(m=>m.type==='state'&&m.ready[0]);assert.deepEqual(ready.ready,[true,false]);
 b.send({type:'ready'});ready=await a.take(m=>m.type==='state'&&m.ready.every(Boolean));assert.deepEqual(ready.ready,[true,true]);
 // A duplicate phase must not rewind inputs or readiness.
 a.send({type:'phase',epoch,key:'characters:0'});b.send({type:'phase',epoch,key:'characters:0'});
 const send=(peer,frame,pad)=>peer.send({type:'input',epoch,key:'characters:0',frame,value:{pad:[pad,0,0,0,0,0,0],tap:1}});
 send(a,4,256);assert.deepEqual((await b.take(m=>m.type==='peer-input'&&m.frame===4)).value.pad,[256,0,0,0,0,0,0]);
 send(b,4,512);assert.deepEqual((await a.take(m=>m.type==='peer-input'&&m.frame===4)).value.pad,[512,0,0,0,0,0,0]);
 // Individual authenticated inputs arrive immediately even while frame 3 still
 // prevents the authoritative confirmation horizon from advancing.
 assert.equal(a.queue.some(m=>m.type==='confirmed-frame'&&m.frame===4),false);
 send(a,3,16);send(a,3,32);await a.take(m=>m.type==='error');send(b,3,64);
 for(const peer of [a,b]){const f3=await peer.take(m=>m.type==='frame'&&m.frame===3),c3=await peer.take(m=>m.type==='confirmed-frame'&&m.frame===3),f4=await peer.take(m=>m.type==='frame'&&m.frame===4),c4=await peer.take(m=>m.type==='confirmed-frame'&&m.frame===4);assert.equal(f3.frame,3);assert.equal(c3.frame,3);assert.deepEqual(f3.inputs.map(v=>v.pad[0]),[16,64]);assert.equal(f4.frame,4);assert.equal(c4.frame,4);assert.deepEqual(f4.inputs.map(v=>v.pad[0]),[256,512]);}
 a.send({type:'kick'});await b.take(m=>m.type==='removed');assert.equal((await post('/native-rooms/resume',{token:guest.token})).status,400);
 assert.equal((await post('/native-rooms/resume',{token:owner.token})).code,owner.code);
});
test('tournament rooms start human-only and reject CPU mode',async t=>{
 const {post,socket}=await fixture(t),owner=await post('/native-rooms'),a=await socket(owner.token);
 assert.equal(owner.cpu,false);a.send({type:'cpu',enabled:true});assert.match((await a.take(m=>m.type==='error')).message,/unavailable/);
 const guest=await post('/native-rooms/join',{code:owner.code});assert.equal(guest.status,200);assert.equal(guest.cpu,false);
});
test('release relay rejects diagnostic CPU creation',async t=>{
 const {post}=await fixture(t,{allowDiagnosticCpu:false});
 assert.equal((await post('/native-rooms',{diagnosticCpu:true})).status,400);
 assert.equal((await post('/native-rooms')).cpu,false);
});
test('rollback negotiation omits lockstep packets and survives reconnect',async t=>{
 const {post,socket}=await fixture(t),owner=await post('/native-rooms'),a=await socket(owner.token),guest=await post('/native-rooms/join',{code:owner.code}),b=await socket(guest.token),epoch=guest.epoch,key='match:0';
 for(const peer of [a,b])peer.send({type:'phase',epoch,key,rollback:true});
 await a.take(m=>m.type==='phase-ready');await b.take(m=>m.type==='phase-ready');
 const value={pad:[16,0,0,0,0,0,0],tap:1};
 for(const peer of [a,b])peer.send({type:'input',epoch,key,frame:3,value});
 await a.take(m=>m.type==='confirmed-frame'&&m.frame===3);await b.take(m=>m.type==='confirmed-frame'&&m.frame===3);
 assert.equal(a.queue.some(m=>m.type==='frame'),false);assert.equal(b.queue.some(m=>m.type==='frame'),false);
 b.ws.close();await a.take(m=>m.type==='state'&&!m.connected[1]);
 const resumed=await socket(guest.token,{rollback:true,resume:{epoch,key,confirmedFrame:2}});
 assert.equal(resumed.queue.some(m=>m.type==='frame'),false);
 assert.equal(resumed.queue.some(m=>m.type==='peer-input'&&m.frame===3),true);
 assert.equal(resumed.queue.some(m=>m.type==='confirmed-frame'&&m.frame===3),true);
});
test('test-only delayed delivery preserves per-socket order and reports injection',async t=>{
 let calls=0;const {post,socket,relay}=await fixture(t,{deliveryDelayMs:m=>m.type==='peer-input'&&m.frame>=3?[30,0][calls++%2]:null}),owner=await post('/native-rooms'),a=await socket(owner.token);
 a.send({type:'cpu',enabled:false});await a.take(m=>m.type==='state'&&!m.cpu);const guest=await post('/native-rooms/join',{code:owner.code}),b=await socket(guest.token),epoch=guest.epoch;
 for(const peer of [a,b])peer.send({type:'phase',epoch,key:'match:0'});await a.take(m=>m.type==='phase-ready');await b.take(m=>m.type==='phase-ready');
 const value={pad:[16,0,0,0,0,0,0],tap:1};a.send({type:'input',epoch,key:'match:0',frame:3,value});const blockedUntil=Date.now()+40;while(Date.now()<blockedUntil){}a.send({type:'input',epoch,key:'match:0',frame:4,value});
 assert.equal((await b.take(m=>m.type==='peer-input'&&m.frame>=3)).frame,3);assert.equal((await b.take(m=>m.type==='peer-input'&&m.frame>=3)).frame,4);
 const stats=relay.deliverySnapshot();assert.equal(stats.configured,2);assert.equal(stats.scheduled,2);assert.equal(stats.delivered,2);assert.deepEqual(stats.byType,{'peer-input':2});assert.equal(stats.configuredDelayMinMs,0);assert.equal(stats.configuredDelayMaxMs,30);assert.ok(stats.headOfLineDelayMaxMs>=30);
});
test('test-only delayed receipt preserves order after an overdue timer',async t=>{
 let calls=0;const {post,socket,relay}=await fixture(t,{receiveDelayMs:m=>m.type==='input'&&m.frame>=3?[30,0][calls++%2]:null}),owner=await post('/native-rooms'),a=await socket(owner.token);
 a.send({type:'cpu',enabled:false});await a.take(m=>m.type==='state'&&!m.cpu);const guest=await post('/native-rooms/join',{code:owner.code}),b=await socket(guest.token),epoch=guest.epoch;
 for(const peer of [a,b])peer.send({type:'phase',epoch,key:'match:0'});await a.take(m=>m.type==='phase-ready');await b.take(m=>m.type==='phase-ready');
 const value={pad:[16,0,0,0,0,0,0],tap:1};a.send({type:'input',epoch,key:'match:0',frame:3,value});const blockedUntil=Date.now()+40;while(Date.now()<blockedUntil){}a.send({type:'input',epoch,key:'match:0',frame:4,value});
 assert.equal((await b.take(m=>m.type==='peer-input'&&m.frame>=3)).frame,3);assert.equal((await b.take(m=>m.type==='peer-input'&&m.frame>=3)).frame,4);
 const stats=relay.receiveSnapshot();assert.equal(stats.configured,2);assert.equal(stats.scheduled,2);assert.equal(stats.delivered,2);assert.deepEqual(stats.byType,{input:2});assert.equal(stats.configuredDelayMinMs,0);assert.equal(stats.configuredDelayMaxMs,30);assert.ok(stats.headOfLineDelayMaxMs>=30);
});
test('refresh starts one new epoch; coordinated reload does not recurse',async t=>{
 const {post,socket}=await fixture(t),owner=await post('/native-rooms'),a=await socket(owner.token);a.send({type:'cpu',enabled:false});await a.take(m=>m.type==='state'&&!m.cpu);
 const guest=await post('/native-rooms/join',{code:owner.code});await socket(guest.token);
 let resumed=await post('/native-rooms/resume',{token:owner.token,epoch:guest.epoch,syncedReload:true});assert.equal(resumed.epoch,guest.epoch);
 resumed=await post('/native-rooms/resume',{token:guest.token,epoch:guest.epoch});assert.equal(resumed.epoch,guest.epoch+1);
 const peer=await post('/native-rooms/resume',{token:owner.token,epoch:resumed.epoch,syncedReload:true});assert.equal(peer.epoch,resumed.epoch);
});

test('live reconnect pauses input and replays the exact missed confirmation horizon',async t=>{
 const {post,socket}=await fixture(t),owner=await post('/native-rooms'),a=await socket(owner.token);a.send({type:'cpu',enabled:false});await a.take(m=>m.type==='state'&&!m.cpu);
 const guest=await post('/native-rooms/join',{code:owner.code}),b=await socket(guest.token),epoch=guest.epoch,key='match:0';
 for(const peer of [a,b])peer.send({type:'phase',epoch,key});await a.take(m=>m.type==='phase-ready');await b.take(m=>m.type==='phase-ready');
 const value=button=>({pad:[button,0,0,0,0,0,0],tap:1});a.send({type:'input',epoch,key,frame:3,value:value(16)});b.send({type:'input',epoch,key,frame:3,value:value(64)});
 await a.take(m=>m.type==='confirmed-frame'&&m.frame===3);await b.take(m=>m.type==='confirmed-frame'&&m.frame===3);
 b.ws.close();await a.take(m=>m.type==='state'&&!m.connected[1]);a.send({type:'input',epoch,key,frame:4,value:value(32)});await new Promise(r=>setTimeout(r,20));assert.equal(a.queue.some(m=>m.type==='error'||m.type==='confirmed-frame'&&m.frame===4),false);
 const resumed=await socket(guest.token,{resume:{epoch,key,confirmedFrame:2}});const replayedFrame=resumed.queue.find(m=>m.type==='frame'&&m.frame===3),replayedConfirmation=resumed.queue.find(m=>m.type==='confirmed-frame'&&m.frame===3);
 assert.deepEqual(replayedFrame.inputs.map(v=>v.pad[0]),[16,64]);assert.equal(replayedConfirmation.frame,3);assert.equal(resumed.queue.some(m=>m.type==='phase-ready'&&m.key===key),true);
});

test('static-only hosting cannot become another game mode without an explicit diagnostic',async()=>{
 const {createLocalNativeRoom}=await import('../../engines/browser-native/native-room.mjs');const local=createLocalNativeRoom();
 assert.equal(local.code,'');assert.equal(local.cpu,false);assert.equal(local.active,false);assert.equal(local.offline,true);assert.equal(local.snapshot().mode,'unavailable');
 const samples=[[4352,1,0,0,0,0,0],[256,1,0,0,0,0,0]];assert.deepEqual(local.take(samples),[[256,1,0,0,0,0,0],[0,0,0,0,0,0,0]]);assert.doesNotThrow(()=>local.begin('match'));assert.throws(()=>local.join('ABCDEF'),/unavailable/);assert.throws(()=>local.cpuMode(false),/unavailable/);
 const diagnostic=createLocalNativeRoom('offline',{diagnosticCpu:true});assert.equal(diagnostic.cpu,true);assert.equal(diagnostic.snapshot().mode,'diagnostic-cpu');assert.equal(diagnostic.take(samples),samples);
});

test('browser room buffers authenticated rollback events and exposes immutable sends',async t=>{
 const original={fetch:globalThis.fetch,WebSocket:globalThis.WebSocket,location:globalThis.location};let socket;
 class FakeSocket{
  static OPEN=1;constructor(){socket=this;this.readyState=1;this.sent=[];queueMicrotask(()=>this.onopen?.());}
  send(raw){const m=JSON.parse(raw);this.sent.push(m);if(m.type==='hello')queueMicrotask(()=>this.emit({type:'state',code:'ABC234',seat:0,cpu:false,epoch:4,connected:[true,true],hasGuest:true,ready:[true,true],phase:'match',selected:[],returnTo:null,rematchVotes:[false,false]}));}
  emit(value){this.onmessage?.({data:JSON.stringify(value)});}close(){this.readyState=3;}
 }
 globalThis.fetch=async()=>new Response(JSON.stringify({token:'owner-token',code:'ABC234',seat:0,cpu:false,epoch:4,connected:[true,true],hasGuest:true,ready:[true,true],phase:'match'}),{status:200,headers:{'Content-Type':'application/json'}});
 globalThis.WebSocket=FakeSocket;globalThis.location={href:'http://room.test/character-menu.html',reload(){}};
 t.after(()=>{globalThis.fetch=original.fetch;globalThis.WebSocket=original.WebSocket;globalThis.location=original.location;});
 const storage={value:null,getItem(){return this.value;},setItem(_key,value){this.value=value;},removeItem(){this.value=null;}};
 const {connectNativeRoom}=await import('../../engines/browser-native/native-room.mjs');const room=await connectNativeRoom({storage,reload(){}});assert.equal(room.tapJump,1);room.setTapJump(0);assert.equal(room.tapJump,0);room.bindRollback(null);room.begin('match');
 assert.equal(JSON.parse(storage.value).diagnosticCpu,false);
 socket.emit({type:'peer-input',key:'match:0',epoch:4,frame:0,seat:1,value:{pad:[0,0,0,0,0,0,0],tap:1}});socket.emit({type:'confirmed-frame',key:'match:0',epoch:4,frame:0});
 const events=[],unbind=room.bindRollback({receive:(frame,value)=>events.push(['input',frame,value.tap]),acknowledge:frame=>events.push(['confirmed',frame])});assert.deepEqual(events,[['input',0,1],['confirmed',0]]);
 socket.emit({type:'phase-ready',key:'match:0',epoch:4});assert.equal(room.sendInput(3,[256,0,0,0,0,0,0]),true);assert.equal(socket.sent.filter(m=>m.type==='input').length,1);
 assert.equal(room.sendInput(3,[256,0,0,0,0,0,0]),true);assert.equal(socket.sent.filter(m=>m.type==='input').length,1);assert.throws(()=>room.sendInput(3,[0,0,0,0,0,0,0]),/Conflicting/);
 room.endMatch({results:'native'},2);assert.equal(socket.sent.some(m=>m.type==='ended'),false);socket.emit({type:'confirmed-frame',key:'match:0',epoch:4,frame:1});assert.equal(socket.sent.some(m=>m.type==='ended'),false);socket.emit({type:'confirmed-frame',key:'match:0',epoch:4,frame:2});assert.equal(socket.sent.filter(m=>m.type==='ended').length,1);
 assert.deepEqual(room.snapshot().pendingEnding,{frame:2,sent:true});
 for(let frame=3;frame<28800;frame++){
  if(frame>3)room.sendInput(frame,[0,0,0,0,0,0,0]);
  socket.emit({type:'frame',key:'match:0',epoch:4,frame,inputs:[]});
  socket.emit({type:'confirmed-frame',key:'match:0',epoch:4,frame});
 }
 assert.equal(room.snapshot().buffered,0);assert.equal(room.snapshot().bufferedSent,0);assert.equal(room.snapshot().confirmedFrame,28799);
 const sentBeforeRetry=socket.sent.filter(m=>m.type==='input').length;
 assert.equal(room.sendInput(28799,[0,0,0,0,0,0,0]),true);
 assert.equal(socket.sent.filter(m=>m.type==='input').length,sentBeforeRetry);
 assert.equal(room.snapshot().bufferedSent,0);
 unbind();room.dispose();
});

test('normal startup cannot resume a diagnostic CPU room',async t=>{
 const original={fetch:globalThis.fetch,WebSocket:globalThis.WebSocket,location:globalThis.location},calls=[];let socket;
 class FakeSocket{static OPEN=1;constructor(){socket=this;this.readyState=1;queueMicrotask(()=>this.onopen?.());}send(raw){const m=JSON.parse(raw);if(m.type==='hello')queueMicrotask(()=>this.onmessage?.({data:JSON.stringify({type:'state',code:'HUMAN2',seat:0,cpu:false,epoch:0,connected:[true,false],hasGuest:false,ready:[false,false],phase:'characters',selected:[],returnTo:null,rematchVotes:[false,false]})}));}close(){this.readyState=3;}}
 globalThis.fetch=async(url,init)=>{calls.push({url,body:JSON.parse(init.body)});return new Response(JSON.stringify({token:'human-token',code:'HUMAN2',seat:0,cpu:false,epoch:0,connected:[false,false],hasGuest:false,ready:[false,false],phase:'characters'}),{status:200,headers:{'Content-Type':'application/json'}});};globalThis.WebSocket=FakeSocket;globalThis.location={href:'http://room.test/character-menu.html',reload(){}};
 t.after(()=>{globalThis.fetch=original.fetch;globalThis.WebSocket=original.WebSocket;globalThis.location=original.location;});
 const storage={value:JSON.stringify({token:'cpu-token',epoch:3,diagnosticCpu:true}),getItem(){return this.value;},setItem(_key,value){this.value=value;},removeItem(){this.value=null;}};
 const {connectNativeRoom}=await import('../../engines/browser-native/native-room.mjs'),room=await connectNativeRoom({storage,reload(){}});assert.equal(calls.length,1);assert.equal(calls[0].url,'/native-rooms');assert.deepEqual(calls[0].body,{diagnosticCpu:false});assert.equal(room.cpu,false);room.dispose();
});

test('browser room reconnects in place and authenticates its exact confirmation horizon',async t=>{
 const original={fetch:globalThis.fetch,WebSocket:globalThis.WebSocket,location:globalThis.location},sockets=[];
 class FakeSocket{
  static OPEN=1;constructor(){sockets.push(this);this.readyState=1;this.sent=[];queueMicrotask(()=>this.onopen?.());}
  send(raw){const m=JSON.parse(raw);this.sent.push(m);if(m.type==='hello')queueMicrotask(()=>this.emit({type:'state',code:'ABC234',seat:0,cpu:false,epoch:4,connected:[true,true],hasGuest:true,ready:[true,true],phase:'match',selected:[],returnTo:null,rematchVotes:[false,false]}));}
  emit(value){this.onmessage?.({data:JSON.stringify(value)});}close(){this.readyState=3;}drop(){this.readyState=3;this.onclose?.();}
 }
 globalThis.fetch=async()=>new Response(JSON.stringify({token:'owner-token',code:'ABC234',seat:0,cpu:false,epoch:4,connected:[true,true],hasGuest:true,ready:[true,true],phase:'match'}),{status:200,headers:{'Content-Type':'application/json'}});
 globalThis.WebSocket=FakeSocket;globalThis.location={href:'http://room.test/character-menu.html',reload(){}};
 t.after(()=>{globalThis.fetch=original.fetch;globalThis.WebSocket=original.WebSocket;globalThis.location=original.location;});
 const storage={value:null,getItem(){return this.value;},setItem(_key,value){this.value=value;},removeItem(){this.value=null;}},states=[];let reloads=0;
 const {connectNativeRoom}=await import('../../engines/browser-native/native-room.mjs');const room=await connectNativeRoom({storage,onState:n=>states.push([...n.state.connected]),reload(){reloads++;}});const events=[];room.bindRollback({receive:(frame,value)=>events.push(['input',frame,value.pad[0]]),acknowledge:frame=>events.push(['confirmed',frame])});room.begin('match');
 sockets[0].emit({type:'phase-ready',key:'match:0',epoch:4});sockets[0].emit({type:'peer-input',key:'match:0',epoch:4,frame:0,seat:1,value:{pad:[64,0,0,0,0,0,0],tap:1}});sockets[0].emit({type:'confirmed-frame',key:'match:0',epoch:4,frame:0});sockets[0].drop();
 await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('Reconnect did not open')),1000),poll=()=>{if(sockets.length===2){clearTimeout(timeout);resolve();}else setTimeout(poll,10);};poll();});
 const hello=sockets[1].sent.find(m=>m.type==='hello');assert.deepEqual(hello.resume,{epoch:4,key:'match:0',confirmedFrame:0});assert.equal(states.some(s=>s.every(v=>!v)),true);
 sockets[1].emit({type:'peer-input',key:'match:0',epoch:4,frame:1,seat:1,value:{pad:[128,0,0,0,0,0,0],tap:1}});sockets[1].emit({type:'confirmed-frame',key:'match:0',epoch:4,frame:1});assert.deepEqual(events.slice(-2),[['input',1,128],['confirmed',1]]);
 sockets[1].emit({type:'resync-required'});assert.equal(reloads,1);assert.equal(JSON.parse(storage.value).syncedReload,false);room.dispose();
});

test('results require consensus, two rematch votes and one coordinated fresh epoch',async t=>{
 const {post,socket}=await fixture(t),owner=await post('/native-rooms'),a=await socket(owner.token);
 a.send({type:'cpu',enabled:false});await a.take(m=>m.type==='state'&&!m.cpu);
 const guest=await post('/native-rooms/join',{code:owner.code}),b=await socket(guest.token),epoch=guest.epoch;
 const selection={stage:31,players:[{character:20,costume:0,kind:0},{character:2,costume:0,kind:0}]};
 const results={outcome:2,frames:1000,winnerCount:1,players:[{character:20,kind:0,stocks:0,percent:0,score:-4,winner:false,kos:0,falls:4,selfDestructs:0},{character:2,kind:0,stocks:4,percent:0,score:0,winner:true,kos:4,falls:0,selfDestructs:0}]};
 a.send({type:'result-action',epoch,action:'rematch'});await a.take(m=>m.type==='error');
 for(const c of [a,b])c.send({type:'phase',epoch,key:'match:0'});
 await a.take(m=>m.type==='phase-ready');await b.take(m=>m.type==='phase-ready');
 const end=(c,frame=2)=>c.send({type:'ended',epoch,key:'match:0',frame,value:{selection,results}});
 end(a,3);assert.match((await a.take(m=>m.type==='error')).message,/not confirmed/);
 end(a);a.send({type:'result-action',epoch,action:'rematch'});await a.take(m=>m.type==='error');end(b);
 await a.take(m=>m.type==='state'&&m.phase==='results');await b.take(m=>m.type==='state'&&m.phase==='results');
 a.send({type:'result-action',epoch,action:'rematch'});const voted=await a.take(m=>m.type==='state'&&m.rematchVotes[0]);assert.equal(voted.epoch,epoch);assert.deepEqual(voted.rematchVotes,[true,false]);
 b.send({type:'result-action',epoch,action:'rematch'});const next=await a.take(m=>m.type==='state'&&m.epoch===epoch+1);assert.equal(next.returnTo.action,'rematch');assert.equal(next.returnTo.stage,31);assert.equal(next.code,owner.code);
 const resumed=await post('/native-rooms/resume',{token:guest.token,epoch:next.epoch,syncedReload:true});assert.equal(resumed.epoch,next.epoch);assert.equal(resumed.seat,1);assert.deepEqual(resumed.returnTo,next.returnTo);
 // Old votes cannot restart a new epoch.
 a.send({type:'result-action',epoch,action:'characters'});
 const check=await post('/native-rooms/resume',{token:owner.token,epoch:next.epoch,syncedReload:true});assert.equal(check.epoch,next.epoch);
 for(const c of [a,b])c.send({type:'phase',epoch:next.epoch,key:'match:0'});await a.take(m=>m.type==='phase-ready'&&m.epoch===next.epoch);
 a.send({type:'ended',epoch:next.epoch,key:'match:0',frame:2,value:{selection,results}});
 b.send({type:'ended',epoch:next.epoch,key:'match:0',frame:2,value:{selection,results:{...results,frames:1001}}});
 for(const c of [a,b])assert.match((await c.take(m=>m.type==='error')).message,/diverged/);
 a.send({type:'result-action',epoch:next.epoch,action:'rematch'});await a.take(m=>m.type==='error');
});
