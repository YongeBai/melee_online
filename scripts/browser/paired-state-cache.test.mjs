import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

test('actual Q0 cache admission and emitted guards preserve exact eligibility across state changes',()=>{
 const source=readFileSync('engines/wasm-dolphin/vendor/dolphin/Source/Core/Core/PowerPC/CachedInterpreter/CachedInterpreter.cpp','utf8');
 const fun=n=>{const at=source.search(new RegExp('(?:void|bool) '+n+'\\([^;{]*\\)\\n\\{'));assert.ok(at>=0,n);return source.slice(at,source.indexOf('\n}',at)+2);};
 const dir=mkdtempSync(join(tmpdir(),'melee-qstate-'));
 try {
  const begin=source.indexOf('struct WasmQStateCache'),end=source.indexOf('\nvoid EmitQStateCacheReload',begin);
  const cpp=`#include <cstdint>
#include <vector>
#include <span>
#include <atomic>
#include <optional>
#include <cassert>
#include <cstdio>
#include <cstdlib>
using u8=uint8_t;using u32=uint32_t;using u64=uint64_t;using s32=int32_t;
static u32 s_wasm_specialized_state_base=0;
struct UGeckoInstruction {u32 OPCD=0,SUBOP10=0,SUBOP5=0,I=0,W=0;bool LK=false,Rc=false,OE=false;};
namespace PPCAnalyst {struct CodeOp {UGeckoInstruction inst;u32 address=0,branchTo=0;bool skip=false;};}
bool IsOrdinaryFusionCall(const PPCAnalyst::CodeOp&){return false;}
struct WasmStateLayout {u32 msr_offset=0,spr_offset=256,ram_size_real=1024;};
constexpr u32 SPR_HID2=2,SPR_GQR0=8;
namespace GPFifo { constexpr u32 GATHER_PIPE_PHYSICAL_ADDRESS=0x0c008000; }
std::atomic<u32> s_qstate_cache_sites{0};
${['EmitU32Leb','EmitI32Leb','EmitLocalGet','EmitLocalSet','EmitI32Const'].map(fun).join('\n')}
u32 SprOffset(const WasmStateLayout& l,u32 i){return l.spr_offset+i*4;}
void EmitStateLoadU32(std::vector<u8>& b,u32 off){EmitLocalGet(b,0);b.insert(b.end(),{0x28,0x02});EmitU32Leb(b,off);}
void EmitFprCacheReload(std::vector<u8>&){}
void EmitBlockMsrReload(std::vector<u8>&){}
${source.slice(begin,end)}
${['EmitQStateCacheReload','EmitQStateCacheRefreshAfterHelper','EmitImportedHaltCheck','EmitCachedPsqTypeCondition','EmitIsMem1AddressForSize','EmitPsqFloatFastPathCondition','EmitPsqGatherPipeFloatStoreCondition','IsPairedSingleArithmeticSubop','IsPairedSingleMergeSubop','IsSinglePrecisionArithmeticSubop','CanCacheBlockMsr','CanCacheQState'].map(fun).join('\n')}
PPCAnalyst::CodeOp op(u32 opcode,u32 q=0){PPCAnalyst::CodeOp x;x.inst.OPCD=opcode;x.inst.I=q;return x;}
void admission(){
 std::vector<PPCAnalyst::CodeOp> good{op(56),op(57),op(60),op(61)};assert(CanCacheQState(good));
 auto short_block=good;short_block.pop_back();assert(!CanCacheQState(short_block));
 for(u32 q=1;q<8;++q){auto x=good;x[0].inst.I=q;assert(!CanCacheQState(x));}
 auto skipped=good;skipped[0].skip=true;assert(!CanCacheQState(skipped));
 for(u32 bad:{0u,17u,31u,63u}){auto x=good;x.insert(x.begin()+1,op(bad));assert(!CanCacheQState(x));}
 for(u32 branch:{16u,18u,19u}){auto x=good;auto b=op(branch);b.inst.LK=true;b.inst.SUBOP10=16;x.push_back(b);assert(!CanCacheQState(x));}
 auto ret=good;auto b=op(19);b.inst.SUBOP10=16;ret.push_back(b);assert(CanCacheQState(ret));
 s_qstate_cache={true,9};try{ScopedQStateCache a;assert(!s_qstate_cache.active);s_qstate_cache={true,7};{ScopedQStateCache b;assert(!s_qstate_cache.active);}assert(s_qstate_cache.local==7);throw 1;}catch(int){}assert(s_qstate_cache.local==9);s_qstate_cache={};
}
int main(int argc,char** argv){
 admission();const int mode=atoi(argv[1]),refresh=atoi(argv[5]);const bool enabled=mode!=0,store=atoi(argv[2]),fifo=atoi(argv[6]);UGeckoInstruction inst;inst.W=atoi(argv[3]);inst.I=atoi(argv[4]);
 WasmStateLayout l;ScopedQStateCache scope;std::vector<u8>b{1,3,0x7f}; // state/address params; cache local2 and address scratch3
 if(enabled){s_qstate_cache={true,2,mode==2,l.msr_offset,l.spr_offset};EmitQStateCacheReload(b,l);}
 auto condition=[&]{if(fifo)EmitPsqGatherPipeFloatStoreCondition(b,l,inst);else EmitPsqFloatFastPathCondition(b,l,inst,store);};
 condition();
 if(refresh){
  EmitLocalSet(b,4);
  // A helper changes state before returning normally or halting. Use the actual
  // halt/refresh emitter, then test the following access against the reference.
  for(auto [off,mask]:std::vector<std::pair<u32,u32>>{{0,8193},{264,0x80000000u},{288,0x70007}}){EmitLocalGet(b,0);EmitStateLoadU32(b,off);EmitI32Const(b,mask);b.push_back(0x73);b.insert(b.end(),{0x36,0x02});EmitU32Leb(b,off);}
  EmitI32Const(b,refresh==2);EmitImportedHaltCheck(b);
  EmitLocalGet(b,4);EmitI32Const(b,1);b.push_back(0x74);
  condition();b.push_back(0x72);
 }
 b.push_back(0x0b);fwrite(b.data(),1,b.size(),stdout);
}
`;
  writeFileSync(join(dir,'emit.cpp'),cpp);execFileSync('c++',['-std=c++20','-O2',join(dir,'emit.cpp'),'-o',join(dir,'emit')]);
  const leb=n=>{const a=[];do{const x=n&127;n>>>=7;a.push(n?x|128:x);}while(n);return a;};
  const sec=(id,b)=>[id,...leb(b.length),...b],str=s=>[s.length,...Buffer.from(s)];
  const make=(mode,store,w,q,refresh,fifo)=>{const b=[...execFileSync(join(dir,'emit'),[mode,store,w,q,refresh,fifo].map(Number).map(String))];return new WebAssembly.Instance(new WebAssembly.Module(Uint8Array.from([0,97,115,109,1,0,0,0,...sec(1,[1,0x60,2,0x7f,0x7f,1,0x7f]),...sec(3,[1,0]),...sec(5,[1,0,1]),...sec(7,[2,...str('run'),0,0,...str('memory'),2,0]),...sec(10,[1,...leb(b.length),...b])])));};
  let seed=0x934523;const rand=()=>seed=(Math.imul(seed,1664525)+1013904223)>>>0;
  const addresses=[0,1,1016,1017,1020,1021,1024,0x80000000,0x800003f8,0x800003fc,0x800003fd,0xcc008000,0xe0000000,0xffffffff,0x0c008000,0x0c007fff,0xcc008fff,0xcc009000,0xfc008004,0x1c008003];
  let accepted=0,checked=0;
  for(const fifo of [false,true])for(const [mode,refresh] of [[1,0],[2,0],[2,1],[2,2]])for(const store of fifo?[true]:[false,true])for(const w of [0,1])for(const q of [0,1,7]) {
   const ref=make(0,store,w,q,refresh,fifo),fast=make(mode,store,w,q,refresh,fifo),rv=new DataView(ref.exports.memory.buffer),fv=new DataView(fast.exports.memory.buffer);
   for(let i=0;i<4000;++i){
    const msr=[0,1,8192,8193,rand()][i%5],hid=i%3===0?rand()&0x7fffffff:rand()|0x80000000;
    // Exercise both zero types, asymmetric types, all scale bits, arbitrary values.
    const value=[rand(),rand()&~0x70007,rand()&~7,rand()&~0x70000][i%4];
    const address=i%3?addresses[i%addresses.length]:rand();
    const q0=q?rand():value;
    for(const v of [rv,fv]){v.setUint32(0,msr,true);v.setUint32(264,hid,true);v.setUint32(288,q0,true);v.setUint32(288+q*4,value,true);}
    const before=new Uint8Array(fv.buffer).slice(),a=ref.exports.run(0,address),b=fast.exports.run(0,address);
    assert.equal(a,b,'exact fast-path decision '+[fifo,mode,refresh,store,w,q,i]);assert.deepEqual(new Uint8Array(fv.buffer),refresh?new Uint8Array(rv.buffer):before,'state equals reference; guard is read-only');accepted+=a;checked++;
   }
  }
  assert.equal(checked,288000);assert.ok(accepted>1000);
 } finally {rmSync(dir,{recursive:true,force:true});}
});
