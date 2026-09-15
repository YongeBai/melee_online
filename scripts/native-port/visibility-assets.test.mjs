import test from 'node:test';
import assert from 'node:assert/strict';
import {convertVisibility} from '../../engines/browser-native/visibility-assets.mjs';
import {convertAuxiliaryAsset} from '../../engines/browser-native/auxiliary-assets.mjs';
function fixture(external=300) {
  const size=320,relocs=[8,92,164,184,204,212,220],text=new TextEncoder().encode('ftDataMario\0unused\0');
  const bytes=new Uint8Array(32+size+relocs.length*4+16+text.length),v=new DataView(bytes.buffer),d=new DataView(bytes.buffer,32,size);
  [bytes.length,size,relocs.length,1,1].forEach((n,i)=>v.setUint32(i*4,n));
  d.setUint32(8,160);d.setUint32(92,96);for(const n of [32,36,40])d.setFloat32(96+n,1);
  d.setUint32(160,1);d.setUint32(164,184);d.setUint32(184,200);
  d.setUint32(200,2);d.setUint32(204,208);d.setUint32(208,2);d.setUint32(212,256);
  d.setUint32(216,1);d.setUint32(220,260);bytes.set([0,123],32+256);bytes[32+260]=4;
  relocs.forEach((n,i)=>v.setUint32(32+size+i*4,n));const symbols=32+size+relocs.length*4;
  v.setUint32(symbols+8,external);v.setUint32(symbols+12,12);d.setUint32(external,0xffffffff);bytes.set(text,symbols+16);
  return {bytes,v,d};
}
test('visibility import preserves index bytes and only exposes its typed graph',()=>{
  const f=fixture(),before=f.bytes.slice(),a=convertVisibility(f.bytes,'PlMr.dat',1),v=new DataView(a.image.buffer);
  assert.deepEqual(a.rows,[[[[[0,123],[4]]],null,null,null]]);assert.equal(a.models,1);
  assert.deepEqual(a.image.subarray(288,290),Uint8Array.of(0,123));assert.equal(v.getUint32(32+200,true),2);
  assert.equal(v.getUint32(8,true),5);assert.deepEqual(f.bytes,before);
});
test('visibility import rejects oversized groups, index lists and unresolved pointers',()=>{
  for(const mutation of [f=>f.d.setUint32(160,12),f=>f.d.setUint32(208,125),f=>f.bytes[32+256]=124,f=>f.d.setUint32(188,3),f=>f.d.setUint32(212,200)]) {
    const f=fixture();mutation(f);assert.throws(()=>convertVisibility(f.bytes,'PlMr.dat',1));
  }
});
test('auxiliary import excludes unrelated externs and rejects references inside its descriptors',()=>{
  const f=fixture(),before=f.bytes.slice(),a=convertAuxiliaryAsset(f.bytes,'PlMr.dat');
  assert.equal(a.model.tree.nodes.length,1);assert.equal(new DataView(a.image.buffer).getUint32(8,true),0);
  assert.deepEqual(f.bytes,before);
  assert.throws(()=>convertAuxiliaryAsset(fixture(100).bytes,'PlMr.dat'),/Auxiliary model requires external linking|typed importer/);
});
