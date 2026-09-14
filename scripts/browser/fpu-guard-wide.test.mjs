import test from 'node:test';import assert from 'node:assert/strict';import{readFileSync,writeFileSync,mkdtempSync,rmSync}from'node:fs';import{execFileSync}from'node:child_process';import{resolve}from'node:path';import{tmpdir}from'node:os';
const fn=(s,n)=>{const at=s.search(new RegExp('(?:bool|void|u32) '+n+'\\('));assert.ok(at>=0,n);return s.slice(at,s.indexOf('\n}',at)+2);};
test('wide FPU admission permits ordinary integer operations but excludes state-changing instructions',()=>{
 const source=readFileSync('engines/wasm-dolphin/vendor/dolphin/Source/Core/Core/PowerPC/CachedInterpreter/CachedInterpreter.cpp','utf8');const dir=mkdtempSync(resolve(tmpdir(),'melee-fpu-wide-'));
 try{const cpp=resolve(dir,'test.cpp'),exe=resolve(dir,'test');writeFileSync(cpp,`#include <vector>
#include <span>
#include <cstdint>
#include <cassert>
#include <algorithm>
using u32=uint32_t;constexpr u32 SPR_XER=1,SPR_LR=8,SPR_CTR=9;
struct UGeckoInstruction{u32 OPCD=0,SUBOP10=0,SUBOP5=0,SPR=0,SPRU=0,SPRL=0;bool LK=false,Rc=false,OE=false;};namespace PPCAnalyst{struct CodeOp{UGeckoInstruction inst;bool skip=false;};}
${['DecodeMfsprIndex','DecodeMtsprIndex','IsPairedSingleMergeSubop','IsPairedSingleArithmeticSubop','IsSinglePrecisionArithmeticSubop','IsDoublePrecisionArithmeticSubop','CanCacheBlockMsr','CanHoistFpuGuard','IsFusionSafeInstruction','CanHoistFpuGuardWide'].map(n=>fn(source,n)).join('\n')}
int main(){
 PPCAnalyst::CodeOp fp;fp.inst.OPCD=4;fp.inst.SUBOP5=25;
 std::vector<PPCAnalyst::CodeOp> ops{fp,fp};assert(CanHoistFpuGuard(ops)&&CanHoistFpuGuardWide(ops));
 const std::vector<u32> allowed{0,11,19,24,26,28,32,60,75,124,144,316,444,476,536,792,824,922,954,8,10,40,104,136,138,202,235,266,23,55,87,119,151,183,215,247,279,311,343,375,407,439};
 for(u32 subop=0;subop<1024;subop++){
  PPCAnalyst::CodeOp integer;integer.inst.OPCD=31;integer.inst.SUBOP10=subop;integer.inst.SUBOP5=subop&31;integer.inst.OE=(subop>>9)&1;
  auto candidate=ops;candidate.insert(candidate.begin()+1,integer);
  assert(!CanHoistFpuGuard(candidate));
  assert(CanHoistFpuGuardWide(candidate)==(std::find(allowed.begin(),allowed.end(),subop)!=allowed.end()));
  candidate[1].skip=true;assert(CanHoistFpuGuardWide(candidate));
 }
 for(u32 subop:{339u,467u})for(u32 spr=0;spr<1024;spr++){PPCAnalyst::CodeOp op;op.inst.OPCD=31;op.inst.SUBOP10=subop;op.inst.SPR=((spr&31)<<5)|(spr>>5);op.inst.SPRU=spr>>5;op.inst.SPRL=spr&31;auto candidate=ops;candidate.push_back(op);assert(CanHoistFpuGuardWide(candidate)==(spr==1||spr==8||spr==9));}
 for(u32 opcode:{0u,17u,63u}){PPCAnalyst::CodeOp forbidden;forbidden.inst.OPCD=opcode;auto candidate=ops;candidate.push_back(forbidden);assert(!CanHoistFpuGuardWide(candidate));}
 for(u32 opcode:{16u,18u,19u}){PPCAnalyst::CodeOp linked;linked.inst.OPCD=opcode;linked.inst.SUBOP10=16;linked.inst.LK=true;auto candidate=ops;candidate.push_back(linked);assert(!CanHoistFpuGuardWide(candidate));}
 ops.resize(1);assert(!CanHoistFpuGuardWide(ops));
 ops[0].inst.OPCD=48;ops.push_back(ops[0]);assert(!CanHoistFpuGuardWide(ops));
}
`);execFileSync('c++',['-std=c++20',cpp,'-o',exe]);execFileSync(exe);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
