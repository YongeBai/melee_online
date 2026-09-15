import test from 'node:test';
import assert from 'node:assert/strict';
import {convertCharacterCollision} from '../../engines/browser-native/character-collision-assets.mjs';
function fixture() {
  const size=208,relocs=[0x2c,0x30,100,116],symbol=new TextEncoder().encode('ftDataMario\0');
  const bytes=new Uint8Array(32+size+relocs.length*4+8+symbol.length),d=new DataView(bytes.buffer),v=new DataView(bytes.buffer,32,size);
  [bytes.length,size,relocs.length,1,0].forEach((x,i)=>d.setUint32(i*4,x));
  v.setUint32(0x2c,104);v.setUint32(0x30,96);v.setUint32(96,1);v.setUint32(100,128);
  v.setUint32(112,1);v.setUint32(116,168);
  [4,2,1].forEach((x,i)=>v.setUint32(128+i*4,x));
  [-1,2,3,4,-5,6,7].forEach((x,i)=>v.setFloat32(140+i*4,x));
  v.setUint32(168,5);[-2,3,4,5].forEach((x,i)=>v.setFloat32(172+i*4,x));
  relocs.forEach((x,i)=>d.setUint32(32+size+i*4,x));bytes.set(symbol,32+size+relocs.length*4+8);
  return {bytes,v,d};
}
test('collision import keeps integer IDs and signed float offsets distinct',()=> {
  const {bytes}=fixture(),before=bytes.slice(),result=convertCharacterCollision(bytes,'PlMr.dat',8);
  assert.deepEqual(result.hurtboxes,[[4,2,1,-1,2,3,4,-5,6,7]]);
  assert.deepEqual(result.dynamicColliders,[[5,-2,3,4,5]]);
  const d=new DataView(result.image.buffer);
  assert.equal(d.getUint32(32+4,true),16);assert.equal(d.getFloat32(32+16+12,true),-1);
  assert.equal(d.getUint32(12,true),1);assert.deepEqual(bytes,before);
  assert.ok(new TextDecoder().decode(result.image).endsWith('native_character_collision\0'));
});
test('collision import validates counts, bones, enums, numeric fields and pointer slots',()=> {
  for(const mutate of [
    f=>f.v.setUint32(96,16),f=>f.v.setUint32(112,12),f=>f.v.setUint32(128,8),
    f=>f.v.setUint32(132,3),f=>f.v.setUint32(136,2),f=>f.v.setFloat32(140,NaN),
    f=>f.v.setUint32(100,204),f=>f.v.setUint32(116,204),
    f=>f.d.setUint32(32+208+8,140), // A scalar cannot be relocated.
    f=>f.v.setUint32(168,8),
  ]) {const f=fixture();mutate(f);assert.throws(()=>convertCharacterCollision(f.bytes,'PlMr.dat',8));}
});
