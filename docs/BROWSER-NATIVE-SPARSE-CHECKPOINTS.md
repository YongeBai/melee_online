# Exact sparse checkpoints — September 17, 2026

This experiment continues `c8585eb`'s browser-native port. It targets checkpoint
capture and correction tails; native simulation, renderer callbacks, camera,
960×720 picture, stage behavior and production lockstep remain unchanged.

## Coverage and restore proof

The audited core marks every native store/copy/fill in an independent 4 KiB
bitmap. Host writes remain covered by pinned, reviewed source. Previously the
presentation replica exclusively consumed those marks; checkpointing scanned all
memory and a restore dirtied all memory again.

A subscription hub now distributes each native mark to every active consumer
before consuming it. Checkpointing and presentation have independent pending sets.
One consumer clearing its pending set cannot erase another's history. Replica
synchronization itself marks its destination ranges for other consumers. The hub
rejects reused roles, wrong runtime identity and memory growth/stale heap views.
The instrumentation and original core digests are unchanged.

Checkpoint storage still uses exact, reference-counted 64 KiB pages. It maintains
a live baseline belonging to an owned checkpoint and the union of all writes
since that baseline. A capture reuses a page without scanning only if no 4 KiB
mark overlaps it. Marked pages still use the original exact SIMD/JS comparison,
zero detection and owned copy. Globals and the deterministic host/audio journal
are captured every time, regardless of memory marks.

For a restore to checkpoint S, page i is skipped only when both hold:

1. No write mark overlaps page i since the live baseline B.
2. B and S reference the same immutable owned page object at i.

The first condition proves current bytes equal B; the second proves B equals S.
Every other page is copied in full from S, including zero/unused bytes. Copying
marks only the written ranges, which remain pending for replica synchronization.
The checkpoint subscription then establishes S as its new baseline. If its live
baseline is released, the store drops that proof and falls back to full coverage.
No hash, sampled bytes, assumed cosmetic region or arbitrary page omission is used.

All mutable WASM globals and the host/audio journal restore even when zero memory
pages need copying. The copy kernel and pinned dirty-mark helper use no gameplay
mutable globals. Table-entry identity, detached-renderer, abort, memory-size and
heap-view guards remain. A sparse store requires the audited host-mark function.
The existing starting checkpoint is reused during correction; intermediate replay
steps perform simulation and journal updates without presentation/audio emission.
Only the corrected current state is presented.

## Independent controls and instrumentation

`--sparserestore=0` uses full capture comparison/full restore under the same
instrumented harness. Sparse mode is enabled only with the audited dirty core;
the general paged-store API defaults to the full path. No production rollback
transport is enabled.

`--snapshotaudit` compares *every* captured page to current memory and every
restored page to the chosen checkpoint, using the same complete contents a full
restore would produce. `--dirtyaudit` additionally verifies the complete replica
memory before each draw. These audits are separate from performance runs.

The report separates checkpoint lookup, total restore, restore page selection,
restore copying, globals/journal restoration, individual replay steps, forward
checkpoint capture and replay checkpoint recapture. Existing measurements retain
replica synchronization, renderer construction, draw submission, disposal and
capture cadence. Nested measurements overlap; do not add p95 values together.
`comparedBytes` counts the full extent of candidate page comparisons, not actual
SIMD early-exit traffic. Complete-state hashes include memory, all mutable globals,
core identity and the deterministic host journal. Audio journal equality is also
reported explicitly; diagnostic audio emission remains zero.

## Focused differential tests

Sparse captures/restores are checked against full snapshots through random marked
writes, 64 KiB boundary writes, renderer consumption between captures, branching
history, releases, globals changes and music-event changes. Tests verify that an
unchanged restore copies zero bytes while restoring globals/journal, releasing a
baseline forces full coverage, and deliberately unmarked writes fail capture and
restore audits. Replay tests retain the initial rewind checkpoint and separately
identify recapture versus replay work. Existing memory/table/abort/budget and
renderer ownership tests remain in the suite.

## Reproduction

```
node scripts/native-port/probe-certification.mjs --presentation=replica --replicacopy=dirty --mode=rollback --frames=1800 --sparserestore=0 --label=sparse-a1
node scripts/native-port/probe-certification.mjs --presentation=replica --replicacopy=dirty --mode=rollback --frames=1800 --label=sparse-b1
node scripts/native-port/probe-certification.mjs --presentation=replica --replicacopy=dirty --mode=rollback --frames=1800 --snapshotaudit --label=sparse-heavy1
```

Repeat the first control as A2. Add `--map=fountain --pair=Pp,Pe` for Fountain.
The relay uses the same 15–130 ms delays/reordering for all cases. Full state,
final pixels, camera and journal comparisons remain mandatory. These localhost
browser experiments are not physical input-to-photon or WAN measurements.

## Matched 1,800-frame A/B/A

Two localhost Chromium clients share the Ryzen AI 9 HX PRO 370 host. Every
forward frame renders at 960×720 with the canvas observer enabled. All previous
matrix and layout-pool changes stay enabled. Cells are client 0 / client 1.
Full state, final RGBA, camera and audio-journal comparisons pass in every run.

| Workload/run | Simulation FPS | Captured FPS | Correction p95 ms | Forward callback p95 ms |
| --- | ---: | ---: | ---: | ---: |
| battlefield A1 | 58.846 / 59.016 | 58.757 / 58.654 | 17.600 / 21.200 | 21.200 / 22.700 |
| battlefield B1 | 59.687 / 59.764 | 59.982 / 60.002 | 7.200 / 8.300 | 13.300 / 13.400 |
| battlefield A2 | 58.604 / 58.778 | 58.187 / 58.315 | 20.200 / 21.800 | 23.400 / 23.300 |
| fountain A1 | 55.578 / 55.621 | 52.279 / 51.846 | 31.900 / 28.400 | 29.500 / 30.500 |
| fountain B1 | 58.809 / 58.904 | 54.860 / 55.028 | 13.000 / 16.400 | 19.900 / 20.100 |
| fountain A2 | 55.437 / 55.395 | 50.885 / 50.647 | 27.100 / 31.200 | 30.800 / 31.300 |

| Workload/run | Restore copy p95 ms | Replay checkpoint capture p95 ms | Replica synchronization p95 ms |
| --- | ---: | ---: | ---: |
| battlefield A1 | 4.600 / 4.400 | 6.800 / 6.500 | 3.600 / 3.800 |
| battlefield B1 | 0.300 / 0.300 | 1.000 / 1.100 | 0.400 / 0.400 |
| battlefield A2 | 4.600 / 4.900 | 6.200 / 6.200 | 3.800 / 3.700 |
| fountain A1 | 5.900 / 6.000 | 7.800 / 7.700 | 4.700 / 4.500 |
| fountain B1 | 0.400 / 0.400 | 1.400 / 1.300 | 0.600 / 0.600 |
| fountain A2 | 5.700 / 5.600 | 7.300 / 7.300 | 5.000 / 4.700 |

The optimization reduces restore copying, replay checkpoint work and subsequent
replica synchronization together. Cumulative store counters also include reference
setup and final oracles; the phase distributions above cover measured work only.
The remaining renderer and scheduler costs still matter.

Battlefield B1 exceeds 59.5 simulation and captured FPS on both clients, but
submission p95 is 20.1 / 20.6 ms and fails the unchanged 20 ms cadence limit.
Fountain B1 remains below the rate gates. **No complete 720p60 acceptance claim
is made, and production rollback remains disabled.** Canvas capture is not
physical presentation or input-to-photon evidence.

## Repeated correction audits

Two independent repeats per stage each run 1,800 frames with two clients and
full capture and restore audits enabled; each row identifies one client. All full-state, final pixel, camera
and audio-journal comparisons passed; no input was rejected and no audio was
emitted. These audit runs are correctness evidence, not substitutes for A/B/A.

| Stage, repeat / client | Corrections | Replayed frames | Max replay depth | Capture / restore audits |
| --- | ---: | ---: | ---: | ---: |
| battlefield 1 / 0 | 148 | 1076 | 12 | 629 / 150 |
| battlefield 1 / 1 | 149 | 811 | 11 | 559 / 151 |
| fountain 1 / 0 | 166 | 925 | 12 | 575 / 168 |
| fountain 1 / 1 | 146 | 1032 | 13 | 619 / 148 |
| battlefield 2 / 0 | 145 | 811 | 10 | 563 / 147 |
| battlefield 2 / 1 | 157 | 1079 | 12 | 623 / 159 |
| fountain 2 / 0 | 175 | 993 | 13 | 594 / 177 |
| fountain 2 / 1 | 149 | 975 | 14 | 611 / 151 |

Separate 300-frame Battlefield and Fountain runs also compared the full replica
memory before every draw: 1,200 complete replica audits across the four clients,
in addition to the full checkpoint audits. Their expensive checking is excluded
from performance comparisons.

The six-stage sparse rollback suite passed with full checkpoint audits enabled:
Battlefield, Yoshi's Story, Pokémon Stadium, Dream Land and Final Destination at
240 frames; Fountain Ice Climbers/Peach at 1,800 combat frames. Both clients
retained the original complete-state reference hashes, final pixels and camera.
Sparse presentation still does not mutate gameplay state. The six reviewed JS
sources match served bytes and their renewed host-contract pins.

Room lifecycle checks passed join/refresh, restored human controls, 600 matching
fighter frames, elimination/results, two-vote rematch, accelerated 28,800-step
timeout and return to the six-stage menu. The full suite passed **609 total:
599 passed, 10 skipped, zero failures**. It also checks a checkpoint subscriber
on the replica destination, proving synchronization writes are broadcast rather
than hidden by the presentation consumer. The corrected Fountain image was
reviewed for native framing, models and HUD. `git diff --check` passed.

The [sanitized benchmark artifact](benchmarks/browser-2026-09-17-native-sparse-checkpoints.json)
contains the six A/B/A reports, two per-draw coverage runs, four heavy correction
runs, six-stage reference convergence, room lifecycle results and test counts.
Raw-report SHA-256 digests and source provenance identify the measured code.
Native binaries, game data and saved states are not committed. Sparse mode stays
inside the audited diagnostic path; production remains three-frame lockstep.
