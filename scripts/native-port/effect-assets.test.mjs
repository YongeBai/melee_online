import test from 'node:test';
import assert from 'node:assert/strict';
import {convertCaptainEffects,convertCommonEffects,convertFighterEffects,convertStageParticles} from '../../engines/browser-native/effect-assets.mjs';
import {inspectArchive} from '../../engines/browser-native/archive.mjs';
function fixture(mutate=()=>{}) {
  const body=new Uint8Array(1792),d=new DataView(body.buffer),relocs=new Set(),cmd=128,tex=1296,joint=1616;
  const ptr=(at,to)=>{relocs.add(at);d.setUint32(at,to);};ptr(0,cmd);ptr(4,tex);
  for(let i=0;i<6;i++){d.setFloat32(8+i*20,10+i);ptr(12+i*20,joint);}
  d.setUint16(cmd,0x42);d.setUint16(cmd+2,4);d.setUint32(cmd+4,4000);d.setUint32(cmd+8,17);
  for(let i=0;i<17;i++){const at=cmd+80+i*64;d.setUint32(cmd+12+i*4,at-cmd);d.setUint16(at+2,i%7);d.setUint16(at+6,24);d.setUint32(at+8,0x400003);d.setFloat32(at+12,-1.25);d.setFloat32(at+44,2);body[at+60]=0xff;}
  d.setUint32(tex,7);for(let i=0;i<7;i++){const at=tex+32+i*28;d.setUint32(tex+4+i*4,at-tex);d.setUint32(at,1);d.setUint32(at+12,8);d.setUint32(at+16,8);d.setUint32(at+24,256);}body.fill(0xa5,tex+256,tex+288);
  d.setUint32(joint+4,1);for(let i=0;i<3;i++)d.setFloat32(joint+32+i*4,1);
  mutate({d,body,relocs,cmd,tex,joint});
  const text=new TextEncoder().encode('effCaptainDataTable\0'),pub=32+body.length+relocs.size*4,bytes=new Uint8Array(pub+8+text.length),v=new DataView(bytes.buffer);
  [bytes.length,body.length,relocs.size,1,0].forEach((n,i)=>v.setUint32(i*4,n));bytes.set(body,32);[...relocs].forEach((p,i)=>v.setUint32(32+body.length+i*4,p));bytes.set(text,pub+8);return bytes;
}
test('Captain effects keep relative bank offsets separate from HSD relocations and preserve byte streams',()=>{
  const b=fixture(),before=b.slice(),r=convertCaptainEffects(b),v=new DataView(r.image.buffer,32);
  assert.deepEqual(b,before);assert.equal(r.effects.length,6);assert.equal(r.count,17);assert.equal(r.textures.length,7);
  assert.equal(v.getUint16(128,true),0x42);assert.equal(v.getUint16(130,true),4);assert.equal(v.getUint32(140,true),80);
  assert.equal(v.getFloat32(220,true),-1.25);assert.equal(r.image[32+268],0xff);assert.equal(r.image[32+1552],0xa5);
  assert.equal(r.pointerSlots.has(140),false);assert.equal(r.pointerSlots.has(1324),false);assert.equal(r.pointerSlots.has(0),true);
});
test('effect import rejects malformed banks, relocated relative words, payload overlap and unsupported model graphs',()=>{
  for(const mutate of [
    a=>a.d.setUint16(a.cmd,0x99),a=>a.d.setUint32(a.cmd+8,18),a=>a.d.setUint32(a.cmd+12,1),
    a=>a.d.setFloat32(a.cmd+80+12,NaN),a=>a.relocs.add(a.cmd+12),a=>a.d.setUint32(a.tex+4,4),
    a=>a.d.setUint32(a.tex+32+24,32),a=>a.d.setUint16(a.cmd+80+2,7),a=>{a.relocs.add(24);a.d.setUint32(24,a.joint);},
  ])assert.throws(()=>convertCaptainEffects(fixture(mutate)));
});

function commonFixture(mutate=()=>{}) {
  const body=new Uint8Array(3712),d=new DataView(body.buffer),relocs=new Set(),cmd=1024,tex=3404,joint=3552,shape=3616;
  const ptr=(at,to)=>{relocs.add(at);d.setUint32(at,to);};ptr(0,cmd);ptr(4,tex);
  for(let i=0;i<47;i++)ptr(12+i*20,joint);
  ptr(24,shape);ptr(shape+8,shape+12); // Empty original shape topology.
  d.setUint16(cmd,0x42);d.setUint32(cmd+8,592);d.setUint32(tex,36);
  for(let i=0;i<3;i++)d.setFloat32(joint+32+i*4,1);
  mutate({body,d,relocs,ptr,cmd,tex,joint,shape});
  const name=new TextEncoder().encode('effCommonDataTable\0'),pub=32+body.length+relocs.size*4,bytes=new Uint8Array(pub+8+name.length),v=new DataView(bytes.buffer);
  [bytes.length,body.length,relocs.size,1,0].forEach((n,i)=>v.setUint32(i*4,n));bytes.set(body,32);[...relocs].forEach((p,i)=>v.setUint32(32+body.length+i*4,p));bytes.set(name,pub+8);return bytes;
}
test('common effects import all model entries and retain empty shape topology',()=>{
  const input=commonFixture(),before=input.slice(),result=convertCommonEffects(input);
  assert.equal(result.effects.length,47);assert.equal(result.commands.length,592);assert.equal(result.textures.length,36);
  assert.deepEqual(result.effects[0].shapeTopology,{joints:1,objects:1});assert.deepEqual(input,before);
  assert.equal(result.pointerSlots.has(3624),true);
});
test('common effect shape graphs reject cycles and unsupported morph data',()=>{
  for(const mutate of [a=>a.ptr(a.shape,a.shape),a=>a.ptr(a.shape+16,a.joint),a=>a.d.setUint16(a.cmd+2,4)])
    assert.throws(()=>convertCommonEffects(commonFixture(mutate)));
});
function fighterBankFixture({symbol,bank,count,groups,models},mutate=()=>{}) {
  const body=new Uint8Array(1024),d=new DataView(body.buffer),relocs=new Set(),cmd=192,tex=400,joint=512;
  const ptr=(at,to)=>{relocs.add(at);d.setUint32(at,to);};
  if(count){ptr(0,cmd);ptr(4,tex);d.setUint16(cmd,0x42);d.setUint16(cmd+2,bank);d.setUint32(cmd+4,bank*1000);d.setUint32(cmd+8,count);d.setUint32(tex,groups);}
  for(let i=0;i<models;i++)ptr(12+i*20,joint);
  for(let i=0;i<3;i++)d.setFloat32(joint+32+i*4,1);
  mutate({d,ptr,cmd,tex});
  const name=new TextEncoder().encode(symbol+'\0'),pub=32+body.length+relocs.size*4,bytes=new Uint8Array(pub+8+name.length),v=new DataView(bytes.buffer);
  [bytes.length,body.length,relocs.size,1,0].forEach((n,i)=>v.setUint32(i*4,n));bytes.set(body,32);[...relocs].forEach((p,i)=>v.setUint32(32+body.length+i*4,p));bytes.set(name,pub+8);return bytes;
}
function stageBankFixture(change=()=>{}) {
  const bytes=fighterBankFixture({symbol:'unused',bank:30,count:3,groups:3,models:0},a=>{
    for(let i=0;i<3;i++)a.d.setUint32(a.cmd+12+i*4,48);
    a.d.setUint32(248,0x400003);a.d.setFloat32(252,-1.25);a.d.setUint8(300,0xff);
    a.d.setUint32(a.tex+4,20);a.d.setUint32(420,1);a.d.setUint32(432,8);a.d.setUint32(436,8);a.d.setUint32(444,112);
    change(a);
  });
  const archive=inspectArchive(bytes);
  const names=new TextEncoder().encode('map_ptcl\0map_texg\0'),pub=32+archive.dataSize+archive.relocations.size*4;
  const image=new Uint8Array(pub+16+names.length),view=new DataView(image.buffer);
  [image.length,archive.dataSize,archive.relocations.size,2,0].forEach((n,i)=>view.setUint32(i*4,n));
  image.set(bytes.subarray(32,32+archive.dataSize),32);
  [...archive.relocations].forEach((offset,i)=>view.setUint32(32+archive.dataSize+i*4,offset));
  view.setUint32(pub,192);view.setUint32(pub+8,400);view.setUint32(pub+12,9);image.set(names,pub+16);
  return image;
}
test('stage particle conversion exposes only typed banks and preserves original relative tables and scripts',()=>{
  const bytes=stageBankFixture(),before=bytes.slice(),result=convertStageParticles(bytes,'dreamland'),header=new DataView(result.image.buffer),d=new DataView(result.image.buffer,32);
  assert.deepEqual(bytes,before);assert.equal(result.bank,30);assert.equal(result.count,3);assert.equal(result.effects.length,0);
  assert.equal(header.getUint32(8,true),0);assert.equal(header.getUint32(12,true),2);assert.equal(header.getUint32(16,true),0);
  const symbols=32+header.getUint32(4,true);assert.equal(header.getUint32(symbols,true),192);assert.equal(header.getUint32(symbols+8,true),400);
  assert.equal(new TextDecoder().decode(result.image.subarray(symbols+16)),'native_stage_particles\0native_stage_particle_textures\0');
  assert.equal(d.getUint16(194,true),30);assert.equal(d.getUint32(196,true),30000);assert.equal(d.getUint32(204,true),48);
  assert.equal(d.getFloat32(252,true),-1.25);assert.equal(d.getUint8(300),0xff);assert.equal(d.getUint32(404,true),20);assert.equal(d.getUint32(444,true),112);
  for(const change of [a=>a.d.setUint16(a.cmd+2,31),a=>a.d.setUint32(a.cmd+8,4),a=>a.d.setUint32(a.tex,4),a=>a.d.setUint32(a.cmd+12,1),a=>a.ptr(a.cmd+12,240)])assert.throws(()=>convertStageParticles(stageBankFixture(change),'dreamland'));
  assert.throws(()=>convertStageParticles(bytes,'unknown'));
});
test('fighter effect banks preserve bank identity, model count and model-only null banks',()=>{
  for(const [code,spec] of Object.entries({Lk:{symbol:'effLinkDataTable',bank:6,count:0,groups:0,models:4},Cl:{symbol:'effLinkDataTable',bank:6,count:0,groups:0,models:4},Kp:{symbol:'effKoopaDataTable',bank:12,count:9,groups:1,models:3},Ss:{symbol:'effSamusDataTable',bank:2,count:22,groups:8,models:3},Pk:{symbol:'effPikachuDataTable',bank:7,count:10,groups:3,models:5},Pc:{symbol:'effPikachuDataTable',bank:7,count:10,groups:3,models:5},Mr:{symbol:'effMarioDataTable',bank:1,count:14,groups:6,models:2},Dr:{symbol:'effMarioDataTable',bank:1,count:14,groups:6,models:2},Lg:{symbol:'effLuigiDataTable',bank:18,count:12,groups:6,models:2},Pr:{symbol:'effPurinDataTable',bank:11,count:5,groups:2,models:1},Fx:{symbol:'effFoxDataTable',bank:3,count:11,groups:8,models:6},Fc:{symbol:'effFoxDataTable',bank:3,count:11,groups:8,models:6},Dk:{symbol:'effDonkeyDataTable',bank:8,count:0,groups:0,models:7},Ms:{symbol:'effMarsDataTable',bank:16,count:4,groups:3,models:2},Gn:{symbol:'effGanonDataTable',bank:19,count:17,groups:7,models:6},Fe:{symbol:'effEmblemDataTable',bank:49,count:4,groups:3,models:2}})){
    const input=fighterBankFixture(spec),before=input.slice(),result=convertFighterEffects(input,code);
    assert.equal(result.bank,spec.bank);assert.equal(result.effects.length,spec.models);assert.equal(result.commands.length,spec.count);assert.equal(result.textures.length,spec.groups);assert.deepEqual(input,before);
    if(!spec.count){assert.equal(result.cmd,null);assert.equal(result.tex,null);assert.throws(()=>convertFighterEffects(fighterBankFixture(spec,a=>a.ptr(0,a.cmd)),code));}
    else assert.throws(()=>convertFighterEffects(fighterBankFixture(spec,a=>a.d.setUint16(a.cmd+2,4)),code));
  }
  assert.throws(()=>convertFighterEffects(new Uint8Array(),'Pe'),/pending/);
});
