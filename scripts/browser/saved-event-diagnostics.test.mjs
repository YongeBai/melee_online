import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
test('actual saved-event diagnostic preserves heap and exact 64-bit fields while exposing execution order',()=>{
 const source=readFileSync('engines/wasm-dolphin/vendor/dolphin/Source/Core/Core/CoreTiming.cpp','utf8');
 const start=source.indexOf('std::string CoreTimingManager::DescribeBrowserEvents() const');
 const end=source.indexOf('\n#endif',start);assert.ok(start>=0&&end>start);
 assert.match(source,/if \(p.IsWriteMode\(\)\) m_browser_saved_events = DescribeBrowserEvents\(\);/);
 const dir=mkdtempSync(join(tmpdir(),'saved-events-'));
 try{
  writeFileSync(join(dir,'test.cpp'),`#include <algorithm>
#include <cassert>
#include <cstdint>
#include <iostream>
#include <string>
#include <tuple>
#include <vector>
#include <picojson.h>
using u64=uint64_t;using s64=int64_t;
struct EventType{const std::string* name;};
struct Event{s64 time;u64 fifo_order,userdata;EventType* type;auto operator<=>(const Event& o)const{return std::tie(time,fifo_order)<=>std::tie(o.time,o.fifo_order);}bool operator==(const Event& o)const{return std::tie(time,fifo_order)==std::tie(o.time,o.fifo_order);}};
struct CoreTimingManager{std::vector<Event> m_event_queue;struct{s64 global_timer;}m_globals{9007199254740993LL};u64 m_idled_cycles=9007199254740995ULL,m_event_fifo_id=18446744073709551615ULL;struct System{struct PPC{uint32_t pc=0x80005340,gpr[32]={0,0x804eec00};};const PPC& GetPPCState()const{static PPC p;return p;}}m_system;std::string DescribeBrowserEvents()const;};
${source.slice(start,end)}
int main(){
 const std::string names[]={"VI\\n\\\"field", "Audio", "Late"};EventType types[]={{&names[0]},{&names[1]},{&names[2]}};
 CoreTimingManager t;t.m_event_queue={{101,3,0,&types[2]},{100,2,0,&types[1]},{100,1,18446744073709551615ULL,&types[0]}};
 const auto original=t.m_event_queue;const auto a=t.DescribeBrowserEvents();assert(t.m_event_queue==original);std::cout<<a<<"\\n";
 t.m_event_fifo_id=3;std::cout<<t.DescribeBrowserEvents()<<"\\n";
}
`);
  execFileSync('c++',['-std=c++20','-O2','-I',resolve('engines/wasm-dolphin/vendor/dolphin/Externals/picojson'),join(dir,'test.cpp'),'-o',join(dir,'test')]);
  const [a,b]=execFileSync(join(dir,'test'),{encoding:'utf8'}).trim().split('\n').map(s=>JSON.parse(s));
  assert.equal(a.globalTimer,'9007199254740993');assert.equal(a.idleCycles,'9007199254740995');assert.equal(a.nextOrder,'18446744073709551615');assert.equal(a.ordersValid,true);
  assert.equal(a.guestPc,String(0x80005340));assert.equal(a.guestStackPointer,String(0x804eec00));
  assert.deepEqual(a.events.map(e=>e.order),['1','2','3']);assert.equal(a.events[0].userdata,'18446744073709551615');assert.equal(a.events[0].name,'VI\n"field');assert.equal(b.ordersValid,false);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
