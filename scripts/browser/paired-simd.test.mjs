import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';

test('actual SIMD and scalar paired emitters agree byte-for-byte across aliases, rounding and NaNs',()=>{
 const dir=mkdtempSync(resolve(tmpdir(),'melee-paired-simd-'));
 try{
  const source=readFileSync('engines/wasm-dolphin/vendor/dolphin/Source/Core/Core/PowerPC/CachedInterpreter/CachedInterpreter.cpp','utf8');
  const names=['EmitU32Leb','EmitI32Leb','EmitLocalGet','EmitLocalSet','FprCacheIndex','EmitFprLaneGet','EmitFprLaneSet','ConfigureFprCacheLocals','EmitFprCacheFlush','EmitFprCacheReload','EmitStateLoadF64','EmitStateStoreF64Suffix','EmitSimdOpcode','EmitStateLoadPair','EmitStateStorePairSuffix','EmitPairedSingleSimd','EmitPairedSingleAddSub','EmitPairedSingleMulAddSub','EmitPairedSingleScalarMulAdd'];
  const functions=names.map(name=>{const re=new RegExp('(?:void|bool) '+name+'\\(');const at=source.search(re);assert.ok(at>=0,name);return source.slice(at,source.indexOf('\n}',at)+2);}).join('\n');
  const structAt=source.indexOf('struct WasmFprRegCache');const structure=source.slice(structAt,source.indexOf('static WasmFprRegCache s_fpr_rc;',structAt)+'static WasmFprRegCache s_fpr_rc;'.length);
  writeFileSync(resolve(dir,'emit.cpp'),`#include <vector>
#include <cstdint>
#include <vector>
bool EmitBlockMsrLoad(std::vector<uint8_t>&,uint32_t){return false;}
void EmitBlockMsrReload(std::vector<uint8_t>&){}
using s32=int32_t;static uint32_t s_wasm_specialized_state_base=0;
#include <cstdio>
#include <cstdlib>
using u8=uint8_t;using u32=uint32_t;using u64=uint64_t;
struct UGeckoInstruction{u32 SUBOP5,FA,FB,FC,FD;};
namespace PPCAnalyst{struct CodeOp{UGeckoInstruction inst;};}
struct WasmStateLayout{u32 ps_offset;};
u32 PsOffset(const WasmStateLayout&l,u32 r,u32 lane){return l.ps_offset+r*16+lane*8;}
${structure}
bool s_wasm_paired_simd_active=false;u32 s_wasm_paired_simd_local=8;
u32 s_wasm_emit_state_load_f64_count=0,s_wasm_emit_state_store_f64_count=0;
void EmitStateStoreU32Prefix(std::vector<u8>&b){b.insert(b.end(),{0x20,0x00});}
void EmitFpuAvailableOrFallback(std::vector<u8>&b,const PPCAnalyst::CodeOp&,const WasmStateLayout&,u32){b.insert(b.end(),{0x20,0,0x28,2,0,0x04,0x40});}
void EmitFpCall(std::vector<u8>&b,const PPCAnalyst::CodeOp&,u32){b.push_back(0x00);}
${functions}
int main(int argc,char**argv){
 std::vector<u8>b{5,3,0x7f,2,0x7e,1,0x7c,1,0x7f,1,0x7b};WasmStateLayout l{256};
 const u32 sub=atoi(argv[1]);PPCAnalyst::CodeOp op{{sub,0,1,2,(u32)atoi(argv[2])}};
 s_wasm_paired_simd_active=atoi(argv[3]);const int cache_mode=atoi(argv[4]);s_fpr_rc.active=cache_mode!=0;s_fpr_rc.vector=cache_mode==2;s_fpr_rc.base=256;s_fpr_rc.local_base=9;
 ConfigureFprCacheLocals(b,15);EmitFprCacheReload(b);
 if(sub<16)EmitPairedSingleScalarMulAdd(b,l,op,0);
 else if(sub==20||sub==21)EmitPairedSingleAddSub(b,l,op,0);
 else EmitPairedSingleMulAddSub(b,l,op,0);
 EmitFprCacheFlush(b);b.push_back(0x0b);fwrite(b.data(),1,b.size(),stdout);
}`);
  const c=spawnSync('c++',['-std=c++17',resolve(dir,'emit.cpp'),'-o',resolve(dir,'emit')],{encoding:'utf8'});assert.equal(c.status,0,c.stderr);
  const leb=n=>{const a=[];do{const b=n&127;n>>>=7;a.push(b|(n?128:0));}while(n);return a;},str=s=>[...leb(s.length),...Buffer.from(s)],sec=(id,b)=>[id,...leb(b.length),...b];
  const make=(sub,fd,on,cache=0)=>{const e=spawnSync(resolve(dir,'emit'),[sub,fd,on,cache].map(String));assert.equal(e.status,0);const body=[...e.stdout];return new WebAssembly.Instance(new WebAssembly.Module(Uint8Array.from([0,97,115,109,1,0,0,0,...sec(1,[1,0x60,1,0x7f,0]),...sec(3,[1,0]),...sec(5,[1,0,1]),...sec(7,[2,...str('run'),0,0,...str('memory'),2,0]),...sec(10,[1,...leb(body.length),...body])])));};
  const bits=[0n,0x8000000000000000n,0x3ff0000000000000n,0xbff0000000000000n,0x3ff0000010000000n,0x36a0000000000000n,0x3690000000000000n,0x3810000000000000n,1n,0x8000000000000001n,0x7fefffffffffffffn,0x7ff0000000000000n,0xfff0000000000000n,0x7ff0000000000001n,0xfff8000000004321n,0x7ff8000000001234n];
  let seed=0x391257af;const rnd=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return seed>>>0;};
  let cases=0;
  for(const sub of[12,13,14,15,20,21,25,28,29,30,31])for(const fd of[0,1,2,3]){
   const scalar=make(sub,fd,0),simd=make(sub,fd,1),cache=make(sub,fd,1,1),vector=make(sub,fd,1,2);
   const base=new Uint8Array(scalar.exports.memory.buffer),fast=new Uint8Array(simd.exports.memory.buffer),cached=new Uint8Array(cache.exports.memory.buffer),vectorBytes=new Uint8Array(vector.exports.memory.buffer);
   const dv=new DataView(base.buffer);
   for(let k=0;k<512;k++){
    base.fill(0x5a);dv.setUint32(0,1,true);
    for(let lane=0;lane<8;lane++){
     const value=k<256?bits[(k+lane*7)%bits.length]:((BigInt(rnd())<<32n)|BigInt(rnd()));
     dv.setBigUint64(256+lane*8,value,true);
    }
    // Explicit cancellation, overflow and invalid inf*zero combinations.
    if(k<16){dv.setBigUint64(256,bits[k],true);dv.setBigUint64(288,bits[(k+5)%16],true);dv.setBigUint64(272,bits[(k+11)%16],true);}
    fast.set(base);cached.set(base);vectorBytes.set(base);scalar.exports.run(0);simd.exports.run(0);cache.exports.run(0);vector.exports.run(0);
    assert.deepEqual(fast,base,'SIMD '+sub+' FD'+fd+' case'+k);
    assert.deepEqual(cached,base,'FPR-cache scalar fallback '+sub+' FD'+fd+' case'+k);assert.deepEqual(vectorBytes,base,'Vector cache/SIMD '+sub+' FD'+fd+' case'+k);cases++;
   }
   new DataView(fast.buffer).setUint32(0,0,true);
   assert.throws(()=>simd.exports.run(0),WebAssembly.RuntimeError,'FPU-unavailable path still falls back');
  }
  assert.equal(cases,22528);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
