import test from 'node:test';
import assert from 'node:assert/strict';
import {convertBattlefieldMap} from '../../engines/browser-native/stage-map-assets.mjs';
function fixture(change=()=>{}) {
  const body=new Uint8Array(1792),d=new DataView(body.buffer),relocs=new Set(),root=0,param=800,joint=1300,camera=1400,light=1500;
  const ptr=(p,q)=>{relocs.add(p);d.setUint32(p,q);};
  ptr(0,48);d.setUint32(4,1);ptr(8,64);d.setUint32(12,7);ptr(24,500);d.setUint32(28,34);ptr(40,636);d.setUint32(44,4);
  ptr(48,joint);ptr(52,1560);d.setUint32(56,1);
  for(let i=0;i<7;i++){const p=64+i*52;ptr(p,joint);ptr(p+16,camera);ptr(p+24,1536);}
  for(let i=0;i<17;i++){ptr(500+i*8,light);body[504+i*8]=0xe0;}
  for(let i=0;i<4;i++)ptr(636+i*4,joint);
  d.setFloat32(param,1);ptr(param+176,1100);d.setUint32(param+180,1);d.setUint32(1100,31);
  d.setUint32(joint+4,1);for(let i=0;i<3;i++)d.setFloat32(joint+32+i*4,1);
  d.setUint16(camera+6,1);d.setFloat32(camera+40,0.1);d.setFloat32(camera+44,1000);d.setFloat32(camera+48,40);d.setFloat32(camera+52,4/3);
  d.setUint16(light+8,4);body.set([10,20,30,255],light+12);ptr(1536,1544);ptr(1544,light);
  change({d,body,relocs,param,joint,camera,light,ptr});
  const names=new TextEncoder().encode('map_head\0grGroundParam\0'),start=32+body.length+relocs.size*4,image=new Uint8Array(start+16+names.length),out=new DataView(image.buffer);
  [image.length,body.length,relocs.size,2,0].forEach((n,i)=>out.setUint32(i*4,n));image.set(body,32);[...relocs].forEach((p,i)=>out.setUint32(32+body.length+i*4,p));out.setUint32(start,root);out.setUint32(start+8,param);out.setUint32(start+12,9);image.set(names,start+16);return image;
}
test('stage map imports typed camera, light and model data while preserving packed flags/colors',()=>{
  const b=fixture(),copy=b.slice(),r=convertBattlefieldMap(b),d=new DataView(r.image.buffer,32);
  assert.deepEqual(b,copy);assert.equal(r.count,7);assert.equal(r.typedOverrideRows,17);assert.equal(r.declaredOverrides,34);
  assert.equal(d.getUint16(1406,true),1);assert.equal(d.getFloat32(1452,true),Math.fround(4/3));assert.equal(r.image[32+504],0xe0);assert.deepEqual([...r.image.subarray(1544,1548)],[10,20,30,255]);
  assert.equal(r.models.length,1);assert.equal(r.cameras.length,1);assert.equal(r.lights.length,1);
});
test('stage map refuses unsupported graphs and unsafe descriptor interpretation',()=>{
  for(const change of [
    a=>a.d.setUint32(12,8),a=>a.d.setUint32(28,17),a=>a.d.setUint16(a.camera+6,9),
    a=>a.ptr(a.camera,1300),a=>a.ptr(64+12,1300),a=>a.ptr(64+32,1300),
    a=>a.d.setUint32(64+36,1),a=>a.ptr(a.param+176,1788),
    a=>a.relocs.delete(64),a=>a.ptr(a.light+16,1790),
    a=>a.ptr(a.light+4,a.light),a=>a.d.setUint32(1100,32),
  ])assert.throws(()=>convertBattlefieldMap(fixture(change)));
});
