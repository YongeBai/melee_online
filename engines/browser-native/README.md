# Browser-native Melee port

This is the direct C-to-WebAssembly port, separate from Dolphin WASM. The current
two-Falcon/Battlefield fixture runs original VS stock/timer logic and native HSD
model draws through WebGL. It is not a complete competitive release; see the
[current status](../../docs/BROWSER-NATIVE-PORT-STATUS.md) and lifecycle probe below.
The earlier subsystem milestones described here execute original collision,
archive and RNG routines and load six tournament stages' collision subgraphs.

The next milestone also runs the original OS/HSD allocator and object scheduler,
loads all 27 playable fighter components' common attributes, and executes original
gravity/friction and FObj/AObj animation code. Chrome has decoded and replayed all
5,508 clips in the 27 fighter animation archives. These are subsystem checks;
selected SDK math and a limited animated bone hierarchy also run natively. The
full fighter action-state machine and renderer are pending.
The separate scene bring-up target now uses original HSD class ownership,
reference resolution, matrix updates, destruction and Melee's `lbAnim` attachment.
It drives the diagnostic GPU view, but the original GX material/draw boundary and
complete roster creation are still incomplete. Captain Falcon now completes the
original player-owned constructor; the final section describes its limited probe.

Original HSD material setup can now be captured at its GX TEV boundary. The
straight-line WebGL combiner passes signed-integer readback checks for the 33
programs used by 1,753 default-fighter material instances, plus synthetic cases.
See [TEV scope and provenance](TEV-NOTES.md). The live match-object diagnostic
now connects original matrix palettes, texture generation, lighting, combiners
and ordinary pixel-engine state to actual draws. Complete native draw callbacks,
effects, HUD and match startup remain. After a fighter build and
`probe-constructor.mjs --render`,
run `node scripts/native-port/verify-gpu.mjs --tev` for live captured programs.
The scene GPU regression also checks all 27 components' material programs.

## Reproduce

The optional native VS lifecycle probe uses hosted `PdPm.dat` and `IfAll.usd`
alongside the existing prepared fixtures. Re-run the development fixture tool
after updating, then build `--fighter-init`. The browser still loads all assets
automatically; no player ISO or file picker is involved.

`--hud` implies the tournament fixture and adds the original timer, countdown,
and match-end status graphics. It uses the original HUD camera independently
of the gameplay camera. Damage percentages and stock icons remain pending.
Use `--hud --timeout --render-steps --hardware` to render the final six seconds
and timeout animation after advancing the real eight-minute clock. Use
`--hud --live --workload --hardware --frames=3600` for the sustained input-driven
combat workload. Draw submissions are not a measurement of distinct presentation.

```sh
node scripts/native-port/probe-constructor.mjs --tournament
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
through the original fighter callback and original model/animation. Status models
are initialized for end-sequence logic but are not yet drawn by the HUD camera.
The scene still uses partial Battlefield startup and two Falcons; intro, HUD,
effects rendering, audio, menus/pause/results and the complete roster are pending.
The optional workload drives both fighters toward each other with repeated attacks
and intermittent shields. It reports attack/hitlag/damage frames separately from
keyboard-event tests. These reports are not competitive gameplay or
distinct-presentation certification.
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
Explicit typed wrappers adapt boolean stage callbacks and predicate return values;
no callback casts or suppressed diagnostics are used. It also makes two original
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
overlays and cleanup. Stage objects currently use the generic original joint
callback; full stage/camera GX-link traversal and dynamic effects/accessories
are not yet integrated. Preserve that distinction when reporting coverage.

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
