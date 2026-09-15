import test from 'node:test';
import assert from 'node:assert/strict';
import {convertSpecialAttributes} from '../../engines/browser-native/attribute-assets.mjs';
const spec={characters:[{kind:0,callback:'ftMr_Init_LoadSpecialAttrs',record:0}],records:[{size:16,fields:[
  {offset:0,width:4,kind:'float'},{offset:4,width:2,kind:'half'},{offset:6,width:1,kind:'byte'},{offset:8,width:4,kind:'opaque'}]}]};
function fixture(){
  const text=new TextEncoder().encode('ftDataMario\0'),bytes=new Uint8Array(32+32+4+8+text.length),d=new DataView(bytes.buffer);
  [bytes.length,32,1,1,0].forEach((v,i)=>d.setUint32(i*4,v));d.setUint32(36,16);d.setUint32(64,4);
  d.setFloat32(48,-1.25);d.setUint16(52,0x1234);bytes[54]=0x87;d.setUint32(56,63);bytes[63]=0xda;
  bytes.set(text,76);return{bytes,d};
}
test('attributes import numeric words without changing packed bytes or source Buffers',()=> {
  const f=fixture(),input=Buffer.from(f.bytes),before=Buffer.from(input),converted=convertSpecialAttributes(input,'PlMr.dat',spec),d=new DataView(converted.bytes.buffer);
  assert.equal(d.getFloat32(0,true),-1.25);assert.equal(d.getUint16(4,true),0x1234);
  assert.equal(converted.bytes[6],0x87);assert.equal(d.getUint32(8,true),63);assert.equal(converted.bytes[15],0xda);
  assert.deepEqual(input,before);
});
test('attributes reject missing pointers, short records and unexpected relocations',()=> {
  for(const mutate of [f=>f.d.setUint32(36,20),f=>f.d.setUint32(64,8),f=>f.d.setFloat32(48,NaN)]) {
    const f=fixture();mutate(f);assert.throws(()=>convertSpecialAttributes(f.bytes,'PlMr.dat',spec));
  }
  assert.throws(()=>convertSpecialAttributes(fixture().bytes,'PlXX.dat',spec));
});
