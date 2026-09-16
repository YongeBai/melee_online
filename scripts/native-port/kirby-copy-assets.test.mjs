import test from 'node:test';
import assert from 'node:assert/strict';
import {convertKirbyCopy} from '../../engines/browser-native/kirby-copy-assets.mjs';

// Synthetic descriptors, with the pinned exporter's unreachable scene wrapper.
function fixture(change=()=>{},code='Mr'){
  const spec={Mr:{size:42876,wrapper:42836,symbol:'Mario'},Lg:{size:48188,wrapper:48148,symbol:'Luigi'},Dr:{size:22752,wrapper:22712,symbol:'Drmario'}}[code],state=code==='Dr'?400:260;
  const body=new Uint8Array(spec.size),d=new DataView(body.buffer),relocs=new Set();
  const ptr=(at,to)=>{d.setUint32(at,to);relocs.add(at);};
  ptr(300,1024);d.setUint32(304,1);ptr(308,228);ptr(312,276);
  ptr(276,0);ptr(280,132);ptr(288,state);ptr(292,244);
  ptr(244,2048);d.setUint32(248,1);d.setFloat32(4,1);d.setFloat32(96,1);
  [2.5,-1,120,.75,3].forEach((n,i)=>d.setFloat32(132+i*4,n));
  for(const root of [1024,2048])for(let i=0;i<3;i++)d.setFloat32(root+32+i*4,1);
  if(code!=='Dr')ptr(state,3000);ptr(state+4,3100);ptr(state+12,3200);
  const w=spec.wrapper,orphans=[[w+8,3100],[w+16,2048],[w+24,w+8],[w+32,w+16]];if(code!=='Dr')orphans.unshift([w,3000],[w+20,w]);
  for(const [at,to]of orphans)ptr(at,to);
  change({body,d,relocs,ptr});
  const name=new TextEncoder().encode('ftDataKirbyCopy'+spec.symbol+'\0'),pub=32+body.length+relocs.size*4,bytes=new Uint8Array(pub+8+name.length),out=new DataView(bytes.buffer);
  [bytes.length,body.length,relocs.size,1,0].forEach((n,i)=>out.setUint32(i*4,n));bytes.set(body,32);[...relocs].forEach((p,i)=>out.setUint32(32+body.length+i*4,p));out.setUint32(pub,300);bytes.set(name,pub+8);return bytes;
}
test('Mario copy imports the original hat, visibility and fireball; only unreachable export wrappers are omitted',()=>{
  const input=fixture(),before=input.slice(),r=convertKirbyCopy(input,'Mr'),d=new DataView(r.image.buffer,32);
  assert.deepEqual(input,before);assert.equal(r.root,300);assert.equal(r.joint,1024);assert.equal(d.getUint32(300,true),1024);assert.equal(d.getUint32(276,true),0);assert(r.pointerSlots.has(276));
  assert.equal(d.getFloat32(136,true),-1);assert.equal(r.articles.rows[0].stateCount,1);assert.equal(r.scene.model.tree.nodes.length,1);assert.equal(r.visibility.models,1);
  assert.deepEqual(r.unreferencedRelocations.toSorted((a,b)=>a-b),[42836,42844,42852,42856,42860,42868]);assert(!r.pointerSlots.has(42868));
});
test('Mario copy rejects malformed roots, changed exporter references, additional reachable data and descriptor overlap',()=>{
  for(const change of [a=>a.relocs.delete(300),a=>a.d.setUint32(316,1),a=>a.ptr(42868,1024),a=>a.ptr(316,42852),a=>a.ptr(280,300),a=>a.ptr(260,42836),a=>a.ptr(4000,1024)])assert.throws(()=>convertKirbyCopy(fixture(change),'Mr'));
  assert.throws(()=>convertKirbyCopy(fixture(),'Fx'),/pending/);
});

test('Luigi and Dr. Mario copies retain their separate Article extents and null animation topology',()=>{
  for(const code of ['Lg','Dr']){const input=fixture(()=>{},code),before=input.slice(),r=convertKirbyCopy(input,code);assert.deepEqual(input,before);assert.equal(r.articles.rows[0].stateCount,code==='Dr'?6:1);assert.equal(r.articles.rows[0].specialWords,code==='Dr'?5:4);assert.equal(r.unreferencedRelocations.length,code==='Dr'?4:6);if(code==='Dr')assert.equal(r.articles.rows[0].animations[0].joint,null);assert.throws(()=>convertKirbyCopy(input,'Mr'),/Invalid Kirby copy archive/);}
});

function punchFixture(code,change=()=>{}){
  const body=new Uint8Array(144),d=new DataView(body.buffer),relocs=new Set([0,8]);
  d.setUint32(0,64);d.setUint32(4,1);d.setUint32(8,32);
  for(let i=0;i<3;i++)d.setFloat32(64+32+i*4,1);
  change({d,relocs});
  const name=new TextEncoder().encode('ftDataKirbyCopy'+({Ca:'Captain',Gn:'Ganon'}[code])+'\0'),pub=32+body.length+relocs.size*4,bytes=new Uint8Array(pub+8+name.length),out=new DataView(bytes.buffer);
  [bytes.length,body.length,relocs.size,1,0].forEach((n,i)=>out.setUint32(i*4,n));bytes.set(body,32);[...relocs].forEach((p,i)=>out.setUint32(32+body.length+i*4,p));bytes.set(name,pub+8);return bytes;
}
test('Falcon and Ganondorf copies import hats without inventing projectile Articles or omitted pointers',()=>{
  for(const code of ['Ca','Gn']){const input=punchFixture(code),before=input.slice(),r=convertKirbyCopy(input,code);assert.deepEqual(input,before);assert.equal(r.articles.rows.length,0);assert.equal(r.scene.model.tree.nodes.length,1);assert.equal(r.unreferencedRelocations.length,0);assert.deepEqual([...r.pointerSlots].sort((a,b)=>a-b),[0,8]);
    for(const change of [a=>a.d.setUint32(12,1),a=>a.relocs.add(12),a=>a.relocs.add(16),a=>a.relocs.add(140)])assert.throws(()=>convertKirbyCopy(punchFixture(code,change),code));
  }
});
