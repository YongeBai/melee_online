import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeGX,encodeGX,textureByteLength} from '../../engines/browser-native/texture.mjs';
test('CMPR uses GX 5/8 blending and colored transparent entries',()=>{
  const bytes=new Uint8Array(32),v=new DataView(bytes.buffer);
  v.setUint16(0,0xf800);v.setUint16(2,0x001f);bytes[4]=0xb0;
  let pixels=decodeGX(bytes,8,8,14);
  assert.deepEqual(Array.from(pixels.slice(0,8)),[159,0,95,255,95,0,159,255]);
  v.setUint16(0,0x001f);v.setUint16(2,0xf800);bytes[4]=0xc0;
  pixels=decodeGX(bytes,8,8,14);assert.deepEqual(Array.from(pixels.slice(0,4)),[127,0,127,0]);
});
test('indexed formats use big-endian palettes and ignore unused tile texels',()=>{
  const palette={format:1,data:Uint8Array.from([0xf8,0,0,0x1f])},data=new Uint8Array(32);
  data[0]=0x10;
  assert.deepEqual(Array.from(decodeGX(data,2,1,8,palette)),[0,0,255,255,255,0,0,255]);
  data[0]=1;assert.deepEqual(Array.from(decodeGX(data,1,1,9,palette)),[0,0,255,255]);
  data[0]=0xc0;data[1]=1;assert.deepEqual(Array.from(decodeGX(data,1,1,10,palette)),[0,0,255,255]);
  assert.throws(()=>decodeGX(data,1,1,9,palette),/index/);
});
test('palette formats retain alpha and hardware bit expansion',()=>{
  const data=new Uint8Array(32);
  assert.deepEqual(Array.from(decodeGX(data,1,1,9,{format:0,data:Uint8Array.from([77,99])})),[99,99,99,77]);
  assert.deepEqual(Array.from(decodeGX(data,1,1,9,{format:2,data:Uint8Array.from([0x31,0x23])})),[17,34,51,109]);
  const rgb=new Uint8Array(32);new DataView(rgb.buffer).setUint16(0,0x1800);
  assert.deepEqual(Array.from(decodeGX(rgb,1,1,4)),[24,0,0,255]);
});
test('validates texture sizes and split RGBA8 planes',()=>{
  assert.equal(textureByteLength(9,9,8),128);
  assert.throws(()=>textureByteLength(0,1,0));assert.throws(()=>decodeGX(new Uint8Array(1),4,4,6));
  const bytes=new Uint8Array(64);bytes[0]=77;bytes[1]=33;bytes[32]=44;bytes[33]=55;
  assert.deepEqual(Array.from(decodeGX(bytes,1,1,6)),[33,44,55,77]);
});
test('framebuffer RGB5A3 encoding uses GX tiles and opaque/alpha branches',()=>{
  const rgba=new Uint8Array(5*4*4);for(let i=0;i<20;i++)rgba.set([i*11,255-i*7,i*3,i===6?96:255],i*4);
  const encoded=encodeGX(rgba,5,4,5),decoded=decodeGX(encoded,5,4,5);
  assert.equal(encoded.length,64);assert.deepEqual(Array.from(decoded.slice(6*4,6*4+4)),[68,221,17,109]);
  assert.deepEqual(Array.from(decoded.slice(19*4,19*4+4)),[214,123,57,255]);
  assert.throws(()=>encodeGX(rgba,5,4,6),/framebuffer encode/);
});
