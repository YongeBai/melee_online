import test from 'node:test';
import assert from 'node:assert/strict';
import {shaderIdentityFiles,validateShaderCatalog,mergeShaderCatalogs} from '../../engines/browser-native/shader-catalog.mjs';
const identity={wasmSha256:'a'.repeat(64),sources:Object.fromEntries(shaderIdentityFiles.map(f=>[f,'b'.repeat(64)]))};
const program=n=>({vertex:'#version 300 es\nvoid main(){}',fragment:'#version 300 es\n// '+n});
const catalog=(...n)=>({version:1,identity,programs:n.map(program)});
test('shader catalog validates core and generator identities and deduplicates merged sources',()=>{
  const a=catalog(1,2),b=catalog(2,3),copy=JSON.stringify([a,b]);
  assert.equal(validateShaderCatalog(a,identity),a);
  assert.deepEqual(mergeShaderCatalogs([a,b]).programs,[1,2,3].map(program));assert.equal(JSON.stringify([a,b]),copy);
  assert.throws(()=>validateShaderCatalog(a,{...identity,wasmSha256:'c'.repeat(64)}),/incompatible/);
  assert.throws(()=>validateShaderCatalog(a,{...identity,sources:{...identity.sources,[shaderIdentityFiles[0]]:'c'.repeat(64)}}),/incompatible/);
  assert.throws(()=>mergeShaderCatalogs([a,{...b,identity:{...identity,wasmSha256:'d'.repeat(64)}}]),/incompatible/);
});
test('shader catalog refuses malformed, duplicate, oversized and obsolete programs',()=>{
  for(const c of [null,{...catalog(1),version:0},catalog(),catalog(1,1),{...catalog(1),programs:[{...program(1),vertex:'not GLSL'}]},{...catalog(1),programs:[{...program(1),fragment:'#version 300 es\n'+'x'.repeat(262144)}]},{...catalog(1),identity:{...identity,sources:{}}}])assert.throws(()=>validateShaderCatalog(c,identity));
});
test('backend-only fingerprints do not invalidate identical generator sources',()=>{
  const c=catalog(1);c.identity={...identity,sources:{...identity.sources,'material-gpu.mjs':'c'.repeat(64)}};
  assert.equal(validateShaderCatalog(c,identity),c);
});
