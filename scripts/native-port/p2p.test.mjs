import test from 'node:test';
import assert from 'node:assert/strict';
import {createRoomCore} from '../../engines/browser-native/room-core.mjs';
import {memoryStore,signal} from '../../deploy/playmelee/api/_signal-core.js';

const hostKey='hostkey-0123456789abcdef',code='ABCDEF';

test('signaling pairs one offer with its answer and protects the host seat',async()=>{
 const store=memoryStore();
 assert.equal((await signal(store,{op:'offer',code,id:'guest-0001',sdp:'x'})).status,404);
 assert.equal((await signal(store,{op:'host',code,hostKey})).status,200);
 assert.equal((await signal(store,{op:'host',code,hostKey:'another-host-key-0000'})).status,409);
 assert.equal((await signal(store,{op:'host',code,hostKey})).status,200,'the same host may reclaim its code after reload');
 assert.equal((await signal(store,{op:'offer',code,id:'guest-0001',sdp:'offer-sdp'})).status,200);
 assert.equal((await signal(store,{op:'poll-offer',code,hostKey:'another-host-key-0000'})).status,403);
 const polled=await signal(store,{op:'poll-offer',code,hostKey});assert.deepEqual([polled.body.offer.id,polled.body.offer.sdp],['guest-0001','offer-sdp']);
 assert.equal((await signal(store,{op:'poll-offer',code,hostKey})).body.offer,null,'an offer is delivered once');
 assert.equal((await signal(store,{op:'poll-answer',code,id:'guest-0001'})).body.answer,null);
 assert.equal((await signal(store,{op:'answer',code,hostKey,id:'guest-0001',sdp:'answer-sdp'})).status,200);
 assert.equal((await signal(store,{op:'poll-answer',code,id:'guest-0001'})).body.answer.sdp,'answer-sdp');
 assert.equal((await signal(store,{op:'poll-answer',code,id:'guest-0001'})).body.answer,null);
 assert.equal((await signal(store,{op:'offer',code:'bad',id:'guest-0001',sdp:'x'})).status,400);
 assert.equal((await signal(store,{op:'offer',code,id:'guest-0001',sdp:'x'.repeat(20000)})).status,400);
 assert.equal((await signal(store,{op:'close',code,hostKey})).status,200);
 assert.equal((await signal(store,{op:'offer',code,id:'guest-0001',sdp:'x'})).status,404);
});

function peer(){const m=[];return {rollback:false,readyState:1,messages:m,send:t=>m.push(JSON.parse(t)),close(){this.readyState=3;},terminate(){this.readyState=3;}};}
function connect(core,token){const ws=peer(),h=core.attach(ws);h.message(JSON.stringify({type:'hello',token,rollback:true}));return {ws,h};}

test('owner-hosted room authority survives serialization across page reloads',()=>{
 const core=createRoomCore();const owner=core.request('create',{}).body,guest=core.request('join',{code:owner.code}).body;
 assert.equal(guest.seat,1);
 const saved=JSON.parse(JSON.stringify(core.serialize()));core.close();
 const restored=createRoomCore();restored.restore(saved);
 const resumed=restored.request('resume',{token:guest.token,epoch:guest.epoch,syncedReload:true});
 assert.equal(resumed.status,200);assert.equal(resumed.body.code,owner.code);assert.equal(resumed.body.seat,1);assert.equal(resumed.body.epoch,guest.epoch);
 assert.equal(restored.request('resume',{token:'missing'}).status,400);
 restored.close();
});

test('an input repeated after reconnect is idempotent once confirmed, but conflicts still fail',()=>{
 const core=createRoomCore(),owner=core.request('create',{}).body,guest=core.request('join',{code:owner.code}).body;
 const a=connect(core,owner.token),b=connect(core,guest.token),key='match:0',epoch=guest.epoch;
 for(const c of [a,b])c.h.message(JSON.stringify({type:'phase',key,epoch,rollback:true}));
 const input=(c,frame,x)=>c.h.message(JSON.stringify({type:'input',key,epoch,frame,value:{pad:[0,x,0,0,0,0,0],tap:1}}));
 input(a,3,.5);input(b,3,0);
 assert.ok(a.ws.messages.some(m=>m.type==='confirmed-frame'&&m.frame===3));
 const errors=()=>a.ws.messages.filter(m=>m.type==='error').length;
 input(a,3,.5);assert.equal(errors(),0,'identical confirmed input is ignored');
 input(a,3,-.5);assert.equal(errors(),1,'a changed confirmed input is rejected');
 core.close();
});

test('each seat reports its input device to the opponent and a new guest starts on keyboard',()=>{
 const core=createRoomCore(),owner=core.request('create',{}).body,guest=core.request('join',{code:owner.code}).body;
 const a=connect(core,owner.token),b=connect(core,guest.token),last=c=>c.ws.messages.filter(m=>m.type==='state').at(-1);
 assert.deepEqual(last(a).devices,['keyboard','keyboard']);
 b.h.message(JSON.stringify({type:'device',value:'controller'}));
 assert.deepEqual(last(a).devices,['keyboard','controller']);
 const count=a.ws.messages.length;b.h.message(JSON.stringify({type:'device',value:'controller'}));
 assert.equal(a.ws.messages.length,count,'an unchanged device is not rebroadcast');
 b.h.message(JSON.stringify({type:'device',value:'joystick'}));
 assert.ok(b.ws.messages.some(m=>m.type==='error'));
 const restored=createRoomCore();restored.restore(JSON.parse(JSON.stringify(core.serialize())));
 assert.deepEqual(restored.request('resume',{token:owner.token}).body.devices,['keyboard','controller']);
 a.h.message(JSON.stringify({type:'kick'}));
 assert.deepEqual(last(a).devices,['keyboard','keyboard']);
});

test('a CPU room hands the CPU seat to a joining player and takes it back when they go',()=>{
 const core=createRoomCore(),owner=core.request('create',{diagnosticCpu:true}).body;
 assert.equal(owner.cpu,true,'a new room faces the CPU');
 const guest=core.request('join',{code:owner.code}).body;
 assert.equal(guest.cpu,false,'the joining player replaces the CPU');assert.equal(guest.hasGuest,true);
 const a=connect(core,owner.token),b=connect(core,guest.token),last=c=>c.ws.messages.filter(m=>m.type==='state').at(-1);
 assert.equal(last(a).cpu,false);
 b.h.message(JSON.stringify({type:'leave'}));
 assert.equal(last(a).cpu,true,'P1 is back against the CPU after the guest leaves');assert.equal(last(a).hasGuest,false);
 const again=core.request('join',{code:owner.code}).body,c=connect(core,again.token);
 assert.equal(last(c).cpu,false);a.h.message(JSON.stringify({type:'kick'}));
 assert.equal(last(a).cpu,true,'kicking the guest restores the CPU');
 const tournament=core.request('create',{}).body;core.request('join',{code:tournament.code});
 assert.equal(core.request('join',{code:tournament.code}).body.error,'Room is full');
});
