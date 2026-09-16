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
