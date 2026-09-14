import test from'node:test';import assert from'node:assert/strict';
import{readFileSync,writeFileSync,mkdtempSync,rmSync}from'node:fs';import{resolve}from'node:path';import{tmpdir}from'node:os';import{spawnSync}from'node:child_process';
test('actual paired-memory planner and emitted guards preserve all per-access decisions',()=>{
 const dir=mkdtempSync(resolve(tmpdir(),'melee-psq-hoist-'));
 try{
  const source=readFileSync('engines/wasm-dolphin/vendor/dolphin/Source/Core/Core/PowerPC/CachedInterpreter/CachedInterpreter.cpp','utf8');
  const extract=name=>{const at=source.search(new RegExp('(?:void|bool) '+name+'\\('));assert.ok(at>=0,name);return source.slice(at,source.indexOf('\n}',at)+2);};
  const first=['EmitU32Leb','EmitI32Leb','EmitLocalGet','EmitLocalSet','EmitI32Const','IsPairedSingleArithmeticSubop','IsPairedSingleMergeSubop'].map(extract).join('\n');
  const at=source.indexOf('struct WasmPsqHoistPlan'),end=source.indexOf('static WasmPsqHoistPlan s_psq_hoist;',at)+'static WasmPsqHoistPlan s_psq_hoist;'.length;
  const rest=['AnalyzePsqHoistPlan','EmitIsMem1AddressForSize','EmitPsqFloatFastPathCondition','EmitPsqHoistCheck','EmitPsqHoistedFloatCondition'].map(extract).join('\n');
  writeFileSync(resolve(dir,'emit.cpp'),`#include <vector>
#include <span>
#include <atomic>
#include <map>
#include <unordered_map>
#include <algorithm>
#include <cstdint>
#include <vector>
bool EmitBlockMsrLoad(std::vector<uint8_t>&,uint32_t){return false;}
void EmitBlockMsrReload(std::vector<uint8_t>&){}
using s32=int32_t;static uint32_t s_wasm_specialized_state_base=0;
#include <cassert>
#include <cstdio>
#include <cstdlib>
using u8=uint8_t;using u32=uint32_t;using s32=int32_t;using u64=uint64_t;
struct UGeckoInstruction{u32 OPCD=0,RA=0,I=0,W=0,SUBOP5=0,SUBOP10=0,Rc=0;s32 SIMM_12=0;};
struct {bool active=false,full=false;} s_qstate_cache;
bool EmitCachedPsqTypeCondition(std::vector<u8>&,UGeckoInstruction,bool){return false;}
namespace PPCAnalyst{struct CodeOp{UGeckoInstruction inst;bool skip=false;};}
struct WasmStateLayout{u32 msr_offset=0,gpr_offset=16,spr_offset=256,ram_size_real=1024;};
constexpr u32 SPR_HID2=2,SPR_GQR0=8;
std::atomic<bool>s_dolphin_web_psq_hoist{true};
${first}
u32 SprOffset(const WasmStateLayout&l,u32 i){return l.spr_offset+i*4;}
void EmitStateLoadU32(std::vector<u8>&b,u32 off){EmitLocalGet(b,0);b.insert(b.end(),{0x28,0x02});EmitU32Leb(b,off);}
void EmitGprOrZero(std::vector<u8>&b,const WasmStateLayout&l,u32 r){if(r)EmitStateLoadU32(b,l.gpr_offset+r*4);else EmitI32Const(b,0);}
${source.slice(at,end)}
${rest}
PPCAnalyst::CodeOp mem(u32 op,u32 base,s32 offset,u32 w=0){PPCAnalyst::CodeOp p;p.inst.OPCD=op;p.inst.RA=base;p.inst.SIMM_12=offset;p.inst.W=w;return p;}
void planner_tests(){
 PPCAnalyst::CodeOp add;add.inst.OPCD=4;add.inst.SUBOP5=21;
 auto barrier=mem(31,3,0);
 std::vector<PPCAnalyst::CodeOp> ops={mem(56,3,-16),mem(56,4,0),add,mem(56,3,24,1),mem(60,5,8),mem(56,4,8),mem(60,5,0),barrier,mem(56,3,128),mem(57,3,0),mem(56,3,0),mem(56,3,8)};
 AnalyzePsqHoistPlan(ops);assert(s_psq_hoist.groups.size()==4);assert(s_psq_hoist.members.size()==8);
 assert(s_psq_hoist.members.at(&ops[0]).group==s_psq_hoist.members.at(&ops[3]).group);
 auto g=s_psq_hoist.groups[s_psq_hoist.members.at(&ops[0]).group];assert(g.lo==-16&&g.hi==27);
 assert(!s_psq_hoist.members.contains(&ops[8]));assert(!s_psq_hoist.members.contains(&ops[9]));
 for(auto op:{31u,57u,61u,48u,18u,16u}){std::vector<PPCAnalyst::CodeOp>x={mem(56,3,0),mem(op,3,0),mem(56,3,8)};AnalyzePsqHoistPlan(x);assert(s_psq_hoist.members.empty());}
 for(auto middle:{mem(56,0,0),mem(4,0,0)}){std::vector<PPCAnalyst::CodeOp>x={mem(56,3,0),middle,mem(56,3,8)};AnalyzePsqHoistPlan(x);assert(s_psq_hoist.members.empty());}
 add.inst.Rc=1;std::vector<PPCAnalyst::CodeOp>x={mem(56,3,0),add,mem(56,3,8)};AnalyzePsqHoistPlan(x);assert(s_psq_hoist.members.empty());
 s_dolphin_web_psq_hoist=false;AnalyzePsqHoistPlan(ops);assert(s_psq_hoist.groups.empty()&&s_psq_hoist.members.empty());s_dolphin_web_psq_hoist=true;
}
int main(int argc,char**argv){planner_tests();bool store=atoi(argv[1]),enabled=atoi(argv[2]);WasmStateLayout l;
 std::vector<PPCAnalyst::CodeOp>ops={mem(store?60:56,3,-16),mem(store?60:56,3,0,1),mem(store?60:56,3,24)};
 AnalyzePsqHoistPlan(ops);assert(s_psq_hoist.groups.size()==1);s_psq_hoist.groups[0].local=4;
 std::vector<u8>b{1,4,0x7f};
 for(u32 i=0;i<ops.size();++i){auto&op=ops[i];if(enabled&&i==0)EmitPsqHoistCheck(b,l,s_psq_hoist.groups[0]);
 EmitGprOrZero(b,l,3);EmitI32Const(b,static_cast<u32>(op.inst.SIMM_12));b.push_back(0x6a);EmitLocalSet(b,1);
 EmitLocalGet(b,2);if(enabled)EmitPsqHoistedFloatCondition(b,l,op,store);else EmitPsqFloatFastPathCondition(b,l,op.inst,store);
 EmitI32Const(b,i);b.push_back(0x74);b.push_back(0x72);EmitLocalSet(b,2);}
 EmitLocalGet(b,2);EmitLocalGet(b,4);EmitI32Const(b,3);b.push_back(0x74);b.push_back(0x72);b.push_back(0x0b);fwrite(b.data(),1,b.size(),stdout);
}`);
  const compiled=spawnSync('c++',['-std=c++20',resolve(dir,'emit.cpp'),'-o',resolve(dir,'emit')],{encoding:'utf8'});assert.equal(compiled.status,0,compiled.stderr);
  const leb=n=>{const a=[];do{const b=n&127;n>>>=7;a.push(b|(n?128:0));}while(n);return a;},str=s=>[...leb(s.length),...Buffer.from(s)],sec=(id,b)=>[id,...leb(b.length),...b];
  const make=(store,on)=>{const e=spawnSync(resolve(dir,'emit'),[store,on].map(Number).map(String));assert.equal(e.status,0,e.stderr.toString());const body=[...e.stdout];return new WebAssembly.Instance(new WebAssembly.Module(Uint8Array.from([0,97,115,109,1,0,0,0,...sec(1,[1,0x60,1,0x7f,1,0x7f]),...sec(3,[1,0]),...sec(5,[1,0,1]),...sec(7,[2,...str('run'),0,0,...str('memory'),2,0]),...sec(10,[1,...leb(body.length),...body])])));};
  let seed=0x97874521;const rnd=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return seed>>>0;};let hits=0,count=0;
  const addresses=[0,1,15,16,17,992,993,1000,1020,1024,0x3ffffff0,0x3fffffff,0x40000000,0x7fffffff,0x80000000,0x80000010,0x800003e0,0x800003e1,0x800003ff,0xcc008000,0xe0000010,0xfffffff0];
  for(const store of[false,true]){const ref=make(store,false),fast=make(store,true),rv=new DataView(ref.exports.memory.buffer),fv=new DataView(fast.exports.memory.buffer);for(let i=0;i<20000;i++){
   const address=i<addresses.length*128?addresses[Math.floor(i/128)]:(rnd()&1?0x80000000+(rnd()%1100):rnd());
   const msr=i%4===0?0:i%4===1?8193:8192,hid=i%8===0?0:0x80000000;
   const type=i%16===0?rnd()&7:0,other=rnd(),gqr=store?((other&~7)|type):((other&~0x70000)|(type<<16));
   for(const v of[rv,fv]){v.setUint32(0,msr,true);v.setUint32(28,address,true);v.setUint32(264,hid,true);v.setUint32(288,gqr,true);}
   const before=new Uint8Array(fv.buffer).slice(),a=ref.exports.run(0),b=fast.exports.run(0);
   assert.equal(b&7,a,'per-access guard decisions '+store+' '+i);if(b&8){hits++;assert.equal(a,7,'range guard only accepts all valid accesses');}
   assert.deepEqual(new Uint8Array(fv.buffer),before,'guard cannot mutate guest state');count++;
  }}
  assert.equal(count,40000);assert.ok(hits>1000,'exercise the actual fast guard');
 }finally{rmSync(dir,{recursive:true,force:true});}
});
