import test from 'node:test';
import assert from 'node:assert/strict';
import {validateTrack,readFigaTree} from '../../engines/browser-native/animation-assets.mjs';

function linear() {
  const bytes=new Uint8Array(10),v=new DataView(bytes.buffer);
  bytes[0]=0x12;v.setFloat32(1,-2.5,true);bytes[5]=10;v.setFloat32(6,7.25,true);
  return bytes;
}
test('animation scalar stream stays little-endian and has two linear keys',()=> {
  assert.equal(validateTrack(linear(),0,0),2);
  assert.equal(validateTrack(new Uint8Array([0x12,0xfd,0xff,10,7,0]),0x20,0),2);
});
test('animation validation rejects truncated scalars, packs, varints and invalid opcodes',()=> {
  for(const bytes of [linear().slice(0,9),new Uint8Array([0x12,0,0,0,0]),
    new Uint8Array([0]),new Uint8Array([0x82,128,128,128,128,128]),
    new Uint8Array([0x12,0,0,0,0,128])])assert.throws(()=>validateTrack(bytes,0,0));
  const invalid=linear();new DataView(invalid.buffer).setFloat32(1,NaN,true);
  assert.throws(()=>validateTrack(invalid,0,0),/Nonfinite/);
  assert.throws(()=>validateTrack(linear(),0xe0,0),/Unsupported/);
});
function tree() {
  const symbol=new TextEncoder().encode('x_figatree\0');
  const bytes=new Uint8Array(32+48+12+8+symbol.length),v=new DataView(bytes.buffer);
  [bytes.length,48,3,1,0].forEach((x,i)=>v.setUint32(i*4,x));
  v.setUint32(32,1);v.setFloat32(40,10);v.setUint32(44,20);v.setUint32(48,24);
  bytes[52]=1;bytes[53]=255;v.setUint16(56,10);v.setInt16(58,-1);bytes[60]=1;
  v.setUint32(64,36);bytes.set(linear(),68);
  [12,16,32].forEach((x,i)=>v.setUint32(80+i*4,x));bytes.set(symbol,100);
  return {bytes,v};
}
test('converts animation descriptors while preserving raw payload bytes',()=> {
  const {bytes}=tree(),parsed=readFigaTree(bytes);
  assert.equal(parsed.frames,10);assert.equal(parsed.bones,1);
  assert.equal(parsed.tracks.length,1);assert.equal(parsed.tracks[0].start,-1);
  assert.deepEqual(parsed.tracks[0].bytes,linear());
});
test('accepts retail non-classical scaling animation trees without changing their flag',()=> {
  const f=tree();f.v.setUint32(32,0);
  assert.equal(readFigaTree(f.bytes).type,0);
});
test('animation graph validation rejects incorrect track range and missing node terminator',()=> {
  const f=tree();f.v.setUint16(56,100);
  assert.throws(()=>readFigaTree(f.bytes),/payload/);
  const g=tree();g.bytes[53]=0;
  assert.throws(()=>readFigaTree(g.bytes));
});

test('motion bundle conversion preserves offsets and does not mutate Node Buffer input',async()=>{
  const {convertMotionAnimations}=await import('../../engines/browser-native/motion-animations.mjs');
  const {bytes}=tree(),offset=Math.ceil(bytes.length/32)*32,padded=Buffer.alloc(offset+bytes.length+17);
  padded.set(bytes,9);padded.set(bytes,9+offset);
  const input=padded.subarray(9,9+offset+bytes.length),before=Uint8Array.from(padded);
  const motions=[0,offset].map(animationOffset=>({animationOffset,animationSize:bytes.length,name:'x_figatree'}));
  const converted=convertMotionAnimations(input,motions),v=new DataView(converted.image.buffer);
  assert.deepEqual(Uint8Array.from(padded),before);assert.equal(converted.clips.size,2);
  for(const at of [0,offset]){assert.equal(v.getUint32(at,true),bytes.length);assert.equal(v.getInt16(at+58,true),-1);}
  assert.throws(()=>convertMotionAnimations(input,[{...motions[0],animationSize:bytes.length+1}]),/expected animation/);
});
