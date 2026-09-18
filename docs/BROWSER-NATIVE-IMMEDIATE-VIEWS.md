# Renderer-local immediate-state views

This increment starts from `fb8dd4c` and removes repeated typed-array view
construction from immediate-primitive batching. It does not reduce the state
being checked: all 1,759 words across TEV, texture, pixel, model, render-context,
and fog capture blocks are still compared before primitives may merge.

The six views now live only for one material renderer. They are rebound whenever
the WASM memory buffer or any captured-state address changes. They never enter
the shared presentation cache, survive a renderer lease, or replace owned queued
state. A control switch (`--immediate-views=0`) retains per-call construction.

## Measured result

The 600-frame isolated Fountain ICs/Peach A/B/B/A made 60,581 matcher calls per
leg. Direct matcher means were 0.338 / 0.307 / 0.323 / 0.424 ms/frame for
control/candidate/candidate/control: 0.381 versus 0.315 ms/frame, a 17.4%
reduction or 0.066 ms/frame. Whole-draw timing drifted from 6.93 to 9.43 ms
across the session and is not used as a causal result.

The 1,800-frame, two-browser rollback A/B/B/A repeated the direct result under
169–199 corrections and 698–1,237 replayed frames per client. Control matcher
work averaged 0.412 ms/frame and the candidate 0.357 ms/frame, a 13.3% reduction
or 0.055 ms/frame. Host performance degraded monotonically from about 58 to 55
FPS, so neither aggregate draw time nor simulation FPS establishes an end-to-end
gain.

Every long-run client matched its reference and peer full-state hash, final
pixels, and native camera. A separate 120-frame Fountain per-draw oracle compared
331,776,000 RGBA bytes with zero differences and zero camera mismatches. Unit
tests cover every captured word, draw barriers, per-vertex TEV exceptions,
memory growth, pointer rebinding, and the uncached control. The complete suite
passes 625 tests: 613 passed, 12 skipped, zero failed.

[Sanitized measurements](benchmarks/browser-2026-09-17-native-immediate-views.json)
retain source identities and raw-report hashes. Production rooms remain
three-frame lockstep, and this small renderer CPU reduction does not establish
displayed 720p60 or physical latency.

## Reproduction

```sh
node scripts/native-port/probe-certification.mjs --mode=rollback --presentation=replica --replicacopy=dirty --frames=1800 --observer=0 --map=fountain --pair=Pp,Pe --drawtiming --immediate-views=0 --label=immediate-a
node scripts/native-port/probe-certification.mjs --mode=rollback --presentation=replica --replicacopy=dirty --frames=1800 --observer=0 --map=fountain --pair=Pp,Pe --drawtiming --label=immediate-b
node scripts/native-port/probe-certification.mjs --mode=isolated --presentation=replica --replicacopy=dirty --dirtyaudit --frameoracle --frames=120 --observer=0 --map=fountain --pair=Pp,Pe --label=immediate-oracle
npm test
```
