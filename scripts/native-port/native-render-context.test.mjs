import test from 'node:test';
import assert from 'node:assert/strict';
import {readNativeRenderContext,checkNativeRenderContext} from '../../engines/browser-native/native-render-context.mjs';
function fixture(){
  const heap=new Uint8Array(704),w=new Uint32Array(heap.buffer,64,158),f=new Float32Array(heap.buffer,64,158);
  w.set([2,1,0,7]);f.set([0,0,640,480,0,1],4);w.set([0,0,640,480],10);
  f.set([2,0,0,0,0,3,0,0,0,0,-0.01,-0.1,0,0,-1,0],14);
  w.set([18,52,254,128],46);f.set([0,0,1,25,0,-24,5,6,7,-0.25,-0.5,0.75],50);
  return {w,f,module:{HEAPU8:heap,_portRenderContextState:()=>64}};
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
test('render capture fails closed on incomplete camera state, invalid colors and nonfinite lights',()=>{
  for(const [at,value] of [[0,256],[2,2],[3,3],[46,256]]){const t=fixture();t.w[at]=value;assert.throws(()=>readNativeRenderContext(t.module));}
  const t=fixture();t.f[50]=NaN;assert.throws(()=>readNativeRenderContext(t.module),/nonfinite/);
  assert.throws(()=>readNativeRenderContext({...t.module,_portRenderContextState:()=>700}),/bounds/);
});
