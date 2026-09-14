import test from'node:test';import assert from'node:assert/strict';import{readFileSync,writeFileSync,mkdtempSync,rmSync}from'node:fs';import{execFileSync}from'node:child_process';import{join}from'node:path';import{tmpdir}from'node:os';
const fn=(s,name)=>{const start=s.indexOf(name);assert.ok(start>=0,name);return s.slice(start,s.indexOf('\n}',start)+2);};
test('real PauseAndLock waits for CPU ownership before publishing a newly armed step',()=>{
 const root='engines/wasm-dolphin/vendor/dolphin/Source/Core/Core/';const cpu=readFileSync(root+'HW/CPU.cpp','utf8'),jit=readFileSync(root+'PowerPC/CachedInterpreter/CachedInterpreter.cpp','utf8');const dir=mkdtempSync(join(tmpdir(),'melee-step-ownership-'));
 try{const cpp=join(dir,'test.cpp'),exe=join(dir,'test');writeFileSync(cpp,`#include <atomic>
#include <cassert>
#include <condition_variable>
#include <cstdint>
#include <cstring>
#include <mutex>
#include <thread>
using u8=uint8_t;using u32=uint32_t;
namespace Core{thread_local bool cpu_thread=false;bool IsCPUThread(){return cpu_thread;}void DeclareAsCPUThread(){cpu_thread=true;}}
enum class State{Running,Stepping};
std::atomic<bool> requested{false};std::mutex observed_lock;std::condition_variable observed;
class CPUManager{public:std::mutex m_stepping_lock,m_state_change_lock;bool m_state_paused_and_locked=false,m_state_cpu_thread_active=true,m_have_fake_cpu_thread=false;State m_state=State::Running;std::condition_variable m_state_cpu_idle_cvar;void SetStateLocked(State state){m_state=state;{std::lock_guard lock(observed_lock);requested=true;}observed.notify_one();}bool PauseAndLock();};
${fn(cpu,'bool CPUManager::PauseAndLock()')}
static std::atomic<bool> s_browser_game_step_armed{false};static const u8* s_browser_game_step_counter=nullptr;static u32 s_browser_game_step_start_native=0;
${fn(jit,'extern "C" void DolphinWeb_ArmGameFrameStep(')}
int main(){CPUManager cpu;const u32 counter=42;std::atomic<bool> acquired{false};
 std::thread caller([&]{assert(cpu.PauseAndLock());acquired=true;assert(!cpu.m_state_cpu_thread_active);DolphinWeb_ArmGameFrameStep(reinterpret_cast<const u8*>(&counter));cpu.m_stepping_lock.unlock();});
 {std::unique_lock lock(observed_lock);observed.wait(lock,[]{return requested.load();});}
 assert(!acquired.load());assert(!s_browser_game_step_armed.load());
 {std::lock_guard lock(cpu.m_state_change_lock);cpu.m_state_cpu_thread_active=false;cpu.m_state_cpu_idle_cvar.notify_one();}
 caller.join();assert(acquired.load());assert(s_browser_game_step_armed.load(std::memory_order_acquire));assert(s_browser_game_step_start_native==42);assert(s_browser_game_step_counter==reinterpret_cast<const u8*>(&counter));
}
`);execFileSync('c++',['-std=c++20','-pthread',cpp,'-o',exe]);execFileSync(exe,{timeout:5000});
 const core=readFileSync('engines/wasm-dolphin/core/upstream/dolphin_web_core.cpp','utf8'),step=fn(core,'EMSCRIPTEN_KEEPALIVE int BrowserRollbackGameStep()');
 assert.match(step,/Core::GetState\(system\)!=?\s*Core::State::Paused|Core::GetState\(system\) != Core::State::Paused/);
 assert.match(step,/const Core::CPUThreadGuard guard\(system\);[\s\S]*DolphinWeb_ArmGameFrameStep/);
 assert.ok(step.indexOf('DolphinWeb_ArmGameFrameStep')<step.indexOf('Core::SetState(system, Core::State::Running)'));
 }finally{rmSync(dir,{recursive:true,force:true});}
});
