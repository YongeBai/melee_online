import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';import {execFileSync} from 'node:child_process';import {tmpdir} from 'node:os';import {join} from 'node:path';
test('actual rush policy control requires paused ownership and queries without mutation',()=>{
 const s=readFileSync('engines/wasm-dolphin/core/upstream/dolphin_web_core.cpp','utf8'),start=s.indexOf('EMSCRIPTEN_KEEPALIVE const char* BrowserRushPresentation(int mode)');assert.ok(start>=0);const control=s.slice(start,s.indexOf('\n}',start)+2);
 const dir=mkdtempSync(join(tmpdir(),'rush-policy-'));try{
  writeFileSync(join(dir,'test.cpp'),`#include <cassert>
#include <cstdint>
#include <string>
using u64=uint64_t;
#define EMSCRIPTEN_KEEPALIVE
bool owned=false,s_runtime_initialized=false,configured=true;int writes=0;
struct Timing{bool enabled=true;void SetBrowserRushPresentation(bool v){assert(owned);enabled=v;}bool GetBrowserRushPresentation(){assert(owned);return enabled;}u64 GetBrowserThrottleCalls(){assert(owned);return 6000000000ULL;}u64 GetBrowserThrottleSkips(){assert(owned);return 5000000000ULL;}};
namespace Core{enum class State{Running,Paused};State state=State::Running;struct System{Timing timing;static System& GetInstance(){static System s;return s;}Timing& GetCoreTiming(){return timing;}};State GetState(System&){return state;}struct CPUThreadGuard{CPUThreadGuard(System&){assert(!owned);owned=true;}~CPUThreadGuard(){owned=false;}};}
namespace Config{constexpr int MAIN_RUSH_FRAME_PRESENTATION=1;void SetBase(int k,bool v){assert(owned&&k==1);configured=v;++writes;}}
${control}
int main(){
 assert(std::string(BrowserRushPresentation(0)).find("error")!=std::string::npos);s_runtime_initialized=true;
 assert(std::string(BrowserRushPresentation(0)).find("error")!=std::string::npos);Core::state=Core::State::Paused;
 for(int bad:{-2,2,999})assert(std::string(BrowserRushPresentation(bad)).find("error")!=std::string::npos);
 assert(writes==0&&!owned);assert(std::string(BrowserRushPresentation(-1))=="{\\\"enabled\\\":true,\\\"calls\\\":6000000000,\\\"skips\\\":5000000000}");assert(writes==0);
 assert(std::string(BrowserRushPresentation(0)).find("false")!=std::string::npos);assert(!configured&&writes==1&&!owned);
 BrowserRushPresentation(-1);assert(writes==1);BrowserRushPresentation(1);assert(configured&&writes==2&&!owned);
}
`);execFileSync('c++',['-std=c++17','-O2',join(dir,'test.cpp'),'-o',join(dir,'test')]);execFileSync(join(dir,'test'));
 }finally{rmSync(dir,{recursive:true,force:true});}
});
