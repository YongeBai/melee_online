# Instrumented writes for presentation replication

This opt-in diagnostic builds on `ea195de`'s independent renderer replica. It
copies the union of pages written by gameplay and by rendering, instead of
copying the entire gameplay heap every forward frame. It does not compare heap
pages to discover changes. Production rooms remain three-frame lockstep.

## Matched measurements

Two independent Chrome processes share the same host. All six principal trials
ran sequentially, with observer enabled, the same 15–130 ms packet-delay schedule,
the same combat inputs and all 1,800 forward frames drawn at 960×720. A1/B2/A2
means full copy, final dirty marker, full-copy repeat. Slash-separated numbers
are client 0 / client 1. **Every trial still fails the 59.5 simulation/capture gate.**

| Workload / trial | Simulation FPS | Captured FPS | Copy ms | Draw submission ms |
| --- | ---: | ---: | ---: | ---: |
| Battlefield A1 | 41.8291 / 41.9314 | 23.1972 / 22.5531 | 6.1574 / 6.1306 | 10.9316 / 11.0489 |
| Battlefield B2 | 50.1030 / 50.2242 | 39.7232 / 39.3845 | 0.6911 / 0.6993 | 10.9827 / 10.9168 |
| Battlefield A2 | 43.0005 / 43.0742 | 23.9845 / 24.1092 | 5.7227 / 5.8509 | 10.7999 / 10.6912 |
| Fountain ICs/Peach A1 | 34.0482 / 34.1164 | 17.4373 / 17.8032 | 7.0976 / 7.2167 | 14.4562 / 14.7795 |
| Fountain ICs/Peach B2 | 44.8748 / 44.8116 | 26.3185 / 27.9569 | 0.7874 / 0.7250 | 14.1093 / 13.9023 |
| Fountain ICs/Peach A2 | 40.4783 / 40.5054 | 21.3712 / 20.7783 | 5.5327 / 5.6891 | 12.6088 / 12.9748 |

All clients converged to the complete on-time game-state hash and each other;
final full RGBA images and camera matched the fresh native renderer. Battlefield
copy volume fell from 90,950,860,800 bytes/client to 8,116,424,704 / 8,564,936,704
(91.1% / 90.6% less). Fountain fell from 109,235,404,800 to
11,640,782,848 / 10,560,303,104 bytes (89.3% / 90.3% less), including the full
refreshes after corrections. Native simulation increases from roughly 0.61–0.63
to 0.93 ms on Battlefield and from 0.80–0.94 to 1.33–1.35 ms on Fountain due to
tracking and host variation. Mean full forward callbacks fall from 21.7–22.6 to
17.2–17.3 ms on Battlefield; Fountain B2 remains 20.6–21.2 ms. Corrections still
cost roughly 16.5–19.5 ms when they occur. Native draw submission is now the
largest measured steady-frame component, with checkpoint/correction work still
exceeding the remaining 16.67 ms budget.

Fountain's full-copy controls vary materially (34.05 versus 40.48 FPS), so this
is not a dedicated-host randomized benchmark and the gain is not a universal
percentage. The candidate beats both surrounding controls on both workloads,
while its much smaller copy volume is directly counted. Historical best-case
replica runs on a different load are not substituted for these matched controls.
The earlier correct scalar-fill marker (B1) reached 49.0981 / 49.1500 simulation
and 34.4664 / 35.3235 captured FPS on Battlefield. Its higher simulation cost and
the corrected import-wrapper failure remain documented, rather than disappearing
from the experiment history. [Full metrics and provenance](benchmarks/browser-2026-09-17-native-port-dirty-replica.json).

## Complete write coverage

The reproducible `instrument-dirty-stores.mjs` transform walks Binaryen's folded
WAT for the pinned core. It instruments all 110,316 scalar store instructions,
169 `memory.copy` sites and 61 `memory.fill` sites, including allocator, stack,
SDK, fighter and stage code. This is static instruction coverage, not a list of
pages observed in a training match. Dynamically calculated addresses and new
objects take the same marking path. SIMD/atomic stores, memory.init/grow,
foreign memory operands and unsupported stores are rejected by the transform.
The accepted original core, generated binary/manifest, Emscripten glue and host
sources are hash-pinned in `dirty-host-contract.mjs`; the loader rejects changes.
The build does not automatically refresh those pins. A source/core change needs
a new coverage audit, not just a successful build.

Each instance has its own extra 512 KiB WASM memory: one byte per 4 KiB gameplay
page, covering the original maximum of 2 GiB. Tracking does not add allocations,
globals or data to the original gameplay address space. Scalar writes mark their
first and last page with direct byte stores; at most two pages are touched by
an eight-byte scalar write. Bulk writes mark their complete destination range.
Bounds use unsigned 64-bit effective addresses, retaining overflow/out-of-bounds
rejection and page crossings. The metadata's own writes are deliberately outside
the transform. Imported heap growth remains guarded at the presentation boundary.
A trapping instrumented operation aborts the diagnostic; it is not resumed.

The JavaScript write audit covers the live simulation/presentation closure:

- Renderer camera rows, mesh joint/display indices and Link's collected joint
  pointers mark their exact destination spans before host writes.
- Skin uploads, texture-matrix inputs, model-verification rows and resident
  archive/string installation likewise mark their destination spans.
- Both full and paged checkpoint restores conservatively mark the whole gameplay
  heap. Thus a correction currently forces a full replica refresh; forward
  frames between corrections retain the bandwidth savings.
- `fd_write` marks its four-byte output count; other audited WASI imports
  conservatively invalidate the entire heap. Emscripten aliases the env and WASI
  import objects, so wrappers are installed only for actual WASI declarations,
  not every property on that shared object. A regression test covers this trap.
- The remaining allowed imports dispatch to the replica's scoped JS renderer,
  journal music, invoke already-instrumented WASM, or abort. GPU readbacks use
  separate host arrays. Pinned renderer readers do not write gameplay memory.

This mode is limited to the fixed certification/rollback diagnostic profiles.
It is not a general promise that arbitrary application code can mutate HEAP
views safely. The source pins include the renderer, constructor, snapshot code,
verification helpers, asset code, generated specifications and Emscripten glue.
Do not bypass the loader, hot-swap modules during a run, or add a host write
without a marking hook and a renewed audit. Browser multi-memory support is
required for this experiment.

## Why an unseen page cannot stay stale

The first presentation copies all gameplay bytes. Before the next presentation,
any native store marks its destination in either the gameplay bitmap or the
renderer bitmap. Host writes follow the audited hooks above. If neither bitmap
marks a page, neither instance changed that page since their last synchronization.
Copying the union therefore restores equality across the *entire* gameplay heap,
not just a profiled render read set. Consecutive dirty pages are coalesced into
copy spans. Both bitmaps are cleared before drawing; renderer writes then remain
marked until the next synchronization. Mutable gameplay globals and the audio
journal are copied separately, as in the full-copy replica. No data is copied
back from rendering into gameplay.

The renderer can read any valid game pointer, including a previously unseen
allocation, because equality covers all bytes. Original owner/polygon bindings
are reconstructed after synchronization, and disposed before the next overwrite.
Heap-size, table, abort and detached-renderer guards remain. An exclusive
bitmap lease prevents a second replica from clearing another consumer’s dirty
marks; disposal releases that lease exactly once. This factory/disposal guard
was added after the timed A/B/A runs and does not change the measured copy/draw
path. Its ownership/reacquisition behavior is covered by unit tests. No pages are labeled
permanently immutable and no graphics or gameplay state is omitted.

`--dirtyaudit` adds an independent byte-by-byte equality check of the whole
replica after copying and before every draw. It throws before stale bytes can
reach the renderer. This expensive audit is a correctness oracle only; it is
not enabled for performance trials. Unit coverage deliberately introduces an
unmarked host write and requires that rejection. Sparse six-stage rollback
checks also run this audit plus complete gameplay state checks around drawing.
No-correction per-frame audits are necessary too: otherwise full restores could
mask missed tracking. Final corrected images still compare all 2,764,800 RGBA
bytes to a fresh native renderer, with exact native camera checks.

## Iterations and limits

The first import wrapper accidentally wrapped env draw callbacks because the
Emscripten namespace objects alias. It conservatively dirtied all memory, so the
run remained correct but saved no copies. That implementation is rejected.
After correcting the wrapper, a 240-frame no-correction Battlefield audit copied
226,119,680 bytes versus 12,126,781,440 bytes for full copying (98.1% less). Every
frame passed the complete memory comparison, original full-state hash and final
pixel/camera oracle. Its roughly 77 ms callback cost includes the deliberately
slow JavaScript equality scan and is not a performance result.

The first correct marker used a bulk fill helper even for scalar stores. A
second version directly marks the two possible endpoint pages, reducing marker
overhead. Both retain bounds checking and exact byte semantics for nontrapping
execution. The instrumented core retains the original logical core identity in
game-state hashes, with its actual binary digest recorded separately; cross-core
hash comparisons must include the original full-memory/globals/journal result.
Tracking metadata is non-game state and deliberately excluded from that hash.

Snapshot capture and correction restore still scan/copy full game state, and
corrections invalidate all replica pages. Native draw submission remains a major
cost. Store instrumentation adds CPU work, so reduced bytes alone is not proof
of a faster frame. The extra replica heap and per-instance bitmap also consume
memory. Compare total simulation, correction, draw and capture cadence, not just
copy time. The independent-replica audit still does not prove discarding native
draw-side writes matches retail gameplay for every character/interaction.

No physical presentation, input-to-photon latency, full roster/tournament parity,
audible rollback SFX, speculative-ending recovery or WAN certification is claimed.
No ISO picker, camera adjustment, skipped forward frames, lower resolution or
Dolphin path is introduced by this experiment.

## Reproduction

```sh
node --max-old-space-size=4096 scripts/native-port/build-dirty-core.mjs
node scripts/native-port/probe-certification.mjs --mode=rollback --presentation=replica --replicacopy=dirty --frames=1800 --label=dirty-b2
node scripts/native-port/probe-certification.mjs --mode=rollback --presentation=replica --frames=1800 --label=dirty-a2
node scripts/native-port/probe-certification.mjs --mode=isolated --presentation=replica --replicacopy=dirty --dirtyaudit --frames=240 --label=dirty-audit
node scripts/native-port/probe-rollback.mjs --presentation=replica --replicacopy=dirty --map=fountain --pair=Pp,Pe --frames=1800 --workload=combat
```

The builder emits only ignored development artifacts. No transformed game binary,
WAT game code, game assets or snapshots are committed. The checked-in transform
and its tiny original unit fixtures are the reproducible implementation.

## Final validation

All six dirty-replica correction probes passed: five legal stages ran 240
scripted frames and Fountain ICs/Peach ran 1,800 combat frames. Complete game-state
hashes match both the on-time reference and the uninstrumented `ea195de` baseline.
Every audited replica draw left gameplay memory/globals/journal unchanged, with
no replay presentations. Corrected full RGBA images and cameras exactly matched
fresh reconstruction; Nana and moving Fountain platforms remain in the state.

Separate no-correction per-draw audits ran 240 frames each for Battlefield
Falco/Fox, Fountain ICs/Peach and Battlefield Link/Kirby. Every pre-draw complete
memory comparison passed. Copy totals were 226,119,680; 308,215,808; and
242,823,168 bytes respectively, including the initial full copy. Final full-state,
pixel and camera checks also passed. These intentionally slow audit runs are not
FPS results. Fountain and Link/Kirby screenshots were visually inspected for
framing, characters and HUD.

The normal uninstrumented room path completed 600 two-browser lockstep frames
with matching measured fighter fields. Native elimination at frame 806, results,
rematch/return and the accelerated 28,800-step timeout regression passed. The
full suite passed 593 tests: 583 passed, 10 skipped, zero failures. New coverage
includes all supported scalar store widths, offsets/page crossings, overlapping
bulk copies, bounds rejection, unsupported opcodes, aliased import namespaces,
changed-host-source rejection, dirty page union/equality, deliberately unmarked
host writes and exclusive bitmap ownership/reacquisition.
