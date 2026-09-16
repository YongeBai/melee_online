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
function splineFixture(type=2,mutate=()=>{}) {
  const body=new Uint8Array(384),d=new DataView(body.buffer),relocs=[16,72,80,84];
  d.setUint32(4,0x4000);d.setUint32(16,64);for(let i=0;i<3;i++)d.setFloat32(32+i*4,1);
  d.setUint8(64,type);d.setInt16(66,3);d.setFloat32(68,0.5);d.setUint32(72,96);d.setFloat32(76,10);d.setUint32(80,288);d.setUint32(84,304);
  const count=(type===1?7:type>=2?5:3)*3;
  for(let i=0;i<count;i++)d.setFloat32(96+i*4,i+0.25);
  for(let i=0;i<3;i++)d.setFloat32(288+i*4,i/2);
  for(let i=0;i<10;i++)d.setFloat32(304+i*4,i/8);
  mutate(d);
  const name=new TextEncoder().encode('Spline_Share_joint\0'),pub=32+body.length+relocs.length*4,bytes=new Uint8Array(pub+8+name.length),v=new DataView(bytes.buffer);
  [bytes.length,body.length,relocs.length,1,0].forEach((n,i)=>v.setUint32(i*4,n));bytes.set(body,32);relocs.forEach((p,i)=>v.setUint32(32+body.length+i*4,p));bytes.set(name,pub+8);
  return {bytes,module:{HEAPU8:new Uint8Array(2048),_malloc:()=>256,_free:()=>{}},count};
}
test('scene spline unions retain typed control points and arc-length coefficients for all original spline kinds',()=>{
  for(let type=0;type<4;type++) {
    const f=splineFixture(type),asset=loadSceneAsset(f.module,f.bytes),d=new DataView(f.module.HEAPU8.buffer);
    assert.equal(asset.model.meshes.length,0);assert.equal(d.getUint8(320),type);assert.equal(d.getInt16(322,true),3);
    assert.equal(d.getUint32(328,true),352);
    for(let i=0;i<f.count;i++)assert.equal(d.getFloat32(352+i*4,true),i+0.25);
    for(let i=0;i<3;i++)assert.equal(d.getFloat32(544+i*4,true),i/2);
    for(let i=0;i<10;i++)assert.equal(d.getFloat32(560+i*4,true),i/8);
  }
});
test('scene spline validation rejects invalid counts, types, coefficients and arrays before allocation',()=>{
  for(const mutate of [d=>d.setUint8(64,4),d=>d.setInt16(66,1),d=>d.setUint32(72,380),d=>d.setFloat32(96,NaN)]) {
    const f=splineFixture(2,mutate);f.module._malloc=()=>{throw Error('Must validate first');};
    assert.throws(()=>loadSceneAsset(f.module,f.bytes),/spline/i);
  }
});
