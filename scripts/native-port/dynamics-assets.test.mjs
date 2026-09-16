import test from 'node:test';
import assert from 'node:assert/strict';
import {convertDynamics} from '../../engines/browser-native/dynamics-assets.mjs';
function fixture() {
  const body=new Uint8Array(256),d=new DataView(body.buffer),relocs=[16,44,48,68,80,100,192,196];
  d.setUint32(16,216);d.setUint32(44,64);d.setUint32(48,84);
  d.setUint32(64,1);d.setUint32(68,96);d.setUint32(80,192);
  d.setUint32(96,2);d.setUint32(100,120);d.setUint32(104,1);
  d.setFloat32(108,1);d.setFloat32(112,1);d.setFloat32(116,.25);
  for(let i=0;i<15;i++)d.setFloat32(120+i*4,(i-7)/8);
  d.setUint32(192,200);d.setUint32(196,204);d.setUint32(200,0);d.setUint32(204,256);
  body[217]=1;
  const name=new TextEncoder().encode('ftDataMario\0'),bytes=new Uint8Array(32+body.length+relocs.length*4+8+name.length),view=new DataView(bytes.buffer);
  [bytes.length,body.length,relocs.length,1,0].forEach((n,i)=>view.setUint32(i*4,n));bytes.set(body,32);
  relocs.forEach((at,i)=>view.setUint32(32+body.length+i*4,at));bytes.set(name,32+body.length+relocs.length*4+8);
  return {bytes,view,spec:{codes:['Mr'],counts:[1]}};
}
test('dynamic import converts float records while preserving integer cutoff tables',()=>{
  const f=fixture(),before=f.bytes.slice(),r=convertDynamics(f.bytes,'PlMr.dat',8,f.spec);
  assert.deepEqual(f.bytes,before);assert.equal(r.count,1);assert.deepEqual(r.selectors,[[0],[256]]);assert.equal(r.rows[0].parameters.length,15);
  const d=new DataView(r.image.buffer,32),bones=d.getUint32(4,true),params=d.getUint32(bones+4,true),table=d.getUint32(16,true),cutoff=d.getUint32(table+4,true);
  assert.equal(d.getFloat32(params,true),-.875);assert.equal(d.getUint32(cutoff,true),256);
  // Archive metadata is little endian too; the source parser is big endian.
  const header=new DataView(r.image.buffer),relocs=header.getUint32(8,true),at=32+header.getUint32(4,true);
  const slots=Array.from({length:relocs},(_,i)=>header.getUint32(at+i*4,true));assert(!slots.includes(cutoff));assert(slots.includes(table+4));
});
test('dynamic import rejects missing pointers, invalid chains, typed overlap and nonfinite parameters',()=>{
  for(const mutate of [v=>v.setUint32(32+64,10),v=>v.setUint32(32+104,140),v=>v.setUint32(32+100,192),v=>v.setUint32(32+120,0x7f800000),v=>v.setUint32(32+204,257),v=>v.setUint32(32+80,252)]) {
    const f=fixture();mutate(f.view);assert.throws(()=>convertDynamics(f.bytes,'PlMr.dat',8,f.spec));
  }
});
test('dynamic import retains shared selector row identity',()=>{
  const f=fixture();f.view.setUint32(32+196,200);const r=convertDynamics(f.bytes,'PlMr.dat',8,f.spec),d=new DataView(r.image.buffer,32),table=d.getUint32(16,true);
  assert.deepEqual(r.selectors,[[0],[0]]);assert.equal(d.getUint32(table,true),d.getUint32(table+4,true));
});
