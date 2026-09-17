# Rejected eager reconciliation and denser checkpoints

**Rejected. All experimental runtime/harness/test/contract changes have been
reverted to `ee45fe3` (runtime `f0bcaaa`).** The measurements below describe a
diagnostic experiment, not a shipped scheduling change. Production rooms remain
three-frame lockstep. Hosted
no-ISO startup, native callbacks/effects, camera/framing and network window are
unchanged. It is not Slippi-style local prediction or tournament certification.

## Hypothesis and boundaries

The retained UBO run still had Fountain correction p95 around 10–12 ms beside
roughly 6.4 ms mean draw CPU. A correction performed inside the next forward
callback may exceed its deadline when combined with rendering. Correcting on
arrival could move work between frames, but may perform more corrections and
has no benefit if the event loop already has little free time. Denser exact
sparse checkpoints could reduce replay depth at the cost of more captures and
retained memory. Those are hypotheses, not assumed wins.

`--eager` enables reconciliation after a late remote packet only when the
kernel is inactive and the harness owns no forward/render boundary. Replay is
synchronous and atomic, calls the same complete restore/step path, and emits no
intermediate presentation or audio. The kernel explicitly rejects reentrant
advance/reconcile/disposal, defers reentrant input delivery, rejects closed or
failed execution, and leaves cleanup available after errors. The host gate
checks the forward/render phase and both renderer callback leases.

`--checkpoint=1|2|4` changes checkpoint spacing. The network window remains 12;
input/prediction history retains the original four-frame history floor even
with denser checkpoints. The sparse store still enforces the existing 2 GiB
budget and accounts for live shared pages. Every obsolete checkpoint handle is
released through the same store. No adaptive cadence is implemented.

## Timeline semantics

`--correctiontrace` records page-clock input arrivals, nominal deadline lead,
forward start/end, draw start/end/submission, snapshot captures/restores, and
correction lookup/restore/replay/depth/origin. The origin distinguishes eager
arrival work from reconciliation inside advance or final drain. Traces are
bounded and fail on overflow. Detailed traces are excluded from acceptance runs.

Arrival-to-next-forward lead uses the subsequently observed callback. Nominal
deadline lead includes accumulated clock debt and can be negative. Both are
recorded; neither should be described as guaranteed idle time. Browser capture
receipt uses the same page clock, but cannot identify exactly which draw was
captured. Correlation counts overlapping correction intervals within receipt
gaps, not physical scanout, exact dropped-frame attribution or input latency.

An initial 600-frame Fountain control trace found 53/48 corrections, all inside
advance. Correction p95 was 14.6/15.9 ms in this traced run. Mean arrival-to-next-
forward lead was only 1.92/2.17 ms (p95 6.1/6.5 ms). Corrections overlapped 41 of
87 and 36 of 86 submission gaps over 20 ms, and 46 of 154 and 42 of 133 capture
receipt gaps over 25 ms. This supports testing correction scheduling, but also
shows that many misses are not explained by those correction intervals alone.
The traced host was slower than the earlier UBO benchmark; use matched controls
rather than comparing across sessions as if load were fixed.

## Short pilot selection

Seven sequential 600-frame Fountain ICs/Peach pilots compared intervals 1, 2
and 4, with and without eager correction, followed by another interval-4 control.
These short probes are not acceptance runs. Values below average two clients.

| Configuration | Sim FPS | Captured FPS | Capture CPU total per client ms | Peak retained MiB |
| --- | ---: | ---: | ---: | ---: |
| control4 | 57.07 | 51.87 | 211.3 | 58.6 |
| eager4 | 58.04 | 54.01 | 207.4 | 58.5 |
| eager2 | 57.59 | 53.60 | 405.5 | 70.1 |
| eager1 | 57.28 | 51.10 | 741.8 | 91.8 |
| defer2 | 54.76 | 46.12 | 459.8 | 70.3 |
| defer1 | 54.21 | 44.11 | 838.5 | 93.3 |
| repeatcontrol4 | 56.77 | 50.06 | 220.7 | 58.6 |

Interval 4 with eager correction was selected for longer repeats. The one-frame
variants roughly tripled or quadrupled checkpoint capture CPU. The trailing
control also slowed, so a single pilot cannot establish a scheduling gain. All
pilots matched their own complete-state, final RGBA, camera and audio-journal
references, with no rejected late inputs.

## Matched long repeats and decision

[Sanitized evidence](benchmarks/browser-2026-09-17-native-reconciliation.json)
contains all seven pilots, eight long runs, two timeline probes, experimental
source hashes and raw-report hashes. A defers correction until advance; B
corrects on arrival when idle. Both use four-frame checkpoints and the same
experimental guards/harness, with detailed trace and draw timers disabled.
Neither A nor B is an untouched-runtime performance measurement. Each trial
advances 1,800 frames per client with identical scripted combat and synthetic
15–130 ms delayed/reordered input. Entries are client 0 / client 1.

| Stage | Trial | Sim FPS | Captured FPS | Submit p95 ms | Correction p95 ms | Callback p95 ms |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| battlefield | A1 | 59.34 / 59.45 | 57.96 / 57.99 | 22.0 / 21.9 | 11.5 / 11.5 | 17.8 / 17.5 |
| fountain | A1 | 55.71 / 55.69 | 46.92 / 45.58 | 26.9 / 25.8 | 18.3 / 16.6 | 24.5 / 23.9 |
| battlefield | B1 | 59.40 / 59.49 | 58.24 / 57.82 | 21.1 / 21.3 | 10.2 / 11.2 | 15.3 / 15.2 |
| fountain | B1 | 55.95 / 56.17 | 45.64 / 46.74 | 25.4 / 25.0 | 16.5 / 19.7 | 19.9 / 19.9 |
| battlefield | A2 | 59.06 / 59.20 | 54.76 / 55.83 | 23.2 / 22.7 | 12.1 / 9.9 | 19.6 / 18.8 |
| fountain | A2 | 57.51 / 57.68 | 50.81 / 52.16 | 24.9 / 24.9 | 14.9 / 17.6 | 22.1 / 22.1 |
| battlefield | B2 | 59.59 / 59.68 | 59.04 / 59.29 | 20.1 / 20.1 | 9.9 / 9.5 | 14.4 / 14.4 |
| fountain | B2 | 57.48 / 57.59 | 50.87 / 49.09 | 24.4 / 24.0 | 14.9 / 16.5 | 18.1 / 18.5 |

Fountain is neutral in B1 and worse in B2 for mean captured cadence: across both
repeats and clients, A averages **48.87** versus B **48.08 captured FPS**. Its
correction count rises from 665 to 705 and replayed frames from 4,175 to 4,348.
Battlefield averages 56.63 versus 58.60 captured FPS, but B1 is nearly neutral
and neither B repetition passes every client's gates. Fountain callback p95
falls because replay moved outside that callback; the observed frame delivery
does not show a corresponding repeatable win. This is why callback p95 alone
is insufficient for selecting the implementation.

The candidate timeline confirms that all 50/52 corrections moved to arrival
handlers. Capture receipt gaps over 25 ms remain 154/153, with 29/39 overlapping
correction intervals. Its short captured cadence is 53.33/54.29 FPS, which does
not overturn the longer paired results. Eager arrival-to-forward lead includes
the correction itself and must not be called idle time. Neither trace provides
an exact causal assignment of a missed displayed frame.

The machine varied substantially: the later deferred Fountain control rose
from roughly 46 to 51.5 mean captured FPS, and current draw/simulation costs
exceed the earlier UBO session on the same GPU/backend. Cross-session differences
therefore cannot establish a runtime regression or the size of an optimization.
The rejection is based on the absence of a repeated Fountain delivery gain, not
a claim that eager correction is universally slower.

All long runs preserved complete state against their known-input reference,
including the retained milestone's reference hash; final RGBA comparisons found
zero different bytes, cameras matched, audio journals matched and emitted no
replay audio. There were no rejected late inputs. The experimental kernel's 11
focused unit tests passed, including intervals 1/2/4, prediction history, memory
release, reentrancy and failure guards. These checks are not exhaustive native
correctness proof. The broad per-frame/heavy/six-stage/rooms suites were stopped
after performance rejection and are **not claimed** for this candidate.

## Restored runtime

All 26 recorded source/built/served file hashes match retained runtime `f0bcaaa`,
including both native cores. Restored full tests: **621 total, 611 passed,
10 skipped, zero failed**. Hosted startup and the existing CPU hand/keyboard
visibility fix remain intact. The 720p60 acceptance target remains unmet.

Next work should reduce total render/replay cost or measure event-loop/GPU
scheduling pressure directly. Moving synchronous replay from one callback to
another did not create enough usable frame budget on Fountain. Preserve the
unchanged simulation clock, full snapshot boundary, effects/camera, independent
reference renderer, and per-client capture/latency distinctions.

The restored product-menu probe passed CPU hand/icon and switching checks, but
later CPU combat exposed an existing missing-model error. A separate 1,800-frame
reproduction identified Fox Illusion's secondary joint, which its original item
callback draws outside the main model tree. Attachment enumeration lacked this
joint. This requires a separate correctness fix; the restored menu-to-match
regression is not reported as wholly passing.
