# Audited texture-source stamps

This increment starts from `688f2f6` and removes redundant texture-source byte
comparisons in the direct C-to-WASM replica renderer. It preserves exact image
invalidation: any native store, bulk write, audited host write, rollback restore,
or replica copy touching a source page forces the original byte-for-byte check.
It does not alter texture decoding, filtering, shaders, native camera behavior,
resolution, gameplay, or no-ISO startup.

Production rooms remain three-frame lockstep. This is an exact renderer CPU
reduction in the diagnostic rollback path, not a production rollback rollout or
a completed 720p60 certification.

## Why the comparisons were redundant

The persistent presentation cache owns exact copies of every uploaded image and
palette. A new per-frame renderer previously compared all source bytes on every
cache hit because rollback can restore different bytes at the same native
address. Fountain ICs/Peach made about 259,000 cache hits per client during the
1,800-frame workload, while the measured cache had zero actual invalidations.

The dirty core already marks every scalar and bulk memory write at 4 KiB
granularity. Its fan-out hub now maintains a monotonic version for each page.
Texture lookups poll only the pages spanned by their image and palette ranges.
If every page version equals the version recorded after the last exact check,
the owned source copy is still valid and the comparison is skipped. A marked
page advances its version, feeds every dirty subscriber before the raw bit is
cleared, and forces an exact comparison. Equal bytes update the stamp; different
bytes retain the existing delete/decode/upload path.

Ranges must be `Uint8Array` views of the audited runtime heap. Memory growth,
foreign buffers, disposed trackers, unsafe ranges, version exhaustion, and
changed host/core hashes fail closed. Uninstrumented/full-copy renderers retain
the old exact comparison. `--texture-stamp=0` forces that control path.

## Direct cost result

A 600-frame isolated Fountain profile used the same audited-table runtime and
draw instrumentation for both trials. A disables stamps; B enables them.

| Metric | A exact compare | B dirty stamp |
| --- | ---: | ---: |
| Texture source bytes compared | 614,215,208 | 6,918,760 |
| Stamp hits / misses | 0 / 0 | 85,319 / 802 |
| Texture lookup mean | 0.745 ms/frame | 0.533 ms/frame |
| UBO texture stage mean | 0.968 ms/frame | 0.733 ms/frame |
| Draw submission mean | 7.319 ms/frame | 7.037 ms/frame |
| Draw submission p95 | 12.3 ms | 11.2 ms |

The stamp skipped 98.9% of comparison bytes and reduced mean draw submission by
0.28 ms in this profile. Both trials ran at about 59.7 simulation FPS without
the capture observer; neither short run is acceptance evidence.

## Long rollback repeats

The 1,800-frame Fountain A/B/B/A sequence used two local Chromium clients,
browser capture, exact pages, the dirty replica, and identical synthetic
15–130 ms delayed/reordered traffic. Each entry is client 0 / client 1.

| Trial | Simulation FPS | Captured FPS | Submission p95 ms | Mean draw ms | Compared bytes/client |
| --- | --- | --- | --- | --- | --- |
| A1 exact | 59.54 / 59.56 | 59.39 / 59.72 | 20.6 / 22.9 | 7.91 / 7.62 | 1.843 / 1.844 GB |
| B1 stamp | 59.49 / 59.67 | 59.55 / 59.04 | 22.6 / 20.9 | 7.24 / 7.47 | 18.4 / 18.4 MB |
| B2 stamp | 59.51 / 59.59 | 59.75 / 59.04 | 21.3 / 22.3 | 7.34 / 7.33 | 18.4 / 18.4 MB |
| A2 exact | 59.42 / 59.56 | 59.46 / 59.16 | 21.4 / 22.3 | 7.78 / 7.67 | 1.840 / 1.844 GB |

Mean draw time improved from 7.743 to 7.345 ms, a repeatable 0.398 ms. Average
simulation cadence moved from 59.523 to 59.566 FPS, but captured cadence was
mixed at 59.433 versus 59.346 FPS. Every candidate still missed at least one
strict requirement: one simulation result was 59.49, one captured result per
repeat was about 59.04, and every submission p95 remained above 20 ms. Canvas
capture is not physical scanout, and host scheduling noise is visible in the
end-to-end results.

[Sanitized measurements](benchmarks/browser-2026-09-17-native-texture-stamps.json)
retain the report hashes, exact source identities, per-client costs and
correctness results.

## Correctness validation

- Battlefield Falco/Fox and Fountain ICs/Peach each passed 240 per-draw,
  zero-tolerance comparisons. Together they compared 1,327,104,000 RGBA bytes
  with zero differences and zero camera mismatches.
- The Battlefield audit recorded 21,669 stamp hits and only 407,232 exact source
  bytes compared. Fountain recorded 33,766 hits and 3,462,760 bytes compared.
  Neither run invalidated a texture.
- All six legal stages passed 240-frame two-client delayed/reordered correction
  probes with full snapshot audits, complete-state convergence, exact corrected
  pixels/camera, and no replay presentations.
- Fountain ICs/Peach passed the separate 1,800-frame heavy correction run with
  163/126 corrections and 933/700 replayed frames. Both clients converged to the
  unchanged 60,686,336-byte state hash.
- Fox/Falco attachment restoration passed in both seat orders; Link/Kirby also
  passed the audited correction path.
- Unit coverage exercises range ownership, subscriber fan-out, raw-bit clearing,
  version stability/change, disposal, stamp hits, and forced invalidation.
- The full suite passed 625 tests: 615 passed, 10 skipped, zero failed.

The existing normal-room path is not wired to this diagnostic dirty tracker and
is behaviorally unchanged. Exhaustive all-character move/costume parity, audible
rollback commitment, reconnect/recovery, WAN behavior, physical input-to-photon
latency, and repeatable all-stage 720p60 remain open.

## Reproduction

```sh
node scripts/native-port/probe-certification.mjs --mode=rollback --presentation=replica --replicacopy=dirty --frames=1800 --map=fountain --pair=Pp,Pe --texture-stamp=0 --label=texture-a
node scripts/native-port/probe-certification.mjs --mode=rollback --presentation=replica --replicacopy=dirty --frames=1800 --map=fountain --pair=Pp,Pe --label=texture-b
node scripts/native-port/probe-certification.mjs --mode=isolated --presentation=replica --replicacopy=dirty --dirtyaudit --frameoracle --frames=240 --map=fountain --pair=Pp,Pe --label=texture-oracle
node scripts/native-port/probe-rollback.mjs --presentation=replica --replicacopy=dirty --snapshotaudit --map=fountain --pair=Pp,Pe --frames=1800 --workload=combat
npm test
```
