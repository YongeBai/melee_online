import test from 'node:test';import assert from 'node:assert/strict';
import {snapshotShapeGeometry} from '../../engines/browser-native/shape-geometry.mjs';
const setup=()=>{const module={HEAPU8:new Uint8Array(128)},f=new Float32Array(module.HEAPU8.buffer);f.set([1,2,3,4,5,6],4);f.set([0,1,0,1,0,0],16);const mesh={flags:0x9000,vertices:[{9:[9,9,9],shapeIndices:{9:1,10:0}},{9:[8,8,8],shapeIndices:{9:0,10:1}}]};return {module,mesh,f};};
test('queued shape geometry owns expanded native samples and leaves immutable source intact',()=>{
 const {module,mesh,f}=setup(),s=snapshotShapeGeometry(module,mesh,16,2,64,2,{reference:true});f.fill(0);
 assert.deepEqual([...s.positions],[4,5,6,1,2,3]);assert.deepEqual([...s.normals],[0,1,0,1,0,0]);assert.deepEqual(s.vertices[0][9],[4,5,6]);assert.deepEqual(mesh.vertices[0][9],[9,9,9]);
});
test('shape submission rejects missing geometry and invalid index/sample boundaries',()=>{
 for(const change of [x=>x.mesh.flags=0,x=>x.mesh.vertices[0].shapeIndices[9]=2,x=>x.mesh.vertices[0].shapeIndices[10]=-1,x=>x.f[4]=NaN]){const x=setup();change(x);assert.throws(()=>snapshotShapeGeometry(x.module,x.mesh,16,2,64,2));}
 const {module,mesh}=setup();assert.throws(()=>snapshotShapeGeometry(module,mesh,0,0,0,0));assert.throws(()=>snapshotShapeGeometry(module,mesh,17,2,64,2));
});
