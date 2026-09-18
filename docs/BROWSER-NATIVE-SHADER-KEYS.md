# Match-scoped shader variant keys

This increment starts from `0a6693a` and reduces renderer CPU work in the
direct C-to-WASM port. It does not change generated shader source, native draw
state, texture decoding, camera/projection, resolution, gameplay, or hosted
no-ISO startup. Production rooms remain three-frame lockstep.

This is a measured renderer optimization, not 720p60 certification. The heavy
Fountain workload remains close to, but not reliably over, the performance
gate; browser capture and physical input-to-photon were not measured here.

## Change

The renderer previously built every program-variant lookup by copying the full
JSON serialization of the TEV-stage array into a new string. The TEV interner
already owns and retains exact immutable stage arrays for a match. The new key
therefore assigns each exact retained stage identity a match-scoped integer and
serializes only the remaining shader-generating controls:

- texture-generator layout and bound texture IDs;
- lighting-channel configuration and channel count;
- alpha-test operations, vertex attributes, immediate-register layout, and fog
  type.

Uniform-only values remain excluded exactly as before. A legacy switch keeps
the original full JSON path for controlled comparisons. The program cache is
still keyed by complete generated vertex and fragment source, so source
deduplication remains independent of the variant key.

Unit coverage compares the compact and original keys pairwise across reordered
and changing inputs, verifies byte-identical legacy keys, and confirms that
uniform-only changes do not alter the compact key.

## Direct timing

A 600-frame isolated Fountain ICs/Peach A/B/B/A sequence instrumented the
variant-key region directly. Every leg made 163,918 key lookups and produced
the same 40 variants and 40 programs.

| Trial | Key mean ms/frame | Draw mean ms/frame |
| --- | ---: | ---: |
| A1 original JSON | 0.354 | 6.874 |
| B1 compact identity | 0.296 | 6.992 |
| B2 compact identity | 0.301 | 6.806 |
| A2 original JSON | 0.389 | 7.593 |

The paired means are 0.372 versus 0.298 ms/frame for key construction, a
19.7% reduction or 0.073 ms/frame. Whole-draw means were 7.233 versus
6.899 ms/frame, but the A2 drift makes the direct substage the stronger result.

## Long rollback A/B/B/A

The longer sequence used 1,800 forward Fountain frames, two local Chromium
clients, the dirty presentation replica, and synthetic 15–130 ms delayed and
reordered input. Observer capture was disabled to isolate renderer submission.
Each entry is client 0 / client 1.

| Trial | Simulation FPS | Key mean ms/frame | Draw mean ms/frame |
| --- | --- | --- | --- |
| A1 original JSON | 59.415 / 59.429 | 0.442 / 0.454 | 8.632 / 8.457 |
| B1 compact identity | 59.432 / 59.549 | 0.346 / 0.333 | 7.814 / 7.888 |
| B2 compact identity | 59.649 / 59.698 | 0.348 / 0.359 | 7.877 / 7.653 |
| A2 original JSON | 59.510 / 59.592 | 0.397 / 0.406 | 7.817 / 7.972 |

Across all four clients per side, key work fell from 0.425 to 0.346 ms/frame
(-18.5%, -0.079 ms) and draw submission fell from 8.219 to 7.808 ms/frame
(-5.0%, -0.411 ms). Candidate simulation averaged 59.582 FPS versus 59.487
for the control. This is not a 60 FPS pass.

All eight clients matched their on-time reference, produced zero corrected
pixel differences, preserved the native camera, retained 40 variants/programs,
and converged to the same 60,686,336-byte state hash. The runs exercised
137–197 corrections and 699–1,263 replayed frames per client.

## Graphics validation and limits

All six legal stages passed a final 120-frame, per-draw zero-tolerance oracle
with ICs/Peach. The compact renderer and independent original-key/non-UBO
renderer compared 1,990,656,000 RGBA bytes with zero differences and zero
camera mismatches. Every stage also matched its final gameplay state, final
pixel oracle, and fresh camera.

Two preliminary Yoshi's Story compact runs intermittently disagreed on 3 and
21 color bytes at one frame. A legacy control passed. A diagnostic run then
recomputed the original key on every draw, proved all 36 compact variants had a
one-to-one original key, and passed every frame; two further compact runs and
the final production-source run also passed. No key collision was found. The
intermittent Yoshi oracle/driver discrepancy remains recorded and is not
silently counted as a pass.

The complete repository suite passes 625 tests: 613 passed, 12 skipped, zero
failed. [Sanitized measurements](benchmarks/browser-2026-09-17-native-shader-keys.json)
retain source identities and raw-report hashes.

Open work is unchanged: production rollback/audio commitment, reconnect and
recovery, exhaustive all-character interactions and costumes, long all-stage
displayed 720p60, WAN behavior, native results presentation, and physical
input-to-photon latency.

## Reproduction

```sh
node scripts/native-port/probe-certification.mjs --mode=rollback --presentation=replica --replicacopy=dirty --frames=1800 --observer=0 --map=fountain --pair=Pp,Pe --drawtiming --shader-key=0 --label=shader-key-a
node scripts/native-port/probe-certification.mjs --mode=rollback --presentation=replica --replicacopy=dirty --frames=1800 --observer=0 --map=fountain --pair=Pp,Pe --drawtiming --label=shader-key-b
node scripts/native-port/probe-certification.mjs --mode=isolated --presentation=replica --replicacopy=dirty --dirtyaudit --frameoracle --frames=120 --observer=0 --map=battlefield --pair=Pp,Pe --label=shader-key-oracle
npm test
```
