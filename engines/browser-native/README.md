# Browser-native Melee port

This is the direct C-to-WebAssembly port, separate from Dolphin WASM. Its first
working milestone executes original collision, archive, and RNG routines and
loads the six tournament stages' collision subgraphs. It does not run a match.

The next milestone also runs the original OS/HSD allocator and object scheduler,
loads all 27 playable fighter components' common attributes, and executes original
gravity/friction and FObj/AObj animation code. Chrome has decoded and replayed all
5,508 clips in the 27 fighter animation archives. These are subsystem checks;
selected SDK math and a limited animated bone hierarchy also run natively. The
full fighter action-state machine and renderer are pending.
The separate scene bring-up target now uses original HSD class ownership,
reference resolution, matrix updates, destruction and Melee's `lbAnim` attachment.
It drives the diagnostic GPU view, but the original GX material/draw boundary and
fighter creation are still incomplete.

## Reproduce

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
  names and HSD heap 0 are integrated; other heaps and asynchronous I/O remain
  unresolved. The JS host installs typed images automatically, without a picker.
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
  probes check 252 actual fields against independent bit extraction/insertion;
  original timer/loop/call/goto/animation-wait routines pass nested control checks.
  Raw script assets must still be type-converted before using this representation.
  The probes do not run fighter action handlers or claim gameplay parity.
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
The 49 unresolved GX entry points retained by HSD class tables abort by name.
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

## Next milestones

1. Connect `Fighter_Create` to the native HSD owner, remaining fighter archive
   structures, motion tables and platform services. Audit big-endian bitfields
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
