import test from 'node:test';
import assert from 'node:assert/strict';
import {convertCaptainEffects,convertCommonEffects,convertFighterEffects,convertStageParticles,convertKirbyCopyEffects} from '../../engines/browser-native/effect-assets.mjs';
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
  for(const [code,spec] of Object.entries({Kb:{symbol:'effKirbyDataTable',bank:5,count:19,groups:6,models:9},Pp:{symbol:'effIceclimberDataTable',bank:14,count:17,groups:5,models:1},Nn:{symbol:'effIceclimberDataTable',bank:14,count:17,groups:5,models:1},Pe:{symbol:'effPeachDataTable',bank:15,count:0,groups:0,models:1},Ns:{symbol:'effNessDataTable',bank:10,count:0,groups:0,models:3},Mt:{symbol:'effMewtwoDataTable',bank:13,count:9,groups:4,models:4},Ys:{symbol:'effYoshiDataTable',bank:9,count:4,groups:3,models:1},Lk:{symbol:'effLinkDataTable',bank:6,count:0,groups:0,models:4},Cl:{symbol:'effLinkDataTable',bank:6,count:0,groups:0,models:4},Kp:{symbol:'effKoopaDataTable',bank:12,count:9,groups:1,models:3},Ss:{symbol:'effSamusDataTable',bank:2,count:22,groups:8,models:3},Pk:{symbol:'effPikachuDataTable',bank:7,count:10,groups:3,models:5},Pc:{symbol:'effPikachuDataTable',bank:7,count:10,groups:3,models:5},Mr:{symbol:'effMarioDataTable',bank:1,count:14,groups:6,models:2},Dr:{symbol:'effMarioDataTable',bank:1,count:14,groups:6,models:2},Lg:{symbol:'effLuigiDataTable',bank:18,count:12,groups:6,models:2},Pr:{symbol:'effPurinDataTable',bank:11,count:5,groups:2,models:1},Fx:{symbol:'effFoxDataTable',bank:3,count:11,groups:8,models:6},Fc:{symbol:'effFoxDataTable',bank:3,count:11,groups:8,models:6},Dk:{symbol:'effDonkeyDataTable',bank:8,count:0,groups:0,models:7},Ms:{symbol:'effMarsDataTable',bank:16,count:4,groups:3,models:2},Gn:{symbol:'effGanonDataTable',bank:19,count:17,groups:7,models:6},Fe:{symbol:'effEmblemDataTable',bank:49,count:4,groups:3,models:2}})){
    const input=fighterBankFixture(spec),before=input.slice(),result=convertFighterEffects(input,code);
    assert.equal(result.bank,spec.bank);assert.equal(result.effects.length,spec.models);assert.equal(result.commands.length,spec.count);assert.equal(result.textures.length,spec.groups);assert.deepEqual(input,before);
    if(!spec.count){assert.equal(result.cmd,null);assert.equal(result.tex,null);assert.throws(()=>convertFighterEffects(fighterBankFixture(spec,a=>a.ptr(0,a.cmd)),code));}
    else assert.throws(()=>convertFighterEffects(fighterBankFixture(spec,a=>a.d.setUint16(a.cmd+2,4)),code));
  }
  assert.throws(()=>convertFighterEffects(new Uint8Array(),'Xx'),/pending/);
});

test('Kirby Mario effect bank uses its own original bank and models',()=>{
  const spec={symbol:'effKirbyMarioDataTable',bank:32,count:7,groups:3,models:1},input=fighterBankFixture(spec),r=convertKirbyCopyEffects(input,'Mr');
  assert.equal(r.bank,32);assert.equal(r.first,32000);assert.equal(r.effects.length,1);assert.equal(r.commands.length,7);
  assert.throws(()=>convertKirbyCopyEffects(fighterBankFixture(spec,a=>a.d.setUint16(a.cmd+2,1)),'Mr'));
  assert.throws(()=>convertKirbyCopyEffects(input,'Xx'),/pending/);
});

test('Kirby Luigi uses bank 37 while Dr. Mario shares the original Mario copy bank',()=>{
  for(const [code,symbol,bank]of [['Lg','Luigi',37],['Dr','Mario',32]]){
    const spec={symbol:'effKirby'+symbol+'DataTable',bank,count:7,groups:3,models:1},input=fighterBankFixture(spec),before=input.slice(),r=convertKirbyCopyEffects(input,code);
    assert.deepEqual(input,before);assert.equal(r.bank,bank);assert.equal(r.first,bank*1000);assert.equal(r.effects.length,1);assert.throws(()=>convertKirbyCopyEffects(fighterBankFixture(spec,a=>a.d.setUint16(a.cmd+2,bank+1)),code));
  }
});

test('Kirby Falcon and Ganondorf effects retain their separate two-model punch banks',()=>{
  for(const [code,symbol,bank]of [['Ca','Captain',38],['Gn','Ganon',47]]){const spec={symbol:'effKirby'+symbol+'DataTable',bank,count:4,groups:3,models:2},input=fighterBankFixture(spec),before=input.slice(),r=convertKirbyCopyEffects(input,code);assert.deepEqual(input,before);assert.equal(r.bank,bank);assert.equal(r.effects.length,2);assert.equal(r.commands.length,4);assert.throws(()=>convertKirbyCopyEffects(fighterBankFixture(spec,a=>a.d.setUint16(a.cmd+2,bank+1)),code));}
});

test('Kirby Fox retains its model-only muzzle effect and no particle banks',()=>{
  const spec={symbol:'effKirbyFoxDataTable',bank:33,count:0,groups:0,models:1},input=fighterBankFixture(spec),before=input.slice(),r=convertKirbyCopyEffects(input,'Fx');
  assert.deepEqual(input,before);assert.equal(r.bank,33);assert.equal(r.effects.length,1);assert.equal(r.cmd,null);assert.equal(r.tex,null);
  for(const slot of [0,4])assert.throws(()=>convertKirbyCopyEffects(fighterBankFixture(spec,a=>a.ptr(slot,a.cmd)),'Fx'));
});

test('Pikachu and Pichu copies share the original particle-only bank 36',()=>{
  const spec={symbol:'effKirbyPikachuDataTable',bank:36,count:4,groups:2,models:0};for(const code of ['Pk','Pc']){const input=fighterBankFixture(spec),before=input.slice(),r=convertKirbyCopyEffects(input,code);assert.deepEqual(input,before);assert.equal(r.bank,36);assert.equal(r.effects.length,0);assert.equal(r.commands.length,4);assert.equal(r.textures.length,2);assert.throws(()=>convertKirbyCopyEffects(fighterBankFixture(spec,a=>a.d.setUint16(a.cmd+2,7)),code));}
});

function samusCopyPaletteFixture(change=()=>{}){
  const body=new Uint8Array(41852),d=new DataView(body.buffer),relocs=new Set(),ptr=(at,to)=>{relocs.add(at);d.setUint32(at,to);};
  ptr(0,32);ptr(4,1120);ptr(12,41416);
  d.setUint16(32,0x42);d.setUint16(34,34);d.setUint32(36,34000);d.setUint32(40,11);d.setUint32(1120,7);d.setUint32(1124,32);
  for(const [at,n]of [[1152,1],[1156,9],[1160,2],[1164,64],[1168,64],[1176,64],[1180,0x80a8812a]])d.setUint32(at,n);
  for(let i=0;i<3;i++)d.setFloat32(41416+32+i*4,1);
  change({d,ptr,body});
  const name=new TextEncoder().encode('effKirbySamusDataTable\0'),pub=32+body.length+relocs.size*4,bytes=new Uint8Array(pub+8+name.length),out=new DataView(bytes.buffer);
  [bytes.length,body.length,relocs.size,1,0].forEach((n,i)=>out.setUint32(i*4,n));bytes.set(body,32);[...relocs].forEach((p,i)=>out.setUint32(32+body.length+i*4,p));bytes.set(name,pub+8);return bytes;
}
test('Samus copy preserves its pinned relocation-only palette without reading or substituting texture data',()=>{
  const input=samusCopyPaletteFixture(),before=input.slice(),r=convertKirbyCopyEffects(input,'Ss'),d=new DataView(r.image.buffer,32);
  assert.deepEqual(input,before);assert.equal(r.bank,34);assert.equal(r.commands.length,11);assert.equal(r.effects.length,1);
  assert.deepEqual(r.relocationOnlyPalettes,[{group:0,slot:1180,relativeOffset:0x80a8812a}]);
  assert.equal(d.getUint32(1180,true),0x80a8812a);assert.deepEqual(r.textures[0].slots,[1184,1120+0x80a8812a]);assert.equal(r.packedBytes,4096);
  for(const change of [a=>a.d.setUint32(1180,0x80a8812b),a=>a.d.setUint32(1164,32),a=>a.d.setUint32(1160,1),a=>a.d.setUint16(1172,1),a=>a.d.setUint32(1176,68),a=>{a.d.setUint32(1124,0);a.d.setUint32(1128,32);},a=>a.ptr(1180,0)])assert.throws(()=>convertKirbyCopyEffects(samusCopyPaletteFixture(change),'Ss'));
});
