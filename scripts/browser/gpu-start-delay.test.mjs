import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

test('actual GPU start scheduling is bounded, paused-only and restricted to dual-core deterministic mode',()=>{
 const fifo=readFileSync('engines/wasm-dolphin/vendor/dolphin/Source/Core/VideoCommon/Fifo.cpp','utf8');
 const core=readFileSync('engines/wasm-dolphin/core/upstream/dolphin_web_core.cpp','utf8');
 const extract=(s,a,b)=>{const start=s.indexOf(a),end=s.indexOf(b,start);assert.ok(start>=0&&end>start);return s.slice(start,end);};
 const globals=extract(fifo,'static std::atomic<int> s_browser_gpu_start_delay','static std::atomic<bool> s_browser_fifo_batch');
 const run=extract(fifo,'void FifoManager::RunGpu()','\nint FifoManager::RunGpuOnCpu(');
 const control=extract(core,'EMSCRIPTEN_KEEPALIVE const char* BrowserGpuStartDelay(int cycles)','\n// Query (-1)');
 const dir=mkdtempSync(join(tmpdir(),'gpu-start-delay-'));
 try{
  writeFileSync(join(dir,'test.cpp'),`#include <atomic>
#include <cassert>
#include <cstdint>
#include <string>
#include <vector>
#define __EMSCRIPTEN__ 1
#define EMSCRIPTEN_KEEPALIVE
#define EM_ASM(...)
using u32=uint32_t;using u64=uint64_t;
bool owned=false,s_runtime_initialized=false;
namespace DolphinWeb::WgpuDeepDiagnostics{bool IsEnabled(){return false;}}
struct Timing{std::vector<int> delays;std::string GetBrowserSavedEventSnapshot(){return "null";}void ScheduleEvent(int delay,int event,int ticks){assert(event==7&&delay==ticks);delays.push_back(delay);}};
struct CPState{std::atomic<u32> CPBase{0},CPEnd{0},CPReadPointer{0},CPWritePointer{0},CPReadWriteDistance{0};};
struct CP{CPState fifo;CPState& GetFifo(){return fifo;}};
namespace Core{
 enum class State{Paused,Running};State state=State::Running;
 struct System{bool dual=true;Timing timing;CP cp;CP& GetCommandProcessor(){return cp;}static System& GetInstance(){static System s;return s;}bool IsDualCoreMode(){return dual;}Timing& GetCoreTiming(){return timing;}};
 State GetState(System&){return state;}
 struct CPUThreadGuard{CPUThreadGuard(System&){assert(!owned);owned=true;}~CPUThreadGuard(){owned=false;}};
}
${globals}
${control}
constexpr int GPU_TIME_SLOT_SIZE=1000;
struct Loop{int wakes=0;void Wakeup(){wakes++;}};
struct FifoManager{Core::System& m_system;bool m_use_deterministic_gpu_thread=true,m_config_sync_gpu=true,m_syncing_suspended=true;int m_event_sync_gpu=7;Loop m_gpu_mainloop;void RunGpu();};
${run}
int main(){
 assert(std::string(BrowserGpuStartDelay(4000)).find("error")!=std::string::npos);
 s_runtime_initialized=true;assert(std::string(BrowserGpuStartDelay(4000)).find("error")!=std::string::npos);
 assert(s_browser_gpu_start_delay==1000);Core::state=Core::State::Paused;
 for(int bad:{0,999,3000,8001,-2}){assert(std::string(BrowserGpuStartDelay(bad)).find("error")!=std::string::npos);assert(s_browser_gpu_start_delay==1000);}
 auto& system=Core::System::GetInstance();
 for(int delay:{1000,2000,4000,8000})for(bool dual:{false,true})for(bool deterministic:{false,true})for(bool sync:{false,true})for(bool suspended:{false,true}){
  BrowserGpuStartDelay(delay);system.dual=dual;system.timing.delays.clear();
  FifoManager f{system};f.m_use_deterministic_gpu_thread=deterministic;f.m_config_sync_gpu=sync;f.m_syncing_suspended=suspended;
  const auto before=s_browser_gpu_starts.load();f.RunGpu();
  const bool scheduled=suspended&&(!dual||deterministic||sync);
  assert(system.timing.delays.size()==size_t(scheduled));
  if(scheduled){assert(system.timing.delays[0]==(dual&&deterministic?delay:1000));assert(!f.m_syncing_suspended);}
  assert(f.m_gpu_mainloop.wakes==int(dual&&!deterministic));
  assert(s_browser_gpu_starts-before==u64(scheduled&&dual&&deterministic));
 }
 s_browser_gpu_callbacks=5000000000ULL;const auto mode=s_browser_gpu_start_delay.load();
 const std::string stats=BrowserGpuStartDelay(-1);assert(stats.find("5000000000")!=std::string::npos);assert(s_browser_gpu_start_delay==mode&&!owned);
}
`);
  execFileSync('c++',['-std=c++17','-O2',join(dir,'test.cpp'),'-o',join(dir,'test')]);execFileSync(join(dir,'test'));
 }finally{rmSync(dir,{recursive:true,force:true});}
});
