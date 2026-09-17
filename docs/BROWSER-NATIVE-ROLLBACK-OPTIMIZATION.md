# Exact page snapshots and reusable presentation assets

This extends the correctness prototype from `197ee12`. It remains a development
diagnostic; the production room transport still uses three-frame lockstep.
There are no changes to Dolphin, tournament rules, input mappings, camera
projection, the hosted no-ISO flow, or player-facing defaults.

## Snapshot boundary

The full-copy implementation remains the reference oracle. The new store
represents the same complete memory with independently reference-counted 64 KiB
pages. Capture compares every byte with the prior checkpoint's corresponding
page. Equal pages share storage; changed pages own copies. All-zero pages share
one immutable zero page across addresses as well as checkpoints. No region is
classified as unimportant or assumed immutable from a training run. Mutable
WASM globals and the deterministic audio journal retain the original boundary.

The small, project-owned `snapshot-page-kernel.wat` compares 16 bytes at a time
using bitwise SIMD, copies pages into a separate memory, and restores contiguous
ranges. Its generated JavaScript module embeds only this helper's bytecode, not
game code/data. Regenerate it with `node scripts/native-port/build-page-kernel.mjs`;
the tests check the source identity. Browser support is checked with
`WebAssembly.validate`; the exact JavaScript comparator remains the fallback.
The helper's memory contains snapshot storage, not a second running game.

An initial version compared all pages before restore. This reduced retained
memory but made restore slower than full copying. The retained version writes
every target page, coalesces adjacent stored ranges, and fills zero ranges.
It does not omit unused stack/heap bytes. Hashing reconstructs the complete
memory and uses the same SHA-256 format as the full-copy implementation.

The page pool recycles released slots. Failed capture returns tentative slots;
released ancestors cannot invalidate newer checkpoints. Metrics distinguish
referenced page bytes from allocated pool capacity (which grows in chunks and
does not shrink until disposal). Neither metric includes the live game heap,
GPU objects, all JavaScript metadata, or transient full-memory hash buffers.
The memory budget applies to referenced page bytes. Memory growth across a
checkpoint, changed function tables, attached native render receivers, and an
aborted runtime still fail explicitly.

## Renderer ownership

Native bindings and all renderer-owned WASM allocations are still disposed
before any restore. A match-scoped cache now preserves only:

- decoded immutable hosted model geometry;
- compiled programs keyed by complete shader source;
- immutable GPU mesh buffers/VAOs (shape/deformation models are excluded);
- GPU textures whose complete image/mipmap and palette bytes match the newly
  restored memory byte for byte.

The cache does not preserve native owner/node/polygon bindings, pointers to
renderer scratch buffers, camera snapshots, or queued uniforms. Those are
rebuilt from the restored state. It allows one active renderer lease and one
WebGL context; cache disposal rejects active leases. Live-memory texture bytes
are copied for validation, not retained as views into rewindable memory. Changed
content at a reused address invalidates the cached texture. The initial native
Ready/Go rendering populates the same cache, avoiding another cold upload after
the first correction.

The final corrected canvas is compared byte for byte against a fresh uncached
renderer at the identical restored state. This checks all 2,764,800 RGBA bytes
of the 960×720 canvas. It establishes cache equivalence to the existing renderer,
not visual equivalence to retail Melee. The fresh comparison draw is excluded
from presentation timing and forward-frame counts.

## Validation and measurement

See [the optimization evidence](benchmarks/browser-2026-09-17-native-port-rollback-optimization.json)
for the final stage matrix, exact hashes, pixel comparisons, timing samples,
memory accounting, combat coverage and test results. Full-copy/no-cache control
runs use the same WASM and controller sequences as the optimized runs. Real
packet delivery timing changes correction counts; per-operation means are not
matched correction-throughput measurements.

Final local controls and optimized runs, averaged across both browsers:

| Workload | Measurement | Full copy / fresh GPU assets | Exact pages / retained GPU assets |
| --- | --- | ---: | ---: |
| Battlefield, Falco/Fox, 240 frames | Mean capture | 13.68 ms | 4.54 ms |
| Same | Mean restore | 3.89 ms | 3.02 ms |
| Same | Mean presentation operation | 217.68 ms | 16.78 ms |
| Same | Reported retained snapshot peak | 454.8 MB | 43.5 MB |
| Fountain, ICs/Peach combat, 1,800 frames | Mean capture | 17.84 ms | 4.69 ms |
| Same | Mean restore | 4.33 ms | 3.51 ms |
| Same | Mean presentation operation | 290.39 ms | 18.01 ms |
| Same | Reported retained snapshot peak | 546.2 MB | 61.5 MB |

The full-copy peak is sampled at kernel checkpoint creation; the optimized
value includes all referenced pages at every capture. The optimized pool's
allocated capacities are 46.2 MB and 63.0 MB respectively. These are snapshot
storage measurements, not browser-process RAM totals.

All six stage trials converge to the full reference hashes from `197ee12`, and
both browsers' final canvases match fresh reconstruction with **zero differing
RGBA bytes**. The long ICs/Peach combat case also matches the fresh full-copy
control: 190 hitlag frames, 1,617 frames with nonzero damage, 907 attack frames,
and no stock losses. Nana and Fountain's platform motion remain present. Its
two clients perform 165/149 corrections and 863/943 replayed frames. A separate
600-frame Falcon mirror also converges. No trial presents replayed frames.

The final six-stage scripted matrix performs these corrections/replays
(browser 1 / browser 2): Battlefield 17/18 and 84/93; Yoshi's Story 17/19 and
83/96; Stadium 18/17 and 89/88; Dream Land 18/19 and 90/91; Final Destination
17/20 and 89/97; Fountain 124/120 and 606/568. All except Fountain run 240 forward
frames per browser; Fountain runs 1,800.

The repository suite passes 570 tests with ten skips and no failures. The
600-frame production lockstep check and results/rematch regression pass; the
latter covers native stock elimination and the accelerated 28,800-frame timeout,
not a real-time eight-minute network test.

The probe still presents only once per 60 forward simulation frames and uses a
16-ms scheduling delay. These measurements are **not sustained distinct 60 FPS**,
nor input-to-photon latency. The retained asset cache and page store are opt-in
through the diagnostic and are not enabled in production rooms.
Presentation-operation timing excludes the pre-draw checkpoint capture and
simulation work. The final scripted Fountain run still spikes to 63 ms; the
long combat case reaches 41 ms. Even the improved means leave insufficient
evidence for a complete live 16.67-ms frame budget.

Reproduce the optimized diagnostic with `node scripts/native-port/probe-rollback.mjs`.
Add `--snapshot=full --gpucache=0` for the control, or
`--map=fountain --pair=Pp,Pe --frames=1800 --workload=combat` for the long combat
case. All fixtures load automatically from the development host; screenshots,
raw reports and build outputs remain ignored, with no game assets committed.

## Remaining blockers

The boundary still discards native render-side writes after each diagnostic
draw. Their gameplay dependencies need an audit before this can drive ordinary
rendered matches. Rebinding native objects and checking texture bytes still cost
time, and newly encountered assets/shaders can incur cold work. Snapshot scans
and replay also need room within the live 16.67-ms budget; smaller snapshots do
not establish that budget by themselves.

Production still needs authenticated input delivery integration, confirmed-frame
acknowledgements, speculative-ending commitment, audio/SFX commitment and
deduplication, reconnect recovery, and sustained presentation/latency tests with
broader roster and interaction coverage. None is implied by convergence in the
isolated correction diagnostic.
