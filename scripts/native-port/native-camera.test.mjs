import test from 'node:test';
import assert from 'node:assert/strict';
import {createNativeCamera,checkNativeCamera} from '../../engines/browser-native/native-camera.mjs';

function fixture() {
  const raw=new Float32Array(38),q=Math.SQRT1_2,near=Math.fround(0.1),far=16384,aspect=Math.fround(1.2173333),cot=1/Math.tan(Math.PI/12);
  // An independently specified 45-degree camera at (0,10,10), looking at zero.
  raw.set([1,0,0,0,0,q,-q,0,0,q,q,-20*q]);
  raw.set([cot/aspect,0,0,0,0,cot,0,0,0,0,-near/(far-near),-far*near/(far-near),0,0,-1,0],12);
  raw.set([0,10,10,0,0,0,30,aspect,near,far],28);
  const heap=new Float32Array(128),freed=[];
  const module={HEAPF32:heap,_malloc:()=>64,_free:p=>freed.push(p),_portStageCameraSnapshot:p=>heap.set(raw,p/4)};
  return {raw,module,freed};
}
test('native camera bridge preserves view orientation and original GX projection',()=>{
  const f=fixture(),camera=createNativeCamera(f.module),s=camera.snapshot();checkNativeCamera(s);
  const apply=(m,v)=>Array.from({length:4},(_,r)=>v.reduce((n,x,c)=>n+x*m[c*4+r],0));
  assert.ok(apply(s.view,[0,10,10,1]).slice(0,3).every(x=>Math.abs(x)<0.00001));
  const origin=apply(s.view,[0,0,0,1]);assert.equal(origin[0],0);assert.equal(origin[1],0);assert.ok(origin[2]<-14);
  for(const [z,expected] of [[-s.near,-1],[-s.far,0]]) {
    const p=apply(s.projection,[0,0,z,1]);assert.ok(Math.abs(p[2]/p[3]-expected)<1e-6);
  }
  camera.dispose();camera.dispose();assert.deepEqual(f.freed,[64]);assert.throws(()=>camera.snapshot(),/after release/);
});
test('camera validation catches corrupted clip planes, aspect and view matrices',()=>{
  for(const [index,value] of [[36,0],[36,1],[35,4/3],[0,2],[3,10],[12,1]]) {
    const f=fixture();f.raw[index]=value;const c=createNativeCamera(f.module);
    assert.throws(()=>checkNativeCamera(c.snapshot()),/Native camera/);c.dispose();
  }
  const f=fixture();f.raw[28]=NaN;assert.throws(()=>createNativeCamera(f.module).snapshot(),/Nonfinite/);
});
