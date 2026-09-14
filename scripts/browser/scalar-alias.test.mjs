import test from'node:test';import assert from'node:assert/strict';import{readFileSync,writeFileSync,mkdtempSync,rmSync}from'node:fs';import{resolve}from'node:path';import{tmpdir}from'node:os';import{spawnSync}from'node:child_process';
test('actual paired-single scalar emitter reads the original scalar when destination aliases it',()=>{
 const dir=mkdtempSync(resolve(tmpdir(),'melee-scalar-alias-'));
 try{
  const source=readFileSync('engines/wasm-dolphin/vendor/dolphin/Source/Core/Core/PowerPC/CachedInterpreter/CachedInterpreter.cpp','utf8');
  const names=['EmitU32Leb','EmitI32Leb','EmitLocalGet','EmitLocalSet','EmitStateLoadF64','EmitStateStoreF64Suffix','EmitPairedSingleScalarMulAdd'];
  const functions=names.map(name=>{const at=source.indexOf('void '+name+'(');assert.ok(at>=0,name);return source.slice(at,source.indexOf('\n}',at)+2);}).join('\n');
  writeFileSync(resolve(dir,'emit.cpp'),`#include <vector>
#include <cstdint>
#include <vector>
bool EmitBlockMsrLoad(std::vector<uint8_t>&,uint32_t){return false;}
void EmitBlockMsrReload(std::vector<uint8_t>&){}
using s32=int32_t;static uint32_t s_wasm_specialized_state_base=0;
#include <cstdio>
#include <cstdlib>
using u8=uint8_t;using u32=uint32_t;
struct UGeckoInstruction{u32 SUBOP5,FA,FB,FC,FD;};
namespace PPCAnalyst{struct CodeOp{UGeckoInstruction inst;};}
struct WasmStateLayout{u32 ps_offset;};
u32 PsOffset(const WasmStateLayout& l,u32 r,u32 lane){return l.ps_offset+r*16+lane*8;}
bool EmitPairedSingleSimd(std::vector<u8>&,const WasmStateLayout&,UGeckoInstruction){return false;}
bool FprCacheIndex(u32,u32*){return false;}
// These fixtures intentionally disable FPR caching; entering it is an error.
void EmitFprLaneGet(std::vector<u8>&,u32){abort();}
void EmitFprLaneSet(std::vector<u8>&,u32){abort();}
struct{u32 locals[64]{};bool dirty[64]{};}s_fpr_rc;
u32 s_wasm_emit_state_load_f64_count=0,s_wasm_emit_state_store_f64_count=0;
void EmitStateStoreU32Prefix(std::vector<u8>&b){b.insert(b.end(),{0x20,0x00});}
void EmitFpuAvailableOrFallback(std::vector<u8>&b,const PPCAnalyst::CodeOp&,const WasmStateLayout&,u32){b.insert(b.end(),{0x41,1,0x04,0x40});}
void EmitFpCall(std::vector<u8>&b,const PPCAnalyst::CodeOp&,u32){b.push_back(0x00);}
${functions}
int main(int argc,char**argv){std::vector<u8>b{3,3,0x7f,2,0x7e,1,0x7c};WasmStateLayout l{256};PPCAnalyst::CodeOp op{{(u32)atoi(argv[1]),0,1,2,(u32)atoi(argv[2])}};EmitPairedSingleScalarMulAdd(b,l,op,0);b.push_back(0x0b);fwrite(b.data(),1,b.size(),stdout);}
`);
  const compiled=spawnSync('c++',['-std=c++17',resolve(dir,'emit.cpp'),'-o',resolve(dir,'emit')],{encoding:'utf8'});assert.equal(compiled.status,0,compiled.stderr);
  const leb=n=>{const a=[];do{const b=n&127;n>>>=7;a.push(b|(n?128:0));}while(n);return a;},str=s=>[...leb(s.length),...Buffer.from(s)],sec=(id,b)=>[id,...leb(b.length),...b];
  for(const subop of[12,13,14,15])for(const fd of[0,1,2,3]){
   const emitted=spawnSync(resolve(dir,'emit'),[String(subop),String(fd)]);assert.equal(emitted.status,0);const body=[...emitted.stdout];
   const binary=Uint8Array.from([0,97,115,109,1,0,0,0,...sec(1,[1,0x60,1,0x7f,0]),...sec(3,[1,0]),...sec(5,[1,0,1]),...sec(7,[2,...str('run'),0,0,...str('memory'),2,0]),...sec(10,[1,...leb(body.length),...body])]);
   const instance=new WebAssembly.Instance(new WebAssembly.Module(binary)),view=new DataView(instance.exports.memory.buffer),initial=[[2,3],[11,13],[5,7],[17,19]],expected=initial.map(v=>[...v]);
   const scalar=initial[2][subop%2],add=subop>=14;
   expected[fd]=initial[0].map((a,lane)=>Math.fround(a*scalar+(add?initial[1][lane]:0)));
   initial.forEach((v,r)=>v.forEach((x,lane)=>view.setFloat64(256+r*16+lane*8,x,true)));
   instance.exports.run(0);
   expected.forEach((v,r)=>v.forEach((x,lane)=>assert.equal(view.getFloat64(256+r*16+lane*8,true),x,'subop '+subop+' destination '+fd+' register '+r+' lane '+lane)));
  }
 }finally{rmSync(dir,{recursive:true,force:true});}
});
