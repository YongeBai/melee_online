# Frame pacing and input timing — September 19

This iteration targets CPU headroom and tail latency, not merely average FPS.
Work stays in `melee_online-rollback-critical`; no running public deployment or
other worktree is modified. Hosted assets, native simulation, camera, roster,
rules and the 960×720 4:3 canvas are unchanged.

## Measured bottlenecks

Two independent Chromium processes on the Radeon 890M ran Jigglypuff/Luigi
(CSS tile indices 20,2), Fountain of Dreams, 1,800 frames per run. Each browser
simulates and renders locally. A CPU-profiled discovery run identified
`getError` as the largest individually named profile entry: approximately
2.3 seconds over the 30-second match, or 1.28 ms per frame. An unprofiled
baseline repeated 1.29 ms/frame, with 8.8–9.0 ms maxima. Profiling itself
perturbed cadence: that discovery run failed the simulation threshold on one
seat and is not counted as acceptance evidence.

Other individually sampled hotspots, roughly per forward frame, were uniform
record packing (0.43 ms), immediate geometry (0.33 ms), native model reads
(0.24 ms), texture decoding (0.23 ms), and garbage collection (0.23 ms).
These are sampling estimates, not additive phase timings or guaranteed savings.
Aggregate render work is still much larger than ordinary simulation; the
controlled run used about 1.05–1.08 ms/forward step and 0.14–0.16 ms/reconcile
call on average. Correction spikes reached roughly 4.6–6.1 ms.

## Changes

1. Defer the redundant per-frame GPU error round-trip to the loading and final
   presentation boundaries. Those checks still throw on errors. An explicit
   every-frame diagnostic option remains available. All draws, shaders,
   textures, native callbacks and memory writes are unchanged.
2. After a transport stall, anchor the frame clock at the current callback.
   Previously the next callback only reset the clock origin, needlessly adding
   another idle display interval before retrying. Hidden/focus resets retain
   their original fresh-origin behavior. No simulation frames are skipped and
   catch-up debt is not manufactured. Clock and live-driver tests cover this.
3. Add probe-only phase/input timing and a GPU-check control; move screenshots
   outside the measured match. Screenshots during the earlier discovery runs
   could themselves create long stalls. No new telemetry runs in normal play.
4. Keep entry HTML `no-store`, while large modules/assets retain private
   conditional revalidation. A startup trace found that the failing cached
   isolated-document reload entered with no sessionStorage record, despite the
   preceding document holding a valid record. Canonicalizing the URL did not
   fix it. Disabling only HTML caching preserved the record and advanced both
   browsers to epoch 2; the authenticated 60-frame refresh/match probe passed.
   This fixes the previously unresolved refresh issue on the tested Chromium
   build without forfeiting the large-asset download optimization.

## Clean GPU-check comparison

Both rows use the same optimized build, with the probe restoring an equivalent
per-draw `getError` barrier in the control. It occurs after replica teardown
rather than inside the draw callback, so this is a barrier-cost control rather
than a byte-identical checkout A/B. CPU profiling is disabled and screenshots
are taken only after completion. The scheduler change was not yet installed
in either combat comparison run.

| Metric | Every-frame check control | Deferred check |
| --- | --- | --- |
| Mean draw CPU, averaged across peers | 6.85 ms | 5.46 ms |
| Draw p95, peers | 11.32 / 11.23 ms | 8.99 / 9.12 ms |
| Draw p99, peers | 15.05 / 14.54 ms | 11.34 / 12.01 ms |
| Largest draw, peers | 35.77 / 37.01 ms | 23.20 / 22.97 ms |
| Captured cadence, seat 0 | 59.923 FPS | 59.973 FPS |
| Capture interval p95 | 19.21 ms | 19.50 ms |
| Largest capture interval | 43.96 ms | 36.01 ms |
| Capture gaps over 25 ms | 6 | 5 |

Mean draw CPU fell about 20%. Tail draw cost improved, but capture p95 did not;
the remaining 36 ms interval means this is **not stutter-free**. No interpolation,
resolution change or dropped simulation frame accounts for the improvement.
Both runs captured all 1,800 distinct sampled images with zero black/wrong-size
frames, confirmed frame 1799 on both peers and identical fighter state. Final
camera eye, interest, FOV, aspect and resolution also match between runs.
The final GPU check passes. The final Fountain image was visually inspected.

The final authenticated release reconnect run also passed after the scheduler
and HTML-cache changes: 1,800 distinct captures, exact peer convergence and no
late-input rejection. A forced seat-1 outage recovered in 274 ms without an
epoch change. Raw capture was 59.435 FPS including the outage; active capture
was 59.978 FPS. Active simulation was 59.784–59.921 FPS, raw simulation
59.245–59.380 FPS, and draw p95 6.68–6.79 ms on Battlefield. Both final GPU
checks passed. These are not uninterrupted-cadence claims across disconnect.

## Input measurement boundary

`--timing --latency` sends 40 real CDP keyboard presses through the ordinary
browser input handlers, alternating seats and direction. It records the event
handler time, immutable input-send boundary and first draw submission after
that input successfully advances local simulation. A frozen, already-transmitted
input cannot be misattributed to a later key event. This probe does not use the
scripted combat input provider. The sample size is 20 presses per seat.

| Event-handler → draw submission | Check control | Deferred check |
| --- | --- | --- |
| Mean, seat 0 / seat 1 | 16.32 / 15.02 ms | 14.72 / 15.18 ms |
| p95, seat 0 / seat 1 | 19.24 / 17.32 ms | 17.22 / 20.16 ms |

There is no consistent input-tail improvement in this small sample: one seat
improved and the other worsened. Both latency trials include the new stall-clock
fix, but recorded zero rejected advance attempts, so they do not measure that
fix's benefit. The clock/live tests isolate the removed extra recovery tick.

A subsequent authenticated release measurement verifies native input consumption
as well: for every one of the 40 presses, the original fighter's
`input.lstick[0].x` already reflects the new direction in the first submitted
frame after acceptance. Event-to-native-input-frame submission averaged
14.05 / 14.66 ms (p95 17.06 / 18.47 ms), with no rejected advances. Both peers
confirmed frame 1799 and converged, at 59.90–59.93 simulation FPS. This rules
out an additional whole simulation-frame queue between local acceptance and
fighter input consumption in this tested case, not animation or display latency.

These are **not physical input-to-photon measurements**. They exclude device
polling, pre-handler OS/browser queueing, GPU completion, compositor scheduling
and monitor scanout. Removing `getError` changes how much GPU waiting is included
in CPU submission time; a submission reduction cannot be called the same-sized
physical-latency reduction. Directional X-motion detection is also recorded as
an exploratory signal, but collision, turning and ongoing momentum make it an
imperfect response oracle; do not use it as a competitive latency certification.

## Reproduce

Run the following separately from builds and other browser benchmarks:

```sh
node scripts/native-port/probe-native-rooms.mjs --rollback --frames=1800 --capture-seat=0 --combat --pair=20,2 --stage=2 --timing
# Add --gpu-check-every-frame for the synchronous-check control.
node scripts/native-port/probe-native-rooms.mjs --rollback --frames=1800 --pair=20,2 --stage=2 --timing --latency
# Add --profile to a --timing combat run for CPU hotspot discovery only.
```

Full raw reports/profiles are ignored build artifacts. The checked-in summary
records both passing and failed discovery runs without promoting profiler or
screenshot-perturbed timings to acceptance evidence.

## Remaining work

The final repository suite reports **666 tests: 656 passed, 10 skipped, zero
failures**. All 166 host artifact pins match; the WASM core is unchanged.
The final authenticated native LRAS probe also passes: both peers agree on
NO CONTEST, confirm terminal frame 136 and return to character select.

- Measure the user's actual browser/device/URL and physical controller/display
  pipeline when available. The user requested general improvements rather than
  device-specific investigation; local headless capture is not physical latency.
- Reduce uniform packing, immediate-geometry allocation, model/texture decoding
  and GC tails; retain exact pixel/camera/state oracles for renderer changes.
- Measure WAN round-trip/jitter and prediction-window stalls independently.
  The current three-frame prediction window is not a fixed three-frame local
  input delay; widening it blindly changes correction cost and visual artifacts.
- Retain the browser reload regression for cached assets and uncached entry
  HTML. The failed pre-fix runs supplied no accepted performance evidence.

Dirty-host audit: the modified product bridge only changes GPU validation
scheduling and JavaScript metadata. The live loop only changes clock-reset
metadata at rejected input steps. No new native/HEAP writes or imports were
introduced; the host pins were renewed after inspection, not the core audit.

See [machine-readable measurements](benchmarks/browser-2026-09-19-native-pacing.json).
