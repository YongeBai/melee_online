import test from 'node:test';
import assert from 'node:assert/strict';
import {readJointAnimation} from '../../engines/browser-native/joint-animation-assets.mjs';

function fixture() {
  const bytes=new Uint8Array(160),data=new DataView(bytes.buffer,32),relocations=new Set([0,8,48,72]);
  // Root, child, AObj and one FObj. The value stream is little-endian.
  data.setUint32(0,20);data.setUint32(8,40);data.setUint32(16,1);
  data.setUint32(40,0x20000000);data.setFloat32(44,50);data.setUint32(48,56);
  data.setUint32(60,6);data.setFloat32(64,-2);data.setUint8(68,5);data.setUint32(72,80);
  bytes[112]=1;data.setFloat32(81,1.25,true);bytes[117]=3;
  return {bytes,data,relocations};
}
test('joint animation imports typed descriptors while retaining LE track bytes',()=> {
  const archive=fixture(),before=archive.bytes.slice(),result=readJointAnimation(archive,0);
  assert.deepEqual(result.nodes.map(n=>n.parent),[-1,0]);
  assert.equal(result.nodes[0].animation.flags,0x20000000);
  assert.equal(result.nodes[0].animation.end,50);
  assert.deepEqual(result.nodes[0].animation.tracks[0],{
    bone:0,start:-2,objType:5,fracValue:0,fracSlope:0,bytes:Uint8Array.of(1,0,0,160,63,3)
  });
  assert.deepEqual(archive.bytes,before);
});
test('joint animation rejects cyclic, unowned and malformed descriptors',()=> {
  for(const mutate of [
    a=>{a.data.setUint32(20,0);a.relocations.add(20);},
    a=>{a.data.setUint32(56,56);a.relocations.add(56);},
    a=>a.relocations.delete(8),
    a=>{a.data.setUint32(12,20);a.relocations.add(12);},
    a=>{a.data.setUint32(52,20);a.relocations.add(52);},
    a=>a.data.setFloat32(44,NaN),
    a=>a.data.setFloat32(64,32768),
    a=>a.data.setUint32(60,100),
    a=>{a.bytes[112]=15;},
  ]) {
    const archive=fixture();mutate(archive);assert.throws(()=>readJointAnimation(archive,0));
  }
});
