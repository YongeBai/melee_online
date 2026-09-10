# Two-player rooms and server-side rollback

The default `/play/` path now creates a private two-seat room. Share the six-character
code; the second browser enters it at character select. The room owner is always
P1 (controller port 1), and the joining player is P2 (controller port 2), including
after refreshes and rematches. Both players control native
Melee character cursors. P1's card stays left, P2's original card moves right, and
unused cards are hidden in the native render tree. The central room controls use
Melee's extracted SIS lettering. Both players press Ready; P1 chooses the stage
on the original stage-select screen. Rules remain four stocks, eight minutes,
no items. Each player has an independent tap-jump setting.

`/play/?solo=1` retains human-versus-CPU play. `?qa=1&online=1` exposes the room test
controls; plain `?qa=1` selects the solo diagnostic path.

## What actually rolls back

Each room has one authoritative, headless Dolphin process on the GPU server.
Room workers and solo default to OpenGL. `MELEE_NATIVE_BACKEND`
overrides this for driver-specific testing. Save/restore runs on Dolphin's CPU
thread so the graphics context is valid.
Browsers receive its 1280×720 H.264 stream and send controller changes tagged with
the current match epoch and frame. This is **server-side rollback**, not Slippi
client-side rollback or a browser-native emulator.

The server predicts each controller by holding its last known input. It stores
full Dolphin state every four simulation frames, retaining a bounded ring for a
12-frame late-input window. A correction restores the preceding checkpoint and
resimulates to the present with corrected inputs. These snapshots include the
CPU, GPU, memory, timers and devices through Dolphin's state serializer, rather
than just game RAM. Intermediate video and audio are suppressed during replay.
A correction can require up to 15 replayed frames because checkpoints are four
frames apart. Inputs outside the window are rejected and counted. Clients also
refresh held controller state every 100 ms during matches so a release rejected
after a long stall does not leave the controller stuck.

The implementation is in `scripts/native/rollback.mjs`, `rooms.mjs`, and the
reproducible Dolphin patches in `patch-native.mjs`. `verify-rollback.mjs` boots
actual Melee, saves a common starting state, runs both controller scripts with
inputs on time and 1/3/5/9 frames late, and requires identical final MEM1 hashes.
The measured results are in `rollback-validation.json`. This checks real rewind
and resimulation; two browsers displaying the same authoritative stream alone
would not prove rollback correctness.

## Snapshot optimizations

Room workers use Dolphin's real MMU mode, removing the unused 32 MB fake-VMEM
allocation from each snapshot. The checkpoint still contains all real emulated
memory and full CPU/GPU/device state. GPU staging buffers and texture allocations
are reused, while their contents are still fully serialized and restored.
Intermediate replay frames skip host capture before GPU readback; the game and
GPU commands still execute. A replay also retains its unchanged starting
checkpoint instead of immediately copying it again.

Compiled code survives a restore only when the instruction cache is coherent
with RAM and every compiled instruction's source bytes remain unchanged.
Changed BAT mappings retain Dolphin's normal invalidation path. A mismatch
clears the JIT before execution resumes. The real-game verification includes a
compiled-instruction mutation/restore probe that requires this fallback.
`MELEE_DISABLE_FAST_JIT=1` disables preservation for diagnosis, and
`MELEE_PROFILE_STATE=1` emits save/load timings from the worker.

The browser presents decoded frames in order, starting with three buffered frames
and retaining at most eight. The final stressed browser measurement averaged
74 ms in this presentation queue. This trades video delay for smoother delivery
through correction bursts; it does not interpolate frames or change simulation
speed. The room clock catches up after short bursts and resets its deadline only
after a host stall exceeding 500 ms. Frames already captured before a correction
are sent even if rollback begins before the capture thread handles them.

## Room lifecycle and trust

`/room-session` uses the production server's origin and authentication checks.
Each room has its own worker and user directory. Inputs are assigned to the
socket's seat, never a client-supplied player number. Guests cannot issue native
memory-edit commands, force opponents' selections, or quit their match. Start
requires both occupied seats to be ready. Only P1 navigates stage select.

Invite codes are public to participants; reconnect credentials are separate
random 24-byte tokens kept in sessionStorage. Refresh resumes the same seat.
Disconnect pauses the room; both participants must reconnect to resume a match.
Leaving explicitly discards the seat and creates a new private room. Rooms with
no connected browsers expire after 30 seconds. The service limits concurrent
rooms (four by default), message size and per-socket message rate. Concurrent
joins reserve the guest seat before asynchronous worker changes.

Normal game results return to character select while retaining the room. The
server owns scene transitions, so one browser opening its controls cannot pause
or reconfigure the other player's game.

## Latency and deployment limits

Rollback corrects late inputs, but a hosted stream still incurs input travel to
the server, simulation, encoding and video travel back. It does **not** provide
Slippi's immediate local prediction. Video and input currently use WebSockets;
TCP loss can stall delivery. A 60 FPS stream is not evidence of competitive
input-to-photon latency. WAN jitter/loss, mobile browsers and remote GPU hardware
need separate measurement. Integration tests measure unthrottled simulation
headroom; the browser benchmark separately measures real-time simulation,
decoding and distinct presentations. Tests with artificial input delay do not
emulate a complete lossy network. See [validation](VALIDATION.md) for measured
workloads and rates.

Full snapshots are approximately 77 MB each on the pinned Dolphin build; a
warmed five-slot ring uses roughly 383 MB in addition to the emulator and video
pipeline. Provision CPU/GPU and memory per room, and lower capacity if contention
reduces simulation speed. Static hosting alone cannot execute these workers.
See [deployment](DEPLOYMENT.md) for the HTTPS GPU-server entry point.

The next latency improvement is WebRTC media and an input data channel with
appropriate signaling/TURN. True browser-side rollback additionally requires a
local WASM/WebGPU engine fast enough to run Melee with resimulation headroom.
The existing software WASM path does not meet that requirement.

Run the sustained correctness/performance check separately from active rooms:

```sh
MELEE_VERIFY_FRAMES=3600 MELEE_VERIFY_STRESS=1 MELEE_VERIFY_MIN_FPS=60 node scripts/native/verify-rollback.mjs
```

The test fails on a divergent memory hash, missing restored video, failed code
invalidation, incorrect rematch controllers, or any trial below the requested
simulation rate. For browser measurements, use
`/play/?qa=1&online=1&benchmarkSeconds=60` in both clients and add `&inputdelay=80`
to the guest. After starting a match, activate **Stress room inputs** in each
client, then **Measure room performance**. The input stress travels through the
same socket and assigned controller port as ordinary keyboard input.

## Supplied Slippi packages

The supplied Slippi Launcher AppImage installs/launches native Dolphin; the
Nintendont zip contains Wii PowerPC executables and recording/mirroring tools.
Neither is a browser emulator. This implementation does not call Slippi services,
use Slippi accounts, or claim netplay compatibility. Their native rollback forks
remain useful references for a future client-side engine integration:
[Launcher](https://github.com/project-slippi/slippi-launcher),
[Ishiiruka](https://github.com/project-slippi/Ishiiruka),
[mainline Dolphin](https://github.com/project-slippi/dolphin).

### CPU opponents, removal, and native cursor foreground

The room owner can choose **Play CPU Lv 9** while the guest seat is empty. This reloads the native character-select scene with P2 marked CPU, preserving both character selections. Ready then opens native stage selection without waiting for another browser. CPU matches run normally without allocating network rollback checkpoints. Remove CPU reopens the room to a human guest.

Only P1 can kick a guest, including a disconnected reserved seat. Removal revokes the private reconnect token, clears both controllers, stops rollback if active, and returns a running match to character select. The guest receives a new-room start screen. A guest leaving voluntarily uses the same cleanup without the kicked notification.

Added room controls and controller indicators sit beneath the real rendered Melee hands. A checked RAM hook uses Melee's GX rectangle and original hand callbacks to create keyed menu apertures; a WebGL video presenter reveals the HTML controls through those apertures. The animated hand pixels remain in the same encoded video frame, so there is no separately tracked cursor or coordinate lag. Keying is restricted to the reserved menu rectangles and disabled during matches. The ISO is unchanged.

The native room capture path also withholds unmodified character-select frames. It checks both layout callbacks and a marker written by the foreground render pass before copying a CSS frame to the encoder. The browser retains the previous frame during this short scene setup, and CPU-mode changes retain the room panel beneath it. This prevents a flash of the stock four-player layout at boot, rematch, or opponent changes.
