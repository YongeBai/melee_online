import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const leb=n=>{const out=[];do{let b=n&127;n>>>=7;out.push(n?b|128:b);}while(n);return out;};
const section=(id,data)=>[id,...leb(data.length),...data];
const name=s=>[s.length,...Buffer.from(s)];
test('actual emitted cache guard preserves invalidation, translation and privilege fallbacks',()=>{
  const source=readFileSync(new URL('../../engines/wasm-dolphin/vendor/dolphin/Source/Core/Core/PowerPC/CachedInterpreter/CachedInterpreter.cpp',import.meta.url),'utf8');
  const start=source.indexOf('void EmitDcbx('),end=source.indexOf('void LogWasmBlockReject',start);
  assert.ok(start>0&&end>start);
  // Only replace the native process address of the opt-in flag with its test
  // WASM address. All guard instructions and control flow are the real emitter.
  const emitter=source.slice(start,end).replace('static_cast<u32>(reinterpret_cast<std::uintptr_t>(&s_dolphin_web_disable_mask))','64');
  const dir=mkdtempSync(join(tmpdir(),'melee-dcb-'));
  try {
    const cpp=join(dir,'emit.cpp'),exe=join(dir,'emit');
    writeFileSync(cpp,`
#include <vector>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
using u8=uint8_t;using u32=uint32_t;
constexpr u32 MSR_PR_MASK=1u<<14;
namespace PowerPC {constexpr u32 BAT_INDEX_SHIFT=17,BAT_PAGE_SIZE=1u<<17,BAT_MAPPED_BIT=1;}
struct Inst{u32 SUBOP10;};
namespace PPCAnalyst{struct CodeOp{Inst inst;};}
struct WasmStateLayout{u32 ibat_base=131072,valid_blocks_base=262144,msr_offset=0,dcache_enabled_offset=4;};
void uleb(std::vector<u8>& b,u32 v){do{u8 x=v&127;v>>=7;b.push_back(v?x|128:x);}while(v);}
void EmitI32Const(std::vector<u8>& b,u32 x){b.push_back(0x41);int32_t v=x;bool more;do{u8 k=v&127;v>>=7;more=!((v==0&&!(k&64))||(v==-1&&(k&64)));b.push_back(more?k|128:k);}while(more);}
void EmitLocalGet(std::vector<u8>& b,u32 x){b.push_back(0x20);uleb(b,x);}
void EmitLocalSet(std::vector<u8>& b,u32 x){b.push_back(0x21);uleb(b,x);}
void EmitStateLoadU32(std::vector<u8>& b,u32 x){EmitLocalGet(b,0);b.insert(b.end(),{0x28,2});uleb(b,x);}
void EmitStateLoadU8(std::vector<u8>& b,u32 x){EmitLocalGet(b,0);b.insert(b.end(),{0x2d,0});uleb(b,x);}
void EmitEffectiveAddressX(std::vector<u8>& b,const WasmStateLayout&,Inst){EmitStateLoadU32(b,8);EmitStateLoadU32(b,12);b.push_back(0x6a);}
void EmitSystemCall(std::vector<u8>& b,const PPCAnalyst::CodeOp&,u32){b.insert(b.end(),{0x10,0});}
${emitter}
int main(int argc,char** argv){std::vector<u8>b;EmitDcbx(b,{},{{static_cast<u32>(atoi(argv[1]))}},0);fwrite(b.data(),1,b.size(),stdout);}
`);
    execFileSync('c++',['-std=c++20','-O2',cpp,'-o',exe],{stdio:'pipe'});
    for(const subop of [54,86,470]) {
      const body=[1,3,0x7f,...execFileSync(exe,[String(subop)]),0x0b];
      const bytes=Uint8Array.from([0,97,115,109,1,0,0,0,
        ...section(1,[2,0x60,1,0x7f,0,0x60,0,0]),
        ...section(2,[2,...name('env'),...name('memory'),2,3,...leb(512),...leb(512),...name('env'),...name('slow'),0,1]),
        ...section(3,[1,0]),...section(7,[1,...name('run'),0,1]),
        ...section(10,[1,...leb(body.length),...body])]);
      const memory=new WebAssembly.Memory({initial:512,maximum:512,shared:true});
      let slow=0;
      const {run}=new WebAssembly.Instance(new WebAssembly.Module(bytes),{env:{memory,slow:()=>slow++}}).exports;
      const words=new Uint32Array(memory.buffer);
      let seed=7719;
      for(let i=0;i<4000;i++) {
        seed=(Math.imul(seed,1664525)+1013904223)>>>0;
        const ea=i<4?[0,0xffffffff,0x80000020,0xc001fffc][i]:seed;
        const ir=Boolean(i&1),mapped=Boolean(i&2),live=Boolean(i&4),dcache=Boolean(i&8),pr=Boolean(i&16),enabled=Boolean(i&32);
        const mapping=((seed^0x678a0000)&0xfffe0000)|(mapped?1:2);
        const physical=ir?((mapping&0xfffe0000)|(ea&0x1ffff))>>>0:ea;
        const word=262144/4+(physical>>>10),bit=1<<((physical>>>5)&31);
        words[0]=(ir?32:0)|(pr?16384:0);words[1]=Number(dcache);
        // Exercise wrapped effective-address addition as well.
        words[2]=(ea-0x76543210)>>>0;words[3]=0x76543210;
        Atomics.store(words,16,enabled?1<<24:0);
        words[131072/4+(ea>>>17)]=mapping;
        words[word]=live?bit:0;
        const expected=!enabled||dcache||(subop===470&&pr)||(ir&&!mapped)||live;
        slow=0;run(0);
        assert.equal(slow,Number(expected),`op ${subop} case ${i}`);
        assert.equal(words[word],live?bit>>>0:0,'fast path must never clear a live code bit itself');
        words[word]=0;
      }
    }
  } finally {rmSync(dir,{recursive:true,force:true});}
});
