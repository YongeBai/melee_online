# Browser 720p60 optimization lab — September 11, 2026

Branch: `codex/browser-720p60`.
The strict performance requirement remains **unmet**. No production deployment
or performance certification has been made by this experiment.

September 14 UTC: Frozen Stadium is tracked separately because its transition
logic has no effect on the other five tournament stages. A shared cosmetic
experiment froze only Battlefield maps 1 and 3, leaving the main object and
platforms intact. Measured normal/frozen/frozen/normal simulation FPS was
45.53/53.40/55.00/53.53 after the per-mode warmups. The apparent improvement
is unusable: native-frame fingerprints show the fighter trajectory diverging
at frame 720 and inputs diverging after that. Normal animation is restored and
remains the default. Do not generalize the result to Final Destination even
though it has a larger set of candidate background objects.

The repaired call-fusion/FPU-proof candidate was also tested with complete
720p images. Measured OFF/ON/ON/OFF simulation FPS was
49.14/46.60/46.50/48.47 after warmups. All 90 shared gameplay fingerprints
match, but both pairs favor call fusion off. The feature remains disabled.

Historical September 11 baseline was a private copy of the production audio-startup-fix release, using
core b041332554a42918a67b72e58c171ffbacb3c4fff2acd1c0186f95e1b9e20b52.
That early file-picker experiment is superseded. Every current playable build
automatically loads the hosted game; player-supplied ISO startup must never return.
Local package `dist/browser/perf-lab` is experimental, and its release inventory
is not a publishable integrity manifest after overlays. Do not deploy it.

## September 13: unchanged controls, placement, and exact byte swaps

The accepted exception is only Fountain of Dreams with Ice Climbers. Yoshi's
Story IC/IC still blocks the goal: four identical-checkpoint runs on core f2
measured 40.57/42.94/42.38/43.54 visible FPS, with 40 matching input fingerprints.
The last three used 6.7/0/2.6 ms synchronous compilation per 30 seconds, and only
0–1 queue drops versus 490–577 underruns. Frame production remains limiting.

A same-checkpoint CPU placement diagnostic measured unrestricted/faster-class/
faster-class/unrestricted at 42.27/46.90/45.70/44.73 visible FPS. All 43 shared
fingerprints matched. Only the current task's busiest dedicated worker was
temporarily restricted; its original 0–23 affinity was restored before the last
run and the restoration guardian exited. This cannot become a browser deployment
requirement. The warm paired gain was only 0.97 FPS. No OS priority, governor,
display setting, or other application was changed.

The frame logger is inactive. Rush OFF passed 600-frame raw replay but lost the
timing comparison; ON is retained. Queue 4 failed Yoshi and added about 26 ms,
so queue 2 remains. GPU delay 4000 reduces callbacks but retains unresolved raw
state differences; original 1000 remains.

Core 094195c8 adds sampled complete-block timing without disabling production
dispatch chaining. Four actual generated production dispatcher variants are
byte-identical with profiling OFF. Tests cover actual WASM timing, stop, branch,
metadata and instrumentation behavior plus paused ownership and cleanup. The
first Yoshi capture sampled 404,085 blocks, including 46,206 animation-decoder
block visits. Clock/import overhead and a large isolated spike prevent treating
raw sampled microseconds as CPU percentages; no precise self-time claim.

Core 3718aaf2 adds opt-in exact rotate/mask 32-bit byte reversal. Actual emitter
tests pass one million arbitrary raw values, and 75 configuration/benchmark/
replay tests pass plus the new replay-coverage check. It reduces the expression
from 37 to 23 bytes and wins every pair in the separate Node microbenchmark.
Real-game 600-frame replay passed: 110,057,607 identical bytes across 29 sections,
with 69,636 newly emitted byte-swap sites. The OFF/ON/ON/OFF timing comparison
failed all gates: 38.47/39.41/41.97/42.50 measured visible FPS. Both pairs do not
favor the candidate. Four intervals tracked fewer than 1200 common input frames,
so input consistency is a failed gate even though no differing fingerprint was
reported. Keep the candidate OFF. Evidence: `bswap-rotate-replay.json` and
`bswap-rotate-comparison.json` with the same date prefix.

The next opt-in candidate joins up to eight short blocks / 64 instructions.
It follows safe unconditional targets and conditional fallthroughs, retaining
the original budget/PC/pause/step checks at every boundary. Intermediate segments
must pass the existing register-only proof. Physical code ranges remain tracked;
cycles, HLE, memory writes in intermediate segments, system writes and unsafe
instructions are rejected. A conditional alternate target uses the existing
normal redispatch status without debiting unexecuted segments. This changes
host dispatch, not native game code or graphics. Actual WASM tests exercise every
boundary and admission tests execute the actual extension algorithm. The 82
related tests pass after updating an older byte-swap fixture's dependencies.
Core e9d4e787 built and passed the real 600-frame replay: 110,123,914 identical
bytes across all 29 sections. Input/state hashes and native frames 307–907 match.
The candidate compiled 1,050 chains with 3,266 boundaries; the dispatch
call counter fell from 1,614,788 to 1,504,241 in this replay. These counters are
not a wall-time saving estimate. The 45-second OFF/ON/ON/OFF trial measured
41.76/42.47/43.56/43.87 visible FPS: opposing paired gains, all image gates
failed, 124 shared input fingerprints matched. Keep OFF.
Evidence: `browser-2026-09-13-chain-fusion-replay.json`.

Stage audit correction: the initial claim that the filter hid Randall was based
on a misleading decompilation table comment. Actual callback code identifies
map 2 as Randall, with moving collision in `grStory_801E33E0`. Map 1 is the
decorative background; the mistaken guard retained its draw callback.
The resulting 33.47 visible FPS interval used that different rendering configuration.
The live object inspection confirms Randall uses category 0, which the old
category-2 filter did not change. The corrected explicit map-2 guard is installed
and tested. A fresh 45-second interval measured 35.80 visible FPS, zero image
drops and 1077 underruns. Native camera code is unchanged; Randall was outside
the post-run screenshot, so his appearance was not visually verified. Keep
the stage-after-pause check and the rule to preserve gameplay-visible objects.

September 14 UTC: a same-checkpoint uncapped comparison measures exactly 1200
native frames, without the image verifier, while keeping native CPU clock and
rendering. OFF/ON/ON/OFF has warm and measured runs, with no descriptor reset
between runs in the same mode. The first attempt measured 36.78 / 40.01 native
FPS with 605.0 / 0 ms synchronous compilation, then stopped at a harness check:
native helper text caches the prior mode until execution advances. Fixed by
reading the prior counter before mode switching and verifying mode/new coverage
afterward. Seven headroom/cleanup tests pass including cached-text behavior.
The corrected comparison completed: warmed OFF/ON/ON/OFF native FPS
39.94/42.74/42.02/42.12, all 80 rolling fingerprints equal. Pairs oppose again;
keep chaining OFF. Evidence: `browser-2026-09-14-chain-headroom.json`.

The read-only Yoshi inventory found 44 joint-animation channels on hidden map 1,
versus one on separate map 2 (Randall). The new map-1-only animation skip uses
the checked existing clone of `Ground_801C1CD0`, preserving material processing,
the collision-update counter and callbacks. It never touches map 2 or map 3.
Five actual-disc procedure/ownership tests and the related benchmark/replay
checks pass. The real 600-frame replay matched all four IC actors, RNG, camera,
stage transforms/timers, and item actors (observed kinds 210 and 106); Randall
moved. This is observable-state equality, not full-machine equality. Normal
animation is restored before making the backdrop visible or finishing a trial.

The 45-second normal/skipped/skipped/normal comparison measured
42.40/43.69/43.80/44.07 visible FPS. All 126 shared fingerprints match, but the
pairs oppose (+1.289/-0.267 FPS) and every image gate fails. Keep animation on.
Evidence: `browser-2026-09-14-yoshi-animation-inventory.json`,
`browser-2026-09-14-yoshi-animation-replay.json`, and
`browser-2026-09-14-yoshi-animation-timing.json`.

Next diagnostic, now running: temporarily bypass the guarded USA 1.02 scene
draw dispatcher `HSD_GObj_80390ED0`, keeping outer camera setup and the native
frame/VI loop. Compare normal/bypassed/bypassed/normal exact 1200-native-frame
workloads with uncapped host pacing. Blank/incomplete output is intentional and
can never pass acceptance. The cost includes guest draw callbacks plus their
downstream graphics work; it is not GPU-only time. Matching input fingerprints
remain required for matched-work interpretation. Two new guard/restoration tests
pass, including actual-disc function hash, hook drift and cleanup failure cases.
The hook is never a startup or playable setting. Normal instructions, pacing,
input and the original checkpoint restore at the end.

Evidence is in `docs/benchmarks/browser-2026-09-13-yoshi-identical-checkpoint.json`,
`yoshi-placement-comparison.json`, `yoshi-direct-block-profile.json`, and
`bswap-microbenchmark.json` with the same date prefix. Current startup/camera
invariants and performance coverage are summarized in `BROWSER-720P60-STATUS.md`.

## Measurements so far

Codex in-app Chromium, Ryzen AI 9 HX PRO 370 / Radeon 890M, ANGLE OpenGL,
WebGL2 and shared memory enabled, WebGPU unavailable. Other user applications
and other worktree processes remain running. No source builds ran during FPS
measurements. Runs are sequential, not an isolated hardware A/B.

All samples below are Fox versus CPU-9 Falco on Battlefield, four stocks,
eight minutes, no items, at normal emulation speed and CPU clock 1. Existing
acceptance thresholds were unchanged; all samples failed.

| Experiment | Seconds | Simulation FPS | Render FPS | Distinct visible FPS | p95 image gap ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| Production settings, profiler off | 59.979455 | 31.360738 | 31.360738 | 31.060636 | 54.135 |
| Original background, core profiler on, JIT disk cache off | 30.009330 | 24.059184 | 24.092507 | 23.959215 | 67.570 |
| Background draw callbacks skipped, same profiled session | 29.977500 | 25.719289 | 25.685931 | 25.485781 | 67.715 |
| Frame-sized nonshared readback scratch, profiler on | 29.969660 | 22.222474 | 22.222474 | 22.122373 | 71.055 |
| Pipelined PBO readback, profiler on | 29.999520 | 22.233689 | 22.233689 | 22.200355 | 70.940 |
| GPU bitmap presentation, profiler on | 29.989540 | 38.046599 | 38.046599 | 37.446390 | 50.305 |
| GPU bitmap with timer task yielding, profiler off | 29.984095 | 46.958229 | 46.924878 | 45.290678 | 41.275 |
| GPU bitmap with message tasks, profiler off | 29.980160 | 48.932361 | 48.932361 | 46.730905 | 40.235 |
| Message tasks + black background, profiler off | 29.995275 | 53.808475 | 53.775136 | 50.774664 | 37.150 |
| Message tasks + black background, core profiler on | 29.990025 | 40.980293 | 40.946948 | 39.779893 | 47.755 |
| Message tasks + black background, PPC block profiler on | 30.003385 | 37.562428 | 37.562428 | 37.029155 | 49.895 |
| Idle wait + black background, profiler off | 29.979740 | 51.301312 | 51.267956 | 48.432708 | 40.075 |
| Message tasks + black + fast memory checks | 29.995035 | 51.041781 | 51.041781 | 48.341334 | 39.165 |
| Message tasks + black + block merge | 29.981145 | 51.565742 | 51.599097 | 48.930753 | 38.860 |
| Same block-merge session, warm repeat | 29.991160 | 56.283251 | 56.216565 | 53.215681 | 35.980 |
| Lean swap, black background | 29.985110 | 46.423041 | 46.456391 | 45.922793 | 38.170 |
| Lean swap, warm repeat | 29.980480 | 52.867733 | 52.834378 | 50.733010 | 35.940 |

All samples had 960×720 source resolution and nonblack fraction 1. Profiling has
significant overhead; do not compare these instrumented rates with normal-speed
acceptance runs as if instrumentation were free.

The original profiled run spent 24,999.227 ms in GL presentation for 722 frames
(mean 34.625 ms). CPU/GPU synchronization occupied 11,117.557 ms. The background
run still spent 25,351.906 ms in GL presentation for 769 frames (32.967 ms each).
The scratch-buffer trial spent 25,531.935 ms for 666 frames (38.336 ms each).
Scopes overlap across threads. These results prioritize GPU presentation and
readback work over more cosmetic deletion. The scratch trial is not promoted.

## Draw-only background experiment

`scripts/engine/melee-background.js` walks the native stage object list, validates
object ownership and classifier, and redirects only ordinary stage render
callbacks whose Ground render-category bits equal 2. The target is an existing
USA 1.02 empty function whose opcode is checked. No executable code is patched.
Stage update callbacks, RNG, animation, collision, fighters, items and HUD remain
running. The original callback is restored on toggle-off. Three focused tests
cover exact mutation plans, restoration, foreign callbacks, malformed lists,
cycles and unsupported code. Battlefield visibly retained platforms, fighters,
HUD and effects against the simplified black backdrop. Other stages and gameplay
equivalence have not yet been validated for this mode; it remains an experiment.

## Readback experiment

`scripts/browser/patch-readback-transfer.mjs` makes a checked post-link change to
the Emscripten WebGL import. Only tightly packed 960×720 RGBA8 CPU reads use one
reusable ordinary ArrayBuffer. PBO offsets, other formats and nondefault packing
keep the original call. Tests cover byte guards, buffer reuse, packing fallback,
exceptions and rejecting unfamiliar generated glue. It did not improve measured
performance and must not become a default on the current evidence.

A pipelined-PBO run was invalidated by the local server exiting before the
benchmark module loaded. It produced no valid performance result. A detached
Node server is now used on port 3218 (PID recorded in ignored `.perf-lab/server.pid`).

The subsequent valid PBO run took 25,142.872 ms in GL presentation for 667 frames
(37.695 ms/frame). It also failed to improve throughput.

## GPU worker scheduling experiment

The bitmap run (`oglsab=0&blit=bitmap`) reduced GL presentation to 13,337.642 ms
for 1,140 frames (11.700 ms/frame), and CPU/GPU synchronization to 841.977 ms.
CPU execution occupied 23,184.311 ms of the 29,989.540 ms sample. Scopes overlap.
Device-wide GPU allocation rose from 2.255 GB to 8.063 GB over 45 seconds and
peaked at 15.375 GB before the trial was stopped by navigating the test tab to
an idle page. It fell after navigation. Other apps were running; these are
device totals, not per-process attribution. The path is not viable as measured.

`gpu-task-yield.patch` tests returning to the browser event loop between bounded
GPU work batches, allowing canvas resources to retire. It is opt-in through
disable-mask bit 29 (`disable=0x20000000`) and leaves ordinary/native loops intact.
The actual BlockingLoop header passes a native harness with a stub timer API,
covering wakeup, an eight-iteration bound, concurrent Wait, and shutdown. Initial
browser measurements follow below; full lifecycle and gameplay equivalence
validation remain pending. Build directories are `build/perf-yield` and
`build/perf-yield-output` inside the isolated engine.

The first compiled core is
`dd11fdecf06bcae575bd71b3efb95fdb32a6489fb749e702efca39a56a5cd0f3`.
Its unprofiled timer-yield test improved to 46.958 simulation FPS and 45.291
distinct visible FPS, still below target. During the first 115 seconds, GPU
allocation ranged from 1.736 to 1.819 GB, ending at 1.747 GB (54 MB below start).
The previous multi-gigabyte growth was absent over that interval. This is a
short trial, not a long-session memory certification. The test tab navigated
away after the interval; later monitor samples no longer represent that run.

`patch-gpu-task-scheduling.mjs` tests MessageChannel tasks instead of nested
zero-delay timers, avoiding their minimum delay while still returning to JS.
It modifies only the zero-interval timer-loop import in this candidate's glue.
A focused test verifies asynchronous scheduling, keepalive balance, stop/unwind
cleanup and preserving nonzero timers. It remains a local post-link experiment;
the WASM identifier alone does not identify the modified JS glue.

Message tasks improved the original-background run to 48.932 simulation FPS;
black background improved it further to 53.808 simulation / 50.775 visible FPS.
Device-wide allocation ranged from 1.745 to 1.777 GB over the first 160 seconds,
which include the subsequent simplified-background run and a reload for profiling.
No unbounded growth appeared in this short sequence.

The core-profile run spent 23,328.104 ms in CPU execution (77.8% of wall time),
4,341.283 ms in CPU advancement, 771.087 ms synchronizing the GPU, and
10,263.352 ms presenting 1,227 images. These scopes overlap. The separate PPC
block profiler disables compact block dispatch by design and is not an
acceptance run. Its steady-match window sampled 473,654 blocks; the largest
individual PC accounted for only 1,140 of 154,484 sampled microseconds. This
does not reveal a single dominant guest routine to replace safely.

The idle-wait variant used BlockingLoop's existing wakeup event, with each wait
capped at 1 ms. Core `2f38f3e49af2522e50233b981c20cdca9b3183868df01409d09fdb499cfc6725`
measured slightly worse and the source change was reverted. The separate
`fastmemhoist=1` trial also did not establish an improvement. `blockmerge=1`
measured 51.566 simulation FPS initially and 56.283 on a warm repeat. The repeat
shows why a fresh-session comparison cannot be conflated with a warm-session
result; it does not establish a block-merge benefit or satisfy 60 FPS.

## Presentation diagnostics experiment

`lean-swap.patch` is opt-in through mask bit 30. On the GPU bitmap path it
retains the first `glGetError` sample, preserves polling in diagnostic/profiler
runs, and marks later cached samples with debug bit 9. It also omits a duplicate
flush: the normal `glFlush` still runs before the host counter/signal update.
WebGL error queries can cause synchronous stalls, as documented in
[MDN WebGL best practices](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices).
The hypothesis is that per-frame diagnostic polling contributes to the measured
presentation cost. This build is not yet measured. A cached error value must
not be described as an error check on every frame.

## Browser hosting requirement

The user confirmed browser-local execution with Vercel hosting and low latency.
A separate GPU streaming server does not satisfy this request. The current
experiments preserve immediate presentation and normal CPU clock/speed.

## Idle guard hoisting experiment

`idle-batch-checks.patch` gates a CPU optimization behind bit 31. It checks
unchanged SDK status/input RAM once per existing bounded idle-loop batch, only
with deterministic GPU operation and the static idle status pointer. It retains
cycle accounting, exception guards, the downcount boundary, fallback cadence and
all original checks on the first iteration. A counter records skipped redundant
iterations. `idlecheckcompare=1&timelineprobe=1&inputprobe=1` compares the baseline
against optimized delayed-input correction using full CPU/GPU snapshots and
requires the optimization counter to increase. Validation is pending.

Idle-check core `b3ef391da8c75a3693d90e6c343c79988252c960e4e3b7d20ece445de9b5bc95` passed the 40-frame differential: all 113,691,380 state bytes matched after 15 rollbacks / 63 replayed frames, with 2,260,092 hoisted iterations. This is limited correctness evidence, not roster/stage certification. CPU-9 performance failed: 29.987955 s, 49.719963 simulation/render, 47.285652 visible FPS, p95 40.755 ms; warm repeat 29.997 s, 48.404840 simulation / 48.371504 render / 45.904590 visible, p95 40.825 ms. Both 960×720, nonblack 1. No speed improvement established.

`gpu-task-notify.patch` exposes the async GPU loop state address and notifies it when new work arrives. The message scheduler can park with Atomics.waitAsync when idle, then post a browser task after wakeup. A 100 ms maintenance timeout retains periodic work; browsers without waitAsync keep task scheduling. Race and runtime-lifetime tests pass; browser measurements pending.

Notification core `d3e0f1f5ceafbbbb011e9e744f4e023581b18f97a497da4ac85bfb74b38f6773`, block merge on / idle hoist off / black background: delivery-only run 30.004385 s, simulation 47.193102 / delivery 47.159773 / RAF 59.857917 / changed presentation ticks 43.726942 FPS. This excludes pixel sampling and still misses target. Subsequent visual run 29.969400 s: simulation/render 50.785134, canvas submissions 50.718399, distinct visible 48.482786, sample callbacks 58.626466 FPS; p95 gap 38.670 ms, max 82.480 ms, 960×720, nonblack 1. No performance benefit established for notification scheduling.

## Active-dispatch CPU sampling (2026-09-11 evening)

Core `cf41910bf518fb1705fa446acdba798d3f2dc09f4727e2d09d01679c9eaa67ef`,
black Battlefield, Fox vs CPU9 Falco, 960×720, bitmap / GPU task notification,
bit29 on, CPU clock and emulation speed 1, core profiler on, PPC profiler off.
The browser/server session had restarted; do not compare this to earlier runs as
an A/B result. 29.9823 seconds: simulation/render 34.5204 FPS, distinct visible
34.3536 FPS, p95 gap 47.56 ms, nonblack fraction 1. Failed target.

Inclusive CPU execution 22,695.001 ms (75.69% wall); CPU advance 4,993.092 ms;
CPU GPU synchronization 379.688 ms; CPU GPU decode 1,827.776 ms. GL present
4,085.479 ms over 1,035 frames. Threads/scopes overlap.

New sampled categories preserve compact WASM dispatch (diagnostics subsequently
reported 71,205,264 dispatcher calls). Per-1024 category sample counts: chain
24,285; partial 226; other callbacks 45,734; idle 468; FP helper 1,329; memory
helper 26,175; system helper 221; interpreter helper 0. These imply roughly
26.8 million memory-helper calls in the interval. **Do not use multiplied sample
microseconds as an additive time breakdown:** short scopes, clock overhead,
quantization, and periodic sampling bias cause impossible extrapolated totals.
Further counters split integer reads/writes/FIFO candidates from floating memory.
No helper-specific speedup is established.

Added opt-in `benchmarkrepeats=N` (2–8) QA mode. Captures a full checkpoint,
restores it for each run, settles 120 emulated frames, excludes one warmup run,
then requires all measured runs to pass the original strict image/speed gates.
Each run gets its own core-profile delta. Native tests verify sampler cadence;
benchmark tests verify warmup exclusion, per-run acceptance and error cleanup.
Browser repeated-run execution remains to be verified.

The preceding notification candidate passed the functional six-stage traversal
(300+ frames each, source 960×720, 4 stocks, 8 minutes, no items). This does not
certify stage performance, all character combinations or Stadium transformations.
An original-background Dream Land benchmark measured 52.0452 simulation,
51.9785 render and 48.5111 distinct visible FPS over 29.99316 seconds, p95 38.23
ms; failed. A suspected zoom/occlusion issue remains unresolved: screenshots
were not taken at identical paused frames. All-fighter validation remains pending.

### Integer graphics FIFO attribution and candidate

Split-counter core `1b0e5fd8f6670366304641a2a2b1cb143b7426cf97648ae7b98b2ea7efd3d5dd`:
843 rendered frames in 29.984055 s, core profiler on. A separate core link was
running during this diagnostic; **FPS is not a controlled performance result**.
Sample counts (every 1024 calls): integer reads 88; integer writes 21,242;
FIFO-address integer writes 21,191; float-memory 1. Thus approximately 99.76%
of integer write helpers target FIFO addresses, about 25,741 calls/rendered frame.
The CPU execution fraction was 78.19%, but do not extrapolate tiny helper timings.

Implemented optional bit16 integer-FIFO code generation. Only canonical
0xcc008000 stores qualify; compile-time `IsOptimizableGatherPipeWrite` verifies
BAT mapping and absence of memory checks. DBAT changes call ClearSafe; runtime
checks require address equality, DR on and little-endian off. 8/16/32-bit stores
emit swapped bytes directly to the gather buffer and check for a 32-byte burst
after every store, matching the original integer helper. Other addresses and
modes keep the original fallback. Unlike the preexisting floating FIFO path,
this candidate does not defer integer bursts to a larger threshold.

The emitter test compiles extracted actual C++ emitters, executes their generated
WASM, and checks widths, byte order, burst boundaries, feature/mapping/MSR/address
fallbacks, and ordinary RAM stores. Passed. Full-machine equivalence and browser
performance remain pending. `BrowserRollbackConfigureCodegen` now accepts bit2
for integer FIFO and clears generated code whenever its setting changes.

Integer-FIFO core `20188f90effeeba149e29b2199364034385dc2199218ac02ef1b69986dcf74f5`
passed a 40-frame full-machine codegen differential on Battlefield, Fox/Falco,
2 human ports, black background, profiler off. Reference integer FIFO off,
corrected replay on; regcache and fastmem-hoist off in both halves. All
113,691,380 bytes equal, including FIFO, CPU, RAM and GPU sections. 15 rollbacks,
63 resimulated frames, 64 skipped video frames and 84,456 suppressed audio samples.
This establishes equivalence for the tested input sequence, not all-match coverage.

Unprofiled integer-FIFO repeated-checkpoint test (same core, bit16+29, default
regcache, no fastmem-hoist, black Battlefield, human/CPU9): warmup 38.1891
simulation / 37.2885 visible FPS. Measured runs: 38.5010 / 37.4677, 40.2412 /
37.4740, 41.0693 / 39.0358. Each ~30 seconds, 960×720, nonblack 1, p95 image
gaps 42.665, 45.215, 44.75 ms. All failed. Do not compare these directly against
earlier session results or claim a FIFO speedup. A same-core, same-checkpoint
FIFO off/on/on/off comparison with a separate warmup before every measurement
is now running. The helper preserves original regcache/fastmem flags and restores
all codegen flags on exit; orchestration tests verify one capture and eight restores.

FIFO A/B/B/A completed, same core and full checkpoint, a 30-second warmup before
each 30-second measured trial. FIFO off: simulation 39.5934, 40.5450; visible
38.0257, 38.8445. FIFO on: simulation 42.6921, 43.3312; visible 40.4574, 41.0963.
Mean simulation improved 40.0692→43.0116 (~7.34%); visible 38.4351→40.7768
(~6.09%). The reverse order supports a modest gain in this workload; it is not
720p60, nor a universal gain across all characters/stages. Keep as an opt-in
candidate pending broader checks.

Next candidate: bit18 permits compilation of one-instruction PPC prefixes
(previous minimum two). Existing diagnostics rejected 2,071 one-instruction
blocks; their runtime weight is not yet established. Added separate sampled
counts for branch callbacks, block-end callbacks and guest-interpreter callbacks
to test whether those are frequent exits from the optimized chain. All existing
instruction eligibility, exception checks and block bookkeeping remain intact.
Codegen comparison now accepts bit3 for single-prefix and clears old code on
change. Generalized the same-checkpoint ABBA helper to compare either FIFO or
single-prefix while preserving the other setting. Tests passed; browser build,
profile attribution and full-state validation pending.

Post-FIFO profile, core `5845295fa8e95050d490a43a5ff0ca1892da0d98372d9d2a0b42bc9ab5894e4b`,
bit16+29, single-prefix OFF, black Battlefield / CPU9, 897 rendered frames:
CPU execution 23,206.467 ms (77.39% wall), advance 4,681.331 ms, GPU sync
447.443 ms. Diagnostic-only profiled rate 29.9143 simulation / 29.7476 visible.
Estimated calls from sample counts: FIFO write fallback 0 (fewer than 1,024
calls possible); all integer write fallback 56,320; integer reads 96,256.
The previous ~25,700 FIFO helper calls/frame have therefore been eliminated.
Branch callbacks 19,937,280; block-end callbacks 19,978,240; other callbacks
303,104; guest interpret 16,384. Branch/end account for >99% of this non-idle
fallback callback traffic (~44,499 combined calls per rendered frame). This is
strong call-volume evidence for testing one-instruction branch compilation;
raw sampled times still must not be extrapolated into precise cost fractions.

Measurement-host note: after navigating our test tab to about:blank, independent
/proc samples found two other Codex renderer processes (5246,5355) using 222 and
231 CPU ticks respectively over 2 seconds, plus GPU process 3028 using 183.
No processes belonging to other tasks were stopped. Asked the user whether other
Melee sessions are running. Their identity and effect on FPS remain unconfirmed.

### Longer correctness gate caught a candidate divergence

General single-prefix + integer FIFO, core 5845295f, 120-frame codegen differential:
**FAILED full-machine equality.** Reference and corrected frame 424; fighters'
positions, stocks and actions identical, but GPU PixelEngine differed in 10,422
bytes, TextureCache 1, CoreTiming 13, RAM 633, DVDInterface 3 and CPU registers 7.
Both snapshots 113,790,910 bytes. 48 rollbacks / 199 resimulated frames. Do not
accept this combination or waive timing/RAM differences on the basis of matching
fighter positions. First CPU register difference is at serialized offset 212
(the downcount field), and first RAM difference lies near HSD performance data;
these observations do not establish the cause.

A separate unchanged-baseline 120-frame timeline test (regcache off, FIFO off,
single-prefix off) **PASSED all full-machine bytes**. FIFO-only 120-frame
isolation is pending. Added per-step emulated ticks/PC and a latest-corrected-frame
tick-difference summary to the replay probe for localization; no acceptance gate
was weakened. A narrowed bit18 candidate now permits only single-instruction,
non-link branch blocks (not arbitrary one-instruction memory/system/FP blocks or
linking calls). Building and validation pending.

FIFO-only 120-frame codegen differential on 5845295f **PASSED** full-machine
byte equality and every compared emulated tick (`tickDifferences: []`), with
regcache/fastmem-hoist off in both halves and single-prefix off. This isolates
the earlier 120-frame failure to the general single-prefix change or its
interaction with FIFO, rather than FIFO alone. Restricted non-link-branch core
`7c58b14ac4cd10c3e3eb1ee632f25726f0e9a524241bb62df29a72f06addb351`
is built; its correctness/performance are not yet established.

Restricted non-link branch + FIFO core 7c58b14a **PASSED** the 120-frame
codegen differential: all full-machine bytes equal and `tickDifferences: []`.
Reference regcache/fastmem/FIFO/single-prefix off; candidate regcache/fastmem off,
FIFO and restricted single-prefix on. This narrower candidate preserves the
checked sequence where general single-prefix failed. Its performance A/B/B/A
now holds FIFO on and default regcache on while toggling only bit18.

Restricted non-link prefix performance A/B/B/A finished: measured simulation
40.92865, 43.39634, 43.10425, 45.92968 FPS (off/on/on/off), visible
39.92795, 41.39497, 41.30268, 43.82832. Mean off simulation 43.4292 vs on
43.2503; visible 41.8781 vs 41.3488. **No established performance gain.**
Reverse order demonstrates why first-run gains cannot be accepted alone.

Next candidate 79cd29c6 permits single-instruction ordinary branches including
linking calls, but excludes the OS interrupt and all five specialized Melee
polling/status helper targets. The C++ cached interpreter has special SI/input
poll paths absent from the WASM branch emitter; replacing those is a plausible
source of timing divergence, not yet a proven root cause. Full-state validation
must pass before performance testing. This feature remains opt-in bit18.

Added epoch measurement boundaries to gameplay QA for alignment with an optional
read-only /proc thread CPU sampler. Scheduler delay is unavailable if Linux
schedstats is disabled; zero cannot be interpreted as no scheduling contention.

Ordinary branch core 79cd29c6 + FIFO **PASSED** 120-frame differential: all
113,790,910 full-machine bytes equal; every compared tick equal; 48 rollbacks,
199 resimulated frames. Performance A/B/B/A underway with FIFO held on.

### Product requirement: no player-supplied ISO

User reaffirmed that normal play must ship entirely in-browser and must not ask
players to supply an ISO. The source package used for this lab already supports
hosted compressed game chunks through `/game/manifest.json`, automatic boot, and
first-interaction audio. The lab deliberately removed `dataset.hostedGame` from
its private bootstrap to use the local fixture during repeated experiments.
Restore that existing hosted loader for the final package; a file picker is not
an acceptable final user flow. Keep game data out of Git. This requirement does
not change browser-local execution or authorize claiming 720p60 before it passes.

Ordinary branch A/B/B/A (FIFO on): measured sim off/on/on/off
46.000751, 47.959473, 51.595586, 50.019766; visible 41.434010, 42.926894,
44.958533, 44.117434. Both adjacent pairs favor enabled, mean simulation
48.01026 → 49.77753 (+3.68%), visible 42.77572 → 43.94271 (+2.73%).
Host/warm-up drift remains material; this is a modest measured gain, not 60 FPS.
All measured source frames 960x720, all runs fail target.

OS thread sampler during first warmup: our renderer PID20044 worker21919 used
28.939 CPU seconds /29.794 wall seconds (~97.1% of a core), reinforcing
a CPU execution bottleneck independently of per-callback profiling. Other
renderer workers were active; schedstats disabled so scheduler delay unavailable.

Post-ordinary-branch profile 79cd29c6: 29.98112 seconds, 940 rendered frames;
CPU execute 23,104.332 ms (77.06%), advance 4,700.939 ms, GPU sync415.420 ms.
Estimated fallback branch calls309,248 and end349,184, vs roughly20 million each
previously. The targeted callback traffic was largely removed, but most CPU
execution cost remains inside compiled chains. FP helpercalls1,229,824; memory
reads101,376/writes58,368; FIFO0 samples. Profiled FPS31.39sim/30.72visible is
not comparable with unprofiled acceptance.

User camera report exposed a lab regression: rebuilt candidates omitted the
existing webgl-depth-loader correction used by the separate release tooling.
Current C++ swaps descending viewport depth range for WebGL legality without
reversing comparisons/clear values. Restoring the existing fail-closed JS
compatibility bridge (including clear-shader clip-depth conversion) to every
lab install. Its four tests pass. This changes GPU visibility, not guest camera
values; visual validation and fresh performance measurements remain required.

Corrected-depth core79cd29c6 unprofiled fresh BF run:43.45906sim/render,39.42334visible,29.98224sec,960x720,p95gap43.675ms,failed. Camera diagnostic mode0,fov30,pitchOffset0,yawOffset0. Screenshot shows proper stage/fighter occlusion after restoring depth correction. No guest camera writes added.

Asynchronous PC sample:1155 observations across30.01868sec,935 distinctPCs. TopPC PSMTXConcat80342204 had22samples(1.90%); sample regions are spread across HSD model/material/render setup,GX,matrices and animation. No single dominant guest routine. This is wall residency of last committed PC, not exact instruction/CPU cost. Added opt-in bit19 FPR caching with eager raw-i64 lane locals, sticky dirty flags, common helper flush/reload, no changed math. Emitter test preserves NaN payloads/conditional state/helper reload; performance and full replay still pending.

FPR first candidate3c440b9c FAILED startup/scene transition and showed corrupted menu output; not accepted. Found missing lfd/stfd 32-bit aliases into paired-single register lanes. Added word loads/stores through the same raw-i64 cache, preserving the untouched half and using dedicated scratch. Extended actual-emitter test covers dirty 64-bit to two-word aliases and passes. Rebuilding before full-state validation.

Corrected FPR cache core610a78c0 **PASSED** 120-frame differential: all113,790,910
machine bytes equal, tickDifferences empty,48 rollbacks/199 resimulated frames.
Reference regcache/fastmem/FIFO/prefix/FPR off; candidate regcache/fastmem off,
FIFO/ordinaryprefix/FPR on. Fourteen emitter/benchmark tests pass. Starting
controlled FPR-only A/B/B/A with FIFO+ordinaryprefix and default GPR caching on.
Private lab now uses port3237 persistently with no-store source responses;
automatic hosted-game OPFS cache persists across iterations. No picker opt-out.

Integer-typed FPR cache610a78c0 performance FAILED ROI: measured A/B/B/A sim49.00253,46.37351,51.20584,55.27811;visible43.34711,41.17275,45.27183,47.20977. Both pairs favor OFF. Preserve bit19 off. Preparing f64-typed cache revision (same bit-preserving tests pass) separately from fractional EFB150% control; both remain opt-in. Next render comparison holds FPR off.

Fractional-EFB candidate: retains default2x until paused QA explicitly requests
150%. GetEFBScale returns float; coordinate/dimension conversion multiplies
before rounding, and the special web setting150 maps to1.5. Actual C++ sizing
test verifies full960x792 EFB and960x720 active rectangle; scales1/2/3 unchanged.
Private BrowserRenderScalePercent accepts only150/200 (0 reads), requires paused
OGL for mutation, and uses Dolphin's existing configuration-change recreation.
A/B/B/A restores one guest checkpoint, holds CPU flags constant, settles120frames,
and checks actual EFB width/height each run. Full-state/visual/performance browser
validation remains pending. Typed-FPR refinement is compiled separately behind
bit19 and stays off for this rendering experiment.

### September 12 evening: completed render-scale comparison after restart

The previous browser/server session had ended; its partial scale comparison is
not combined with this fresh run. Restarted the private localhost server and
automatic hosted-game startup without a player file picker. Core
`2aaff4b8fdbe7ad76fabaf8724da6b79b13353a31d7413c6692f4c0210a9528f`, corrected WebGL depth,
FIFO + ordinary branch optimization on, FPR cache off, black Battlefield,
human versus level 9 CPU, speed and CPU clock both 1. Four focused test files
(FPR emitter, fractional sizing, depth loader, benchmark) passed before this run.

Same full checkpoint, A/B/B/A (200/150/150/200), 120 settling frames and a
30-second warmup before each 30-second measurement:

| Internal scale | Simulation FPS | Distinct visible FPS | Canvas submissions FPS | p95 visible gap |
| --- | ---: | ---: | ---: | ---: |
| 200% | 57.59917 | 53.06591 | 57.56584 | 34.425 ms |
| 150% | 59.60102 | 56.09900 | 59.60102 | 32.455 ms |
| 150% | 58.10355 | 52.60322 | 58.07022 | 34.630 ms |
| 200% | 60.01389 | 50.51169 | 59.98055 | 34.880 ms |

All output images were 960x720 and all samples nonblack. Actual full EFB
dimensions were 1280x1056 at 200%, 960x792 at 150%. **Every run failed the
strict 720p60 gate.** The helper restored 200% afterward.

Mean simulation 58.80653 -> 58.85229 (+0.08%, no established CPU gain).
Mean distinct visible 51.78880 -> 54.35111 (+4.95%); both adjacent visible
comparisons favor 150%, but the second 150% sample regressed from the first.
This is a measured presentation improvement, not sustained 60 or proof of GPU
saturation. The 43.75% framebuffer pixel reduction did not deliver a
commensurate simulation improvement. Fixed-150% full replay and roster/stage
coverage are still pending; 150% is not yet the normal startup default.

The last baseline produced 60.01389 simulation /59.98055 render and canvas
submissions, yet only50.51169 distinct visible FPS. Image sampling callbacks
were59.94721 FPS. This establishes a gap after production/submission that CPU
mean throughput alone cannot explain; it does not locate physical scanout,
prove dropped messages, or exclude synchronous image-probe overhead.
The next diagnostic should time GPU bitmap production, forwarding-worker
receipt, and main-thread canvas transfer, then compare image inspection against
delivery-only measurements from the same checkpoint. Delivery-only remains
diagnostic and must never satisfy the visible-image acceptance gate.
The existing bitmap path forwards GPU pthread -> disc worker -> main thread.
A direct port or revised pacing is a hypothesis to test only after attribution.

The revised f64-local FPR cache is built and passes emitter tests; full-machine
120-frame differential and controlled FPS comparison remain pending. The old
i64-local cache remains rejected for slowing both A/B pairs. Previous FIFO
and ordinary branch gains remain validated separately, not percentages to add
onto this newer baseline. All-character/all-stage sustained performance,
long-run stability and measured input-to-photon latency are still unproven.

Selected scalar results: [render-scale result](benchmarks/browser-2026-09-12-scale-abba.json).

Typed-f64 FPR candidate2aaff4b8 PASSED120-frame full-machine differential: all113,790,910bytes equal, tickDifferences empty,48rollbacks199resimulated frames. Controlled off/on/on/off measured sim48.55636,37.73506,55.59704,50.93567;visible44.15427,36.23499,50.00069,45.43542. First pair regressed; reverse pair improved. Means do not establish a repeatable gain; strong variation/warm-up effects remain unresolved. Keep FPR off. Optional per-bitmap stage timing and same-checkpoint image/delivery probe comparison added;18focused tests pass. Diagnostics cannot pass the visible-image acceptance gate. Private installer now always restores depth correction and refuses to stop a PID belonging to another process.

Optional frame timing found bitmap export roughly0.02ms and export-to-canvas0.33-0.35ms in delivery-only runs; no sequence gaps. Synchronous32x24 image readback averaged5.1-6.4ms, raising main-thread receipt delays. Image/delivery/delivery/image measured sim48.03641,58.73455,58.98658,59.13644. Last image run was not slower in simulation than delivery, so do not assign the entire initial CPU gap to readback. Delivery changed ticks55.94/56.02FPS still showed jitter.

Implemented optional WebGL2 PBO/fence image inspection. Samples retain capture timestamps; end simulation counters are read before GPU draining; no sample may be dropped. Synthetic browser oracle PASSED133samples each for black/static/30fps/60fps/post-capture-source-mutation, with zero pixel/hash mismatches. Rates0,0,30.00177,60.00027,60.01296 respectively. Actual Melee sync/async/async/sync same-checkpoint measured sim52.70322,60.00274,60.00215,60.00113; visible50.93645,57.36929,58.56877,53.56768. Async enqueue0.07783/0.07301ms mean; harvest0.35051/0.23665ms; p95imagegap17.93/17.29ms. All960x720/nonblack1. Timing-enabled diagnostic, still below visible59.5FPS. Measurements do not claim physical scanout or input-to-photon.

Prepared bounded two-image RAF pacing comparison with queue-age/drop/underrun telemetry and unchanged visible-image gate. Prepared compact FPR locals: only referenced paired lanes, zero extra locals for integer-only blocks. Actual emitted-WASM alias/NaN/helper tests pass; no native rebuild yet, so neither affects results above.

Bitmap-renderer verification also PASSED30fps/60fps/post-capture-mutation fixtures: zero mismatched hashes, rates29.99277/59.99400/59.98868FPS,133captures each. First bounded two-image pacing A/B/B/A (async image probe, timing instrumentation OFF) measured immediate/RAF/RAF/immediate sim59.80277,59.97003,59.96728,60.00333;visible57.46933,59.23707,59.33394,57.60320;all strict gatesFAILED. RAF p95gaps17.325/17.330ms;queue drops20/18,underrun events9/7;mean queue age21.230/18.844ms,max53.650/60.925ms. This improves cadence but is not720p60. New experiment retains priming after underrun, advancing deadlines while empty and resuming the first arriving real frame without waiting for a second. Capacity remains2;3queue tests pass.

Revised queue recovery A/B/B/A **passed the two measured buffered runs only**: immediate/RAF/RAF/immediate simulation60.03449,60.00237,60.00295,60.00376; distinct visible57.56778,59.63569,59.70294,58.00363FPS. Every run actual960x720, nonblack1, speed/CPUclock1. Queue means21.424/19.946ms, drops8/6, underruns8/5, p95visible gaps17.375/17.300ms, max42.850/51.650ms. Capacity2; no duplicated/interpolated frames, no changed threshold. This is a narrow Battlefield idle-human Fox vs CPU9 Falco result, not tournament-wide completion or input-to-photon evidence. Longer Ice Climbers mirror on Fountain is the next coverage test. Selected scalars: [pacing recovery A/B/B/A](benchmarks/browser-2026-09-12-pacing-recovery-abba.json).

Two-minute Ice Climbers mirror on Fountain crossed a match ending/scene transition: ending scene counter was171frames below the starting counter. Result is INVALID for simulation/cadence attribution, not evidence of a36.6FPS gameplay baseline. Keeping the failure; added explicit validGameplay/invalidReason fields. Prepared opt-in benchmarkinput=stress using normal P1 controller states, with cleanup in finally; no gameplay/rules/camera patches. CPU compact-FPR candidate is building.

Compact-FPR core a854a47c PASSED120-frame full-machine comparison:113,790,910bytes equal,tickDifferences empty,48rollbacks/199resimulatedframes. First fixture attempt lacked inputprobe=1 and was correctly rejected for CPU ports; corrected fixture passed. Current speed experiment is FPR off/on/on/off in an Ice Climbers mirror on Fountain, baseline reflection on, async image probe and bounded RAF presentation. Separately prepared guarded Fountain reflection-only callback/texture toggle: verified from grizumi.c grIzumi_801CCEA0 and lbspdisplay.c, runs extra scene rendering into80x60RGB565. No measured gain or gameplay equivalence claim yet.

Compact-FPR Fountain/IC mirror A/B/B/A completed: OFF35.93460,ON35.03442,ON36.16763,OFF38.40154FPS; simulation and visible match in all four measurements. All valid same-match30sec runs at960x720, buffered presentation, zero queue drops; the producer is too slow. Mean37.16807OFF versus35.60103ON (~4.22% regression); both adjacent pairs favor OFF. Reject enabling FPR. Selected scalars in benchmarks/browser-2026-09-12-compact-fpr-fountain.json. Reflection callback selector, comparison cleanup, and gameplay-observable replay tests passed before private installation (24focused tests overall).

Fountain reflection-only experiment PASSED600-frame identical-input gameplay-observable replay: fighter positions/actions/stocks/damage, match timers/settings, RNG seed, both moving platforms and full native camera diagnostic matched. Graphics/full-machine equivalence is not claimed. A/B/B/A reflectionON/OFF/OFF/ON measured sim38.09850,50.60068,51.96418,39.16577;visible38.06517,50.50068,51.86419,39.06577. Mean simulation38.63213→51.28243 (+32.75%), both adjacent pairs favor OFF. All real960x720,valid same-match30sec,normal speed. Every run stillFAILED720p60. Retain opt-in reflection=off; further all-character/long-run validation pending. QA overlay obscured the lower stage in initial screenshot, so added a QA visibility button for full framing inspection. Next experiment targets only Fountain decorative map objects0/1 outside category2, preserving map3 main stage and map4 moving platforms; not yet visually validated or measured.

Fountain scenery0/1 selector passed600-frame player-slot/RNG/platform/native-camera probe comparison. Unobstructed screenshot with scenery+reflection off preserves grass floor edge, ledges, platforms, fighters and HUD; distant trees/backdrop removed. A/B/B/A sceneryON/OFF/OFF/ON with reflectionOFF:sim51.03612,56.60150,56.99981,51.93654;visible50.96945,56.46816,56.86648,51.90320. Mean51.48633→56.80065 (+10.32%). All runs stillFAILED strict gate. Extending gameplay validation to every fighter GObj, including both Nanas: previous probes covered the two player slots. Prepared optional efbscale=150 startup application and GPR-cache-only A/B using existing native controls; neither has a new measured result yet.

Both expanded Fountain cosmetic replay comparisons PASSED600frames with all four fighter GObjs (both Popos and Nanas), motion/action/damage, RNG, moving platforms and native camera. Full-machine graphics equivalence is not claimed. Reflection and scenery tested separately with the other cosmetic disabled.

Render-scale comparison on core a854 was interrupted by severe image-readback stalls. Initial200% warmup sim54.70252/visible54.60251FPS; measurement sim10.50169/visible10.27892, harvest max2992.83ms and callback11.23362FPS. Next150% warmup sim0.67654/visible0.52947, harvest mean1042.07ms,max1991.845ms; image gaps approached6seconds. Aborted by page reload; not a valid scale ROI comparison. Host diagnostics found ~86GB available RAM, zero CPU/memory pressure, GPUbusy1%,~0.92GB of4GB VRAM used, no matching recent kernel GPU reset/timeout logs. This does not establish root cause; browser/GPU scheduling/occlusion remains possible.

Actual emitted-WASM scalar-alias test reproduced ps_muls0 FD==FC bug: lane1=30 instead of15 for FA=(2,3),FC=(5,7). Scalar was reloaded after lane0 overwrote FC. Fixed by capturing scalar in existing f64 temporary before either lane write; no new locals. Test/build/replay pending. This is a correctness fix, not an established FPS gain.

Corrected scalar core d516a306 PASSED120-frame delayed-input/codegen replay at fixed150% rendering, Fountain/IC mirror: all109,039,327 machine bytes equal, tickDifferences empty,48rollbacks/199resimulated frames. Reference GPR/FIFO/prefix off vs candidate on; fastmem/FPR off. Both conditions include scalar fix and150%; no native-Dolphin comparison claim. Actual output960x720, unobstructed native framing visually inspected. Prepared QA-only named-function aggregation of existing asynchronous PC samples, performed after measurement; records remain wall-residency estimates.

Clean d516 Fountain scale200/150/150/200 A/B/B/A measured sim51.50269,55.10249,56.60308,57.16625;visible51.40268,55.00248,56.53641,57.13291. All valid30sec,true960x720,nonblack1,allFAILED. Strong upward drift; reverse pair favors200%, so no repeatable scale gain established. Image harvestmean~1.12–1.23ms,max20.345ms; multi-second stall did not recur. A1.5sec host sample showed dominant DedicatedWorker using1.50CPUsec, secondworker0.50,mainthread0.10. Dominant worker lastCPU15 is physicalcore3 fastcore (max5.16GHz), observed~4.2GHz; powersavegovernor unchanged. Thread names alone do not prove host stack attribution, but combined earlier emulatorCPUprofile supports CPUlimit.

Named CPU sample after cosmetic cuts:1506 samples/30.00313sec,all mapped. Top SetupEnvelopeModelMtx48(3.19%),HSD_FObjInterpretAnim46(3.05%),HSD_TExpSetReg29(1.93%),psDispParticles27(1.79%),HandleReverb25(1.66%). Rough name-based groups:matrix138,render/material445,animation143,audio44,other736. These are last-PC wall residency, not exact CPUtime; no dominant singlefunction. Preserve actor animation and gameplay effects. Prepared opt-in compact GPR local allocation across CPU blocks: same eager reads, helper reloads and sticky dirty writes; default layout unchanged. Native build/tests/performance pending. Also repaired QA replay cleanup to restore actual startup CPU flags instead of treating an absent regalloc query as disabled; fresh A/B comparisons explicitly configured their flags and are unaffected.

Existing GPR cache OFF/ON/ON/OFF Fountain comparison (d516,fixed150%,bothcosmeticsOFF):sim49.13537,50.86843,51.56752,50.36845;visible49.03537,50.76843,51.40085,50.23511. Both pairs favorON; mean49.75191→51.21797 (+2.95%). Retain GPR cache. All720p60gatesFAILED. Compact GPR candidate21focusedtestsPASS including actual sparse-local emitted-WASM conditional/helper/scratch cases; building now, defaultOFF.

Compact GPR core233ed07f PASSED120-frame full-machine replay:all109,035,106bytes equal,tickDifferences empty;GPR/FIFO/prefix/compact on vs reference off,fastmem/FPRoff,fixed150%Fountain/IC mirror. OFF/ON/ON/OFF FPS comparison measured sim49.10056,48.79728,50.70203,49.96817;visible49.06722,48.73061,50.63536,49.86817. Adjacentpairs disagree,mean~0.43%not repeatable;keep compactOFF. AllstrictgatesFAILED.

Prepared live two-controller QA path: separate mutex-protected input owner, rollback input keeps precedence, legacy P1 unchanged, no per-update CPU pause. benchmarkinput=two creates two human slots with different normal controller tracks, requiresbothvariedinputs/actions, releasesinputsfinally;NanaAIunchanged.24focusedtestspassed,includingactualC++packetdecoder/ownership andJSbounded-inputcleanup. Building next; no measuredtwo-humanresultyet.

Live-input core7fcee65d PASSED120-frame delayed-input/codegen full-machine replay at150%,FountainICmirror:all109,035,106bytes equal,tickDifferencesempty;retainedGPR/FIFO/prefixON,compact/FPROFF. This validates rollback path after input plumbing changes; live activity is tested next.

Active two-human IC mirror on Fountain, core7fcee, reflection/scenery off, fixed150%: warmup46.00178sim/45.93511visible; measured50.86937/50.90195sim and50.76937/50.83528visible. Both30sec valid960x720/nonblack1, bothplayers exercised, bothFAILED. No causal CPU-AI comparison claimed. Next opt-in SIMD paired arithmetic emits vector lanes with unchanged separate multiply/add and f64-to-f32-to-f64 rounding; NaN results take unchanged scalar fallback. Actual emitted-WASM22,528cases passed including FD aliases, special values and random bit patterns;35 focused emitter/QA/replay tests passed. Native build underway; no performance claim.

Paired SIMD core198908c3 built and loaded through hosted no-ISO startup. 120-frame delayed-input replay PASSED: all108,908,029 full machine bytes including GPU sections identical, tickDifferences[]. Native framing visually checked after replay. Candidate GPR/FIFO/prefix/SIMD on, FPR/compactGPR/fastmem off; reference codegen baseline. First attempt was correctly rejected for CPU opponent slot; reran with inputprobe=1/two human ports. Active two-human Fountain ABBA FPS next.

Arithmetic SIMD198908c3 active-two-player Fountain ABBA off/on/on/off:sim50.43451,52.76721,54.50300,55.63548;visible50.33451,52.60054,54.30299,55.56881. All30sec960x720/nonblack1/valid/exercisedBothPlayers,allFAILED. Mean off53.03499 on53.63510, but reverse pair favorsOFF and upward drift is large; keepOFF. Live input message timing also varies the exact action sequence. Next controlled comparisons use nativeCPU9 before retesting two-active. Prepared independent paired-memory SIMD (exact8byte load/store+endian shuffle+conversion, W/quantized/FIFO/cache paths retained,NaN scalar fallback).16,384 emitted-memory cases and22 focused testsPASS; build underway.

Memory-SIMD28a5899c first120frame replay FAILED: final109,035,106byte states differ only2bytes in CoreTiming atrelative12 (m_idled_cycles); frame21step ticks delta-259, allRAM/register/GPU finalsections equal. Candidate comparison also toggled GPR/FIFO/prefix, so causality unresolved. Added explicit retained-reference codegen option and strengthened replay gate to reject any transient tick difference (13testsPASS). Isolated120frame attempt then stalled at final correction/capture slot5; aborted by tab reload. Read-only1.5sec host sample duringstall showed oneDedicatedWorker1.49CPUsec andanother0.48,rendererRSS~2.30GB. This is an unresolved capture stall, not a performance result. Retrying fresh; memorySIMD remains opt-in/unaccepted. Prepared native low-detail mesh visibility selector: restores original archive-derived table, checksownership/bounds/indices, onlywritesmeshvisibility+livegroup0table+visibilitycache.26focusedlocaltestsPASS; not installed or visually validated yet.

Fresh isolated memory-SIMD retry PASSED120frames:109,039,327 fullmachine bytes equal,tickDifferences[]. Reference andcandidate retainedGPR/FIFO/prefix; onlypsmemsimd changed. Does not explain previous combined-codegen discrepancy or GPUcapturestall. Installed model-detail QA controls (inactive bydefault) and starting CPU9 memory-SIMD ABBA with arithmeticSIMD andmodeldetailOFF.

Memory SIMD CPU9 Fountain ABBA finished: simulation51.53168,54.43594,55.00156,56.23364; visible51.49834,54.36927,54.86822,56.03364. All30sec valid960x720/nonblack1, allFAILED. Opposing pairs and upward drift: keepOFF. Compact result retained from the handoff; full JSON was not saved before the browser session reset.

Native model detail applied to all4 Ice Climbers actors (each23 high-table meshes,20 low-table meshes). 600 identical-input frames PASSED all4 actors, player slots, RNG, moving platforms and native camera. Visually reviewed lower-detail models during replay; competitive silhouettes/HUD remained visible. This is gameplay-observable comparison, not full graphics or native-emulator equality. Starting normal/low/low/normal CPU9 performance comparison on28a5899c.

Native model detail28a5899c CPU9 Fountain normal/low/low/normal measured simulation48.86662,54.23322,56.10067,53.23326; visible48.83328,54.16655,55.96734,53.16660. Both pairs favor low; mean51.04994→55.16694 (+8.06%). Every trial30sec valid960x720/nonblack1 and FAILED60fps/cadence. Retain opt-in for more coverage. Prepared hidden-scenery joint-animation skip for map0/1 only: clone verified Ground_801C1CD0 into checked free0x80003000, skip only HSD_JObjAnimAll, relocate retained material call, preserve counter/callback/callee-save instructions. Three real-disc guard/relocation tests and26related testsPASS. Core build adds paused range-checked guest instruction/JIT invalidation; no live animation result yet.

First animation replay onf7a2a4b6 rejected occupied code-handler area0x80003000 before any writes. Moved candidate to separately checked0x80002f40, after tap-jump flags/seven hooks. No failed-write or gameplay result claimed.

Read-only diagnostic identified occupied0x80002f80=0x2803001f inside second candidate, and verified26zero words at each0x80002c00/2d00/2e00. Selected0x80002c00 with the same per-word guard; no occupied area overwritten.

Low-memory experiment allocation notes: the seven tap-jump stubs occupy0x80002800 through the last stub at0x80002b00, flags start0x80002f00. Live memory also contains existing instructions at0x80002f80;0x80003000 was occupied. The animation clone now exclusively uses0x80002c00–0x80002c67 after verifying every word is zero or its own expected code. Do not infer that all low memory below the original DOL is free.

Hidden joint animation f7a2a4b6 PASSED600 same-input frames with all4 Ice Climbers actors, RNG, moving platforms and native camera unchanged. Corrected guarded code area0x80002c00. Lower-detail models enabled; reflection/scenery off. Visually checked fighters/platforms/HUD and native framing after replay. Started animation on/off/off/on30second timing comparison; no FPS result yet.

Animation ABBA incomplete: normal measured57.50188sim/57.30187visible; first off warmup29.88630sim/29.68639visible with4995.89ms maximum image gap,1002.575ms readback harvest and4993.74ms completion delay. Next off measurement stopped advancing for several minutes at native timer7:53.19. Previous scale/replay experiments also had multi-second readback/restore stalls, so causality unresolved. Keep animation optimization disabled; do not infer a clean speedup or regression.

The animation comparison recovered before reload and finished all8 trials. Measured on/off/off/on simulation57.50188,58.54548,59.23456,58.53195; visible57.30187,58.27891,58.96789,58.36529. Both pairs favor off; mean58.01691→58.89002 (+1.50%). AllstrictgatesFAILED. Initial4.996sec warmup image stall remains; added phase-specific setup/verification timing for future comparisons. Prepared diagnostic-only dynamic-shadow ablation to measure its upper-bound cost; no acceptance result from missing shadows can pass. Not installed yet.

Shadow diagnostic completed onf7a2a4b6. Full/removed/removed/full simulation56.83477,58.33459,58.30461,58.23564; visible56.50143,57.90124,57.90457,57.83563. Mean removal gain1.36%, reverse pair only0.069FPS; keep full shadows. Alltrials diagnostic-only, never acceptance. Native low-model roster smoke PASSED13pairs/all26starts onBattlefield with fixed rules, native action changes and verified table selection (including Nana/Zelda/Sheik objects). No exhaustive move/costume or sustainedFPS claim.

Prepared vector FPR cache plus paired arithmetic/memory SIMD bundle. Actual emitted WASM tests PASS: raw register bits/conditional writes/helper flush/reload,22,528 arithmetic cases and16,384 memory cases.36 comparison/replay/control tests PASS. Browser wiring preserves independent flags and restores settings after errors. Candidate build running; no gameplay or speed result yet.

Vector FPR candidate84a3cf8e built and loaded through hosted startup.120-frame retained-reference replay with vector cache+arithmetic/memory SIMD FAILED:6bytes differ only in GPU TextureCache atrelative5529851 of13537773bytes; allothersections including RAM/registers/timing equal, tickDifferences[],120frames and48rollbacks. Fullstate107,031,991bytes, fourICactors/lowmodels. NoFPS claim. Running unchanged-codegen control before isolating vector-only to distinguish replay/GPU instability from translation divergence.

Vector replay isolation on84a3cf8e: retained-control PASS107,031,991bytes/endframe426; vector-only PASS107,036,212bytes/endframe428; vector+arithmetic SIMD PASS106,904,914bytes/endframe428. All120frames/48rollbacks/199resimulationframes, tickDifferences[]. These are separate starts, not a proof of the first GPU discrepancy cause. TextureConfig serializes three tail-padding bytes; possible source of six-byte mismatch is unproven until mapped. Paired memory remains off. Started CPU9 Fountain vector+arithmetic off/on/on/off timing.

Vector+arithmetic SIMD84a3cf8e CPU9 Fountain ABBA completed: off/on/on/off sim54.70113,54.36844,54.93448,57.33346;visible54.53446,54.23511,54.80114,57.20012. Bothpairs favorOFF; mean56.01729→54.65146 (-2.44%). Keepdisabled. AllstrictgatesFAILED.

RetainedCPU/lowmodels active-two-human Fountain on84a3cf8e: measured53.07169/51.80489sim,53.03835/51.80489visible. Both30sec960x720/nonblack1/valid/exercisedBothPlayers; allFAILED. Inputchanges160/154 and157/154; distinctactions28/31 and28/37. Noqueue drops,209/244underruns; queueage~9.05ms (notinput-to-photon). Inspected unobstructed native framing/fighters/HUD aftermeasurements.

Prepared opt-in paired-memory group guard: onlynon-updatepsq and whitelistedpairedarithmetic/merge sequences, separatebase/GQR/direction groups, checked masked min/maxbyte range; unsupported/base-changingops breakgroups. FastflagrequiresoriginalFPU/endianness/HID2/GQRconditions; miss runs originalper-accessconditions. ActualC++planner/emittedWASM40,000guardcasesPASS inclbounds/wrap/quantization/exceptionmode fallbacks;41otherrelevanttestsPASS. Firsttest harness compile neededmissing u64 alias, corrected. Nativebuild running; no browser correctness/performance claim yet. Allsixstage loading smoke started onpreviouscore duringbuild (notFPSmeasurement).

Allsixstage low-model IC mirror smoke PASSED on84a3cf8e: Battlefield148→451,FD143→449,DreamLand148→450,Yoshi144→450,Fountain146→451,Stadium144→450; each960x720/fixedrules,returnedCSS. Duringcorebuild, so notFPSmeasurement; noStadiumtransformationcoverage. Grouped-memory coreeae95353 built/installed with safe per-worktree server restart and targeted worker/runtime staging. Loading hosted startup for120-frame retained-reference psqhoist-only replay; allSIMD/FPR caches remainOFF.

Grouped paired-memory coreeae95353 PASSED120-frame full-machine retained-reference replay:106,904,914bytes identical,tickDifferences[]. Onlypsqhoist toggled; allSIMD/FPR cachesOFF. Started CPU9 Fountain off/on/on/off timing with lowmodels/fullshadows/normalhiddenanimation.

### Grouped paired-memory checks: replay passed, timing not retained

Coreeae95353 passed120-frame full-state/tick replay (106,904,914 equal bytes). First off/on/on/off timing measured53.40/56.37/56.70/57.37 simulationFPS, with substantial warmup drift. Second ABBA without reloading measured57.73/58.30/57.77/57.80; means57.77→58.03 (+0.46%), opposing pairs again. Every gate failed. Keep psqhoist disabled. Results: `benchmarks/browser-2026-09-13-paired-memory-hoist-fountain.json` and `benchmarks/browser-2026-09-13-paired-memory-hoist-warm-fountain.json`. Lifetime counters are frequency context only, not CPU time shares. Next: refreshed two-active-controller profile.

### Refreshed active CPU profile and wider dispatch-map candidate

Coreeae95353, two scripted human controllers, Fountain IC mirror, lowmodels/reflection+sceneryoff/fullshadows.30.0128s diagnostic: CPUexecute23.729s, advance4.095s, CPU GPU sync9.521ms, GPUdecode1.257s. Inclusive scopes/threads overlap and instrumentation reduces FPS to40.72; not acceptance.1,514 last-PC samples: SelectThread75 (73at8034b164), HSD_FObjInterpretAnim51, SetupEnvelopeModelMtx38. The scheduler loop is already covered by ordinary Dolphin busy-wait skipping; do not treat its residency as wasted spin cost. Profile: `benchmarks/browser-2026-09-13-active-cpu-profile.json`.

Prepared switchable16/20-bit JIT fallback map: one stable4MB allocation, paused clear-before-mask-change, separately compiled correctly masked WASM dispatchers, unchanged PC/flag/invalidation/timing checks, miss-only counters. Prior upstream campaign had+5.4% CPU-only improvement at18bits but no visible gain on its oldWGPU renderer; current OGL active-play test is required.41targeted tests pass, including400k actual inline lookup cases and both emitted dispatcher masks/collision/invalidation/pause/frame/cycle cases. Core43829cb2 built and installed, full120-frame replay next.

Wide-map core43829cb2 PASSED120-frame full machine replay onFountainICmirror:107,036,212equal bytes,tickDifferences[],48rollbacks199resimulatedframes,reference/correctedframe426. Onlywidemap toggled; retainedCPUsettings and lowmodels/fullshadows unchanged. Active two-controller off/on/on/off timing starts next.

Wide-map active-controller ABBA complete: simulation55.996/56.798/58.798/57.764,visible55.863/56.698/58.665/57.698. Both pairs favorwide; mean56.880→57.798(+1.61%). Baseline collisionmisses2,822,622/2,936,122; bothwide0. All30sec960×720/nonblack1/bothplayersactive; allFPSgatesFAILED. Second already-warm ABBA started withoutreload toconfirm. Result: `benchmarks/browser-2026-09-13-wide-map-active-fountain.json`.

Warmed wide-map repeat: simulation59.2666/59.1988/59.4323/59.4993,visible59.1000/59.0322/59.2990/59.2993 off/on/on/off. Mean59.3830→59.3156 (-0.113%), bothpairs slightlyfavorbaseline. Baseline3.064M/3.035Mcollisionmisses,widezero. No repeatable netgain; keepwideOFF. AllgatesFAILED.

Next candidate binds generated state accesses to the emulator instance's stable PowerPCstate address, already analogous to baked MEM1/cache addresses. Module bytes include the address and compilation scope restores even onfailure. Dynamic ABI preserved; no changed guestoperations/math/timing.49targeted checks pass after correcting three stale standalone fixturestubs from earlier cache changes. New binding fixture checks30,000integercases/context restoration/moduleidentity; FPRfixturecovers3baseaddresses/rawNaN/conditional/helper/wordaliases inall3cachemodes. Building before full120-frame replay and isolated timing; no gain claimed.

Fixed-state-address core bc7f6fb0 passed the 120-frame full-machine replay: 107,036,212 identical bytes, no tick differences, 48 rollbacks and 199 resimulation frames. Reference and corrected runs ended at frame 427. Only stateconst toggled; wider map and SIMD remain disabled. Active two-controller ABBA timing follows.

Fixed-state-address first ABBA measured 56.5668/56.3000/58.3337/56.0680 simulation FPS (off/on/on/off), opposing pairs. Warm repeat measured 58.3333/58.5347/58.3005/58.8661; mean 58.5997 off versus 58.4176 on (-0.31%), opposing pairs again. All gates failed. Keep stateconst disabled. Prepared CPU-frame-based QA controllers with bounded input/gameplay fingerprints, to detect and reduce trajectory variation from browser-timer input; validation pending. This is measurement infrastructure, not an FPS gain.

Native-frame input harness bb371a16 passed 40,000 policy cases and native ownership/bounds/repeat/cleanup tests. First active ABBA was rejected by its no-gap assumption: the later five trials each saw one unpolled logic frame, in both CPU configurations. All shared input/position/action/stock fingerprints matched, including after the gap through relative frame 1680. FPS gates also failed. Original failure saved in browser-2026-09-13-frame-input-first-validation.json. Added exact gap sequences and relative frame indices to fingerprints; matching native gaps are permitted only when the comparison verifies the same sequence. No change to FPS or rendering gates. Revised tests passed; rebuild and browser validation follow.

Refined native polling harness f99d96af PASSED consistency: 103 shared fingerprints match and every run has the same gap after relative frame 1013/before 1015. Fixed-address off/on/on/off simulation FPS 53.4525/52.6011/56.1358/56.6019; both pairs favor baseline. All 720p60 gates failed. Keep stateconst OFF. The last baseline delivered 56.3352 distinct visible FPS; this workload is not directly comparable to browser-timer input. MSR cache candidate is prepared, limited to admitted blocks with at least two floating operations; system instructions and linked calls excluded, continuing helpers refresh the cached register. Tests/build/replay/timing pending.

MSR cache validation: all 54 targeted checks passed, including 60,000 actual emitted-WASM cases covering arbitrary MSR bits, helper mutations and halt boundaries, all 8,192 codegen configurations with clear-before-mutation checks, and existing memory/alias/SIMD/dispatcher/replay fixtures. Conservative admission excludes all OPCD31 operations and linked calls; only blocks with at least two admitted floating instructions allocate the extra local. The build is linking; no browser result or speedup yet.

MSR core 9491b1b2 built and passed the 120-frame full-machine replay: all 107,036,212 bytes identical, no tick differences, 48 rollbacks and 199 resimulation frames. Both runs ended at frame 427. Only MSR cache toggled. Starting native-polling-verified active Fountain/IC mirror ABBA; no speed result yet.

MSR first ABBA on9491b1b2: off/on/on/off simulation53.3363/56.0347/57.1089/57.6994, opposing pairs; allFPSgates failed. Third warmup suffered4999ms image gap and only617 polled frames, causing input-consistency failure (99 shared fingerprints matched, insufficient1200commonframes inrun4). About154.6seconds between that warmup and next capture window, phase unresolved. Diagnostics during stall showed~1coreFPS/2secondpresentationinterval, noGL/compileerrors,378MSR-cache block emissions/9538loadsites,28785uniqueinstances. Diagnostics may overlap recovered third measurement. No retained gain. Started already-warm repeat. Prepared guarded constant32byte MEM1 FIFOcopy with original other-memory fallback, plus sampled gather/copy/burst scopes and phase-specific codegen setup reporting; notbuilt/installed.

Warmed MSR repeat completed:112 shared fingerprints and exact native polling gaps match. Off/on/on/off simulation58.4689/58.8364/59.1013/59.3327; mean58.9008→58.9689 (+0.116%), opposing pairs. Distinct visible58.2356/58.6031/58.8680/59.0994. All measured trials failed, though one warmup passed59.501visible. KeepMSROFF. FIFO-copy validation passed50targeted tests including60000range cases/12000actualburst-loop comparisons (bytes, EXRAMfallback, invalidranges, wrap, spill), all16384codegenflag combinations, existingFIFO/dispatcher/replay/benchmark checks. Build running.

FIFO core c80b5255 passed full120-frame delayed-input replay:107,036,212 identical bytes, zero section differences, no tick differences,48rollbacks199resimulationframes,reference/correctedframe427. Onlyfifocopy toggled;MSROFF. Basic8-frame save/restore also passed earlier. Visually inspected rendered fighters, floor/platforms and native framing after full replay. Native-polling support for cosmetic comparisons passed31benchmark tests and is installed for later hidden-animation retest. Starting baseline FIFO-cost diagnostic with detailed profiling; this is not FPS acceptance.

FIFO baseline diagnostic c80b5255 completed:30.0sec,CPUexecute23.703sec/advance4.155sec,CPU-GPUsync26.39ms,1518last-PCsamples. ProfiledFPS39.53 is notacceptance. Raw1/1024samples: gather4692/1.493ms, copy5319/1.356ms, CPburst5319/1.696ms. Inner estimates exceed separately sampled outer scope; timer/bookkeeping/periodic bias preclude precise FIFO attribution. Estimated5.45M copies are frequency evidence only. Savedfifo-copy-cpu-profileJSON. Started profiler-OFF native-polling FIFOoff/on/on/off comparison. Read-only graphics kernel journal had no matching driver errors inprior30minutes; no system changes.

FIFO copy first native-input ABBA complete: 107 shared fingerprints and all polling gaps match. Off/on/on/off simulation 53.1355/55.8024/57.5390/57.9048, distinct visible 53.0355/55.6691/57.3723/57.7048. Opposing pair results and upward warmup drift; no retained gain. All trials fail. Setup instrumentation shows restore 15–23 ms and settling 2.14–2.57 s, no multi-second unexplained stall in this comparison. Warmed repeat running.

Warmed FIFO copy comparison complete: 112 shared native polling fingerprints and both gap indices matched. Off/on/on/off simulation 56.7031/57.2368/57.9342/58.6698; mean 57.6864→57.5855 (-0.175%). Distinct visible 56.4697/57.0367/57.7342/58.4364. Opposing pairs; keep FIFO-copy OFF. No measured trial passed. Hidden-animation native-input comparison next. Prepared event callback attribution plus single native-poll measurement for profiling the same workload; 34 targeted tests passed, not yet built/installed.

Native-input hidden-animation comparison on core c80 complete but INVALID: first off warmup 18.1165 simulation / 17.9288 visible, max image gap 4996.215 ms, only 583 native polls. 100 available fingerprints matched; minimum common prefix failed. Next setup pause 3004.84 ms, restore 1019.52 ms, settle 120 frames 123006.92 ms. Two-second host sample during settling showed emulator workers only 2/1 CPU ticks and futex waits; this is wait/scheduling behavior, not proof of compute saturation during the stall. GPU-readback harvest max1006.845ms. Browser diagnostics clicked, then test task brought forward during fourth pair; timing is not a clean cosmetic ROI comparison. Normal animation stays enabled. Event attribution + native single-run harness passed34 tests; diagnostic core build started. Async image trials now prepare page visibility/focus event reporting; existing hidden-tab rejection remains.

Core84d4f3da native-input event profile completed: CPU execution23.079s/advance4.604s in30sec. FIFO scheduler callback1.851s (including1.208s decode/preparation), VI1.090s, audioDMA.205s, DSP.008s. CPU/GPU direct sync71ms; nested callback waits43ms. Inclusive scopes/profile overhead prohibit adding or treating these as production cost shares. Page visible/focused throughout, both players active; last-PC1506samples remain distributed. Naive FIFO merging changes per-burst interrupt cycle origins, so candidate prefetch combines only contiguous memory copies while preserving every32byte decode, CP update, wakeup and callback schedule. No performance gain claimed.

FIFO prefetch coree4cfba3a passed35 targeted checks, including60000range cases,20000actualFIFO-loop comparisons with identical per-burst decoder inputs/CP state/wakeups/wrap/return timing, and all32768codegenconfigurations. Built/installed independently on3237. Full120-frame delayed-input replay PASS:106900693identical machine bytes, tickDifferences[],48rollbacks199resimulationframes,reference/correctedframe422. Onlyfifobatch toggled, fifocopyOFF. Native framing visually inspected after replay. Native-input ABBA next; no speedup claimed.

FIFO prefetch ABBA completed,114sharednativefingerprints/allgaps matched. Off/on/on/off simulation59.3672/60.0357/59.6340/60.0039, visible58.9339/59.5024/59.1007/59.4039. Opposing pairs; keepOFF. Firstcandidate alonepassed individualgate, secondfailed; fullgoalNOTmet. Lastbaseline59.9706rendered but queue1783presented/1798received/15dropped in30sec, age17.12ms. Visiblecount tracks canvas submissions tooneframe, so no evidence of coarse image-probe misses. Newcandidate tests eachRAF consumption withoutsecondary59.94Hzqueueclock, samecapacity2/priming/no manufacturedframes.39queue/harnesschecksPASS includingphase-jitter loss and high-refresh no-duplication cases. No liveclock result yet.

Queue-clock ABBA completed but INVALID: third measured segment stalled for4.992s; following120-frame settling took170.009s and warmup ran0.75simFPS. Input comparison lacked1200commonframes in two runs. Page stayed visible/focused during first stall; later warmup recorded a blur. Readback harvest blocked1.99s. Two-second host samples showed busy emulator workers nearly idle during stall, then active after harmless Toggle diagnostics UI click (CSS-only; no core command). Cause unresolved; activation and probe interaction need isolation. Last baseline passed individually at60.002sim/59.536visible, but experiment cannot establish gain or goal. Clock skips only1 per normal30sec versus10–14droppedimages. Keep original queue clock. See browser-2026-09-13-queue-clock-stall.json.

Corrected core dcf171543b583cd24fffb9f9770f2ed6c1a9acd3a898ed4beb1b183da49643e3 replaces mathematically exact1/sqrt with canonical Gekko estimate/FPSCR handling via existing interpreter bridge. Targeted actual-handler vectors and generated-Wasm helper/halt checks PASS; existing FPR cache and scalar-alias checks PASS. First complete120-frame replay:105209150bytes equal, ticks[],48rollbacks/199resim/max6, end422. Captured roster was Fox/Falco despite Ice Climbers dropdowns (Choose fighters had not been applied); record actual roster, not labels. Separate heavy replay launched after applying selection. Prepared40-tested native-input image-versus-delivery ABBA diagnostic; no result yet.

Corrected frsqrte core heavy replay PASS: actual14/14IceClimbers,107031991bytes, ticks[],120frames,48rollbacks199resimmax6,end428. Native image/delivery/delivery/image control measured54.7026/56.2757/57.4131/57.7022simulationFPS, opposing pairs. Image measured54.4026/56.7688visibleFPS, bothFAIL.108sharedfingerprints matched; all8visible/focused, no multi-second stalls; pixel harvestmean0.28–0.29ms. Cannot claim stall fixed or readback causal. ContinueCPUwork: prepareddefault-off exactnormal-positive frsqrte emitter (tablebits+FPRF, exceptional input bridge), guardedflag32768. Native tests/build pending. Addedactualroster/stage/rulescheck forbenchmark labels; pendingpackageinstall.

Exact frsqrte core7a32 failed full120-frame comparison: 114tick differences; fighter/GPU state equal but timing/RAM/DVD/GPFIFO/CPU-register sections differ. Unaccepted/default off, no FPS measurement. Added missing pending program/DSI fallback and built candidate. Separate setup controls did not execute replay: automatic fighter selection lacked the documented native CSS/preload wait. Restore delay800 plus waitForCss after both new selection sites; guard automatic black-background writes until fighters initialize. Native Start did not release the partial scene, so pauser0 is not evidence of an ordinary native pause.

After restoring native CSS/preload settling, unchanged-frsqrtefast control core7a32 PASS107055991bytes/ticks[]/end423. Exception-corrected core21b62c02 canonical-versus-fast PASS107060212bytes/ticks[]/end425, actualICmirrorFoD,120frames48rollbacks199resimmax6. Both source guard and initial checkpoint changed since the failure; this does not independently attribute all prior timing divergence to the guard. Default remains off pending clean native-input/image ABBA performance evidence.

Core21b62c02 frsqrte ABBA complete:53.4724/55.7038/57.6360/57.6363simulation,53.4058/55.5371/57.2693/57.1363visible,107nativefingerprintsPASS, allgatesFAIL. Reverse pair tied; no retained gain. Warm repeat firstbaseline58.1350/57.7017 then async-image drain timed out during candidatewarmup; no validcandidateFPS. Workerhistory reportscore notadvancing, noGLerrors. Newcontext lifecycle experiment reuses verifier objects acrossphases; fullimagehash/cadencegate unchanged; failures recordphase/pending/harvested/lifecycle. Fixedbenchmarkroster capture afteractual initialization duringopening6seconds (timeLimitstill480); exact8:00 condition conflicted withscene settling andtimedoutwithoutmeasurement.

Image context experiment complete: fresh/reuse/reuse/fresh with warmup and measurement each. Corrected core21b62c02, native IC mirror FoD, all rejected CPU flags off.107/112shared fingerprints PASS; all FPS gates FAIL. Warm simulation58.5663/57.3696/58.3023/58.2673, visible58.3663/57.2696/58.0356/58.0007. No repeatable gain and no multi-second stalls in either mode over both comparisons. This does not prove the intermittent stall fixed. Next opt-in candidate: cache scalar FPRs only in helper-light arithmetic blocks with at least12 FP operations and at least3 references per distinct register. Compilation counters expose selection coverage; no hot-loop counters. Hypothesis only pending tests/replay/timing.

Selective FPR coreb317c2cc replay PASS:120frames,107060212complete-machinebytes/all29sections and all frame ticks identical;48rollbacks/199resimulated/max6. Actual IC mirror FoD, both human ports. Reference explicitly fprcachefalse, candidate true. Emission counters30selected/16153rejected (not dynamic frequency). Classifier plus actual emitter raw-bit/alias/branch tests PASS. Initial replay fixture omittedinputprobe and correctly rejectedCPUport; correctedfixturepassed. Speed ABBA next, flag remainsOFF bydefault.

Selective FPR warmed repeat: simulation58.9348/59.1672/57.4680/59.4040 off/on/on/off; visible58.3681/58.7006/56.8013/58.0706.112fingerprintsPASS, allgatesFAIL. Opposing pairs and lower candidate mean: leaveOFF. No multi-second stalls. Lastbaseline59.3707renderFPS,58.1040canvasFPS,37dropped/1781receivedqueueimages,meanqueueage18.8813ms(cap2). Refresh corrected-core CPU profile next.

Corrected core profile refresh: first23.550sCPUexecute/4.323sadvance in30s; warmed23.001s/4.645s. Warm FIFO callback2.196s incl1.556sdecode;VI.889s,DSP.0068s,AudioDMA.162s,directGPUwait.0142s.1510last-PCsamples topSelectThread78(alreadyidleoptimized),FObjAnim44,EnvelopeMtx38,particles31,MObjTev30. Overlapping profiled scopes and periodic sample bias prohibit exact production cost shares. Next guarded hidden-scenery animation retest; source confirms Ground_801C1CD0 must retain grMaterial commands, collision counter and callback.

Corrected hidden-animation replay600frames/all4actors/RNG/platform/cameraPASS. Timingon/off/off/on57.9683/58.2003/57.4713/58.4047sim,57.3349/57.3670/56.7713/57.5713visible;112fingerprintsPASS, allFPSFAIL, opposingpairs. Leave animationON. DOMcanvas960x720 displayed1144x858(4:3); nativecamera observables matched; no arbitraryoffset applied. Refined scalar FPR candidate now includes direct OPC31 arithmetic/indexed integer memory plus ordinary OPC63 arithmetic/move/compare; noSPR/MSR/cache/HLE/frsqrte. Prior classifier selectedonly30blocks; broader coverage and speed remainunproved. Focusedtests3PASS; corebuildinprogress.

Mixed selective-FPR core7560a1da PASSED120-frame referencefprcacheoff/candidateon replay:107055991bytes/all29sections identical,tickDifferences[],48rollbacks199resimmax6,end424. Emission89selected/16089rejected, versus30selected inearlier conservativeclassifier; notdynamicCPUcoverage. Focusedtest3PASS; originalhelperexclusionspreserved. Nativehostedstartup intact. Controlledspeedcomparison next.

Mixed selective-FPR7560a1da firstABBA52.4356/54.6699/55.7711/57.1022sim,52.3356/54.5366/55.4710/56.8689visible;105fingerprintsPASS, allgatesFAIL, opposingpairs withwarmupdrift. Same-browser warmrepeat started.

Mixed selective-FPR warmed ABBA58.2353/57.3356/57.7683/58.8377simulation,57.4686/56.6023/57.0683/58.1376visible. Both pairs favorbaseline,112fingerprintsPASS, allgatesFAIL. KeepFPRcacheOFF. Latestqueue1763received1745presented18dropped,meanage16.8193ms(cap2),core59.94clock/speed1. Next structural hypothesis: bounded adjacent-block fusion that carries register locals between blocks. Existingblockmerge onlytries prefixesbelowMIN; shortprefix=1 (MIN=2; single ordinary branches MIN=1) makes it effectively inactive. Do not simply extendoldfusion: it omitsoriginaltimingboundaries andelidedbranchcycles frominternalhelperdowncounts. Proposed intermediateprefixesmustnotstoreguestmemory/modifycode/callHLE/systemoperations, originalbranchcyclesmustremain, andalloriginaltiming/pause/frame-step/perfmon exitsmustcommitexactstate. No implementation/performanceclaim yet.

Timed two-block fusion now implemented behind default-off blockmerge. It retains the original A branch/cycles, commits A PC/live budget before B, checks cycle exhaustion/CPU state/armed frame counter, and flushes dirty GPR/FPR locals on stop. A excludes guest memory and system/HLE/linked calls; B may use ordinary memory. Debug/perfmon paths stay separate. Successor physical ranges join cache invalidation/restore validation. All43 targeted boundary/cache/dispatch/control/benchmark tests passed. Build pending; no runtime correctness or performance claim.

Timed-fusion corec78752db passed full120-frame replay:107055991bytes/all29sections,ticks[],47rollbacks334resimmax9 withdelay6,end428. ActualICmirrorFoD,twohumanports. Referenceblockmergefalse/candidatetrue;1368fusedemissions,zeroemit/compilefailures. Initialroster[2,20]mismatchrejected, nativeChoosefighters correctedfixture. Startingnative-inputABBA; noFPSgainyet.

Fusionc78752db firstABBA51.5030/54.1342/56.9355/56.4362sim and51.4363/54.0009/56.5688/56.0695visible off/on/on/off. Bothpairsfavorcandidate,104fingerprintsPASS, allgatesFAIL. Strongwarmupdrift; warmedrepeatstarted. EarliermanualnativeStartleftSSS; two setupattempts producednomeasurement. ReloadwithoutmanualStartallowednormalbenchmarkflow.

Fusion warmed ABBA56.5349/58.5368/58.6688/57.7719sim,55.9015/57.9034/57.8687/57.1385visible. Bothpairsfavorfusion; mean 2.536%,112fingerprintsPASS. Retain as opt-in experimental gain. Candidate render58.4701/58.6021,17/21queuedimagesdropped,meanage16.22/17.10ms(cap2),clockskips2/3. AllFPSFAIL. Next: reuse FPU-availability guard in admitted MSR-stable blocks, preserving first-FP fault PC/cycles and helper halt behavior. Notimplemented/measuredyet.

Independent fpuguard candidate implemented, QA-only codegen flag131072. It uses the existing MSR-stability admission plus at least two supported OPC4/59 arithmetic/merge operations. The first arithmetic operation keeps the original unavailable-FPU helper PC/cycles; continuing arithmetic checks become constant true. Memory access guards remain unchanged, and memory-only blocks gain no new guard.47 targeted generated-WASM/fault/MSR/fusion/control/benchmark tests passed, then3 focused admission checks passed. Initial buildcd83961b was not installed; refined admission build running. Fusion retained independently via blockmerge1.

Refined FPU-guard coreb0774ca5 full120-frame replayPASS:107060212bytes/all29sections,ticks[],48rollbacks199resimmax6,end422. FusionONbothreference/candidate, onlyfpuguardtoggled. ActualICmirrorFoD,twohumanports.77guardedblocks/374sites emitted; compilationcoverageonly. Noemit/compilefailures. Native-inputspeedABBA next.

FPU guard firstABBA54.5029/57.7032/58.5032/58.1373sim,54.4029/57.5698/58.3365/58.0039visible off/on/on/off, fusionONall.108fingerprintsPASS, allFPSFAIL. Bothpairsfavorcandidate, reversegain0.366FPS; warmupdrift. Warm repeat running, no retained FPU gain yet. Conditional-fallthrough fusion script/test preparation exists in /tmp only; notapplied.

Shared FPU guard warmed ABBA: 58.1671/59.4051/58.8037/58.2021 simulation and 58.0005/59.1385/58.5703/58.0021 visible FPS off/on/on/off, fusion ON. Both pairs improve; mean 1.581%. 112 fingerprints match. Retain experimentally; all FPS gates fail. Next conditional fusion comparison must hold retained FPU guards ON in both configurations.

Conditional fallthrough fusion core83a8df37 passed 120-frame replay: all107060212bytes/29sections and frame ticks equal;48rollbacks/199resimulation frames/max6. FPU guards and unconditional fusion ON both sides, only branchfusion toggled.2053 conditional emissions,4060 total fusions,zero emit/compile failures. FPS ABBA next.

Conditional fusion first ABBA 54.9690/56.7015/57.9333/58.1049 simulation,54.8023/56.5681/57.8000/57.9715 visible FPS.108 fingerprints match. Opposing pairs; no gain established. Warm repeat started without reloading. All target gates fail.

Conditional fusion warm ABBA 58.7040/59.2022/58.7682/56.9037 simulation,58.5706/58.8355/58.6016/56.6703 visible FPS.112 fingerprints match. Both pairs favor candidate, but late baseline fell1.8FPS relative to its warmup. Third comparison started to verify this tentative result. All target gates fail.

Conditional fusion third ABBA58.6011/59.1702/59.0023/59.2396 simulation,58.3344/58.9368/58.6689/58.8733 visible FPS.112 fingerprints match. Opposing pairs again; mean0.281%, keep disabled. Next: controlled idle guard hoisting test on this core; its earlier CPU9 results were not a same-checkpoint ABBA. No native changes required. Wider FPU proof admission remains prepared in /tmp only.

Current core83a8df37 idle guard hoisting replayPASS: all107055991bytes/29sections and120frame ticks match,48rollbacks199resimmax6.2,967,478 hoisted iterations prove execution. Both sides retain unconditional fusion/FPU guards, conditional fusion OFF. Controlled native-input ABBA next.

Idle guard firstABBA52.2697/55.5029/57.2028/57.5715 simulation,52.2363/55.3695/56.5694/57.1381 visible FPS.106 fingerprints match, opposing pairs; all gates fail. Every run counters+192777iterations, candidate+185063/185064hoisted. Fixed totals despite differing frame counts are coverage only, not time share. Warm repeat running.

Idle warm repeat rejected before retaining a timing result: execution did not match configured mode (generic error lacks raw deltas). Following live read: presentation24751→28255 and PPC2150624532→2151008836, but idleblocks1202452/iterations30814493/hoisted3141151 unchanged. One GCJump pulse. No FPS acceptance claim. KeepidleOFF: eligible path absent in that steady scene. Wider FPU proof admission is next.

Wider FPU proof core76333a13 passed120-frame replay: all107060212bytes/29sections,ticks[],48rollbacks199resimmax6,end425. Both sides originalFPUguard+unconditionalfusion ON; branchfusion/idlechecks OFF. Onlyfpuguardwide toggled. Compiler cumulative211guardblocks/1022sites,2080fusions,zeroemit/compilefailures. Speedcomparison next.

Wider FPU proof firstABBA55.4347/57.9677/57.6700/58.7711 simulation,55.3347/57.8344/57.4700/58.5377 visible FPS.110fingerprints match. Opposingpairs, alltargetgatesfail. Warmrepeat running; notretained.

Wider FPU proof warmABBA56.3024/57.9369/56.0674/58.7393 simulation,56.0023/57.8035/55.9007/58.6059 visible FPS.112fingerprints match; opposingpairs and negative mean, keepwideOFF. Next: duplicated dispatcher loops choose legacy dynamic stepchecks for initially armed invocation, fast loop otherwise. CPUThreadGuard/CPU PauseAndLock reviewed: new arming waits for CPU RunLoop ownership to end; cancellation remains dynamic on armed paths. Full step replay will not exercise unarmed fast path; require emitted-WASM semantics tests plus normal-running native-input fingerprint comparisons and report that limitation.

Dispatcher step-check hoisting core34f85fc7: actual-WASM/CPU-ownership/native-stop/QA tests passed (58 total across targeted suites). New normal-running600-frame replay passed107,382,085bytes/all29sections, matching native input fingerprints and zero polling gaps. Reference/candidate each executed1,666,914dispatcher calls with distinct handles and verifiedstepcheck0/1. The native stop requests CPU Break after releasing the controller mutex, never arms stepping, and capture waits for CPUThreadGuard ownership. Initial full-state match was falsely rejected by comparing RPC IDs; fixed/tested and rerun. Stepped rollback and FPS testing remain. No720p60 acceptance.

Dispatcher step-check hoisting: stepped120-frame replay also passed107,055,991bytes/all29sections/ticks,48rollbacks/199resimulation/max6. FirstABBA sim54.8012/57.9670/58.7995/58.5986,109fingerprints; warmABBA58.7698/58.3999/58.7365/58.3348,112fingerprints. Warm pairs oppose and mean gain~0.027%; leave stepcheckOFF. Every strict FPS gate failed. Next: read-only prefix fusion with fallback-read exit beforeB, using both normal-running and stepped full-state harnesses.

Read-only prefix fusion core3cbc3b2f built with5existingwarnings;65targeted tests pass after completing the standalone emitter fixture. Admits onlylwz/lbz/lhz/lha inA, marks existing imported-read fallback arm, exits at originalA boundary beforeB after any fallback, uses scoped local tracking, preserves physical invalidation ranges and all timing/CPU/step checks. Normal-running600-frame replay passed106,880,524bytes/all29sections; fingerprints matched, no gaps.145read-fused emissions; dispatcher calls1,609,846→1,598,001, not an FPS or self-time measure. Rollback and performance testing pending.

Narrow read-fusion stepped120-frame replay passed107,055,991bytes/all29sections/ticks with48rollbacks/199resimulation/max6. ABBA simulation54.1702/57.5730/57.5705/57.9698, visible54.1035/57.4063/57.4705/57.8698,107fingerprints match. All gates fail; opposing pairs, reverse candidate-0.3993FPS, no retention. Next test readfusion+branchfusion together against retained unconditional fusion/FPU proof. No native rebuild needed; both mechanisms already tested individually and actual fused-boundary tests cover combined conditional/fallback exits. Full combined replay still required.

Combined readfusion+branchfusion oncore3cbc3b2f passed normal600frames107,856,034bytes/all29sections/fingerprints and stepped120frames107,060,212bytes/all29sections/ticks,48rollbacks199resimulationmax6.1995read-fused emissions. Normal-running dispatcher C++entries rose1,670,833→30,330,014 (~18.15x). Source identifies conditional target mismatch returning generichalt1, which exits the WASM dispatcher despite positive budget/running CPU. Next candidate can introduce a distinct self-committed safe-exit status that skipsB bookkeeping and reuses the existing WASM state/map/tag checks. Hard stops, fallback reads, exceptions must retainhalt1. No speed claim yet; combined FPS comparison starting.

Combined conditional/read fusion ABBA simulation58.6686/58.5371/59.3034/57.9021, visible58.4686/58.4038/59.0700/57.7021.111fingerprints match, all gates fail, opposing pairs. Keep experimental/off. Next default-off fusionredispatch status2 will isolate safe branch-target exits; all hard stops/fallback reads remainstatus1. Normal return0 keeps originalB bookkeeping; status2 skipsB bookkeeping and takes all existing live budget/state/step/map/tag/callback checks.

Fusion redispatch core767af3cb built with5existingwarnings.68targeted tests passed: actual emitted status0/1/2 and unknown-status handling, hard stops, conditional target miss, fallback reads, sticky GPR/FPR commits, live map/tag/flags/partial callbacks, pause/step/cancel, all codegen flags and cleanup. Normal600-frame full replay passed107,518,700bytes/all29sections and fingerprints/no gaps. Both modes compiled1792read-fused blocks; candidate3901soft-exit emissions. Dispatcher C++entries29,573,162→1,498,321 (~95% fewer), notCPUtime/FPS gain. Hard/fallback exits stillstatus1; only safe target misses use2, skippingB bookkeeping and reusing all dispatcher checks. Stepped replay and FPS pending.

Fusion redispatch stepped replay passed107,060,212bytes/all29sections/ticks,48rollbacks199resimmax6. Isolated ABBA simulation57.9360/56.9020/58.0710/59.6388, visible57.3693/56.6020/57.3043/58.7053;111fingerprints match. Repair loses BOTH pairs; keepOFF despite95%fewer C++entries. Latestcontrol rendered59.5721FPS but queue2 dropped25of1787received images, presenting1762. Meanqueueage18.6081ms; maxvisiblegap97.68ms. Noacceptance. Next queue2vs3 comparison holds oldcombinedread/branch+FPU/unconditional fusion fixed and reports addedqueueage. No inference that more buffering satisfies end-to-end lowlatency.

Queue capacity2/3/3/2 comparison on core767af3cb: first simulation54.5010/55.7666/57.5362/59.6365, visible54.4010/55.5333/57.2695/58.9364;108fingerprints matched. Warm repeat simulation56.7678/60.0039/59.4369/59.7672, visible56.1678/59.7038/58.8035/58.8672;112fingerprints matched. Only first warm capacity3 interval passed; opposing pairs and large throughput drift prevent gain claim. Three-image queue mean32.52/25.04ms,p95upper47/43ms versus controls15.55/19.64ms,p95upper29/31ms. Keep default2. Added bounded257bin age histogram, capture-end counter snapshot, safe capacity changes and matched-input/fixed-codegen ABBA. Initial attempt stopped before capture due helper scope error, corrected before these runs.72targeted checks now pass, including next dispatch-counter batching candidate. Counter changes preserve warm JIT when toggled; normal-running/stepped replay and FPS still pending.

Counterbatch core648ffd7b passed600normal frames,107,382,085bytes/all29sections and inputs identical;303→903. Candidate30,529,169dispatcher increments published709,793batches versus reference30,543,125immediate increments. Same dispatcher handle and existing1968readfused emissions retained. Counts are not selftime and reference JIT coverage differs. Stepped120failed: one CoreTiming byte atrelative12(idled cycles), and frame5boundary+14ticks;same426endframe. WithholdFPS pending counterOFF/OFF control to test retained compiled-code history.73targeted checks passed total after adding unchanged-code replay coverage.

Counterbatch followups: unchangedOFF/OFF120-frame control passed107,055,991bytes/end422; freshOFF/ON passed107,055,991bytes/end423; exact-path120prewarm OFF/ON passed107,060,212bytes/end424. All29sections/ticks and48rollbacks199resimmax6 match. Initialfailed frame5had identicalPC801a4fc8 but14tickdifference; CoreTiming idlecycles only finaldifference. Causal explanation remainsunproven, freshcheckpoints differ. CounterstaysOFF; proceedingwithdiagnosticROI timing, notacceptance. Optionalreplayprewarm executesexactfutureinputs andrestoresinitialstate; testsverifyrestore/inputidentity.

Counterbatch OFF/ON/ON/OFF first simulation55.5008/58.1364/58.1693/57.4684, visible55.3675/57.9364/57.9693/57.3018;110fingerprints match. Repeat simulation57.5043/57.6710/59.3357/57.4001, visible57.3376/57.5376/59.0690/57.1001;112fingerprints match. Bothpairsfavorcandidate inbothcomparisons; repeatmean+1.8296%simulation. Allgatesfail; defaultOFF because initialsteppedreplaymismatchunresolved. Relativegainwithinnewcore only; no controlledcrosscorecomparison. Next nativefixedwork timer readssteadyclockonlyatfirstandlastpoll ofexplicitlystoppedQAspan. SeparateAPIkeepswalltimeoutofdeterministicfingerprints; fixed1800frameABBAcomparesfullendpoints andcanneverclaimvisibleFPSacceptance. Native+replay17tests and fixedwork7tests pass; buildpending.

Exact 1800-native-frame OFF/ON/ON/OFF work on core7c710255: 54.7112/57.7117/57.0995/57.0740 FPS; reverse pair effectively tied. 120 sampled fingerprints match. First ON full endpoint equals first OFF (107005201 bytes,29 sections); second ON differs in CoreTiming (2 bytes, first offset12), final OFF differs in GPU TextureCache (120 bytes, first offset5529851). Thus unchanged-mode control also fails, and counter batching alone cannot explain all discrepancies. Raw equality remains unchanged. Adding field/range diagnostics; no visible-FPS claim for fixed-work runs.

Core ae100757 adds bounded changed-byte ranges and serializer-field names without changing serialized bytes or raw equality. Two compiled diagnostic tests pass, including unequal sizes, random differences, truncation and bounded write-only metadata. Fixed 1800-frame OFF/ON/ON/OFF repeat: 55.9890/58.2780/57.7777/57.8906 native-work FPS. All three full endpoints equal 107,839,431 bytes across 29 sections; 120 input fingerprints match. Earlier mismatch not reproduced, so its cause remains open. Reverse pair slightly loses for batching; leave default OFF. Next experiment: compile profiling and dispatch-counter accounting out of an alternate CPU dispatcher, keeping all emulator control flow and safe diagnostic fallback.

Core a959f40c lean dispatcher: one shared templated implementation, with diagnostic objects compiled out in the alternate path. All original execution/timing/exception/frame-step logic remains shared; live profiling and debugger single-step select the instrumented path. Flag changes occur under CPU ownership and retain compiled game blocks. 71 targeted checks pass after correcting a test-only missing include. Normal-running 600-frame replay passed all 106,880,524 state bytes and input fingerprints; reference updated the chain counter 29,547,757 times, alternate updated it zero times and recorded 940,511 outer scopes. Scope counts do not measure compiled chain calls. Stepped 120-frame replay passed 106,924,693 bytes and emulated ticks, with 48 rollbacks and 199 resimulation frames. No prewarm. Starting 30-second same-checkpoint OFF/ON/ON/OFF image/FPS comparison; no speedup claim yet.

Lean dispatcher with combined read/branch fusion: OFF/ON/ON/OFF simulation 56.4037/57.6725/56.2357/58.6706, distinct visible 56.2704/57.5058/56.0690/58.4373. 110 shared native polling fingerprints match; all strict gates fail. Opposing pairs, reverse loss; keep default OFF. Next comparison removes the unproven read/conditional fusion stack while retaining FPU guard and unconditional fusion. This is a separate configuration test, not a controlled cross-run claim about removing fusion.

Lean dispatcher with read/conditional fusion OFF: simulation 53.2722/56.3688/56.1687/57.8690, visible 53.1389/56.2354/56.0353/57.7023. 108 shared native fingerprints match. All strict gates fail; reverse pair loses again, so keep lean dispatcher OFF. These separate runs do not establish a causal benefit/cost for removing fusion. FIFO source inspection shows CpuGpuDecode includes deterministic CPU preprocessing, not vertex loading itself. A redundant CP vertex-format write currently dirties the loader and can force UID creation/map locking at the next primitive. Next controlled candidate skips only that redundant invalidation, preserves the CP write and cycles, and counts actual opportunities under CPU ownership.

Core a1d25a5f: CP-format reuse only suppresses redundant CPU-preprocess dirty marks; every CP write and its 12 cycles remain. Changed formats and preexisting dirty flags remain intact, GPU decoder behavior is unchanged. Counters are CPU-owned and snapshots require a paused CPUThreadGuard. 78 focused tests pass, including every command byte and all 67,108,864 codegen flag combinations. Normal-running 600-frame replay passed all 107,382,085 bytes: 357,254 format writes, 295,154 identical values (82.62%), and candidate suppressed 295,154 dirty-mark operations. This is not the count of actual cache lookups saved. Stepped 120-frame replay passed 107,097,189 bytes and all ticks; 48 rollbacks/199 resimulation frames. Visually inspected stage/actors/framing without vertex corruption; no equivalent native-Dolphin scene comparison yet. Start strict 30-second OFF/ON/ON/OFF timing with read/conditional fusion, counter batching and lean dispatch OFF. No FPS gain claimed yet.

CP format first strict comparison: OFF/ON/ON/OFF simulation 54.3682/56.6677/58.1013/57.8339; distinct visible 54.3016/56.6010/57.9013/57.6672. All four gates fail at 960×720, nonblack 1. 109 shared native fingerprints match. Both pairs favor the candidate, but the reverse gain is only +0.26745 simulation FPS (~0.46%); first-pair warming is substantial. Repeat on the same page before retention. Counters show ~82% repeated format writes; they count suppressed dirty-mark operations, not actual map lookups saved.

CP format warm repeat: OFF/ON/ON/OFF simulation 57.5686/59.2654/58.7018/59.2659; visible 57.3686/59.1320/58.3351/58.9326. All strict gates fail; 112 shared native fingerprints match, every interval visible/focused without lifecycle events. Reverse pair loses 0.5641 simulation FPS. Keep CP format reuse OFF: operation count does not prove meaningful cost reduction. Next inspect main Fountain display meshes through DOBJ_HIDDEN; diagnostic only, preserving joint/process/collision/camera behavior. Source reference: local doldecomp/melee src/sysdolphin/baselib/displayfunc.c HSD_JObjDispSub and src/melee/gr/grizumi.c main map object3.

Fountain main map object3 contains56 joints/108 display objects. Isolated live draws identify joint8 as the main floor, joint11/right pillar,12/left pillar,13/large stars,37/fountain centerpiece. Candidate hides only38 DOBJ draws in11/12/13/37, preserving every joint/process/animation/collision/camera field and all other meshes. 62 focused checks pass. Initial600-frame observable replay passes all four IC actors, RNG, platforms and native camera; this is not full machine equivalence. Combined candidate visually retains the playable floor/platforms. A setup gap was found: retained FPU guard was explicitly applied by codegen benchmarks but not cosmetic tests. QA fresh-match setup now applies/verifies it when retainedfpuguard=1 and cosmetic results record their codegen config. Repeat candidate replay with that baseline before FPS comparison.

Retained-baseline decoration replay also passes600 frames/all4 IC actors/RNG/platform/camera probes after explicit FPU guard application. Cosmetic benchmark now records codegen configuration and rejects any sample in which one of the38 selected visibility flags is no longer applied at its end. Start strict 30-second on/off/off/on comparison with two native-frame controller tracks,720p,EFB150%,reflection/scenery off,black background,low models,full shadows. No measured decoration FPS gain yet.

First decoration on/off/off/on comparison: simulation55.8019/57.2370/57.4357/58.9353; visible55.6353/57.0036/56.8023/58.2686. All gates fail,110 native fingerprints match,38 draw flags stable at every end. Third measured interval blurred at10.674s; fourth remained unfocused. Opposing pairs and focus change make this inconclusive. Warm repeat started after explicit user continue. Ambient Fountain particles use bank30, separate from renderer link0; their draw loop can potentially be skipped while retaining updates/RNG, but this is source investigation only, no candidate implemented.

Warm decoration ON/OFF/OFF/ON: simulation 58.9378/58.8348/59.2704/59.0055; visible 58.2378/57.7348/57.9036/58.2054. 112 input fingerprints match, all four intervals visible and focused, 38 display flags stable. All FPS gates fail. Opposing simulation pairs and both visible pairs favor original decorations; leave decorations enabled. Next candidate isolates draw-only Fountain bank30 particles; updates and RNG must remain intact.

Fountain particle candidate: Ground loads map particle data into bank30; grIzumi_801CBE64 spawns generators0x7534/0x7536 on link0 in that bank. Retail psDispParticles uses r30 as particle pointer. Hook803a02c4 follows the original size/FPSCR comparison and bypasses only bank30 draw body during major2/minor2/Fountain2. Preserve r12/SP/CR, LR/CTR/XER/FPR; keep prev_kind as last rendered particle. Code cave80002d00 is116bytes, checked for occupancy and invalidated along with the hook. Independent emitted-instruction tests exercise336 guarded bank/scene combinations;60 focused checks pass. First600-frame observable replay with Fox/Falco passes; IC mirror replay next. No FPS gain claimed yet.

Particle candidate600-frame IC mirror observable replay passes all4actors, RNG, platforms and camera. Live paused snapshot contains121particles:93bank30ambient and28bank0; count is not timing. Candidate visual keeps floor, ledges, platforms and fighters/effects; camera data unchanged, no equivalent native-scene image comparison yet. ON/OFF/OFF/ON FPS started, no profiler/build/test activity during capture.

Particle ON/OFF/OFF/ON FPS: simulation55.9351/58.4675/58.4716/55.0695; visible55.6684/57.5675/57.4715/54.9695. Both pairs favor skipping ambient draws, mean simulation gain5.346%. 108nativefingerprints match; all visible/focused/no lifecycle events, native960x720, no black samples, every gate fails. Hook stable throughout; ambient particles still present in memory at end (94/96/95/102), confirming generation persists. Warm repeat underway.

Warm particle ON/OFF/OFF/ON: simulation56.8688/58.9683/52.4372/54.9340, visible56.4021/57.8683/51.9372/54.8006. All gates fail;108fingerprints match, focus/visibility stable. Opposing pairs, mean-0.355%; do not retain yet. Slow candidate maxgap70.31ms, not a multisecond freeze, 240queue underruns versus62in prior candidate. Cause unresolved. A read-only process snapshot later found a briefly busy Brave renderer, but it started after this slow interval and cannot explain it. Added bounded receive timestamps (including queue-dropped images) to separate exports from forwarder/main delivery; timestamped diagnostic next.

Timestamp diagnostic completed before user status interrupt: ON/OFF/OFF/ON simulation49.7357/54.4336/55.0670/56.3062, visible49.6357/54.3002/54.9003/55.8061. All diagnostic-only. Exports average20.13/18.39/18.17/17.78ms apart; export-to-page transport means0.696/0.751/0.722/0.367ms. Queue dropped0/2/4/14. Frame production is the larger bottleneck in these samples, not image transport. Final consistency metadata lost after browser/session reset; selected exact timing fields saved. Private3237 server found stopped after reset, restarted only that lab. Next hidden-animation retest.

Host restart confirmed: boot time2026-09-13 19:04:11UTC. Recreated private server7538 and QA staging snapshot in ignored .perf-lab/qa-staged.json because /tmp was cleared. New browser tab2 loads hosted game automatically. Hidden-animation IC mirror replay started before fresh baseline ABBA; particle suppression is off to isolate animation. Old and post-restart rates must not be treated as paired comparisons.

Post-restart hidden-animation600-frame IC mirror replay passed all4actors, gameplay/RNG/platforms/camera with retainedFPU/fusion and normal particles/decorations. Fresh ON/OFF/OFF/ON native-input FPS comparison running.

Post-restart hidden-animation comparison completed: ON/OFF/OFF/ON simulation
58.1210/58.9035/54.5042/55.3747, visible56.7895/57.3701/53.3041/54.5084.
All 110 shared native input/gameplay fingerprints match; every interval remained
visible and focused with no lifecycle events. Native960×720, nonblack1, all four
FPS gates fail. Opposing pairs and negative mean change: keep animation ON.
The candidate's second interval slowed substantially without a multisecond
freeze; maxgap100.995ms. This variability is unresolved, not evidence that the
optimization works. Queue drops35/43/35/25 and mean ages14.67/17.12/13.65/14.08ms
show additional presentation losses, but earlier export timestamps locate the
larger delay upstream in frame production. No profiler/build/test ran during
capture. Saved selected exact metrics in the postrestart-hidden-animation
comparison artifact; no further performance capture is currently running.

User accepts Fountain/Ice Climbers as a documented exception if other stages and
matchups work. Six-stage Fox/Falco native-input sweep at960×720: simulation
59.268/59.969/59.869/59.802/59.004/53.634, visible
58.035/59.169/58.869/58.602/58.037/53.301 for BF/FD/DL/YS/FoD/PS.
All six fail; every run visible/focused, active inputs, native rules verified.
Stadium transformation coverage is not established by its30-second interval.

Standard Dolphin timing on FD failed two fresh-match trials: simulation
57.469/58.968, visible56.202/57.668. No paired causal estimate; reverted.
Queue benchmark fixed to preserve all original CPU settings instead of enabling
read/branch fusion.54 benchmark tests passed. FD capacity2/3/3/2 matched114input
fingerprints; visible59.370/58.668/59.354/58.602, all gates fail. Candidate queue
mean25.37/29.51ms versus18.79/19.70ms; opposing pairs, retain capacity2.

Stadium screen candidate suppresses only three lb_800122C8 texture-copy calls at
801d2f60/801d300c/801d30c0, plus map1 video-board draw callback. Calls independently
decoded from the development DOL; code/site/ownership/wrapper guards validate
before writes and JIT invalidation follows each code edit. Native video-board
logic, RNG, ready flags, stage transitions and gameplay camera remain untouched.
Added stage transformation/joint replay probes and opt-in QA controls. Initial
600-frame real-game replay is next; no correctness or FPS success claimed yet.

Stadium correction and result: initial guard rejected the map1 callback before any writes. Retail installs custom fn_801D5074, which calls grStadium_801D1EF8 for video state then grDisplay. Final candidate preserves that wrapper and its state update, and NOPs only the inner draw call at801d509c plus the three texture-copy call sites above. It never replaces the GObj callback.62 focused tests pass.600-frame Fox/Falco CPU9 replay passes actor/match/RNG/platform-transform-joint/camera probes. Visual check retains floor/fighters/effects/HUD and960x720 4:3 framing; equivalent native-scene image comparison remains pending.

First Stadium screen ON/OFF/OFF/ON native-input comparison: simulation59.6699/59.7372/60.0368/60.0373; visible58.4699/58.6038/59.4368/58.9372.113 fingerprints match, all visible/focused, hooks stable, all gates fail. Both visible pairs favor screen suppression, but small gains need repetition; CPU rate essentially equal on reverse pair. Retain only as opt-in experiment. No transformation-duration replay yet. Next Final Destination image-observer overhead control.

Final Destination image/delivery/delivery/image control: canvas submissions59.2700/59.7543/59.6611/59.2364FPS; image-visible59.2367/59.2031. Simulation59.9701/59.9542/59.9611/59.8031.113 fingerprints match, all focused/visible. Both pairs show fewer delivered images with verifier active; counters are diagnostic and cannot pass acceptance. Mean pixel harvest0.645/0.361ms, maximum35.61/16.92ms inside RAF. Candidate moves harvesting to a separate task while preserving RAF capture/timestamps, all samples, pixel hashing and thresholds. No gain claimed yet.

Task-harvest candidate:58 focused benchmark/scheduler tests pass. Live browser fixture passes all8black/static/30fps/60fps/snapshot/bitmap cases, every sample returned and every pixel hash/change matches the known source. Captures remain in RAF; a bounded cancellable timer collects fenced results, with propagated errors and full final drain. Same-checkpoint RAF/task/task/RAF FD comparison now running.

Task-harvest RAF/task/task/RAF: simulation57.4680/59.9363/58.2705/59.6692, visible55.8346/58.6696/55.9384/58.3691, all gates fail;111fingerprints match, focus/visibility stable. Opposing pairs, no retention. Candidate mean readback1.040/0.892ms versus first RAF0.543ms; main-task deferral does not remove GPU synchronization. Next worker verifier snapshots the actual canvas synchronously at RAF invocation and transfers immutable ImageBitmaps for off-main-thread pixel analysis. Capture ordering, all-sample completion, capacity errors and late disposal covered by tests; real pixel fixture next.

Worker verifier:62 focused tests pass, then live8-case known-image fixture passes every sample/hash/change including 30fps and bitmap snapshot mutation. No main-thread WebGL readback; synchronous createImageBitmap invocation captures canvas, worker does GPU readback/hash, main collects ordered results. Bounded8pending snapshots, no discarded samples; initialization timeout and final-drain failure reject run. Same-checkpoint RAF/worker/worker/RAF FD timing next.

Worker verifier RAF/worker/worker/RAF: simulation55.1346/54.3026/56.4015/56.9578, visible54.0346/53.6026/54.1681/54.9248.106fingerprints match, all gates fail, focus/visibility stable. Both pairs favor original; keep worker verifier OFF. Worker read means4.949/1.169ms, up to7pending samples; bitmap snapshot promises average0.051/0.047ms. Extra graphics-context readback appears to offset main-thread savings; exact GPU self-time unmeasured. Read-only system snapshot found I/O pressure26.20%some/20.42%full avg10, CPU0.46%, memory0%,78C and other active desktop processes. No system processes/settings changed; this does not establish a cause for slower rates. Next bounded queue2/4/4/2 with original verifier and explicit queue-age tradeoff.

FD queue2/4/4/2 completed: all4 strict image gates PASS. Simulation60.0017/60.0022/60.0020/60.0012, render59.9350/59.9355/59.9354/59.9345, visible59.6350/59.9355/59.9020/59.8345.120fingerprints match, native960x720/nonblack1, focused/visible throughout. Queue4 drops1/2 versus queue2 drops10/3, but adds mean40.88/47.52ms versus19.62/19.49ms, p95upper61ms versus28ms. Since BOTH queue2 controls pass, keep lower-delay2 for next broader coverage first; queue4 remains an optional fallback pending need and latency assessment. This is not all-stage/all-character success. Added QA capacity/comparison controls so coverage can continue without resetting the warmed browser session.

### Battlefield Ice Climbers extends the failure beyond the FoD exception

Core a1d25a5f, original image verifier, two-image queue, two fresh matches on
an already warm core: simulation 58.2346/59.4681, render 58.1680/59.4015,
visible 57.2346/58.8348 FPS. Both 30-second gates fail at 960×720, nonblack 1,
with active native-frame two-port inputs and Nana AI retained. Focus/visibility
stayed intact. First/second queue mean ages 16.83/18.87ms; these are not physical
input-to-photon measurements. Raw selected fields are in
`benchmarks/browser-2026-09-13-battlefield-ice-climbers.json`.

The user's FoD/Ice Climbers exception is insufficient to declare success.
Next CPU hypothesis: redundant HID2.PSE/GQR0 type checks in paired-memory math
blocks. Candidate `qstatecache` is separate from the unsuccessful range-hoist
experiment. Cache exact load/store eligibility once only in conservatively
admitted blocks with at least four Q0 accesses; reject all system/SPR writes,
linked branches/HLE and unknown ops. Preserve MSR, address, fallback, arithmetic
and cycle handling. Cache lifetime is one invocation; restore doesn't reuse
state values. Actual emitted-WASM guard equivalence covers 48,000 cases,
asymmetric quantization types, PSE/FP/endianness, address boundaries, W/Q,
state changes between invocations, and read-only state. Admission/RAII tests
pass, as do existing paired-hoist/MSR/FPU guard checks and 57 benchmark tests.
Native candidate building; complete-machine replay and ABBA timing pending.
No claim yet that these checks account for a measured share of CPU time.

### Partial Q0-state cache: correctness passed; timing inconclusive, keep off

Core5ed9a8d9 normal600-frame BFIC mirror replay matched106,208,784bytes across29
sections and complete native input fingerprints. Candidate compiled172new sites.
Stepped120-frame replay matched105,129,682bytes, no tick differences,48rollbacks/
199resimulatedframes. Canonical arithmetic and all gameplay settings retained.
See qstate-running-replay.json and qstate-stepped-replay.json in benchmarks.

First OFF/ON/ON/OFF simulation45.2343/49.4021/48.4346/40.1698, visible45.2343/
49.2021/48.2012/40.0364. Both measured pairs favor the candidate, but the first
warmup tracked only1104frames and fails minimum common coverage. All gates fail.
Post-run JIT27774/65536unique instances,48138reuse,0emit/compile failures: table
exhaustion is not the slowdown. Lightweight host snapshot found elevated IO PSI
(55.39%some/47.60%full avg10), no CPU/memory pressure; this doesn't prove cause.
No processes, affinity or OS settings changed. All intervals visible/focused.

Warm repeat simulation48.7664/47.6345/48.2011/44.5349, visible48.4664/47.4345/
47.9011/44.2682,92shared fingerprints match. Opposing pairs => do not retain.
These checkpoint runs are slower than prior fresh BFIC intervals; scene/input
phase and host variability remain limits. Do not imply a measured regression
caused by the new core solely from comparisons of different match checkpoints.
Artifacts: qstate-first-comparison.json and qstate-warm-comparison.json.

Next candidate `qstatefull` separately caches MSR.FP/LE along with PSE/GQR0
in the same admitted>=4-access blocks; refresh all eligibility after continuing
helpers and exit before refresh on halt. Full mode is independent of partial
mode.192,000actual emitted-WASM comparisons cover both variants, Q/W/direction,
state changes, asymmetric types, helper continuation/halt and scope cleanup.
Eight native tests and73benchmark/replay tests pass. New native build running;
normal/stepped replays and timing still required. No runtime gain claimed.

### Full Q0 cache: equivalent replay, no demonstrated gain

Core b9f28907: 600-frame normal replay matched 106,142,456 bytes across 29 sections;
120-frame stepped replay matched 105,129,682 bytes, no differing ticks, 48
rollbacks/199 resimulated frames. Full 45s OFF/ON/ON/OFF simulation rates
48.60/39.14/58.71/58.91; visible 48.47/38.67/57.51/57.47. All 154 shared
fingerprints match. All gates fail. First candidate had a 9232.8ms image gap;
individual probe enqueue/harvest max 0.52/40.255ms cannot explain it. Do not
interpret that average as steady CPU cost. Keep off. Later read-only worker
samples show a busy dedicated worker at ~95.4% of one core; samples were after
the gap and cannot diagnose its cause. No affinity, priority or OS changes.
See qstate-full-{running-replay,stepped-replay,comparison,worker-observations}.json.

Warmed 30s Battlefield IC CPU diagnostic: CPU execution 23.730s/1,616,862 slices;
advance 4.223s; GPU decode 1.473s inside GPU callback 2.024s; direct GPU sync
0.216s; VI 1.079s/602,506 events; shader compile 0.00078s. glUniform 0.812s,
glPresent 1.275s, glDraw 0.255s. Inclusive timers overlap; do not sum. Instrumented
simulation 38.23FPS is not an AC measurement. 1506 last-PC samples include
scheduler, animation, matrix, TEV, particles and reverb; not exact self-time.
Known pad-queue polling is already handled and not evidence for another idle fix.
Artifact: battlefield-ice-cpu-profile.json.

Next bounded experiment extends existing full eligibility cache to
EmitPsqGatherPipeFloatStoreCondition, which still repeats all mode checks.
Native WriteMtxPS4x3/3x3/4x2 leaves contain >=4 eligible Q0 operations and write
matrices to 0xcc008000. Preserve the original 0x0ffff000 address mask/aliases.
Existing gather-pipe-full helper already avoids unnecessary register flushes;
do not claim it as a new optimization. Exact RAM/FIFO guard tests and replay
must pass before paired timing. Runtime ROI of these guards remains unknown.

### Q0 FIFO extension: guard and replay verification

Core96d23817 default-off FIFO eligibility reuse built successfully. Five native
tests passed, including 288,000 actual emitted-WASM RAM/FIFO comparisons with
address aliases/boundaries, asymmetric types, mode changes and helper exits.
First normal600-frame replay failed: one byte in CoreTiming.m_idled_cycles;
all remaining105,946,222 bytes, gameplay, GPU, RAM and native fingerprints match.
Stepped120 replay passes105,129,682bytes, no tick differences,48rollbacks/199resim.
Warm normal600 replay passes106,245,761bytes and identical1,484,971dispatcher
calls; candidate compiled257new cached eligibility sites.

Unchanged-code fresh control (both qstatefull/qstatecache OFF, identical configs)
also fails solely CoreTiming.m_idled_cycles (2bytes of105,879,860), all input/
state fingerprints match. Thus the isolated counter mismatch is reproducible
without this optimization; its source remains unresolved. Keep both failures
and the exact gate, do not filter this field. Candidate's successful warm full
and stepped replay justify an exploratory timing comparison; shipping still
requires accounting for baseline cold-replay variability. Artifacts:
qstate-fifo-{running-first,stepped-replay,running-warm,running-control}.json.
Next45s OFF/ON/ON/OFF uninstrumented benchmark; no gain claimed.

Q0 FIFO extension OFF/ON/ON/OFF45s: simulation49.8018/52.0160/56.1136/59.2924;
visible49.6685/51.8605/54.9358/58.0702.154shared fingerprints match; all gates
fail. Both directions disagree; keep OFF and stop this guard-cache hill climb.
All intervals visible/focused,960x720/nonblack1,normal speed/CPUclock,queue2.
One screenshot was taken during first control after stale-looking warmup status;
keep this limitation in artifact. Trend toward faster later trials requires
separating host variability from compilation/tiering; neither cause established.
Next make single-run QA selection available without reloading a warmed core,
then measure fresh coverage plus compilation-counter deltas.

Added QA-only boundary collection of modcompile/modinst/unique-instance/reuse
counters. No per-frame profiling, no acceptance override. Missing or reset
counters reject attribution; two focused tests pass. Source and staged runtime
both use it. Added comparison checkbox to preserve warmed session for single-run
coverage. No hosted-startup changes. Private server41764, same96d23817 core.
First fresh Battlefield IC single run underway with all Q caches OFF.

### Compilation attribution and Battlefield queue coverage

Fresh BFIC single30s first/warm simulation54.9348/58.5688, visible54.1014/57.5688.
Synchronous module compile/link358.068/80.358ms. Fresh BF Fox/Falco59.4705sim,
57.9370visible,62.33ms compile/link; queue dropped43rendered frames. All fail.
Boundary counters exclude native byte generation and browser background tiering.
Artifact battlefield-jit-attribution.json.

BF Fox/Falco queue2/3/3/2 sim47.9024/60.0351/60.0357/60.0347, visible
47.5357/59.8685/59.5690/59.7347. Both queue3 gates and finalqueue2 PASS;
finalqueue2 warmup alsoPASS59.8350visible.115fingerprints match. Keepqueue2
(mean20.682ms final) vsqueue3(32.809/35.739ms). First slowcontrol had zero
synchronous compilation, maximagegap61.67ms, not a multisecond freeze.
Remaining phase variability is unresolved. Read-only process samples overlap
19.035s of finalcontrol: busiestDedicatedWorker14.42CPUseconds(~75.76%onecore).
Not a call-stack sample or proof of spare real-time capacity. No OS changes.
Artifacts battlefield-three-image-queue.json/battlefield-queue-worker-observations.json.

After those passes, warm BFIC freshsingle still57.1043sim/57.0710render/
56.2381visible,50.645ms compile/link,25queued drops,meanage18.799ms,
p9532.965msgap,max55.295ms. Thus IC failure outside acceptedFoD remains.
Next QA headroom check unthrottles only host pacing, runs1200native frames,
then restores pacing and clears scripted input on success/error. Diagnostic only,
never imageAC. Native CPUclock/cycles/rendering unchanged. Tests cover exact
native timer validation, inactiveinput rejection and cleanup after workerfailure.
Private workerheadroom API uses existing paused-only nativecall; no nativebuild.
Runtime source/staged updated; original hostedstartup preserved. Server44291.

## Battlefield native throughput and time-drift experiment

The corrected uncapped 1200-frame diagnostic measured 56.9342 FPS on the first
fresh Ice Climbers mirror, then 61.9287 FPS warm. Native CPU clock and rendering
were unchanged; host pacing was temporarily uncapped and the image verifier was
absent. This is execution headroom only, not 720p60 acceptance. Separate fresh
matches had different native input traces; the warm trace contained one native
polling gap. Synchronous compile/link cost was 292.949/55.202ms. The earlier
misaligned diagnostic failed exact-frame validation and supplies no timing result.
[Recorded fields](benchmarks/browser-2026-09-13-battlefield-headroom.json).

Core e9ad5d96 adds a paused-only native CorrectTimeDrift control plus host-only
relaxation count/time/max counters. Default policy remains unchanged. Counters
record existing conceded-time adjustments, without new per-event clock calls;
they are not serialized game state. The candidate enables Dolphin's existing
time-drift correction while preserving virtual CPU speed and game execution.
Five native/front-end guard and cleanup tests passed. Next: full-state 600-frame
normal-running replay, then same-checkpoint OFF/ON/ON/OFF image measurements.
No FPS benefit is claimed yet.

Time-drift results: first replay reapplied identical codegen flags and differed
in one CoreTiming.m_idled_cycles byte, as seen in prior unchanged-code controls.
Revised pacing-only replay leaves compiled descriptors untouched and passed
600 normal-running frames:106,204,563 bytes across29 sections, zero differences.
[Both records](benchmarks/browser-2026-09-13-timing-drift-replay.json).

Same-checkpoint OFF/ON/ON/OFF measured simulation52.1647/53.2035/56.7037/59.8689,
visible52.0647/53.1035/53.9369/59.0355. All105 common fingerprints matched; every
image gate failed. First/final controls conceded3,807,726/73,747us of host time;
enabled trials conceded zero, but did not establish a speedup in both orders.
The second candidate dropped82 images; final control23. Keep correction OFF.
Final control reached normal CPU cadence but still missed visible59.5FPS.
[Comparison](benchmarks/browser-2026-09-13-timing-drift-comparison.json).
Next:2/3/3/2 image queues on the warmed Battlefield Ice Climbers mirror, measuring
added delay. GPU event scheduling remains an unimplemented CPU hypothesis; no
GPU time-slot or emulated timing changes have been made.

Warmed Battlefield Ice Climbers2/3/3/2 queue comparison passed the two candidate
measurements:visible59.5026/59.6682FPS, mean queue age34.8917/28.8469ms. First
two-image measurement failed59.0696visible at59.9696sim. Final two-image warmup
and measurement passed59.7041/59.6348visible; finalsim60.0348 and meanage17.1918ms.
All119 common fingerprints matched. All runs960×720, nonblack1, clock/speed1,
focused/visible. Keep two images for broader coverage at lower delay. The prior
Battlefield IC failures remain valid; this is new warmed passing coverage, not
a cold-start guarantee. Three images remain a measured smoothing option.
[Queue comparison](benchmarks/browser-2026-09-13-battlefield-ice-three-image-queue.json).
Read-only1Hz renderer-thread accounting overlapped part of the comparison; no
OS settings were altered and no callstack attribution is claimed.
[Observations](benchmarks/browser-2026-09-13-battlefield-ice-thread-observations.json).

Continuing with fresh-match Ice Climbers mirror coverage on Final Destination
and other tournament stages, keeping native timing correction off and queue2.

Ice Climbers stage coverage, core e9ad5d96: Final Destination first failed
59.601sim/58.968visible, repeat passed60.001sim/59.601visible. Dream Land first
passed60.000sim/59.666visible. Yoshi's Story failed two-image first/repeat:
59.567/59.499sim and58.500/58.199visible; a three-image trial also failed
59.601sim/59.168visible, increasing mean queueage to28.919ms. All native inputs
active, settings verified,960×720/nonblack1, speed/clock1, focused/visible.
These fresh matches are coverage, not a same-checkpoint optimization estimate.
[Coverage](benchmarks/browser-2026-09-13-ice-stage-coverage.json).

Prepared GPU-start scheduling experiment after Yoshi failures. Its default is
unchanged1000cycles. Candidate4000cycles affects only the first service event
when the deterministic dual-core GPU was suspended; per-burst decoding, CP
status, MMIO synchronization and non-deterministic/single-core paths retain
their original code. This changes emulated GPU scheduling, so gameplay/replay
validation is required; it is not a free graphics or host-only change. Host
counters count actual starts/callbacks. Native scheduling/paused-ownership and
frontend comparison/cleanup tests pass. Build in progress; no FPS benefit or
correctness result claimed yet. No GPU scheduling change is enabled in play.

GPU-start-delay core895f2b32:600-frame Yoshi Ice Climbers replay FAILED raw
full-state equality (110,087,616 bytes each), but complete native input records
and sampled gameplay hashes matched. Candidate4000 reduced GPU callbacks from
484,500 to167,054; dispatcher invocations1,559,148 to1,237,982. No timing gain
was measured. Differences:33,548 bytes in the broad GPU PixelEngine section
(which includes FIFO storage),26 CoreTiming bytes,18 RAM bytes. Framebuffer,
texture, CPU-register and other sections matched. Baseline1000 restored.
[First replay](benchmarks/browser-2026-09-13-gpu-start-delay-first-replay.json).

Field-level diagnostic build prepared: label unused FIFO suffix and pointer
offsets, label event-order counters, expose paused CP FIFO address bounds, and
record those bounds before/after each replay leg. Diagnostics do not normalize
or omit saved bytes; raw equality remains unchanged. Seven native/frontend
state-field, scheduling and cleanup tests passed. Inspect differences before
any FPS comparison; scheduling candidate remains disabled.
# GPU service delay: completed 45-second comparison and saved-event diagnostics

Core2e26b8b3 built and installed privately on3237. GPU600-frame replay now
records identical saved global tick and all7execution-ordered event tuples,
including GPUSleeper/DSP at the same tick in the same order. Insertion ordinals
and idle accounting differ. Raw comparison still fails:21,346GPU bytes,
26CoreTiming,15RAM,2CPU. All32reported GPU ranges are within the entire currently
unused2MiB FIFO, but2917ranges exist and the list is truncated. Do not infer that
unreported differences are all unused. RAM804d738e lies within the SDK symbol
__OSLastInterruptTime; other RAM ranges are below SP804eeaf8 in the default
stack allocation. Remaining audit open; GPU1000restored.
`benchmarks/browser-2026-09-13-gpu-start-delay-saved-events.json`.

Rush presentation600-frame ON/OFF replay PASS:110,128,135bytes/all29sections
equal, frames306..906,601polls/no skips, inputHash2617109027/stateHash4085548570.
Reference1800throttle calls/1201skips; candidate1800calls/0skips. This isolates
the existing host policy with normal virtual clock and no codegen setter.
`benchmarks/browser-2026-09-13-rush-presentation-replay.json`.

Prepared an independently toggled frame-ring console logger, with actual
batch/row counts and worker drain time. Source starts this timer unconditionally;
it can emit one console line per swap in1-second batches. Its active cost and
FPS impact remain unmeasured. The control changes no emulation state. Not yet
installed; tests and matched timing pending. New native-core FPS has been much
lower than prior f2warm results; do not assume warming is the sole explanation.
Return to f2for logger timing to avoid coupling it to new native instrumentation.

Core f2e807d6, Yoshi's Story IC/IC, two active native-frame human tracks,
1000/4000/4000/1000 cycles, two-image queue. Measured simulation rates
59.9144/59.9809/60.0033/59.9370; distinct visible rates
59.1588/59.4031/59.2699/58.6480. All gates failed. Both visible timing pairs
favor 4000 (+0.2443/+0.6218 FPS); GPU callbacks fell from about 804 to 277 per
native frame. 176 shared fingerprints and exact polling gaps matched. True
960x720 source, nonblack fraction 1, normal clock/speed, focused visible page;
no build/profiler/resource sampler during capture. Compile/link cost was
0.65/0/0/0 ms in measured intervals. Original delay restored to 1000.
Artifact: `benchmarks/browser-2026-09-13-gpu-start-delay-comparison.json`.

The f2 600-frame replay failed raw equality: 108 bytes only in CoreTiming,
109,704,081 bytes per state, 28 other sections equal including all RAM, CPU,
GPU, framebuffer, textures and audio. All native inputs/fingerprints equal.
Reference/candidate callbacks 483661/166755; dispatch calls1579283/1258221.
Actual CP FIFO occupies 6409216..6671328 and has identical empty end positions.
Artifact: `benchmarks/browser-2026-09-13-gpu-start-delay-field-replay.json`.

An earlier replay's 18 RAM bytes at guest804eddb2..804edf63 are outside this
FIFO. Local USA1.02 startup disassembly sets initial SP=804eec00; SDK thread
initialization records the default thread stack bounds804dec00..804eec00.
Thus these addresses are in that stack allocation, but whether those bytes
were live or harmless at the earlier endpoint remains unproven.

Prepared write-mode snapshot diagnostics copy/sort the event heap into an
execution-ordered JSON view with exact64-bit strings, global tick, idle counter,
next ordinal and guest PC/SP. The actual serialized heap and raw equality are
unchanged. Compare event times/types/payloads and equal-time execution order;
do not erase counter/timing differences to manufacture a raw pass.

Yoshi2/4/4/2 comparison completed: simulation59.8474/59.6037/59.8926/59.8052,
visible58.8029/59.0703/59.4259/58.8274. All eight warm/measured image intervals
failed;176fingerprints matched. Four-image measured queue age46.75/44.67ms
versus19.55/19.13ms controls. Keep two images. Saved selected metrics in
`benchmarks/browser-2026-09-13-yoshi-ice-four-image-queue.json`.

Prepared a separate paused control for Dolphin's existing RushFramePresentation
host throttle policy, with actual call/skip counters. Baseline stays enabled;
candidate OFF will be tested ON/OFF/OFF/ON using identical native-frame inputs,
normal speed and unchanged instruction configuration. It changes host waiting,
not the virtual clock, GPU event delay, camera or rules. Native paused-ownership,
64-bit event diagnostics, event-order rejection, frontend cleanup, replay and
matched-comparison tests:13PASS. All five staged affected JS modules parse.
Native build in progress; no timing/correctness claims yet for rush OFF.
### Frozen Stadium and all-stage scope

Frozen Pokémon Stadium is now an explicit remaining task. The first opt-in USA
1.02 patch replaces only `grStadium_801D4548` with an immediate return, guarded
by the exact controller prologue and a live map-2 state check. It can be applied
only while Stadium is idle on its initial neutral map, so it cannot strand a
partially loaded transformation. The patch does not change camera code. It
still needs long-run stage-state, visual-framing, and performance validation.
Any gain is Stadium-specific and does not count as progress for the other five
tournament stages.

### Animation specialization follow-up and benchmark-context clarification

The accepted constant/linear `HSD_FObjInterpretAnim` specialization on core
`172876d5` passed 120- and 600-frame full-machine replay and improved the
symmetric measured Yoshi's Story Ice Climbers mirror mean from 45.2284 to
49.1294 simulation FPS (+8.625%). The individual controls were 42.1526 early
and 48.3043 late, demonstrating substantial browser warmup/tiering drift. A
single number from a different checkpoint or workload is not a stable build
baseline. Current Battlefield Fox/Falco measured 56.1016 simulation / 55.6683
visible FPS, while the deliberately harsh Yoshi IC/IC workload is the sub-50
case. The older 57.60/56.63 candidate versus 58.67 control quote referred to a
different earlier checkpoint and only rejected that counter experiment.

Three broader animation changes were measured and reverted. Directly entering
the JObj callback produced +8.705% total uplift, indistinguishable from the
accepted +8.625%. Entering Melee's original spline body through the host raised
direct coverage from about 27k to 59k of 62k common updates but regressed
simulation FPS 3.261%. Reimplementing the complete Hermite body with exact
instruction-order rounding regressed 2.234% and had inconsistent 600-frame
CoreTiming insertion-order equality. Generated guest spline WASM is faster than
these C++ crossings. The accepted constant/linear implementation remains.
Artifacts: `benchmarks/browser-2026-09-14-animation-linear-abba.json`,
`benchmarks/browser-2026-09-14-animation-callback-fusion-rejection.json`,
`benchmarks/browser-2026-09-14-animation-spline-entry-rejection.json`, and
`benchmarks/browser-2026-09-14-animation-hermite-host-rejection.json`.

An isolated matrix-fast repeat on the accepted core removed the earlier hidden
`callfusion` coupling. It executed 5,573,716 exact host matrix calls with only
128 floating-point-state fallbacks, but the symmetric simulation mean fell from
45.3218 to 43.4399 FPS (-4.152%). Keep both `matrixfast` and `callfusion` off.
This is direct evidence that a high-coverage generated-Wasm-to-C++ transition
can lose more time than the specialized guest arithmetic saves. The image
benchmark harness now treats matrix comparison as an isolated flag. Artifact:
`benchmarks/browser-2026-09-14-matrix-fast-isolated-rejection.json`.

The expanded direct `GXCallDisplayList` wrapper is the first large follow-up
gain. Unlike the earlier 17%-coverage version, dirty GX calls execute the
original `__GXSetDirtyState` guest handler and rejoin specialized suffix/tail
code. It handled 1,979,074 cumulative calls with zero fallbacks; 1,637,698 took
the dirty continuation. Yoshi IC/IC measured OFF/ON/ON/OFF simulation FPS of
42.2399/47.2316/48.0312/44.4028. The symmetric mean improved 43.3214 to
47.6314 (+9.949%); both candidate legs beat both controls. All image gates
remain below 60. The first warmup had fewer than 1200 native input frames, so
the aggregate input-consistency field is false even though measured legs had
no polling gaps. Retain as a candidate pending full-machine replay with the
accepted animation path held on. Artifact:
`benchmarks/browser-2026-09-14-display-list-expanded-image-abba.json`.

Two 600-frame normal-running comparisons held `animstatefast` on in both legs.
The second candidate executed 195,619 wrapper calls, including 161,963 dirty
continuations, with zero fallbacks. Both comparisons matched all RAM, CPU, GPU,
framebuffer, texture, audio, scene-frame, input and gameplay fingerprints. Raw
state still fails on 17 CoreTiming bytes: idle accounting and insertion
ordinals. Scheduler diagnostics show the same global timer and the same seven
pending event times, types, payloads and execution order; only their monotonic
IDs differ. Preserve the raw failure, but retain the performance candidate for
broader coverage. Artifact:
`benchmarks/browser-2026-09-14-display-list-expanded-replay.json`.

The post-display-list sampled profile still attributes recurring work to the
GX matrix submission chain: `GXLoadPosMtxImm`, `__GXSetMatrixIndex`, and their
HSD index/setup callers. An isolated `gxmatrixfast` candidate revision-locks
both USA 1.02 functions and directly emits their identical FIFO values while
preserving registers, CR, paired-single results, stack writes and original
cycle/performance-monitor charges. Unsupported FP, HID2, GQR0, endian or RAM
states fall back before mutation. The 600-frame Yoshi IC/IC replay exercised
634,873 calls with69 fallbacks. Inputs, fighters, gameplay fingerprints, CPU
registers and all current rendered GPU sections matched. Raw state still fails:
19 CoreTiming bytes, one RAM byte and three GPFifo bytes differ. Do not claim
raw equivalence. Artifact:
`benchmarks/browser-2026-09-14-gx-matrix-running-replay.json`.

The controlled 960x720 image A/B/B/A measured simulation
52.6001/54.0650/54.0345/50.2005 and visible
52.5001/53.9983/53.9679/50.1339 FPS. Candidate legs beat both controls;
symmetric means improve51.4003->54.0498 simulation (+5.155%) and
51.3170->53.9831 visible (+5.195%). One identical native-frame polling gap
appeared in every measured leg, so100 sampled input/gameplay fingerprints
match. Every strict60FPS gate still fails. Retain only as an experimental
candidate pending broader replay/state work. Artifact:
`benchmarks/browser-2026-09-14-gx-matrix-image-abba.json`.

The first post-GX direct-block profile confirms that the specialized position
matrix functions disappeared from the sampled guest workload. `GXLoadNrmMtxImm`
accounted for only 195 sampled microseconds, making a matching normal-matrix
specializer a low-ROI follow-up. The larger new finding is diagnostic overhead:
in one 30-second run, the four accepted/experimental specializers published
77.8 million run-counter increments, plus branch-specific counters. These are
atomic read-modify-write operations inside the hottest callbacks. A runtime
`leandispatch` experiment now suppresses those publications while retaining
all emulation and rendering work. Its isolated 960x720 image A/B/B/A measured
mean simulation FPS 56.8520->57.3697 (+0.911%) and visible FPS
56.0353->57.0030 (+1.727%). Both paired candidate legs improved visible
delivery; mean p95 gap fell 4.73 ms, dropped frames fell 21->8, and underruns
fell 104.5->76. All 112 sampled native-input/gameplay fingerprints matched.
Retain the counter suppression; replay still has to confirm that the release
counter build records no specializer telemetry. Artifacts:
`benchmarks/browser-2026-09-14-post-gx-profile.json` and
`benchmarks/browser-2026-09-14-specializer-counters-image-abba.json`.

The counter-suppressed release path then passed a 600-frame ordinary-running
Yoshi IC/IC replay against the identical retained code with counters enabled:
110,108,838 bytes matched across all 29 machine-state sections, including RAM,
CPU, GPU, DSP and CoreTiming. Native input/state hashes and the ending scene
frame matched with no polling gaps. The control published 1,623,094 aggregate
specializer run counters; the candidate published zero while retaining all
three enabled specialization modes. Promote `leandispatch` for release play.
Artifact:
`benchmarks/browser-2026-09-14-specializer-counters-running-replay.json`.

Combining the accepted counter suppression with dry audio brought both measured
Yoshi IC/IC candidate legs close to the simulation target: 58.9349 and 59.0698
FPS at 960x720. Visible delivery was 58.1682 and 57.5697 FPS, so the strict gate
still fails. The A/B/B/A symmetric mean favors dry audio by +1.134 simulation
and +1.017 visible FPS, but the adjacent pairs oppose because the browser
warmed strongly between the opening and closing controls. Retain the earlier,
smaller repeatable reverb evidence; use this run only as combined near-target
evidence. Artifact:
`benchmarks/browser-2026-09-14-counter-free-reverb-image-abba.json`.

An animation boundary experiment leaves spline and other unsupported tracks in
generated guest WASM before mutating host state, avoiding about half of the
`FastMeleeAnimStateProbe` C++ entries in a 120-frame Yoshi IC/IC replay. A
30-second 960x720 OFF/ON/ON/OFF comparison measured symmetric means of
53.2771->55.0881 simulation FPS (+3.399%) and 52.5110->54.3880 visible FPS
(+3.574%). All 104 shared native-input/gameplay fingerprints and polling gaps
matched. The 120-frame replay matched RAM, CPU registers and caches, timing,
fighters, inputs, and gameplay state, but three bytes differed in one GPU
TextureCache `Texture config` descriptor; its unchanged-codegen control was
fully exact. Keep this as an unpromoted candidate, repeat the strict replay,
then measure it on the accepted counter-suppressed/two-image-queue baseline.
Artifact: `benchmarks/browser-2026-09-14-animation-guest-fallback-image-abba.json`.

The immediate strict-replay repeat passed all 109,580,237 bytes across 29
sections, including the complete 16,086,019-byte texture cache. Inputs,
gameplay fingerprints, scene frame and timing were exact. The candidate reduced
animation host-callback entries from 63,170 to 30,923 over 120 frames. On the
counter-suppressed, dry-audio, two-image-queue stack, a second OFF/ON/ON/OFF
comparison measured symmetric means of 53.9351->57.3375 simulation FPS
(+6.308%) and 53.1850->56.3374 visible FPS (+5.927%). All strict FPS gates
still failed. Retain the candidate and test it with the independently retained
FPU guard. Artifact:
`benchmarks/browser-2026-09-14-animation-guest-fallback-retained-stack.json`.

Persistent generated-block bundling sharply reduced remaining JIT construction
without closing the throughput gap. A warmed 34,449-function, 20.39 MiB bundle
reduced synchronous compile/link work to 23.186 ms over 30 seconds and measured
59.4702 simulation / 58.5035 visible FPS on Yoshi IC/IC. A following direct
GPU-pthread-to-page bitmap port trial measured 59.2364 simulation / 58.6364
visible FPS with 17 dropped images and 39 queue underruns. The +0.133 visible
FPS and -0.234 simulation FPS changes are within observed run variation; retain
the port as a presentation simplification, not as a material CPU win.

Reducing the Emscripten pthread pool from 16 to 8 did not compose with the warm
bundle. A cold adjacent pair weakly favored eight workers by 0.662 FPS, but the
combined eight-worker bundle/direct-port run reached only 58.5335 simulation /
58.2335 visible FPS, below both 16-worker bundled runs. The original 16-worker
wrapper is restored. A delivery-only run without timed pixel verification
measured 56.9207 simulation / 56.4209 delivered FPS while requestAnimationFrame
continued at 60.0201 FPS. This rejects JIT construction, verifier readback and
worker-pool size as explanations for the full remaining gap. The hot emulator
worker and animation/matrix profiles remain the evidence for CPU execution as
the active constraint. Artifact:
`benchmarks/browser-2026-09-14-bundle-worker-delivery.json`.

The revision-locked `parseFloat` specialization at 0x8036ac10 passed the strict
120-frame replay: all bytes in all 29 machine-state sections matched. It covers
the complete 0x1cc-byte GALE01 1.02 function and its raw f32, S8, U8, S16 and
U16 encodings while preserving memory, stack, volatile registers, floating
state and original instruction charges. Warm 960x720 samples varied from about
58.4 to 59.5 simulation FPS. The best guarded-tier run reached 59.94 simulation
/ 59.30 visible FPS, but a repeat reached 59.34 / 58.40, so the strict sustained
gate remains unmet. Mixed JIT tiering reached only 51.37 FPS from a fresh load
because of compilation work, and `pace=latest` reduced latency while lowering
visible delivery to 57.37 FPS. Keep the exact specialization and reject both
mixed tiering and latest-only presentation as release defaults.

Rebuilding with direct WASM dispatch explicitly selected produced the identical
core bytes, confirming that direct dispatch was already compiled in. This was a
configuration false lead rather than an additional optimization.

Deferring the gather-pipe check until a complete 32-byte burst was also rejected.
The corrected candidate preserved gameplay fingerprints and fighter state, but
the strict replay changed 23 CoreTiming bytes, 19 RAM bytes and 12 HW GPFifo
bytes. A check boundary is observable GPU scheduling state even when the same
FIFO bytes are eventually submitted, so the experiment was removed.

The warmed post-`parseFloat` profile measured 58.9363 simulation / 58.4696
visible FPS. `parseFloat` is absent from the hot list. `HSD_FObjInterpretAnim`
now accounts for 25,091.844 of 240,777 sampled microseconds (10.42%) across 41
blocks; the next function, `SetupEnvelopeModelMtx`, is only 1.95%. The best
remaining structural target is therefore a function-local generated-WASM path
that keeps spline math in guest WASM while eliminating repeated block-map and
indirect-dispatch work. Any such path must retain every original block timing,
pause, step, exception and branch boundary and pass the complete replay before
timing. Artifact:
`benchmarks/browser-2026-09-14-post-parsefloat-profile.json`.

A revision-locked hot-store fusion experiment allowed direct MEM1 integer stores
inside the accepted 14 hot-function fused ranges while keeping imported and
non-MEM1 writes on exact checked fallback exits. The isolated 600-frame Dream
Land IC/IC replay passed byte-for-byte across 105,788,668 machine-state bytes;
both configurations used lean dispatch and all input/state hashes matched. The
30-second A/B/B/A symmetric mean fell from 47.9658 to 47.0412 simulation FPS
(-1.928%) and from 47.9158 to 46.9912 visible FPS (-1.930%). Other loaded
browser workers depressed the absolute rates, but alternating order still
rejects the candidate: it lost about the same amount in simulation and visible
delivery. Remove hot-store fusion and keep stores as fusion boundaries.
Artifact: `benchmarks/browser-2026-09-14-hot-store-fusion.json`.

A revision-locked Dream Land IC/IC replay then measured the remaining animation
branch mix with lean counter suppression disabled. Both 600-frame legs matched
all 105,768,125 machine-state bytes. Of 2,646,401 cumulative interpreter calls,
87.70% were active state 5. Opcode 4 (`HSD_A_OP_SPL`) alone was 20.39%; the
unsupported spline/slope opcodes 3–5 totaled 30.95%. Opcodes 1–2, which the
accepted direct interpolation handles, totaled 56.75%. This rules out another
generic optimization guess and identifies the local spline control-flow path as
the only remaining animation target of comparable size. Earlier C++ entry and
host-Hermite versions regressed, so the next experiment retains the original
PowerPC math in generated WebAssembly and fuses only revision-locked local
conditional fallthroughs. Counter timing is diagnostic only. Artifact:
`benchmarks/browser-2026-09-14-animation-op-distribution.json`.

The revision-locked animation conditional-fallthrough fusion keeps the original
PowerPC spline math in generated WebAssembly and removes only local block-map
and indirect-dispatch boundaries inside `HSD_FObjInterpretAnim`. Every original
segment still commits its PC and cycle budget, checks the normal stop boundary,
and redispatches to the actual NPC when a conditional branch is taken. An
immediate 600-frame Dream Land IC/IC repeat matched all 105,809,375 bytes across
29 machine-state sections, including RAM, CPU, GPU, DSP and CoreTiming, with
identical input and gameplay hashes. The first candidate attempt and an
unchanged-codegen control both differed only in absolute CoreTiming ordering
counters, exposing checkpoint reapplication noise; the immediate candidate
repeat was byte-for-byte exact, so promotion rests on that exact repeat rather
than on ignoring any state section.

The 30-second 960x720 OFF/ON/ON/OFF comparison measured symmetric simulation
means of 57.5365 -> 59.1031 FPS (+2.723%) and visible means of
57.1865 -> 58.7531 FPS (+2.740%). Candidate measurement legs reached
59.0024/59.2039 simulation and 58.5690/58.9372 visible FPS. All 111 shared
native-input/gameplay checks matched, the source image remained 960x720 and
nonblack, and no camera or projection code changed. Retain the fusion. The
strict sustained visible-FPS gate still fails on Dream Land IC/IC by about
0.56-0.93 FPS in the two measured candidate legs. Artifact:
`benchmarks/browser-2026-09-14-animation-conditional-fusion.json`.

The previously accumulated native changes were living only in the ignored
engine checkout, so the candidate manifest could list historical patches
without reproducing the actual source used to build it. Two consolidated
patches now close that provenance gap: `browser-720p60-engine.patch` applies to
the pinned wasm-dolphin checkout, and `browser-720p60-vendor.patch` applies
after the locked upstream Dolphin snapshot. Both patches were applied in a
fresh temporary worktree and every changed or added source file was compared
byte-for-byte with the benchmarked checkout.

September 14 browser release correction: a private native Dolphin reference
and an automatic-hosted static browser package ran the same Dream Land 64 Ice
Climbers spawn. Their camera interest, position, FOV 30, and zero pitch/yaw
offsets agreed exactly at early idle match frames. The old release packager
copied the generated WebGL JS loader without the existing reversed-depth
compatibility bridge: the tree hid the foreground P1 and the water was missing.
Correcting comparisons, clear depth and the utility clear shader restored the
fighters, tree face and water in a visually inspected 960×720 native-like image.
The release selects a `depth-v2` loader URL so a previously immutable cached JS
cannot serve the wrong renderer. WASM and game logic are unchanged. A clean
corrected 30-second package leg reached 52.998 simulation / 52.031 distinct
visible FPS, 960×720, Dream Land IC/IC, four stocks, eight minutes, no items.
No same-checkpoint raw/corrected speed comparison was claimed: older near-60
raw-loader timings are not visually valid acceptance runs. An idle Chrome RAF
probe reached 60.014 Hz, ruling out an immediate browser display-cadence cap.
The candidate core carries a source patch snapshot whose hash differs from the
current retained engine patch, although its recorded local source inputs still
match; do not publish a source reproduction claim for this binary from the
current patch. See `benchmarks/browser-2026-09-14-depth-release-validation.json`.
