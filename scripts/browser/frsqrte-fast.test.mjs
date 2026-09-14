import test from 'node:test';import assert from 'node:assert/strict';
import{readFileSync,writeFileSync,mkdtempSync,rmSync}from'node:fs';
import{execFileSync}from'node:child_process';import{tmpdir}from'node:os';import{join}from'node:path';
test('actual Wasm estimate matches Dolphin across all normal exponents, table boundaries, aliases and fallback classes',()=>{
 const root='engines/wasm-dolphin/vendor/dolphin/Source/Core';
 const source=readFileSync(root+'/Core/PowerPC/CachedInterpreter/CachedInterpreter.cpp','utf8');
 const extract=name=>{const start=source.indexOf('void '+name+'(');assert.ok(start>=0,name);return source.slice(start,source.indexOf('\n}',start)+2);};
 const names=['EmitU32Leb','EmitI32Leb','EmitI32Const','EmitLocalGet','EmitLocalSet','EmitFrsqrteExactFast'];
 const dir=mkdtempSync(join(tmpdir(),'melee-frsqrte-exact-'));
 try{
  const cpp=join(dir,'test.cpp'),exe=join(dir,'test');
  writeFileSync(cpp,`#include <vector>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <bit>
#include "Common/FloatUtils.h"
using s32=int32_t;static u32 s_wasm_specialized_state_base=0;
constexpr u32 FPRF_MASK=0x1f000,FPRF_SHIFT=12,EXCEPTION_DSI=8,EXCEPTION_PROGRAM=128;
struct UGeckoInstruction{u32 FB,FD,Rc;};namespace PPCAnalyst{struct CodeOp{UGeckoInstruction inst;};}
struct WasmStateLayout{u32 ps_offset=256,fpscr_offset=1024,msr_offset=1028;};
u32 PsOffset(const WasmStateLayout& l,u32 r,u32 lane){return l.ps_offset+16*r+8*lane;}
void EmitU32Leb(std::vector<u8>&,u32);void EmitLocalGet(std::vector<u8>&,u32);void EmitI32Const(std::vector<u8>&,u32);
void EmitStateLoadU32(std::vector<u8>&b,u32 off){EmitLocalGet(b,0);b.insert(b.end(),{0x28,2});EmitU32Leb(b,off);}
void EmitStateStoreU32Prefix(std::vector<u8>&b){EmitLocalGet(b,0);}
void EmitStateStoreU32Suffix(std::vector<u8>&b,u32 off){b.insert(b.end(),{0x36,2});EmitU32Leb(b,off);}
void EmitFpuAvailableOrFallback(std::vector<u8>&b,const PPCAnalyst::CodeOp&,const WasmStateLayout&l,u32){EmitStateLoadU32(b,l.msr_offset);EmitI32Const(b,8192);b.insert(b.end(),{0x71,0x04,0x40});}
void EmitFpCall(std::vector<u8>&b,const PPCAnalyst::CodeOp&,u32){b.insert(b.end(),{0x10,0,0x04,0x40,0x41,1,0x0f,0x0b});}
${names.map(extract).join('\n')}
int main(int argc,char**argv){
 if(!strcmp(argv[1],"oracle")){u64 bits;while(fread(&bits,8,1,stdin)==1){bits=std::bit_cast<u64>(Common::ApproximateReciprocalSquareRoot(std::bit_cast<double>(bits)));fwrite(&bits,8,1,stdout);}return 0;}
 if(!strcmp(argv[1],"table")){fwrite(Common::frsqrte_expected.data(),8,32,stdout);return 0;}
 std::vector<u8>b{4,3,0x7f,2,0x7e,1,0x7c,1,0x7f};EmitFrsqrteExactFast(b,{},{{3,(u32)atoi(argv[1]),(u32)atoi(argv[2])}},17,4096,1032);EmitI32Const(b,0);b.push_back(0x0b);fwrite(b.data(),1,b.size(),stdout);
}`);
  execFileSync('c++',['-std=c++20','-O2','-I'+root,cpp,root+'/Common/FloatUtils.cpp','-o',exe]);
  let seed=0x12345678;const rnd=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return seed>>>0;};const bits=[];
  for(let exponent=1;exponent<2047;exponent++)for(let bin=0;bin<16;bin++)for(const offset of[0,1023,2047]){
   const high=(exponent<<20)|((bin*2048+offset)<<5)|(rnd()&31);bits.push((BigInt(high)<<32n)|BigInt(rnd()));
  }
  for(let i=0;i<65536;i++){const high=((1+rnd()%2046)<<20)|(rnd()&0xfffff);bits.push((BigInt(high)<<32n)|BigInt(rnd()));}
  const input=Buffer.alloc(bits.length*8);bits.forEach((b,i)=>input.writeBigUInt64LE(b,i*8));
  const expected=execFileSync(exe,['oracle'],{input,maxBuffer:16*1024*1024});assert.equal(expected.length,input.length);
  const table=execFileSync(exe,['table']);assert.equal(table.length,256);
  const leb=n=>{const a=[];do{const b=n&127;n>>>=7;a.push(b|(n?128:0));}while(n);return a;},str=s=>[...leb(s.length),...Buffer.from(s)],sec=(id,b)=>[id,...leb(b.length),...b];
  for(const fd of[3,4])for(const rc of[0,1]){
   const body=[...execFileSync(exe,[String(fd),String(rc)])];let fallbacks=0;
   const binary=Uint8Array.from([0,97,115,109,1,0,0,0,...sec(1,[2,0x60,0,1,0x7f,0x60,1,0x7f,1,0x7f]),...sec(2,[1,...str('env'),...str('fp'),0,0]),...sec(3,[1,1]),...sec(5,[1,0,1]),...sec(7,[2,...str('run'),0,1,...str('memory'),2,0]),...sec(10,[1,...leb(body.length),...body])]);
   const {exports}=new WebAssembly.Instance(new WebAssembly.Module(binary),{env:{fp:()=>{fallbacks++;return 1;}}});
   const view=new DataView(exports.memory.buffer);new Uint8Array(exports.memory.buffer,4096,256).set(table);
   const target=256+16*fd,sentinel=0x7ff8123456789abcn;view.setBigUint64(target+8,sentinel,true);view.setUint32(1028,8192,true);
   const check=(b,wantFallback,want)=>{
    view.setBigUint64(target,0x4008000000000000n,true);view.setBigUint64(304,b,true);const before=view.getBigUint64(target,true),flags=rnd(),oldCalls=fallbacks;view.setUint32(1024,flags,true);
    assert.equal(exports.run(0),wantFallback?1:0);assert.equal(fallbacks-oldCalls,wantFallback?1:0);
    assert.equal(view.getBigUint64(target,true),wantFallback?before:want,'result bits');
    assert.equal(view.getBigUint64(target+8,true),sentinel,'PS1');
    assert.equal(view.getUint32(1024,true),wantFallback?flags:((flags&~0x1f000)|0x4000)>>>0,'FPSCR');
   };
   for(let i=0;i<bits.length;i++)check(bits[i],!!rc,expected.readBigUInt64LE(i*8));
   for(const b of[0n,0x8000000000000000n,1n,0xfffffffffffffn,0x800fffffffffffffn,0xbff0000000000000n,0x7ff0000000000000n,0xfff0000000000000n,0x7ff0000000000001n,0x7ff8000012345678n])check(b,true);
   for(const exception of[8,128,136]){view.setUint32(1032,exception,true);check(0x3ff0000000000000n,true);}
   view.setUint32(1032,0,true);view.setUint32(1028,0,true);check(0x3ff0000000000000n,true);
  }
 }finally{rmSync(dir,{recursive:true,force:true});}
});
