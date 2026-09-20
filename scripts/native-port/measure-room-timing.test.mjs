import test from 'node:test';import assert from 'node:assert/strict';
import {installRoomTiming} from './measure-room-timing.mjs';
test('timing observes transmitted inputs and does not attribute a frozen old sample to a new key',()=>{
 const names=['nativeProductRollback','nativeRoom','characterModule','document','addEventListener','roomTimingReport','roomInputTape'],saved=new Map(names.map(k=>[k,globalThis[k]]));let event,x=0,advance=true,gpuChecks=0,frozen=false;
 const gl={NO_ERROR:0,getError(){gpuChecks++;return 0;}},room={sendInput:()=>true};
 const product={driver:{seat:0,reconcile(){},advance(frame,samples){room.sendInput(frame,frozen?[0,0,0,0,0,0,0]:samples[0]);if(advance)x++;return advance;}},preview:{draw:()=>({})}};
 Object.assign(globalThis,{nativeRoom:room,nativeProductRollback:product,characterModule:{_Player_GetEntity:()=>1,_portFighterConstructRead:()=>x},document:{querySelector:()=>({getContext:()=>gl})},addEventListener:(_type,fn)=>event=fn});
 try{
  installRoomTiming({gpuCheckEveryFrame:true,measureInput:true});
  advance=false;frozen=true;product.driver.advance(3,[[0,0,0],[0,0,0]]);
  event({code:'KeyD',repeat:false,timeStamp:performance.now()});
  advance=true;product.driver.advance(3,[[0,1,0],[0,0,0]]);product.preview.draw();assert.equal(roomTimingReport().input.samples,0);
  frozen=false;product.driver.advance(4,[[0,1,0],[0,0,0]]);product.preview.draw();const r=roomTimingReport();
  assert.equal(r.input.samples,1);assert.equal(r.input.events[0].frame,4);assert.ok(r.input.events[0].submitMs>=r.input.events[0].sampleMs);assert.equal(r.input.eventToNativeInputSubmission.samples,1);assert.equal(r.stalledAdvances,1);assert.equal(gpuChecks,2);assert.equal(r.costs.frameIntervals.samples,1);
 }finally{for(const [k,v]of saved)if(v===undefined)delete globalThis[k];else globalThis[k]=v;}
});

test('probe replays exact seat inputs, records once, and leaves keyboard timing disabled',()=>{
 const names=['nativeProductRollback','nativeRoom','document','roomTimingReport','roomInputTape'],saved=new Map(names.map(k=>[k,globalThis[k]]));
 const tape=Array.from({length:5},(_,n)=>[0,n/10,0,0,0,0,0]),seen=[],room={sendInput:()=>true};
 const product={driver:{seat:1,reconcile(){},advance(frame,samples){seen.push(samples);room.sendInput(frame,samples[1]);return true;}},preview:{draw(){}}};
 Object.assign(globalThis,{nativeProductRollback:product,nativeRoom:room,document:{querySelector:()=>({getContext:()=>({NO_ERROR:0,getError:()=>0})})}});
 try{
  installRoomTiming({recordInputs:true,inputTape:tape});
  const other=[0,-1,0,0,0,0,0],pads=[other,other];product.driver.advance(3,pads);product.preview.draw();
  assert.strictEqual(seen[0][0],other);assert.deepEqual(seen[0][1],tape[3]);assert.strictEqual(pads[1],other);
  assert.throws(()=>roomInputTape(5),/missed frame 4/);
  room.sendInput(3,other);product.driver.advance(4,pads);product.preview.draw();
  assert.deepEqual(roomInputTape(5).slice(3),tape.slice(3));assert.equal(roomTimingReport().input.samples,0);
  assert.throws(()=>product.driver.advance(5,pads),/Missing recorded input/);
 }finally{for(const [k,v]of saved)if(v===undefined)delete globalThis[k];else globalThis[k]=v;}
});
