import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
const root='engines/wasm-dolphin/vendor/dolphin/Source';
const extract=(s,name)=>{const at=s.indexOf('void '+name+'(');assert.ok(at>=0,name);return s.slice(at,s.indexOf('\n}',at)+2);};
test('actual frsqrte handler preserves hardware estimates, exception enables, Rc and aliased operands',()=>{
 const source=readFileSync(root+'/Core/Core/PowerPC/Interpreter/Interpreter_FloatingPoint.cpp','utf8');
 const upstream=readFileSync(root+'/UnitTests/Common/FloatUtilsTest.cpp','utf8');
 const start=upstream.indexOf('constexpr std::array<u64, 57> expected_values');
 const expected=upstream.slice(start,upstream.indexOf(';',start)+1);
 const dir=mkdtempSync(join(tmpdir(),'melee-frsqrte-'));
 try{
  const cpp=join(dir,'test.cpp'),exe=join(dir,'test');
  writeFileSync(cpp,`#include <array>
#include <bit>
#include <cassert>
#include <cmath>
#include "Common/FloatUtils.h"
#include "${process.cwd()}/${root}/UnitTests/Core/PowerPC/TestValues.h"
constexpr u32 FPSCR_VXSQRT=1,FPSCR_ZX=2,FPSCR_VXSNAN=4;
struct Pair{u64 lo=0,hi=0;double PS0AsDouble(){return std::bit_cast<double>(lo);}void SetPS0(double x){lo=std::bit_cast<u64>(x);}};
struct State{std::array<Pair,32>ps{};struct{u32 VE=0,ZE=0,FI=1,FR=1;void ClearFIFR(){FI=FR=0;}}fpscr;u32 exceptions=0,fprf=99,cr1updates=0;void UpdateFPRFDouble(double x){fprf=Common::ClassifyDouble(x);}void UpdateCR1(){cr1updates++;}};
struct UGeckoInstruction{u32 FD,FB,Rc;};
struct Interpreter{State m_ppc_state;static void frsqrtex(Interpreter&,UGeckoInstruction);};
void SetFPException(State& s,u32 f){s.exceptions|=f;}
${extract(source,'Interpreter::frsqrtex')}
int main(){
 ${expected}
 static_assert(double_test_values.size()==expected_values.size());
 for(size_t i=0;i<double_test_values.size();i++)for(u32 alias:{0u,1u})for(u32 rc:{0u,1u})for(u32 ve:{0u,1u})for(u32 ze:{0u,1u}){
  Interpreter machine;auto& s=machine.m_ppc_state;u32 fb=3,fd=alias?fb:4;constexpr u64 sentinel=0x4008000000000000ULL,other=0x8123456789abcdefULL;
  s.ps[fd].lo=sentinel;s.ps[fb].lo=double_test_values[i];s.ps[fd].hi=other;s.fpscr.VE=ve;s.fpscr.ZE=ze;
  const u64 old=s.ps[fd].lo;const double b=std::bit_cast<double>(double_test_values[i]);
  const u32 exception=b<0?FPSCR_VXSQRT:b==0?FPSCR_ZX:Common::IsSNAN(b)?FPSCR_VXSNAN:0;
  const bool blocked=exception==FPSCR_ZX?ze:exception?ve:false;
  Interpreter::frsqrtex(machine,{fd,fb,rc});
  assert(s.ps[fd].lo==(blocked?old:expected_values[i]));assert(s.ps[fd].hi==other);assert(s.exceptions==exception);assert(s.cr1updates==rc);
  assert(s.fprf==(blocked?99u:Common::ClassifyDouble(std::bit_cast<double>(expected_values[i]))));
  bool cleared=exception||std::isnan(b)||std::isinf(b);assert(s.fpscr.FI==!cleared&&s.fpscr.FR==!cleared);
 }
 // This ordinary input distinguishes Gekko's estimate from the removed exact sqrt path.
 assert(std::bit_cast<u64>(Common::ApproximateReciprocalSquareRoot(1.0))==0x3feffe8000000000ULL);
 assert(Common::ApproximateReciprocalSquareRoot(1.0)!=1.0/std::sqrt(1.0));
}
`);
  execFileSync('c++',['-std=c++20','-O2','-I'+root+'/Core',cpp,root+'/Core/Common/FloatUtils.cpp','-o',exe]);
  execFileSync(exe);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('generated frsqrte Wasm calls the canonical bridge and respects halt/continue state flow',()=>{
 const source=readFileSync(root+'/Core/Core/PowerPC/CachedInterpreter/CachedInterpreter.cpp','utf8');
 const names=['EmitU32Leb','EmitI32Leb','EmitI32Const','EmitLocalGet','EmitImportedHaltCheck','EmitFpCall','EmitFrsqrte'];
 const dir=mkdtempSync(join(tmpdir(),'melee-frsqrte-wasm-'));
 try{
  const cpp=join(dir,'emit.cpp'),exe=join(dir,'emit');
  writeFileSync(cpp,`#include <vector>
#include <cstdint>
#include <cstdio>
using u8=uint8_t;using u32=uint32_t;using s32=int32_t;
void EmitQStateCacheRefreshAfterHelper(std::vector<uint8_t>&){}
static u32 s_wasm_specialized_state_base=0;
struct WasmStateLayout{};namespace PPCAnalyst{struct CodeOp{struct{u32 hex;}inst;u32 address,regsOut;};}
void trace(std::vector<u8>& b,u8 n){b.insert(b.end(),{0x41,n,0x10,0});}
void EmitRegCacheFlushDirty(std::vector<u8>&b){trace(b,1);}
void EmitFprCacheReload(std::vector<u8>&b){trace(b,2);}
void EmitBlockMsrReload(std::vector<u8>&b){trace(b,3);}
void EmitRegCacheReloadMask(std::vector<u8>&b,u32 mask){trace(b,4);if(mask!=5)__builtin_trap();}
${names.map(n=>extract(source,n)).join('\n')}
int main(){std::vector<u8>b{0};EmitFrsqrte(b,{},{{0xfc602034},0x80345678,5},123);trace(b,5);EmitI32Const(b,0);b.push_back(0x0b);fwrite(b.data(),1,b.size(),stdout);}
`);
  execFileSync('c++',['-std=c++20',cpp,'-o',exe]);const body=[...execFileSync(exe)];
  const leb=n=>{const a=[];do{const b=n&127;n>>>=7;a.push(b|(n?128:0));}while(n);return a;},str=s=>[...leb(s.length),...Buffer.from(s)],sec=(id,b)=>[id,...leb(b.length),...b];
  const imports=[12,...str('env'),...str('trace'),0,0];
  for(let i=1;i<12;i++)imports.push(...str('env'),...str('fp'+i),0,1);
  const binary=Uint8Array.from([0,97,115,109,1,0,0,0,...sec(1,[3,0x60,1,0x7f,0,0x60,5,0x7f,0x7f,0x7f,0x7f,0x7f,1,0x7f,0x60,1,0x7f,1,0x7f]),...sec(2,imports),...sec(3,[1,2]),...sec(7,[1,...str('run'),0,12]),...sec(10,[1,...leb(body.length),...body])]);
  for(const halt of [0,1]){
   const trace=[],env={trace:n=>trace.push(n)};
   for(let i=1;i<12;i++)env['fp'+i]=(...args)=>{assert.equal(i,11);trace.push('fp');assert.deepEqual(args.map(x=>x>>>0),[4096,0xfc602034,0x80345678,123,0]);return halt;};
   const {exports}=new WebAssembly.Instance(new WebAssembly.Module(binary),{env});
   assert.equal(exports.run(4096),halt);assert.deepEqual(trace,halt?[1,'fp']:[1,'fp',2,3,4,5]);
  }
 }finally{rmSync(dir,{recursive:true,force:true});}
});
