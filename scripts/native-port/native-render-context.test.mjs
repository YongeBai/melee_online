import test from 'node:test';
import assert from 'node:assert/strict';
import {readNativeRenderContext,checkNativeRenderContext} from '../../engines/browser-native/native-render-context.mjs';
function fixture(){
  const heap=new Uint8Array(704),w=new Uint32Array(heap.buffer,64,158),f=new Float32Array(heap.buffer,64,158);
  w.set([2,1,0,7]);f.set([0,0,640,480,0,1],4);w.set([0,0,640,480],10);
  f.set([2,0,0,0,0,3,0,0,0,0,-0.01,-0.1,0,0,-1,0],14);
  w.set([18,52,254,128],46);f.set([0,0,1,25,0,-24,5,6,7,-0.25,-0.5,0.75],50);
  return {w,f,module:{HEAPU8:heap,_portRenderContextState:()=>64,_portFogState:()=>16}};
}
test('render context preserves signed light coefficients and independently owned snapshots',()=>{
  const {module,f}=fixture(),s=readNativeRenderContext(module);
  assert.equal(s.lights[0],null);assert.deepEqual(s.lights[1],{color:[18,52,254,128],angular:[0,0,1],distance:[25,0,-24],position:[5,6,7],direction:[-0.25,-0.5,0.75]});
  f[50]=9;assert.equal(s.lights[1].angular[0],0);
  const raw=new Float32Array(38);raw.set(s.projection,12);
  checkNativeRenderContext(s,{raw},{channels:[{enabled:1,lights:2}]});
  assert.throws(()=>checkNativeRenderContext(s,{raw},{channels:[{enabled:1,lights:4}]}),/unloaded/);
  raw[12]=4;assert.throws(()=>checkNativeRenderContext(s,{raw}),/projection/);
});
test('fog captures quantized float coefficients, color and equation independently',()=>{
 const {module}=fixture(),r=new Uint32Array(module.HEAPU8.buffer,16,5);
 r.set([0x3e800,8388608,1,(2<<21)|0x3f000,0x123456]);
 const s=readNativeRenderContext(module);assert.deepEqual(s.fog,{type:2,a:.25,c:.5,b:8388608,shift:1,color:[18,52,86],registers:[...r]});
 r[4]=0;assert.deepEqual(s.fog.color,[18,52,86]);
 r[3]=4<<21;assert.throws(()=>readNativeRenderContext(module),/equation/);
 r[3]=0;r[0]=0x7f800;assert.throws(()=>readNativeRenderContext(module),/registers/);
 assert.throws(()=>readNativeRenderContext({...module,_portFogState:()=>700}),/bounds/);
});
test('render capture fails closed on incomplete camera state, invalid colors and nonfinite lights',()=>{
  for(const [at,value] of [[0,256],[2,2],[3,3],[46,256]]){const t=fixture();t.w[at]=value;assert.throws(()=>readNativeRenderContext(t.module));}
  const t=fixture();t.f[50]=NaN;assert.throws(()=>readNativeRenderContext(t.module),/nonfinite/);
  assert.throws(()=>readNativeRenderContext({...t.module,_portRenderContextState:()=>700}),/bounds/);
});

test('context memoization compares all native words and preserves queued snapshots',async()=>{
 const {createNativeRenderContextReader}=await import('../../engines/browser-native/native-render-context.mjs');
 const {module,w,f}=fixture(),read=createNativeRenderContextReader(module),original=read();
 assert.equal(read(),original);w[1]++;const counter=read();assert.notEqual(counter,original);assert.equal(counter.lightLoads,2);assert.equal(original.lightLoads,1);assert.equal(counter.lights,original.lights);
 f[50]=9;const changed=read();assert.equal(changed.lights[1].angular[0],9);assert.equal(original.lights[1].angular[0],0);
 f[50]=0;assert.deepEqual(read(),counter);
 // Includes inactive light storage, not just the currently visible fields.
 for(let i=0;i<158;i++){
  const before=read(),word=w[i];w[i]^=1;
  try{const expected=readNativeRenderContext(module),actual=read();assert.deepEqual(actual,expected);assert.notEqual(actual,before);}catch(e){assert.throws(()=>readNativeRenderContext(module));assert.throws(read);}
  w[i]=word;assert.deepEqual(read(),readNativeRenderContext(module));
 }
 const fog=new Uint32Array(module.HEAPU8.buffer,16,5);
 for(let i=0;i<5;i++){fog[i]^=1;assert.deepEqual(read(),readNativeRenderContext(module));fog[i]^=1;assert.deepEqual(read(),readNativeRenderContext(module));}
 f[50]=NaN;assert.throws(read,/nonfinite/);assert.throws(read,/nonfinite/);f[50]=0;assert.deepEqual(read(),counter);
 // Heap identity is not a cache key: replacement/growth still reads new bytes.
 module.HEAPU8=module.HEAPU8.slice();new Float32Array(module.HEAPU8.buffer,64,158)[50]=12;assert.equal(read().lights[1].angular[0],12);
 module._portRenderContextState=()=>700;assert.throws(read,/bounds/);
});
