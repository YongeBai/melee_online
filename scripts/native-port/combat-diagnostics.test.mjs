import test from 'node:test';
import assert from 'node:assert/strict';
import {combatWorkload,isNormalAttackState} from '../../engines/browser-native/combat-workload.mjs';
test('attack diagnostics distinguish Game & Watch normals from its landing states and other fighters specials',()=>{
  const state=(kind,id)=>Object.assign(Array(19).fill(0),{0:id,11:kind});
  for(const id of [341,344,345,346,347,348,349])assert.equal(isNormalAttackState(state(24,id)),true);
  for(const [kind,id]of [[24,350],[24,352],[24,353],[24,375],[16,345],[0,341],[24,14]])assert.equal(isNormalAttackState(state(kind,id)),false);
  for(const kind of [0,16,24])assert.equal(isNormalAttackState(state(kind,65)),true);
});
test('attack diagnostics include Ness charged smash states and exclude PK Flash',()=>{
  const state=id=>Object.assign(Array(19).fill(0),{0:id,11:8});
  for(const id of [341,342,343,344,345,346,347])assert.equal(isNormalAttackState(state(id)),true);
  for(const id of [348,349,350,351,358,368,14])assert.equal(isNormalAttackState(state(id)),false);
});

test('Peach float aerials and weapon smashes count as attacks, excluding float and specials',()=>{
  const state=id=>{const s=Array(19).fill(0);s[0]=id;s[11]=9;return s;};
  for(const id of [344,345,346,347,348,349,350,351])assert.equal(isNormalAttackState(state(id)),true);
  for(const id of [341,342,343,352,361,365,369])assert.equal(isNormalAttackState(state(id)),false);
});

test('combat workload jumps inward from opposing teeter edges',()=>{
  const states=[[245,-28,1],[246,28,-1]].map(([motion,x,facing])=>{const s=Array(19).fill(0);s[0]=motion;s[4]=x;s[16]=facing;return s;});
  assert.deepEqual(combatWorkload(120,states),[[0x400,.5,0],[0x400,-.5,0]]);
});
