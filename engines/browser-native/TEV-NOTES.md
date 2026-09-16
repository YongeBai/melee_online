# Native material combiners

`tev-state.c` calls Melee's original HSD compiled-material setup and records
its GX TEV setters. Capture is explicitly scoped; GX calls outside it still
abort. This is a boundary for the direct port, not CPU emulation or a FIFO.
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
shadow/toon additions from full `HSD_MObjSetup`, lighting channels and pixel
engine setup are not yet captured by this material-TObj-only boundary.
