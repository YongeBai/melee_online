import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs';import os from'node:os';import path from'node:path';import{spawnSync}from'node:child_process';
test('actual paused invalidation API rejects unsafe ranges and covers every changed cache line',()=>{
 const core=fs.readFileSync(new URL('../../engines/wasm-dolphin/core/upstream/dolphin_web_core.cpp',import.meta.url),'utf8');
 const start=core.indexOf('EMSCRIPTEN_KEEPALIVE int BrowserInvalidateGuestCode('),end=core.indexOf('\n// QA-only code-generation comparison.',start);assert.ok(start>=0&&end>start);
 const fn=core.slice(start,end),dir=fs.mkdtempSync(path.join(os.tmpdir(),'melee-guest-code-'));
 const harness=`#include <cstdint>
#include <vector>
#include <cassert>
using u32=std::uint32_t;
#define EMSCRIPTEN_KEEPALIVE
static bool s_runtime_initialized=true;
struct Memory {};
struct Jit {std::vector<u32> invalidated;void InvalidateICache(u32 address,u32 bytes,bool forced){assert(forced);invalidated={address,bytes};}};
struct ICache {std::vector<u32> lines;void Invalidate(Memory&,Jit&,u32 address){lines.push_back(address);}};
struct PPCState {ICache iCache;};
struct PPC {PPCState state;PPCState& GetPPCState(){return state;}};
namespace Core {enum class State {Paused,Running};static State state=State::Paused;struct System {Jit jit;Memory memory;PPC ppc;static System& GetInstance(){static System system;return system;}Jit& GetJitInterface(){return jit;}Memory& GetMemory(){return memory;}PPC& GetPowerPC(){return ppc;}};State GetState(System&){return state;}struct CPUThreadGuard {CPUThreadGuard(System&) {assert(state==State::Paused);}};}
`+fn+`
int main(){auto& s=Core::System::GetInstance();
for(auto [a,n]:std::vector<std::pair<u32,u32>>{{0,4},{0x80001800,4},{0x80003001,4},{0x80003000,0},{0x80003000,3},{0x817ffffc,8},{0x80003000,0xffffffff},{0x80003000,0x100004}}){assert(BrowserInvalidateGuestCode(a,n)==0);assert(s.ppc.state.iCache.lines.empty());assert(s.jit.invalidated.empty());}
Core::state=Core::State::Running;assert(!BrowserInvalidateGuestCode(0x80003000,4));Core::state=Core::State::Paused;s_runtime_initialized=false;assert(!BrowserInvalidateGuestCode(0x80003000,4));s_runtime_initialized=true;
assert(BrowserInvalidateGuestCode(0x80003004,64)==1);assert((s.ppc.state.iCache.lines==std::vector<u32>{0x80003000,0x80003020,0x80003040}));assert((s.jit.invalidated==std::vector<u32>{0x80003004,64}));
}`;
 try{fs.writeFileSync(path.join(dir,'test.cpp'),harness);let r=spawnSync('c++',['-std=c++20',path.join(dir,'test.cpp'),'-o',path.join(dir,'test')],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);r=spawnSync(path.join(dir,'test'),[],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
