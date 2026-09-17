import test from 'node:test';
import assert from 'node:assert/strict';
import {readShapeSet} from '../../engines/browser-native/shape-assets.mjs';
function fixture({additive=false,mutate=()=>{}}={}){
 const bytes=new Uint8Array(192),data=new DataView(bytes.buffer),relocations=new Set([8,12,52,56,60,64]);
 data.setUint16(0,additive?2:5);data.setUint16(2,2);data.setUint32(4,2);data.setUint32(8,32);data.setUint32(12,56);
 [9,3,1,4].forEach((v,i)=>data.setUint32(32+i*4,v));data.setUint16(50,12);data.setUint32(52,96);
 for(let s=0;s<3;s++){data.setUint32(56+s*4,72+s*4);data.setUint16(72+s*4,s);data.setUint16(74+s*4,s+1);}
 for(let i=0;i<12;i++)data.setFloat32(96+i*4,i/4-.5);
 mutate(data,relocations);return {data,relocations,bytes};
}
test('average shape graph converts only CPU samples and consumed indices',()=>{
 const a=fixture(),before=a.bytes.slice(),s=readShapeSet(a,0);
 assert.equal(s.flags,5);assert.equal(s.count,2);assert.deepEqual(s.rows[0].indices,[[0,1],[1,2]]);
 assert(s.words.has(96)&&s.words.has(128));assert(!s.words.has(132));
 assert(!s.pointers.has(64));assert(!s.words.has(72));assert.deepEqual(a.bytes,before);
});
test('additive shape graph includes base plus every delta',()=>{
 const s=readShapeSet(fixture({additive:true}),0);
 assert.equal(s.rows[0].indices.length,3);assert(s.pointers.has(64));assert(s.words.has(140));
});
test('shape samples reject invalid formats, indices and overlapping pointer payload',()=>{
 for(const mutate of [d=>d.setUint16(2,0),d=>d.setUint16(0,3),d=>d.setUint32(36,1),d=>d.setUint32(44,9),d=>d.setUint16(50,4),d=>d.setUint16(72,900),d=>d.setFloat32(96,Infinity),(d,r)=>r.add(96),(d,r)=>r.delete(56)])assert.throws(()=>readShapeSet(fixture({mutate}),0));
});
