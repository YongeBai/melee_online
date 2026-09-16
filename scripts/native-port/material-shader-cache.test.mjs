import test from 'node:test';
import assert from 'node:assert/strict';
import {materialShaderKey,generateMaterialShaders} from '../../engines/browser-native/material-shader.mjs';

const attributes=[{attr:0},{attr:9},{attr:10},{attr:11},{attr:13}];
function fixture(){
  const stage=Array(32).fill(0);stage[0]=stage[1]=255;stage[2]=4;stage[3]=4;
  const channel={enabled:1,ambientSource:0,materialSource:0,lights:1,diffuse:2,attenuation:2};
  return {tev:{stages:[stage],registers:[[1,2,3,4]],konst:[[5,6,7,8]]},textures:{generators:[],textures:[],matrices:[]},pixel:{channelCount:1,channels:[channel,null,{...channel},null],colors:[{material:[255,255,255,255],ambient:[0,0,0,0]}],alphaTest:{compare0:7,reference0:0,operation:0,compare1:7,reference1:0}}};
}
test('material cache key separates shader control changes while retaining uniform updates',()=>{
  const base=fixture(),key=materialShaderKey(base,attributes),source=generateMaterialShaders(base,attributes);
  for(const change of [s=>s.tev.registers[0][0]++,s=>s.tev.konst[0][0]++,s=>s.pixel.colors[0].material[0]--,s=>s.pixel.alphaTest.reference0++,s=>s.textures.matrices.push({id:30,values:[1,0,0,0]})]){
    const next=structuredClone(base);change(next);assert.equal(materialShaderKey(next,attributes),key);assert.deepEqual(generateMaterialShaders(next,attributes),source);
  }
  for(const change of [s=>s.pixel.channelCount=2,s=>s.pixel.channels[0].lights=2,s=>s.pixel.channels[0].diffuse=1,s=>s.pixel.channels[0].materialSource=1,s=>s.pixel.alphaTest.compare0=4,s=>s.pixel.alphaTest.operation=1,s=>s.tev.stages[0][2]=5]){
    const next=structuredClone(base);change(next);assert.notEqual(materialShaderKey(next,attributes),key);assert.notDeepEqual(generateMaterialShaders(next,attributes),source);
  }
  assert.equal(materialShaderKey(base,[...attributes].reverse()),key);
  assert.notEqual(materialShaderKey(base,attributes.filter(a=>a.attr!==11)),key);
});
test('material cache key follows texgen and texture binding layout',()=>{
  const base=fixture();base.tev.stages[0][0]=0;base.tev.stages[0][1]=0;base.textures.textures=[{id:0,address:100}];base.textures.generators=[{id:0,type:1,source:4,matrix:60,normalize:0,postMatrix:125}];
  const key=materialShaderKey(base,attributes),source=generateMaterialShaders(base,attributes);
  const image=structuredClone(base);image.textures.textures[0].address=200;assert.equal(materialShaderKey(image,attributes),key);assert.deepEqual(generateMaterialShaders(image,attributes),source);
  for(const field of ['type','source','matrix','normalize','postMatrix']){
    const next=structuredClone(base);Object.assign(next.textures.generators[0],{[field]:{type:0,source:1,matrix:30,normalize:1,postMatrix:64}[field]});
    assert.notEqual(materialShaderKey(next,attributes),key);assert.notDeepEqual(generateMaterialShaders(next,attributes),source);
  }
  const missing=structuredClone(base);missing.textures.textures=[];assert.notEqual(materialShaderKey(missing,attributes),key);assert.throws(()=>generateMaterialShaders(missing,attributes),/missing texture/);
});
