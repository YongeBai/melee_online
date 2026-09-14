import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const source=()=>readFileSync('engines/wasm-dolphin/vendor/dolphin/Source/Core/Core/PowerPC/CachedInterpreter/CachedInterpreter.cpp','utf8');
function fn(s,name){const at=s.search(new RegExp('(?:void|bool) '+name+'\\('));assert.ok(at>=0,name);return s.slice(at,s.indexOf('\n}',at)+2);}
test('constant address proof preserves wraparound and invalidates unknown writes and boundaries',()=>{
 const dir=mkdtempSync(join(tmpdir(),'address-proof-'));try{
 const s=source(),start=s.indexOf('struct WasmConstantAddressProof\n'),end=s.indexOf('\n};',start)+3;assert.ok(start>0);
 const cpp=`#include <array>
#include <optional>
#include <vector>
#include <cstdint>
#include <cassert>
using u32=uint32_t;using s32=int32_t;
struct Inst{u32 OPCD=0,RA=0,RD=0,RS=0,SUBOP10=0,UIMM=0;int16_t SIMM_16=0;bool OE=false;};
namespace PPCAnalyst{struct CodeOp{Inst inst;bool skip=false;std::vector<int> regsOut;};}
${s.slice(start,end)}
int main(){
 WasmConstantAddressProof p;PPCAnalyst::CodeOp o;
 o.inst.OPCD=15;o.inst.RD=9;o.inst.SIMM_16=static_cast<int16_t>(0xcc01);o.regsOut={9};p.Advance(o);
 o.inst.OPCD=38;o.inst.RA=9;o.inst.SIMM_16=-32768;o.regsOut={};assert(p.Address(o)==0xcc008000u);p.Advance(o);
 o.inst.OPCD=36;assert(p.Address(o)==0xcc008000u);
 o.inst.OPCD=32;o.regsOut={9};p.Advance(o);assert(!p.Address(o));
 o.inst.OPCD=14;o.inst.RA=0;o.inst.RD=7;o.inst.SIMM_16=-1;o.regsOut={7};p.Advance(o);
 o.inst.OPCD=36;o.inst.RA=7;o.inst.SIMM_16=1;o.regsOut={};assert(p.Address(o)==0u);
 o.inst.OPCD=37;p.Advance(o);assert(p.gpr[7]==0u);
 o.inst.OPCD=18;p.Advance(o);assert(!p.gpr[7]);
 o.inst.OPCD=32;o.inst.RA=0;o.inst.SIMM_16=-4;assert(p.Address(o)==0xfffffffcu);
 // Generate arithmetic/memory traces with random initial registers; every
 // proved address must match an independent execution of the register trace.
 u32 rng=0xbad5eed;auto random=[&](){rng^=rng<<13;rng^=rng>>17;rng^=rng<<5;return rng;};
 for(int trial=0;trial<20000;trial++){
  WasmConstantAddressProof proof;std::array<u32,32> regs;for(auto&v:regs)v=random();
  for(int step=0;step<80;step++){
   PPCAnalyst::CodeOp op;auto&i=op.inst;i.RA=random()%32;i.RD=random()%32;i.RS=random()%32;i.UIMM=random()&65535;i.SIMM_16=static_cast<int16_t>(i.UIMM);
   const u32 choice=random()%12;
   i.OPCD=choice<2?14+choice:choice<6?24+choice-2:choice<10?32+(choice-6)*2:choice==10?37:18;
   if(i.OPCD==14||i.OPCD==15)op.regsOut={static_cast<int>(i.RD)};
   else if(i.OPCD>=24&&i.OPCD<=27)op.regsOut={static_cast<int>(i.RA)};
   else if(i.OPCD==32||i.OPCD==34)op.regsOut={static_cast<int>(i.RD)};
   else if(i.OPCD==37)op.regsOut={static_cast<int>(i.RA)};
   op.skip=(random()%25)==0;
   const u32 ea=(i.RA?regs[i.RA]:0u)+static_cast<u32>(static_cast<s32>(i.SIMM_16));
   if(const auto proven=proof.Address(op))assert(*proven==ea);
   proof.Advance(op);if(op.skip)continue;
   if(i.OPCD==14||i.OPCD==15)regs[i.RD]=(i.RA?regs[i.RA]:0u)+(i.OPCD==15?static_cast<u32>(i.SIMM_16)<<16:static_cast<u32>(i.SIMM_16));
   else if(i.OPCD>=24&&i.OPCD<=27){const u32 imm=i.UIMM<<((i.OPCD&1)?16:0);regs[i.RA]=i.OPCD<26?(regs[i.RS]|imm):(regs[i.RS]^imm);}
   else if(i.OPCD==32||i.OPCD==34)regs[i.RD]=random();
   else if(i.OPCD==37)regs[i.RA]=ea;
   else if(i.OPCD==18)for(auto&v:regs)v=random();
   for(int reg=0;reg<32;reg++)if(proof.gpr[reg])assert(*proof.gpr[reg]==regs[reg]);
  }
 }
}`;
 writeFileSync(join(dir,'proof.cpp'),cpp);execFileSync('c++',['-std=c++20','-O2',join(dir,'proof.cpp'),'-o',join(dir,'proof')]);execFileSync(join(dir,'proof'));
 }finally{rmSync(dir,{recursive:true,force:true});}
});

const leb=n=>{const out=[];do{const v=n&127;n>>>=7;out.push(v|(n?128:0));}while(n);return out;};
const str=s=>[...leb(s.length),...Buffer.from(s)];
const section=(id,b)=>[id,...leb(b.length),...b];
test('actual specialized memory emitter matches checked RAM, MMIO and FIFO paths',()=>{
 const dir=mkdtempSync(join(tmpdir(),'address-emitter-'));try{
 const s=source();
 const names=['EmitU32Leb','EmitI32Leb','EmitLocalGet','EmitLocalSet','EmitI32Const','EmitBswap32FromLocal','EmitBswap16FromLocal','EmitFusionReadFallback','EmitKnownAddressRead','EmitReadU32MaybeDirect','EmitReadU16MaybeDirect','EmitReadU8MaybeDirect','EmitIntegerFifoStore','EmitKnownAddressWrite','EmitWriteU32MaybeDirect','EmitWriteU16MaybeDirect','EmitWriteU8MaybeDirect'];
 writeFileSync(join(dir,'emit.cpp'),`#include <vector>
#include <optional>
#include <atomic>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
using u8=uint8_t;using u16=uint16_t;using u32=uint32_t;using s32=int32_t;
bool enabled=true,mapped=true;
u32 s_wasm_specialized_state_base=0;
std::optional<u32>s_constant_effective_address;
std::atomic<bool>s_dolphin_web_bswap_rotate{false};std::atomic<u32>s_bswap_rotate_sites{0},s_constant_address_ram_sites{0},s_constant_address_other_sites{0};
u32 s_fusion_read_fallback_local=4;
constexpr u32 DOLPHIN_WEB_ENABLE_INTEGER_FIFO=1u<<16,WASM_IMPORT_FASTCHECK_GPFIFO_INDEX=14;
bool DolphinWebFeatureEnabled(u32){return enabled;}
namespace GPFifo{constexpr u32 GATHER_PIPE_SIZE=32;}
namespace Core{struct System{static System&GetInstance(){static System s;return s;}System&GetMMU(){return *this;}bool IsOptimizableGatherPipeWrite(u32){return mapped;}};}
struct WasmStateLayout{u32 msr_offset=0,gather_pipe_ptr_offset=4,gather_pipe_base_ptr_offset=8,ram_base=8192,ram_size_real=4096;};
void EmitU32Leb(std::vector<u8>&,u32);void EmitLocalGet(std::vector<u8>&,u32);
void EmitStateLoadU32(std::vector<u8>&b,u32 offset){EmitLocalGet(b,0);b.insert(b.end(),{0x28,2});EmitU32Leb(b,offset);}
void EmitStateStoreU32Prefix(std::vector<u8>&b){EmitLocalGet(b,0);}
void EmitStateStoreU32Suffix(std::vector<u8>&b,u32 offset){b.insert(b.end(),{0x36,2});EmitU32Leb(b,offset);}
${names.map(n=>fn(s,n)).join('\n')}
int main(int argc,char**argv){const int width=atoi(argv[1]);const bool write=atoi(argv[2]);if(atoi(argv[3]))s_constant_effective_address=static_cast<u32>(strtoull(argv[4],nullptr,0));enabled=atoi(argv[5]);mapped=atoi(argv[6]);std::vector<u8>b{1,2,0x7f};WasmStateLayout l;
if(write){if(width==4)EmitWriteU32MaybeDirect(b,l);else if(width==2)EmitWriteU16MaybeDirect(b,l);else EmitWriteU8MaybeDirect(b,l);EmitI32Const(b,0);}else{if(width==4)EmitReadU32MaybeDirect(b,l);else if(width==2)EmitReadU16MaybeDirect(b,l);else EmitReadU8MaybeDirect(b,l);}
// Expose the original read-fusion fallback flag separately from the result.
EmitLocalSet(b,3);EmitI32Const(b,16);EmitLocalGet(b,4);b.insert(b.end(),{0x36,2,0});EmitLocalGet(b,3);b.push_back(0x0b);fwrite(b.data(),1,b.size(),stdout);}
`);
 execFileSync('c++',['-std=c++20','-O2',join(dir,'emit.cpp'),'-o',join(dir,'emit')]);
 function module(width,write,known,address,enabled,mapped){
  const body=[...execFileSync(join(dir,'emit'),[width,+write,+known,address,enabled,mapped].map(String))];
  const imports=[15,...Array.from({length:15},(_,i)=>[...str('env'),...str('f'+i),0,[0,2,4].includes(i)?0:1]).flat()];
  return new WebAssembly.Module(Uint8Array.from([0,97,115,109,1,0,0,0,...section(1,[3,0x60,2,0x7f,0x7f,1,0x7f,0x60,3,0x7f,0x7f,0x7f,0,0x60,3,0x7f,0x7f,0x7f,1,0x7f]),...section(2,imports),...section(3,[1,2]),...section(5,[1,0,1]),...section(7,[2,...str('run'),0,15,...str('memory'),2,0]),...section(10,[1,...leb(body.length),...body])]));
 }
 for(const width of[1,2,4])for(const write of[false,true])for(const [enabled,mapped]of[[1,1],[0,1],[1,0]]){
  const baseline=module(width,write,false,0,enabled,mapped);
  for(const address of[0,1,0x80000020,0xc0000021,0x80001000-width,0x80001001-width,0xcc008000,0xcc008004,0xffffffff]){
   const candidate=module(width,write,true,address,enabled,mapped);
   for(const msr of[0,16,17])for(const count of[0,32-width]){
    const results=[baseline,candidate].map(mod=>{
     const calls=[];const env=Object.fromEntries(Array.from({length:15},(_,i)=>['f'+i,(...args)=>{calls.push([i,...args]);return 0xa1b2c3d4;} ]));
     const instance=new WebAssembly.Instance(mod,{env}),view=new DataView(instance.exports.memory.buffer),bytes=new Uint8Array(view.buffer);
     for(let k=8192;k<12288;k++)bytes[k]=(k*29+7)&255;
     view.setUint32(0,msr,true);view.setUint32(4,1024+count,true);view.setUint32(8,1024,true);
     const result=instance.exports.run(0,address,0x12345678);
     return {result,calls,bytes};
    });
    assert.deepEqual(results[1],results[0],JSON.stringify({width,write,address,enabled,mapped,msr,count}));
   }
  }
 }
 }finally{rmSync(dir,{recursive:true,force:true});}
});
