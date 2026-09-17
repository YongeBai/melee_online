import test from 'node:test';import assert from 'node:assert/strict';
import {createTevStageInterner,createInternedShaderKey} from '../../engines/browser-native/native-state-intern.mjs';
import {readNativeTevState} from '../../engines/browser-native/native-tev.mjs';
import {materialShaderKey} from '../../engines/browser-native/material-shader.mjs';
function fixture(){const module={HEAPU8:new Uint8Array(2304)},w=new Int32Array(module.HEAPU8.buffer,64,548);w.set([1,15,7,2]);w.set([255,255,0,0],36);return {module,w};}
test('interned stages compare every word, own data and copy every dynamic register/header',()=>{
 const {module,w}=fixture(),pool=createTevStageInterner(),first=pool.read(module,64),saved=structuredClone(first);assert.strictEqual(pool.read(module,64).stages,first.stages);
 for(let i=1;i<68;i++){
  const old=w[i];w[i]^=1;
  try{const expected=readNativeTevState(module,64),next=pool.read(module,64);assert.deepEqual(next,expected);if(i<36)assert.equal(next.stages,first.stages);else assert.notEqual(next.stages,first.stages);}
  catch{assert.throws(()=>readNativeTevState(module,64));assert.throws(()=>pool.read(module,64));}
  w[i]=old;assert.deepEqual(pool.read(module,64),saved);assert.deepEqual(first,saved);
 }
 module.HEAPU8=module.HEAPU8.slice();new Int32Array(module.HEAPU8.buffer,64,548)[4]=123;assert.equal(pool.read(module,64).registers[0][0],123);assert.equal(first.registers[0][0],0);
 assert.throws(()=>pool.read(module,2300),/bounds/);
});
test('hash collisions, capacity fallback and stage count changes never alias unequal state',()=>{
 const {module,w}=fixture(),pool=createTevStageInterner({capacity:2}),a=pool.read(module,64);let h=1;for(let i=36;i<66;i++)h=Math.imul(h^w[i],16777619);
 const oldA=w[66],oldB=w[67];w[66]^=1;w[67]=Math.imul(h^oldA,16777619)^Math.imul(h^w[66],16777619)^oldB;
 const b=pool.read(module,64);assert.notDeepEqual(a.stages,b.stages);assert.deepEqual(b,readNativeTevState(module,64));assert.equal(pool.snapshot().entries,2);
 w[66]=oldA;w[67]=oldB;assert.strictEqual(pool.read(module,64).stages,a.stages);
 w[0]=2;w.set([255,255,0,0],68);assert.deepEqual(pool.read(module,64),readNativeTevState(module,64));assert.equal(pool.snapshot().entries,2);
});
test('interned shader keys exactly match original keys across dynamic shader inputs and draw reordering',()=>{
 const {module,w}=fixture(),pool=createTevStageInterner(),key=createInternedShaderKey(),attrs=[{attr:13},{attr:9}],state={tev:pool.read(module,64),textures:{generators:[],textures:[{id:0}]},pixel:{channelCount:0,channels:[null,null,null,null],alphaTest:{compare0:7,operation:0,compare1:7}},context:{fog:{type:0}}};
 for(let i=0;i<32;i++){w[36+3]=i%5;state.tev=pool.read(module,64);state.pixel.channelCount=i%3;state.pixel.channels[0]={enabled:i%2,lights:i};state.pixel.alphaTest.compare0=i%8;state.textures.generators=[{id:0,type:0,source:i%20,matrix:60,normalize:0,postMatrix:125}];state.context.fog.type=i%2?2:0;const options={immediateRegisters:!!(i%2)};assert.equal(key(state,attrs,options),materialShaderKey(state,attrs,options));}
});
