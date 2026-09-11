import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

test('actual cache loop batching matches single iterations and invalidates all sizes',()=>{
  const source=readFileSync(new URL('../../engines/wasm-dolphin/vendor/dolphin/Source/Core/Core/PowerPC/CachedInterpreter/CachedInterpreter.cpp',import.meta.url),'utf8');
  const start=source.indexOf('s32 CachedInterpreter::FastDcbxLoop('),end=source.indexOf('\n#ifdef __EMSCRIPTEN__',source.indexOf('return sizeof(AnyCallback) + sizeof(operands);',start));
  assert.ok(start>0&&end>start);
  const method=source.slice(start,end).replace('CachedInterpreter::FastDcbxLoop','FastDcbxLoop');
  const dir=mkdtempSync(join(tmpdir(),'melee-dcb-batch-'));
  try {
    const cpp=join(dir,'test.cpp'),exe=join(dir,'test');
    writeFileSync(cpp,`
#include <cstdint>
#include <cassert>
#include <tuple>
#include <vector>
#include <algorithm>
#include <limits>
using u32=uint32_t;using s32=int32_t;using AnyCallback=void(*)();
constexpr int SPR_CTR=9,DCBX_LOOP_COUNT_GPR=1;
struct Inst{u32 SUBOP10=86,RA=0,RB=3;};using UGeckoInstruction=Inst;
namespace PowerPC{struct PowerPCState{u32 gpr[32]{},spr[1024]{};s32 downcount=0;bool m_enable_dcache=false;struct{bool PR=false;}msr;u32 perf=0;};}
using DcbxLoopOperands=std::tuple<int,u32,Inst,u32,u32,u32>;
std::vector<u32> invalidated;bool enabled=false;int exceptions=0,singles=0;
namespace Core{struct System{static System& GetInstance(){static System s;return s;}System& GetJitInterface(){return *this;}void InvalidateICacheLines(u32 a,u32 n){for(u32 i=0;i<n;i++)invalidated.push_back((a&~31u)+i*32);}};}
bool DolphinWebFeatureEnabled(u32){return enabled;}
void GeneratePrivilegedFastInstructionException(PowerPC::PowerPCState&,u32){exceptions++;}
void ExecuteDcbxCacheOperation(Core::System&,PowerPC::PowerPCState&,Inst,u32){singles++;}
void UpdatePerformanceMonitorIfNeeded(u32 cycles,u32,u32,PowerPC::PowerPCState&s){s.perf+=cycles;}
u32 SaturatingAddU32(u32 a,u32 b){return std::min<uint64_t>(uint64_t(a)+b,0xffffffffu);}
u32 s_fast_dcbx_loop_blocks=0,s_fast_dcbx_loop_extra_iterations=0,s_fast_dcbx_loop_lines=0;
${method}
int main(){
  for(u32 mode:{0u,1u})for(u32 cycles:{3u,4u,9u})for(s32 budget:{-1,0,1,2,3,4,9,10,30,31,65536})
  for(u32 count:{0u,1u,2u,3u,31u,32u,33u,64u,129u,0x80000000u,0xffffffffu}){
    PowerPC::PowerPCState a,b;a.gpr[3]=0xffffffe8;a.gpr[4]=count;a.spr[SPR_CTR]=count;a.downcount=budget;b=a;
    const DcbxLoopOperands op{0,0x80001200,{},cycles,4,mode};
    auto tail=[&](auto&s){s.gpr[3]+=32;if(mode)s.gpr[4]-=32;else s.spr[SPR_CTR]--;s.downcount-=cycles;s.perf+=cycles;};
    invalidated.clear();enabled=true;
    do {FastDcbxLoop(a,op);tail(a);}while(a.downcount>0&&(mode?static_cast<s32>(a.gpr[4])>0:a.spr[SPR_CTR]!=0));
    const auto batched=invalidated;
    invalidated.clear();enabled=false;
    do {FastDcbxLoop(b,op);tail(b);}while(b.downcount>0&&(mode?static_cast<s32>(b.gpr[4])>0:b.spr[SPR_CTR]!=0));
    assert(a.gpr[3]==b.gpr[3]&&a.gpr[4]==b.gpr[4]&&a.spr[SPR_CTR]==b.spr[SPR_CTR]);
    assert(a.downcount==b.downcount&&a.perf==b.perf);assert(batched==invalidated);
  }
  PowerPC::PowerPCState s;s.downcount=30000;s.spr[SPR_CTR]=4000;
  enabled=true;invalidated.clear();FastDcbxLoop(s,{0,0,{},3,4,0});assert(invalidated.size()==4000);
  s.m_enable_dcache=true;invalidated.clear();FastDcbxLoop(s,{0,0,{},3,4,0});assert(singles==1&&invalidated.empty());
  s.msr.PR=true;FastDcbxLoop(s,{0,0,{470,0,3},3,4,0});assert(exceptions==1&&singles==1);
}
`);
    execFileSync('c++',['-std=c++20','-O2',cpp,'-o',exe],{stdio:'pipe'});
    execFileSync(exe,[],{stdio:'pipe'});
  } finally {rmSync(dir,{recursive:true,force:true});}
});
