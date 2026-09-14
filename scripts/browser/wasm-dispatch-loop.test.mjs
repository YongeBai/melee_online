import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const leb=n=>{const b=[];do{let x=n&127;n>>>=7;b.push(n?x|128:x);}while(n);return b;};
const section=(id,b)=>[id,...leb(b.length),...b],name=s=>[s.length,...Buffer.from(s)];
test('actual WASM dispatcher preserves boundaries and reloads live block metadata',()=>{
 const source=readFileSync(new URL('../../engines/wasm-dolphin/vendor/dolphin/Source/Core/Core/PowerPC/CachedInterpreter/CachedInterpreter.cpp',import.meta.url),'utf8');
 const at=source.indexOf('struct WasmDispatchLayout'),end=source.indexOf('\n#endif',at);assert.ok(at>0&&end>at);
 const dir=mkdtempSync(join(tmpdir(),'melee-dispatch-'));
 try{
 const cpp=join(dir,'emit.cpp'),exe=join(dir,'emit');
 writeFileSync(cpp,`
#include <vector>
#include <string>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
using u8=uint8_t;using u32=uint32_t;using s32=int32_t;
constexpr u32 DOLPHIN_WASM_MEMORY_PAGES=128;
void EmitU32Leb(std::vector<u8>&b,u32 v){do{u8 x=v&127;v>>=7;b.push_back(v?x|128:x);}while(v);}
void EmitLocalGet(std::vector<u8>&b,u32 v){b.push_back(0x20);EmitU32Leb(b,v);}
void EmitLocalSet(std::vector<u8>&b,u32 v){b.push_back(0x21);EmitU32Leb(b,v);}
void EmitI32Const(std::vector<u8>&b,u32 v){b.push_back(0x41);s32 x=v;bool more;do{u8 k=x&127;x>>=7;more=!((x==0&&!(k&64))||(x==-1&&(k&64)));b.push_back(more?k|128:k);}while(more);}
void EmitName(std::vector<u8>&b,const std::string&s){EmitU32Leb(b,s.size());b.insert(b.end(),s.begin(),s.end());}
void EmitSection(std::vector<u8>&b,u8 id,const std::vector<u8>&s){b.push_back(id);EmitU32Leb(b,s.size());b.insert(b.end(),s.begin(),s.end());}
void EmitEnvFunctionImport(std::vector<u8>&b,const std::string&s,u32 t){EmitName(b,"env");EmitName(b,s);b.push_back(0);EmitU32Leb(b,t);}
${source.slice(at,end)}
int main(int argc,char** argv){WasmDispatchLayout l{0,4,8,12,128,0,132,136,140,256,(1u<<std::atoi(argv[1]))-1,0,4,8,99,4,0,8,12,16,20,1};l.hoist_step_check=argc>2&&std::atoi(argv[2]);l.profile_sequence=argc>3&&std::atoi(argv[3])?148:0;auto b=BuildWasmDispatchLoop(l);fwrite(b.data(),1,b.size(),stdout);}
`);
 execFileSync('c++',['-std=c++20','-O2',cpp,'-o',exe]);
 for(const profile of [false,true])for(const hoist of [false,true])for(const bits of [16,20]){
 const module=new WebAssembly.Module(execFileSync(exe,[String(bits),hoist?"1":"0",profile?"1":"0"]));
 const wrapper=new WebAssembly.Module(Uint8Array.from([0,97,115,109,1,0,0,0,...section(1,[1,0x60,1,0x7f,1,0x7f]),...section(2,[1,...name('env'),...name('step'),0,0]),...section(3,[1,0]),...section(7,[1,...name('run'),0,1]),...section(10,[1,6,0,0x20,0,0x10,0,0x0b])]));
 const cases=['cycles','negative','pause','cancel','frame','wrap','unarmed','halt','missing','collision','flags','entry','callback','partial','replace','perfmon','wideAlias','haltUnknown',...['cycles','negative','pause','cancel','frame','unarmed','missing','collision','flags','entry','callback','partial','replace','perfmon'].map(k=>'soft:'+k)];
 for(const kind of cases){
 const isSoft=kind.startsWith('soft:'),event=isSoft?kind.slice(5):kind;
 const memory=new WebAssembly.Memory({initial:128,maximum:128,shared:true}),v=new DataView(memory.buffer);
 const get=p=>v.getInt32(p,true),put=(p,x)=>v.setInt32(p,x,true);
 const table=new WebAssembly.Table({element:'anyfunc',initial:100});let calls=0;const perf=[];
 const profileCalls=[];if(profile)put(148,1023);
 const entry=2048,block=3072,pc=0x8034b164,index=p=>256+((p>>>2)&((1<<bits)-1))*4;put(8,event==='negative'?2:6);put(136,event==='wrap'?-1:20);put(140,get(136));put(132,['frame','wrap','cancel'].includes(event)?1:0);
 put(0,pc);put(block,entry);put(block+4,event==='perfmon'?1:0);put(block+8,pc);put(index(pc),block);
 put(entry,99);put(entry+4,1);put(entry+12,3);put(entry+16,2);put(entry+20,1);put(entry+24,1);put(12,event==='perfmon'?1:0);
 if(event==='wideAlias'){
 const other=pc^0x40000;put(block+128,entry);put(block+132,0);put(block+136,other);put(index(other),block+128);
 }
 const step=()=>{calls++;put(4,pc);
 if(calls===1){
 if(isSoft){put(0,pc);put(4,0x12345678);put(8,get(8)-3);}
 if(event==='pause')put(128,1);
 if(event==='cancel'){put(132,0);put(140,get(140)+1);}
 if(['frame','wrap','unarmed'].includes(event))put(140,get(140)+1);
 if(event==='halt'||event==='haltUnknown'){put(0,123);put(8,-17);return event==='halt'?1:7;}
 if(event==='missing')put(index(pc),0);
 if(event==='collision')put(block+8,999);
 if(event==='flags')put(block+4,8);
 if(event==='entry')put(block,0);
 if(event==='callback')put(entry,96);
 if(event==='partial')put(entry+24,0);
 if(event==='replace'){put(block,entry+64);put(entry+64,96);}
 }if(isSoft&&calls===1)return 2;return 0;};
 table.set(1,new WebAssembly.Instance(wrapper,{env:{step}}).exports.run);
 const run=new WebAssembly.Instance(module,{env:{memory,table,perfmon:(...a)=>perf.push(a),profile:(...a)=>profileCalls.push(a)}}).exports.f;
 const result=run(0,entry),twice=['cycles','unarmed','perfmon','cancel'].includes(event)||(event==='wideAlias'&&bits===20);
 assert.deepEqual(profileCalls,profile?[[0,pc|0,0,0],[1,0,0,0]]:[],kind);
 if(profile)assert.equal(get(148),1023+calls,kind);
 assert.equal(calls,twice?2:1,kind);
 assert.equal(result,event==='callback'||event==='partial'?entry:event==='replace'?entry+64:0,kind);
 assert.equal(get(8),event.startsWith('halt')?-17:event==='negative'?-1:twice?0:3,kind);
 assert.equal(get(0),event.startsWith('halt')?123:(pc|0),kind);
 assert.deepEqual(perf,event==='perfmon'?(isSoft?[[0,3,2,1]]:[[0,3,2,1],[0,3,2,1]]):[],kind);
 }
 }
 }finally{rmSync(dir,{recursive:true,force:true});}
});
