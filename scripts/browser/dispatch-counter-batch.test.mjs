import test from'node:test';import assert from'node:assert/strict';import{readFileSync,writeFileSync,mkdtempSync,rmSync}from'node:fs';import{execFileSync}from'node:child_process';import{join}from'node:path';import{tmpdir}from'node:os';
test('actual dispatch counter preserves totals across scopes, early returns, wraparound and concurrent readers',()=>{
 const source=readFileSync(new URL('../../engines/wasm-dolphin/vendor/dolphin/Source/Core/Core/PowerPC/CachedInterpreter/CachedInterpreter.cpp',import.meta.url),'utf8');
 const at=source.indexOf('class ScopedDispatchCounter'),end=source.indexOf('\n};',at)+3;assert.ok(at>0&&end>at);
 const type=source.slice(at,end),dir=mkdtempSync(join(tmpdir(),'melee-counter-'));
 try{const cpp=join(dir,'test.cpp'),exe=join(dir,'test');writeFileSync(cpp,`#include <atomic>
#include <cassert>
#include <cstdint>
#include <thread>
using u32=uint32_t;
${type}
void early(std::atomic<u32>& total,std::atomic<u32>& batches,bool mode){ScopedDispatchCounter c(total,batches,mode);for(int i=0;i<20;i++){c.Hit();if(i==9)return;}}
int main(){
 for(bool mode:{false,true}){
  std::atomic<u32> total{0},batches{0};
  {ScopedDispatchCounter c(total,batches,mode);for(u32 i=1;i<=1000;i++){c.Hit();assert(total.load()==(mode?0:i));}}
  assert(total==1000&&batches==u32(mode));
  {ScopedDispatchCounter empty(total,batches,mode);}assert(total==1000&&batches==u32(mode));
  early(total,batches,mode);assert(total==1010&&batches==u32(mode)*2);
  try{ScopedDispatchCounter c(total,batches,mode);c.Hit();throw 1;}catch(int){}assert(total==1011&&batches==u32(mode)*3);
  total=UINT32_MAX-2;early(total,batches,mode);assert(total==7);
  total=0;batches=0;std::atomic<bool> done{false};
  std::thread producer([&]{for(int j=0;j<1000;j++){ScopedDispatchCounter c(total,batches,mode);for(int i=0;i<100;i++)c.Hit();}done=true;});
  u32 last=0;while(!done.load()){const u32 next=total.load();assert(next>=last&&next<=100000);last=next;}
  producer.join();assert(total==100000&&batches==u32(mode)*1000);
 }
}
`);execFileSync('c++',['-std=c++20','-O2','-pthread',cpp,'-o',exe],{stdio:'pipe'});execFileSync(exe,[],{stdio:'pipe'});
 }finally{rmSync(dir,{recursive:true,force:true});}
});
