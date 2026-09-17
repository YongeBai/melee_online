# Packed native render staging — September 17, 2026

Historical checkpoint `f9212ba`; the later [layout-keyed resource pool](BROWSER-NATIVE-IMMEDIATE-POOL.md) replaces its rejected positional immediate experiment.

The retained candidate enables packed matrix staging. Immediate-plan reuse is
experimental and **off by default** after an intermittent per-frame pixel
mismatch. This continues `ed3a08d`'s direct C-to-WASM port; the native core,
callbacks, simulation, camera, draw order, 960×720 picture, effects, skinning,
deformation and stage motion are unchanged.

## Exact frame-scoped matrices

`createPackedModelReader` copies native matrices once into owned 120-float position
and normal buffers. Every active element retains its finite-value check; inactive
rows are explicitly zeroed, matching the old uniform packer. Matrix selection
and masks retain their original validation. Existing row views remain available
to the vertex verifier. WebGL receives the packed arrays directly instead of
copying separately allocated rows into another scratch buffer.

Each queued draw gets a distinct slot. Slots may be reused only after the old
queue is consumed/discarded or its renderer releases the exclusive cache lease.
WebGL copies uniform arguments during submission. The shared pool contains only
JS-owned values, not native pointers, owners or live heap views. Reader-local
heap views refresh when the underlying buffer changes. The pool ends with the
match; native presentation bindings are still recreated after replica overwrite.

The reviewed host changes add no WASM writes: native matrices are read, owned
arrays receive copies, and WebGL uploads write GPU resources. Existing dirty
marking remains intact and the core digest is unchanged. Tests cover every
nonzero 10-bit position mask, normal subsets, signed zero, matrix selection,
inactive stale rows, invalid/nonfinite data, heap replacement, queue independence
and exclusive lease/disposal rules.

## Immediate-plan experiment and frame-98 failure

An opt-in experiment also retained immediate particle/afterimage/text stream
capacity and WebGL buffer/VAO objects across renderer leases. It continued to
rebuild batch metadata, copy current vertices/registers and upload complete used
ranges. That design alone did not establish parity.

The first 240-frame Link/Kirby per-frame oracle stopped at frame 98. Final-frame
checks had missed this transient mismatch. The failure is preserved; no tolerance,
comparison scope or frame was relaxed. Old-path, matrix-only and immediate-only
120-frame isolation runs subsequently passed, as did a repeated combined
240-frame run. No specific omitted field has been established; those passes do
not resolve or approve the intermittent failure.

Immediate reuse is therefore **opt-in/off by default**. Accepted runs use the
existing per-renderer immediate lifetime and only reuse matrix staging. The
separate `--immediatereuse=1` diagnostic retains the unproven experiment for
investigation; it is not an accepted performance configuration.

## Controls and per-frame oracle

`createPresentationCache({packedState:false})` / `--packedstate=0` restore the
preceding milestone's matrix path. Immediate reuse defaults off independently.
Prior exact texture/context/shader optimizations stay enabled. An uncached
renderer retains the independent original paths for the final pixel oracle.

`--frameoracle --dirtyaudit --mode=isolated` additionally draws every tested frame
through a second reference cache with packed matrices disabled. Each draw gets
a freshly reconstructed renderer and resynchronized replica. Every RGBA byte
and the recorded camera fields are compared. Full-memory equality is checked
before both draws. The final oracle additionally uses a completely uncached
renderer. These slow duplicated draws/readbacks/scans are correctness checks,
not FPS results and not extra forward gameplay frames.

```
node scripts/native-port/probe-certification.mjs --presentation=replica --replicacopy=dirty --mode=rollback --frames=1800 --label=packed-safe-control --packedstate=0
node scripts/native-port/probe-certification.mjs --presentation=replica --replicacopy=dirty --mode=rollback --frames=1800 --label=packed-safe-candidate
```

Add `--map=fountain --pair=Pp,Pe` for Fountain. Separate `--profile` runs provide
CPU samples; they do not measure GPU execution or input-to-photon latency.

## Validation status

The safe default passed 300 consecutive Link/Kirby frames, crossing the earlier
frame-98 failure: all 829,440,000 RGBA bytes and recorded camera fields matched,
with 600 complete-memory coverage audits. This establishes this tested workload,
not the root cause of the rejected immediate-reuse experiment.

The earlier combined matrix/immediate benchmark is not a retained result. Its
passing final-frame oracles did not detect the later transient failure; its
allocation-profile savings must not be attributed wholesale to matrix staging.
Fresh safe-default A/B/A, profiles and regression results are recorded below.

Production remains three-frame lockstep. The 59.5 simulation/capture gate has
not passed. Canvas capture is not physical presentation or input-to-photon
latency, and these cases do not establish complete tournament/roster accuracy.

## Safe-default A/B/A

All runs use immediate reuse **off**, 1,800 forward frames per client, two
localhost Chromium processes on the same Ryzen AI 9 HX PRO 370 host,
15–130 ms input delay/jitter and the canvas observer. A1/A2 disable packed
matrices; B1 enables them. Cells show client 0 / client 1. All final full-state,
RGBA and recorded-camera comparisons passed.

| Workload/run | Draw ms/frame | Simulation FPS | Captured FPS |
| --- | ---: | ---: | ---: |
| Battlefield A1 | 10.144 / 10.476 | 48.635 / 48.762 | 38.713 / 36.561 |
| Battlefield B1 | 9.675 / 9.688 | 49.774 / 49.938 | 38.905 / 39.233 |
| Battlefield A2 | 11.290 / 11.449 | 43.126 / 43.233 | 32.113 / 32.405 |
| Fountain A1 | 13.171 / 13.066 | 40.989 / 41.051 | 25.742 / 26.367 |
| Fountain B1 | 12.084 / 12.353 | 43.299 / 43.287 | 27.895 / 29.056 |
| Fountain A2 | 12.193 / 12.660 | 42.506 / 42.445 | 28.887 / 26.275 |

These fresh runs are slower than the previous session even in the controls;
compare within this sequence rather than attributing cross-session differences
to the code. The workload still fails the performance gate.

## CPU profile evidence

Separate 1,800-frame samples use the same safe configuration; both clients'
profiles are retained in the benchmark artifact. This table is client 0,
cumulative sampled CPU milliseconds under timed drawFrame. Source/function
columns are self samples; total includes native traversal and WebGL submission.

| Workload/profile | Total draw | Matrix reader | packRows | Immediate geometry |
| --- | ---: | ---: | ---: | ---: |
| battlefield before | 21901.6 | 1478.7 | 1218.1 | 1403.4 |
| battlefield after | 22231.2 | 936.8 | 321.5 | 1427.7 |
| fountain before | 20322.3 | 1302.2 | 947.1 | 1314.1 |
| fountain after | 23417.9 | 1206.0 | 331.5 | 1498.5 |

Matrix-reader and packing samples fall, while immediate-stream allocations
remain. This supports the targeted reduction in matrix copying/allocation.
The sampled total does not establish a consistent overall speedup: other work
and host/sampling variation can offset it. These are CPU samples, not GPU timers.

Correctness and the measured scope take precedence over the combined experiment's
larger speedup. The next investigation should isolate immediate-resource lifetime
and the intermittent frame-98 mismatch before trying to retain that capacity
again. Correction bursts and native traversal/state capture also remain material
costs; average simulation-only time is not the complete frame budget.

## Correctness evidence

The final matrix-only configuration passed:

- Six-stage rollback convergence against the original-core state hashes:
  Battlefield, Yoshi's Story, Pokémon Stadium, Dream Land and Final Destination
  at 240 frames; Fountain Ice Climbers/Peach at 1,800 combat frames. Both clients
  matched complete state, final 960×720 RGBA and recorded camera values.
- Full per-frame RGBA/camera comparisons for Battlefield Falco/Fox (240 frames),
  Fountain Ice Climbers/Peach (240) and Battlefield Link/Kirby (300):
  **2,156,544,000 bytes compared, zero differences**, with **1,560 full-memory
  coverage audits** before the paired draws. The independent final uncached
  oracle also passed. Screenshots of Fountain and Link/Kirby were reviewed for
  framing, models and HUD; this does not extend the tested roster coverage.

These checks preserve the original callbacks, dynamic geometry, particles/text,
stage behavior and native camera. They do not certify every move or interaction.
The Fountain workload retains the earlier diagnostic cosmetic settings; those
settings are identical between controls, candidate and reference.

The two-browser room regression passed join/refresh, restored human hand and
keyboard controls, and 600 matching fighter frames. Results/rematch regression
passed elimination, two-vote restart with retained selections, the accelerated
28,800-step timeout, and return to the six-stage menu. Production remains
three-frame lockstep; these lifecycle checks are not rollback performance tests.

`npm test`: **601 total, 591 passed, 10 skipped, 0 failures**. Source, served modules
and the four refreshed audited host hashes match. No native core or game assets
were changed or committed. `git diff --check` passed.

The [sanitized benchmark record](benchmarks/browser-2026-09-17-native-packed-staging.json)
contains the safe A/B/A reports, both-client CPU profile summaries, all six
reference hashes, strict audits, lifecycle results, test counts and the rejected
frame-98 failure/isolation evidence. Raw report/profile SHA-256 digests and source
provenance identify the measured configurations. The failed experiment remains
explicitly unaccepted even though later isolation runs passed.
