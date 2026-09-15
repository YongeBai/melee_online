import test from 'node:test';
import assert from 'node:assert/strict';
import {loadSceneAsset} from '../../engines/browser-native/scene-assets.mjs';
function fixture() {
  const symbol=new TextEncoder().encode('PlyTest_Share_joint\0'),bytes=new Uint8Array(32+128+4+8+symbol.length),v=new DataView(bytes.buffer);
  [bytes.length,128,1,1,0].forEach((x,i)=>v.setUint32(i*4,x));
  v.setUint32(36,9);v.setFloat32(64,1);v.setFloat32(68,2);v.setFloat32(72,3);v.setFloat32(76,4.5);
  v.setUint32(88,64);for(let i=0;i<12;i++)v.setFloat32(96+i*4,i+0.25);
  bytes.set([0x12,0x34,0x56,0x78],144);v.setUint32(160,56);bytes.set(symbol,172);
  const heap=new Uint8Array(2048),freed=[];
  return {bytes,v,module:{HEAPU8:heap,_malloc:()=>256,_free:p=>freed.push(p)},freed};
}
test('converts native scene descriptors and pointers without swapping opaque payload bytes',()=>{
  const {bytes,module,freed}=fixture(),before=bytes.slice(),asset=loadSceneAsset(module,bytes);
  const view=new DataView(module.HEAPU8.buffer);
  assert.equal(asset.root,256);assert.equal(view.getUint32(260,true),9);
  assert.equal(view.getFloat32(300,true),4.5);assert.equal(view.getUint32(312,true),320);
  for(let i=0;i<12;i++)assert.equal(view.getFloat32(320+i*4,true),i+0.25);
  assert.deepEqual(module.HEAPU8.slice(368,372),Uint8Array.of(0x12,0x34,0x56,0x78));
  assert.deepEqual(bytes,before);asset.dispose();assert.deepEqual(freed,[256]);
});
test('rejects an out-of-bounds bind matrix before allocating a native scene',()=>{
  const f=fixture();f.v.setUint32(88,112);f.module._malloc=()=>{throw Error('Must validate first');};
  assert.throws(()=>loadSceneAsset(f.module,f.bytes),/skin binding bounds/);
});
