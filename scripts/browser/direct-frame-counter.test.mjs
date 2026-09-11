import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

test('actual frame gate compares all four bytes, rearms, and handles counter rollover',()=>{
  const source=readFileSync(new URL('../../engines/wasm-dolphin/vendor/dolphin/Source/Core/Core/PowerPC/CachedInterpreter/CachedInterpreter.cpp',import.meta.url),'utf8');
  const start=source.indexOf('static std::atomic<bool> s_browser_game_step_armed');
  const end=source.indexOf('void CachedInterpreter::ExecuteOneBlock',start);
  assert.ok(start>=0&&end>start);
  const dir=mkdtempSync(join(tmpdir(),'melee-frame-gate-'));
  try {
    const path=join(dir,'test.cpp'),exe=join(dir,'test');
    writeFileSync(path,`
#include <atomic>
#include <cstdint>
#include <cstring>
#include <limits>
#include <cassert>
using u8=uint8_t;using u32=uint32_t;
${source.slice(start,end)}
int main(){
  u8 counter[4]={0,0,0,0},other[4]={0,0,0,0};
  assert(!BrowserGameFrameStepComplete());
  for(int byte=0;byte<4;byte++){
    DolphinWeb_ArmGameFrameStep(counter);assert(!BrowserGameFrameStepComplete());
    counter[byte]^=1;assert(BrowserGameFrameStepComplete());
    DolphinWeb_CancelGameFrameStep();assert(!BrowserGameFrameStepComplete());
  }
  const u32 values[]={0,1,255,256,65535,65536,0xffffff,0x1000000,0xffffffff};
  auto write=[&](u32 v){for(int n=0;n<4;n++)counter[n]=v>>(24-8*n);};
  for(u32 v:values){write(v);DolphinWeb_ArmGameFrameStep(counter);
    assert(!BrowserGameFrameStepComplete());write(v+1);assert(BrowserGameFrameStepComplete());}
  DolphinWeb_ArmGameFrameStep(other);counter[0]^=1;assert(!BrowserGameFrameStepComplete());
  other[3]=1;assert(BrowserGameFrameStepComplete());
  DolphinWeb_CancelGameFrameStep();assert(!BrowserGameFrameStepComplete());
}
`);
    execFileSync('c++',['-std=c++20','-O2',path,'-o',exe],{stdio:'pipe'});
    execFileSync(exe,[],{stdio:'pipe'});
  } finally {rmSync(dir,{recursive:true,force:true});}
});
