import test from 'node:test';import assert from 'node:assert/strict';
import {DRAW_FIELDS,DRAW_BLOCK_BYTES,DRAW_BLOCK,uniformBufferShaders,validateDrawBlock,writeDrawUniforms,createDrawUniformBuffer} from '../../engines/browser-native/draw-uniform-buffer.mjs';
import {generateMaterialShaders} from '../../engines/browser-native/material-shader.mjs';
import {tevTestStage} from '../../engines/browser-native/tev-reference.mjs';
const field=name=>DRAW_FIELDS.find(f=>f.name===name);
function fixture(n=1){const rows=()=>Array.from({length:4},(_,i)=>[n+i,-n-i,255,0]);return {camera:{projection:Float32Array.from({length:16},(_,i)=>n+i)},state:{model:{current:2,positions:[new Float32Array(12).fill(n)],normals:[new Float32Array(12).fill(-n)]},textures:{matrices:[{id:30,values:Array(12).fill(n+3)},{id:64,values:Array(12).fill(n+4)}],textures:[{id:3,lod:{bias:-.25}}],generators:[]},tev:{stages:[tevTestStage()],registers:rows(),konst:rows()},pixel:{colors:[{ambient:[1,2,3,4],material:[5,6,7,8]},{ambient:[9,10,11,12],material:[13,14,15,16]}],channelCount:0,channels:[null,null,null,null],alphaTest:{compare0:7,reference0:24,operation:0,compare1:7,reference1:99}},context:{lights:[{color:[10,20,30,40],position:[n,2,3],direction:[-1,-2,-3],angular:[4,5,6],distance:[7,8,9]},...Array(7).fill(null)],fog:{type:0,a:.25,c:.5,b:8388608,shift:1,color:[100,150,200]}}}};}
function fakeGL(){let id=1;const calls=[],g={calls,lost:false,UNIFORM_BUFFER:1,UNIFORM_BUFFER_OFFSET_ALIGNMENT:2,MAX_UNIFORM_BLOCK_SIZE:3,MAX_UNIFORM_BUFFER_BINDINGS:4,MAX_VERTEX_UNIFORM_BLOCKS:5,MAX_FRAGMENT_UNIFORM_BLOCKS:6,DYNAMIC_DRAW:7,NO_ERROR:0,isContextLost(){return this.lost;},getParameter(x){return x===2?256:x===3?16384:12;},createBuffer(){return {id:id++};},getError(){return 0;}};for(const m of ['bindBuffer','bufferData','bindBufferRange','deleteBuffer'])g[m]=(...a)=>calls.push([m,...a]);g.bufferSubData=(t,o,v)=>calls.push(['bufferSubData',t,o,v.slice()]);return g;}
test('std140 scalar arrays, vec3 arrays and mat4 have independent aligned offsets',()=>{
 assert.equal(field('projection').offset,0);assert.equal(field('positionRows').offset,64);assert.equal(field('normalRows').offset,544);assert.equal(field('postRows').offset,1504);
 assert.equal(field('lodBias').arrayStride,16);assert.equal(field('lightPosition').arrayStride,16);assert.equal(field('projection').matrixStride,16);
 assert.equal(DRAW_BLOCK_BYTES%16,0);for(let j=1;j<DRAW_FIELDS.length;j++){const a=DRAW_FIELDS[j-1],b=DRAW_FIELDS[j];assert.ok(b.offset>=a.offset+a.stride*a.count);}
});
test('owned slab captures all dynamic values and zeroes inactive fields after shrink/reorder',()=>{
 const a=fixture(1),b=fixture(19),buffer=new ArrayBuffer(DRAW_BLOCK_BYTES*2);writeDrawUniforms(buffer,0,a.state,a.camera);const first=new Uint8Array(buffer,0,DRAW_BLOCK_BYTES).slice();
 writeDrawUniforms(buffer,DRAW_BLOCK_BYTES,b.state,b.camera);a.state.model.positions[0].fill(99);a.camera.projection.fill(99);a.state.context.lights[0].color.fill(99);assert.deepEqual(new Uint8Array(buffer,0,DRAW_BLOCK_BYTES),first);
 const f=new Float32Array(buffer),i=new Int32Array(buffer);assert.equal(f[field('lightPosition').offset/4],1);assert.equal(f[field('lightPosition').offset/4+3],0);assert.equal(f[field('lodBias').offset/4+12],-.25);assert.equal(i[field('alphaReference').offset/4+1],99);assert.equal(i[field('currentMatrix').offset/4],2);
 b.state.model={positions:[],normals:[],current:null};b.state.context.lights=Array(8).fill(null);b.state.textures={textures:[],matrices:[]};writeDrawUniforms(buffer,0,b.state,b.camera);
 for(const name of ['positionRows','normalRows','textureRows','postRows','lightColor','lightPosition','lodBias']){const p=field(name);assert.ok(new Uint8Array(buffer,p.offset,p.stride*p.count).every(v=>v===0));}
 writeDrawUniforms(buffer,0,fixture(1).state,fixture(1).camera);assert.deepEqual(new Uint8Array(buffer,0,DRAW_BLOCK_BYTES),first);
});
test('shader conversion keeps exact operations and flat register varyings for every variant',()=>{
 for(const immediateRegisters of [false,true])for(const fog of [0,2])for(const textured of [false,true]){
  const {state}=fixture();state.tev.stages[0][1]=textured?3:255;if(textured)state.textures.generators=[{id:0,type:1,source:4,matrix:60,normalize:0,postMatrix:125}];state.context.fog.type=fog;const original=generateMaterialShaders(state,[{attr:9},{attr:11},...(textured?[{attr:13}]:[])],{immediateRegisters}),converted=uniformBufferShaders(original);assert.ok(converted);
  for(const stage of ['vertex','fragment']){assert.ok(converted[stage].includes('layout(std140) uniform '+DRAW_BLOCK));const recovered=converted[stage].replace(/layout\(std140\) uniform MeleeDrawV1 \{[\s\S]*?\};\n/,'').replace(/\bubo_(\w+)\b/g,'$1');const strip=s=>s.replace(/\buniform\s+(float|int|vec[234]|ivec[234]|mat4)\s+[^;]+;/g,'').replace(/\s+/g,'');assert.equal(strip(recovered),strip(original[stage]));}
  if(immediateRegisters){assert.match(converted.fragment,/flat in highp ivec4 tevRegisters/);assert.match(converted.vertex,/tevRegisters\[i\]|tevRegisters\[0\]/);}
 }
 assert.equal(uniformBufferShaders({vertex:'#version 300 es\nuniform float unknown;precision highp float;precision highp int;',fragment:'#version 300 es\nuniform float unknown;precision highp float;precision highp int;'}),null);
});
test('exclusive frame records retain capacity, upload once, bind aligned offsets and reject stale/lost contexts',()=>{
 const gl=fakeGL(),pool=createDrawUniformBuffer(gl),a=fixture(),b=fixture(10);assert.ok(pool.prepare([a,b]));const epoch=pool.upload();pool.bind(1,epoch);assert.equal(gl.calls.filter(c=>c[0]==='bufferSubData').length,1);const range=gl.calls.find(c=>c[0]==='bindBufferRange');assert.equal(range[4]%256,0);assert.equal(range[5],DRAW_BLOCK_BYTES);
 const allocations=pool.snapshot().allocations;pool.prepare([b]);const newer=pool.upload();assert.equal(pool.snapshot().allocations,allocations);assert.throws(()=>pool.bind(0,epoch),/stale/);assert.throws(()=>pool.bind(1,newer),/invalid/);pool.bind(0,newer);
 pool.prepare(Array.from({length:40},()=>a));pool.upload();assert.ok(pool.snapshot().allocations>allocations);gl.lost=true;assert.throws(()=>pool.prepare([a]),/context/);pool.dispose();assert.throws(()=>pool.upload(),/context/);
 const fresh=createDrawUniformBuffer(fakeGL());assert.ok(fresh.prepare([a]));assert.ok(fresh.upload());fresh.dispose();
 const tiny=createDrawUniformBuffer(fakeGL(),{maxBytes:DRAW_BLOCK_BYTES});assert.equal(tiny.prepare([a,b]),false);tiny.dispose();
 const unsupported=fakeGL();unsupported.getParameter=()=>0;assert.equal(createDrawUniformBuffer(unsupported),null);
});
test('linked layout reflection accepts optimized-out fields and rejects offset/type/stride/size mistakes',()=>{
 const fields=[field('projection'),field('lightPosition'),field('currentMatrix')],base=fakeGL();Object.assign(base,{INVALID_INDEX:0xffffffff,UNIFORM_BLOCK_DATA_SIZE:10,UNIFORM_BLOCK_ACTIVE_UNIFORM_INDICES:11,UNIFORM_OFFSET:12,UNIFORM_ARRAY_STRIDE:13,UNIFORM_MATRIX_STRIDE:14,UNIFORM_IS_ROW_MAJOR:15,UNIFORM_BLOCK_INDEX:16,FLOAT_MAT4:30,FLOAT_VEC3:31,INT:32});
 base.getUniformBlockIndex=()=>0;base.getActiveUniformBlockParameter=(_,__,p)=>p===10?DRAW_BLOCK_BYTES:[0,1,2];base.getActiveUniforms=(_,ids,p)=>ids.map(j=>p===12?fields[j].offset:p===13?fields[j].arrayStride:p===14?fields[j].matrixStride:0);base.getActiveUniform=(_,j)=>({name:'ubo_'+fields[j].name+(fields[j].count>1?'[0]':''),type:[30,31,32][j],size:1});base.uniformBlockBinding=()=>{};assert.equal(validateDrawBlock(base,{}).active,3);
 const original=base.getActiveUniforms;base.getActiveUniforms=(p,ids,k)=>{const a=original(p,ids,k);if(k===12)a[1]+=4;return a;};assert.throws(()=>validateDrawBlock(base,{}),/layout/);base.getActiveUniforms=original;for(const property of [13,14,15,16]){base.getActiveUniforms=(p,ids,k)=>{const a=original(p,ids,k);if(k===property)a[0]++;return a;};assert.throws(()=>validateDrawBlock(base,{}),/layout/);}base.getActiveUniforms=original;const info=base.getActiveUniform;base.getActiveUniform=(p,i)=>({...info(p,i),type:999});assert.throws(()=>validateDrawBlock(base,{}),/layout/);base.getActiveUniform=info;base.getActiveUniformBlockParameter=(_,__,p)=>p===10?16:[0,1,2];assert.throws(()=>validateDrawBlock(base,{}),/layout/);
});

test('replaced native heaps produce new copied matrices without changing earlier frame records',async()=>{
 const {readNativeModelMatrices}=await import('../../engines/browser-native/native-model.mjs');
 const module={HEAPU8:new Uint8Array(1100),_portMaterialModelState:()=>64},words=new Uint32Array(module.HEAPU8.buffer,64,244),values=new Float32Array(module.HEAPU8.buffer,64,244);words.set([1,1,0,1]);values.fill(3,4,16);values.fill(4,124,136);
 const a=fixture(),b=fixture();a.state.model=readNativeModelMatrices(module);module.HEAPU8=module.HEAPU8.slice();new Float32Array(module.HEAPU8.buffer,64,244).fill(12,4,16);b.state.model=readNativeModelMatrices(module);
 const gl=fakeGL(),pool=createDrawUniformBuffer(gl);pool.prepare([a,b,a]);pool.upload();const upload=gl.calls.find(c=>c[0]==='bufferSubData')[3],stride=pool.snapshot().stride,v=new Float32Array(upload.buffer,upload.byteOffset,upload.length/4),at=field('positionRows').offset/4;
 assert.equal(v[at],3);assert.equal(v[stride/4+at],12);assert.equal(v[2*stride/4+at],3);pool.dispose();
});

test('presentation leases exclusively own UBO staging and revoke methods after release',async()=>{
 const {createPresentationCache}=await import('../../engines/browser-native/presentation-cache.mjs'),gl=fakeGL();gl.getUniformBlockIndex=()=>0;const cache=createPresentationCache({reuseImmediate:false}),a=cache.acquire(gl);assert.throws(()=>cache.acquire(gl),/leased/);
 a.drawUniformBuffer.prepare([fixture()]);const epoch=a.drawUniformBuffer.upload();a.release();assert.throws(()=>a.drawUniformBuffer.bind(0,epoch),/Released/);
 const b=cache.acquire(gl);assert.throws(()=>a.drawUniformBuffer.prepare([fixture()]),/Released/);b.drawUniformBuffer.prepare([fixture(2)]);b.drawUniformBuffer.bind(0,b.drawUniformBuffer.upload());b.release();cache.dispose();
});

test('retained slab views match isolated record packing through growth, sparse rows and reuse',()=>{
 const gl=fakeGL(),pool=createDrawUniformBuffer(gl),stride=pool.snapshot().stride;
 for(const count of [2,40,1,0,17]){
  const draws=Array.from({length:count},(_,n)=>{
   const d=fixture(n+1);
   if(n%2){d.state.model.positionRows=new Float32Array(120).fill(n/7);d.state.model.normalRows=new Float32Array(120).fill(-n/9);}
   else {d.state.model.positions[9]=new Float32Array(12).fill(n+.25);d.state.model.normals[9]=new Float32Array(12).fill(-n-.25);}
   if(n%3===0){d.state.context.fog=null;d.state.context.lights.fill(null);d.state.textures={matrices:[],textures:[]};}
   return d;
  });
  assert.ok(pool.prepare(draws));pool.upload();if(!count)continue;
  const actual=gl.calls.filter(c=>c[0]==='bufferSubData').at(-1)[3],expected=new ArrayBuffer(count*stride);
  draws.forEach((d,n)=>writeDrawUniforms(expected,n*stride,d.state,d.camera));
  assert.deepEqual(actual,new Uint8Array(expected));
 }
 pool.dispose();
 const unaligned=createDrawUniformBuffer(fakeGL(),{maxBytes:stride+1});assert.ok(unaligned.prepare([fixture()]));unaligned.upload();unaligned.dispose();
});
