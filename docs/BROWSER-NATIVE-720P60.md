# Direct-port every-frame 720p60 diagnostic

This milestone adds sustained every-forward-frame measurement to the direct
C-to-WASM port. It does not use Dolphin. Production rooms remain three-frame
lockstep; the snapshot/replay integration is still diagnostic-only.

## Final measured result

Each gameplay run draws all 1,800 forward frames. The local runs cover about
30 seconds; overloaded rollback runs take longer in wall time. Slash-separated
client values identify the two independent Chrome processes on the same host.

| Workload | Mode | Simulation FPS | Captured FPS | Capture gap p95 / max, ms | Diagnostic gate |
| --- | --- | ---: | ---: | --- | --- |
| Battlefield Falco/Fox | local | 59.93 | 59.98 | 18.10 / 34.12 | Pass |
| Fountain ICs/Peach | local | 59.95 | 60.01 | 18.60 / 33.29 | Pass |
| Battlefield Falco/Fox | rollback | 48.69 / 48.86 | 29.09 / 28.23 | 55.11 / 85.99; 55.54 / 88.14 | Fail |
| Fountain ICs/Peach | rollback | 40.57 / 40.56 | 20.64 / 21.53 | 64.75 / 110.31; 63.79 / 97.67 | Fail |

Both local trials have nonblack, distinct sampled captured images, unchanged
native camera/projection and zero differing bytes against the fresh final pixel
oracle. They pass the declared diagnostic tolerances, not complete tournament
certification. Every rollback client converges to its on-time full-state hash
and its peer, but fails the frame-rate gate. Replays remain unpresented.

With capture disabled, Battlefield local simulation remains approximately
60 FPS and rollback reaches 54.74 / 54.87 FPS. The observer affects cost, but removing
it does not solve rollback. The changing-pattern calibration captures about
60 FPS through the same observer. Physical presented FPS, actual compositor
drop counters and input-to-photon latency remain unavailable.

Native simulation costs roughly 0.35–0.68 ms per forward frame in these trials.
The delayed-input boundary spends about 8–11 ms submitting a draw, another
8–9.5 ms capturing/restoring the presentation state, plus checkpoint/replay
work. A complete correction averages about 10–13 ms when one occurs. These
measurements identify the presentation/snapshot boundary as the current blocker;
they do not support returning to emulator CPU tuning.

All six stage convergence/pixel regressions pass. The 600-frame production-room
check passes; results/rematch covers native elimination at frame 806 and the
accelerated 28,800-step timeout. The full suite passes 575 tests with ten skips
and no failures. The timeout regression is not an eight-minute real-time test.

## What the harness measures

Run `node scripts/native-port/probe-certification.mjs --mode=local --frames=1800`
for local play, or `--mode=rollback` for two independent Chrome processes with
15/85/40/130/65/105/25 ms real delayed, reordered WebSocket input delivery.
Use `--map=fountain --pair=Pp,Pe` for Ice Climbers/Peach. The fixed combat
packets come from an on-time reference trajectory, not predicted peer state.
There are no fighter, timer, stock or outcome writes to create the workload.
The diagnostic loads hosted assets automatically. Audio is a deterministic
journal; this is not sound-effect or production-room certification.

Every advanced forward frame is drawn. A fixed 60 Hz debt clock advances at most once
per animation callback, including on high-refresh displays, so overloaded gameplay slows down rather than skipping
simulation or intermediate forward pictures to report a higher FPS. Replays
never draw. The 960×720 canvas sits unscaled at x=160 in a black 1280×720
presentation. The renderer retains native C camera/projection, and checks its
original matrices and clip coefficients on every draw. Post-run cached and
fresh renderers must produce identical complete RGBA buffers and camera values.
That establishes equivalence to the existing direct-port renderer, not retail
visual parity or complete gameplay correctness.

`local` retains the ordinary live renderer and its native draw-side writes.
`isolated` draws every frame through the detached snapshot boundary without
network prediction, separating that cost from rollback. `rollback` adds the
existing bounded predictor and replay kernel. Isolated/rollback final complete
state must match the on-time reference. Local full memory is expected to differ
because it retains render allocations/writes; measured fighter fields are
reported separately. Render-write dependency auditing remains unfinished.

Reported timings separate native simulation, replay simulation, complete
corrections, renderer construction, draw submission, presentation checkpoint
capture/restore, cleanup, and the complete forward callback. Correction timing
includes rewind and replay checkpoints; it must not be added to the inclusive
advance time again. Final convergence hashing and fresh-renderer pixel checks
are outside the throughput interval. Startup/Ready-Go precedes the interval;
first combat shader/cache misses remain included. Final input confirmation is
included in elapsed simulation throughput for rollback.

An independent canvas-capture track requests a browser video frame for each
submission. A worker reads each delivered VideoFrame, records its browser
media timestamp and dimensions, and hashes a 96×72 RGB sample. Game resolution
remains 960×720. Counts distinguish requested, delivered, unobserved, black,
repeated sampled images and distinct sampled images. Gaps use delivered media
timestamps. The first sample is conservatively excluded because captureStream
can emit an automatic bootstrap image before any request. Unobserved request
counts are estimates: the API does not attach our forward-frame identity.
Missed 60 Hz slots are estimates from gap duration, not compositor
drop counters. Identical images can be legitimate hitlag; sample hashes are not
full-frame identity proof. The worker keeps readback off the simulation thread,
but still consumes GPU/media/CPU resources. `--observer=0` is the timing control.
`--mode=calibration --frames=600` feeds a changing WebGL pattern through the same
observer to check that the capture pipeline can exceed 59.5 FPS on this host.

These are **captured-frame FPS, not physical display or input-to-photon latency**.
Headless Chrome has no measured monitor scanout. No latency claim is inferred
from draw duration, requestAnimationFrame, network delay or capture timestamps.
The report always sets `performanceCertified: false`; even a local diagnostic
pass does not certify tournament completeness or the production transport.

The narrow diagnostic gate requires at least 1,800 forward frames, actual combat
contact, every forward frame drawn, exact final camera/pixel reconstruction,
exact state convergence when detached, at least 59.5 simulation/submission FPS,
submission p95 ≤20 ms and max ≤50 ms, and at least 99% observed capture coverage
at ≥59.5 captured FPS with no black/wrong-size frames. It is a declared tolerance
for the local experiment, not a relaxation of the product's 720p60 requirement.
The runner persists failed gates as completed measurements. Exceptions write a
failure report and exit nonzero. Each new run removes old report/failure files,
records served source/core hashes and host identity, and accepts `--label=...`
for A/B evidence. Output, screenshots and game fixtures remain ignored.

## Optimizations and evidence

The CPU profile identified repeated immutable archive parsing in renderer
reconstruction, and exact snapshot scanning as the largest single hot routine.
The match-scoped GPU asset cache now also retains parsed hosted archive metadata
and static GPU identity. It never caches native owner/polygon bindings or reads
from rewindable memory as an immutable source. Fresh reconstruction remains the
pixel oracle. A 600-frame isolated Battlefield comparison reduced mean renderer
rebind time from 1.08 ms to 0.37 ms; complete throughput was still below target.

The project-owned snapshot SIMD helper now compares four 16-byte vectors per
loop with an OR of all differences, retaining exact bitwise equality and full
64 KiB coverage. Tests exercise every byte lane of the first and last 64-byte
blocks and existing random checkpoint/restore equivalence. No memory region is
omitted or considered permanently clean. This targets scan branch overhead;
it does not remove the full-memory bandwidth cost or change game code.

Final results and regression references are recorded in
[the measurement artifact](benchmarks/browser-2026-09-17-native-port-720p60.json).

Rollback clients share this host's CPU/GPU/memory bandwidth. Local trials use
one Chrome process; rollback trials use two. Their difference is not a pure
networking overhead measurement. The isolated mode and observer-disabled
controls separate parts of the cost, but a two-machine WAN trial remains
necessary before extrapolating these localhost results.

A separate alternating old/new microbenchmark compared 58,982,400 committed
nonzero bytes per scan: old 8.88/8.46 ms, new 6.74/7.19 ms (about 20% lower mean).
An earlier all-zero-page microbenchmark gave a larger improvement, but is not a
representative complete-game memory workload. Neither is a frame-rate claim.
The isolated 600-frame browser comparison reduced mean capture from 4.52 to
3.70 ms after SIMD widening; host/load variance and the remaining frame-budget
failure are retained in the evidence rather than treating a microbenchmark as
proof of 60 FPS.

## Remaining work

The high-value architectural change is a renderer whose native allocations and
JS bindings remain coherent across rewind, eliminating the extra presentation
checkpoint/restore on every forward frame. That requires auditing native draw
writes and explicit invalidation/rebinding of restored objects before it can
replace the current conservative boundary. Simply keeping JS pointers alive
under a full-heap restore is unsafe and is still rejected by the store.

The complete-state and full-pixel regression oracles must remain while that
boundary changes. Shader/asset misses, GPU submission work, exact checkpoint
capture, and correction replay still need room within the same 16.67 ms budget.
All-character/tournament interaction coverage, audio/SFX commitment, speculative
endings and reconnect recovery remain independent requirements. None is waived
by local combat throughput.
