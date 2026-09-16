import test from 'node:test';
import assert from 'node:assert/strict';
import {convertBattlefieldMap,convertStageMap} from '../../engines/browser-native/stage-map-assets.mjs';
function fixture(change=()=>{},size=1792) {
  const body=new Uint8Array(size),d=new DataView(body.buffer),relocs=new Set(),root=0,param=800,joint=1300,camera=1400,light=1500;
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
  ptr(1600,1620);ptr(1604,1632);d.setUint32(1620,9<<26);d.setUint32(1632,10<<26);
  change({d,body,relocs,param,joint,camera,light,ptr});
  const names=new TextEncoder().encode('map_head\0grGroundParam\0yakumono_param\0'),start=32+body.length+relocs.size*4,image=new Uint8Array(start+24+names.length),out=new DataView(image.buffer);
  [image.length,body.length,relocs.size,3,0].forEach((n,i)=>out.setUint32(i*4,n));image.set(body,32);[...relocs].forEach((p,i)=>out.setUint32(32+body.length+i*4,p));out.setUint32(start,root);out.setUint32(start+8,param);out.setUint32(start+12,9);out.setUint32(start+16,1600);out.setUint32(start+20,23);image.set(names,start+24);return image;
}
test('stage map imports typed camera, light and model data while preserving packed flags/colors',()=>{
  const b=fixture(),copy=b.slice(),r=convertBattlefieldMap(b),d=new DataView(r.image.buffer,32);
  assert.deepEqual(b,copy);assert.equal(r.count,7);assert.equal(r.typedOverrideRows,17);assert.equal(r.declaredOverrides,34);
  assert.equal(d.getUint16(1406,true),1);assert.equal(d.getFloat32(1452,true),Math.fround(4/3));assert.equal(r.image[32+504],0xe0);assert.deepEqual([...r.image.subarray(1544,1548)],[10,20,30,255]);
  assert.equal(r.models.length,1);assert.equal(r.cameras.length,1);assert.equal(r.lights.length,1);
});
test('stage callbacks import typed color scripts and reject unsafe script roots',()=>{
  const converted=convertBattlefieldMap(fixture(),{callbacks:true}),d=new DataView(converted.image.buffer,32);
  assert.equal(converted.yakumono,1600);assert.equal(d.getUint32(1620,true),9<<26);assert.equal(d.getUint32(1632,true),10<<26);
  for(const change of [a=>a.relocs.delete(1600),a=>a.ptr(1604,1792),a=>a.d.setUint32(1620,63<<26)])assert.throws(()=>convertBattlefieldMap(fixture(change),{callbacks:true}));
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

function destination(change=()=>{}) {
  return fixture(a=>{
    const {d,body,ptr,light,joint}=a;
    ptr(8,1800);d.setUint32(12,10);
    for(let i=0;i<10;i++)for(let j=0;j<52;j+=4){const from=64+j,to=1800+i*52+j;d.setUint32(to,d.getUint32(from));if(a.relocs.has(from))a.relocs.add(to);}
    ptr(24,2400);d.setUint32(28,32);
    for(let i=0;i<16;i++){ptr(2400+i*8,light);body[2404+i*8]=0xe0;}
    ptr(32,2528);d.setUint32(36,3);ptr(40,2552);d.setUint32(44,1);ptr(2552,joint);
    for(let i=0;i<3;i++){ptr(2528+i*8,2800);body[2532+i*8]=i?0x80:0;}
    ptr(16,2560);d.setUint32(20,2);ptr(2560,2600);ptr(2564,2600);
    d.setUint16(2602,2);d.setFloat32(2612,1);ptr(2608,2700);ptr(2616,2724);
    ptr(1608,1620);ptr(1612,1632);d.setUint32(1100,32);
    change(a);
  },4096);
}
test('Final Destination imports spline arrays, shadow flags and four original callback scripts',()=>{
  const source=destination(),copy=source.slice(),map=convertStageMap(source,{stage:'destination',callbacks:true}),d=new DataView(map.image.buffer,32);
  assert.deepEqual(source,copy);assert.equal(map.count,10);assert.equal(map.splineCount,2);assert.equal(map.shadowCount,3);assert.equal(map.typedOverrideRows,16);
  assert.equal(d.getUint16(2602,true),2);assert.equal(d.getUint32(2608,true),2700);assert.equal(d.getUint8(2540),0x80);assert.equal(d.getUint32(1612,true),1632);
  for(const change of [a=>a.d.setUint16(2602,1),a=>a.d.setFloat32(2700,NaN),a=>a.d.setUint32(20,3),a=>a.d.setUint32(36,4),a=>a.d.setUint32(28,34),a=>a.relocs.delete(1612)])assert.throws(()=>convertStageMap(destination(change),{stage:'destination',callbacks:true}));
  assert.throws(()=>convertBattlefieldMap(source));assert.throws(()=>convertStageMap(source,{stage:'unknown'}));
});
test('stage light animation imports its referenced spline joint with explicit ownership',()=>{
  const source=destination(a=>{a.ptr(2804,2850);a.ptr(2862,2900);});
  // An unaligned object-pointer slot must never be treated as a valid AObj.
  assert.throws(()=>convertStageMap(source,{stage:'destination'}));
  const valid=destination(a=>{
    a.ptr(2804,2852);a.ptr(2864,2900);a.d.setUint32(2904,0x4000);a.ptr(2916,2600);
    for(let i=0;i<3;i++)a.d.setFloat32(2932+i*4,1);
  });
  const map=convertStageMap(valid,{stage:'destination'});
  assert.ok(map.models.some(m=>m.root===2900&&m.nodes===1));assert.ok(map.pointerSlots.has(2864));
});
