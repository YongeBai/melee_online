# Double Ice Climbers / Fountain pacing investigation

The retained browser-native renderer passes the existing hosted-room 720p60
canvas gate for this matchup. It is faster, but **not proven hitch-free or
physically latency-certified**. No deployment or tournament-completeness claim
is made by these measurements.

## Retained changes

- Reuse the uniform staging slab's float/integer views instead of constructing
  views, closures and descriptor/scalar arrays for every material draw. Each
  draw still owns a distinct, fully cleared std140 record. Growth, shrinking,
  padding, sparse rows, aligned bindings and exclusive leases are preserved.
  Review also caught and tested a non-word-aligned custom capacity edge case.
- Compare immediate GX state in four-word groups, outside the per-word TEV
  exception branch. Every original word is still checked; only the existing
  per-vertex TEV-register exception remains. Native callbacks, geometry,
  ordering, effects and partners are not culled or approximated.
- Fix a confirmation/retry race: a stalled local advance can retry after its
  immutable input has been confirmed and its transport bookkeeping released.
  The browser now recognizes that confirmed input instead of retransmitting it
  outside the relay's live window. Disconnect checks and the relay's strict
  immutable-input validation remain intact.
- Timing now attaches before the first live frame, and keyboard latency is
  measured only with the explicit latency probe. Scripted combat no longer
  produces spurious keyboard-latency samples. The room probe explicitly checks
  for distinct Popo and Nana owners in each selected Ice Climbers seat.
  Named `--label=` output directories preserve separate trials; rerunning a
  label clears stale reports/profiles so a failed probe cannot appear to pass.

These host changes introduce no WASM-memory writes. The two changed renderer
modules read captured state and write JS-owned staging arrays; the room change
only affects transport bookkeeping. Their audited host pins were updated after
review. Neither native WASM binary, gameplay rules, hosted no-ISO startup,
camera/projection, menus nor stage configuration changed.

## Controlled renderer comparison

Independent 600-frame isolated certification runs use double Ice Climbers on
Fountain, the dirty presentation replica, identical combat and detailed draw
timers. These are **cost/correctness probes**, not sustained performance passes:
capture is disabled and fewer than 1,800 frames are requested. The harness
correctly reports those acceptance failures.

| Run | Mean draw CPU | Uniform packing | Immediate comparison |
| --- | ---: | ---: | ---: |
| Original A1 | 5.460 ms | 0.418 ms | 0.321 ms |
| Retained B1 | 4.713 ms | 0.304 ms | 0.167 ms |
| Original A2 | 5.272 ms | 0.350 ms | 0.315 ms |
| Retained B2 | 5.078 ms | 0.351 ms | 0.178 ms |

Across these repetitions, draw CPU averages 5.366 → 4.896 ms (8.8% lower).
Uniform packing averages 14.7% lower and immediate comparisons 45.8% lower.
The uniform improvement is not present in every individual repetition; host
variation remains visible. All four runs make exactly 160,557 material/key
calls and 63,403 immediate comparisons and have the same full native-state hash:
`154accb264a7ac4d44a1fe65af4b8ffaddcd537aa6248ec3d319e1617ab97067`.
All final pixel oracles report zero differing bytes. Native-state, camera and
audio-reference checks remain enabled.

A hand-built shader-key tuple candidate was **rejected and reverted**: its
direct key cost rose from 0.230 to 0.278 ms/frame in the controlled comparison.
The added field-by-field key-equivalence regression test remains useful.

## Hosted-room validation

Two Chrome 151 processes on the Radeon 890M host, authenticated `/play/`,
four stocks, eight minutes, no items, native 960×720 / 4:3 picture. Roster tiles
`12,12`, tournament stage `2`. Both seats construct Popo and Nana; every completed
600-frame window contains native attacks and hitlag. No profiler is active.

| Final run | Simulation FPS, P1 / P2 | Observed FPS | Observed p99 interval | Observed worst interval | Gaps >25 ms |
| --- | --- | ---: | ---: | ---: | ---: |
| Observe P2, 3,600 frames | 59.954 / 59.875 | 59.984 | 21.435 ms | 32.580 ms | 6 |
| Observe P1, 3,600 frames | 59.969 / 59.933 | 59.987 | 21.015 ms | 32.215 ms | 6 |

Each run captures all 3,600 requested distinct images, with no black,
wrong-size or missing frames, exact peer fighter-state convergence and final
GPU validation. Draw p95 is 8.825–9.590 ms across the four clients. The P1
run's unobserved peer has one 33.795 ms submission interval and an eight-gap
>25 ms tail; do not describe both browsers as universally free of 33 ms gaps.
The P2 run predates only the custom-capacity edge-case fix; its default aligned
slab allocation is unchanged. P1 uses the final source revision.

These product fights are not identical A/B workloads: the combat controller
reacts to predicted fighter positions, and complete native startup state is not
pinned between fresh menu sessions. They demonstrate sustained product behavior, not
an isolated percentage speedup. The original 1,800-frame target baseline had
59.935 captured FPS, 7.8 ms mean draw CPU and a 41.22 ms worst capture interval.
Do not directly attribute the entire cross-session difference to the changes.

## Rejected/diagnostic evidence and limits

A separate authenticated 1,800-frame input probe used the same matchup with
40 real CDP keyboard presses instead of scripted combat. Mean browser-key-handler
to native-input-frame submission was 13.342 / 14.271 ms; p95 was 18.565 / 16.635 ms;
max was 19.605 / 23.005 ms. Every accepted press appeared in the first submitted
frame. One peer experienced seven stalled advances over the run and
recovered without the confirmed-input resend error. This is a small input sample
without combat load, not a before/after latency claim or physical-device test.

The first profiled room run exposed the confirmed-input resend error. It is not
a performance pass. A later profiled run after the retry fix completed with
exact peer convergence. Profile samples identify rendering/state staging,
native dirty-store instrumentation, texture handling and allocation/GC as
remaining CPU work; they do not measure GPU execution time.

The probe can record normalized controller inputs with `--record-inputs` and
replay them with `--input-tape=PATH` (both require `--timing --combat`). A replay
using an exactly matching tape still lost contact in one 600-frame window.
The complete native starting state was not pinned across fresh menus, so this
did not establish an identical-workload comparison or isolate the difference.
That run is excluded from acceptance. Input-tape identity alone is **not** a
deterministic cross-session benchmark; use the isolated certification harness
and require matching full-state hashes. Raw tapes stay in ignored/local output.

Canvas snapshots and CPU submission timestamps are not monitor scanout or
physical input-to-photon measurements. Average 60 FPS can conceal long frames;
the remaining 25–33 ms tails are explicitly retained. This is one hardware and
browser combination, not all-device, WAN or exhaustive tournament certification.

## Reproduce

Final regression results: 300-frame Fountain ICs/ICs and Battlefield Link/Kirby
per-frame oracles, plus 60-frame ICs/ICs startup oracles on the other four legal
stages, total **840 exact frames, 2,322,432,000 compared RGBA bytes and 1,680
full replica-memory audits**. No pixel differences, camera mismatches, final
native-state reference differences or audio-journal differences were found.
The 60-frame cases do not reach sustained combat and are not performance tests.
The final authenticated double-ICs Fountain pause/LRAS probe returned both
players to character select, with NO CONTEST confirmed at frame 135.

Full suite: **669 tests, 659 passed, 10 skipped, zero failures**. All 166 served
artifact pins match. Benchmark output, game data and temporary fixture links
are not committed. The [sanitized evidence](benchmarks/browser-2026-09-19-native-double-ic.json)
contains raw-report hashes, source identities, successful and excluded trials.

```sh
node scripts/native-port/probe-native-rooms.mjs --release-entry --rollback --frames=3600 --capture-seat=0 --combat --pair=12,12 --stage=2 --timing --label=double-ic-seat0
node scripts/native-port/probe-native-rooms.mjs --release-entry --rollback --frames=3600 --capture-seat=1 --combat --pair=12,12 --stage=2 --timing --label=double-ic-seat1
node scripts/native-port/probe-certification.mjs --mode=isolated --presentation=replica --replicacopy=dirty --frames=600 --pair=Pp,Pp --map=fountain --drawtiming --observer=0 --label=double-ic-cost
```

Run benchmarks sequentially without competing builds. Use distinct labels to
retain each run. Inspect `raw-report.json` and `failure.json` for failed gates;
older versions of the probe could leave a stale success report behind.
