import test from 'node:test';import assert from 'node:assert/strict';
import {convertMenuAsset} from '../../engines/browser-native/menu-assets.mjs';
function fixture(mutate=()=>{}){
 const data=new Uint8Array(384),v=new DataView(data.buffer),r=[0,232,236];
 v.setUint32(0,208);v.setUint16(214,1);v.setUint32(232,272);v.setUint32(236,292);
 for(const [at,x]of [[224,480],[226,640]])v.setUint16(at,x);
 for(const [at,x]of [[248,1],[252,1000],[256,35],[260,4/3]])v.setFloat32(at,x);
 for(let i=0;i<12;i++){v.setUint32(16+i*16,312);r.push(16+i*16);}
 v.setUint32(316,9);for(const at of [344,348,352])v.setFloat32(at,1);
 mutate(v,r);const name=new TextEncoder().encode('MnSelectStageDataTable\0'),pub=32+data.length+r.length*4,bytes=new Uint8Array(pub+8+name.length),h=new DataView(bytes.buffer);
 [bytes.length,data.length,r.length,1,0].forEach((x,i)=>h.setUint32(i*4,x));bytes.set(data,32);r.forEach((x,i)=>h.setUint32(416+i*4,x));bytes.set(name,pub+8);return bytes;
}
test('menu import preserves a shared model and converts original camera/table only once',()=>{
 const bytes=fixture(),before=bytes.slice(),m=convertMenuAsset(bytes),d=new DataView(m.image.buffer,32);
 assert.deepEqual(bytes,before);assert.equal(m.rows.length,12);assert.equal(m.models.length,1);assert.equal(m.models[0].nodes,1);
 assert.equal(d.getUint16(214,true),1);assert.equal(d.getFloat32(256,true),35);assert.equal(m.pointerSlots.size,15);
 assert.equal(d.getUint32(192,true),312);
});
test('menu import rejects missing/invalid camera, model and animation graph',()=>{
 for(const mutate of [v=>v.setUint16(214,4),v=>v.setUint32(16,384),(v,r)=>r.splice(r.indexOf(0),1),(v,r)=>{v.setUint32(28,368);r.push(28,368);v.setUint32(368,368);}])assert.throws(()=>convertMenuAsset(fixture(mutate)));
 assert.throws(()=>convertMenuAsset(fixture(),{menu:'unknown'}));
});

function pack(data,relocations,publics){
 const strings=new TextEncoder().encode(publics.map(p=>p[0]).join('\0')+'\0'),bytes=new Uint8Array(32+data.length+relocations.length*4+publics.length*8+strings.length),h=new DataView(bytes.buffer);
 [bytes.length,data.length,relocations.length,publics.length,0].forEach((v,i)=>h.setUint32(i*4,v));bytes.set(data,32);relocations.forEach((p,i)=>h.setUint32(32+data.length+i*4,p));
 const base=32+data.length+relocations.length*4;let offset=0;publics.forEach(([name,p],i)=>{h.setUint32(base+i*8,p);h.setUint32(base+i*8+4,offset);offset+=name.length+1;});bytes.set(strings,base+publics.length*8);return bytes;
}
function notice(mutate=()=>{}){
 const data=new Uint8Array(256),v=new DataView(data.buffer),r=[];
 const ptr=(p,t)=>{v.setUint32(p,t);r.push(p);};ptr(0,16);ptr(4,40);ptr(16,24);ptr(24,128);ptr(40,48);
 v.setUint16(54,1);v.setFloat32(88,.1);v.setFloat32(92,5000);v.setFloat32(96,25);v.setFloat32(100,4/3);
 v.setUint32(132,9);for(const p of [160,164,168])v.setFloat32(p,1);
 mutate(v,r);return pack(data,r,[['ScNtcCommon_scene_data',0]]);
}
test('card notice keeps nested scene/model list pointers and native perspective fields',async()=>{
 const {convertCardNoticeAsset}=await import('../../engines/browser-native/menu-assets.mjs');
 const input=notice(),before=input.slice(),m=convertCardNoticeAsset(input),d=new DataView(m.image.buffer,32);
 assert.deepEqual(input,before);assert.equal(m.rows.length,1);assert.equal(m.models.length,1);assert.equal(m.pointerSlots.size,5);assert.equal(d.getFloat32(96,true),25);assert.equal(d.getUint32(24,true),128);
 assert.throws(()=>convertCardNoticeAsset(notice((v,r)=>{v.setUint32(12,112);r.push(12);})),/Unsupported/);
 assert.throws(()=>convertCardNoticeAsset(notice((v,r)=>{r.splice(r.indexOf(40),1);})),/Unrelocated/);
});
function extra(mutate=()=>{}){
 const data=new Uint8Array(512),v=new DataView(data.buffer),r=[],pub=[['Example_joint',0],['Example_animjoint',80],['Example_matanim_joint',96],['Example_shapeanim_joint',112],['ScMenMain_cam_int1_camera',128],['ScMenMain_scene_lights',192],['ScMenMain_fog',208]];
 v.setUint32(4,9);for(const p of [32,36,40])v.setFloat32(p,1);v.setUint16(134,1);v.setFloat32(168,.1);v.setFloat32(172,5000);v.setFloat32(176,25);v.setFloat32(180,4/3);
 let p=240;for(const name of ['mnNameAutoName','mnNameAutoNameUs','mnNameDefaultName','mnNameDefaultNameUs','mnNameRefuseName','mnNameRefuseNameUs']){pub.push([name,p]);v.setUint32(p,400);r.push(p);p+=8;}
 mutate(v,r,pub);return pack(data,r,pub);
}
test('extra menu imports complete quartets, light lists and original byte strings',async()=>{
 const {convertExtraMenuAsset}=await import('../../engines/browser-native/menu-assets.mjs');
 const input=extra(),before=input.slice(),m=convertExtraMenuAsset(input);assert.deepEqual(input,before);assert.equal(m.models.length,1);assert.equal(m.rows.length,1);assert.equal(m.names.length,6);assert(m.names.every(n=>n.count===1));
 assert.throws(()=>convertExtraMenuAsset(extra((v,r,p)=>p.pop())),/Missing extra-menu root/);
 assert.throws(()=>convertExtraMenuAsset(extra((v,r,p)=>p.push(['Unknown',0]))),/Unknown extra-menu/);
 assert.throws(()=>convertExtraMenuAsset(extra(v=>v.setUint32(240,512))),/outside data/);
});
