import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeDrawProfile} from './summarize-draw-profile.mjs';

test('draw profile excludes final oracle work and reports unattributed GC separately',()=>{
 const node=(id,functionName,url,children=[])=>({id,callFrame:{functionName,url,lineNumber:0},children});
 const profile={nodes:[node(1,'(root)','',[2,5,6]),node(2,'drawFrame','http://x/certification.mjs',[3]),node(3,'apply','http://x/material-gpu.mjs',[4]),node(4,'image','http://x/material-gpu.mjs'),node(5,'(garbage collector)',''),node(6,'draw','http://x/native-match-preview.mjs')],samples:[4,3,5,6],timeDeltas:[1000,2000,3000,4000]};
 const r=summarizeDrawProfile(profile);
 assert.equal(r.sampledDrawMs,3);assert.equal(r.stages.uniformsAndTextures,3);assert.equal(r.drawSamples,2);
 assert.equal(r.outsideDraw.garbageCollectorMs,3);assert.equal(r.outsideDraw.otherMs,4);assert.equal(r.totalProfileMs,10);
 assert.equal(r.inclusive.find(x=>x.functionLocation.endsWith(' apply')).cpuMs,3);
 assert.equal(r.self.find(x=>x.functionLocation.endsWith(' apply')).cpuMs,2);
});
