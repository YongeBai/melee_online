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

These numbers establish asset/decoder coverage only, not combat correctness or
FPS. Fighter creation, the complete action-state loop, pose/bone application,
matrix/vector platform routines, GX, audio and Dolphin parity remain.

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
