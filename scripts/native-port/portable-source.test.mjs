import test from 'node:test';
import assert from 'node:assert/strict';
import {adaptStageCallbacks,adaptLinkArrowTable,adaptYoshiAttributes,adaptMotionStateWord,adaptPartnerStickConversion} from './portable-source.mjs';
import fs from 'node:fs';

test('Yoshi loader view exposes the actual Egg Throw floats rather than byte padding',()=>{
  const source=fs.readFileSync(new URL('../../engines/melee-decomp/src/melee/ft/kinds/ftYoshi/types.h',import.meta.url),'utf8');
  const converted=adaptYoshiAttributes(source);
  assert.equal(converted.includes('pad_xEC'),false);
  assert.equal(converted.split('float x110;').length,3);
  assert.throws(()=>adaptYoshiAttributes(converted),/overlay changed/);
  assert.throws(()=>adaptYoshiAttributes(source.replace('float x110;','int x110;')),/overlay changed/);
});
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


test('action-state numeric word keeps move ID and partner-copy flags in retail positions',()=>{
  const original=fs.readFileSync(new URL('../../engines/melee-decomp/src/melee/ft/types.h',import.meta.url),'utf8');
  const result=adaptMotionStateWord(original);
  const layout=Object.fromEntries(result.fields.map(f=>[f.field,[f.word,f.shift,f.width]]));
  assert.deepEqual(layout.move_id,[2,24,8]);
  assert.deepEqual(layout.x9_b0,[2,23,1]);
  assert.deepEqual(layout.x9_b1,[2,22,1]);
  assert.deepEqual(layout.x9_b7,[2,16,1]);
  assert.deepEqual(layout.xA,[2,8,8]);assert.deepEqual(layout.xB,[2,0,8]);
  assert.equal(result.fields.reduce((n,f)=>n+f.width,0),32);
  const strip=s=>s.replace(/struct MotionState \{[\s\S]*?\n\};/,'');
  assert.equal(strip(result.text),strip(original));
  assert.throws(()=>adaptMotionStateWord(result.text),/layout changed/);
  assert.throws(()=>adaptMotionStateWord(original.replace('u8 xB;','u16 xB;')),/shape changed/);
});

test('partner input conversion goes through signed integer before keeping the low byte',()=>{
  const original=fs.readFileSync(new URL('../../engines/melee-decomp/src/melee/ft/kinds/ftCommon/ftCo_0A01.c',import.meta.url),'utf8');
  const result=adaptPartnerStickConversion(original);
  assert.match(result,/return \(u8\) \(s32\) \(127\.0F \* x\);/);
  assert.match(result,/return \(u8\) \(s32\) \(128\.0F \* x\);/);
  assert.equal(result.replaceAll('(u8) (s32) (127.0F * x)','127.0F * x').replaceAll('(u8) (s32) (128.0F * x)','128.0F * x'),original);
  assert.throws(()=>adaptPartnerStickConversion(result),/conversion changed/);
});

test('pause bounds adapter preserves the original function and removes its mismatched callback cast',async()=>{
 const {adaptPauseBounds}=await import('./portable-source.mjs');
 const text=fs.readFileSync(new URL('../../engines/melee-decomp/src/melee/cm/camera.c',import.meta.url),'utf8'),converted=adaptPauseBounds(text);
 const start=text.indexOf('s32 Camera_SetBounds(Vec4* arg0)'),end=text.indexOf('void Camera_SetUpPauseCamera',start);
 assert(converted.includes(text.slice(start,end).trim()));assert(converted.includes('Camera_SetBounds(&values);'));
 for(const [field,value]of [['y_max','x'],['y_min','y'],['x_min','z'],['x_max','w']])assert(converted.includes('bounds->'+field+'=values.'+value));
 assert(!converted.includes('(void (*)(Camera_x2D0*))(Event) Camera_SetBounds'));assert.throws(()=>adaptPauseBounds(converted),/changed/);
});
