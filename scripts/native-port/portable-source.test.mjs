import test from 'node:test';
import assert from 'node:assert/strict';
import {adaptStageCallbacks} from './portable-source.mjs';
const descriptor=callback=>`StageData stage = { Kind, callbacks, "GrTest", init, ${callback}, load, start, predicate, touch, shadow, 1, joints, 3 };`;
test('preserves retail integer-bool values through the demo adapter and preserves stage callbacks and function bodies',()=>{
  const body='void demo(bool enabled) { state = enabled; }',source=body+'\n'+descriptor('demo');
  const result=adaptStageCallbacks(source);
  assert.ok(result.text.includes(body));
  assert.ok(result.text.includes(descriptor('port_demo_demo')));
  assert.match(result.text,/static void port_demo_demo\(int value\) \{ demo\(value\); \}/);
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

test('command word fields preserve MSB positions and signed partial views',async()=>{
  const {reverseCommandBits}=await import('./portable-source.mjs');
  const result=reverseCommandBits('u16 opcode : 6; // top six bits\ns16 angle : 8;');
  assert.deepEqual(result.fields,[{field:'opcode',width:6,signed:false,shift:26},{field:'angle',width:8,signed:true,shift:18}]);
  assert.equal(result.text,'\n    u32 : 18;\n    s32 angle : 8;\n    u32 opcode : 6;\n');
  assert.throws(()=>reverseCommandBits('u32 a : 17; u32 b : 16;'),/exceed/);
  assert.throws(()=>reverseCommandBits('u32 a;'),/Unexpected/);
});
