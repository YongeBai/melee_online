import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
test('CPU sampling has independent 1/1024 counters and no disabled samples',()=>{
 const dir=mkdtempSync(resolve(tmpdir(),'melee-cpu-sample-'));
 try {
  writeFileSync(resolve(dir,'test.cpp'),`#include "Common/BrowserProfile.h"
#include <cassert>
using namespace DolphinWeb::BrowserProfile;
int main(){
 auto chain=static_cast<unsigned>(Stage::CpuChainSample);
 auto helper=static_cast<unsigned>(Stage::CpuFpHelperSample);
 for(int i=0;i<2048;i++){SampleScope s(Stage::CpuChainSample);}
 assert(sample_sequences[chain]==0 && counters[chain].count==0);
 enabled=true;
 for(int i=0;i<2048;i++){
  SampleScope s(Stage::CpuChainSample);
  if(i<1024){SampleScope h(Stage::CpuFpHelperSample);}
 }
 assert(counters[chain].count==2 && counters[helper].count==1);
 assert(sample_sequences[chain]==2048 && sample_sequences[helper]==1024);
 for(int i=0;i<1024;i++){SampleScope s(Stage::CpuChainSample,false);}
 assert(counters[chain].count==2 && sample_sequences[chain]==2048);
}`);
  const build=spawnSync('c++',['-std=c++17','-I',resolve('engines/wasm-dolphin/vendor/dolphin/Source/Core'),resolve(dir,'test.cpp'),'-o',resolve(dir,'test')],{encoding:'utf8'});
  assert.equal(build.status,0,build.stderr);
  const run=spawnSync(resolve(dir,'test'),[],{encoding:'utf8'});assert.equal(run.status,0,run.stderr);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
