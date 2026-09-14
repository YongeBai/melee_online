import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const cpp=fs.readFileSync('engines/wasm-dolphin/vendor/dolphin/Source/Core/Core/PowerPC/CachedInterpreter/CachedInterpreter.cpp','utf8');
const core=fs.readFileSync('engines/wasm-dolphin/core/upstream/dolphin_web_core.cpp','utf8');
const worker=fs.readFileSync('engines/wasm-dolphin/src/upstream-discio-worker.js','utf8');

test('GX matrix fast path is revision-locked, guarded, and independently selectable',()=>{
  const writer=cpp.slice(cpp.indexOf('bool CachedInterpreter::TryWriteMeleeGxMatrix'),cpp.indexOf('bool CachedInterpreter::TryWriteOsInterruptFunction'));
  const executor=cpp.slice(cpp.indexOf('s32 CachedInterpreter::FastMeleeGxMatrix(PowerPC::PowerPCState&'),cpp.indexOf('s32 CachedInterpreter::FastMeleeTitleLoop'));
  assert.match(writer,/constexpr u32 load_pos_start = 0x80341494/);
  assert.match(writer,/constexpr u32 set_index_start = 0x80341878/);
  assert.match(writer,/constexpr std::array<u32, 15> load_pos_expected/);
  assert.match(writer,/constexpr std::array<u32, 13> write_mtx_expected/);
  assert.match(writer,/constexpr std::array<u32, 33> set_index_expected/);
  assert.match(writer,/IsDebuggingEnabled\(\).*IsBranchWatchEnabled\(\).*IsProfilingEnabled\(\).*jo\.memcheck/s);
  assert.match(executor,/!ppc_state\.msr\.FP.*ppc_state\.msr\.LE.*!HID2\(ppc_state\)\.LSQE/s);
  assert.match(executor,/ppc_state\.spr\[SPR_GQR0\] != 0/);
  assert.match(executor,/TryFastAlignedRamOffset\(ppc_state, ram, ram_size, ppc_state\.gpr\[3\], 48/);
  assert.match(executor,/fifo\.FastWrite8\(0x10\).*fifo\.FastWrite32.*fifo\.FastWrite64/s);
  assert.match(executor,/ppc_state\.ps\[i \/ 2\]\.SetBoth/);
  assert.match(executor,/WriteRamU32BE\(ram, stack_offset \+ 12, old_lr\)/);
  assert.match(executor,/fifo\.FastWrite8\(0x08\).*fifo\.FastWrite8\(high \? 0x40 : 0x30\).*fifo\.FastWrite32\(matrix_index\)/s);
  assert.match(executor,/WriteRamU16BE\(ram, gx_offset \+ 2, 1\)/);
  assert.match(executor,/SetFastCompareField\(ppc_state, 0, static_cast<s32>\(original_index\), s32\{5\}\)/);
  assert.match(core,/melee_gx_matrix_fast = \(extra_flags & 16\) != 0/);
  assert.match(worker,/payload\.gxmatrixfast === true \? 16 : 0/);
});
