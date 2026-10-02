import test from 'node:test';
import assert from 'node:assert/strict';
import {parseNetcode,defaultNetcode,legacyNetcode,encodeInputPacket,decodeInputPacket,createDirectInputLink,menuBufferFor,canonicalPad} from '../../engines/browser-native/native-netcode.mjs';

test('netcode options parse to a canonical name; explicit values start from the legacy behaviour',()=>{
 assert.deepEqual(parseNetcode(null),{...defaultNetcode});assert.deepEqual(parseNetcode(''),{...defaultNetcode});
 assert.deepEqual(parseNetcode(defaultNetcode.name),{...defaultNetcode});
 assert.deepEqual(parseNetcode('room'),{...legacyNetcode});assert.equal(legacyNetcode.name,'room,d0,w7');
 assert.equal(parseNetcode('direct,d2').name,'direct,d2,w7');
 assert.equal(parseNetcode('w10,direct,d1,mpa').name,'direct,d1,w10,mpa');
 assert.equal(parseNetcode('mp5').menuBuffer,5);
 for(const bad of ['d7','w3','w16','mp2','mp13','fast'])assert.throws(()=>parseNetcode(bad),/Unknown netcode option/);
});

test('menu buffer covers half the round trip plus margin within 3-12 frames',()=>{
 assert.equal(menuBufferFor(undefined),3);assert.equal(menuBufferFor(10),3);
 assert.equal(menuBufferFor(100),5);assert.equal(menuBufferFor(2000),12);
});

test('analog values snap to GameCube steps, so sub-step jitter is one input',()=>{
 const rest=canonicalPad([0,0.004,-0.006,0.003,0,0.002,0]);assert.deepEqual(rest,[0,0,0,0,0,0,0]);assert(!Object.is(canonicalPad([0,-0.001,0,0,0,0,0])[1],-0));
 assert.deepEqual(canonicalPad([0,0.5012,0,0,0,0,0]),canonicalPad([0,0.4991,0,0,0,0,0]));
 assert.deepEqual(canonicalPad([0,1,-1,1,-1,1,1]),[0,1,-1,1,-1,1,1]);
});
test('input packets round-trip canonical (float32) analog values exactly',()=>{
 const frames=[{pad:canonicalPad([0x1f7f,0.123456789,-1,Math.SQRT1_2,-0.25,0.7,0]),tap:1},{pad:[0,0,0,0,0,0,0],tap:0}];
 // GameCube resolution: 57/80 for the stick, 98/140 for the shoulder.
 assert.equal(frames[0].pad[3],Math.fround(57/80));assert.equal(frames[0].pad[5],Math.fround(98/140));
 const packet=decodeInputPacket(encodeInputPacket({epoch:70000,sequence:3,seat:1,ack:41,first:40,frames,sentAt:12.5,echoSentAt:3.25,echoHoldMs:1.5,advantage:-1.25}));
 assert.equal(packet.advantage,-1.25);assert.equal(packet.epoch,70000&0xffff);assert.equal(packet.seat,1);assert.equal(packet.ack,41);assert.equal(packet.first,40);
 assert.deepEqual(packet.frames,frames);assert.equal(decodeInputPacket(new ArrayBuffer(10)),null);
});

// Two links joined by a channel that drops, duplicates and reorders packets.
function lossyPair({loss=.3,seed=7}={}){
 let x=seed;const random=()=>(x=(x*1103515245+12345)%2147483648)/2147483648;
 let clock=0,queue=[];const timers=new Set();
 const channel=to=>({open:true,onmessage:null,send(buffer){if(random()<loss)return;const copies=random()<.1?2:1;for(let i=0;i<copies;i++)queue.push({at:clock+1+Math.floor(random()*5),to,buffer:buffer.slice(0)});}});
 const channels=[channel(1),channel(0)],got=[[],[]],acks=[[],[]];
 const every=f=>{timers.add(f);return f;},cancel=f=>timers.delete(f);
 const links=[0,1].map(seat=>createDirectInputLink({channel:channels[seat],seat,onInput:(f,v)=>got[seat].push([f,v]),onAck:f=>acks[seat].push(f),now:()=>clock,setInterval:every,clearInterval:cancel,resendMs:2}));
 const tick=()=>{clock++;for(const f of timers)f();const due=queue.filter(p=>p.at<=clock);queue=queue.filter(p=>p.at>clock);due.sort(()=>random()-.5);for(const p of due)channels[p.to].onmessage?.(p.buffer);};
 return {links,got,acks,tick};
}

test('direct link delivers every remote frame once and acknowledges contiguously despite loss, duplication and reordering',()=>{
 const {links,got,acks,tick}=lossyPair();
 links.forEach(l=>l.begin(5,2));
 for(let frame=3;frame<200;frame++){links.forEach((l,seat)=>{l.setAdvantage(seat?-.5:.5);l.send(frame,{pad:canonicalPad([seat,frame/1000,0,0,0,0,0]),tap:1});});tick();}
 for(let i=0;i<400;i++)tick();
 for(const seat of [0,1]){
  const frames=got[seat].map(([f])=>f);
  assert.equal(new Set(frames).size,frames.length,'each frame delivered once');
  assert.deepEqual([...frames].sort((a,b)=>a-b),Array.from({length:197},(_,i)=>i+3));
  for(const [f,v] of got[seat])assert.deepEqual(v,{pad:canonicalPad([1-seat,f/1000,0,0,0,0,0]),tap:1});
  assert.equal(links[seat].peerAdvantage,seat?.5:-.5);
  assert.deepEqual(acks[seat],Array.from({length:197},(_,i)=>i+3),'acknowledged in order');
  assert.equal(links[seat].snapshot().unacknowledged,0);
 }
});

test('direct link ignores packets from another match or epoch',()=>{
 const {links,got,tick}=lossyPair({loss:0});
 links[0].begin(5,2);links[1].begin(5,3);
 links[0].send(3,{pad:[0,0,0,0,0,0,0],tap:1});for(let i=0;i<20;i++)tick();
 assert.equal(got[1].length,0);assert.ok(links[1].snapshot().stalePackets>0);
});
