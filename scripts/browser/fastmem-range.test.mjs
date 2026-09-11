import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const leb=n=>{const b=[];do{let x=n&127;n>>>=7;b.push(n?x|128:x);}while(n);return b;};
const section=(id,b)=>[id,...leb(b.length),...b],name=s=>[s.length,...Buffer.from(s)];
test('actual hoisted memory guard rejects boundary crossing and out-of-RAM groups',()=>{
  const source=readFileSync(new URL('../../engines/wasm-dolphin/vendor/dolphin/Source/Core/Core/PowerPC/CachedInterpreter/CachedInterpreter.cpp',import.meta.url),'utf8');
  const at=source.indexOf('void EmitFmhRangeCheck('),end=source.indexOf('\n// §28cz Flag-gated',at);assert.ok(at>0&&end>at);
  const dir=mkdtempSync(join(tmpdir(),'melee-fastmem-'));
  try{
    const cpp=join(dir,'emit.cpp'),exe=join(dir,'emit');
    writeFileSync(cpp,`
#include <vector>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
using u8=uint8_t;using u32=uint32_t;using s32=int32_t;
constexpr u32 WASM_FMH_FLAG_LOCAL=40;
struct WasmStateLayout{u32 ram_size_real=24*1024*1024;};
void EmitU32Leb(std::vector<u8>&b,u32 v){do{u8 x=v&127;v>>=7;b.push_back(v?x|128:x);}while(v);}
void EmitLocalGet(std::vector<u8>&b,u32 v){b.push_back(0x20);EmitU32Leb(b,v);}
void EmitLocalSet(std::vector<u8>&b,u32 v){b.push_back(0x21);EmitU32Leb(b,v);}
void EmitI32Const(std::vector<u8>&b,u32 v){b.push_back(0x41);s32 x=v;bool more;do{u8 k=x&127;x>>=7;more=!((x==0&&!(k&64))||(x==-1&&(k&64)));b.push_back(more?k|128:k);}while(more);}
void EmitGprOrZero(std::vector<u8>&b,const WasmStateLayout&,u32){EmitLocalGet(b,0);}
${source.slice(at,end)}
int main(int argc,char**argv){std::vector<u8>b;EmitFmhRangeCheck(b,{},1,atoi(argv[1]),atoi(argv[2]),4);EmitLocalGet(b,40);fwrite(b.data(),1,b.size(),stdout);}
`);
    execFileSync('c++',['-std=c++20','-O2',cpp,'-o',exe],{stdio:'pipe'});
    for(const [lo,hi] of [[0,0],[0,4],[-4,4],[-32768,32767],[32760,32767],[-32768,-32760],[-1000,1000],[0,32767]]){
      const body=[1,40,0x7f,...execFileSync(exe,[String(lo),String(hi)]),0x0b];
      const bytes=Uint8Array.from([0,97,115,109,1,0,0,0,...section(1,[1,0x60,1,0x7f,1,0x7f]),...section(3,[1,0]),...section(7,[1,...name('run'),0,0]),...section(10,[1,...leb(body.length),...body])]);
      const {run}=new WebAssembly.Instance(new WebAssembly.Module(bytes)).exports;
      const ram=24*1024*1024,cases=[];
      for(const bank of [0,0x40000000,0x80000000,0xc0000000])for(const edge of [0,1,ram-4,ram-3,ram,0x3fffffff])
        for(const off of [lo,hi])for(const delta of [-1,0,1])cases.push((bank+edge-off+delta)>>>0);
      let rng=943;for(let i=0;i<4000;i++){rng=(Math.imul(rng,1664525)+1013904223)>>>0;cases.push(rng);}
      for(const base of cases){
        const low=(base+lo)&0x3fffffff,high=(base+hi)&0x3fffffff;
        const valid=low<=high&&high<=ram-4;assert.equal(run(base),Number(valid));
        if(valid)for(const offset of [lo,Math.floor((lo+hi)/2),hi])assert.ok(((base+offset)&0x3fffffff)<=ram-4);
      }
    }
  }finally{rmSync(dir,{recursive:true,force:true});}
});
