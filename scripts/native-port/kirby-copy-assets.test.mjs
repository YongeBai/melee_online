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
  assert.throws(()=>convertKirbyCopy(fixture(),'Xx'),/pending/);
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

function dualFixture(code,change=()=>{}){
  const body=new Uint8Array(code==='Ns'?82000:35932),d=new DataView(body.buffer),relocs=new Set(),ptr=(at,to)=>{d.setUint32(at,to);relocs.add(at);};
  ptr(1000,1200);d.setUint32(1004,1);ptr(1008,1100);ptr(1012,400);ptr(1016,424);
  for(const joint of [1200,2048,...(code==='Ns'?[2304]:[])])for(let i=0;i<3;i++)d.setFloat32(joint+32+i*4,1);
  for(const [article,attributes,special,states,model]of [[400,0,132,600,500],[424,200,332,680,516]]){ptr(article,attributes);ptr(article+4,special);ptr(article+12,states);if(model!==null)ptr(article+16,model);}
  ptr(500,2048);d.setUint32(504,1);if(code==='Ns'){ptr(516,2304);d.setUint32(520,1);}
  ptr(600,3000);ptr(616,3100);
  if(code==='Ns'){ptr(632,3100);ptr(680,3200);ptr(684,3300);}else{ptr(604,3200);ptr(620,3300);}
  const wraps=code==='Ns'?[[54308,3000],[54312,3100],[54320,2048],[54324,54308],[54336,54320],[81960,3200],[81968,3300],[81976,2304],[81980,81960],[81984,81968],[81992,81976]]:[[35884,3000],[35888,3100],[35896,3200],[35900,3300],[35908,2048],[35912,35884],[35916,35896],[35924,35908]];
  for(const [at,to]of wraps)ptr(at,to);change({d,ptr,relocs});
  const name=new TextEncoder().encode('ftDataKirbyCopy'+(code==='Ns'?'Ness':'Peach')+'\0'),pub=32+body.length+relocs.size*4,bytes=new Uint8Array(pub+8+name.length),out=new DataView(bytes.buffer);
  [bytes.length,body.length,relocs.size,1,0].forEach((n,i)=>out.setUint32(i*4,n));bytes.set(body,32);[...relocs].forEach((p,i)=>out.setUint32(32+body.length+i*4,p));out.setUint32(pub,1000);bytes.set(name,pub+8);return bytes;
}
test('Ness and Peach copies preserve both original Articles and multi-animation exporter tables',()=>{
  for(const code of ['Ns','Pe']){const input=dualFixture(code),before=input.slice(),r=convertKirbyCopy(input,code);assert.deepEqual(input,before);assert.deepEqual(r.articles.rows.map(a=>a.stateCount),code==='Ns'?[3,1]:[2,1]);assert.equal(r.articles.rows[1].joint,code==='Ns'?2304:null);assert.equal(r.unreferencedRelocations.length,code==='Ns'?11:8);assert(r.pointerSlots.has(1016));
    for(const change of [a=>a.ptr(1016,400),a=>a.ptr(code==='Ns'?54312:35888,1200),a=>a.relocs.delete(1016)])assert.throws(()=>convertKirbyCopy(dualFixture(code,change),code));
  }
});

function blasterFixture(change=()=>{}){
  const body=new Uint8Array(75416),d=new DataView(body.buffer),relocs=new Set(),ptr=(at,to)=>{d.setUint32(at,to);relocs.add(at);};
  ptr(1000,1200);d.setUint32(1004,1);ptr(1008,1100);ptr(1012,400);ptr(1016,424);
  for(const joint of [1200,2048,2304])for(let i=0;i<3;i++)d.setFloat32(joint+32+i*4,1);
  for(const [article,attributes,special,states,model,joint]of [[400,0,132,600,500,2048],[424,200,332,680,516,2304]]){ptr(article,attributes);ptr(article+4,special);ptr(article+12,states);ptr(article+16,model);ptr(model,joint);d.setUint32(model+4,1);}
  for(const [at,to]of [[49320,2048],[49336,49320],[75392,2304],[75408,75392]])ptr(at,to);
  change({d,ptr,relocs});
  const name=new TextEncoder().encode('ftDataKirbyCopyFox\0'),pub=32+body.length+relocs.size*4,bytes=new Uint8Array(pub+8+name.length),out=new DataView(bytes.buffer);
  [bytes.length,body.length,relocs.size,1,0].forEach((n,i)=>out.setUint32(i*4,n));bytes.set(body,32);[...relocs].forEach((p,i)=>out.setUint32(32+body.length+i*4,p));out.setUint32(pub,1000);bytes.set(name,pub+8);return bytes;
}
test('Fox copy preserves separate laser and nine-state Blaster Articles with null animations',()=>{
  const input=blasterFixture(),before=input.slice(),r=convertKirbyCopy(input,'Fx');assert.deepEqual(input,before);
  assert.deepEqual(r.articles.rows.map(a=>[a.stateCount,a.specialWords]),[[2,10],[9,10]]);assert(r.articles.rows.every(a=>a.animations.every(s=>s.joint===null&&s.material===null)));assert.equal(r.unreferencedRelocations.length,4);
  for(const change of [a=>a.ptr(75408,49320),a=>a.ptr(49324,600),a=>a.relocs.delete(1016),a=>a.ptr(600,1200)])assert.throws(()=>convertKirbyCopy(blasterFixture(change),'Fx'));
});
