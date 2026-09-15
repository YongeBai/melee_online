import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectTournamentStageGeometry,inspectStagePolygonKinds} from './melee-scenery.js';

test('legal-stage inventory counts native display objects without changing guest memory',()=>{
 const g=0x80600000,ground=0x80600100,j=0x80601000,d0=0x80602000,d1=0x80602020;
 const words=new Map([[0x804d782c,0x80500000],[0x80500014,g],
  [g+0x2c,ground],[ground+4,g],[ground+0x14,31],[g+0x28,j],[g+0x1c,0x801c5db0],
  [j+24,d0],[d0+4,d1],[d0+8,0x80700000],[d0+12,0x80700100],
  [d1+8,0x80700200],[d1+12,0x80700300],[d0+20,2],[d1+20,8]]);
 const bytes=new Map([[g+1,3],[ground+0x11,0]]);
 const read32=a=>words.get(a)||0,read8=a=>bytes.get(a)||0,readFloat=()=>0;
 const before=new Map(words),result=inspectTournamentStageGeometry(read32,read8,readFloat);
 assert.equal(result.diagnosticOnly,true);assert.equal(result.objects.length,1);
 assert.equal(result.objects[0].mapId,31);assert.equal(result.objects[0].category,0);
 assert.equal(result.objects[0].joints.length,1);assert.equal(result.objects[0].draws.length,2);
 assert.deepEqual(result.objects[0].joints[0].draws,[0,1]);assert.deepEqual(words,before);
 words.set(d1+4,d0);assert.throws(()=>inspectTournamentStageGeometry(read32,read8,readFloat),/Invalid tournament stage mesh chain/);
});

test('read-only polygon inventory distinguishes rigid and envelope work and rejects cycles',()=>{
 const p0=0x80700100,p1=0x80700200,list=0x80700400;
 const words=new Map([[p0+4,p1],[p0+8,0x80701000],[p0+12,1],[p0+16,0x80702000],
  [p1+8,0x80701100],[p1+12,(0x2000<<16)|2],[p1+16,0x80702100],[p1+20,list]]);
 const geometry={objects:[{mapId:31,category:0,draws:[{mesh:p0},{mesh:p1}]}]};
 const before=new Map(words),result=inspectStagePolygonKinds(geometry,a=>words.get(a)||0);
 assert.equal(result.cacheSafe,false);assert.equal(result.objects[0].polygonReferences,3);
 assert.equal(result.objects[0].uniquePolygons,2);
 assert.deepEqual(result.objects[0].kinds,{rigidOrShared:1,shapeAnimated:0,envelope:1});
 assert.equal(result.objects[0].uniqueEnvelopeLists,1);
 assert.equal(result.objects[0].displayListBytes,96);assert.deepEqual(words,before);
 words.set(p1+4,p0);
 assert.throws(()=>inspectStagePolygonKinds(geometry,a=>words.get(a)||0),/Invalid stage polygon chain/);
});

test('polygon inventory excludes JObj spline and particle unions without changing geometry',()=>{
 const geometry={objects:[{mapId:2,category:0,joints:[{flags:0x4008},{flags:0x20}],
  draws:[{joint:0,mesh:0x4418138d},{joint:1,mesh:0x12345678}]}]};
 const result=inspectStagePolygonKinds(geometry,()=>0);
 assert.equal(result.objects[0].nonPolygonUnionDraws,2);
 assert.equal(result.objects[0].uniquePolygons,0);
 assert.deepEqual(geometry.objects[0].draws.map(d=>d.mesh),[0x4418138d,0x12345678]);
});
