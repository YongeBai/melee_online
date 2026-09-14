import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';import {execFileSync} from 'node:child_process';import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';
test('paused profiling control rejects live mutation, retains results on disable, and resets explicitly',()=>{
 const s=readFileSync('engines/wasm-dolphin/core/upstream/dolphin_web_core.cpp','utf8'),start=s.indexOf('EMSCRIPTEN_KEEPALIVE const char* BrowserDispatchProfile(int mode)');assert.ok(start>=0);const control=s.slice(start,s.indexOf('\n}',start)+2);
 const dir=mkdtempSync(join(tmpdir(),'direct-block-profile-'));try{
 writeFileSync(join(dir,'test.cpp'),`#include "Common/BrowserDispatchProfile.h"
#include <cassert>
#define EMSCRIPTEN_KEEPALIVE
bool owned=false,s_runtime_initialized=false;
namespace Core{enum class State{Running,Paused};State state=State::Running;struct System{static System& GetInstance(){static System s;return s;}};State GetState(System&){return state;}struct CPUThreadGuard{CPUThreadGuard(System&){assert(!owned);owned=true;}~CPUThreadGuard(){owned=false;}};}
${control}
int main(){using namespace DolphinWeb::DispatchProfile;
 assert(std::string(BrowserDispatchProfile(1)).find("error")!=std::string::npos);
 s_runtime_initialized=true;assert(std::string(BrowserDispatchProfile(1)).find("error")!=std::string::npos);
 Core::state=Core::State::Paused;for(int v:{-2,2,999})assert(std::string(BrowserDispatchProfile(v)).find("error")!=std::string::npos);
 assert(!enabled.load()&&!owned);BrowserDispatchProfile(1);assert(enabled.load()&&samples==0&&!owned);
 Begin(0x80340000);End();assert(samples==1);BrowserDispatchProfile(-1);assert(samples==1&&enabled.load());
 const std::string report=BrowserDispatchProfile(0);assert(samples==1&&!enabled.load()&&!owned);assert(report.find("2150891520")!=std::string::npos);assert(report.find("sampledUs")!=std::string::npos);
 BrowserDispatchProfile(1);assert(samples==0&&sequence==0);BrowserDispatchProfile(0);assert(!enabled.load()&&!owned);
}
`);
 execFileSync('c++',['-std=c++17','-O2','-I',resolve('engines/wasm-dolphin/vendor/dolphin/Source/Core'),join(dir,'test.cpp'),'-o',join(dir,'test')]);execFileSync(join(dir,'test'));
 }finally{rmSync(dir,{recursive:true,force:true});}
});
