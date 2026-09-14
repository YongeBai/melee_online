import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
test('actual FIFO copy and burst loop preserve bytes, range failures, wrap and spill',()=>{
 const s=readFileSync(new URL('../../engines/wasm-dolphin/vendor/dolphin/Source/Core/Core/HW/GPFifo.cpp',import.meta.url),'utf8');
 const begin=s.indexOf('static bool CopyGatherPipeToRam('),end=s.indexOf('\n#endif',begin);
 const loopStart=s.indexOf('void GPFifoManager::UpdateGatherPipe()'),loopEnd=s.indexOf('\nvoid GPFifoManager::FastCheckGatherPipe()',loopStart);
 assert.ok(begin>0&&end>begin&&loopStart>0&&loopEnd>loopStart);
 const dir=mkdtempSync(join(tmpdir(),'melee-fifo-copy-'));
 try{
 const cpp=join(dir,'test.cpp'),exe=join(dir,'test');
 writeFileSync(cpp,`
#include <array>
#include <vector>
#include <cstring>
#include <atomic>
#include <cstdint>
#include <cassert>
#include <algorithm>
using u8=uint8_t;using u32=uint32_t;
#define __EMSCRIPTEN__ 1
std::atomic<bool> s_browser_fifo_copy{false};
namespace DolphinWeb::BrowserProfile{enum class Stage{CpuGatherSample,CpuGatherCopySample};struct SampleScope{SampleScope(Stage){}};}
${s.slice(begin,end)}
u32 random32(){static u32 state=0x13579bdf;state^=state<<13;state^=state>>17;state^=state<<5;return state;}
struct Memory{
 std::array<u8,4160> data{};std::array<u8,4160> exram{};u32 size=4096;int failures=0,copies=0;
 u8* GetRAM(){return data.data()+32;}u32 GetRamSizeReal(){return size;}
 void CopyToEmu(u32 a,const void* p,size_t n){copies++;u32 o=a&0x3fffffffu;if(o<size&&n<=size-o)std::memcpy(GetRAM()+o,p,n);else if((o>>28)==1&&(o&0xfffffff)<size&&n<=size-(o&0xfffffff))std::memcpy(exram.data()+32+(o&0xfffffff),p,n);else failures++;}
};
struct PI{u32 m_fifo_cpu_write_pointer=0,m_fifo_cpu_end=0,m_fifo_cpu_base=0;};
struct CP{PI* pi=nullptr;std::vector<u32> events;void GatherPipeBursted(){events.push_back(pi->m_fifo_cpu_write_pointer);}};
struct System{Memory memory;PI pi;CP cp;System(){cp.pi=&pi;}Memory& GetMemory(){return memory;}PI& GetProcessorInterface(){return pi;}CP& GetCommandProcessor(){return cp;}};
constexpr size_t GATHER_PIPE_SIZE=32;
struct GPFifoManager{System& m_system;std::array<u8,160> m_gather_pipe_storage{};u8* m_gather_pipe=m_gather_pipe_storage.data();size_t count=0;size_t GetGatherPipeCount(){return count;}void SetGatherPipeCount(size_t n){count=n;}void UpdateGatherPipe();};
${s.slice(loopStart,loopEnd)}
int main(){
 std::array<u8,32> source{};for(u32 i=0;i<32;i++)source[i]=i*7+3;
 std::array<u8,4160> data{};
 for(int i=0;i<60000;i++){
  const u32 size=i%5==0?random32()%33:random32()%4097;
  const u32 low=i%3==0?size+u32(int(random32()%65)-32):random32();
  const u32 address=low|((random32()&3)<<30),offset=address&0x3fffffffu;
  data.fill(0xa5);const auto before=data;
  const bool valid=size>=32&&offset<=size-32;
  assert(CopyGatherPipeToRam(data.data()+32,size,address,source.data())==valid);
  auto expected=before;if(valid)std::memcpy(expected.data()+32+offset,source.data(),32);
  assert(data==expected);assert(!CopyGatherPipeToRam(nullptr,size,address,source.data()));
 }
 for(int i=0;i<12000;i++){
  System baseline,candidate;GPFifoManager a{baseline},b{candidate};
  baseline.memory.size=random32()%4097;
  for(auto& x:baseline.memory.data)x=random32();for(auto& x:baseline.memory.exram)x=random32();candidate.memory=baseline.memory;
  const u32 alias=(random32()&3)<<30;
  baseline.pi.m_fifo_cpu_base=(i%4==0?0x10000000:0)|alias|(random32()%128);
  baseline.pi.m_fifo_cpu_end=baseline.pi.m_fifo_cpu_base+32*(random32()%6);
  baseline.pi.m_fifo_cpu_write_pointer=baseline.pi.m_fifo_cpu_base+32*(random32()%6);
  candidate.pi=baseline.pi;
  for(auto& x:a.m_gather_pipe_storage)x=random32();b.m_gather_pipe_storage=a.m_gather_pipe_storage;
  a.count=b.count=random32()%129;
  s_browser_fifo_copy=false;a.UpdateGatherPipe();s_browser_fifo_copy=true;b.UpdateGatherPipe();
  assert(baseline.memory.data==candidate.memory.data&&baseline.memory.exram==candidate.memory.exram);
  assert(baseline.memory.failures==candidate.memory.failures);
  assert(baseline.pi.m_fifo_cpu_write_pointer==candidate.pi.m_fifo_cpu_write_pointer);
  assert(baseline.cp.events==candidate.cp.events&&a.count==b.count&&a.m_gather_pipe_storage==b.m_gather_pipe_storage);
 }
}
`);
 execFileSync('c++',['-std=c++20','-O2',cpp,'-o',exe],{stdio:'pipe'});execFileSync(exe,[],{stdio:'pipe'});
 }finally{rmSync(dir,{recursive:true,force:true});}
});
