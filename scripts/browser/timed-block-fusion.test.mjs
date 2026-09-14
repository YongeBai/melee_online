import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {resolve} from 'node:path';import {tmpdir} from 'node:os';import {execFileSync} from 'node:child_process';
const source=()=>readFileSync('engines/wasm-dolphin/vendor/dolphin/Source/Core/Core/PowerPC/CachedInterpreter/CachedInterpreter.cpp','utf8');
const fn=(s,n)=>{const at=s.search(new RegExp('(?:void|bool) '+n+'\\('));assert.ok(at>=0,n);return s.slice(at,s.indexOf('\n}',at)+2);};
const structure=(s,n)=>{const at=s.indexOf('struct '+n+'\n');assert.ok(at>=0,n);return s.slice(at,s.indexOf('\n};',at)+3);};
test('actual fused boundary preserves conditional exits, timing and dirty registers',()=>{
 const dir=mkdtempSync(resolve(tmpdir(),'melee-fusion-'));try{
 const s=source();
 const functions=['EmitU32Leb','EmitI32Leb','EmitLocalGet','EmitLocalSet','EmitI32Const','EmitF64ConstBits','RegCacheGprIndex','FprCacheIndex','EmitFprLaneGet','EmitFprLaneSet','EmitFprCacheFlush','EmitRegCacheFlushDirty','EmitStateLoadU32','EmitStateStoreU32Prefix','EmitStateStoreU32Suffix','EmitStateStoreF64Suffix','EmitFusionBoundary','EmitStoreStateU32Const','EmitStoreNpcConst','EmitUnconditionalBranch'].map(n=>fn(s,n)).join('\n');
 const cpp=resolve(dir,'emit.cpp'),exe=resolve(dir,'emit');
 writeFileSync(cpp,`#include <vector>
#include <cstdint>
#include <cstdio>
#include <cassert>
using u8=uint8_t;using u32=uint32_t;using u64=uint64_t;using s32=int32_t;
union UGeckoInstruction{u32 hex;struct{u32 LK:1,AA:1,LI:24,OPCD:6;};};
namespace PPCAnalyst{struct CodeOp{UGeckoInstruction inst{};u32 address=0;};}
struct WasmStateLayout{u32 npc_offset=4;};
constexpr u32 SPR_LR=8,MELEE_INPUT_STATUS_PC=1,MELEE_STATUS_FN_PC=2,MELEE_SERVICE_POLL_PC=3;
u32 SprOffset(const WasmStateLayout&,u32 reg){assert(reg==SPR_LR);return 512;}
s32 SignExt26(u32 n){return static_cast<s32>(n<<6)>>6;}
const u32* GetDirectBranchOsInterruptTarget(UGeckoInstruction,u32){return nullptr;}
bool IsDirectBranchLinkTo(UGeckoInstruction,u32,u32){return false;}
void EmitFastOsInterruptCall(std::vector<u8>&,u32,u32){assert(false);}
void EmitFastMeleeInputStatusCall(std::vector<u8>&,u32){assert(false);}
void EmitFastMeleeStatusCall(std::vector<u8>&,u32,u32){assert(false);}
void EmitFastMeleeServicePollCall(std::vector<u8>&,u32,u32){assert(false);}
u32 s_wasm_specialized_state_base=0;
u32 s_fusion_read_fallback_local=11;
bool EmitBlockMsrLoad(std::vector<u8>&,u32){return false;}
u32 s_wasm_emit_state_load_u32_count=0,s_wasm_emit_state_store_u32_count=0,s_wasm_emit_state_store_f64_count=0;
${structure(s,'WasmGprRegCache')} static WasmGprRegCache s_gpr_rc;
${structure(s,'WasmFprRegCache')} static WasmFprRegCache s_fpr_rc;
${structure(s,'WasmFusionBoundary')}
${functions}
int main(int argc,char**argv){
 const bool conditional=argc>1&&argv[1][0]=='1';
 // Params: state0. Scratch1..7, GPR8, scalar FPR9, i64 scratch10.
 std::vector<u8>b{4,8,0x7f,1,0x7c,1,0x7e,1,0x7f};
 EmitStateLoadU32(b,16);EmitLocalSet(b,11);
 s_gpr_rc.active=true;s_gpr_rc.gpr_base=64;s_gpr_rc.present[0]=true;s_gpr_rc.locals[0]=8;
 s_fpr_rc.active=true;s_fpr_rc.base=256;s_fpr_rc.present[0]=true;s_fpr_rc.locals[0]=9;s_fpr_rc.scratch_local=10;
 EmitStateStoreU32Prefix(b);EmitI32Const(b,0xabcdef01);EmitStateStoreU32Suffix(b,64);
 EmitStateStoreU32Prefix(b);EmitF64ConstBits(b,0x7ff8000012345678ull);EmitStateStoreF64Suffix(b,256);
 // A's native branch still writes NPC, then the original boundary commits A.
 if(conditional){EmitStateStoreU32Prefix(b);EmitStateLoadU32(b,12);EmitStateStoreU32Suffix(b,4);}
 else{PPCAnalyst::CodeOp call;call.address=0x80001000;call.inst.hex=0x48000235;EmitUnconditionalBranch(b,WasmStateLayout{},call,7);}
 WasmFusionBoundary f{3,0x80001234,0,8,2048,0,2052,2056,2060};f.check_target=conditional;f.soft_exit=argc>2&&argv[2][0]=='1';f.npc_offset=4;EmitFusionBoundary(b,f,7);
 assert(s_gpr_rc.dirty[0]&&s_fpr_rc.dirty[0]);
 // Imported B helper observes the real state, then B modifies its registers.
 EmitLocalGet(b,0);b.insert(b.end(),{0x10,0});
 EmitStateStoreU32Prefix(b);EmitI32Const(b,0x01234567);EmitStateStoreU32Suffix(b,64);
 EmitStateStoreU32Prefix(b);EmitF64ConstBits(b,0x8000000000000000ull);EmitStateStoreF64Suffix(b,256);
 EmitRegCacheFlushDirty(b);
 EmitStateStoreU32Prefix(b);EmitI32Const(b,0x80002000);EmitStateStoreU32Suffix(b,4);
 EmitI32Const(b,0);b.push_back(0x0b);fwrite(b.data(),1,b.size(),stdout);
}`);
 execFileSync('c++',['-std=c++20',cpp,'-o',exe]);for(const conditional of [false,true])for(const soft of [false,true]){const body=[...execFileSync(exe,[conditional?'1':'0',soft?'1':'0'])];
 const leb=n=>{const a=[];do{const b=n&127;n>>>=7;a.push(b|(n?128:0));}while(n);return a;};
 const name=s=>[...leb(s.length),...Buffer.from(s)],section=(id,b)=>[id,...leb(b.length),...b];
 const binary=Uint8Array.from([0,97,115,109,1,0,0,0,...section(1,[2,0x60,1,0x7f,0,0x60,1,0x7f,1,0x7f]),...section(2,[1,...name('env'),...name('observe'),0,0]),...section(3,[1,1]),...section(5,[1,3,1,1]),...section(7,[2,...name('run'),0,1,...name('memory'),2,0]),...section(10,[1,...leb(body.length),...body])]);
 for(const npc of [0x80001234,0x80004560])for(const base of [0,512])for(const budget of [-1,0,6,7,8,20])for(const paused of [0,1])for(const armed of [0,1])for(const changed of [0,1])for(const fallback of [0,1]){
  let view,calls=0;const module=new WebAssembly.Instance(new WebAssembly.Module(binary),{env:{observe:ptr=>{calls++;assert.equal(ptr,base);assert.equal(view.getInt32(base+8,true),budget-7,'helper sees committed A cycles');assert.equal(view.getUint32(base,true),0x80001234);assert.equal(view.getUint32(base+4,true),0x80001234);}}});
  view=new DataView(module.exports.memory.buffer);view.setUint32(base+512,0xdeadbeef,true);view.setUint32(base+16,fallback,true);view.setInt32(base+8,budget,true);view.setUint32(base+12,npc,true);view.setInt32(2048,paused,true);view.setUint8(2052,armed);view.setUint32(2056,0xffffffff,true);view.setUint32(2060,changed?0:0xffffffff,true);
  const halted=module.exports.run(base),hard=fallback||budget<=7||paused||armed&&changed,mismatch=conditional&&npc!==0x80001234,stop=hard||mismatch;
  assert.equal(halted,stop?(soft&&!hard&&mismatch?2:1):0);assert.equal(calls,stop?0:1);
  assert.equal(view.getUint32(base+512,true),conditional?0xdeadbeef:0x80001004,'native bl preserves LR on every budget/pause/step/fallback boundary');
  assert.equal(view.getUint32(base+64,true),stop?0xabcdef01:0x01234567,'sticky GPR flush');
  assert.equal(view.getBigUint64(base+256,true),stop?0x7ff8000012345678n:0x8000000000000000n,'sticky FPR flush');
  // Match RunWasmBlock: a halted boundary returns without final B bookkeeping.
  if(!halted){view.setUint32(base,view.getUint32(base+4,true),true);view.setInt32(base+8,view.getInt32(base+8,true)-5,true);}
  assert.equal(view.getInt32(base+8,true),budget-7-(stop?0:5));assert.equal(view.getUint32(base,true),stop?(conditional?npc:0x80001234):0x80002000);
 }
 } }finally{rmSync(dir,{recursive:true,force:true});}
});
test('fusion policy forbids memory writes in A and system changes in both segments',()=>{
 const dir=mkdtempSync(resolve(tmpdir(),'melee-fusion-policy-'));try{
 const s=source(),functions=['IsPairedSingleMergeSubop','IsPairedSingleArithmeticSubop','IsSinglePrecisionArithmeticSubop','IsDoublePrecisionArithmeticSubop','IsFusionSafeInstruction'].map(n=>fn(s,n)).join('\n');
 const cpp=resolve(dir,'test.cpp'),exe=resolve(dir,'test');writeFileSync(cpp,`#include <cstdint>
#include <cassert>
#include <initializer_list>
using u32=uint32_t;struct Inst{u32 OPCD=14,SUBOP5=0,SUBOP10=0;bool LK=false,Rc=false,OE=false;};namespace PPCAnalyst{struct CodeOp{bool skip=false;Inst inst;};}
${functions}
int main(){PPCAnalyst::CodeOp op;
 for(u32 opcode:{14u,24u,28u,18u}){op.inst.OPCD=opcode;assert(IsFusionSafeInstruction(op,true));assert(IsFusionSafeInstruction(op,false));}
 for(u32 opcode:{32u,36u,48u,52u,56u,60u}){op.inst.OPCD=opcode;assert(!IsFusionSafeInstruction(op,true));assert(IsFusionSafeInstruction(op,false));}
 op.inst.OPCD=31;for(u32 subop:{23u,151u,279u,407u}){op.inst.SUBOP10=subop;assert(!IsFusionSafeInstruction(op,true));assert(IsFusionSafeInstruction(op,false));}
 for(u32 subop:{83u,146u,339u,467u,54u,86u,598u}){op.inst.SUBOP10=subop;assert(!IsFusionSafeInstruction(op,true));assert(!IsFusionSafeInstruction(op,false));}
 op.inst.OPCD=18;op.inst.LK=true;assert(!IsFusionSafeInstruction(op,true));assert(!IsFusionSafeInstruction(op,false));op.inst.LK=false;
 op.inst.OPCD=17;assert(!IsFusionSafeInstruction(op,true));assert(!IsFusionSafeInstruction(op,false));
 op.inst.OPCD=4;op.inst.SUBOP5=25;assert(IsFusionSafeInstruction(op,true));op.inst.Rc=true;assert(!IsFusionSafeInstruction(op,true));
}`);execFileSync('c++',['-std=c++20',cpp,'-o',exe]);execFileSync(exe);
 assert.match(s,/!IsDebuggingEnabled\(\) && \(m_ppc_state.feature_flags & FEATURE_FLAG_PERFMON\) == 0/);
 assert.match(s,/for \(auto \[from, to\] : next_block.m_physical_addresses\)\s+code_block.m_physical_addresses.insert\(from, to\)/);
 assert.match(s,/merge_storage.push_back\(m_code_buffer\[i\]\)/);
 assert.match(s,/EmitFusionBoundary\(body, \*fusion, downcount\);[\s\S]*?downcount = 0;/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
