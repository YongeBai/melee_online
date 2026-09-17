# Layout-keyed immediate resources — September 17, 2026

This continues `f9212ba`'s direct native port and packed matrix staging. The old
positional immediate-plan experiment is replaced by a structurally keyed resource
pool. The earlier Link/Kirby frame-98 mismatch remains a recorded failure; no
specific original root cause is claimed merely because the replacement passes.

## Resource and frame lifetimes

Pool keys include batch kind (particle, afterimage, text), textured/untextured
attributes, cull mode and integer TEV-register layout. The key also versions the
fixed physical ABI: nine float32 vertex components (position/color/UV), uint32
triangle indices, and optionally sixteen int32 TEV-register components. Original
GX quads/strips/fans are still converted to the same ordered triangles.

A pool holds only WebGL VAOs/buffers, their byte capacities and owned CPU streams.
Each layout has its own occurrence cursor, so reordering different batch kinds
cannot select another layout's resource. Multiple same-layout draws in a queue
receive distinct resources. Cursor reset happens only after the prior queue is
consumed/discarded, or when a renderer releases its exclusive lease.

Every acquisition returns a fresh plan wrapper. Mesh metadata, shader selection,
material state, native matrix snapshots, camera and draw order are rebuilt from
the current native callbacks. No native pointers or live WASM views enter the
pool. CPU streams copy current vertices, indices and per-vertex signed registers;
all used GPU ranges are uploaded every draw. GPU storage grows only when required,
and draw counts exclude unused capacity. Texture and shape behavior are unchanged.

The program is deliberately not part of the retained resource: the physical
attribute locations/types are fixed and the register-layout bit separates the
integer attributes from the ordinary UV inputs. Every draw selects and applies
its current program and full dynamic state independently. Shader identity cannot
make a cached program or uniform state survive through the resource pool.

The original uncached/per-renderer immediate path remains the control with
`--immediatereuse=0`. The strict per-frame oracle explicitly disables both packed
matrices and immediate reuse for its second draw; the final oracle is uncached.
No pixel tolerance, comparison range, frame exclusion or camera comparison changed.
Production rooms remain three-frame lockstep.

## Focused tests

Tests reorder/remove/restore mixed kinds across successive renderer leases, add
new layouts, and enqueue multiple instances of the same layout. They check all
48 structural variants, attribute integer/float types and enables, independent
queued storage, copied source ownership, complete used-byte replacement,
shrink/grow capacity behavior and exact-once disposal under exclusive leases.

The new pool and renderer changes contain no new host writes into WASM memory.
Only the four reviewed JS source hashes were refreshed in the dirty-host
contract; the original and instrumented core digests remain unchanged.

## Reproduction

```
node scripts/native-port/probe-certification.mjs --presentation=replica --replicacopy=dirty --mode=isolated --frames=300 --pair=Lk,Kb --dirtyaudit --frameoracle --label=immediate-layout-lk1
node scripts/native-port/probe-certification.mjs --presentation=replica --replicacopy=dirty --mode=rollback --frames=1800 --immediatereuse=0 --label=immediate-layout-a1
node scripts/native-port/probe-certification.mjs --presentation=replica --replicacopy=dirty --mode=rollback --frames=1800 --label=immediate-layout-b1
```

Repeat the Link/Kirby audit with distinct labels. Repeat A1 after B1 as A2. Add
`--map=fountain --pair=Pp,Pe` for Fountain. Packed matrices remain enabled in all
performance runs. These are two localhost clients sharing one host, not WAN or
physical input-to-photon measurements.

## Strict image and memory audits

Three independent 300-frame Link/Kirby runs passed past the former frame-98
failure, followed by 240-frame Battlefield Falco/Fox and Fountain Ice
Climbers/Peach runs. Across these five probes: **1,380 frames, 3,815,424,000 RGBA
bytes compared, zero differing bytes or recorded-camera mismatches, and 2,760
full-memory coverage audits**. Full state and the final uncached image oracle
also matched. The Link/Kirby screenshot retained the original framing and HUD.

These runs exercise the new pool (not an accidentally disabled optimization):
Link/Kirby used two resource layouts and 26 slots; Battlefield used 34 slots in
the 240-frame audit; Fountain used 68. Unit tests exercise all 48 key variants,
but this is not a claim that the browser workload covers every variant or move.

## Matched A/B/A at 960×720

All runs contain 1,800 forward frames per client, two localhost Chromium
processes on the Ryzen AI 9 HX PRO 370, the canvas observer, and the same
15–130 ms delayed/reordered input workload. A1/A2 use the prior per-renderer
immediate path; B1 uses the layout-keyed pool. Packed matrices and preceding
optimizations remain enabled throughout. Cells are client 0 / client 1.

| Workload/run | Draw CPU ms/frame | Simulation FPS | Captured FPS |
| --- | ---: | ---: | ---: |
| battlefield A1 | 7.504 / 7.504 | 56.912 / 57.130 | 54.866 / 53.658 |
| battlefield B1 | 7.298 / 7.287 | 56.461 / 56.656 | 53.294 / 54.166 |
| battlefield A2 | 7.716 / 7.434 | 56.939 / 57.050 | 53.248 / 55.187 |
| fountain A1 | 9.804 / 9.871 | 51.972 / 51.989 | 42.544 / 42.330 |
| fountain B1 | 8.867 / 8.978 | 53.895 / 53.938 | 47.779 / 48.044 |
| fountain A2 | 9.921 / 9.899 | 52.082 / 52.020 | 41.343 / 43.251 |

Every final complete-state, pixel and camera comparison passed. No run met the
59.5 simulation/capture gate. These figures must not be mixed with the rejected
positional experiment or a different host/session to claim a larger gain.

The draw-time reduction versus the mean of both controls is about 3.3% on
Battlefield and 9.6% on Fountain. Fountain's simulation/capture rates improve;
Battlefield's overall rates do not show a reliable gain (its candidate simulation
rate is about 0.45 FPS lower). Retaining capacity is therefore not a general
720p60 solution, even though the exact renderer checks pass.

Frame-time tails remain significant. Candidate forward-callback p95 is
27.2–28.6 ms on Battlefield and 33.6–34.0 ms on Fountain. Correction-event p95
is 23.9–25.2 ms and 33.4–34.0 ms respectively; average forward simulation alone
is only 0.86–0.87 ms and 1.34–1.35 ms. These event measurements overlap and must
not be added together. Replica-copy p95 remains 4.1–5.0 ms despite sub-ms means.
Reducing serial correction/checkpoint/copy bursts remains necessary; measuring
GPU stalls or comparing full reallocation versus subdata uploads could separately
explain why buffer retention does not translate into a Battlefield FPS gain.

## Regression scope

With the layout pool enabled, six-stage rollback probes retained the original
complete-state reference hashes: Battlefield, Yoshi's Story, Pokémon Stadium,
Dream Land and Final Destination at 240 frames, and Fountain Ice Climbers/Peach
at 1,800 combat frames. Both clients matched final pixels and camera fields,
and replica draws did not mutate gameplay state. The longer performance runs
also retained exact complete-state convergence. The two-browser join/refresh
probe passed 600 matching fighter frames and restored human hands/icons.

These are the tested scenarios, not exhaustive roster or tournament validation.
The core, callbacks, simulation, 960×720 framing, camera, dynamic skin/deformation,
particles, text and gameplay stage motion are unchanged. Fountain retains the
previous diagnostic cosmetic settings equally in control and candidate runs.

Results/rematch passed elimination, two-vote restart with retained selections,
the accelerated 28,800-step timeout and return to the six-stage menu. The full
suite passed **604 tests total: 594 passed, 10 skipped, zero failures**. The four
reviewed host sources match served bytes and the dirty-host hash contract.
`git diff --check` passed. No game data, native binaries or save data were added.

The layout pool is now the default for presentation caches; the old positional
pool is removed. `reuseImmediate:false` / `--immediatereuse=0` preserve the
per-renderer control. This does not enable production rollback or change the
normal product transport. Exact passing probes are scoped evidence, not a claim
that the previous intermittent failure's root cause has been established.

The [sanitized benchmark record](benchmarks/browser-2026-09-17-native-immediate-pool.json)
contains all six A/B/A reports, five per-frame audits, six-stage reference
convergence, room lifecycle checks and full-suite counts, with raw-report digests
and source provenance. The previous rejected experiment is linked explicitly;
its larger combined speedup is not claimed for this implementation.
