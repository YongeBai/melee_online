import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const source=readFileSync(new URL('../../engines/wasm-dolphin/vendor/dolphin/Source/Core/Core/PowerPC/MMU.cpp',import.meta.url),'utf8');
function method(name) {
  const start=source.indexOf(`void MMU::${name}()`);
  assert.ok(start>=0);
  const open=source.indexOf('{',start);let depth=1,end=open+1;
  for(;depth&&end<source.length;end++)depth+=source[end]==='{'?1:source[end]==='}'?-1:0;
  assert.equal(depth,0);
  return source.slice(start,end);
}

test('actual BAT restore methods retain only identical mappings during checked restore',()=>{
  const dir=mkdtempSync(join(tmpdir(),'melee-bat-'));
  try {
    const path=join(dir,'test.cpp');
    writeFileSync(path,`
#include <array>
#include <memory>
#include <cassert>
#include <cstdint>
using u32=uint32_t;
using BatTable=std::array<u32,32768>;
namespace State { bool keep=false; bool BrowserKeepJit(){return keep;} }
constexpr u32 SPR_DBAT0U=0,SPR_IBAT0U=1,SPR_DBAT4U=2,SPR_IBAT4U=3;
struct Jit { int clears=0;void ClearSafe(){clears++;} };
struct System { Jit jit;bool IsWii(){return false;} Jit& GetJitInterface(){return jit;} };
struct Memory { bool fake=false;int remaps=0;bool GetFakeVMEM(){return fake;}
  void UpdateDBATMappings(const BatTable&){remaps++;} };
struct Hid {bool SBE=false;}; Hid HID4(int){return {};}
struct MMU {
  BatTable m_dbat_table{},m_ibat_table{},next_d{},next_i{};
  System m_system;Memory m_memory;int m_ppc_state=0;
  std::array<int,1> m_page_table{};int reloads=0;
  void ReloadPageTable(){reloads++;}
  void UpdateBATs(BatTable& out,u32 spr){out=spr==SPR_DBAT0U?next_d:next_i;}
  void UpdateFakeMMUBat(BatTable& out,u32 address){out[address>>17]=address|1;}
  void DBATUpdated();void IBATUpdated();
};
${method('DBATUpdated')}
${method('IBATUpdated')}
int main(){
  MMU m;m.next_d[17]=0x10001;m.next_i[17]=0x20001;
  m.DBATUpdated();m.IBATUpdated();assert(m.m_system.jit.clears==2);
  State::keep=true;const int remaps=m.m_memory.remaps;
  m.DBATUpdated();m.IBATUpdated();assert(m.m_system.jit.clears==2);
  assert(m.m_memory.remaps==remaps);
  // A change at the far end of either 128 KiB table must invalidate.
  m.next_d.back()=0x34567;m.DBATUpdated();assert(m.m_system.jit.clears==3);
  assert(m.m_dbat_table.back()==0x34567);
  m.next_i.back()=0x76543;m.IBATUpdated();assert(m.m_system.jit.clears==4);
  assert(m.m_ibat_table.back()==0x76543);
  // Fake-VMEM mappings are also part of the comparison.
  m.m_memory.fake=true;m.DBATUpdated();m.IBATUpdated();assert(m.m_system.jit.clears==6);
  m.DBATUpdated();m.IBATUpdated();assert(m.m_system.jit.clears==6);
  // Ordinary writes and unchecked restores preserve Dolphin's normal flush.
  State::keep=false;m.DBATUpdated();m.IBATUpdated();assert(m.m_system.jit.clears==8);
}
`);
    for(const define of [[],['-D_ARCH_32']]) {
      const exe=join(dir,'test');
      execFileSync('c++',['-std=c++20','-O1',...define,path,'-o',exe],{stdio:'pipe'});
      execFileSync(exe,[],{stdio:'pipe'});
    }
  } finally {rmSync(dir,{recursive:true,force:true});}
});
