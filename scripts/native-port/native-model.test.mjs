import test from 'node:test';
import assert from 'node:assert/strict';
import {readNativeModelMatrices} from '../../engines/browser-native/native-model.mjs';
function fixture() {
  const heap=new Uint8Array(1100),w=new Uint32Array(heap.buffer,64,244),f=new Float32Array(heap.buffer,64,244);
  w.set([4,4,2,1]);f.set([1,0,0,11,0,1,0,12,0,0,1,13],4+24);f.set([1,0,0,0,0,1,0,0,0,0,1,0],124+24);
  return {w,f,module:{HEAPU8:heap,_portMaterialModelState:()=>64}};
}
test('native matrix snapshot preserves loaded slots and owns its copied matrices',()=>{
  const f=fixture(),s=readNativeModelMatrices(f.module);assert.equal(s.current,2);assert.equal(s.positions[0],null);
  assert.deepEqual(Array.from(s.positions[2]),[1,0,0,11,0,1,0,12,0,0,1,13]);
  assert.deepEqual(Array.from(s.normals[2]),[1,0,0,0,0,1,0,0,0,0,1,0]);
  f.f[4+24]=9;assert.equal(s.positions[2][0],1);f.w[3]=0;assert.equal(readNativeModelMatrices(f.module).current,null);
});
test('matrix boundary rejects missing positions, mismatched masks and nonfinite values',()=>{
  for(const [i,v] of [[0,0],[0,1024],[1,5],[2,10],[3,2]]){const f=fixture();f.w[i]=v;assert.throws(()=>readNativeModelMatrices(f.module),/masks/);}
  const f=fixture();f.f[4+24]=NaN;assert.throws(()=>readNativeModelMatrices(f.module),/nonfinite/);
  assert.throws(()=>readNativeModelMatrices({...f.module,_portMaterialModelState:()=>1096}),/bounds/);
});

test('packed matrices preserve exact masked values and keep queued draws independent',async()=>{
 const {createPackedModelReader}=await import('../../engines/browser-native/native-model.mjs');const t=fixture(),reader=createPackedModelReader(t.module);
 const comparable=s=>({positions:s.positions,normals:s.normals,current:s.current});
 for(let i=4;i<244;i++)t.f[i]=Math.fround((i-130)/7);t.f[31]=-0;
 const a=reader.read();assert.deepEqual(comparable(a),readNativeModelMatrices(t.module));
 const saved=Array.from(a.positionRows);t.f[28]=9;const b=reader.read();assert.notEqual(a,b);assert.deepEqual(Array.from(a.positionRows),saved);
 for(let mask=1;mask<1024;mask++){
  t.w[0]=mask;t.w[1]=mask&0x155;t.w[2]=mask%10;t.w[3]=mask%2;reader.reset();const r=reader.read(),ref=readNativeModelMatrices(t.module);assert.equal(r,a);assert.deepEqual(comparable(r),ref);
  for(let i=0;i<120;i++){assert.equal(r.positionRows[i],ref.positions[Math.floor(i/12)]?.[i%12]??0);assert.equal(r.normalRows[i],ref.normals[Math.floor(i/12)]?.[i%12]??0);}
 }
 t.module.HEAPU8=t.module.HEAPU8.slice();new Float32Array(t.module.HEAPU8.buffer)[(64/4)+4]=21;reader.reset();assert.deepEqual(comparable(reader.read()),readNativeModelMatrices(t.module));
});

test('packed reader retains all matrix rejection checks and clears inactive stale rows',async()=>{
 const {createPackedModelReader}=await import('../../engines/browser-native/native-model.mjs');
 for(const [i,v]of [[0,0],[0,1024],[1,5],[2,10],[3,2]]){const t=fixture();t.w[i]=v;assert.throws(()=>createPackedModelReader(t.module).read(),/masks/);}
 const t=fixture(),reader=createPackedModelReader(t.module);reader.read();t.f[28]=NaN;reader.reset();assert.throws(()=>reader.read(),/nonfinite/);
 t.w[0]=1;t.w[1]=0;reader.reset();const r=reader.read();assert.equal(r.positions[2],null);assert.equal(r.positionRows[24],0);assert.ok(r.normalRows.every(x=>x===0));
 t.module._portMaterialModelState=()=>1096;assert.throws(()=>reader.read(),/bounds/);
});
