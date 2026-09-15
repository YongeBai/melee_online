# Native browser port — September 15, 2026

The direct port is now an implemented, reproducible development target:
[build and architecture](../engines/browser-native/README.md). It links original
decompiled C directly into browser WASM without Dolphin or PPC dispatch. It is
not a playable game yet, and there is no native-port FPS result.

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
Fighter creation, the complete action-state loop, full joint/constraint ownership,
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

A fresh link probe includes the implemented arithmetic, SDK heap and panic
boundaries. Original `HSD_JObjLoadJoint` is now missing 49 GX functions; original
`Fighter_Create` is missing 223 symbols across graphics, platform services and
uncompiled game modules. The latter includes unrelated modes/stages retained
through common tables. These are engineering dependency counts, not measured
runtime bottlenecks. The next integration target is the GX graphics boundary and
typed model/material/texture assets, followed by actual fighter creation.

The typed GX geometry decoder now reads all 27 default model archives: 2,179 mesh
sections, 209,465 vertex records and 186,255 triangles, including packed colors,
fixed-point position/normal/UV arrays and triangle-strip winding. Mesh binding,
material and texture pointers are retained for their next typed importers. No
skinning or draw calls run yet. Chrome passes this decode alongside the complete
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
reduction in a subsystem, not a measured match FPS improvement. Native GPU draws,
normal matrices, materials/texture combining and full match integration remain.

Next texture work must not blindly reuse `scripts/engine/gx-decoder.js`: inspection
found missing indexed palette formats and PC-style CMPR interpolation/transparent
colors. Dolphin's `TextureDecoder_Generic.cpp` and `TextureDecoder_Util.h` show
GX uses 3/8–5/8 interpolation and retains averaged RGB in transparent entries.
The 27 default archives reference 1,730 texture descriptors: CMPR 1,635, C8 73,
C4 1, I4 18, I8 1 and RGB5A3 2. These are descriptor counts, not unique images.

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
