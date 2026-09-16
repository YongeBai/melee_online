import test from 'node:test';
import assert from 'node:assert/strict';
import {adaptStageCallbacks,adaptLinkArrowTable} from './portable-source.mjs';
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


test('arrow wobble references its actual float table without relying on unrelated global adjacency',()=>{
  const block='temp_r3 = (f32*) &it_803F6A28 + ip->xDD4_itemVar.linkarrow.x9C;\nvar_f32 = MTXDegToRad((temp_r3[31] * rand) + temp_r3[23]);';
  const converted=adaptLinkArrowTable(block+'\n'+block);
  assert.equal(converted.includes('&it_803F6A28'),false);
  assert.equal(converted.split('&it_803F6A84[').length,3);
  assert.equal(converted.split('(temp_r3[8] * rand) + temp_r3[0]').length,3);
  for(let counter=0;counter<=6;counter++){
    assert.equal(0x803F6A28+(counter+23)*4,0x803F6A84+counter*4);
    assert.equal(0x803F6A28+(counter+31)*4,0x803F6A84+(counter+8)*4);
  }
  assert.throws(()=>adaptLinkArrowTable(block),/changed/);
});
