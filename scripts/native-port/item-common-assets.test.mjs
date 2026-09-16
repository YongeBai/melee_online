import test from 'node:test';
import assert from 'node:assert/strict';
import {convertItemCommon} from '../../engines/browser-native/item-common-assets.mjs';

function fixture(mutate=()=>{}) {
  const body=new Uint8Array(512),d=new DataView(body.buffer),relocs=new Set([0,16]),externs=new Map();
  d.setUint32(0,32);d.setUint32(16,400);
  d.setUint32(32,40);d.setFloat32(32+0x4c,.5);d.setFloat32(404,5);
  for(const offset of [0x48,0xe4,0xec])body.set([0x44,0x22,0x88,0x66],32+offset);
  mutate({d,relocs,externs});
  const names=['itPublicData',...externs.keys()].map(s=>new TextEncoder().encode(s+'\0')),table=32+body.length+relocs.size*4,strings=table+names.length*8,bytes=new Uint8Array(strings+names.reduce((n,s)=>n+s.length,0)),v=new DataView(bytes.buffer);
  [bytes.length,body.length,relocs.size,1,externs.size].forEach((value,i)=>v.setUint32(i*4,value));bytes.set(body,32);
  [...relocs].forEach((at,i)=>v.setUint32(32+body.length+i*4,at));
  let text=0;[0,...externs.values()].forEach((at,i)=>{v.setUint32(table+i*8,at);v.setUint32(table+i*8+4,text);bytes.set(names[i],strings+text);text+=names[i].length;});return bytes;
}
test('common item conversion swaps declared words and preserves byte/padding fields without exposing registries',()=>{
  const input=Buffer.from(fixture()),before=Buffer.from(input),r=convertItemCommon(input),v=new DataView(r.image.buffer,32);
  assert.deepEqual(input,before);assert.equal(v.getUint32(32,true),40);assert.equal(v.getFloat32(32+0x4c,true),.5);assert.equal(v.getFloat32(404,true),5);
  for(const offset of [0x48,0xe4,0xec])assert.deepEqual([...r.image.slice(64+offset,68+offset)],[0x44,0x22,0x88,0x66]);
  const header=new DataView(r.image.buffer);assert.equal(header.getUint32(8,true),0);assert.equal(header.getUint32(12,true),2);
  assert.equal(r.words.length,92);assert.equal(r.packed.length,12);
});
test('common item import excludes unrelated external graphs and rejects external dependencies within its data',()=>{
  const external=(at,next=0xffffffff)=>x=>{x.externs.set('unimported_model',at);x.d.setUint32(at,next);};
  assert.doesNotThrow(()=>convertItemCommon(fixture(external(480))));
  for(const mutate of [external(32),external(404),external(0),external(480,480)])assert.throws(()=>convertItemCommon(fixture(mutate)),undefined,String(mutate));
});
test('common item import rejects scalar pointers, overlapping structures, invalid bounds and nonfinite floats',()=>{
  for(const mutate of [
    x=>x.relocs.delete(0),x=>x.d.setUint32(16,36),x=>x.d.setUint32(16,500),x=>x.d.setUint32(0,0),
    x=>{x.relocs.add(32);x.d.setUint32(32,400);},x=>x.d.setFloat32(32+0x4c,NaN),
  ])assert.throws(()=>convertItemCommon(fixture(mutate)),undefined,String(mutate));
});
