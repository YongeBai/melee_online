import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
test('actual FIFO loop preserves per-burst decode bytes, CP state, wakeups, wrap and timing',()=>{
 const s=readFileSync('engines/wasm-dolphin/vendor/dolphin/Source/Core/VideoCommon/Fifo.cpp','utf8');
 const extract=(a,b)=>{const start=s.indexOf(a),end=s.indexOf(b,start);assert.ok(start>=0&&end>start);return s.slice(start,end);};
 const select=extract('static u32 BrowserFifoPrefetchBytes(', '\n#endif');
 const read=extract('void FifoManager::ReadDataFromFifoOnCPU(', '\nvoid FifoManager::ResetVideoBuffer()');
 const run=extract('int FifoManager::RunGpuOnCpu(', '\nvoid FifoManager::UpdateWantDeterminism(');
 const dir=mkdtempSync(join(tmpdir(),'fifo-prefetch-'));
 try{
 const cpp=join(dir,'test.cpp'),exe=join(dir,'test');
 writeFileSync(cpp,`
#include <algorithm>
#include <array>
#include <atomic>
#include <cassert>
#include <cstdint>
#include <cstring>
#include <vector>
#define __EMSCRIPTEN__ 1
using u8=uint8_t;using u32=uint32_t;
std::atomic<bool>s_browser_fifo_batch{false};
${select}
constexpr size_t FIFO_SIZE=512;constexpr int GPU_TIME_SLOT_SIZE=1000;
namespace GPFifo{constexpr u32 GATHER_PIPE_SIZE=32;}
enum class SyncGPUReason{Wraparound,AuxSpace};
namespace fmt{void* ptr(void* p){return p;}}
template<class...T>void PanicAlertFmt(T...){assert(false);}
namespace Common::FPU{void SaveSIMDState(){}void LoadDefaultSIMDState(){}void LoadSIMDState(){}}
namespace DolphinWeb::BrowserProfile{enum class Stage{CpuGpuDecode};struct Scope{Scope(Stage){}};}
namespace DolphinWeb::WebGpuProducerProfile{enum class Phase{FifoDecode};struct ScopedSample{ScopedSample(Phase){}};}
namespace DolphinWeb::RasterProfile{void RecordFifoDistanceUnderflow(){assert(false);}void RecordFifoConsume(u32){}}
struct DataReader{u8* begin;u8* end;DataReader(u8* a,u8* b):begin(a),end(b){}};
struct CPState{std::atomic<bool>bFF_GPReadEnable{true},bFF_BPEnable{false};std::atomic<u32>CPBase{0},CPEnd{0},CPReadPointer{0},CPReadWriteDistance{0},CPBreakpoint{0};};
struct CP{CPState state;int status=0;CPState& GetFifo(){return state;}void SetCPStatusFromGPU(){status++;}};
struct Memory{std::array<u8,4096> ram{},exram{};u32 size=4096;int copies=0;u32 GetRamSizeReal(){return size;}void CopyFromEmu(void* d,u32 address,size_t n){copies++;u32 offset=address&0x3fffffffu;if(offset<size&&n<=size-offset)memcpy(d,ram.data()+offset,n);else if(offset>=0x10000000&&offset<0x10000000+size&&n<=0x10000000+size-offset)memcpy(d,exram.data()+offset-0x10000000,n);else memset(d,0,n);}};
struct System{Memory memory;CP cp;Memory& GetMemory(){return memory;}CP& GetCommandProcessor(){return cp;}};
bool AtBreakpoint(System& s){auto& c=s.cp.state;return c.bFF_BPEnable&&c.CPReadPointer==c.CPBreakpoint;}
struct Loop{int wakes=0;bool IsRunning(){return true;}void Wakeup(){wakes++;}};
struct FifoManager{
 System& m_system;std::array<u8,FIFO_SIZE> storage{};u8* m_video_buffer=storage.data();u8* m_video_buffer_write_ptr=m_video_buffer;u8* m_video_buffer_pp_read_ptr=m_video_buffer;u8* m_video_buffer_read_ptr=m_video_buffer;
 bool m_use_deterministic_gpu_thread=true;double m_config_sync_gpu_overclock=1;std::atomic<int>m_sync_ticks{0};Loop m_gpu_mainloop;int syncs=0,decodes=0;std::vector<std::vector<u32>> traces;
 void SyncGPU(SyncGPUReason reason,bool move=true){syncs++;if(!move)return;const size_t n=m_video_buffer_write_ptr-m_video_buffer_pp_read_ptr;memmove(m_video_buffer,m_video_buffer_pp_read_ptr,n);m_video_buffer_write_ptr=m_video_buffer+n;m_video_buffer_pp_read_ptr=m_video_buffer_read_ptr=m_video_buffer;}
 void ReadDataFromFifoOnCPU(u32,bool=false);void ReadDataFromFifo(u32 read){m_system.memory.CopyFromEmu(m_video_buffer,read,32);m_video_buffer_read_ptr=m_video_buffer;m_video_buffer_write_ptr=m_video_buffer+32;}
 int RunGpuOnCpu(int ticks);
};
FifoManager* active=nullptr;
namespace OpcodeDecoder{
template<bool preprocess=false>u8* RunFifo(DataReader r,u32* cycles){
 auto& f=*active;auto& c=f.m_system.cp.state;
 std::vector<u32> trace={preprocess?1u:0u,c.CPReadPointer,c.CPReadWriteDistance,u32(r.end-r.begin),u32(f.m_gpu_mainloop.wakes)};
 for(auto* p=r.begin;p!=r.end;p++)trace.push_back(*p);
 f.traces.push_back(trace);f.decodes++;
 // Model partial primitive/BP commands and the auxiliary-buffer drain. Comparing
 // every actual decoder input and CP state also verifies the unchanged real decoder
 // receives precisely the same command bytes at precisely the same burst boundaries.
 auto* p=r.begin;while(p<r.end){size_t n=*p==0?1:((*p%5)+1)*5;if(n>size_t(r.end-p))break;p+=n;}
 if(f.decodes%17==0)f.SyncGPU(SyncGPUReason::AuxSpace,false);
 if(cycles)*cycles=32;
 return p;
}
}
${read}
${run}
u32 rnd(){static u32 n=0x234abcd1;n^=n<<13;n^=n>>17;n^=n<<5;return n;}
int main(){
 for(int i=0;i<60000;i++){
  u32 base=rnd(),end=rnd(),read=rnd(),distance=rnd(),ram=rnd();size_t room=rnd();bool bp=rnd()&1;
  if(i%2==0){base=(rnd()%16)*32;end=base+(rnd()%100)*32;read=base+(rnd()%100)*32;distance=(rnd()%100)*32;ram=4096;room=rnd()%513;bp=i%8==0;}
  const auto bytes=BrowserFifoPrefetchBytes(base,end,read,distance,room,ram,bp);
  assert(bytes>=32&&bytes<=256&&bytes%32==0);
  if(bytes>32){assert(!bp&&((base|end|read|distance)&31)==0&&base<=read&&read<=end);assert(bytes<=distance&&bytes<=room&&bytes<=uint64_t(end)-read+32);assert((read&0x3fffffffu)<=ram-bytes);}
 }
 uint64_t old_copies=0,new_copies=0;
 for(int i=0;i<20000;i++){
  System a,b;FifoManager fa{a},fb{b};
  for(auto& byte:a.memory.ram)byte=rnd();for(auto& byte:a.memory.exram)byte=rnd();b.memory=a.memory;
  const u32 alias=(rnd()%4)<<30,base=alias+(i%7==0?0x10000000:0)+(rnd()%16)*32+(i%11==0?3:0),end=base+(1+rnd()%90)*32,read=base+(rnd()%((end-base)/32+1))*32;
  const u32 distance=(rnd()%100)*32,bp=base+(rnd()%((end-base)/32+1))*32;const bool breakpoint=i%9==0;
  for(auto* x:{&a,&b}){auto& c=x->cp.state;c.CPBase=base;c.CPEnd=end;c.CPReadPointer=read;c.CPReadWriteDistance=distance;c.bFF_BPEnable=breakpoint;c.CPBreakpoint=bp;c.bFF_GPReadEnable=i%31!=0;}
  fa.m_use_deterministic_gpu_thread=fb.m_use_deterministic_gpu_thread=i%13!=0;
  fa.m_sync_ticks=fb.m_sync_ticks=int(rnd()%100)-50;
  const int ticks=int(rnd()%500);
  active=&fa;s_browser_fifo_batch=false;const int ar=fa.RunGpuOnCpu(ticks);
  active=&fb;s_browser_fifo_batch=true;const int br=fb.RunGpuOnCpu(ticks);
  assert(ar==br&&fa.m_sync_ticks==fb.m_sync_ticks);
  assert(a.cp.state.CPReadPointer==b.cp.state.CPReadPointer&&a.cp.state.CPReadWriteDistance==b.cp.state.CPReadWriteDistance&&a.cp.status==b.cp.status);
  assert(fa.traces==fb.traces&&fa.m_gpu_mainloop.wakes==fb.m_gpu_mainloop.wakes&&fa.syncs==fb.syncs);
  assert(fa.storage==fb.storage&&fa.m_video_buffer_write_ptr-fa.m_video_buffer==fb.m_video_buffer_write_ptr-fb.m_video_buffer&&fa.m_video_buffer_pp_read_ptr-fa.m_video_buffer==fb.m_video_buffer_pp_read_ptr-fb.m_video_buffer);
  assert(a.memory.ram==b.memory.ram&&a.memory.exram==b.memory.exram);
  assert(b.memory.copies<=a.memory.copies);old_copies+=a.memory.copies;new_copies+=b.memory.copies;
 }
 assert(new_copies<old_copies*0.65);
}
`);
 execFileSync('c++',['-std=c++20','-O2',cpp,'-o',exe],{stdio:'pipe'});execFileSync(exe,[],{stdio:'pipe'});
 }finally{rmSync(dir,{recursive:true,force:true});}
});
