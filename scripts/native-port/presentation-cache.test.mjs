import test from 'node:test';
import assert from 'node:assert/strict';
import {createPresentationCache} from '../../engines/browser-native/presentation-cache.mjs';

test('presentation assets survive renderer release without retaining native bindings',()=>{
 const cache=createPresentationCache(),deleted=[],gl={isContextLost:()=>false,deleteProgram:p=>deleted.push(p)};
 const bytes=new Uint8Array([1,2,3]);let created=0,released=0;
 const create=()=>{created++;return {plans:['immutable geometry'],dispose:()=>released++};};
 const a=cache.acquire(gl),model=a.model(bytes,create);a.programs.set('shader source',{program:'compiled'});a.variants.set('structural key',a.programs.get('shader source'));
 assert.throws(()=>cache.dispose(),/leased/);a.release();assert.equal(released,0);
 const b=cache.acquire(gl);assert.equal(b.model(bytes,create),model);assert.equal(created,1);assert.equal(b.programs.get('shader source').program,'compiled');assert.equal(b.variants.get('structural key'),b.programs.get('shader source'));
 b.model(bytes.slice(),create);assert.equal(created,2);b.release();assert.throws(()=>b.model(bytes,create),/Released/);
 assert.throws(()=>cache.acquire({...gl}),/context/);cache.dispose();assert.equal(released,2);assert.deepEqual(deleted,['compiled']);assert.equal(b.variants.size,0);assert.throws(()=>cache.acquire(gl),/context/);
});

test('retained textures require exact image and palette bytes even when addresses are reused',()=>{
 const cache=createPresentationCache(),deleted=[],gl={isContextLost:()=>false,deleteProgram(){},deleteTexture:t=>deleted.push(t)};
 const image=new Uint8Array([1,2,3]),palette=new Uint8Array([4,5]);let next=0;
 let lease=cache.acquire(gl);assert.equal(lease.texture('same descriptor',[image,palette],()=>++next),1);lease.release();
 lease=cache.acquire(gl);assert.equal(lease.texture('same descriptor',[image,palette],()=>++next),1);
 palette[1]=9;assert.equal(lease.texture('same descriptor',[image,palette],()=>++next),2);
 image[0]=8;assert.equal(lease.texture('same descriptor',[image,palette],()=>++next),3);
 assert.deepEqual(deleted,[1,2]);lease.release();cache.dispose();assert.deepEqual(deleted,[1,2,3]);
});

test('archive metadata and GPU identity are reused only within their immutable source/context lifetime',()=>{
 const cache=createPresentationCache(),bytes=new Uint8Array(40);const v=new DataView(bytes.buffer);v.setUint32(0,40);v.setUint32(4,8);
 const a=cache.archive(bytes);assert.equal(cache.archive(bytes),a);assert.notEqual(cache.archive(bytes.slice()),a);
 const gl={isContextLost:()=>false};let reads=0;const info=cache.gpuInfo(gl,()=>({value:++reads}));assert.equal(cache.gpuInfo(gl,()=>++reads),info);assert.equal(reads,1);assert.throws(()=>cache.gpuInfo({...gl},()=>null),/context/);
 cache.dispose();assert.throws(()=>cache.archive(bytes),/unavailable/);
});

test('word comparison checks every byte across alignment, tails, and subview bounds',async()=>{
 const {equalTextureBytes}=await import('../../engines/browser-native/presentation-cache.mjs');
 for(let offsetA=0;offsetA<4;offsetA++)for(let offsetB=0;offsetB<4;offsetB++)for(const length of [0,1,2,3,4,5,7,8,31,32,33,1027]){
  const a=new Uint8Array(length+8).subarray(offsetA,offsetA+length),b=new Uint8Array(length+8).subarray(offsetB,offsetB+length);
  for(let i=0;i<length;i++)a[i]=b[i]=(i*131+17)&255;
  assert.equal(equalTextureBytes(a,b),true);
  for(let i=0;i<length;i++){b[i]^=128;assert.equal(equalTextureBytes(a,b),false,`offsets ${offsetA}/${offsetB}, byte ${i}/${length}`);b[i]^=128;}
  assert.equal(equalTextureBytes(a,new Uint8Array(length+1)),false);
 }
});

test('reference and widened comparisons invalidate the same restored images and palettes',()=>{
 for(const submissionOptimized of [false,true]){
  const cache=createPresentationCache({submissionOptimized}),gl={isContextLost:()=>false,deleteTexture(){}};let next=0;
  const image=new Uint8Array(65),palette=new Uint8Array(33);let lease=cache.acquire(gl);
  assert.equal(lease.submissionOptimized,submissionOptimized);
  assert.equal(lease.texture('t',[image,palette],()=>++next),1);lease.release();
  for(const bytes of [image,palette])for(let i=0;i<bytes.length;i++){
   lease=cache.acquire(gl);assert.equal(lease.texture('t',[image,palette],()=>++next),next);
   const before=next;bytes[i]^=1;assert.equal(lease.texture('t',[image,palette],()=>++next),before+1);lease.release();
  }
  cache.dispose();
 }
});
