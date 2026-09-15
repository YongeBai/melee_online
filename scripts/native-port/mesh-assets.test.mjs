import test from 'node:test';
import assert from 'node:assert/strict';
import {readModelMeshes} from '../../engines/browser-native/mesh-assets.mjs';
function fixture() {
  const symbol=new TextEncoder().encode('PlyTest_Share_joint\0'),relocations=[16,76,88,96,124];
  const bytes=new Uint8Array(32+224+relocations.length*4+8+symbol.length),v=new DataView(bytes.buffer);
  [bytes.length,224,relocations.length,1,0].forEach((x,i)=>v.setUint32(i*4,x));
  for(const [at,value] of [[4,9],[16,64],[76,80],[88,104],[96,192],[104,9],[108,2],[112,1],[116,3],[124,152],[128,255]])
    v.setUint32(32+at,value);
  for(const at of [32,36,40])v.setFloat32(32+at,1);
  v.setUint16(32+94,1);v.setUint8(32+120,1);v.setUint16(32+122,6);
  [0,0,0,2,0,0,0,2,0].forEach((x,i)=>v.setInt16(32+152+i*2,x));
  bytes.set([0x90,0,3,0,1,2],32+192);
  relocations.forEach((x,i)=>v.setUint32(256+i*4,x));bytes.set(symbol,284);
  return {bytes,v};
}
test('decodes indexed big-endian fixed-point positions without changing source data',()=>{
  const {bytes}=fixture(),before=bytes.slice(),model=readModelMeshes(bytes);
  assert.deepEqual(bytes,before);assert.equal(model.meshes.length,1);
  assert.deepEqual(model.meshes[0].vertices.map(v=>v[9]),[[0,0,0],[1,0,0],[0,1,0]]);
  assert.deepEqual(model.meshes[0].triangles,[0,1,2]);
});
test('preserves alternating triangle-strip winding',()=>{
  const {bytes,v}=fixture();v.setUint8(224,0x98);v.setUint16(225,4);v.setUint8(230,0);
  assert.deepEqual(readModelMeshes(bytes).meshes[0].triangles,[0,1,2,2,1,3]);
});
test('rejects invalid indices, commands, primitive lengths and unimplemented normal modes',()=>{
  for(const mutate of [
    ({v})=>v.setUint8(227,255),({v})=>v.setUint8(224,0x20),
    ({v})=>v.setUint16(225,2),({v})=>v.setUint32(136,25),
    ({v})=>v.setUint32(128,222),
  ]) {const f=fixture();mutate(f);assert.throws(()=>readModelMeshes(f.bytes));}
});
