import test from 'node:test';
import assert from 'node:assert/strict';
import {immediateTriangles,createImmediateStateMatcher,appendImmediateGeometry} from '../../engines/browser-native/immediate-geometry.mjs';
test('GX quads, independent triangles, strips and fans preserve winding',()=>{
  assert.deepEqual([...immediateTriangles(0x80,8)],[0,1,2,0,2,3,4,5,6,4,6,7]);
  assert.deepEqual([...immediateTriangles(0x90,6)],[0,1,2,3,4,5]);
  assert.deepEqual([...immediateTriangles(0x98,5)],[0,1,2,2,1,3,2,3,4]);
  assert.deepEqual([...immediateTriangles(0xa0,5)],[0,1,2,0,2,3,0,3,4]);
});
test('incomplete and unsupported immediate primitives fail explicitly',()=>{
  for(const [p,n] of [[0x80,3],[0x90,4],[0x98,2],[0xa0,2],[0xb8,1],[0x80,0],[0x80,4097]])assert.throws(()=>immediateTriangles(p,n));
});
test('batching keeps primitive boundaries, winding, vertex order and stream ownership',()=>{
  const stream={data:new Float32Array(0),indices:new Uint32Array(0),vertexCount:0,indexCount:0};
  let offset=0;const expectedIndices=[],expectedData=[];
  for(const [primitive,count] of [[0x80,4],[0x98,5],[0xa0,6],[0x90,3]]){
    const data=Float32Array.from({length:count*9},(_,i)=>offset*9+i),indices=immediateTriangles(primitive,count);
    expectedData.push(...data);expectedIndices.push(...Array.from(indices,i=>i+offset));
    appendImmediateGeometry(stream,data,indices);data.fill(-1);offset+=count;
  }
  assert.deepEqual([...stream.data.subarray(0,offset*9)],expectedData);
  assert.deepEqual([...stream.indices.subarray(0,stream.indexCount)],expectedIndices);
  const capacity=stream.data.length;stream.vertexCount=stream.indexCount=0;
  appendImmediateGeometry(stream,new Float32Array(36),immediateTriangles(0x80,4));
  assert.equal(stream.data.length,capacity);assert.equal(stream.vertexCount,4);
  assert.deepEqual([...stream.indices.subarray(0,stream.indexCount)],[0,1,2,0,2,3]);
  assert.throws(()=>appendImmediateGeometry(stream,new Float32Array(4096*9),new Uint32Array(0)),/capacity/);
  assert.throws(()=>appendImmediateGeometry(stream,new Float32Array(36),Uint32Array.of(4)),/index/);
});
test('immediate state matching is exact, bounded and invalidated by draw barriers',()=>{
  const sizes=[548,724,80,244,158,5],addresses=[64];for(let i=1;i<6;i++)addresses.push(addresses[i-1]+sizes[i-1]*4);
  const module={HEAPU8:new Uint8Array(8192),_portMaterialTextureState:()=>addresses[1],_portMaterialPixelState:()=>addresses[2],_portMaterialModelState:()=>addresses[3],_portRenderContextState:()=>addresses[4],_portFogState:()=>addresses[5]};
  const match=createImmediateStateMatcher(module);assert.equal(match(addresses[0],true),false);assert.equal(match(addresses[0],true),true);
  // Includes unused fields and counters: no state is assumed irrelevant.
  for(let block=0;block<6;block++)for(let i=0;i<sizes[block];i++){
    const words=new Uint32Array(module.HEAPU8.buffer,addresses[block],sizes[block]);words[i]++;
    assert.equal(match(addresses[0],true),false);assert.equal(match(addresses[0],true),true);
  }
  assert.equal(match(addresses[0],false),false);assert.equal(match(addresses[0],true),true);
  const next=new Uint8Array(16384);next.set(module.HEAPU8);module.HEAPU8=next;
  assert.equal(match(addresses[0],true),true);new Uint32Array(next.buffer,addresses[3],244)[4]=0x80000000;
  assert.equal(match(addresses[0],true),false);
  for(const pointer of [0,1,16384])assert.throws(()=>match(pointer,true),/bounds/);
});
test('per-vertex TEV registers keep signed values and vary only across primitives',()=>{
  const stream={data:new Float32Array(0),indices:new Uint32Array(0),vertexCount:0,indexCount:0};
  const a=Int32Array.from({length:16},(_,i)=>i%2?-1024+i:1023-i),b=Int32Array.from(a,x=>-x);
  appendImmediateGeometry(stream,new Float32Array(36),immediateTriangles(0x80,4),a);
  appendImmediateGeometry(stream,new Float32Array(27),immediateTriangles(0x90,3),b);
  for(let i=0;i<7;i++)assert.deepEqual([...stream.registers.subarray(i*16,i*16+16)],[...(i<4?a:b)]);
  a.fill(0);b.fill(0);assert.equal(stream.registers[0],1023);assert.equal(stream.registers[64],-1023);
  const module={HEAPU8:new Uint8Array(8192),_portMaterialTextureState:()=>2304,_portMaterialPixelState:()=>5248,_portMaterialModelState:()=>5632,_portRenderContextState:()=>6656,_portFogState:()=>7300};
  const match=createImmediateStateMatcher(module),tev=new Int32Array(module.HEAPU8.buffer,64,548);
  assert.equal(match(64,false,true),false);tev[4]=-1024;tev[19]=1023;
  assert.equal(match(64,true,true),true);assert.equal(match(64,true,false),false);
  tev[20]=17;assert.equal(match(64,true,true),false); // Konst remains uniform.
  tev[3]++;assert.equal(match(64,true,true),false); // Synchronization remains a barrier.
});
