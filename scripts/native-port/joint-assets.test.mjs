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
