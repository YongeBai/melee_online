import test from 'node:test';
import assert from 'node:assert/strict';
import {convertSecondaryAnimations,partAnimationCounts} from '../../engines/browser-native/secondary-animation-assets.mjs';
function fixture(kirby=false,mutate=()=>{}) {
  const body=new Uint8Array(768),d=new DataView(body.buffer),relocs=new Set(),externs=new Map();
  const ptr=(at,value)=>{relocs.add(at);d.setUint32(at,value);};
  ptr(28,96);ptr(32,108);ptr(108,512);d.setFloat32(112,1.25);
  const counts=kirby?[3,3,3]:[4,4,3];
  counts.forEach((count,i)=>{
    const row=128+i*12,table=192+i*24;ptr(96+i*4,row);d.setUint16(row,1);d.setUint16(row+2,1);ptr(row+4,176+i);body[176+i]=1;ptr(row+8,table);
    for(let j=0;j<count;j++)ptr(table+j*4,320);
    if(kirby&&i<2){relocs.delete(table);d.setUint32(table,0xffffffff);externs.set('PlyKirby5K_'+(i?'R':'L')+'HaveN_ACTION_Hand'+(i?'R':'L')+'Middle_animjoint',table);}
  });
  ptr(328,352);d.setFloat32(356,8);ptr(360,368);d.setUint32(372,6);body[380]=5;ptr(384,400);body[400]=1;d.setFloat32(401,1.25,true);body[405]=3;
  ptr(520,576);for(const at of [512,576]){d.setUint32(at+4,1);for(let i=0;i<3;i++)d.setFloat32(at+32+i*4,1);d.setFloat32(at+44,-2.5);}
  mutate({body,d,relocs,externs});
  const strings=['ftData'+(kirby?'Kirby':'Mario'),...externs.keys()].map(s=>new TextEncoder().encode(s+'\0'));
  const symbols=32+body.length+relocs.size*4,text=symbols+(1+externs.size)*8,bytes=new Uint8Array(text+strings.reduce((n,b)=>n+b.length,0)),out=new DataView(bytes.buffer);
  [bytes.length,body.length,relocs.size,1,externs.size].forEach((n,i)=>out.setUint32(i*4,n));bytes.set(body,32);[...relocs].forEach((at,i)=>out.setUint32(32+body.length+i*4,at));
  let cursor=0;[0,...externs.values()].forEach((at,i)=>{out.setUint32(symbols+i*8,at);out.setUint32(symbols+i*8+4,cursor);bytes.set(strings[i],text+cursor);cursor+=strings[i].length;});return bytes;
}
test('secondary animation import retains shared variants, byte streams and typed shield poses',()=>{
  const bytes=fixture(),before=bytes.slice(),r=convertSecondaryAnimations(bytes,'PlMr.dat',4),d=new DataView(r.image.buffer,32);
  assert.deepEqual(bytes,before);assert.deepEqual(r.counts,[4,4,3]);assert.equal(r.channels[0].variants[0].root,r.channels[0].variants[1].root);
  assert.equal(d.getUint16(128,true),1);assert.equal(d.getUint16(130,true),1);assert.equal(d.getUint32(192,true),320);assert.equal(d.getFloat32(356,true),8);
  assert.deepEqual(r.image.subarray(432,438),bytes.subarray(432,438));assert.equal(r.shieldNodes.length,2);assert.equal(d.getFloat32(620,true),-2.5);
  assert.equal(new DataView(r.image.buffer).getUint32(12,true),2);assert.equal(Object.keys(partAnimationCounts).length,27);
});
test('secondary import applies original NULL resolution only to known Kirby hand externs',()=>{
  const r=convertSecondaryAnimations(fixture(true),'PlKb.dat',4),d=new DataView(r.image.buffer,32);
  assert.equal(r.nullExternals.length,2);assert.equal(r.channels[0].variants[0],null);assert.equal(d.getUint32(192,true),0);assert.equal(new DataView(r.image.buffer).getUint32(16,true),0);
  assert.throws(()=>convertSecondaryAnimations(fixture(true,a=>{a.externs.set('unexpected',a.externs.values().next().value);}), 'PlKb.dat',4));
});
test('secondary import rejects invalid extents, bones, cycles and typed payload overlap',()=>{
  for(const mutate of [
    a=>a.d.setUint32(32,112),a=>a.body[176]=4,a=>a.d.setUint16(128,4),a=>a.d.setUint16(130,300),
    a=>a.d.setFloat32(112,NaN),a=>a.d.setFloat32(596,Infinity),a=>a.d.setUint32(520,512),
    a=>{a.d.setUint32(132,320);},a=>{a.relocs.add(352);a.d.setUint32(352,400);},
    a=>a.relocs.delete(192),a=>{a.d.setUint32(328,320);},
  ])assert.throws(()=>convertSecondaryAnimations(fixture(false,mutate),'PlMr.dat',4));
});
