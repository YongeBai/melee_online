import test from 'node:test';
import assert from 'node:assert/strict';
import {WorkerCanvasImageProbe} from './browser-worker-image-probe.js';
const flush=()=>new Promise(setImmediate);
async function fixture(options={}) {
 const sent=[],worker={postMessage:(m,transfer)=>sent.push({m,transfer}),terminate(){this.terminated=true;}};
 const probe=new WorkerCanvasImageProbe({createWorker:()=>worker,...options});
 worker.onmessage({data:{ready:true}});await probe.ready;
 return {probe,worker,sent,reply:data=>worker.onmessage({data})};
}
test('worker snapshots synchronously, retains capture order across reordered replies and never discards overflow',async()=>{
 const source={value:10},snapshots=[],resolve=[];
 const {probe,sent,reply}=await fixture({capacity:2,snapshot:s=>{snapshots.push(s.value);return new Promise(r=>resolve.push(r));}});
 try{
  probe.capture(source,{at:100});source.value=20;probe.capture(source,{at:200});source.value=30;
  assert.deepEqual(snapshots,[10,20]);assert.throws(()=>probe.capture(source),/overflow/);
  assert.throws(()=>probe.reset(),/outstanding/);
  const a={close:assert.fail},b={close:assert.fail};resolve[1](b);await flush();resolve[0](a);await flush();
  assert.deepEqual(sent.slice(1).map(x=>x.m.id),[2,1]);assert.equal(sent[1].transfer[0],b);
  reply({id:2,hash:20,nonblack:true});assert.deepEqual(probe.poll(),[]);
  reply({id:1,hash:10,nonblack:true});const samples=probe.poll();
  assert.deepEqual(samples.map(s=>[s.at,s.hash]),[[100,10],[200,20]]);
  assert.equal(probe.captureCount,2);assert.equal(probe.maxPending,2);probe.reset();assert.equal(probe.captureCount,0);
 }finally{probe.dispose();}
});
test('disposal closes late snapshots instead of sending to a terminated worker',async()=>{
 let resolve,closed=0;const {probe,worker,sent}=await fixture({snapshot:()=>new Promise(r=>resolve=r)});
 probe.capture({});probe.dispose();resolve({close:()=>closed++});await flush();
 assert.equal(closed,1);assert.equal(sent.length,1);assert.equal(worker.terminated,true);
});
test('worker failure, duplicate samples, and snapshot rejection propagate instead of passing missing images',async()=>{
 const a=await fixture({snapshot:()=>Promise.reject(Error('snapshot failed'))});
 a.probe.capture({});await flush();assert.throws(()=>a.probe.poll(),/snapshot failed/);a.probe.dispose();
 const b=await fixture({snapshot:()=>Promise.resolve({close(){}})});
 b.probe.capture({});await flush();b.reply({id:1,hash:1,nonblack:true});b.reply({id:1,hash:1,nonblack:true});
 assert.throws(()=>b.probe.poll(),/duplicate/);b.probe.dispose();
 const c=await fixture();c.reply({error:'GPU lost'});assert.throws(()=>c.probe.poll(),/GPU lost/);c.probe.dispose();
});
