import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectTournamentStageGeometry} from './melee-scenery.js';

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
