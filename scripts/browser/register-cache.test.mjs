import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const leb=n=>{const b=[];do{let x=n&127;n>>>=7;b.push(n?x|128:x);}while(n);return b;};
const section=(id,b)=>[id,...leb(b.length),...b],name=s=>[s.length,...Buffer.from(s)];
test('actual register-cache emitters preserve conditional stores and helper-visible state',()=>{
  const source=readFileSync(new URL('../../engines/wasm-dolphin/vendor/dolphin/Source/Core/Core/PowerPC/CachedInterpreter/CachedInterpreter.cpp',import.meta.url),'utf8');
  function extract(signature){const at=source.indexOf(signature);assert.ok(at>0);let pos=source.indexOf('{',at),depth=1;for(pos++;depth;pos++){if(source[pos]==='{')depth++;if(source[pos]==='}')depth--;}return source.slice(at,pos);}
  const methods=['inline bool RegCacheGprIndex(','void EmitRegCacheFlushDirty(','void EmitRegCacheReloadAll(','void EmitStateLoadU32(','void EmitStateStoreU32Prefix(','void EmitStateStoreU32Suffix('].map(extract).join('\n');
  const dir=mkdtempSync(join(tmpdir(),'melee-regcache-'));
  try{
    const cpp=join(dir,'emit.cpp'),exe=join(dir,'emit');
    writeFileSync(cpp,`
#include <vector>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
using u8=uint8_t;using u32=uint32_t;
constexpr u32 WASM_GPR_LOCAL_BASE=8;
struct {bool active;u32 gpr_base=0;bool present[32]{},dirty[32]{};}s_gpr_rc;
u32 s_wasm_emit_state_load_u32_count=0,s_wasm_emit_state_store_u32_count=0;
void EmitU32Leb(std::vector<u8>&b,u32 v){do{u8 x=v&127;v>>=7;b.push_back(v?x|128:x);}while(v);}
void EmitLocalGet(std::vector<u8>&b,u32 v){b.push_back(0x20);EmitU32Leb(b,v);}
void EmitLocalSet(std::vector<u8>&b,u32 v){b.push_back(0x21);EmitU32Leb(b,v);}
${methods}
int main(int argc,char**argv){
 s_gpr_rc.active=atoi(argv[1]);for(auto&p:s_gpr_rc.present)p=true;
 std::vector<u8>b;EmitRegCacheReloadAll(b);
 auto cond=[&](u8 mask){EmitStateLoadU32(b,0);b.insert(b.end(),{0x41,mask,0x71,0x04,0x40});};
 auto add=[&](u32 dst,u32 a,u32 c){EmitStateStoreU32Prefix(b);EmitStateLoadU32(b,a*4);EmitStateLoadU32(b,c*4);b.push_back(0x6a);EmitStateStoreU32Suffix(b,dst*4);};
 cond(1);add(1,2,3);EmitRegCacheFlushDirty(b);b.insert(b.end(),{0x10,0});EmitRegCacheReloadAll(b);b.push_back(0x0b);
 add(4,1,2);cond(2);add(2,4,3);b.push_back(0x05);add(5,4,2);b.push_back(0x0b);
 // A second helper call must see every earlier conditional write; afterward
 // a dirty cached register must not overwrite a value produced by that helper.
 EmitRegCacheFlushDirty(b);b.insert(b.end(),{0x10,0});EmitRegCacheReloadAll(b);
 add(6,1,2);EmitRegCacheFlushDirty(b);fwrite(b.data(),1,b.size(),stdout);
}
`);
    execFileSync('c++',['-std=c++20','-O2',cpp,'-o',exe],{stdio:'pipe'});
    const machines=[0,1].map(enabled=>{
      const body=[1,39,0x7f,...execFileSync(exe,[String(enabled)]),0x0b];
      const module=new WebAssembly.Module(Uint8Array.from([0,97,115,109,1,0,0,0,
        ...section(1,[2,0x60,0,0,0x60,1,0x7f,0]),
        ...section(2,[2,...name('env'),...name('memory'),2,3,1,1,...name('env'),...name('helper'),0,0]),
        ...section(3,[1,1]),...section(7,[1,...name('run'),0,1]),...section(10,[1,...leb(body.length),...body])]));
      const memory=new WebAssembly.Memory({initial:1,maximum:1,shared:true}),words=new Uint32Array(memory.buffer),observed=[];
      const helper=()=>{observed.push([...words.slice(0,32)]);words[1]=(words[1]^words[2])>>>0;words[2]=(words[2]+0xfedcba98)>>>0;};
      return {words,observed,run:new WebAssembly.Instance(module,{env:{memory,helper}}).exports.run};
    });
    let rng=719;
    for(let i=0;i<2000;i++){
      const input=Uint32Array.from({length:64},()=>rng=(Math.imul(rng,1664525)+1013904223)>>>0);input[0]=i&3;
      for(const m of machines){m.words.set(input);m.observed.length=0;m.run(0);}
      assert.deepEqual(machines[0].observed,machines[1].observed,`helper state case ${i}`);
      assert.deepEqual(machines[0].words.slice(0,64),machines[1].words.slice(0,64),`final state case ${i}`);
    }
  }finally{rmSync(dir,{recursive:true,force:true});}
});
