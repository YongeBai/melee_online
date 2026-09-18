# Engineering notes worth keeping

Saved September 10, 2026. This is the durable handoff for the working room/CPU
build, before the input-latency and auto L-cancel experiments. Refer to source
and validation reports rather than treating an old screenshot or benchmark as
proof of a future revision.

## Direct browser port update (September 17)

The default two-player product room now uses the audited dirty WASM core,
exact sparse checkpoints, authenticated prediction/correction, confirmed audio,
and a separate dirty presentation replica. Precompile the exact shader catalog
and exercise the first 30 neutral presentation frames during loading, then
restore the complete simulation/global/audio checkpoint before frame zero.
Wait for the relay's shared phase-ready before advancing even the neutral input
prefix; otherwise the faster browser consumes its prediction window during the
other client's loading boundary. The scheduler advances at most one forward
frame per animation callback because a second step cannot become a distinct
browser presentation. A resumable 26-case performance matrix now sustains 1,800
combat frames for all 25 roster tiles plus held-A Sheik while cycling all six
legal stages. It captured 46,800/46,800 distinct 960×720 post-draw snapshots;
simulation was 59.557–59.933 FPS, captured cadence was 59.700–59.970 FPS and draw
p95 was 7.1–14.1 ms. Require a clean host window before each row because
unrelated shared-host builds produced synchronous false max-frame failures on
both browsers. This is browser-canvas evidence, not physical presentation, WAN,
input-to-photon or exhaustive matchup certification. `?lockstep=1` retains the
old three-frame path only as a diagnostic control. See the
[roster performance evidence](benchmarks/browser-2026-09-18-native-room-roster-720p60.json)
and [stage/seat evidence](benchmarks/browser-2026-09-18-native-room-720p60.json).
The separate 60-frame matrix remains the fast loading/correctness regression for
all 25 roster tiles, held-A Sheik and all six legal stages; see
[the roster/stage evidence](benchmarks/browser-2026-09-18-native-room-matrix.json).
The room relay also accepts a test-only, order-preserving delivery-delay
function. Keep its null production default on the direct send fast path, keep
per-socket ordering when delay varies, and distinguish configured delay from
head-of-line carryover in telemetry. A repeating 4–20 ms downstream delay run
sustained 59.609–59.622 simulation FPS and 59.670 captured FPS while exercising
186 corrections/444 replayed frames with exact final convergence. This does not
model upstream delay, loss, reordering or a real WAN; see the
[relay-delay evidence](benchmarks/browser-2026-09-18-native-room-relay-delay-720p60.json).
The same scheduler now has an independent receive side, also disabled by
default. Authenticate, parse and rate-limit before scheduling; revalidate the
session when the delayed action executes. Pending-count ordering is required:
a later zero-delay message must not overtake an earlier timer whose due time has
passed while the event loop was blocked. With independent 2–10 ms patterns in
both directions, the product path sustained 59.875–59.916 simulation FPS and
59.978 captured FPS while exercising 232 corrections/452 replayed frames with
exact convergence. This still does not model loss, reordering or real WAN
behavior; see the
[bidirectional-delay evidence](benchmarks/browser-2026-09-18-native-room-bidirectional-delay-720p60.json).
The default URL, without a rollback query parameter, repeated that sustained
gate at 59.557–59.698 simulation FPS and 59.770 captured FPS. Both clients
reported `productionDefault: true`; a separate 900-frame CPU match did not enter
rollback. See the
[default-room evidence](benchmarks/browser-2026-09-18-native-room-default-rollback-720p60.json).
Treat disconnect as a confirmation-horizon problem, not merely a socket retry.
Pause input acceptance whenever either seat is absent, retain the last 512
confirmed input pairs, and have the reconnecting client authenticate its epoch,
phase key and last contiguous confirmation. Replay peer input before each missed
confirmation and preserve WebSocket order. If the journal cannot cover the
reported horizon, force the existing unsynchronized reload so the relay creates
one coordinated fresh epoch; never resume from a partial history. Transport and
browser tests cover both paths. The sustained forced-cut probe recovered seat 1
at frame 600 in 268 ms without changing epoch or phase, then completed frame
1799 with exact final convergence. Report both raw wall cadence (which includes
the visible pause) and active cadence (which excludes only that measured pause);
never describe reconnect recovery as uninterrupted presentation.

The product results layer is now a fixed-4:3 animated tournament presentation,
not the former temporary table. Populate it only from `gm_Scene_Vs_OnExit`
standings; use hosted SIS glyphs and display stock, damage and categorical
win/loss/draw state. Do not expose the raw internal `score` word—the losing
fixture contains a packed sentinel rather than a player-facing statistic. Keep
input disabled through the 900 ms reveal and preserve reduced-motion behavior.
Select victory music from the original `ckind_victory_themes` table in
`melee/gm/gm_1601.c`, resolving its indices through `hps_files` in
`melee/lb/lbaudio_ax.static.h`; do not infer families from the browser roster.
The hosted fixture contains all 13 `ff_*` HPS files used by the 26-character
roster, and browser validation must observe both the requested track and nonzero
audio-graph output. This does not claim the original `GmRst` 3D scene.

The original result presentation is split across `GmRst.usd`, `SdRst.usd`,
and 26 `GmRstM??.dat` character-motion archives (Ice Climbers intentionally
shares one archive with two public roots). `GmRst.usd` is not a menu table: its
`pnlsce` and `flmsce` publics are complete `SceneDesc` graphs containing dynamic
model animation lists, cameras, lights, and fog. Import those fields by type and
retain the original camera descriptors. The verified graph has five model roots,
141 joints, 143 meshes, and 4,857 relocation slots. Hosting and converting these
assets is only a prerequisite; do not claim the original `GmRst` scene until the
runtime instantiates, animates, and visually validates it.

The result-motion publics are not ordinary relocated archive graphs. Each is a
32-byte-aligned concatenation of nested HSD FigaTree archives, with no outer
relocations. Validate every nested tree before passing the original public to
`ftDemo_SetArchiveData`. The hosted set contains 27 publics (Popo and Nana are
separate), 244 clips, 38,500 tracks, and 338,526 decoded animation commands.
Never infer clip boundaries by scanning payload bytes; advance by each nested
archive header size and its required 32-byte alignment.

The isolated panel bring-up now instantiates `pnlsce` through the original HSD
archive, camera, light, JObj, and animation APIs, then submits its material state
through the browser renderer. Preserve its descriptor exactly: the result camera
uses a 25-degree FOV and 1.216667 projection aspect inside the 4:3 canvas. This is
intentional native result-screen framing, not a gameplay-camera regression. The
standalone path now applies the original per-port joint visibility sequence,
placement frames, character-name texture selection, and winner-title animation.
A Fox/Falco render visibly shows FOX, 1st/2nd, P1/P2, and the original No Entrant
treatment for ports 3/4; repeated construction covers all 26 character texture
frames with zero cleanup leaks. The isolated path also loads the hosted
`SdRst.usd`/`SIS_ResultData` archive and recreates the stock-result score, KO,
fall, and self-destruct rows at the original `0x62`-`0x68` joint anchors. Feed
that layer only already-derived counters: the displayed score is derived from
KOs, falls, and self-destructs rather than copying the packed product score word.
Build this experiment with `--result-scene`; it
has a separate `melee-result-scene.wasm` so result iteration cannot perturb the
validated product fighter core. Do not put it in the product result lifecycle
until it consumes live standings and renders the fighter cameras.

The isolated target now also constructs Fox and Falco through the original
`fn_8017A67C` result-demo path. Convert both the outer `GmRstM??.dat` metadata
and every nested FigaTree header/descriptor in place; preserve nested archive
sizes, public offsets, and packed animation streams. `Player_80036E20` cannot
retain the decompiler's `str_PdPmdat_start_of_data` adjacency overlay in WASM:
the portable source must name `ftMapping_list` directly. Result fighter startup
also needs the typed item runtime, common effects, camera, and dynamics pools
before character `OnLoad` callbacks run. Animation sources may live in either
resident files or owned `lbHeap` archive copies, so the validated copy boundary
tracks both ranges. The browser probe observes distinct Fox/Falco owners and
advancing native frames (Fox 0→60, Falco 0→10 after its loop). Their GPU fighter
draws, result-camera/scissor composition, all-roster construction, live
standings handoff, and result-screen cadence are still separate gates.

The same isolated target now constructs the untouched per-player cameras through
`fn_8017A318`. PPC retained that function's camera pointer in `r3` and treated
the result-player data block as one linker-adjacent overlay; portable C must
return the camera explicitly and name `gmResultCharacterScaleData`,
`gmResultCharacterData`, and `gmResultCameraDesc` directly. Both Fox/Falco
capture cameras retain the original 20-degree FOV, 1.216667 aspect, and
`270,370,124,276` scissor. The Fox winner also owns the original full-frame
camera, whose callback submits the fighter five times across native passes
0–2. Browser result callbacks use the existing offscreen camera setup because
the isolated module deliberately has no console video mode. Teardown now returns
actor objects and processes to zero. This validates camera construction and
callback traversal, not GPU pixels: the loser portraits still require the
original EFB-copy-to-panel-texture boundary, which is not implemented yet.

The optimization notes below preserve the state of earlier experiments; their
old production-disabled conclusions are superseded by the default-room gate.

[Cold shader preparation](BROWSER-NATIVE-SHADER-PREWARM.md) eliminates observed
compile spikes with the existing exact-source cache, but the repeated Fountain
capture result stays about 57.1 FPS. The sampled 87-program rollout was rejected
and its runtime changes reverted. Keep the distinction between cold-stutter
improvement, exhaustive variant coverage, and sustained frame cadence; prioritize
steady submission/correction costs for the remaining performance work.

[Illusion/Phantasm attachment lifetime](BROWSER-NATIVE-ILLUSION-ATTACHMENTS.md)
includes the separately owned `xDDC` ghost in native item enumeration. The
original item callback draws both roots; registering only its primary tree
causes a missing-geometry failure during ordinary Fox CPU play. Preserve exact
owner/root/descriptor identities, binding refresh and retirement. Do not hide
this failure by dropping the callback or relaxing the geometry guard.

[Per-draw uniform buffers](BROWSER-NATIVE-UNIFORM-BUFFER.md) copy all dynamic
values into versioned owned std140 records under an exclusive presentation lease.
Validate each linked program against reflected offsets, types and strides; keep
aligned ranges, epoch/lease guards, context boundaries and the direct-uniform
fallback. Retain `uniformbuffer=0` and every-frame pixel/camera/memory oracles.
The measured draw-CPU reduction was modest; Fountain still failed the repeated
720p60 cadence gates at that milestone.

[Exact draw-state staging](BROWSER-NATIVE-DRAW-STATE.md) interns only fully
compared, pointer-free TEV instruction rows and immutable owned uniform versions.
Copy dynamic registers every draw; reset all GL knowledge at every flush. Keep
the original `exactstate=0` path and strict every-frame pixel/camera/memory
oracles. Generic uniform comparison and texture object pools were slower and
removed. A Battlefield diagnostic pass is not full 720p60 certification.

[Exact sparse checkpoints](BROWSER-NATIVE-SPARSE-CHECKPOINTS.md) share audited
dirty marks through independent subscriptions. Never clear the native bitmap
outside that hub or omit the restore writes from presentation history. Skip a
restore page only with both an unchanged live baseline and exact page identity;
releasing the baseline invalidates that proof. Retain full-store controls and
full capture/restore coverage audits. Production remains lockstep.

[Layout-keyed immediate resources](BROWSER-NATIVE-IMMEDIATE-POOL.md) replace the
rejected positional plan pool. Retain only owned streams and GPU capacity, keyed
by batch/attribute/register layout; recreate all frame metadata and state.
[Packed render staging](BROWSER-NATIVE-PACKED-STAGING.md) reuses JS matrix slots
within an exclusive cache lease. Never reuse a slot
while its draw remains queued; copy/upload every current value and keep native
bindings outside the pool. Use per-frame RGBA/camera and full-memory audits when
changing this lifetime boundary. Production rooms remain lockstep.

The [draw-submission experiment](BROWSER-NATIVE-DRAW-SUBMISSION.md) keeps exact
texture comparisons, immutable context snapshots and shader-variant lookups.
Use its unoptimized cache option and uncached renderer as independent controls;
do not retain native bindings across a replica overwrite. Its rollback runs
still fail the simulation/captured-frame gate.

The [instrumented-write replica](BROWSER-NATIVE-DIRTY-REPLICA.md) is a further
diagnostic experiment. Its dirty bitmap covers every native store and audited
host write; never refresh its source/core hash pins without renewing that audit.
Keep no-correction per-draw coverage checks as well as rollback regressions.

The [presentation replica experiment](BROWSER-NATIVE-RENDER-REPLICA.md) isolates
draw-side allocations and native writes in a second private WASM instance. Its
older generic delayed-input harness remains below the captured-FPS gate; do not
substitute the newer product-room simulation/submission result for that missing
capture evidence. Default production rooms remain lockstep.

Use `BROWSER-NATIVE-720P60.md` for the every-forward-frame harness. Keep local
play, detached presentation and delayed-input rollback separate. Draw counters
and simulation FPS are not captured-frame FPS; canvas-capture timestamps are
not physical presentation or input-to-photon evidence. Discard the stream's
possible automatic first frame and retain observer-disabled controls. Use the
fixed 60 Hz clock even on high-refresh displays. The six-stage sparse rollback
probe remains a correctness oracle, not a sustained presentation benchmark.

The experimental rollback boundary is documented in `BROWSER-NATIVE-ROLLBACK.md`.
Its next revision uses exact shared pages plus a separate cache of immutable GPU
assets; see `BROWSER-NATIVE-ROLLBACK-OPTIMIZATION.md`. Keep live native bindings
and scratch allocations outside that cache, exclude mutable shape buffers, and
compare all source image/palette bytes before reusing a texture after restore.
The corrected canvas must match a fresh uncached renderer at the same boundary.
Page sharing is exact comparison, not a license to omit unobserved memory regions.
Never restore WASM memory underneath an attached renderer: its JS ownership maps
retain pointers to allocations in that same heap. Full memory also omits mutable
WASM globals unless explicitly exported/captured; the present runtime has four.
The diagnostic captures both plus a deterministic host journal, guards table and
memory-size stability, and destroys/reconstructs native presentation bindings around
restores. Native draw calls mutate WASM, so its draw/discard boundary still needs
a gameplay-dependency audit. Successful complete-state convergence in the probe
does not turn production lockstep into rollback or certify 720p60. Constructor
still images precede the live canvas; remove them in this diagnostic before
capturing a corrected-frame screenshot.

The development native port now runs the decompiled C directly in browser WASM.
Its current scope and limitations are in `BROWSER-NATIVE-PORT-STATUS.md`; the
server-streamed implementation described below is the historical/public path.
The native product profile uses typed original HSD objects for the two-card
layout, an alpha canvas plus clipped native-hand foreground passes, and the
established controls. Never regress to diagnostic keys or four visible slots.
A CPU slot must be accepted by the host constructor before calling original
player initialization. Gate tap jump at the original jump predicates rather
than zeroing stick Y; CPU and Nana must retain native jumps.

The solo Dolphin configuration leaves controller port 2 unplugged. The native
product menu must likewise disconnect its CPU port before copying pad status;
a connected neutral sample otherwise creates a spurious CPU hand. Keep P1's
original CPU-token hit tests. Reconnecting P2 restores its shifted card position,
and changing opponent kind calls the original card-refresh function. Hide the
CPU keyboard icon and omit its alpha aperture together, including the first
render before the native disconnect callback runs. Human hands still render
above the room controls and their keyboard icons.

Music has a browser stream backend; SFX still uses the explicit muted boundary.
Do not confuse accepting a queued music request with sound reaching the output:
inspect context state and audio-graph samples after a user gesture. Decode HPS
in a worker, cancel obsolete track loads, retain native loop points, and preserve
the paused offset across hidden tabs. Original VS startup also calls
`Stage_80225074(fn_8016E5C0(start))`; omitting it leaves menu music playing during
matches. This selector can use native RNG, so verify room synchronization after
changing its call site. The extraction and server allowlist must include music
without adding a player-supplied file requirement. Victory themes use the same
hosted HPS pipeline: `prepare-music.mjs` extracts every `ff_*` file referenced by
the original character-kind table, while runtime startup remains no-ISO.

Post-match routing stops at the original scene-exit flag, then calls
`gm_Scene_Vs_OnExit` once to read native rankings. Frame-limit/manual probe stops
must never fabricate results. The browser tournament presentation is not the
original `GmRst` 3D scene and must not be described as such. Rematch reloads a fresh
WASM instance rather than reusing match statics. Restore only playable characters,
valid native costumes and the six legal stages; rules remain fixed. Apply forced
rematch stage selection after SSS initialization so its original objects and
archive cleanup exist. Room return requires matching end reports and two rematch
votes, with one epoch change; Character Select can be requested by either player.
A post-return AudioContext resume attempt must still obey browser autoplay policy
and report actual audio-graph output, not merely an accepted music request.

Portable-source provenance includes both injected menu include files. Re-run
compile audit and audit-link before building when changing either include.
`prepare-menu-ui.mjs` copies existing extracted UI fixtures into ignored output;
it does not add an ISO requirement to browser startup. The optional room relay
transports inputs only. Its three-frame lockstep must not be described as rollback.

## What was running at the earlier checkpoint

`/play/` uses one authoritative Linux headless Dolphin process per room. Browsers
send controller changes and receive H.264/PCM. Rollback saves and restores the
whole emulator; it is not two local browser emulators. The decompilation supplies
symbols and understanding, not a standalone browser game. The supplied local ISO
supplies real models, animation, AI, audio, and menus. The software WASM path is
retained but previously measured only roughly 14–24 rendered FPS.

The native game picture is 960×720 (4:3), padded into a 1280×720 stream. Do not
stretch Melee to 16:9 or call duplicated/interpolated frames real simulation FPS.
OpenGL is the tested default; Vulkan crashed in sustained testing on this Mesa
GPU/driver. Room workers use single-threaded emulation with real MMU mode;
see `scripts/native/server.mjs` for the current worker/solo differences.

Authoritative current docs: `ROLLBACK-AND-ROOMS.md`, `DEPLOYMENT.md`, and
`VALIDATION.md`. `NATIVE-RENDERER.md` also contains historical solo configuration;
its old port and queue details are not the current room defaults.

## The native UI recipe

The successful result combines real game assets with changes to native render
objects, not a website drawn over a stock four-player menu.

1. `scripts/assets/extract-menu.mjs` reads the local disc, decodes GX menu textures,
   and renders labels from Melee's SIS font. Use those glyphs for room codes,
   statuses, and actions. Extracted files live in ignored `.melee-assets/`.
2. `scripts/engine/melee-css-layout.js` moves P2's original card/model/nameplate
   to the right and hides unused P3/P4 joints. It also moves the native hit bounds.
   Apply transforms in a render callback after native animations, or animation
   updates will overwrite a one-time memory edit. Nameplates are separate SIS
   text objects; moving only the joint tree is incomplete.
3. Room controls fill the space between the two native cards. The keyboard view
   uses a procedural Three.js keyboard and physical GameCube button shapes,
   plus native-looking Back and toggle artwork. Retain this visual language.
4. Preserve the full native roster: Zelda/Sheik use the shared Zelda tile and
   native hold-A behavior. Preserve native stage selection and native pause.
   Opening keyboard settings isolates that client's game input while menu music
   and the native CSS continue running.

### How the hand stays above added controls

CSS `z-index` cannot put an HTML control underneath one object inside an opaque
video. We solved this at the native draw pass and browser GPU compositor:

- `melee-foreground.js` intercepts the two original hand render callbacks. In the
  final camera pass it draws three magenta rectangles using Melee's own GX
  routines, then renders all original passes of both animated hand models.
  The second hand's ordinary callback becomes a no-op, avoiding duplicate draws.
- `native-presenter.js` keys only those reserved rectangles to transparent in a
  WebGL shader. Room controls and keyboard indicators have CSS z-index 1; the
  transparent game canvas has z-index 2 and does not intercept pointer events.
- The real hand pixels, animation, position, and shading remain in the same
  encoded frame as the game. There is no approximate HTML hand or separately
  sampled cursor overlay to drift behind the image.
- Restrict keying to the room/icon rectangles and disable it during matches.
  Global magenta removal damages legitimate character colors. H.264 4:2:0 mixes
  chroma at edges; the shader uses a threshold and spill suppression.
- Keep native aperture coordinates and HTML dimensions aligned, including at
  different viewport ratios. P1 and P2 both need an underlying indicator because
  the same video stream contains both openings. Removing an underlying element
  leaves a transparent/black hole.

No ISO modification was required. The hooks are checked runtime RAM edits.

### Never flash the original character select

`menu-frame-gate.h`, applied from `patch-native.mjs` in Dolphin's frame dumper,
rejects CSS frames before readback/encoding until both layout callbacks are
installed and the native foreground pass has written its ready marker. Checking
callback addresses alone is insufficient: installation can precede the first
actual customized draw. The browser retains the previous frame during setup.
CPU mode changes retain the room panel during the native scene reload.

Do not replace this with a timeout, CSS fade, or frontend-only loading flag;
those allow unmodified frames into the encoder/presentation queue. Preserve the
gate at boot, CPU changes, results/rematch, and kick recovery.

## Useful GALE01 USA 1.02 addresses

These are version-specific, not general Dolphin APIs. Validate original opcodes,
object pointers and cave occupancy before writes; invalidate the instruction
cache/JIT when code changes. Inspect decomp source and original DOL together.

| Address | Purpose |
| --- | --- |
| `0x804D6CBC` / `0x804D6CC0` | CSS root GOBJ / JOBJ |
| `0x804A0BC0` / `0x804A0BC4` | P1/P2 cursor userdata pointers; first word is hand GOBJ |
| GOBJ `+28` | Native render callback |
| Cursor `+0xC` / `+0x10` | Native hand origin X/Y; not its fingertip |
| `0x80391070` | Original HSD GOBJ/JOBJ render callback |
| `0x80391A04` / `0x80391580` | Debug primitive setup / DrawRectangle |
| `0x80361FC4` | HSD state-cache invalidation after custom GX drawing |
| `0x80001840` | Hand foreground PPC stub |
| `0x80001AFC` | P2 ordinary renderer no-op |
| `0x80001B00` / `0x80001B40` | Foreground data / rendered-ready marker |
| `0x80001C00` / `0x80001C80` | Layout PPC stub / transform table (table ends below `0x2800`) |
| `0x80002800` onward | Seven tap-jump stubs at `0x80` stride; reserve existing hook region |
| `0x80002F00` / `0x80002F01` | Per-port tap-jump flags; zero means enabled |
| `0x80480820` + port × `0x24` | CSS player records; kind `+1`, stocks `+2`, CPU level `+15` |
| `0x80479D58` / `0x80479D5C` | Scene / render frame counters |

**Do not use `0x80001800` for injected code.** Dolphin installs its HBReload hook
there; an early foreground prototype exited the emulator when it jumped there.
The foreground stub starts at `0x1840` specifically to avoid that hook.

Native CSS camera projection for this layout, in normalized full 1280×720 video
coordinates, is approximately `u = .5 + x*.01073`, `v = .5 - y*.01725`.
Fingertip is approximately origin `(x+5, y-.75)`. Validate visually before using
these for a different camera. The keyboard hit target's P2 shift is 44.75 world
units, not the earlier 46.2 estimate. Source is `melee-runtime.js`.

The decomp's GetSaveData header offset was misleading in this build: actual save
data was `main + 0x1868`, not `+0x1898`. Never infer address compatibility from a
function name alone. Native controller/player identity also involves multiple
fields; validate actual fighter port, player ID and controller index after Start.

## Input and lifecycle findings

- Owner is always P1/port 0; guest is P2/port 1. Bind input to the authenticated
  socket seat, never to a client-supplied port. Refresh must preserve that seat.
- Public six-character invite codes are separate from private reconnect tokens
  in sessionStorage. Kick revokes the guest token, clears both controllers,
  stops rollback, and returns to CSS. Handle reserved disconnected seats too.
  Kicking a guest with keyboard settings open must close the dialog and reset
  local pause/input state so the new-room Start action is accessible.
- Reserve joins/mode changes across asynchronous calls. A rejected leave must
  retain membership; deleting it before checking a transition strands the seat.
- CPU mode reloads CSS with P2 kind=1 and level=9. Human guest joins are excluded
  until Remove CPU. CPU matches do not allocate rollback checkpoints. Both
  selected characters persist through opponent changes and results.
- A scene number can change before its objects and frame counter are ready.
  Require valid objects and scene progress, not just a fixed timer. The room
  monitor waits for CSS progression before enabling Ready and reapplying layout.
- Tap jump required seven patches, including MWCC-inlined checks. Patching only
  exported functions left some standing/running/air jumps active. Preserve the
  native displaced instruction, register/CR behavior, per-port settings, button
  jumps, DI/aiming, CPU behavior, and Nana's AI where intended.
- Do not use UI polling (100 ms) to implement frame-sensitive landing mechanics.
  Gameplay assists must run in emulated code and be deterministic under rewind.

## Performance wins and traps

For the direct C-to-WASM rollback path, the current dirty core has a fixed
10,486-entry function table and no mutable table instructions. The dirty builder
rejects `table.set/grow/fill/copy/init` and `elem.drop`; the pinned Emscripten
glue has no host table mutator. `fixedTableContents` may therefore skip repeated
entry-by-entry checkpoint/replica guards only when it comes from the reviewed
dirty manifest. Continue checking table length, memory identity/growth, health,
renderer detachment and all snapshot/dirty invariants. Uninstrumented or changed
cores must keep the old scan. `--verify-immutable-table` forces it for controls.
See `docs/BROWSER-NATIVE-IMMUTABLE-TABLE.md` for the audit and measurements.

The same dirty fan-out can replace repeated texture source comparisons only
through `createDirtyRangeTracker`. Its stamp polls every 4 KiB page spanned by
the exact image/palette views, advances monotonic page versions before clearing
raw marks, and fans each write to existing snapshot/presentation subscribers.
Foreign buffers, memory growth, disposed trackers and version exhaustion must
fail closed. A changed stamp always takes the original byte comparison; never
use addresses alone as texture identity because rollback can restore different
bytes at the same address. See `docs/BROWSER-NATIVE-TEXTURE-STAMPS.md`.

Current rollback uses full Dolphin snapshots every four frames, a 12-frame late
window, and five slots (~383 MB total on the measured build). Worst correction
can replay 15 frames because it starts at the preceding checkpoint.

Wins: remove unused fake MMU RAM using real MMU mode; reuse GPU allocations while
still serializing contents; skip intermediate replay capture/audio; do not copy
the unchanged restored checkpoint again. Preserve compiled code only when cached
instructions match restored RAM and the instruction cache is coherent. Changed
code/BAT mappings must take normal invalidation. Do not trade determinism for FPS.

Video presently starts with three decoded frames and caps room queues at eight.
Prior stress runs averaged roughly 74 ms in this presentation queue alone. That
is a concrete latency target, not proof that the whole pipeline is 74 ms. A
server stream still incurs input transit, simulation, encoding, video transit,
decoding and presentation. WebSocket/TCP can add head-of-line stalls.

Prior evidence: sustained native delayed-input runs matched reference MEM1 hashes;
a two-browser 60-second stress sample achieved ~59.86/59.91 presented FPS with
333 corrections and zero dropped frames. The UI/CPU turn's separate 20-second
human-match sample measured ~59.98 presented FPS with zero dropped frames but no
induced corrections. Keep workload and duration attached to numbers.

## Reproduction and experiment isolation

- `npm run serve`: production-style server; `MELEE_PORT` selects its port.
- `npm test`: native-memory/room/rollback/asset/transport checks (28 at checkpoint).
- `/play/?qa=1&online=1`: room QA; plain `?qa=1` exercises solo diagnostics.
- `MELEE_VERIFY_FRAMES=3600 MELEE_VERIFY_STRESS=1 MELEE_VERIFY_MIN_FPS=60 node scripts/native/verify-rollback.mjs`:
  real-emulator deterministic rollback verification; run away from live rooms.
- Browser QA panels can overlap and move after results render. Use role-based
  button activation with Enter when pointer clicks could hit a moving overlay.
  Separate control pulses so key-up/neutral reaches the emulator.
- Native source modifications belong in reproducible patch scripts, not just the
  ignored Dolphin checkout. Setup stamps hash the patch/header/setup inputs.
- Each experiment needs independent mutable engine source/build and runtime
  directories. Do not symlink an engine that setup will patch into another live
  worktree. ISO/reference repos can be read from the original workspace.
- The other `codex/browser-dolphin` worktree is independent work; do not reset,
  rebuild, kill, or overwrite it. Supplied Slippi binaries are references, not a
  ready-made browser rollback engine.

Next experiments and external sources belong in the input-lab worktree's
`docs/INPUT-LAB.md`. Preserve this tested baseline until experiments are measured.
