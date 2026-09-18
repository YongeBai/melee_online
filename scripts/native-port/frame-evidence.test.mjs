import test from 'node:test';import assert from 'node:assert/strict';
import {cadence,distribution,capturedEvidence} from '../../engines/browser-native/frame-evidence.mjs';
test('frame cadence counts missed refresh slots separately from actual frames',()=>{
 const good=cadence(Array.from({length:601},(_,i)=>i*1000/60));assert.equal(good.samples,600);assert.equal(good.fps,60);assert.equal(good.estimatedMissed60HzSlots,0);
 const missed=cadence([0,1000/60,50,100]);assert.equal(missed.gapsOver25Ms,2);assert.equal(missed.estimatedMissed60HzSlots,3);assert.equal(missed.fps,30);
 assert.deepEqual(cadence([]),{samples:0,meanMs:0,p95Ms:0,maxMs:0,fps:0,gapsOver25Ms:0,estimatedMissed60HzSlots:0});
});
test('tail statistics cannot be replaced by mean FPS',()=>{const d=distribution([...Array(94).fill(1),...Array(5).fill(20),100]);assert.equal(d.p95Ms,20);assert.equal(d.maxMs,100);});
test('capture accounting cannot credit the automatic stream bootstrap frame',()=>{
 const rows=Array.from({length:61},(_,i)=>({timestampMs:i*1000/60,width:960,height:720,hash:i,nonblackPixels:10}));const r=capturedEvidence(rows,60);
 assert.equal(r.rawCaptured,61);assert.equal(r.captured,60);assert.equal(r.bootstrapDiscarded,1);assert.equal(r.estimatedUnobservedRequests,0);assert.equal(r.distinctSampledImages,60);
 rows[3].hash=rows[2].hash;assert.equal(capturedEvidence(rows,60).repeatedSampledImages,1);assert.equal(capturedEvidence(rows.slice(2),60).estimatedUnobservedRequests,2);
 const warmed=capturedEvidence(rows.slice(0,60),60,{discardBootstrap:false});assert.equal(warmed.captured,60);assert.equal(warmed.bootstrapDiscarded,0);assert.equal(warmed.estimatedUnobservedRequests,0);
});
