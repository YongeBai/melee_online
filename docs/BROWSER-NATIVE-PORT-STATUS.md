# Native browser port — September 16, 2026

The direct port is now an implemented, reproducible development target:
[build and architecture](../engines/browser-native/README.md). It links original
decompiled C directly into browser WASM without Dolphin or PPC dispatch. It is
not a complete playable game yet, and there is no native-port presented-FPS result.

Dream Land is now the third live stage fixture. Its original callbacks control
Whispy, wind and background spawns. The importer handles its eight map model
groups, ten shadow-light entries and typed wind/timing parameters. Rendering
now enumerates the original stage owners, preserving multiple instances of a
map group and distinguishing process-only objects from models.

A 9,000-step idle check observes both wind directions and verifies 461
steady-wind fighter displacements against the original wind query (maximum
error 0.00000306 game units). Stocks remain intact, 75 sampled stage draws pass
GPU vertex checks, and the 960×720 image has been inspected. Native camera
code and no-ISO startup are unchanged. Full Dolphin visual/mechanical parity
is still a separate outstanding gate.

The prepared cold-cache two-Falcon combat sample completes 3,600 simulation
steps and draw submissions in 60.029 seconds, with no catch-up callbacks or live
shader compilation. Simulation averages 0.536 ms; submission averages 5.524 ms,
p95 7.9 ms and maximum 14.2 ms. The workload has contact in every ten-second
window and two stock losses. Fast and timed runs match final fighter state,
stock changes and all contact-window counts. These are submission measurements,
not distinct displayed FPS or input-to-photon latency.

This uses controller workload revision 2: ordinary stick input turns fighters
toward nearby opponents before attacking. The previous workload stood
back-to-back after a respawn, failed its contact gate, and is excluded as a
passing timing result. The fast harness now starts immediately after the intro,
matching the live path. Source hashes identify the changed workload; old/new
input scripts are not an optimization A/B. All 152 unit tests pass. Battlefield's
combat trace remains unchanged, and Final Destination's 27,000-step background
regression passes with GPU checks.
[Dream Land evidence](benchmarks/browser-2026-09-16-native-port-dreamland.json).

Three tournament stages and most of the roster/moves still need integration,
along with full scenes/menus, audio, deployment and presentation/latency checks.

Previous shader-preparation checkpoint:

Shader preparation now removes the observed mid-match compilation stalls in
the selected cold-cache fixtures. Final Destination controls compiled seven
programs during combat with 38.8/44.1 ms maximum draw submissions; preparation
compiled those programs before the first draw, with zero live compilations.
That first prepared run still had a 24.6 ms startup draw, and mean submission
cost remained about 6.70 ms. A cumulative 74-program catalog also covers the
tested Marth combat, long Final Destination cycle and Fox reflection fixtures.
Prepared/unprepared cycle and reflection images match byte-for-byte; their GPU
vertex checks pass. This catalog is not exhaustive roster/stage coverage.

A CPU profile attributed 573 of 5,208 non-idle samples to per-frame GPU error
polling. Deferring that diagnostic to the end of live probes reduced Marth's
mean submission cost from 5.99/5.94 ms in two controls to 5.21/5.36 ms in two
candidate runs. All four ran 3,600 simulation steps and draw submissions, with
matching reported gameplay traces and particle/trail counts. Final GPU error
checks pass. The p95 did not improve consistently, so this supports removing
the synchronization cost, not a broad claim about worst-case latency. Validation
retains per-frame checks; a one-time startup `gl.finish` experiment was reverted
for lack of causal evidence. All 151 unit tests pass.

The final 74-program, deferred-check Final Destination repeat completed 3,600
steps and submissions in 60.039 seconds, with no live compilations or catch-up
callbacks. Simulation averaged 0.499 ms; submission averaged 5.910 ms, p95
7.9 ms and maximum 16.2 ms. Its reported gameplay trace matches the controls.

These gains leave the main acceptance gaps unchanged: full scene/menu and audio
integration, the other stages and remaining roster/moves, public static
deployment, and actual distinct-presentation/input-to-photon measurement.
[Shader preparation and profiling evidence](benchmarks/browser-2026-09-16-native-port-shader-preparation.json).

Previous Final Destination checkpoint:

Final Destination is now the second live stage fixture. The importer handles
its ten model groups, spline references, shadow-light flags and callback scripts.
Original startup exposed and fixed a PPC-to-WASM callback ABI mismatch by routing
stage animation through HSD's existing typed dispatcher. Camera validation now
recognizes Final Destination's source-selected clip planes (1/30000), without
changing its eye, interest, pitch, projection or gameplay camera code.

A 27,000-step idle callback check passes, including two complete observed
background ownership cycles, 225 sampled stage draws with GPU vertex checks,
and preserved stocks. The GPU position oracle now bounds float32 cancellation
using operand magnitudes; this fixes a false failure on distant background
geometry without changing the shader. All 148 unit tests pass. Battlefield's
rendered callback/combat/KO/respawn regression retains the prior combat trace
hash `5bd54513b8a4aac1a487b0fd194c5ca1602638330eca17e5df5353335b329cd0`.

The first successful 960×720 two-Falcon Final Destination timed workload runs
3,600 simulation steps and 3,599 draw submissions in 60.032 seconds. A 38.6 ms
draw includes 29.9 ms compiling two new shaders and produces one catch-up
callback. A later normal-driver-cache repeat submits all 3,600 frames in
60.029 seconds with no catch-up callbacks: simulation averages 0.590 ms
(p95 0.9 ms), draw submission 6.811 ms (p95 8.9 ms). It still has 17.6 ms and
19.2 ms draw spikes involving new shader compilation. Shader preparation before
play is the next performance experiment; these samples do not certify smooth
cold-cache presentation or input-to-photon latency. Complete scene loading,
audio, other stages and full roster/move parity remain incomplete.
[Final Destination evidence](benchmarks/browser-2026-09-16-native-port-final-destination.json).

Previous Fox checkpoint:

Fox is now the seventh constructor-capable fighter. Its blocking x48 extra
was a small relocation-free integer record rather than another model/article;
the importer preserves the source values and validates the terminated layout.
The original constructor, movement, jump, aerial attack and neutral special run.
Fox's laser contact deals 3% without hitlag or knockback; the separate shield
case protects damage and enters shield stun. Reflection transfers projectile
ownership and deals 5% to the original shooter while protecting the defender.
The no-fire control produces neither a projectile nor damage.

Visual inspection caught a missing reflector model in the smaller input
fixture, whose live effect-model collection was previously disabled. It now
draws the original reflector, muzzle flash and other resident model effects.
The inspected 960×720 reflection image and GPU vertex checks pass. Native
camera code and framing are unchanged. These are selected mechanics checks,
not full Fox move parity or a new performance/presentation result.
All 147 targeted tests and the fighter build pass. Falco's rendered laser
contact regression retains its damage, hitlag and knockback behavior.
[Fox and reflection evidence](benchmarks/browser-2026-09-16-native-port-fox-reflection.json).

Previous Falco checkpoint:

Falco is now the sixth constructor-capable fighter. Its original neutral special
spawns the blaster and laser through Melee's item constructor and scheduler;
the renderer tracks and retires the original item model owners. The contact
fixture deals 3% with three frames of peak hitlag and native knockback. A no-fire
control produces neither projectile nor damage; shielding preserves damage and
enters native shield stun. Movement and defender placement use controller input,
not position or action-state writes. GPU vertex checks pass, and the inspected
960×720 image shows the original blaster/laser. Camera code is unchanged.

Seven item color descriptors and their 55 commands pass 1,465 original color
interpreter frames. The item residency boundary explicitly rejects unconverted
kinds before original descriptor reads. Fox's extra x48 table and other item
graphs remain incomplete; these checks do not establish full Falco move parity.

A normal-driver-cache two-Falco Battlefield sample completes 3,600 simulation
steps and 3,600 draw submissions in 60.020 seconds, with no catch-up callbacks.
Simulation averages 0.580 ms (p95 0.9 ms); draw submission averages 5.619 ms
(p95 7.6 ms, maximum 13.7 ms). The original stage callbacks, HUD, combat,
particles and stock changes run in this sample. Its controller workload uses
ordinary attacks/shielding; projectile contact is checked separately above.
This measures submissions, not distinct presentations or input-to-photon latency,
and it does not resolve the previously measured cold-cache shader stalls.

All 145 targeted tests pass. The final binary retains the unchanged Falcon
combat trace, 124-frame Ready/Go, 4,500 stage-callback frames and rendered
stock-loss/respawn lifecycle. The existing article browser regression also passes.
[Falco projectile and timing evidence](benchmarks/browser-2026-09-16-native-port-falco-projectiles.json).

Previous article checkpoint:

Fox/Falco's laser, blaster and Illusion/Phantasm Article subgraphs now import
their original models, attributes, state descriptors and hitbox scripts. Original
WASM item handlers pass 1,792 script frames across 28 state descriptors, with
83,990 checks against independently decoded hitbox fields and timing. The item
sound-command secondary opcode also has a corrected endian adapter. This is an
isolated subsystem result: neither fighter is enabled in complete matches yet.

The shared item archive now supplies typed common parameters to an isolated
original `Item_80266FCC` initialization check. All 92 numeric words and 12 packed
bytes are preserved, and the game's pool/count/tracking initialization passes.
Unconverted item registries, color tables and Fox's extra fighter table remain
explicit gaps; no substitute registry is installed. Spawning, movement, ownership
and collision scheduling are the next integration steps. Both Node and Chrome
pass these checks using automatically loaded hosted fixtures.
All 143 targeted tests and base/scene/fighter builds pass. The final binary
retains the same Falcon combat trace, 124-frame Ready/Go, 4,500 stage-callback
frames and rendered stock-loss/respawn lifecycle. No new FPS or latency result
is claimed for this subsystem checkpoint.
[Article and item initialization evidence](benchmarks/browser-2026-09-16-native-port-articles.json).

Previous roster/rendering checkpoint:

The constructor fixture now also loads Donkey Kong, Marth, Ganondorf and Roy
through the original player/character mapping and their own hosted archives.
Each passes 120 settling steps and 142 rendered input steps (walk, jump, aerial
attack, recovery), with GPU vertex verification. Marth and Roy's original sword
trails now use the typed GX immediate boundary; their original interpolation and
color arithmetic are retained. The inspected screenshots show the original
trails. The complete archive assembler still rejects unconverted x48 item/extra
graphs, so this is five constructor-capable fighters, not full roster support.

The retained two-Marth Battlefield fixture completes 3,600 simulation steps and
3,600 draw submissions in 60.025 seconds at 960×720, without catch-up callbacks.
Simulation averages 0.577 ms; draw submission averages 6.152 ms (p95 8.3 ms,
maximum 16.5 ms). It draws 7,021 particle primitives and 895 sword trails. This
sample uses the driver's normal cache and excludes the 124-frame Ready/Go prelude.
It measures submissions, not distinct presentation or input-to-photon latency.

Cold shader compilation is a confirmed remaining source of stutter. With Mesa's
persistent shader cache disabled, one frame spends 26 ms compiling three new
programs within a 43.9 ms draw submission. An origin-tagged repeat identifies
the sword shader on frame 94, then a model and two particle programs on frame 95;
those three compilations consume 40 ms of that run's 60.2 ms draw. Sword-only
prewarming was tested and removed: its cold-cache maximum is still 47.3 ms versus
50.4 ms without it. Preparing the broader material/effect shader set is the next
stutter experiment; the narrow prewarm is not carried as a claimed win.

The final binary retains the unchanged Falcon combat trace, original Ready/Go,
4,500 stage-callback frames, four KOs and three respawns. All 137 targeted tests,
base/scene/fighter builds and base subsystem verification pass.
[Roster, trail and compilation evidence](benchmarks/browser-2026-09-16-native-port-roster-trails.json).
Full scenes/stages/roster, audio, controller/network integration, deployment,
fidelity and presentation/latency validation still prevent acceptance.

Previous checkpoints below describe their state at the time.

A sampled CPU profile identified repeated JavaScript uniform packing and exhaustive
alpha checks in the renderer. Reusing typed packing buffers and classifying alpha
at its comparison boundaries reduces mean draw submission from 9.102 ms in the
control to 6.084 and 6.023 ms in two candidate runs (about 33.5%). Both candidates
submit 3,600 draws / 3,600 simulation steps in 60.032 seconds, with no catch-up
callbacks. Their p95 draw costs are 9.3 and 8.0 ms; simulation averages about
0.51–0.53 ms. This is the same limited 960×720 fixture with original particles.

All five deterministic images are byte-identical to the old renderer. GPU vertex
checks and the combat trace are unchanged, and all 136 targeted tests pass.
No camera, model, effect, gameplay or resolution simplification was introduced.
The performance harness now distinguishes instrumented CPU profiles and records
the tested renderer source hashes separately from the unchanged WASM hash.
[Renderer packing experiment](benchmarks/browser-2026-09-16-native-port-uniform-packing.json).
The full acceptance criteria remain unmet; distinct presentation and latency
are not measured by this test.

Previous checkpoints below describe their state at the time.

Original particle polygons now render through efLib_render_callback and
psDispParticles. The game still performs sorting, billboard/trail geometry,
colors and texture selection; a scoped GX immediate-vertex boundary submits its
quads/triangles/strips/fans to the existing WebGL material backend. The rendered
intro/background/combat/lifecycle probe submits 3,614 particle primitives (14,456
vertices) over 354 frames, peaking at 40 primitives in one frame. The combat trace
is unchanged. GPU transform feedback checks the particle vertices along with
stage/fighter/HUD geometry; Ready's maximum scaled position error is below 1e-6.
The inspected Ready image now includes the original entrance sparkles and streaks.
All 135 targeted tests pass.

Three 60-second 960×720 combat samples are retained. The first completes 3,600
simulation steps / 3,599 draw submissions in 60.026 seconds, with one catch-up
callback and a 26.6 ms maximum draw call. The repeat completes 3,600 / 3,600 in
60.033 seconds, no catch-up callback, 8.926 ms mean submission, 10.7 ms p95 and
19.3 ms maximum. It includes 12,776 particle primitives across 1,820 timed frames;
the 124-frame intro prelude is excluded. Slow draws also occur without new shader
or resource counts, so these samples do not isolate compilation as the cause.
The final binary, with hardened graphics-enum bounds checks, completes 3,600
simulation steps / 3,595 draws in 60.025 seconds, with five catch-up callbacks,
9.101 ms mean submission, 10.9 ms p95 and 24.3 ms maximum. Its GPU vertex and
legacy combat checks pass. The report attributes validation to each binary.
These samples do not measure distinct presentation or input-to-photon latency.
[Particle polygon checkpoint](benchmarks/browser-2026-09-16-native-port-particle-polygons.json).

Point/line particles, shape-animation geometry, shadow capture and refraction
still fail explicitly or remain outside this fixture's integrated path. Full
stage startup, audio, native scenes, all-character/all-stage gameplay, device and
network integration, deployment and presentation/latency validation remain.
The full acceptance criteria have not been met.

Previous checkpoints below describe their state at the time.

The `--stage-callbacks` fixture now renders through the original gameplay camera's
pass sequence and HSD GX-link traversal. It calls the real Battlefield draw
callbacks and tracks GPU resources for native background objects and model
effects as they appear and retire. The rendered 4,500-frame background test
observes both background groups during the fade (frames 2,677–2,876), then removes
the old group. Ready/Go, 683 combat frames, 1,020 lifecycle frames, four KOs and
three respawns also pass. Entrance effects are visible in the inspected 960×720
screenshots. The gameplay camera's angles and projection were not adjusted.

The original stage callback exposed an omitted shadow allocator initializer.
The bootstrap now uses HSD_ShadowInitAllocData and the SDK's actual texture-size
routine; constructors verify independent non-null shadows. An object-pool guard
rejects missing initialization before it can silently write through address zero.
Actual shadow-map capture remains incomplete. Particle managers are explicitly
counted as missing GPU work; unknown model owners and unsupported geometry fail.

The expanded 60.027-second combat run completes 3,600 simulation steps and 3,600
draw submissions. Simulation averages 0.525 ms; submission averages 8.964 ms
(p95 10.9 ms, max 19 ms). There are no multi-step callbacks and one 33.3 ms draw
interval associated with the pacing correction. This is still a two-Falcon,
one-stage development fixture, measured after the unpaced intro prelude. It is
not a distinct-presentation or input-to-photon measurement. All 132 targeted
tests pass, and the legacy combat trace is unchanged.
[Stage rendering checkpoint](benchmarks/browser-2026-09-16-native-port-stage-rendering.json).

Remaining requirements include particle rendering, full stage initialization,
shadow/refraction rendering, audio, native menus/pause/results and scene ownership,
all-character/all-stage gameplay, browser device/netplay integration, deployment
and presentation/latency validation. The earlier simulation-only stage checkpoint
is retained as history:
[Battlefield callback checkpoint](benchmarks/browser-2026-09-16-native-port-stage-callbacks.json).

Previous checkpoints below describe their state at the time.

The new `--intro` fixture removes the 120-frame startup skip. Both Falcons run
original Entry/EntryStart/EntryEnd states with their original trophy-platform
models. Native Ready completes at frame 85, releasing fighter input and invoking
the stage's on-start callback. Go completes at frame 124; the match clock stays
at 8:00 until the next scene step. Original status animations and completion
callbacks control those transitions. Typed callback adapters fix the mismatch
between the original no-argument functions and the status system's int argument
at the WASM indirect-call boundary. No gameplay camera offset was added.

The rendered test covers all 124 intro frames, 683 combat steps, 1,020 lifecycle
steps, four KOs and three respawns. The eight-minute timeout still reaches frame
28,800 and exits through the original 112-frame end sequence. Keyboard movement,
jump and attack pass, along with all 131 targeted tests. The earlier no-intro
combat trace is unchanged. Ready, Go and entrance-platform screenshots were
visually inspected at 960×720.

After the unpaced intro prelude, the 60.037-second combat sample completed 3,600
simulation steps and 3,600 draw submissions. Mean simulation cost was 0.520 ms;
mean submission cost was 8.707 ms (p95 10.5 ms). There were no multi-step callbacks;
one clock correction produced a 33.3 ms draw interval. This does not certify
distinct presented FPS or input-to-photon latency, and the introductory sequence
is not included in that performance sample. Full stage on-init/background
transitions, effects rendering, audio, menus/pause/results, scene lifecycle,
networking and all-character/all-stage gameplay remain incomplete.
[Ready/Go and entrance checkpoint](benchmarks/browser-2026-09-16-native-port-intro.json).

Previous checkpoints below describe their state at the time.

The `--damage-hud` fixture now includes original damage percentages, character
emblems and stock icons alongside the timer/status graphics. The settled combat
display matches fighter damage (0% and 29%), and the rendered four-KO sequence
includes stock-icon counts 4, 3, 2 and 1 through native respawns. All 1,703
combat/lifecycle steps render, and the full eight-minute timeout still passes.
The combat trace remains unchanged.

The stock-icon bring-up found an uninitialized local in decompiled
`gm_80168B34`. Inspection of USA 1.02 executable code at `0x80168B34–0x80168BF4`
confirmed ordinary cases retain the character ID before adding `costume * 30`.
The portable recipe now preserves that behavior, and 396 selector cases pass.
This tests icon selection, not all-character gameplay. A separate respawn fault
came from reusing native owner/root addresses with new child polygons. The HUD
renderer now refreshes those bindings while retaining immutable GPU meshes.

Callback timing diagnostics also rejected a naive first-rAF clock anchor: Chrome
delivered an initial timestamp 208 ms before live startup, creating false catch-up
work. Live pacing now rejects stale timestamps before anchoring to a display
callback. A bounded 0.25 ms tolerance covers observed jitter, with negative debt
retained and repaid; mixed-refresh tests verify no accumulated speed-up. The
tolerance alone merely moved the oscillation boundary. Borrowing is now limited
to the first step, so small display-frequency drift produces one isolated phase
correction rather than repeated zero/two-step callbacks. Actual simulation debt
is retained, including genuine stalls; no simulation frames are skipped.

The completed full-HUD combat run records 3,600 simulation steps and 3,600 draw
submissions in 60.026 seconds at 960×720, versus 3,563 submissions for the prior
clock. Mean simulation time is 0.522 ms; mean draw submission is 8.946 ms
(p95 10.9 ms). No multi-step callbacks occurred; one isolated clock correction
produced a 33.3 ms draw interval. Final observed gameplay fields match the
control. All 131 targeted tests pass. This is still a partial two-Falcon fixture,
and neither distinct presentation nor input-to-photon latency is measured.
[Damage/stock HUD and pacing checkpoint](benchmarks/browser-2026-09-15-native-port-damage-hud.json).

Previous checkpoints below describe their state at the time.

The `--hud` fixture now draws the original timer, final-five-seconds countdown,
and match-end status models through the original HUD camera and light setup.
Queued draws retain their own camera, preserving the gameplay projection when
the later HUD pass changes it. Timer digits, object lifetimes and status animation
use original C; these are not HTML replacements. The 28,800-frame timeout test
renders the countdown and end sequence, and the four-KO test renders all 1,703
combat/lifecycle steps. Both complete; the combat trace remains unchanged.

With this HUD enabled, the 60.012-second combat run completed 3,600 simulation
steps and 3,599 draw submissions at 960×720. Mean simulation time was 0.487 ms;
mean draw submission was 8.307 ms (p95 9.8 ms). One double-step callback produced
a 33.4 ms draw interval. All 126 targeted tests pass. This is still submission
cadence, not a distinct presentation or latency measurement. Damage/stock HUD,
effects, audio, complete stage startup and broad gameplay coverage remain.
[HUD timer checkpoint](benchmarks/browser-2026-09-15-native-port-hud-timer.json).

The opt-in `--tournament` fixture now uses original VS rules/player defaults,
the VS frame callback, controller mapping, match clock and process pause masks.
Its settings are four stocks, eight minutes, no items, normal damage/speed and
singles. The earlier fixture set stocks but left match kind at the default
timed mode; it was not a stock-match lifecycle test. The new startup also sets
the real mode-routing context to VS rather than leaving it at zero (title).

The original player-statistics loader now receives typed `PdPm.dat` parameters.
Eight original match-status models/animations from `IfAll.usd` are imported for
the original end-sequence callbacks; their HUD drawing is still pending. Four
controller-driven KOs decrement stocks and produce three native respawns, then
original elimination, fighter freeze and scene-exit readiness. A separate test
advances the eight-minute timer to its exact 28,800-frame timeout boundary.
It does not shorten or directly edit the timer or stocks.

A longer combat workload exposed another PowerPC stack-layout assumption in
`ft_0899.c`: crouch/slope handling stored a float before a local vector. The
portable recipe now uses the already-declared volatile scratch scalar instead,
preserving the explicit f32 rounding. The reproduction previously trapped in
`ftPartSetRotX`; an input-driven held-crouch/release regression covers this path.
An unpaced 3,600-step workload checks attacks, shielding, KO/respawn and renewed
contact after dropping through platforms before the real-time GPU run.

The rendered lifecycle test exposed missing respawn-platform submission. The
original fighter callback now includes that accessory's original joint and
polygon classes; the GPU bridge registers/releases its geometry with the native
object lifetime. Unknown accessory descriptors remain rejected. The new test
draws the combat and KO/respawn sequence at 960×720. It is an unpaced correctness
test, not proof of 60 distinct presented frames per second.

The sustained scripted combat run now completes 3,600 simulation steps and 3,600
draw submissions in 60.022 seconds at 960×720 on Radeon 890M/Chrome 151. Original
hitlag occurs in every ten-second window, including renewed combat after a KO
and respawn. Mean simulation-call time is 0.453 ms (p95 0.7 ms); mean draw
submission time is 7.888 ms (p95 9.2 ms). Drawing is the larger measured cost in
this partial workload; these timings do not include all missing game systems.

A frame-clock regression caused rounded rAF timestamps to alternate zero/two
simulation steps at some otherwise ideal 60 Hz boundaries. The clock now borrows
at most 0.1 ms and repays that debt, with no accumulated speed-up. The hardware
control submitted 3,560 draws for the same 3,600 simulation steps; the candidate
submitted all 3,600, with identical observed final gameplay fields. A synthetic
36,000-frame quantized-clock test checks the cause independently. This single
hardware A/B measures submission cadence, not distinct presentation or
input-to-photon latency. All 123 targeted tests pass.
[VS lifecycle and pacing checkpoint](benchmarks/browser-2026-09-15-native-port-vs-lifecycle.json).

Full stage startup, Ready/Go, HUD/effect drawing, audio, native menus/pause/results,
all-character gameplay, gamepad input and production asset delivery remain
incomplete. The original 720p60 competitive acceptance criterion is not met.

The default native fixture now invokes the original fighter render callbacks
and original HSD joint/display traversal for each of the three object passes.
A scoped host material/primitive backend sends the selected polygons to WebGL;
it preserves the original visibility, billboard matrices, fighter-light setup
and cleanup. Stage objects still use the generic original joint callback:
complete stage/camera GX-link ordering, effects and accessories remain pending.
The preceding JavaScript mesh-selection path remains only as an explicit
`callbacks=0` / `--manual-draw` comparison.

This exposed a missing original SDK `GXProject` dependency, now linked as
unchanged C, and a 12-float projection local passed to 16-float SDK writers in
`lbVector_WorldToScreen`, now sized correctly in the portable recipe. Four
hand-computed projection cases check 12 outputs and output bounds. Both native
callback snapshots pass all shader and vertex checks; all 683 continuously
rendered combat steps retain the prior exact simulation trace. Browser input
and the 142-step jump/landing sequence also pass. This is fidelity progress,
not a claimed FPS improvement or complete competitive match.
[Original draw callback checkpoint](benchmarks/browser-2026-09-15-native-port-draw-callbacks.json).

Chrome also runs this partial fixture on the host's Radeon 890M through ANGLE
OpenGL. A 30.011-second baseline completed 1,800 simulation steps and 1,799 draw
submissions. Mean simulation-call time was 0.41 ms; mean draw submission was
8.68 ms (p95 14.9 ms). Hardware shader goldens and every final-snapshot vertex
check also pass. This is a near-60 submission cadence with early keyboard
interaction followed by idle animation, not a competitive-combat or distinct
presentation measurement. Hardware input-to-photon latency is still unmeasured.

The native development fixture now runs continuously with browser keyboard input
at `constructor.html?live=1`. It uses the original simulation scheduler and a
60 Hz frame clock, retaining simulation debt under load and explicitly pausing
hidden tabs. Per-draw verification readbacks and duplicate diagnostic capture
are disabled in this path. Snapshot verification remains available separately.

Every one of the 683 scripted combat steps can now be drawn without changing
the combat trace. A separate 142-step walk/jump/aerial/landing sequence also
passes with all steps drawn. The browser-event smoke test completes 180 steps
and returns to grounded idle after jumping, attacking and moving, with no death
or respawn. All 117 targeted tests pass, including frame-clock and shader-cache
invalidation checks. This is still two Falcons and partial Battlefield startup;
full callbacks, effects drawing, HUD, audio, gamepad input and competitive match
lifecycle remain incomplete.

The software-GPU smoke run records about 0.29 ms per simulation step and 32.8 ms
per draw submission (which can include driver waits). These short SwiftShader
numbers are diagnostic, not hardware-browser FPS or input-to-photon results.
Avoiding repeated shader-source generation did not yield a measured frame-time
gain in this test. [Continuous renderer/input checkpoint](benchmarks/browser-2026-09-15-native-port-live-input.json).

The live diagnostic now draws the two Falcon/Battlefield snapshots with original
material state: native matrix palettes, lighting channels, texture generation,
integer TEV combiners, alpha tests, depth and blending. The final snapshot draws
174 material sections using 25 compiled programs and 71 cached images. All
23,610 transformed vertices pass position/normal checks. Thirteen controlled
full-shader cases pass 52 pixel-channel checks, including specular, bump and
vertex-selected texture coordinates. The combat trace is unchanged.

Two integration errors were resolved from original code: SDK specular lighting
forces diffuse attenuation off, and the fighter's normal render pass must set
its original visibility/color-write flags and activate fighter-owned lights.
The white surfaces and black fighter silhouette are resolved in these snapshots.
This does not establish visual parity: original full draw callbacks/order,
effects, HUD and the complete match lifecycle remain. Validation uses SwiftShader
and synchronous GPU readbacks; it is not an FPS measurement.
[Material draw checkpoint](benchmarks/browser-2026-09-15-native-port-material-draw.json).

Earlier checkpoints below describe their state at the time.

The live diagnostic now activates the original offscreen camera and original
Ground stage-light constructor/animation process. Material capture includes
diffuse/specular light registers and original per-joint specular updates. This
also exposed a PowerPC-to-WASM layout bug in `StageCallbacks.flags`: the named
bits must read the high bits of the 32-bit flags word. All 256 byte patterns now
pass, and stage light objects/processes are checked through teardown.

Both live snapshots retain exactly the original camera projection and matrix
reference results, with the same combat trace. They now capture 20 distinct
material programs and nine light-register states each; the expanded combiner
suite passes 14,528 integer GPU channel checks. All 111 targeted tests pass.
The visible preview still uses the diagnostic first-UV shader: captured native
lighting/TEV/texgen/pixel state must now be connected to actual draws. This is
rendering setup progress, not a measured performance improvement or visual-parity
claim. [Camera/light checkpoint](benchmarks/browser-2026-09-15-native-port-render-context.json).

The shared skin palette now has an original-renderer reference. PObj matrix
setup agrees exactly across 81 poses of the 27 default model components:
25,656 position matrices, 24,621 normal matrices and 141 reflection matrices.
The two live Falcon/Battlefield snapshots also agree exactly. Golden cases
check camera rotation with nonuniform scale/shear and HSD's singular-matrix
fallback. These checks validate setup arithmetic, not GPU lighting.

The capture now dispatches the actual material class callbacks with their
owning fighter/GObj context. The preceding material checkpoint called the base
HSD setup, which missed fighter-specific alpha/overlay stages. The corrected
live snapshots use 16 distinct programs each and pass 14,016 integer GPU channel
checks; the combat trace stays unchanged. All 109 targeted tests pass. The
diagnostic picture still has the known white-surface errors from its simplified
shader. Original lighting activation and connecting native material state to
actual draws remain the next integration steps; no match FPS is claimed.
[Original model-matrix checkpoint](benchmarks/browser-2026-09-15-native-port-model-state.json).

Full original `HSD_MObjSetup` now runs through the material capture boundary,
including pixel-engine and color-channel setup. All 1,753 default-fighter
material instances match their original depth/blending/alpha-test descriptors
or HSD defaults. The sample uses seven distinct captured state combinations;
its blend modes are opaque and source-alpha. The live Falcon/Battlefield capture
also passes and retains the same combat trace. All 107 targeted tests pass.
This is setup validation: original light activation, specular updates, normal
matrices and applying the captured state to draws remain. The visible diagnostic
still uses its simplified shader and no native-port match FPS is claimed.
[Full material setup checkpoint](benchmarks/browser-2026-09-15-native-port-pixel-state.json).

Original HSD texture setup now runs at the material boundary too. All 1,730
runtime texture bindings across the 27 default fighter components match their
source dimensions, formats, wrapping, filtering, mip levels and 17,744,214
decoded texels. Runtime palettes and images are read from the native owner,
preparing the renderer to handle animated selections. UV matrices match the
separately exercised original texture-matrix routine. The sampler records SDK
LOD precision, normal-based coordinate generation and Samus's bump path.
The live Falcon/Battlefield probe captures and decodes 236 texture bindings per
snapshot without changing its combat trace. These are resource/setup checks,
not GPU texture sampling or a newly rendered match. Lighting, normal transforms,
pixel-engine state and draw integration remain. All 103 targeted tests pass.
[Texture boundary checkpoint](benchmarks/browser-2026-09-15-native-port-texture-state.json).

The native material compiler now feeds a tested WebGL integer combiner. Original
HSD setup was captured for all 1,753 material instances in the 27 default fighter
components, covering 33 distinct programs. Those programs and 187 synthetic
programs pass 14,080 exact signed-integer GPU channel comparisons. The two live
Falcon/Battlefield snapshots separately pass 13,760 comparisons, including 28
captured program snapshots. Tests cover interpolation rounding, all arithmetic
scales/biases, signed clamps, comparisons, selectors, swaps, presets and dependent
register writes. The combat trace remains unchanged after material capture.

This is combiner validation with supplied texture/raster inputs, not complete
material rendering: original texture coordinate generation, lighting and pixel
engine state still need integration. Match pictures still use the diagnostic
first-UV shader. The 98 targeted tests pass; GPU checks use SwiftShader and
establish neither native visual parity nor match FPS.
[TEV checkpoint](benchmarks/browser-2026-09-15-native-port-tev.json).

A new diagnostic now renders the live two-Falcon/Battlefield simulation through
its original camera at 960×720. The settled and post-combat snapshots show both
fighters after original body-part visibility selection. GPU transforms match the
native CPU reference across 26,266 vertices per snapshot; rendered and
simulation-only probes retain the same combat trace hash.

This exposed another portability fault: the shared game flag union reversed
byte-to-bit meaning on WASM, so the original draw-enable byte hid fighters.
Its layout now preserves PowerPC bit positions, with all 256 byte values checked.
The 27-model GPU regression and the fighter/stage/scene checks pass, as do 93
targeted tests. These GPU checks use SwiftShader, not performance hardware.

Visual inspection still finds white stage surfaces: the diagnostic shader lacks
original TEV, lighting and alpha behavior. Full draw callbacks, HUD and effect
rendering remain unfinished. These are two snapshots, not an interactive match;
no camera visual-parity, 720p60 or latency result is claimed.
[Live render checkpoint](benchmarks/browser-2026-09-15-native-port-live-render.json).

The common effect bank and native camera now run in the two-Falcon integration
probe. Original effect loading covers 47 model descriptors, 592 particle commands
and 36 texture groups. The model lifecycle test creates two instances of each
model, runs 2,818 updates and 1,488 particle updates, and verifies that all ten
checked scene pools return to baseline. It includes the original spline-driven
effect and indefinite effects released through the original owner cleanup path.

**Correction to the earlier combat checkpoint:** it had not loaded the common
effect bank, and its position/damage assertions missed invalid memory access.
A fail-fast guard now catches requests to unloaded banks. Further integration
found three retail-global-layout assumptions: camera quake reads, shield parameter
writes past the animation queue, and particle teardown through a fabricated
aggregate. The portable source recipe now references the actual original globals;
it does not change camera offsets, shield mechanics or particle algorithms.
The older combat hash is historical bring-up evidence, not a validated baseline.

The camera bridge reads original eye/interest, view matrix, FOV and projection.
Its numerical checks cover finite values, an orthonormal view, eye/interest axes,
original clip planes and GX depth coefficients. The original projection aspect
is 1.2173333; the 960×720 display remains 4:3. Numerical checks do not establish
visual parity. A native rendered match and its FPS/latency are still unmeasured.
[Common effects and camera checkpoint](benchmarks/browser-2026-09-15-native-port-effects-camera.json).

Two player-owned Falcons now interact on Battlefield through original fighter
callbacks. The integration probe covers a platform drop, repeated jabs, hitlag,
knockback/displacement, shield stun, grabbing and a forward throw. It initializes
Melee's original default rules: leaving the rules zeroed had allowed damage but
removed knockback. Both owners share the original kind cache while keeping
separate camera subjects and all 15 callbacks.

The attack sequence reaches 20%; shielding holds percent at 20%; the forward
throw reaches 29%. A no-attack control stays at 0% with no hitlag or knockback.
The attack run executes 803 scheduler steps including settling, and two fresh
Chrome instances produce identical per-frame trace hashes. This is same-build
repeatability, not retail gameplay parity or presented FPS. All 86 targeted
tests and solo-input, fighter, stage-map and scene regressions pass.

Full match startup, tournament rule handling, general items, audio,
browser device input and gameplay rendering remain incomplete. No 720p60 or
input-to-photon result exists for the port.
[Two-fighter combat checkpoint](benchmarks/browser-2026-09-15-native-port-combat.json).

Battlefield's original stage-object path now creates all seven model groups
(73 source joints and 64 meshes) and runs 120 animation updates. The original
joint binding functions derive camera and blast-zone bounds from archive markers.
All seven original light-selection paths pass, as do every one of the 256 packed
light-override flag values and exact cleanup of the tested scene pools/callbacks.

A combined Falcon/Battlefield probe loads the original collision arrays and
checks all 52 world-vertex components against the source and original stage
scale. Falcon spawns at the source marker, falls, lands and reaches grounded
Wait after 120 scheduler calls. After the original player-enable routine runs,
another 142 scripted input frames produce walking movement, a jump, neutral air
and a return to grounded Wait. Required state and movement assertions pass.

This is an integrated simulation bring-up probe, not a complete match. It uses
four Battlefield model groups but has not integrated all Stage startup roots,
stage-specific callbacks, general effects/items, audio playback, match rules,
opponent combat, browser device sampling or gameplay rendering. The collision
arrays and source archives are pinned for that WASM instance's lifetime; rematch
teardown is not implemented by this probe. No FPS or input-to-photon measurement
is reported. All 86 targeted tests and the stage-map, fighter and scene browser
regressions pass.
[Battlefield and input checkpoint](benchmarks/browser-2026-09-15-native-port-battlefield-input.json).

Captain Falcon now completes the original player-owned `Fighter_Create` in
Chrome, with all 15 scheduled callbacks, original character OnLoad, model,
animation, camera subject and shadow setup. The probe verifies its ownership and
initial Fall state. The isolated scheduler completes 120 calls and reaches
Rebirth. This probe has no initialized stage or match rules: empty stage bounds
cause that transition. It is not a playable match or gameplay-parity test.

Falcon's effects archive now loads through the original effect loader. Six model
effects run on two independent owners each, with 742 model updates, 386 particle
update pairs and exact cleanup across ten scene pools. Peak counts in this test
are 187 particles and 120 generators. One effect requires 21 additional particle
updates after model expiration. All 4,104 packed-float operand cases pass the
big-endian stream adapter. GPU particle drawing is still unimplemented.

The SDK interrupt-mask functions now preserve nested previous-state semantics
for the synchronous, single-thread browser runtime. This does not implement audio
playback or asynchronous hardware scheduling. The original camera subject pool
is initialized with the match startup's capacity of 70; no camera offsets or
projection changes were introduced. Gameplay framing still requires visual
verification when the renderer is integrated.

The complete Captain base importer remains restricted to Falcon. All 84 targeted
tests and the wider/scene browser suites pass. No hosted data is committed and
no player ISO is required. Stage/match startup, other complete character roots,
combat/input, audio and the gameplay renderer remain integration work. There is
still no native-port FPS or latency result.
[Effects and constructor checkpoint](benchmarks/browser-2026-09-15-native-port-effects-constructor.json).

Original item model setup now runs for all 77 Article slots registered by the
playable characters. These contain 66 model graphs and 11 deliberately empty
roots, totaling 438 runtime joints, 435 meshes and nine hurtboxes. Two concurrent
owners per entry pass bone-table ordering, original item material class,
independent transforms and complete object/bone/material teardown checks.

The browser run covers 154 instances, 616 transform updates and 92,755 checks,
including all 65,536 packed attribute-flag combinations. Hurtbox world coordinates
match independent matrix multiplication exactly in this corpus. Popo's unresolved
GumStrings model becomes NULL, as in the original archive loader.

All 81 targeted tests and the wider/scene browser suites pass. The wider module
is 2,814,145 bytes; the scene module remains 253,196 bytes. These limited item
owners are not registered as gameplay Articles: special attributes, item states,
scripts, spawning and item rendering remain pending. Full fighter creation and
match execution remain incomplete; this is not a 720p60 measurement.
[Item-model checkpoint](benchmarks/browser-2026-09-15-native-port-item-models.json).

The initialized fighter animation path now uses Melee's original motion loader
and per-fighter load buffers instead of receiving preloaded trees. All 27
components pass 81 selected clips / 5,184 animation updates through this combined
path. There are 486 source-to-loaded-tree checks and 162 checks that loading a
secondary clip preserves all 32 KiB of the active primary buffer. Nana's missing
rows resolve through Popo's actual archive.

Two simultaneous fighters have four distinct buffers. Shared files are pinned
once per registered kind; live owners prevent release. Removing one owner leaves
the other able to animate, and final teardown returns every buffer and file pin.
The isolated shield-pose test must reattach an ordinary motion before playback;
otherwise its quaternion pose is incorrectly reused under the previous blend.
No gameplay code was changed to bypass that assertion.

All 79 targeted tests and the wider/scene browser suites pass. The wider module
is 2,812,474 bytes. Full Fighter_Create, action-state transitions, scripts, stage
simulation and gameplay rendering are still incomplete. This is integration
progress, not a native match, latency measurement or 720p60 result.
[Owned-motion-loader checkpoint](benchmarks/browser-2026-09-15-native-port-owned-motions.json).

Per-part animations and ordinary shield-pose skeletons now load through typed
native archives. All 27 components pass 307 variants across 83 channels, with
1,228 original animation attachments, 2,448 blend updates and 156 shield-pose
applications. The browser suite checks independent fighter ownership, override
masks, blend completion/reset, source translations/scales and deterministic
finite poses. This adds 1,167,074 checks; it does not execute shield gameplay.

The original archive loader deliberately nulls unresolved externs. The two Kirby
hand entries retain that behavior rather than being synthesized. The portable
shield descriptor now uses a direct HSD_Joint pointer; its three original Guard
consumers access the child at offset eight explicitly, replacing a misleading
pointer-array declaration without changing the original access.

All 79 targeted tests and the wider/scene browser suites pass. The compile audit
remains 1,047 of 1,130 units, with the same 83 failures. The wider module is
2,811,552 bytes. Demo motions, character items, full construction, match execution
and gameplay rendering remain incomplete. No playable native match, native FPS,
or input-to-photon result exists yet.
[Secondary-animation checkpoint](benchmarks/browser-2026-09-15-native-port-secondary-animations.json).

Nine additional character-data fields are now imported with explicit layouts:
idle/crouch choices, thrown-hitbox and body-contact descriptors, camera extents,
environment-collision/ledge parameters, sound IDs, effect bones and foot-placement
parameters. Packed bone bytes and signed shorts retain their meanings; shared
sound lists retain aliasing. The original full ftData symbol remains hidden
until the remaining graphs are typed.

Original environment collision-box initialization, resizing, animated generation
and interpolation now run on the same fighter objects as animation and dynamics.
Across 27 components, 5,184 updates pass 117,908 checks, including thrown-hitbox
position history and body-contact transforms. Maximum contact-coordinate error
against independent matrix multiplication is 0.00000190735. The original resize
routine applies its scale argument to ledge margins/offsets but takes size limits
from the fighter's own scale; that distinction is preserved.

All 76 targeted tests and the wider browser suite pass. The smaller scene binary
is byte-identical to its verified predecessor. The wider module is 2,811,093
bytes. Stage-line traversal, landing, ledge grabs, action scripts and combat are
still unexecuted, and the native port still has no playable match or FPS result.
At that checkpoint, remaining base-data graph families included demo motions,
per-part animations, shield poses and character items; the latter two animation
graphs are now covered by the checkpoint above.
[Gameplay-data/collision checkpoint](benchmarks/browser-2026-09-15-native-port-gameplay-parameters.json).

Original fighter animation attachment, interpolation-skeleton construction,
blending, frame progression and dynamics now execute on the same initialized
fighter objects. All 27 components pass 81 real clips and 5,184 updates across
two simultaneous instances. The corpus includes four/eight-frame blends,
looping and half-speed playback; stepping one instance leaves its peer's frame
unchanged. Interpolation joints are distinct from visible joints and from the
other fighter, and teardown returns the original pools to baseline.

This integration exposed a required ABI correction: the numeric animation flag
word overlaid PowerPC-ordered bitfields. The WASM representation now preserves
those bit positions. Inspection of the development disc's original instructions
confirms the part mask at bits 9–21, source kind at bits 0–5 and transition bone
at bits 6–8. The actual C fields pass 68,096 arithmetic extraction checks across
266 total command/flag views, plus write/isolation checks.

The wider module is 2,808,721 bytes. All 74 targeted tests and startup/scene
browser regressions passed. At that checkpoint animation trees were still preloaded;
full motion-state transitions, action scripts, combat physics and stage/render
integration remain incomplete. This is not a playable match or a FPS result.
[Fighter animation checkpoint](benchmarks/browser-2026-09-15-native-port-fighter-animation.json).

Original dynamic-bone construction, selector updates, rest-pose simulation and
teardown now run in the wider fighter target. The 27 components contain 40 base
sets / 168 nodes. Two simultaneous default-costume instances per component pass
3,240 update calls and 363,071 checks, including source parameter copies, initial
world positions/segment lengths, all imported selector rows, independent state,
finite deterministic updates and recovery of all 320 original pool entries.

The typed importer distinguishes 60-byte source parameter records from 152-byte
runtime nodes, preserves shared arrays, and treats animation cutoffs as integers
rather than relocated animation pointers. Four additional Purin hat descriptors
are imported but not executed. Animation-driven dynamics, Kirby copy hats,
wind/stage interactions and retail per-frame parity remain unverified.

All 74 targeted tests and the separate startup/scene browser regressions pass.
The wider module is 2,808,039 bytes; this remains a diagnostic, not a playable
match or a 720p60 result. Complete fighter-data loading/full construction,
character OnLoad dependencies and match execution are still the next integration
work. [Dynamic-bone checkpoint](benchmarks/browser-2026-09-15-native-port-dynamics.json).

Original per-fighter field initialization now executes against native character
data and the real action-state tables. All 27 character components pass five
configurations each: 135 instances, five live together per character, and 69,876
checks of parameter copies, player/controller fields, input history, timer
sentinels, costume fallback, color calculation and cleanup. The input history
starts with nonzero bytes so the original reset is exercised.

The wider target also links original `Fighter_Create`, but does not execute it
yet. Explicit `--no-entry` prevents Emscripten from also pulling the console
entry point. Browser resident-file definitions replace only their matching
original definitions; remaining game logic stays linked. There are 89 additional
platform abort boundaries plus the existing 51 GX guards. No unsupported call is
silently treated as successful. The supplied disc prepares the original SIS font
only during development; browser startup remains automatic.

The new target is 2,806,536 bytes, with many game/HSD objects still at audit
optimization. It is not a performance build or a playable match. All 71 targeted
tests, the original startup/scene checks and 81 unchanged diagnostic GPU images
pass. Complete fighter-data import and execution of the full constructor remain
next, followed by actual match-loop and renderer integration.
[Per-fighter initialization checkpoint](benchmarks/browser-2026-09-15-native-port-fighter-initialization.json).

Original global fighter startup now links and runs in a fresh browser runtime.
`Fighter_FirstInitialize_80067A84` initializes all six original pools, 23 common
data globals, shared materials, the original fallback lights and character startup
callbacks. The port fixes adjacent-global address assumptions without changing
the reset targets; 1,162 sentinel checks cover resets and preserved fields.
Two models of every default character component construct after startup and clean
up correctly: 54 instances across 27 entries. The original light scheduler runs
120 steps with stable allocations. This is not 120 frames of fighter simulation.

The separate `--startup` target is 263,371 bytes and retains the same 51 explicit
GX abort guards as the scene target. It needs no new hardware placeholders. Late
full initialization after partial common-data loading is rejected, preserving
existing ownership. All 68 targeted tests and the existing scene suite pass;
all 81 diagnostic 960×720 images are unchanged. Full fighter creation, tournament
stage setup, match execution and FPS/latency validation remain incomplete.
[Original startup checkpoint](benchmarks/browser-2026-09-15-native-port-startup.json).

Original fighter model construction and part allocation now replace the generic
scene setup in the integration fixture. All 27 entries use the fighter joint
class, 2,179 fighter polygon objects and original HSD part/display pools. Initial
bone flags and pool teardown pass. Two simultaneous copies of every default
model have distinct runtime joints; 30,824 texture/color checks show no state
leaking between instances.

The original initializer uses shared costume descriptor IDs. Envelope checks now
validate pointers against the owning live skeleton, rather than requiring the
loader's most recent ID-table entry to identify every older instance. This fixes
a diagnostic assumption exposed by testing two fighters together.

The 68 targeted tests and 81 diagnostic 720p snapshots pass. Full startup link
probes now cover global and per-fighter initialization: the generic math/heap
probe reports 107 and 144 unresolved symbols, respectively, with no ABI mismatch.
These include callback dependencies and scene-specific adapters excluded from
that probe; they are not counts of functions executed during initialization.
[Original fighter-model checkpoint](benchmarks/browser-2026-09-15-native-port-fighter-model.json).

The default costume path now uses original ftData_80085820 and
lbArchive_80017040, with typed model and material-animation symbols in the same
hosted archive. All 27 default models pass loading, cache reuse and teardown.
The original material setup/selection/reset routines pass 7,468 texture-image
and palette checks on 48 controllers. Yoshi's two material-color animations add
2,424 checks. This covers 242 image descriptors and 92 palettes without modifying
packed GX pixels or animation bytecode.

All 68 targeted tests pass; the 81 diagnostic 960×720 image samples are unchanged.
The diagnostic viewer still does not draw these material selections. Full match
execution, the gameplay renderer, per-character texture callbacks and hardware
FPS/input-latency measurements remain incomplete.
[Costume/material animation checkpoint](benchmarks/browser-2026-09-15-native-port-costume-animation.json).

Original auxiliary mesh loading and fighter-part visibility now run in the
browser. All 27 entries bind 313 auxiliary display objects to their primary
skeletons; geometry/reference checks and teardown pass. The port releases the
temporary descriptor ID aliases after resolution to avoid stale joint pointers.
Visibility import covers all 127 costumes. Runtime checks on the 27 default
models pass 87,649 comparisons across hide/show, cached updates and mixed part
selections. Alternate costume models remain pending; texture-animation setup is covered by
the later checkpoint above.

The 66 targeted tests pass. The 81 diagnostic 960×720 images remain unchanged;
this asset viewer does not yet draw the new visibility decisions or run a match.
Full fighter creation, action-state execution and the gameplay renderer remain
necessary before native gameplay FPS or latency can be measured.
[Auxiliary/visibility checkpoint](benchmarks/browser-2026-09-15-native-port-visibility.json).

Original ftParts_SetupParts now replaces the temporary bone assignment in the
collision fixture. All 27 components pass: 1,894 part slots and 1,753 fighter
material objects. Checks cover reserved slots, joint identity, hierarchy depth,
display-object indices and lighting flags. The 318 animated hurtboxes still pass
position/cache checks and exact rewind.

Fighter material setup now has a typed callback adapter for its unused third
argument. Template reads reference their original named objects directly instead
of relying on separate globals being adjacent. The pinned retail symbol map
confirms the class object and two templates at 0x803C6980, 0x803C69D0 and 0x803C6A44.
Original SDK light-object constructors/getters are now compiled as CPU code;
22 position, direction, color and attenuation cases pass. Hardware draw calls
remain explicit guards until the renderer implements them.

All 63 targeted tests pass and all 81 sampled 720p images are unchanged. The live
Fighter_Create link probe has 144 unresolved symbols, down from 150; this is a
dependency count, not an FPS measurement. Material drawing, complete fighter
creation and combat remain.
[Parts/material checkpoint](benchmarks/browser-2026-09-15-native-port-parts-materials.json).

All 27 original LoadSpecialAttrs callbacks now execute in browser WASM, including
clone delegation and the size adjustments for Link/Young Link, Pikachu/Pichu,
Samus and Mewtwo. Import covers 20 distinct layouts and 1,346 named scalar fields.
Compiler-generated offsets and widths match a separate PowerPC-targeted layout
check. Packed colors, byte arrays, Kirby's halfword and opaque unrelocated words
retain their original representations.

Browser verification passes 3,616 field reads, 135 original parameter loads and
78 scaled-field cases. The 63 targeted tests pass, existing initialization,
collision and motion checks pass, and all 81 sampled 720p images are unchanged.
This still does not execute complete Fighter_Create, OnLoad item registration or
combat, and there is no native match FPS or input-latency result.
[Character-attribute checkpoint](benchmarks/browser-2026-09-15-native-port-character-attributes.json).

Original collision initialization, reset and world-position updates now run for
all 27 playable fighter components: 318 hurtboxes and the two retail dynamics
colliders. Across 864 animated frames plus exact rewind, positions agree with
independent matrix multiplication within 0.00000191 world units. Original cached
position updates are checked too. Kirby's 13 reserved accessory slots and Link's
and Young Link's reserved slot remain in the part mapping.

The portable declaration now gives the dynamics-collider array all eleven entries
instead of a one-entry decompiler placeholder plus padding. C offset/extent checks
preserve the original Fighter layout, and an independent synthetic fixture fills
all eleven slots through the original initializer. The 59 targeted tests, complete
5,508-clip browser regression and 81 unchanged sampled images pass. This uses a
limited Fighter context; dynamic-bone simulation, complete Fighter_Create and
combat remain. The later parts/material checkpoint replaces its temporary mapping.
[Character-collision checkpoint](benchmarks/browser-2026-09-15-native-port-character-collision.json).

All 23 sections of PlCo now import, and the original Fighter_LoadCommonData runs
in browser WASM. Its 23 global bindings and all 805 source relocations remain
valid after the prefetched file cache is released. The original loader retains
one archive (two heap allocations) for the runtime lifetime. Three shared models
load through original HSD objects; the accessory's 153-frame animation and exact
rewind match the pose reference with zero matrix error.

The existing shared-parameter, color, CPU and motion checks still pass. Color
import also classifies eight unreachable commands in two retained tails; these
are converted metadata, not additional executed coverage. The 1,211 reachable
commands still produce 23,177 checked updates. All 81 sampled 960×720 images are
unchanged, and 57 targeted tests pass. This is common initialization only:
Fighter_Create, complete character metadata, combat, native rendering and audio
remain. There is no match FPS or input-latency result.
[Common-initialization checkpoint](benchmarks/browser-2026-09-15-native-port-common-initialization.json).

Original fighter motion loading now runs in browser WASM. Typed imports cover
8,767 motion rows and 57,434 action-script commands across all 27 playable
components. The native loader passes 26,301 loads and 17,534 repeat/cache checks,
including Nana's 313 Popo fallback rows. Script words, relocated targets, flags,
FigaTree descriptors and track bytes are checked against the original data.
Resident animation bundles are pinned until the GObj userdata destructor releases
both original animation buffers; clearing a pinned cache is rejected.

Loader-produced trees also pass original HSD animation checks: 39 clips and 2,244
frames match the native pose reference exactly and rewind exactly. All 81 sampled
960×720 images remain identical. These checks use a deliberately limited Fighter
context, not full Fighter_Create, action execution or a playable match. The
46 targeted tests and complete 5,508-clip browser regression pass.
[Motion-loading checkpoint](benchmarks/browser-2026-09-15-native-port-motion-loading.json).

The platform adapter replaces the GameCube ARAM/RAM address split with a checked
copy from prefetched native animation bundles; original cache, copy, relocation,
primary/secondary buffer and partner-selection routines remain. Two motion flag
views retain their original word bits. Remaining character
metadata and native rendering/platform integration still precede a match loop.

Command decoding now preserves the PowerPC bit positions when commands are
represented as native numeric words. The unmodified-header probe failed at least
one read/write check for all 252 field views. The corrected build passes 64,512
field reads, 794 masked writes and 10,496 byte/halfword/signed-angle reads. This
covers fighter/item parameters, the fighter opcode view and color-command words;
it does not change ordinary runtime Fighter flag structs or packed image bytes.
Read-only checks of the development executable confirm timer, opcode and byte-15
hitbox extraction. The command stack now names all five existing words, retaining
its 0x24-byte ABI; loop handling avoids the decompilation's out-of-bounds one-entry
pointer-array access. Original control routines pass 36 steps, including two
nested loops with a subroutine at stack depth five and animation-wait timing.

The 41 targeted tests, all 5,508 animation clips and 81 unchanged 960×720 diagnostic
images pass. The wider audit still compiles 1,047 modules and has 83 failures;
the last Fighter_Create link probe still has 149 missing platform dependencies
and no signature mismatches. These are port correctness checks, not a combat or
performance result. This earlier checkpoint preceded motion/script import and original motion loading. [Command-layout checkpoint](benchmarks/browser-2026-09-15-native-port-command-layout.json).

Original Melee archive loading now reads browser-prefetched native-layout images.
It retains `lbArchive_LoadSymbols`, C varargs lookup, HSD relocation and archive
release, with no DVD interrupt wait in this path. Chrome verifies 162 loads across
all 27 default models, independent simultaneous copies, and stable repeated heap
use. Invalid/duplicate installs are rejected; releasing the hosted cache leaves
loaded archives valid. Only imported joint public symbols are exposed.

Scenes now attach to original GObj owners with the real HSD joint destructor.
The checks cover immediate release and deletion from a running original scheduler
callback, with no remaining GObj, callback, scene or archive allocations. This is
model ownership used by fighter creation, not execution of `Fighter_Create`.
The scene GPU diagnostic also uses this original archive/GObj path. All 81 sampled
960×720 images are identical to the previous path. The complete 5,508-clip browser
regression and 40 targeted tests pass. [Archive/ownership checkpoint](benchmarks/browser-2026-09-15-native-port-resident-files.json).

The file adapter currently handles explicit .dat/.usd filenames and the HSD heap
for allocated archive copies, plus pinned preload-cache hits for motion bundles.
Locale selection, other scene heaps, asynchronous file callbacks, shared `PlCo`
fighter tables and complete character metadata remain. No native competitive match or FPS/latency result exists yet.

The original HSD scene path now loads and destroys all 27 model archives with
resolved joint/envelope references. Three cycles per model leave no tracked scene
objects or ID/vector/matrix allocations and show stable repeated heap use. Original
Melee `lbAnim` attachment and HSD joint animation run 38 clips over 2,180 frames,
matching the prior native pose matrices exactly and passing exact rewind checks.
This path also drives the browser GPU: all 81 sampled 960×720 images match the
earlier diagnostic path. The scene target uses audit objects at `-O0`, and all
49 unimplemented GX calls abort explicitly; the diagnostic shader still lacks
native material effects. It is not gameplay or an FPS result.

Portable source adapters now let 1,047 of 1,130 modules compile (83 failures).
Original `Fighter_Create` has 149 remaining external dependencies, down from 223,
with no linker signature mismatches. The adapters preserve boolean conversions
instead of casting incompatible callbacks. Two additional C fixes make values
carried in the original PowerPC `r3` register explicit as a return value and a
function argument; the development executable verified those flows. The upstream
checkout remains pinned and clean. All 38 targeted tests and the complete
5,508-clip browser regression pass. [Scene/ABI checkpoint](benchmarks/browser-2026-09-15-native-port-hsd-scene.json).

The earlier GPU milestone renders all 27 default fighter components through a native
animation/skin-matrix pipeline and browser WebGL2 at 960×720. Static geometry is
uploaded once; the draw path updates matrix palettes without CPU vertex skinning.
The diagnostic shader displays the first UV image, not complete native materials.
Native lighting/TEV, normal matrices, fighter part selection, combat, gameplay
camera, audio and input are still missing. The original `/play/` path is unchanged.

Chrome/SwiftShader checks compare every GPU-transformed vertex with the native
CPU reference at animation frames 0, 16 and 32 for all 27 models. Maximum absolute
error is 0.0000038147 world units. All models produce visible, differing images
over that sequence; Game & Watch holds the same visible pose at frames 0 and 16,
then changes by 32. Five synthetic raster cases verify clockwise GX front faces,
front-face culling, both GX clip boundaries and hidden joints. Visual inspection
found and fixed reversed culling before this check passed. These are correctness
checks on a software GPU, not hardware performance or gameplay-camera parity.
[Texture/GPU checkpoint](benchmarks/browser-2026-09-15-native-port-texture-gpu.json).

Continued implementation: original OS/HSD allocation and GObj scheduling now run
in WASM, with Melee's 25 callback-priority levels and checks for ordering, pause
masks, deletion during callbacks and bounded object reuse. All 27 playable fighter
components load their common attributes and execute the original gravity/friction
routines. Original FObj/AObj code decoded all 5,508 clips (833,221 tracks) in Chrome,
with 33,756,699 emitted updates per pass and identical results after rewind.
Synthetic timeline vectors verify loop/end behavior. Eleven clips use the valid
non-classical scaling flag, which the importer now retains.

Selected SDK matrix/vector routines now run natively with explicit fused operations;
128 finite-input cases use an independent exact binary32 oracle. Original MSL
trigonometry and HSD SRT builders run with explicit constructor initialization.
The original cosine near-quadrant shortcut is retained rather than substituted
with standard browser cosine. 256 SRT geometry checks pass in Chrome.

Typed default model joint trees now connect to original FObj/AObj animation and
the SRT builders through a limited native pose owner. Chrome passes 38 clips over
3,275 frames, covering all 27 fighter components and all 11 type-zero clips, with
finite matrices and exact rewind replay. Constraints, custom joint classes and
unsupported animation channels fail explicitly. This owner is not full HSD JObj
or fighter initialization. [Recorded validation](benchmarks/browser-2026-09-15-native-port-math-pose.json).

These numbers establish subsystem coverage only, not combat correctness or FPS.
Fighter creation, the complete action-state loop, constraint descriptor imports,
remaining SDK math, GX, audio and Dolphin parity remain.

Further math bring-up replaces the upstream non-GameCube `__frsqrte(x) -> sqrt(x)`
placeholder with Dolphin's table-based reciprocal-square-root utility. This is
standalone arithmetic with no CPU dispatcher or emulator state. The vendored
utility is pinned and licensed, and all 57 upstream golden vectors pass through
WASM memory, including NaN payloads and denormals. Vector normalization retains
the SDK's 25-bit multiplication-operand rounding. Inverse, quaternion and axis
rotation builders now run natively; original C look-at and projection routines
are linked. The projection checks preserve GX's near=-1/far=0 depth convention.
These checks do not validate the gameplay camera or complete PPC floating-point
status/denormal behavior.

The earlier SDK/geometry link probe included implemented arithmetic, SDK heap and panic
boundaries. Original `HSD_JObjLoadJoint` is now missing 49 GX functions; original
`Fighter_Create` is missing 223 symbols across graphics, platform services and
uncompiled game modules. The latter includes unrelated modes/stages retained
through common tables. These are engineering dependency counts, not measured
runtime bottlenecks. The next integration target is the GX graphics boundary and
typed model/material/texture assets, followed by actual fighter creation.

The typed GX geometry decoder now reads all 27 default model archives: 2,179 mesh
sections, 209,465 vertex records and 186,255 triangles, including packed colors,
fixed-point position/normal/UV arrays and triangle-strip winding. Mesh binding,
material and texture pointers are retained for their typed importers. At that
checkpoint no skinning or draw calls ran. Chrome passed this decode alongside the complete
5,508-clip animation regression and 38-clip pose integration; 23 targeted tests
pass. [SDK/math/geometry checkpoint](benchmarks/browser-2026-09-15-native-port-sdk-geometry.json).

Skinning now connects the imported meshes to animated poses. The typed envelope
importer preserves influence order and raw weights, and native palette preparation
retains HSD's different coordinate-space rules for rigid, shared, single-influence
and blended meshes. Five hand-calculated cases cover those distinctions. All 27
default fighter models pass 32 animated frames and exact rewind checks in Chrome.
Identical palettes are shared across mesh sections, reducing total palette
calculations from 8,552 to 3,011; SHA-256 comparisons of every transformed vertex
over the 32-frame sequence remained identical for all 27 models. This is work
reduction in a subsystem, not a measured match FPS improvement. The later GPU
diagnostic uses these palettes; normal matrices, complete materials/texture
combining and full match integration remain.

The native texture decoder replaces assumptions in `scripts/engine/gx-decoder.js`:
inspection found missing indexed palette formats and PC-style CMPR interpolation/transparent
colors. Dolphin's `TextureDecoder_Generic.cpp` and `TextureDecoder_Util.h` show
GX uses 3/8–5/8 interpolation and retains averaged RGB in transparent entries.
The 27 default archives reference 1,730 texture descriptors: CMPR 1,635, C8 73,
C4 1, I4 18, I8 1 and RGB5A3 2. These are descriptor counts, not unique images.
All now decode in Chrome: 1,753 material descriptors and 17,744,214 decoded texels.
The unchanged original HSD `MakeTextureMtx` runs for all 1,730 descriptors, with
six hand-calculated transform/validation cases. Indexed palettes, GX interpolation,
partial tiles, malformed pointers, cycles and truncation have focused tests.
The full 5,508-clip browser regression and 33 targeted tests pass.

The first module loads collision data for Battlefield, Final Destination, Dream
Land, Yoshi's Story, Fountain of Dreams and Pokémon Stadium. Original HSD archive
code relocates the converted pointers; typed C reads match the source asset
values. The RNG and collision-box checks also pass. All assets are fetched
automatically by the private static browser harness and remain outside Git.
Chrome also passed degenerate-line rewiring tests on private mutated copies and
the original Poke Floats pruning exemption. [Recorded browser validation and
compile audit](benchmarks/browser-2026-09-15-native-port-bootstrap.json).

The source audit compiled 981 of 1,130 game/HSD/SDK translation units into WASM
objects, with 149 compile failures and no suppressed callback-type diagnostics.
This wider scope includes SDK code excluded from the earlier 1,032-file syntax
probe, so the counts are not comparable as a regression. The 481 unresolved
symbols in the successful objects are measured before linking libc/runtime and
include unused SDK services. They are a dependency inventory, not 481 required
manual rewrites. Main categories are platform assembly and hardware access,
callback/type mismatches, and internal/generated headers.

The next useful milestone is a native two-fighter simulation with per-frame
Dolphin comparisons. Fighter initialization and typed animation/attribute assets,
the update loop, SDK math, GX rendering, browser audio and complete stage callbacks
remain. Removing emulation offers CPU headroom, but only that running workload
can measure the benefit and verify Melee behavior.
