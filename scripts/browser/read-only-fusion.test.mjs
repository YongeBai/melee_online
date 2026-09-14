import test from'node:test';import assert from'node:assert/strict';import{readFileSync,writeFileSync,mkdtempSync,rmSync}from'node:fs';import{execFileSync}from'node:child_process';import{join}from'node:path';import{tmpdir}from'node:os';
const source=()=>readFileSync('engines/wasm-dolphin/vendor/dolphin/Source/Core/Core/PowerPC/CachedInterpreter/CachedInterpreter.cpp','utf8');
const fn=(s,name)=>{const a=s.search(new RegExp('(?:void|bool) '+name+'\\('));assert.ok(a>=0,name);return s.slice(a,s.indexOf('\n}',a)+2);};
const structure=(s,name)=>{const a=s.indexOf('struct '+name+'\n');assert.ok(a>=0,name);return s.slice(a,s.indexOf('\n};',a)+3);};
const leb=n=>{const out=[];do{const b=n&127;n>>>=7;out.push(b|(n?128:0));}while(n);return out;};const name=s=>[...leb(s.length),...Buffer.from(s)],section=(id,b)=>[id,...leb(b.length),...b];
test('actual emitted reads preserve bytes/signs and mark only the existing non-RAM fallback',()=>{
 const dir=mkdtempSync(join(tmpdir(),'melee-read-fusion-'));try{
 const s=source();const fns=['EmitU32Leb','EmitI32Leb','EmitLocalGet','EmitLocalSet','EmitI32Const','EmitBswap32FromLocal','EmitBswap16FromLocal','EmitFusionReadFallback','EmitReadU32MaybeDirect','EmitReadU8MaybeDirect','EmitReadU16MaybeDirect','EmitSignExtendI16','EmitReadS16MaybeDirect'].map(n=>fn(s,n)).join('\n');
 const cpp=join(dir,'emit.cpp'),exe=join(dir,'emit');writeFileSync(cpp,`#include <vector>
#include <cstdint>
#include <cstdio>
#include <atomic>
using u8=uint8_t;using u16=uint16_t;using u32=uint32_t;using s32=int32_t;
std::atomic<bool> s_dolphin_web_bswap_rotate{false};std::atomic<u32> s_bswap_rotate_sites{0};
u32 s_wasm_specialized_state_base=0;
struct WasmStateLayout{u32 ram_base=256,ram_size_real=64;};u32 s_fusion_read_fallback_local=0;
bool EmitKnownAddressRead(std::vector<u8>&,const WasmStateLayout&,u32){return false;}
${fns}
int main(int argc,char**argv){s_fusion_read_fallback_local=argv[1][0]=='1'?4:0;s_dolphin_web_bswap_rotate=argv[3][0]=='1';const char kind=argv[2][0];std::vector<u8>b{1,3,0x7f};WasmStateLayout l;
 if(kind=='w')EmitReadU32MaybeDirect(b,l);else if(kind=='b')EmitReadU8MaybeDirect(b,l);else if(kind=='h')EmitReadU16MaybeDirect(b,l);else EmitReadS16MaybeDirect(b,l);
 EmitLocalSet(b,2);EmitI32Const(b,128);EmitLocalGet(b,4);b.insert(b.end(),{0x36,2,0});EmitLocalGet(b,2);b.push_back(0x0b);fwrite(b.data(),1,b.size(),stdout);
}`);execFileSync('c++',['-std=c++20','-O2',cpp,'-o',exe]);
 for(const rotate of [false,true])for(const tracking of [false,true])for(const kind of ['w','b','h','s']){
  const body=[...execFileSync(exe,[tracking?'1':'0',kind,rotate?'1':'0'])],imports=[];for(let i=0;i<6;i++)imports.push(...name('env'),...name('f'+i),0,0);
  const binary=Uint8Array.from([0,97,115,109,1,0,0,0,...section(1,[1,0x60,2,0x7f,0x7f,1,0x7f]),...section(2,[6,...imports]),...section(3,[1,0]),...section(5,[1,0,1]),...section(7,[2,...name('run'),0,6,...name('memory'),2,0]),...section(10,[1,...leb(body.length),...body])]);
  let calls=[],view;const env=Object.fromEntries(Array.from({length:6},(_,i)=>['f'+i,(state,addr)=>{calls.push([i,state,addr>>>0]);return i===0?0xa1b2c3d4:i===2?0xb6:0xcdef;}]));
  const instance=new WebAssembly.Instance(new WebAssembly.Module(binary),{env});view=new DataView(instance.exports.memory.buffer);for(let i=0;i<64;i++)view.setUint8(256+i,(i*17+0x91)&255);
  const width=kind==='w'?4:kind==='b'?1:2;
  for(const high of [0,0x80000000,0xc0000000])for(const low of [0,1,2,3,60,61,62,63,64,65,0x0c000000,0x3fffffff]){
    const addr=(high|low)>>>0,offset=addr&0x3fffffff,direct=offset<=64-width;calls=[];view.setUint32(128,0xfedcba98,true);
    const actual=instance.exports.run(77,addr);let expected=direct?(kind==='w'?view.getUint32(256+offset):kind==='b'?view.getUint8(256+offset):view.getUint16(256+offset)):(kind==='w'?0xa1b2c3d4:kind==='b'?0xb6:0xcdef);
    if(kind==='s')expected=(expected<<16)>>16;
    assert.equal(actual,expected|0,`${tracking}/${kind}/${addr.toString(16)}`);assert.equal(view.getUint32(128,true),tracking&&!direct?1:0);
    assert.deepEqual(calls,direct?[]:[[kind==='w'?0:kind==='b'?2:4,77,addr]]);
  }
 }
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('admission is limited to four non-update loads; tracking scope restores across nesting and early return',()=>{
 const dir=mkdtempSync(join(tmpdir(),'melee-read-fusion-policy-'));try{const s=source(),cpp=join(dir,'test.cpp'),exe=join(dir,'test');writeFileSync(cpp,`#include <cstdint>
#include <cassert>
using u32=uint32_t;namespace PPCAnalyst{struct CodeOp{bool skip=false;struct{u32 OPCD=0;}inst;};}
u32 s_fusion_read_fallback_local=99;
${fn(s,'IsReadFusionLoad')}
${structure(s,'ScopedFusionReadTracking')}
void abort_compile(){ScopedFusionReadTracking scope;assert(!s_fusion_read_fallback_local);s_fusion_read_fallback_local=8;{ScopedFusionReadTracking nested;assert(!s_fusion_read_fallback_local);s_fusion_read_fallback_local=12;}assert(s_fusion_read_fallback_local==8);return;}
int main(){for(u32 i=0;i<64;i++)for(bool skip:{false,true}){PPCAnalyst::CodeOp op;op.inst.OPCD=i;op.skip=skip;assert(IsReadFusionLoad(op)==(!skip&&(i==32||i==34||i==40||i==42)));}abort_compile();assert(s_fusion_read_fallback_local==99);}
`.replace('#include <cassert>','#include <cassert>\n#include <initializer_list>'));execFileSync('c++',['-std=c++20',cpp,'-o',exe]);execFileSync(exe);
 assert.match(s,/const ScopedFusionReadTracking fusion_read_scope;/);
 assert.match(s,/if\(fusion && fusion->track_reads\)[\s\S]*?s_fusion_read_fallback_local=next_local\+\+;/);
 assert.match(s,/EmitFusionBoundary\(body, \*fusion, downcount\);[\s\S]*?fusion = fusion->next;\s+if \(!fusion\)\s+s_fusion_read_fallback_local=0;/);
 assert.match(s,/safe=\(call_fusion && i\+1==prefix_count\) \|\| read \|\|\s+IsFusionSafeInstruction\(m_code_buffer\[i\],true\);/);
 assert.match(s,/for \(auto \[from, to\] : next_block.m_physical_addresses\)\s+code_block.m_physical_addresses.insert\(from, to\)/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
