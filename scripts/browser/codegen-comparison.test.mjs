import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

test('all codegen flags preserve unrelated settings and invalidate before guarded mutation',()=>{
 const source=readFileSync(new URL('../../engines/wasm-dolphin/core/upstream/dolphin_web_core.cpp',import.meta.url),'utf8');
 const start=source.indexOf('EMSCRIPTEN_KEEPALIVE int BrowserRollbackConfigureCodegen('),end=source.indexOf('\nEMSCRIPTEN_KEEPALIVE',start+1);assert.ok(start>0&&end>start);
 const method=source.slice(start,end).replace('EMSCRIPTEN_KEEPALIVE ',''),dir=mkdtempSync(join(tmpdir(),'melee-codegen-'));
 const names=['CompactGprLocals','PairedSimd','PairedMemorySimd','VectorFprCache','PsqHoist','WideBlockMap','ConstantStateBase','BlockMsrCache','FifoCopy','FifoBatch','FrsqrteFast','FpuGuardHoist','ConditionalFusion','FpuGuardWide','StepCheck','ReadFusion','FusionRedispatch','CounterBatch','LeanDispatch','CPFormatReuse','QStateCache','QStateFull','BswapRotate','ChainFusion','CallFusion','ConstantAddress','MeleeMatrixFast','MeleeAnimStateFast','MeleeDisplayListFast','MeleeGxMatrixFast'];
 try{
 const cpp=join(dir,'test.cpp'),exe=join(dir,'test');writeFileSync(cpp,`
#include <cstdint>
#include <cassert>
#include <array>
using u32=uint32_t;
namespace PowerPC{enum class CPUCore{CachedInterpreter,Other};}
bool s_runtime_initialized=true;PowerPC::CPUCore s_cpu_core=PowerPC::CPUCore::CachedInterpreter;
u32 mask=0;int clears=0,writes=0,guards=0,batch_writes=0;bool paused=true,cleared=false;std::array<bool,30>features{};
namespace Core {
 struct CPUThreadGuard;
 struct System{static System& GetInstance(){static System s;return s;}System& GetJitInterface(){return *this;}void ClearCache(const CPUThreadGuard&){assert(guards==1);clears++;cleared=true;}};
 struct CPUThreadGuard{CPUThreadGuard(System&){guards++;cleared=false;}~CPUThreadGuard(){guards--;}};
 enum class State{Paused,Running};State GetState(System&){return paused?State::Paused:State::Running;}
}
u32 DolphinWeb_GetCachedInterpreterDisableMask(){assert(guards==1);return mask;}
u32 DolphinWeb_SetCachedInterpreterDisableMask(u32 value){assert(guards==1&&cleared);writes++;mask=value;return mask;}
${names.map((n,i)=>`bool DolphinWeb_Get${n}(){assert(guards==1);return features[${i}];}void DolphinWeb_Set${n}(bool value){assert(guards==1${(i>=17&&i<20)?"":"&&cleared"});${(i>=17&&i<20)?"batch_writes":"writes"}++;features[${i}]=value;}`).join('\n')}
${method}
int main(){
 const u32 changed_bits=(1u<<17)|(1u<<20)|(1u<<23)|(1u<<16)|(1u<<18)|(1u<<19);
 for(int sample=0;sample<1048576;sample++){
  const int flags=(sample*2047u)&2147483647u;const int extra=(sample>>3)&31;
  mask=0x6ffffff;features.fill(flags%2);clears=writes=batch_writes=0;const u32 previous=mask;const auto old=features;
  assert(BrowserRollbackConfigureCodegen(flags,extra)==1);
  assert((mask&~changed_bits)==(previous&~changed_bits));
  assert(bool(mask&(1u<<17))==!(flags&65536));assert(bool(mask&(1u<<20))==!(flags&1));assert(bool(mask&(1u<<23))==bool(flags&2));
  assert(bool(mask&(1u<<16))==bool(flags&4));assert(bool(mask&(1u<<18))==bool(flags&8));assert(bool(mask&(1u<<19))==bool(flags&16));
  assert(features[25]==bool(extra&1));assert(features[26]==bool(extra&2));assert(features[27]==bool(extra&4));assert(features[28]==bool(extra&8));assert(features[29]==bool(extra&16));assert(features[24]==bool(flags&1073741824));assert(features[23]==bool(flags&536870912));assert(features[22]==bool(flags&268435456));assert(features[21]==bool(flags&134217728));assert(features[20]==bool(flags&67108864));assert(features[19]==bool(flags&33554432));assert(features[18]==bool(flags&16777216));assert(features[17]==bool(flags&8388608));assert(features[16]==bool(flags&4194304));assert(features[15]==bool(flags&2097152));assert(features[14]==bool(flags&1048576));assert(features[13]==bool(flags&524288));assert(features[12]==bool(flags&262144));assert(features[11]==bool(flags&131072));for(int i=0;i<11;i++)assert(features[i]==bool(flags&(1<<(i+5))));
  auto old_codegen=old;old_codegen[17]=features[17];old_codegen[18]=features[18];old_codegen[19]=features[19];const bool changed=mask!=previous||features!=old_codegen;assert(batch_writes==int(features[17]!=old[17])+int(features[18]!=old[18])+int(features[19]!=old[19]));assert(clears==changed&&writes==28*clears&&guards==0);
  const int before=clears;assert(BrowserRollbackConfigureCodegen(flags,extra)==1);assert(clears==before);
  assert(BrowserRollbackConfigureCodegen(flags^33554432,extra)==1);assert(clears==before&&features[19]!=bool(flags&33554432));
  assert(BrowserRollbackConfigureCodegen(flags,extra)==1);assert(clears==before);
  assert(BrowserRollbackConfigureCodegen(flags^16777216,extra)==1);assert(clears==before&&features[18]!=bool(flags&16777216));
  assert(BrowserRollbackConfigureCodegen(flags,extra)==1);assert(clears==before);
  assert(BrowserRollbackConfigureCodegen(flags^8388608,extra)==1);assert(clears==before&&features[17]!=bool(flags&8388608));
  assert(BrowserRollbackConfigureCodegen(flags,extra)==1);assert(clears==before);
 }
 assert(BrowserRollbackConfigureCodegen(0,-1)==0&&BrowserRollbackConfigureCodegen(0,32)==0);
 const u32 saved=mask;const auto old=features;const int count=clears;
 paused=false;assert(BrowserRollbackConfigureCodegen(1)==0);paused=true;
 s_runtime_initialized=false;assert(BrowserRollbackConfigureCodegen(1)==0);s_runtime_initialized=true;
 s_cpu_core=PowerPC::CPUCore::Other;assert(BrowserRollbackConfigureCodegen(1)==0);s_cpu_core=PowerPC::CPUCore::CachedInterpreter;
 assert(BrowserRollbackConfigureCodegen(-1)==0&&BrowserRollbackConfigureCodegen(static_cast<int>(0x80000000u))==0);
 assert(mask==saved&&features==old&&clears==count&&guards==0);
}
`);execFileSync('c++',['-std=c++20','-O2',cpp,'-o',exe],{stdio:'pipe'});execFileSync(exe,[],{stdio:'pipe'});
 }finally{rmSync(dir,{recursive:true,force:true});}
});
