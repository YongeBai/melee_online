import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {resolve} from 'node:path';import {tmpdir} from 'node:os';import {spawnSync} from 'node:child_process';
test('actual paired memory SIMD preserves endian conversion, NaNs, single lanes and eight-byte boundaries',()=>{
 const dir=mkdtempSync(resolve(tmpdir(),'melee-psq-simd-'));
 try{
  const source=readFileSync('engines/wasm-dolphin/vendor/dolphin/Source/Core/Core/PowerPC/CachedInterpreter/CachedInterpreter.cpp','utf8');
  const names=['EmitU32Leb','EmitI32Leb','EmitLocalGet','EmitLocalSet','EmitI32Const','EmitF64ConstBits','FprCacheIndex','EmitFprLaneGet','EmitFprLaneSet','ConfigureFprCacheLocals','EmitFprCacheFlush','EmitFprCacheReload','EmitStateLoadF64','EmitStateStoreF64Suffix','EmitRamOffset','EmitRamAddress','EmitBswap32FromLocal','EmitLoadU32BigEndianFromRamAddressOffset','EmitStoreU32BigEndianToRamAddressOffset','EmitLoadPsqFloatLane','EmitStorePsqFloatLane','EmitSimdOpcode','EmitStateLoadPair','EmitStateStorePairSuffix','EmitSimdSwap32','EmitPsqFloatMemorySimd','EmitPsqFloatRam'];
  const functions=names.map(name=>{const at=source.search(new RegExp('(?:void|bool) '+name+'\\('));assert.ok(at>=0,name);return source.slice(at,source.indexOf('\n}',at)+2);}).join('\n');
  const structAt=source.indexOf('struct WasmFprRegCache');const structure=source.slice(structAt,source.indexOf('static WasmFprRegCache s_fpr_rc;',structAt)+'static WasmFprRegCache s_fpr_rc;'.length);
  writeFileSync(resolve(dir,'emit.cpp'),`#include <vector>
#include <cstdint>
#include <atomic>
#include <vector>
bool EmitBlockMsrLoad(std::vector<uint8_t>&,uint32_t){return false;}
void EmitBlockMsrReload(std::vector<uint8_t>&){}
using s32=int32_t;static uint32_t s_wasm_specialized_state_base=0;
#include <cstdio>
#include <cstdlib>
using u8=uint8_t;using u32=uint32_t;using s32=int32_t;using u64=uint64_t;
std::atomic<bool>s_dolphin_web_bswap_rotate{false};std::atomic<u32>s_bswap_rotate_sites{0};
struct UGeckoInstruction{u32 W,RD,RS;};struct WasmStateLayout{u32 ps_offset,ram_base;};
u32 PsOffset(const WasmStateLayout&l,u32 r,u32 lane){return l.ps_offset+r*16+lane*8;}
${structure}
bool s_wasm_paired_memory_simd_active=false;u32 s_wasm_paired_simd_local=8;
u32 s_wasm_emit_state_load_f64_count=0,s_wasm_emit_state_store_f64_count=0;
void EmitStateStoreU32Prefix(std::vector<u8>&b){b.insert(b.end(),{0x20,0x00});}
${functions}
int main(int argc,char**argv){
 std::vector<u8>b{5,3,0x7f,2,0x7e,1,0x7c,1,0x7f,1,0x7b};WasmStateLayout l{256,4096};
 UGeckoInstruction inst{(u32)atoi(argv[2]),3,3};s_wasm_paired_memory_simd_active=atoi(argv[3]);const int cache_mode=atoi(argv[4]);s_fpr_rc.active=cache_mode!=0;s_fpr_rc.vector=cache_mode==2;s_fpr_rc.base=256;s_fpr_rc.local_base=9;
 ConfigureFprCacheLocals(b,8);EmitFprCacheReload(b);
 EmitI32Const(b,(u32)strtoul(argv[5],nullptr,10));EmitLocalSet(b,1);
 EmitPsqFloatRam(b,l,inst,atoi(argv[1]));EmitFprCacheFlush(b);b.push_back(0x0b);fwrite(b.data(),1,b.size(),stdout);
}`);
  const compiled=spawnSync('c++',['-std=c++17',resolve(dir,'emit.cpp'),'-o',resolve(dir,'emit')],{encoding:'utf8'});assert.equal(compiled.status,0,compiled.stderr);
  const leb=n=>{const a=[];do{const b=n&127;n>>>=7;a.push(b|(n?128:0));}while(n);return a;},str=s=>[...leb(s.length),...Buffer.from(s)],sec=(id,b)=>[id,...leb(b.length),...b];
  const make=(load,w,on,cache,address)=>{const e=spawnSync(resolve(dir,'emit'),[load,w,on,cache,address].map(String));assert.equal(e.status,0);const body=[...e.stdout];return new WebAssembly.Instance(new WebAssembly.Module(Uint8Array.from([0,97,115,109,1,0,0,0,...sec(1,[1,0x60,1,0x7f,0]),...sec(3,[1,0]),...sec(5,[1,0,1]),...sec(7,[2,...str('run'),0,0,...str('memory'),2,0]),...sec(10,[1,...leb(body.length),...body])])));};
  const special=[0n,0x8000000000000000n,0x3ff0000010000000n,1n,0x8000000000000001n,0x36a0000000000000n,0x7fefffffffffffffn,0x7ff0000000000000n,0xfff0000000000000n,0x7ff0000000000001n,0xfff8000000004321n,0x7ff8000000001234n];
  const floatBits=[0,0x80000000,0x3f800000,0x7f800000,0xff800000,0x7f800001,0x7fc01234,0xffc01234,1,0x80000001,0x7f7fffff];
  let seed=0x418722cd;const rnd=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return seed>>>0;};let count=0;
  for(const load of[0,1])for(const w of[0,1])for(const offset of[0,3,64,65536-4096-(w?4:8)]){
   const addr=(0x80000000+offset)>>>0,reference=make(load,w,0,0,addr),candidate=make(load,w,1,0,addr),cache=make(load,w,1,1,addr),vector=make(load,w,1,2,addr);
   const base=new Uint8Array(reference.exports.memory.buffer),fast=new Uint8Array(candidate.exports.memory.buffer),cached=new Uint8Array(cache.exports.memory.buffer),vectorBytes=new Uint8Array(vector.exports.memory.buffer),dv=new DataView(base.buffer);
   for(let k=0;k<1024;k++){
    base.fill(0x5a);
    for(let i=0;i<2;i++)dv.setBigUint64(304+i*8,k<special.length*special.length?special[(k+i*5)%special.length]:(BigInt(rnd())<<32n)|BigInt(rnd()),true);
    for(let i=0;i<(w?1:2);i++)dv.setUint32(4096+offset+i*4,k<121?floatBits[(k+i*7)%floatBits.length]:rnd(),false);
    fast.set(base);cached.set(base);vectorBytes.set(base);reference.exports.run(0);candidate.exports.run(0);cache.exports.run(0);vector.exports.run(0);
    assert.deepEqual(fast,base,'SIMD load'+load+' W'+w+' offset'+offset+' case'+k);
    assert.deepEqual(cached,base,'cache scalar fallback load'+load+' W'+w+' offset'+offset+' case'+k);assert.deepEqual(vectorBytes,base,'Vector cache/SIMD load'+load+' W'+w+' offset'+offset+' case'+k);count++;
   }
  }
  assert.equal(count,16384);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
