# Browser 720p60 status

Acceptance scope updated September 13: the user accepts Fountain of Dreams
with Ice Climbers as a documented performance exception if other stages and
character combinations work. Preserve the 720p60 measurement gate; report
individual passing/failing workloads and broaden stage/roster coverage before
claiming general success. The exception does not remove any stage or character
from play, or relax native gameplay, no-ISO startup, or camera requirements.

**The browser 720p60 goal is not achieved across the required coverage.**

September 14 camera/depth correction: an isolated native Dolphin reference and
the browser Dream Land 64 Ice Climbers mirror both reported camera interest
`[-22.703764,23.204119,0]`, position `[-14.457623,42.405716,125.036156]`,
FOV 30, and zero pitch/yaw offsets at early idle match frames. The original
static package copied an uncorrected WebGL loader: its reversed depth placed the
Dream Land tree over P1 and hid the foreground water. Applying the pinned
fail-closed depth bridge to the shipped loader restores both fighters, platform,
tree face, flowers, and foreground water in the visually matched native scene.
The corrected loader has a versioned URL so previously cached raw loaders
cannot mask the repair. Prior high FPS measurements of the raw package do not
validate normal gameplay visuals; corrected-package timing and broader stage
and roster coverage are required before certification. The hosted no-ISO flow
and original camera/projection values remain unchanged.
The first corrected static 30-second Dream Land IC/IC leg measured 52.998
simulation and 52.031 distinct visible FPS at 960×720 with normal scenery and
model detail. A separate cold leg with several CPU and cosmetic flags reached
48.069/47.568 FPS; it was not a same-checkpoint A/B test, so do not attribute
that difference to any one flag. The full older tuned query timed out before
gameplay. [Depth release validation](benchmarks/browser-2026-09-14-depth-release-validation.json).
The corrected same-checkpoint high/low/low/high fighter-model control then
measured 52.54/55.94/55.24/53.47 distinct visible FPS on Dream Land IC/IC.
Both pairs favor the game's own low-detail mesh tables; the mean visible gain
is 2.59 FPS, with 107 shared native-input fingerprints and intact 960×720
images. Mean queue age rose 2.28 ms, and the fastest leg still missed 60.
Low detail remains opt-in pending representative roster/costume visuals.
[Fighter model control](benchmarks/browser-2026-09-14-dreamland-fighter-model-abba.json).
The corrected low-detail Dream Land main-presentation control compared direct
bitmap delivery with the existing two-image RAF queue at one saved gameplay
checkpoint. Distinct visible FPS were direct 52.33, RAF 53.37, RAF 55.53,
direct 55.98. Both 30-second pairs oppose one another; all 108 native-input
fingerprints matched, and none reached 60. Direct delivery removes the main
queue's measured 13.48–18.08 ms image age in RAF legs, but this is not an
end-to-end input-latency result. Keep the current RAF queue default.
[Main pacing control](benchmarks/browser-2026-09-15-depth-low-model-main-pacing-abba.json).
The higher-return GX matrix helper remains **off**: two warmed normal-running
replays on the corrected old core changed 17–19 serialized scheduler/idle bytes,
while its unchanged-codegen control passed exactly. An isolated source-matched
candidate replaced fast FIFO gather checks with Dolphin's full write/check path
and visually preserved the native Dream Land camera. Its warmed unchanged
control differed only in two bytes of unused idle accounting, but the warmed
GX leg still changed 17 CoreTiming bytes including event insertion orders.
Those saved replay configurations actually differed in GX, integer FIFO and
short-prefix flags together: the URL names were ignored at startup but applied
to the comparison. The scheduler mismatch cannot be assigned to GX. The
FIFO-wrapper hypothesis is unproved, the active experimental source was
reverted, and GX-only state replay is being repeated. No FPS claim or default
promotion follows. [Confounded GX FIFO-check replay](benchmarks/browser-2026-09-15-gx-fifo-check-replay.json).

On the corrected 960×720 Dream Land IC/IC scene with low-detail fighter tables,
holding block merge enabled while integer FIFO and short-prefix compilation
were off in all legs, the
same-checkpoint animation-fusion off/on/on/off comparison measured distinct
visible **55.54 / 56.73 / 58.20 / 56.50 FPS**. Both 30-second pairs favor the
revision-locked `HSD_FObjInterpretAnim` fusion (mean +1.45 visible FPS), with
110 matching native controller fingerprints and 33 emitted fused blocks. Each
leg retained focus and changing 720p images. The fastest leg still fails 60;
the optimization remains opt-in while wider matchup coverage is checked. Its
corrected 600-native-frame replay changed only the fusion flag and matched all
117,142,854 serialized bytes across 29 sections and controller fingerprints.
Lean dispatch was held on in both replay legs for telemetry but off in both
timing configurations. An earlier run without block merge was invalid because
the compiler emitted no eligible fusion blocks.
The `integerfifo=1` and `singleprefix=1` URL names were ignored by the startup
mask; those features require the verified numeric `disable` bits and a separate
controlled trial. The A/B fusion isolation remains intact.
[Corrected fusion comparison](benchmarks/browser-2026-09-15-depth-low-model-anim-fusion-abba.json).
[Isolated fusion replay](benchmarks/browser-2026-09-15-depth-low-model-anim-fusion-replay.json).
The corrected follow-up isolated `singleprefix` with animation fusion, block
merge, integer FIFO and low-detail models fixed. Prefix off/on/on/off distinct
visible FPS were **55.03 / 55.38 / 54.00 / 57.95**. The second paired loss is
3.95 FPS, 106 input fingerprints match, every page stayed focused, and no leg
passes 60. Keep short-prefix compilation off for this configuration rather
than crediting its first 0.35-FPS win.
[Prefix comparison](benchmarks/browser-2026-09-15-depth-low-model-prefix-abba.json).
Holding fusion, block merge, normal JIT prefix and low-detail models fixed,
integer FIFO off/on/on/off gave corrected distinct visible **55.54 / 54.17 /
56.23 / 57.77 FPS**. Both 30-second pairs lose 1.37–1.54 FPS with the FIFO
shortcut, 108 native-controller fingerprints match, and every gate fails.
Leave integer FIFO off for this measured combination.
[Integer FIFO comparison](benchmarks/browser-2026-09-15-depth-low-model-integer-fifo-abba.json).
The corrected GX-only old-core replay exercised 563,929 `FastMeleeGxMatrix`
calls in 600 native Dream Land IC/IC frames with low-detail models. The only
codegen difference was `gxmatrixfast`; FIFO and prefix flags were off in both
legs. Of 117,501,335 bytes, 25 CoreTiming bytes changed, including serialized
event insertion orders. Gameplay/input fingerprints match, but execution-state
equality fails; original GX remains disabled. The full FIFO-check source
candidate is being retested with the same GX-only isolation.
[Isolated GX replay](benchmarks/browser-2026-09-15-gx-matrix-isolated-replay.json).
The isolated rebuilt core with Dolphin's ordinary FIFO write/check path also
fails. With only GX changed and 563,826 helper calls, 19 CoreTiming, 12 RAM and
two hardware GPU FIFO bytes differ in 117,238,239 serialized bytes. The source
patch stays only as an opt-in negative reproduction; it is not in the active
vendor checkout or release default. The roughly 5% raw GX gain is unusable
until a state-exact helper can be demonstrated.
[Full-check GX-only replay](benchmarks/browser-2026-09-15-gx-fullcheck-isolated-replay.json).
The corrected low-model/fusion Dream Land display-list specialization reached
2,160,421 guarded calls (zero fallbacks), but visible off/on/on/off rates were
**56.00 / 57.50 / 56.47 / 58.67 FPS**. The candidate gains 1.50 FPS in the
first pair and loses 2.20 in the second; 111 native-input fingerprints match,
all pages remain focused, and no acceptance gate passes. Keep it opt-in rather
than extrapolating an older Yoshi's Story gain to all stages.
[Display-list comparison](benchmarks/browser-2026-09-15-depth-low-model-display-list-abba.json).
With corrected depth, native low-detail fighters and fusion, the Dream Land
decorative-background draw callback normal/black/black/normal control measured
distinct visible **56.00 / 57.54 / 56.87 / 58.17 FPS**. The first pair gains
1.54 FPS; the reversed pair loses 1.30. The stage gameplay-object guard and
110 input fingerprints pass, but no leg hits 60. Restore the original native
background; the older raw-depth apparent benefit also failed its reversal.
[Corrected Dream Land background comparison](benchmarks/browser-2026-09-15-depth-low-model-dreamland-background-abba.json).
The corrected low-model/fusion 30-second guest-PC diagnostic sampled 1,493
locations (one unmapped). `HSD_FObjInterpretAnim` still led named functions at
51 samples (3.4%); particles, reverb, texture-resource assignment and envelope
matrix setup followed at 19–22 samples each (1.3–1.5%). These are last-PC
residency observations including waits, not self-time or predicted FPS savings.
The profiler reduced visible delivery to 49.93 FPS, so it cannot certify
performance. Its optional text symbol map lived only in an ignored private
lab package with 181 hashed files and automatic hosted-game startup.
[Corrected CPU residency](benchmarks/browser-2026-09-15-depth-low-model-fusion-cpu-profile.json).
The first corrected Yoshi's Story acceptance leg with an Ice Climbers mirror,
native low-detail models and the exact-replay animation fusion measured only
**40.70 simulation / 40.60 distinct visible FPS** for 30 seconds at 960×720.
Both native-frame controller tracks were active; the page stayed focused and
the two-image queue dropped only two of 1,220 received frames. The stage is
outside the permitted Fountain IC exception and needs a much larger gain than
incremental dispatcher work. The subsequent checked Yoshi background control
below preserves Randall, terrain, gameplay feedback and original camera.
[Corrected Yoshi baseline](benchmarks/browser-2026-09-15-depth-low-model-fusion-yoshi-baseline.json).
Yoshi's corresponding 1,492 guest-PC samples put animation interpretation at
48 (3.2%) and texture setup at 24 (1.6%), with matrices, joint updates,
trigonometry, reverb and particles distributed below that. Counts include
last-PC host waits and are not exact function time. The stage-background A/B
control below tests the decorative draw cost directly.
[Corrected Yoshi CPU residency](benchmarks/browser-2026-09-15-depth-low-model-fusion-yoshi-cpu-profile.json).
Corrected Yoshi decorative map-1 background normal/black/black/normal ABBA
measured **49.34 / 55.07 / 55.57 / 52.97 distinct visible FPS**. Both 30-second
pairs favor black (mean +4.16 FPS); 102 controller fingerprints match. The
callback continues to preserve map-2 Randall. A separate same-input 600-frame
replay matched fighters and partners, rules/timers, RNG, items, moving Randall,
stage transforms and original camera. The black-scene screenshot preserved
4:3 framing, platforms, fighters, trees and HUD; the game reported FOV 20,
zero camera pitch/yaw offsets. Graphics commands intentionally differ, and
55.57 remains under 60. Retain this stage-only cosmetic option; no default
promotion or all-stage certification follows.
[Yoshi background timing](benchmarks/browser-2026-09-15-depth-low-model-fusion-yoshi-background-abba.json).
[Randall and camera replay](benchmarks/browser-2026-09-15-yoshi-background-gameplay-replay.json).
Freezing map-1 decorative Yoshi animation while the sky draw was already off
gave normal/frozen/frozen/normal visible **55.37 / 55.53 / 55.46 / 57.07 FPS**.
The first pair gains only 0.17 FPS and the reversed pair loses 1.61;
109 input fingerprints match and all gates fail. Keep native animation
enabled. The larger map-1 draw skip remains stage-only and optional.
[Yoshi animation control](benchmarks/browser-2026-09-15-depth-low-model-fusion-yoshi-animation-abba.json).
Live read-only Yoshi geometry contains zero map-0 collision display objects
and 102 map-3 display objects across 22 joints; map-2 Randall is excluded
from mesh editing. Seven two-material joints near world Y≈−210 turned out
to be visible foreground water artwork, not invisible offscreen work.
Guardedly hiding their 14 DOBJ flags on the black-background, low-model/fusion
Yoshi scene gave native/reduced/reduced/native visible **52.50 / 54.74 / 56.44 /
55.84 FPS**. Both pairs favor removal (+2.23 / +0.60), 107 fingerprints match,
but every gate fails. The corrected screenshot shows missing foreground waves;
native waves remain default. An independent same-input 600-frame replay
matched fighters, Randall, items, RNG and native camera, so the opt-in is
mechanically viable for this fixture. Stage/playable geometry must remain legible.
[Yoshi mesh inventory](benchmarks/browser-2026-09-15-yoshi-mesh-inventory.json).
[Wave timing](benchmarks/browser-2026-09-15-depth-low-model-fusion-yoshi-waves-abba.json).
[Wave gameplay replay](benchmarks/browser-2026-09-15-yoshi-waves-gameplay-replay.json).
The two checked 17-draw Yoshi side groups looked visually unchanged at a
comparable idle frame with native waves retained. Their normal/hidden/hidden/
normal same-checkpoint visible rates were **53.04 / 55.20 / 54.94 / 56.00 FPS**:
first pair +2.16, reverse −1.06. All 106 fingerprints match, but the FPS
effect is not repeatable and every gate fails. Restore native side displays;
the screenshot cannot rule out differences at wider native camera zoom.
[Side scenery timing](benchmarks/browser-2026-09-15-depth-low-model-fusion-yoshi-side-scenery-abba.json).
With the corrected black Yoshi sky and low-detail fighters, changing only
the revision-locked animation callback continuation after a native warmup
gave off/on/on/off visible **51.27 / 52.14 / 48.50 / 48.17 FPS**. Both same-
checkpoint pairs favor it (+0.87 / +0.33) with 98 matching native-input
fingerprints, but the session drifts more than 3 FPS and no leg reaches 60.
Keep the callback specialization opt-in pending exact-configuration replay;
the earlier ~1.9 FPS gain in another setup does not transfer here.
[Corrected callback timing](benchmarks/browser-2026-09-15-depth-low-model-fusion-yoshi-animcallback-abba.json).
The read-only live Yoshi particle inventory, after a checked120-frame native
match replay, found just one bank-0 particle and **no ambient stage bank**.
Fountain's bank-30 draw suppression therefore has no identified equivalent
Yoshi payoff in this scene. It is a snapshot, not a particle self-time profile.
[Yoshi particle inventory](benchmarks/browser-2026-09-15-yoshi-live-particle-banks.json).
The checked26-draw Yoshi group-4 tree preview left the red platform and native
camera visible in a black-background screenshot. A30-second same-checkpoint
normal/removed/removed/normal trial gave **51.94 / 54.22 / 54.14 / 54.80**
visible FPS: first pair +2.29, reverse −0.66. The 102 native-input
fingerprints matched, but none passed and the gain did not repeat. Reject the
tree preview and leave the visually uncertain group 5 native.
[Yoshi tree comparison](benchmarks/browser-2026-09-15-depth-low-model-fusion-yoshi-tree-abba.json).
Revision-locked hot-function fusion compiled16 Yoshi blocks but yielded an
**invalid** native-input FPS control: off/on/on/off distinct visible **27.47 /
28.87 / 29.64 / 52.94 FPS**. All measured legs failed the 60 gate and six
warmup/measured runs had fewer than 1,200 common native frames. The within-
session recovery is too large to attribute any change to fusion; keep it
disabled, and defer exact-state replay until a valid workload result exists.
[Invalid hot-fusion control](benchmarks/browser-2026-09-15-depth-low-model-fusion-yoshi-hotfusion-invalid.json).
An optional 1,800-native-frame match prewarm ran and restored the full captured
machine state ahead of an ordinary30-second Yoshi acceptance leg. It reached
**51.24 simulation / 50.90 distinct visible FPS** with active controller
tracks at960×720; the button-to-result time was86.87seconds including
match startup and measurement. No paired improvement was established, so
prewarm stays out of defaults. QA now records its own elapsed time when used.
[Exact-state prewarm result](benchmarks/browser-2026-09-15-yoshi-exact-match-prewarm.json).
An ordered corrected black-backdrop four-stage Ice Climbers survey, each with
30 seconds of active native-frame inputs, measured distinct visible FPS of
**49.90 Battlefield / 56.24 Final Destination / 48.10 Pokémon Stadium /
52.80 Dream Land**. All four valid960×720 legs failed; the first stage may
be colder, and the survey is not a causal stage-cost A/B. Private native-camera
frames retained fighters, HUD and playable platforms. All inspected camera
settings had FOV30, zero pitch offset and zero yaw offset. Stadium's neutral
video-board scenery stayed visible under the black-backdrop option, making
Frozen Stadium a stage-specific performance follow-up. The all-stage target
and broader roster/latency coverage remain unmet.
[Corrected legal-stage survey](benchmarks/browser-2026-09-15-corrected-black-stage-coverage.json).
An independent corrected Frozen Stadium 30-second leg with its stage-only
screen, decoration and idle transformation controller suppressed measured
**45.87 simulation / 45.57 distinct visible FPS**. A native-camera screenshot
showed the neutral main floor and both raised platforms against black;
FOV30 and zero pitch/yaw offsets remain. It does not clear the target or prove
a causal difference from the fresh-session native-Stadium survey. Frozen
Stadium needs a same-checkpoint A/B and longer neutral-map validation before
promotion.
[Frozen Stadium acceptance](benchmarks/browser-2026-09-15-frozen-stadium-black-acceptance.json).
An explicit direct-WASM-dispatch compiled-block diagnostic on corrected
native Stadium recorded474,418 periodic complete-block samples. Among the
78,957microseconds of sampled guest-block duration, animation interpretation
accounted for18.72%, reverb8.84% and envelope matrix setup3.93%. The
instrumented41.17 visible FPS is not an acceptance result; sampling excludes
dispatcher bookkeeping and hardware callbacks, so these percentages cannot
be treated as complete frame costs. Dry-audio timing is the next controlled
shared-cost test.
[Stadium compiled-block profile](benchmarks/browser-2026-09-15-corrected-stadium-direct-block-profile.json).
The corrected native/dry/dry/native Stadium audio control measured **48.23 /
51.06 / 48.81 / 52.04 distinct visible FPS** with 95 common controller
fingerprints. Dry audio gained2.83FPS in the first adjacent pair and lost
3.23FPS in the reverse pair; no leg met60. The profiler's reverb share did
not convert to a repeatable image-rate win. Keep wet audio native.
[Corrected dry-audio reversal](benchmarks/browser-2026-09-15-corrected-stadium-dry-audio-abba.json).
The corrected native-Stadium direct-dispatch acceptance leg explicitly set
`wasmdispatch=1` on the same pinned core. It measured **40.61 simulation /
40.51 distinct visible FPS** at960×720 with active controller tracks and
page focus. The earlier identical binary rebuild established that the direct
dispatcher was compiled; the release defaults do not enable its runtime URL
flag. A separate profile exercised474,418 direct complete-block samples,
confirming the flag's path. The single direct-dispatch acceptance still
fails60 and is not a causal A/B against the independent ordinary run.
[Direct-dispatch acceptance](benchmarks/browser-2026-09-15-corrected-stadium-direct-wasm-dispatch.json).
The Ryzen laptop was observed on battery in the OS balanced profile with a
`powersave` CPU governor. A manually paused unchanged-Stadium-checkpoint
balanced/performance/performance/balanced diagnostic verified each governor
and measured **42.70 / 48.77 / 48.16 / 49.23 visible FPS**. The first pair
favors performance by6.06FPS; the reverse loses1.07FPS. All gates fail and
46 native-input fingerprints match. The OS profile was restored to balanced;
system power mode is neither an established fix nor a player requirement.
[Host power diagnostic](benchmarks/browser-2026-09-15-host-power-stadium-abba.json).
An ignored visual-invalid depth control kept the **same pinned WASM core**,
black Dream Land backdrop, low-detail fighters and fusion, but restored the
old generated GL depth bindings. It booted with automatic hosted-game loading
after repairing only its pthread self-loader URL on a fresh cache origin.
The30-second diagnostic reached **49.01 simulation / 48.44 distinct visible
FPS**; an inspected tree covered fighters. The independent corrected survey
was52.80 visible FPS, but the separate cold sessions cannot establish a
causal depth cost. There is no target gain to justify wrong occlusion, so
the corrected renderer remains mandatory.
[Visual-invalid depth control](benchmarks/browser-2026-09-15-raw-depth-same-core-negative-control.json).
The corrected Stadium animation-state specialization compiled one guarded
function and recorded 4.64million cumulative calls, but its valid 35-second
same-checkpoint off/on/on/off measured **46.20 / 48.12 / 49.80 / 50.46 distinct
visible FPS**. The first pair favors it by1.92FPS and the reversed pair loses
0.66FPS. All106 common controller/gameplay fingerprints match; every visible
image gate fails. An initial 30-second trial was invalidated by fewer than
1,200 shared frames in its cold warmup, and cannot establish a gain. Leave
the specialization opt-in rather than interpreting sampled guest-animation
time as a whole-frame FPS opportunity.
[Stadium animation-state A/B/A](benchmarks/browser-2026-09-15-corrected-stadium-animation-state-abba.json).
The 720p corrected OGL core normally renders a **1280×1056 internal EFB**
before making its 960×720 output. A guarded1.5× mode reduces this to960×792,
43.75% fewer internal pixels while retaining actual720p game content. The
Stadium saved-checkpoint 35-second 2×/1.5×/1.5×/2× comparison with two active
human controller tracks measured **47.49 / 50.23 / 50.63 / 50.86 distinct
visible FPS**. Renderer diagnostics confirmed each EFB size, 109 shared
native-controller fingerprints matched, and every gate failed. The first
pair gains2.74FPS and the reverse loses0.23FPS, so this does not establish
a repeatable gain or solve the missing9+ FPS. Leave2× as the playable default.
The benchmark now supports active native-frame controller input for this
scale comparison and rejects mismatched or inactive runs.
[Corrected EFB scale with native input](benchmarks/browser-2026-09-15-corrected-stadium-efbscale-native-input-abba.json).
The corrected Yoshi black-background low-model mesh diagnostic gives a larger
shared-rendering opportunity. Across the saved checkpoint, the uncapped native
normal/bypassed/bypassed/normal measurements were **52.07 / 65.03 / 68.65 /
53.65 native-work FPS**. Skipping complete `HSD_PObjDisp` mesh skinning and
primitive submission saves **3.83 and4.07ms per native frame** in the two
pairs. All80 sampled native-input/gameplay fingerprints match; the measured
legs compiled no new synchronous JIT blocks. Bypassed images omit meshes,
so this is only a bound for a future exact rendering optimization, not a
playable FPS improvement. The corrected heavy match needs both faster native
work and distinct delivered 720p images. Focus on retaining the actual stage
and fighter meshes while reducing shared skinning/primitive translation cost.
[Current-core mesh cost](benchmarks/browser-2026-09-15-corrected-yoshi-mesh-cost-native-abba.json).
Alternative browser OGL routes were tested with ignored static packages that
changed only the release bootstrap default, retained all180 automatically
hosted files and passed integrity checks. Direct `oglproxy=proxy` actually
selected the alternate backend but displayed a black canvas at **0 visible
FPS**, with no frames received by the queue despite46.92 simulation FPS.
The `oglproxy=main` package never finished startup; after45seconds its status
said "The main-thread engine cannot mount local discs. Use the worker
renderer." The main route violates the no-ISO startup invariant. Both
alternatives are rejected; keep the working detached worker ImageBitmap path.
The first URL-only proxy trial was overridden by the release bootstrap's
mandatory worker default and is not a causal proxy comparison.
[OGL route viability](benchmarks/browser-2026-09-15-corrected-ogl-proxy-negative-controls.json).
The corrected Yoshi fighter-link saved-checkpoint ablation isolates the
largest reusable scene group: normal/bypassed/bypassed/normal measured
**54.03 / 67.26 / 65.49 / 54.44 uncapped native-work FPS**, bounding
**3.64 and3.10ms per frame** in complete fighter GX link5 drawing and its
downstream work. All80 sampled gameplay/input fingerprints matched and the
measured legs compiled no synchronous new guest blocks. Since bypassing
fighter drawing removes the characters, this is a diagnostic opportunity,
not a playable optimization. The amount overlaps with the mesh bound in a
separate checkpoint and cannot be added or subtracted from it. Prioritize
full-image tests of guarded shared fighter geometry/display-list paths.
[Corrected fighter draw bound](benchmarks/browser-2026-09-15-corrected-yoshi-fighter-draw-bound.json).
Two corrected Yoshi guarded-display-list A/B/B/A sessions initially looked
faster with the candidate but their final baseline legs developed long image
gaps after healthy warmups. The reverse-order **on/off/off/on** control
measured **52.63 / 54.37 / 53.71 / 50.40 distinct visible FPS**, now favoring
the original path in both pairs. All120 native-input/gameplay fingerprints
matched, the page stayed focused and the late candidate had zero new
synchronous JIT compilation. The long-gap slowdown follows the final run
position rather than the feature; its underlying cause is unproven. A
corrected600-frame full-state replay changed only `displaylistfast` and
matched input/gameplay and the saved execution-ordered event schedule, but
failed raw byte equality in **17–18 CoreTiming bytes**. Leave the fast path
opt-in. QA now supports both codegen comparison orders to catch this drift.
[Display-list order and replay](benchmarks/browser-2026-09-15-corrected-yoshi-displaylist-order-and-replay.json).

Frozen Stadium remains a Stadium-only TODO and cannot improve any other stage.
The first broader cosmetic candidate froze two hidden Battlefield joint-animation
processes while preserving its main object and platforms. Ice Climbers ABBA
measurements favored the frozen variant in both pairs, including +1.47 simulation
FPS in the less drift-sensitive pair. The tournament-play consistency gate failed:
fighter state diverged at relative frame 720 and the state-dependent controller
inputs diverged from frame 840. Keep normal Battlefield animation enabled; the
current implementation is unsafe regardless of its apparent speed. Final
Destination has not been promoted or enabled because it uses the same mechanism.
[Battlefield static-background timing](benchmarks/browser-2026-09-14-battlefield-static-background-timing.json).

Correction to the stage-object audit: a misleading comment in the decompilation
callback table identified map 1 as Randall. Actual callback code identifies
map 2 (`grStory_801E3370` / `801E33E0`) as Randall; map 1 is decorative scenery.
The first preservation guard retained map 1's draw callback and a fresh run
measured 33.47 visible FPS. That is a different rendering configuration, not
a controlled causal comparison. The live object check confirms map 2 is
category 0 and the previous category-2 filter left it intact. The corrected
explicit map-2 guard is installed and tested. A fresh run measured 35.80 visible
FPS with zero drops and 1077 queue underruns. Camera code is unchanged; Randall
was outside the post-run screenshot, so his appearance still needs visual QA.
[Background control](benchmarks/browser-2026-09-14-yoshi-background-control.json).

Completed diagnostic: identical 1200-native-frame workloads from one checkpoint,
temporarily uncapped host pacing, with the image verifier absent. The first
interrupted attempt measured 36.78 cold / 40.01 warm native FPS, with zero
synchronous compilation in the warm interval. It stopped before candidate
measurement because helper diagnostic text is cached until execution advances.
The harness now reads pre-change coverage before setting the mode and verifies
new coverage afterward; cleanup and cached-text tests pass. The completed
chain-fusion comparison measured 39.94/42.74/42.02/42.12 warmed native FPS.
All 80 shared fingerprints matched. The pairs still disagree (+7.02%/-0.23%),
so keep OFF. This diagnostic cannot pass image cadence.
[Fixed-work result](benchmarks/browser-2026-09-14-chain-headroom.json).

The paused Yoshi inventory found 22 active joint-animation objects / 44 channels
on hidden map 1. Randall (map 2) has one channel; map 3 and its Shy Guy logic
remain independent. A new opt-in candidate skips only map 1's `HSD_JObjAnimAll`
call, retaining material processing, the collision-update counter and callbacks.
Its 600-frame gameplay-observable replay passed with all four Ice Climbers,
RNG, native camera, stage joint/timer state, Randall movement, and item kinds
210/106 observed. This is not full-machine equality or exhaustive move coverage.
The 45-second normal/off/off/normal image-FPS comparison completed at
42.40/43.69/43.80/44.07 visible FPS. All 126 shared fingerprints matched; the
pairs oppose (+1.289/-0.267 FPS). Keep normal background animation on.
All image gates failed.
[Joint inventory](benchmarks/browser-2026-09-14-yoshi-animation-inventory.json).
[Gameplay replay](benchmarks/browser-2026-09-14-yoshi-animation-replay.json).
[Image timing](benchmarks/browser-2026-09-14-yoshi-animation-timing.json).

New rendering diagnostics use 1200 native frames from a common checkpoint,
temporarily uncapped pacing, and normal/bypassed/bypassed/normal intervals.
Scene-draw bypass measured 39.48/65.88/67.31/41.58 native FPS with all 80
fingerprints matching. Its paired elapsed differences are 10.15/9.19 ms per
frame, including guest draw callbacks and downstream graphics, not GPU-only
time. Mesh-only bypass measured 39.78/48.33/49.69/43.20 with 80 fingerprints
matching, a 4.45/3.02 ms difference. Materials-plus-mesh bypass measured
43.43/69.18/69.07/44.97, but a one-frame polling-gap shift caused its strict
input-consistency gate to fail. This is a material-path lead, not exact cost
attribution. These experiments use different initial checkpoints and cannot
be subtracted as additive CPU shares. Texture setup and material-combiner
setup are the next narrower scopes. All bypasses produce incomplete images,
are diagnostic only, and restore the original instructions, pacing and state.
No playable optimization or new acceptance pass resulted.
[Scene cost](benchmarks/browser-2026-09-14-scene-render-cost.json).
[Mesh cost](benchmarks/browser-2026-09-14-mesh-render-cost.json).
[Material/mesh lead](benchmarks/browser-2026-09-14-drawable-render-cost.json).

Texture setup completed at 40.38/43.82/44.04/41.74 native FPS, with all 80
fingerprints matching. Paired differences are 1.95/1.25 ms per frame. Rebuilding
texture descriptors every material draw is a possible caching target, but the
entire texture setup path is insufficient to close the present gap by itself.
[Texture cost](benchmarks/browser-2026-09-14-texture-render-cost.json).

Material-combiner setup measured 42.28/43.18/44.49/41.74 native FPS, also with
all 80 fingerprints matching. Its paired differences are 0.50/1.48 ms per frame.
[Combiner cost](benchmarks/browser-2026-09-14-tev-render-cost.json).

Prepared compiler candidate `callfusion` (default off): a read-only caller
prefix ending in an ordinary direct `bl` may continue into the existing safe
successor block, up to 64 instructions total. The original branch writes LR/NPC;
the original block boundary still commits its cycles and checks pause, frame
step, and imported-memory fallback before entering the callee. OS/Melee HLE
substitutions, earlier calls/stores, unsafe successor operations, faults,
debugging/performance counters, and oversized targets remain excluded. Physical
code ranges still participate in normal invalidation. Eight native emitter,
admission and flag tests plus 81 related benchmark/replay tests pass, including
real emitted `bl` LR behavior at budget/pause/step/fallback exits. Core
`d8cf5bfd` built and is installed privately on port 3237. Its first 600-frame
replay matched gameplay fingerprints and 28 of 29 serialized sections,
including all RAM, CPU registers, graphics and audio. Full equality failed on
eight single bytes in scheduler insertion-order fields, out of 109,881,701
bytes. There were 910 newly compiled call-fused blocks; dispatcher calls fell
from 1,573,703 to 1,558,402 (frequency, not time). The flag stays off. A new
unchanged-codegen replay control and saved event queue diagnostic will check
the mismatch without normalizing raw bytes. Their 23 focused tests pass.
Timing remains pending; no speedup claimed.
[First call replay](benchmarks/browser-2026-09-14-call-fusion-first-replay.json).

The unchanged-codegen control passed all 110,104,666 bytes and 29 sections.
A repeated candidate comparison then passed all 110,202,822 bytes and 29
sections, including exact event times, insertion orders and idle counters;
919 new call-fused blocks were exercised. The initial eight-byte mismatch
remains unresolved. The 45-second off/on/on/off image comparison measured
42.60/41.74/42.60/43.01 visible FPS. The candidate loses both pairs; keep off.
All 122 shared input fingerprints matched, while every image gate failed.
[Replay controls](benchmarks/browser-2026-09-14-call-fusion-replay-controls.json).
[Call timing](benchmarks/browser-2026-09-14-call-fusion-timing.json).

Next candidate `constantaddr` (default off) proves integer memory addresses
from immediate-producing instructions within the current block. It retains
all memory transactions, widths, byte ordering, FIFO flushes, device fallbacks,
register writes and original timing boundaries. Only a proved RAM/non-RAM
branch is omitted; no live register, pointer or game-memory value is assumed
constant. Calls, branches, system operations and unrecognized helpers discard
the proof. Two actual proof/emitter tests and seven related native tests pass;
83 related frontend tests passed, followed by 27 focused tests including the
new coverage and cleanup cases. Core `521f4b2b` built with five existing
warnings and is installed privately on port 3237. Hosted no-ISO startup loaded
the game. The 600-frame replay exercised 539 specialized sites (219 RAM and
320 other). All 110,128,135 bytes matched except two bytes in the historical
idle-cycle accumulator, which differed by 249. Inputs, RAM, CPU registers,
graphics, audio, global ticks, event times, event orders and payloads match.
Raw equality remains a failure. Source inspection found no execution consumer
of `m_idled_cycles` or `GetIdleTicks()`; initialization, accumulation,
serialization and diagnostics are its only uses. That narrow accounting-only
difference does not affect future emulation, so timing is proceeding. The
classification/source-audit tests and related replay tests passed (24 total,
between timing runs). The separate classification does not change `passed`
or `fullMachineBytesEqual`; no actual clock or event-order field is exempted.
Its source/staged UI update is prepared but not installed in the running tab.
The first image ABBA lost focus 34.15 seconds into the first candidate warmup.
Presentation callbacks fell to about 1 Hz while native production remained
42–45 FPS. Focus returned late in the second candidate measurement and normal
delivery resumed. All 121 input fingerprints matched, but this is a contaminated
comparison with no performance conclusion. A fixed 1200-native-frame comparison
then measured warmed OFF/ON/ON/OFF rates of 30.07/29.80/31.78/30.39 native FPS.
The candidate lost the first pair by 0.27 FPS and won the second by 1.39 FPS,
while the closing baseline itself gained 0.32 FPS. All 80 shared fingerprints,
9,608 controller polls, input hashes and state hashes matched. Reject as too
small and inconsistent; the raw replay also remains a formal failure on unused
idle accounting. A 15-second post-run worker sample found the emulator worker
runnable for 14.916 of 15.032 seconds with only 18.5 ms of run-queue wait, at a
mean observed 3.84 GHz. The worker is CPU-bound rather than scheduler-starved,
although OBS, DisplayLink and browser/GPU work made this host period unusually
busy. Broader gameplay coverage remains unmeasured.
[Address replay](benchmarks/browser-2026-09-14-constant-address-replay.json).
[Focus-loss timing](benchmarks/browser-2026-09-14-constant-address-focus-loss.json).
[Fixed-work timing](benchmarks/browser-2026-09-14-constant-address-headroom.json).
[Worker sample](benchmarks/browser-2026-09-14-constant-address-worker.json).

The next compiler experiment repairs a measured design loss in `callfusion`.
The original candidate admitted one verified ordinary direct `bl`, but the
linked branch made the existing FPU-guard/MSR proof reject the entire fused
block. The new proof exception applies only at the already verified fusion
boundary and rechecks that exact instruction against the ordinary-call helper.
OS/Melee substitutions, HLE targets, other linked branches and MSR/system writes
remain rejected; the original call timing boundary remains. Five focused native
source/emitter/admission tests pass. Core `09569744` built with the same five
existing warnings. A 600-frame normal-running replay exercised 999 new fused
blocks and reduced dispatcher calls from 1,564,873 to 1,549,773. Inputs,
gameplay fingerprints, scene frame, RAM, CPU, GPU, audio and 28 of 29 serialized
sections matched. Raw equality remains a formal failure because one byte in the
unused idle-cycle accumulator differs; the separately audited execution-state
classifier passes. Fixed 1200-frame warmed OFF/ON/ON/OFF measurements were
20.21/20.54/22.64/21.99 native FPS. Both pairs favor the repaired candidate by
0.33 FPS (1.61%) and 0.66 FPS (2.98%). All 80 input/state fingerprints match.
Retain as the current opt-in compiler improvement; normal image cadence remains
pending before enabling by default. Absolute rates were severely host-degraded
and are not acceptance evidence.
[FPU-proof replay](benchmarks/browser-2026-09-14-call-fusion-fpu-replay.json).
[FPU-proof fixed work](benchmarks/browser-2026-09-14-call-fusion-fpu-headroom.json).

The required 720p image-cadence comparison now rejects that repaired call-fusion
candidate. Battlefield Ice Climbers measured OFF/ON/ON/OFF simulation FPS of
49.14/46.60/46.50/48.47 after each mode's warmup. Both pairs lose 1.97–2.53
FPS with call fusion enabled, while all 90 shared native input/state fingerprints
match and 995 fused blocks were compiled. Keep call fusion off. The uncapped
fixed-work gain does not carry through the complete renderer and presenter.
[Call-fusion image timing](benchmarks/browser-2026-09-14-call-fusion-fpu-image-timing.json).

Latest unchanged-checkpoint control on core `f2e807d6` failed all four Yoshi's
Story Ice Climbers mirror intervals: **40.57 / 42.94 / 42.38 / 43.54 visible FPS**.
All 40 shared native-input fingerprints matched. Compilation consumed
490.9 / 6.7 / 0 / 2.6 ms per 30-second interval. There were 0–1 image drops but
490–577 queue underruns, so frame production limits these runs. This reproduces
the slowdown on the earlier core and an unchanged match; it cannot be explained
solely by the newest native build or different input trajectories.
[Control evidence](benchmarks/browser-2026-09-13-yoshi-identical-checkpoint.json).

A separate 15-second thread diagnostic found the busiest worker using 99.66%
of a core, with only 5.1 ms waiting on the OS run queue. That worker was observed
on the faster CPU class during this later diagnostic; an earlier instantaneous
snapshot placed it on the slower class. Neither observation was synchronized
with the four image intervals. The matched unrestricted/faster/faster/unrestricted
placement diagnostic measured 42.27/46.90/45.70/44.73 visible FPS. Both pairs favor
the faster class, but the final warm pair gains only 0.97 FPS. Original affinity
was restored; OS affinity is not a deployable browser optimization or an
acceptance condition.
[Worker evidence](benchmarks/browser-2026-09-13-yoshi-worker-placement.json).
[Placement comparison](benchmarks/browser-2026-09-13-yoshi-placement-comparison.json).

Core `094195c8` adds opt-in timing around sampled complete compiled blocks while
preserving normal dispatch chaining. Production generated dispatcher bytes match
the previous build in all four tested map/step variants. The first Yoshi profile
recorded 404,085 samples; animation decoding contributed 46,206 sampled block
visits. Raw timings include substantial clock/import overhead and an isolated
large spike, so they cannot establish CPU percentages.
[Profile evidence](benchmarks/browser-2026-09-13-yoshi-direct-block-profile.json).

Exact rotate/mask byte reversal stays OFF. It reduces the emitted expression
from 37 to 23 bytes and passed one million raw-bit actual-emitter tests. A real
600-frame Yoshi IC/IC replay matched all 110,057,607 bytes and all 29 sections,
with 69,636 newly emitted candidate sites. However, measured OFF/ON/ON/OFF visible
FPS was 38.47/39.41/41.97/42.50: the pairs disagree and every image gate fails.
The input consistency gate also failed because four intervals tracked fewer than
1200 common frames, despite no divergent fingerprint being reported. The Node
microbenchmark gain did not establish a repeatable game speedup.
[Isolated timing](benchmarks/browser-2026-09-13-bswap-microbenchmark.json).
[Raw replay](benchmarks/browser-2026-09-13-bswap-rotate-replay.json).
[FPS comparison](benchmarks/browser-2026-09-13-bswap-rotate-comparison.json).

Completed experiment: join up to eight compiled blocks / 64 instructions, retaining
every original PC, cycle-budget, pause and step boundary. Every intermediate
segment must be register-only, with code-address invalidation tracking retained;
cycles, HLE, system-state writes and unsafe segments are rejected. Conditional
fallthroughs can continue inside the compiled function; other targets return
through normal dispatch. The flag is OFF by default. Actual emitted WASM tests
cover exits at all seven boundaries, and the chain-admission and configuration
tests pass. Core `e9d4e787` passed the real 600-frame replay: all 110,123,914
bytes and 29 sections equal, with 1,050 newly compiled chains and 3,266 retained
internal boundaries. The 45-second OFF/ON/ON/OFF comparison measured
41.76/42.47/43.56/43.87 visible FPS. The pairs disagree (+0.71/-0.31 FPS),
all image gates fail, and 124 shared input fingerprints match. Keep OFF.
[Chain replay](benchmarks/browser-2026-09-13-chain-fusion-replay.json).
[Chain timing](benchmarks/browser-2026-09-13-chain-fusion-comparison.json).

The frame logger is inactive and contributes no measured drain work. Rush
presentation OFF passed raw state replay but failed all timing gates with
opposing pairs; ON remains the default.
[Logger observation](benchmarks/browser-2026-09-13-frame-logger-observation.json),
[rush timing](benchmarks/browser-2026-09-13-rush-presentation-comparison.json).

Earlier coverage blocker: Yoshi's Story with Ice Climbers failed two fresh two-image
trials (58.50/58.20 visible FPS) and a three-image trial (59.17 visible FPS).
This is outside the accepted Fountain exception. New warmed passing coverage
includes Battlefield, Final Destination and Dream Land with Ice Climbers.
GPU service-delay experiment: 1000/4000/4000/1000 cycles measured
59.159/59.403/59.270/58.648 visible FPS over 45 seconds each. Both pairs favor
4000, but all image gates fail. Callback count fell from about 804 to 277 per
native frame. Keep the original 1000-cycle setting while correctness is audited.
The latest 600-frame repeat matched all sections except CoreTiming; an earlier
replay also differed in 18 RAM bytes and GPU FIFO/storage. These remain failed
raw comparisons. New diagnostics will compare actual saved event schedules
without changing serialized bytes or the raw equality gate.
[GPU timing](benchmarks/browser-2026-09-13-gpu-start-delay-comparison.json),
[replay](benchmarks/browser-2026-09-13-gpu-start-delay-field-replay.json).
Yoshi IC2/4/4/2 queue comparison also failed all image intervals:
58.803/59.070/59.426/58.827 measured visible FPS. Four images improved
cadence but added about26ms mean queue delay. Keep two images. Host-only rush
presentation OFF passed600-frame replay:110,128,135 bytes and all29sections
equal on core2e26b8b3. Its45-second ON/OFF/OFF/ON timing comparison failed all
gates (49.74/48.29/50.29/48.67 visible FPS); keep ON.
[Pacing replay](benchmarks/browser-2026-09-13-rush-presentation-replay.json).
[Queue evidence](benchmarks/browser-2026-09-13-yoshi-ice-four-image-queue.json).

The GPU diagnostic now confirms identical saved event times/types/payloads,
including the execution order of equal-time events, despite different insertion
ordinals. Raw equality still fails:21,346 GPU storage bytes,26timing bytes,
15RAM bytes and2CPU bytes. First32 reported GPU ranges are unused FIFO storage;
the range list is truncated, so it does not classify all changes. One RAM range
is the SDK last-interrupt timestamp; the others are below the captured stack
pointer in the default stack allocation. Keep GPU delay1000 pending the remaining
audit. [Saved-event evidence](benchmarks/browser-2026-09-13-gpu-start-delay-saved-events.json).
[Latest stage coverage](benchmarks/browser-2026-09-13-ice-stage-coverage.json).


Latest: warmed Battlefield Ice Climbers now passed with the two-image queue:
60.035 simulation /59.635 distinct visible FPS over30seconds, mean queueage
17.19ms. Its preceding warmup also passed59.704visible. Both three-image
measurements passed59.503/59.668visible at34.89/28.85ms meanage. Keep two images
for coverage; startup performance and other heavy stage workloads remain open.
[New comparison](benchmarks/browser-2026-09-13-battlefield-ice-three-image-queue.json).

Time-drift correction stays off:600-frame pacing-only full-state replay passed
106,204,563bytes, but OFF/ON/ON/OFF FPS pairs disagreed and all image gates failed.
[Timing evidence](benchmarks/browser-2026-09-13-timing-drift-comparison.json).

Final Destination Fox/Falco has now passed two warmed30-second image intervals
with the lower-delay two-image queue:59.64 and59.83 distinct visible FPS.
The four-image queue also passed at59.94/59.90, but increased average queue age
from19.6/19.5ms to40.9/47.5ms. Keep two images for broader testing first.
These results do not establish physical input-to-photon latency or all-stage/
all-character performance, and earlier fresh stage trials failed.

The image verifier has measurable overhead on Final Destination, but both
attempted fixes—main-task harvesting and worker pixel analysis—failed to show
a repeatable gain. Both remain off. Stadium video-board suppression remains
opt-in:600-frame observable replay passed, but no FPS gate passed and a longer
transformation replay is pending.

Earlier Battlefield Ice Climbers mirror trials failed two fresh-match intervals:
simulation 58.23/59.47 FPS and visible 57.23/58.83 FPS. Both had valid active
native-frame inputs, native 960×720 output, normal speed, and uninterrupted
focus/visibility. Shortfalls therefore extend beyond the accepted Fountain/
Ice Climbers exception. [Both measurements](benchmarks/browser-2026-09-13-battlefield-ice-climbers.json).

Partial Q0-state cache stays off. Core 5ed9a8d9 passed normal-running 600-frame
complete-state replay (106,208,784 equal bytes) and stepped 120-frame replay
(105,129,682 equal bytes, no tick differences). Its warm OFF/ON/ON/OFF timing
was simulation 48.77/47.63/48.20/44.53 and visible 48.47/47.43/47.90/44.27 FPS.
All 92 shared fingerprints matched, but timing pairs disagreed. All gates fail.
[Warm result](benchmarks/browser-2026-09-13-qstate-warm-comparison.json).

Full Q0 eligibility cache remains off. Core b9f28907 passed normal 600-frame
complete-state replay (106,142,456 equal bytes) and stepped 120-frame replay
(105,129,682 equal bytes, no tick differences). Its 45-second OFF/ON/ON/OFF
simulation rates were 48.60/39.14/58.71/58.91 FPS; visible rates were
48.47/38.67/57.51/57.47. All 154 shared fingerprints matched; all gates failed.
The first candidate had an unexplained 9.23-second image gap, so its average
is not a steady CPU throughput estimate. Both CPU timing pairs were nonpositive.
[Comparison](benchmarks/browser-2026-09-13-qstate-full-comparison.json).

A warmed Battlefield Ice Climbers diagnostic attributes 23.73 seconds to CPU
execution in a 30-second interval, versus 0.22 seconds to direct GPU sync waits.
Advance/event time was 4.22 seconds and GPU decode 1.47 seconds. Inclusive scopes
overlap and profiling lowers FPS; these are not additive percentages or an AC
run. Last-PC samples point to animation/matrix/render work but do not measure
its self-time. [Profile](benchmarks/browser-2026-09-13-battlefield-ice-cpu-profile.json).

The FIFO extension also stays OFF. Core96d23817 passed288,000 actual-WASM
RAM/FIFO guard cases, a warm600-frame full replay (106,245,761equal bytes),
and120-frame stepped replay with identical ticks. A first cold replay differed
only in the idle accounting counter; unchanged-code control reproduced that
same isolated field difference. Those runs remain failed exact-state checks.
No comparison field was excluded. The counter's getter has no current callers;
its variation is not evidence of changed gameplay, but its source remains open.
[Warm replay](benchmarks/browser-2026-09-13-qstate-fifo-running-warm.json),
[unchanged control](benchmarks/browser-2026-09-13-qstate-fifo-running-control.json).

FIFO extension45s OFF/ON/ON/OFF measured simulation49.80/52.02/56.11/59.29,
visible49.67/51.86/54.94/58.07FPS.154shared fingerprints match; all gates fail;
opposing pairs show no repeatable gain. One screenshot occurred during first
control; recorded as a limitation. Stop further guard-cache variants without
new evidence. [Comparison](benchmarks/browser-2026-09-13-qstate-fifo-comparison.json).

Synchronous JIT compile/link is now measured at unprofiled interval boundaries.
Fresh BFIC runs consumed358.1ms then80.4ms per30s, yet achieved54.93/58.57
simulation and54.10/57.57visibleFPS. Later warm BFIC still failed at57.10sim/
56.24visible with50.6ms compile/link. These costs cannot explain the full gap;
browser background tiering and native byte generation are excluded.
[Attribution](benchmarks/browser-2026-09-13-battlefield-jit-attribution.json).

Battlefield Fox/Falco queue2/3/3/2: visible47.54/59.87/59.57/59.73FPS.
Both queue3 measurements pass; final queue2 warmup and measurement pass as well
(59.83/59.73). Keep queue2: final mean queue age20.7ms versus32.8/35.7ms for3.
All115shared input fingerprints match. First slow control had zero synchronous
compilation and no multi-second image gap, so neither explains its47.9simFPS.
Do not claim repeatable all-stage/roster performance or physical input latency.
[Queue comparison](benchmarks/browser-2026-09-13-battlefield-three-image-queue.json).

Earlier diagnostic: temporarily uncapped host pacing for1200native logic frames,
with native rendering/input/cycles intact and mandatory pacing/input cleanup.
It cannot pass image acceptance. The result should distinguish raw execution
capacity from pacing losses. Five focused headroom/JIT tests pass. Core unchanged;
private worker adds only a checked call to the existing paused-only throttle API.

The required output is native 4:3 Melee at 960×720 inside a 720p presentation,
with normal game speed, tournament rules and stages, all characters, and low
latency. Frames must be real simulation/rendered images. Hosted game startup and
native camera behavior are invariants; see [AGENTS.md](../AGENTS.md).

## Latest measured state

Core a1d25a5f, FD queue2/4/4/2: all four strict gates PASS. Visible FPS
59.6350/59.9355/59.9020/59.8345, simulation approximately60.00 throughout;
120shared fingerprints match and all intervals stayed visible/focused.
Queue4 reduced drops but added21–28ms mean queue age. Both queue2 controls
passed, so there is no need to adopt that latency cost for this workload.
[Passing FD comparison](benchmarks/browser-2026-09-13-final-destination-four-image-queue.json).

FD observer control delivered59.75/59.66FPS without pixel inspection versus
59.27/59.24 canvas submissions with it. Diagnostic counters cannot pass image
acceptance. Task-harvest and worker variants passed all known-image fixtures,
but neither improved both paired timing results. Original verifier retained.
[Observer control](benchmarks/browser-2026-09-13-final-destination-observer-control.json),
[task scheduling](benchmarks/browser-2026-09-13-final-destination-task-harvest.json),
[worker verification](benchmarks/browser-2026-09-13-final-destination-worker-verifier.json).

Core a1d25a5f, six-stage Fox/Falco sweep: simulation59.27/59.97/59.87/59.80/59.00/53.63,
visible58.03/59.17/58.87/58.60/58.04/53.30 for Battlefield/Final Destination/Dream
Land/Yoshi's/Fountain/Stadium. All30-second gates failed at960×720 with valid
active inputs and native rules. Single trials do not establish repeatability or
full roster/transition coverage. Warming materially improves Stadium's rate.
[Stage sweep](benchmarks/browser-2026-09-13-six-stage-fox-falco.json).

The standard Dolphin timing profile did not pass two FD trials and was reverted.
FD queue capacity2/3/3/2 produced59.37/58.67/59.35/58.60 visible FPS, all failures,
114matching fingerprints, opposing pairs. Keep capacity2: the larger queue also
raised mean queue age to25.37/29.51ms. [Buffer comparison](benchmarks/browser-2026-09-13-final-destination-buffering.json).

Stadium screen comparison: simulation59.67/59.74/60.04/60.04, visible58.47/58.60/59.44/58.94
ON/OFF/OFF/ON. All failures,113fingerprints match, focus/visibility and hooks stable.
Both visible pairs favor suppression, but this needs repetition. Preserve the
custom video-board state-update wrapper; only its draw call and three texture-copy
calls are suppressed. [Stadium timing](benchmarks/browser-2026-09-13-stadium-screen-comparison.json),
[600-frame replay](benchmarks/browser-2026-09-13-stadium-screen-replay.json).

Core `a1d25a5f`, post-restart hidden-animation ON/OFF/OFF/ON: simulation
**58.12 / 58.90 / 54.50 / 55.37 FPS**, distinct visible
**56.79 / 57.37 / 53.30 / 54.51 FPS**. All four 30-second intervals fail the
target at native 960×720. All 110 shared input/gameplay fingerprints matched;
the page stayed visible and focused. Opposing pairs and a negative mean change
do not justify retaining the optimization. The two-image queue dropped
25–43 images per interval, so producing frames more consistently also matters.
Do not pair these results with measurements taken before the host restart.
[Latest comparison](benchmarks/browser-2026-09-13-postrestart-hidden-animation-comparison.json).

Core `a1d25a5f` CP-format warm OFF/ON/ON/OFF: simulation **57.57 / 59.27 / 58.70 / 59.27 FPS**, visible **57.37 / 59.13 / 58.34 / 58.93 FPS**. All gates fail; 112 fingerprints match. Opposing pairs; keep OFF. [Warm comparison](benchmarks/browser-2026-09-13-cp-format-warm-comparison.json).

Core `648ffd7b` counter batching warm OFF/ON/ON/OFF: simulation **57.50 / 57.67 / 59.34 / 57.40 FPS**, visible **57.34 / 57.54 / 59.07 / 57.10 FPS**.112fingerprints match; both pairs favor candidate, mean~1.83%. All FPS gates fail. Normal600/fresh120/prewarmed120 full replay passes coexist with one initial14tick/idle-cycle failure, so batching remains experimental/OFF. [Warm timing](benchmarks/browser-2026-09-13-counter-batch-warm-comparison.json), [failed replay](benchmarks/browser-2026-09-13-counter-batch-armed-replay-failed.json).

Core `767af3cb` queue capacity2/3/3/2 warm comparison: simulation **56.77 / 60.00 / 59.44 / 59.77 FPS**, distinct visible **56.17 / 59.70 / 58.80 / 58.87 FPS**.112fingerprints matched. Only one capacity3 interval passed; no repeatable gain, and its queue mean32.52ms/p95upper47ms adds latency. Keep default2. [Warm queue comparison](benchmarks/browser-2026-09-13-queue-capacity-warm-comparison.json).

Core `34f85fc7` dispatcher step-check hoisting passed normal-running600-frame complete-state replay (107,382,085bytes) and stepped120-frame rollback replay (107,055,991bytes/ticks), but warmABBA simulation **58.77 / 58.40 / 58.74 / 58.33 FPS**, visible **58.60 / 58.00 / 58.57 / 58.00 FPS** showed opposing pairs and ~0.027% mean gain.112fingerprints match, all FPS gates fail. Keep disabled. [Normal-running replay](benchmarks/browser-2026-09-13-dispatch-step-running-replay.json), [warm timing](benchmarks/browser-2026-09-13-dispatch-step-warm-comparison.json).

Core `76333a13` wider FPU proof passed full replay but again had opposing warmed pairs: simulation **56.30 / 57.94 / 56.07 / 58.74 FPS**, visible **56.00 / 57.80 / 55.90 / 58.61 FPS** off/on/on/off.112 fingerprints match. Negative mean gain, keep disabled. [Warm timing](benchmarks/browser-2026-09-13-fpu-guard-wide-warm-comparison.json).

Core `83a8df37` idle guard retest passed full replay but its first FPS comparison had opposing pairs. Warm repeat failed coverage validation; subsequent live diagnostics advanced 3,504 presented frames with no eligible idle-loop activity. Keep disabled: this is not a steady-workload bottleneck in that scene. [Coverage evidence](benchmarks/browser-2026-09-13-idle-guard-current-coverage.json).

Core `83a8df37` conditional fusion passed full-state replay but failed to establish a repeatable FPS gain in three comparisons. Final warmed simulation **58.60 / 59.17 / 59.00 / 59.24 FPS**, visible **58.33 / 58.94 / 58.67 / 58.87 FPS**, off/on/on/off; 112 fingerprints match. Opposing pairs, mean simulation gain only **0.28%**. Keep disabled. [Confirmation](benchmarks/browser-2026-09-13-conditional-fusion-confirm-comparison.json).

Core `b0774ca5` shared FPU guards won both warmed pairs with fusion ON: simulation **58.17 / 59.41 / 58.80 / 58.20 FPS**, visible **58.00 / 59.14 / 58.57 / 58.00 FPS** off/on/on/off. Mean simulation gain **1.58%**; 112 fingerprints matched. Retain experimentally. All FPS gates fail. [Warmed comparison](benchmarks/browser-2026-09-13-fpu-guard-warm-comparison.json).

Core `c78752db` fusion won both warmed pairs: simulation **56.53 / 58.54 / 58.67 / 57.77 FPS**, visible **55.90 / 57.90 / 57.87 / 57.14 FPS** off/on/on/off. Mean simulation gain **2.54%**;112fingerprints matched. Retain fusion experimentally. Candidate dropped17/21queued images in30seconds; all gates fail. [Warmed comparison](benchmarks/browser-2026-09-13-timed-fusion-warm-comparison.json).

Core `c78752db` bounded fusion passed 120-frame delayed-input replay: 107,055,991 bytes across all29sections and all frame ticks identical;47rollbacks/334resimulation frames/max9.1,368successful fused emissions confirm candidate coverage, not runtime cost share. The completed FPS comparisons are recorded above. [Replay](benchmarks/browser-2026-09-13-timed-fusion-replay.json).

Core `7560a1da` refined FPR cache passed full-state/tick replay but lost both warmed timing pairs: simulation **58.24 / 57.34 / 57.77 / 58.84 FPS**, visible **57.47 / 56.60 / 57.07 / 58.14 FPS** off/on/on/off.112fingerprints matched; all gates failed. Keep scalar FPR cache off. [Replay](benchmarks/browser-2026-09-13-selective-fpr-mixed-replay.json), [warm timing](benchmarks/browser-2026-09-13-selective-fpr-mixed-warm-comparison.json).

Core `b317c2cc` hidden-scenery animation retest passed600frames of gameplay/RNG/platform/camera probes, but timing showed no repeatable gain. On/off/off/on simulation **57.97 / 58.20 / 57.47 / 58.40 FPS**, visible **57.33 / 57.37 / 56.77 / 57.57 FPS**;112input fingerprints matched, all gates failed. Leave animation enabled. [Replay](benchmarks/browser-2026-09-13-corrected-hidden-animation-replay.json), [timing](benchmarks/browser-2026-09-13-corrected-hidden-animation-comparison.json).

Core `b317c2cc`: selective FPR caching passed120-frame full-machine/tick replay (107,060,212bytes), but both timing comparisons had opposing pairs. Warm simulation rates were **58.93 / 59.17 / 57.47 / 59.40 FPS**, visible **58.37 / 58.70 / 56.80 / 58.07 FPS**.112shared input fingerprints matched; all gates failed. Keep cache off. Last baseline rendered59.37FPS but dropped37queued images in30seconds. [Replay](benchmarks/browser-2026-09-13-selective-fpr-replay.json), [warm timing](benchmarks/browser-2026-09-13-selective-fpr-warm-comparison.json).

Core `21b62c02`: two fresh/reused image-verifier context comparisons completed, with107 and112matching native-input fingerprints. Warm measured simulation rates were **58.57 / 57.37 / 58.30 / 58.27 FPS**, distinct visible rates **58.37 / 57.27 / 58.04 / 58.00 FPS**. No repeatable context-reuse gain; all gates failed. Neither mode reproduced the intermittent multi-second stall over both comparisons. Keep reuse experimental; this does not prove stability. [First comparison](benchmarks/browser-2026-09-13-image-context-comparison.json), [warm repeat](benchmarks/browser-2026-09-13-image-context-warm-comparison.json).

Core21b62c02 frsqrte off/on/on/off measured **53.47 / 55.70 / 57.64 / 57.64 simulation FPS** and **53.41 / 55.54 / 57.27 / 57.14 distinct visible FPS**. All107shared fingerprints matched; no FPS gate passed. Reverse pair effectively tied, so no repeatable gain. The warmed repeat reached58.14simulation/57.70visible on baseline, then image verification timed out during candidate warmup; worker history reported a non-advancing core. Do not infer candidate performance from that failed segment. Next: compare fresh versus reused WebGL probe contexts with full image validation and failure-phase diagnostics. [Completed comparison](benchmarks/browser-2026-09-13-frsqrte-fast-comparison.json), [timeout](benchmarks/browser-2026-09-13-frsqrte-warm-timeout.json).

Core `21b62c02` with pending-program/DSI fallback passed the canonical-versus-fast comparison: all 107,060,212 bytes and 120 frame timings match, with 48 rollbacks and 199 replayed frames. Unchanged-candidate core7a32 control also passed after restoring the character preload wait. A speed comparison is starting; no performance gain is established yet. [Corrected comparison](benchmarks/browser-2026-09-13-frsqrte-exception-replay.json), [unchanged control](benchmarks/browser-2026-09-13-frsqrte-unchanged-control.json).

Core `7a32b99f` exact-frsqrte candidate failed full replay: 114 of 120 frame ticks differ, despite identical final fighter and GPU state. Keep disabled; no FPS trial. The pending-exception guard is being built. Unchanged-candidate setup controls timed out before fighter initialization and are not replay evidence. Automatic selection now restores the existing CSS/preload wait. [Failed replay](benchmarks/browser-2026-09-13-frsqrte-fast-replay-failed.json).

Corrected core `dcf17154` passed120-frame full-state/tick replay with Ice Climbers (107,031,991bytes). Image/delivery/delivery/image measurements were **54.70 / 56.28 / 57.41 / 57.70simulationFPS**; the two image runs showed **54.40 / 56.77distinct-visibleFPS**, both below target. All108shared native-input fingerprints matched. Opposing pairs do not establish readback overhead; no multi-second stall recurred, which does not prove it fixed. Earlier cores used an incorrect reciprocal-square-root estimate, so their FPS cannot establish performance of this corrected baseline. [Control measurements](benchmarks/browser-2026-09-13-native-readback-control.json), [heavy replay](benchmarks/browser-2026-09-13-frsqrte-heavy-replay.json).

The queue-clock comparison was invalidated by a4.99-second image stall and170-second checkpoint settling. Emulator workers were nearly idle during the stall and became active after a CSS-only UI click; the cause remains unresolved. The last original-clock trial passed individually at60.002simulation/59.536distinct-visibleFPS, but one trial does not establish sustained all-stage/all-character performance. Normal trials showed only one queue-clock skip versus10–14dropped images, so no substantial clock-removal gain is established. [Stall and queue evidence](benchmarks/browser-2026-09-13-queue-clock-stall.json).

Core `e4cfba3a` prefetch off/on/on/off measured **59.37 / 60.04 / 59.63 / 60.00 simulation FPS** and **58.93 / 59.50 / 59.10 / 59.40 distinct visible FPS**. Only the first candidate trial passed; opposing pairs do not establish a gain. All 114 shared input/gameplay fingerprints matched. Warm baseline rendered59.97FPS but the two-image queue dropped15 images in30seconds. Next: isolate the secondary queue clock without increasing buffering. [Prefetch comparison](benchmarks/browser-2026-09-13-fifo-prefetch-comparison.json).

Hidden-animation native-input retest failed minimum trajectory coverage after a five-second image stall. New phase timings localized the following long delay to settling 120 native frames (123 seconds), while sampled emulator workers were mostly asleep. Cause remains unresolved; diagnostics and a focus change make this unsuitable as a clean gain comparison. All measured FPS gates failed. [Stall evidence](benchmarks/browser-2026-09-13-hidden-animation-native-stall.json).

FIFO-copy core `c80b5255` warmed off/on/on/off measured 56.70/57.24/57.93/58.67 simulation FPS, with 112 matching input/gameplay fingerprints. Mean change -0.175%, opposing pairs: keep disabled. Last baseline visible rate was **58.44 FPS**; all trials fail. [Warmed FIFO comparison](benchmarks/browser-2026-09-13-fifo-copy-warm-comparison.json).

MSR-cache core `9491b1b2` warmed off/on/on/off measured 58.47/58.84/59.10/59.33 simulation FPS, with 112 matching input/gameplay fingerprints. Opposing pairs and +0.116% mean do not establish a gain; keep MSR cache off. Last baseline distinct visible FPS was **59.10**, and all measured trials failed. A single passing warmup does not meet the goal. The first comparison had an unresolved five-second image stall. [Warmed MSR results](benchmarks/browser-2026-09-13-msr-cache-warm-comparison.json).

Core `f99d96af` validated the native polling harness: 103 shared input/gameplay fingerprints and all polling gaps matched. Fixed-address off/on/on/off simulation FPS was 53.45/52.60/56.14/56.60, both pairs favor baseline. Last baseline distinct visible FPS was 56.34 at 960×720. Every FPS gate failed. This is a different workload from earlier browser-timer controls. [Matched polling comparison](benchmarks/browser-2026-09-13-frame-input-refined-comparison.json).

Core `bc7f6fb0`: fixed-state-address replay passed all 107,036,212 bytes and emulated ticks. Warm active ABBA measured 58.3333/58.5347/58.3005/58.8661 simulation FPS off/on/on/off. Mean 58.60 off versus 58.42 on (-0.31%), with opposing pair results; keep disabled. Distinct visible rates were 58.13/58.23/58.13/58.70 FPS. All gates failed. [Warmed comparison](benchmarks/browser-2026-09-13-constant-state-warm-active-fountain.json).

Core43829cb2 wider-map replay passed107,036,212bytes/120frames with no tickdifferences. Its first active ABBA favoredwide+1.61%, but a second warmed ABBA measured59.2666/59.1988/59.4323/59.4993 simulationFPS off/on/on/off: bothpairs slightlyfavorbaseline (-0.113%mean). Collision misses fellfrom~3million tozero without a repeatable FPSwin. KeepwideOFF. Latest baseline visibleFPS59.10/59.30, allgates stillFAIL. [Warmed active comparison](benchmarks/browser-2026-09-13-wide-map-warm-active-fountain.json).

Coreeae95353 grouped paired-memory checks passed120-frame full-state/tick replay, but the warmed ABBA measured57.73/58.30/57.77/57.80 simulationFPS off/on/on/off. Mean gain+0.46%, opposing pairs, all gates failed. Keep disabled. [Warmed comparison](benchmarks/browser-2026-09-13-paired-memory-hoist-warm-fountain.json).

Core84a3cf8e with retained CPU settings and low models measured **53.07 / 51.80 simulation FPS** and **53.04 / 51.80 distinct visible FPS** in two-active-controller Fountain Ice Climbers trials. Both fail. Vector caching plus arithmetic SIMD was slower in both CPU9 timing pairs (mean56.02→54.65, -2.44%) and remains disabled. [Active two-player timing](benchmarks/browser-2026-09-13-low-model-two-human-inputs.json), [rejected CPU timing](benchmarks/browser-2026-09-13-vector-arithmetic-fountain.json).

The previous measured core was `f7a2a4b67e696b1de11884d879dc0d0cbfe98807b16ba3f4f8c2e647d0d2e3b5`.
With low-detail models and the hidden-scenery animation experiment, the latest measured Fountain CPU9 trials reached **58.55 / 59.23 simulation FPS** and **58.28 / 58.97 distinct visible FPS**. Every target gate still failed. The on/off/off/on comparison favors skipping hidden joint animation in both pairs: mean58.02→58.89 FPS (+1.50%). Its600-frame gameplay/camera replay passed. A first warmup suffered a4.996-second image stall; the comparison later recovered. This candidate needs repeated stability validation. [Animation timing](benchmarks/browser-2026-09-13-hidden-animation-fountain.json), [replay](benchmarks/browser-2026-09-13-hidden-animation-replay.json), [stall](benchmarks/browser-2026-09-13-hidden-animation-stall.json).

The earlier model-detail core was `28a5899ca069b3907eaa9ff6e5b8a35321261900180875015e25de5bd18c2857`.
Its normal/low/low/normal model-detail comparison measured **48.87 / 54.23 / 56.10 / 53.23 simulation FPS** on Fountain with an Ice Climbers mirror and a native level 9 CPU. Both pairs favor low detail; means were 51.05 versus 55.17 FPS (**+8.06%**). All trials still fail 720p60. A 600-frame same-input replay preserved all four actors, RNG, platforms and camera. [Model timing](benchmarks/browser-2026-09-13-model-detail-fountain.json), [replay](benchmarks/browser-2026-09-13-model-detail-replay.json).

The earlier active-input core was `7fcee65d561ffe23bfa2e172c50b4629927cf6699ba66920af719f4794094464`.
It retains the corrected paired-single scalar alias behavior and adds live
QA input for two human controller ports. Its 120-frame delayed-input replay
matched all 109,035,106 machine bytes and emulated ticks across browser
configurations. This is not whole-emulator equivalence against native Dolphin.

On Fountain, Ice Climbers versus Ice Climbers, **two active scripted human
controller tracks** with native partner AI, reflection/scenery off and true
720p output, repeated trials measured **50.87 / 50.90 simulation FPS** and
**50.77 / 50.84 distinct visible FPS**. Both players exercised many native
actions. Both runs fail the target; about 18% more simulation throughput is
needed before rollback headroom. This does not establish a causal difference
from the earlier CPU9 workload. [Active two-player results](benchmarks/browser-2026-09-13-fountain-two-human-inputs.json).

Two earlier 30-second Battlefield trials met the image gate at 59.64 and 59.70
visible FPS using a bounded two-image presentation queue. That is a narrow
workload result. It does not establish all-stage/all-character performance or
physical input-to-photon latency. Queue receipt-to-canvas age was about 20 ms.
[Pacing comparison](benchmarks/browser-2026-09-12-pacing-recovery-abba.json).

## Where time goes

Corrected core `b317c2cc` warm30-second profile: CPU execution **23.001s**, hardware advance **4.645s**. Nested FIFO scheduling/preparation **2.196s** includes decode **1.556s**; VI **0.889s**, audio DMA **0.162s**, DSP **0.0068s**, direct CPU/GPU wait **0.0142s**.1510last-PC samples again emphasize animation, matrix/material setup and particles; this is not exact self-time attribution. Profiling lowered simulation to42.23FPS and cannot establish acceptance. [Warmed corrected-core profile](benchmarks/browser-2026-09-13-corrected-cpu-warm-profile.json).

Core `84d4f3da`, 30-second native-input profile: CPU execution **23.079s**, hardware advance **4.604s**. Within hardware callbacks, FIFO scheduling/preparation took **1.851s**, VI **1.090s**, audio DMA **0.205s**, and DSP **0.008s**. Direct CPU/GPU synchronization was **71ms**. These are inclusive profiled times, not additive production shares. The page stayed visible and focused. [Native event profile](benchmarks/browser-2026-09-13-native-event-profile.json).

Core `c80b5255` repeated the CPU diagnostic: CPU execution 23.703s and advance 4.155s in 29.999s; direct CPU/GPU synchronization 26.39ms. This profile used browser-timer controls, not the newer native polling harness. It confirms broad CPU pressure but does not isolate the hardware-event contribution yet. Sampled FIFO copy durations are too short and biased to give a trustworthy exact cost share; the clean ABBA comparison establishes no repeatable win. [Profile](benchmarks/browser-2026-09-13-fifo-copy-cpu-profile.json).

The latest two-active-controller diagnostic on coreeae95353 measured CPUexecute23.729s and hardware-event advance4.095s in30.013s; CPU GPU synchronization was9.521ms. Scopes overlap and profiling distorts FPS.1,514 last-PC samples remain distributed across rendering/animation/matrix code. The most sampled scheduler loop already uses Dolphin idle skipping; its residency is not proven wasted work. [Fresh active profile](benchmarks/browser-2026-09-13-active-cpu-profile.json).

A recent host sample showed one emulator worker consuming a full CPU core;
the main browser thread used about 7% of a core in the same 1.5-second interval.
The 30-second guest-PC sample contained 1,506 observations. Rough name-based
groups put 48% in matrices, rendering/material setup and animation. Largest
functions were `SetupEnvelopeModelMtx` (3.19%), `HSD_FObjInterpretAnim` (3.05%) and
`HSD_TExpSetReg` (1.93%). These are samples of the last committed PC, including
host waits; they are not exact instruction timings or additive CPU cost shares.
[Function sample](benchmarks/browser-2026-09-13-fountain-cpu-functions.json).

Removing dormant emulator features mainly reduces build/download/startup work.
The measured wins come from executing less Melee rendering work or reducing
translation overhead in code the game actually runs.

| Experiment | Measured result | Decision |
| --- | --- | --- |
| Fountain reflection off | Mean simulation 38.63 → 51.28 FPS on core a854 | Retain opt-in; cosmetic replay passed |
| Fountain scenery off, reflection already off | 51.49 → 56.80 FPS on a854 | Retain opt-in; cosmetic replay passed |
| Existing integer register cache | 49.75 → 51.22 FPS on d516 | Keep enabled |
| Compact floating-point register cache | 37.17 → 35.60 FPS on a854 | Keep disabled |
| 200% / 150% internal rendering | 51.50 / 55.10 / 56.60 / 57.17 FPS on d516 | Upward drift; no repeatable gain established |
| Compact integer register locals | Full replay passed; ~0.4% mean difference with opposing pair results | Keep disabled |
| Hidden scenery joint animation skipped | 58.02 → 58.89 FPS mean onf7a2a4b6;600-frame replay passed | Candidate only; first warmup had a severe image stall |
| Dynamic shadows removed (diagnostic only) | 57.54 → 58.32 FPS mean; reverse pair only0.069FPS | Keep full shadows |
| Native lower-detail models | 51.05 → 55.17 FPS mean on28a5899c, both pairs favor low; 600-frame replay passed | Retain opt-in, broader validation pending |
| SIMD paired memory | 51.53 / 54.44 / 55.00 / 56.23 FPS off/on/on/off | Keep disabled: opposing pairs and upward drift |
| SIMD paired arithmetic | 50.43 / 52.77 / 54.50 / 55.64 FPS off/on/on/off; full replay passed | Keep disabled: upward drift |

Numbers come from separate controlled comparisons and must not be added or
compared across cores as cumulative gains. Both Fountain cosmetic comparisons
matched 600 identical-input frames of all four fighter/partner actors, player
slots, RNG, moving platforms and native camera. This is observable gameplay
validation, not full graphics-state equivalence or exhaustive move coverage.

One scale attempt suffered multi-second GPU image readback stalls and was
aborted. A fresh attempt did not reproduce those stalls. Its cause remains
unresolved; it is not evidence of a resolution optimization.

## Remaining work

1. Add Frozen Pokémon Stadium as the tournament Stadium mode. A checked opt-in patch now freezes only the initial neutral map by disabling the transformation controller while it is idle; transition-duration performance, long-run stage state, native camera framing, and normal match behavior still need browser validation. This is Stadium-only and does not advance the all-stage FPS requirement.
2. Profile the current active workload and target measured CPU cost. Grouped paired-memory checks passed full replay but failed to establish a repeatable speedup in two ABBA comparisons. Vector-only and vector+arithmetic120-frame full-state/timing replays passed. The full bundle with paired-memory SIMD failed on six GPU texture bytes; unchanged-codegen control passed. Cause unresolved. Arithmetic subset timing lost both pairs and stays disabled.
3. Repeat native low-detail mesh performance with two active players. All26 starts passed loading/input/model-table smoke, not exhaustive move/costume or sustainedFPS coverage. Its first 600-frame replay and both CPU9 timing pairs passed their respective correctness/gain checks, but every FPS target gate failed.
4. Keep both SIMD experiments disabled. A fresh isolated memory-SIMD replay passed120frames, but a prior combined-codegen tick discrepancy and snapshot stall remain unexplained; timing did not establish a repeatable speedup.
5. Continue optimizing measured CPU work shared by all stages; the heavy active matchup remains below 60. Measure hidden background animation updates on Battlefield and Final Destination, but retain them only if controlled pairs show a repeatable gain; Yoshi's isolated hidden animation did not.
5. Measure active normal inputs, all characters and tournament stages, longer
   sessions, and browser rollback headroom. Existing idle-versus-CPU samples
   are not sufficient for competitive workload coverage.
6. Measure input-to-image pipeline delay; physical input-to-photon latency
   requires separate evidence.
7. Reconcile the private lab package with the reproducible production sources
   and verify deployment packaging. No production deployment has been made.

Full history: [lab notebook](BROWSER-720P60-LAB.md).

[Shadow diagnostic](benchmarks/browser-2026-09-13-shadow-diagnostic-fountain.json), [low-model roster smoke](benchmarks/browser-2026-09-13-low-model-roster.json).
