import test from 'node:test';import assert from 'node:assert/strict';
import{readFileSync,writeFileSync,mkdtempSync,rmSync}from'node:fs';import{resolve}from'node:path';import{tmpdir}from'node:os';import{spawnSync}from'node:child_process';
test('actual FPR emitters preserve raw bits, conditional writes and helper reloads',()=>{
 const dir=mkdtempSync(resolve(tmpdir(),'melee-fpr-'));
 try{
 const s=readFileSync('engines/wasm-dolphin/vendor/dolphin/Source/Core/Core/PowerPC/CachedInterpreter/CachedInterpreter.cpp','utf8');
 const names=['EmitU32Leb','EmitI32Leb','EmitLocalGet','EmitLocalSet','FprCacheIndex','EmitFprLaneGet','EmitFprLaneSet','ConfigureFprCacheLocals','EmitFprCacheFlush','EmitFprCacheReload','EmitStateLoadU32','EmitStateStoreU32Suffix','EmitStateLoadF64','EmitStateLoadI64','EmitStateStoreF64Suffix','EmitStateStoreI64Suffix'];
 const functions=names.map(n=>{const at=s.search(new RegExp('(?:void|bool) '+n+'\\('));assert.ok(at>=0,n);return s.slice(at,s.indexOf('\n}',at)+2);}).join('\n');
 const structAt=s.indexOf('struct WasmFprRegCache');const structure=s.slice(structAt,s.indexOf('static WasmFprRegCache s_fpr_rc;',structAt)+'static WasmFprRegCache s_fpr_rc;'.length);
 writeFileSync(resolve(dir,'emit.cpp'),`#include <vector>
#include <cstdint>
#include <vector>
bool EmitBlockMsrLoad(std::vector<uint8_t>&,uint32_t){return false;}
void EmitBlockMsrReload(std::vector<uint8_t>&){}
using s32=int32_t;static uint32_t s_wasm_specialized_state_base=0;
#include <cstdio>
#include <cstdlib>
using u8=uint8_t;using u32=uint32_t;using u64=uint64_t;
u32 s_wasm_emit_state_load_f64_count=0,s_wasm_emit_state_load_i64_count=0,s_wasm_emit_state_store_f64_count=0,s_wasm_emit_state_store_i64_count=0;
constexpr u32 WASM_GPR_LOCAL_BASE=8;
struct {bool present[32]{},dirty[32]{};u32 locals[32]{};} s_gpr_rc;
bool RegCacheGprIndex(u32,u32*){return false;}
u32 s_wasm_emit_state_load_u32_count=0,s_wasm_emit_state_store_u32_count=0;
${structure}
${functions}
int main(int argc,char**argv){
 const int mode=atoi(argv[1]);s_wasm_specialized_state_base=argc>2?strtoul(argv[2],nullptr,0):0;const bool enabled=mode!=0;s_fpr_rc.vector=mode==2;s_fpr_rc.active=enabled;s_fpr_rc.base=256;s_fpr_rc.local_base=2;
 std::vector<u8>empty{0};s_fpr_rc.active=true;ConfigureFprCacheLocals(empty,0);if(empty.size()!=1||empty[0]!=0||s_fpr_rc.active)abort();
 s_fpr_rc.active=enabled;
 std::vector<u8>b{0};ConfigureFprCacheLocals(b,3);if(enabled&&(b.size()!=5||b[1]!=(s_fpr_rc.vector?2:4)||s_fpr_rc.scratch_local!=(s_fpr_rc.vector?4:6)))abort();EmitFprCacheReload(b);
 EmitLocalGet(b,0);EmitStateLoadF64(b,256);EmitStateStoreF64Suffix(b,264);
 EmitLocalGet(b,1);b.insert(b.end(),{0x04,0x40});EmitFprCacheFlush(b);
 // A state-touching helper's effect, emitted with caching temporarily off.
 s_fpr_rc.active=false;EmitLocalGet(b,0);EmitStateLoadI64(b,512);EmitStateStoreI64Suffix(b,256);s_fpr_rc.active=enabled;
 EmitFprCacheReload(b);b.push_back(0x0b);
 EmitLocalGet(b,0);EmitStateLoadI64(b,256);EmitStateStoreI64Suffix(b,272);
 // Construct lane3 using two word stores; read words from a dirty lane.
 EmitLocalGet(b,0);EmitStateLoadU32(b,264);EmitStateStoreU32Suffix(b,280);
 EmitLocalGet(b,0);EmitStateLoadU32(b,268);EmitStateStoreU32Suffix(b,284);
 EmitFprCacheFlush(b);b.push_back(0x0b);fwrite(b.data(),1,b.size(),stdout);
}`);
 const compile=spawnSync('c++',['-std=c++17',resolve(dir,'emit.cpp'),'-o',resolve(dir,'emit')],{encoding:'utf8'});assert.equal(compile.status,0,compile.stderr);
 const leb=n=>{const a=[];do{const b=n&127;n>>>=7;a.push(b|(n?128:0));}while(n);return a;};const str=s=>[...leb(s.length),...Buffer.from(s)];const section=(id,b)=>[id,...leb(b.length),...b];
 for(const base of [0,4096,32768])for(const enabled of [0,1,2]){
  const e=spawnSync(resolve(dir,'emit'),[String(enabled),String(base)]);assert.equal(e.status,0);const body=[...e.stdout];
  const binary=Uint8Array.from([0,97,115,109,1,0,0,0,...section(1,[1,0x60,2,0x7f,0x7f,0]),...section(3,[1,0]),...section(5,[1,0,1]),...section(7,[2,...str('run'),0,0,...str('memory'),2,0]),...section(10,[1,...leb(body.length),...body])]);
  const instance=new WebAssembly.Instance(new WebAssembly.Module(binary)),view=new DataView(instance.exports.memory.buffer);
  for(const bits of [0n,0x8000000000000000n,0x7ff8000012345678n,0xfff0000000000001n,0x3ff0000000000000n,0xfff80000ffffffffn])for(const flag of [0,1]){
   const helper=0x4008000000000000n;view.setBigUint64(base+256,bits,true);view.setBigUint64(base+264,0x1234n,true);view.setBigUint64(base+272,0x5678n,true);view.setBigUint64(base+512,helper,true);
   instance.exports.run(base,flag);
   assert.equal(view.getBigUint64(base+280,true),bits,'two word aliases match dirty 64-bit lane');
   assert.equal(view.getBigUint64(base+264,true),bits,'conditional flush must preserve original FPR1 bits');
   assert.equal(view.getBigUint64(base+256,true),flag?helper:bits,'helper state remains authoritative');
   assert.equal(view.getBigUint64(base+272,true),flag?helper:bits,'read after branch uses correct lane');
  }
 }
 }finally{rmSync(dir,{recursive:true,force:true});}
});
