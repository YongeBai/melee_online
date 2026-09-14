import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';

// Execute actual C++-generated WASM, exercising bytes, guards and FIFO bursts.
test('integer FIFO emitter preserves widths, flush boundary and MMU fallbacks',()=>{
 const dir=mkdtempSync(resolve(tmpdir(),'melee-integer-fifo-'));
 try{
 const source=readFileSync('engines/wasm-dolphin/vendor/dolphin/Source/Core/Core/PowerPC/CachedInterpreter/CachedInterpreter.cpp','utf8');
 const names=['EmitU32Leb','EmitI32Leb','EmitLocalGet','EmitLocalSet','EmitI32Const','EmitStateLoadU32','EmitStateStoreU32Prefix','EmitStateStoreU32Suffix','EmitBswap32FromLocal','EmitBswap16FromLocal','EmitIntegerFifoStore','EmitWriteU32MaybeDirect','EmitWriteU8MaybeDirect','EmitWriteU16MaybeDirect'];
 const functions=names.map(name=>{const start=source.search(new RegExp('(?:void|bool) '+name+'\\('));assert.ok(start>=0,name);return source.slice(start,source.indexOf('\n}',start)+2);}).join('\n');
 writeFileSync(resolve(dir,'emit.cpp'),`#include <vector>
#include <cstdint>
#include <atomic>
#include <vector>
bool EmitBlockMsrLoad(std::vector<uint8_t>&,uint32_t){return false;}
void EmitBlockMsrReload(std::vector<uint8_t>&){}
using s32=int32_t;static uint32_t s_wasm_specialized_state_base=0;
#include <cstdio>
#include <cstdlib>
using u8=uint8_t; using u16=uint16_t; using u32=uint32_t; using s32=int32_t;
bool enabled=true, mapped=true;
std::atomic<bool>s_dolphin_web_bswap_rotate{false};std::atomic<u32>s_bswap_rotate_sites{0};
constexpr u32 DOLPHIN_WEB_ENABLE_INTEGER_FIFO=1u<<16, WASM_IMPORT_FASTCHECK_GPFIFO_INDEX=14, WASM_GPR_LOCAL_BASE=8;
bool DolphinWebFeatureEnabled(u32){return enabled;}
namespace GPFifo {constexpr u32 GATHER_PIPE_SIZE=32;}
namespace Core {struct System {static System& GetInstance(){static System s;return s;} System& GetMMU(){return *this;} bool IsOptimizableGatherPipeWrite(u32){return mapped;}};}
struct WasmStateLayout {u32 msr_offset=0,gather_pipe_ptr_offset=4,gather_pipe_base_ptr_offset=8,ram_base=8192,ram_size_real=4096;};
bool EmitKnownAddressWrite(std::vector<u8>&,const WasmStateLayout&,u32){return false;}
struct {bool present[32]{},dirty[32]{};u32 locals[32]{};} s_gpr_rc;
bool RegCacheGprIndex(u32,u32*){return false;}
struct {u32 local_base=40,scratch_local=0;bool dirty[64]{};} s_fpr_rc;
bool FprCacheIndex(u32,u32*){return false;}
// These fixtures intentionally disable FPR caching; entering it is an error.
void EmitFprLaneGet(std::vector<u8>&,u32){abort();}
void EmitFprLaneSet(std::vector<u8>&,u32){abort();}
u32 s_wasm_emit_state_load_u32_count=0,s_wasm_emit_state_store_u32_count=0;
${functions}
int main(int argc,char** argv){int width=atoi(argv[1]);enabled=atoi(argv[2]);mapped=atoi(argv[3]);std::vector<u8>b{1,1,0x7f};WasmStateLayout l;
if(width==4)EmitWriteU32MaybeDirect(b,l);else if(width==2)EmitWriteU16MaybeDirect(b,l);else EmitWriteU8MaybeDirect(b,l);
b.push_back(0x0b);fwrite(b.data(),1,b.size(),stdout);}
`);
 const build=spawnSync('c++',['-std=c++17',resolve(dir,'emit.cpp'),'-o',resolve(dir,'emit')],{encoding:'utf8'});assert.equal(build.status,0,build.stderr);
 const leb=n=>{const b=[];do{const x=n&127;n>>>=7;b.push(x|(n?128:0));}while(n);return b;};
 const str=s=>[...leb(s.length),...Buffer.from(s)];
 const section=(id,b)=>[id,...leb(b.length),...b];
 for(const width of [1,2,4])for(const enabled of [0,1])for(const mapped of [0,1]){
 const emitted=spawnSync(resolve(dir,'emit'),[String(width),String(enabled),String(mapped)]);assert.equal(emitted.status,0);
 const imports=[15,...Array.from({length:15},(_,i)=>[...str('env'),...str('f'+i),0,0]).flat()];
 const body=[...emitted.stdout];
 const binary=Uint8Array.from([0,97,115,109,1,0,0,0,...section(1,[1,0x60,3,0x7f,0x7f,0x7f,0]),...section(2,imports),...section(3,[1,0]),...section(5,[1,0,1]),...section(7,[2,...str('run'),0,15,...str('memory'),2,0]),...section(10,[1,...leb(body.length),...body])]);
 let calls=[];const env=Object.fromEntries(Array.from({length:15},(_,i)=>['f'+i,(...args)=>calls.push([i,...args])]));
 const instance=new WebAssembly.Instance(new WebAssembly.Module(binary),{env});
 const mem=new DataView(instance.exports.memory.buffer), bytes=new Uint8Array(mem.buffer);
 for(const [address,msr]of[[0xcc008000,16],[0xcc008004,16],[0xcc008000,0],[0xcc008000,17]])for(const count of [0,32-width]){
 bytes.fill(0);calls=[];mem.setUint32(0,msr,true);mem.setUint32(4,1024+count,true);mem.setUint32(8,1024,true);
 instance.exports.run(0,address,0x12345678);
 const direct=enabled&&mapped&&address===0xcc008000&&msr===16;
 if(direct){
 assert.equal(mem.getUint32(4,true),1024+count+width);
 assert.deepEqual([...bytes.slice(1024+count,1024+count+width)],[0x12,0x34,0x56,0x78].slice(4-width));
 assert.equal(calls.length,count+width>=32?1:0);if(calls.length)assert.equal(calls[0][0],14);
 }else{assert.equal(mem.getUint32(4,true),1024+count);assert.equal(calls.length,1);assert.equal(calls[0][0],width===4?1:width===2?5:3);}
 }
 bytes.fill(0); calls=[];
 instance.exports.run(0,0x80000020,0x12345678);
 assert.equal(calls.length,0);
 assert.deepEqual([...bytes.slice(8192+32,8192+32+width)],[0x12,0x34,0x56,0x78].slice(4-width));
 }
 }finally{rmSync(dir,{recursive:true,force:true});}
});
