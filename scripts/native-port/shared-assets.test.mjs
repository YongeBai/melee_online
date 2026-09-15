import test from 'node:test';
import assert from 'node:assert/strict';
import {convertSharedParameters,sharedSections,pendingSharedSections} from '../../engines/browser-native/shared-assets.mjs';
function fixture() {
  const body=new Uint8Array(8192),d=new DataView(body.buffer),relocs=new Set();let cursor=92;
  const alloc=size=>{const at=cursor;cursor+=Math.ceil(size/4)*4;return at;};
  const ptr=(at,target)=>{d.setUint32(at,target);relocs.add(at);};
  const roots=[];for(let i=0;i<23;i++){roots[i]=alloc(i===16||i===20?64:i===22?40:i===6?984:i===7?48:i===0?2072:i===4||i===5?136:i===1?312:i===2?120:i===3?36:i===12?156:i===13?60:i===14?36:i===9?24:i===21?68:[17,18,19].includes(i)?20:8);ptr(i*4,roots[i]);}
  d.setFloat32(roots[0],0.28);body.set([0x12,0x34,0x56,0x78],roots[0]+4);
  const descriptor=alloc(12),joints=alloc(4),parts=alloc(56);ptr(descriptor,joints);ptr(descriptor+4,parts);d.setUint32(descriptor+8,1);
  body.fill(255,parts,parts+56);body[parts]=0;
  for(let i=0;i<34;i++)ptr(roots[4]+i*4,descriptor);
  for(const [section,count] of [[9,3],[10,1],[11,1]])for(let i=0;i<count;i++){const values=alloc(8);ptr(roots[section]+i*8,values);d.setUint32(roots[section]+i*8+4,1);}
  const accessory=alloc(64),animation=alloc(20);ptr(roots[8],accessory);ptr(roots[8]+4,animation);d.setUint32(animation+16,1);
  for(const at of [accessory,roots[16],roots[20]])for(const delta of [32,36,40])d.setFloat32(at+delta,1);
  const scriptTable=alloc(62*4),cpuScript=alloc(4),terminator=alloc(4);
  ptr(roots[22],scriptTable);ptr(scriptTable+4,cpuScript);body.set([128,128,127],cpuScript);
  for(let table=1;table<8;table++){
    const at=alloc(32*4);ptr(roots[22]+table*4,at);for(let i=0;i<32;i++)ptr(at+i*4,terminator);
  }
  ptr(roots[22]+32,alloc(32*4));ptr(roots[22]+36,alloc(6*4));
  const text=new TextEncoder().encode('ftLoadCommonData\0'),bytes=new Uint8Array(32+cursor+relocs.size*4+8+text.length),v=new DataView(bytes.buffer);
  [bytes.length,cursor,relocs.size,1,0].forEach((n,i)=>v.setUint32(i*4,n));bytes.set(body.subarray(0,cursor),32);
  [...relocs].forEach((at,i)=>v.setUint32(32+cursor+i*4,at));bytes.set(text,32+cursor+relocs.size*4+8);
  const spec={size:2072,fields:[{name:'threshold',offset:0,type:'float'},...[0,1,2,3].map(i=>({name:'rgba'+i,offset:4+i,type:'u8'}))]};
  return {bytes,v,roots,descriptor,parts,spec,cpuScript};
}
test('shared importer preserves packed bytes and exposes only converted sections',()=>{
  const f=fixture(),original=f.bytes.slice(),a=convertSharedParameters(f.bytes,f.spec),v=new DataView(a.image.buffer);
  assert.deepEqual(f.bytes,original);assert.equal(v.getFloat32(32+f.roots[0],true),Math.fround(0.28));
  assert.deepEqual(a.image.subarray(32+f.roots[0]+4,32+f.roots[0]+8),new Uint8Array([0x12,0x34,0x56,0x78]));
  assert.deepEqual([...a.cpu.scripts[1].bytes],[128,128,127]);
  assert.deepEqual([...a.image.subarray(32+f.cpuScript,32+f.cpuScript+3)],[128,128,127]);
  assert.equal(a.parts.length,34);assert.deepEqual(a.sections,sharedSections);assert.deepEqual(a.pending,pendingSharedSections);
  assert.equal(v.getUint32(12,true),2);assert.ok(new TextDecoder().decode(a.image).endsWith('native_shared_parameters\0ftLoadCommonData\0'));
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

test('CPU script arguments can equal the terminator and unknown opcodes are rejected',()=>{
  const f=fixture();f.bytes[32+f.cpuScript+1]=127;
  assert.deepEqual([...convertSharedParameters(f.bytes,f.spec).cpu.scripts[1].bytes],[128,127,127]);
  f.bytes[32+f.cpuScript]=0;
  assert.throws(()=>convertSharedParameters(f.bytes,f.spec),/Unknown CPU script opcode/);
});
