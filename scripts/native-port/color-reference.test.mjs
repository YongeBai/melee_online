import test from 'node:test';
import assert from 'node:assert/strict';
import {createColorReference} from '../../engines/browser-native/color-reference.mjs';
import {readMotionScripts} from '../../engines/browser-native/motion-assets.mjs';
import {colorCommandWords} from '../../engines/browser-native/color-assets.mjs';
const word=(op,value=0)=>((op<<26)|value)>>>0;
function program(words,relocations=[]) {
  const data=new DataView(new ArrayBuffer(words.length*4));words.forEach((w,i)=>data.setUint32(i*4,w));
  return {data,relocations:new Set(relocations)};
}
test('color fade rounds each float operation and ends before another blend step',()=>{
  const archive=program([word(18),0x0a0a0a0a,word(19,4),0x32323232,word(11,4),word(10)]);
  const r=createColorReference(archive,{entries:[{script:0,priority:0}]},0);
  for(const expected of [20,30,40,50]){assert.equal(r.step(),false);assert.equal(r.state.color[0],expected);}
  assert.equal(r.state.colorValue[0],50.5);assert.equal(r.step(),true);assert.equal(r.state.colorValue[0],50.5);
});
test('color light angles retain signed fields and priority rejection preserves state',()=>{
  const archive=program([word(13)|(1<<25)|((-30&4095)<<12)|15,0x10203040,word(11,5),word(10)]);
  const table={entries:[{script:0,priority:0},{script:0,priority:10},{script:0,priority:5}]},r=createColorReference(archive,table,1);
  assert.equal(r.step(),false);assert.deepEqual(r.state.rotation,[-30,15]);assert.equal(r.state.lightEnabled,true);
  const before=r.values(100);assert.equal(r.select(2,3),false);assert.deepEqual(r.values(100),before);
  assert.equal(r.select(1,2),true);assert.equal(r.step(),false);assert.equal(r.step(),true);
});
test('color end opcode is a boundary and external event parameter words stay opaque',()=>{
  const archive=program([word(21),0xffffffff,0,0,0,word(22),0xffffffff,0,word(23),word(10)]);
  const graph=readMotionScripts(archive,[0],colorCommandWords,{terminalOpcodes:[0,6,7,10]});
  assert.equal(graph.commands.size,4);assert.equal(graph.words.size,10);
  const r=createColorReference(archive,{entries:[{script:0,priority:0}]},0);
  assert.equal(r.step(),true);assert.deepEqual(r.state.events,[1,1,1]);assert.equal(r.state.pc,36);
  assert.throws(()=>readMotionScripts(archive,[0],colorCommandWords),/out of bounds/);
});
