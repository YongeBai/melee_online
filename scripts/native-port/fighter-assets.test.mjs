import test from 'node:test';
import assert from 'node:assert/strict';
import {convertFighterAttributes} from '../../engines/browser-native/fighter-assets.mjs';
function fighter() {
  const size=0x60+0x184,name=new TextEncoder().encode('ftDataFox\0');
  const bytes=new Uint8Array(32+size+4+8+name.length),v=new DataView(bytes.buffer);
  [bytes.length,size,1,1,0].forEach((x,i)=>v.setUint32(i*4,x));
  v.setUint32(32,0x60);v.setInt32(32+0x60+0x58,2);v.setFloat32(32+0x60+0x5c,0.23);
  v.setInt32(32+0x60+0x16c,7);
  bytes.set([0xa5,0x11,0x22,0x33],32+0x60+0x180);
  bytes.set(name,32+size+12);
  return {bytes,v};
}
test('fighter attribute conversion preserves integers and packed throw bytes',()=> {
  const f=fighter(),out=convertFighterAttributes(f.bytes,'PlFx.dat'),v=new DataView(out.bytes.buffer);
  assert.equal(v.getInt32(0x58,true),2);
  assert.equal(v.getFloat32(0x5c,true),Math.fround(0.23));
  assert.equal(v.getInt32(0x16c,true),7);
  assert.deepEqual([...out.bytes.subarray(0x180)],[0xa5,0x11,0x22,0x33]);
  assert.equal(out.values.at(-1),0xa5);
});
test('fighter converter rejects wrong identities, ranges and nonfinite fields',()=> {
  assert.throws(()=>convertFighterAttributes(fighter().bytes,'PlMr.dat'),/root/);
  const f=fighter();f.v.setUint32(32,0x180);
  assert.throws(()=>convertFighterAttributes(f.bytes,'PlFx.dat'),/attributes/);
  const g=fighter();g.v.setFloat32(32+0x60+0x5c,Infinity);
  assert.throws(()=>convertFighterAttributes(g.bytes,'PlFx.dat'),/Nonfinite/);
});
