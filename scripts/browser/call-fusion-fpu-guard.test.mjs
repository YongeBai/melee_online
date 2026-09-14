import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const source = readFileSync(
  'engines/wasm-dolphin/vendor/dolphin/Source/Core/Core/PowerPC/CachedInterpreter/CachedInterpreter.cpp',
  'utf8',
);
const fn = name => {
  const start = source.search(new RegExp(`bool ${name}\\(`));
  assert.ok(start >= 0, name);
  return source.slice(start, source.indexOf('\n}', start) + 2);
};

test('fused FPU guard proof admits only its verified ordinary call boundary', () => {
  const dir = mkdtempSync(join(tmpdir(), 'melee-call-fpu-proof-'));
  try {
    const cpp = join(dir, 'test.cpp');
    const exe = join(dir, 'test');
    writeFileSync(cpp, `#include <cassert>
#include <cstdint>
#include <optional>
#include <span>
#include <vector>
using u32=uint32_t;
constexpr u32 MELEE_INPUT_STATUS_PC=1,MELEE_STATUS_FN_PC=2,MELEE_SERVICE_POLL_PC=3,MELEE_SI_POLL_PC=4,MELEE_INPUT_POLL_PC=5;
namespace PPCAnalyst {
struct Inst { u32 OPCD=14,SUBOP5=0,SUBOP10=0,target=0; bool LK=false,Rc=false; };
struct CodeOp { Inst inst; u32 address=0; bool skip=false; };
}
bool GetDirectBranchOsInterruptTarget(PPCAnalyst::Inst i,u32){return i.target==6;}
bool IsDirectBranchLinkTo(PPCAnalyst::Inst i,u32,u32 target){return i.LK&&i.target==target;}
bool IsPairedSingleArithmeticSubop(u32 op){return op==1;}
bool IsPairedSingleMergeSubop(u32){return false;}
bool IsSinglePrecisionArithmeticSubop(u32 op){return op==1;}
${fn('IsOrdinaryFusionCall')}
${fn('CanCacheBlockMsr')}
${fn('CanHoistFpuGuard')}
PPCAnalyst::CodeOp fp(){PPCAnalyst::CodeOp o;o.inst.OPCD=59;o.inst.SUBOP5=1;return o;}
PPCAnalyst::CodeOp call(u32 target=0){PPCAnalyst::CodeOp o;o.inst.OPCD=18;o.inst.LK=true;o.inst.target=target;return o;}
int main(){
 std::vector<PPCAnalyst::CodeOp> ops{fp(),call(),fp()};
 assert(!CanHoistFpuGuard(ops));
 assert(!CanHoistFpuGuard(ops,0));
 assert(CanHoistFpuGuard(ops,1));
 for(u32 special=1;special<=6;++special){ops[1]=call(special);assert(!CanHoistFpuGuard(ops,1));}
 ops[1]=call();ops[1].inst.OPCD=16;assert(!CanHoistFpuGuard(ops,1));
 ops[1]=call();ops[1].skip=true;assert(CanHoistFpuGuard(ops,1));
}
`);
    execFileSync('c++', ['-std=c++20', cpp, '-o', exe]);
    execFileSync(exe);
  } finally {
    rmSync(dir, {recursive: true, force: true});
  }
});
