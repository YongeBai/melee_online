import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
const root = path.resolve(import.meta.dirname, "../../engines/dolphin-native/Source/Core");
function patch(file, edit) {
  const p = path.join(root, file);
  const text = fs.readFileSync(p, "utf8");
  const original = execFileSync("git", ["show", `HEAD:Source/Core/${file}`], {
    cwd: path.resolve(root, "../.."),
    encoding: "utf8",
  });
  const patched = edit(original);
  if (patched === original) throw Error(`Native patch did not match ${file}`);
  if (text === patched) return;
  if (text !== original && !text.includes("MELEE_STREAM"))
    throw Error(`Unrecognized local changes in ${file}`);
  fs.writeFileSync(p, patched);
}
patch("VideoCommon/FrameDumper.cpp", (s) =>
  s
    .replace(
      '#include "VideoCommon/FrameDumper.h"',
      '#include "VideoCommon/FrameDumper.h"\n#include <cstdlib>\n#include <unistd.h>\n#include <cerrno>\n#include <vector>\n#include <cstring>\n#include "Core/MeleeRollback.h"',
    )
    .replace(
      "int target_height = target_rect.GetHeight();",
      'int target_height = target_rect.GetHeight();\n  if (MeleeBridge::suppress_output) return;\n  if (std::getenv("MELEE_STREAM")) { target_width = 960; target_height = 720; }',
    )
    .replace(
      "auto frame = m_frame_dump_data;",
      `auto frame = m_frame_dump_data;
    if (std::getenv("MELEE_STREAM")) {
      // Replay capture is suppressed before readback in DumpCurrentFrame.
      // A queued ordinary frame must still be sent if rollback starts meanwhile.
      const u8* bytes=frame.data; size_t left=frame.width*frame.height*4;
      std::vector<u8> packed;
      if(frame.stride!=frame.width*4){packed.resize(left);for(int y=0;y<frame.height;y++)std::memcpy(packed.data()+y*frame.width*4,frame.data+y*frame.stride,frame.width*4);bytes=packed.data();}
      while(left){const auto n=::write(3,bytes,left);if(n<0&&errno==EINTR)continue;if(n<=0)break;bytes+=n;left-=n;}
      m_frame_dump_done.Set();
      continue;
    }`,
    )
    .replace(
      "bool FrameDumper::IsFrameDumping() const\n{",
      'bool FrameDumper::IsFrameDumping() const\n{\n  if (std::getenv("MELEE_STREAM")) return true;',
    ),
);
patch("DolphinNoGUI/PlatformHeadless.cpp", (s) =>
  s
    .replace(
      "#include <cstdio>",
      '#include <cstdio>\n#include <cstdlib>\n#include <fcntl.h>\n#include <unistd.h>\n#include <sstream>\n#include "Core/HW/Memmap.h"\n#include "Core/PowerPC/PowerPC.h"\n#include "Core/PowerPC/JitInterface.h"\n#include "Core/State.h"\n#include "Core/MeleeRollback.h"',
    )
    .replace(
      "  while (m_running.IsSet())",
      `  const bool stream=std::getenv("MELEE_STREAM")!=nullptr;
  bool reported=false; std::string input; int step_id=0;
  if(stream)fcntl(0,F_SETFL,fcntl(0,F_GETFL)|O_NONBLOCK);
  while (m_running.IsSet())`,
    )
    .replace(
      "    std::this_thread::sleep_for(std::chrono::milliseconds(100));",
      `    if(stream) {
      auto& system=Core::System::GetInstance();
      if(step_id && Core::GetState(system)==Core::State::Paused){std::printf("MELEE_ACK=%d\\n",step_id);std::fflush(stdout);step_id=0;}
      if(!reported && system.GetMemory().GetRAM()) { std::printf("MELEE_MEM1=%p\\n",system.GetMemory().GetRAM());std::fflush(stdout);reported=true; }
      char buf[256];ssize_t n;while((n=read(0,buf,sizeof(buf)))>0)input.append(buf,n);
      size_t e;while((e=input.find('\\n'))!=std::string::npos){
        std::istringstream line(input.substr(0,e));input.erase(0,e+1);
        std::string command;int value=0,id=0;line>>command>>value>>id;
        if(command=="pause")Core::SetState(system,value?Core::State::Paused:Core::State::Running);
        if(command=="invalidate"){Core::CPUThreadGuard guard(system);system.GetPPCState().iCache.Reset(system.GetJitInterface());}
        if(command=="snapshot" || command=="restore" || command=="cachetest"){
          Core::RunOnCPUThread(system,[&system,command,value,id]{
            bool ok=false;
            if(command=="snapshot"){auto n=State::MeleeSave(system,value);ok=n!=0;std::printf("MELEE_SAVE=%d,%zu\\n",value,n);}
            else if(command=="cachetest"){ok=State::MeleeVerifyCodeInvalidation(system,value);}
            else{ok=State::MeleeLoad(system,value);std::printf("MELEE_LOAD=%d,%d\\n",value,ok);}
            if(!ok)std::printf("MELEE_ERROR=%d\\n",id);
            std::printf("MELEE_ACK=%d\\n",id);std::fflush(stdout);
          });continue;
        }
        if(command=="stepping"){MeleeBridge::stepping=bool(value);Core::SetIsThrottlerTempDisabled(bool(value));}
        if(command=="suppress"){MeleeBridge::suppress_output=bool(value);Core::SetIsThrottlerTempDisabled(bool(value)||MeleeBridge::stepping);}
        if(command=="pad"){
          GCPadStatus p;int b,x,y,cx,cy,l,r,a,bb;line>>b>>x>>y>>cx>>cy>>l>>r>>a>>bb;
          p.button=b;p.stickX=x;p.stickY=y;p.substickX=cx;p.substickY=cy;p.triggerLeft=l;p.triggerRight=r;p.analogA=a;p.analogB=bb;MeleeBridge::SetPad(value,p);
        }
        if(command=="step"){step_id=id;Core::DoFrameStep(system);continue;}
        std::printf("MELEE_ACK=%d\\n",id);std::fflush(stdout);
      }
    }
    std::this_thread::sleep_for(std::chrono::microseconds(stream?200:100000));`,
    ),
);
patch("AudioCommon/NullSoundStream.h", (s) =>
  s
    .replace(
      '#include "AudioCommon/SoundStream.h"',
      '#include "AudioCommon/SoundStream.h"\n#include <thread>\n#include <atomic> // MELEE_STREAM',
    )
    .replace(
      "  bool Init() override;",
      "  ~NullSound() override;\n  std::thread stream_thread;\n  std::atomic<bool> stream_running{false};\n  bool Init() override;",
    ),
);
patch("AudioCommon/NullSoundStream.cpp", (s) =>
  s
    .replace(
      '#include "AudioCommon/NullSoundStream.h"',
      '#include "AudioCommon/NullSoundStream.h"\n#include <cstdlib>\n#include <unistd.h>\n#include <chrono>\n#include "Core/MeleeRollback.h"\n\nNullSound::~NullSound() { stream_running=false;if(stream_thread.joinable())stream_thread.join(); }',
    )
    .replace(
      "GetMixer()->SetSampleRate(0);",
      'GetMixer()->SetSampleRate(std::getenv("MELEE_STREAM") ? 48000 : 0);',
    )
    .replace(
      "bool NullSound::SetRunning(bool running)\n{",
      `bool NullSound::SetRunning(bool running)
{
  if(std::getenv("MELEE_STREAM")) {
    if(MeleeBridge::stepping)running=true;
    if(running && !stream_running) {
      stream_running=true;
      stream_thread=std::thread([this]{
        auto next=std::chrono::steady_clock::now();
        while(stream_running){
          s16 samples[960];GetMixer()->Mix(samples,480);if(!MeleeBridge::suppress_output)::write(4,samples,sizeof(samples));
          next+=std::chrono::milliseconds(10);std::this_thread::sleep_until(next);
        }
      });
    } else if(!running) { stream_running=false;if(stream_thread.joinable())stream_thread.join(); }
  }`,
    ),
);
console.log("Native headless frame/audio/pause bridge applied.");
patch("VideoCommon/ShaderCache.cpp", (s) =>
  s.replace(
    "constexpr auto update_ui_progress = [](size_t completed, size_t total) {",
    "constexpr auto update_ui_progress = [](size_t completed, size_t total) {\n    if (g_gfx->IsHeadless()) return; // MELEE_STREAM: no ImGui context in headless mode.",
  ),
);

// MELEE_STREAM rollback: use Dolphin's complete serializer, never RAM-only saves.
fs.copyFileSync(new URL('./rollback-bridge.h', import.meta.url), path.join(root, 'Core/MeleeRollback.h'));
fs.copyFileSync(new URL('./rollback-code-cache.h', import.meta.url), path.join(root, 'Core/MeleeCodeCache.h'));
patch('Core/State.h', s => s.replace('void Init(Core::System& system);', `// MELEE_STREAM: caller holds CPUThreadGuard while paused.
std::size_t MeleeSave(Core::System& system, unsigned slot);
bool MeleeLoad(Core::System& system, unsigned slot);
bool MeleeVerifyCodeInvalidation(Core::System& system, unsigned slot);
void Init(Core::System& system);`));
patch('Core/State.cpp', s => s.replace('#include \"Core/State.h\"', '#include \"Core/State.h\"\n#include \"Core/MeleeRollback.h\"\n#include \"Core/MeleeCodeCache.h\" // MELEE_STREAM')
.replace('  g_video_backend->DoState(p);','  g_video_backend->DoState(p); MeleeBridge::MarkState(\"video\");')
.replace('  system.GetCoreTiming().DoState(p);','  system.GetCoreTiming().DoState(p); MeleeBridge::MarkState(\"timing\");')
.replace('  HW::DoState(system, p);','  HW::DoState(system, p); MeleeBridge::MarkState(\"hardware\");')
.replace('  system.GetPowerPC().DoState(p);','  system.GetPowerPC().DoState(p); MeleeBridge::MarkState(\"cpu\");')
.replace('\nnamespace\n{\nstruct SlotWithTimestamp', `
// MELEE_STREAM: bounded in-memory snapshots include CPU, GPU, timing and devices.
static Common::UniqueBuffer<u8> melee_states[18];
std::size_t MeleeSave(Core::System& system, unsigned slot) {
  if(slot>=18)return 0;
  MeleeBridge::StateScope scope(false);
  return SaveToBuffer(system, melee_states[slot]);
}
bool MeleeLoad(Core::System& system, unsigned slot) {
  if(slot>=18 || melee_states[slot].empty())return false;
  MeleeBridge::StateScope scope(true);
  MeleeBridge::CodeRestoreGuard code_guard(system);
  return LoadFromBuffer(system, melee_states[slot]);
}
// Private regression probe: corrupt a compiled instruction while paused, restore
// before executing anything, and require the cached code to be discarded.
bool MeleeVerifyCodeInvalidation(Core::System& system, unsigned slot) {
  Core::CPUThreadGuard guard(system);
  auto& jit=system.GetJitInterface();
  std::optional<u32> address;
  jit.RunOnBlocks(guard,[&](const JitBlock& block){
    if (!address && block.physicalAddress+4<system.GetMemory().GetRamSize())
      address=block.physicalAddress;
  });
  if (!address || slot>=18 || melee_states[slot].empty()) return false;
  auto* ram=system.GetMemory().GetRAM();
  const u8 original=ram[*address];
  ram[*address]^=1;
  const bool loaded=MeleeLoad(system,slot);
  const bool correct=loaded && ram[*address]==original && jit.GetBlockCount()==0;
  ram[*address]=original;
  return correct;
}
namespace
{
struct SlotWithTimestamp`));
patch('Core/HW/SI/SI_DeviceGCController.cpp', s => s.replace('#include "Core/Movie.h"', '#include "Core/Movie.h"\n#include "Core/MeleeRollback.h" // MELEE_STREAM').replace('pad_status = Pad::GetStatus(m_device_number);', 'if(!MeleeBridge::GetPad(m_device_number, pad_status)) pad_status = Pad::GetStatus(m_device_number);'));
patch('AudioCommon/Mixer.cpp', s=>s.replace('#include "AudioCommon/Mixer.h"','#include "AudioCommon/Mixer.h"\n#include "Core/MeleeRollback.h" // MELEE_STREAM').replace('void Mixer::PushSamples(const s16* samples, std::size_t num_samples)\n{','void Mixer::PushSamples(const s16* samples, std::size_t num_samples)\n{\n  if(MeleeBridge::suppress_output)return;').replace('void Mixer::PushStreamingSamples(const s16* samples, std::size_t num_samples)\n{','void Mixer::PushStreamingSamples(const s16* samples, std::size_t num_samples)\n{\n  if(MeleeBridge::suppress_output)return;'));

// MELEE_STREAM: restoring identical BATs must not remap fastmem or flush the JIT.
patch('Core/PowerPC/MMU.cpp', s => s
.replace('#include "Core/PowerPC/MMU.h"', '#include "Core/PowerPC/MMU.h"\n#include "Core/MeleeRollback.h" // MELEE_STREAM')
.replace('void MMU::DBATUpdated()\n{', 'void MMU::DBATUpdated()\n{\n  const auto previous_bats = m_dbat_table;')
.replace('void MMU::IBATUpdated()\n{', 'void MMU::IBATUpdated()\n{\n  const auto previous_bats = m_ibat_table;')
.replace('#ifndef _ARCH_32\n  m_memory.UpdateDBATMappings', '  if (MeleeBridge::state_active && m_dbat_table == previous_bats) return;\n#ifndef _ARCH_32\n  m_memory.UpdateDBATMappings')
.replace('    UpdateFakeMMUBat(m_ibat_table, 0x70000000);\n  }\n  m_system.GetJitInterface().ClearSafe();', '    UpdateFakeMMUBat(m_ibat_table, 0x70000000);\n  }\n  if (MeleeBridge::state_active && m_ibat_table == previous_bats) return;\n  m_system.GetJitInterface().ClearSafe();'));
// Profiling is opt-in and does not alter serialized data.
patch('Core/HW/HW.cpp', s => s.replace('#include "Core/HW/HW.h"', '#include "Core/HW/HW.h"\n#include "Core/MeleeRollback.h" // MELEE_STREAM')
.replace('  system.GetMemory().DoState(p);','  system.GetMemory().DoState(p); MeleeBridge::MarkState("memory");')
.replace('  system.GetDSP().DoState(p);','  system.GetDSP().DoState(p); MeleeBridge::MarkState("dsp");'));

patch('Core/PowerPC/JitInterface.cpp', s => s.replace('#include "Core/PowerPC/JitInterface.h"', '#include "Core/PowerPC/JitInterface.h"\n#include "Core/MeleeRollback.h" // MELEE_STREAM').replace('if (m_jit && p.IsReadMode())', 'if (m_jit && p.IsReadMode() && !MeleeBridge::keep_jit)'));
// MELEE_STREAM: retain host GPU allocations, while still serializing every texel.
patch('VideoCommon/TextureCacheBase.h', s => s.replace(
  '  std::unique_ptr<AbstractStagingTexture> m_readback_texture;',
  '  std::unique_ptr<AbstractStagingTexture> m_readback_texture;\n  std::map<AbstractTextureFormat, std::unique_ptr<AbstractStagingTexture>> m_melee_readbacks; // MELEE_STREAM'));
patch('VideoCommon/TextureCacheBase.cpp', s => s
.replace('#include "VideoCommon/TextureCacheBase.h"', '#include "VideoCommon/TextureCacheBase.h"\n#include "Core/MeleeRollback.h" // MELEE_STREAM')
.replace('  m_texture_pool.clear();', '  if (!MeleeBridge::state_active) { m_texture_pool.clear(); m_melee_readbacks.clear(); }')
.replace('bool TextureCacheBase::CheckReadbackTexture(u32 width, u32 height, AbstractTextureFormat format)\n{', `bool TextureCacheBase::CheckReadbackTexture(u32 width, u32 height, AbstractTextureFormat format)
{
  if (MeleeBridge::state_active && (!m_readback_texture || m_readback_texture->GetConfig().format != format)) {
    if (m_readback_texture) {
      const auto previous_format=m_readback_texture->GetConfig().format;
      m_melee_readbacks[previous_format]=std::move(m_readback_texture);
    }
    m_readback_texture=std::move(m_melee_readbacks[format]);
  }`)
.replace('  m_readback_texture.reset();\n}\n\nvoid TextureCacheBase::DoLoadState', '  if (!MeleeBridge::state_active) m_readback_texture.reset();\n}\n\nvoid TextureCacheBase::DoLoadState'));
