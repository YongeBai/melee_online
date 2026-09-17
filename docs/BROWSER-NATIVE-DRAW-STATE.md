# Exact draw-state staging experiment

September 17, 2026; native C/WASM port, based on `14842b3`. Production rooms
remain three-frame lockstep. This is a diagnostic rendering optimization, not
competitive gameplay, physical input latency, or full-roster certification.

## Measurement and scope

The current sparse-checkpoint baseline was CPU-profiled on Battlefield
(Falco/Fox) and Fountain of Dreams (Ice Climbers/Peach), with two independent
localhost Chromium clients, 600 forward combat frames, 15–130 ms delayed and
reordered inputs, and the canvas observer enabled. Under timed `drawFrame`,
uniform/texture application represented 23–25% of sampled Battlefield draw CPU
and 26–27% of Fountain draw CPU. Native traversal plus JS capture represented
60–61%. These categories are inclusive groups, not GPU elapsed time; native
traversal includes its synchronous JS capture callbacks.

Fountain self samples included texture decoding/capture (~6%), model matrix
capture (~5%), shader-key construction (~4.5%), exact source-texture comparisons
(~4%), image lookup (~4%), pixel decoding (~4%), and render-context capture
(~3%). Those rows do not add up to an independent decomposition of the broad
categories. Profiling adds overhead and 600-frame workloads are less demanding
than the complete 1800-frame runs.

The retained candidate has a common `exactState` switch; `--exactstate=0` keeps
the previous native readers, shader-key implementation and direct uniform
uploads. `--drawtiming` adds per-frame substage timings for TEV, texture, pixel,
model, context, shader keys, texture lookup, texture matrix packing, uniform/
texture application and fixed pixel state. Nested timings overlap; never sum
their p95 values. The performance A/B/A leaves this detailed timing disabled.

## Exact reuse boundaries

* TEV instruction rows are immutable, JS-owned arrays, interned by every active
  32-word instruction row. A hash selects a bucket; full word comparison proves
  equality, including unused instruction fields. A maximum of 1024 retained
  variants bounds the table; overflow uses the original reader. Every register,
  constant, mask and counter is copied for every draw. Native callbacks still
  run. No heap view, address, or native object binding is retained by this table.
* Shader keys reuse only the serialized immutable instruction rows. Generator
  state, texture IDs, lighting channels, alpha-test program, vertex attributes,
  immediate-register mode and fog type are serialized each draw. Tests require
  the exact original key string, including after mutations and reordering.
* Projection and light versions come from owned camera/context snapshots. The
  existing context reader compares all native words on every capture and owns
  all decoded values. Light-load counters can change without mutating the owned
  light array. A new light value creates a new snapshot. Packed light uniforms
  are shared by programs within the same flush; matrices, TEV colors, material
  colors, texture matrices, resources and alpha references still upload their
  current values.
* Program, projection, lighting, fog, sampler-unit, current-matrix and fixed
  pixel/cull knowledge ends at every flush. Other renderers, HUD passes and
  transform-feedback checks cannot leave stale assumptions across flushes.
  Fixed pixel keys include every state component that is suppressed; unsupported
  depth/alpha, destination-alpha, dithering and logic checks still run before
  any suppression. Geometry, draw order, shape buffers, particles, text, stage
  movement and native camera behavior are unchanged.

## Rejected experiments

A generic exact uniform/GL-state cache compared each upload component, copied
values into owned arrays and skipped roughly 80% of uniform calls and 98% of
fixed-state calls. In 600-frame Fountain controls, draw CPU rose from about
6.9–7.1 ms to 8.2–8.6 ms. Its comparisons, generic dispatch and bookkeeping cost
more than the saved calls. It was removed.

Reusable per-draw texture descriptor/generator/matrix slots also lost time:
about 7.6 ms versus the 6.9–7.1 ms control. They copied and validated all active
values and passed mutation/heap-replacement tests, but allocation reduction was
not a performance win here. They were removed, and the original texture reader
is unchanged. Early combined pilot controls used a shared refactored reader;
a second isolation run restored the original reader before rejecting the slot
pool. Neither pilot is a 720p60 acceptance result.

## Validation and result

Final results are recorded in the accompanying benchmark artifact. Full-state
convergence includes all native memory, mutable globals and the host audio
journal. The per-frame reference disables the new reuse as well as earlier
submission/matrix/immediate optimizations. Every RGBA byte and camera value must
match, with full replica-memory coverage audits. No tolerance or sampling was
introduced. No production rollback is enabled by this work.

### Matched 1800-frame A/B/A (detailed timing disabled)

Both clients are shown, in seat order. A1/A2 use the original state path; B1
uses the candidate. Observer, sparse checkpoints, immediate geometry pooling,
frame clock, combat input sequence and 15–130 ms delay schedule are shared.

| Stage/run | Simulation FPS | Captured FPS | Draw CPU mean (ms) | Submission p95 (ms) |
|---|---:|---:|---:|---:|
| Battlefield A1 | 59.670 / 59.781 | 59.946 / 59.978 | 5.341 / 5.363 | 20.1 / 20.1 |
| Battlefield B1 | 59.690 / 59.810 | 60.015 / 60.013 | 5.181 / 5.395 | 19.9 / 19.9 |
| Battlefield A2 | 59.682 / 59.759 | 59.914 / 59.900 | 5.483 / 5.325 | 20.1 / 20.2 |
| Fountain A1 | 59.457 / 59.597 | 58.266 / 58.725 | 7.144 / 7.132 | 22.1 / 21.4 |
| Fountain B1 | 59.460 / 59.573 | 58.468 / 59.366 | 6.818 / 6.736 | 22.6 / 20.7 |
| Fountain A2 | 59.495 / 59.615 | 59.394 / 59.378 | 7.000 / 7.047 | 22.2 / 21.0 |

Relative to the mean of the two controls, candidate mean draw CPU decreases
about 1.7% on Battlefield and 4.3% on Fountain. Battlefield's **single candidate
run** passes both clients' diagnostic gates. The 0.2–0.3 ms submission-p95
margin is small; this does not establish repeatable device-wide certification.
Fountain still fails simulation/submission and captured-frame gates. Its
candidate forward-callback p95 is 16.6 / 15.7 ms, but maxima reach 52.9 / 46.6 ms.
There is no sustained-FPS improvement established for Fountain over A2.

The initial sparse milestone's slower Fountain averages are not an equivalent
control for this change: today's A1/A2 are already faster. Use these matched
runs, not a cross-session 8.8-to-6.8 ms claim. Prediction/correction arrival
order can slightly change forward-frame work even with the same final state.

### Remaining cost

Detailed timing plus CPU profiling is a separate 600-frame diagnostic. On
Fountain, TEV capture moves from 0.19–0.21 to 0.14–0.17 ms/frame; shader-key work
from 0.43–0.48 to 0.38; fixed pixel GL state from 0.14–0.15 to 0.08. Uniform and
texture application barely changes (2.23–2.29 to 2.18–2.22), despite suppressing
many calls. This is a modest state-staging win, not a large rendering speedup.

Remaining candidate substage means include texture lookup/source validation
0.78–0.82 ms, texture capture 0.47–0.50, model matrix capture 0.43–0.44, pixel
capture ~0.35, context capture 0.27–0.32, and texture-matrix packing 0.20–0.22.
Texture lookup and matrix packing are inside the uniform/texture total; those
figures must not be added twice. Native traversal and GPU work remain outside
these named JS substage totals.

A larger next experiment would need to reduce the remaining dynamic uniform
submission/packing cost—for example, an explicitly versioned per-draw uniform
buffer with owned staging and the same byte-exact oracle—or reduce measured
native traversal/capture work without dropping callbacks. Another general
value-comparison cache is not supported by these measurements. Submission
jitter and capture losses also need separate measurement; average draw savings
alone have not established the Fountain acceptance gate.

### Correctness coverage

The final strict frame suite covers 240 Battlefield frames, 240 Fountain
ICs/Peach frames, and three independent 300-frame Link/Kirby runs: **1,380
frames, zero differing RGBA bytes, zero camera mismatches, and 2,760 full
replica-memory coverage audits**. This includes the previously troublesome
Link/Kirby frame 98 on every repeat. Screenshots of the 1800-frame Fountain
candidate retain the original 4:3 framing, fighters, HUD and native camera;
the final canvas also matches the independent uncached renderer byte-for-byte.

Two independent heavy-correction repeats per stage (eight clients) perform
**1,246 corrections / 7,802 replayed frames**, reaching replay depth 14 without
rejected inputs. All 4,779 captures and 1,262 restores receive full-memory
coverage audits, with complete-state, journal, camera and final-pixel equality.
These intentionally slow audits are correctness evidence, not FPS measurements.

All six stage rollback probes match the unchanged original-core complete-state
hashes and independent final pixels/cameras. Full capture/restore audits remain
enabled for those probes. Rooms pass join/refresh, restored human controls and
600 matching fighter frames; results pass elimination (806 frames), two-vote
rematch, retained selections, accelerated 28,800-frame timeout and return to
six-stage selection. **614 tests: 604 passed, 10 skipped, zero failed.**

The original core remains
`a5b0eb0bbc9851bce8bc022a1cdab173bae8f6d405b8b2b039dc1f164df3a234`;
the audited instrumented core remains
`06e91f842dbc82a0f206acd789a14809b4133a336d97b792cc46b0e7cbd58c73`.
Only reviewed JS rendering/cache/diagnostic sources and the two new pure-JS
helpers update host pins. There are no new host writes to native memory;
existing marked camera staging writes are unchanged. Build-copy and development
server allowlists include the new modules. Worktree preview port 3340 serves
the matching source and audit hashes after its server reload.

Detailed, sanitized evidence and source hashes:
[`browser-2026-09-17-native-draw-state.json`](benchmarks/browser-2026-09-17-native-draw-state.json).
No game assets, binaries, room credentials, raw capture pixels or screenshots
are committed. Raw local diagnostic reports remain in ignored `dist/native-port`.
