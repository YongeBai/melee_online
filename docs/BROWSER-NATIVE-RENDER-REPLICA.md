# Native presentation replica experiment

The next opt-in [instrumented-write replica](BROWSER-NATIVE-DIRTY-REPLICA.md)
reduces presentation copy volume by about 89–91% in rollback trials, while
preserving the full-state and pixel oracles. It improves the matched A/B/A
measurements but still fails the 59.5 FPS gate; production remains lockstep.

This diagnostic removes the extra gameplay checkpoint capture/restore around
**every forward draw**. It does not change production rooms: those still use
three-frame lockstep. It runs the direct C-to-WASM port, not Dolphin.

## Measured rollback results

All trials draw all 1,800 forward combat frames at native 960×720. Each pair of
numbers is client 0 / client 1 on the same host; observer enabled. Every listed
trial converged to its complete-state reference and peer with zero differing
final RGBA bytes and equal native camera. **Every rollback FPS gate fails.**

| Trial | Simulation FPS | Captured FPS |
| --- | ---: | ---: |
| Historical Battlefield conservative (a3e0a53) | 48.6941 / 48.8553 | 29.0887 / 28.2286 |
| First Battlefield replica | 57.9839 / 58.1367 | 50.9754 / 48.5051 |
| Rejected Battlefield page-sync replica | 57.1655 / 57.3568 | 46.2693 / 46.9509 |
| Fresh Battlefield conservative control | 41.6886 / 41.7980 | 23.1819 / 22.8455 |
| Fresh Battlefield replica repeat | 44.0991 / 44.1802 | 25.6636 / 26.3403 |
| Historical Fountain ICs/Peach conservative (a3e0a53) | 40.5698 / 40.5605 | 20.6394 / 21.5320 |
| Fresh Fountain ICs/Peach conservative control | 27.3623 / 27.3927 | 14.4714 / 14.3361 |
| Fresh Fountain ICs/Peach replica | 39.6321 / 39.6263 | 20.5905 / 20.4252 |

The first Battlefield replica removes about 4.98 ms capture + 3.17 ms restore,
replacing them with 3.80/3.88 ms copy. In the fresh Battlefield comparison,
conservative capture/restore costs 9.54/9.94 ms combined versus replica copy
5.46/5.38 ms; native draw costs 9.40/9.38 ms versus 10.58/10.55 ms. The fresh
Fountain comparison replaces 14.64/14.86 ms capture/restore with 5.77/5.79 ms
copy; draw costs 14.95/15.20 ms versus 12.78/13.13 ms. Table/health guards,
renderer rebuild/dispose, simulation, checkpointing and replay add further cost.
The replica allocates 50,528,256 bytes on Battlefield and 60,686,336 on Fountain,
plus runtime/JIT overhead; it copies roughly 91/109 GB over each 1,800-frame run.

The fresh repeats are materially slower than the earlier measurements, including
the conservative controls. The shared host had other active applications (load
average 8.17 at one observation); this is context, not proof of the cause. The
trials are sequential, not randomized or performed on dedicated hardware. Keep
all results and their source hashes; do not extrapolate the best run to a stable
speedup or treat the new Fountain result as a win over its historical control.
The fresh controls and the eliminated snapshot work support the architectural
benefit; its sustained size remains workload/host dependent. Raw metric summaries
and source provenance are in [the evidence artifact](benchmarks/browser-2026-09-17-native-port-render-replica.json).

## Ownership boundary

`render-replica.mjs` owns a second Emscripten instance of the identical core,
with private, unshared memory and its own import closures. At a synchronous,
renderer-detached boundary it copies every gameplay memory byte, all four mutable
WASM globals, and the deterministic audio journal into this instance. Function
table indices and code identity are identical; entries remain instance-local.
Both tables, heap sizes/views, abort status and detached handlers are guarded.
The replica is instantiated at the gameplay heap's current size so Emscripten's
private HEAP views are correct from initialization, rather than patching only
public Module views after a grow.

The replica constructs native renderer allocations and JS owner/polygon bindings,
draws, and disposes them before its next overwrite. No replica bytes or globals
are copied back into gameplay. Dynamic stage, accessory, Link collector and
fighter callbacks in `constructor-runner.mjs` execute inside the same synchronous
module scope as the renderer, including direct HEAP accesses and disposal.
That scope cannot cross an await. Imported draw/object/particle callbacks and
music callbacks belong to the replica's Module; its audio journal is private.
Immutable hosted archives and validated GPU assets remain cached; native owner
maps, pointers, mutable shapes and scratch allocations are reconstructed.

The draw-side audit found libc/HSD allocator metadata and stack writes; lazy
joint/world/view matrices and dirty flags; camera/light/GX register state;
particle/immediate buffers; material/texture/model state; HUD enumeration scratch;
temporary DObj/PObj display methods; current GObj/joint globals; and fighter
accessory callbacks. These are not safely separable by assuming a memory range
is cosmetic. Independent memory isolates their transitive writes too. The sparse
correctness probe additionally compares *every gameplay byte*, mutable global
and host journal before and after each replica presentation. It requires zero
changes, full on-time/peer state convergence, and exact final fresh-renderer
pixels and camera. The every-forward-frame harness retains the same 960×720
native picture, 1280×720 presentation, combat packets and capture observer.

## Rejected alternative

An exact 64 KiB page comparison copied only differing pages to the replica. It
passed convergence and final pixels but took about 5.53 ms per copy on Battlefield
versus 3.80/3.88 ms for the full copy. Simulation was 57.17/57.36 FPS and capture
46.27/46.95 FPS, below the first full-copy trial's 57.98/58.14 and 50.98/48.51.
It was removed; the existing checkpoint page-sharing algorithm is unchanged.
No approximate dirty tracking or excluded state region was introduced.

## Limits and remaining work

This establishes an isolated presentation boundary for the tested headless
simulation/reference semantics. It does **not** prove that discarding native
draw-side writes is equivalent to retail gameplay for every character and
interaction. That dependency audit and broader parity coverage remain required.
The replica consumes another complete heap plus instance/JIT overhead and copies
that heap every frame. It still rebuilds bindings; it is not a persistent native
render arena or a zero-copy design. Failed construction/draw or memory growth
rejects the diagnostic; no partially constructed runtime is promoted to play.

Native draw submission, full-copy bandwidth, checkpoint capture and correction
bursts remain material costs. Captured FPS is not monitor scanout or physical
input-to-photon latency. Two Chrome processes share this host's GPU and memory
bandwidth, so these trials are not two-machine WAN measurements. The audio
journal is deterministic but this rollback harness does not commit audible SFX.
Speculative endings, reconnect recovery and full tournament/roster validation
remain outstanding. No 720p60 or production rollback certification is claimed.

## Reproduction

Run performance trials sequentially, without other test workloads:

```sh
node scripts/native-port/probe-certification.mjs --mode=rollback --presentation=replica --map=battlefield --pair=Fc,Fx --frames=1800 --label=replica-final
node scripts/native-port/probe-certification.mjs --mode=rollback --presentation=replica --map=fountain --pair=Pp,Pe --frames=1800 --label=replica-final
node scripts/native-port/probe-rollback.mjs --presentation=replica --map=fountain --pair=Pp,Pe --frames=1800 --workload=combat
```

The conservative control omits `--presentation=replica`. Five other legal stage
checks use the sparse 240-frame scripted probe. Sparse draws establish correctness,
not sustained FPS. The complete capture/presentation gate remains defined in
[BROWSER-NATIVE-720P60.md](BROWSER-NATIVE-720P60.md).

## Correctness regression

All six two-browser replica correction probes passed. Battlefield, Yoshi's Story,
Stadium, Dream Land and Final Destination ran 240 scripted frames each; Fountain
ICs/Peach ran 1,800 combat frames. Every client matched its on-time complete-state
hash and its peer. Every audited draw left gameplay memory, all four globals and
the audio journal unchanged. All final fresh-renderer comparisons matched every
one of 2,764,800 RGBA bytes and the native camera values. Replay invoked no draws.
Fountain's final hash remains
`aea5914e8fa7f0bb0d107324a38f4d8c632331980e05cc6011894012440153dd`;
Nana and moving platforms remain in the state. Corrected Fountain and Yoshi's
screenshots were inspected for the original framing and visible fighters/HUD.
This compares against the native-port reference, not a new retail-video oracle.

Production-path regressions passed with the shared constructor callback-scoping
change: two browsers completed 600 lockstep frames with matching measured fighter
fields; native elimination at frame 805 reached results, the accelerated timeout
ran all 28,800 native steps, and rematch/return preserved tournament rules and the
six-stage menu. These checks do not measure rollback FPS. The full `npm test`
suite passed: 588 tests, 578 passed, 10 skipped, zero failures. Three new replica
tests cover native writes/globals/journals across rewinds, independent-runtime
and table/memory guards, and disposal after failed draws.
