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
