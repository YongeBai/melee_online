import test from'node:test';import assert from'node:assert/strict';import{readFileSync,writeFileSync,mkdtempSync,rmSync}from'node:fs';import{execFileSync}from'node:child_process';import{join}from'node:path';import{tmpdir}from'node:os';
const source=readFileSync(new URL('../../engines/wasm-dolphin/vendor/dolphin/Source/Core/Core/PowerPC/CachedInterpreter/CachedInterpreter.cpp',import.meta.url),'utf8');
const extract=(name)=>{const a=source.indexOf(name);assert.ok(a>=0);return source.slice(a,source.indexOf('\n}',a)+2);};
test('lean dispatch policy retains diagnostic fallback and debugger behavior',()=>{
 const wrapper=extract('void CachedInterpreter::ExecuteOneBlock('),dir=mkdtempSync(join(tmpdir(),'melee-lean-'));
 try{const cpp=join(dir,'test.cpp'),exe=join(dir,'test');writeFileSync(cpp,`#include <atomic>
#include <cassert>
#include <initializer_list>
using u32=unsigned;
#define __EMSCRIPTEN__
#define DOLPHIN_WEB_HOT_COUNT(statement) do {} while(false)
bool lean=false,s_ppc_block_profile_enabled=false;std::atomic<u32>s_lean_dispatch_scopes{0};
bool DolphinWeb_GetLeanDispatch(){return lean;}
namespace DolphinWeb::BrowserProfile{std::atomic<bool>enabled{false};}
class CachedInterpreter{public:int mode=-1;bool redispatch=false;void ExecuteOneBlock(bool);template<bool Diagnostics>void ExecuteOneBlockImpl(bool value){mode=Diagnostics;redispatch=value;}};
${wrapper}
int main(){CachedInterpreter c;for(bool enabled:{false,true})for(bool blocks:{false,true})for(bool segments:{false,true})for(bool redispatch:{false,true}){
 lean=enabled;s_ppc_block_profile_enabled=blocks;DolphinWeb::BrowserProfile::enabled=segments;const auto before=s_lean_dispatch_scopes.load();c.ExecuteOneBlock(redispatch);
 const bool use_lean=enabled&&!blocks&&!segments&&redispatch;assert(c.mode==int(!use_lean)&&c.redispatch==redispatch);assert(s_lean_dispatch_scopes==before);
}}
`);execFileSync('c++',['-std=c++20','-O2',cpp,'-o',exe],{stdio:'pipe'});execFileSync(exe,[],{stdio:'pipe'});
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('empty compile-time diagnostics preserve counter state and remove hot accounting',()=>{
 const no=extract('struct NoDispatchDiagnostics')+';',counter=source.slice(source.indexOf('class ScopedDispatchCounter'),source.indexOf('\n};',source.indexOf('class ScopedDispatchCounter'))+3);
 const dir=mkdtempSync(join(tmpdir(),'melee-no-diagnostics-'));
 try{const cpp=join(dir,'test.cpp'),exe=join(dir,'test');writeFileSync(cpp,`#include <atomic>
#include <cassert>
#include <initializer_list>
#include <type_traits>
using u32=unsigned;
${no}
${counter}
template<bool Diagnostics>void loop(std::atomic<u32>& total,std::atomic<u32>& batches,bool batch){std::conditional_t<Diagnostics,ScopedDispatchCounter,NoDispatchDiagnostics> scope(total,batches,Diagnostics&&batch);for(int i=0;i<1000;i++)scope.Hit();}
int main(){std::atomic<u32>total{23},batches{7};loop<false>(total,batches,false);loop<false>(total,batches,true);assert(total==23&&batches==7);loop<true>(total,batches,false);assert(total==1023&&batches==7);loop<true>(total,batches,true);assert(total==2023&&batches==8);static_assert(std::is_empty_v<NoDispatchDiagnostics>);}
`);execFileSync('c++',['-std=c++20','-O2',cpp,'-o',exe],{stdio:'pipe'});execFileSync(exe,[],{stdio:'pipe'});
 }finally{rmSync(dir,{recursive:true,force:true});}
 const body=source.slice(source.indexOf('template <bool Diagnostics>\nvoid CachedInterpreter::ExecuteOneBlockImpl'),source.indexOf('\nvoid CachedInterpreter::Run()'));
 for(const boundary of['if (BrowserGameFrameStepComplete())','m_system.GetCPU().Break();','NotifyBrowserGameFrameStep();','m_ppc_state.downcount > 0','*redispatch_state_ptr == CPU::State::Running','Jit(m_ppc_state.pc);'])assert.ok(body.includes(boundary),boundary);
 assert.match(body,/profile_segments = Diagnostics &&/);assert.match(body,/std::conditional_t<Diagnostics, DolphinWeb::BrowserProfile::SampleScope, NoDispatchDiagnostics>/);
});
test('lean release mode gates per-call specializer telemetry',()=>{
 for(const [start,end,prefix] of [
  ['s32 CachedInterpreter::FastMeleeAnimStateProbe(','s32 CachedInterpreter::FastMeleeJObjUpdate(','s_melee_anim_'],
  ['s32 CachedInterpreter::FastMeleeJObjUpdate(','s32 CachedInterpreter::FastMeleeDisplayList(','s_melee_jobj_'],
  ['s32 CachedInterpreter::FastMeleeDisplayList(','s32 CachedInterpreter::FastMeleeGxMatrix(','s_melee_display_'],
  ['s32 CachedInterpreter::FastMeleeGxMatrix(','s32 CachedInterpreter::FastMeleeTitleLoop(','s_melee_gx_'],
 ]){
  const body=source.slice(source.indexOf(start),source.indexOf(end));
  assert.match(body,/publish_counters = !s_dolphin_web_lean_dispatch\.load/);
  assert.match(body,/const auto count = \[publish_counters\]/);
  assert.ok(body.includes(`count(${prefix}`),prefix);
  assert.doesNotMatch(body,new RegExp(prefix+'[^;\\n]*fetch_add'));
 }
});
