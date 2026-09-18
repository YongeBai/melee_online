# Compact native texture keys

This increment starts from `c0eed3b` and replaces per-bind
`JSON.stringify(texture)` with a fixed-field numeric tuple containing every
decoded texture descriptor value. Texture bytes, invalidation, decoding, WebGL
parameters, and the retained-resource cache are unchanged. A legacy-key switch
keeps the old serializer available as the measurement and oracle control.

The first A/B/B/A was invalidated by session drift: direct lookup cost followed
run order (0.591/0.712/0.593/0.675 ms/frame) instead of treatment. A recovered
B/A/A/B made 170,542 texture lookups per 600-frame Fountain ICs/Peach run:

| Trial | Texture lookup ms/frame | Draw ms/frame | Simulation FPS |
| --- | ---: | ---: | ---: |
| B3 tuple key | 0.653 | 8.923 | 59.532 |
| A3 JSON key | 0.689 | 8.983 | 59.592 |
| A4 JSON key | 0.672 | 8.211 | 59.310 |
| B4 tuple key | 0.577 | 7.456 | 59.457 |

Both recovered adjacent pairs favor the tuple key for direct lookup and whole
draw time. Paired means are 0.681 to 0.615 ms/frame for lookup (-9.7%, -0.066
ms) and 8.597 to 8.189 ms/frame for draw submission (-4.7%, -0.408 ms).
Simulation FPS is mixed between pairs, so no cadence or 720p60 claim is made.

A 120-frame Fountain oracle used the tuple key in the candidate and the JSON
key in an independent reference renderer. It compared 331,776,000 RGBA bytes
with zero differences and zero camera mismatches; final gameplay state, pixels,
and camera also match. Both paths retained exactly 237 textures with 86,062
cache hits and 237 misses in each recovered run. Unit coverage changes every
descriptor field independently and audits 10,000 sampled tuples for collisions.
The scoped project suite passes 627 tests: 615 passed, 12 skipped, zero failed.

Two earlier allocation hypotheses were rejected and removed before this result.
Whole-slab UBO views regressed direct pack time by 8.1% across their A/B/B/A;
cached pixel/context views regressed their combined direct cost by 2.6%.

[Sanitized measurements](benchmarks/browser-2026-09-17-native-texture-keys.json)
retain source identities and raw report hashes. Production remains three-frame
lockstep; displayed cadence, exhaustive roster behavior, WAN recovery, audio
commitment, and physical latency remain open.
