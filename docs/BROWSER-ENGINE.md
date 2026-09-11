# Browser engine investigation

Work is isolated on `codex/browser-dolphin`, outside the checkout used by the
native-streaming agent. The preview is `node scripts/browser/serve.mjs` (port
3003). This server only serves files; it does not start Dolphin or an encoder.
Open `/play/?engine=wasm&qa=1` and select the local USA 1.02 disc. The browser
passes the File to WORKERFS without downloading the ISO from the server or
making a second whole-disc copy in JavaScript.

## Acceptance criteria

The objective is **not achieved**. A successful result requires sustained
720-line gameplay at 60 FPS, usable two-player inputs, and deterministic
rollback between independent browser instances. A fast emulation clock,
upscaled 240p canvas, or animated renderer test pattern does not qualify.

Latest full-state-validated build (candidate 49):
`b041332554a42918a67b72e58c171ffbacb3c4fff2acd1c0186f95e1b9e20b52`.
It passes the 240-frame full-state comparison with the generated WASM
dispatch loop actually executing. Active CPU-9 gameplay measured 58.876
simulation / 56.144 distinct visible FPS at 960×720, below the target.
The release uses bounded shared pixels and same-frame readback. Candidate
46's ImageBitmap path accumulates graphics memory and is rejected for release.
For packaging and measured validation,
see BROWSER-DEPLOYMENT.md. Live peer transport is not implemented.
The original checkout/server is untouched.

Use `engine=wasm&video=ogl&oglproxy=worker&renderheight=720&qa=1&wasmjit=2&forcejit=1&jitwarmup=900&shortprefix=1&smearcompile=0&determinism=1&icache=0`
plus the candidate `coreid`. Add `inputprobe=1&timelineprobe=1&timelineframes=240`
for repeated two-human late-input correction; `benchmarkcpu=1` uses an active
level-9 CPU for the separate normal-speed benchmark. Keep `corelog` off for
performance measurements because it enables the C++ profiler.

The QA benchmark samples the actual game canvas, measures changing images,
records source dimensions separately from CSS dimensions, checks simulation
progress, and rejects hidden-tab measurements. Use a fresh match and at least
30 seconds. Compile jobs must be idle for final performance acceptance.
The small readback probe itself adds overhead; it is only enabled during QA.

## Initial evidence (2026-09-09 PDT)

- Software/WASM reaches visible Melee character select and stage select.
  Its current fast profile presents 320×240 from a 640×480 XFB. This fails the
  resolution requirement regardless of reported frame rate.
- OGL worker and readback modes advance simulation but showed a black image.
  Readback diagnostics reported `nz:0`, a constant framebuffer hash, and zero
  visual change FPS. Reported simulation/queue cadence near 60 is not success.
- OGL main-thread mounting fails because WORKERFS is worker-only. Preflight
  now rejects that configuration with the specific reason.
- The connected in-app browser returns no WebGPU adapter. Real WebGPU must
  fail explicitly there, rather than fall back to an unrelated presenter and
  imply that hardware emulation is working.
- The readback function discarded its GL error before the swap diagnostic
  sampled it. `ogl-readback-diagnostic.patch` preserves that error for the
  next source-built test. This is diagnostic instrumentation, not a proven
  rendering fix.

The first source-built readback test exposed `GL_INVALID_OPERATION` (`0x502`)
while the visible canvas remained black. The next diagnostic revision
separates a pre-existing draw error (`0x10000 | error`) from an error in the
readback operations (`0x20000 | error`), and does not discard a valid readback
because of a pre-existing error. `browser-core-log.patch` adds a bounded
thread-safe renderer log, exposed through `browser-worker-log.patch`.

The first 30-second Battlefield software run measured 37.17 simulation FPS,
12.20 changing-image FPS, 119.07 ms p95 image gaps, and a 320×240 source.
All image samples contained nonblack pixels. This run occurred while the
source compiler was active, so it is a harness/baseline observation, not an
uncontended performance ceiling. The benchmark correctly returned failure.

## Melee-only scope

The supported target is two fighters, no items, four stocks, eight minutes,
and these six stages: Battlefield, Final Destination, Dream Land 64, Yoshi's
Story, Fountain of Dreams, and Pokémon Stadium. The browser QA stage selector
uses their external StKind IDs (31, 32, 28, 8, 2, 3), verified against the
local decompilation; these are not GrKind IDs.

Removing unrelated stage files and modes primarily reduces distribution,
initialization, and storage. Those files generally are not being simulated
inside an active tournament match. Do not claim an FPS gain without an A/B
match benchmark. Physics, collision, timing, audio, and stage transformations
remain part of correctness, including during rollback.

The current build already disables Qt, CLI, updater, analytics, achievements,
Discord integration, UPnP, Vulkan, and desktop audio backends. Its graphics
configuration already disables CPU EFB access and copies EFB into textures
rather than RAM. Repeating these settings is not a new optimization.
Remaining priorities are the active renderer, CPU dispatch, presentation
copies/synchronization, and complete-machine snapshot/replay cost. Once the
working renderer is selected, unused renderers and their shader translators
can be removed from a production artifact and the size benefit measured.

Candidate 2 confirmed that readback succeeds but the earlier draw emits
GL_INVALID_OPERATION; the canvas remained black. Candidate 3 narrowed this
to drawArrays with a complete framebuffer. Candidate 4 then measured a valid
linked program with PSBlock requiring 144 bytes, but the bound uniform range
was only 140 bytes. This violates WebGL's [uniform-buffer draw validation](https://registry.khronos.org/webgl/specs/latest/2.0/).
The targeted fix rounds utility constant bindings to std140's 16-byte block
alignment and initializes padding. This is an active rendering bug, not
evidence of too much unused game functionality.

The ordinary in-page WebGL capability probe identifies the local renderer as
ANGLE on AMD Radeon 890M integrated graphics (radeonsi gfx1150, LLVM 20.1.2).
Thus this WebGL test uses the player's integrated GPU, with no server GPU;
it is not a demonstration of CPU-only 720p rendering.

## Source build

The upstream source lock pins Dolphin commit
`e22551eae1c84a7e4d0b6a5c519ef4ed4ef69df1` plus 54 patches. Its Linux checkout
was verified against the locked result tree before local changes.
The original engine lock only supports Windows. `linux-toolchain.patch`
adds an explicit alternate lock path, Unix tool lookup and PATH handling,
and the Unix clang executable suffix while retaining hash/version checks.

Local tools are confined to `.browser-tools`:

- emsdk commit `bafd64c26bdaf10bd829163d1575b50b759a72d8`, SDK 5.0.7;
- Rust nightly-2026-05-15, compiler commit
  `7c3c88f42ad444f4688b865591d84660be4ece2f`, with rust-src;
- CMake 4.3.2 and Ninja 1.13.0, installed in a uv-managed Python 3.12 venv;
- a host-specific toolchain lock generated and verified by
  `node scripts/browser/lock-linux-toolchain.mjs`.

The Linux lock records actual binary hashes and still requires the upstream
Emscripten and Rust compiler commits. It is not a claim that Linux output is
byte-identical to the Windows prebuilt WASM.

The first Linux build completed and produced candidate
`de987f941afff1fc18c548d40ef3d78801a1cbe355f6089e88c0e23693c82bdb`.
Its manifest includes the local patches and Linux toolchain lock; the vendor
tree is explicitly recorded as a *base* tree. The original default WASM was
restored and rechecked against SHA-256
`3b2ed6fe35ff1939e24bbe033edba34b9585f4f7b1f457f1e683ed8ddbd005d0`.

Run upstream configure/build with `DOLPHIN_TOOLCHAIN_LOCK` pointing to
`.browser-tools/linux-toolchain.lock.json`, `RUSTUP_HOME` to
`.browser-tools/rustup`, and `CARGO_HOME` to `.browser-tools/cargo` (absolute
paths, while the working directory is `engines/wasm-dolphin`).
Keep the verified prebuilt core intact; use content-addressed candidate URLs
for experimental cores. The preview exposes those under
`/play/build/core-candidates/`.

`node scripts/browser/build-candidate.mjs` configures future builds into
`build/browser-output`, verifies the local toolchain, packages a candidate,
and includes the experimental patches and actual Linux lock in its manifest.
It never writes the default prebuilt core directory.

## Rollback prerequisites

The current WASM `RunFrame` is a presentation/metadata function, not an exact
emulation-frame advance. Input injection only supports port zero. File/slot
savestates are insufficient as a low-latency rollback interface.

The native RollbackSession algorithm can be reused only after the browser
core exposes a paused frame boundary, independent inputs for ports zero and
one, bounded complete-machine snapshots, restore completion, and suppression
of obsolete video/audio during replay. Test restore-and-replay equality with
fixed inputs before adding WebRTC transport, and then repeat with delayed,
reordered and lost packets. A room-code UI alone does not establish rollback.

## Specialization opportunity: game-aware rollback

Slippi's pinned [SlippiSavestate.cpp](https://github.com/project-slippi/Ishiiruka/blob/e9d048ac6f2d77f96fcd1c0b04bc1533a7ff81e1/Source/Core/Core/Slippi/SlippiSavestate.cpp)
backs up selected Melee data/heap regions and excludes specific audio and
XFB/VI regions. Its capture/load implementation does not invoke the commented
whole-emulator serialization path. Slippi's [architecture guide](https://github.com/project-slippi/slippi-wiki/blob/master/GETTING_STARTED.md)
explains that rollback spans game assembly hooks and the emulator's EXI
interface. The live EXI implementation also identifies required supporting
patches, including preventing file/music alarms during this mode.

This is a second possible architecture beyond complete-machine snapshots:
restore game state at a controlled game-loop boundary, rerun the relevant
simulation with corrected inputs, and avoid replaying unrelated I/O or
presentation. It could reduce copying and GPU synchronization, but is not a
drop-in RAM-only substitute for the current freely running unmodified game.
Port and validate the paired game hooks, memory exclusions, RNG/input state,
and audio behavior together. No such browser port is implemented yet.

## Rendering fix verified

Candidate `aa9c8a2e1a13322f0c159b8c4fa538bfb806f9d2d70c5a718d415ed458b3f7b8`
with the uniform-padding fix renders Melee menus and a Fox/Falco Battlefield
match in WebGL. Readback diagnostics show changing/nonblack pixels and
`glerr:0`. Direct ImageBitmap presentation also renders the game at 640×480.
These are local browser emulation tests, not the native streaming server.

The 30-second readback match measured 38.20 simulation FPS, 11.30 changing
images per second, 216.45 ms p95 image gaps, 1049.75 ms maximum gap, and a
320×240 source. The compiler was idle, but the other task's native room was
running on this shared machine. This diagnostic core still checked GL errors
on each draw; the next candidate caps those checks after initialization.
The run fails the performance and resolution requirements.

The new opt-in `renderheight=720` configuration uses a 960×720 4:3 target,
2× internal EFB resolution, and scaled EFB copies. Readback storage is sized
for the larger GL target separately from physical GameCube XFB limits.
Bitmap source dimensions are recorded independently of canvas/CSS size.
It is not an accepted/default profile until visible gameplay is measured.

Candidate `58790c5e8f3d2db37ba57986b13207681509624e3ef4a1cf80801ad1133861b7`
with `oglproxy=worker&renderheight=720` renders visibly sharper gameplay.
The 30-second Battlefield run measured 40.64 simulation FPS and 40.37
changing-image FPS at an actual 960×720 source, with 34.60 ms p95 gaps,
57.48 ms maximum gap, and nonblack pixels throughout. Compilation was idle.
The resolution milestone is demonstrated for this match; 60 FPS and rollback
remain unachieved. This test uses cached interpretation with WASM JIT off.

A clean mixed-JIT run (`wasmjit=2&forcejit=1&jitwarmup=900`, profiling off)
measured 40.44 simulation FPS and 40.30 visible FPS, with 38.77 ms p95 gaps
and 69.48 ms maximum gap. It does not establish a steady-state improvement
over the cached-interpreter trial. A separate instrumented run showed long
VI timing waits; do not use that run as a performance A/B arm because
`ppcprof=1` disables block redispatch in CachedInterpreter.

The opt-in `timing=dolphin` comparison restores Dolphin's standard values
for SyncOnSkipIdle (true), RushFramePresentation (false), and
SmoothEarlyPresentation (false). The baseline retains the port's opposite
values. CPU overclock and emulation speed stay at 1. These settings are an
experiment, not a demonstrated speedup. In upstream CoreTiming::Idle,
SyncOnSkipIdle drains outstanding GPU work before advancing idle time to
avoid VI/GPU desynchronization.

The standard-timing run measured 39.27 simulation FPS and 39.20 visible FPS
at 960×720 (34.75 ms p95; 51.19 ms max). An uncapped diagnostic measured
31.24 simulation FPS / 30.54 visible FPS; removing the speed limiter did not
recover the target. These shared-machine trials are not isolated hardware
ceiling measurements.

A separate `probe=delivery` control avoids per-frame pixel readback. It
measured 34.51 simulation FPS, 44.54 delivered bitmaps/s, and 60.03 browser
animation callbacks/s, with a new presentation on 43.84 callbacks/s. The
extra bitmap deliveries relative to game frames show why delivery counts
alone are insufficient. This mode is explicitly diagnostic-only and always
returns `passed:false`. Pixel inspection overhead does not fully explain
the shortfall. The QA output now includes backend, core hash, timing/JIT
settings, emulation rate, clock factor, and browser graphics capabilities.

## Further CPU experiments and JIT mode correction (2026-09-10)

At 960×720, the 0.5 CPU-clock diagnostic measured 39.20 simulation FPS,
39.17 game-render FPS, and 39.10 changing-image FPS (34.88 ms p95 gaps).
Single-thread emulation measured 34.63 simulation FPS and 34.63 visible FPS
(39.35 ms p95). Neither setting is promoted to a default.

Candidate `e2889e4a51b7af40f943e8c0880d9d397c27f0cf177744563326e5a77d179dba`
adds opt-in CPU/GL wall-time counters with `corelog=1`. Unlike `ppcprof=1`,
this preserves block redispatch. Diagnostics confirm internal scale 2,
scaled EFB copies enabled, dual CPU/GPU threads, clock factor 1, and game
speed 1. CPU execution dominated the sampled character-select totals, but
the browser disconnected before the match interval result could be read.
Do not substitute menu totals for an active-match profile. Disable profiling
for final performance acceptance and use it only to locate bottlenecks.

Source inspection found that the worker's delayed JIT setter changed its
mode flags without invalidating existing CachedInterpreter blocks. Code
already translated into interpreter callbacks during startup would remain
there until another cache invalidation; switching JIT off also retained
previous generated callbacks. The worker also wrote non-atomic flags read
by the CPU thread.

`jit-mode-cache.patch` now publishes an atomic mode request. At the next
CPU slice boundary, with no cached callback executing, the CPU thread
applies the mode, resets verification state, and clears the block cache.
The diagnostics report requested/applied modes and the number of such
flushes. This covers off/guarded/mixed transitions. Mode reporting from the
helper-statistics reader also uses the atomic applied value.

Candidate `1121e5d18b208dd57cfb589dc882c1afe631c2b53fb2966c31dd6ed6a49454bb`
built successfully with this correction. Seven browser benchmark/preflight
unit tests pass. The candidate has **not been run in a browser**: the browser
tool reported no connected surfaces and then “Browser is not available:
iab.” The prior default core remains unchanged. The candidate's successful
build is not evidence of a speedup or of emulation correctness.

Resume with:

`http://localhost:3003/play/?engine=wasm&video=ogl&oglproxy=worker&renderheight=720&qa=1&corelog=1&wasmjit=2&forcejit=1&jitwarmup=900&coreid=1121e5d18b208dd57cfb589dc882c1afe631c2b53fb2966c31dd6ed6a49454bb`

Confirm applied mode 2 and one mode flush, inspect visible menus/gameplay,
then measure a warm 30-second match. Repeat without profiling for acceptance.
If it improves performance, test all six stages and heavier fighter pairs;
otherwise use the CPU/GL interval counters before further optimization.
No 60 FPS or browser rollback completion is claimed.

## Resumed browser verification

The JIT mode fix was verified in browser: requested/applied mode 2 and one
cache flush, with 5,916 compiled blocks observed after the first match.
A 29.9925-second Battlefield run measured 48.5788 simulation FPS, 48.5121
game-render FPS, and 48.3121 visible FPS at 960×720. Nonblack fraction was 1,
p95 gaps 33.470 ms, maximum 50.225 ms. Inclusive CPU execution consumed
27,615.686 ms (92.075% of wall time); CPU timing advance 1,560.958 ms;
GL draw 224.515 ms; uniform upload 650.049 ms; shader compile 24.216 ms;
presentation 868.045 ms. These overlapping thread times are not additive.
The result is encouraging compared with earlier runs, but not a controlled
same-session A/B claim or a performance pass.

An unprofiled repeat measured 49.0380 simulation FPS, 48.3713 game-render
FPS, and 47.0045 visible FPS, with a 1,802.705 ms maximum gap. This still
fails both throughput and smoothness criteria. The next experiment lowers
the existing JIT prefix threshold from four PowerPC instructions to two;
this tests whether short interpreted blocks are the remaining bottleneck.

Short-prefix mode measured 50.1390 simulation / 50.0723 game-render / 49.7389
visible FPS (33.385 ms p95, 52.170 ms maximum gap). Candidate
`17919e2c8b4ed7ddd2143ee273f676921dcc427efd1ae932a39baee3f7ff2e8e`
adds direct WASM callback dispatch in the interpreter translation unit. With
short-prefix mode it measured 51.3323 simulation / 51.1656 game-render /
50.0315 visible FPS (38.170 ms p95, 55.685 ms maximum gap). These single
trials do not establish a robust marginal speedup. Both fail acceptance.

The next candidate adds a private paused-machine rollback probe: six bounded
64 MiB uncompressed checkpoints, existing Dolphin frame stepping, restore,
and exact complete-state byte comparison. The QA action replays eight frames
and requires each step to advance exactly one game frame. This is a core
verification tool, not multiplayer or a performance-ready rollback loop.

With the compilation limiter disabled (`smearcompile=0`), candidate
`c7244e7a4a25bb2f16513e39c0d80862325eaa550f9b15e6255b87775ed9ec55`
measured 60.0385 simulation FPS, 59.9385 game-render FPS, and 57.3382 visible
FPS at 960×720, with 20.460 ms p95 gaps and a 66.610 ms maximum gap. It
**does not pass** because presentation remains below 59.5 FPS. The regular
limiter run on that core measured 50.1055 / 50.0388 / 49.7055 FPS.

Source inspection confirms budget-rejected blocks were retained as cached
interpreter callbacks. `jit-deferred-retry.patch` remembers those blocks in
a bounded 1,024-entry list, then removes only the matching cached blocks at
the next CPU slice boundary so they can be compiled on their next execution.
An overflow clears the cache at that safe boundary. Atomic diagnostics count
retries and full flushes. Candidate
`e5135ae9ae94ab2d535760f010dbbb08d1631bdfe5f884723edc520b989e9dc7`
contains this fix and checkpoint size diagnostics.

The initial complete-state capture probe failed; no replay pass has occurred.
The next diagnostic reports paused/running state and required snapshot bytes
instead of conflating the reasons. The 64 MiB per-slot limit remains in place.

An optional `pace=raf` frontend experiment buffers one source frame and
presents in order on animation callbacks at the NTSC cadence. Its queue is
bounded to three frames, closes discarded bitmaps, and re-primes after a
producer stall. It trades roughly one frame of latency for jitter tolerance.
Four unit tests cover ordering, 120 Hz callbacks, resource bounds, and stalls.
It is not enabled by default and has not yet passed browser performance QA.

Candidate 12 with the limiter enabled measured 58.2110 simulation FPS,
58.1443 game-render FPS, and 54.9418 visible FPS (32.170 ms p95 gaps,
50.410 ms maximum). The capture diagnostic reported state=Paused and
110,218,786 required bytes, confirming the size guard caused the failure.

Candidate `69a11387c951e0dcd99557d428a503d3247d0175da5f9387803aad097c36f58a`
raises the checkpoint bound to 128 MiB each / 640 MiB aggregate, still with
six slots. It also keeps the existing verified SDK interrupt handlers
reachable when mixed JIT is active: directly compiling those three entry
blocks bypassed the handler verifier, causing dependent idle/input helpers
to repeatedly fall back after a JIT-mode reset. Exact original instruction
matching remains in the existing handler. No new interrupt semantics are
introduced. This candidate is pending browser replay and performance tests.

September 10 follow-up: candidate 13's first complete-machine replay restored
frame 305 and replayed eight single-frame steps to 313. Fighter positions,
actions, stocks, and inspected game state matched, but the full snapshots did
not. Capture cost ~40 ms, restore ~34 ms; the first replayed frame after restore
cost ~80 ms. This is not yet usable live rollback. Its first regular benchmark
included a 5.2-second stall (48.98 simulation / 45.05 visible FPS); a post-restore
RAF-buffered trial was much worse (10.01 / 8.41 FPS). Neither is a pass.

`rollback-state-diff.patch` adds bounded section-level byte diagnostics without
exposing the disc or saved buffers. Candidate
`aeb3f1e7aba64a127e4477b18a5a51033e57416bbc7bf262d1b1638432a99bd3`
replayed eight frames with all RAM/device bytes and CoreTiming bytes identical.
Only video state (15 bytes) and PowerPC state (30,730 bytes, starting within the
cache region) differed. Snapshot size was 110,153,137 bytes. Do not equate this
with full determinism: the graphics path logged unsupported read mappings.

`webgl-staging-readback.patch` replaces unsupported GL read mapping with reusable
CPU staging storage and WebGL2 buffer readback. Its first build
`1360769418f44aabc190a50f931010a54998f4b2ee46d095d1d73b45f078c916`
measured 58.9354 simulation / 58.8688 game-render / 56.1687 visible FPS over 30 s
before capture (960x720, p95 30.55 ms, max 99.15 ms, all nonblack). Capture then
failed with a null GL function pointer: the browser GL loader did not bind
`glGetBufferSubData`. This build must not be promoted. The follow-up binds the
WebGL2 operation directly rather than relying on that desktop GL function table.

`rollback-checked-code-cache.patch` is an experiment to retain compiled code
across restore only when instruction-cache coherence and compiled source bytes
match before and after loading. Any disagreement falls back to clearing the
cache. It also adds narrower CPU/cache and graphics checkpoint section markers.
It remains under browser correctness and performance evaluation.

Candidate `e8d8d3a014f7d30008585051ece03a510b243d49c55e74b8eecdd7aa9ac8eb78`
links WebGL2 buffer readback directly. Capture/restore no longer produced the
unsupported-map or null-function errors. A cold direct-bitmap trial measured
56.3780 simulation / 54.4110 game-render / 50.5435 visible FPS (35.45 ms p95,
449.065 ms max); this does not justify changing the default presenter. The
`blit=bitmap` experiment uses bitmaprenderer when supported and records source
dimensions before transferring ownership of the ImageBitmap.

Candidate `ead1d0b8577855ae78b855fdeac6364621ce29dd09ccbada07a47d0bbb45bc48`
adds `determinism=1` (Dolphin fake-completion GPU scheduling) and aligns snapshot
comparison by section boundaries. This avoids reporting shifted bytes as RAM
corruption when the timing-event serialization changes length. With deterministic
scheduling, GPU commands, framebuffer pixels, CoreTiming, and data cache matched;
one SDK saved-FPSCR byte, live FPSCR state, instruction-cache state, and a few
host graphics bookkeeping values differed. The saved-FPSCR byte is at
0x804A855D within DefaultThread (base 0x804A83C8), not fighter data.
Normal Dolphin frame-step produced matching 0/2-frame pairs, which is unsuitable
for per-game-frame rollback even though the total advanced by eight.

Candidate `c14e8a553ee2dc9f22f77f8a3024ff2735494aada94989834f9c4e6011d86f46`
adds a private GALE01 v1.02 CachedInterpreter logic-frame gate. It checks the
Melee scene counter after complete cached-block writeback, including redispatch,
and pauses as soon as the counter changes. All 16 tested steps advanced exactly
one Melee frame. Full-state replay still differed. Capture ~268 ms and restore
~107 ms in this deterministic mode are not live rollback performance. The
`icache=0` follow-up tests Dolphin's supported instruction-cache-disabled mode;
no claim of tournament-wide correctness or performance is made yet.

The next checkpoint experiments (`icache=0`, `gpucheckpoint=1`) keep immutable
GPU copies in six bounded slots (192 MiB aggregate) while copying full CPU RAM
and devices. A separate ordinary full-state capture validates the fast restore;
GPU checkpoint indices are never accepted as proof of pixel equality. Disabling
instruction-cache emulation is opt-in and the code-retention guard still checks
compiled source bytes. A restore fetches its XFB reference without displaying a
rewound preview or incrementing the presentation counter.

Candidate `4c66e62a78e52eb2845f70e7d6f6843d59f507b5d93e7145b21da1471772ff53`
fixes a deterministic-GPU scheduling stall: host AsyncRequests now explicitly
wake the GPU loop instead of scheduling an emulated timing event and waiting for
its 100 ms idle poll. Fast capture fell from 195.66 to 23.775 ms, and restore
from 91.60 to 16.44 ms. The 87,412,103-byte CPU snapshot plus 22,740,992 bytes of
GPU textures retains complete state. RAM/device copying accounts for 22.675 ms
of capture. All sixteen probe steps advanced exactly one game frame. After
replaying eight frames, full captures matched CPU registers/caches, RAM/devices,
CoreTiming, framebuffer pixels and Presenter state; five texture-cache metadata
bytes differed. The full equality gate correctly remains failed. The immediate
restore comparison also differs in one PixelEngine-section byte. The first
post-restore frame still costs 189.685 ms despite retained compiled code, so
this is not usable live rollback yet. Ordinary decoded texture cache entries
are discarded on load and are the next cache-rebuild hypothesis to test.

The SIMD-copy follow-up passes 576 size/alignment cases, including destination
boundaries and preserved source bytes, compiled to the same threaded SIMD WASM
configuration. Its generated code contains explicit vector loads/stores. Browser
replay, capture timing, and a fresh 30-second 720p60 test remain required. No
multiplayer browser rollback or 720p60 acceptance pass is claimed.

Candidate `9bf85abdf8f59cc05cc7f3e7f5b4d4f6f2d214f9a8a7f1601165cf9aab4e7e0a`
(SIMD copy) passed one eight-frame complete-machine replay with every saved
section byte-equal after replay. Immediate restore still differed in one
PixelEngine byte. Capture was 21.555 ms (20.875 ms in HW), restore 13.315 ms.
Steps contained large stalls (first sequence 14–157 ms, replay 14–75 ms), so
this is a correctness milestone, not live rollback acceptance. The first QA
attempt timed out in the menu transition; retry after manually starting the
match passed. That transition needs a more robust input/scene handshake.

A subsequent 30-second Battlefield test measured 59.7446 simulation,
59.6779 game-render, 59.0778 distinct visible FPS, 19.16 ms p95 / 41.085 ms max
image-change gap, 960x720 source, all samples nonblack. It fails the >=59.5
visible-FPS gate. Settings: worker OGL, mixed JIT, shortprefix, smearcompile=0,
determinism=1, icache=0, immediate presentation, normal speed, no profiler.

`complete-gpu-textures.patch` tests copying ordinary decoded cache entries as
well as EFB/XFB copies in private GPU snapshots. It retains the 192 MiB total
budget and bounds the count at 1,024, explicitly rejecting unsupported texture
formats/types. Independent clones avoid Dolphin's unimplemented partial-update
path for content-locked ordinary textures. Public full/disk states keep their
existing cache policy. This candidate is not yet validated.

Candidate 25 (`5b62a584147c3f36b246e17d3b135c7bdc5965998ea95975756b303677b79f2b`)
hit a memory-access exception during a replay attempt. Do not promote it.
`checkpoint-errors.patch` fixes an unsafe capture failure path: a rejected
texture writes its sentinel index and marks the checkpoint invalid, rather than
switching an unfinished writer into verify/read traversal. Browser rollback
exceptions now include their stack, and QA records the last operation. The
harness also waits for CSS if invoked during boot; previously that early click
could bypass match setup entirely and time out. QA Start now remains held until
the stage-select transition is observed, rather than relying on a 180 ms pulse.

Candidate 26 (`c6f9b20f0388816430854d735317bc0e5e81267a6d0d6cc6a2c3843ee64b87e7`)
passed an eight-frame full-state replay with complete GPU texture-cache capture
and retained compiled code. With `checkpointwarm=1`, first capture took 25.910 ms
and three subsequent captures of that slot took 5.145, 5.845, and 5.580 ms.
CPU checkpoint size 87,433,696 bytes; GPU textures 21,692,928 bytes. Last warm
copy breakdown: RAM/L1 1.924 ms, fake VMEM 2.165 ms, DSP/ARAM 0.875 ms, remaining
hardware negligible; GPU serialization ~0.44 ms. Restore took 16.075 ms. The
first and repeated eight-step sequences still contain large stalls (up to
143/96 ms), despite compiled-code retention. Immediate restore retains the
known single PixelEngine-section byte difference; all sections agree after the
eight replayed frames. This is not a live rollback or 720p60 acceptance pass.
All 41 packaged file hashes for candidate 26 were verified, and the original
prebuilt WASM hash remains unchanged.

A warm uncapped candidate-26 capacity repeat measured 64.014 simulation/render
FPS, only modest headroom above 60 (the cold run was 56.134). It is diagnostic,
not a normal-speed pass. An instrumented run measured 49.609 FPS with CPU
execution occupying 80.99% of wall time and CPU timing advance another 10.99%.
Inclusive GL call timings were 0.71% draw, 2.14% uniforms, 0.045% compilation,
3.41% presentation; these measure CPU submission cost, not GPU execution.
Instrumentation itself changes performance, so its frame rate must not be
compared directly with the uninstrumented throughput result.

The next CPU candidate removes optional `DOLPHIN_WEB_HOT_COUNT` increments and
keeps the existing guarded Melee idle-loop shortcut reachable before generic
WASM block compilation. It retains the shortcut's instruction/runtime guards
and fallback path. Detailed CPU counters are available through the explicit
QA diagnostics request. These changes are pending replay and throughput tests.

Candidate 27 (`456a227ced90ddd698b1e612a3c442d913e69c64b841edf4d430b57cadbe9316`)
booted and completed a cold capacity test at 55.318 simulation / 55.418 render
FPS. Detailed diagnostics confirm hot counters off and reveal the idle helper's
permanent lifetime fallback: 8,193 successful batches, zero fast-path exits,
87,765,626 throttle fallbacks. Loop exits may occur through the guarded original
instruction path, so zero fast exits does not establish a stuck game. The next
patch instead periodically returns to original instructions after 8,192 helper
attempts, retaining all instruction/runtime checks and the 256-iteration and
remaining-cycle limits.

The same diagnostics show 31,675/32,768 lifetime mixed-JIT compilations after
one match. `jit-instance-reuse.patch` replaces this descriptor-count limit with
runtime-local callable-instance reuse: exact generated-byte digest, import
indices/function identities, WASM memory, table identity and stored callable
must agree. Unique instances are bounded at 65,536 and 64 MiB of generated code;
regenerating an existing descriptor can reuse its callable at the cap. Failed
hashes are rejected. Five tests exercise the actual EM_JS body with real WASM
modules/tables, checking reuse, changed code behavior, changed imports/memory,
bounds and empty digests. Browser validation is pending.

Candidate 28 (`a112f7ee07fa58848fbcc14c3ec7cc4769052818d84afeb64d05622a5d338156`)
passed full-state eight-frame replay after idle fallback and JIT instance reuse
changes. Warm capture 6.445 ms, restore 16.375 ms; initial sequence ~19–27 ms per
step, replay first step ~100 ms and later ~19–39 ms. Uncapped Battlefield
capacity reached 67.046 simulation/render FPS. A half-clock experiment was
slower: 57.376 FPS cold, 59.215 FPS warm, so it is not selected. Normal-speed
RAF presentation is now being tested.

Prepared follow-up APIs (not yet browser validated) support exclusive,
frame-owned input for both controller ports and unthrottled single-frame
stepping. Two complete pads are validated before either is installed, GUI
input remains separate while the replay owns the ports, and cleanup releases
ownership and cancels stepping. The input probe changes movement/buttons on
both human fighters, checks their slot types and movement, and compares full
replayed snapshots. This is still a local replay prerequisite; room networking,
late-packet correction, output suppression and multiplayer are not implemented.

## Memory pressure and candidates 29–30 (2026-09-10 PDT)

The candidate-28 RAF trial measured 40.693 simulation / 40.659 render / 40.426
visible FPS over 30.005 seconds, with 40.585 ms p95 gaps. This trial is
**confounded**: subsequent inspection found full swap, roughly 45% I/O wait,
memory-pressure averages near 15%, and GPU-process/worker crashes. Do not
attribute the slowdown to RAF or use it as a clean A/B comparison. Free memory
recovered after the browser process failures. The precise source of memory
growth remains unproven.

Candidate 29 (`394160df4c903d784eea8d0e1185ca59b4b8963aa72463f875ad6a6510a5ab17`)
builds the two-port input, unthrottled-step, stop cleanup, and step timing APIs.
Five tests exercise the actual worker request handler: complete two-port
packing, no partial installation on invalid second-player input, allocation
cleanup on core rejection, restoring normal speed after a failed step, and
reporting transition/wait times. These are boundary tests, not Dolphin replay
or controller-poll proof.

Candidate 30 adds `bitmap-backpressure.patch`. GPU-thread bitmap export uses a
shared atomic credit counter limiting outstanding messages to four. Credits
return on page receipt or a failed transfer; the optional page presentation
queue separately bounds its retained images to three. When delivery stalls,
export skips taking a new bitmap while emulation continues. Diagnostics expose
in-flight/exported/skipped counts. The limit addresses an identified unbounded
message path; it does not prove that path caused the observed memory pressure.
Four tests execute the production export/receipt bodies against mocked canvas
transfers, including 10,000 attempts with a stalled recipient and failure
cleanup. Real GPU resource behavior and frame cadence still need browser QA.

`scripts/engine/browser-rollback.js` adds an isolated, transport-independent
timeline with immutable per-frame inputs, held-input prediction, a bounded
prediction window, checkpoint validation, delayed correction and replay.
Arrivals during async machine work are applied at the next transaction to
avoid invalidating checkpoints mid-write. Capture/restore failures stop the
timeline. Six tests use a deterministic model machine: delayed/reordered/
duplicated inputs converge to immediate-delivery state, dropped input stalls
at the window limit, async arrivals are corrected, replay emits no model
output, and concurrent advances fail safely. It is intentionally **not wired
to live Dolphin games**: browser replay video/audio suppression and the
real adapter contract must be implemented and verified first. Room transport
and independent-client state synchronization also remain incomplete.

All 31 current benchmark/capability/queue/JIT/input/rollback/backpressure tests
pass. Candidate manifests 27/28/29/30 verify 44/46/50/51 file hashes respectively;
the baseline WASM hash is unchanged. No candidate has been promoted.

Resume browser QA on port 3003 with candidate 30, immediate presentation,
`video=ogl&oglproxy=worker&renderheight=720&qa=1&wasmjit=2&forcejit=1&jitwarmup=900&shortprefix=1&smearcompile=0&determinism=1&icache=0`.
For the two-human replay probe add
`gpucheckpoint=1&checkpointwarm=1&inputprobe=1&stepcapacity=1`.
First verify both ports and full-state replay, inspect step timing and memory
growth, then run an uncontended 30-second 720p60 acceptance benchmark. A live
two-client delay/loss test remains a separate required gate.

## Browser reconnection and two-port proof

After browser reconnection, the first real two-port probe caught a JS bridge
bug: this build exports `HEAPU8` but not `HEAPU32`. The worker now constructs
`new Uint32Array(moduleInstance.HEAPU8.buffer, pointer, 18)` after allocation,
which also handles a grown heap. The worker tests now model the actual exported
heap shape. The QA boot wait tolerates only the known pre-DOL MEM1-signature
condition; unrelated failures still surface.

Candidate 30 with that JS fix passed the eight-frame input probe on Battlefield:
both fighters were human slots with controller indices `[0,1]`; Fox moved right
from X=0 to 13.8384, Falco left from X=0 to -7.31. Every first/replayed step
advanced one scene frame (303 through 311). Independent full snapshots were
110,153,138 bytes and matched in every recorded CPU/GPU/device section, with
compiled code retained. Immediate restore still had the known single
PixelEngine-section flag difference before stepping. This is local replay
proof, not peer networking. A concurrent compiler and substantial unrelated
CPU workload make this run's 50–412 ms step timings unsuitable for performance
comparison; the measured delay was in the asynchronous wait, with the direct
step transition under 0.2 ms.

`browser-mmu.patch` adds opt-in `mmu=1`, using Dolphin's existing real MMU mode.
It should omit fake VMEM through the normal memory allocator/serializer, rather
than dropping bytes from an otherwise required snapshot. Candidate 31 builds
successfully; browser correctness and throughput remain to be checked.

Candidate 31 with `mmu=1` passed the two-human full-state replay. Fast snapshot
bytes fell to 53,869,123; full comparison size was 76,598,702. Three warm
captures took 3.640, 5.335 and 3.385 ms; restore took 17.265 ms. Both ports moved,
all steps advanced one frame, and full replayed states matched. The subsequent
29.985-second two-human-port Battlefield sample measured 33.016 simulation,
33.049 rendered, 32.949 distinct visible FPS at 960×720, all nonblack, p95 gap
42.240 ms. This fails the performance target.

Diagnostics explain an important configuration limitation: despite requested
JIT mode 2, there were zero JIT attempts/compiled blocks. Real MMU sets
`jo.memcheck`, and `TryWriteWasmBlock` unconditionally rejects that mode; several
Melee helpers do too. The test was running the cached interpreter. Keep MMU
optional/off for current JIT performance; do not remove memory-fault checks to
force the unsupported JIT path. A safer MMU/JIT integration would require its
own exception and memory-translation correctness tests.

## Repeated correction probe (candidates 32–33)

The local timeline probe now runs 40 scripted two-human frames against an
independent on-time reference, with remote inputs delivered three frames late.
It preserves two full snapshots outside the rotating four-slot GPU checkpoint
ring and compares complete final state; it is not a network or FPS benchmark.
Replay output suppression drops only detached bitmap exports and host mixer
enqueue, retaining game GPU/DSP execution.

Candidate 32 failed with auxiliary FIFO synchronization warnings and a WASM
null-function error. Phase diagnostics reproduced the failure at **reference
frame 32, before any restore**. The earlier eight-frame replay pass was not
sufficient coverage. A candidate 33 experiment drains already-preprocessed
commands on the GPU thread when acquiring the paused CPU guard, before FIFO
compaction. CPU logic breaks pause adjacent systems; the regular GPU loop
returns early when paused, so merely waiting on that loop does not drain
pending commands. Build/test results are pending; this is not yet a verified fix.

Candidate 33 (`0b07a75271386a000842f613213133262a625f97c0167dee3c11634e69a50b04`)
completed the 40-frame reference and all delayed-input corrections, then aborted
with WASM OOM allocating the final full snapshot in slot 0. The earlier FIFO
crash did not recur, but final equality was not measured. All 54 packaged
artifacts passed manifest SHA-256 verification.

Candidate 34 adds explicit paused checkpoint disposal (CPU buffers plus GPU
clones on their owning thread), frees an invalidated snapshot allocation before
growing its replacement, and restricts the extra FIFO drain job to an already
paused GPU. The probe releases its baseline after restoring it, and releases
all four fast checkpoints after the final correction, before independently
capturing final state in slot 5. It still retains the full reference in slot 4;
no correctness data is omitted from the comparison. The browser worker tests
check disposal slot validation and missing-core support.

Candidate 34 (`b087e527f00288871ead81234bff3c27abcb83108a4528c36349a6d88b564cbc`)
completed the comparison without an OOM: 15 rollbacks, 63 resimulated frames,
maximum depth 6; 63 bitmap exports and 84,272 audio sample frames suppressed,
with suppression off at completion. Both fighters matched exactly; all CPU,
RAM, device and other GPU sections matched. The full 110,153,138-byte states
differed by ten bytes in TextureCache, beginning at its serialized entry-ID
counter. This is still a failed full-state validation. All 55 packaged files
passed manifest verification; 35 focused JS regression tests pass.

The full reference/baseline path still used Dolphin disk-state behavior,
omitting decoded non-copy textures, while fast GPU checkpoints retained them.
Restoring that full baseline can recreate textures and allocate different IDs.
Candidate 35 makes every private browser snapshot preserve the full cache,
including full readback snapshots, while leaving ordinary disk savestates
unchanged. Equality remains byte-for-byte, without ignoring metadata.

Candidate 34 used `corelog=1`, which also enables the high-frequency C++
profiler. Its approximately 41 ms reference-step / 50 ms delayed-step means
are diagnostic timings, not production throughput. Subsequent performance
measurements must omit corelog.

Candidate 35 passed the strict 40-frame delayed-input test: 15 corrections,
63 replayed frames, depth up to 6. All 113,707,877 bytes of independent full
CPU/GPU/device snapshots matched. Replay suppressed 63 bitmap exports and
83,584 audio sample frames and released suppression afterward. Profiler was
off; source resolution 960×720. This is one local engine on Battlefield with
Fox/Falco, not a peer or performance acceptance test. The paused QA step path
still averaged 32.7 ms reference / 40.4 ms delayed+replay, fast captures 7.4 ms
and restores 13.5 ms. Full readback captures took 335–421 ms; live checkpoints
use GPU clones, not those full reference captures. See
[the recorded result](browser-rollback-validation.json). All 56 candidate artifacts
passed manifest hash checks.

A following 30.007-second candidate-35 Battlefield benchmark with two human
ports (no profiler, immediate 2D-canvas bitmap delivery) measured 59.319
simulation FPS, 59.285 rendered FPS, but only 50.687 distinct visible FPS.
Source 960×720; p95 image gap 29.150 ms, maximum 68.605 ms. This fails the
720p60 gate. The next experiment uses existing `pace=raf&blit=bitmap` to test
bounded display-synchronized direct bitmap presentation.

Candidate 35 also passed strict replay with `pace=raf&blit=bitmap`. The following
29.997-second benchmark still failed: 53.973 simulation, 53.939 rendered,
51.906 distinct visible FPS, p95 gap 38.850 ms, maximum 117.180 ms. This
combination is not selected as a performance fix. The idle two-human workload
and synchronous pixel readback can affect distinct-image measurements; a
new `benchmarkcpu=1` QA option uses a level-9 CPU without changing the
two-human rollback probe. Existing thresholds are unchanged.

Source inspection found that `MMU::IBATUpdated` and `DBATUpdated` call
`ClearSafe` unconditionally on restore, bypassing the checked-code retention
in JitInterface::DoState. Candidate 36 compares complete BAT tables only while
BrowserKeepJit is active; unchanged tables skip the redundant remap/clear,
while changed mappings follow the original invalidation path. The surrounding
restore guard still clears code if compiled source bytes differ after load.
A C++ test compiles the actual two updated methods and checks unchanged,
changed-last-entry, fake-VMEM and unchecked cases in 32/64-bit preprocessor
branches. It passes. Browser correctness and timing are pending.

Candidate 36 passed **240** reference frames with 98 corrections and 409
replayed frames, maximum depth 6. All 113,188,634 final bytes matched;
409 bitmap exports and 546,472 audio sample frames were suppressed.
Reference steps averaged 22.600 ms (median 19.140); delayed+replay steps
23.003 ms (median 22.905), fast capture 7.610 ms, restore 13.264 ms.
The previous first-replay ~100 ms spikes disappeared (first replay step
22.94 ms). All 57 artifacts matched their hashes.

Its subsequent active level-9 CPU benchmark failed: 53.460 simulation,
53.427 rendered, 47.161 distinct visible FPS over 30.004 seconds; p95
gap 33.240 ms, maximum 78.995 ms. CPU FPS and presentation still need work.

Candidate 37 replaces the step completion timer poll with a shared atomic
sequence notified by the CPU frame gate after Break. JS uses waitAsync with
a 16 ms bounded wake to service host jobs, retaining timer fallback where
unsupported. Tests exercise actual worker notification, a completion racing
with wait registration, invalid pointers, and normal speed restoration.
All 58 candidate artifacts verify; real browser timing/correctness is pending.

Candidate 37 passed the same 240-frame workload: 98 corrections, 409 replayed
frames, identical full state. Atomic completion reduced delayed/replayed step
mean from candidate 36's 23.003 ms to 20.535 ms. Candidate 38 replaces the
per-block generic memory lookup with a validated direct read of all four bytes
of Melee's frame counter. Its 240-frame test also passed (113,188,634 bytes),
with an 18.502 ms delayed/replay step mean. All 59 packaged artifacts verified.
These are sequential local diagnostic runs, not a controlled hardware A/B.

Candidate 38's active level-9 CPU benchmark measured 50.444 simulation,
50.377 render, and 45.909 visibly changing FPS over 29.994 seconds at 960×720;
p95 image gap 36.355 ms, maximum 77.170 ms. It fails the target. The shared
machine also has other browser/native work running; none was stopped.

An opt-in `checkpoints=prediction` timeline policy skips fast snapshots when
both inputs are known. It uses actual checkpoint frame numbers, discards
superseded future snapshots after restore, and retains the anchor needed for
an unaligned prediction start. Randomized 800-frame delayed/reordered trials
across four window/interval pairs compare complete model state, output order,
and bounded history. The real 240-frame probe passed with **zero reference
fast captures** versus 60 periodic captures, and 98 delayed captures. The
corrected full state was byte-identical (113,188,639 bytes). This removes known
unnecessary work; it does not establish a live networking or FPS pass.

Candidate 39's opt-in `dcbfast=1` emits the native JIT's live IBAT + valid-code
bitmap check for dcbst/dcbf/dcbi. It only skips the original helper when there
is no code in the target physical cache line. Accurate data caching, privileged
dcbi, unknown translations and live code keep the original path. The flag can
change while paused, allowing `cachecompare=1` to run the reference through
the original helper and delayed correction through the optimization without
changing the compiled block layout. A test executes the actual emitted WASM
against 12,000 translation/cache/privilege/flag cases. Full emulator proof and
throughput measurement are pending. This does not omit code invalidation.

Candidate 39 (`9deb5403f4f6eb9a444d26e409d993dfea80e45da0b48ec13e282a39aba6c371`)
passed the original-helper reference versus optimized delayed replay: 240 frames,
98 corrections, 409 replayed frames, all 113,188,634 bytes equal. All 60 candidate
artifacts verified. Normal active-CPU gameplay still measured 50.084 simulation /
50.084 render / 46.350 visible FPS over 29.989 seconds (p95 37.080 ms). This is
not a useful measured throughput gain and does not meet the target.

Candidate 40 tests cache-loop batching. The generic WASM compiler previously
consumed the dcb* loop entry before the existing specialized callback could
batch it. Cache-maintenance entries now reach the verified pattern matcher.
`dcbbatch=1` enables bounded batching at runtime; `batchcompare=1` compares
single-operation reference execution against batched delayed replay. Both retain
the ordinary final add/branch instructions. Exactly divisible cycle budgets use
`(downcount-1)/loopCycles` extra iterations, avoiding an extra iteration beyond
the ordinary block boundary. A native test compiles the actual callback and
compares registers, cycles and invalidated line sequences across count/budget
boundaries, signed count wrap, address wrap, privilege, and accurate-data-cache
fallbacks.

The old callback incorrectly skipped invalidation for large flushes and whenever
the WASM tier was off. That shortcut is removed: interpreted cached blocks and
large regions can contain modified code too. Dolphin's live block bitmap handles
empty ranges. Seven remaining purely diagnostic block/helper/opcode increments
also now obey the existing disabled-hot-counters build flag. The disabled block
run counter consequently reports zero, not a measurement of executed blocks;
compile counts and game-frame counters remain active. Browser proof and normal
FPS measurements for candidate 40 are pending.

Candidate 40 passed the original-operations versus optimized-correction test:
240 frames, 98 corrections, 409 replayed frames, 113,188,634 bytes equal in all
state sections. All 62 artifact hashes verified. The active level-9 CPU match
measured 51.885 simulation / 51.851 render / 46.083 distinct visible FPS over
29.990 seconds at 960×720, p95 image gap 35.460 ms. The target still fails.

Candidate 41 adds an opt-in `inlinedispatch=1` lookup in the existing interpreter
chain. It hoists only the stable map allocation, reloading the live block entry,
PC and feature tags every time. Cache collisions, missing entries and feature
changes use ordinary Dolphin dispatch. Map diagnostics retain ordinary dispatch.
`dispatchcompare=1` runs the reference with this gate off and corrected replay
with it on. The actual lookup helper is compiled and exercised against 200,000
collision/flag/invalidation cases. The QA benchmark now clears earlier result
text before preparing a match; there is no claim that this improves game speed.

Candidate 41 passed original dispatch versus inline dispatch: all 113,188,634
bytes equal after 98 corrections and 409 replayed frames. All 63 packaged file
hashes verified. Its active CPU benchmark measured 53.772 simulation/render and
47.172 distinct visible FPS over 29.997 seconds, p95 gap 33.105 ms, at 960×720.
This is below target; sequential runs are not a controlled hardware A/B.

Candidate 42 adds `codegencompare=1`: compare ordinary generated code against
`regalloc=1` and/or `fastmemhoist=1` after restoring the same baseline. The new
paused-core API clears the compiled cache when the codegen flags change, retains
all unrelated feature bits, and rejects a running/non-cached-interpreter core.
These existing optimization options remain opt-in pending real-game comparison.

Candidate 42 (`c1ae651a30c19bfd001e6322cfc858184cdf8c0bdf99b0f2ce7c2f3b6a3eb8f9`)
passed ordinary generated code versus register-cached corrected replay. All
113,188,634 bytes equal after 98 corrections / 409 replayed frames. Its 64 file
hashes verified. The first reference step includes a deliberate code-cache
flush/recompile (maximum 1,074 ms), so reference/replay times are not an A/B
performance comparison. An actual-WASM emitter test covers 2,000 randomized
conditional-store/helper-clobber cases with register caching on versus off.

The normal active-CPU benchmark measured 53.825 simulation / 53.759 render /
47.289 visible FPS over 29.986 seconds at 960×720, p95 gap 32.865 ms. This did
not establish a useful speedup over candidate 41. Combined register-cache and
fast-memory-check hoisting is being compared next; its actual range-check
emitter passes RAM-end, signed-offset and 30-bit-wrap boundary cases.

Candidate 43 adds diagnostic-only inclusive CPU/GPU synchronization, CPU GPU
command preprocessing and blocking video-request wall times to the existing
`corelog=1` profiler. This distinguishes CPU instructions from graphics waits
inside the execution scope. These nested times must not be summed. Profiling
remains off in normal play and final performance acceptance runs.

Candidate 42 also passed the combined `regalloc=1&fastmemhoist=1` differential:
113,188,634 bytes equal after 98 corrections / 409 replayed frames, all obsolete
409 video exports suppressed. This test ran during a source build; its timing
is not a throughput result. Diagnostics recorded 42,843 unique JIT instances
(out of 65,536), zero compile failures, and active hoisted-check emission.
Differential codegen trials retain both code variants; use a new browser
session when evaluating the normal compilation/memory footprint.

The candidate 43 graphics-wait profile attributes 78.78% of wall time to CPU
execution and 13.59% to CPU timing advancement. Nested GPU synchronization is
0.47%, GPU preprocessing on CPU is 3.86%, and blocking video requests are zero.
GL presentation is 3.85% on its separate thread. These are inclusive scopes.
Instrumentation reduced simulation to 38.13 FPS, so the sample is diagnostic
only; it points to CPU execution rather than graphics waits as the next target.

Candidate 44 (`753ee7cb8620a614c59f118cafbbdeee28f5bb68d0efc0d7dd4ebb857689ce07`)
recorded 5,119 misses in 1,142,458 sampled fast-map lookups (0.448%). This
instrumented diagnostic does not justify increasing the map size as the next
performance experiment. All 67 packaged artifact hashes verified.

Candidate 45 (`e2ced433dd0abb78254d5ec34b6f0c1c1b0b4ea78dfd64caa8d72db5b03cd45e`)
adds an opt-in compact WASM dispatcher for complete compiled blocks. It calls
the existing generated block functions, applies ordinary PC/cycle/performance
monitor bookkeeping, checks pause and armed game-frame boundaries, and reloads
live block-map entries with PC/feature validation. Partial blocks and other
callbacks return to the existing interpreter. Single-step and block profiling
keep the existing path. Compile failure falls back to the existing dispatcher.

Its actual emitted WASM passes tests for cycle exhaustion, halt writeback,
pause, armed/unarmed/wrapped frame counters, map misses/collisions, changed
feature tags, invalidated/replaced entries, partial blocks, ordinary callbacks,
and performance-monitor arguments. All 59 focused browser/rollback tests pass;
all 68 candidate artifact hashes verified. This is **not gameplay validation**.
The browser provider became unavailable after severe system memory pressure;
`getState` returned no browsers and attempts to select/create an in-app tab
reported that no browser was available. No other worktree's processes were
stopped. The candidate remains experimental and unpromoted.

Resume with the isolated server on port 3003 and this query:

```
/play/?engine=wasm&video=ogl&oglproxy=worker&renderheight=720&qa=1&wasmjit=2&forcejit=1&jitwarmup=900&shortprefix=1&smearcompile=0&determinism=1&icache=0&dcbfast=1&dcbbatch=1&inlinedispatch=1&wasmdispatch=1&timelineprobe=1&timelineframes=240&checkpoints=prediction&wasmdispatchcompare=1&coreid=e2ced433dd0abb78254d5ec34b6f0c1c1b0b4ea78dfd64caa8d72db5b03cd45e
```

Select the user's local disc and run **Verify browser state replay**. It runs
the ordinary dispatcher as reference and the new dispatcher for corrected
replay. The QA result requires both exact full-machine equality and an increase
in the new dispatcher's execution count, so silent fallback cannot pass the
optimization trial. Then use a fresh session without comparison/probe flags,
add `benchmarkcpu=1`, and run **Benchmark 720p60** with profiling disabled.
Inspect native Battlefield rendering, verify the dispatcher count increases,
and record simulation, render, and distinct visible FPS separately. The last
normal active-CPU measurement remains 53.825 simulation / 47.289 visible FPS
at 960×720. Real peer transport and independent-client rollback remain pending.

## Deployable browser preview (September 11)

Candidate 46, `cfc77c6ad8340f2e1d4270bc7f0a8efd59a84b121633dbbc2d006f043a81f322`,
exposes dispatcher counts even when hot-counter profiling is disabled. The
previous 45 check had exact full-state equality but correctly failed the
optimization-execution check because its counter text was compiled out.
Candidate 46 passes both: 113,188,634 bytes identical, 98 corrections, 409
replayed frames and 14,454,035 compact-dispatch calls during the comparison.
The same full-state test runs through the standalone static release server.

Normal CPU-9 gameplay measured 58.912 simulation, 58.945 render and 55.911 visible
FPS over 29.994 seconds at 960×720, with p95 image gaps of 32.57 ms. No profiler,
source build or parallel emulator was running. Bitmap presentation regressed to
53.538 simulation / 50.405 visible FPS and is not a release default. These
measurements do not pass the 60 FPS acceptance criteria or prove WAN rollback.

The static release serves no local disc or extracted artwork. Seven required
menu textures/glyph images are decoded from the player's File; tests compare
them byte-for-byte with the established local PNG extraction. The common GX
decoder is shared with the Node extractor. The final package contains checksums,
Cloudflare/Vercel headers, an unprivileged Node container, and matching modified
engine source split into host-compatible parts. See BROWSER-DEPLOYMENT.md.
