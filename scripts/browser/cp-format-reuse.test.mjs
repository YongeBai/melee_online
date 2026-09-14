import test from'node:test';import assert from'node:assert/strict';import{readFileSync,writeFileSync,mkdtempSync,rmSync}from'node:fs';import{execFileSync}from'node:child_process';import{resolve,join}from'node:path';import{tmpdir}from'node:os';
const root=resolve('engines/wasm-dolphin');
test('actual CP callback preserves writes, timing and dirty state across every command byte',()=>{
 const src=readFileSync(root+'/vendor/dolphin/Source/Core/VideoCommon/OpcodeDecoding.cpp','utf8');
 const a=src.indexOf('static int ClassifyCPFormatWrite('),classifier=src.slice(a,src.indexOf('\n}',a)+2);
 const start=src.indexOf('  OPCODE_CALLBACK(void OnCP('),end=src.indexOf('  OPCODE_CALLBACK(void OnBP(',start);
 const callback=src.slice(start,end).replace('OPCODE_CALLBACK(void OnCP(u8 command, u32 value))','void OnCP(u8 command, u32 value)');
 const dir=mkdtempSync(join(tmpdir(),'melee-cp-format-'));
 try{const cpp=join(dir,'test.cpp'),exe=join(dir,'test');writeFileSync(cpp,`#include <array>
#include <bitset>
#include <cstdint>
#include <cassert>
using u8=uint8_t;using u32=uint32_t;using u64=uint64_t;
#define __EMSCRIPTEN__
#define INCSTAT(x) ((void)0)
constexpr u8 CP_COMMAND_MASK=0xf0,CP_VAT_MASK=7;constexpr int CP_NUM_VAT_REG=8;
enum{MATINDEX_A=0x30,MATINDEX_B=0x40,VCD_LO=0x50,VCD_HI=0x60,CP_VAT_REG_A=0x70,CP_VAT_REG_B=0x80,CP_VAT_REG_C=0x90,ARRAY_BASE=0xa0};
struct Word{u32 Hex=7;};struct VAT{Word g0,g1,g2;};
struct CPState{struct{Word low,high;}vtx_desc;std::array<VAT,8>vtx_attr;u32 calls=0;
 void LoadCPReg(u8 cmd,u32 value){++calls;switch(cmd&CP_COMMAND_MASK){case VCD_LO:vtx_desc.low.Hex=value;break;case VCD_HI:vtx_desc.high.Hex=value;break;case CP_VAT_REG_A:vtx_attr[cmd&7].g0.Hex=value;break;case CP_VAT_REG_B:vtx_attr[cmd&7].g1.Hex=value;break;case CP_VAT_REG_C:vtx_attr[cmd&7].g2.Hex=value;break;}}};
struct BitSet8:std::bitset<8>{using bitset::bitset;static BitSet8 AllTrue(int){return BitSet8(255);}};
namespace VertexLoaderManager{BitSet8 g_main_vat_dirty,g_preprocess_vat_dirty;bool g_bases_dirty=false,g_needs_cp_xf_consistency_check=false;}
namespace Core{struct XF{void SetTexMatrixChangedA(u32){}void SetTexMatrixChangedB(u32){}};struct System{XF xf;static System& GetInstance(){static System s;return s;}XF& GetXFStateManager(){return xf;}};}
bool s_cp_format_reuse=false;struct{u64 writes=0,unchanged=0,avoided=0;}s_cp_format_stats;
${classifier}
template<bool is_preprocess>struct Callback{CPState state;u32 m_cycles=0;CPState& GetCPState(){return state;}
${callback}
};
int main(){
 for(bool enabled:{false,true})for(u32 command=0;command<256;command++)for(u32 value:{7,9})for(u32 old_dirty:{0,0x52,255}){
  Callback<true> c;const auto old=c.state;const int classification=ClassifyCPFormatWrite(old,command,value);s_cp_format_reuse=enabled;s_cp_format_stats={};VertexLoaderManager::g_preprocess_vat_dirty=BitSet8(old_dirty);
  c.OnCP(command,value);assert(c.state.calls==1&&c.m_cycles==12);
  auto expected=old;expected.LoadCPReg(command,value);assert(c.state.vtx_desc.low.Hex==expected.vtx_desc.low.Hex&&c.state.vtx_desc.high.Hex==expected.vtx_desc.high.Hex);
  for(int j=0;j<8;j++)assert(c.state.vtx_attr[j].g0.Hex==expected.vtx_attr[j].g0.Hex&&c.state.vtx_attr[j].g1.Hex==expected.vtx_attr[j].g1.Hex&&c.state.vtx_attr[j].g2.Hex==expected.vtx_attr[j].g2.Hex);
  const bool skip=enabled&&classification==2;u32 dirty=old_dirty;const auto sub=command&0xf0;
  if(!skip){if(sub==VCD_LO||sub==VCD_HI)dirty=255;else if(sub==CP_VAT_REG_A||sub==CP_VAT_REG_B||sub==CP_VAT_REG_C)dirty|=1u<<(command&7);}
  assert(VertexLoaderManager::g_preprocess_vat_dirty.to_ulong()==dirty);
  assert(s_cp_format_stats.writes==u64(classification!=0)&&s_cp_format_stats.unchanged==u64(classification==2)&&s_cp_format_stats.avoided==u64(skip));
  Callback<false> gpu;VertexLoaderManager::g_main_vat_dirty=BitSet8(old_dirty);const auto before=s_cp_format_stats;
  gpu.OnCP(command,value);assert(gpu.state.calls==1&&gpu.m_cycles==12);assert(s_cp_format_stats.writes==before.writes&&s_cp_format_stats.avoided==before.avoided);
  u32 gpu_dirty=old_dirty;if(sub==VCD_LO||sub==VCD_HI)gpu_dirty=255;else if(sub==CP_VAT_REG_A||sub==CP_VAT_REG_B||sub==CP_VAT_REG_C)gpu_dirty|=1u<<(command&7);
  assert(VertexLoaderManager::g_main_vat_dirty.to_ulong()==gpu_dirty);
 }
}
`);execFileSync('c++',['-std=c++20','-O2',cpp,'-o',exe],{stdio:'pipe'});execFileSync(exe,[],{stdio:'pipe'});
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('CP opportunity snapshots require paused CPU ownership',()=>{
 const src=readFileSync(root+'/core/upstream/dolphin_web_core.cpp','utf8'),a=src.indexOf('EMSCRIPTEN_KEEPALIVE const char* BrowserCPFormatStats(');assert.ok(a>0);
 const body=src.slice(a,src.indexOf('\n}',a)+2),dir=mkdtempSync(join(tmpdir(),'melee-cp-owner-'));
 try{const cpp=join(dir,'test.cpp'),exe=join(dir,'test');writeFileSync(cpp,`#include <cassert>
#include <string>
#define EMSCRIPTEN_KEEPALIVE
bool s_runtime_initialized=true,paused=true;int guards=0,reads=0;
namespace Core{enum class State{Paused,Running};struct System{static System& GetInstance(){static System s;return s;}};State GetState(System&){return paused?State::Paused:State::Running;}struct CPUThreadGuard{CPUThreadGuard(System&){assert(paused);++guards;}~CPUThreadGuard(){--guards;}};}
const char* DolphinWeb_CPFormatStats(){assert(guards==1);++reads;return "OK";}
${body}
int main(){assert(std::string(BrowserCPFormatStats())=="OK"&&reads==1&&guards==0);paused=false;assert(std::string(BrowserCPFormatStats()).find("error")!=std::string::npos&&reads==1&&guards==0);paused=true;s_runtime_initialized=false;assert(std::string(BrowserCPFormatStats()).find("error")!=std::string::npos&&reads==1&&guards==0);}
`);execFileSync('c++',['-std=c++20','-O2',cpp,'-o',exe],{stdio:'pipe'});execFileSync(exe,[],{stdio:'pipe'});
 }finally{rmSync(dir,{recursive:true,force:true});}
});
