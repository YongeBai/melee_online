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

function joltFixture(code,change=()=>{}){
  const body=new Uint8Array(code==='Pk'?103536:115792),d=new DataView(body.buffer),relocs=new Set(),ptr=(at,to)=>{d.setUint32(at,to);relocs.add(at);};
  ptr(900,2000);d.setUint32(904,1);ptr(908,1000);ptr(912,400);ptr(916,424);ptr(920,800);
  const joints=code==='Pk'?15:13;
  for(let i=0;i<joints;i++){const at=2000+i*64;for(let j=0;j<3;j++)d.setFloat32(at+32+j*4,1);if(i+1<joints)ptr(at+8,at+64);}
  for(const [article,attributes,special,states,model]of [[400,0,132,600,500],[424,200,332,680,516]]){ptr(article,attributes);ptr(article+4,special);ptr(article+12,states);ptr(article+16,model);}
  ptr(516,4096);d.setUint32(520,1);for(let i=0;i<3;i++)d.setFloat32(4096+32+i*4,1);
  ptr(680,5000);ptr(684,5100);ptr(688,5200);
  d.setUint32(800,3);ptr(804,6000);
  for(let i=0;i<3;i++){const at=6000+i*24,param=code==='Pk'&&i===1?7000:7000+i*240;d.setUint32(at,[3,7,11][i]);ptr(at+4,param);d.setUint32(at+8,i===2?(code==='Pk'?4:2):3);for(let j=0;j<3;j++)d.setFloat32(at+12+j*4,[1,1,.04][j]);for(let j=0;j<d.getUint32(at+8)*15;j++)d.setFloat32(param+j*4,-1.25+j/4);}
  const w=code==='Pk'?103488:115744;for(const [at,to]of [[w,5000],[w+8,5100],[w+16,5200],[w+24,4096],[w+28,w],[w+32,w+8],[w+36,w+16],[w+40,w+24]])ptr(at,to);
  change({d,ptr,relocs});const name=new TextEncoder().encode('ftDataKirbyCopy'+(code==='Pk'?'Pikachu':'Pichu')+'\0'),pub=32+body.length+relocs.size*4,bytes=new Uint8Array(pub+8+name.length),out=new DataView(bytes.buffer);
  [bytes.length,body.length,relocs.size,1,0].forEach((n,i)=>out.setUint32(i*4,n));bytes.set(body,32);[...relocs].forEach((p,i)=>out.setUint32(32+body.length+i*4,p));out.setUint32(pub,900);bytes.set(name,pub+8);return bytes;
}
test('Pikachu and Pichu copies retain dynamic hat chains, shared parameters and shape-animation wrappers',()=>{
  for(const code of ['Pk','Pc']){const input=joltFixture(code),before=input.slice(),r=convertKirbyCopy(input,code),d=new DataView(r.image.buffer,32);assert.deepEqual(input,before);assert.deepEqual(r.dynamics.map(r=>[r.bone,r.nodes]),[[3,3],[7,3],[11,code==='Pk'?4:2]]);assert.equal(d.getFloat32(7000,true),-1.25);assert.equal(d.getUint32(920,true),800);assert.equal(r.unreferencedRelocations.length,8);assert.equal(r.articles.rows[0].joint,null);assert.equal(r.articles.rows[1].animations[0].shape,5200);if(code==='Pk')assert.equal(r.dynamics[0].parameters,r.dynamics[1].parameters);
    for(const change of [a=>a.d.setUint32(800,10),a=>a.d.setUint32(6000,14),a=>a.d.setUint32(6008,0),a=>a.ptr(6004,2000),a=>a.d.setFloat32(7000,NaN),a=>a.relocs.add(7000),a=>a.ptr(808,6000),a=>a.ptr(804,800),a=>a.relocs.delete(920),a=>a.ptr((code==='Pk'?103488:115744)+16,2000)])assert.throws(()=>convertKirbyCopy(joltFixture(code,change),code));
  }
});

function bowFixture(code,change=()=>{}){
  const shift=code==='Cl'?160:0,body=new Uint8Array(40320-shift),d=new DataView(body.buffer),relocs=new Set(),ptr=(at,to)=>{d.setUint32(at,to);relocs.add(at);};
  ptr(900,2000);d.setUint32(904,1);ptr(908,1000);ptr(912,400);ptr(916,424);ptr(920,800);
  for(let i=0;i<6;i++){const at=2000+i*64;for(let j=0;j<3;j++)d.setFloat32(at+32+j*4,1);if(i<5)ptr(at+8,at+64);}
  for(const joint of [4096,4304,4400,4608])for(let i=0;i<3;i++)d.setFloat32(joint+32+i*4,1);
  for(const [article,attributes,special,states,model,joint]of [[400,0,132,600,500,4096],[424,224,360,624,524,4608]]){ptr(article,attributes);ptr(article+4,special);ptr(article+12,states);ptr(article+16,model);ptr(model,joint);d.setUint32(model+4,1);}
  ptr(168,4304);ptr(172,4400);d.setFloat32(176,2.75);ptr(516,4304);ptr(520,4400);
  d.setUint32(800,1);ptr(804,6000);d.setUint32(6000,3);ptr(6004,7000);d.setUint32(6008,3);d.setFloat32(7000,-1.25);
  const table=40268-shift,model=40296-shift;
  for(let i=0;i<6;i++){ptr(624+i*16,5000+i*32);ptr(table+i*4,5000+i*32);}
  ptr(model,4608);ptr(model+4,table);ptr(model+16,model);
  for(const [at,joint]of [[16864,4096],[18944,4304],[21024,4400]]){ptr(at-shift,joint);ptr(at-shift+16,at-shift);}
  change({d,ptr,relocs,shift});
  const name=new TextEncoder().encode('ftDataKirbyCopy'+(code==='Lk'?'Link':'Clink')+'\0'),pub=32+body.length+relocs.size*4,bytes=new Uint8Array(pub+8+name.length),out=new DataView(bytes.buffer);
  [bytes.length,body.length,relocs.size,1,0].forEach((n,i)=>out.setUint32(i*4,n));bytes.set(body,32);[...relocs].forEach((p,i)=>out.setUint32(32+body.length+i*4,p));out.setUint32(pub,900);bytes.set(name,pub+8);return bytes;
}
test('Link copies retain bow states, both arrow attachments and their original dynamic hat chain',()=>{
  for(const code of ['Lk','Cl']){
    const input=bowFixture(code),before=input.slice(),r=convertKirbyCopy(input,code),d=new DataView(r.image.buffer,32);
    assert.deepEqual(input,before);assert.deepEqual(r.articles.rows.map(r=>[r.stateCount,r.specialWords]),[[1,9],[6,1]]);
    assert.deepEqual(r.articles.attachments.map(r=>r.joint),[4304,4400]);assert.deepEqual(r.dynamics.map(r=>[r.bone,r.nodes]),[[3,3]]);
    assert.equal(d.getFloat32(176,true),2.75);assert.equal(d.getFloat32(7000,true),-1.25);assert.equal(r.unreferencedRelocations.length,15);
    for(const [at,to]of [[168,4304],[172,4400],[516,4304],[520,4400]]){assert(r.pointerSlots.has(at));assert.equal(d.getUint32(at,true),to);}
    assert.deepEqual(r.articles.rows[1].animations.map(r=>r.joint),[5000,5032,5064,5096,5128,5160]);
  }
});
test('Link copies reject missing or inconsistent attachment roots and malformed charge animation wrappers',()=>{
  for(const code of ['Lk','Cl'])for(const change of [a=>a.relocs.delete(168),a=>a.ptr(516,4400),a=>a.ptr(172,900),a=>a.d.setFloat32(176,NaN),a=>a.ptr(4304+8,4304),a=>a.ptr(40268-a.shift+20,5000),a=>a.ptr(18944-a.shift,4096),a=>a.d.setUint32(6000,4)])assert.throws(()=>convertKirbyCopy(bowFixture(code,change),code));
});

function chargeFixture(change=()=>{}){
  const body=new Uint8Array(52696),d=new DataView(body.buffer),relocs=new Set(),ptr=(at,to)=>{d.setUint32(at,to);relocs.add(at);};
  ptr(640,2000);d.setUint32(644,1);ptr(648,440);ptr(652,616);
  ptr(616,0);ptr(620,132);ptr(628,472);ptr(632,400);ptr(400,4096);d.setUint32(404,1);
  [70,0,1.3,2.7,4,22,.5,2].forEach((n,i)=>d.setFloat32(132+i*4,n));
  for(const joint of [2000,4096])for(let i=0;i<3;i++)d.setFloat32(joint+32+i*4,1);
  for(let i=0;i<9;i++){ptr(472+i*16,5000);d.setUint32(476+i*16,i<8?476+(i+1)*16:0xffffffff);d.setUint32(480+i*16,i<8?480+(i+1)*16:0xffffffff);}
  for(const [at,to]of [[52664,5000],[52672,4096],[52676,52664],[52688,52672]])ptr(at,to);
  const names=['ftDataKirbyCopySamus','ItmKirbySsChargeShot_TopN_matanim_joint','ItmKirbySsChargeShot_TopN_shapeanim_joint'];
  change({d,ptr,relocs,names});
  const text=new TextEncoder().encode(names.join('\0')+'\0'),pub=32+body.length+relocs.size*4,bytes=new Uint8Array(pub+24+text.length),out=new DataView(bytes.buffer);
  [bytes.length,body.length,relocs.size,1,2].forEach((n,i)=>out.setUint32(i*4,n));bytes.set(body,32);[...relocs].forEach((p,i)=>out.setUint32(32+body.length+i*4,p));
  let offset=0;[640,476,480].forEach((at,i)=>{out.setUint32(pub+i*8,at);out.setUint32(pub+i*8+4,offset);offset+=names[i].length+1;});bytes.set(text,pub+24);return bytes;
}
test('Samus copy initializes both original external chains to null across all nine Charge Shot states',()=>{
  const input=chargeFixture(),before=input.slice(),r=convertKirbyCopy(input,'Ss'),d=new DataView(r.image.buffer,32);assert.deepEqual(input,before);assert.equal(new DataView(r.bytes.buffer).getUint32(16),0);
  assert.deepEqual(r.articles.rows.map(a=>[a.stateCount,a.specialWords]),[[9,8]]);assert.equal(r.unreferencedRelocations.length,4);
  for(let i=0;i<9;i++){assert.equal(d.getUint32(476+i*16,true),0);assert.equal(d.getUint32(480+i*16,true),0);assert.equal(r.articles.rows[0].animations[i].joint,5000);assert.equal(r.articles.rows[0].animations[i].material,null);assert.equal(r.articles.rows[0].animations[i].shape,null);}
  assert.equal(d.getFloat32(148,true),4);assert.equal(d.getFloat32(152,true),22);
  for(const change of [a=>a.names[1]='UnexpectedExternal',a=>a.d.setUint32(476,476),a=>a.d.setUint32(480,476),a=>a.d.setUint32(476,52696),a=>a.ptr(52664,2000),a=>a.ptr(476,5000)])assert.throws(()=>convertKirbyCopy(chargeFixture(change),'Ss'));
});

function falcoBodyFixture(change=()=>{}){
  const body=new Uint8Array(28328),d=new DataView(body.buffer),relocs=new Set(),ptr=(at,to)=>{d.setUint32(at,to);relocs.add(at);};
  const root=1000;d.setUint32(root,1);ptr(root+4,1100);d.setUint32(root+8,2);ptr(root+12,1200);d.setUint32(root+16,0x1800);ptr(root+20,4096);ptr(root+24,400);ptr(root+28,424);
  ptr(1200,1248);d.setUint16(1248,3);d.setUint16(1250,1);
  for(const [article,attributes,special,states,model,joint]of [[400,0,132,600,500,2048],[424,200,332,680,516,2304]]){ptr(article,attributes);ptr(article+4,special);ptr(article+12,states);ptr(article+16,model);ptr(model,joint);d.setUint32(model+4,1);}
  for(const joint of [2048,2304,4096])for(let i=0;i<3;i++)d.setFloat32(joint+32+i*4,1);
  for(const [at,to]of [[2216,2048],[2232,2216],[28288,2304],[28304,28288]])ptr(at,to);
  change({d,ptr,relocs,root});const name=new TextEncoder().encode('ftDataKirbyCopyFalco\0'),pub=32+body.length+relocs.size*4,bytes=new Uint8Array(pub+8+name.length),out=new DataView(bytes.buffer);
  [bytes.length,body.length,relocs.size,1,0].forEach((n,i)=>out.setUint32(i*4,n));bytes.set(body,32);[...relocs].forEach((p,i)=>out.setUint32(32+body.length+i*4,p));out.setUint32(pub,root);bytes.set(name,pub+8);return bytes;
}
test('Falco body copy preserves costume visibility, texture indices, insertion mask and both Articles',()=>{
  const input=falcoBodyFixture(),before=input.slice(),r=convertKirbyCopy(input,'Fc'),d=new DataView(r.image.buffer,32);assert.deepEqual(input,before);assert.equal(r.bodyCopy,true);assert.equal(r.joint,4096);assert.equal(r.visibility.rows.length,6);assert.equal(d.getUint32(1016,true),0x1800);assert.deepEqual(r.textureRows,[[3,1],null,null,null,null,null]);assert.equal(d.getUint16(1248,true),3);assert.equal(d.getUint16(1250,true),1);assert.deepEqual(r.articles.rows.map(a=>[a.stateCount,a.specialWords]),[[2,10],[9,10]]);assert.equal(r.unreferencedRelocations.length,4);
  for(const change of [a=>a.d.setUint32(1008,3),a=>a.d.setUint32(1016,0x1000),a=>a.ptr(1012,1000),a=>a.ptr(1200,1016),a=>a.ptr(1200,4128),a=>a.ptr(1200,28326),a=>a.relocs.delete(1012),a=>a.ptr(28288,2048)])assert.throws(()=>convertKirbyCopy(falcoBodyFixture(change),'Fc'),undefined,String(change));
});

function donkeyBodyFixture(change=()=>{}){
  const body=new Uint8Array(384),d=new DataView(body.buffer),relocs=new Set(),ptr=(at,to)=>{d.setUint32(at,to);relocs.add(at);};
  d.setUint32(128,1);ptr(132,0);d.setUint32(136,2);ptr(140,100);ptr(148,256);ptr(100,96);d.setUint16(96,2);
  // Packed model payload can begin immediately after this 24-byte root.
  d.setUint32(152,0xdeadbeef);for(let i=0;i<3;i++)d.setFloat32(256+32+i*4,1);
  change({d,ptr,relocs});const name=new TextEncoder().encode('ftDataKirbyCopyDonkey\0'),pub=32+body.length+relocs.size*4,bytes=new Uint8Array(pub+8+name.length),out=new DataView(bytes.buffer);
  [bytes.length,body.length,relocs.size,1,0].forEach((n,i)=>out.setUint32(i*4,n));bytes.set(body,32);[...relocs].forEach((p,i)=>out.setUint32(32+body.length+i*4,p));out.setUint32(pub,128);bytes.set(name,pub+8);return bytes;
}
test('Donkey body copy retains the zero insertion mask and no Article slots after its 24-byte root',()=>{
  const input=donkeyBodyFixture(),before=input.slice(),r=convertKirbyCopy(input,'Dk');assert.deepEqual(input,before);assert.equal(r.bodyCopy,true);assert.deepEqual(r.textureRows,[[2,0],null,null,null,null,null]);assert.equal(r.articles.rows.length,0);assert.equal(r.joint,256);assert.equal(r.unreferencedRelocations.length,0);assert.equal(new DataView(r.image.buffer,32).getUint32(144,true),0);
  for(const change of [a=>a.d.setUint32(144,0x1800),a=>a.d.setUint32(136,1),a=>a.ptr(140,128),a=>a.ptr(100,136),a=>a.relocs.delete(148),a=>a.ptr(152,256)])assert.throws(()=>convertKirbyCopy(donkeyBodyFixture(change),'Dk'));
});

function swordFixture(code,change=()=>{}){
  const spec=code==='Ms'?{wrapper:65952,symbol:'Mars',bones:[10,4,7]}:{wrapper:87392,symbol:'Emblem',bones:[3,6,9,12]},body=new Uint8Array(spec.wrapper+24),d=new DataView(body.buffer),relocs=new Set(),ptr=(at,to)=>{d.setUint32(at,to);relocs.add(at);};
  ptr(1000,2000);d.setUint32(1004,1);ptr(1008,1100);ptr(1012,4096);ptr(1016,1200);
  for(let i=0;i<14;i++){const at=2000+i*64;for(let j=0;j<3;j++)d.setFloat32(at+32+j*4,1);if(i<13)ptr(at+8,at+64);}
  for(let i=0;i<3;i++)d.setFloat32(4096+32+i*4,1);
  d.setUint32(1200,spec.bones.length);ptr(1204,1220);
  spec.bones.forEach((bone,i)=>{const at=1220+24*i;d.setUint32(at,bone);ptr(at+4,128);d.setUint32(at+8,2);for(let j=0;j<3;j++)d.setFloat32(at+12+j*4,[1,1,.1][j]);});for(let i=0;i<30;i++)d.setFloat32(128+i*4,(i-10)/4);
  ptr(spec.wrapper,4096);ptr(spec.wrapper+16,spec.wrapper);change({d,relocs,ptr,spec});
  const name=new TextEncoder().encode('ftDataKirbyCopy'+spec.symbol+'\0'),pub=32+body.length+relocs.size*4,bytes=new Uint8Array(pub+8+name.length),out=new DataView(bytes.buffer);
  [bytes.length,body.length,relocs.size,1,0].forEach((n,i)=>out.setUint32(i*4,n));bytes.set(body,32);[...relocs].forEach((p,i)=>out.setUint32(32+body.length+i*4,p));out.setUint32(pub,1000);bytes.set(name,pub+8);return bytes;
}
test('Marth and Roy copies import separate sword models and original dynamic hat chains',()=>{
  for(const code of ['Ms','Fe']){const input=swordFixture(code),before=input.slice(),r=convertKirbyCopy(input,code);assert.deepEqual(input,before);assert.equal(r.articles.rows.length,0);assert.equal(r.accessory.joint,4096);assert.equal(r.accessory.scene.model.tree.nodes.length,1);assert.deepEqual(r.dynamics.map(d=>d.nodes),Array(code==='Ms'?3:4).fill(2));assert(r.pointerSlots.has(1012)&&r.pointerSlots.has(1016));assert.equal(r.unreferencedRelocations.length,2);assert.equal(new DataView(r.image.buffer,32).getFloat32(128,true),-2.5);
    for(const change of [a=>a.relocs.delete(1012),a=>a.relocs.delete(1016),a=>a.ptr(1012,1000),a=>a.d.setUint32(1200,10),a=>a.d.setUint32(1220,14),a=>a.ptr(a.spec.wrapper,2000),a=>a.ptr(1500,4096)])assert.throws(()=>convertKirbyCopy(swordFixture(code,change),code));
  }
});

function formCopyFixture(code,change=()=>{}){
  const body=new Uint8Array(code==='Zd'?8192:70488),d=new DataView(body.buffer),relocs=new Set(),ptr=(at,to)=>{d.setUint32(at,to);relocs.add(at);};
  ptr(1000,2000);d.setUint32(1004,1);ptr(1008,1100);ptr(code==='Zd'?1012:1020,1200);
  const bones=code==='Zd'?[9,15,3]:[6,3],nodeCount=code==='Zd'?20:8,chainCount=code==='Zd'?4:2;
  for(let i=0;i<nodeCount;i++){const at=2000+i*64;for(let j=0;j<3;j++)d.setFloat32(at+32+j*4,1);if(i<nodeCount-1)ptr(at+8,at+64);}
  d.setUint32(1200,bones.length);ptr(1204,1400);bones.forEach((bone,i)=>{const at=1400+24*i;d.setUint32(at,bone);ptr(at+4,6000);d.setUint32(at+8,chainCount);for(let j=0;j<3;j++)d.setFloat32(at+12+j*4,[1,1,.1][j]);});for(let i=0;i<chainCount*15;i++)d.setFloat32(6000+i*4,(i-10)/4);
  if(code==='Sk'){ptr(1012,400);ptr(1016,424);for(const [article,attributes,special,states,model,joint]of [[400,0,132,600,500,4096],[424,200,332,700,516,4200]]){ptr(article,attributes);ptr(article+4,special);ptr(article+12,states);ptr(article+16,model);ptr(model,joint);d.setUint32(model+4,1);for(let j=0;j<3;j++)d.setFloat32(joint+32+j*4,1);}for(const [at,to]of [[66016,4096],[66032,66016],[70464,4200],[70480,70464]])ptr(at,to);}
  change({d,relocs,ptr});const name=new TextEncoder().encode('ftDataKirbyCopy'+(code==='Zd'?'Zelda':'Seak')+'\0'),pub=32+body.length+relocs.size*4,bytes=new Uint8Array(pub+8+name.length),out=new DataView(bytes.buffer);[bytes.length,body.length,relocs.size,1,0].forEach((n,i)=>out.setUint32(i*4,n));bytes.set(body,32);[...relocs].forEach((p,i)=>out.setUint32(32+body.length+i*4,p));out.setUint32(pub,1000);bytes.set(name,pub+8);return bytes;
}
test('Zelda copy keeps dynamics in its Article-free root and Sheik retains separate held/thrown needles',()=>{
  for(const code of ['Zd','Sk']){const input=formCopyFixture(code),before=input.slice(),r=convertKirbyCopy(input,code);assert.deepEqual(input,before);assert.deepEqual(r.dynamics.map(d=>d.nodes),code==='Zd'?[4,4,4]:[2,2]);assert.equal(r.scene.model.tree.nodes.length,code==='Zd'?20:8);assert.equal(r.unreferencedRelocations.length,code==='Zd'?0:4);assert.deepEqual(r.articles.rows.map(r=>[r.stateCount,r.specialWords]),code==='Zd'?[]:[[5,3],[1,1]]);assert(r.pointerSlots.has(code==='Zd'?1012:1020));
    for(const change of [a=>a.relocs.delete(code==='Zd'?1012:1020),a=>a.ptr(1204,1000),a=>a.d.setUint32(1408,0),a=>a.ptr(1800,2000),a=>code==='Zd'?a.d.setUint32(1016,1):a.ptr(70480,66016)])assert.throws(()=>convertKirbyCopy(formCopyFixture(code,change),code));
  }
});
