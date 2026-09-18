import test from 'node:test';import assert from 'node:assert/strict';
import {createRollbackAudio} from '../../engines/browser-native/rollback-audio.mjs';

test('rollback audio presents only corrected confirmed events and never duplicates them',()=>{
 const presented=[],audio=createRollbackAudio({present:event=>presented.push(event)});
 audio.beginFrame(0);audio.request({action:0,path:'opening',volume:100});audio.confirm(0);assert.deepEqual(presented.map(e=>e.path),['opening']);
 const checkpoint=audio.capture();audio.beginFrame(1);audio.request({action:1,path:null,volume:0});assert.equal(audio.snapshot().pending,1);assert.deepEqual(presented.map(e=>e.action),[0]);
 audio.restore(checkpoint);audio.beginFrame(1);audio.request({action:0,path:'corrected',volume:80});audio.confirm(1);audio.confirm(1);
 assert.deepEqual(presented.map(e=>[e.frame,e.sequence,e.action,e.path]),[[0,0,0,'opening'],[1,0,0,'corrected']]);assert.equal(audio.snapshot().presented,2);assert.equal(audio.snapshot().pending,0);
});

test('rollback audio snapshots deterministic state but not the external commitment ledger',()=>{
 const presented=[],audio=createRollbackAudio({present:event=>presented.push(event)}),empty=audio.capture();
 audio.beginFrame(4);audio.request({action:0,path:'track',volume:64});const active=audio.capture();assert.equal(audio.request({action:4}),true);audio.restore(empty);assert.equal(audio.request({action:4}),false);
 audio.restore(active);audio.confirm(4);audio.restore(active);audio.confirm(4);assert.equal(presented.length,1);assert.equal(audio.snapshot().journaled,1);assert.throws(()=>audio.beginFrame(-1),/frame/);assert.throws(()=>audio.confirm(3),/confirmation/);
});
