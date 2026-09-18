# Browser-native snapshot and correction boundary

The initial `197ee12` measurements below are retained as the baseline. See
[the subsequent exact-page and presentation-cache optimization](BROWSER-NATIVE-ROLLBACK-OPTIMIZATION.md)
for the current diagnostic and its measured before/after costs. Production
rooms remain on lockstep.

The production native preview still uses three-frame input lockstep. The new
`rollback-probe.html` is an explicitly labelled development diagnostic. It runs
local input immediately, predicts missing remote input by holding the most recent
known sample, and restores/replays when late immutable packets disagree. This is
a real correction kernel over the direct C port, not a Dolphin experiment, but
it is **not yet a playable Slippi-style rollback transport**.

## What a checkpoint owns

`wasm-snapshot.mjs` instruments the existing WASM export section without changing
code, data, indices or layout. It exports every mutable WASM global, audits the
function-only import boundary, and requires one unshared memory and one fixed
function table. The present build has four mutable i32 globals. A checkpoint
copies the entire linear memory (including HSD and libc heaps, allocator metadata,
resident game data, controllers, RNG, fighters/partners/items, stage callbacks,
camera, HUD and stack bytes), all mutable globals, and the deterministic host
audio journal. SHA-256 covers the complete memory plus globals/journal; comparisons
are not merely a selection of fighter coordinates.

Checkpoints are private to their store/instance. Restoring foreign or released
handles, changing the function table, exceeding the memory budget, restoring
across memory growth, or restoring an aborted runtime fails explicitly. No
cross-build save-file format or remote state-upload endpoint is provided.
Snapshots must occur after a synchronous exported C call has returned, with no
suspended C stack or asynchronous game-asset installation. Only a settled match
with all assets loaded is supported by the constructor's diagnostic boundary.

## Why the live renderer is excluded

The current renderer has JS maps of GPU models and pointer bindings, plus
WASM allocations for camera snapshots, node/visibility arrays, material scratch
buffers and dynamically appearing effect/item/accessory models. Those buffers
are allocated from the same libc heap captured with gameplay. Native rendering
also mutates WASM state. Rewinding memory while retaining the later JS ownership
maps can therefore leave stale pointers and invalid frees; copying memory alone
is insufficient.

The diagnostic disposes every renderer owner before capture/restore and rejects
checkpoints while native draw receivers are installed. For a visible diagnostic
frame, it saves the simulation boundary, creates/draws/disposes the renderer, then
restores the boundary. Only forward progress is presented (once per 60 frames);
replayed frames never call presentation. The final corrected frame is reconstructed
at 960×720 with the existing native camera and shader paths. The test records the
memory mutations caused by a draw and verifies exact restoration afterward.
This expensive reconstruction is a correctness boundary, not a 60 FPS solution.
Its suppression of render-side writes needs a retail/gameplay dependency audit
before being promoted to normal gameplay.

The standalone constructor also inserts pre-intro and Ready/Go still images
above its canvas. The rollback page removes these before starting its test;
otherwise a page screenshot captures the pre-intro still (no fighters and an
unset timer), rather than the corrected canvas. The final combat screenshot
shows both fighters, stocks, damage and the advancing timer. This is a visible
restoration check, not a pixel-by-pixel comparison with retail Melee.

## Input correction and side effects

`rollback-session.mjs` keeps checkpoints every four frames, bounds prediction at
12 unconfirmed frames, stores immutable local/remote samples (including tap-jump
settings), and replays from the latest checkpoint preceding a correction. Missing
history and conflicting inputs fail rather than silently approximating the game.
Forward and replayed frames are counted separately. The prototype stalls at the
prediction bound; it never advances indefinitely on unknown remote inputs.

The production native room relay now exposes the transport half of this boundary
without changing the playable default. Each input remains assigned to the
authenticated socket's seat and immutable within its room epoch and scene key.
The relay forwards that individual sample to the peer as soon as it arrives,
then sends a monotonically ordered `confirmed-frame` acknowledgement only after
both seats have supplied the frame. Neutral startup frames 0–2 use the same
stream, so confirmation is contiguous from each scene boundary. The existing
combined-frame messages and three-frame lockstep consumer remain unchanged.

`native-room.mjs` can explicitly arm bounded buffering before a match-scoped
correction owner binds; the unchanged lockstep path discards rollback-only event
payloads. It also exposes immutable local submission separately from the lockstep
`take` API. `rollback-session.mjs` has an opt-in acknowledgement mode in which
remote delivery can correct prediction but cannot advance the committed horizon
without the relay acknowledgement. Tests cover reordered delivery, immediate
peer forwarding before an earlier frame is complete, contiguous confirmation,
duplicate/conflicting inputs, and delayed commitment. This is production relay
integration, not production rollback: the live match still does not construct a
checkpoint store, bind the correction kernel, or render corrected speculative
state.

The browser test uses two independent Chrome processes and a test-only WebSocket
relay. It injects 15–130 ms packet delay/jitter and reordering. Each browser first
runs an on-time reference from the same initial state, restores it, then runs its
own predicted view with its assigned local seat. Final corrected hashes must
match both references and each other. The relay sends inputs only.

Audio requests use a deterministic speculative journal in this diagnostic;
**no sound is presented**. Normal product menu/stage music is unchanged. Audible
rollback still needs a confirmed-event commitment/deduplication policy and the
unported SFX backend. Speculative match endings are rejected; authoritative
end confirmation, results/rematch epoch integration and recovery after disconnect
are not implemented here. Existing product results/rematch continue on lockstep.

## Validation scope

The committed measurements are in
[the rollback boundary evidence](benchmarks/browser-2026-09-17-native-port-rollback.json).
All six tournament stages converge in two independent browser processes with
delayed and reordered input packets. Each final hash matches the same browser's
on-time reference and the other browser's complete state. Fountain uses Ice
Climbers/Peach for 1,800 forward frames, including Nana and changing platform
height; the other stage trials use Falco/Fox for 240 frames. Yoshi's Story
retains Randall's motion. A separate 600-frame Captain Falcon mirror records
51 hitlag frames and 508 frames with nonzero damage; it has no stock losses.
The simpler stage workloads do not establish combat interaction coverage.

Final six-stage rerun (counts are browser 1 / browser 2):

| Stage | Forward frames per browser | Corrections | Replayed frames | Full-state convergence |
| --- | ---: | ---: | ---: | --- |
| Battlefield | 240 | 14 / 15 | 76 / 87 | Pass |
| Yoshi's Story | 240 | 15 / 17 | 72 / 81 | Pass |
| Pokémon Stadium | 240 | 13 / 17 | 59 / 83 | Pass |
| Dream Land | 240 | 17 / 16 | 72 / 78 | Pass |
| Final Destination | 240 | 14 / 13 | 97 / 66 | Pass |
| Fountain of Dreams | 1,800 | 100 / 88 | 530 / 392 | Pass |

The separate Falcon combat trial performs 48 / 46 corrections and 281 / 271
replayed frames. No trial presents replayed frames or rejects late inputs.

Full checkpoints contain 50,528,256 or 60,686,336 bytes of linear memory, plus
four globals and the host journal. Retention and copy costs in the report include
the diagnostic's initial/reference/final checkpoints as well as the correction
ring; they are not a measurement of a minimal production implementation. The
function-table audit is included in measured capture/restore time. The probe
uses a 16-ms scheduling delay and occasional expensive renderer reconstruction;
elapsed time must not be reported as sustained presented FPS or input latency.
No browser tab receives video or gameplay simulation from the test server.

Across these final runs, mean capture time is 15.1–21.4 ms, mean restore time is
4.0–5.7 ms, and sampled intermediate renderer reconstruction/draw/dispose/restore
takes 179–443 ms. Peak retained snapshot bytes sampled by the kernel reach
546,177,024 (including the harness checkpoints). These costs are explicit
blockers to promoting this implementation into a 16.67-ms live frame budget.

All 285 native-port unit tests pass. The repository suite reports 562 passes,
zero failures and ten skips. Production room regressions separately
exercise its unchanged lockstep path and the results/rematch lifecycle, including
native stock elimination and a 28,800-frame timeout. The latter is accelerated
without ordinary presentation/input delivery, not an eight-minute WAN test.
These checks do not establish all-character parity or the 720p60 acceptance
criteria. A separate broader CPU gameplay probe still encountered the previously
observed unuploaded-geometry error; this prototype does not fix that renderer
lifecycle bug.

## Next production work

1. Separate presentation allocations/caches from rewindable simulation ownership;
   retain immutable GPU geometry/shaders and safely rebuild dynamic bindings.
2. Audit native render writes for gameplay dependence; establish a canonical
   simulation boundary without discarding any game-relevant state.
3. Reduce checkpoint copy/retention cost with measured dirty-page or typed-region
   snapshots, retaining the full-copy implementation as a reference oracle.
4. Bind the existing authenticated input/confirmation stream to a live
   match-scoped checkpoint/correction owner; add terminal-event handling, then
   reconnect recovery and audio commitment.
5. Validate all roster/stage interactions, sustained rendered frame pacing,
   physical controllers, WAN conditions and input-to-photon latency.

Run `node --test scripts/native-port/{wasm-snapshot,rollback-session}.test.mjs`
and `node scripts/native-port/probe-rollback.mjs`. The latter accepts `--map=`,
`--pair=Fc,Fx`, `--frames=240` and `--workload=combat`; it automatically loads hosted development
fixtures. It never asks a player for an ISO. Generated screenshots/reports stay
in ignored `dist/native-port/experiment-rollback-*`.
