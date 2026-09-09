# Current port status

The localhost website plays original Melee through a pinned local Dolphin GPU
renderer. The browser receives 1280×720 video and stereo audio, and sends the
requested keyboard/gamepad controls. Original character select, stage select, battles and
results use the supplied USA 1.02 disc. The default is a local native engine
streamed to the browser; `/play/?engine=wasm` retains the slower WASM engine.

Implemented: automatic local-disc boot, original roster, human versus level-9
CPU, native stage selection, four stocks, eight minutes, no items, results/return to character
select, keyboard/gamepad mapping, native pause, adjustable tap jump, full-detail 720p.
A keyboard icon beside P1 opens the local 3D keyboard mapping view; tap jump
is configured there. No custom pause menu or starting-form controls are shown.

A valid 60-second browser benchmark measured 59.94 native rendered FPS and
59.96 displayed FPS with zero dropped decoded frames on this machine. Native
OpenGL/EGL replaced the software rasterizer. Vulkan was rejected after a driver
crash during longer tests. See NATIVE-RENDERER.md and VALIDATION.md for the
architecture, measured evidence and test limits.

The implemented game remains human-versus-CPU. A same-origin production
server, private-session authentication and deployment configuration are included.
A public GPU host has not been provisioned. Matchmaking, multi-user worker
allocation and rollback multiplayer are not implemented; their plan is in
ROLLBACK-AND-ROOMS.md. Streaming adds latency; this has not been measured or certified
for competitive play. The decompiled Melee and OpenSmash repositories remain
independent and unchanged.
