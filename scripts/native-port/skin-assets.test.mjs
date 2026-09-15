import test from 'node:test';
import assert from 'node:assert/strict';
import {readSkinBindings} from '../../engines/browser-native/skin-assets.mjs';
function fixture() {
  const bytes=new Uint8Array(108),v=new DataView(bytes.buffer);
  [108,64,3,0,0].forEach((x,i)=>v.setUint32(i*4,x));
  [[24,32],[32,8],[40,16]].forEach(([at,x],i)=>{v.setUint32(32+at,x);v.setUint32(96+i*4,at);});
  v.setFloat32(68,0.25);v.setFloat32(76,0.75);
  const model={tree:{nodes:[{offset:8,parent:-1,flags:2,inverseBind:null},{offset:16,parent:0,flags:1,inverseBind:null}]},
    meshes:[{joint:0,flags:0x2000,binding:24,vertices:[{0:[0]}]}]};
  return {bytes,v,model};
}
test('preserves envelope order and exact weights without normalization',()=>{
  const {bytes,v,model}=fixture();v.setFloat32(76,0.5);
  const result=readSkinBindings(bytes,model);
  assert.deepEqual(result.influences,[{joint:0,weight:0.25},{joint:1,weight:0.5}]);
  assert.deepEqual(result.groups,[{kind:1,owner:0,first:0,count:2}]);
  assert.deepEqual(result.meshPalettes,[[0]]);
});
test('rejects invalid weights, unknown joints and missing palette references',()=>{
  for(const mutate of [({v})=>v.setFloat32(68,NaN),({v})=>v.setFloat32(68,-1),
    ({v})=>v.setUint32(64,20),({model})=>model.meshes[0].vertices[0][0]=[3],
    ({model})=>model.meshes[0].vertices[0][0]=[1]]) {
    const f=fixture();mutate(f);assert.throws(()=>readSkinBindings(f.bytes,f.model));
  }
});
test('retains both matrices for a rigid shared mesh',()=>{
  const {bytes,model}=fixture();model.meshes[0].flags=0;model.meshes[0].binding=16;
  model.meshes[0].vertices[0][0]=[3];
  const result=readSkinBindings(bytes,model);
  assert.deepEqual(result.influences,[{joint:0,weight:1},{joint:1,weight:1}]);
  assert.deepEqual(result.meshPalettes,[[0,1]]);
});
test('shares identical palettes across mesh sections while retaining their local slots',()=>{
  const {bytes,model}=fixture();model.meshes.push({...model.meshes[0]});
  const result=readSkinBindings(bytes,model);
  assert.equal(result.groups.length,1);assert.equal(result.influences.length,2);
  assert.deepEqual(result.meshPalettes,[[0],[0]]);
});
