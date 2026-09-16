import test from 'node:test';
import assert from 'node:assert/strict';
import {convertPurinExtra} from '../../engines/browser-native/purin-extra-assets.mjs';
function fixture(mutate=()=>{}) {
  const body=new Uint8Array(400),d=new DataView(body.buffer),relocs=new Set();
  function ptr(at,value){d.setUint32(at,value);relocs.add(at);}
  ptr(72,128);ptr(132,160);d.setUint32(164,1);ptr(168,256);
  for(let i=0;i<5;i++)ptr(256+i*16,336);
  d.setUint32(336,1);ptr(340,344);d.setUint32(344,2);ptr(348,360);body.set([0,3],360);
  mutate({d,body,relocs,ptr});
  const name=new TextEncoder().encode('ftDataPurin\0'),pub=32+body.length+relocs.size*4,bytes=new Uint8Array(pub+8+name.length),v=new DataView(bytes.buffer);
  [bytes.length,body.length,relocs.size,1,0].forEach((n,i)=>v.setUint32(i*4,n));bytes.set(body,32);[...relocs].forEach((p,i)=>v.setUint32(32+body.length+i*4,p));bytes.set(name,pub+8);return bytes;
}
test('Purin extra imports five aliased costume visibility rows and preserves packed indices',()=>{
  const input=fixture(),copy=input.slice(),r=convertPurinExtra(input,5),v=new DataView(r.image.buffer,32);
  assert.deepEqual(input,copy);assert.equal(r.table,128);assert.equal(r.hat,160);assert.equal(r.models,1);assert.equal(r.rows.length,5);
  for(const row of r.rows)assert.deepEqual(row,[[[[0,3]]],null,null,null]);
  assert.equal(v.getUint32(132,true),160);assert.equal(v.getUint32(168,true),256);assert.deepEqual([...r.image.subarray(392,394)],[0,3]);
});
test('Purin extra rejects untyped slots, missing links and overlapping or truncated descriptors',()=>{
  for(const mutate of [x=>x.d.setUint32(128,1),x=>x.d.setUint32(160,1),x=>x.relocs.delete(132),x=>x.d.setUint32(132,396),x=>x.d.setUint32(164,12),x=>x.ptr(168,128),x=>x.ptr(348,160),x=>x.d.setUint32(344,125)])assert.throws(()=>convertPurinExtra(fixture(mutate),5),undefined,String(mutate));
  assert.throws(()=>convertPurinExtra(fixture(),4));
});
