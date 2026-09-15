# Browser-native Melee port

This is the direct C-to-WebAssembly port, separate from Dolphin WASM. Its first
working milestone executes original collision, archive, and RNG routines and
loads the six tournament stages' collision subgraphs. It does not run a match.

The next milestone also runs the original OS/HSD allocator and object scheduler,
loads all 27 playable fighter components' common attributes, and executes original
gravity/friction and FObj/AObj animation code. Chrome has decoded and replayed all
5,508 clips in the 27 fighter animation archives. These are subsystem checks;
selected SDK math and a limited animated bone hierarchy also run natively. The
full fighter action-state machine, HSD scene ownership and renderer are pending.

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
```

The browser automatically fetches the prepared hosted assets. There is no player
file picker. Game data stays in ignored output, never Git. The private verification
server uses port 3324 by default (`MELEE_NATIVE_PORT` overrides it). It serves static
files only and needs no GPU server. The subsystem page is not a playable release.

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
- `archive.mjs` validates big-endian HSD metadata and relocation slots.
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
  checked. This is a simulation bootstrap: graphics destructors abort until their
  real implementations are registered, and full scene initialization is pending.
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
  Materials, textures and actual browser GPU draw calls remain.
- `skin-assets.mjs` imports inverse-bind matrices and envelope palettes with
  original influence ordering and weights. `skin.c` prepares rigid/shared and
  blended matrices using native SDK/HSD math, then transforms reference vertices.
  Identical palettes share one calculation per frame. Browser checks cover 32
  animated frames of all 27 default models and replay; five independent examples
  distinguish HSD's single-influence and blended coordinate spaces. GPU draws,
  normal matrices and material/texture combining are still pending.

`node scripts/native-port/audit-link.mjs` probes original joint loading and fighter
creation with the implemented native math/heap/error boundaries. It requires a
fresh compile audit after platform-header changes and never emits a runnable
module with unresolved imports. Its missing symbols are integration work, not
proof that every referenced mode belongs in a tournament browser build.

These tests establish subsystem behavior and selected layout compatibility.
Expected values come from documented/source arithmetic and original asset bytes,
not a frame-by-frame Dolphin oracle. Native gameplay parity is still unproven.

## Next milestones

1. Bring up the native object allocator and fixed simulation update loop, then
   load fighter attributes, motion tables and animation data using typed converters.
   Audit big-endian bitfields and pointer/function references explicitly.
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
