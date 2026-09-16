import test from 'node:test';
import assert from 'node:assert/strict';
import {convertFoxExtra} from '../../engines/browser-native/fox-extra-assets.mjs';
function fixture(mutate=()=>{}){
  const body=new Uint8Array(320),d=new DataView(body.buffer),relocs=new Set([72,144]);d.setUint32(72,128);d.setUint32(144,256);
  [5,25,8,75,-1,-1].forEach((v,i)=>d.setInt32(256+i*4,v));mutate({d,relocs});
  const name=new TextEncoder().encode('ftDataFox\0'),pub=32+body.length+relocs.size*4,bytes=new Uint8Array(pub+8+name.length),v=new DataView(bytes.buffer);
  [bytes.length,body.length,relocs.size,1,0].forEach((n,i)=>v.setUint32(i*4,n));bytes.set(body,32);[...relocs].forEach((at,i)=>v.setUint32(32+body.length+i*4,at));bytes.set(name,pub+8);return bytes;
}
test('Fox extra imports the complete known scalar record independently of Article graphs',()=>{
  const input=Buffer.from(fixture()),before=Buffer.from(input),r=convertFoxExtra(input,12),v=new DataView(r.image.buffer,32);
  assert.deepEqual(input,before);assert.deepEqual(Array.from({length:6},(_,i)=>v.getInt32(i*4,true)),[5,25,8,75,-1,-1]);assert.equal(new DataView(r.image.buffer).getUint32(8,true),0);
});
test('Fox extra rejects unknown layouts, pointers in scalar data, truncation and missing source links',()=>{
  for(const mutate of [x=>x.d.setInt32(256,12),x=>x.relocs.add(256),x=>x.relocs.delete(144),x=>x.d.setUint32(144,312),x=>x.d.setInt32(276,0),x=>x.d.setInt32(260,24)])assert.throws(()=>convertFoxExtra(fixture(mutate),12),undefined,String(mutate));
});
