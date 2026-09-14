import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';import {execFileSync} from 'node:child_process';import {resolve} from 'node:path';import {tmpdir} from 'node:os';
const file='engines/wasm-dolphin/vendor/dolphin/Source/Core/Core/PowerPC/CachedInterpreter/CachedInterpreter.cpp';
function fn(s,n){const re=new RegExp('(?:void|bool|u32) '+n+'\\([^;]+?\\)\\n\\{','g');const m=[...s.matchAll(re)].at(-1);assert.ok(m,n);return s.slice(m.index,s.indexOf('\n}',m.index)+2);}
const leb=n=>{const a=[];do{const x=n&127;n>>>=7;a.push(n?x|128:x);}while(n);return a;};const section=(id,b)=>[id,...leb(b.length),...b],name=s=>[s.length,...Buffer.from(s)];
test('actual FPU guard emitters preserve first fault and reuse only admitted proofs',()=>{
 const dir=mkdtempSync(resolve(tmpdir(),'melee-fpuguard-'));try{
 const s=readFileSync(file,'utf8'),start=s.indexOf('struct WasmFpuGuardProof'),end=s.indexOf('\nvoid EmitFirstFpuGuard',start);assert.ok(start>0&&end>start);
 const cpp=resolve(dir,'emit.cpp'),exe=resolve(dir,'emit');writeFileSync(cpp,`#include <vector>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <atomic>
#include <cassert>
using u8=uint8_t;using u32=uint32_t;using s32=int32_t;
void EmitQStateCacheRefreshAfterHelper(std::vector<uint8_t>&){}
static u32 s_wasm_specialized_state_base=0;static std::atomic<u32>s_fpu_guard_blocks{0},s_fpu_guard_sites{0};
struct WasmStateLayout{u32 msr_offset=0;};namespace PPCAnalyst{struct CodeOp{u32 address=0;};}
${['EmitU32Leb','EmitI32Leb','EmitLocalGet','EmitLocalSet','EmitI32Const'].map(n=>fn(s,n)).join('\n')}
void EmitStateLoadU32(std::vector<u8>&b,u32 offset){EmitLocalGet(b,0);b.insert(b.end(),{0x28,2});EmitU32Leb(b,offset);}
void EmitFprCacheReload(std::vector<u8>&){}void EmitBlockMsrReload(std::vector<u8>&){}
${fn(s,'EmitImportedHaltCheck')}
void EmitFpCall(std::vector<u8>&b,const PPCAnalyst::CodeOp&op,u32 cycles){EmitLocalGet(b,0);EmitI32Const(b,op.address);EmitI32Const(b,cycles);b.insert(b.end(),{0x10,0});EmitImportedHaltCheck(b);}
${s.slice(start,end)}
${fn(s,'EmitFirstFpuGuard')}
${fn(s,'EmitFpuAvailableOrFallback')}
int main(int argc,char**argv){
 const bool enabled=atoi(argv[1]);s_fpu_guard={true,true};{ScopedFpuGuardProof scope;assert(!s_fpu_guard.active&&!s_fpu_guard.available);s_fpu_guard={true,true};}assert(s_fpu_guard.active&&s_fpu_guard.available);s_fpu_guard={};
 ScopedFpuGuardProof scope;s_fpu_guard.active=enabled;std::vector<u8>b{0};WasmStateLayout layout;
 // Earlier integer work is observable even when the first FP instruction faults.
 EmitLocalGet(b,0);EmitI32Const(b,0x12345678);b.insert(b.end(),{0x36,2,16});
 for(u32 n=0;n<4;n++){
  PPCAnalyst::CodeOp op{0x80001200+4*n};EmitFirstFpuGuard(b,layout,op,9+3*n);
  EmitFpuAvailableOrFallback(b,op,layout,9+3*n);
  EmitLocalGet(b,0);EmitI32Const(b,100+n);b.insert(b.end(),{0x36,2,20});
  b.push_back(0x05);EmitFpCall(b,op,9+3*n);b.push_back(0x0b);
 }
 assert(s_fpu_guard_blocks==unsigned(enabled));assert(s_fpu_guard_sites==unsigned(enabled)*4);
 EmitI32Const(b,0);b.push_back(0x0b);fwrite(b.data(),1,b.size(),stdout);
}`);execFileSync('c++',['-std=c++20',cpp,'-o',exe]);
 const modules=[0,1].map(enabled=>{const b=[...execFileSync(exe,[String(enabled)])];return new WebAssembly.Module(Uint8Array.from([0,97,115,109,1,0,0,0,...section(1,[2,0x60,3,0x7f,0x7f,0x7f,1,0x7f,0x60,1,0x7f,1,0x7f]),...section(2,[1,...name('env'),...name('fault'),0,0]),...section(3,[1,1]),...section(5,[1,0,1]),...section(7,[2,...name('run'),0,1,...name('memory'),2,0]),...section(10,[1,...leb(b.length),...b])]));});
 let rng=0x47a0;for(let i=0;i<5000;i++){
  rng=(Math.imul(rng,1664525)+1013904223)>>>0;const msr=rng,base=i%2?128:0,budget=i-2500;let reference;
  for(const module of modules){let view,calls=0;const instance=new WebAssembly.Instance(module,{env:{fault:(ptr,pc,cycles)=>{calls++;assert.equal(ptr,base);assert.equal(view.getUint32(base+16,true),0x12345678);assert.equal(view.getUint32(base,true)&8192,0,'fault called only with unavailable FPU');view.setUint32(base+4,pc,true);view.setInt32(base+8,view.getInt32(base+8,true)-cycles,true);return 1;}}});view=new DataView(instance.exports.memory.buffer);view.setUint32(base,msr,true);view.setInt32(base+8,budget,true);const halted=instance.exports.run(base),state=[halted,calls,...new Uint8Array(instance.exports.memory.buffer,base,24)];
   if(!reference)reference=state;else assert.deepEqual(state,reference);
   assert.equal(halted,msr&8192?0:1);assert.equal(calls,msr&8192?0:1);assert.equal(view.getUint32(base+20,true),msr&8192?103:0);assert.equal(view.getInt32(base+8,true),msr&8192?budget:budget-9);if(!(msr&8192))assert.equal(view.getUint32(base+4,true),0x80001200);
  }
 }
 assert.match(s,/s_fpu_guard.active=s_dolphin_web_fpu_guard_hoist.load\(std::memory_order_relaxed\) && \(s_dolphin_web_fpu_guard_wide.load\(std::memory_order_relaxed\) \? CanHoistFpuGuardWide\(ops\) : CanHoistFpuGuard\(ops, fused_call_index\)\)/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('actual unavailable-FPU helper always halts at original PC and cycles',()=>{
 const dir=mkdtempSync(resolve(tmpdir(),'melee-fpufault-'));try{const s=readFileSync(file,'utf8'),cpp=resolve(dir,'test.cpp'),exe=resolve(dir,'test');writeFileSync(cpp,`#include <cstdint>
#include <cassert>
using u32=uint32_t;constexpr u32 EXCEPTION_FPU_UNAVAILABLE=0x800;u32 s_wasm_helper_halt_count=0;
namespace PowerPC{struct PowerPCState{struct{bool FP=false;}msr;u32 pc=3;int downcount=100;u32 Exceptions=4;};}
int checks=0;namespace Core{struct System{static System&GetInstance(){static System s;return s;}System&GetPowerPC(){return *this;}void CheckExceptions(){checks++;}};}
${fn(s,'DolphinWeb_CachedInterpreterCheckFpu')}
int main(){for(bool available:{false,true}){PowerPC::PowerPCState state;state.msr.FP=available;checks=s_wasm_helper_halt_count=0;assert(DolphinWeb_CachedInterpreterCheckFpu(state,0x80001200,9)==!available);assert(state.pc==(available?3:0x80001200));assert(state.downcount==(available?100:91));assert(state.Exceptions==(available?4:4|EXCEPTION_FPU_UNAVAILABLE));assert(checks==!available&&s_wasm_helper_halt_count==!available);}}
`.replace('#include <cassert>','#include <cassert>\n#include <initializer_list>'));execFileSync('c++',['-std=c++20',cpp,'-o',exe]);execFileSync(exe);}finally{rmSync(dir,{recursive:true,force:true});}
});
