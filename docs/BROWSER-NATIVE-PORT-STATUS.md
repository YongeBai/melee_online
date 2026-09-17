# Native browser port — September 16, 2026

The direct port is now an implemented, reproducible development target:
[build and architecture](../engines/browser-native/README.md). It links original
decompiled C directly into browser WASM without Dolphin or PPC dispatch. It is
not a complete playable game yet, and there is no native-port presented-FPS result.

The native live controller bridge now carries both sticks and independent analog
shoulder pressure into HSD. Native callbacks pass 889 control-test frames (1,031
rendered input frames plus 124 intro frames): C-stick forward/up/down smashes,
35%/65% light shields, digital shield and release. Actual browser keyboard events
also produce those smash states and shielding in a 900-step/900-draw live run.
Standard-gamepad mapping and blur/disconnect/stop cleanup pass unit checks;
physical controllers and latency have not been measured. All 240 unit tests,
shared browser checks and the 3,720-frame Yoshi-copy regression pass.

Fresh hardware-Chrome 960×720 combat workloads each submit all 3,600 draws:

| Workload | Elapsed | Mean simulation | Mean draw submission | Draw p95 / max |
| --- | ---: | ---: | ---: | ---: |
| Battlefield Kirby/Yoshi | 60.023 s | 0.495 ms | 3.847 ms | 6.3 / 23.4 ms |
| Fountain Ice Climbers mirror | 60.055 s | 0.816 ms | 6.302 ms | 10.3 / 21.0 ms |

Neither run needs a multi-step catch-up callback. Fountain retains its existing
cosmetic reductions, original moving platforms and four native fighters. These
are deterministic-workload submission measurements, not distinct presented FPS
or input-to-photon latency. Repeated Battlefield spikes motivate a model-decoding
cache experiment; the shield-specific cause is not established. The complete
competitive release, native menus/pause/audio, other costumes, device calibration,
broader parity and static release integration remain unfinished.
[Controller and timing evidence](benchmarks/browser-2026-09-16-native-port-controller.json).

Kirby's Yoshi copy now imports the original hat, its four joint-animation graphs,
the captured fighter's egg shell and the zero-state egg Article. Normal input
checks ground/air tongue misses, ground/air fighter capture and escape, copy
loss and reacquisition. The full probe passes 3,720 simulation frames and 3,862
rendered input frames plus 124 intro frames. Each capture draws the native shell
for 199 frames; the two shells total 398 rendered frames and retire normally.

GPU contact passes 1,283 rendered frames plus the intro. Captured-fighter damage
rises from 8 to 15.28. All 236 unit tests and shared browser checks pass, along
with original Yoshi egg capture and Game & Watch-copy regressions. Original
callbacks remain unchanged. A test initially expected base Yoshi's capture
states; source inspection confirmed the copied move has separate states 331/332.
[Yoshi-copy evidence](benchmarks/browser-2026-09-16-native-port-kirby-copy-yoshi.json).

This closes the remaining copied-ability asset package, not the competitive-game
acceptance gate. Item-swallow eggs and exhaustive interactions are unverified.
C-stick and analog shoulders are integrated at the later checkpoint above. Full scenes/menus/audio, other costumes, broader
retail parity, static release integration, presented 720p60 and latency remain.

Kirby's Game & Watch copy now imports the original replacement body, packed
colors, fighter/item outlines and Chef food/pan Articles. The full lifecycle
passes 2,229 rendered input frames plus 124 intro frames, including ground/air
Chef, pan attachment/retirement, copy loss and reacquisition. GPU contact passes
1,073 rendered input frames plus the intro: damage rises from 8 to 12 with four
hitlag frames. The firing snapshot validates 32,414 vertices, 13 shader cases
and 52 pixel channels. All 235 unit tests and shared browser checks pass;
Mewtwo-copy, Jigglypuff-copy and original Game & Watch regressions pass
3,471 / 1,963 / 3,144 simulation frames.

Rendering exposed a PPC-address dependency that simulation missed. The copy
outline supplies one row, while normal Kirby visibility visits two. The retail
second row overlaps a relocated pointer: its negative signed value skips the
variant loop. WASM's positive pointer caused an out-of-bounds access. After
checking the supplied development executable's original callback and visibility
loop, the importer now verifies the alias and supplies an explicit skipped
second row. Original callbacks remain unchanged. Rendered copy probes also
require the complete native stage/camera passes so outline draws are exercised.
The saved images show copied silhouettes, pan/food, and normal Kirby after loss.

At the preceding checkpoint Yoshi was the remaining copy package. The full
competitive browser release, broader parity, presented 720p60 and latency gates
remain unfinished.
[Game & Watch-copy evidence](benchmarks/browser-2026-09-16-native-port-kirby-copy-gamewatch.json).

Kirby's Jigglypuff copy now imports the original replacement body and three-node
dynamic chain. Partial ground/air Rollout and full ground charge pass native
turns and recovery, followed by copy loss/reacquisition. The full probe renders
2,105 input frames plus 124 intro frames; dynamic allocation follows
317 → 314 → 317 → 314 free nodes. A late-steering full-charge fixture rolled
offstage and was rejected. The retained fixture starts near stage center,
steers using ordinary input and explicitly rejects death/rebirth or copy loss.

GPU contact passes 752 rendered frames: damage rises from 8 to 23 with eight
hitlag frames. The attack snapshot checks 18,930 vertices, 13 shader cases and
52 pixel channels. All 234 unit tests and shared browser checks pass; Mewtwo-copy
and original Jigglypuff regressions pass 3,471 and 1,714 simulation frames.
Yoshi remains the unimplemented copy package. Complete gameplay,
other costumes, retail parity, presented 720p60 and latency remain uncertified.
[Jigglypuff-copy evidence](benchmarks/browser-2026-09-16-native-port-kirby-copy-purin.json).

Kirby's Mewtwo copy now imports the original replacement body, seven-node tail
dynamics and ten-state Shadow Ball Article. The rendered lifecycle passes 3,613
input frames plus 124 intro frames. It stores three charge units, resumes to the
native maximum of seven, releases full charge on the ground and in the air, and
resets charge on copy loss/reacquisition. Tail allocation follows
312 → 305 → 312 → 305 free nodes. The body draws in 2,689 frames.

GPU contact passes 1,053 rendered frames: target damage rises from 8 to 16 with
five hitlag frames at first impact. The firing snapshot checks 20,183 vertices,
13 shader cases and 52 pixel channels. All 233 unit tests and shared browser
checks pass; Falco-copy, Bowser-copy and original Mewtwo regressions also pass.
These are compatibility checks, not a new FPS or latency result. Copied
Yoshi's package remains, along with the broader
playable-game and acceptance gates below.
[Mewtwo-copy evidence](benchmarks/browser-2026-09-16-native-port-kirby-copy-mewtwo.json).

Kirby's Ice Climbers copy now imports the original hat, separate hammer, ice
Article and particle bank 46. The accessory descriptor is explicitly read from
root +16 while +12 remains the projectile Article; Marth/Roy retain their +12
sword descriptors. Rendering validates the exact native hammer descriptor and
follows its original LThumbNb attachment. Unknown accessories still fail.

The Popo-donor lifecycle passes 1,983 rendered input frames; the Nana-donor
lifecycle passes 2,516. Both include another 124 intro frames. Normal controller
movement places Kirby on the appropriate side of the live pair. The Nana probe
checks the actual captured fighter kind on both captures: 11 maps to copy kind
10 through the original swallow code. Both partners remain active with unchanged
stocks. Ground/air ice, held-item release, landing reset, hammer removal, copy
loss and reacquisition all pass. The hammer draws in 173/159 frames respectively,
with three mesh draws at peak. These remain selected compatibility checks;
complete gameplay parity, presented 720p60 and latency are not certified.

The GPU contact test passes 992 rendered frames: the copied ice raises target
damage from 8 to 13 with four hitlag frames at first impact. The firing snapshot
checks 21,091 vertices plus 13 shader cases and 52 pixel channels. All 232 unit
tests and shared browser checks pass. Roy-copy, Bowser-copy and original
Ice Climbers regressions pass 2,496 / 3,058 / 4,138 simulation frames.
[Ice-copy evidence](benchmarks/browser-2026-09-16-native-port-kirby-copy-ice.json).

Kirby's Bowser copy imports the native five-node/nine-mesh hat, two dynamic
nodes, one particle-only Flame Article and effect bank 41 (four commands, one
texture group). Original C drives the flame's collision, lifetime and ownership.
The controller lifecycle runs ground/air breath, sustained depletion, release,
recharge, taunt loss and reacquisition. Fuel/scale reach their original minima
40/60 from maxima 360/380; release returns both to full in 489 simulation ticks,
including recovery and item retirement. The hat pool follows
318 → 316 → 318 → 316. New C diagnostics only read the original floats.

The full rendered lifecycle passes 3,200 input frames plus 124 intro frames.
GPU contact validation passes 1,049 rendered frames: Fire Breath raises Bowser
from 8 to approximately 26.54 damage, with three hitlag frames at first impact.
The saved contact frame checks 21,499 vertices, 13 shader cases and 52 pixel
channels. All 230 unit tests and shared browser checks pass. The Sheik-copy
and base-Bowser regressions pass 2,926 and 1,311 simulation frames. These are
compatibility checks; no new performance gain, presented-FPS or latency result
is claimed.
[Bowser-copy evidence](benchmarks/browser-2026-09-16-native-port-kirby-copy-bowser.json).

Kirby's Zelda and Sheik copies now import their original hats, dynamic chains,
shared effect bank 21, and Sheik's thrown/held needle Articles. Rendered lifecycle
tests pass 1,968/3,068 input frames plus 124 intro frames each. Sheik stores three
needles on shield cancellation, resumes to six, fires the stored charge and
resets on reacquisition. Zelda's twelve hat nodes and Sheik's four nodes return
to the dynamic pool on copy loss and are allocated again on reacquisition.

GPU-validated needle contact and reflection sequences pass 1,097/1,287 rendered
frames. The copied needle volley raises target damage from 8 to about 25.19 with
four hitlag frames at first impact. Saved firing/reflection frames check
21,554/22,704 vertices, plus 13 shader cases and 52 pixel channels each. A
close-range Nayru contact test observes the first hit raising damage from 8 to
10 with three hitlag frames after a controller-driven approach to 12 units.
All 228 unit tests and shared browser checks pass. Roy-copy and base-Cutter
regressions pass 2,496/820 simulation frames.

A copied-Nayru reflection probe transforms the donor from Zelda to Sheik using
normal input. The original reflector transfers a needle to Kirby, reverses its
horizontal velocity from -4 to +4 and raises damage from 3 to approximately 4.55.
Kirby remains at zero damage; the same donor-input sequence without Nayru deals about
17.46 damage. Original clanks remain active, so this fixture verifies reflection
rather than requiring a return hit on the donor. The importer, callbacks and
camera retain their native behavior. These are compatibility checks; the full
browser-game, retail parity, presentation-FPS and latency requirements remain
unfinished.
[Zelda/Sheik-copy evidence](benchmarks/browser-2026-09-16-native-port-kirby-copy-forms.json).

Kirby's Marth and Roy copies now import the original hats, separate sword models,
dynamic bones and two-model effect banks 20/48. Rendered lifecycle tests pass
2,545 and 2,638 input frames respectively, plus 124 intro frames each. They cover
partial ground/air release, full-charge automatic release, copy loss and
reacquisition. Full charge releases at 121/211 ticks, following the original
120/210-threshold callbacks. The native sword draws in 397/487 frames and its GPU
resources retire when the game removes the accessory. Dynamic pools return all
six/eight hat nodes on copy loss and allocate them again on reacquisition.

GPU-validated contact tests pass 750/752 rendered frames. The partial attacks
raise target damage from 8 to 20/19 and produce seven/six hitlag frames. Saved
attack frames check 22,013/21,448 vertices, plus 13 shader cases and 52 pixel
channels each. All 226 unit tests and shared browser startup checks pass.
The Pikachu-copy simulation regression passes 1,845 frames, retaining its
320 → 310 → 320 → 310 dynamic-pool lifecycle.

The importer reads the sword at root +12 and dynamics at +16 without treating
them as projectile Articles. Accessory binding validates the exact resident
sword descriptor, preserving original attachment, callbacks and camera.
These are compatibility checks; they do not establish retail parity, presented
720p60 or input-to-photon latency. The complete browser game remains unfinished.
[Sword-copy evidence](benchmarks/browser-2026-09-16-native-port-kirby-copy-sword.json).

Kirby's Donkey Kong copy now imports the original body costume, extra model and
both Giant Punch effects from bank 39. Its rendered lifecycle passes 3,117 input
frames plus 124 intro frames: partial/full ground and air punches, charge
cancellation/storage, resuming charge, copy loss and reacquisition. A cancel
request at charge 3 stores 4 of 10 because the original callback finishes the
current swing. Full punches consume the charge; reacquisition starts at zero.
The 723-frame rendered contact probe passes GPU validation, raising target
damage from 8 to 22 with seven hitlag frames. The saved attack frame checks
20,007 vertices. All 224 unit tests and shared browser checks pass. The
Falco-copy lifecycle regression passes 2,382 rendered input frames; all four
saved images are pixel-identical to the preceding Falco checkpoint.

This reuses the Falco body renderer with the original zero insertion mask and
46 active bones. The native loader creates 17 costume display objects and five
extra display objects; per-model telemetry observes copied-body drawing in
2,223 frames. The importer handles the original 24-byte root without interpreting
following packed model data as nonexistent Articles. The default costume is
integrated; other colors and the broader game/deployment/parity work remain
unfinished. These are compatibility checks, not a new performance measurement.
[Giant Punch copy evidence](benchmarks/browser-2026-09-16-native-port-kirby-copy-donkey.json).

Kirby's Falco copy now runs the original body-costume loader, including its two
inserted active bones, 22 costume display objects, five extra display objects,
material animation and separate laser/Blaster Articles. Its rendered lifecycle
passes 2,382 input frames plus 124 intro frames: ground/air fire, seven repeated
laser loops, copy loss and reacquisition. Per-model telemetry observes copied
body drawing in 1,461 frames; its GPU resources are removed when the original
loader removes those parts. A 979-frame rendered contact test with GPU validation
raises target damage from 8 to 11 and records four hitlag frames. Fox's copied
laser regression records the same three damage with zero hitlag. The Samus-copy
rendered lifecycle also passes; four saved images are pixel-identical to the
previous checkpoint. All 222 unit tests and shared browser checks pass.

The renderer binds these appended polygons using their original resident
geometry descriptors, rejecting missing or ambiguous matches. It retains the
existing binding path for ordinary models, original draw order, camera and
visibility. Only Kirby's default Falco-copy costume file is integrated here;
other costume colors remain part of the unfinished full-game work. This is
another gameplay compatibility checkpoint, not a measured performance gain or
proof of the 720p60 acceptance target.
[Falco-copy evidence](benchmarks/browser-2026-09-16-native-port-kirby-copy-falco.json).

Kirby's Samus copy now imports the original hat, nine-state Charge Shot Article
and effect bank 34. The rendered lifecycle passes 3,176 input frames plus 124
intro frames, covering partial and full ground/air shots, shield cancellation,
stored charge, resuming charge, copy loss and reacquisition. Cancellation stores
level 3 of 7; full shots consume charge, and reacquisition starts at zero.
The contact probe passes 1,039 rendered frames with GPU validation, increasing
target damage from 8 to 19 with nine hitlag frames at impact. The saved firing
frame checks 20,775 vertices. Original callbacks and controller inputs drive
the sequence; the added charge diagnostics only read state.

The original effect archive contains an invalid palette reference in group 0.
Its loader relocates that word without reading the palette. The importer now
preserves this exact pinned case; selected texture memory remains bounds checked,
and other invalid references still reject. The exercised charge paths pass, but
this does not prove every possible effect-script path avoids the reference.
The loaded copy effect bank passes 725 descriptor/relocation checks. All 221 unit
tests and shared browser checks pass. This is a compatibility checkpoint, not
a new performance result or completion of the 720p60 goal.
[Charge Shot copy evidence](benchmarks/browser-2026-09-16-native-port-kirby-copy-samus.json).

Kirby's Link and Young Link copies now import their original hats, arrow/bow
Articles and both arrow attachment models. Full rendered lifecycle checks pass
2,205 and 2,303 input frames respectively, plus 124 intro frames each: acquisition,
full ground charge, airborne release, copy loss and reacquisition. Each hat
allocates three dynamic nodes; pool counts go 316 → 313 → 316 → 313 through
those transitions. Per-model submission checks observe arrow attachments drawing
in 120 and 101 frames, rather than inferring visibility from owner-level counts.
Embedded arrows retire through the original callback, including its prolonged
cleanup state; the harness waits without deleting them.

Contact tests increase the target's damage from 8 to 26 for Link and 8 to 23
for Young Link, with nine/eight hitlag frames at impact. Focused GPU validation
passes all 1,058/1,044 rendered contact-sequence frames. These checks retain
normal controller inputs, original camera and native physical shields; the
damage fixture turns the target away instead of disabling its shield. No new
performance claim is made for this core (`a51e2ff0…`). All 218 unit tests, shared
browser checks and the Pikachu copy lifecycle regression pass. The all-character game, full scenes,
menus/audio, retail parity, public deployment, presentation and latency acceptance
remain unfinished.
[Bow-copy evidence](benchmarks/browser-2026-09-16-native-port-kirby-copy-bow.json).

The live-shader experiment was rejected and reverted. Removing validation-only
transform-feedback outputs and skipping inactive uniform preparation produced
draw-submission means of 9.27 and 7.77 ms against 8.86 and 7.93 ms controls in
A/B/A/B order. Candidates submitted 3,575 and 3,596 frames; controls submitted
3,589 and 3,600, each from 3,600 simulation steps in about a minute. First-use
candidate shader compilation was slower, and simulation timing also varied.
There is no consistent sustained improvement. Recorded fighter state, workload
and action traces match. Four candidate images differ from control in only
2–6 pixels each, by one RGB level; skipping uniform preparation adds no further
image changes. These observations do not establish retail parity or presented
FPS. All 216 unit tests pass after restoring the retained renderer. The probe
now saves settled/final images for render-steps checks as well.
[Experiment evidence](benchmarks/browser-2026-09-16-native-port-live-uniform-experiment.json).

Immediate particle/trail drawing now batches adjacent compatible primitives,
carrying each primitive's TEV registers as flat integer vertex data. Full state
matching alone merged only about 3% of primitives: a captured frame showed 58
adjacent pairs differing only in TEV register values. The final candidate reduces
334,456 particle submissions to 137,181 in the 3,600-frame Peach/Fountain workload,
without changing the vertex count. Both candidate runs submit all 3,600 frames;
controls submit 3,600 and 3,599. Mean draw-submission CPU is 6.83 ms versus 7.14 ms
across run means, a modest 4.4% difference with visible run-to-run variation.
This is a repeatable draw-call reduction; displayed FPS was not measured.

All 216 unit tests and shared browser checks pass. The integer GPU oracle checks
223 programs through both uniform and vertex register paths (28,544 channel
comparisons). Four Fountain images and the Marth sword-trail image are identical
to the port controls. Marth passes all 142 rendered input frames with GPU checks,
including twelve sword-trail frames. All four timing runs have identical recorded
initial/final fighter values, workload counts and action-state traces. Full
competitive gameplay, presentation and latency acceptance remain incomplete.
[Batching evidence](benchmarks/browser-2026-09-16-native-port-immediate-batching.json).
The follow-up profile puts uniform preparation/upload at 11.5% of sampled wall
time and the batch-state matcher at 1.5% self time. This motivated the rejected
live-shader experiment above; the profile alone did not predict a useful gain.

The renderer now reuses identical consecutive pixel/channel snapshots instead
of repeatedly decoding and allocating them. Changed snapshots retain independent
data for queued draws. In the corrected-dynamics Peach/Fountain workload, control
draw-submission means were 12.37 and 12.63 ms; candidate means were 11.44 and
10.73 ms (about 11.3% lower across the run means). The better candidate submitted
3,494 draws for 3,600 simulation steps in roughly 60 seconds. Cadence remains
below target, and variation in simulation timing limits the performance claim.
This is CPU submission evidence, not displayed FPS or latency certification.
All 212 unit tests pass. The focused GPU probe passes both renderer variants;
its Ready, Go, settled and final PNGs are byte-identical. The settled/final
snapshots check 9,156 and 23,340 vertices respectively. This comparison establishes
equivalence to the port control for these samples, not retail visual parity.
[Pixel-cache evidence](benchmarks/browser-2026-09-16-native-port-pixel-cache.json).

Two other candidates were reverted: a WASM-specific stage-camera diagnostic
guard did not improve timing, and skipping inactive uniform packing did not
show a reliable gain against variable controls. Their
[address-check results](benchmarks/browser-2026-09-16-native-port-stage-address-experiment.json)
and [uniform results](benchmarks/browser-2026-09-16-native-port-active-uniform-experiment.json)
are retained. The batching experiment above follows those rejected candidates.

A new runtime check exposed missing dynamic-bone pool initialization in the
match harness: a Pikachu copy hat declared three chains but had zero live nodes.
The harness now calls the original initializer before stage/fighter setup. All
26 selected fighter starts pass a strengthened regression that checks live
chain counts for 27 components, including Nana and both Zelda/Sheik forms.
Examples include Fox's four nodes, Marth's twelve, Zelda's forty-four and Peach's
forty-five. Earlier timings predate this correction and do not certify this build.

Pikachu and Pichu copies now pass full rendered lifecycle tests of 1,987 and
1,990 frames respectively, plus 124 intro frames each. Their hats allocate
10 and 8 dynamic nodes, return them on copy loss, and reacquire correctly.
Contact tests raise the target from 8 to 15 damage with seven frames of hitlag;
Pichu's copy retains one-point recoil. All 210 unit tests and shared browser
checks pass. Focused GPU verification passes all 973 Pikachu and 976 Pichu
contact frames. A corrected-build 60-second Peach mirror on Fountain records
3,600 simulation steps and 3,513 draw submissions: 59.97 and 58.52 per second.
Simulation averages 0.95 ms; draw submission averages 9.22 ms with a 15.9 ms p95.
The workload uses the documented cosmetic reductions and 90 live dynamic nodes.
It does not meet the presentation target or prove displayed FPS/latency. A
separate CPU profile identifies repeated GameCube-address diagnostic logging,
material/state conversion and allocation as the next optimization targets.
[Jolt-copy and dynamics evidence](benchmarks/browser-2026-09-16-native-port-kirby-copy-jolt.json).

Kirby's Fox copy now passes the 1,993-frame full rendered lifecycle, plus 124
intro frames: ground/air Blaster, hat loss and reacquisition. A separate
979-frame contact test observes the laser raise Fox from 8 to 11 damage without
hitlag. The same 979-frame sequence passes focused GPU vertex validation, with
20,538 vertices checked in the saved firing frame. The original four-joint hat,
two-state laser, nine-state gun and model-only muzzle effect are imported.
All 208 unit tests and the Mario copied-fireball contact regression pass.
These are correctness checks; no new performance or retail-parity claim is made.
[Fox-copy evidence](benchmarks/browser-2026-09-16-native-port-kirby-copy-fox.json).

Kirby's Ness and Peach copies now pass full rendered lifecycle tests: 2,239 and
1,971 frames respectively, plus 124 intro frames each. The two-item copy loader
preserves PK Flash and its explosion, and Toad and its spores. The original
copy-effect entries have no separate file, so the loader retains that path.
Normal controller input steers a charged Flash into a jumping Ness (8 to 43
damage, 20 frames of hitlag) and triggers Toad's counter with Peach's jab. In the
full-scene Toad sample, Peach goes from 8 to about 13.73 damage while Kirby stays
at zero; both stock counts remain four. These are fixture results, not canonical
cross-fixture damage or retail-parity comparisons.

Focused GPU validation passes all 1,099 Ness and 924 Peach frames, including the
explosion and spores. The first Ness attempt hit its 300-second validation limit
inside vertex readback and is recorded as incomplete; an explicit 600-second
probe budget completed the same sequence. The game and performance target did
not change. All 206 unit tests and Mario's copied-fireball contact regression
pass. Full competitive 720p60, presented FPS and latency remain unproven.
[Ness/Peach copy evidence](benchmarks/browser-2026-09-16-native-port-kirby-copy-ness-peach.json).

Kirby's Falcon and Ganondorf copies now run original ground/air punch attacks,
copy loss and reacquisition in full rendered tournament-scene tests: 1,998 and
1,963 frames respectively, each plus 124 intro frames. Contact tests verify
Falcon Punch raises damage from 8 to 35 and Warlock Punch from 8 to 40, with
12 and 13 frames of native hitlag respectively. The contact test observes the
first hit because an idle opponent can fall offstage before a long recovery
window ends. Original gameplay is unchanged. Focused GPU verification passes
all 741 Falcon and 762 Ganondorf frames, including the punch effects at impact.
Mario copy contact still passes, and all 205 unit tests pass. There is no new
performance or retail-parity claim. Remaining copies, full scenes/menus/audio,
costumes, networking, deployment and presentation/latency acceptance remain.
[Punch-copy evidence](benchmarks/browser-2026-09-16-native-port-kirby-copy-punch.json).

Kirby's Luigi and Dr. Mario copies now complete the same capture, copied
neutral-special, loss and reacquisition simulation sequence. Their rendered
full-scene runs pass 1,987 and 1,991 frames respectively, plus 124 intro frames.
Luigi uses the original fireball Article and copy effect bank 37; Dr. Mario uses
the original six-state pill Article and shared Mario copy effect bank 32. Native
camera framing, hats and projectiles were visually inspected. All 203 unit tests
pass. Focused GPU validation passes all 755 Luigi and 756 Dr. Mario frames.
Separate full-scene contact tests confirm copied Mario/Luigi fireballs raise
opponent damage from 8 to 14; Dr. Mario’s pill raises it from 8 to 16. Kirby’s
damage and both stock counts remain unchanged. These are correctness checks,
not performance or retail-parity certification.
[Copy-family evidence](benchmarks/browser-2026-09-16-native-port-kirby-copy-family.json).

Kirby's Mario copy now passes a 1,996-frame rendered tournament-scene test,
plus 124 intro frames: capture, swallow, ground/air copied fireball, taunt copy
loss, and reacquisition. A separate spit test passes 675 frames and leaves Mario
with ten damage and Kirby without a copy. The focused acquisition/fireball run
GPU-verifies all 756 rendered frames. Original hat destruction/recreation and
projectile ownership/lifetime are checked; the multi-attachment renderer also
passes the 882-frame Yoshi egg-lay regression. All 201 unit tests and the shared
browser/core checks pass. Other Kirby copies remain pending. There is no new
performance, retail parity, displayed-FPS or latency claim for this checkpoint.
[Kirby Mario-copy evidence](benchmarks/browser-2026-09-16-native-port-kirby-copy-mario.json).

Kirby's original constructor and base moves now run in the direct port. The
full tournament-scene test passes 3,550 rendered frames, plus 124 intro frames,
covering five aerial jumps and ground/air inhale release, Hammer, Final Cutter
and Stone. Original stocks remain four. A focused ground/air Cutter run passes
GPU vertex checks on all 962 rendered frames. The full scene per-vertex attempt
reached its 600-second limit inside readback and remains incomplete.

All 26 independently selected fighter codes now pass the constructor/input
regression: 3,692 live motion-word checks, covering 27 components including Nana.
The base checkpoint passed 197 unit tests. The subsequent Mario-copy milestone
above covers one ability; the remaining copies still require integration and
verification. Full scenes/menus/audio, other costumes,
retail parity, networking, deployment and presentation/latency acceptance remain.
A separate 960×720 Battlefield Kirby mirror submits all 3,600 draws for 3,600
simulation steps in 60.033 seconds, with no catch-up callbacks. Mean simulation
CPU time is 0.511 ms; mean draw submission is 5.326 ms (p95 8.6 ms, max 19.9 ms).
This is one scripted combat sample, with no GPU readbacks; distinct displayed
FPS and input-to-photon latency remain unmeasured.
[Kirby base evidence](benchmarks/browser-2026-09-16-native-port-kirby-base.json).

The rendering-state copy optimization is retained after A/B/A/B controls on the
Fountain Ice Climbers mirror. It removes temporary array copies and callbacks
while retaining independent queued state and all original shader/camera values.

| Readers | Mean draw submission | p95 | Draws / 3,600 steps | Catch-up callbacks |
| --- | ---: | ---: | ---: | ---: |
| Original A1 | 8.837 ms | 14.2 ms | 3,595 | 5 |
| Direct copies B1 | 5.992 ms | 8.8 ms | 3,600 | 0 |
| Original A2 | 8.431 ms | 12.3 ms | 3,598 | 2 |
| Direct copies B2 | 5.969 ms | 8.6 ms | 3,600 | 0 |

Average submission cost falls about 31% across the two controls and candidates.
All four runs finish 3,600 simulation steps in about 60 seconds with identical
sampled final gameplay state and combat-window results. All 196 tests and the
142-frame rendered GPU input check pass. This improves the selected 720p fixture;
it does not establish distinct displayed FPS, input-to-photon latency or complete
competitive acceptance. [Snapshot-copy evidence](benchmarks/browser-2026-09-16-native-port-snapshot-copy.json).

Ice Climbers integration checkpoint before the snapshot-copy optimization:

Ice Climbers now load both original player-owned fighters and their move assets.
The full rendered controller suite passes 4,267 frames across walking/jumping,
ground/air Ice Shot, Blizzard, linked Squall Hammer and Belay. Popo retains four
stocks throughout. Both Belay phases create forty original rope links and retire
them normally. A focused grounded Belay run GPU-verifies all 953 rendered frames;
an extended-rope screenshot was visually reviewed. The full four-fighter
per-vertex suite exceeded its 600-second verification limit, so it is explicitly
recorded as incomplete, not as a successful or timed run.

This exposed two shared portability bugs. MotionState's numeric word was being
read through a PowerPC byte layout on little-endian WASM, corrupting move IDs and
Nana's input-copy flag. The corrected native bit positions preserve the original
table initializers and descriptor size. Negative partner stick samples also
need a signed-integer intermediate before narrowing to a byte. The development
executable confirms fctiwz followed by stb. Nana now retains -64 for negative
half-stick and uses the original delayed input/AI path. Earlier fixture results
predate these corrections and do not certify the current build.

All 25 integrated character selections pass 3,550 live state-word/input checks,
covering 26 components including Nana. The browser passes 70,912 field reads,
869 writes and 10,752 byte/halfword checks; all 194 unit tests pass. Peach's Toad
counter still deals six to Mario, and Sheik's transformation preserves six actual
damage through its ground/air round trips. Core hash: `0c9be41d…`.

Two separate 960×720 Ice Climbers mirror samples each simulate 3,600 frames:

- Battlefield: 3,600 draw submissions in 60.040 seconds, no catch-up callbacks;
  mean simulation/submission 0.630/6.518 ms, submission p95 9.9 ms, max 23.6 ms.
- Fountain: 3,595 draw submissions in 60.030 seconds, five catch-up callbacks;
  mean simulation/submission 0.778/8.837 ms, submission p95 14.2 ms, max 25.2 ms.
  This uses the existing star/reflection/background cosmetic profile. Original
  moving platforms and camera remain active. The unreduced graphics path still
  stops at unsupported star point geometry before timing begins.

The Fountain misses do not coincide with recorded shader compilations. Rendering
submission, including its long-frame spikes, is the next profiling target; the
original game simulation is comfortably below the per-frame budget in these
samples. A separate instrumented 15-second profile attributes about 7.4% of
active sampled CPU time to garbage collection, with state-array copying also
prominent. Removing temporary state-copy allocations is the next experiment.
These are submission/simulation measurements, not distinct displayed
FPS or input-to-photon latency. Intro/preparation time is excluded.

Kirby's constructor and base move integration is recorded above;
copy abilities and opponent capture remain pending. Other costumes, full
scenes/menus/audio, retail parity, networking and native-port deployment also
remain. The overall 720p60 competitive acceptance criterion is
**not achieved**. [Ice Climbers evidence](benchmarks/browser-2026-09-16-native-port-climbers.json).

Previous Peach checkpoint (before the shared motion-word correction):

Peach now has original constructor/input integration, five typed move Articles,
and her one-model effect bank. The common item residency boundary now loads
Bob-omb, Mr. Saturn and Beam Sword for her original rare-pull logic. All three
share one resident archive. Selection probabilities, RNG, gameplay callbacks,
camera and competitive parameters are unchanged.

The rendered move suite passes 4,399 frames: float release and expiration,
all five float aerials, all three forward-smash weapons, ground/air Toad and
parasol, and turnip pulling/throwing. Mixed Mario contacts verify turnip damage,
shield blocking, Peach Bomber damage and Toad's counter. Toad keeps Peach at
zero damage and deals six to Mario; Bomber deals eighteen. The idle control
stays at zero. A long-held shield initially allowed the turnip to poke the
shrinking shield; the fresh-shield control is timed shortly before impact,
without changing shield behavior or parameters.

A separate single-fighter soak performs 1,096 natural pulls over 155,869
simulation frames, observing six Bob-ombs, four Mr. Saturns and one Beam Sword.
The test swings the sword and throws every item through original inputs, then
checks retirement. Its 1,050 rendered frames cover basic input and rare-item
phases only; it is not a performance sample or an eight-minute match. GPU
vertex validation passes those rendered frames, including the sword trail.
The subsequent single-archive run reproduces the same pulls and selected
fighter states, with all three rare models drawing. Screenshots were reviewed.

A separate 960×720 Peach/Mario Battlefield minute completes 3,600 simulation
steps and 3,600 draw submissions in 60.030 seconds, with no catch-up callbacks.
Simulation averages 0.505 ms; draw submission averages 7.519 ms, with p95
11.9 ms and maximum 15.9 ms. One rAF gap exceeds 25 ms. This is one active
close-combat fixture, not sustained special-move stress, distinct displayed-FPS
proof or input-to-photon latency. All 191 unit tests, the fighter build, browser initialization and the Sheik
mirror regression pass. The core hash is `d704ae94…`.

There are now 24 components with constructor/input integration. Kirby, Popo
and Nana remain, along with other costumes, full scenes/menus/audio, retail
parity, networking and native-port deployment. The overall 720p60 competitive
acceptance criterion is **not achieved**.
[Peach evidence](benchmarks/browser-2026-09-16-native-port-peach.json).

Previous Sheik/Zelda checkpoint:

Sheik and Zelda now have original constructor/input integration, including both
player-owned forms. They share the Zelda effect bank (seven models, ten particle
commands, five texture groups). Four Sheik Articles and two Zelda Articles are
typed; the renderer follows the original twenty-link chain.

Sheik's chain test initially reached an out-of-bounds pose pointer. The x48 table
contains two reference skeletons after its four Articles; the complete importer
had omitted them. Both 58-joint graphs are now relocated and converted, with a
synthetic regression test. No original gameplay function or parameter changed.

Six selected move phases per character now pass (2,170 Sheik and 1,972 Zelda
rendered frames). Needle and Din's Fire contacts deal eighteen and nine damage;
shielded controls take zero, with nineteen and six blocked frames respectively.
Idle controls take zero. Nayru's Love reflects a Mario fireball back for nine
damage. The isolated chain sequence GPU-verifies all 423 rendered frames.

The original transformation callback owns the form swap. Browser state reads
follow the original active entity, and both forms remain registered with the
renderer. A Mario fireball supplies six actual damage before ground and airborne
round trips; damage and four stocks survive all four swaps. Controller movement
and a double jump place the air test outside the side platforms. No state,
position, damage or charge values are assigned by the harness.

Both starting forms pass the damaged transformation sequence: 1,856 rendered
frames starting as Sheik and 1,921 starting as Zelda. The latter also verifies
that inactive fighter bodies do not draw. A separate keyboard-event browser
run completes two swaps over 900 simulation frames; its timing is excluded
because a build overlapped it.

A separate 960×720 Sheik/Zelda Battlefield minute completes 3,600 simulation
steps and 3,600 draw submissions in 60.026 seconds, with no catch-up callbacks.
Mean simulation time is 0.486 ms and mean draw-submission time 7.425 ms; draw
p95 is 10.0 ms and maximum 17.9 ms. This is one close-combat sample, not sustained
special-move stress, distinct displayed-FPS proof or input-to-photon latency.
All 187 tests and the fighter build pass; the Ness mirror regression remains
valid. Core hash is `e375274d…`.

There are now 23 components with constructor/input integration. Kirby, Peach,
Popo and Nana remain, along with other costumes, full scenes/menus/audio,
retail parity, networking and native-port deployment. The overall 720p60
competitive acceptance criterion is **not achieved**.
[Sheik/Zelda evidence](benchmarks/browser-2026-09-16-native-port-sheik-zelda.json).

Previous mixed-fighter checkpoint:

The match fixture now supports different fighters through `--opponent=CODE`.
Each selected fighter has its own base, animation and costume package. Shared
effect archives load once, while both fighters' items and cross-fighter
accessories are available to the renderer. The C core and original gameplay
functions are unchanged.

Ness/Mario and Game & Watch/Mario absorption checks use normal controller
movement and inputs. Ness takes six damage from an unblocked fireball, then
heals to zero through PSI Magnet; the unblocked control ends at eighteen.
Game & Watch catches three fireballs without damage, releases Oil Panic for
32 damage to Mario, then opens an empty bucket. Its control ends at eighteen.
The full-scene sequences render 903 and 1,427 frames respectively. No damage,
charge or position values are assigned by the harness.

Mixed constructor/input rendering also passes for Fox/Falco, Link/Young Link
and Captain Falcon/Samus. This covers shared effect banks, distinct Link
skeletons, and a P2-only item-runtime requirement. Yoshi's Egg Lay against
Captain Falcon passes all 882 rendered frames' vertex checks; the shell remains
attached for 199 frames before native escape. The Ness mirror regression and
all 185 tests pass, as does the fighter build. Core hash remains `5ecac750…`.

Two 960×720 Ness/Mario Battlefield samples each simulate 3,600 frames in about
60 seconds. They submit 3,600/3,597 draws with zero/three catch-up callbacks.
Simulation averages 0.440/0.441 ms; draw submission averages 6.260/6.773 ms.
Preparing 41 shaders with the driver cache disabled eliminates five live
compilations, but the repeat is slower and peaks at 22.3 ms. Selected gameplay
traces match. This is not evidence of a speedup, perfect cadence, distinct
displayed FPS or input-to-photon latency. It samples close combat rather than
sustained special-move stress.

The roster remains at 21 components with constructor/input integration; six components,
other costumes, full scenes/menus/audio, retail parity, networking and native-port
deployment remain unfinished. The overall 720p60 competitive acceptance criterion
is **not achieved**.
[Mixed-fighter evidence](benchmarks/browser-2026-09-16-native-port-mixed-fighters.json).

Previous Ness checkpoint:

Ness now passes the original default-costume constructor and basic input,
twelve selected move phases and six rendered contact checks. Eleven move Articles,
three effect models, yo-yo attachment geometry and material animation are
imported. The renderer follows the original twenty-link yo-yo chain, retaining
its physics, collision, ownership and lifecycle callbacks.

The move sequence renders 3,580 frames, including charged up/down yo-yo smashes,
PK Fire, charged PK Flash, ground/air PK Thunder, PSI Magnet and a controller-
steered PK Thunder self-hit that launches the recovery state. That self-hit found
a real startup omission: a motion script allocated a timed sound object before
its pool was initialized. Startup now calls the original `lbAudioAx_8002835C`
initializer before fighter startup. No gameplay function body or parameter was
changed. Audible browser audio remains unfinished.

The selected PK Fire/pillar contact deals seventeen damage, while a shield blocks
the projectile with zero body damage. Bat, yo-yo and forward throw deal eighteen,
eight and eleven respectively. The idle control remains at zero, and all contact
items and string links retire. Projectile spacing was corrected using controller
movement after the first shot spawned past a defender standing too close.
PSI Magnet absorption/healing and bat reflection still require validation.

An isolated yo-yo contact GPU-verifies all 882 rendered frames, including the
original twenty-link string. Two 960×720 two-Ness Battlefield samples each
simulate 3,600 frames in about 60 seconds. They submit 3,596/3,599 draws, with
four/one catch-up callbacks. Simulation means are 0.469/0.490 ms and draw-submission
means 7.573/7.284 ms. Preparing 42 shaders with the driver cache disabled removes
five live compilations; selected gameplay traces match. Prepared draw p95 is
9.9 ms versus 12.1 ms, but its maximum is 33.8 ms. These two samples do not prove
a repeatable speedup, perfect cadence, distinct displayed FPS or input-to-photon
latency. The workload is close combat, not sustained special-move stress.

All 185 tests and the fighter build pass. The shared initialization regression
passes for 27 components, 135 instances, 3,240 dynamic-bone frames and 154 item-model
instances. Core hash: `5ecac750…`. Twenty-one components now have constructor/input
integration. Six components, other costumes, complete scenes/menus/audio, retail
parity, networking and native-port deployment remain unfinished. The overall
720p60 competitive acceptance criterion is **not achieved**.
[Ness evidence](benchmarks/browser-2026-09-16-native-port-ness.json).

Previous Game & Watch checkpoint:

Mr. Game & Watch now passes the original default-costume constructor and basic
input checks, fourteen selected move phases and five rendered contact checks.
The port imports all ten move Articles, typed item outline lists and the eleven
fighter outline visibility groups. Two external animation links are initialized
to null at the original archive-loader boundary. The fighter has no dedicated
effect archive; it uses the common bank, matching the original selector.

The move sequence renders 3,286 frames, including item-based normals and ground
and air specials. Repeated Chef projectiles deal 21 damage in the selected
contact sequence. The sampled Judge result and forward throw each deal eight;
shielded jabs produce twelve blocked frames and zero body damage. The idle
control remains at zero. An isolated Judge contact GPU-verifies all 882 rendered
frames. Empty Oil Panic is correctly represented by fighter parts; absorption,
full-bucket release and every Judge outcome remain unverified. Original gameplay
function bodies and parameters were not changed to satisfy these checks.

Two 960×720 two-Game & Watch Battlefield samples each simulate 3,600 frames in
about 60 seconds. The first submits 3,600 draws with no catch-up callbacks;
the prepared-shader repeat submits 3,598 draws with two catch-up callbacks.
Simulation means are 0.569/0.611 ms and draw-submission means 7.984/8.072 ms.
Preparing 25 shaders with the driver cache disabled removes five live
compilations, and selected gameplay traces match. Prepared draw p95 is 12.5 ms
and maximum 26.9 ms. This repeat does not demonstrate a speedup or a perfect
frame cadence. Neither sample measures distinct displayed FPS or input-to-photon
latency. Attack diagnostics now recognize Game & Watch's character-specific
normal states without treating its landing states or other fighters' specials
as normal attacks.

All 182 tests and the fighter build pass. The C core remains `b4ee4a0c…`.
Twenty fighter components now have constructor/input integration. Seven
components, other costumes, complete scenes/menus/audio, retail parity,
networking and native-port deployment remain unfinished. The overall 720p60
competitive acceptance criterion is **not achieved**.
[Game & Watch evidence](benchmarks/browser-2026-09-16-native-port-gamewatch.json).

Previous Mewtwo checkpoint:

Mewtwo now passes default-costume constructor/input, nine selected move phases
and seven rendered contact checks. Its Disable and Shadow Ball Articles, ten
serialized Shadow Ball states and four effect models are imported. The move
sequence renders 2,438 frames, including charging/cancellation, ground and air
release, Disable, Confusion misses and both Teleport paths. An isolated Shadow
Ball contact also GPU-verifies all 969 rendered frames.

A full Shadow Ball deals 25 damage. A fresh shield blocks it with eleven hitlag
frames and zero body damage; a shield held through charging breaks and enters
its original stun sequence. Disable deals one damage, enters DamageBind and
recovers. Confusion enters ThrownMewtwo and deals ten damage; the forward throw
also deals ten. The no-input control remains at zero. The tests initially expected
the wrong state names for Disable/Confusion and held shield too early; assertions
and controller timing were corrected against the original callbacks. Gameplay
function bodies, charge rates, shield drain and damage were not changed.

Two 960×720 two-Mewtwo Battlefield samples each submit 3,600 draws in about
60 seconds, with no catch-up simulation callbacks. Simulation means are
0.490/0.477 ms and draw-submission means are 6.795/7.001 ms. Preparing 39 shaders
with the driver cache disabled removes seven live compilations, and selected
gameplay traces match. Prepared draw p95 is 10.6 ms, with a 16.9 ms maximum.
This does not establish an average speedup or prove distinct displayed FPS and
input-to-photon latency; the timing workload is close combat, not special-move
stress.

All 179 tests and the fighter build pass. The C core remains `b4ee4a0c…`; this
integration adds typed assets, renderer registration and validation. Nineteen
fighter components now have constructor/input integration. Eight components,
other costumes, complete scenes/menus/audio, retail parity, networking and
native-port deployment remain unfinished. The overall 720p60 competitive
acceptance criterion is **not achieved**.
[Mewtwo evidence](benchmarks/browser-2026-09-16-native-port-mewtwo.json).

Previous Yoshi checkpoint:

Yoshi now passes the original constructor, default-costume rendering, selected
controller moves and five contact checks. The port imports the thrown egg,
landing stars, Egg Lay item, captured-fighter shell and Yoshi effect bank.
The move sequence renders 2,022 frames and includes a charged, aimed egg throw.
Rendered contacts cover Egg Lay capture/escape (seven damage), thrown egg
(twelve damage), tongue grab/forward throw (six damage), egg shield (blocked
hits with zero body damage), and a zero-damage control. An isolated captured-egg
GPU check verifies all 882 rendered frames, including 199 shell frames.

The charged throw exposed a concrete porting bug. The decompilation's loader
attribute view labels ten active Egg Throw floats as byte padding. Our typed
import therefore left them in GameCube byte order; the spin multiplier became
about 2.7e23 and the original angle-normalization loop stalled. The portable
header now exposes those floats at the same offsets as the alternate view,
with compiler assertions for widths and offsets. Launch angle, speed, offsets
and spin are converted correctly. No gameplay callback or parameter was tuned
to bypass the failure. Charged travel and close-hit tests now pass.

Three 960×720 two-Yoshi Battlefield samples each submit 3,600 draws in about
60 seconds with no catch-up simulation callbacks. Simulation means are
0.538/0.525/0.536 ms; draw-submission means are 7.198/6.710/7.250 ms. The last two
runs prepare 35 shaders with the driver cache disabled and compile zero shaders
during play, versus seven in the first run. Their selected gameplay traces match.
Preparation removes compilation stalls but does not establish a repeatable average
speedup: prepared draw p95 is 10.3/11.3 ms and maximum is 21.1/29.5 ms. These are
close-combat engine/submission measurements, not distinct displayed FPS or
input-to-photon latency.

All 178 tests and the fighter build pass. The shared initialization regression
covers 27 components, 135 instances, 3,240 dynamic-bone frames and 154 item-model
instances. These are integration checks, not retail parity proof. Core hash:
`b4ee4a0c…`. Eighteen fighter components have constructor/input integration;
nine components, other costumes, complete scenes/menus/audio, retail parity,
networking and native-port deployment remain unfinished. The overall 720p60
competitive acceptance criterion is **not achieved**.
[Yoshi evidence](benchmarks/browser-2026-09-16-native-port-yoshi.json).

Previous Link-family checkpoint:

Link and Young Link now pass default-costume constructor, controller, selected
move/contact and full-scene rendering checks. The port imports their original
bomb, boomerang, hookshot, arrow and bow Articles, plus Young Link's milk. Their
extra fighter part is bound by descriptor identity; hookshot links and separate
arrow/boomerang joint roots retain the original callbacks and ownership. A
portable-source correction replaces two arrow-wobble reads that relied on
unrelated globals being adjacent in the retail executable. All 16 float values
and the original 92-byte offset were verified against the development disc;
indices, random calls and arithmetic are preserved.

The move sequences render 2,609 Link frames and 2,910 Young Link frames, including
ground/air arrows, boomerangs, hookshots, Spin Attack, bombs and the milk taunt.
Twelve rendered contact checks pass. Charged arrows deal 18/15 damage, hookshot
forward throws deal six, and boomerangs/bombs produce damage and knockback.
Facing an idle defender toward an arrow activates the original physical shield:
zero damage with hitlag. No-input controls remain at zero. These are selected
integration checks, not retail parity proof. The exhaustive full-scene Link
GPU-vertex diagnostic timed out at 1,200 seconds during the final bomb phase;
it is not counted as a completed pass. Normal rendered sequences and the Samus
grapple/Bowser renderer regressions pass. All 176 tests and the fighter build pass.

Four two-fighter Battlefield timing samples each submit all 3,600 draws in about
60 seconds at 960×720, with no catch-up callbacks. Initial simulation/draw means
are 0.527/8.157 ms for Link and 0.549/7.452 ms for Young Link. Preparing 58 programs
with the driver cache disabled eliminates live compilation and preserves the
recorded gameplay traces. Prepared simulation/draw means are 0.555/7.801 ms and
0.564/7.422 ms; draw p95 is 10.8/11.6 ms and maximum 19.0/17.3 ms. Those remaining
long submissions mean shader preparation does not guarantee a frame deadline.
This close-combat workload is not projectile stress, distinct displayed-FPS
measurement or input-to-photon measurement.

Core hash: `06b477b2…`. Seventeen fighter components now have constructor/input
integration; ten components, other costumes, complete scenes/menus/audio, retail
parity, networking and native-port deployment remain unfinished. The overall
720p60 competitive acceptance criterion is **not achieved**.
[Link-family evidence](benchmarks/browser-2026-09-16-native-port-link-family.json).

Previous Bowser checkpoint:

Bowser is now integrated through the original constructor, controller inputs,
Flame Breath Article, effect bank and full scene rendering. This exposed a shared
porting bug: Melee's pinned MSL header defines `bool` as a signed 32-bit integer,
but the browser build had selected C99 `_Bool`. Bowser's minimum breath timer is
declared `bool` and must count to 40; it instead saturated at 1 and never allowed
the move to end. The port now selects the original header, asserts its semantics
at compile time, and preserves integer values through callback adapters. Original
gameplay function bodies were not changed. The same 120-held/100-released input
sequence now reaches the ending animation and Wait instead of remaining in the
breath loop.

The full-scene move check renders and GPU-verifies 1,453 frames, including ground
and air Flame Breath, Whirling Fortress, Bowser Bomb and Koopa Klaw misses. Fire
particles, native camera and HUD were visually checked. Separate rendered contact
tests deal 18 damage with sustained fire and 15 with a Klaw throw; the no-button
control deals zero. The shield test records 15 initial blocked-hit frames with no
body damage, then four body damage as the shield shrinks. Its original assertion
of permanent coverage was incorrect; no shielding mechanics were changed to make
the test pass. These remain selected integration checks, not retail parity proof.

After the shared type correction, all 14 previously integrated characters pass
rendered input checks; seven longer special-move suites also pass. Shared startup
checks cover all 27 components, and all 5,508 animation clips and 173 unit tests
pass. Yoshi's Story passes 4,500 stage frames with Randall preserved. Fountain
passes 9,000 frames with both moving platforms and matching collision geometry
using the existing cosmetic-reduction profile. Its full decorative point-geometry
and reflection path remains unsupported.

Two Bowser fighters submit all 3,600 draws in about 60 seconds at 960×720 in both
timing runs, with no catch-up callbacks. Initial mean simulation/draw-submission
costs are 0.583/6.456 ms; two long submissions (27.0/25.6 ms) coincide with shader
compilation. Preparing 51 programs before play, with the driver cache disabled,
produces no live compilations and matching gameplay traces. That repeat averages
0.544/6.247 ms, with draw p95 8.5 ms and maximum 14.4 ms. This is close-combat
CPU/draw-submission evidence, not a sustained-fire stress test, distinct displayed
FPS measurement or input-to-photon measurement.

Core hash: `a55d2d4e…`. Remaining roster/costumes, complete scenes/menus/audio,
retail parity, networking and deployment are unfinished. The overall 720p60
competitive acceptance criterion is **not achieved**.
[Bowser and integer-bool evidence](benchmarks/browser-2026-09-16-native-port-koopa-intbool.json).

Previous Samus checkpoint:

Samus now passes default-costume constructor, input, selected special-move and
contact integration checks. The port imports all four original Articles, her
effect bank, separately scheduled grapple links and the throw accessory. HSD
instance joints preserve shared references and original draw transforms; they do
not become duplicate owned joints or animation slots. Unknown references and
cyclic display graphs still fail. Original gameplay C is unchanged; the core now
includes adapters for joint ownership and linked-item enumeration.

The move probe renders and GPU-verifies 1,857 frames: partial charge shot, homing
and Super Missile, Bomb, Screw Attack, ground grapple and aerial grapple. The
original chains contain 30/45 links in those grapple sequences, and all 81 item
model resources retire by the end. A separate 674-frame rendered/vertex-verified
contact run reaches a 9-damage forward throw, with its shared-joint accessory
active for 46 frames. Super Missile/partial charge contacts deal 12/11 damage;
the no-input control remains at zero. Pikachu's linked Jolt contact regression
still passes. These are selected integration checks, not complete moveset or
retail trace parity.

Two Samus fighters complete 3,600 simulation steps at 960×720 in about 60 seconds.
The initial run submits 3,599 draws with one catch-up; its mean simulation/draw
submission costs are 0.590/6.933 ms and maximum draw cost is 20.4 ms. A repeat with
38 prepared programs and the driver shader cache disabled submits all 3,600 draws
with no catch-up callbacks or live compilations. Mean simulation/draw costs are
0.572/6.892 ms; draw p95 is 8.6 ms and maximum 15.0 ms. Gameplay traces match.
The initial long submissions did not coincide with shader compilation, so this
repeat does not establish why those spikes disappeared. This is a close-combat
workload, not a projectile/grapple stress test or distinct presentation-FPS proof.

All 172 tests and the fighter build pass. Core hash: `f1d9995f…`. Full roster and
costumes, complete scenes/menus/audio, retail parity, networking, deployment and
physical input-to-photon measurements remain incomplete. The overall 720p60
competitive acceptance criterion is **not achieved**.
[Samus evidence](benchmarks/browser-2026-09-16-native-port-samus.json).

Previous Pikachu/Pichu checkpoint:

Pikachu and Pichu now pass default-costume constructor, input and rendered special
integration checks. Their original linked Jolt/Thunder Articles and shared effect
bank are loaded. The renderer now accepts native no-model controller items while
keeping their simulation/render ownership and drawing the separate visible child.
Pikachu's empty shape-animation topology is retained; actual morph tracks still
fail explicitly. No original gameplay C or core WASM changes were needed.

Each move probe renders 1,760 frames with per-frame GPU vertex checks, exercising
ground/air Jolt, Thunder's bolt-to-owner contact, two directed Quick Attack/Agility
dashes, and Skull Bash charge/release. Pichu retains self-damage: 1 per Jolt, 3 for
Thunder, 4 across Agility and 1 for Skull Bash in this sequence. Jolt contact,
no-fire control and shield checks pass for both; Falco reflection still passes.
These are selected integration checks, not complete move/matchup or retail parity.

All four two-fighter Battlefield timing samples submit 3,600 draws in about
60 seconds with no catch-up callbacks. Prepared cold-driver-cache Pikachu/Pichu
runs have matching gameplay traces and no live compilation, using a 27-program
catalog. Their mean simulation costs are 0.551/0.556 ms and mean draw submission
costs 5.479/4.843 ms; p95 draw costs are 7.0/6.5 ms. Maxima are **20.8/17.4 ms**,
so shader preparation does not eliminate every long submission. These measurements
do not establish distinct displayed FPS or input-to-photon latency. All 167 tests
and the fighter build pass. Full roster/costume coverage, scenes/audio, retail
parity, networking and deployment remain incomplete.
[Pikachu/Pichu evidence](benchmarks/browser-2026-09-16-native-port-pikachu-pichu.json).

Previous Mario-family checkpoint:

Mario, Luigi and Dr. Mario now pass default-costume constructor, controller input
and rendered special-move integration checks. The shared Article importer handles
original joint/material animation data for fireballs, pills and capes. The probes
cover ground/air capes, Cyclone, up special, and Luigi's Green Missile charge/release.
Fireball/pill tests cover spawn, travel, retirement, hits, no-fire controls and
shielding. Mario/Luigi hits deal 6 damage; Dr. Mario's pill deals 8. Cape reflection
transfers projectile ownership and protects the defender in both Mario variants.
These are selected integration checks, not complete character or retail parity.

Each two-fighter Battlefield workload submits all 3,600 draws in about 60 seconds
at 960×720, with contact in every ten-second window. Mean simulation costs are
0.53–0.57 ms and mean draw submission costs 5.94–6.22 ms in the initial samples.
With all 40 catalog programs prepared and driver caching disabled, the repeated
Mario/Dr. Mario samples have no live compilations or catch-up callbacks. Their
mean draw costs are 6.067/6.102 ms, p95 7.7/8.2 ms and maxima 15.4/14.6 ms. Recorded
gameplay traces match their respective initial runs. This is draw-submission
and CPU evidence; distinct displayed FPS and physical input latency remain unmeasured.

All 166 targeted tests and the reproducible fighter build pass. The core hash
remains `ec053ec9…`; no gameplay C changes were needed. Falco reflection and Story's
4,500-frame Randall/collision/Shy Guy regression pass. Full roster/costume coverage,
complete scenes/audio, retail parity, networking and deployment remain unfinished.
[Mario-family evidence](benchmarks/browser-2026-09-16-native-port-mario-family.json).

Previous Jigglypuff checkpoint:

Jigglypuff now completes the original native constructor and input/render path.
Its extra costume-attachment table is imported with the correct visibility type;
the original effect bank and animated Sing model are loaded. Controller-only
checks exercise all five aerial jumps, Rest, Sing, grounded/aerial Pound, and
Rollout charge/release. In two-fighter contact probes, Rest reaches 28 damage,
3 hitlag frames and 187.8 knockback; Sing enters the original sleep states with
no damage. The no-button control has no hit. These are integration checks,
not a frame-by-frame retail comparison or complete character certification.

The two-Jigglypuff Battlefield workload submits all 3,600 draws in about 60 seconds
in both samples, with no catch-up callbacks. The prepared cold-driver-cache run
uses 26 programs with no live compilation: mean simulation 0.486 ms, mean draw
submission 4.715 ms, p95 6.4 ms, maximum 27.9 ms. Recorded gameplay traces match;
both runs retain contact in every ten-second window and two stock losses. These
measure draw submissions, not distinct display presentations or physical latency.
Default-costume coverage is tested; the four separate hat costumes and additional
move/matchup parity remain incomplete, along with other roster and scene systems.
[Purin evidence](benchmarks/browser-2026-09-16-native-port-purin.json).

Build inputs are now sorted before assembling native link archives. Two consecutive
builds produce the same core hash on the recorded toolchain, fixing a source-order
variation that had invalidated shader catalogs across otherwise identical builds.

Previous frozen Stadium checkpoint:

Frozen Pokémon Stadium now runs in the native fixture, with the original main
floor, platforms, collision and camera setup. Its approved frozen profile keeps
the base terrain and a static background screen. The transformation scheduler and
live jumbotron text/capture path are explicitly excluded; unfrozen-retail RNG
parity is not claimed. All 9,000 terrain/collision checks pass without drift.

A repeated A/B/A/B experiment identifies background fireworks drawing as a useful
cost to remove. Controls average 7.66/7.63 ms per draw submission and miss 3/7
submissions. With only Stadium's particle-bank drawing excluded, costs fall to
6.64/6.68 ms (12.9% lower), and both runs submit all 3,600 draws in about 60 seconds
with no catch-up callbacks. Candidate p95 values are 8.7/9.7 ms versus 12.2 ms for
both controls. Maxima remain 18.0/18.8 ms. All runs use the same core, all 41 shaders
prepared, no driver cache and no live shader compilation. Preparing shaders alone
had failed to eliminate the stalls.

Particle simulation and random-number calls continue unchanged. All four recorded
combat traces match, as do final fighter states, contact windows and stock losses
against unpaced simulation. The 9,000-step rendered candidate has identical
camera values, collision checks and peak simulated particle count (392) to its
control. Common and fighter effects remain enabled. These remain selected
720p fixture draw-submission measurements, not independently measured display
presentations or physical input latency; full roster, menus, audio, network and
competitive parity are still incomplete.
[Stadium evidence](benchmarks/browser-2026-09-16-native-port-stadium.json).

Previous Yoshi's Story checkpoint:

Yoshi's Story now runs its original stage callbacks, Randall spline movement and
Shy Guy spawning in the native fixture. A missing original stage initializer
caused Randall's collision to remain stationary; restoring that initializer fixes
it. All 9,000 collision/model checks now pass (maximum error under 0.000004 game
units). The rendered cycle shows Randall beside the stage, with original geometry,
platforms, HUD and camera behavior retained. Shy Guys are created and retired by
the original item code. All 159 unit tests pass; Fountain's moving-platform
statistics and Battlefield's combat trace remain unchanged.

The two-Captain live workload submits all 3,600 draws in 60.03 seconds both before
and after shader preparation. The prepared run disables the driver shader cache,
uses all 40 prepared programs without live compilation, and has no catch-up
callbacks. Mean simulation cost is 0.62 ms; mean draw submission is 8.40 ms,
p95 11.4 ms, maximum 19.2 ms. Recorded gameplay traces match. No stage graphics
were removed. These are 720p simulation/draw-submission measurements, not distinct
presented FPS or end-to-end latency. Randall landing/ride parity, Shy Guy combat
interactions and full roster/scene/audio coverage remain unverified.
[Yoshi's Story evidence](benchmarks/browser-2026-09-16-native-port-story.json).

Fountain now has an explicitly simplified rendered fixture. It omits the star
draws, samples a defined black water-reflection texture, and optionally removes
75 background draws. The main floor, fixed top platform and both moving
platforms remain visible. Original stage processes and particle scripts keep
running. The 9,000-step platform and collision statistics match the simulation
control; the camera snapshot is unchanged and sampled GPU vertex checks pass.
All 155 unit tests pass. Battlefield's combat trace and final image are
unchanged from the preceding checkpoint, with GPU and lifecycle checks passing.

An A/B/A/B test of background removal measures mean draw-submission costs of
10.38 → 8.47 → 10.63 → 8.51 ms, about a 19% reduction. Candidate p95 values are
10.9/11.2 ms versus 13.6/14.3 ms for controls. Both candidates submit all 3,600
draws in approximately 60 seconds, without catch-up callbacks or live shader
compilation; controls submit 3,596/3,591 draws. All four recorded gameplay traces
match, and final state/contact/stock checks also match the no-cosmetics fast
simulation. Candidate maxima are still 19.6/22.0 ms. These measurements cover
the selected two-Captain workload on this host, not distinct displayed FPS,
latency, all matchups, or the complete original reflection renderer.
[Fountain cosmetic evidence](benchmarks/browser-2026-09-16-native-port-fountain-cosmetics.json).

Previous Fountain simulation checkpoint:

Fountain of Dreams now has a simulation fixture with the original two moving
platforms. Across 9,000 steps, both rise, fall, disappear and return. Each passes
9,000 checks against its collision joint transform; maximum error is below
0.000001 game units. Seven stage owners are preserved, including two separate
platforms and the extra star model. Typed import covers the map, spline, light,
platform parameters and empty shape-animation topology. All 155 unit tests pass.
A 3,600-step combat workload also passes with contact in every ten-second window
and two stock losses. Battlefield's gameplay trace and rendered image are
unchanged from the stage-particle checkpoint, with GPU verification passing.

Fountain rendering is still incomplete: its 24,630 point vertices trigger the
renderer’s explicit unsupported-primitive guard, and its reflection camera and
mutable texture capture are pending. This is not a fourth 720p60 result. The
platform movement was preserved without freezing or gameplay substitutions.
[Fountain simulation evidence](benchmarks/browser-2026-09-16-native-port-fountain-simulation.json).

Previous stage-particle checkpoint:

The three live stage fixtures now load their original stage particle banks.
The missing bank allowed stage callbacks to request effects without spawning
them. Typed conversion and original HSD registration restore the scripts,
textures, simulation and drawing before stage callbacks begin. Readback checks
verify the relocated descriptors and unchanged packed script bytes.

Long checks pass with peak active stage-particle counts of 160 on Battlefield,
65 on Final Destination and 18 on Dream Land. The latter still passes both wind
directions and 461 displacement checks. All 153 unit tests pass. Fountain of
Dreams' particle bank also converts, but its live stage remains pending.

Older stage samples without this bank omit work and may consume random values
differently. They are historical measurements, not equivalent controls for the
current fixture. The new cold-driver-cache combat samples each complete 3,600 simulation steps
and draw submissions in approximately 60 seconds, without catch-up callbacks or
live shader compilation. Mean draw submissions are 6.92 ms on Battlefield,
6.10 ms on Final Destination and 5.79 ms on Dream Land. Final Destination's
incomplete-catalog control had a 52.2 ms maximum and three fewer submissions;
the prepared repeat peaks at 12.8 ms with identical recorded gameplay. These
remain selected fixture measurements, not distinct displayed FPS or latency.
[Stage-particle evidence](benchmarks/browser-2026-09-16-native-port-stage-particles.json).

Previous Dream Land checkpoint (without the stage particle bank):

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
