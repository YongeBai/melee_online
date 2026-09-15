# Browser-native Melee port

This is the direct C-to-WebAssembly port, separate from Dolphin WASM. Its first
working milestone executes original collision, archive, and RNG routines and
loads the six tournament stages' collision subgraphs. It does not run a match.

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
checks RNG and ECB interpolation only; the report lists stage coverage explicitly.

To include real stage data, run this **development build tool** before verification:

```sh
node scripts/native-port/prepare-fixtures.mjs /path/to/development-fixture.iso
node scripts/native-port/verify-browser.mjs
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
