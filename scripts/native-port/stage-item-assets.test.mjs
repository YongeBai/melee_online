import test from 'node:test';
import assert from 'node:assert/strict';
import {convertStoryItem} from '../../engines/browser-native/stage-item-assets.mjs';
function fixture(change=()=>{}) {
  const body=new Uint8Array(1600),d=new DataView(body.buffer),relocations=new Set(),ptr=(at,to)=>{relocations.add(at);d.setUint32(at,to);};
  ptr(0,16);d.setUint32(16,210);ptr(20,32);
  ptr(32,64);ptr(36,200);ptr(40,256);ptr(44,320);ptr(48,368);
  d.setFloat32(64+96,1);body[64]=0xa5;
  ptr(200,232);for(let i=1;i<7;i++)d.setFloat32(200+i*4,i*.25);
  d.setUint32(232,15);for(let i=1;i<4;i++)d.setFloat32(232+i*4,.5);d.setUint32(248,300);
  d.setUint32(256,1);ptr(260,272);d.setUint32(272,1);d.setFloat32(300,4);
  ptr(368,400);d.setUint32(372,2);ptr(408,464);for(const root of [400,464])for(let i=0;i<3;i++)d.setFloat32(root+32+i*4,1);
  for(const state of [320,352]){ptr(state,560);ptr(state+4,680);ptr(state+12,800);}
  ptr(560,580);ptr(588,624);d.setFloat32(628,30);ptr(680,692);d.setUint32(800,15<<26);d.setUint32(804,0);
  change({body,d,ptr,relocations});const name=new TextEncoder().encode('itemdata\0'),start=32+body.length+relocations.size*4,image=new Uint8Array(start+8+name.length),v=new DataView(image.buffer);
  [image.length,body.length,relocations.size,1,0].forEach((n,i)=>v.setUint32(i*4,n));image.set(body,32);[...relocations].forEach((p,i)=>v.setUint32(32+body.length+i*4,p));image.set(name,start+8);return image;
}
test('Story item imports original model, hurtbox, animation, numeric attributes and shared scripts',()=>{
  const source=fixture(),copy=source.slice(),r=convertStoryItem(source),v=new DataView(r.image.buffer,32);
  assert.deepEqual(source,copy);assert.equal(r.kind,210);assert.equal(r.stateCount,3);assert.equal(r.model.boneCount,2);assert.equal(r.model.hurtboxes[0].bone,1);
  assert.equal(v.getUint32(200,true),232);assert.equal(v.getFloat32(204,true),.25);assert.equal(v.getUint32(248,true),300);assert.equal(v.getFloat32(628,true),30);assert.equal(v.getUint32(800,true),15<<26);assert.equal(r.image[32+64],0xa5);
});
test('Story item rejects unknown kinds, unsafe pointer graphs, morphs and overlapping descriptors',()=>{
  for(const change of [a=>a.d.setUint32(16,211),a=>a.d.setUint32(4,1),a=>a.relocations.delete(36),a=>a.ptr(40,64),a=>a.ptr(328,560),a=>a.ptr(560,560),a=>a.d.setFloat32(204,NaN),a=>a.d.setUint32(800,63<<26)])assert.throws(()=>convertStoryItem(fixture(change)),undefined,String(change));
});
