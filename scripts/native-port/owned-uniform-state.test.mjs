import test from 'node:test';import assert from 'node:assert/strict';
import {createOwnedUniformState} from '../../engines/browser-native/owned-uniform-state.mjs';
import {createNativeRenderContextReader} from '../../engines/browser-native/native-render-context.mjs';
function fixture(){const heap=new Uint8Array(704),w=new Uint32Array(heap.buffer,64,158),f=new Float32Array(heap.buffer,64,158);w.set([1,0,0,7]);f.set([0,0,640,480,0,1],4);w.set([0,0,640,480],10);f.set([1,0,0,0,0,1,0,0,0,0,-.01,-.1,0,0,-1,0],14);w.set([100,150,200,255],30);f.set([1,2,3,4,5,6,7,8,9,10,11,12],34);return {w,f,read:createNativeRenderContextReader({HEAPU8:heap,_portRenderContextState:()=>64,_portFogState:()=>16})};}
test('lighting and projection versions follow immutable captured values across programs and reordered draws',()=>{
 const fixtureData=fixture(),{w,f,read}=fixtureData,state=createOwnedUniformState(),calls=[],gl={useProgram:p=>calls.push(p)},p={},q={};state.begin();
 const original=read(),projection=Float32Array.from(original.projection),a=state.select(gl,p);
 assert.equal(state.projection(a,projection),true);assert.equal(state.projection(a,projection),false);
 assert.equal(state.lighting(a,original.lights),true);const packed=state.packLights(original.lights);assert.equal(state.packLights(original.lights),packed);
 w[1]++;assert.equal(state.lighting(a,read().lights),false);
 f[40]=77;const changed=read(),changedProjection=Float32Array.from(changed.projection);assert.equal(state.projection(a,changedProjection),true);assert.equal(state.lighting(a,changed.lights),true);
 assert.equal(state.packLights(changed.lights).lightPosition[0],77);assert.equal(packed.lightPosition[0],7);
 const b=state.select(gl,q);assert.equal(state.lighting(b,changed.lights),true);
 state.select(gl,p);assert.equal(state.lighting(a,changed.lights),false);assert.equal(state.lighting(a,original.lights),true);assert.equal(state.packLights(original.lights),packed);
 assert.deepEqual(calls,[p,q,p]);state.begin();const fresh=state.select(gl,p);assert.equal(state.projection(fresh,projection),true);assert.equal(state.lighting(fresh,original.lights),true);assert.notEqual(state.packLights(original.lights),packed);
});
test('all light fields and inactive/active transitions pack fresh owned values without stale rows',()=>{
 const {w,f,read}=fixture(),state=createOwnedUniformState();state.begin();const initial=state.packLights(read().lights),saved=structuredClone(initial);
 for(let i=30;i<46;i++){
  if(i<34)w[i]=(w[i]+1)%256;else f[i]+=.25;
  const context=read(),packed=state.packLights(context.lights),l=context.lights[0];
  for(const [name,field]of [['lightColor','color'],['lightPosition','position'],['lightDirection','direction'],['lightAngular','angular'],['lightDistance','distance']])assert.deepEqual(Array.from(packed[name].slice(0,field==='color'?4:3)),l[field]);
  assert.deepEqual(initial,saved);
 }
 w[0]=0;const empty=state.packLights(read().lights);for(const a of Object.values(empty))assert.ok(a.every(x=>x===0));w[0]=1;assert.notDeepEqual(state.packLights(read().lights),empty);
});
