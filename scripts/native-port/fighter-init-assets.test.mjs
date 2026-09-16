import test from 'node:test';
import assert from 'node:assert/strict';
import {convertFighterInitialization} from '../../engines/browser-native/fighter-init-assets.mjs';
function fixture() {
  const body=new Uint8Array(608),d=new DataView(body.buffer),relocs=[0,12,16,64,80];
  d.setUint32(0,96);d.setUint32(12,540);d.setUint32(16,564);d.setUint32(64,484);d.setUint32(80,532);
  d.setFloat32(96,1.25);d.setFloat32(484,-3.5);d.setFloat32(532,2.5);body[564]=17;body[565]=91;
  const name=new TextEncoder().encode('ftDataMario\0'),bytes=new Uint8Array(32+body.length+relocs.length*4+8+name.length),view=new DataView(bytes.buffer);
  [bytes.length,body.length,relocs.length,1,0].forEach((n,i)=>view.setUint32(i*4,n));bytes.set(body,32);
  relocs.forEach((at,i)=>view.setUint32(32+body.length+i*4,at));bytes.set(name,32+body.length+relocs.length*4+8);
  return {bytes,view,spec:{codes:['Mr'],counts:[1],commandWords:[1]}};
}
test('fighter initialization preserves input and publishes only typed fields',()=>{
  const f=fixture(),before=f.bytes.slice(),result=convertFighterInitialization(f.bytes,'PlMr.dat',f.spec),view=new DataView(result.image.buffer);
  assert.deepEqual(f.bytes,before);assert.equal(result.expected[0].length,0x184);assert.equal(result.expected[1].length,48);
  assert.equal(view.getFloat32(32+96,true),1.25);assert.equal(view.getFloat32(32+484,true),-3.5);assert.equal(view.getFloat32(32+532,true),2.5);
  assert.deepEqual([...result.mapping],[17,91]);assert.equal(view.getUint32(12,true),1);assert.equal(view.getUint32(16,true),0);
  assert.equal(new TextDecoder().decode(result.image.subarray(result.image.length-30)),'native_fighter_initialization\0');
});
test('fighter initialization rejects missing, overlapping, out-of-range and nonfinite fields',()=>{
  for(const mutate of [v=>v.setUint32(32+64,532),v=>v.setUint32(32+64,540),v=>v.setUint32(32+80,608),v=>v.setUint32(32+484,0x7f800000),v=>v.setUint32(32+16,0xffffffff)]) {
    const f=fixture();mutate(f.view);assert.throws(()=>convertFighterInitialization(f.bytes,'PlMr.dat',f.spec));
  }
});
