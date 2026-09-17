# Rejected packed native draw-state ABI

The packet experiment was rejected and **all runtime/native-core changes were
reverted to `f0bcaaa`**. Production remains three-frame lockstep. The 720p60 goal
remains unmet. [Sanitized measurements](benchmarks/browser-2026-09-17-rejected-draw-packet.json)
record per-client results and experimental source/report hashes.

The candidate copied six captured GX state blocks and callback metadata into a
versioned 7,168-byte native packet, immediately copied that into an owned JS
slot, and reused decoded sections only after exact word comparisons. Original
callbacks, geometry, effects, texture-byte validation and camera behavior remained.
The unchanged reader path was the control on the same experimental native core.

## A1/B1/A2/B2

Each row is 1,800 forward frames in two Chromium 151 clients on one Ryzen AI 9
HX PRO 370 / Radeon 890M host, with capture enabled and 15–130 ms synthetic input
delays. Entries are **client 0 / client 1**. A uses the existing readers; B uses
packets. Detailed timers and packet audits were disabled in all performance runs.

| Stage | Run | Simulation FPS | Captured FPS | Mean draw CPU ms | Submission interval p95 ms |
| --- | --- | ---: | ---: | ---: | ---: |
| Battlefield Falco/Fox | A1 | 59.65 / 59.80 | 60.00 / 60.02 | 5.482 / 5.437 | 20.3 / 19.9 |
| Fountain ICs/Peach | A1 | 59.45 / 59.50 | 58.34 / 58.49 | 7.655 / 7.442 | 21.5 / 23.4 |
| Battlefield Falco/Fox | B1 | 59.54 / 59.62 | 58.09 / 58.00 | 8.666 / 8.633 | 20.6 / 20.7 |
| Fountain ICs/Peach | B1 | 54.16 / 54.07 | 39.99 / 40.53 | 12.462 / 12.560 | 27.7 / 26.6 |
| Battlefield Falco/Fox | A2 | 59.33 / 59.48 | 57.51 / 58.38 | 7.072 / 6.905 | 21.7 / 21.8 |
| Fountain ICs/Peach | A2 | 56.50 / 56.50 | 46.97 / 48.42 | 9.804 / 9.835 | 25.2 / 24.8 |
| Battlefield Falco/Fox | B2 | 56.90 / 56.98 | 48.64 / 47.13 | 11.067 / 11.125 | 23.6 / 24.3 |
| Fountain ICs/Peach | B2 | 51.84 / 52.01 | 36.88 / 36.33 | 13.348 / 13.479 | 29.1 / 29.4 |

Both packet repetitions are substantially worse. Controls also slowed during the
sequence, so this is not a precise estimate of a universal percentage penalty;
even with that variation, the candidate provides no evidence of a performance
win. Fountain B2 fell to about 52 simulation FPS and 36–37 captured FPS. No
packet changes are retained in the runtime.

## What the evidence does and does not explain

- Audits were not accidentally enabled: both candidate runs report zero field,
  shader-key and UBO audits, with `packetaudit=0` and `drawtiming=0`.
- There was no per-draw native malloc. Scratch allocation happened once per
  renderer (once per forward frame in the replica harness). Owned packet slots
  were retained: 311 on Battlefield and 397 on Fountain.
- The packet path added a native copy plus a JS-owned copy and block comparisons
  for every callback, including primitives later merged by the original exact
  merger. B1 copied roughly 1.9 MB/frame on Battlefield and 2.3 MB/frame on
  Fountain into JS packets alone. It still used the original field decoders for
  changed sections and did not remove original material setup.
- Code review found that its model reader recreated renderer-local matrix slots
  rather than using the existing retained staging pool. A fix was drafted but
  never synchronized or measured, then reverted. It is a plausible contributor,
  not a measured explanation for the whole regression. No substage profile
  completed, so the added costs cannot be apportioned reliably.
- The prior ~62% traversal/capture profile category includes JavaScript callbacks
  beneath native traversal; it is not 62% pure emulation or removable native
  work. Fountain WASM self samples were roughly 20–21% in that instrumented run.

The short initial correctness gate passed 60 Battlefield frames, 14,102 raw
packet/decoded-state/shader-key/UBO comparisons, zero differing RGBA bytes or
camera mismatches and 120 full-memory audits. All eight long runs matched their
own complete-state, final-pixel, camera and audio-journal references. This does
not establish exhaustive packet parity. Broad per-frame/heavy/six-stage/rooms
suites were deliberately stopped after the performance rejection.

Packet scratch allocation during initialization changes heap layout/content;
compare complete-state hashes within a candidate configuration, not directly
against the older core. Experimental hashes remain in the artifact solely for
provenance. Restored runtime hashes must match the retained UBO milestone.

## Next bottleneck to measure

Trace deadline pressure around rollback corrections: simulation/replay, checkpoint
work, replica copy, draw start/end, requestAnimationFrame and capture timestamps
on the same timeline. In the retained UBO milestone, Fountain correction p95
remained roughly 10–12 ms alongside ~6.4 ms mean drawing. Their interaction is a
stronger next hypothesis than another generic packet copy. Determine which work
actually co-occurs on missed frames before changing checkpoint cadence or
scheduling. Preserve the 60 Hz simulation clock, exact rollback state, per-client
acceptance thresholds and low-latency requirement.

Restored baseline verification: **621 tests, 611 passed, 10 skipped, zero
failures**. All 26 runtime provenance hashes match current source, built and
served files; a clean native rebuild reproduced the retained core hash. Both
native and instrumented cores are restored. No packet source or runtime change
is included in this milestone.
