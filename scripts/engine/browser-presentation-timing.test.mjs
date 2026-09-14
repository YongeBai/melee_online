import test from 'node:test';import assert from 'node:assert/strict';
import {BrowserPresentationTiming,timingDistribution} from './browser-presentation-timing.js';
test('timestamps separate transport, canvas work, and cadence losses',()=>{
 const t=new BrowserPresentationTiming();t.begin();
 for(let i=0;i<3;i++){const bitmap={};t.receive(bitmap,{sequence:i,exportStartAt:100+i*16,exportEndAt:102+i*16,forwardedAt:103+i*16},105+i*16);t.present(bitmap,106+i*16,107+i*16);}
 t.sample(90,0,123,1,2);t.sample(110,1,124,1,2);t.sample(140,3,124,1,2);t.sample(155,3,124,1,2);
 const r=t.finish();assert.equal(r.exportDurationMs.mean,2);assert.equal(r.gpuWorkerToForwarderMs.mean,1);assert.equal(r.forwarderToMainMs.mean,2);assert.equal(r.exportToPresentMs.mean,5);assert.equal(r.canvasTransferMs.mean,1);assert.equal(r.canvasIntervalMs.mean,16);assert.equal(r.extraSubmissionsWithinInterval,1);assert.equal(r.multiSubmissionIntervals,1);assert.equal(r.noSubmissionIntervals,1);assert.equal(r.unchangedImagesWithSubmissions,1);assert.equal(r.bitmapSequenceGaps,0);assert.equal(r.diagnosticOnly,true);assert.equal(t.active,false);
});
test('resets retain no prior frames and missing timestamps are not fabricated',()=>{
 const t=new BrowserPresentationTiming();t.begin();t.present({},0,1);const r=t.finish();assert.equal(r.frames,1);assert.equal(r.timedFrames,0);assert.equal(r.exportToPresentMs,null);t.begin();assert.equal(t.finish().frames,0);assert.equal(timingDistribution([]),null);
});
test('receipt timing includes dropped images and separates export gaps from relay bursts',()=>{
 const t=new BrowserPresentationTiming();t.begin();
 const a={},b={},c={};
 t.receive(a,{sequence:1,exportStartAt:99,exportEndAt:100,forwardedAt:101},150);
 t.receive(b,{sequence:2,exportStartAt:115,exportEndAt:116,forwardedAt:117},151);
 t.receive(c,{sequence:3,exportStartAt:131,exportEndAt:132,forwardedAt:133},152);
 // The first image is discarded by a capacity-two presentation queue.
 t.present(b,153,154);t.present(c,169,170);
 const r=t.finish();assert.equal(r.timedFrames,2);assert.equal(r.receiptTiming.count,3);
 assert.equal(r.receiptTiming.closeArrivalPairs,2);assert.equal(r.receiptTiming.exportIntervalMs.mean,16);
 assert.equal(r.receiptTiming.receivedIntervalMs.mean,1);
 assert.equal(r.receiptTiming.slowestTransport[0].sequence,1);
 assert.equal(r.receiptTiming.slowestTransport[0].gpuToForwarderMs,1);
 assert.equal(r.receiptTiming.slowestTransport[0].forwarderToMainMs,49);
 t.begin();assert.equal(t.finish().receiptTiming.count,0);
});
