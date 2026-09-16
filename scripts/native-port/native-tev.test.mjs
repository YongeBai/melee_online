import test from 'node:test';
import assert from 'node:assert/strict';
import {readNativeTev,explicitTevStages,validateTevStages} from '../../engines/browser-native/native-tev.mjs';
import {generateTevFunction} from '../../engines/browser-native/tev-shader.mjs';
import {evaluateTev,tevTestStage} from '../../engines/browser-native/tev-reference.mjs';

function run(stage,{registers=[[0,0,0,0],[32,32,32,32],[128,128,128,128],[10,10,10,10]],texture=[128,128,128,128],raster=[255,255,255,255],konst=Array.from({length:4},()=>[0,0,0,0])}={}) {
  const stages=Array.isArray(stage[0])?stage:[stage];
  return evaluateTev({stages,registers,konst},stages.map(()=>texture),stages.map(()=>raster));
}
test('TEV independent golden vectors: rounding, bias, scaling and signed clamps',()=>{
  const stage=options=>tevTestStage({color:[2,4,8,6],alpha:[1,2,4,3],clamp:0,...options});
  for(const [scale,expected] of [[0,90],[1,181],[2,362],[3,45]])assert.deepEqual(run(stage({scale})),Array(4).fill(expected));
  assert.deepEqual(run(stage({op:1})),[-70,-70,-70,-70]);
  assert.deepEqual(run(stage({bias:1})),[218,218,218,218]);
  assert.deepEqual(run(stage({bias:2})),[-38,-38,-38,-38]);
  assert.deepEqual(run(stage({scale:2,clamp:1})),[255,255,255,255]);
  assert.deepEqual(run(stage({op:1,clamp:1})),[0,0,0,0]);
  const high={registers:[[0,0,0,0],[255,255,255,255],[255,255,255,255],[1023,1023,1023,1023]]};
  assert.deepEqual(run(stage({scale:2}),high),[1023,1023,1023,1023]);
  high.registers[3]=[-1024,-1024,-1024,-1024];assert.deepEqual(run(stage({op:1,scale:2}),high),[-1024,-1024,-1024,-1024]);
  // C=255 must select B exactly, not B*(255/256).
  assert.deepEqual(run(stage({}),{texture:[255,255,255,255]}),[138,138,138,138]);
  // ABC wrap to unsigned bytes; D keeps its signed value.
  assert.deepEqual(run(stage({}),{texture:[0,0,0,0],registers:[[0,0,0,0],[-1,-1,-1,-1],[0,0,0,0],[-128,-128,-128,-128]]}),[127,127,127,127]);
});
test('TEV comparisons use RGB for alpha R8/GR16/BGR24, alpha for A8',()=>{
  const options={registers:[[0,0,0,0],[10,30,20,99],[20,10,40,1],[3,4,5,6]],texture:[7,8,9,10]};
  const expectations=[[3,4,5,6],[3,4,5,6],[10,12,14,16],[3,4,5,6],[3,4,5,6],[3,4,5,6],[3,12,5,16],[3,4,5,6]];
  for(let op=8;op<16;op++)assert.deepEqual(run(tevTestStage({op,color:[2,4,8,6],alpha:[1,2,4,3]}),options),expectations[op-8]);
  options.registers[2]=[10,30,20,1];
  for(const op of [9,11,13])assert.deepEqual(run(tevTestStage({op,color:[2,4,8,6],alpha:[1,2,4,3]}),options),[10,12,14,16]);
  assert.deepEqual(run(tevTestStage({op:15,color:[2,4,8,6],alpha:[1,2,4,3]}),options),[10,12,14,6]);
});
test('TEV color and alpha snapshot before writes; last outputs need not be PREV',()=>{
  const s=tevTestStage({color:[15,15,15,1],alpha:[7,7,7,0],out:2});s[17]=3;
  assert.deepEqual(run(s,{registers:[[1,2,3,77],[4,5,6,88],[9,10,11,99],[12,13,14,100]]}),[77,77,77,77]);
  const first=tevTestStage({color:[15,15,15,12],alpha:[7,7,7,0]});
  const second=tevTestStage({color:[15,15,15,0],alpha:[7,7,7,0],out:1});
  assert.deepEqual(run([first,second]),[255,255,255,0]);
});
test('SDK presets select RAS initially, PREV subsequently without mutating capture',()=>{
  const s=tevTestStage();s[3]=0;
  const rows=explicitTevStages([s,s]);assert.equal(s[3],0);assert.equal(rows[0][11],10);assert.equal(rows[1][11],0);
  assert.deepEqual(run(s,{texture:[64,128,255,128],raster:[255,255,255,255]}),[64,128,255,128]);
});
test('capture copies its buffer and validates states before shader generation',()=>{
  const heap=new Uint8Array(2304),words=new Int32Array(heap.buffer,64,548);words[0]=1;words.set(tevTestStage(),36);
  const p=readNativeTev({_portMaterialTev:()=>64,HEAPU8:heap},1,0);words[36+4]=99;assert.equal(p.stages[0][4],0);
  assert.throws(()=>readNativeTev({_portMaterialTev:()=>64,HEAPU8:heap},1,0),/operation/);
  for(const [index,value] of [[4,2],[5,3],[9,16],[18,8],[24,32],[22,4],[0,8]]) {
    const s=tevTestStage();s[index]=value;assert.throws(()=>generateTevFunction([s]),/Native TEV/);
  }
  assert.throws(()=>validateTevStages([]),/capacity/);assert.throws(()=>generateTevFunction([tevTestStage()],{swaps:['rgba']}),/swap table/);
});
