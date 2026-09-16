import test from 'node:test';
import assert from 'node:assert/strict';
import {convertStatusModels} from '../../engines/browser-native/status-assets.mjs';
function fixture(change=()=>{}) {
  const body=new Uint8Array(160),d=new DataView(body.buffer),relocs=new Set();
  const ptr=(p,q)=>{relocs.add(p);d.setUint32(p,q);};
  for(let i=0;i<8;i++)ptr(i*4,40);ptr(40,64);
  d.setUint32(68,1);for(let i=0;i<3;i++)d.setFloat32(96+i*4,1);
  d.setFloat32(108,-2.5);change({d,ptr,relocs});
  const text=new TextEncoder().encode('ScInfCnt_scene_models\0'),pub=32+body.length+relocs.size*4;
  const bytes=Buffer.alloc(pub+8+text.length),v=new DataView(bytes.buffer,bytes.byteOffset,bytes.length);
  [bytes.length,body.length,relocs.size,1,0].forEach((x,i)=>v.setUint32(i*4,x));bytes.set(body,32);
  [...relocs].forEach((x,i)=>v.setUint32(32+body.length+i*4,x));bytes.set(text,pub+8);return bytes;
}
test('status subgraph preserves shared model references and source Buffer bytes',()=>{
  const source=fixture(),before=Buffer.from(source),r=convertStatusModels(source),v=new DataView(r.image.buffer);
  assert.deepEqual(source,before);assert.equal(r.models.length,8);
  assert.ok(r.models.every(m=>m.joint===64&&m.nodes===1));
  assert.equal(v.getFloat32(32+108,true),-2.5);assert.equal(v.getUint32(12,true),1);
});
test('status importer rejects absent models, untyped shape animation and missing relocations',()=>{
  for(const change of [a=>a.relocs.delete(0),a=>{a.relocs.delete(0);a.d.setUint32(0,0);},a=>a.ptr(52,64),a=>a.ptr(32,40),a=>a.ptr(40,156)])assert.throws(()=>convertStatusModels(fixture(change)));
});
function hudFixture(change=()=>{}) {
  const body=new Uint8Array(640),d=new DataView(body.buffer),relocs=new Set();
  const ptr=(p,q)=>{relocs.add(p);d.setUint32(p,q);};
  for(let i=0;i<8;i++)ptr(i*4,40);ptr(40,64);d.setUint32(68,1);for(let i=0;i<3;i++)d.setFloat32(96+i*4,1);
  ptr(160,192);ptr(192,40);ptr(164,200);ptr(200,224);ptr(224+24,288);ptr(224+28,308);
  d.setUint16(224+6,1);for(const i of [10,18])d.setUint16(224+i,640);for(const i of [14,22])d.setUint16(224+i,480);
  d.setFloat32(224+40,1);d.setFloat32(224+44,3500);d.setFloat32(224+48,41.539);d.setFloat32(224+52,1.216667);
  d.setFloat32(288+12,10);ptr(168,340);ptr(340,360);ptr(360,368);d.setUint16(368+8,1);d.setUint32(368+12,0x12345678);
  ptr(520,40);ptr(528,40);ptr(536,40);ptr(544,40);ptr(552,40);change({d,ptr,relocs});
  const roots=[['ScInfCnt_scene_models',0],['ScInfDmg_scene_data',160],['ScInfTim_scene_models',520],['tdsce',528],['DmgNum_scene_models',536],['DmgMrk_scene_models',544],['Stc_scemdls',552]],text=new TextEncoder().encode(roots.map(([s])=>s+'\0').join('')),pub=32+body.length+relocs.size*4;
  const bytes=Buffer.alloc(pub+roots.length*8+text.length),v=new DataView(bytes.buffer,bytes.byteOffset,bytes.length);
  [bytes.length,body.length,relocs.size,roots.length,0].forEach((x,i)=>v.setUint32(i*4,x));bytes.set(body,32);[...relocs].forEach((x,i)=>v.setUint32(32+body.length+i*4,x));let at=0;
  roots.forEach(([s,p],i)=>{v.setUint32(pub+i*8,p);v.setUint32(pub+i*8+4,at);at+=s.length+1;});bytes.set(text,pub+roots.length*8);return bytes;
}
test('HUD import retains typed camera/light and timer roots without mutating packed colors',()=>{
  const input=hudFixture(),before=Buffer.from(input),r=convertStatusModels(input,{hud:true}),d=new DataView(r.image.buffer,32);
  assert.deepEqual(input,before);assert.equal(r.hudModels.length,3);assert.equal(r.camera.near,1);assert.equal(r.camera.far,3500);assert.equal(d.getUint32(368+12),0x12345678);assert.equal(d.getUint16(224+10,true),640);
});
test('HUD import rejects missing camera, unsupported projection, fog and cyclic lights',()=>{
  for(const mutate of [a=>{a.relocs.delete(200);a.d.setUint32(200,0);},a=>a.d.setUint16(230,3),a=>a.ptr(172,368),a=>a.ptr(372,368)])assert.throws(()=>convertStatusModels(hudFixture(mutate),{hud:true}));
});

test('damage/stock HUD publishes only converted model graphs and requires the HUD scene',()=>{
  assert.equal(convertStatusModels(hudFixture(),{hud:true,damage:true}).hudModels.length,6);
  assert.throws(()=>convertStatusModels(hudFixture(),{damage:true}),/requires/);
  assert.throws(()=>convertStatusModels(hudFixture(a=>a.ptr(536,636)),{hud:true,damage:true}));
});
