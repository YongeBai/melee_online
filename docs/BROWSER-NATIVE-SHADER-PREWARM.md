# Cold shader preparation with the exact presentation cache

**Rollout rejected; experimental runtime, harness, tests and host-contract
changes restored to `9ee0c78`.** The pre-existing constructor prewarming option
is unchanged. This is not a finding that prewarming has no benefit: it removes
the observed compilation spikes, but the tested rollout does not solve the
remaining sustained cadence problem or establish complete product coverage.

This experiment starts at `9ee0c78` and uses the existing native shader
recording/preparation path. It tests whether moving cold program compilation
before the first native draw resolves the remaining sustained 720p60 misses.
Production rooms remain three-frame lockstep; no tournament certification or
physical input-latency result is claimed.

## Observed bottleneck

Fresh Chromium profiles ran with `MESA_SHADER_CACHE_DISABLE=true`. The current
Battlefield Falco/Fox control compiled five programs per client during 1,800
combat frames. Compile-containing draws reached 50–77 ms. Link/Kirby combat
compiled nine programs in six frames, with maximum draws of 83–96 ms. The
focused original Link item-move probe encountered 14 new programs; Kirby's
Link-copy/arrow probe encountered nine. Fox/Falco side-B probes each encountered
one additional program after their standard input prelude.

Fountain ICs/Peach compiled three programs in two frames per client. Only two
of 169–202 submission intervals over 20 ms contained those compilations.
Only two of 309–313 capture-receipt gaps over 25 ms overlapped their draw
intervals. Cold compilation explains sharp individual stalls, but very little
of Fountain's recurring deadline misses in this workload.

Submission intervals use the page clock. Capture correlation uses the same
page's receipt timestamps and the entire draw interval containing compilation,
not an exact compiler interval or an identified dropped image. Canvas capture
is not compositor scanout or input-to-photon latency.

## Candidate and safety boundary

Fourteen recordings from the current core/generators produced 87 unique exact
GLSL source pairs (443,315 source characters). They cover the tested six stages,
Battlefield Falco/Fox and Link/Kirby combat, Fountain ICs/Peach, Illusion/Phantasm,
Link items, and Kirby's Link-copy/arrow transitions. This is observed fixture
coverage, **not an exhaustive proof of every reachable roster/costume/move
variant**. An unseen source pair still takes the original exact compile path.

The existing catalog validator checks the core and generator identities, exact
duplicate pairs, 4,096-program limit, 262,144-character per-source limit and
32 MiB aggregate limit. Preparation uses the same real WebGL context and
presentation cache as drawing, including its current UBO source transformation
and layout reflection. Link status is checked synchronously. No gameplay steps,
native callbacks, fake materials, or hidden draws are used to prepare programs.
Unsupported programs fail through the existing compiler checks; the existing
direct-uniform fallback remains available when a UBO layout cannot be used.
These limits bound source storage and program count, not measured driver VRAM.

The experimental host compared every native heap word around preparation,
plus exported mutable globals and the host audio journal in the snapshot
harness. All were unchanged. Fighter-state checks also remained enabled.
The first full-audit Fountain trial compared 60,686,336 native bytes; all 87
programs prepared, 40 were used, and none compiled during measured play.
Preparation cost roughly 1–2 seconds before the first draw/live frame count.

Three additional tests exercised the actual material renderer with a fake GL
boundary: exact source lookup/duplicate suppression without any native module
access during compilation, cache isolation and recompilation in a fresh cache
after context restoration, and failed-link cleanup. The experimental context
guard invalidated a cache when loss was signalled and rejected reacquisition
after restoration. It did not implement seamless recovery of a live product
match. Existing catalog and presentation-cache tests also passed.

## Matched repeats

A disables preparation; B enables the same 87-program catalog. All eight runs
use identical experimental source hashes, the same catalog, cold driver cache,
1,800 forward frames per client, browser capture, and the unchanged synthetic
15–130 ms delayed/reordered transport. They run serially on the same host.
Preparation is outside live timing. A includes the same instrumentation and
guards as B, so it is not an untouched-runtime measurement.

Each entry is client 0 / client 1. Submission p95 is the **interval between
submitted frames**; draw CPU p95 is reported separately in the evidence.

| Stage | Trial | Simulation FPS | Captured FPS | Submission interval p95 ms | Max draw CPU ms | Live compiles |
| --- | --- | --- | --- | --- | --- | --- |
| Fountain | A1 | 58.88 / 58.97 | 57.17 / 57.20 | 21.6 / 22.6 | 72.2 / 60.0 | 3 / 3 |
| Fountain | B1 | 58.88 / 58.99 | 55.87 / 56.70 | 22.5 / 22.1 | 33.2 / 37.2 | 0 / 0 |
| Fountain | A2 | 59.12 / 59.21 | 56.29 / 57.78 | 24.1 / 21.4 | 41.7 / 52.5 | 3 / 3 |
| Fountain | B2 | 59.17 / 59.33 | 58.55 / 57.54 | 22.5 / 21.9 | 38.8 / 35.2 | 0 / 0 |
| Battlefield | A1 | 59.50 / 59.58 | 59.71 / 59.81 | 20.5 / 20.3 | 55.8 / 47.5 | 5 / 5 |
| Battlefield | B1 | 59.70 / 59.78 | 59.91 / 60.01 | 20.3 / 20.8 | 25.0 / 24.8 | 0 / 0 |
| Battlefield | A2 | 59.46 / 59.60 | 59.58 / 59.77 | 20.2 / 20.3 | 52.8 / 59.1 | 5 / 5 |
| Battlefield | B2 | 59.69 / 59.77 | 59.92 / 59.95 | 19.7 / 20.3 | 25.3 / 24.1 | 0 / 0 |

Battlefield captured FPS averages 59.719 in A and 59.947 in B. Its cold
compilation spikes disappear repeatably. Fountain averages 57.109 in A and
57.164 in B; B1 is worse and B2 is mixed across clients. Every Fountain
candidate misses the 59.5 simulation/captured-FPS gates and the 20 ms
submission-interval p95 gate. Battlefield also fails that interval gate on
at least one client in both candidate repeats. Draw CPU p95 itself remains
below 20 ms in all eight runs; it must not be conflated with frame cadence.

All trials match their on-time complete-state, final RGBA, camera and audio
journal references. The complete-state hash also matches across A/B for each
stage, so the comparison does not hide a different starting simulation state.

## Correctness checks and restoration

[Sanitized measurements](benchmarks/browser-2026-09-17-native-shader-prewarm.json)
retain raw-report hashes, source/catalog identities, compile events, cadence
correlation counts, complete-state references and validation results. The
[archived experimental patch](experiments/rejected-shader-prewarm.patch) applies
to `9ee0c78` with `git apply --unidiff-zero`; it is documentation, not deployed
runtime code. Generated GLSL
recordings remain ignored diagnostic output, and no default catalog selection
or product prewarming was introduced.

- Battlefield and Fountain each passed 240 every-frame zero-tolerance RGBA and
  camera comparisons with full dirty-copy coverage. All 480 frames matched.
- Both stages passed separate 1,800-frame heavy-correction runs, with every
  checkpoint capture/restore audited and complete-state/final-image/camera/
  audio-journal references matching.
- All six legal stages passed their two-client 240-frame correction regressions
  with preparation enabled and unchanged complete native memory/globals/host
  state during preparation.
- Fox and Falco each passed eight complete side-B attachment lifetimes; Link's
  item moves and Kirby's Link-copy/arrow transitions passed. These fixtures
  used 30, 30, 45 and 40 prepared programs respectively, with zero unprepared
  programs used and zero recorded post-preparation compile events. Explicit
  ghost birth/retirement checkpoint restores passed fresh image/camera checks.
- Normal production lockstep rooms passed 600 frames, results, rematch and
  timeout checks. Those product-room tests do not enable the experimental
  preparation option and must not be described as warmed-room performance.
- The candidate suite passed 625 tests: 615 passed, 10 skipped, zero failed.
  After reverting the experiment, the retained suite passed 622 tests:
  612 passed, 10 skipped, zero failed.

The early Fountain every-frame oracle predates the final addition of the
opt-in rollback-probe plumbing. The warmed shader, constructor and cache paths
are identical; subsequent matched trials use one frozen full source identity.
All 163 retained host pins and the source/built/served restoration checks match
the baseline after reverting.

## Decision

Shader preparation is effective for the measured cold spikes; it is not the
remaining general-purpose CPU-emulation bottleneck. This trial does not supply
a repeatable sustained Fountain improvement or complete production variant
coverage. Do not promote this sampled catalog as a universal tournament profile
or claim that cold-compilation elimination achieves the acceptance target.

The next performance investigation should prioritize steady draw submission
and its interaction with correction work and browser scheduling. Removing two
compilation frames cannot explain or resolve hundreds of recurring gaps.
The last warmed Fountain repeat measured 1.44–1.46 ms mean forward simulation,
7.27–7.42 ms mean draw submission, 0.42–0.43 ms presentation copying and
13.2–15.2 ms correction p95. These costs overlap in the same frame-processing
path; they are not independent GPU elapsed-time measurements.
