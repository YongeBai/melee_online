# Local GPU renderer

The default `/play/` path runs original Melee in a local headless Dolphin process
and sends its video/audio to the browser. This replaces the software WebAssembly
renderer as the performance path. It does **not** run Dolphin's GPU emulation
inside the browser. The explicit `/play/?engine=wasm` path retains the earlier
browser-only implementation.

## Rendering and transport

- Dolphin source: https://github.com/dolphin-emu/dolphin/tree/a2efdf1197be8132674b90fe9cf4761df39752ed
- Linux x64 release build, native x64 JIT, dual-core emulation, headless Mesa EGL
  OpenGL, hybrid ubershaders, full-detail 2× internal resolution.
- The frame dumper resolves the GPU image to 960×720 RGBA. FFmpeg adds black
  sidebars to make a 1280×720 H.264 stream, preserving Melee's 4:3 proportions.
  This is higher-resolution game rendering, not a 480p image enlarged in CSS.
- x264 ultrafast/zero-latency, CRF 18, no B frames, one-second keyframes. WebCodecs
  decodes real frames; requestAnimationFrame presents each queued frame once.
  There is no interpolation or duplicate-frame inflation of the FPS counter.
- Three decoded frames buffer short delivery jitter; six is the queue limit.
  The protocol resynchronizes at a keyframe if a client falls behind.
- 48-kHz stereo PCM is mixed from Dolphin and played through Web Audio. Audio
  scheduling targets 80 ms. End-to-end input/audio latency is not measured.
- Browser input is sent to Dolphin's pipe controller. A local Node parent reads
  and writes the child process's MEM1 only for checked Melee rules, scene routing,
  and tap-jump hooks. Per-tick reads cover game state, not the whole 24-MB heap.
- Native pause acknowledgements serialize scene/rule writes; changing an option
  while paused preserves pause state. No connected browser pauses the game.
- Changes to executable memory invalidate Dolphin's emulated instruction cache
  and compiled JIT blocks before resuming, so the tap-jump hooks actually execute.

The native bridge binds only to 127.0.0.1:3002 and accepts WebSockets from the
localhost:3000 website. The disc stays in the root directory and is read by the
local emulator. No disc upload or remote game server is involved.

## Reproduce

Run `npm start` from the repository root. `scripts/native/setup-native.mjs`
fetches the pinned source/submodules, applies `patch-native.mjs`, and builds the
headless executable. CMake is downloaded with its release SHA-256 checked.
On this Ubuntu/Mint installation, missing EGL development headers are downloaded
with apt and unpacked into `.local-tools/sysroot`, without a system install.
Build prerequisites: Linux x64, Node 24+, Git, a C++20 compiler/make, FFmpeg with
libx264, Mesa EGL/OpenGL runtime, and access to the GPU render node.

The first source build can take several minutes. Later launches reuse the
executable and shader caches. Runtime files are under `.melee-native/`; the
renderer log is `.melee-native/Logs/native.log`. Both build and runtime folders
are ignored by Git. The upstream source and bridge patches remain available
locally; Dolphin is GPL-2.0-or-later.

## Verification

Open `/play/?qa=1`, click Start Melee, then **Benchmark 720p60**. It starts a fresh
match and waits for the actual native match timer to reach 7:54 before measuring
30 seconds (or 60 with `&benchmarkSeconds=60`). The result separates simulation, native rendering, capture, encoding,
decoding and distinct browser presentations. Scene changes invalidate the run.
The target is 59.5+ FPS at 1280×720 (Melee NTSC nominal rate is about 59.94 Hz).

The first valid OpenGL sample on this machine recorded 59.93 native rendered FPS
and 60.00 browser presented FPS over 30.001 seconds, with zero dropped decoded
frames. The final 60.009-second Ice Climbers/Jigglypuff run measured 59.94 native
rendered and 59.96 browser presented FPS, also with no dropped frames.
Hardware: Ryzen AI 9 HX PRO 370, Radeon 890M, Mesa 25.2.8. See
`VALIDATION.md` for the completed functional and performance checks.

Vulkan was investigated but its utility descriptor update crashed during longer
runs on this driver. OpenGL is the default. The native shader-cache progress
callback also needed a guard because headless mode has no ImGui context.
