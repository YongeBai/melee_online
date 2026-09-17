# Validation — September 8–9, 2026

For September 17 direct-browser work, see the
[native port status](BROWSER-NATIVE-PORT-STATUS.md) and
[rollback correctness measurements](benchmarks/browser-2026-09-17-native-port-rollback.json).
The rollback diagnostic passes full-state convergence on all six stages in two
browser processes, with corrected 960×720 canvases visually checked. It excludes
the live renderer from checkpoints and has no audible output or production room
integration. It does not establish 720p60 or competitive network latency. The
Dolphin stream measurements below are historical and apply to a different path.

Tested on the user's Linux machine in the Codex in-app Chromium browser at
localhost:3000, with the supplied USA 1.02 disc.

## 720p native GPU path

The default path uses native Dolphin JIT64 + OpenGL/EGL and streams its output
to the browser. The renderer opened `/dev/dri/renderD128` on the Radeon 890M.
A 2× internal-resolution render is resolved to a 960×720 game picture inside a
1280×720 stream. Original proportions are preserved with black sidebars.

The first valid 30.001-second Fox/Falco match benchmark recorded:

| Stage                          | Frames/second |
| ------------------------------ | ------------: |
| Native simulation              |        59.964 |
| Native rendering               |        59.931 |
| GPU frame capture              |        59.931 |
| H.264 encoding                 |        59.964 |
| Browser decoding               |        59.931 |
| Distinct browser presentations |        59.997 |

Zero decoded frames were dropped. The native match timer went from 7:54 to 7:24.
The benchmark waits for a fresh match and the actual game timer; earlier samples
that crossed scene initialization were discarded. These rates count rendered
and presented frames separately from simulation, without interpolation. Raw data
is retained in `performance-native.json`.

The final 60.009-second Ice Climbers/Jigglypuff run also passed with Nana active:
**59.941 native rendered FPS, 59.958 distinct browser presentations per second,
zero dropped frames**, at 1280×720. The match timer advanced from 7:54 to 6:54.
Capture and encoding both measured 59.941 FPS; decoding measured 59.924 FPS.
This run used the final seven-hook input implementation after a clean startup.

Vulkan produced a utility-descriptor driver crash during longer tests. OpenGL
replaced it and completed the full roster run without a renderer crash. The
native shader-cache progress callback also needed a headless ImGui guard.

## Actual game verification

- The controls screen shows the existing 3D GameCube model, requested bindings,
  tap-jump switch, keyboard tester and the new 720p/60 FPS default.
- Root `npm start` launches the website and native GPU bridge. Controls →
  Character select → Start Melee boots the local disc into the original menu.
- Thirteen consecutive native-GPU pair tests covered all 26 playable starts:
  Falcon/DK, Fox/G&W, Kirby/Bowser, Link/Luigi, Mario/Marth, Mewtwo/Ness,
  Peach/Pikachu, ICs/Jigglypuff, Samus/Yoshi, Zelda/Sheik, Falco/Young Link,
  Dr. Mario/Roy, and Pichu/Ganondorf.
- Every pair entered a live original VS scene with two fighter objects and four
  initial stocks each. Memory checks confirmed Battlefield (selectable stage
  31), 480-second limit, item frequency -1, teams off and CPU level 9.
- Each pair exercised movement, attack, special, jump, shield, grab and C-stick
  through the keyboard handlers, with native action-state changes. All thirteen
  recorded 60 native simulation/render FPS samples and returned to character select.
- These are loading/input smoke tests, not exhaustive checks of every move,
  costume, character interaction or all 676 possible matchups.
- Screenshots showed the original roster and Battlefield with original fighters,
  damage percentages, stock icons and countdown timer. The normal menu also
  displayed 60 rendered / 60 simulation FPS at 1280×720 after a clean restart.
- The CPU attacks and depletes human stocks. Existing native results/no-contest
  routing uses the game's cleanup callbacks; automatic return waits for results
  initialization rather than using an old scene's frame counter.

## Pause and tap jump

Escape stopped the native simulation counter across a 700-ms check. Native
pause acknowledgements serialize memory changes and preserve an existing pause.
Tap-jump validation exposed three additional inlined jump checks in the original
DOL. The integration now patches seven ground/aerial checks and invalidates
Dolphin's instruction cache/JIT after executable-memory changes.

The emitted PowerPC hooks are independently interpreted in unit tests for all
seven sites: human tap-off bypass, tap-on original instruction, CPU input and
Nana partner behavior. Unknown instructions or occupied code space reject the
patch before any writes. Input checks distinguish actual jump action states from
CPU hitstun; the setting never clamps away upward analog aiming.

The final browser control probe passed: frame 129 stayed unchanged across pause;
tap off retained native stick Y=80 while Fox stayed in idle action 14 on the
ground; tap on produced jump action 25, airborne=true, Y=18.63. Changing the
actual pause-menu checkbox also preserved frame 2063 while the native toggle
changed from on to off. The checkbox was restored afterward.

## Automated and startup checks

- Five root tests passed: fixed-rule/scene writes, seven PPC hook paths,
  fail-before-write validation, arbitrary H.264 chunk boundaries, and packet
  timestamps/keyframes.
- All 19 frontend tests passed: roster/rules, disc parsing/executable validation,
  missing assets, keyboard/gamepad mapping and menu layout.
- Frontend typecheck and production build passed.
- Pinned native CMake release build and repeated idempotent setup passed.
- Root startup was restarted and verified with the integrated native bridge.
- `/play/` responds HTTP 200 with cross-origin isolation headers. The supplied
  disc audit found 1,209 files and all 230 required assets. The disc is omitted
  from Git and from the production frontend build.

## Earlier WASM fallback

The browser-only `/play/?engine=wasm` path remains available. Earlier balanced
samples rendered roughly 14–18 FPS; lower-detail samples reached about 24 FPS.
Its experimental WebGPU/OpenGL paths were not reliable here. Those limitations
apply to the fallback, not the new local GPU default.

No physical gamepad was connected, end-to-end streaming latency was not measured,
and audible quality was not separately assessed by listening. No remote
multiplayer, public deployment or game-data upload was performed.

## Native UI and production-server revision

The earlier pause-overlay checks above describe the committed MVP. The current
revision replaces that overlay with Melee's own pause, restores stage select,
and moves tap jump into the keyboard view beside P1.

- Browser screenshots reviewed the icon placement, 3D keyboard, physical
  GameCube button/trigger/stick shapes, native Back artwork, original SIS font,
  ON/OFF option row and matching 4:3 frame. Flat badges, a generic switch and
  the external controller iframe were removed after visual review.
- Native pause passed: match elapsed frame 5 stayed 5, with pauser 0, across
  700 ms. Unpause resumed gameplay. W with tap jump off retained stick Y=80 and
  grounded action 14; with it on, Fox entered airborne jump action 25.
- The keyboard view preserved native frame 111 while test keys were pressed.
  Its toggle updated the actual native flag. Stage-select Back retained Zelda
  and Fox. Holding P while Fountain of Dreams loaded produced Sheik, with no
  starting-form override. A subsequent Battlefield start produced Zelda.
- Both stages retained four stocks, 480 seconds, no items, non-team mode and
  CPU level 9. The native I+L+P+Esc quit chord returned through results to CSS.
- The production server (no Vite/Workers) booted Melee in the same browser.
  A 30.00118-second sample measured 59.93 rendered FPS, 59.90 presented FPS,
  60.00 simulation FPS, 1280×720, and zero dropped decoded frames.
- The regular `npm start` path also booted through `/engine-session`. Development
  uses vinext's Node server: the Workers development upgrade listener conflicts
  with Vite's native WebSocket proxy. Workers output remains build-only.
- Root tests now include GX tiling/alpha/channel-layout fixtures, PNG roundtrip
  scanlines, private HTTP serving, cookie tampering, traversal and blocked ISO
  routes, in addition to the existing emulator-memory and video checks.
- An external TLS host, WAN input latency, a physical controller, room joining,
  and rollback between independent clients have not been verified or claimed.

## Keyboard-only controls revision

The keyboard model now has a fixed angle. Melee's native hand cursor activates
its icon with P; mouse hit testing is disabled on that icon. W/S selects Tap jump
or Back, P activates, A/D sets off/on, and O/Esc closes the view. P/Enter also
starts the game from the initial audio-activation screen.

The browser navigation probe moved the actual native cursor using stick input
(no cursor teleport), opened the view with P and verified all menu paths. Its
music check advanced native CSS from frame 38595 to 38646 while preserving the
hand position and selected fighters. Web Audio stayed running, scheduled
1.029 seconds more audio and received 62 non-silent PCM chunks during the check.
The view isolates input without pausing or muting the emulator. The earlier
frozen-frame keyboard-view checks are superseded; native battle pause is unchanged.
Nine targeted memory/input/video/asset tests passed, including the new cursor
structure bounds and rejection of stale cursor data outside character select.

## Two-player rooms and rollback revision

The room owner is P1/controller 1 and the joining browser is P2/controller 2.
The native `sub_color`/controller field must be set as well as the player slot;
merely labeling the second socket P2 was insufficient. The integration now
asserts that guest input moves the second fighter, and that both controller
indices remain `[0, 1]` in a subsequent match.

The real Dolphin integration (`MELEE_NATIVE_BACKEND=OGL node
scripts/native/verify-rollback.mjs`) passed identical final MEM1 hashes for
on-time input and input delayed 1, 3, 5 and 9 frames. Each delayed trial performed
six restores; the deepest correction replayed ten frames. Decoded screenshots
immediately after rollback and after a rematch showed original Battlefield,
fighters and HUD, rather than a black restored GPU frame. Raw results are in
`rollback-validation.json`. Native save/load now runs on the CPU thread, where
the graphics context is valid.

These are 75-frame stress runs, including cold checkpoint allocation. They
measured about 66 simulation FPS without correction and 36–46 FPS with frequent
corrections. The earlier solo 60 FPS results do not establish 60 FPS rollback
performance. Room workers and solo use OpenGL by default. A longer Vulkan browser run crashed
in `libvulkan_radeon.so`; the short Vulkan integration pass was insufficient to
establish stability. Broad hardware and long-duration driver stability are not
established by the OpenGL pass either.

Twenty-two root tests pass, including real WebSocket protocol tests with a fake
worker for two occupied seats, a rejected third guest, concurrent join races,
readiness, forged input-port isolation, owner/guest refresh credentials, and
stale CSS frame counters during asynchronous scene loading.
All 19 frontend tests and TypeScript checks pass. Browser verification uses two
independent tabs/sessionStorage clients in the in-app Chromium browser; a second
browser engine was unavailable. An artificial 80-ms input delay affects inputs
only and is not a WAN/loss simulation.

The final OpenGL room `XDL4HZ` joined through the visible room field, advanced
only after both Ready buttons, and used P1's native stage cursor to choose
Battlefield. Browser screenshots showed red P1/Fox and blue P2/Falco. Guest
jump/special inputs delayed 80 ms produced two corrections, ten replayed frames,
a maximum depth of five and no late-input rejections. A 20.004-second sample
measured 59.437 simulation FPS, 59.387 decoded FPS and 57.238 distinct browser
presentations per second at 1280×720. This sample includes few input changes;
it does not supersede the heavier correction stress results. The separate browser
report is `room-browser-validation.json`.

The normal room screen was visually reviewed without QA controls: native red
and blue character cards flank a central panel using Melee's extracted texture,
SIS letters and beveled controls. Owner and guest refreshes preserved seats in
room `VJFUHR`. P2's keyboard navigation probe passed at native cursor
`(23.312, -22)`, including tap jump, Back, O/Esc, input isolation, 44 advancing
native frames and continuing non-silent menu audio. That controls probe preceded
the Vulkan driver failure; the controller/UI code is shared with the final
OpenGL path.

Holding right in P2's client ended the first game through normal stock loss;
both clients returned through native results to the same room's character select.
The browser-driven rematch entered Battlefield again with controller indices
`[0,1]`, player IDs `[0,1]`, four stocks each, a 480-second limit, no items and
no teams. Its match epoch changed and no worker error was reported. Both clients
were then returned to the normal `/play/` view, removing QA overlays and the
artificial guest delay. The same-origin production server remains running.

## Rollback optimization revision

The current OpenGL room worker enables real MMU translation, retains safe JIT
blocks across restores, reuses GPU allocations and skips intermediate replay
readbacks. Checkpoints are four frames apart; the unchanged restored checkpoint
is not copied again. The late-input window remains 12 frames, with at most 15
replayed frames for an aligned restore. Each full snapshot is 76,598,746 bytes;
five live slots use approximately 383 MB. No CPU, GPU or device state was removed
from the serializer. The fake-VMEM allocation is unused in real MMU mode.

A 3,600-frame Fox/Falco workload on Battlefield issued 400 scripted input changes
in each trial. All final MEM1 hashes matched the known-input reference:

| Input delay (frames) | New simulation FPS | Corrections | Replayed frames |
| --- | ---: | ---: | ---: |
| 0 | 136.85 | 0 | 0 |
| 1 | 103.58 | 400 | 800 |
| 3 | 91.27 | 400 | 1,600 |
| 5 | 83.36 | 400 | 2,400 |
| 9 | 68.54 | 400 | 4,000 |

These rates include checkpoint and correction work, count only new simulation
frames, and run unthrottled to measure headroom. They do not count replayed
frames as progress or prove input-to-photon latency. The test enforced a minimum
of 60 FPS for every trial. No late inputs were rejected. It also passed a
compiled-instruction mutation that forces JIT invalidation before execution,
visible 720p video after restore, and a subsequent Battlefield match with
controller indices `[0, 1]`. The complete report is `rollback-validation.json`.

The final source passed 24 root tests, 19 frontend tests, TypeScript checking,
the frontend production build, and repeated idempotent native setup. Tests now
include the oldest accepted corrections across repeated checkpoint-ring wraps
and verify that the restored checkpoint is not redundantly copied.

The first repeated-input browser run exposed a separate delivery failure:
59.10 simulation FPS but only 49.26 presented FPS, with 578 discarded video
frames. The final revision retains a bounded FIFO, permits the room clock to
catch up after short correction bursts, and preserves ordinary captures queued
before rollback begins. The native rendering itself remains unchanged.

Two independent Chromium clients then joined room `Y58KQC` through the visible
room-code field, with P1 on the left and P2 on the right. Both pressed Ready and
P1 used native stage selection to enter Battlefield. Both clients sent repeated
jump/attack/shield/neutral changes every 180 ms; P2's packets were delayed 80 ms.
The final three-frame starting buffer/eight-frame cap produced:

| Metric over 60 seconds | Owner P1 | Guest P2 |
| --- | ---: | ---: |
| New simulation FPS | 60.079 | 60.097 |
| Distinct presented FPS | 59.863 | 59.913 |
| Decoded FPS | 59.929 | 59.963 |
| Dropped decoded frames / decode errors | 0 / 0 | 0 / 0 |
| Corrections / replayed frames | 333 / 2,636 | 333 / 2,636 |
| Average browser presentation queue | 73.94 ms | 74.07 ms |

No inputs were rejected in this final 80-ms run. No room-clock deadline was
reset. Both views retained the original models, animation, Battlefield and HUD;
inspection confirmed controller indices `[0, 1]`, four stocks, 480 seconds,
no items and no teams. Owner and guest refreshes preserved their assigned seats
and resumed the same match. The raw results and earlier iterations are in
`room-browser-validation.json`.

A separate 150-ms guest-delay minute still presented 59.95/59.78 FPS with zero
video drops, while replaying over 3,400 frames. Eleven packets arrived outside
the 12-frame correction window and were rejected. This is a measured high-delay
limit, not a lossless-WAN claim. These results establish approximately 60 FPS
playback for the tested local workload; they do not establish competitive remote
input latency, every hardware/character combination, or browser-native emulation.
The measured presentation queue itself adds about 74 ms before display, in
addition to simulation, input transport, encoding and network delivery.

The final browser rematch returned through normal results to the same room,
then entered Battlefield with a new epoch and controller indices `[0, 1]`.
Both fighters started with four stocks, 480 seconds and the fixed no-item rules.
QA overlays and packet delays were removed afterward.

The updated capture code also passed a separate 600-frame Ice Climbers/Peach
workload, including a stock loss. On-time and 1/3/5/9-frame-late runs produced
identical final hashes; the nine-frame trial performed 60 corrections and 600
replayed frames at **64.63 simulation FPS**. All five trials exceeded 60 FPS.
Restored video, compiled-code invalidation and rematch checks passed. See
`rollback-capture-validation.json`. The selection probe now waits for Melee's
CSS reload and fighter-archive preload before issuing Start, avoiding a test-only
race when changing characters through the QA memory interface.

## CPU, kick, and native hand foreground (September 9)

Browser-tested room V88Q8A with two clients:

- P1 enabled native level 9 CPU mode, entered native stage select and Battlefield; inspected stage 31, 480-second time limit, items -1, teams 0 and CPU level 9. The CPU fought autonomously. Stock loss/results returned to the customized CSS with CPU mode retained.
- Joining during CPU mode was rejected. Removing CPU reopened the seat; the second browser joined as P2. P2 had no Kick control.
- The original animated hand visibly covered the keyboard icon, panel border, Ready and Remove CPU controls. Pointing at Ready and pressing P entered stage select.
- P1 kicked P2 during a human match. P2 received the removal message and Start Melee; P1 returned to the same room’s CSS with an empty guest seat and CPU action available.
- A 20.007-second human-match regression measured 60.130 simulation FPS and 59.980 presented FPS at 1280×720, with zero dropped frames or decoder errors. This sample had no delayed corrections; sustained rollback evidence remains in the earlier reports.

Protocol tests cover owner-only CPU/kick authorization, native CPU start without a guest, CPU join exclusion, disconnected guest removal and private-token revocation. Native code tests exercise the foreground callback order and the capture gate that rejects CSS frames until the customized layout and foreground have actually rendered.

After the native capture-gate rebuild, fresh rooms B68A9R and XRDJQV booted into the customized CSS. CPU on/off transitions retained the customized layout. Unpatched CSS frames are rejected before GPU readback/encoding, including the interval after callback installation but before the first foreground draw; a compiled C++ test checks this boundary and invalid/stale pointers.

P2 refreshed and retained its seat, navigated the native hand to its keyboard indicator, and opened controls using P. P1 then kicked P2 from character select while that dialog was open; removal closes the dialog and exposes the new-room start action.
