import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {WebSocket} from '../../web/node_modules/ws/wrapper.mjs';
import {createNativeRoomRelay} from './rooms.mjs';
async function fixture(t){
 const server=createServer((req,res)=>void relay.handle(req,res)),relay=createNativeRoomRelay(server);
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>{relay.close();server.close();});
 const base='http://127.0.0.1:'+server.address().port;
 const post=async(route,body={})=>{const r=await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:r.status,...await r.json()};};
 async function socket(token){const ws=new WebSocket(base.replace('http','ws')+'/native-room'),queue=[],pending=[];
  ws.on('message',b=>{const value=JSON.parse(b);const index=pending.findIndex(p=>p.check(value));if(index>=0)pending.splice(index,1)[0].resolve(value);else queue.push(value);});
  const take=(check)=>{const index=queue.findIndex(check);if(index>=0)return Promise.resolve(queue.splice(index,1)[0]);return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Missing relay event '+check)),3000);pending.push({check,resolve:m=>{clearTimeout(timer);resolve(m);}});});};
  await new Promise(r=>ws.on('open',r));const send=m=>ws.send(JSON.stringify(m));send({type:'hello',token});await take(m=>m.type==='state');return {ws,take,send,queue};
 }
 return {post,socket};
}
test('native rooms protect seats, require both Ready, and relay ordered immutable inputs',async t=>{
 const {post,socket}=await fixture(t),owner=await post('/native-rooms'),a=await socket(owner.token);
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
 send(a,4,256);send(b,4,512);send(a,3,16);send(a,3,32);await a.take(m=>m.type==='error');send(b,3,64);
 for(const peer of [a,b]){const f3=await peer.take(m=>m.type==='frame'),f4=await peer.take(m=>m.type==='frame');assert.equal(f3.frame,3);assert.deepEqual(f3.inputs.map(v=>v.pad[0]),[16,64]);assert.equal(f4.frame,4);assert.deepEqual(f4.inputs.map(v=>v.pad[0]),[256,512]);}
 a.send({type:'kick'});await b.take(m=>m.type==='removed');assert.equal((await post('/native-rooms/resume',{token:guest.token})).status,400);
 assert.equal((await post('/native-rooms/resume',{token:owner.token})).code,owner.code);
});
test('refresh starts one new epoch; coordinated reload does not recurse',async t=>{
 const {post,socket}=await fixture(t),owner=await post('/native-rooms'),a=await socket(owner.token);a.send({type:'cpu',enabled:false});await a.take(m=>m.type==='state'&&!m.cpu);
 const guest=await post('/native-rooms/join',{code:owner.code});await socket(guest.token);
 let resumed=await post('/native-rooms/resume',{token:owner.token,epoch:guest.epoch,syncedReload:true});assert.equal(resumed.epoch,guest.epoch);
 resumed=await post('/native-rooms/resume',{token:guest.token,epoch:guest.epoch});assert.equal(resumed.epoch,guest.epoch+1);
 const peer=await post('/native-rooms/resume',{token:owner.token,epoch:resumed.epoch,syncedReload:true});assert.equal(peer.epoch,resumed.epoch);
});

test('static-only hosting keeps CPU gameplay without a counterfeit room code',async()=>{
 const {createLocalNativeRoom}=await import('../../engines/browser-native/native-room.mjs');const local=createLocalNativeRoom();
 assert.equal(local.code,'');assert.equal(local.cpu,true);assert.equal(local.active,false);assert.equal(local.offline,true);
 const samples=[[256,1,0,0,0,0,0],[0,0,0,0,0,0,0]];assert.equal(local.take(samples),samples);assert.doesNotThrow(()=>local.begin('match'));assert.throws(()=>local.join('ABCDEF'),/unavailable/);assert.throws(()=>local.cpuMode(false),/unavailable/);
});

test('results require consensus, two rematch votes and one coordinated fresh epoch',async t=>{
 const {post,socket}=await fixture(t),owner=await post('/native-rooms'),a=await socket(owner.token);
 a.send({type:'cpu',enabled:false});await a.take(m=>m.type==='state'&&!m.cpu);
 const guest=await post('/native-rooms/join',{code:owner.code}),b=await socket(guest.token),epoch=guest.epoch;
 const selection={stage:31,players:[{character:20,costume:0,kind:0},{character:2,costume:0,kind:0}]};
 const results={outcome:2,frames:1000,winnerCount:1,players:[{character:20,kind:0,stocks:0,percent:0,score:-4,winner:false},{character:2,kind:0,stocks:4,percent:0,score:0,winner:true}]};
 a.send({type:'result-action',epoch,action:'rematch'});await a.take(m=>m.type==='error');
 for(const c of [a,b])c.send({type:'phase',epoch,key:'match:0'});
 await a.take(m=>m.type==='phase-ready');await b.take(m=>m.type==='phase-ready');
 const end=c=>c.send({type:'ended',epoch,key:'match:0',value:{selection,results}});
 end(a);a.send({type:'result-action',epoch,action:'rematch'});await a.take(m=>m.type==='error');end(b);
 await a.take(m=>m.type==='state'&&m.phase==='results');await b.take(m=>m.type==='state'&&m.phase==='results');
 a.send({type:'result-action',epoch,action:'rematch'});const voted=await a.take(m=>m.type==='state'&&m.rematchVotes[0]);assert.equal(voted.epoch,epoch);assert.deepEqual(voted.rematchVotes,[true,false]);
 b.send({type:'result-action',epoch,action:'rematch'});const next=await a.take(m=>m.type==='state'&&m.epoch===epoch+1);assert.equal(next.returnTo.action,'rematch');assert.equal(next.returnTo.stage,31);assert.equal(next.code,owner.code);
 const resumed=await post('/native-rooms/resume',{token:guest.token,epoch:next.epoch,syncedReload:true});assert.equal(resumed.epoch,next.epoch);assert.equal(resumed.seat,1);assert.deepEqual(resumed.returnTo,next.returnTo);
 // Old votes cannot restart a new epoch.
 a.send({type:'result-action',epoch,action:'characters'});
 const check=await post('/native-rooms/resume',{token:owner.token,epoch:next.epoch,syncedReload:true});assert.equal(check.epoch,next.epoch);
 for(const c of [a,b])c.send({type:'phase',epoch:next.epoch,key:'match:0'});await a.take(m=>m.type==='phase-ready'&&m.epoch===next.epoch);
 a.send({type:'ended',epoch:next.epoch,key:'match:0',value:{selection,results}});
 b.send({type:'ended',epoch:next.epoch,key:'match:0',value:{selection,results:{...results,frames:1001}}});
 for(const c of [a,b])assert.match((await c.take(m=>m.type==='error')).message,/diverged/);
 a.send({type:'result-action',epoch:next.epoch,action:'rematch'});await a.take(m=>m.type==='error');
});
