# Exact per-draw uniform-buffer staging

September 17, 2026. Native C/WASM port; base `6110462`. This experiment retains
native callbacks, traversal, deformation, skinning, particles, text, stage
motion, native camera and original 4:3 framing. No native core or gameplay
change. Production rooms remain three-frame lockstep.

## Layout and ownership

`MeleeDrawV1` is a shared std140 block with **3,472 bytes** per draw. It carries
projection/model matrices, texture/post matrices, TEV registers/constants,
ambient/material colors, light colors and coefficients, texture LOD bias,
fog values, alpha references and current matrix. Float scalar arrays and vec3
arrays use 16-byte stride. Mat4 uses four column vectors with 16-byte matrix
stride. Integer fields use an Int32Array view; floating fields use Float32Array.
No shader arithmetic is changed: the source adapter replaces eligible uniform
declarations and identifiers, preserving expressions and control flow. Immediate
flat TEV register varyings remain varyings; their unused block fields do not
replace per-vertex data. Samplers/textures stay on the original binding path.

The layout is checked against **each linked program**, including its active
uniform types, offsets, array/matrix strides, row-major flag, block index and
block size. Optimized-out members need not be active, but every active member
must match. The adapter rejects unknown numeric uniforms or unsupported source
shapes. Unsupported device limits, source/layout failures and oversized frames
use the original direct-uniform program. Context loss and allocation/GL errors
fail explicitly rather than claiming that a frame was rendered.

The [WebGL 2 specification](https://registry.khronos.org/webgl/specs/latest/2.0/)
defines the reflected uniform layout and the buffer-range alignment requirement.
The pool queries `UNIFORM_BUFFER_OFFSET_ALIGNMENT`, rounds each record stride
accordingly and checks block/binding/stage limits. The measured device reports
4-byte offset alignment; tests also exercise 256-byte alignment and padding.

The frame slab is a JS-owned ArrayBuffer. Every queued draw copies **all** its
current fields, including cleared inactive rows and padding, before submission.
No native heap view, pointer, archive binding or queued geometry is retained by
the pool. A frame epoch rejects stale binds, including after failed preparation.
Each record has its own offset, so identical shader layouts, repeated immediate
batches and reordered draws cannot overwrite one another's values.

CPU/GPU capacity grows and is retained under the presentation cache's exclusive
lease. Shorter frames upload only their used extent. A released renderer cannot
prepare, upload or bind a later renderer's pool. Context identity remains a cache
boundary; recreation requires a fresh cache/pool. One contiguous buffer upload
precedes the frame's draws, with one `bindBufferRange` per UBO draw. Resource
capacity is retained; no frame is dropped, substituted or interpolated.

`--uniformbuffer=0` is the independent opt-out control. It keeps the prior
sparse-checkpoint, immediate-pool and exact-state improvements. The strict
per-frame oracle additionally disables the prior state, submission, matrix and
immediate optimizations. Its shader source is the original direct-uniform code.

## Measurement

`--drawtiming` separates UBO pack, upload, bind and texture/sampler submission;
the control records direct uniform/packing and texture submission. Existing
capture/shader-key/pixel-state timings remain. Nested timings overlap. CPU wall
time and sampled CPU stacks are not GPU elapsed time or input-to-photon latency.
Detailed timers/profiling are disabled for the 1800-frame acceptance runs.

Measured UBO counters cover only forward frames: draws, binds, uploads and
uploaded bytes. Match-cache totals also include setup/reference work and must
not be divided by the forward-frame count. Candidate evidence must show all
measured draws using UBOs and no fallback; a reference-path fallback is not a
successful UBO benchmark.

An initial 120-frame Battlefield comparison matched every RGBA byte/camera and
performed 240 full replica-memory audits with no fallback. Short 600-frame
Fountain pilots showed lower mean draw CPU but variable FPS. An early long run
was interrupted when the released-lease guard was added; only the final frozen
revision is used in the acceptance A/B/A and repeat.

## Frozen A1/B1/A2/B2 results

[Sanitized benchmark artifact](benchmarks/browser-2026-09-17-native-uniform-buffer.json)
contains source/report/profile hashes, full per-client metrics, failures and
correctness summaries. Only final frozen runs labelled `ubo-final-*` are used;
pre-guard pilots and the interrupted first long run are excluded.

Two Chromium 151 processes ran on one Ryzen AI 9 HX PRO 370 / Radeon 890M host.
Each row is 1,800 forward frames per client with browser capture enabled and
15–130 ms synthetic input delivery delays. A1/A2 use direct uniforms; B1/B2 use
the UBO path. Entries below are **client 0 / client 1**, not pooled clients.
The game picture is 960×720 within a 1280×720 canvas. This is diagnostic rollback,
not the production transport, a WAN test or physical input-to-photon evidence.

| Stage | Run | Simulation FPS | Captured FPS | Mean draw CPU ms | Submission interval p95 ms | Diagnostic pass |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| Battlefield Falco/Fox | A1 | 59.69 / 59.81 | 60.02 / 60.01 | 5.010 / 5.027 | 20.5 / 20.1 | no / no |
| Fountain ICs/Peach | A1 | 59.60 / 59.66 | 59.64 / 59.58 | 6.747 / 6.626 | 21.1 / 22.0 | no / no |
| Battlefield Falco/Fox | B1 | 59.67 / 59.82 | 59.93 / 60.00 | 4.908 / 4.902 | 20.1 / 19.8 | no / yes |
| Fountain ICs/Peach | B1 | 59.59 / 59.71 | 59.05 / 59.90 | 6.315 / 6.311 | 21.3 / 21.6 | no / no |
| Battlefield Falco/Fox | A2 | 59.69 / 59.81 | 60.03 / 60.02 | 4.892 / 5.072 | 19.9 / 20.1 | yes / no |
| Fountain ICs/Peach | A2 | 59.49 / 59.60 | 59.41 / 58.84 | 6.580 / 6.848 | 21.6 / 21.6 | no / no |
| Battlefield Falco/Fox | B2 | 59.70 / 59.81 | 60.01 / 60.00 | 4.822 / 4.770 | 19.9 / 19.7 | yes / yes |
| Fountain ICs/Peach | B2 | 59.63 / 59.68 | 59.43 / 59.74 | 6.559 / 6.363 | 21.5 / 21.4 | no / no |

Mean draw CPU across both clients and repetitions fell from **5.000 to 4.850 ms
on Battlefield (3.0%)**, and **6.700 to 6.387 ms on Fountain (4.7%)**. Both candidate
repetitions reduced the paired mean draw cost relative to the two-control mean.
This supports retaining the exact UBO path as a modest CPU improvement. It does
not establish a repeatable captured-FPS gain or resolve the frame deadline.

Battlefield B2 passed both clients, but B1 client 0 missed submission cadence.
Fountain failed the 20 ms submission-interval p95 gate on both clients in both
candidate runs. B1 captured FPS averaged **59.47** across clients, masking the
59.05 client; B2 captured **59.43 / 59.74**. The minimum captured-FPS gate is 59.5
per client. The control varies too; its A2 result is not a reason to lower the
acceptance threshold. **720p60 remains unmet; the port is not tournament-ready.**

Every candidate acceptance client uploaded once per each of its 1,800 measured
frames, bound every measured draw from its own record, and reported no fallback.
Cache capacity stabilized at 888,832 bytes on Battlefield and 1,777,664 bytes
on Fountain (two growth allocations per client including startup). The forward-frame counters distinguish this from setup/reference
uploads. Native and instrumented core hashes remain unchanged:

- Native: `a5b0eb0bbc9851bce8bc022a1cdab173bae8f6d405b8b2b039dc1f164df3a234`.
- Instrumented: `06e91f842dbc82a0f206acd789a14809b4133a336d97b792cc46b0e7cbd58c73`.

## Substage evidence

Separate 600-frame profiles use detailed timers; these runs are not acceptance
rates. Values are mean milliseconds per frame, client 0 / client 1. Texture
lookup is nested inside texture submission. The UBO pack/upload/bind rows are
disjoint, but their sum excludes program selection and timer bookkeeping.

| Stage | Direct numeric uniforms/packing | UBO pack | UBO upload | UBO bind | Direct textures | UBO textures |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| battlefield | 0.853 / 0.886 | 0.439 / 0.441 | 0.052 / 0.057 | 0.066 / 0.066 | 0.570 / 0.591 | 0.657 / 0.650 |
| fountain | 1.289 / 1.247 | 0.593 / 0.540 | 0.069 / 0.070 | 0.079 / 0.091 | 0.986 / 0.972 | 1.008 / 0.987 |

The candidate eliminates sampled `packRows` work in direct uniform upload;
packing still exists in `writeDrawUniforms`. Fountain's candidate sampled
native traversal/capture is about 62% of draw CPU; UBO staging/submission is
about 9%. These are stack categories, not isolated GPU costs. Texture/sampler
submission on the candidate is categorized under other flush work, so a zero
`uniformsAndTextures` sample category does not mean texture work vanished.
The retained texture path and native traversal remain substantial. Correction
p95 in the long Fountain candidate runs remains roughly 10–12 ms; the small
uniform savings alone do not remove correction-frame deadline pressure.

## Correctness and lifetime validation

- Strict every-frame comparisons: Battlefield 240; Fountain ICs/Peach 240;
  Link/Kirby 300 repeated three times. **1,380 frames**, zero differing RGBA
  bytes or camera mismatches, **2,760 full replica-memory coverage audits**.
- Two 1,800-frame heavy-correction repetitions on each stage, two clients:
  **1,256 corrections and 7,725 replayed frames**; all full-state, final-pixel,
  camera and audio-journal references match. All **4,781 checkpoint captures
  and 1,272 restores** were audited. Performance of these audit runs is not
  acceptance evidence.
- All six legal stages match their unchanged complete-state reference hashes,
  with audited sparse capture/restore and corrected-frame pixel/camera checks.
  Fountain uses 1,800 combat frames; the other five use 240-frame correctness
  probes. These short probes do not certify every stage at sustained 60 FPS.
- Two-client room flow and results/rematch pass with selection/rules retained.
  Public room identifiers, reconnect credentials, boot data, observation rows
  and game data are excluded from the committed artifact.
- Seven new unit tests cover std140 offsets/strides; every dynamic field,
  mutation, inactive-row clearing, reorder and owned copies; eight shader
  variants with unchanged arithmetic; retained/growing/shrinking capacity;
  one upload and aligned range binding; stale epoch and released-lease
  rejection; native heap replacement; unsupported limits; optimized-out
  reflected members and deliberately incorrect reflection; context loss,
  disposal and a fresh context.
- Full suite: **621 tests, 611 passed, 10 skipped, zero failures**.

No gameplay callbacks, effects, geometry, camera behavior or hosted-game startup
were removed. Production remains three-frame lockstep; this milestone does not
enable diagnostic rollback for players.

Reproduce the measured candidate with:

`node scripts/native-port/probe-certification.mjs --presentation=replica --replicacopy=dirty --mode=rollback --frames=1800 --label=ubo-final-b1`

Add `--uniformbuffer=0` for controls and `--map=fountain --pair=Pp,Pe` for
Fountain. Run A1, B1, A2, B2 sequentially, without competing browser benchmarks.
Use `--profile --drawtiming --frames=600` only for the separate cost profiles;
`--mode=isolated --frameoracle --dirtyaudit` for strict per-frame comparison;
`--snapshotaudit` for the separate heavy-correction checks.
