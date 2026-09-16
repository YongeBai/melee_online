import test from 'node:test';
import assert from 'node:assert/strict';
import {readJointTree} from '../../engines/browser-native/joint-assets.mjs';

function fixture() {
  const symbol=new TextEncoder().encode('PlyTest_Share_joint\0');
  const bytes=new Uint8Array(32+192+8+8+symbol.length),v=new DataView(bytes.buffer);
  [bytes.length,192,2,1,0].forEach((x,i)=>v.setUint32(i*4,x));
  for(const at of [0,64,128]) {
    v.setUint32(32+at+4,at===64?8:9);
    [0.25,0.5,0.75,1,2,3,4,5,6].forEach((x,i)=>v.setFloat32(32+at+20+i*4,x));
  }
  v.setUint32(40,64);v.setUint32(108,128);
  v.setUint32(224,8);v.setUint32(228,76);bytes.set(symbol,240);
  return {bytes,v};
}
test('preserves complete preorder including non-skeleton animation slots',()=>{
  const {bytes}=fixture(),before=bytes.slice(),tree=readJointTree(bytes);
  assert.deepEqual(bytes,before);assert.equal(tree.nodes.length,3);
  assert.deepEqual(tree.nodes.map(n=>n.parent),[-1,0,0]);
  assert.deepEqual(tree.skeleton,[0,2]);
  assert.deepEqual(tree.nodes[1].translation,[4,5,6]);
});
test('rejects joint cycles, shared children, truncated nodes and nonfinite transforms',()=>{
  for(const mutate of [
    ({v})=>v.setUint32(40,0),
    ({v})=>v.setUint32(108,64),
    ({v})=>v.setUint32(108,188),
    ({v})=>v.setFloat32(52,NaN),
  ]){const f=fixture();mutate(f);assert.throws(()=>readJointTree(f.bytes));}
});
test('requires pointer relocation metadata',()=>{
  const f=fixture();f.v.setUint32(224,16);
  assert.throws(()=>readJointTree(f.bytes),/Unrelocated/);
});

function instanceFixture(target=64){
  const body=new Uint8Array(256),d=new DataView(body.buffer),relocs=[8,76,136];
  d.setUint32(8,64);d.setUint32(76,128);d.setUint32(132,0x1000);d.setUint32(136,target);
  for(const at of [0,64,128,192])for(let i=0;i<3;i++)d.setFloat32(at+32+i*4,1);
  const name=new TextEncoder().encode('Instance_Share_joint\0'),pub=32+body.length+relocs.length*4,bytes=new Uint8Array(pub+8+name.length),v=new DataView(bytes.buffer);
  [bytes.length,body.length,relocs.length,1,0].forEach((n,i)=>v.setUint32(i*4,n));bytes.set(body,32);relocs.forEach((p,i)=>v.setUint32(32+body.length+i*4,p));bytes.set(name,pub+8);
  return bytes;
}
test('joint instances retain reference identity without duplicating ownership or animation slots',()=>{
  const input=instanceFixture(),before=input.slice(),tree=readJointTree(input);
  assert.equal(tree.nodes.length,3);assert.deepEqual(tree.nodes.map(n=>n.parent),[-1,0,0]);
  assert.equal(tree.nodes[2].child,-1);assert.equal(tree.nodes[2].instanceTarget,1);
  assert.deepEqual(input,before);
});
test('joint instances reject external targets and recursive display graphs',()=>{
  assert.throws(()=>readJointTree(instanceFixture(192)),/owning tree/);
  for(const target of [0,128])assert.throws(()=>readJointTree(instanceFixture(target)),/Cyclic joint instance/);
});
test('scene conversion relocates instance references to the same owned descriptor',async()=>{
  const {loadSceneAsset}=await import('../../engines/browser-native/scene-assets.mjs');
  const module={HEAPU8:new Uint8Array(2048),_malloc:()=>256,_free:()=>{}},asset=loadSceneAsset(module,instanceFixture());
  assert.equal(asset.model.tree.nodes.length,3);
  assert.equal(new DataView(module.HEAPU8.buffer).getUint32(256+136,true),256+64);
});
