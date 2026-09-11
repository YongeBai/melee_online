import test from 'node:test';
import assert from 'node:assert/strict';
import {BrowserRollbackTimeline,neutralBrowserPad} from './browser-rollback.js';
const pad=(frame,port=0)=>({...neutralBrowserPad(),stickX:128+((frame*17+port*11)%81)-40,mask:frame%7===0?(1<<port):0});
function machine() {
  const m={state:{frame:0,x:0,y:0,digest:0},saved:new Map(),silent:false,outputs:[],hook:null};
  m.adapter={
    async capture(slot){m.saved.set(slot,{...m.state});},
    async restore(slot){assert.ok(m.saved.has(slot));m.state={...m.saved.get(slot)};},
    async suppress(value){m.silent=value;},
    async advance(frame,pads,{replay}) {
      assert.equal(frame,m.state.frame);assert.equal(replay,m.silent);
      m.state.x+=pads[0].stickX-128;m.state.y+=pads[1].stickX-128;
      m.state.digest=(Math.imul(m.state.digest,31)+m.state.x*7+m.state.y*13+pads[0].mask*19+pads[1].mask*23)>>>0;
      m.state.frame++;
      if(!m.silent)m.outputs.push(frame);
      if(m.hook)await m.hook(frame,replay);
      return {...m.state};
    },
  };return m;
}
test('late and reordered inputs converge to the same state without replay output',async()=>{
  const expected=machine(),actual=machine();
  const clean=new BrowserRollbackTimeline(expected.adapter),delayed=new BrowserRollbackTimeline(actual.adapter);
  const arrivals=new Map();
  for(let f=0;f<180;f++) {
    clean.input(0,f,pad(f));clean.input(1,f,pad(f,1));await clean.advance();
    delayed.input(0,f,pad(f));
    const arrival=f+([5,1,4,2,3][f%5]);
    if(!arrivals.has(arrival))arrivals.set(arrival,[]);arrivals.get(arrival).push(f);
    for(const remote of arrivals.get(f)||[]) {delayed.input(1,remote,pad(remote,1));delayed.input(1,remote,pad(remote,1));}
    assert.equal((await delayed.advance()).advanced,true);
  }
  for(let f=175;f<180;f++)delayed.input(1,f,pad(f,1));
  // Flush corrections while local frame 180 is absent: no extra game frame.
  assert.equal((await delayed.advance()).advanced,false);
  assert.deepEqual(actual.state,expected.state);assert.deepEqual(actual.outputs,expected.outputs);
  assert.ok(delayed.stats.rollbacks>0);assert.ok(delayed.stats.maxDepth<=15);
  assert.ok(delayed.used.size<=16);assert.ok(delayed.events.every(m=>m.size<=18));
});
test('loss exhausts the prediction window and recovery resumes exact input',async()=>{
  const m=machine(),s=new BrowserRollbackTimeline(m.adapter);
  for(let f=0;f<12;f++){s.input(0,f,pad(f));assert.equal((await s.advance()).advanced,true);}
  s.input(0,12,pad(12));assert.equal((await s.advance()).advanced,false);assert.equal(s.frame,12);
  for(let f=0;f<=12;f++)s.input(1,f,pad(f,1));
  assert.equal((await s.advance()).advanced,true);assert.equal(s.frame,13);
});
test('input arriving during an async step is corrected on the next transaction',async()=>{
  const m=machine(),s=new BrowserRollbackTimeline(m.adapter);
  s.input(0,0,pad(0));m.hook=async(frame,replay)=>{if(!replay&&frame===0)s.input(1,0,pad(0,1));};
  await s.advance();s.input(0,1,pad(1));s.input(1,1,pad(1,1));await s.advance();
  const reference=machine(),clean=new BrowserRollbackTimeline(reference.adapter);
  for(let f=0;f<2;f++){clean.input(0,f,pad(f));clean.input(1,f,pad(f,1));await clean.advance();}
  assert.deepEqual(m.state,reference.state);assert.equal(s.stats.rollbacks,1);
});
test('immutable frames reject conflicting duplicates and invalid or unbounded inputs',()=>{
  const s=new BrowserRollbackTimeline(machine().adapter);
  s.input(0,0,pad(0));s.input(0,0,pad(0));
  assert.throws(()=>s.input(0,0,pad(1)),/Conflicting/);
  for(const frame of [-1,0.5,0x100000000,9])assert.throws(()=>s.input(1,frame,pad(0)));
  assert.throws(()=>s.input(1,0,{...pad(0),mask:0x100000}),/Invalid/);
  assert.throws(()=>s.input(1,0,{...pad(0),stickY:256}),/Invalid/);
});
test('a failed replay releases output suppression and prevents further mutation',async()=>{
  const m=machine(),s=new BrowserRollbackTimeline(m.adapter);
  s.input(0,0,pad(0));await s.advance();s.input(1,0,pad(0,1));
  m.adapter.restore=async()=>{throw Error('lost GPU checkpoint');};
  await assert.rejects(s.advance(),/lost GPU/);assert.equal(m.silent,false);
  await assert.rejects(s.advance(),/lost GPU/);assert.equal(s.frame,1);
});
test('concurrent advances are rejected without corrupting the active step',async()=>{
  const m=machine(),s=new BrowserRollbackTimeline(m.adapter);let release;
  m.hook=()=>new Promise(resolve=>{release=resolve;});s.input(0,0,pad(0));
  const first=s.advance();await Promise.resolve();await Promise.resolve();
  await assert.rejects(s.advance(),/Concurrent/);release();await first;
  assert.equal(s.frame,1);assert.equal(s.failed,null);
});

for(const checkpointPolicy of ['periodic','prediction']) {
  test(`${checkpointPolicy}: randomized late, lost and reordered inputs retain bounded exact history`,async()=>{
    for(const [window,checkpointInterval] of [[8,4],[12,4],[5,2],[20,5]]) {
      const expected=machine(),actual=machine();
      const options={window,checkpointInterval,checkpointPolicy};
      const clean=new BrowserRollbackTimeline(expected.adapter,options),delayed=new BrowserRollbackTimeline(actual.adapter,options);
      let seed=123456789;
      const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);
      const arrivals=new Map();
      for(let f=0;f<800;f++) {
        clean.input(0,f,pad(f));clean.input(1,f,pad(f,1));await clean.advance();
        delayed.input(0,f,pad(f));
        // Long confirmed spans are followed by irregular prediction starts.
        const delay=f%80<27?0:Math.floor(random()*(window+1));
        const at=f+delay;
        if(!arrivals.has(at))arrivals.set(at,[]);arrivals.get(at).push(f);
        for(const remote of (arrivals.get(f)||[]).reverse())delayed.input(1,remote,pad(remote,1));
        const result=await delayed.advance();
        assert.equal(result.advanced,true,`unexpected stall at ${f}`);
        assert.ok(delayed.checkpoints.size<=delayed.slots);
        assert.ok(delayed.used.size<=window+checkpointInterval);
        assert.ok(delayed.events.every(events=>events.size<=window+checkpointInterval+1));
      }
      for(const [at,frames] of arrivals)if(at>=800)
        for(const frame of frames)delayed.input(1,frame,pad(frame,1));
      assert.equal((await delayed.advance()).advanced,false);
      assert.deepEqual(actual.state,expected.state);
      assert.deepEqual(actual.outputs,expected.outputs);
    }
  });
}
test('prediction checkpoints skip confirmed spans and preserve an unaligned oldest correction',async()=>{
  const m=machine(),s=new BrowserRollbackTimeline(m.adapter,{checkpointPolicy:'prediction'});
  for(let f=0;f<103;f++) {s.input(0,f,pad(f));s.input(1,f,pad(f,1));await s.advance();}
  assert.equal(m.saved.size,0);
  for(let f=103;f<115;f++){s.input(0,f,pad(f));await s.advance();}
  assert.ok([...s.checkpoints.values()].includes(103));
  s.input(0,115,pad(115));assert.equal((await s.advance()).advanced,false);
  for(let f=103;f<=115;f++)s.input(1,f,pad(f,1));
  await s.advance();
  const expected=machine(),clean=new BrowserRollbackTimeline(expected.adapter);
  for(let f=0;f<=115;f++){clean.input(0,f,pad(f));clean.input(1,f,pad(f,1));await clean.advance();}
  assert.deepEqual(m.state,expected.state);
  for(let f=116;f<300;f++){s.input(0,f,pad(f));s.input(1,f,pad(f,1));await s.advance();}
  assert.equal(s.checkpoints.size,0);assert.ok(s.used.size<=12);
});
test('prediction checkpoint captures before an async network arrival changes its inputs',async()=>{
  const m=machine(),s=new BrowserRollbackTimeline(m.adapter,{checkpointPolicy:'prediction'});
  const capture=m.adapter.capture;
  m.adapter.capture=async slot=>{await capture(slot);s.input(1,0,pad(0,1));};
  s.input(0,0,pad(0));await s.advance();
  s.input(0,1,pad(1));s.input(1,1,pad(1,1));await s.advance();
  const expected=machine(),clean=new BrowserRollbackTimeline(expected.adapter);
  for(let f=0;f<2;f++){clean.input(0,f,pad(f));clean.input(1,f,pad(f,1));await clean.advance();}
  assert.deepEqual(m.state,expected.state);assert.equal(s.stats.rollbacks,1);
});
