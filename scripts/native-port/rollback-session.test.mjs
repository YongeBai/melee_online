import test from 'node:test';import assert from 'node:assert/strict';
import {createRollbackSession} from '../../engines/browser-native/rollback-session.mjs';
const input=(f,p)=>({pad:[f%7===p?256:0,(f+p)%3/2-1,0,0,0,0,0],tap:(f+p)%2});
function fixture(seat){let state={seed:19,x:0,y:0};const alive=new Set(),store={capture(){const s=structuredClone(state);alive.add(s);return s;},restore(s){assert(alive.has(s));state=structuredClone(s);},release:s=>alive.delete(s),get retainedBytes(){return alive.size*12;}};
 const step=inputs=>{state.seed=(Math.imul(state.seed,1664525)+1013904223+inputs[0].pad[0])>>>0;state.x+=inputs[0].pad[1]+inputs[1].pad[1]*2;state.y=(state.y+state.seed+(inputs[1].pad[0]?3:1)+inputs[0].tap)>>>0;};
 return {store,step,get state(){return state;},alive,session:createRollbackSession({seat,store,step})};}
test('late reordered inputs converge to exact reference for both local seats without discarding local frames',()=>{
 for(const seat of [0,1]){const f=fixture(seat),reference=fixture(seat),pending=[];for(let frame=0;frame<80;frame++)reference.step([input(frame,0),input(frame,1)]);
  for(let tick=0;tick<120;tick++){
   for(let i=pending.length-1;i>=0;i--)if(pending[i].at<=tick){const p=pending.splice(i,1)[0];f.session.receive(p.frame,p.value);}
   if(f.session.frame<80){const frame=f.session.frame;if(f.session.advance(input(frame,seat)))pending.push({frame,value:input(frame,1-seat),at:tick+[1,5,2,8][frame%4]});}
   f.session.reconcile();if(f.session.frame===80&&f.session.confirmed===79)break;
  }
  assert.deepEqual(f.state,reference.state);const stats=f.session.snapshot();assert.equal(stats.forwardFrames,80);assert(stats.corrections>0&&stats.replayedFrames>0);assert(stats.maxReplay<=15);f.session.dispose();assert.equal(f.alive.size,0);reference.session.dispose();
 }
});
test('prediction stops at its bound, duplicate inputs are immutable, and unavailable history is rejected',()=>{
 const f=fixture(0);for(let i=0;i<12;i++)assert.equal(f.session.advance(input(i,0)),true);assert.equal(f.session.advance(input(12,0)),false);
 f.session.receive(0,input(0,1));f.session.receive(0,input(0,1));assert.throws(()=>f.session.receive(0,input(4,1)),/Conflicting/);f.session.reconcile();assert.equal(f.session.advance(input(12,0)),true);
 for(let i=1;i<13;i++)f.session.receive(i,input(i,1));f.session.reconcile();for(let i=13;i<30;i++){f.session.receive(i,input(i,1));f.session.advance(input(i,0));}
 assert.throws(()=>f.session.receive(0,input(0,1)),/too old/);assert.throws(()=>f.session.receive(100,input(1,1)),/outside/);assert.throws(()=>f.session.receive(30,{pad:[0,0,0],tap:2}),/Invalid/);f.session.dispose();assert.throws(()=>f.session.advance(input(30,0)),/closed/);
});

test('correction retains its unchanged starting checkpoint and reports replay/recapture timings separately',()=>{
 let state=0,replaying=false;const captures=[],events=[],store={capture(){captures.push(state);return {state};},restore:s=>{state=s.state;},release(){}};
 const session=createRollbackSession({seat:0,store,onReplay:v=>replaying=v,onTiming:e=>events.push(e),step:(pads,meta)=>{assert.equal(meta.replay,replaying);state++;}});
 for(let i=0;i<6;i++)session.advance(input(i,0));assert.deepEqual(captures,[0,4]);
 session.receive(0,input(0,1));session.reconcile();assert.deepEqual(captures,[0,4,4]);assert.equal(state,6);assert.equal(replaying,false);
 assert.equal(events.filter(e=>e.phase==='restore').length,1);assert.equal(events.filter(e=>e.phase==='lookup').length,1);assert.equal(events.filter(e=>e.phase==='replay').length,6);assert.equal(events.filter(e=>e.phase==='checkpoint'&&e.replay).length,1);assert.ok(events.every(e=>e.ms>=0));session.dispose();
});

test('authoritative acknowledgements gate commitment independently of remote delivery',()=>{
 let state=0;const alive=new Set(),store={capture(){const s={state};alive.add(s);return s;},restore:s=>state=s.state,release:s=>alive.delete(s),get retainedBytes(){return alive.size*4;}};
 const session=createRollbackSession({seat:0,store,requireAcknowledgement:true,step:()=>state++});
 for(let frame=0;frame<6;frame++){assert.equal(session.advance(input(frame,0)),true);session.receive(frame,input(frame,1));}
 assert.equal(session.snapshot().remoteKnown,5);assert.equal(session.confirmed,-1);
 session.acknowledge(0);session.acknowledge(0);assert.equal(session.confirmed,0);
 assert.throws(()=>session.acknowledge(2),/Non-contiguous/);
 for(let frame=1;frame<6;frame++)session.acknowledge(frame);
 assert.equal(session.confirmed,5);assert.equal(session.snapshot().acknowledged,5);
 assert.throws(()=>session.acknowledge(30),/outside/);session.dispose();assert.equal(alive.size,0);
});

test('acknowledgement replays a correction before exposing the confirmed state',()=>{
 let state=0;const alive=new Set(),confirmed=[],store={capture(){const s={state};alive.add(s);return s;},restore:s=>state=s.state,release:s=>alive.delete(s)};
 const session=createRollbackSession({seat:0,store,requireAcknowledgement:true,onConfirm:frame=>confirmed.push({frame,state}),step:inputs=>{state+=inputs[1].pad[0]?10:1;}});
 session.advance(input(0,0));assert.equal(state,1);session.receive(0,{...input(0,1),pad:[256,0,0,0,0,0,0]});assert.equal(state,1);
 session.acknowledge(0);assert.equal(state,10);assert.deepEqual(confirmed,[{frame:0,state:10}]);assert.equal(session.snapshot().corrections,1);session.dispose();assert.equal(alive.size,0);
});
