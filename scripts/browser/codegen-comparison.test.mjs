import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

test('actual codegen comparison changes only its flags with guarded cache invalidation',()=>{
  const source=readFileSync(new URL('../../engines/wasm-dolphin/core/upstream/dolphin_web_core.cpp',import.meta.url),'utf8');
  const start=source.indexOf('EMSCRIPTEN_KEEPALIVE int BrowserRollbackConfigureCodegen('),end=source.indexOf('\nEMSCRIPTEN_KEEPALIVE',start+1);
  assert.ok(start>0&&end>start);
  const method=source.slice(start,end).replace('EMSCRIPTEN_KEEPALIVE ',''),dir=mkdtempSync(join(tmpdir(),'melee-codegen-'));
  try {
    const cpp=join(dir,'test.cpp'),exe=join(dir,'test');
    writeFileSync(cpp,`
#include <cstdint>
#include <cassert>
using u32=uint32_t;
namespace PowerPC{enum class CPUCore{CachedInterpreter,Other};}
bool s_runtime_initialized=true;PowerPC::CPUCore s_cpu_core=PowerPC::CPUCore::CachedInterpreter;
u32 mask=0x6ffffff;int clears=0,writes=0,guards=0;bool paused=true;
namespace Core {
 struct CPUThreadGuard;
 struct System{static System& GetInstance(){static System s;return s;}System& GetJitInterface(){return *this;}void ClearCache(const CPUThreadGuard&){assert(guards==1);clears++;}};
 struct CPUThreadGuard{CPUThreadGuard(System&){guards++;}~CPUThreadGuard(){guards--;}};
 enum class State{Paused,Running};State GetState(System&){return paused?State::Paused:State::Running;}
}
u32 DolphinWeb_GetCachedInterpreterDisableMask(){assert(guards==1);return mask;}
u32 DolphinWeb_SetCachedInterpreterDisableMask(u32 value){assert(guards==1);writes++;mask=value;return mask;}
${method}
int main(){
 for(int flags=0;flags<4;flags++){
  mask=0x6ffffff;clears=writes=0;u32 previous=mask;
  assert(BrowserRollbackConfigureCodegen(flags)==1);
  assert((mask&~((1u<<20)|(1u<<23)))==(previous&~((1u<<20)|(1u<<23))));
  assert(bool(mask&(1u<<20))==!(flags&1));assert(bool(mask&(1u<<23))==bool(flags&2));
  assert(clears==(mask!=previous)&&writes==clears&&guards==0);
  int before=clears;assert(BrowserRollbackConfigureCodegen(flags)==1);assert(clears==before);
 }
 u32 saved=mask;int count=clears;
 paused=false;assert(BrowserRollbackConfigureCodegen(1)==0);paused=true;
 s_runtime_initialized=false;assert(BrowserRollbackConfigureCodegen(1)==0);s_runtime_initialized=true;
 s_cpu_core=PowerPC::CPUCore::Other;assert(BrowserRollbackConfigureCodegen(1)==0);
 s_cpu_core=PowerPC::CPUCore::CachedInterpreter;
 assert(BrowserRollbackConfigureCodegen(-1)==0&&BrowserRollbackConfigureCodegen(4)==0);
 assert(mask==saved&&clears==count&&guards==0);
}
`);
    execFileSync('c++',['-std=c++20','-O2',cpp,'-o',exe],{stdio:'pipe'});
    execFileSync(exe,[],{stdio:'pipe'});
  } finally {rmSync(dir,{recursive:true,force:true});}
});
