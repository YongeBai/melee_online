import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

test('actual drift control validates paused ownership and records wide host-only counters',()=>{
 const core=readFileSync('engines/wasm-dolphin/core/upstream/dolphin_web_core.cpp','utf8');
 const start=core.indexOf('EMSCRIPTEN_KEEPALIVE const char* BrowserTimingDrift(int mode)');
 assert.ok(start>=0);const control=core.slice(start,core.indexOf('\n}',start)+2);
 const timing=readFileSync('engines/wasm-dolphin/vendor/dolphin/Source/Core/Core/CoreTiming.cpp','utf8');
 const at=timing.indexOf('    const u64 adjustment_us =');assert.ok(at>=0);
 const record=timing.slice(at,timing.indexOf('#endif',at));
 const dir=mkdtempSync(join(tmpdir(),'melee-timing-drift-'));
 try {
  writeFileSync(join(dir,'test.cpp'),`#include <atomic>
#include <cassert>
#include <cstdint>
#include <string>
using u64=uint64_t;
#define EMSCRIPTEN_KEEPALIVE
bool owned=false,s_runtime_initialized=false,configured=false;int writes=0;
std::atomic<u64> m_browser_relax_count{0},m_browser_relax_us{0},m_browser_relax_max_us{0};
struct DT_us{u64 n;explicit DT_us(u64 value):n(value){}u64 count(){return n;}};
void record(u64 adjustment){${record}}
struct Timing {
 bool enabled=false;
 struct Stats{u64 count,microseconds,maximum_microseconds;};
 void SetBrowserCorrectTimeDrift(bool value){assert(owned);enabled=value;}
 bool GetBrowserCorrectTimeDrift(){assert(owned);return enabled;}
 Stats GetBrowserThrottleStats(){assert(owned);return{m_browser_relax_count.load(),m_browser_relax_us.load(),m_browser_relax_max_us.load()};}
};
namespace Core {
 enum class State{Running,Paused};State state=State::Running;
 struct System{Timing timing;static System& GetInstance(){static System s;return s;}Timing& GetCoreTiming(){return timing;}};
 State GetState(System&){return state;}
 struct CPUThreadGuard{explicit CPUThreadGuard(System&){assert(!owned);owned=true;}~CPUThreadGuard(){owned=false;}};
}
namespace Config{constexpr int MAIN_CORRECT_TIME_DRIFT=1;void SetBase(int key,bool value){assert(owned&&key==1);configured=value;++writes;}}
${control}
int main(){
 assert(std::string(BrowserTimingDrift(1)).find("error")!=std::string::npos);assert(writes==0);
 s_runtime_initialized=true;assert(std::string(BrowserTimingDrift(1)).find("error")!=std::string::npos);
 Core::state=Core::State::Paused;
 for(int bad:{-2,2,999})assert(std::string(BrowserTimingDrift(bad)).find("error")!=std::string::npos);
 assert(writes==0&&!owned);
 record(7);record(2);record(5000000000ULL);
 assert(std::string(BrowserTimingDrift(-1))=="{\\\"enabled\\\":false,\\\"relaxCount\\\":3,\\\"relaxUs\\\":5000000009,\\\"relaxMaxUs\\\":5000000000}");assert(writes==0);
 assert(std::string(BrowserTimingDrift(1)).find("true")!=std::string::npos);assert(writes==1&&configured&&!owned);
 BrowserTimingDrift(-1);assert(writes==1);
 assert(std::string(BrowserTimingDrift(0)).find("false")!=std::string::npos);assert(writes==2&&!configured&&!owned);
}
`);
  execFileSync('c++',['-std=c++17','-O2',join(dir,'test.cpp'),'-o',join(dir,'test')]);
  execFileSync(join(dir,'test'));
 } finally {rmSync(dir,{recursive:true,force:true});}
});
