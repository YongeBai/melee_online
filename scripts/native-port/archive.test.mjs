import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectArchive} from '../../engines/browser-native/archive.mjs';
import {convertStageCollision} from '../../engines/browser-native/stage-collision.mjs';

function fixture() {
  const dataSize=120, bytes=new Uint8Array(32+dataSize+12+8+10), v=new DataView(bytes.buffer);
  [bytes.length,dataSize,3,1,0].forEach((x,i)=>v.setUint32(i*4,x));
  // Header at data offset zero; two vertices, one line and one joint.
  [[0,48],[4,2],[8,64],[12,1],[36,80],[40,1]].forEach(([at,x])=>v.setUint32(32+at,x));
  [1.25,-2.5,-3.75,4.125].forEach((x,i)=>v.setFloat32(32+48+i*4,x));
  [0,1,-1,-1,-1,-1,0x1234,0x5678].forEach((x,i)=>v.setInt16(32+64+i*2,x));
  for(let i=0;i<10;i++)v.setInt16(32+80+i*2,i%2?1:-1);
  [-4.5,-8.25,16.5,32.25].forEach((x,i)=>v.setFloat32(32+100+i*4,x));
  v.setInt16(32+116,0);v.setInt16(32+118,2);
  [0,8,36].forEach((x,i)=>v.setUint32(32+dataSize+i*4,x));
  bytes.set(new TextEncoder().encode('coll_data\0'),32+dataSize+20);
  return {bytes,v};
}

test('reads big-endian symbols and accepts a public root at offset zero',()=> {
  const a=inspectArchive(fixture().bytes);
  assert.equal(a.publics.get('coll_data'),0);
  assert.deepEqual([...a.relocations],[0,8,36]);
});
test('converts mixed float, signed-short, flags and pointers without changing the source',()=> {
  const {bytes}=fixture(), original=bytes.slice(), converted=convertStageCollision(bytes);
  assert.deepEqual(bytes,original);
  const v=new DataView(converted.image.buffer);
  assert.equal(v.getUint32(0,true),converted.image.length);
  assert.equal(v.getUint32(32,true),48);
  assert.equal(v.getFloat32(32+48,true),1.25);
  assert.equal(v.getFloat32(32+52,true),-2.5);
  assert.equal(v.getInt16(32+68,true),-1);
  assert.equal(v.getUint16(32+76,true),0x1234);
  assert.equal(v.getFloat32(32+100,true),-4.5);
  assert.deepEqual(converted.metrics.slice(0,3),[2,1,1]);
});
test('rejects truncated sections, corrupt relocations and unterminated strings',()=> {
  for(const mutate of [
    ({v})=>v.setUint32(8,0xffffffff),
    ({v})=>v.setUint32(152,119),
    ({v})=>v.setUint32(156,0),
    ({bytes})=>{bytes[bytes.length-1]=1;},
  ]) {
    const f=fixture();mutate(f);assert.throws(()=>inspectArchive(f.bytes));
  }
});
test('rejects unsafe collision pointers, counts, indices and nonfinite coordinates',()=> {
  for(const mutate of [
    ({v})=>v.setUint32(32,116),
    ({v})=>v.setInt32(36,-1),
    ({v})=>v.setUint16(96,2),
    ({v})=>v.setInt16(100,7),
    ({v})=>v.setFloat32(80,NaN),
    ({v})=>v.setFloat32(132,Infinity),
  ]) {
    const f=fixture();mutate(f);assert.throws(()=>convertStageCollision(f.bytes));
  }
});
test('does not infer unregistered pointers from plausible integers',()=> {
  const f=fixture();f.v.setUint32(152,44); // Valid relocation, wrong field.
  assert.throws(()=>convertStageCollision(f.bytes),/unrelocated array pointer/);
});

test('native container exposes only selected typed symbols and leaves packed data intact', async()=> {
  const {nativeArchiveImage}=await import('../../engines/browser-native/archive.mjs');
  const {bytes}=fixture();bytes.set([0x30,0x30,0x31,0x42],20);
  const a=inspectArchive(bytes),image=nativeArchiveImage(a,new Map([['coll_data',0]])),view=new DataView(image.buffer);
  assert.equal(view.getUint32(0,true),image.length);assert.equal(view.getUint32(12,true),1);
  assert.deepEqual(image.subarray(20,24),bytes.subarray(20,24));
  assert.equal(view.getUint32(32,true),48); // Relative until original parser runs.
  assert.deepEqual(image.subarray(32+48,32+120),bytes.subarray(32+48,32+120)); // No inferred payload swap.
  assert.throws(()=>nativeArchiveImage(a,new Map([['untyped',0]])),/not in the source/);
  assert.throws(()=>nativeArchiveImage(a,new Map()),/Typed native public/);
});

test('native container removes unconverted public entry points', async()=> {
  const {nativeArchiveImage}=await import('../../engines/browser-native/archive.mjs');
  const {bytes}=fixture(),extended=new Uint8Array(bytes.length+16),view=new DataView(extended.buffer);
  extended.set(bytes.subarray(0,172));
  view.setUint32(0,extended.length);view.setUint32(12,2);
  view.setUint32(172,64);view.setUint32(176,10);
  extended.set(new TextEncoder().encode('coll_data\0opaque\0'),180);
  const a=inspectArchive(extended),native=nativeArchiveImage(a,new Map([['coll_data',0]])),v=new DataView(native.buffer);
  assert.equal(a.publics.size,2);assert.equal(v.getUint32(12,true),1);
  assert.equal(new TextDecoder().decode(native.subarray(172)),'coll_data\0');
});
