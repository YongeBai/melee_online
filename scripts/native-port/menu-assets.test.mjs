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
