import test from 'node:test';
import assert from 'node:assert/strict';
import {convertFighterArticles,itemCommandWords,fighterArticleProfiles} from '../../engines/browser-native/article-assets.mjs';
import {readMotionScripts} from '../../engines/browser-native/motion-assets.mjs';

function fixture(code='Fx',mutate=()=>{}) {
  const body=new Uint8Array(4096),d=new DataView(body.buffer),relocs=new Set();
  const ptr=(at,to)=>{relocs.add(at);d.setUint32(at,to);};
  ptr(72,128);const slots=Object.keys(fighterArticleProfiles[code].articles).map(Number);
  const states=[800,900,1100],scripts=[1800,1860,1892];
  for(const [i,slot] of slots.entries()) {
    const a=160+i*24;ptr(128+slot*4,a);ptr(a,256);ptr(a+4,512+i*40);ptr(a+12,states[i]);ptr(a+16,392);
    for(let j=0;j<fighterArticleProfiles[code].articles[slot][0];j++)ptr(states[i]+j*16+12,scripts[i]);
  }
  d.setFloat32(260,1.25);d.setInt32(264,-1);d.setFloat32(352,1);body[256]=0xa5;
  ptr(392,416);d.setUint32(396,1);for(let i=0;i<3;i++)d.setFloat32(448+i*4,1);
  d.setFloat32(512,35);d.setFloat32(516,3);d.setFloat32(552,1.5);d.setFloat32(592,5);d.setFloat32(596,2);
  // A relocated call and six-word hitbox command; continuations are distinct.
  d.setUint32(1800,5<<26);ptr(1804,1820);d.setUint32(1808,0);
  d.setUint32(1820,11<<26);d.setUint32(1824,0x12345678);d.setUint32(1844,6<<26);
  d.setUint32(1860,(16<<26)|(10<<18));d.setUint32(1872,0);
  d.setUint32(1892,15<<26);d.setUint32(1896,0);
  // Deliberately untyped extra data must not become a public Article.
  if(code==='Fx'){ptr(144,3000);body[3000]=0xe3;}
  mutate({body,d,relocs,ptr,states,scripts});
  const text=new TextEncoder().encode('ftData'+({Mt:'Mewtwo',Ys:'Yoshi',Kp:'Koopa',Fx:'Fox',Fc:'Falco',Mr:'Mario',Lg:'Luigi',Dr:'Drmario',Pk:'Pikachu',Pc:'Pichu'})[code]+'\0'),pub=32+body.length+relocs.size*4,bytes=new Uint8Array(pub+8+text.length),v=new DataView(bytes.buffer);
  [bytes.length,body.length,relocs.size,1,0].forEach((n,i)=>v.setUint32(i*4,n));bytes.set(body,32);[...relocs].forEach((p,i)=>v.setUint32(32+body.length+i*4,p));bytes.set(text,pub+8);return bytes;
}
test('Fox/Falco Articles preserve script branches, special floats and model graphs without exporting extra fighter data',()=>{
  for(const code of ['Fx','Fc']) {
    const input=fixture(code),before=input.slice(),r=convertFighterArticles(input,'Pl'+code+'.dat'),v=new DataView(r.image.buffer,32);
    assert.deepEqual(input,before);assert.deepEqual(r.rows.map(r=>r.stateCount),[2,9,3]);
    assert.equal(v.getFloat32(512,true),35);assert.equal(v.getFloat32(552,true),1.5);
    assert.equal(v.getUint32(1824,true),0x12345678);assert.equal(v.getUint32(1804,true),1820);
    assert.equal(r.pointerSlots.has(1804),true);assert.equal(r.pointerSlots.has(144),false);assert.equal(r.image[3032],code==='Fx'?0xe3:0);
    assert.deepEqual(r.rows[0].script.commands.get(1820),{offset:1820,opcode:11,words:6,target:null});
    const header=new DataView(r.image.buffer);assert.equal(header.getUint32(12,true),3);
  }
});
test('Article import rejects malformed animated states, malformed scripts and descriptor overlap',()=>{
  for(const mutate of [
    a=>{a.ptr(800,2200);a.ptr(2200,2200);},a=>a.d.setFloat32(512,NaN),a=>a.relocs.delete(164),
    a=>a.ptr(164,256),a=>a.ptr(812,256),a=>a.ptr(1804,1804),a=>a.d.setUint32(1820,63<<26),
    a=>a.ptr(176,4092),a=>a.ptr(172,4088),
  ])assert.throws(()=>convertFighterArticles(fixture('Fx',mutate),'PlFx.dat'),undefined,String(mutate));
  assert.throws(()=>convertFighterArticles(fixture(),'PlKb.dat'),/pending/);
});
test('item sound command lengths follow their secondary dispatch, including unknown no-op cases',()=>{
  for(const sub of [0,1,2,10,11,3,255]) {
    const words=[0,1,2,10,11].includes(sub)?3:2,bytes=new Uint8Array((words+1)*4),data=new DataView(bytes.buffer);
    data.setUint32(0,(16<<26)|(sub<<18));const r=readMotionScripts({data,relocations:new Set()},[0],itemCommandWords);
    assert.equal(r.commands.get(0).words,words);assert.equal(r.commands.get(words*4).opcode,0);
  }
});

test('Mario-family Article profiles convert shared joint/material animations and preserve null states',()=>{
  for(const code of ['Mr','Lg','Dr']){
    const input=fixture(code,({ptr,d,states})=>{
      // A valid two-node joint animation and material hierarchy, reused by
      // multiple serialized states. Numeric payloads must change endianness.
      ptr(states[0],2200);ptr(2200,2220);d.setUint32(2216,0x12345678);
      ptr(states[0]+4,2260);ptr(2260,2280);
      if(code==='Dr'){ptr(states[0]+16,2200);ptr(states[0]+20,2260);}
    }),before=input.slice(),r=convertFighterArticles(input,'Pl'+code+'.dat'),d=new DataView(r.image.buffer,32);
    assert.deepEqual(input,before);assert.deepEqual(r.rows.map(x=>[x.slot,x.stateCount,x.specialWords]),Object.entries(fighterArticleProfiles[code].articles).map(([slot,[states,words]])=>[Number(slot),states,words]));
    assert.equal(d.getUint32(2200,true),2220);assert.equal(d.getUint32(2216,true),0x12345678);assert.equal(d.getUint32(2260,true),2280);
    assert.equal(r.rows[0].animations[0].joint,2200);assert.equal(r.rows[0].animations[0].material,2260);
    if(code==='Dr')assert.equal(r.rows[0].animations[5].joint,null);
  }
});
test('Article animation import rejects morph tracks and packed/type conflicts',()=>{
  assert.throws(()=>convertFighterArticles(fixture('Mr',a=>{a.ptr(808,2200);a.ptr(2208,2220);a.ptr(2224,2240);}),'PlMr.dat'),/morph/);
  assert.throws(()=>convertFighterArticles(fixture('Mr',a=>a.ptr(800,512)),'PlMr.dat'));
});

test('Pikachu/Pichu import typed Thunder/Jolt states and retain empty shape topology',()=>{
  for(const code of ['Pk','Pc']){
    const input=fixture(code,({ptr})=>{ptr(1108,2200);ptr(2200,2212);ptr(2220,2224);}),r=convertFighterArticles(input,'Pl'+code+'.dat');
    assert.deepEqual(r.rows.map(x=>[x.slot,x.stateCount,x.specialWords]),[[0,1,3],[1,2,4],[2,1,1]]);
    assert.deepEqual(r.rows[2].animations[0].shapeTree,{joints:2,objects:1});
    assert.equal(new DataView(r.image.buffer,32).getUint32(2200,true),2212);
    assert.throws(()=>convertFighterArticles(fixture(code,({ptr})=>{ptr(1108,2200);ptr(2200,2200);}), 'Pl'+code+'.dat'),/Cyclic/);
  }
});

test('Bowser flame imports its no-model gameplay item, six attributes and original hitbox script',()=>{
  const input=fixture('Kp',({d,relocs})=>{d.setUint32(392,0);relocs.delete(392);d.setUint32(396,0);}),before=input.slice(),r=convertFighterArticles(input,'PlKp.dat');
  assert.deepEqual(input,before);assert.equal(r.rows.length,1);assert.equal(r.rows[0].joint,null);assert.equal(r.rows[0].scene,null);
  assert.equal(r.rows[0].stateCount,1);assert.equal(r.rows[0].specialWords,6);
  assert.equal(r.rows[0].script.commands.get(1820).opcode,11);
  assert.equal(new DataView(r.image.buffer,32).getFloat32(512,true),35);
  assert.throws(()=>convertFighterArticles(fixture('Kp',a=>a.d.setFloat32(532,NaN)),'PlKp.dat'),/Nonfinite/);
});

function linkFixture(code,mutate=()=>{}){
  const body=new Uint8Array(8192),d=new DataView(body.buffer),relocs=new Set(),rows=[];let next=256;
  const alloc=n=>{const at=next;next=(next+n+3)&~3;return at;};
  const ptr=(at,to)=>{d.setUint32(at,to);relocs.add(at);};
  const joint=()=>{const at=alloc(64);for(let i=0;i<3;i++)d.setFloat32(at+32+i*4,1);return at;};
  ptr(72,128);
  for(const [slotText,[stateCount,words]]of Object.entries(fighterArticleProfiles[code].articles)){
    const slot=Number(slotText),article=alloc(24),attributes=alloc(132),special=alloc(112),model=alloc(16),root=joint(),states=stateCount?alloc(stateCount*16):null;
    ptr(128+slot*4,article);ptr(article,attributes);ptr(article+4,special);ptr(article+16,model);ptr(model,root);d.setUint32(model+4,1);
    if(states!==null)ptr(article+12,states);
    for(let i=0;i<words;i++)d.setFloat32(special+i*4,i+0.25);
    const attachments=[];
    if(slot===1)for(const off of [0x44,0x48]){const root=joint();ptr(special+off,root);attachments.push(root);}
    if(slot===2)for(const off of [0x54,0x58,0x5C]){const root=joint();ptr(special+off,root);attachments.push(root);}
    if(slot===3){for(const off of [0x24,0x28]){const root=joint();ptr(special+off,root);attachments.push(root);}d.setFloat32(special+0x2C,7.5);}
    rows.push({slot,article,special,states,attachments});
  }
  const part=joint();ptr(128+24,part);
  mutate({d,ptr,rows,part,alloc,joint});
  const name=new TextEncoder().encode('ftData'+(code==='Lk'?'Link':'Clink')+'\0'),pub=32+body.length+relocs.size*4,bytes=new Uint8Array(pub+8+name.length),h=new DataView(bytes.buffer);
  [bytes.length,body.length,relocs.size,1,0].forEach((n,i)=>h.setUint32(i*4,n));bytes.set(body,32);[...relocs].forEach((p,i)=>h.setUint32(32+body.length+i*4,p));bytes.set(name,pub+8);return {bytes,rows,part};
}
test('Link-family Articles import independent hookshot, arrow and boomerang attachments and the extra fighter part',()=>{
  for(const code of ['Lk','Cl']){
    const {bytes,rows,part}=linkFixture(code),before=bytes.slice(),r=convertFighterArticles(bytes,'Pl'+code+'.dat'),d=new DataView(r.image.buffer,32);
    assert.deepEqual(bytes,before);assert.equal(r.rows.length,code==='Lk'?5:6);assert.equal(r.attachments.length,8);
    assert.deepEqual(r.extraRows,[{slot:6,source:part,joint:part}]);
    assert.equal(r.rows[2].stateCount,0);assert.equal(r.rows[2].states,null);
    for(const row of rows){assert.equal(d.getFloat32(row.special,true),.25);for(const root of row.attachments)assert.ok(r.attachments.some(a=>a.joint===root));}
    assert.equal(d.getFloat32(rows[3].special+0x2C,true),7.5);
    assert.equal(r.rows[4].stateCount,6);
  }
});
test('Link-family attachment imports reject cycles, scalar overlap and unsupported morph data',()=>{
  for(const mutate of [
    a=>a.ptr(a.rows[1].attachments[0]+8,a.rows[1].attachments[0]),
    a=>a.ptr(a.rows[3].special+0x24,a.rows[0].special),
    a=>a.d.setFloat32(a.rows[3].special+0x2C,NaN),
    a=>{const shape=a.alloc(12),object=a.alloc(8),animation=a.alloc(16);a.ptr(a.rows[1].special+0x54,shape);a.ptr(shape+8,object);a.ptr(object+4,animation);},
  ])assert.throws(()=>convertFighterArticles(linkFixture('Lk',mutate).bytes,'PlLk.dat'));
});

test('Yoshi egg Articles preserve explicitly absent special attributes and animation states',()=>{
  const empty=a=>{a.ptr(140,416);for(const at of [212,220]){a.d.setUint32(at,0);a.relocs.delete(at);}};
  const input=fixture('Ys',empty),before=input.slice(),r=convertFighterArticles(input,'PlYs.dat');
  assert.deepEqual(input,before);assert.deepEqual(r.rows.map(r=>[r.stateCount,r.specialWords]),[[2,2],[1,2],[0,0]]);
  assert.equal(r.rows[2].special,null);assert.equal(r.rows[2].states,null);
  assert.throws(()=>convertFighterArticles(fixture('Ys',a=>{empty(a);a.ptr(212,592);}), 'PlYs.dat'),/Missing complete/);
  assert.throws(()=>convertFighterArticles(fixture('Ys',a=>{empty(a);a.d.setUint32(164,0);a.relocs.delete(164);}), 'PlYs.dat'),/Missing complete/);
});

test('Mewtwo imports all ten shared Shadow Ball states and preserves its signed counter',()=>{
  const input=fixture('Mt',a=>a.d.setInt32(552+0x20,-1)),before=input.slice(),r=convertFighterArticles(input,'PlMt.dat'),d=new DataView(r.image.buffer,32);
  assert.deepEqual(input,before);assert.deepEqual(r.rows.map(x=>[x.stateCount,x.specialWords]),[[1,2],[10,16]]);
  assert.equal(d.getInt32(552+0x20,true),-1);
  assert.throws(()=>convertFighterArticles(fixture('Mt',a=>a.d.setFloat32(552,NaN)),'PlMt.dat'),/Nonfinite/);
});

function gamewatchFixture(mutate=()=>{}){
  const body=new Uint8Array(8192),d=new DataView(body.buffer),relocs=new Set(),rows=[];let next=256;
  const alloc=n=>{const at=next;next=(next+n+3)&~3;return at;};
  const ptr=(at,to)=>{d.setUint32(at,to);relocs.add(at);};
  ptr(72,128);
  for(const [slotText,[stateCount,words]]of Object.entries(fighterArticleProfiles.Gw.articles)){
    const slot=Number(slotText),article=alloc(24),attributes=alloc(132),special=alloc(words*4),model=alloc(16),joint=alloc(64),states=alloc(stateCount*16),outline=alloc(16),indices=alloc(4);
    ptr(128+slot*4,article);ptr(article,attributes);ptr(article+4,special);ptr(article+12,states);ptr(article+16,model);ptr(model,joint);d.setUint32(model+4,1);
    for(let i=0;i<3;i++)d.setFloat32(joint+32+i*4,1);
    ptr(special,outline);d.setUint16(outline,1);d.setUint16(outline+2,0xa1b2);ptr(outline+4,indices);body[indices]=0;
    for(let i=1;i<words;i++)d.setFloat32(special+i*4,i+.25);
    rows.push({slot,special,outline,indices,states});
  }
  const parts=alloc(4),lookup=alloc(8),variants=alloc(8),indices=alloc(4);
  ptr(8,parts);d.setUint32(parts,1);ptr(168,lookup);d.setUint32(lookup,1);ptr(lookup+4,variants);d.setUint32(variants,3);ptr(variants+4,indices);body.set([2,7,11],indices);
  mutate({body,d,ptr,rows,parts,lookup,variants,indices,relocs});
  const name=new TextEncoder().encode('ftDataGamewatch\0'),pub=32+body.length+relocs.size*4,bytes=new Uint8Array(pub+8+name.length),h=new DataView(bytes.buffer);
  [bytes.length,body.length,relocs.size,1,0].forEach((n,i)=>h.setUint32(i*4,n));bytes.set(body,32);[...relocs].forEach((p,i)=>h.setUint32(32+body.length+i*4,p));bytes.set(name,pub+8);return {bytes,rows,lookup,variants,indices};
}
test('Game & Watch imports ten Articles, typed outline counts and packed display visibility indices',()=>{
  const {bytes,rows,lookup,indices}=gamewatchFixture(),before=bytes.slice(),r=convertFighterArticles(bytes,'PlGw.dat'),d=new DataView(r.image.buffer,32);
  assert.deepEqual(bytes,before);assert.equal(r.rows.length,10);assert.deepEqual(r.extraRows,[{slot:10,source:lookup,models:1}]);
  for(const row of rows){assert.equal(d.getUint32(row.special,true),row.outline);assert.equal(d.getUint16(row.outline,true),1);assert.equal(d.getUint16(row.outline+2),0xa1b2);}
  assert.deepEqual([...r.image.slice(32+indices,35+indices)],[2,7,11]);
  assert.equal(d.getFloat32(rows[8].special+28*4,true),28.25);
});
test('Game & Watch rejects malformed outline graphs, invalid indices and Chef floats',()=>{
  for(const mutate of [
    a=>a.d.setUint16(a.rows[0].outline,2),a=>a.body[a.rows[0].indices]=1,
    a=>a.d.setUint32(a.parts,12),a=>a.d.setUint32(a.lookup,129),
    a=>a.d.setUint32(a.variants,125),a=>a.body[a.indices]=124,
    a=>a.ptr(a.variants+4,a.rows[0].special),a=>a.d.setFloat32(a.rows[8].special+112,NaN),
    a=>a.relocs.delete(a.rows[0].special),
  ])assert.throws(()=>convertFighterArticles(gamewatchFixture(mutate).bytes,'PlGw.dat'));
});

function nessFixture(mutate=()=>{}){
  const body=new Uint8Array(8192),d=new DataView(body.buffer),relocs=new Set(),rows=[];let next=256;
  const alloc=n=>{const at=next;next=(next+n+3)&~3;return at;};
  const ptr=(at,to)=>{d.setUint32(at,to);relocs.add(at);};
  const joint=()=>{const at=alloc(64);for(let i=0;i<3;i++)d.setFloat32(at+32+i*4,1);return at;};
  ptr(72,128);
  for(const [slotText,[stateCount,words]]of Object.entries(fighterArticleProfiles.Ns.articles)){
    const slot=Number(slotText),article=alloc(24),attributes=alloc(132),special=alloc(slot===10?96:words*4),model=alloc(16),states=stateCount?alloc(stateCount*16):null;
    ptr(128+slot*4,article);ptr(article,attributes);ptr(article+4,special);ptr(article+16,model);if(states!==null)ptr(article+12,states);
    for(let i=0;i<words;i++)d.setFloat32(special+i*4,i+.25);
    const attachments=[];
    if(slot===9)d.setInt32(special,-1);
    if(slot===10){for(const i of [0,1,2,16,17,18,19,23])d.setInt32(special+i*4,-1);for(const off of [80,84]){const root=joint();ptr(special+off,root);attachments.push(root);}const mat=alloc(12);ptr(special+88,mat);}
    rows.push({slot,special,states,attachments});
  }
  mutate({body,d,ptr,rows,alloc,relocs});
  const name=new TextEncoder().encode('ftDataNess\0'),pub=32+body.length+relocs.size*4,bytes=new Uint8Array(pub+8+name.length),h=new DataView(bytes.buffer);
  [bytes.length,body.length,relocs.size,1,0].forEach((n,i)=>h.setUint32(i*4,n));bytes.set(body,32);[...relocs].forEach((p,i)=>h.setUint32(32+body.length+i*4,p));bytes.set(name,pub+8);return {bytes,rows};
}
test('Ness imports eleven Articles and yo-yo model/material attachments with signed attribute words',()=>{
  const {bytes,rows}=nessFixture(),before=bytes.slice(),r=convertFighterArticles(bytes,'PlNs.dat'),d=new DataView(r.image.buffer,32);
  assert.deepEqual(bytes,before);assert.equal(r.rows.length,11);assert.equal(r.rows[10].states,null);assert.equal(r.attachments.length,2);
  for(const i of [0,1,2,16,17,18,19,23])assert.equal(d.getInt32(rows[10].special+i*4,true),-1);
  assert.equal(d.getFloat32(rows[10].special+12,true),3.25);assert.equal(d.getInt32(rows[9].special,true),-1);
  for(const root of rows[10].attachments)assert.ok(r.attachments.some(a=>a.joint===root));
});
test('Ness rejects absent yo-yo attachments, cyclic geometry and nonfinite launch parameters',()=>{
  for(const mutate of [
    a=>{const p=a.rows[10].special+80;a.d.setUint32(p,0);a.relocs.delete(p);},
    a=>a.ptr(a.rows[10].attachments[0]+8,a.rows[10].attachments[0]),
    a=>a.d.setFloat32(a.rows[3].special+16,NaN),a=>a.ptr(a.rows[10].special+88,a.rows[10].special),
  ])assert.throws(()=>convertFighterArticles(nessFixture(mutate).bytes,'PlNs.dat'));
});

function formFixture(code,mutate=()=>{}){
  const body=new Uint8Array(8192),d=new DataView(body.buffer),relocs=new Set();
  const ptr=(at,to)=>{d.setUint32(at,to);relocs.add(at);};
  const joint=at=>{for(let i=0;i<3;i++)d.setFloat32(at+32+i*4,1);};
  ptr(72,128);ptr(700,800);d.setUint32(704,1);joint(800);
  for(const [slotText,[states,words]]of Object.entries(fighterArticleProfiles[code].articles)){
    const slot=Number(slotText),article=256+slot*32,special=1024+slot*128,state=2048+slot*512;
    ptr(128+slot*4,article);ptr(article,512);ptr(article+16,700);
    if(words){ptr(article+4,special);for(let i=0;i<words;i++)d.setFloat32(special+i*4,1.25);}
    if(states){ptr(article+12,state);for(let i=0;i<states;i++)ptr(state+i*16+12,6000);}
  }
  if(code==='Pp'){joint(4000);ptr(1280+36,4000);ptr(1280+40,4000);}
  if(code==='Sk'){
    d.setInt32(1408,20);for(const [off,at]of [[100,4000],[104,4100]]){ptr(1408+off,at);joint(at);}
    for(const [slot,at]of [[4,4200],[5,4400]]){ptr(128+slot*4,at);joint(at);ptr(at+8,at+64);joint(at+64);d.setFloat32(at+64+20,.375);}
  }
  mutate({d,relocs,ptr});
  const name=new TextEncoder().encode('ftData'+({Sk:'Seak',Zd:'Zelda',Pe:'Peach',Pp:'Popo',Nn:'Nana'}[code])+'\0'),pub=32+body.length+relocs.size*4,bytes=new Uint8Array(pub+8+name.length),v=new DataView(bytes.buffer);
  [bytes.length,body.length,relocs.size,1,0].forEach((n,i)=>v.setUint32(i*4,n));bytes.set(body,32);[...relocs].forEach((r,i)=>v.setUint32(32+body.length+i*4,r));bytes.set(name,pub+8);return bytes;
}
test('Sheik imports both chain reference skeletons independently of the four Articles',()=>{
  const input=formFixture('Sk'),before=input.slice(),r=convertFighterArticles(input,'PlSk.dat'),v=new DataView(r.image.buffer,32);
  assert.deepEqual(input,before);assert.deepEqual(r.rows.map(x=>x.stateCount),[5,1,1,0]);
  assert.deepEqual(r.extraRows.map(x=>[x.slot,x.nodes]),[[4,2],[5,2]]);
  assert.equal(v.getUint32(1408,true),20);assert.equal(r.attachments.length,2);
  for(const root of [4200,4400]){assert.equal(v.getUint32(root+8,true),root+64);assert.equal(v.getFloat32(root+64+20,true),.375);assert(r.pointerSlots.has(root+8));}
  assert.throws(()=>convertFighterArticles(formFixture('Sk',({d,relocs})=>{d.setUint32(148,0);relocs.delete(148);}), 'PlSk.dat'),/Missing Sheik chain pose/);
});
test('Zelda converts guided fire and explosion attributes and original serialized states',()=>{
  const input=formFixture('Zd'),before=input.slice(),r=convertFighterArticles(input,'PlZd.dat'),v=new DataView(r.image.buffer,32);
  assert.deepEqual(input,before);assert.deepEqual(r.rows.map(x=>[x.stateCount,x.specialWords]),[[2,12],[1,5]]);
  assert.equal(v.getFloat32(1068,true),1.25);assert.equal(v.getFloat32(1168,true),1.25);
});

test('Peach preserves integer turnip odds/damage and placeholder words while validating projectile floats',()=>{
  const input=formFixture('Pe',({d})=>{for(let i=1;i<18;i++)d.setInt32(1152+i*4,-i);d.setInt32(1280,-1);d.setInt32(1408,-2);});
  const before=input.slice(),r=convertFighterArticles(input,'PlPe.dat'),v=new DataView(r.image.buffer,32);
  assert.deepEqual(input,before);assert.deepEqual(r.rows.map(x=>[x.stateCount,x.specialWords]),[[2,0],[3,18],[2,1],[2,1],[1,4]]);
  assert.equal(v.getFloat32(1152,true),1.25);for(let i=1;i<18;i++)assert.equal(v.getInt32(1152+i*4,true),-i);
  assert.equal(v.getInt32(1280,true),-1);assert.equal(v.getInt32(1408,true),-2);
  assert.throws(()=>convertFighterArticles(formFixture('Pe',({d})=>d.setFloat32(1536,NaN)),'PlPe.dat'),/Nonfinite/);
});

test('Climbers import shared rope models and preserve numeric integer fields; Nana keeps null external graphs',()=>{
  for(const code of ['Pp','Nn']){
    const input=formFixture(code,({d})=>{for(const at of [1024+44,1024+48,1280,1284,1304,1308,1312])d.setInt32(at,-1);}),before=input.slice(),r=convertFighterArticles(input,'Pl'+code+'.dat'),v=new DataView(r.image.buffer,32);
    assert.deepEqual(input,before);assert.deepEqual(r.rows.map(x=>[x.stateCount,x.specialWords]),[[1,13],[1,5],[0,9]]);
    for(const at of [1024+44,1024+48,1280,1284,1304,1308,1312])assert.equal(v.getInt32(at,true),-1);
    assert.equal(v.getFloat32(1296,true),1.25);assert.equal(r.attachments.length,code==='Pp'?2:0);
  }
  assert.throws(()=>convertFighterArticles(formFixture('Pp',({d,relocs})=>{d.setUint32(1316,0);relocs.delete(1316);}), 'PlPp.dat'),/Missing Popo rope/);
});
