# Browser-only WASM fallback

This investigation describes the retained `/play/?engine=wasm` path. The default
now uses the [local GPU renderer](../NATIVE-RENDERER.md), which met the 720p/60 FPS
target on this machine.

Selected engine: [dougchansan/wasm-dolphin](https://github.com/dougchansan/wasm-dolphin),
pinned to `6ef689cf3956c3208c0966b8123d91c21d1f5ca4`. Its upstream Dolphin base is
`e22551eae1c84a7e4d0b6a5c519ef4ed4ef69df1`, with the engine repository's
`patches/dolphin-wasm/snapshot/` build patch series. Dolphin is GPL-2.0-or-later;
retain the upstream license, notices, source, and build patches when redistributing
the emulator. The setup script fetches that source repository alongside its
prebuilt WASM. Nintendo game data is supplied locally and is not redistributed.

Prebuilt WASM SHA-256:
`3b2ed6fe35ff1939e24bbe033edba34b9585f4f7b1f457f1e683ed8ddbd005d0`.
The local Melee DOL SHA-1 is
`08e0bf20134dfcb260699671004527b2d6bb1a45` (executable hash, not whole-disc hash).
The audited disc has 1,209 files; all 230 required asset entries were present.

The website imports EmulatorHost directly, mounts the automatically detected
local File, verifies that its mode is Dolphin, and starts it. It does not call
the demonstration initialization path. Original graphics and AI are executed
from the disc; no replacement fighter logic or placeholder models are involved.

The worker bridge locates MEM1 using known original executable bytes and the
GALE01 header. Version-specific writes set normal native game data and scene
routing. We verified compiled getters because some decompilation structure
comments do not reflect the compiled 1.02 layout. In particular:

- GameRules: main + 0x1850; save data: main + 0x1868; item preferences: main + 0x1CB0.
- Battlefield's selectable stage ID is 31, distinct from its ground ID 36.
- Item frequency -1 means none; zero means very low and is not suitable.
- Returning from menus must use the native MenuExitData pending mode.
- Match quit uses native OUTCOME_NO_CONTEST and normal cleanup.
- Tap jump uses seven preflight-checked PowerPC hooks, including inlined checks; no vertical-stick clamping.
- Melee counters at 0x80479D58 / 0x80479D5C distinguish simulation and rendering.

The upstream worker lacked start/pause message handling. A reproducible local
patch connects those commands to the core's pause API. Root integration modules
are copied by setup, keeping all modifications reviewable outside the ignored
engine checkout. Re-running setup verifies the pinned revision and patch state.

The tested software path uses guarded WASM JIT after a 900-frame warmup, no
persisted JIT cache, TEV/XFB fast paths, and half-size presentation. Balanced
rasterization skips pixels in 2x2 cells; Faster uses 4x4 cells; full detail does
not skip pixels. These are explicit visual/performance tradeoffs. True WebGPU
stalled on a green title frame; OpenGL worker rendering was black, and the
main-proxy attempt failed boot. They are not enabled for normal play.

The upstream itself describes low unique visual FPS as a known limitation:
[engine status](https://github.com/dougchansan/wasm-dolphin/blob/6ef689cf3956c3208c0966b8123d91c21d1f5ca4/docs/current-status.md).
The alternative `ioncodes/gecko` investigation did not yield a suitable Melee
ISO-loading engine. OpenSmash's N64 engine cannot execute GameCube code.
