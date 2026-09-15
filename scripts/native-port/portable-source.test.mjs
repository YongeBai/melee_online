import test from 'node:test';
import assert from 'node:assert/strict';
import {adaptStageCallbacks} from './portable-source.mjs';
const descriptor=callback=>`StageData stage = { Kind, callbacks, "GrTest", init, ${callback}, load, start, predicate, touch, shadow, 1, joints, 3 };`;
test('adapts only the bool demo slot and preserves stage callbacks and function bodies',()=>{
  const body='void demo(bool enabled) { state = enabled; }',source=body+'\n'+descriptor('demo');
  const result=adaptStageCallbacks(source);
  assert.ok(result.text.includes(body));
  assert.ok(result.text.includes(descriptor('port_demo_demo')));
  assert.match(result.text,/static void port_demo_demo\(int value\) \{ demo\(value != 0\); \}/);
  assert.equal(result.adapters.length,1);
  assert.equal(adaptStageCallbacks(result.text).text,result.text);
});
test('retains integer callbacks and adapts explicitly identified cross-file bool callbacks',()=>{
  const source='void demo(int value) { state = value; }\n'+descriptor('demo');
  assert.deepEqual(adaptStageCallbacks(source),{text:source,adapters:[]});
  assert.equal(adaptStageCallbacks(descriptor('shared'),new Set(['shared'])).adapters[0].function,'shared');
});
test('rejects unexpected callback expressions and incomplete stage descriptors',()=>{
  assert.throws(()=>adaptStageCallbacks(descriptor('(void*)demo')),/expression changed/);
  assert.throws(()=>adaptStageCallbacks('StageData stage = { Kind, callbacks };'),/shape changed/);
});
