import test from 'node:test';import assert from 'node:assert/strict';
import {convertPauseModels} from '../../engines/browser-native/pause-assets.mjs';
function fixture(mutate=()=>{}){
 const data=new Uint8Array(128),v=new DataView(data.buffer),relocs=[0,16,24];
 v.setUint32(0,16);v.setUint32(16,24);v.setUint32(24,40);v.setUint32(44,9);for(const at of [72,76,80])v.setFloat32(at,1);
 // Scene metadata is not consumed by the original pause constructor.
 v.setUint32(4,120);relocs.push(4);data.set([0xde,0xad,0xbe,0xef],120);mutate(v,relocs);
 const name=new TextEncoder().encode('ScGamPause_scene_data\0'),pub=32+data.length+relocs.length*4,bytes=new Uint8Array(pub+8+name.length),h=new DataView(bytes.buffer);
 [bytes.length,data.length,relocs.length,1,0].forEach((x,i)=>h.setUint32(i*4,x));bytes.set(data,32);relocs.forEach((x,i)=>h.setUint32(160+i*4,x));bytes.set(name,pub+8);return bytes;
}
test('pause import publishes the original model graph and leaves source bytes unchanged',()=>{
 const bytes=fixture(),before=bytes.slice(),p=convertPauseModels(bytes),d=new DataView(p.image.buffer,32);
 assert.deepEqual(bytes,before);assert.equal(p.nodes,1);assert.equal(p.joint,40);assert.equal(p.meshes,0);assert.equal(d.getUint32(0,true),16);assert.equal(d.getUint32(24,true),40);assert.equal(d.getUint32(4,true),0);assert.deepEqual([...p.image.slice(152,156)],[0xde,0xad,0xbe,0xef]);
});
test('pause import rejects missing roots, extra models and unsupported shape animation',()=>{
 for(const mutate of [(v,r)=>{r.splice(r.indexOf(0),1);},(v,r)=>{v.setUint32(20,24);r.push(20);},(v,r)=>{v.setUint32(36,120);r.push(36);},(v)=>{v.setUint32(24,128);}])assert.throws(()=>convertPauseModels(fixture(mutate)));
});
