import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
const source=()=>readFileSync('engines/wasm-dolphin/vendor/dolphin/Source/Core/Core/PowerPC/CachedInterpreter/CachedInterpreter.cpp','utf8');
const fn=(s,n)=>{const i=s.search(new RegExp('(?:void|bool) '+n+'\\('));assert.ok(i>=0,n);return s.slice(i,s.indexOf('\n}',i)+2);};
const structure=(s,n)=>{const i=s.indexOf('struct '+n+'\n');assert.ok(i>=0,n);return s.slice(i,s.indexOf('\n};',i)+3);};

test('actual call admission rejects substituted helpers, writes, faults, HLE targets and oversized successors',()=>{
 const s=source(),dir=mkdtempSync(join(tmpdir(),'melee-call-policy-'));
 try{
  const begin=s.indexOf('  // Performance counters retain separate-block execution.'),end=s.indexOf('\n  // Extend only register-only intermediate segments.',begin);
  assert.ok(begin>0&&end>begin);
  const cpp=join(dir,'test.cpp'),exe=join(dir,'test');
  writeFileSync(cpp,`#include <vector>
#include <map>
#include <set>
#include <array>
#include <atomic>
#include <cstdint>
#include <cassert>
using u32=uint32_t;
constexpr u32 FL_LOADSTORE=1,FL_USE_FPU=2,FEATURE_FLAG_PERFMON=1,DOLPHIN_WEB_DISABLE_BLOCK_MERGE=1;
constexpr u32 MELEE_INPUT_STATUS_PC=1,MELEE_STATUS_FN_PC=2,MELEE_SERVICE_POLL_PC=3,MELEE_SI_POLL_PC=4,MELEE_INPUT_POLL_PC=5;
constexpr u32 MELEE_PSMTX_CONCAT_PC=0x80342204;
struct Info{u32 num_cycles=2,flags=0;};static Info info;
namespace PowerPC{enum class CoreMode{JIT};}
struct Ranges:std::map<u32,u32>{void insert(u32 a,u32 b){(*this)[a]=b;}};
namespace PPCAnalyst{
 struct Inst{u32 OPCD=18,SUBOP5=0,SUBOP10=16,target=0;bool LK=false,Rc=false,OE=false;};
 struct CodeOp{Inst inst;u32 address=0,branchTo=0;bool skip=false,canEndBlock=true,branchIsIdleLoop=false,direct=true;const Info*opinfo=&info;};
 struct CodeBlock{bool m_memory_exception=false;u32 m_num_instructions=0;Ranges m_physical_addresses;};
 struct CodeBuffer:std::vector<CodeOp>{using std::vector<CodeOp>::vector;};
}
bool GetDirectBranchOsInterruptTarget(PPCAnalyst::Inst i,u32){return i.target==6;}
bool IsDirectBranchLinkTo(PPCAnalyst::Inst i,u32,u32 target){return i.LK&&i.target==target;}
std::atomic<bool>s_dolphin_web_melee_matrix_fast{false};
${['IsOrdinaryFusionCall','IsMeleeHotFusionCall','IsPairedSingleMergeSubop','IsPairedSingleArithmeticSubop','IsSinglePrecisionArithmeticSubop','IsDoublePrecisionArithmeticSubop','IsFusionSafeInstruction','IsReadFusionLoad'].map(n=>fn(s,n)).join('\n')}
${structure(s,'WasmFusionBoundary')}
std::map<u32,std::vector<PPCAnalyst::CodeOp>> graph;std::set<u32> faults,hles;
bool IsPpcWasmDirectInstructionCandidate(const PPCAnalyst::CodeOp&op){return op.direct;}
namespace HLE{bool TryReplaceFunction(int,u32 pc,PowerPC::CoreMode){return hles.count(pc);}}
struct Analyzer{u32 Analyze(u32 pc,PPCAnalyst::CodeBlock*b,PPCAnalyst::CodeBuffer*buf,u32){const auto&ops=graph[pc];b->m_memory_exception=faults.count(pc);b->m_num_instructions=ops.size();for(u32 i=0;i<ops.size();i++)(*buf)[i]=ops[i];b->m_physical_addresses[pc]=pc+4*ops.size();return pc+4*ops.size();}}analyzer;
std::atomic<bool>s_dolphin_web_call_fusion{false},s_dolphin_web_conditional_fusion{false},s_dolphin_web_read_fusion{false},s_dolphin_web_fusion_redispatch{false};
bool disabled=false,debug=false;bool DolphinWebHelperDisabled(u32){return disabled;}bool IsDebuggingEnabled(){return debug;}
struct Outcome{bool merged,call,reads;u32 ops,cycles;Ranges physical;};
Outcome run(){
 bool did_merge=false,did_call_fusion=false,chain_fusion=false,prefix_ended_block=true,merge_write_npc=false,s_wasm_jit_direct_only=true;
 u32 prefix_count=graph[0x1000].size(),fusion_boundaries=0,merge_downcount=0,merge_loadstores=0,merge_fpinst=0,merge_next_pc=0;
 struct{u32 blockStart=0x1000;}js;int m_ppc_symbol_db=0;struct{u32 feature_flags=0;struct{bool FP=true;}msr;}m_ppc_state;
 PPCAnalyst::CodeBuffer m_code_buffer(256);for(u32 i=0;i<prefix_count;i++)m_code_buffer[i]=graph[0x1000][i];PPCAnalyst::CodeBlock code_block;
 std::vector<PPCAnalyst::CodeOp>merge_storage;WasmFusionBoundary fusion;
${s.slice(begin,end)}
 return{did_merge,did_call_fusion,fusion.track_reads,static_cast<u32>(merge_storage.size()),merge_downcount,code_block.m_physical_addresses};
}
void reset(){
 graph.clear();faults.clear();hles.clear();disabled=debug=false;s_dolphin_web_call_fusion=true;s_dolphin_web_read_fusion=false;
 PPCAnalyst::CodeOp a,b,c;a.address=0x1000;a.inst.OPCD=32;a.canEndBlock=false;b.address=0x1004;b.branchTo=b.inst.target=0x80342204;b.inst.LK=true;
 c.address=0x80342204;c.inst.OPCD=36;c.canEndBlock=false;PPCAnalyst::CodeOp ret;ret.address=0x80342208;ret.inst.OPCD=19;
 graph[0x1000]={a,b};graph[0x80342204]={c,ret};
}
int main(){
 reset();auto r=run();assert(r.merged&&r.call&&r.reads&&r.ops==4&&r.cycles==4&&r.physical.at(0x80342204)==0x8034220c);
 reset();graph[0x2000]=graph[0x80342204];graph[0x1000][1].branchTo=graph[0x1000][1].inst.target=0x2000;assert(!run().merged);
 reset();s_dolphin_web_call_fusion=false;assert(!run().merged);
 reset();graph[0x1000][1].inst.LK=false;assert(!run().merged);s_dolphin_web_read_fusion=true;assert(run().merged&&!run().call);
 for(u32 special=1;special<=6;special++){reset();graph[0x1000][1].inst.target=special;assert(!run().merged);}
 for(u32 opcode:{33u,36u,37u,48u,52u,56u,60u,17u}){reset();graph[0x1000][0].inst.OPCD=opcode;assert(!run().merged);}
 for(u32 opcode:{14u,24u,28u,32u,34u,40u,42u}){reset();graph[0x1000][0].inst.OPCD=opcode;assert(run().merged);}
 reset();graph[0x1000][0].inst.OPCD=18;graph[0x1000][0].inst.LK=true;assert(!run().merged);
 reset();faults.insert(0x80342204);assert(!run().merged);
 reset();hles.insert(0x80342204);assert(!run().merged);
 reset();graph[0x80342204][0].direct=false;assert(!run().merged);
 reset();graph[0x80342204][0].inst.OPCD=31;graph[0x80342204][0].inst.SUBOP10=467;assert(!run().merged);
 reset();graph[0x80342204].resize(63,graph[0x80342204][0]);assert(!run().merged);
 reset();graph[0x80342204].clear();assert(!run().merged);
 reset();graph[0x1000][1].branchTo=0x1000;assert(!run().merged);
 reset();graph[0x1000][1].branchIsIdleLoop=true;assert(!run().merged);
 reset();disabled=true;assert(!run().merged);reset();debug=true;assert(!run().merged);
}
`);
  execFileSync('c++',['-std=c++20',cpp,'-o',exe]);execFileSync(exe);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
