# Validation — September 8–9, 2026

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
