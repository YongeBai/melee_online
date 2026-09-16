import test from 'node:test';
import assert from 'node:assert/strict';
import {convertGameplayParameters,gameplayFields} from '../../engines/browser-native/gameplay-assets.mjs';
function fixture() {
  const body=new Uint8Array(512),d=new DataView(body.buffer),roots=[96,0,120,128,168,192,220,276,296];
  const relocs=gameplayFields.filter((_,i)=>roots[i]);
  roots.forEach((at,i)=>d.setUint32(gameplayFields[i],at));
  for(const [i,value] of [2,50,3,50,-1,-1].entries())d.setInt32(96+i*4,value);
  d.setUint32(120,1);d.setFloat32(124,2.5);
  for(let i=0;i<2;i++){d.setUint32(128+i*20,2);d.setFloat32(132+i*20,-3.25);d.setFloat32(144+i*20,1.5);}
  for(let i=0;i<6;i++){d.setFloat32(168+i*4,i-3);d.setInt16(192+i*2,i);}
  for(let i=0;i<4;i++)d.setFloat32(204+i*4,i+.25);
  for(const offset of [0,28,32]){d.setUint32(220+offset,324);relocs.push(220+offset);}
  d.setInt32(224,-1);d.setInt32(324,2);d.setUint32(328,332);relocs.push(328);d.setInt32(332,-1);d.setInt32(336,12345);
  for(let i=0;i<5;i++)d.setInt32(276+i*4,i);
  for(const [i,offset] of [0,1,8,9,16,17].entries())body[296+offset]=i+1;
  for(const offset of [4,12,24])d.setFloat32(296+offset,4.5);
  const name=new TextEncoder().encode('ftDataMario\0'),bytes=new Uint8Array(32+body.length+relocs.length*4+8+name.length),view=new DataView(bytes.buffer);
  [bytes.length,body.length,relocs.length,1,0].forEach((n,i)=>view.setUint32(i*4,n));bytes.set(body,32);
  relocs.forEach((at,i)=>view.setUint32(32+body.length+i*4,at));bytes.set(name,32+body.length+relocs.length*4+8);
  return {bytes,view};
}
test('gameplay import preserves packed bones, converts signed shorts/floats and retains sound aliases',()=>{
  const f=fixture(),before=f.bytes.slice(),r=convertGameplayParameters(f.bytes,'PlMr.dat',8,10),d=new DataView(r.image.buffer,32);
  assert.deepEqual(f.bytes,before);assert.deepEqual(r.ecb,[0,1,2,3,4,5,.25,1.25,2.25,3.25]);
  assert.deepEqual(r.ik,{bones:[1,2,3,4,5,6],lengths:[4.5,4.5,4.5]});assert.deepEqual(r.sfxLists,[[-1,12345],[-1,12345],[-1,12345]]);
  assert.equal(d.getUint32(220,true),d.getUint32(248,true));assert.equal(d.getInt32(224,true),-1);assert.equal(d.getInt16(194,true),1);assert.equal(d.getFloat32(132,true),-3.25);
  assert.equal(new DataView(r.image.buffer).getUint32(12,true),1);assert.equal(new DataView(r.image.buffer).getUint32(16,true),0);
});
test('gameplay import rejects invalid weights, bones, nonfinite values and pointer/type overlap',()=>{
  for(const mutate of [v=>v.setInt32(100,49),v=>v.setInt32(96,10),v=>v.setInt16(192,-1),v=>v.setUint8(296,8),v=>v.setUint32(124,0x7f800000),v=>v.setUint32(0x44,220),v=>v.setInt32(324,65),v=>v.setUint32(0x58,508)]) {
    const f=fixture();mutate(new DataView(f.bytes.buffer,32,512));assert.throws(()=>convertGameplayParameters(f.bytes,'PlMr.dat',8,10));
  }
});
