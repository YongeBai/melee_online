import test from'node:test';import assert from'node:assert/strict';import{readFileSync,writeFileSync,mkdtempSync,rmSync}from'node:fs';import{execFileSync}from'node:child_process';import{resolve}from'node:path';import{tmpdir}from'node:os';
const leb=n=>{const b=[];do{let x=n&127;n>>>=7;b.push(n?x|128:x);}while(n);return b;};
const section=(id,b)=>[id,...leb(b.length),...b],name=s=>[s.length,...Buffer.from(s)];
function fun(s,n){const re=new RegExp('(?:void|bool|u32) '+n+'\\(');const at=s.search(re);assert.ok(at>=0,n);return s.slice(at,s.indexOf('\n}',at)+2);}
test('actual MSR cache emission preserves all mode bits, helper changes and halt boundaries',()=>{
 const source=readFileSync('engines/wasm-dolphin/vendor/dolphin/Source/Core/Core/PowerPC/CachedInterpreter/CachedInterpreter.cpp','utf8');
 const start=source.indexOf('struct WasmBlockMsrCache'),end=source.indexOf('\nvoid EmitStateLoadU32(',start);assert.ok(start>0&&end>start);
 const dir=mkdtempSync(resolve(tmpdir(),'melee-msr-cache-'));
 try{
 const cpp=`#include <array>
#include <atomic>
#include <cassert>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <span>
#include <vector>
using u8=uint8_t;using u32=uint32_t;using s32=int32_t;
void EmitQStateCacheRefreshAfterHelper(std::vector<uint8_t>&){}
static u32 s_wasm_specialized_state_base=0,s_wasm_emit_state_load_u32_count=0;
static std::atomic<u32> s_block_msr_cache_load_sites{0};
${['EmitU32Leb','EmitI32Leb','EmitLocalGet','EmitLocalSet','EmitI32Const'].map(n=>fun(source,n)).join('\n')}
void EmitFprCacheReload(std::vector<u8>&){}
bool FprCacheIndex(u32,u32*){return false;}
void EmitFprLaneGet(std::vector<u8>&,u32){abort();}
bool RegCacheGprIndex(u32,u32*){return false;}
struct{std::array<bool,32>present{};std::array<u32,32>locals{};}s_gpr_rc;
${source.slice(start,end)}
${fun(source,'EmitStateLoadU32')}
${fun(source,'EmitImportedHaltCheck')}
namespace PPCAnalyst {struct CodeOp{struct{u32 OPCD=0,SUBOP10=0,SUBOP5=0;bool LK=false,Rc=false;}inst;bool skip=false;};}
${['IsPairedSingleArithmeticSubop','IsPairedSingleMergeSubop','IsSinglePrecisionArithmeticSubop','CanCacheBlockMsr','CanHoistFpuGuard'].map(n=>fun(source,n)).join('\n')}
PPCAnalyst::CodeOp op(u32 word){PPCAnalyst::CodeOp o;o.inst.OPCD=word>>26;o.inst.SUBOP10=(word>>1)&1023;o.inst.SUBOP5=(word>>1)&31;o.inst.LK=o.inst.Rc=word&1;return o;}
int main(int argc,char** argv){
 std::vector<PPCAnalyst::CodeOp> good{op(48u<<26),op(14u<<26),op(52u<<26),op((19u<<26)|(16u<<1))};assert(CanCacheBlockMsr(good));assert(!CanHoistFpuGuard(good));
 for(u32 bad:{17u<<26,(31u<<26)|(146u<<1),(31u<<26)|(339u<<1),(19u<<26)|(50u<<1),(18u<<26)|1,(16u<<26)|1,63u<<26,0u}){auto q=good;q.insert(q.begin()+1,op(bad));assert(!CanCacheBlockMsr(q));q[1].skip=true;assert(CanCacheBlockMsr(q));}
 auto one=good;one.erase(one.begin());assert(!CanCacheBlockMsr(one));
 std::vector<PPCAnalyst::CodeOp> pair{op((4u<<26)|(21u<<1)),op((59u<<26)|(21u<<1))};assert(CanCacheBlockMsr(pair));assert(CanHoistFpuGuard(pair));pair[0].inst.Rc=true;assert(!CanCacheBlockMsr(pair));
 s_block_msr_cache={true,900,7};try{ScopedBlockMsrCache scope;assert(!s_block_msr_cache.active);s_block_msr_cache={true,256,2};{ScopedBlockMsrCache nested;assert(!s_block_msr_cache.active);}assert(s_block_msr_cache.offset==256);throw 1;}catch(int){}assert(s_block_msr_cache.active&&s_block_msr_cache.offset==900&&s_block_msr_cache.local==7);s_block_msr_cache={};
 const bool enabled=argc>1&&atoi(argv[1]);ScopedBlockMsrCache scope;
 std::vector<u8>b{1,2,0x7f}; // params state, helper mode; locals MSR=2, first=3
 if(enabled){s_block_msr_cache={true,256,2};EmitBlockMsrReload(b);}
 EmitStateLoadU32(b,256);EmitI32Const(b,0x2011);b.push_back(0x71);EmitLocalSet(b,3);
 EmitLocalGet(b,0);EmitLocalGet(b,1);b.insert(b.end(),{0x10,0});EmitImportedHaltCheck(b);
 EmitLocalGet(b,3);EmitStateLoadU32(b,256);EmitI32Const(b,0x6001);b.push_back(0x71);b.push_back(0x73);
 EmitStateLoadU32(b,260);b.push_back(0x73);b.push_back(0x0b);
 fwrite(b.data(),1,b.size(),stdout);
}
`;
 writeFileSync(resolve(dir,'emit.cpp'),cpp);execFileSync('c++',['-std=c++20','-O2',resolve(dir,'emit.cpp'),'-o',resolve(dir,'emit')]);
 const make=enabled=>{const body=[...execFileSync(resolve(dir,'emit'),[enabled?'1':'0'])];return new WebAssembly.Module(Uint8Array.from([0,97,115,109,1,0,0,0,...section(1,[1,0x60,2,0x7f,0x7f,1,0x7f]),...section(2,[2,...name('env'),...name('memory'),2,3,1,1,...name('env'),...name('helper'),0,0]),...section(3,[1,0]),...section(7,[1,...name('f'),0,1]),...section(10,[1,...leb(body.length),...body])]));};
 const baseline=make(false),candidate=make(true);let seed=0x239197;
 const next=()=>seed=(Math.imul(seed,1664525)+1013904223)>>>0;
 const memory=new WebAssembly.Memory({initial:1,maximum:1,shared:true}),view=new DataView(memory.buffer);
 const put=(p,x)=>view.setUint32(p,x,true),get=p=>view.getUint32(p,true);
 let changed=0,other=0;
 const helper=(base,mode)=>{if(mode){put(base+256,changed);put(base+260,other);}return mode===2?1:0;};
 const off=new WebAssembly.Instance(baseline,{env:{memory,helper}}).exports.f,on=new WebAssembly.Instance(candidate,{env:{memory,helper}}).exports.f;
 for(let i=0;i<60000;i++){
  const base=i%2?4096:0,initial=next(),extra=next(),mode=i%3;changed=next();other=next();
  put(base+256,initial);put(base+260,extra);const a=off(base,mode),stateA=[get(base+256),get(base+260)];
  put(base+256,initial);put(base+260,extra);const b=on(base,mode),stateB=[get(base+256),get(base+260)];
  const expected=mode===2?1:((initial&0x2011)^((mode?changed:initial)&0x6001)^(mode?other:extra));
  assert.equal(a,expected|0);assert.equal(b,a);assert.deepEqual(stateB,stateA);
 }
 }finally{rmSync(dir,{recursive:true,force:true});}
});
