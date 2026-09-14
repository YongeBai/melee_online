import test from 'node:test';import assert from 'node:assert/strict';
import{readFileSync,writeFileSync,mkdtempSync,rmSync}from'node:fs';import{resolve}from'node:path';import{tmpdir}from'node:os';import{spawnSync}from'node:child_process';
test('actual framebuffer sizing produces true 720p at 150% and preserves integer scales',()=>{
 const dir=mkdtempSync(resolve(tmpdir(),'melee-efb-scale-'));try{
 const source=readFileSync('engines/wasm-dolphin/vendor/dolphin/Source/Core/VideoCommon/FramebufferManager.cpp','utf8');
 const names=['GetEFBScale','EFBToScaledX','EFBToScaledY','CalculateTargetSize'];
 const funcs=names.map(n=>{const at=source.search(new RegExp('(?:float|int|std::tuple<u32, u32>) FramebufferManager::'+n+'\\('));assert.ok(at>=0,n);return source.slice(at,source.indexOf('\n}',at)+2);}).join('\n');
 writeFileSync(resolve(dir,'test.cpp'),`#include <algorithm>
#include <tuple>
#include <cmath>
#include <cassert>
#include <cstdint>
#define __EMSCRIPTEN__ 1
using u32=uint32_t;constexpr u32 EFB_WIDTH=640,EFB_HEIGHT=528;constexpr int EFB_SCALE_AUTO_INTEGRAL=-1;
struct {u32 MaxTextureSize=16384;}g_backend_info;
struct Presenter{int AutoIntegralScale(){return 3;}} presenter;auto* g_presenter=&presenter;
struct FramebufferManager{float m_efb_scale=1;float GetEFBScale()const;int EFBToScaledX(int)const;int EFBToScaledY(int)const;std::tuple<u32,u32>CalculateTargetSize(int);};
${funcs}
int main(){FramebufferManager f;for(int scale:{1,2,3}){auto[w,h]=f.CalculateTargetSize(scale);assert(w==640*scale&&h==528*scale);for(int v=-640;v<=640;v++)assert(f.EFBToScaledX(v)==v*scale&&f.EFBToScaledY(v)==v*scale);}
auto[w,h]=f.CalculateTargetSize(150);assert(w==960&&h==792);assert(f.GetEFBScale()==1.5f);assert(f.EFBToScaledX(640)==960&&f.EFBToScaledY(480)==720);assert(f.EFBToScaledX(0)==0&&f.EFBToScaledY(0)==0);assert(f.CalculateTargetSize(-1)==std::make_tuple(1920u,1584u));}
`);
 const c=spawnSync('c++',['-std=c++17',resolve(dir,'test.cpp'),'-o',resolve(dir,'test')],{encoding:'utf8'});assert.equal(c.status,0,c.stderr);const run=spawnSync(resolve(dir,'test'));assert.equal(run.status,0,run.stderr?.toString());
 }finally{rmSync(dir,{recursive:true,force:true});}
});
