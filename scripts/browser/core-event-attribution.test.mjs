import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {resolve} from 'node:path';import {spawnSync} from 'node:child_process';
test('hardware callback attribution preserves inclusive time, nested wait and disabled gating',()=>{
 const dir=mkdtempSync(resolve(tmpdir(),'melee-event-profile-'));
 try{
  writeFileSync(resolve(dir,'test.cpp'),`#include "Core/WasmTimingProfile.h"
#include <cassert>
using namespace DolphinWeb;
int main(){
 using S=BrowserProfile::Stage;
 const auto count=[](S s){return BrowserProfile::counters[static_cast<unsigned>(s)].count.load();};
 const auto total=[](S s){return BrowserProfile::counters[static_cast<unsigned>(s)].total_us.load();};
 BrowserProfile::enabled=true;
 WasmTimingProfile::RecordCoreTimingEvent("VICallback",200,0);
 assert(count(S::CoreEventVi)==0);
 WasmTimingProfile::s_current_slice.active=true;
 WasmTimingProfile::s_current_slice.throttle_wait_us=90;
 WasmTimingProfile::s_current_slice.dvd_wait_us=30;
 WasmTimingProfile::RecordCoreTimingEvent("VICallback",200,20);
 assert(count(S::CoreEventVi)==1&&total(S::CoreEventVi)==200);
 assert(total(S::CoreEventWait)==100);
 assert(WasmTimingProfile::s_current_slice.video_work_us==100);
 assert(WasmTimingProfile::s_current_slice.longest_event_us==200);
 WasmTimingProfile::RecordCoreTimingEvent("DSPCallback",45,120);
 WasmTimingProfile::RecordCoreTimingEvent("AudioDMACallback",3,120);
 WasmTimingProfile::RecordCoreTimingEvent("GPUSleeper",7,120);
 WasmTimingProfile::RecordCoreTimingEvent("SyncGPUCallback",25,120);
 WasmTimingProfile::RecordCoreTimingEvent("DecCallback",2,120);
 WasmTimingProfile::RecordCoreTimingEvent("PatchEngine",11,120);
 WasmTimingProfile::RecordCoreTimingEvent("FinishReadDVDThread",19,120);
 WasmTimingProfile::RecordCoreTimingEvent("future unknown event",5,120);
 WasmTimingProfile::RecordCoreTimingEvent("",0,120);
 assert(total(S::CoreEventDsp)==45&&total(S::CoreEventAudioDma)==3);
 assert(total(S::CoreEventGpuSleep)==7&&total(S::CoreEventDecrementer)==2);
 assert(total(S::CoreEventGpuSync)==25);
 assert(total(S::CoreEventPatch)==11&&total(S::CoreEventDvd)==19);
 assert(total(S::CoreEventOther)==5&&count(S::CoreEventOther)==2);
 assert(count(S::CoreEventWait)==10&&total(S::CoreEventWait)==100);
 // Inconsistent/reset wait snapshots cannot wrap or exceed the callback.
 WasmTimingProfile::RecordCoreTimingEvent("VICallback",4,0);
 WasmTimingProfile::RecordCoreTimingEvent("VICallback",4,200);
 assert(total(S::CoreEventWait)==104);
 BrowserProfile::enabled=false;
 WasmTimingProfile::RecordCoreTimingEvent("VICallback",500,0);
 assert(total(S::CoreEventVi)==208&&total(S::CoreEventWait)==104);
}
`);
 const b=spawnSync('c++',['-std=c++17','-D__EMSCRIPTEN__','-I',resolve('engines/wasm-dolphin/vendor/dolphin/Source/Core'),resolve(dir,'test.cpp'),'-o',resolve(dir,'test')],{encoding:'utf8'});assert.equal(b.status,0,b.stderr);
 const r=spawnSync(resolve(dir,'test'),[],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
