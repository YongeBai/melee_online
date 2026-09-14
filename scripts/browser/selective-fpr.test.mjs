import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {resolve} from 'node:path';import {tmpdir} from 'node:os';import {spawnSync} from 'node:child_process';
test('selective FPR policy excludes short, low-reuse and helper-heavy blocks',()=>{
 const dir=mkdtempSync(resolve(tmpdir(),'melee-selective-fpr-'));
 try{
 const src=readFileSync('engines/wasm-dolphin/vendor/dolphin/Source/Core/Core/PowerPC/CachedInterpreter/CachedInterpreter.cpp','utf8');
 const functions=['IsPairedSingleMergeSubop','IsPairedSingleArithmeticSubop','IsSinglePrecisionArithmeticSubop','IsDoublePrecisionArithmeticSubop','ShouldCacheMathFpr'].map(name=>{const at=src.indexOf('bool '+name+'(');assert.ok(at>=0,name);return src.slice(at,src.indexOf('\n}',at)+2);}).join('\n');
 const fixture='#include <span>\n#include <vector>\n#include <cassert>\n#include "Common/BitSet.h"\nstruct Inst {u32 OPCD=4,SUBOP5=25,SUBOP10=25;bool Rc=false,LK=false,OE=false;};\nnamespace PPCAnalyst {struct CodeOp {bool skip=false;Inst inst;BitSet32 fregsIn{1,2};int fregOut=3;};}\n'+functions+String.raw`
int main(){
 using PPCAnalyst::CodeOp;std::vector<CodeOp> math(24);
 assert(ShouldCacheMathFpr(math));
 std::vector<CodeOp> short_block(math.begin(),math.begin()+4);assert(!ShouldCacheMathFpr(short_block));
 auto many=math;for(int n=0;n<24;++n){many[n].fregsIn={n};many[n].fregOut=n;}assert(!ShouldCacheMathFpr(many));
 for(u32 opcode:{4u,59u,56u,48u,52u}){auto eligible=math;for(auto&op:eligible)op.inst.OPCD=opcode;assert(ShouldCacheMathFpr(eligible));}
 for(u32 opcode:{17u,31u,46u,47u}){auto helper=math;helper[10].inst.OPCD=opcode;assert(!ShouldCacheMathFpr(helper));helper[10].skip=true;assert(ShouldCacheMathFpr(helper));}
 auto mixed=math;for(int n=0;n<24;n+=3){mixed[n].inst.OPCD=31;mixed[n].inst.SUBOP10=266;}assert(ShouldCacheMathFpr(mixed));mixed[0].inst.OE=true;assert(!ShouldCacheMathFpr(mixed));
 auto moves=math;moves[5].inst.OPCD=63;moves[5].inst.SUBOP5=8;moves[5].inst.SUBOP10=72;assert(ShouldCacheMathFpr(moves));
 for(u32 subop:{26u,15u,583u,711u}){auto helper=math;helper[5].inst.OPCD=63;helper[5].inst.SUBOP5=subop&31;helper[5].inst.SUBOP10=subop;assert(!ShouldCacheMathFpr(helper));}
 for(u32 subop:{83u,146u,339u,467u,54u,86u}){auto helper=math;helper[5].inst.OPCD=31;helper[5].inst.SUBOP10=subop;assert(!ShouldCacheMathFpr(helper));}
 auto linked=math;linked.back().inst.OPCD=18;linked.back().inst.LK=true;assert(!ShouldCacheMathFpr(linked));linked.back().inst.LK=false;assert(ShouldCacheMathFpr(linked));
 auto ret=math;ret.back().inst.OPCD=19;ret.back().inst.SUBOP10=16;assert(ShouldCacheMathFpr(ret));ret.back().inst.SUBOP10=50;assert(!ShouldCacheMathFpr(ret));
 auto rc=math;rc[10].inst.Rc=true;assert(!ShouldCacheMathFpr(rc));
 auto unsupported=math;unsupported[10].inst.SUBOP5=0;unsupported[10].inst.SUBOP10=0;assert(!ShouldCacheMathFpr(unsupported));
}
`;
 writeFileSync(resolve(dir,'test.cpp'),fixture);
 const compile=spawnSync('c++',['-std=c++20','-I',resolve('engines/wasm-dolphin/vendor/dolphin/Source/Core'),resolve(dir,'test.cpp'),'-o',resolve(dir,'test')],{encoding:'utf8'});assert.equal(compile.status,0,compile.stderr);
 const run=spawnSync(resolve(dir,'test'),[],{encoding:'utf8'});assert.equal(run.status,0,run.stderr);
 assert.match(src,/s_fpr_rc.active = s_fpr_rc.vector \|\| cache_math_fpr;/);
 const runtime=readFileSync('scripts/engine/melee-runtime.js','utf8');assert.match(runtime,/codegenReference:[^\n]+fprcache:false/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});