# Native material combiners

`tev-state.c` dispatches Melee's original material class setup/unset methods and
records its GX material setters. Capture is explicitly scoped; GX calls outside it still
abort, except for the explicitly scoped camera/light activation boundary below.
This is a boundary for the direct port, not CPU emulation or a FIFO.
The earlier pixel-state checkpoint called the base HSD setup directly. Class
dispatch now also invokes the fighter override with the correct current GObj
and JObj, preserving per-fighter alpha and color-overlay behavior. Custom
materials fail explicitly if no owning render object is supplied.

`portMaterialDrawState` additionally invokes the original PObj matrix setup for
a specific polygon section. `model-state.c` records position/normal loads while
`texture-state.c` records normal-projection loads. The independent shared skin
palette, camera concatenation and original inverse-transpose helper agree
exactly with those loads across 81 default-model poses and both live match
snapshots. This is a CPU setup cross-check, separate from GPU checks below.
Capture also runs original `HSD_TObjSetup` and coordinate-generator setup.
`texture-state.c` records image and palette selections, filters, LOD arguments,
texgen selectors and texture matrices. Its temporary GX handles are scoped to
one material setup; the snapshot retains the loaded resource values. Image
pointers remain valid only while the native owning archive is alive.
`native-texture.mjs` decodes those runtime selections and separately applies SDK
LOD register precision. It does not sample a texture on the GPU.
The source recipe initializes the temporary constant-color array in
`HSD_TExpSetReg`: unused channels previously read uninitialized C storage.
Referenced channels continue to be populated by the original code.

`tev-shader.mjs` emits straight-line GLSL ES 3 integer operations for captured
stages. Integer interpolation, bias, scale, signed intermediate clamps, color
comparison modes, alpha comparison modes and selector tables are adapted from
the Dolphin project's `Source/Core/VideoCommon/PixelShaderGen.cpp`, commit
`a2efdf1197be8132674b90fe9cf4761df39752ed`, under GPL-2.0-or-later (see
`vendor/dolphin/GPL-2.0-or-later.txt`). This does not copy or run Dolphin's emulator core.
GX preset expansion and initial swap tables follow `GXTev.c` and `GXInit.c`
in the pinned Melee decompilation SDK. Custom swap tables are explicit inputs.

The function takes per-stage sampled RGBA8 texture and raster-lighting inputs.
It returns the last color and alpha destination registers, including signed
unclamped values. The framebuffer path must subsequently apply the correct
pixel-engine behavior. This module does not implement texture coordinate
generation, texture sampling, lighting, alpha testing, blending, fog or effects.
Passing tests for the combiner alone is not visual parity or a 60 FPS result.

The scene GPU test compares all default-fighter runtime texture bindings with
the original descriptors: 1,730 bindings, filtering state, 17,744,214 decoded
texels and UV matrices. Reflection/highlight matrices are captured and checked
for finite values; their visual accuracy still needs the original camera/light
and per-joint normal matrices. Samus also uses a bump texgen stage. Global
shadow/toon additions now use full `HSD_MObjSetup`, but those global resources
are not present in the tested fixtures. Lighting channels and pixel-engine
settings are captured by `pixel-state.c`. The scene test checks those settings
against source custom PE descriptors or explicit HSD defaults for every material.
Snapshots invalidate HSD's previous-draw caches to record all required state.
`render-context.c` now records the original offscreen camera viewport/scissor/
projection and GX light loads. `portStageRenderInitialize` invokes original
Ground light selection and retains its animation process; `portStageRenderBegin`
activates the original camera and current lights. The portable source recipe
exposes only the original offscreen camera branch, avoiding console VI setup;
no eye/interest/FOV/aspect or projection correction is substituted. The native
640×480 viewport is a source-space rectangle, to be scaled to the 960×720 target.
`StageCallbacks` named bits now preserve their PowerPC high-word meaning on WASM.

Live material setup invokes original per-joint specular initialization and
retains loaded light registers across materials. Snapshot readers verify that
enabled channels reference loaded lights and that the captured projection is
exactly the gameplay camera projection. The live sample now uses diffuse and
specular masks; its 20 programs and nine distinct light states per snapshot
are now applied to actual GPU draws by `material-gpu.mjs`.

`material-shader.mjs` adapts lighting and texgen arithmetic from Dolphin's
`LightingShaderGen.cpp` and `VertexShaderGen.cpp` at the same pinned commit and
under GPL-2.0-or-later. It uses original position/normal/texture/post matrices,
integer material/ambient/light colors, diffuse/specular attenuation, vertex
colors, UV/reflection/bump/SRTG texgen and per-vertex texture matrices. The GX SDK
forces diffuse NONE for specular attenuation; captured API arguments must be
normalized to that effective behavior. Sampled textures and raster colors feed
the integer combiner, followed by alpha rejection and ordinary depth/blend state.
The live fixture also calls original fighter-light activation and overlay cleanup
and sets original normal-pass flags before per-material capture.

`verify-material-shader.mjs` checks 13 controlled full-shader cases (52 pixel
channels). Diagnostic transform feedback verifies every live drawn position and
normal against captured original matrices. It is optional in the GPU renderer
and enabled in the snapshot probe; it must not be mistaken for game performance.

Still pending: complete original callback/Z-sort ordering, mutable image/palette
cache invalidation, exact texture filtering/LOD parity, non-fullscreen viewport
and scissor scaling, fog, indirect textures, effects and HUD. Unsupported pixel
paths reject explicitly. Native visual parity and 720p60 are not established.


The live fixture now defaults to the original fighter callbacks and HSD joint
traversal. Scoped DObj/PObj backend methods retain original material setup and
matrix setup while handing each selected polygon to WebGL. Native pass order
replaces the preceding blanket opaque/blended regrouping. This is object-level
traversal: full camera/stage GX-link order and dynamic primitive/effect submission
remain incomplete. The old direct per-mesh capture is an explicit QA reference.
