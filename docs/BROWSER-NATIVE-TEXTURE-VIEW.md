# Renderer-local texture capture view

This increment starts from `d895b19` and reuses the `DataView` over the fixed
native texture-capture block instead of allocating a new view for every draw.
The decoded objects and validation are unchanged and remain owned per queued
draw. The renderer rebinds after WASM memory growth or a capture-pointer change;
the view never enters the shared presentation cache.

An initial A/B/B/A was invalidated when the host fell from 59.4 FPS to 48–54
FPS only during its middle legs and then recovered. The immediate reversal did
not reproduce a candidate-specific slowdown. Two recovered adjacent pairs made
163,918 texture reads per 600-frame Fountain ICs/Peach run:

| Trial | Texture decode ms/frame | Draw ms/frame | Simulation FPS |
| --- | ---: | ---: | ---: |
| B3 cached | 0.486 | 9.215 | 59.266 |
| A3 new view/read | 0.559 | 9.444 | 59.308 |
| A4 new view/read | 0.579 | 10.020 | 58.612 |
| B4 cached | 0.476 | 8.889 | 59.170 |

The direct paired means are 0.569 ms/frame for the control and 0.481 for the
candidate: -15.5%, or -0.089 ms/frame. Both adjacent pairs favor the candidate
for direct decode and whole-draw time, while simulation FPS is mixed. Only the
direct allocation cost is accepted; this is not a 720p60 result.

A 120-frame audited Fountain oracle compared 331,776,000 RGBA bytes with zero
differences and zero camera mismatches, while final gameplay state and pixels
matched. The full suite passes 626 tests: 614 passed, 12 skipped, zero failed.
Unit tests cover memory growth, pointer movement, invalid bounds, and the
uncached control.

[Sanitized measurements](benchmarks/browser-2026-09-17-native-texture-view.json)
retain source identities and report hashes. Production remains three-frame
lockstep; displayed cadence, exhaustive roster behavior, and physical latency
remain open.
