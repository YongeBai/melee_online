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
      '#include "VideoCommon/FrameDumper.h"\n#include <cstdlib>\n#include <unistd.h>\n#include <cerrno>\n#include <vector>\n#include <cstring>',
    )
    .replace(
      "int target_height = target_rect.GetHeight();",
      'int target_height = target_rect.GetHeight();\n  if (std::getenv("MELEE_STREAM")) { target_width = 960; target_height = 720; }',
    )
    .replace(
      "auto frame = m_frame_dump_data;",
      `auto frame = m_frame_dump_data;
    if (std::getenv("MELEE_STREAM")) {
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
      '#include <cstdio>\n#include <cstdlib>\n#include <fcntl.h>\n#include <unistd.h>\n#include <sstream>\n#include "Core/HW/Memmap.h"\n#include "Core/PowerPC/PowerPC.h"\n#include "Core/PowerPC/JitInterface.h"',
    )
    .replace(
      "  while (m_running.IsSet())",
      `  const bool stream=std::getenv("MELEE_STREAM")!=nullptr;
  bool reported=false; std::string input;
  if(stream)fcntl(0,F_SETFL,fcntl(0,F_GETFL)|O_NONBLOCK);
  while (m_running.IsSet())`,
    )
    .replace(
      "    std::this_thread::sleep_for(std::chrono::milliseconds(100));",
      `    if(stream) {
      auto& system=Core::System::GetInstance();
      if(!reported && system.GetMemory().GetRAM()) { std::printf("MELEE_MEM1=%p\\n",system.GetMemory().GetRAM());std::fflush(stdout);reported=true; }
      char buf[256];ssize_t n;while((n=read(0,buf,sizeof(buf)))>0)input.append(buf,n);
      size_t e;while((e=input.find('\\n'))!=std::string::npos){
        std::istringstream line(input.substr(0,e));input.erase(0,e+1);
        std::string command;int value=0,id=0;line>>command>>value>>id;
        if(command=="pause")Core::SetState(system,value?Core::State::Paused:Core::State::Running);
        if(command=="invalidate"){Core::CPUThreadGuard guard(system);system.GetPPCState().iCache.Reset(system.GetJitInterface());}
        std::printf("MELEE_ACK=%d\\n",id);std::fflush(stdout);
      }
    }
    std::this_thread::sleep_for(std::chrono::milliseconds(stream?2:100));`,
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
      '#include "AudioCommon/NullSoundStream.h"\n#include <cstdlib>\n#include <unistd.h>\n#include <chrono>\n\nNullSound::~NullSound() { stream_running=false;if(stream_thread.joinable())stream_thread.join(); }',
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
    if(running && !stream_running) {
      stream_running=true;
      stream_thread=std::thread([this]{
        auto next=std::chrono::steady_clock::now();
        while(stream_running){
          s16 samples[960];GetMixer()->Mix(samples,480);::write(4,samples,sizeof(samples));
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
