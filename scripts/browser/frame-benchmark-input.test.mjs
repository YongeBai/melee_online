import test from'node:test';import assert from'node:assert/strict';import{readFileSync,writeFileSync,mkdtempSync,rmSync}from'node:fs';import{execFileSync}from'node:child_process';import{resolve}from'node:path';import{tmpdir}from'node:os';import{benchmarkPad}from'../engine/browser-benchmark-input.js';
const root=resolve('engines/wasm-dolphin/core/upstream');
const extract=(s,name)=>{const at=s.indexOf(name);assert.ok(at>=0,name);return s.slice(at,s.indexOf('\n}',at)+2);};
test('native frame-input algorithm matches ordinary controller policy and validates guest ownership',()=>{
 const dir=mkdtempSync(resolve(tmpdir(),'melee-frame-input-'));
 try{
 const source=readFileSync(root+'/dolphin_web_discio.cpp','utf8'),core=readFileSync(root+'/dolphin_web_core.cpp','utf8');
 const structure=source.slice(source.indexOf('struct InputStateSnapshot'),source.indexOf('\n};',source.indexOf('struct InputStateSnapshot'))+3);
 const statsAt=core.indexOf('struct FrameBenchmarkStats'),statsEnd=core.indexOf('\nEMSCRIPTEN_KEEPALIVE',statsAt);
 // Stop before the next unrelated declaration following the native read function.
 const native=core.slice(statsAt,core.indexOf('\n}',core.indexOf('bool ReadFrameBenchmarkInput',statsAt))+2);
 const cpp=`#include <chrono>
#include <array>
#include <vector>
#include <mutex>
#include <string>
#include <sstream>
#include <algorithm>
#include <cassert>
#include <iostream>
#include "${root}/dolphin_web_benchmark_pad.h"
using u32=std::uint32_t;
#define EMSCRIPTEN_KEEPALIVE
struct GCPadStatus{static constexpr unsigned char MAIN_STICK_CENTER_X=128,MAIN_STICK_CENTER_Y=128,C_STICK_CENTER_X=128,C_STICK_CENTER_Y=128;};
${structure}
std::mutex s_input_state_mutex;InputStateSnapshot s_input_state;
std::array<InputStateSnapshot,2>s_rollback_inputs{},s_live_inputs{};
bool s_rollback_input_owner=false,s_live_input_owner=false,s_runtime_initialized=true;
namespace Core{enum class State{Paused,Running};inline State state=State::Paused;inline bool cpu=true;bool IsCPUThread(){return cpu;}struct Memory{std::vector<std::uint8_t>ram=std::vector<std::uint8_t>(0x1800000);auto* GetRAM(){return ram.data();}};struct CPU{int breaks=0;void Break(){assert(cpu);assert(s_input_state_mutex.try_lock());s_input_state_mutex.unlock();++breaks;state=State::Paused;}};struct System{CPU processor;CPU& GetCPU(){return processor;}Memory memory;static System& GetInstance(){static System s;return s;}Memory& GetMemory(){return memory;}};State GetState(System&){return state;}struct CPUThreadGuard{CPUThreadGuard(System&){assert(state==State::Paused);}};}
${extract(source,'bool DecodeTwoControllerInputs(')}
${native}
${extract(source,'bool ReadControllerInput(')}
${extract(core,'EMSCRIPTEN_KEEPALIVE int BrowserFrameBenchmarkInput(')}
${extract(core,'EMSCRIPTEN_KEEPALIVE int BrowserFrameBenchmarkStopAfterFrames(')}
${extract(core,'EMSCRIPTEN_KEEPALIVE const char* BrowserFrameBenchmarkStats(')}
${extract(core,'EMSCRIPTEN_KEEPALIVE const char* BrowserFrameBenchmarkTiming(')}
int main(){
 auto* ram=Core::System::GetInstance().memory.GetRAM();
 const auto byte=[&](u32 a,u32 v){ram[a-0x80000000]=v;};
 const auto word=[&](u32 a,u32 v){for(u32 i=0;i<4;i++)byte(a+i,v>>(24-i*8));};
 const auto pos=[&](u32 p,float x){u32 bits;std::memcpy(&bits,&x,4);word(0x80600000+p*0x1000+0xb0,bits);};
 std::memcpy(ram,"GALE01",6);ram[7]=2;byte(0x80479d30,2);byte(0x80479d33,2);word(0x804d6720,0x80500000);byte(0x80500000,2);word(0x80479d58,900);
 for(u32 p=0;p<2;p++){u32 slot=0x80453080+p*0xe90,g=0x80501000+p*0x100,fp=0x80600000+p*0x1000;byte(slot+0xc,0);byte(slot+0x46,p);byte(slot+0x8e,4);word(slot+8,0);word(slot+0xb0,g);word(g+0x2c,fp);word(fp,g);word(fp+0x10,14);pos(p,p?20:-20);}
 namespace F=DolphinWeb::FrameBenchmark;F::State state;
 assert(F::Read(ram,0x1800000,&state));assert(state.frame==900&&state.fighters[1].x==20);
 assert(!F::Read(nullptr,0x1800000,&state));assert(!F::Read(ram,0x17fffff,&state));
 ram[7]=1;assert(!F::Read(ram,0x1800000,&state));ram[7]=2;
 byte(0x80453080+0x46,1);assert(!F::Read(ram,0x1800000,&state));byte(0x80453080+0x46,0);
 word(0x80453080+0xb0,0x817ffffc);assert(!F::Read(ram,0x1800000,&state));word(0x80453080+0xb0,0x80501000);
 pos(0,std::numeric_limits<float>::infinity());assert(!F::Read(ram,0x1800000,&state));pos(0,-20);
 Core::state=Core::State::Running;assert(!BrowserFrameBenchmarkInput(1));Core::state=Core::State::Paused;
 s_rollback_input_owner=true;assert(!BrowserFrameBenchmarkInput(1));s_rollback_input_owner=false;
 assert(!BrowserFrameBenchmarkInput(2));assert(BrowserFrameBenchmarkInput(1));
 InputStateSnapshot out;assert(ReadControllerInput(0,&out)&&out.stick_x==208);
 pos(0,60);assert(ReadControllerInput(0,&out)&&out.stick_x==208); // cached within this native frame
 word(0x80479d58,901);Core::cpu=false;assert(ReadControllerInput(0,&out)&&out.stick_x==208);Core::cpu=true;
 assert(ReadControllerInput(0,&out)&&out.stick_x==32);
 s_rollback_input_owner=true;s_rollback_inputs[0].mask=4;assert(ReadControllerInput(0,&out)&&out.mask==4);s_rollback_input_owner=false;
 word(0x80479d58,905);assert(ReadControllerInput(0,&out));assert(s_frame_benchmark.valid&&s_frame_benchmark.skipped==3&&s_frame_benchmark.gaps.size()==1&&s_frame_benchmark.gaps[0].after==1&&s_frame_benchmark.gaps[0].before==5);
 word(0x80479d58,899);assert(ReadControllerInput(0,&out));assert(!s_frame_benchmark.valid);
 assert(BrowserFrameBenchmarkInput(0));s_input_state.mask=32;assert(ReadControllerInput(0,&out)&&out.mask==32);assert(!ReadControllerInput(1,&out));
 // Repeating the same native-frame sequence produces identical fingerprints.
 std::string first;
 for(int repeat=0;repeat<2;repeat++){
 word(0x80479d58,900);pos(0,-20);assert(BrowserFrameBenchmarkInput(1));
 for(u32 f=900;f<=2340;f++){word(0x80479d58,f);pos(0,float(int(f%201)-100));assert(ReadControllerInput(0,&out));assert(ReadControllerInput(1,&out));}
 assert(s_frame_benchmark.valid&&s_frame_benchmark.frames==1441&&s_frame_benchmark.digests.size()==12);
 if(!repeat)first=BrowserFrameBenchmarkStats();else assert(first==BrowserFrameBenchmarkStats());assert(BrowserFrameBenchmarkInput(0));
 }
 // Stop ownership, exact boundaries, repeated ports and invalid targets.
 auto& processor=Core::System::GetInstance().GetCPU();
 assert(!BrowserFrameBenchmarkStopAfterFrames(120));
 word(0x80479d58,900);assert(BrowserFrameBenchmarkInput(1));
 assert(!BrowserFrameBenchmarkStopAfterFrames(119));assert(!BrowserFrameBenchmarkStopAfterFrames(3601));
 Core::state=Core::State::Running;assert(!BrowserFrameBenchmarkStopAfterFrames(120));Core::state=Core::State::Paused;
 assert(BrowserFrameBenchmarkStopAfterFrames(120));assert(!BrowserFrameBenchmarkStopAfterFrames(120));
 Core::state=Core::State::Running;
 for(u32 f=900;f<1020;f++){word(0x80479d58,f);assert(ReadControllerInput(0,&out));assert(ReadControllerInput(1,&out));assert(!processor.breaks);}
 word(0x80479d58,1020);Core::cpu=false;assert(ReadControllerInput(0,&out));assert(!processor.breaks&&!s_frame_benchmark.completed);Core::cpu=true;
 assert(ReadControllerInput(0,&out));assert(processor.breaks==1&&s_frame_benchmark.completed&&s_frame_benchmark.valid&&s_frame_benchmark.stopped_frame==1020);
 const auto stop0=out;assert(ReadControllerInput(1,&out));assert(processor.breaks==1);word(0x80479d58,1021);assert(ReadControllerInput(0,&out));assert(out.generation==stop0.generation&&s_frame_benchmark.last==1020&&processor.breaks==1);
 assert(BrowserFrameBenchmarkInput(0));assert(!BrowserFrameBenchmarkStopAfterFrames(120));
 // Overshot targets and scene loss must stop and fail, never hang or pass.
 word(0x80479d58,900);assert(BrowserFrameBenchmarkInput(1));assert(BrowserFrameBenchmarkStopAfterFrames(120));Core::state=Core::State::Running;
 word(0x80479d58,1021);assert(ReadControllerInput(0,&out));assert(processor.breaks==2&&s_frame_benchmark.completed&&!s_frame_benchmark.valid&&s_frame_benchmark.stopped_frame==1021);
 assert(BrowserFrameBenchmarkInput(0));word(0x80479d58,900);assert(BrowserFrameBenchmarkInput(1));assert(BrowserFrameBenchmarkStopAfterFrames(120));Core::state=Core::State::Running;
 byte(0x80479d33,0);assert(ReadControllerInput(0,&out));assert(processor.breaks==3&&s_frame_benchmark.completed&&!s_frame_benchmark.valid);byte(0x80479d33,2);
 assert(BrowserFrameBenchmarkInput(0));assert(BrowserFrameBenchmarkInput(1));assert(BrowserFrameBenchmarkStopAfterFrames(120));assert(BrowserFrameBenchmarkInput(0));word(0x80479d58,1020);assert(ReadControllerInput(0,&out));assert(processor.breaks==3);
 // Native timing is separate from deterministic fingerprints and rejects
 // incomplete, invalid, offset-start and zero/negative-duration spans.
 assert(BrowserFrameBenchmarkInput(0));word(0x80479d58,900);assert(BrowserFrameBenchmarkInput(1));
 assert(BrowserFrameBenchmarkStopAfterFrames(120));Core::state=Core::State::Running;assert(ReadControllerInput(0,&out));
 assert(s_frame_benchmark.timed_start&&s_frame_benchmark.timed_start_frame==900);
 assert(std::string(BrowserFrameBenchmarkTiming()).find("false")!=std::string::npos);
 word(0x80479d58,1020);assert(ReadControllerInput(0,&out));
 auto& timing=s_frame_benchmark;timing.time_start=std::chrono::steady_clock::time_point{};timing.time_stop=timing.time_start+std::chrono::milliseconds(2000);
 const std::string deterministic=BrowserFrameBenchmarkStats();const std::string elapsed=BrowserFrameBenchmarkTiming();assert(elapsed.find("true")!=std::string::npos&&elapsed.find("2000.000000")!=std::string::npos);
 timing.time_stop+=std::chrono::milliseconds(123);assert(deterministic==BrowserFrameBenchmarkStats());
 timing.timed_start_frame=901;assert(std::string(BrowserFrameBenchmarkTiming()).find("false")!=std::string::npos);timing.timed_start_frame=900;
 timing.valid=false;assert(std::string(BrowserFrameBenchmarkTiming()).find("false")!=std::string::npos);timing.valid=true;
 timing.time_stop=timing.time_start;assert(std::string(BrowserFrameBenchmarkTiming()).find("false")!=std::string::npos);
 timing.time_stop-=std::chrono::milliseconds(1);assert(std::string(BrowserFrameBenchmarkTiming()).find("false")!=std::string::npos);
 assert(BrowserFrameBenchmarkInput(0));assert(BrowserFrameBenchmarkInput(1));assert(!s_frame_benchmark.timed_start);
 // Already sampled input cannot arm a new stopping boundary.
 assert(BrowserFrameBenchmarkInput(1));assert(ReadControllerInput(0,&out));assert(!BrowserFrameBenchmarkStopAfterFrames(120));assert(BrowserFrameBenchmarkInput(0));
 // Emit deterministic randomized cases for comparison with the existing JS policy.
 u32 seed=0x912beef;const auto rnd=[&](){seed=seed*1664525u+1013904223u;return seed;};
 for(int i=0;i<40000;i++){
 F::State s;s.frame=rnd();for(auto& a:s.fighters){a.x=float(int(rnd()%801)-400)/4;a.stocks=rnd()%5;}
 const u32 p=rnd()%2;const auto pad=F::Input(s,p);
 std::cout<<s.frame<<' '<<p<<' '<<s.fighters[0].x<<' '<<s.fighters[0].stocks<<' '<<s.fighters[1].x<<' '<<s.fighters[1].stocks;
 for(auto value:pad)std::cout<<' '<<value;std::cout<<char(10);
 }
}
`;
 writeFileSync(resolve(dir,'test.cpp'),cpp.replace('#include <cassert>','#include <cassert>\n#include <limits>'));
 execFileSync('c++',['-std=c++20','-O2','-pthread',resolve(dir,'test.cpp'),'-o',resolve(dir,'test')]);
 const lines=execFileSync(resolve(dir,'test'),[],{encoding:'utf8',maxBuffer:12*1024*1024}).trim().split('\n');assert.equal(lines.length,40000);
 for(const line of lines){const [sceneFrame,port,x0,stocks0,x1,stocks1,...actual]=line.split(' ').map(Number);const expected=benchmarkPad({major:2,minor:2,sceneKind:2,sceneFrame,fighters:[{port:0,x:x0,stocks:stocks0},{port:1,x:x1,stocks:stocks1}]},port);assert.deepEqual(actual,Object.values(expected));}
 }finally{rmSync(dir,{recursive:true,force:true});}
});
