# Native browser port — September 15, 2026

The direct port is now an implemented, reproducible development target:
[build and architecture](../engines/browser-native/README.md). It links original
decompiled C directly into browser WASM without Dolphin or PPC dispatch. It is
not a playable game yet, and there is no native-port FPS result.

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
