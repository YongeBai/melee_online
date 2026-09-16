import test from 'node:test';
import assert from 'node:assert/strict';
import {convertPlayerParameters} from '../../engines/browser-native/player-parameters.mjs';

function fixture() {
  const bodySize=0x188,text=new TextEncoder().encode('plLoadCommonData\0');
  const bytes=Buffer.alloc(32+bodySize+12+text.length),v=new DataView(bytes.buffer,bytes.byteOffset,bytes.length);
  [bytes.length,bodySize,1,1,0].forEach((n,i)=>v.setUint32(i*4,n));
  for(let at=0;at<0x184;at+=4)v.setUint32(32+at,0x12345678);
  v.setFloat32(32,-13.25);v.setInt32(36,-7);bytes.set([0xFE,0xDC,0xBA,0x98],32+0xC0);
  v.setUint32(32+0x184,0);v.setUint32(32+bodySize,0x184);v.setUint32(36+bodySize,0x184);
  bytes.set(text,44+bodySize);return {bytes,v};
}
test('imports player parameters without reversing packed bytes or mutating Buffer input',()=>{
  const {bytes}=fixture(),before=Buffer.from(bytes),{image}=convertPlayerParameters(bytes),v=new DataView(image.buffer);
  assert.deepEqual(bytes,before);assert.equal(v.getFloat32(32,true),-13.25);assert.equal(v.getInt32(36,true),-7);
  assert.deepEqual([...image.subarray(32+0xC0,36+0xC0)],[0xFE,0xDC,0xBA,0x98]);
  assert.equal(v.getUint32(32+0x184,true),0);assert.equal(v.getUint32(8,true),1);
  assert.equal(v.getUint32(32+0x188,true),0x184);
});
test('rejects malformed roots, truncated parameters and zero statistics intervals',()=>{
  for(const mutate of [v=>v.setUint32(32+0x184,4),v=>v.setUint32(36+0x188,0),v=>v.setUint32(32+0x70,0)]){
    const {bytes,v}=fixture();mutate(v);assert.throws(()=>convertPlayerParameters(bytes));
  }
});
