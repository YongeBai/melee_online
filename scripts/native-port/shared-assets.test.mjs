import test from 'node:test';
import assert from 'node:assert/strict';
import {convertSharedParameters,sharedSections,pendingSharedSections} from '../../engines/browser-native/shared-assets.mjs';
function fixture() {
  const body=new Uint8Array(8192),d=new DataView(body.buffer),relocs=new Set();let cursor=92;
  const alloc=size=>{const at=cursor;cursor+=Math.ceil(size/4)*4;return at;};
  const ptr=(at,target)=>{d.setUint32(at,target);relocs.add(at);};
  const roots=[];for(let i=0;i<23;i++){roots[i]=alloc(i===0?2072:i===4||i===5?136:i===1?312:i===2?120:i===3?36:i===12?156:i===13?60:i===14?36:i===9?24:i===21?68:[17,18,19].includes(i)?20:8);ptr(i*4,roots[i]);}
  d.setFloat32(roots[0],0.28);body.set([0x12,0x34,0x56,0x78],roots[0]+4);
  const descriptor=alloc(12),joints=alloc(4),parts=alloc(56);ptr(descriptor,joints);ptr(descriptor+4,parts);d.setUint32(descriptor+8,1);
  body.fill(255,parts,parts+56);body[parts]=0;
  for(let i=0;i<34;i++)ptr(roots[4]+i*4,descriptor);
  for(const [section,count] of [[9,3],[10,1],[11,1]])for(let i=0;i<count;i++){const values=alloc(8);ptr(roots[section]+i*8,values);d.setUint32(roots[section]+i*8+4,1);}
  const text=new TextEncoder().encode('ftLoadCommonData\0'),bytes=new Uint8Array(32+cursor+relocs.size*4+8+text.length),v=new DataView(bytes.buffer);
  [bytes.length,cursor,relocs.size,1,0].forEach((n,i)=>v.setUint32(i*4,n));bytes.set(body.subarray(0,cursor),32);
  [...relocs].forEach((at,i)=>v.setUint32(32+cursor+i*4,at));bytes.set(text,32+cursor+relocs.size*4+8);
  const spec={size:2072,fields:[{name:'threshold',offset:0,type:'float'},...[0,1,2,3].map(i=>({name:'rgba'+i,offset:4+i,type:'u8'}))]};
  return {bytes,v,roots,descriptor,parts,spec};
}
test('shared importer preserves packed bytes and exposes only converted sections',()=>{
  const f=fixture(),original=f.bytes.slice(),a=convertSharedParameters(f.bytes,f.spec),v=new DataView(a.image.buffer);
  assert.deepEqual(f.bytes,original);assert.equal(v.getFloat32(32+f.roots[0],true),Math.fround(0.28));
  assert.deepEqual(a.image.subarray(32+f.roots[0]+4,32+f.roots[0]+8),new Uint8Array([0x12,0x34,0x56,0x78]));
  assert.equal(a.parts.length,34);assert.deepEqual(a.sections,sharedSections);assert.deepEqual(a.pending,pendingSharedSections);
  assert.equal(v.getUint32(12,true),1);assert.equal(new TextDecoder().decode(a.image.subarray(a.image.length-25)),'native_shared_parameters\0');
});
test('shared importer rejects unsafe bone maps and nonfinite physics constants',()=>{
  for(const mutate of [
    f=>f.v.setUint32(32+f.descriptor+8,141),
    f=>f.bytes[32+f.parts]=1,
    f=>f.v.setFloat32(32+f.roots[0],NaN),
    f=>f.v.setFloat32(32+f.roots[2],Infinity),
    f=>f.v.setUint32(32+f.roots[10]+4,257),
  ]){const f=fixture();mutate(f);assert.throws(()=>convertSharedParameters(f.bytes,f.spec));}
});
