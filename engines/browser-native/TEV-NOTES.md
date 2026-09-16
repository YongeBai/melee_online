# Native material combiners

`tev-state.c` calls Melee's original HSD compiled-material setup and records
its GX TEV setters. Capture is explicitly scoped; GX calls outside it still
abort. This is a boundary for the direct port, not CPU emulation or a FIFO.
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
