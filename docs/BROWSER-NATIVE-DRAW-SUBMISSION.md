# Native draw submission experiment — September 17, 2026

This continues the direct C-to-WASM port from `dc7a429`, using its instrumented
write bitmap and independent presentation replica. It does not change Dolphin,
production room transport, the original native core, gameplay timing, camera,
stage movement, effects, skinning, or the 960×720 game picture.

## Measured target

Chrome CPU profiles were collected in the existing 1,800-forward-frame,
two-browser delayed-input rollback workloads: Battlefield Falco/Fox and Fountain
Ice Climbers/Peach. Every forward frame is drawn. The canvas observer remains
on. Profiles are diagnostic and add overhead; they are not the timed A/B controls.

`scripts/native-port/summarize-draw-profile.mjs` filters samples to the timed
`drawFrame` stack, excluding startup and the final uncached pixel oracle. It
reports self time, inclusive time, and disjoint broad stages. Inclusive rows
must not be added together. CPU samples describe native traversal, JS state
capture and WebGL command submission; they do not measure GPU execution time.

The original Fountain client-0 profile spent 23,662 sampled milliseconds under
`drawFrame`: 13,175 in native traversal and its JS capture callbacks, 8,143 in
uniform/texture application, 1,579 elsewhere in flush, and 766 elsewhere in draw.
Exact texture revalidation alone accounted for 3,429 ms (14.49% of sampled draw
time). Context/fog decoding, matrix packing and repeated shader key/source
construction were additional visible costs. The broad native-traversal bucket
includes JS callbacks reached from WASM; it is not exclusively native C work.

## Candidate and reference paths

- Compare every texture/palette byte using exact 32-bit words and byte tails.
  Unaligned views use DataView. Retained images still own copies; address reuse,
  palette changes and even one changed tail byte invalidate the texture.
- Skip uniform packing/uploads only when the linked WebGL program returns a null
  location. Shader source, transform-feedback outputs and active uniform values
  are unchanged. No approximate floating-point comparison is introduced.
- Decode a camera/light/fog snapshot once when repeated source words match.
  Every read checks all 158 context words and five fog words. The light-load
  counter is returned exactly through a new outer snapshot when it changes.
  Cached arrays are owned, immutable JS values; no live WASM view is retained.
  Changed/invalid values take the original validated decoder.
- Retain the existing complete shader-variant key alongside compiled programs
  within the same exclusive GL-context cache. This avoids regenerating identical
  source after every replica lease. Native bindings, mutable geometry and WASM
  allocations retain their existing short lifetime.

`createPresentationCache({submissionOptimized:false})` selects the old comparison,
uniform and context paths and a per-renderer variant map. The certification runner
exposes this as `--drawopt=0`. An uncached renderer also uses the original paths,
so the full final pixel/camera oracle is independent of these optimizations.

The dirty-host contract is renewed only for reviewed source changes: the new
comparators and context reader read WASM without writing it; packing writes
JS-owned scratch arrays; shader caching retains GL resources rather than native
pointers. Existing marked camera writes remain unchanged. No core pin is changed.

## Reproduce

```
node scripts/native-port/probe-certification.mjs --presentation=replica --replicacopy=dirty --mode=rollback --frames=1800 --label=draw-control --drawopt=0
node scripts/native-port/probe-certification.mjs --presentation=replica --replicacopy=dirty --mode=rollback --frames=1800 --label=draw-candidate
```

Add `--map=fountain --pair=Pp,Pe` for Fountain. Add `--profile` for a separate CPU
profile run, then pass its output directory to `summarize-draw-profile.mjs`.
The final validation artifact records source hashes, exact results and limits.

Production stays lockstep. Canvas capture is not monitor scanout or measured
input-to-photon latency. Full-state convergence and fresh pixels in these
workloads do not establish complete tournament accuracy or certify the roster.

## Timed A/B/A results

Each cell lists client 0 / client 1. A2 and A3 use `--drawopt=0`; B2 enables all
four changes. Same 1,800-frame combat script, resolution, observer, dirty core,
15–130 ms packet delay/jitter pattern, and every-forward-frame presentation.

| Workload/run | Draw submission ms/frame | Simulation FPS | Captured FPS |
| --- | ---: | ---: | ---: |
| Battlefield A2 | 11.267 / 11.526 | 50.120 / 50.282 | 39.620 / 38.167 |
| Battlefield B2 | 9.637 / 9.722 | 51.911 / 52.092 | 42.014 / 42.282 |
| Battlefield A3 | 12.048 / 12.231 | 45.965 / 46.099 | 34.146 / 34.678 |
| Fountain A2 | 17.259 / 17.129 | 37.196 / 37.234 | 21.113 / 21.989 |
| Fountain B2 | 11.041 / 11.049 | 48.854 / 48.902 | 35.564 / 36.136 |
| Fountain A3 | 14.945 / 15.091 | 41.865 / 41.825 | 24.725 / 24.719 |

The retained combination reduced measured draw submission by 1.63–2.51 ms on
Battlefield and 3.90–6.22 ms on Fountain relative to the surrounding controls.
These are observed differences, not a hardware-independent speedup guarantee.
Fountain B2 and A3 had nearly identical simulation-only costs (about 1.42 ms)
and comparable replica-copy costs, while draw submission differed by about 4 ms.

Host variation was substantial. Earlier A1 controls measured 9.79–10.03 ms
Battlefield and 13.78–14.10 ms Fountain. B1 (only word comparison and inactive
uniform preparation) measured 11.15–11.39 and 20.96–21.48 ms respectively. An
unrelated Docker build was observed during that interval; its causal share was
not isolated. B1 is inconclusive, not evidence of an independent win for either
component. The artifact keeps these early runs instead of dropping them.

All timed runs still fail the 59.5 simulation/capture acceptance gates. B2's
mean forward callback remains about 16.5 ms on Battlefield and 18.4–18.7 ms on
Fountain, before accounting for the effect of uneven correction/capture cadence.
Mean correction events cost roughly 16–22 ms. Replica copying is below 0.85 ms
on average. Further draw/capture scheduling and correction work remain; this
milestone does not enable production rollback or claim 720p60 completion.

## Post-change profile and remaining targets

Client-0 sampled self time by source file under timed `drawFrame`:

| Source / workload | Before ms | After ms |
| --- | ---: | ---: |
| Presentation cache, Battlefield | 1,446.34 | 361.50 |
| Context/fog handling, Battlefield | 1,617.75 | 304.62 |
| Presentation cache, Fountain | 3,516.60 | 655.87 |
| Context/fog handling, Fountain | 1,918.08 | 415.80 |

The cache source includes its smaller non-texture operations. Shader-source
construction had 210/228 sampled self milliseconds before and no samples after
in Battlefield/Fountain respectively; this is sampling evidence, not a claim
that every construction call costs zero. Total sampled draw time was 17,595 →
12,576 ms on Battlefield and 23,662 → 15,999 ms on Fountain. Sampling overhead,
JIT attribution and host variation prevent treating these totals as another
controlled FPS measurement. Unattributed GC is reported separately, not silently
assigned to draw functions.

Afterward, Fountain's broad CPU buckets were about 9,839 ms native traversal and
state capture, 4,046 ms uniform/texture application, 1,391 ms other flush work,
and 724 ms other draw work. Matrix snapshot allocation/repacking, texture-state
decoding, structural shader-key serialization and immediate-geometry assembly
remain visible JS costs. They are candidates for a future exact packed-state
boundary, not authorization to skip native callbacks, deformation or effects.
GPU elapsed time has not been isolated by this CPU profile. Capture scheduling
and correction tails also remain separate from renderer submission cost.

## Equivalence checks

The six-stage delayed-input probes matched the pre-existing original-core hashes:
Battlefield, Yoshi's Story, Stadium, Dream Land and Final Destination at 240
frames; Fountain Ice Climbers/Peach at 1,800 combat frames. Both clients matched
all 2,764,800 final RGBA bytes and the fresh native camera. Replica draws did not
mutate authoritative gameplay memory, globals or the host journal.

Separate no-correction tests audited all 240 draws for Battlefield Falco/Fox,
Fountain Ice Climbers/Peach and Battlefield Link/Kirby. Each pre-draw full-memory
comparison passed (12.13 / 14.56 / 12.13 GB cumulatively compared). These slow
full scans are correctness checks and are excluded from performance conclusions.
Their final full-state, pixel and camera oracles also matched. Screenshots of
Battlefield and Fountain were reviewed for unchanged framing and native HUD.

The normal two-browser, 600-frame lockstep room probe remained synchronized.
The final artifact also records the results/rematch/return and full test outcomes.
No extracted assets, WASM binaries, snapshots, screenshots or credentials are
included in the committed benchmark artifact.

Results verification completed: both clients agreed on elimination at frame 807,
a two-vote rematch, the accelerated 28,800-step timeout, and return to the six-stage
menu. The timeout probe bypasses relay/presentation during acceleration; it is
not an eight-minute FPS or latency measurement. Full tests: 597 total, 587 passed,
10 skipped, zero failed.

Exact source hashes, controls including B1, both clients' metrics, CPU-profile
breakdowns, full-state/pixel/camera checks and regression outcomes are recorded
in [the benchmark artifact](benchmarks/browser-2026-09-17-native-draw-submission.json).
