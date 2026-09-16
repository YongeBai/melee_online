import test from 'node:test';
import assert from 'node:assert/strict';
import {convertItemRuntime} from '../../engines/browser-native/item-runtime-assets.mjs';
function fixture(mutate=()=>{}){
  const body=new Uint8Array(1024),d=new DataView(body.buffer),relocs=new Set(),ptr=(at,to)=>{relocs.add(at);d.setUint32(at,to);};
  ptr(0,32);ptr(16,400);ptr(20,432);ptr(440,512);ptr(448,512);d.setUint8(444,30);d.setUint8(445,1);
  d.setUint32(512,1<<26|3);d.setUint32(516,0);mutate({d,ptr,relocs});
  const name=new TextEncoder().encode('itPublicData\0'),table=32+body.length+relocs.size*4,bytes=new Uint8Array(table+8+name.length),v=new DataView(bytes.buffer);
  [bytes.length,body.length,relocs.size,1,0].forEach((n,i)=>v.setUint32(i*4,n));bytes.set(body,32);[...relocs].forEach((at,i)=>v.setUint32(32+body.length+i*4,at));bytes.set(name,table+8);return bytes;
}
test('item runtime imports shared color scripts with original packed priorities and aliases',()=>{
  const input=Buffer.from(fixture()),before=Buffer.from(input),r=convertItemRuntime(input),v=new DataView(r.image.buffer,32);
  assert.deepEqual(input,before);assert.equal(r.scripts.commands.size,2);assert.equal(r.colorTable.entries.length,7);
  assert.equal(v.getUint32(440,true),512);assert.equal(v.getUint32(448,true),512);assert.equal(v.getUint32(512,true),1<<26|3);
  assert.equal(v.getUint8(444),30);assert.equal(v.getUint8(445),1);assert.equal(new DataView(r.image.buffer).getUint32(12,true),3);
});
test('item runtime rejects overlapping, relocated packed and incomplete color data',()=>{
  for(const mutate of [x=>x.ptr(20,32),x=>x.ptr(440,40),x=>x.ptr(20,1000),x=>x.relocs.delete(440),x=>x.ptr(444,512),x=>x.d.setUint32(512,63<<26)])assert.throws(()=>convertItemRuntime(fixture(mutate)),undefined,String(mutate));
});
