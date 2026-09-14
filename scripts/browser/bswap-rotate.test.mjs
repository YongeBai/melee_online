import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';import {execFileSync} from 'node:child_process';import {tmpdir} from 'node:os';import {join} from 'node:path';
const leb=n=>{const b=[];do{let v=n&127;n>>>=7;b.push(n?v|128:v)}while(n);return b;};const section=(id,b)=>[id,...leb(b.length),...b];
test('actual rotate and legacy WASM emitters agree with byte permutation for arbitrary raw bits',()=>{
 const s=readFileSync('engines/wasm-dolphin/vendor/dolphin/Source/Core/Core/PowerPC/CachedInterpreter/CachedInterpreter.cpp','utf8'),begin=s.indexOf('void EmitBswap32FromLocal('),end=s.indexOf('\nvoid EmitBswap16FromLocal(',begin);assert.ok(begin>0&&end>begin);
 const dir=mkdtempSync(join(tmpdir(),'bswap-rotate-'));try{
 writeFileSync(join(dir,'emit.cpp'),`#include <vector>
#include <atomic>
#include <cstdint>
#include <cstdio>
using u8=uint8_t;using u32=uint32_t;using s32=int32_t;
std::atomic<bool>s_dolphin_web_bswap_rotate{false};std::atomic<u32>s_bswap_rotate_sites{0};
void EmitU32Leb(std::vector<u8>&b,u32 v){do{u8 x=v&127;v>>=7;b.push_back(v?x|128:x);}while(v);}
void EmitLocalGet(std::vector<u8>&b,u32 v){b.push_back(0x20);EmitU32Leb(b,v);}
void EmitI32Const(std::vector<u8>&b,u32 v){b.push_back(0x41);s32 x=v;bool more;do{u8 k=x&127;x>>=7;more=!((x==0&&!(k&64))||(x==-1&&(k&64)));b.push_back(more?k|128:k);}while(more);}
${s.slice(begin,end)}
int main(int argc,char**argv){s_dolphin_web_bswap_rotate=argc>1;std::vector<u8>b;EmitBswap32FromLocal(b,0);fwrite(b.data(),1,b.size(),stdout);}
`);execFileSync('c++',['-std=c++17','-O2',join(dir,'emit.cpp'),'-o',join(dir,'emit')]);
 const functions=[[],['on']].map(args=>{const expression=execFileSync(join(dir,'emit'),args),body=[0,...expression,0x0b];const module=new WebAssembly.Module(Uint8Array.from([0,97,115,109,1,0,0,0,...section(1,[1,0x60,1,0x7f,1,0x7f]),...section(3,[1,0]),...section(7,[1,1,102,0,0]),...section(10,[1,...leb(body.length),...body])]));return new WebAssembly.Instance(module).exports.f;});
 const check=value=>{const buffer=new ArrayBuffer(4),v=new DataView(buffer);v.setUint32(0,value,true);const expected=v.getUint32(0,false);for(const f of functions)assert.equal(f(value)>>>0,expected);};
 for(const n of [0,1,0xff,0xffff,0xffffffff,0x80000000,0x7f800000,0x7fc00001,0xffa00001,...Array.from({length:32},(_,i)=>1<<i)])check(n);
 let x=0x1234abcd;for(let i=0;i<1000000;i++){x^=x<<13;x^=x>>>17;x^=x<<5;check(x);}
 }finally{rmSync(dir,{recursive:true,force:true});}
});
