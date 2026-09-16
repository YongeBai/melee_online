import test from 'node:test';
import assert from 'node:assert/strict';
import {convertMaterialAnimation} from '../../engines/browser-native/material-animation-assets.mjs';
function fixture() {
  const size=288,relocs=[8,20,36,40,44,60,84,88,92,96,104,128,152],text=new TextEncoder().encode('Test_Share_matanim_joint\0');
  const bytes=new Uint8Array(32+size+relocs.length*4+8+text.length),v=new DataView(bytes.buffer),d=new DataView(bytes.buffer,32,size);
  [bytes.length,size,relocs.length,1,0].forEach((n,i)=>v.setUint32(i*4,n));
  for(const [at,value] of [[8,12],[20,28],[36,52],[40,88],[44,96],[60,68],[72,10],[84,256],[88,104],[92,128],[96,152],[104,176],[128,208],[152,240]])d.setUint32(at,value);
  d.setUint16(48,2);d.setUint16(50,1);d.setFloat32(56,1);bytes[32+80]=1;
  for(const at of [104,128]){d.setUint16(at+4,1);d.setUint16(at+6,1);}
  d.setUint16(164,1);bytes.fill(0xab,32+176,32+240);bytes.set([0x12,0x34],32+240);
  bytes[32+256]=0x12;d.setFloat32(257,0,true);bytes[32+261]=1;d.setFloat32(262,1,true);
  relocs.forEach((at,i)=>v.setUint32(32+size+i*4,at));bytes.set(text,32+size+relocs.length*4+8);
  return {bytes,d};
}
test('material animation converts descriptors while retaining GX pixels and LE track bytes',()=>{
  const f=fixture(),before=f.bytes.slice(),a=convertMaterialAnimation(f.bytes),v=new DataView(a.image.buffer);
  assert.equal(a.nodes.length,1);assert.equal(a.images.size,2);assert.equal(a.palettes.size,1);
  assert.equal(v.getUint16(32+48,true),2);assert.equal(v.getUint32(32+72,true),10);
  assert.deepEqual(a.image.subarray(32+176,32+266),f.bytes.subarray(32+176,32+266));assert.deepEqual(f.bytes,before);
  assert.equal(a.nodes[0].materials[0].textures[0].animation.tracks[0].objType,1);
});
test('material animation rejects cyclic graphs, oversized tables and overlapping payloads',()=>{
  for(const mutate of [f=>f.d.setUint32(0,4),f=>f.d.setUint16(48,4097),f=>f.d.setUint32(84,72),f=>f.d.setUint32(112,255),f=>f.d.setUint16(108,0),f=>f.d.setUint32(56,0x7fc00000)]) {
    const f=fixture();mutate(f);assert.throws(()=>convertMaterialAnimation(f.bytes));
  }
});
