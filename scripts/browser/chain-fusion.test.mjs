import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
const source=()=>readFileSync('engines/wasm-dolphin/vendor/dolphin/Source/Core/Core/PowerPC/CachedInterpreter/CachedInterpreter.cpp','utf8');
const fn=(s,n)=>{const at=s.search(new RegExp('(?:void|bool) '+n+'\\('));assert.ok(at>=0,n);return s.slice(at,s.indexOf('\n}',at)+2);};
const structure=(s,n)=>{const at=s.indexOf('struct '+n+'\n');assert.ok(at>=0,n);return s.slice(at,s.indexOf('\n};',at)+3);};
const leb=n=>{const a=[];do{const b=n&127;n>>>=7;a.push(b|(n?128:0));}while(n);return a;};
const name=s=>[...leb(s.length),...Buffer.from(s)],section=(id,b)=>[id,...leb(b.length),...b];

test('actual chained boundary emitter preserves every original budget, branch, pause, step and register exit',()=>{
 const dir=mkdtempSync(join(tmpdir(),'melee-chain-'));try{
  const s=source(),cpp=join(dir,'emit.cpp'),exe=join(dir,'emit');
  const functions=['EmitU32Leb','EmitI32Leb','EmitLocalGet','EmitLocalSet','EmitI32Const','EmitF64ConstBits','RegCacheGprIndex','FprCacheIndex','EmitFprLaneGet','EmitFprLaneSet','EmitFprCacheFlush','EmitRegCacheFlushDirty','EmitStateLoadU32','EmitStateStoreU32Prefix','EmitStateStoreU32Suffix','EmitStateStoreF64Suffix','EmitFusionBoundary'].map(n=>fn(s,n)).join('\n');
  const begin=s.indexOf('    if (fusion && op_index == fusion->after_ops)'),end=s.indexOf('\n    }',begin)+6;
  assert.ok(begin>0&&end>begin);
  writeFileSync(cpp,`#include <vector>
#include <cstdint>
#include <cstdio>
#include <cassert>
using u8=uint8_t;using u32=uint32_t;using u64=uint64_t;using s32=int32_t;
u32 s_wasm_specialized_state_base=0,s_fusion_read_fallback_local=0;
bool EmitBlockMsrLoad(std::vector<u8>&,u32){return false;}
u32 s_wasm_emit_state_load_u32_count=0,s_wasm_emit_state_store_u32_count=0,s_wasm_emit_state_store_f64_count=0;
${structure(s,'WasmGprRegCache')} static WasmGprRegCache s_gpr_rc;
${structure(s,'WasmFprRegCache')} static WasmFprRegCache s_fpr_rc;
${structure(s,'WasmFusionBoundary')}
${functions}
int main(){
 std::vector<u8> body{1,8,0x7f};
 s_gpr_rc.active=true;s_gpr_rc.gpr_base=64;s_gpr_rc.present[0]=true;s_gpr_rc.locals[0]=8;
 EmitI32Const(body,0);EmitLocalSet(body,8);
 WasmFusionBoundary chain[7];
 for(u32 i=0;i<7;++i){auto& b=chain[i];b.after_ops=i+1;b.target_pc=0x80001004+i*4;b.pc_offset=0;b.npc_offset=4;b.downcount_offset=8;b.cpu_state=2048;b.running_state=0;b.step_armed=2052;b.step_start=2056;b.step_counter=2060;b.check_target=true;b.soft_exit=true;b.next=i<6?&chain[i+1]:nullptr;}
 const WasmFusionBoundary* fusion=&chain[0];u32 downcount=0,op_index=0;
 for(u32 i=0;i<8;++i){
  ++op_index;downcount+=i+1;
  EmitStateStoreU32Prefix(body);EmitLocalGet(body,8);EmitI32Const(body,i+1);body.push_back(0x6a);EmitStateStoreU32Suffix(body,64);
  EmitStateStoreU32Prefix(body);EmitStateLoadU32(body,128+i*4);EmitStateStoreU32Suffix(body,4);
  EmitLocalGet(body,0);EmitI32Const(body,i);body.insert(body.end(),{0x10,0});
${s.slice(begin,end)}
 }
 assert(!fusion&&downcount==8);
 EmitRegCacheFlushDirty(body);EmitI32Const(body,0);body.push_back(0x0b);fwrite(body.data(),1,body.size(),stdout);
}`);
  execFileSync('c++',['-std=c++20',cpp,'-o',exe]);const body=[...execFileSync(exe)];
  const binary=Uint8Array.from([0,97,115,109,1,0,0,0,...section(1,[2,0x60,2,0x7f,0x7f,0,0x60,1,0x7f,1,0x7f]),...section(2,[1,...name('env'),...name('observe'),0,0]),...section(3,[1,1]),...section(5,[1,3,1,1]),...section(7,[2,...name('run'),0,1,...name('memory'),2,0]),...section(10,[1,...leb(body.length),...body])]);
  const module=new WebAssembly.Module(binary);
  for(const base of [0,512])for(const budget of [-1,0,1,2,3,5,6,9,10,14,15,20,21,27,28,29,36,60])for(let pauseAt=0;pauseAt<=7;pauseAt++)for(let stepAt=0;stepAt<=7;stepAt++)for(let mismatchAt=0;mismatchAt<=7;mismatchAt++){
   let view,calls=0,expectedBudget=budget,expectedReg=0,expectedPc=0x80001000,expectedStatus=0;
   const instance=new WebAssembly.Instance(module,{env:{observe:(ptr,i)=>{assert.equal(ptr,base);assert.equal(i,calls++);assert.equal(view.getInt32(base+8,true),budget-i*(i+1)/2);assert.equal(view.getUint32(base,true),0x80001000+i*4);if(i===pauseAt&&i<7)view.setUint32(2048,1,true);if(i===stepAt&&i<7)view.setUint32(2060,10,true);}}});
   view=new DataView(instance.exports.memory.buffer);view.setInt32(base+8,budget,true);view.setUint32(base,expectedPc,true);view.setUint8(2052,1);view.setUint32(2056,9,true);view.setUint32(2060,9,true);
   for(let i=0;i<8;i++)view.setUint32(base+128+i*4,i===mismatchAt&&i<7?0x81234560:0x80001004+i*4,true);
   let segments=0;
   for(let i=0;i<8;i++){
    segments++;expectedReg+=i+1;expectedBudget-=i+1;expectedPc=i===mismatchAt&&i<7?0x81234560:0x80001004+i*4;
    if(i<7){if(expectedBudget<=0||i===pauseAt||i===stepAt){expectedStatus=1;break;}if(i===mismatchAt){expectedStatus=2;break;}}
   }
   const status=instance.exports.run(base);assert.equal(status,expectedStatus);assert.equal(calls,segments);assert.equal(view.getUint32(base+64,true),expectedReg);
   if(!status){view.setInt32(base+8,view.getInt32(base+8,true)-8,true);view.setUint32(base,view.getUint32(base+4,true),true);}
   assert.equal(view.getInt32(base+8,true),expectedBudget);assert.equal(view.getUint32(base,true),expectedPc);
  }
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('actual extension admission bounds chains and rejects writes, cycles, HLE, faults and non-direct instructions',()=>{
 const dir=mkdtempSync(join(tmpdir(),'melee-chain-policy-'));try{
  const s=source(),begin=s.indexOf('  if (did_merge && chain_fusion)'),end=s.indexOf('\n  const bool compiled_entire_block',begin);
  assert.ok(begin>0&&end>begin);
  const cpp=join(dir,'test.cpp'),exe=join(dir,'test');
  writeFileSync(cpp,`#include <vector>
#include <array>
#include <map>
#include <set>
#include <cstdint>
#include <cassert>
using u32=uint32_t;
constexpr u32 FL_LOADSTORE=1,FL_USE_FPU=2;
struct Info{u32 num_cycles=2,flags=0;};static Info info;
namespace PowerPC{enum class CoreMode{JIT};}
struct Ranges:std::map<u32,u32>{void insert(u32 a,u32 b){(*this)[a]=b;}};
namespace PPCAnalyst{
 struct Inst{u32 OPCD=18;bool LK=false;};
 struct CodeOp{Inst inst;u32 address=0,branchTo=0;bool skip=false,canEndBlock=true,branchIsIdleLoop=false,register_safe=true,final_safe=true,direct=true;const Info*opinfo=&info;};
 struct CodeBlock{bool m_memory_exception=false;u32 m_num_instructions=0;Ranges m_physical_addresses;};
 struct CodeBuffer:std::vector<CodeOp>{using std::vector<CodeOp>::vector;};
}
${structure(s,'WasmFusionBoundary')}
std::map<u32,std::vector<PPCAnalyst::CodeOp>> graph;std::set<u32> faults,hles;
bool IsFusionSafeInstruction(const PPCAnalyst::CodeOp&op,bool reg){return reg?op.register_safe:op.final_safe;}
bool IsPpcWasmDirectInstructionCandidate(const PPCAnalyst::CodeOp&op){return op.direct;}
namespace HLE{bool TryReplaceFunction(int,u32 pc,PowerPC::CoreMode){return hles.count(pc);}}
struct Analyzer{u32 Analyze(u32 pc,PPCAnalyst::CodeBlock*b,PPCAnalyst::CodeBuffer*buf,u32){const auto&ops=graph[pc];b->m_memory_exception=faults.count(pc);b->m_num_instructions=ops.size();for(u32 i=0;i<ops.size();i++)(*buf)[i]=ops[i];b->m_physical_addresses[pc]=pc+4*ops.size();return pc+4*ops.size();}}analyzer;
struct Outcome{u32 boundaries,ops;std::map<u32,u32>physical;};
Outcome run(bool enable=true){
 bool did_merge=true,chain_fusion=enable,merge_write_npc=false,s_wasm_jit_direct_only=true;
 u32 fusion_boundaries=1,merge_downcount=0,merge_loadstores=0,merge_fpinst=0,merge_next_pc=0;
 struct{u32 blockStart=0x1000;}js;int m_ppc_symbol_db=0;struct{struct{bool FP=true;}msr;}m_ppc_state;
 PPCAnalyst::CodeBuffer m_code_buffer(256);PPCAnalyst::CodeBlock code_block;
 std::vector<PPCAnalyst::CodeOp>merge_storage{graph[0x1000][0],graph[0x1004][0]};
 WasmFusionBoundary fusion;fusion.after_ops=1;fusion.target_pc=0x1004;std::array<WasmFusionBoundary,6>extra_fusions{};
${s.slice(begin,end)}
 const WasmFusionBoundary* p=&fusion;for(u32 i=0;i<fusion_boundaries;i++){assert(p&&p->after_ops==i+1);p=p->next;}assert(!p);
 return{fusion_boundaries,static_cast<u32>(merge_storage.size()),code_block.m_physical_addresses};
}
void reset(){graph.clear();faults.clear();hles.clear();for(u32 i=0;i<20;i++){PPCAnalyst::CodeOp op;op.address=0x1000+i*4;op.branchTo=op.address+4;graph[op.address]={op};}}
int main(){
 reset();auto r=run();assert(r.boundaries==7&&r.ops==8&&r.physical.size()==6);
 reset();assert(run(false).ops==2);
 for(u32 i=1;i<7;i++){
  reset();graph[0x1000+i*4][0].register_safe=false;assert(run().ops==i+1);
  reset();graph[0x1000+i*4][0].branchTo=0x1000;assert(run().ops==i+1);
  reset();graph[0x1000+i*4][0].inst.LK=true;assert(run().ops==i+1);
  reset();graph[0x1000+i*4][0].inst.OPCD=16;assert(run().ops==8);
 }
 for(u32 i=2;i<8;i++){
  reset();faults.insert(0x1000+i*4);assert(run().ops==i);
  reset();hles.insert(0x1000+i*4);assert(run().ops==i);
  reset();graph[0x1000+i*4][0].direct=false;assert(run().ops==i);
  reset();graph[0x1000+i*4][0].final_safe=false;assert(run().ops==i);
 }
 reset();graph[0x1008].resize(63,graph[0x1008][0]);assert(run().ops==2);
 reset();graph[0x1008].clear();assert(run().ops==2);
}
`);execFileSync('c++',['-std=c++20',cpp,'-o',exe]);execFileSync(exe);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
