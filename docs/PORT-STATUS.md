# Current port status

The localhost website plays original Melee through a pinned local Dolphin GPU
renderer. The browser receives 1280×720 video and stereo audio, and sends the
requested keyboard/gamepad controls. Original character select, battles and
results use the supplied USA 1.02 disc. The default is a local native engine
streamed to the browser; `/play/?engine=wasm` retains the slower WASM engine.

Implemented: automatic local-disc boot, original roster, human versus level-9
CPU, Battlefield, four stocks, eight minutes, no items, results/return to character
select, keyboard/gamepad mapping, pause, adjustable tap jump, full-detail 720p.

A valid 60-second browser benchmark measured 59.94 native rendered FPS and
59.96 displayed FPS with zero dropped decoded frames on this machine. Native
OpenGL/EGL replaced the software rasterizer. Vulkan was rejected after a driver
crash during longer tests. See NATIVE-RENDERER.md and VALIDATION.md for the
architecture, measured evidence and test limits.

Scope remains local browser human-versus-CPU play. Public distribution of game
assets, remote deployment, matchmaking and rollback multiplayer are not
implemented. Streaming adds latency; this has not been measured or certified
for competitive play. The decompiled Melee and OpenSmash repositories remain
independent and unchanged.
