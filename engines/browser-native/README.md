# Browser-native Melee port

This development target links original decompiled gameplay and HSD code directly
into WebAssembly and renders through WebGL, without Dolphin or PPC dispatch.
Current fixtures cover all 26 selected fighters (27 components including Nana),
all 25 copied-ability packages, original tournament stage callbacks, camera and
HUD. Hosted assets load automatically; a player-supplied ISO is never required.
The local disc is used only by the development extraction tools.

The normal hosted route creates only authenticated human 1v1 rooms. CPU play is
not exposed and the relay rejects attempts to enable it. Development probes may
opt into a separately scoped CPU room with `?diagnostic-cpu=1`; normal sessions
cannot resume that room token. If the relay is unavailable, the product fails
closed rather than silently entering a different game mode.

Original paused L+R+A+Start now exits through Melee's native `NO CONTEST`
outcome. The result is confirmation-gated in rollback rooms, displayed without
inventing a winner, and returns both peers together through the result actions.

This is not a complete competitive release. Full menu/match routing, sound effects,
controller calibration, broader retail parity and static release
integration remain unfinished. Simulation steps and GPU draw submissions are
measured separately from distinct presented frames and input-to-photon latency.
See [current status](../../docs/BROWSER-NATIVE-PORT-STATUS.md) for the latest
checkpoints and [TEV scope](TEV-NOTES.md) for shader validation. Later sections
retain historical bring-up details; their pending-work statements describe those
older checkpoints.

The interactive preview plays original hosted menu/stage music through Web Audio.
The original C selects tracks, including stage alternatives; a worker decodes
HALPST/DSP samples without running the decoder on the gameplay thread. Playback
starts after a keyboard/pointer gesture, preserves loop points and pause position,
and suspends while the tab is hidden. This is music support, not complete AX/DSP
sound-effect or mixer parity. The stream backend reports errors independently
from game startup; it never requests a player's ISO.

`prepare-fixtures.mjs` now prepares the ten menu/tournament music assets as well.
Existing development output can be updated with
`node scripts/native-port/prepare-music.mjs /path/to/development-fixture.iso`.
Assets stay in ignored `dist/native-port/audio`. Run
`node scripts/native-port/probe-product-menu.mjs --music` for actual browser
output, transport and menu-to-match checks. `--stage=2/3/8/28/31/32` selects a
legal stage (pass one numeric value). The independent sample/loop comparison is
`node scripts/native-port/verify-hps-reference.mjs /path/to/vgmstream-cli`.

Immutable model geometry is cached per renderer by default. This reduces repeated
asset decoding without caching native object pointers or animated poses. Use
`--no-cache-models` with the constructor probe for the comparison control.
Measured average submission time was unchanged; paired runs had fewer submissions
over 16.67 ms. See the status evidence before interpreting this as an FPS gain.

Original pause artwork is fetched automatically with the other hosted assets.
The original VS routines retain owner-only unpause, debounce, process masks,
match-clock gating and pause camera controls. The port adapts one mismatched
PowerPC callback signature; it does not adjust camera pitch or bounds. Audio
feedback remains unfinished; the LRAS results/menu transition is covered in the
product rollback lifecycle.

```sh
node scripts/native-port/probe-constructor.mjs --character=Ca --input --pause-input --stage-callbacks --render-steps --hardware
node scripts/native-port/probe-constructor.mjs --character=Ca --stage-callbacks --live --live-pause --frames=900 --hardware --defer-gpu-errors
```

## Interactive native menu preview

Prepare the hosted fixtures and the existing extracted UI artwork, then run:

```sh
node scripts/native-port/prepare-menu-ui.mjs --assets=/absolute/path/to/.melee-assets
MELEE_NATIVE_PORT=3340 node scripts/native-port/serve.mjs
```

Open [the native menu preview](http://127.0.0.1:3340/character-menu.html?interactive=1).
It opens a human-only room. Two original native cards leave the center for room
controls; original hands render over the panel.
Only the six tournament stages are selectable, including the random choice.
The original rules are four stocks, eight minutes, no items and singles. Other
modes and rules/name submenus are inaccessible in the player-facing profile.
The no-query page retains the unrestricted diagnostic menu API.

Established controls are WASD movement, P attack/select, O special/cancel,
Space jump, I/L shields, U grab, K/M/comma/period C-stick, Shift half-stick,
Enter Start and Esc native pause. The keyboard icon opens the existing 3D view
and per-player tap-jump setting. Turning tap jump off gates only native stick
jump checks; stick Y, button jumps, CPU and Nana behavior remain intact.
The setting persists locally. Controls work with the original animated hand or
mouse. A connected standard gamepad maps to the local network seat; physical
adapter calibration remains separate work.

The Node preview server includes an input-only WebSocket relay. The guest enters
the owner's room code and both players Ready.
Each browser runs native C/WASM and WebGL. Three-frame input lockstep and scene
barriers are retained as a diagnostic fallback; the product defaults to
authenticated local prediction, correction and independent WASM presentation.
This is not physical input-to-photon certification.
Guest refresh preserves room/seat but restarts both clients at character select.
Owner-only kick revokes the guest token. Tokens stay private in session storage.
If the room service is unavailable, normal startup fails closed; no CPU match,
fake room code, remote opponent or player-supplied ISO is substituted. An
explicit `?diagnostic-cpu=1` URL retains the local CPU development fixture.
A production relay/signaling deployment remains separate from static Vercel assets.

The same input owner survives asynchronous menu/match asset loading. Original
Ready/Go owns the initial input and clock gates. The native canvas is 960×720,
preserving 4:3 framing and the original camera. Results, rematch, character
return and LRAS are integrated; sound effects and public release integration
remain unfinished.

```sh
node scripts/native-port/probe-product-menu.mjs
node scripts/native-port/probe-product-menu.mjs --tap-on
node scripts/native-port/probe-product-menu.mjs --static-only
node scripts/native-port/probe-native-rooms.mjs
node scripts/native-port/probe-character-menu.mjs
```

These browser probes use real key/mouse events and original hit tests; they do
not manually advance simulation or assign gameplay state. The old
`probe-interactive-menu.mjs` describes the superseded diagnostic binding profile;
use the product probe for the current interactive entry. Instrumented correctness
runs and CPU submission timings do not measure displayed FPS or input-to-photon.

## Original costume selection

The match fixture loads selected costume archives using the game's original
filename and symbol tables. `--costume=N` and `--opponent-costume=N` select
zero-based indices with `--stage-callbacks`. Mirror players can share a fighter
package while retaining distinct model descriptors, textures and material
animations. Zelda/Sheik and Popo/Nana preload both components for each selected
color. Kirby's body-copy costumes use his own color index; Game & Watch's
shared filenames are installed once. Red Falcon's original locale-dependent
name resolves specifically to the USA asset.

`node scripts/native-port/probe-costumes.mjs` audits every original costume
slot, keeps each fighter's colors resident together, constructs two simultaneous
HSD model instances per color, and checks archive caching and cleanup. This is
asset/lifetime coverage, not gameplay parity or frame-rate certification.

```sh
node scripts/native-port/probe-constructor.mjs --character=Fx --costume=2 --opponent-costume=1 --input --stage-callbacks --render-steps --hardware --verify-vertices
node scripts/native-port/probe-constructor.mjs --character=Kb --opponent=Fc --costume=2 --opponent-costume=1 --kirby-copy=acquire --input --stage-callbacks --render-steps --hardware --verify-vertices
```

## Original character-select integration

`character-menu.html` automatically loads the original USA CSS, extra-menu,
SIS and card archives. Original OnEnter/OnFrame/OnExit callbacks own roster hit
tests, hands, tokens, character/costume selection, confirmation and cancellation.
Models and SIS render in the original camera's GX link/pass order. The host
exposes disconnected ports separately from neutral controller samples.

Run `node scripts/native-port/probe-character-menu.mjs` after preparing fixtures
and building. It selects all 25 roster tiles (Zelda retains the shared tile),
checks a mirror match's distinct costumes and X costume change, rejected Start
without selections, the native deadzone, disconnected hands and held-B cancel.
Fifteen visits reuse one runtime; every scene leaves zero GObjs and processes.
Four tracked allocations remain: the two original resident card archives and
headers. Card work areas are also intentionally persistent. Scene cleanup resets
SIS objects before deleting model owners; the original OnExit alone frees the
text arena, avoiding a double free.

This is an explicitly muted diagnostic, not a public playable menu. The host
must accept `diagnostic-muted` before bank-load/wait calls can be bypassed;
without it they execute the original loader. No bank readiness or voice playback
is fabricated. Actual audio, rules/name submenus, results/rematch routing,
saved preferences and the public two-seat layout remain
unfinished. Complete archive conversion is not proof those submenu callbacks run.

The expanded CSS probe also carries original VS structures through
`gmVsMelee_ExitCss`, `gmVsMelee_EnterSss`, `gmVsMelee_ExitSss` and
`gm_80167BC8`. All six tournament stages preserve selected characters/costumes
and produce four-stock, eight-minute, no-items settings. Canceling stage select
restores the CSS choices. `nativeCharacterMenu.toStage()` loads its hosted archive
and exposes `nativeStageMenu`; `matchSelection()` reads the resulting setup.
Stage icon constraints are resolved by the first original draw before
world-space hit-target inspection.

After stage confirmation and `nativeStageMenu.finish()`,
`nativeCharacterMenu.startMatch()` consumes the original `StartMeleeData` in
the same WASM instance. It loads the selected packages automatically and reuses
the menu canvas. `fn_8016DCC0` initializes players directly from that setup;
`Player_80031AD0` constructs them without replacing their character, color,
subcolor, handicap, stock or controller settings. The original held-A Zelda/Sheik
entry check receives the current normalized controller sample. Both forms and
the Climbers' partner are preloaded.

`constructor-runner.mjs` shares the existing construction/render path with the
standalone diagnostic. Menu startup skips the standalone all-roster self-test;
it loads common data and the selected fighter families. Ready/Go runs on the
live frame scheduler with its original input and clock gates. The separate
post-intro fixture still unlocks input explicitly. Fountain uses the retained
star/scenery/black-reflection cosmetic profile; moving platforms and camera
remain original. Stadium uses the retained frozen-transformation profile.

```sh
node scripts/native-port/probe-character-menu.mjs --match --stage=31
node scripts/native-port/probe-character-menu.mjs --match --pair=15,12 --hold-a
```

The first command selects a two-color Fox mirror and checks native Ready/Go and
fresh browser-keyboard movement, jump and aerial attack. Stage IDs are 31/32/28/
8/2/3 for Battlefield/Final Destination/Dream Land/Yoshi's/Fountain/Stadium.
The second selects Zelda and Climbers, then holds A at startup to exercise the
original Sheik entry. Without `--hold-a`, Zelda remains the initial form.
These instrumented tests are not FPS or input-to-photon measurements. This is
still a diagnostic API: automatic interactive menu scheduling, results/rematch,
audio and public-route integration remain unfinished.

## Original stage-select integration

The native stage-select diagnostic now loads `MnSlMap.usd` automatically and
runs original OnEnter/OnFrame/OnExit callbacks. It draws the original camera,
lights, fog, stage icons, hover labels, confirmation and vertex morph animation.
The six tournament choices and B cancellation are tested through controller
samples. Hover-label destruction and address reuse require refreshing live
polygon bindings even when the model descriptor stays the same.

`menu.html` is a diagnostic page, not a replacement for the public play route.
Its console API `nativeMenu` supplies step/draw/read/finish for the automated
probe. Run it with `node scripts/native-port/probe-menu.mjs` after preparing
fixtures and building the fighter-init target. Each probe starts a fresh runtime;
finish disposes the renderer before original scene cleanup. The combined CSS,
stage and match handoff is described above; results routing remains pending.

The music device boundary requires an explicit host receiver. This diagnostic
records and declines music requests, so it does not claim audible playback.
Console DVD/ARAM calls remain guarded. The test does not cover streaming audio,
results routing or restoring saved preferences.

## Native SIS text prerequisite

`sis.html` loads the original USA character-select SIS archive automatically and
runs its original interpreter, layout, kerning, custom glyphs and GX drawing.
Run `node scripts/native-port/probe-sis.mjs` after building. The diagnostic draws
all 85 archive entries over the original stage-select camera and checks GPU
vertex transforms, packed operands, nested style restoration, return addresses,
SDK texture defaults and cleanup. It also exercises the original dynamic string
writer. It is not a working character-select flow or a performance benchmark.

SIS command and style-stack operands remain big-endian byte streams, including
strings created at runtime. Only archive pointers are relocated to native order.
The reproducible C adapter uses byte reads for all 21 packed operand loads and
signed-word conversion before four low-byte stores. Direct float-to-byte casts
changed negative fractional spacing on WASM. GXInitTexObj now provides the SDK's
filter/LOD defaults, which SIS uses without a separate GXInitTexObjLOD call.

The renderer retains the existing pixel state for SIS, matching its original
partial state changes; the diagnostic draws native menu models before the text.
The overlay hook is diagnostic only. Character select must traverse text, hands
and models in original GX link order when its lifecycle is connected. Memory-card
artwork, sound-bank loading and complete CSS scene routing remain pending.

## Reproduce

The live fixture now samples buttons, main stick, C-stick and analog shoulders
immediately before simulation. Keyboard: arrows move, Alt halves movement, Z
attacks, S uses special, X/V jump, C sends native Z grab, I/J/K/L aim the C-stick,
Shift keys shield, T taunts. Standard gamepads use the existing browser button
layout; native fighter code retains its deadzones. Full trigger travel supplies
the digital click; partial pressure stays analog. Nonstandard GameCube adapters,
physical calibration and native menu integration remain pending. Enter/Escape
and standard-gamepad Start use the original VS pause routines.

```sh
node scripts/native-port/probe-constructor.mjs --character=Ca --input --stage-callbacks --controller-input --render-steps --hardware
node scripts/native-port/probe-constructor.mjs --character=Ca --stage-callbacks --live --live-controller --frames=900 --hardware --defer-gpu-errors
```

Kirby’s Yoshi copy retains four native hat-animation graphs and a captured
fighter egg shell sharing the original zero-state Article model. The full probe
checks misses, ground/air capture, escape, copy loss and reacquisition:

```sh
node scripts/native-port/probe-constructor.mjs --character=Kb --opponent=Ys --input --kirby-copy=swallow --stage-callbacks --render-steps --hardware
node scripts/native-port/probe-constructor.mjs --character=Kb --opponent=Ys --input --kirby-copy=contact --stage-callbacks --render-steps --verify-vertices --hardware --probe-seconds=600
```

These are compatibility checks. Item-swallow eggs, other costumes and exhaustive
interactions remain unverified. All copied-ability packages now import, but the
complete competitive release and presented-FPS/latency gates remain unfinished.

Kirby's Game & Watch copy imports its native replacement body, packed colors,
fighter/item outlines and Chef food/pan Articles. Rendering needs the original
stage/camera passes; the simpler diagnostic pass loop omits its outlines:

```sh
node scripts/native-port/probe-constructor.mjs --character=Kb --opponent=Gw --input --kirby-copy=swallow --stage-callbacks --render-steps --hardware
node scripts/native-port/probe-constructor.mjs --character=Kb --opponent=Gw --input --kirby-copy=contact --stage-callbacks --render-steps --verify-vertices --hardware --probe-seconds=600
```

The copy has no extra body joint. Its outline lookup has one row, but the normal
Kirby visibility path visits two. In the retail archive the second row overlaps
a relocated MEM1 pointer, which is negative as a signed variant count and skips
the loop. A low WASM pointer instead overran the display list. The importer
verifies that exact alias and supplies a second negative-count/null row, leaving
the native callbacks unchanged. The source control flow was checked against the
development disc's `ftKb_UnkIntBoolFunc0` and `ftParts_80074D7C` instructions.

Kirby's Jigglypuff copy imports its native replacement body and three-node
dynamic chain. The input probe checks partial ground/air Rollout, full ground
charge, turns, recovery, copy loss and reacquisition:

```sh
node scripts/native-port/probe-constructor.mjs --character=Kb --opponent=Pr --input --kirby-copy=swallow --stage-callbacks --render-steps --hardware
node scripts/native-port/probe-constructor.mjs --character=Kb --opponent=Pr --input --combat --kirby-copy=contact --render-steps --verify-vertices --hardware --probe-seconds=600
```

Full-charge recovery starts near stage center and steers with normal stick
input. The probe rejects death/rebirth states and lost copies; a late-steering
fixture that rolled offstage was rejected without changing gameplay.

Kirby's Mewtwo copy imports its native replacement body, seven-node tail and
ten-state Shadow Ball. Normal input verifies partial/full charge storage,
ground/air release, copy loss and reacquisition:

```sh
node scripts/native-port/probe-constructor.mjs --character=Kb --opponent=Mt --input --kirby-copy=swallow --stage-callbacks --render-steps --hardware
node scripts/native-port/probe-constructor.mjs --character=Kb --opponent=Mt --input --combat --kirby-copy=contact --render-steps --verify-vertices --hardware --probe-seconds=600
```

The initial harness expected full projectile state nine; source inspection
confirmed charge seven launches state eight. Only the test expectation changed.
This imports the default Kirby costume; other copied costume colors remain.

Kirby's Ice Climbers copy uses the native hat, LThumbNb hammer accessory, ice
Article and particle bank 46. Test the actual Nana partner with
`--kirby-copy-nana`; Nana is not spawned as a separate selectable character:

```sh
node scripts/native-port/probe-constructor.mjs --character=Kb --opponent=Pp --input --kirby-copy=swallow --stage-callbacks --render-steps --hardware
node scripts/native-port/probe-constructor.mjs --character=Kb --opponent=Pp --input --kirby-copy=swallow --kirby-copy-nana --stage-callbacks --render-steps --hardware
```

Kirby's Bowser copy loads its native dynamic hat, flame Article and separate
particle bank. Ground/air breath, fuel depletion/recharge, copy loss and
reacquisition use original C and normal controller input. Run:

```sh
node scripts/native-port/probe-constructor.mjs --character=Kb --opponent=Kp --input --kirby-copy=swallow --stage-callbacks --render-steps --hardware
node scripts/native-port/probe-constructor.mjs --character=Kb --opponent=Kp --input --combat --kirby-copy=contact --render-steps --verify-vertices --hardware --probe-seconds=600
```

These integration probes do not measure presented FPS or input-to-photon latency.

Kirby's base package imports four native Articles (Cutter beam, Hammer, loose
star and swallowed-fighter star), the separate capture joint, and effect bank 5
with nineteen particle commands, six texture groups and nine model effects.
The original constructor and controller move suite run without Dolphin:

```sh
node scripts/native-port/probe-constructor.mjs --character=Kb --input --kirby-moves --render-steps --hardware
node scripts/native-port/probe-constructor.mjs --character=Kb --input --kirby-move=cutter --render-steps --verify-vertices --hardware
```

This checks five aerial jumps and ground/air inhale release, Hammer, Final Cutter
and Stone. The jump test holds the ordinary jump input through the original
command-script eligibility gates. Mario, Luigi and Dr. Mario copies additionally import their original
hat/visibility descriptors and projectile Articles. Mario and Dr. Mario share
copy effect bank 32; Luigi uses bank 37. Dr. Mario retains all six pill states. These tests use
ordinary controller inputs for capture, swallow/spit, copied ground/air fireball,
taunt loss and reacquisition; they do not assign copy kind or action states.
`--kirby-copy=contact` additionally walks both fighters into range and checks
that the copied projectile changes the opponent’s damage without changing stocks.
Use `--opponent=Lg` or `--opponent=Dr` for the other two imported copy packages.
Falcon and Ganondorf copies import their original hats and two-model punch
effect banks (38 and 47). Use `--opponent=Ca` or `--opponent=Gn` with the same
lifecycle command. Their `--kirby-copy=contact` test checks damage and hitlag at
first contact: an idle target can be knocked offstage before a long recovery
window ends. The separate full lifecycle test covers grounded/air attacks,
recovery, copy loss and reacquisition.

Ness and Peach copies use two original Articles each. Their copy-effect table
entries have no separate file; the original loader's no-file path is retained.
Use `--opponent=Ns` or `--opponent=Pe` with the lifecycle command. Ness's test
charges PK Flash, releases it in the air, loses the copy and reacquires it.
Peach's test covers ground/air Toad, loss and reacquisition. The contact modes
steer PK Flash toward a normally jumping opponent, or use the opponent's jab
to trigger the original Toad counter and spores. Every position and action
change comes from controller inputs and original simulation. Other copied
abilities remain pending.

Fox's copy (`--opponent=Fx`) imports its two-state laser, nine-state Blaster,
four-joint hat and model-only muzzle effect bank 33. The lifecycle test covers
ground/air firing, release recovery, loss and reacquisition. Contact mode uses
40-unit separation so the laser exists for an observable frame before hitting;
it also checks that Fox's copied laser causes damage without hitlag.

Falco's copy (`--opponent=Fc`) uses the original body-costume path rather than
a separate hat JObj. The importer retains six visibility rows, texture animation
indices, the original part-insertion mask, extra model and both Articles. The
default Kirby costume also loads `PlKbNrCpFc.dat` and its material animation;
other Kirby costume colors still need their corresponding files integrated.
Original callbacks add two active bones, 22 costume DObjs and five extra DObjs,
then remove them on copy loss. The renderer follows the active part ordering
and binds appended polygons by their resident geometry descriptors, rejecting
missing or ambiguous bindings. It does not change original visibility or draw
ordering. Ordinary models keep their existing binding path.

The Falco copy lifecycle covers ground/air firing, repeated laser input, copy
loss and reacquisition. Its contact check requires native hitlag, unlike Fox's
laser. Per-model draw telemetry is enabled only in copy probes; body resources
must disappear when the original copy loader removes the body parts.

Zelda and Sheik copies (`--opponent=Zd` / `Sk`) import the original hats,
dynamic chains and shared model-effect bank 21. Zelda's root holds dynamics at
+12 without Articles; Sheik's root holds separate thrown/held needle Articles
and dynamics at +20. Needle probes cover ground/air firing, shield cancellation,
storing three and six needles, resuming charge, firing, copy loss and reacquisition.
Charge diagnostics only read the original counter and held-item pointer.

`--kirby-copy=reflect` starts against Zelda, acquires her copy, and transforms
the donor into Sheik through normal down-B input. It verifies that Nayru transfers
needle ownership to Kirby, reverses horizontal velocity and increases damage,
while protecting Kirby. Original needle clanks remain active, so this does not
require a reflected volley to hit the donor. `--kirby-copy=reflect-control`
uses the same donor-input sequence without Nayru and requires damage to Kirby.

Marth and Roy copies (`--opponent=Ms` / `Fe`) import the original hat,
separate temporary sword and two-model effect banks 20/48. Their roots contain a
sword descriptor at +12 and hat dynamics at +16, with no projectile Articles.
The importer preserves three/four two-node dynamic chains and omits only each
pinned exporter's unreachable scene wrapper. The original C attaches the sword
to Kirby's right thumb, updates it during charge/release, and removes it on
recovery. Accessory binding checks its exact resident descriptor before drawing.
The lifecycle covers partial ground/air release, full-charge automatic release,
copy loss/reacquisition and dynamic-pool recovery. Charge counters are read-only
diagnostics. Copy probes count actual sword submissions and reject GPU resources
that survive native sword removal; this is not a presentation-FPS measurement.

Donkey Kong's copy (`--opponent=Dk`) uses that body-costume path with the original
zero insertion mask, 46 active bones, 17 costume DObjs and five extra DObjs.
Its 24-byte root has no Article slots; bytes immediately following it belong
to other asset data. `PlKbNrCpDk.dat` supplies the default copy costume, and
effect bank 39 supplies the two original ground/air Giant Punch model effects.
The probe uses normal B/shield/jump inputs to charge, cancel/store, resume,
and fire partial/full ground and air punches. Cancellation takes effect at
the original swing boundary, so a request at charge 3 can store charge 4.
Stored charge is read from the original fighter state and must reset after
firing and copy loss/reacquisition. No charge counter or action state is assigned.

Pikachu and Pichu copies (`--opponent=Pk` / `--opponent=Pc`) retain three
dynamic hat chains, the ground controller item and visible Thunder Jolt child,
and shared particle bank 36. The lifecycle test checks exact pool consumption
(10 / 8 nodes), release on taunt, ground/air attacks and reacquisition. Pichu
keeps one-point recoil for each copied neutral special. The native match harness
initializes the original 320-node dynamics pool before stage and fighter setup;
the roster regression compares every constructor's live chain counts with the
imported descriptors. The corrected-core Peach/Fountain 60-second sample has
3,600 simulation steps but only 3,513 draw submissions; it remains below the
rendering target. Submission timing and a CPU profile are recorded in
[the dynamics checkpoint](../../docs/benchmarks/browser-2026-09-16-native-port-kirby-copy-jolt.json).

Link and Young Link copies (`--opponent=Lk` / `--opponent=Cl`) import the
original hat, three dynamic nodes, arrow and six-state bow animation data.
The arrow's two separate attachment models retain their native owner and
lifetime. Neither copy has a separate effect-bank file. The lifecycle probe
holds B until the original full-charge state, releases it, fires in the air,
loses the copy and reacquires it. Embedded arrows can remain after recovery;
the probe waits for bounded native retirement without deleting them. Contact
mode turns the target away through controller input so its physical shield
does not block the damage check. The native shield behavior remains active.

Samus's copy (`--opponent=Ss`) imports the original nine-state Charge Shot
Article, hat and effect bank 34. Both exported material/shape animation external
chains are initialized to null at the original archive-loader boundary; the
same normalized archive feeds model discovery. The lifecycle probe exercises
partial ground/air shots, shield cancellation and stored charge, resuming to
full charge, full ground/air shots, copy loss and reacquisition. Three read-only
diagnostic fields expose stored charge, its original maximum and charging item;
the probe never assigns these values or changes move callbacks.

USA 1.02 `EfKbSs.dat` contains an out-of-range palette word in texture group 0.
The original loader relocates it without reading the palette. A narrowly checked
import case preserves that exact word and records it as `relocationOnlyPalettes`.
Other invalid extents still reject, and actual rendering of that palette still
fails the runtime memory bounds check. Do not invent a replacement palette or
generalize this exception to other archives. Passing the exercised charge paths
does not prove every possible particle-script path avoids this reference.

```sh
node scripts/native-port/probe-constructor.mjs --character=Kb --opponent=Mr --input --kirby-copy --stage-callbacks --render-steps --hardware
node scripts/native-port/probe-constructor.mjs --character=Kb --opponent=Mr --input --kirby-copy=spit --stage-callbacks --render-steps --hardware
node scripts/native-port/probe-constructor.mjs --character=Kb --opponent=Mr --input --combat --kirby-copy=acquire --render-steps --verify-vertices --hardware
```

For slower per-vertex validation, use an explicit bounded budget, for example:

```sh
node scripts/native-port/probe-constructor.mjs --character=Kb --opponent=Ns --input --combat --kirby-copy=contact --render-steps --verify-vertices --hardware --probe-seconds=600
```

This only extends the diagnostic timeout; it changes no gameplay or performance
setting. The accepted range is 1–3600 seconds.

Ice Climbers load Popo and Nana through the original player-owned constructor.
Both fighter roots import their three Articles; Nana uses Popo's registered item
kinds. The shared Ice Climbers bank has one model, seventeen particle commands
and five texture groups. The Belay renderer follows forty original ItemLink
objects, preserving their scheduling, lifetime and poses.

```sh
node scripts/native-port/probe-constructor.mjs --character=Pp --input --climbers-moves --stage-callbacks --render-steps --hardware
node scripts/native-port/probe-constructor.mjs --character=Pp --input --climbers-move=belay --render-steps --verify-vertices --hardware
node scripts/native-port/probe-roster.mjs
```

The move suite drives walking, jumping, ground/air Ice Shot, Blizzard, linked
Squall Hammer and Belay using one controller. Nana receives the original delayed
input/AI pipeline. Normal movement and platform-drop inputs reposition the pair
between moves; the test does not assign positions, action states or velocities.
The full four-fighter per-vertex run exceeded its ten-minute verification limit;
the commands above separate full move rendering from focused rope verification.

This integration exposed two shared portability faults. MotionState's numeric
word initializer needs explicit native bit positions for its move ID and flags;
the old byte overlay read them incorrectly on WASM. The corrected view preserves
the 32-byte descriptor and all original table initializers. The partner stick
history also needs float-to-signed-integer conversion before narrowing to a byte.
The development executable's ftCo_800B0918 uses fctiwz followed by stb, confirming
that order. Negative half-stick input now remains -64 in Nana's history instead
of becoming zero. These fixes affect gameplay correctness, including move IDs
used for staling; earlier fixture results do not certify the corrected build.
The roster regression checks live move IDs and copy flags against the numeric
state word on every input frame. It includes Kirby and does not establish
complete move coverage, retail parity or displayed FPS.

Peach imports five move Articles, her model-only effect bank, and the shared
Bob-omb, Mr. Saturn and Beam Sword Articles used by her original rare-pull logic.
The browser residency table registers these three kinds without changing item
selection, probabilities, physics or damage. Beam Sword's packed color fields
remain bytes; its lifetimes and animation parameters use native numeric words.

```sh
node scripts/native-port/probe-constructor.mjs --character=Pe --input --peach-moves --stage-callbacks --render-steps --hardware
node scripts/native-port/probe-constructor.mjs --character=Pe --opponent=Mr --input --peach-contact=toad --stage-callbacks --render-steps --hardware
node scripts/native-port/probe-constructor.mjs --character=Pe --input --peach-pulls --render-steps --hardware --verify-vertices
```

Other contact modes are `turnip`, `shield`, `bomber` and `control`.
The rare-pull soak repeats ordinary down-B and item throws in an isolated
single-fighter fixture, without the eight-minute match timer. It never forces
an item, seed, probability or fighter state. Only the basic input sequence and
rare-item phases are rendered; its many simulation frames are not an FPS
measurement. The move suite checks float release/expiration, all five float
aerials, all three forward-smash weapons, ground/air Toad and parasol, and a
turnip throw. These are selected integration checks, not retail parity.

Sheik and Zelda load both original player-owned forms and their shared Zelda
effect bank. Chain animation also imports the two original reference skeletons
following Sheik’s four Articles. The renderer follows all twenty native links.

```sh
node scripts/native-port/probe-constructor.mjs --character=Sk --input --form-moves --stage-callbacks --render-steps --hardware
node scripts/native-port/probe-constructor.mjs --character=Zd --input --form-moves --stage-callbacks --render-steps --hardware
node scripts/native-port/probe-constructor.mjs --character=Sk --opponent=Mr --input --transform --stage-callbacks --render-steps --hardware
node scripts/native-port/probe-constructor.mjs --character=Sk --live --live-transform --frames=900 --stage-callbacks --hardware
```

`--form-contact=attack|shield|control` checks needles or Din’s Fire; Zelda also
supports `--form-contact=reflect --opponent=Mr` for Nayru’s Love. Use
`--form-move=chain` or `--form-move=din` to isolate those rendering paths.
Transformation diagnostics follow the original active entity; they never
assign a fighter kind, copy damage, or replace the game’s swap callback.

Mixed fixtures accept `--opponent=CODE` with a two-player input or live scene.
Each selected fighter owns its base, motion and costume package; shared effect
archives are installed once. The same-kind default is unchanged.

```sh
node scripts/native-port/probe-constructor.mjs --character=Gw --opponent=Mr --input --absorption=absorb --stage-callbacks --render-steps --hardware
node scripts/native-port/probe-constructor.mjs --character=Ns --opponent=Mr --input --absorption=absorb --stage-callbacks --render-steps --hardware
```

Use `--absorption=control` for the unblocked fireball control. These sequences
use controller movement, normal attacks and down-B, without setting damage,
bucket charge or fighter positions. They test selected integration paths, not
retail parity.

Ness imports eleven original move Articles, the yo-yo's two model attachments
and material animation, and three effect models. The renderer enumerates the
original twenty-link yo-yo chain without replacing its physics. Fighter startup
now calls the original timed-sound-object pool initializer; PK Thunder self-hit
exposed that missing initialization. Audible browser audio remains unfinished.

```sh
node scripts/native-port/probe-constructor.mjs --character=Ns --input --ness-moves --stage-callbacks --render-steps --hardware
node scripts/native-port/probe-constructor.mjs --character=Ns --input --ness-contact=yoyo --stage-callbacks --render-steps --hardware
```

Ness contact modes are `fire`, `fire-shield`, `bat`, `yoyo`, `grab` and
`control`. The move sequence includes controller-steered PK Thunder self-hit.
PSI Magnet absorption/healing has a mixed Mario fireball check above; bat
reflection and retail parity remain unverified.

Mr. Game & Watch imports ten move Articles and separate item/fighter outline
visibility lists. He uses the common effect bank, matching the original game.
Empty Oil Panic uses fighter parts; the mixed Mario sequence checks three
catches, full release and the emptied bucket. Selected Judge results are covered,
not every random outcome.

```sh
node scripts/native-port/probe-constructor.mjs --character=Gw --input --gamewatch-moves --stage-callbacks --render-steps --hardware
node scripts/native-port/probe-constructor.mjs --character=Gw --input --gamewatch-contact=judge --stage-callbacks --render-steps --hardware
```

Game & Watch contact modes are `chef`, `judge`, `grab`, `shield` and `control`.

Mewtwo imports the original Disable and Shadow Ball Articles, all ten serialized
Shadow Ball states, and its four effect models. The Shadow Ball attribute at
0x20 is a signed integer counter; the importer preserves its integer bits.
Original charge/cancel/release, Confusion, Disable and Teleport callbacks run
without replacement gameplay logic.

```sh
node scripts/native-port/probe-constructor.mjs --character=Mt --input --mewtwo-moves --stage-callbacks --render-steps --hardware
node scripts/native-port/probe-constructor.mjs --character=Mt --input --mewtwo-contact=shadowball --stage-callbacks --render-steps --hardware
```

Mewtwo contact modes are `shadowball`, `shadowball-shield`,
`shadowball-shield-break`, `disable`, `confusion`, `grab` and `control`.
The two shield cases use a fresh shield at release and a shield held throughout
charging respectively. Positioning, charging and defense use controller inputs;
the harness does not rewrite damage, charge levels, shields or fighter positions.

Yoshi imports the original thrown egg, landing star and Egg Lay Articles, plus
the separate shell accessory attached to a captured fighter. The Egg Lay Article
explicitly has no special-attribute or animation-state table. Its shell descriptor
is recognized through loaded Yoshi data, regardless of the captured fighter kind.
The original shield, roll, capture, escape and item callbacks remain unchanged.
The loader's `ftYoshiAttributes` view labels offsets 0xEC–0x110 as byte padding,
but `ftYs_DatAttrs` reads ten Egg Throw floats there. The portable header exposes
those same float fields to the typed endian importer. Compiler assertions check
the overlapping offsets and widths; no gameplay values or callbacks are changed.
A charged, aimed throw is part of the regression sequence: leaving those bytes
unswapped produced an enormous spin multiplier and an infinite angle-normalization
loop on the first close-range egg collision.

```sh
node scripts/native-port/probe-constructor.mjs --character=Ys --input --yoshi-moves --stage-callbacks --render-steps --hardware
node scripts/native-port/probe-constructor.mjs --character=Ys --input --yoshi-contact=egg-lay --stage-callbacks --render-steps --hardware
```

Yoshi contact modes are `egg-lay`, `egg-throw`, `grab`, `shield` and `control`.
They use controller inputs to position and attack; they do not rewrite fighter
positions, damage, timers or move parameters.

Link and Young Link import their original bomb, boomerang, hookshot, arrow and bow
Articles, plus Young Link's milk. The original OnLoad callback inserts an extra
nonvisual part; the preview binds costume joints by their descriptor identities
instead of assuming bone-array indices still match costume traversal order.
Hookshot ItemLinks retain their original owners and callbacks. Arrow/boomerang
attachments retain the parent item's owner; the preview registers their separate
joint roots and dispatches each owner only once per pass.

```sh
node scripts/native-port/probe-constructor.mjs --character=Lk --input --link-moves --stage-callbacks --render-steps --verify-vertices --hardware
node scripts/native-port/probe-constructor.mjs --character=Cl --input --link-moves --stage-callbacks --render-steps --hardware
node scripts/native-port/probe-constructor.mjs --character=Lk --input --link-contact=hookshot --stage-callbacks --render-steps --hardware
```

Contact modes are `arrow`, `arrow-shield`, `boomerang`, `bomb`, `hookshot` and
`control`. The arrow-shield case preserves the original idle physical shield;
the damage case faces the defender away using controller input.
The long Link move sequence allows 1,800 seconds for full-scene per-vertex GPU
readback, or 900 seconds for an isolated fighter. These are diagnostics, never
performance runs; the live timing deadline is unchanged.

The portable source replaces two arrow-wobble reads through an unrelated global
with direct reads of `it_803F6A84`. The USA 1.02 symbols and development executable
place that float table 92 bytes after `it_803F6A28`; WASM need not retain this
adjacency. The replacement preserves the original indices, random calls and
arithmetic. It does not substitute new animation parameters.

Bowser’s original Flame Breath Article has no model; its effect-bank particles
provide the visible fire. Scripted inputs can now run through tournament startup
and the full original camera/particle passes using `--input --stage-callbacks`.
This mode verifies Ready/Go and the chosen inputs; the separate stage-cycle and
match-end lifecycle suites retain their existing tests.
The full-scene per-vertex readback diagnostic has a 600-second deadline; ordinary
live timing retains its 90-second deadline. Vertex readback is not a timing run.

```sh
node scripts/native-port/probe-constructor.mjs --character=Kp --input --koopa-moves --stage-callbacks --render-steps --verify-vertices --hardware
node scripts/native-port/probe-constructor.mjs --character=Kp --input --koopa-contact=claw --stage-callbacks --render-steps --hardware
node scripts/native-port/probe-constructor.mjs --character=Kp --input --koopa-contact=flame
node scripts/native-port/probe-constructor.mjs --character=Kp --input --koopa-contact=flame-shield
node scripts/native-port/probe-constructor.mjs --character=Kp --input --koopa-contact=control
```

The shield probe checks initial GuardSetOff/hitlag with no body damage. Sustained
fire can later reach exposed hurtboxes as the shield shrinks; the test records
that damage rather than assuming permanent coverage. Full-scene fire and Klaw
screenshots, 1,453 GPU-verified move frames and the shared integer-`bool` regression
are recorded in the [Bowser evidence](../../docs/benchmarks/browser-2026-09-16-native-port-koopa-intbool.json).

Samus now imports the original bomb, charge-shot, missile and grapple Articles,
effect bank, linked grapple objects and throw accessory. HSD instance joints retain
reference ownership and original draw transforms without occupying duplicate
animation slots. The importer rejects dangling references and display cycles.
The seven known absent Samus animation externs receive the original archive
loader’s NULL initialization. Unknown externs still fail.

```sh
node scripts/native-port/probe-constructor.mjs --character=Ss --input --samus-moves --render-steps --verify-vertices --hardware
node scripts/native-port/probe-constructor.mjs --character=Ss --input --samus-contact=throw --render-steps --verify-vertices --hardware
node scripts/native-port/probe-constructor.mjs --character=Ss --input --samus-contact=missile
node scripts/native-port/probe-constructor.mjs --character=Ss --input --samus-contact=charge
node scripts/native-port/probe-constructor.mjs --character=Ss --input --samus-contact=control
```

Per-frame vertex readback is a correctness diagnostic, not a performance run;
rendered vertex-verification probes allow up to 300 seconds. Live timing probes
retain their previous deadline. These fixtures cover selected moves in the
default costume, not every charge level, grapple recovery, costume or matchup.

Pikachu and Pichu's three Article slots now import Thunder and ground/air Thunder
Jolt. Their shared effect bank retains the original model/particle animations.
Pikachu's empty shape-animation topology is preserved; real morph tracks still
fail explicitly. A Jolt controller with a null model descriptor remains in the
native simulation and render-owner set while its child supplies GPU geometry.

```sh
node scripts/native-port/probe-constructor.mjs --character=Pk --input --pikachu-moves --render-steps --verify-vertices --hardware
node scripts/native-port/probe-constructor.mjs --character=Pc --input --projectile-combat
node scripts/native-port/probe-constructor.mjs --character=Pc --input --projectile-control
node scripts/native-port/probe-constructor.mjs --character=Pc --input --projectile-shield
```

The move sequence covers ground/air Jolt, Thunder, two directed Quick Attack or
Agility dashes, and Skull Bash charge/release. It walks beyond Battlefield's
platforms before checking Thunder's bolt-to-owner contact. Pichu's original
self-damage remains active. These are selected default-costume integration
checks; complete move/matchup and retail-trace parity remain open.

Mario, Luigi and Dr. Mario now use the same original item runtime. Their typed
Article imports include joint and material animations: fireballs, pills and the
two capes. Dr. Mario shares Mario's original effect bank. The Mario effect archive
retains eleven unreachable shape relocations; the importer validates that exact
pinned layout and keeps the effect table's null shape pointers.

```sh
node scripts/native-port/probe-constructor.mjs --character=Mr --input --projectiles --render-steps --verify-vertices --hardware
node scripts/native-port/probe-constructor.mjs --character=Mr --input --mario-moves --render-steps --verify-vertices --hardware
node scripts/native-port/probe-constructor.mjs --character=Mr --input --projectile-combat
node scripts/native-port/probe-constructor.mjs --character=Mr --input --projectile-control
node scripts/native-port/probe-constructor.mjs --character=Mr --input --projectile-shield
```

Use `Lg` or `Dr` for Luigi or Dr. Mario. The move probe exercises grounded/air
cape attachment and retirement, Cyclone and up special; Luigi instead adds
Green Missile startup/charge/release. The reflection probe also accepts `Mr` and `Dr`: controller-triggered capes
transfer projectile ownership and damage the original shooter while protecting
the defender. A complete retail move/interaction comparison remains separate work. The original executable at
`802B2730` passes the cape item GObj to `ftLib_800865CC`: do not “fix” its item
animation selector to use the airborne fighter. Both cape item states are imported,
but the tested ground and air cape sequences select item state 0.

Fox and Falco now run through the complete fighter archive assembler, original OnLoad
article registration, item constructor and item scheduler. The original neutral
special creates its blaster and laser; the live renderer tracks their original
model owners, retires resources when they disappear, and refreshes bindings on
reused object addresses. The shared Fox effect bank supplies Falco's own effects.

The item residency boundary accepts imported character Articles and the explicit
Yoshi's Story Shy Guy Article. Unsupported kinds fail before their descriptors
are read; common/Pokémon/other-stage article graphs remain to be loaded. Original item logic and update callbacks are
unchanged. The seven shared item color descriptors and their 55 script commands
are imported with their packed priorities; original color state passes the same
independent reference used for fighter colors.

```sh
node scripts/native-port/probe-constructor.mjs --character=Fc --input --projectiles --render-steps --verify-vertices --hardware
node scripts/native-port/probe-constructor.mjs --character=Fc --input --projectile-combat --render-steps --verify-vertices --hardware
node scripts/native-port/probe-constructor.mjs --character=Fc --input --projectile-control
node scripts/native-port/probe-constructor.mjs --character=Fc --input --projectile-shield
```

Replace `--character=Fc` with `--character=Fx` to check Fox. Add
`--projectile-reflect` to exercise the defender's original down special; the
test requires projectile ownership transfer, protected defender damage, and
damage to the original shooter. The renderer includes the original reflector
model and other model effects even in the smaller input fixture.

The contact fixture moves the second fighter with normalized walking input.
It requires damage and Falco hitlag/knockback, while explicitly requiring Fox's
ordinary laser hit to omit both. The no-fire control requires no projectile or
damage; shielding must preserve damage and enter shield stun. These are limited
move/interaction checks, not full Fox/Falco competitive parity.

Fox's extra x48 slot is a relocation-free signed-word choice record, not an
Article or model. Its values are imported from the hosted archive using a bounded
terminated-pair parser. The pinned Fox code only reads x48 slots 0–2; no new
gameplay meaning is assigned to the retained extra. Unexpected layouts fail.

The earlier article subsystem check imports Fox/Falco laser, blaster and illusion data
into original item model owners, then executes the original hitbox command
handlers. It compares script cursors, timers, hitbox state, damage, size,
offsets and knockback fields for 64 frames of each of 28 state descriptors.
The independent command reference deliberately covers only the opcodes present
in these fixtures. It does not replace gameplay execution. Numeric command words
retain PPC field positions; the item sound sub-opcode uses an explicit adapter.

An additional check imports `ItemCommonData` and `it_804D6D40_t` from `ItCo.usd`
and calls original `Item_80266FCC` once in a fresh module. Packed fields and
unknown padding are retained. Its generated archive exposes only these typed
structures, not the incomplete `itPublicData` root. Unrelated external model
graphs are excluded; references inside imported structures fail explicitly.

```sh
node scripts/native-port/prepare-fixtures.mjs 'Melee Camera Fixture.iso'
node scripts/native-port/build.mjs --fighter-init
node scripts/native-port/verify-articles.mjs
node scripts/native-port/verify-articles.mjs --browser
```

The disc argument above is a development fixture, never a player requirement.
`articles.html` fetches hosted assets automatically. These remain isolated
subsystem probes; the Falco input/contact probes above cover the newer spawning,
movement, ownership and collision integration. The full fighter archive assembler
continues rejecting unconverted x48 graphs for the other characters.

The optional native VS lifecycle probe uses hosted `PdPm.dat` and `IfAll.usd`
alongside the existing prepared fixtures. Re-run the development fixture tool
after updating, then build `--fighter-init`. The browser still loads all assets
automatically; no player ISO or file picker is involved.

`--hud` implies the tournament fixture and adds the original timer, countdown,
and match-end status graphics. `--damage-hud` also adds native damage percentages,
character emblems and stock icons. Both use the original HUD camera independently
of the gameplay camera.
`--intro` includes that HUD and removes the fixture's 120-frame startup skip.
It exercises the original Ready/Go animations and completion callbacks, fighter
entrance states and trophy platforms, input gating, and the stage's on-start
callback. It verifies the clock remains stopped until Go completes. The stage's
full on-init path remains separate work; this is not a complete scene boot.
`--stage-callbacks` additionally runs the original Battlefield on-init and per-frame
callbacks. It imports typed background color scripts and checks 4,500 frames
including background creation/fade/destruction, then exercises combat and stock
loss. With rendering enabled it uses the original main camera's pass sequence,
original stage draw callbacks, and live ownership of stage groups and model
effects. Rootless particle managers now execute original particle draw callbacks; their
quad/triangle primitives enter the same material renderer. Unsupported point/line
particles and unknown model owners fail explicitly. Live probes run the same callbacks during
the paced workload instead of the separate 4,500-frame idle prelude. Shadow-map
capture, refraction and full scene startup are still incomplete.
Use `--hud --timeout --render-steps --hardware` to render the final six seconds
and timeout animation after advancing the real eight-minute clock. Use
`--hud --live --workload --hardware --frames=3600` for the sustained input-driven
combat workload. Draw submissions are not a measurement of distinct presentation.

The damage HUD checks 396 icon-selector cases across character IDs and costume
rows. The portable recipe repairs an uninitialized decompilation local using
the USA 1.02 executable's `gm_80168B34` behavior: ordinary cases retain the
character ID before adding the costume stride. The rendered lifecycle checks
stock icons through repeated native respawns, including reused object addresses.
The same `--render`, `--render-steps`, `--timeout` and `--live --workload` options
work with `--damage-hud`.

Live pacing rejects rAF timestamps older than startup before choosing a display
origin. Its 0.25 ms timing tolerance is repaid and applies only to the first
step; it cannot borrow an extra catch-up step and oscillate between zero and two
steps near a timing boundary. Real backlog remains owed. Timing samples include
the first callbacks and a bounded list of zero/multi-step callbacks for diagnosis.

```sh
node scripts/native-port/probe-constructor.mjs --tournament
node scripts/native-port/probe-constructor.mjs --intro --render-steps --hardware
node scripts/native-port/probe-constructor.mjs --stage-callbacks
node scripts/native-port/probe-constructor.mjs --stage-callbacks --render-steps --hardware
node scripts/native-port/probe-constructor.mjs --stage-callbacks --live --workload --hardware --frames=3600
node scripts/native-port/probe-constructor.mjs --intro --live --workload --hardware --frames=3600
node scripts/native-port/probe-constructor.mjs --timeout
node scripts/native-port/probe-constructor.mjs --workload-steps
node scripts/native-port/probe-constructor.mjs --tournament --render-steps --hardware
node scripts/native-port/probe-constructor.mjs --tournament --live --hardware --frames=1800
node scripts/native-port/probe-constructor.mjs --tournament --live --workload --hardware --frames=3600
```

This selects four stocks/eight minutes/no items through original VS rules and
player initialization. Original controller/frame callbacks handle combat,
stock loss, respawn, elimination, timeout and end-sequence freezing. Tests cause
KOs through controller input and advance the full timer; they never edit a live
fighter's stocks, position, damage or match time. The respawn platform is rendered
through the original fighter callback and original model/animation. Optional HUD
and intro flags draw original status models through the original HUD camera.
The scene still uses partial Battlefield startup and two Falcons; complete
effects rendering, audio, menus/pause/results and the complete roster are pending.
The optional workload drives both fighters toward each other with repeated attacks
and intermittent shields. It reports attack/hitlag/damage frames separately from
keyboard-event tests. These reports are not competitive gameplay or
distinct-presentation certification.
For a sampled CPU profile, add `--cpu-profile` to a live scripted workload of
at least 1,800 frames. The probe waits for frame 300, samples for 15 seconds,
and writes `constructor-live.cpuprofile` plus its frame window under
`dist/native-port`. Profiling perturbs execution; use a separate uninstrumented
run for performance comparisons.

Adjacent particle/trail primitives may share a GPU draw only when the captured
GX state, camera, culling and vertex layout are compatible. TEV registers travel
as flat integer vertex data; textures, transforms, lighting and pixel state still
form batch boundaries. This preserves triangle order and each primitive's colors.
Layouts using additional UV inputs retain uniform registers. The batch is capped
at 4,096 vertices, and queued streams own their data before native buffers change.
`particleStats.draws` and `afterimageStats.draws` count original primitives;
`immediateStats.submittedDraws` counts GPU batches. Neither is a frame-rate metric.

The unpaced workload executes the same controller script without rendering;
it is a fast correctness check, never an FPS result. The lifecycle regression
also holds/releases crouch to exercise the native slope-adjustment path.

From the repository root with Node 24 and the existing Emscripten toolchain:

```sh
npm run setup:native-port
npm run build:native-port
npm run test:native-port
npm run verify:native-port
node scripts/native-port/serve.mjs
```

Setup creates a clean, pinned, ignored `engines/melee-decomp` checkout. Build
produces ignored `dist/native-port` output. `EMCC` can select another compiler;
the tested compiler is Emscripten 5.0.7. Verification without prepared fixtures
checks arithmetic and scheduler behavior; the report lists asset coverage explicitly.

To include real stage data, run this **development build tool** before verification:

```sh
node scripts/native-port/prepare-fixtures.mjs /path/to/development-fixture.iso
node scripts/native-port/verify-browser.mjs
node scripts/native-port/verify-browser.mjs --all-animations
node scripts/native-port/verify-gpu.mjs
```

The browser automatically fetches the prepared hosted assets. There is no player
file picker. Game data stays in ignored output, never Git. The private verification
server uses port 3324 by default (`MELEE_NATIVE_PORT` overrides it). It serves static
files only and needs no GPU server. The subsystem page is not a playable release.
`/gpu-preview.html` displays an animated native model using browser GPU resources;
`?model=PlFxNr.dat` selects another hosted model. It is a development asset view,
with a diagnostic front camera and unlit first-UV textures. It does not run combat
or substitute for the original gameplay camera. The separate GPU check uses
SwiftShader for correctness and cannot establish hardware FPS or input latency.

`node scripts/native-port/audit.mjs` compiles the game, HSD, and SDK C files to
objects and writes `dist/native-port/audit/report.json`. It reports actual compile
errors without suppressing callback diagnostics. Its unresolved-symbol inventory
is before runtime/libc linking and includes optional SDK components; it is not a
count of functions that all need implementing. Compilation cannot detect every
assembly fallback or gameplay mismatch.

## Implemented boundaries

- `platform.c` links original `mpCollInterpolateECB`, `mpPruneEmptyLines`, HSD RNG,
  and HSD archive parsing/lookup. `OSReport` logs and assertions abort. Unsupported
  platform calls fail linking rather than silently succeeding.
- `archive.mjs` validates big-endian HSD metadata and relocation slots. Its native
  container builder exposes only explicitly selected typed public symbols.
- `resident-files.c` supplies synchronous reads from browser-prefetched images to
  original Melee `lbArchive` C code. Immutable resident bytes and separately
  relocated archive copies have independent lifetimes. Only explicit .dat/.usd
  names and HSD heap 0 are integrated for allocated archive copies. Motion
  bundles use pinned immutable preload-cache hits; a pinned cache cannot clear.
  Other scene heaps and asynchronous I/O remain unresolved. The JS host installs typed images automatically, without a picker.
  Scene checks verify 162 loads, C varargs lookup, independent relocation, invalid
  installs, cache lifetime and archive release across all 27 models.
- `stage-collision.mjs` converts the known `MapCollData`, `Vec2`, `MapLine`, and
  `MapJoint` layouts to little-endian WASM32, then builds a small native archive.
  Original HSD C code performs pointer relocation and symbol lookup. It deliberately
  has no generic word-swap path: textures, strings and packed fields need their own
  types. The rest of a stage archive is not converted by this module.
- `verify.mjs` checks RNG vectors, ECB override/interpolation, stage numeric data
  read through C structs, and collision-line pruning. Private mutated stage copies
  exercise degenerate-line rewiring and the native Poke Floats exemption.
- `runtime.c` provides a WASM-owned arena to the original OS heap and HSD object
  allocator. Original GObj callbacks run in Melee's 25 process-priority levels.
  Order, 64-bit pause masks, delayed deletion, and 120 allocation/reuse cycles are
  checked. The scene target registers the real joint destructor and attaches models
  to original GObj owners. Immediate release and deletion during a scheduler
  callback are checked. Unregistered graphics classes still abort; full fighter
  initialization remains pending.
- The portable source adapter preserves numeric command-word bit positions across
  PPC and WASM, including signed fields, partial word views, the byte-15 hitbox
  overlay and color commands. Raw fighter/item/stage byte accesses use native
  word accessors. It keeps CommandInfo at 0x24 bytes with five return-stack words
  and removes the loop handler's invalid one-entry array access. Generated C
  probes check 254 actual fields (including two motion flags) against independent bit extraction/insertion;
  original timer/loop/call/goto/animation-wait routines pass nested control checks.
  Raw script assets must still be type-converted before using this representation.
  The probes do not run fighter action handlers or claim gameplay parity.
- Original fighter material classes use a typed setup callback adapter and
  explicit references to the original templates instead of adjacent-global
  assumptions. The SDK light-object constructors/getters run natively; hardware
  submission remains a guarded renderer boundary. This does not certify shading.
- `attribute-assets.mjs` imports special parameters for all 27 components.
  `attribute-spec.mjs` obtains 20 layouts from the WASM compiler, cross-checks
  them with a PowerPC-targeted compiler and generates C offset/width probes.
  Numeric words, halfwords, packed colors and byte arrays remain distinct.
  Original LoadSpecialAttrs callbacks pass copies, clone delegation and scaling
  through a limited Fighter/GObj context. This is not full OnLoad or Fighter_Create.
- `character-collision-assets.mjs` imports the typed hurtbox/dynamics-collider
  subgraph. Original initialization/reset/world-position routines read it through
  a limited Fighter fixture with original model bones and shared reserved-part
  mappings. All 318 hurtboxes across 27 components pass animation, cached update
  and rewind checks. Eleven synthetic colliders exercise the native array limit;
  the portable header replaces its one-entry placeholder without changing layout.
  Original ftParts_SetupParts now supplies the part mapping and fighter material
  classes; display indices, depth and flags are checked.
  `auxiliary-assets.mjs` imports the separate refraction model and original
  ft_800C85B8/lbRefract_PObjLoad bind its 313 display objects to the primary bones.
  Temporary descriptor ID aliases are removed after reference resolution.
  `visibility-assets.mjs` imports all 127 costumes' selection tables. Original
  initialization, selection, hide/show and cached-update routines pass 87,649
  flag comparisons on the 27 default models, including mixed selections.
  Costume texture indices and the five part IDs in ftData.x8 are now imported too.
  `costume-assets.mjs` merges the typed model and material-animation graphs.
  Original ftData_80085820/lbArchive_80017040 load both symbols and reuse the
  costume cache. The browser DVD-cache boundary reports a parsed-archive miss;
  original archive code copies prefetched bytes and owns the result.
  Original ftAnim_80070308/80070458/800705E0 attach, select and reset 48 texture
  controllers across the 27 default models: 7,468 image/palette checks pass.
  Yoshi's two material-color animations pass another 2,424 comparisons. Track
  reference values use the separately exercised original FObj interpreter.
  Alternate costume models, per-character selection callbacks, material drawing,
  dynamic-bone simulation and combat remain pending.
  The fixture now calls original Fighter_UnkUpdateCostumeJoint_800686E4,
  ftParts_80074E58 and ftCo_800C884C. Fighter joint/polygon classes and HSD part
  pools replace the generic model constructor and fixed arrays. Selective pool
  initialization still precedes full Fighter_FirstInitialize integration.
  Two simultaneous instances of each default model retain separate joints and
  materials; 30,824 checks verify texture/color isolation. Envelope ownership
  checks use the live skeleton because descriptor IDs are shared between copies.
  Full Fighter_Create, player initialization and the match lifecycle remain pending.
- `shared-assets.mjs` imports all 23 PlCo sections, including three shared
  models and HSD joint animation. Generated probes check all 536 common-parameter
  field offsets. Original bone lookup, remapping, part groups and landing
  knockback read these data in browser checks. Original Fighter_LoadCommonData
  binds all 23 globals and retains its archive after the prefetched cache clears.
  The wrapper initializes once; full startup must not call it independently of a
  later Fighter_FirstInitialize that already invokes the same loader.
  Accessory animation passes 153 frames and exact rewind. These are initialization
  checks, not full fighter creation. PlCo is hosted automatically through
  shared-fixtures.json.
- `color-assets.mjs` imports shared color/light scripts as numeric words, while
  `cpu-assets.mjs` preserves CPU input scripts as bytes and imports numeric attack
  lists. Original color interpretation is compared with a separate BE reference
  over 23,177 updates; existing game skip handlers expose external event words
  without pretending to implement effects. Original CPU script copying and
  weighted projectile choice are checked; full AI remains part of the match loop.
- `motion-assets.mjs` imports the 24-byte motion rows and action command graphs,
  keeping shared subroutines, pointer identity, numeric flags and valid null jumps.
  Only the imported graph is exposed; unrelated archive externs remain opaque.
  `motion-animations.mjs` converts FigaTree archives without changing bundle offsets.
  `motions.c` exercises original ftData loading with a limited Fighter context,
  original Player partner lookup, GObj userdata ownership and the original two
  animation buffers. It does not invoke Fighter_Create or execute combat handlers.
  A checked resident-memory copy replaces only the GameCube ARAM/RAM address split.
  Browser checks cover 8,767 rows, 26,301 loads, 17,534 cache checks, Nana fallback,
  114,939 script words and loader-to-HSD animation across 39 clips/2,244 frames.
  Original secondary-buffer partner behavior is retained, including its use of
  the primary buffer when copying Popo's relocated tree. No performance claim is
  based on this fixture.
- `fighter-assets.mjs` converts scalar common attributes and preserves packed
  throw flags. Twenty named fields per component are read through C structs;
  original falling and friction routines are checked against explicit arithmetic.
  These probes do not invoke `Fighter_Create` or replace its initialization.
- `animation-assets.mjs` decodes big-endian FigaTree/FigaTrack descriptors and
  validates byte-coded streams. Payload bytes already use little-endian encoding.
  The original FObj decoder and AObj timeline execute them, including Hermite
  interpolation, rewind, loop and end behavior. Both classical-scale tree types
  are retained; 11 retail clips use type zero.
- `math.c` replaces 13 SDK paired-single routines with explicit instruction-order
  arithmetic. An independent BigInt binary32 oracle checks fused cancellation and
  aliasing. Original MSL sin/cos and HSD SRT builders are retained, with explicit
  MSL initialization. This does not establish FPSCR or full PPC float parity.
- `joint-assets.mjs` imports typed joint trees without touching mesh/texture bytes.
  `pose.c` connects original animation decoding and SRT builders for ordinary
  joint hierarchies, including scale compensation and visibility channels.
  It is a limited integration owner, not the complete HSD class implementation.
  38 clips spanning all 27 components and every type-zero clip pass finite-matrix
  and rewind checks in Chrome; constraints and unsupported modes fail explicitly.
- Additional native SDK operations now include normalization, magnitude,
  translation, axis rotation, quaternion matrices and inverse matrices.
  `matrix-special.c` expresses the original paired arithmetic directly in C.
  Original look-at and projection C is retained, including GX's [-1,0] depth.
- `estimates.cpp` calls the pinned Dolphin arithmetic utility for reciprocal and
  reciprocal square root. It replaces the decompilation's incorrect host-only
  `__frsqrte` placeholder and retains 25-bit operand rounding for normalization.
  This utility has no emulated CPU/state or graphics dependencies. Vendored
  source hashes, attribution and GPL-2.0-or-later license are under
  `vendor/dolphin`; retain them when distributing the port. The 57 upstream
  reciprocal-root golden vectors run through WASM memory without JS NaN changes.
- `mesh-assets.mjs` decodes static GX display lists and typed vertex arrays for all
  27 default fighter models. It preserves strip winding, matrix indices, packed
  colors and fixed-point coordinates. The browser verifies 2,179 mesh sections.
  Material/texture descriptors now have their own typed importer.
- `skin-assets.mjs` imports inverse-bind matrices and envelope palettes with
  original influence ordering and weights. `skin.c` prepares rigid/shared and
  blended matrices using native SDK/HSD math, then transforms reference vertices.
  Identical palettes share one calculation per frame. Browser checks cover 32
  animated frames of all 27 default models and replay; five independent examples
  distinguish HSD's single-influence and blended coordinate spaces. The GPU path
  disables CPU reference vertex transformation and updates matrix palettes only.
- `material-assets.mjs` and `texture.mjs` decode the default models' 1,753 materials
  and 1,730 texture descriptors, including indexed palettes, GX-specific CMPR
  interpolation and RGB-preserving transparent CMPR entries. Original HSD
  `MakeTextureMtx` is selected unchanged from the pinned source; six hand-calculated
  transform cases and all 1,730 imported transforms run in browser verification.
- `gpu-mesh.mjs` uploads static mesh buffers and uses float matrix palettes for
  vertex transforms. `gpu-preview.mjs` verifies GPU positions against native CPU
  reference vertices and renders a 960×720 diagnostic image. It displays only the
  first supported UV image; native lighting, normal matrices, TEV, LOD, material
  animation and fighter part selection are not implemented. Do not promote this
shader or its diagnostic camera to the player flow as a faithful renderer.

## Original HSD scene bring-up

After the regular build and fixture preparation:

```sh
node scripts/native-port/audit.mjs
node scripts/native-port/audit-link.mjs
node scripts/native-port/build.mjs --scene
node scripts/native-port/verify-browser.mjs --scene
node scripts/native-port/verify-gpu.mjs --scene
```

This produces `melee-scene.mjs/.wasm` and a separate `scene-build.json`. The scene
library currently uses the audit's `-O0` objects; it is not a performance build.
The 51 unresolved GX entry points retained by HSD class tables abort by name.
They do not silently skip work. `/scene.html` checks loading and animation;
`/gpu-preview.html?scene=1` connects original HSD matrices to the diagnostic GPU
resource path. Neither is a playable release.

All 27 default model archives pass three load/destroy cycles with resolved
envelopes, source-descriptor metrics, zero remaining joint/display/polygon/material/
texture/animation objects or ID/vector/matrix allocations, and stable heap use on
repeated cycles. Original HSD/lbAnim runs 38 clips over 2,180 frames with exact
matrix agreement against the earlier native pose owner and exact rewind replay.
The browser GPU's 81 sampled images also match the previous diagnostic path.
This verifies native object integration, not Dolphin gameplay parity.

`portable-source.mjs` generates a pinned source mirror under ignored output.
The selected `stdbool.h` is the pinned MSL header: `bool` is a signed 32-bit
integer, preserving both memory layout and noncanonical values. C99 `_Bool` is
incorrect here: Bowser’s minimum Flame Breath counter is declared `bool` and must
reach 40 instead of saturating at 1. Compile-time checks enforce that contract.
Existing typed callback wrappers pass integer values through unchanged; no
callback casts or suppressed diagnostics are used. It also makes two original
PowerPC register dependencies explicit: `ftLib_800876B4` returns the animation
predicate, and the multi-man menu passes `mn_802295AC()` to `gm_801677E8`.
The supplied USA 1.02 executable confirmed both register flows. Menu declarations
and memory-card result declarations now match their implemented signatures.
Link signature warnings are fatal. Source hashes and the transformation recipe
are recorded in build/audit metadata; the upstream checkout remains unchanged.

`node scripts/native-port/audit-link.mjs` probes original joint loading and fighter
creation with the implemented native math/heap/error boundaries. It requires a
fresh compile audit after platform-header changes and never emits a runnable
module with unresolved imports. Its missing symbols are integration work, not
proof that every referenced mode belongs in a tournament browser build.

These tests establish subsystem behavior and selected layout compatibility.
Expected values come from documented/source arithmetic and original asset bytes,
not a frame-by-frame Dolphin oracle. Native gameplay parity is still unproven.

## Original global fighter startup

After the compile/link audit, build and verify the separate startup target:

```sh
node scripts/native-port/build.mjs --startup
node scripts/native-port/verify-browser.mjs --startup
```

`melee-startup.mjs/.wasm` calls original `Fighter_FirstInitialize_80067A84`
through a one-time owner. The target adds original ground/archive/light-list
source files without linking unrelated disc, card or audio implementations.
All six fighter pools, common archive globals, shared materials, original fallback
lights and character startup callbacks execute. Existing model fixtures use these
initialized pools instead of resetting them. Full startup is rejected after partial
common initialization; resetting live globals would discard ownership.

The portable mirror replaces three adjacent-global address assumptions with their
original named arrays. Kirby's 33-word reset writes the same byte range within its
34-word aggregate without indexing a scalar member as an array. Sentinel checks
cover both reset and untouched fields. The browser checks 54 model instances
across 27 default character components, shared archive retention, startup order,
and 120 original light-proc scheduler steps. The two shared material models are
runtime-lifetime objects, as in the original startup code.

This does not create full fighters, initialize a tournament stage, draw original
lighting or run a match. The startup and scene targets are distinct correctness
fixtures; neither provides an FPS or input-latency measurement.

## Original per-fighter initialization

Prepare fixtures again to include the original SIS font, then:

```sh
node scripts/native-port/build.mjs --fighter-init
node scripts/native-port/verify-browser.mjs --fighter-init
```

The `melee-fighter-init` target links the wider original game callback graph,
including `Fighter_Create`, and executes `Fighter_UnkInitLoad_80068914` before
model construction. Its typed binding imports common parameters, pickup offsets,
the extra Vec2, motion rows and the two-byte per-animation mapping. The incomplete
full `ftData` root is not published. The owner remains an integration fixture.

The browser verifies five configurations for each of 27 components: player and
controller indices, scales, seven player flags, costume fallback, color arithmetic,
real action-table bindings, all 444 copied parameter bytes, seeded input history,
timer sentinels and shared-pool cleanup. Original action callbacks are linked but
not executed by this test; neither browser input polling nor combat is running.

`game-link.mjs` excludes the console program entry point and renames only the
six original definitions already implemented by the browser resident-file boundary.
Their other callers and source-file functions remain unchanged. In addition to
51 scene GX guards, 89 retained platform calls abort by name. They must be
implemented when integration reaches them. This is not a hardware-complete game.
The original SIS atlas is generated from the development executable into ignored
output and linked into this target; no player disc upload is introduced.

## Next milestones

1. Connect `Fighter_Create` to the native HSD owner, remaining fighter archive
   structures and platform services; replace the limited motion
   fixture with full fighter ownership. Audit big-endian bitfields
   and pointer/function references explicitly; common attributes and animation
   decoding alone do not initialize a fighter.
2. Run one two-fighter legal-stage match with scripted per-frame input. Compare
   action state, position, velocity, damage, RNG, collisions, camera and rules
   against the equivalent Dolphin scene. Preserve floating-point behavior; no
   fast-math shortcut is enabled in the bootstrap.
3. Replace the GX hardware boundary with browser GPU calls, retaining original
   HSD rendering, projection and camera behavior. Port matrix/vector assembly with
   numerical checks. Add browser audio, controller polling and hosted asset loading.
4. Expand parity and play coverage to all characters and tournament stages, then
   measure sustained 960×720 distinct frames at 60 Hz and input-to-image latency.
   Source/object count and tiny-module speed are never an FPS acceptance result.

No-ISO hosted startup, native camera/framing, native menus and tournament gameplay
remain requirements. Randall and FoD platform movement require the original stage
callbacks; loading their collision data alone does not establish that movement.
Frozen Stadium is approved. The accepted FoD/Ice Climbers performance exception
does not waive gameplay correctness.

## Original dynamic bones

The `--fighter-init` target also runs original dynamic-bone allocation, parameter
loading, animation-selector cutoffs, rest-pose updates and unload.
`dynamics-assets.mjs` imports the typed `ftDynamics` subgraph; serialized parameter
arrays have 60-byte records while runtime linked nodes are 152 bytes. Selector
rows contain integer cutoffs, despite pointer-like decompilation declarations.
Shared source arrays retain their aliasing. Extra Purin hat descriptors are
imported but only default-model descriptors execute in this fixture.

`verify-dynamics.mjs` tests two simultaneously live instances for all 27 fighter
components. It checks 40 sets / 168 nodes, every imported selector row, 60 updates
per instance, exact cross-instance state and recovery of the original 320-node
pool. The fixture shares original field/model/collider initialization; cleanup
returns dynamic nodes before releasing the fighter owner. It does not run a
match, drive the normal fighter animation pipeline, test Kirby copy hats or
establish retail per-frame parity, FPS or latency. The full constructor remains
linked but unexecuted.

## Original fighter animation integration

The wider fighter target now creates the original interpolation skeleton with
`ftAnim_8006FE48`, attaches real motion clips through `ftAnim_8006EBE8`, and advances
`ftAnim_8006E9B4` followed by the original dynamics update. It uses the same owner
as field/model/collider initialization. The interpolation skeleton is released
with the owner and included in live-object accounting.

`verify-fighter-animation.mjs` covers 81 clips across 27 components, two live
instances each, 0/4/8-frame blends, normal/half speed and independent progression.
The fixture now binds resident native animation bundles, executes original
`ftData_80085A14`/`ftData_80085B10` and loads trees into each Fighter's owned
primary/secondary buffers through `ftData_80085CD8`/`ftData_80085E50`. It preserves
source motion flags/mapping and checks tree descriptors and track bytes against
independently decoded source archives. Secondary loads during active playback
must leave the primary buffer unchanged. Two fighters have four separate buffers;
shared bundle pins remain until the last owner is gone. Nana resolves empty rows
through a registered Popo archive. This fixture does not exercise a live paired
Popo/Nana gameplay update; the separate motion-loader suite covers peer relocation.

Kind-level registration still uses a limited ftData binding, not the complete
base archive. The fixture does not replace or execute `Fighter_ChangeMotionState`,
action scripts or physics. The full constructor and match loop remain pending.

The portable Fighter animation union retains numeric PowerPC bit positions on
WASM. Its twelve fields are checked through the actual C members by the existing
command-layout verifier. Retail instruction inspection independently confirms
the source-kind, part-mask and transition-bone positions.

## Character gameplay data and collision boxes

`gameplay-assets.mjs` imports nine additional `ftData` fields into a dedicated
root. It validates weighted idle tables, signed 16-bit collision bone indices,
packed foot-placement indices, float dimensions and aliased sound-ID lists.
The complete character root remains unavailable until all reachable data is typed.

The wider target binds these fields to its existing initialized fighters and
executes original environment collision-box setup/resize, `mpColl_LoadECB`,
`mpCollInterpolateECB`, thrown-hitbox initialization/history and body-contact
transforms. `verify-gameplay.mjs` checks these over the same animated sequences
as the fighter-animation fixture. Camera, sound, idle and foot-placement data
are imported; their complete gameplay consumers remain unverified. Stage-line
traversal, landing/ledge interactions, combat and full match execution are pending.

## Per-part animations and shield poses

`secondary-animation-assets.mjs` converts `ftData.x1C` and `x20` into two
dedicated public roots. Per-channel variant extents are pinned USA 1.02 layout
metadata: there is no count in the source descriptor. Do not infer these extents
from consecutive relocation slots or the next relocation target; adjacent item
objects and interior aliases make both approaches incorrect. Primary motion
script references are checked against the imported extents. Demo scripts remain
a separate pending integration. Packed FObj streams retain their byte coding.

The two external Kirby hand-animation slots become NULL, matching
`lbArchive_InitializeDAT` and `HSD_ArchiveLocateExtern(..., NULL)`. Other
externs touching this graph are rejected. The shield descriptor holds a direct
`HSD_Joint*`; the original decomp's `x0[2]` accessed that joint's child at +8.
The portable declaration and all three Guard consumers now express that access
with `x0->child`, with layout assertions and no archive-offset change. Yoshi's
ordinary shield-pose root remains null; this does not implement his shield.

`verify-secondary-animation.mjs` runs original part attachment, blending and
restoration for every variant on two initialized fighters, including disabled
Kirby slots. It checks node/part correspondence, override flags, progress, final
SRT copies, resets and independent ownership. The three original shield-pose
consumers pass source-translation/scale and finite deterministic pose checks.
These calls exercise pose handling, not Guard state transitions, shield health,
tilt, effects, input, combat, retail parity or performance.

## Character item models

`item-model-assets.mjs` imports common attributes, models and hurtboxes for the
77 Article slots registered by character OnLoad callbacks. Other entries in the
same table can be hats or part tables and are not treated as Articles. It exposes
only `native_item_models`; incomplete Article and full character roots remain
unpublished. The one Popo GumStrings external model reference becomes NULL,
matching the original archive loader. Other externs inside these graphs fail.

`item-model.c` owns limited original Item objects and calls the original model,
material-class, dynamic-bone-table, scale and hurtbox setup routines. Portable
ItemAttr bitfields preserve packed source bytes; all 65,536 combinations pass
through their actual C members. The original item material setup uses a typed
two-argument adapter for HSD's callback ABI, supplying its unused third argument.

`verify-item-models.mjs` tests two owners per entry, bone order, native scene
descriptors, skin references, finite independent matrices and hurtbox world
coordinates, followed by object/material/bone/file cleanup. Item animation states,
special attributes, command scripts, spawning and GPU material submission are
not exercised. These objects never enter the gameplay Article table and do not
substitute for complete projectile or attack behavior.

## Full-constructor bring-up

`fighter-base-assets.mjs` composes the verified subgraphs into a complete
`ftDataCaptain` archive. It is restricted to Captain Falcon; characters with item
or other unimported graphs fail rather than receiving missing fields. Subgraphs
retain their internal pointer identities, but are embedded separately and carry
redundant unreachable bytes. Compaction is pending. Demo-motion metadata now
comes from `ftData_UnkIntPairs`; demo playback remains unverified.

After building `--fighter-init`, run `node scripts/native-port/probe-constructor.mjs`.
The browser automatically loads the hosted fixtures, checks the assembled root
and every relocated byte/pointer, and invokes the unmodified `Fighter_Create`
through `portFighterConstruct`. The probe does not replace it with the limited
model owner or skip its effects, shadow, OnLoad or state setup. It runs in a fresh
runtime because a failed original constructor can leave partial allocations.

The probe now initializes original camera subjects, loads the converted Captain
effect bank, initializes players, and calls `Player_80031AD0`, which owns and
registers the result of `Fighter_Create`. It verifies all 15 callbacks, fighter
ownership and the initial Fall state. Calling the constructor alone without
player registration is insufficient: gameplay looks up the owning player entity.

`node scripts/native-port/probe-constructor.mjs --step` additionally runs 120
original scheduler calls in a fresh runtime. This is isolated bring-up without
stage geometry, bounds, match rules, input or rendering. Empty bounds cause a
Fall/death/Rebirth sequence; the result is not match validation or performance.
The normal and step reports are separate ignored JSON artifacts. A timed-out
probe captures a symbolized paused stack; any error or missing required milestone
returns status 2. Constructor success does not satisfy the 720p60 acceptance gate.

## Effect bank and particle bring-up

`effect-assets.mjs` imports Captain's six effect descriptors and all nested
scene/animation data, 17 particle command definitions and seven texture groups.
HSD pointer relocation and particle-bank-relative relocation are separate.
Packed scripts, pixels and palettes retain their original bytes; the source
`psReadFloat` adapter assembles big-endian operand bits on the little-endian host.
All source HSD relocations must be typed or import fails.

`verify-effects.mjs` uses original `efLib_Init`, `efAsync_LoadSync`,
`efLib_Create`, model callbacks and both particle update callbacks. An empty HSD
joint is the test attachment owner; the test does not claim fighter attachment.
Two concurrent instances per effect must animate independently, expire, drain
particles naturally and return all ten measured object pools to baseline. The
browser check validates finite particle positions/velocities/sizes and 4,104
packed float bit patterns. It does not cover every particle opcode, GPU drawing,
all effects, match behavior or retail numerical parity.

The platform interrupt mask preserves nested disable/restore state while C runs
synchronously on one browser thread. Any future threading or asynchronous C
suspension needs a corresponding synchronization implementation. Original audio
calls beyond integrated functionality still fail explicitly.

## Final Destination and stage callback coverage

The constructor fixture accepts `--map=destination` (default: Battlefield).
The typed map importer supports Final Destination's ten model groups, referenced
spline joints, two spline entries, three shadow-light entries and four color
scripts. Its light override table has the same declared-double-count quirk as
Battlefield: 32 declared entries, 16 typed eight-byte rows. Packed shadow flags
retain their source MSB position in the generated C header.

Stage selection now reaches the original VS rules and intro route. Original
`grNLa_StageData.on_init` and subsequent stage processes own background changes.
The stage animation ABI boundary reuses HSD's original typed callback dispatcher
instead of the PPC decomp's extra-argument calls. No camera pose is rewritten:
Final Destination's original startup selects near/far 1/30000; Battlefield keeps
0.1/16384. Camera validation accepts the selected stage's expected planes.

Run a long callback check or a separate timed combat workload:

```sh
node scripts/native-port/probe-constructor.mjs --map=destination --stage-callbacks --stage-only --stage-frames=27000 --render --hardware
node scripts/native-port/probe-constructor.mjs --map=destination --stage-callbacks --live --workload --frames=3600 --hardware
```

The long check runs 27,000 idle simulation steps with original callbacks,
stock-retention checks and sampled rendered/GPU-verified frames. It is not a
performance measurement. Match timing remains separate from draw submissions,
distinct presentations and input-to-photon latency. Full scene loading, remaining
stage roots, stage-particle parity, audio, other stages and full roster parity
remain incomplete.

The GPU position oracle accounts for cancellation using the standard float32
forward-error bound for four products and three additions, in addition to its
existing relative tolerance. The shader itself is unchanged by this verifier
correction; normal verification remains independent. Reports count components
that require the rounding allowance.

## Dream Land integration probe

Dream Land is also available through `--map=dreamland`. Its importer converts
eight map model groups, ten shadow-light entries, 19 light override rows and the
original callback parameters (four signed halfwords, two timers, nine floats).
The original `grOp_StageData` initializes Whispy and the background scheduler;
wind timing, strength and bounds are preserved. No stage cosmetic has been
removed or frozen by this integration.

Stage rendering enumerates the original process-link owners instead of taking
only one owner per map ID. Dream Land can spawn multiple objects from the same
model group. Process-only objects keep running in the original scheduler, and
the model-less spawn timer is accepted only after checking its joint tree has
no drawable payload. Unknown model owners still fail explicitly.

```sh
node scripts/native-port/probe-constructor.mjs --map=dreamland --stage-callbacks --stage-only --stage-frames=9000 --render --hardware --record-shaders
```

This check observes both Whispy wind directions and compares steady-wind idle
fighter displacements with the original collision wind query. It reports phase
and boundary transitions separately because stage callbacks and fighter physics
run at different scheduler priorities. It does not rewrite fighter positions,
the wind state machine, the camera or RNG. The 9,000-step check preserves stocks
and samples 75 stage draws with GPU vertex verification. Full native-versus-
Dolphin stage/effect parity and complete scene initialization remain pending.

The deterministic combat controller is now revision 2: it uses an ordinary
stick turn when nearby fighters face away from each other. Dream Land's wind
and respawns exposed the old controller standing back-to-back for a full
ten-second window. That timing run is rejected by the existing contact gate.
The fast `--workload-steps` path also skips the separate idle-stage prelude,
matching the live run's post-intro starting point. Workload source hashes are
included in probe reports; do not compare revision-2 timings as if they used
the older input workload.

## Fountain of Dreams simulation bring-up

The `fountain` fixture imports the five original map groups, one spline, six
shadow-light entries, platform parameters, empty shape-animation topology,
star model and mutable reflection-image descriptor. Original stage initialization
creates two distinct platform owners with map ID 4. The star owner uses the
retail -1 sentinel; its descriptor and callback are checked before assigning a
browser resource slot. Clang's unsigned enum representation must not hide that
sentinel. Native on-load light animation flags are applied too.

`node scripts/native-port/probe-constructor.mjs --map=fountain --stage-callbacks --stage-only --stage-frames=9000`

This simulation-only check executes the unchanged platform state machines and
checks both platforms' collision vertices against their registered joint
matrices on every frame. Both platforms must rise and fall; the check also
records their hide/return phases and verifies distinct ownership. It does not
freeze, teleport or rewrite platform state. Source collision vertices are
validated before callbacks move the platforms.

The full original graphics path still fails explicitly at unsupported point geometry:
the star mesh contains 24,630 GX point vertices. Point rasterization and the
water reflection camera / mutable-image capture still need integration. The
reflection allocation is created by original code during startup, but it must
not be mistaken for a completed rendered reflection. Fighter carrying, landing,
drop-through and broader native visual/gameplay parity remain separate gates.

An explicit cosmetic profile now supports a rendered Fountain fixture:

`node scripts/native-port/probe-constructor.mjs --map=fountain --stage-callbacks --stage-only --stage-frames=9000 --render --hardware --fountain-cosmetics-off --fountain-scenery-off`

`--fountain-cosmetics-off` skips the star object's drawing and initializes the
original 80×60 RGB565 reflection image to black, with defined constant texture
coordinates. `--fountain-scenery-off` additionally skips the 75 background draws
belonging to map group 1. Group 0 has no visible geometry in this fixture; an
initial exclusion of that group was rejected as a no-op. Main-stage group 3 and
both moving-platform group-4 owners continue to render. All original stage
processes, particle scripts, random consumption and platform collision updates
remain scheduled; the cosmetic profile does not freeze the stage or change the
camera. These flags are restricted to Fountain and are recorded in reports.

The 9,000-step rendered check preserves the control's platform statistics and
camera snapshot, passes sampled GPU vertex checks, and has been visually
inspected with the floor, top platform and both moving platforms present.
Timed comparisons use the same cosmetic profile on both sides and vary only
the group-1 scenery flag. They do not compare against a complete full-reflection
renderer. See the [Fountain cosmetic evidence](../../docs/benchmarks/browser-2026-09-16-native-port-fountain-cosmetics.json)
for measured submission costs and the remaining acceptance gates.

## Battlefield integration probe

`stage-map-assets.mjs` imports the Battlefield map head, all seven models and
their animation graphs, typed camera/light/fog descriptors, joint bindings and
GroundParam/StageParam records. It publishes private native roots, since the
complete stage archive's particle, script and item roots are still pending.
Camera descriptors are checked as data; this is not rendered-camera parity.

The original executable confirms an archive quirk: the light-override count is
34, but the initialized table has 17 eight-byte rows. Retail looks up lights with
that count and exits on the first match. The importer requires every referenced
light to match within the typed 17-row prefix, preserves the original count and
rejects other layouts. The generated C adapter reverses the packed a/b/c bitfield
declarations to preserve the original byte's 0x80/0x40/0x20 flags on WASM.

After building `--fighter-init`, run:

`node scripts/native-port/verify-browser.mjs --stage-map`

This verifies original Ground_GetStageGObj/grAnime ownership and animation,
light selection, source-joint camera/blast bounds and object/callback teardown.
It does not run complete Stage initialization or drawing. The normal match's
camera projection is not changed.

`node scripts/native-port/probe-constructor.mjs --stage` adds original
mpLibLoad collision registration, source spawn placement and a required Falcon
Fall-to-grounded-Wait transition. `--input` additionally enables input with
Player_80031848 and injects normalized samples at HSD_PadGameStatus. Walking,
airborne jumping, neutral-air attack state and grounded recovery are required;
simply running frames is insufficient. The input samples are diagnostic, not
browser raw-device calibration or latency validation.

Collision arrays and both stage archives are owned by the fresh WASM instance
until it is destroyed. Clearing the map while collision remains live is rejected.
Full Stage/match startup, gameplay material rendering, audio playback, opponent
interactions, rematch lifecycle and tournament-wide parity/performance remain
required. These successful probes do not satisfy the 720p60 acceptance gate.


### Two-fighter combat integration probe

Run `node scripts/native-port/probe-constructor.mjs --combat` after building
`--fighter-init`. The `--combat-control` variant omits attack buttons. Both
variants automatically fetch the hosted fixtures; no player disc picker exists.
The test creates two original player-owned Falcons, reuses the original kind
cache, keeps separate camera subjects and enables each controller with the
original Player routine. `portProbeRulesInitialize` calls
`gm_SetupRulesDefaults` and verifies the default damage ratio is 1. This is
not the complete tournament or VS initialization path.

The combat probe records every scheduler step, checks finite fighter state,
ownership, callback counts and stocks, then checks platform dropping, jab
contact, hitlag, knockback, displacement, shielding, grabbing and forward throw
states/damage. The no-attack control must have no damage, hitlag, knockback or
shield stun. The recorded SHA-256 excludes pointer addresses and allows a fresh
browser replay comparison. It does not compare against retail traces.

The verified checkpoint has 120 settling plus 683 input steps, 20% after jabs,
unchanged percent under shield and 29% after forward throw. Both original
fighters retain four stocks. Two fresh browsers have matching trace hashes.
These scheduler steps are not presented frames or a performance benchmark.
General hit effects, item systems, native match rendering, device sampling,
audio, complete stage callbacks and rematch teardown remain integration work.

## Common effects and native camera bring-up

The constructor probe automatically loads the typed common and Captain effect
banks through original `efAsync_LoadSync`. Missing effect banks abort before
access. The common bank imports all 47 model descriptors, 592 particle commands,
36 texture groups, empty shape-animation trees and the original spline data.
Only the graph reachable from the effect table is exposed; 65 relocations in
unreferenced export-time shape metadata are omitted from the native subgraph.

The original C camera now supplies the view and projection snapshot. Use
`node scripts/native-port/probe-constructor.mjs --camera` after the fighter-init
build for the two-Falcon combat/camera integration probe. It validates matrices
numerically and does not render gameplay or certify camera visual parity.

The portable recipe removes three additional retail-global-adjacency assumptions:
camera quake descriptors, effect parameter-table writes and particle teardown
lists/pools. All refer directly to the intended original symbols. The common
effect lifecycle suite runs with `verify-browser.mjs --fighter-init`.
The earlier combat-only checkpoint omitted common effects and is superseded by
these checks; same-build deterministic state alone did not detect corruption.

## Live match-object render diagnostic

After `build.mjs --fighter-init`, run
`node scripts/native-port/probe-constructor.mjs --render`. It uses a private
static server and headless SwiftShader to capture two 960×720 snapshots, before
and after the scripted combat sequence. The images and report stay in ignored
`dist/native-port`. All assets load automatically.

`native-match-preview.mjs` reads original live HSD matrices, DObj visibility and
camera data. Normal fighter body selection calls the original `ftParts`
functions; unsupported special render forms reject rather than silently changing
appearance. The shared `UnkFlagStruct` retains retail byte/bit correspondence.
Every GPU-transformed vertex is checked against the native CPU skinning result.

The live preview uses `material-gpu.mjs` and `material-shader.mjs` for native
matrix palettes, GX lighting, texgen, integer TEV, alpha tests, depth and blending.
Thirteen controlled full-shader cases check 52 pixel channels; diagnostic
transform feedback checks every drawn position and normal. Native normal-pass
fighter flags and fighter-owned lighting are prepared and cleaned up around
capture. SDK specular channels use the SDK's effective diffuse-NONE behavior.
These resolve the preceding white surfaces and black silhouette without changing
the camera. The independent all-model GPU preview still uses its diagnostic shader.

Complete original draw callbacks/order, image/palette mutation invalidation,
exact filtering/LOD parity, accessories, effects and HUD remain incomplete.
Unsupported pixel paths explicitly reject. This is not a playable game or a
benchmark: the two snapshots use synchronous GPU verification readbacks.

## Continuous native development fixture

After the fighter build, serve this directory and open
`/constructor.html?live=1`. Assets load automatically. Arrow keys move,
X jumps, Z attacks, S uses specials, C grabs and Shift shields. This is a
keyboard development fixture with two Falcons, partial Battlefield startup and
original camera/material state; full competitive gameplay is not complete.
Gamepad calibration, effects drawing, HUD, audio, full match rules and native
menu/pause integration remain separate requirements.

`native-live.mjs` drives the original scheduler at 60 steps per second. Slow
rendering retains simulation debt, capped at four steps per callback; it never
skips a simulation step to inflate FPS. Hidden tabs pause explicitly. Timing
samples are bounded to the most recent 3,600 calls. Simulation-call time, draw
submission time and rAF intervals are reported separately, without asserting
distinct presentations or input-to-photon latency.

`createNativeMatchPreview(...,{verify:false})` keeps original material setup,
visibility and camera, but removes duplicate diagnostic capture and GPU
readbacks. The shader cache keys only source-generating state; dynamic colors,
matrices and resources remain uniforms/bindings. No frame-time improvement is
claimed for that cache from the current short SwiftShader test.

Reproduce these checks independently:

`node scripts/native-port/probe-constructor.mjs --live` exercises real browser
key events over 180 native steps and checks movement, jump, attack and absence
of death/respawn. `--render-steps` draws all 683 scripted combat steps and retains
the exact combat trace. `--input --render-steps` draws the 142-step walk/jump/
aerial/landing sequence. `--render` retains full snapshot verification.
None is a sustained hardware performance or broad gameplay-parity result.

## Original object draw callbacks

The native fixture now defaults to original fighter callbacks and HSD joint /
display traversal for all three object passes. The host backend in `tev-state.c`
scopes the DObj/PObj draw methods around each object, calls original material
setup and original matrix setup, and submits each selected runtime polygon to
`material-gpu.mjs`. Class methods are restored before returning. Unknown geometry,
custom primitive methods and shape-animation submission reject explicitly.
Original fighter callbacks perform body selection, visibility projection, light
overlays and cleanup. The legacy fixture keeps the generic stage joint callback;
`--stage-callbacks` runs the original camera/GX-link pass sequence and stage
callbacks, including dynamic background and model-effect ownership. Particle
polygons retain their original callback ordering and material state;
point/line particles, shadow-map capture and refraction are still incomplete. Preserve that distinction when reporting coverage.

The SDK's unchanged `GXProject` C routine is compiled from the pinned source.
The portable recipe corrects `lbVector_WorldToScreen`'s local projection matrix
from `Mtx` (12 floats) to `Mtx44` (16), as required by its SDK matrix writers.
Four manually derived projection cases cover perspective/orthographic transforms,
viewport offsets, depth mapping and output bounds.

`--render`, `--render-steps`, `--input --render-steps` and `--live` all use the
native callbacks by default. `--manual-draw` (or `callbacks=0` in the page URL)
retains the preceding selection path as an explicit development reference.
Neither path is certified for complete gameplay or sustained 720p60.

Hardware diagnostics can use `--hardware`; the report records the actual WebGL
renderer, so check it before assuming acceleration. `--live --hardware
--frames=1800` runs a 30-second baseline (early keyboard movement, then idle),
and `--render --hardware` checks shader goldens and transformed vertices on that
driver. Hardware reports use a separate `hardware-` filename prefix. The observed
Radeon 890M baseline had 1,799 draw submissions / 1,800 simulation steps over
30.011 seconds, with mean simulation 0.41 ms and draw submission 8.68 ms. This is
partial-scene submission timing, not competitive presentation or latency proof.

## Stage drawing and native allocation boundaries

The stage-callback fixture extracts the unchanged gameplay draw-pass sequence
from the original camera callback. An observer at HSD's object submission boundary
retains link priority, camera pass and opaque/translucent traversal while routing
polygons to the WebGL backend. Stage backgrounds and model effects obtain GPU
resources from their original live GObj/root/descriptor identities; retired owners
release those resources. Reused effect addresses refresh live polygon bindings.
This does not replace or adjust the gameplay camera's pitch, tracking or projection.

Original stage drawing exposed an omitted shadow allocator initialization. The
scene bootstrap now calls HSD_ShadowInitAllocData, and the constructor probe checks
that each fighter owns a distinct non-null shadow. GXGetTexBufferSize uses the
pinned SDK's complete CPU implementation for tile and mip-chain sizing. HSD object
pools now reject use before initialization, avoiding silent writes through WASM's
mapped address-zero page. Actual shadow texture capture remains separate work.

## Original particle polygon submission

Live stage fixtures now install the original map particle bank (bank 30) before
stage callbacks run. The importer converts the typed `map_ptcl` and `map_texg`
headers, command descriptors and relative texture tables; packed particle
scripts and texture bytes remain unchanged. It publishes only those two bank
roots, excluding the rest of the stage archive from HSD relocation. Original
`psInitDataBankLocate` / `psInitDataBankLoad` perform the runtime registration,
with a complete readback check before the first generator can spawn.

Battlefield, Final Destination and Dream Land use this path. The Fountain of
Dreams bank also has a typed conversion specification, but its live stage,
moving platforms and rendering boundaries are not yet integrated. Older stage
measurements without bank 30 omitted effects and may have different random
number consumption; do not treat them as equivalent performance controls.

The particle manager now runs efLib_render_callback and psDispParticles in the
original camera pass. The original code still sorts particles and computes their
corners, trails, colors, texture selection and matrices. The portable GXVert
header routes typed immediate writes into immediate.c; explicit psdisp FIFO
assignments use the same boundary. The adapter checks vertex descriptors, packed
byte lengths and indexed texture-coordinate array bounds, retaining console byte
order. Quads, triangles, strips and fans become indexed triangles without changing
winding. GPU buffers are reused across frames. The existing native TEV, texture,
lighting and pixel-state renderer consumes each primitive's captured state.

Point and line particles deliberately abort pending their screen-size and texture
offset implementation; they are not silently dropped. Shape-animation geometry,
full shadow captures and refraction are also still unsupported. Passing the
current two-Falcon workload is not all-effect or all-character coverage.

The rendered probe reports cumulative particle primitive/vertex counts and saves
a first combat particle image when drawing every step. Live timing resets particle
counters after the introductory prelude. Slow draw calls are recorded with frame,
material/program counts and resource counts to distinguish compilation/allocation
from general frame pacing. Draw submission is not distinct presentation.

## Roster constructors and sword trails

The complete fighter archive assembler accepts the original symbol for each
fighter whose `ftData.x48` item/extra table is absent. Captain Falcon, Donkey Kong,
Marth, Ganondorf and Roy currently use that path. It still rejects an unconverted
item table. The native constructor resolves the original external character kind
through `Player_800325C8` and lets `Player_80031AD0` own creation and registration.
Tournament initialization accepts both fighter kinds through the same mapping.

Each new fighter automatically loads its own hosted animation, model and effect
bank. Donkey Kong's effect bank has seven models and no particle bank; its 42
unreferenced export-time shape relocations remain outside the exposed graph.
Marth/Roy have two effect models each; Ganondorf has six. All table metadata and
reachable descriptor types are checked before constructing the native archive.

Sword trails execute the original `ftCo_800C2600` arithmetic, vertex colors and
triangle strip. A wrapper scopes the existing immediate GX receiver around the
original function. The original SDK `GXSetTevClampMode` definition is compiled:
it is empty in the retail SDK, rather than an unimplemented graphics operation.
Particle and afterimage submission counters are separate. GPU transform feedback
can verify every input-test frame, including afterimage vertices:

```sh
node scripts/native-port/probe-constructor.mjs --character=Ms --input --render-steps --verify-vertices --hardware
node scripts/native-port/probe-constructor.mjs --character=Fe --input --render-steps --verify-vertices --hardware
node scripts/native-port/probe-constructor.mjs --character=Dk --input --render-steps --verify-vertices --hardware
node scripts/native-port/probe-constructor.mjs --character=Gn --input --render-steps --verify-vertices --hardware
node scripts/native-port/probe-constructor.mjs --character=Ms --stage-callbacks --live --workload --hardware --frames=3600
```

Non-Captain input and live workload reports have a character prefix. The older
scripted combat/lifecycle assertions still require Captain and are not treated
as coverage of the entire roster. These are development fixtures, not complete
character-select or competitive-play support.

Live slow-draw records include synchronous shader compilation times and the
origin of each new program (model, particle or sword trail). On Mesa, use
`MESA_SHADER_CACHE_DISABLE=true` on the probe command to diagnose first-use
compilation without its persistent disk cache. The report records that setting;
it is a diagnostic condition, not a player requirement. A sword-only prewarm
experiment was removed: the following model/particle programs still stalled the
frame. Broader shader preparation remains necessary for consistent cold startup.

## Shader preparation and live GPU diagnostics

The constructor fixture can record generated GLSL and compile those exact
programs before its first draw. Preparation does not step the simulation or
replay a match, and the probe asserts unchanged fighter state around it. Catalogs
are local generated artifacts under ignored `dist/native-port`, keyed by the
WASM hash and four shader/state-generator source hashes. A stale catalog fails
explicitly. Exact generated-source lookup remains authoritative at draw time;
unseen variants compile normally and are reported as uncovered.

Use `--record-shaders` on a rendered constructor probe, then merge its records:

```sh
node scripts/native-port/merge-shader-catalogs.mjs shader-record-destination-Ca-live.json shader-record-destination-Ca-cycle.json shader-record-battlefield-Ms-input.json shader-record-battlefield-Fx-input.json shader-record-battlefield-Ms-live.json
MESA_SHADER_CACHE_DISABLE=true node scripts/native-port/probe-constructor.mjs --character=Ms --stage-callbacks --live --workload --frames=3600 --hardware --prewarm-shaders --defer-gpu-errors
```

Records made after preparation include inherited programs, not just programs
used by that workload. `shaderCoverage` distinguishes prepared/used/uncovered
counts; new records also report `inheritedPrograms`. The current 74-program
catalog covers selected Falcon/Final Destination, Marth/Battlefield and Fox
reflection fixtures, not all characters, moves or stages. Catalogs contain GLSL,
not textures/models; they still stay out of source control with generated assets.

Cold-driver-cache Final Destination controls compiled seven programs during
combat and had 38.8/44.1 ms maximum submissions. Preparation removed all seven
compilations, but the first prepared run still had a 24.6 ms first draw. Mean
submission time was unchanged at about 6.70 ms. Expanding the catalog removed
Marth's additional compilation stalls. Prepared/unprepared images match exactly
for the long Final Destination cycle and Fox reflection; GPU vertex checks pass.

A sampled CPU profile then attributed 573 of 5,208 non-idle samples to the
per-frame `gl.getError` call. `--defer-gpu-errors` moves that check to the end of
a live probe. Validation and the default renderer retain per-frame checks.
Two Marth controls averaged 5.99/5.94 ms submission; two deferred runs averaged
5.21/5.36 ms with identical gameplay traces and successful final error checks.
This avoids a CPU/GPU synchronization point; it does not reduce GPU work or
prove lower input-to-photon latency. The p95 timings did not improve consistently.
A one-time startup `gl.finish` experiment was reverted because its measured
duration was zero and no causal benefit was established.

See the shader-preparation benchmark evidence for raw timing summaries, source
identities and limits. These remain fixture measurements, not a complete playable
native port or distinct-presentation certification.


## Yoshi's Story integration

The `--map=story` fixture imports `GrSt.dat` and runs the original
`grstory.c` stage callbacks. Randall retains his spline animation, collision
binding and puff callback. The original Shy Guy item registration, constructor,
animations, hurtboxes and spawn/retirement callbacks run with a typed resident
Article. The stage's external shape-animation pointers are initialized to null
by the same rule as original `lbArchive_InitializeDAT`; unknown symbols fail.
No stage graphics or gameplay objects are omitted by this profile.

The bring-up now calls original `Ground_801C0378` before creating stage objects,
as VS startup does. Without its per-map collision-control allocation, Randall's
model animated while his collision stayed at the initial location. The stage
probe checks collision vertices against the current model matrix on every step,
requiring movement in all four directions and Shy Guy creation and retirement.
For a visible cloud sample, ordinary controller input drops both fighters through
their starting platforms and walks them toward the edges; the original camera
follows them. This does not assign camera or fighter transforms.

```sh
node scripts/native-port/probe-constructor.mjs --map=story --stage-callbacks --stage-only --stage-frames=9000 --render --hardware --record-shaders
node scripts/native-port/probe-constructor.mjs --map=story --stage-callbacks --live --workload --frames=3600 --hardware --record-shaders --defer-gpu-errors
node scripts/native-port/merge-shader-catalogs.mjs shader-record-story-Ca-live.json shader-record-story-Ca-cycle.json
MESA_SHADER_CACHE_DISABLE=true node scripts/native-port/probe-constructor.mjs --map=story --stage-callbacks --live --workload --frames=3600 --hardware --prewarm-shaders --defer-gpu-errors
```

Run probes sequentially: their diagnostic screenshots share output filenames.
Shader records are tied to the exact current WASM and shader-generator hashes;
re-record after a changed build instead of bypassing identity validation. These
checks do not establish complete stage startup, Randall landing/ride parity,
Shy Guy combat interactions, all-character coverage or distinct presented FPS.

## Frozen Pokémon Stadium profile

`--map=stadium` selects the user-approved frozen layout. Its original stage
initializer, flat terrain callbacks, collision topology, material animations,
background particle process and gameplay camera remain. An explicit boundary
replaces the transformation scheduler with checks that its original phase is
zero and its terrain is the default form. The timer is not artificially enlarged
or reset on each frame. The long probe checks the scheduler was called, active
collision joints remain 4 and 6, and every collision vertex stays unchanged.

The background screen is a static cosmetic profile. It keeps the original screen
quad and frame, hides its transformation overlays, and uses a defined dark
material/texture. It does not construct offscreen SIS text/capture cameras or copy
another view of the match each frame. The original inactive stage-camera subject
is still created. VS screen notifications are accepted without altering gameplay.
This is not a completed port of the original live jumbotron or a measured A/B
speedup against it; that text/capture path still needs integration. The profile
also omits the screen-content timer/RNG sequence. Exact RNG parity to an unfrozen
retail Stadium scene is not claimed.

The typed importer clears the 75 original transformation externs using the
original DAT-load rule, bounds their chains to transformation descriptor slots,
and rejects unrelated external names/layouts. It imports the resident base model and lights,
packed color/timer fields, collision descriptors, and all 30 stage particle scripts
with ten texture groups. Transformation archives are never requested in this
frozen profile. Hosted startup requires no player-supplied disc.

```sh
node scripts/native-port/probe-constructor.mjs --map=stadium --stage-callbacks --stage-only --stage-frames=9000 --render --hardware --record-shaders
node scripts/native-port/probe-constructor.mjs --map=stadium --stage-callbacks --workload-steps --frames=3600
node scripts/native-port/probe-constructor.mjs --map=stadium --stage-callbacks --live --workload --frames=3600 --hardware --record-shaders --defer-gpu-errors
node scripts/native-port/merge-shader-catalogs.mjs shader-record-stadium-Ca-live.json shader-record-stadium-Ca-cycle.json
MESA_SHADER_CACHE_DISABLE=true node scripts/native-port/probe-constructor.mjs --map=stadium --stage-callbacks --live --workload --frames=3600 --hardware --prewarm-shaders --defer-gpu-errors
```

The fixture explicitly reports its modified callback profile. It is not a full
matchup, edge-case collision, network, displayed-FPS or latency certification.

`--stadium-fireworks-off` additionally excludes bank 30 from particle drawing
only after validating the active Stadium stage. Its original spawning, particle
scripts, lifetime and random-number calls continue running. Common/fighter
effects remain visible; point batches stop before consuming excluded particles.
The exclusion resets on stage installation, and other stages reject the flag.
Use the same core and prepared shader catalog for fireworks-on/off comparisons;
do not infer a performance gain just from the reduced draw count.

## Jigglypuff integration

`--character=Pr` now imports the original complete fighter root, including its
extra costume-attachment visibility table. That table is a `FtPartsDesc`, not an
Article. The importer retains all five rows and their shared packed index lists;
unknown slots, missing relocations, bounds errors and overlapping records fail.
The default costume is exercised; loading/rendering the four separate hat
costumes still requires integration. The Purin effect bank imports all five
particle definitions, two texture groups and the original Sing model/animation.

`--purin-moves` drives normal controller input through all five aerial jumps,
Rest, Sing, grounded and aerial Pound, and Rollout startup/charge/release. It does
not write positions, motion states, damage or velocity. Rollout can leave the
stage and run original death/respawn callbacks. `--purin-contact=rest|sing|control`
uses two original constructors and ordinary approach input. The Rest probe records
peak damage before KO/respawn can reset it; the Sing probe requires the original
DamageSong state, and the no-button control must have no hit. These are integration
checks, not a retail per-frame parity certification.

```sh
node scripts/native-port/probe-constructor.mjs --character=Pr --input --purin-moves --render-steps --verify-vertices --hardware
node scripts/native-port/probe-constructor.mjs --character=Pr --input --purin-contact=rest
node scripts/native-port/probe-constructor.mjs --character=Pr --input --purin-contact=control
node scripts/native-port/probe-constructor.mjs --character=Pr --input --purin-contact=sing --render-steps --verify-vertices --hardware --record-shaders
node scripts/native-port/probe-constructor.mjs --character=Pr --stage-callbacks --live --workload --frames=3600 --hardware --record-shaders --defer-gpu-errors
```

Native link archives and source/header inventories are sorted before construction.
Previously, unordered `rg --files` traversal changed core layout and hashes across
identical rebuilds. Two consecutive builds now produce the same WASM hash on the
recorded toolchain. Shader identities remain strict; re-record when code changes.
