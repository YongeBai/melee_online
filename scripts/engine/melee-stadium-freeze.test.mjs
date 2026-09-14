import test from 'node:test';
import assert from 'node:assert/strict';
import {planStadiumTransformations,STADIUM_TRANSFORMATION_CONTROLLER as CONTROLLER} from './melee-stadium-freeze.js';

function fixture() {
  const words = new Map([
    [CONTROLLER,0x7c0802a6],[CONTROLLER+4,0x90010004],[CONTROLLER+8,0x9421ff50],
    [CONTROLLER+12,0xdbe100a8],[CONTROLLER+16,0xdbc100a0],[CONTROLLER+20,0xdba10098],
    [CONTROLLER+24,0xbf610084],[CONTROLLER+28,0x3b830000],
    [0x804d782c,0x81000000],[0x81000014,0x81000100],[0x8100012c,0x81000200],
    [0x81000204,0x81000100],[0x81000214,2],[0x810002d8,3600],
    [0x810002e4,0x81000400],[0x810002e8,0],
  ]);
  const bytes = new Map([[0x810002dc,0],[0x810002dd,0],[0x810002de,0],[0x810002df,5]]);
  const read32 = address => words.get(address) || 0;
  const read8 = address => address === 0x81000101 ? 3 : bytes.get(address) || 0;
  return {words,bytes,read32,read8,apply:plan=>{for(const [address,value] of plan.codeWrites)words.set(address,value);}};
}

test('Stadium freeze disables and exactly restores the checked controller',()=>{
  const f=fixture(),off=planStadiumTransformations(f.read32,f.read8,false);
  assert.equal(off.frozen,true);assert.equal(off.objects[0].activeMap,5);
  assert.deepEqual(off.codeWrites,[[CONTROLLER,0x4e800020]]);f.apply(off);
  assert.deepEqual(planStadiumTransformations(f.read32,f.read8,false).codeWrites,[]);
  const on=planStadiumTransformations(f.read32,f.read8,true);assert.deepEqual(on.codeWrites,[[CONTROLLER,0x7c0802a6]]);
  f.apply(on);assert.equal(f.words.get(CONTROLLER),0x7c0802a6);
});

test('Stadium freeze rejects a transition, wrong map, code drift, ownership and cycles',()=>{
  for(const [address,value,isByte] of [[0x810002dd,1,true],[0x810002df,4,true],[0x810002e8,0x81000500],
    [CONTROLLER+8,0xdeadbeef],[0x81000204,0xdeadbeef]]){
    const f=fixture();(isByte?f.bytes:f.words).set(address,value);assert.throws(()=>planStadiumTransformations(f.read32,f.read8,false));
  }
  const f=fixture();f.words.set(0x81000108,0x81000100);
  assert.throws(()=>planStadiumTransformations(f.read32,f.read8,false),/chain/);
});

test('restoring transformations is allowed after a transition begins',()=>{
  const f=fixture();f.words.set(CONTROLLER,0x4e800020);f.bytes.set(0x810002dd,4);f.bytes.set(0x810002df,3);
  assert.deepEqual(planStadiumTransformations(f.read32,f.read8,true).codeWrites,[[CONTROLLER,0x7c0802a6]]);
});
