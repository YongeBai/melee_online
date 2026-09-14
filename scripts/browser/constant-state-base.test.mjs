import test from 'node:test';import assert from 'node:assert/strict';
import{readFileSync,writeFileSync,mkdtempSync,rmSync}from'node:fs';
import{execFileSync}from'node:child_process';import{tmpdir}from'node:os';import{join}from'node:path';
test('actual state binding restores compilation context and preserves integer memory operations',()=>{
 const s=readFileSync('engines/wasm-dolphin/vendor/dolphin/Source/Core/Core/PowerPC/CachedInterpreter/CachedInterpreter.cpp','utf8');
 const fn=name=>{const at=s.indexOf('void '+name+'(');assert.ok(at>0);return s.slice(at,s.indexOf('\n}',at)+2);};
 const a=s.indexOf('static u32 s_wasm_specialized_state_base'),b=s.indexOf('\nvoid EmitLocalGet(',a);assert.ok(a>0&&b>a);
 const dir=mkdtempSync(join(tmpdir(),'melee-statebase-'));
 try{
 const cpp=join(dir,'emit.cpp'),exe=join(dir,'emit');
 writeFileSync(cpp,`#include <vector>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cassert>
#include <stdexcept>
using u8=uint8_t;using u32=uint32_t;using s32=int32_t;
${s.slice(a,b)}
${['EmitU32Leb','EmitI32Leb','EmitLocalGet'].map(fn).join('\n')}
std::vector<u8> emit(u32 base){
 const ScopedWasmStateBase scope(base);std::vector<u8> code{0};
 EmitLocalGet(code,0);EmitLocalGet(code,0);code.insert(code.end(),{0x28,2,8});
 EmitLocalGet(code,1);code.push_back(0x73);code.insert(code.end(),{0x36,2,12});
 EmitLocalGet(code,0);code.insert(code.end(),{0x28,2,12,0x0b});return code;
}
int main(int argc,char**argv){
 const u32 base=std::strtoul(argv[1],nullptr,0);auto code=emit(base);assert(s_wasm_specialized_state_base==0);
 {const ScopedWasmStateBase scope(8192);auto nested=emit(4096);assert(s_wasm_specialized_state_base==8192);}
 try{const ScopedWasmStateBase scope(16384);throw std::runtime_error("abort emit");}catch(const std::runtime_error&){}
 assert(s_wasm_specialized_state_base==0);std::vector<u8> dynamic;EmitLocalGet(dynamic,0);assert((dynamic==std::vector<u8>{0x20,0}));
 fwrite(code.data(),1,code.size(),stdout);
}`);
 execFileSync('c++',['-std=c++17','-O2',cpp,'-o',exe]);
 const leb=n=>{const out=[];do{const x=n&127;n>>>=7;out.push(x|(n?128:0));}while(n);return out;};
 const name=s=>[...leb(s.length),...Buffer.from(s)],section=(id,b)=>[id,...leb(b.length),...b];
 const binaries=[];let rng=12345;const random=()=>rng=(Math.imul(rng,1664525)+1013904223)>>>0;
 for(const base of[0,4096,32768]){
 const body=[...execFileSync(exe,[String(base)])];
 const bytes=Uint8Array.from([0,97,115,109,1,0,0,0,...section(1,[1,0x60,2,0x7f,0x7f,1,0x7f]),...section(3,[1,0]),...section(5,[1,0,1]),...section(7,[2,...name('run'),0,0,...name('memory'),2,0]),...section(10,[1,...leb(body.length),...body])]);
 binaries.push(Buffer.from(bytes).toString('hex'));
 const instance=new WebAssembly.Instance(new WebAssembly.Module(bytes)),v=new DataView(instance.exports.memory.buffer);
 v.setUint32(1000,0x12345678,true);
 for(let i=0;i<10000;i++){const x=random(),y=random();v.setUint32(base+8,x,true);const result=instance.exports.run(base,y);assert.equal(result,x^y);assert.equal(v.getInt32(base+12,true),x^y);assert.equal(v.getUint32(1000,true),0x12345678);}
 }
 assert.equal(new Set(binaries).size,3,'bound address must participate in compiled module identity');
 }finally{rmSync(dir,{recursive:true,force:true});}
});
