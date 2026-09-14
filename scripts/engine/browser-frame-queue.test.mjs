import test from'node:test';import assert from'node:assert/strict';import{BrowserFrameQueue}from'./browser-frame-queue.js';
test('presentation buffering is bounded and closes discarded/remaining images',()=>{
 let now=0,closed=[];const shown=[];const q=new BrowserFrameQueue(b=>shown.push(b.id),{now:()=>now,schedule:()=>1,cancel:()=>{}});const bitmap=id=>({id,close(){closed.push(id);}});
 q.push(bitmap(1));now=10;q.push(bitmap(2));now=12;q.push(bitmap(3));assert.equal(q.queue.length,2);assert.deepEqual(closed,[1]);now=16;q.tick(16);assert.deepEqual(shown,[2]);assert.equal(q.stats.ageTotalMs,6);assert.equal(q.stats.maxDepth,2);q.close();assert.deepEqual(closed,[1,3]);assert.equal(q.stats.dropped,1);
});
test('queue does not manufacture frames when production is slow',()=>{
 let shown=0;const q=new BrowserFrameQueue(()=>shown++,{schedule:()=>1,cancel:()=>{},now:()=>0});q.push({close(){}});q.tick(0);assert.equal(shown,0);q.push({close(){}});q.tick(17);q.tick(34);q.tick(51);assert.equal(shown,2);assert.equal(q.stats.underruns,1);q.close();
});

test('one late image resumes immediately after an underrun without rebuffering',()=>{
 const shown=[];const q=new BrowserFrameQueue(b=>shown.push(b.id),{period:16,schedule:()=>1,cancel:()=>{},now:()=>0});const bitmap=id=>({id,close(){}});q.push(bitmap(1));q.push(bitmap(2));q.tick(0);q.tick(16);q.tick(32);assert.equal(q.stats.underruns,1);q.push(bitmap(3));q.tick(48);assert.deepEqual(shown,[1,2,3]);assert.equal(q.queue.length,0);q.close();
});

test('RAF-only mode preserves real frames despite a secondary clock phase miss',()=>{
 const run=rateLimited=>{
  const shown=[],closed=[];let now=0;const q=new BrowserFrameQueue(b=>{shown.push(b.id);b.close();},{rateLimited,now:()=>now,schedule:()=>1,cancel:()=>{}});
  for(let n=0;n<1200;n++){
   now=n*1000/60-6;q.push({id:n,close(){closed.push(n);}});
   now=n*1000/60+(n%3===2?-1.4:0);q.tick(now);assert.ok(q.queue.length<=2);
  }
  now+=20;q.tick(now);now+=20;q.tick(now);
  const result={shown,closed,stats:{...q.stats}};q.close();return result;
 };
 const clocked=run(true),raf=run(false);
 assert.ok(clocked.stats.readyClockSkips>0&&clocked.stats.dropped>0);
 assert.equal(raf.stats.readyClockSkips,0);assert.equal(raf.stats.dropped,0);
 assert.deepEqual(raf.shown,Array.from({length:1200},(_,i)=>i));assert.equal(new Set(raf.closed).size,1200);
});
test('RAF-only mode at high refresh never manufactures or duplicates an image',()=>{
 const shown=[];const q=new BrowserFrameQueue(b=>shown.push(b.id),{rateLimited:false,schedule:()=>1,cancel:()=>{},now:()=>0});
 for(let i=0;i<100;i++){if(i%2===0)q.push({id:i/2,close(){}});q.tick(i*8.333);}
 assert.deepEqual(shown,Array.from({length:50},(_,i)=>i));assert.equal(q.capacity,2);assert.equal(q.stats.dropped,0);
 q.setRateLimited(true);assert.equal(q.primed,false);assert.equal(q.deadline,0);assert.throws(()=>q.setRateLimited(0),/boolean/);q.close();
});

test('capacity-one mode is a low-latency latest-frame latch',()=>{
 let now=0;const shown=[],closed=[];
 const q=new BrowserFrameQueue(b=>{shown.push(b.id);b.close();},{capacity:1,rateLimited:false,schedule:()=>1,cancel:()=>{},now:()=>now});
 q.push({id:1,close(){closed.push(1);}});q.push({id:2,close(){closed.push(2);}});
 assert.deepEqual(closed,[1]);
 now=8;q.tick(now);assert.deepEqual(shown,[2]);assert.equal(q.stats.ageTotalMs,8);
 now=16;q.tick(now);assert.equal(q.stats.underruns,1);
 q.push({id:3,close(){closed.push(3);}});now=17;q.tick(now);
 assert.deepEqual(shown,[2,3]);assert.deepEqual(closed,[1,2,3]);q.close();
});

test('capacity change preserves ordered images, closes only evictions, and validates bounds',()=>{
 const shown=[],closed=[];const q=new BrowserFrameQueue(b=>{shown.push(b.id);b.close();},{capacity:3,rateLimited:false,schedule:()=>1,cancel:()=>{},now:()=>0});
 for(let id=1;id<=3;id++)q.push({id,close(){closed.push(id);}});
 q.setCapacity(2);assert.deepEqual(closed,[1]);assert.equal(q.stats.dropped,1);
 q.tick(0);q.tick(1);q.tick(2);assert.deepEqual(shown,[2,3]);assert.deepEqual(closed,[1,2,3]);
 for(const value of[0,5,2.5,NaN,'3']){assert.throws(()=>q.setCapacity(value),/integer/);assert.throws(()=>new BrowserFrameQueue(()=>{},{capacity:value}),/integer/);}
 q.setCapacity(3);q.close();q.push({close(){closed.push(4);}});assert.deepEqual(closed,[1,2,3,4]);
});
test('queue delay distribution isolates interval and reports overflow without hiding it',async()=>{
 const {summarizeQueueInterval}=await import('./browser-frame-queue.js');let now=0;
 const q=new BrowserFrameQueue(b=>b.close(),{rateLimited:false,schedule:()=>1,cancel:()=>{},now:()=>now});
 const snap=()=>({...q.stats,ageHistogram:[...q.stats.ageHistogram]});
 q.push({close(){}});q.push({close(){}});now=9;q.tick(now);const before=snap();
 now=20;q.tick(now);q.push({close(){}});now=40.5;q.tick(now);q.push({close(){}});now=400;q.tick(now);
 const result=summarizeQueueInterval(before,snap());assert.equal(result.presented,3);assert.equal(result.p50AgeUpperMs,21);assert.equal(result.p95AgeUpperMs,null);assert.equal(result.ageOverflow256Ms,1);assert.equal(result.meanAgeMs,400/3);
 assert.equal(summarizeQueueInterval(snap(),snap()).p95AgeUpperMs,null);assert.throws(()=>summarizeQueueInterval(snap(),before),/reset/);q.close();
});
