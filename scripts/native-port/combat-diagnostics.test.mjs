import test from 'node:test';
import assert from 'node:assert/strict';
import {isNormalAttackState} from '../../engines/browser-native/combat-workload.mjs';
test('attack diagnostics distinguish Game & Watch normals from its landing states and other fighters specials',()=>{
  const state=(kind,id)=>Object.assign(Array(19).fill(0),{0:id,11:kind});
  for(const id of [341,344,345,346,347,348,349])assert.equal(isNormalAttackState(state(24,id)),true);
  for(const [kind,id]of [[24,350],[24,352],[24,353],[24,375],[16,345],[0,341],[24,14]])assert.equal(isNormalAttackState(state(kind,id)),false);
  for(const kind of [0,16,24])assert.equal(isNormalAttackState(state(kind,65)),true);
});
