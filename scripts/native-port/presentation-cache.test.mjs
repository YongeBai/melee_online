import test from 'node:test';
import assert from 'node:assert/strict';
import {createPresentationCache} from '../../engines/browser-native/presentation-cache.mjs';

test('presentation assets survive renderer release without retaining native bindings',()=>{
 const cache=createPresentationCache(),deleted=[],gl={isContextLost:()=>false,deleteProgram:p=>deleted.push(p)};
 const bytes=new Uint8Array([1,2,3]);let created=0,released=0;
 const create=()=>{created++;return {plans:['immutable geometry'],dispose:()=>released++};};
 const a=cache.acquire(gl),model=a.model(bytes,create);a.programs.set('shader source',{program:'compiled'});
 assert.throws(()=>cache.dispose(),/leased/);a.release();assert.equal(released,0);
 const b=cache.acquire(gl);assert.equal(b.model(bytes,create),model);assert.equal(created,1);assert.equal(b.programs.get('shader source').program,'compiled');
 b.model(bytes.slice(),create);assert.equal(created,2);b.release();assert.throws(()=>b.model(bytes,create),/Released/);
 assert.throws(()=>cache.acquire({...gl}),/context/);cache.dispose();assert.equal(released,2);assert.deepEqual(deleted,['compiled']);assert.throws(()=>cache.acquire(gl),/context/);
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
