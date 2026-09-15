import test from 'node:test';
import assert from 'node:assert/strict';
import {readMotionScripts} from '../../engines/browser-native/motion-assets.mjs';
import {nativeSubgraphImage} from '../../engines/browser-native/archive.mjs';
const lengths=[1,1,1,1,1,2,1,2,1,1];
function script(words,slots=[]) {
  const bytes=new Uint8Array(words.length*4),data=new DataView(bytes.buffer);
  words.forEach((v,i)=>data.setUint32(i*4,v));return {data,relocations:new Set(slots)};
}
test('motion graph preserves shared calls, loops, root zero and null jumps',()=>{
  const a=script([5<<26,24,3<<26,4<<26,7<<26,0,1<<26,6<<26],[4]);
  const result=readMotionScripts(a,[0,24],lengths);
  assert.deepEqual([...result.commands.keys()].sort((a,b)=>a-b),[0,8,12,16,24,28]);
  assert.deepEqual([...result.pointers],[4]);assert.equal(result.words.size,8);
  assert.equal(result.commands.get(16).target,null);
  const cycle=readMotionScripts(script([7<<26,0],[4]),[0],lengths);
  assert.equal(cycle.commands.get(0).target,0);assert.equal(cycle.commands.size,1);
});
test('motion graph rejects argument entries, out-of-range branches and unknown opcodes',()=>{
  for(const [a,starts] of [
    [script([5<<26,4,0],[4]),[0]],
    [script([7<<26,12],[4]),[0]],
    [script([7<<26,4]),[0]],
    [script([63<<26]),[0]],
    [script([5<<26]),[0]],
    [script([1<<26]),[0]],
    [script([0]),[2]],
    [script([0],[0]),[0]],
  ])assert.throws(()=>readMotionScripts(a,starts,lengths));
});
test('native subgraph keeps only typed relocation metadata and preserves opaque bytes',()=>{
  const data=new Uint8Array([4,0,0,0,0x80,0x31,0x0f,0x99]);
  const image=nativeSubgraphImage(data,new Set([0]),new Map([['motion',4]])),v=new DataView(image.buffer);
  assert.equal(v.getUint32(0,true),image.length);assert.equal(v.getUint32(8,true),1);
  assert.deepEqual(image.subarray(32,40),data);assert.equal(v.getUint32(40,true),0);
  assert.equal(v.getUint32(44,true),4);assert.equal(new TextDecoder().decode(image.subarray(52)),'motion\0');
  for(const slots of [[0,0],[1],[4],[-4],[8]])assert.throws(()=>nativeSubgraphImage(data,slots,new Map([['motion',0]])));
  for(const symbols of [new Map(),new Map([['bad\0name',0]]),new Map([['bad',8]])])
    assert.throws(()=>nativeSubgraphImage(data,[0],symbols));
});

function fighterFixture() {
  const body=new Uint8Array(160),d=new DataView(body.buffer),relocs=[12,96,108];
  d.setUint32(12,96);d.setUint32(96,120);d.setUint32(100,32);d.setUint32(104,128);
  d.setUint32(108,152);d.setUint32(112,0xc0000000);
  body.set(new TextEncoder().encode('sample_figatree\0'),120);
  const text=new TextEncoder().encode('ftDataMario\0unrelated_item\0');
  const bytes=new Uint8Array(32+body.length+relocs.length*4+16+text.length),v=new DataView(bytes.buffer);
  [bytes.length,body.length,relocs.length,1,1].forEach((n,i)=>v.setUint32(i*4,n));bytes.set(body,32);
  relocs.forEach((at,i)=>v.setUint32(192+i*4,at));v.setUint32(212,0xffffffff);v.setUint32(216,12);bytes.set(text,220);
  return {bytes,v,spec:{codes:['Mr'],counts:[1],commandWords:lengths}};
}
test('motion conversion selects a typed subgraph without exposing unrelated externs',async()=>{
  const {convertFighterMotions}=await import('../../engines/browser-native/motion-assets.mjs');
  const {bytes,spec}=fighterFixture(),original=bytes.slice(),m=convertFighterMotions(bytes,'PlMr.dat',spec),v=new DataView(m.image.buffer);
  assert.deepEqual(bytes,original);assert.equal(m.count,1);assert.equal(m.motions[0].name,'sample_figatree');
  assert.equal(v.getUint32(16,true),0);assert.equal(v.getUint32(8,true),2);assert.equal(v.getUint32(32+112,true),0xc0000000);
  assert.equal(v.getUint32(32+96,true),120);assert.equal(v.getUint32(32+108,true),152);
  assert.equal(new TextDecoder().decode(m.image.subarray(m.image.length-20)),'native_motion_table\0');
});
test('motion conversion rejects malformed sizes, prebound buffers, and absent table relocation',async()=>{
  const {convertFighterMotions}=await import('../../engines/browser-native/motion-assets.mjs');
  for(const mutate of [
    v=>v.setUint32(32+104,0x8001),v=>v.setUint32(32+116,1),v=>v.setUint32(32+100,1),
    v=>v.setUint32(192,8),v=>v.setUint32(32+12,156),
  ]) {
    const {bytes,v,spec}=fighterFixture();mutate(v);assert.throws(()=>convertFighterMotions(bytes,'PlMr.dat',spec));
  }
});

test('Node Buffer motion imports neither modify input nor use its backing-buffer offset',async()=>{
  const {convertFighterMotions}=await import('../../engines/browser-native/motion-assets.mjs');
  const fixture=fighterFixture(),padded=Buffer.alloc(fixture.bytes.length+23,0xa5);
  padded.set(fixture.bytes,11);const input=padded.subarray(11,11+fixture.bytes.length),before=padded.slice();
  const original=Uint8Array.from(before),native=convertFighterMotions(input,'PlMr.dat',fixture.spec);
  assert.deepEqual(Uint8Array.from(padded),original);
  assert.equal(new DataView(native.image.buffer).getUint32(32+112,true),0xc0000000);
});
