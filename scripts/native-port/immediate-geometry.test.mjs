import test from 'node:test';
import assert from 'node:assert/strict';
import {immediateTriangles} from '../../engines/browser-native/immediate-geometry.mjs';
test('GX quads, independent triangles, strips and fans preserve winding',()=>{
  assert.deepEqual([...immediateTriangles(0x80,8)],[0,1,2,0,2,3,4,5,6,4,6,7]);
  assert.deepEqual([...immediateTriangles(0x90,6)],[0,1,2,3,4,5]);
  assert.deepEqual([...immediateTriangles(0x98,5)],[0,1,2,2,1,3,2,3,4]);
  assert.deepEqual([...immediateTriangles(0xa0,5)],[0,1,2,0,2,3,0,3,4]);
});
test('incomplete and unsupported immediate primitives fail explicitly',()=>{
  for(const [p,n] of [[0x80,3],[0x90,4],[0x98,2],[0xa0,2],[0xb8,1],[0x80,0],[0x80,4097]])assert.throws(()=>immediateTriangles(p,n));
});
