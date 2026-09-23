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
