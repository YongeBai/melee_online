import test from'node:test';import assert from'node:assert/strict';import{readFileSync,writeFileSync,mkdtempSync,rmSync}from'node:fs';import{resolve}from'node:path';import{tmpdir}from'node:os';import{spawnSync}from'node:child_process';
test('actual controller decoder validates complete packets and keeps rollback, live and legacy input ownership separate',()=>{
 const dir=mkdtempSync(resolve(tmpdir(),'melee-live-input-'));
 try{
  const source=readFileSync('engines/wasm-dolphin/core/upstream/dolphin_web_discio.cpp','utf8');
  const start=source.indexOf('struct InputStateSnapshot'),structure=source.slice(start,source.indexOf('\n};',start)+3);
  const functions=['DecodeTwoControllerInputs','ReadControllerInput'].map(name=>{const at=source.indexOf('bool '+name+'(');assert.ok(at>=0);return source.slice(at,source.indexOf('\n}',at)+2);}).join('\n');
  writeFileSync(resolve(dir,'test.cpp'),`#include <array>
#include <mutex>
#include <cstdint>
#include <cassert>
struct GCPadStatus{static constexpr unsigned char MAIN_STICK_CENTER_X=128,MAIN_STICK_CENTER_Y=128,C_STICK_CENTER_X=128,C_STICK_CENTER_Y=128;};
${structure}
std::mutex s_input_state_mutex;
InputStateSnapshot s_input_state;
std::array<InputStateSnapshot,2>s_rollback_inputs{},s_live_inputs{};
bool s_rollback_input_owner=false,s_live_input_owner=false;
bool ReadFrameBenchmarkInput(int,InputStateSnapshot*){return false;}
${functions}
int main(){
 std::array<std::uint32_t,18>p{1,200,128,128,128,0,0,255,0,2,56,128,128,128,0,0,0,255};
 std::array<InputStateSnapshot,2>decoded{};decoded[0].mask=999;decoded[1].mask=888;
 assert(!DecodeTwoControllerInputs(p.data(),17,7,&decoded));assert(!DecodeTwoControllerInputs(nullptr,18,7,&decoded));assert(!DecodeTwoControllerInputs(p.data(),18,7,nullptr));
 p[17]=256;assert(!DecodeTwoControllerInputs(p.data(),18,7,&decoded));assert(decoded[0].mask==999&&decoded[1].mask==888);p[17]=255;
 p[9]=0x100000;assert(!DecodeTwoControllerInputs(p.data(),18,7,&decoded));assert(decoded[0].mask==999);p[9]=2;
 assert(DecodeTwoControllerInputs(p.data(),18,7,&decoded));assert(decoded[0].mask==1&&decoded[1].mask==2&&decoded[1].stick_x==56&&decoded[0].generation==7);
 InputStateSnapshot out{};s_input_state.mask=32;
 assert(ReadControllerInput(0,&out)&&out.mask==32);assert(!ReadControllerInput(1,&out));assert(!ReadControllerInput(2,&out));assert(!ReadControllerInput(-1,&out));assert(!ReadControllerInput(0,nullptr));
 s_live_inputs=decoded;s_live_input_owner=true;
 assert(ReadControllerInput(0,&out)&&out.mask==1&&out.stick_x==200);assert(ReadControllerInput(1,&out)&&out.mask==2&&out.stick_x==56);
 s_rollback_inputs[1].mask=4;s_rollback_input_owner=true;assert(ReadControllerInput(1,&out)&&out.mask==4);
 s_rollback_input_owner=false;assert(ReadControllerInput(1,&out)&&out.mask==2);
 s_live_input_owner=false;assert(!ReadControllerInput(1,&out));assert(ReadControllerInput(0,&out)&&out.mask==32);
}
`);
  const compiled=spawnSync('c++',['-std=c++17','-pthread',resolve(dir,'test.cpp'),'-o',resolve(dir,'test')],{encoding:'utf8'});assert.equal(compiled.status,0,compiled.stderr);
  const result=spawnSync(resolve(dir,'test'),[],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
