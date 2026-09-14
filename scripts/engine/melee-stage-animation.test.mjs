import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectStageAnimation} from './melee-stage-animation.js';
test('inventory counts bounded joint channels without changing guest memory', () => {
  const g=0x80600000,j=0x80601000,a=0x80602000,f=0x80602100,p=0x80603000;
  const words=new Map([[0x804d782c,0x80500000],[0x80500014,g],[g+0x2c,g+0x40],
    [g+0x44,g],[g+0x54,1],[g+0x1c,0x8021a60c],[g+0x28,j],[j+0x7c,a],
    [a+0x14,f],[g+0x18,p],[p+0x10,g],[p+0x14,0x801c1cd0]]);
  const bytes=new Map([[g+1,3],[g+0x51,0x40],[f+0x13,6]]);
  const inspect=()=>inspectStageAnimation(n=>words.get(n)||0,n=>bytes.get(n)||0);
  const before=new Map(words),r=inspect().objects[0];
  assert.equal(r.mapId,1);assert.equal(r.joints,1);assert.equal(r.jointChannels,1);
  assert.equal(r.activeJointAnimations,1);assert.deepEqual(r.animationTypes,{6:1});
  assert.deepEqual(words,before);
  for(const[address,value]of[[f,f],[j+8,j],[p,p],[p+0x10,0],[j+0x7c,0x817ffff0]]){
    const old=words.get(address);words.set(address,value);assert.throws(inspect);
    if(old===undefined)words.delete(address);else words.set(address,old);
  }
});
