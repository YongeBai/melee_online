import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const cpp = readFileSync(
  'engines/wasm-dolphin/vendor/dolphin/Source/Core/Core/PowerPC/CachedInterpreter/CachedInterpreter.cpp',
  'utf8',
);
const header = readFileSync(
  'engines/wasm-dolphin/vendor/dolphin/Source/Core/Core/PowerPC/CachedInterpreter/CachedInterpreter.h',
  'utf8',
);

test('Melee animation fast path recognizes and completes constant/linear interpolation', () => {
  assert.match(cpp, /linear_update_prefix = \{\{[\s\S]*0x8036ae9c, 0x2c000002[\s\S]*0x8036aea0, 0x4182008c/);
  assert.match(cpp, /\(op == 1 \|\| op == 2\)/);
  assert.match(cpp, /fobj_signature != 0x5188478a/);
  assert.match(cpp, /if \(op == 1\)[\s\S]*constant_at_least : constant_less;[\s\S]*else[\s\S]*linear_init_nonzero/);
  assert.match(cpp, /BuildMeleeJObjUpdateOperands\(power_pc\)/);
  assert.match(cpp, /ppc_state\.pc = 0x8036affc/);
});

test('constant and linear fused paths carry separate exact accounting', () => {
  for (const field of ['constant_less', 'constant_at_least', 'linear_cached',
    'linear_init_nonzero', 'linear_init_zero', 'callback_setup']) {
    assert.match(header, new RegExp(`std::array<u32, 3> ${field};`));
    assert.match(cpp, new RegExp(field));
  }
  assert.match(header, /MeleeJObjUpdateOperands jobj_update;/);
  assert.match(cpp, /cycles \+= interpolation_metric\[0\]/);
});
