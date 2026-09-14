import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
test('actual compact GPR emitters preserve sparse registers, conditional writes, helper reloads and scratch locals',()=>{
 const dir=mkdtempSync(resolve(tmpdir(),'melee-compact-gpr-'));
 try{
  const source=readFileSync('engines/wasm-dolphin/vendor/dolphin/Source/Core/Core/PowerPC/CachedInterpreter/CachedInterpreter.cpp','utf8');
  const names=['EmitU32Leb','EmitI32Leb','EmitLocalGet','EmitLocalSet','ConfigureGprCacheLocals','RegCacheGprIndex','EmitRegCacheFlushDirty','EmitRegCacheReloadAll','EmitStateLoadU32','EmitStateStoreU32Suffix'];
  const functions=names.map(name=>{const at=source.search(new RegExp('(?:void|bool|u32) '+name+'\\('));assert.ok(at>=0,name);return source.slice(at,source.indexOf('\n}',at)+2);}).join('\n');
  const at=source.indexOf('constexpr u32 WASM_GPR_LOCAL_BASE'),end=source.indexOf('static WasmGprRegCache s_gpr_rc;',at)+'static WasmGprRegCache s_gpr_rc;'.length;
  const structure=source.slice(at,end);
  writeFileSync(resolve(dir,'emit.cpp'),`#include <vector>
#include <cstdint>
#include <vector>
bool EmitBlockMsrLoad(std::vector<uint8_t>&,uint32_t){return false;}
void EmitBlockMsrReload(std::vector<uint8_t>&){}
using s32=int32_t;static uint32_t s_wasm_specialized_state_base=0;
#include <cstdio>
#include <cstdlib>
using u8=uint8_t;using u32=uint32_t;using u64=uint64_t;
${structure}
struct{u32 locals[64]{},scratch_local=0;bool dirty[64]{};}s_fpr_rc;
bool FprCacheIndex(u32,u32*){return false;}
// These fixtures intentionally disable FPR caching; entering it is an error.
void EmitFprLaneGet(std::vector<u8>&,u32){abort();}
void EmitFprLaneSet(std::vector<u8>&,u32){abort();}
void EmitFprCacheFlush(std::vector<u8>&){}
u32 s_wasm_emit_state_load_u32_count=0,s_wasm_emit_state_store_u32_count=0;
${functions}
int main(int argc,char**argv){
 const bool compact=atoi(argv[1]),enabled=atoi(argv[2]);s_gpr_rc.active=enabled;s_gpr_rc.gpr_base=256;
 std::vector<u8>b{4,3,0x7f,2,0x7e,1,0x7c,1,0x7f};
 const u32 next=ConfigureGprCacheLocals(b,(1u<<1)|(1u<<2)|(1u<<31),compact);
 if(next!=(compact?(enabled?11u:8u):40u))abort();
 if(!compact&&b!=std::vector<u8>({5,3,0x7f,2,0x7e,1,0x7c,1,0x7f,32,0x7f}))abort();
 // Model independent fastmem and FPR groups immediately after the GPRs.
 b[0]+=2;b.insert(b.end(),{1,0x7f,2,0x7c});
 b.insert(b.end(),{0x41,55});EmitLocalSet(b,next);
 b.insert(b.end(),{0x44,0,0,0,0,0,0,0xf4,0x3f});EmitLocalSet(b,next+1);
 EmitLocalGet(b,next+1);EmitLocalSet(b,next+2);
 EmitRegCacheReloadAll(b);
 EmitStateLoadU32(b,0);b.insert(b.end(),{0x04,0x40});
 EmitLocalGet(b,0);EmitStateLoadU32(b,260);EmitStateStoreU32Suffix(b,380);b.push_back(0x0b);
 EmitRegCacheFlushDirty(b);
 // A state-touching helper writes GPR1; reload must preserve its result.
 s_gpr_rc.active=false;EmitLocalGet(b,0);EmitStateLoadU32(b,268);EmitStateStoreU32Suffix(b,260);s_gpr_rc.active=enabled;
 EmitRegCacheReloadAll(b);
 EmitLocalGet(b,0);EmitStateLoadU32(b,380);EmitStateStoreU32Suffix(b,264);
 EmitLocalGet(b,0);EmitStateLoadU32(b,260);EmitStateStoreU32Suffix(b,1024);
 EmitRegCacheFlushDirty(b);
 EmitLocalGet(b,0);EmitLocalGet(b,next);EmitStateStoreU32Suffix(b,1100);
 EmitLocalGet(b,0);EmitLocalGet(b,next+2);b.insert(b.end(),{0x39,0x03});EmitU32Leb(b,1112);
 b.push_back(0x0b);fwrite(b.data(),1,b.size(),stdout);
}`);
  const compiled=spawnSync('c++',['-std=c++17',resolve(dir,'emit.cpp'),'-o',resolve(dir,'emit')],{encoding:'utf8'});assert.equal(compiled.status,0,compiled.stderr);
  const leb=n=>{const a=[];do{const b=n&127;n>>>=7;a.push(b|(n?128:0));}while(n);return a;},str=s=>[...leb(s.length),...Buffer.from(s)],sec=(id,b)=>[id,...leb(b.length),...b];
  for(const compact of[0,1])for(const enabled of[0,1]){
   const emitted=spawnSync(resolve(dir,'emit'),[String(compact),String(enabled)]);assert.equal(emitted.status,0);const body=[...emitted.stdout];
   const binary=Uint8Array.from([0,97,115,109,1,0,0,0,...sec(1,[1,0x60,1,0x7f,0]),...sec(3,[1,0]),...sec(5,[1,0,1]),...sec(7,[2,...str('run'),0,0,...str('memory'),2,0]),...sec(10,[1,...leb(body.length),...body])]);
   const instance=new WebAssembly.Instance(new WebAssembly.Module(binary)),view=new DataView(instance.exports.memory.buffer);
   for(const flag of[0,1])for(const salt of[0,0xffffffff,0x31415926]){
    const initial=Array.from({length:32},(_,reg)=>((0x7ffffff0+reg)^salt)>>>0);view.setUint32(0,flag,true);initial.forEach((v,reg)=>view.setUint32(256+4*reg,v,true));
    instance.exports.run(0);
    for(let reg=0;reg<32;reg++){const expected=reg===1?initial[3]:reg===2||reg===31?(flag?initial[1]:initial[31]):initial[reg];assert.equal(view.getUint32(256+reg*4,true),expected,'compact '+compact+' enabled '+enabled+' flag '+flag+' register '+reg);}
    assert.equal(view.getUint32(1024,true),initial[3]);assert.equal(view.getUint32(1100,true),55);assert.equal(view.getFloat64(1112,true),1.25);
   }
  }
 }finally{rmSync(dir,{recursive:true,force:true});}
});
