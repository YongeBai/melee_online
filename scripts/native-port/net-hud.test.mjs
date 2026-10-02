import test from 'node:test';
import assert from 'node:assert/strict';
import {createRateWindow,storedInputDelay,formatMatchLines} from '../../engines/browser-native/native-net-hud.mjs';
import {encodeInputPacket,decodeInputPacket,createDirectInputLink} from '../../engines/browser-native/native-netcode.mjs';

test('stored input delay accepts only whole frames 0-4',()=>{
 assert.equal(storedInputDelay('1'),1);assert.equal(storedInputDelay('0'),0);assert.equal(storedInputDelay('4'),4);
 for(const v of [null,'','5','-1','1.5','x'])assert.equal(storedInputDelay(v),null);
});

test('rate window reports per-second rates over recent samples',()=>{
 const w=createRateWindow(3);w.add(0,{n:0});w.add(1000,{n:5});w.add(2000,{n:20});
 assert.equal(w.rate('n'),10);assert.equal(w.delta('n'),20);
 w.add(5000,{n:26});assert.equal(w.delta('n'),6);// samples older than 3 s drop out
 w.reset();assert.equal(w.rate('n'),null);
});

test('match lines show ping, both delays, rollback and freeze rates',()=>{
 const w=createRateWindow();w.add(0,{corrections:0,replayed:0,frozen:0});w.add(2000,{corrections:4,replayed:10,frozen:2});
 const lines=formatMatchLines({ping:{p50:18,p95:31},delay:1,peerDelay:2,rollback:{session:{maxReplay:5},stalls:{window:1,transport:1,phase:0},advantage:.25},live:{frames:600,elapsedMs:10000,cadence:{syncDroppedFrames:2,syncExtraFrames:0},drawSubmissionCpu:{p95Ms:4},stepCpu:{p95Ms:2}},window:w,path:'host↔srflx'});
 assert.match(lines[0],/ping 18 ms · p95 31 ms · host↔srflx/);assert.match(lines[1],/1f you · 2f opponent/);
 assert.match(lines[2],/rollbacks 2\.0\/s · avg 2\.5f · max 5f/);assert.match(lines[3],/frozen 1\.0 frames\/s \(2 total\)/);assert.match(lines[4],/ahead of opponent 0\.3f · sync −2 \+0/);assert.match(lines[5],/sim 60\.0 fps/);
});

test('input packets carry the sender input delay, and the link reports the peer one',()=>{
 const p=decodeInputPacket(encodeInputPacket({epoch:1,sequence:0,seat:0,ack:2,first:3,frames:[],sentAt:1,echoSentAt:0,echoHoldMs:0,delay:3}));assert.equal(p.delay,3);
 const sent=[],channel={open:true,bufferedAmount:0,send:b=>sent.push(b),onmessage:null};
 const a=createDirectInputLink({channel,seat:0,onInput(){},onAck(){},delay:()=>1,setInterval:()=>0,clearInterval(){}});a.begin(4,0);a.send(3,{pad:[0,0,0,0,0,0,0],tap:1});
 assert.equal(decodeInputPacket(sent[0]).delay,1);
 const other={open:true,bufferedAmount:0,send(){},onmessage:null},b=createDirectInputLink({channel:other,seat:1,onInput(){},onAck(){},setInterval:()=>0,clearInterval(){}});b.begin(4,0);
 assert.equal(b.peerDelay,null);other.onmessage(sent[0]);assert.equal(b.peerDelay,1);
});

test('round-trip samples are a rolling window, not the first minute',()=>{
 let t=0;const channel={open:true,bufferedAmount:0,send(){},onmessage:null},link=createDirectInputLink({channel,seat:1,onInput(){},onAck(){},now:()=>t,setInterval:()=>0,clearInterval(){}});link.begin(1,0);
 const packet=rtt=>encodeInputPacket({epoch:1,sequence:0,seat:0,ack:2,first:3,frames:[],sentAt:0,echoSentAt:t-rtt,echoHoldMs:0});
 for(let i=0;i<5000;i++){t+=16;channel.onmessage(packet(i<4500?10:80));}
 assert.equal(link.snapshot().rttP50Ms,80);
});
