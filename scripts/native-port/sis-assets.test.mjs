import test from 'node:test';import assert from 'node:assert/strict';
import {convertSisAsset} from '../../engines/browser-native/sis-assets.mjs';
function fixture(stream=[14,0,128,1,0,0x20,0,0x40,0,0],mutate=()=>{}){
 const data=new Uint8Array(576),v=new DataView(data.buffer),relocations=[0,4,8];v.setUint32(0,64);v.setUint32(4,40);v.setUint32(8,12);data.set(stream,12);data[40]=1;data[41]=2;data.fill(0xa5,64);mutate(v,relocations);
 const name=new TextEncoder().encode('SIS_SelCharData\0'),pub=32+data.length+relocations.length*4,bytes=new Uint8Array(pub+8+name.length),h=new DataView(bytes.buffer);
 [bytes.length,data.length,relocations.length,1,0].forEach((x,i)=>h.setUint32(i*4,x));bytes.set(data,32);relocations.forEach((x,i)=>h.setUint32(608+i*4,x));bytes.set(name,pub+8);return bytes;
}
test('SIS converts only pointers and preserves packed operands, glyphs and kerning',()=>{
 const bytes=fixture(),copy=bytes.slice(),s=convertSisAsset(bytes),out=new DataView(s.image.buffer,32);
 assert.deepEqual(bytes,copy);assert.equal(s.count,3);assert.equal(s.customGlyphs,1);assert.deepEqual(s.glyphs,[0x2000,0x4000]);
 assert.equal(out.getUint32(0,true),64);assert.equal(out.getUint32(4,true),40);assert.equal(out.getUint32(8,true),12);
 assert.deepEqual(s.image.subarray(44,608),bytes.subarray(44,608));
});
test('SIS rejects malformed commands, unsupported jumps and glyphs outside either atlas',()=>{
 for(const stream of [[8,0,0,0,12,0],[9,0,0,0,12,0],[27,0],[0x21,0x1f,0],[0x40,1,0]])assert.throws(()=>convertSisAsset(fixture(stream)));
 assert.throws(()=>convertSisAsset(fixture([14],v=>{for(let i=13;i<40;i++)v.setUint8(i,1);})),/Unterminated/);
 assert.throws(()=>convertSisAsset(fixture([],v=>{v.setUint32(8,39);v.setUint8(39,14);})),/Truncated/);
});
test('SIS rejects table holes and overlap with atlas or metadata',()=>{
 for(const mutate of [(v,r)=>r.splice(1,1),v=>v.setUint32(8,8),v=>v.setUint32(8,64),v=>v.setUint32(0,63),v=>v.setUint32(4,64)])assert.throws(()=>convertSisAsset(fixture(undefined,mutate)));
});
