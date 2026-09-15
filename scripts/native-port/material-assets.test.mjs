import test from 'node:test';
import assert from 'node:assert/strict';
import {readModelMaterials} from '../../engines/browser-native/material-assets.mjs';
function fixture(cycle=false) {
  const relocs=cycle?[8,12,120,136,48]:[8,12,120,136],bytes=new Uint8Array(224+relocs.length*4),v=new DataView(bytes.buffer);
  [bytes.length,192,relocs.length,0,0].forEach((x,i)=>v.setUint32(i*4,x));
  [[8,44],[12,24],[120,136],[136,160]].forEach(([at,x])=>v.setUint32(32+at,x));
  for(const at of [36,72,76,80,112])v.setFloat32(32+at,1);
  v.setFloat32(72,10);bytes.set([255,128,64,255],32+28);
  bytes[136]=bytes[137]=1;v.setUint16(172,1);v.setUint16(174,1);bytes.fill(255,192,224);
  relocs.forEach((at,i)=>v.setUint32(224+i*4,at));if(cycle)v.setUint32(80,44);
  return {bytes,v,model:{meshes:[{material:0}]}};
}
test('reads typed material colors, texture transforms and tiled pixels',()=>{
  const f=fixture(),before=f.bytes.slice(),a=readModelMaterials(f.bytes,f.model),m=a.materials.get(0);
  assert.deepEqual(f.bytes,before);assert.deepEqual(m.diffuse,[255,128,64,255]);
  assert.equal(m.alpha,1);assert.equal(m.shininess,10);
  assert.deepEqual(m.texture.scale,[1,1,1]);assert.equal(m.texture.repeatS,1);
  assert.deepEqual(Array.from(m.texture.image.levels[0].pixels),[255,255,255,255]);
});
test('rejects cyclic chains, invalid dimensions, nonfinite values and missing palettes',()=>{
  const c=fixture(true);assert.throws(()=>readModelMaterials(c.bytes,c.model),/Cyclic/);
  for(const mutate of [({v})=>v.setUint16(172,0),({v})=>v.setFloat32(68,NaN),
    ({v})=>v.setUint32(176,9),({v})=>v.setUint32(128,3)]) {
    const f=fixture();mutate(f);assert.throws(()=>readModelMaterials(f.bytes,f.model));
  }
});
