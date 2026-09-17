# Engineering notes worth keeping

Saved September 10, 2026. This is the durable handoff for the working room/CPU
build, before the input-latency and auto L-cancel experiments. Refer to source
and validation reports rather than treating an old screenshot or benchmark as
proof of a future revision.

## Direct browser port update (September 17)

The development native port now runs the decompiled C directly in browser WASM.
Its current scope and limitations are in `BROWSER-NATIVE-PORT-STATUS.md`; the
server-streamed implementation described below is the historical/public path.
The native product profile uses typed original HSD objects for the two-card
layout, an alpha canvas plus clipped native-hand foreground passes, and the
established controls. Never regress to diagnostic keys or four visible slots.
A CPU slot must be accepted by the host constructor before calling original
player initialization. Gate tap jump at the original jump predicates rather
than zeroing stick Y; CPU and Nana must retain native jumps.

The solo Dolphin configuration leaves controller port 2 unplugged. The native
product menu must likewise disconnect its CPU port before copying pad status;
a connected neutral sample otherwise creates a spurious CPU hand. Keep P1's
original CPU-token hit tests. Reconnecting P2 restores its shifted card position,
and changing opponent kind calls the original card-refresh function. Hide the
CPU keyboard icon and omit its alpha aperture together, including the first
render before the native disconnect callback runs. Human hands still render
above the room controls and their keyboard icons.

Music has a browser stream backend; SFX still uses the explicit muted boundary.
Do not confuse accepting a queued music request with sound reaching the output:
inspect context state and audio-graph samples after a user gesture. Decode HPS
in a worker, cancel obsolete track loads, retain native loop points, and preserve
the paused offset across hidden tabs. Original VS startup also calls
`Stage_80225074(fn_8016E5C0(start))`; omitting it leaves menu music playing during
matches. This selector can use native RNG, so verify room synchronization after
changing its call site. The extraction and server allowlist must include music
without adding a player-supplied file requirement.

Portable-source provenance includes both injected menu include files. Re-run
compile audit and audit-link before building when changing either include.
`prepare-menu-ui.mjs` copies existing extracted UI fixtures into ignored output;
it does not add an ISO requirement to browser startup. The optional room relay
transports inputs only. Its three-frame lockstep must not be described as rollback.

## What was running at the earlier checkpoint

`/play/` uses one authoritative Linux headless Dolphin process per room. Browsers
send controller changes and receive H.264/PCM. Rollback saves and restores the
whole emulator; it is not two local browser emulators. The decompilation supplies
symbols and understanding, not a standalone browser game. The supplied local ISO
supplies real models, animation, AI, audio, and menus. The software WASM path is
retained but previously measured only roughly 14–24 rendered FPS.

The native game picture is 960×720 (4:3), padded into a 1280×720 stream. Do not
stretch Melee to 16:9 or call duplicated/interpolated frames real simulation FPS.
OpenGL is the tested default; Vulkan crashed in sustained testing on this Mesa
GPU/driver. Room workers use single-threaded emulation with real MMU mode;
see `scripts/native/server.mjs` for the current worker/solo differences.

Authoritative current docs: `ROLLBACK-AND-ROOMS.md`, `DEPLOYMENT.md`, and
`VALIDATION.md`. `NATIVE-RENDERER.md` also contains historical solo configuration;
its old port and queue details are not the current room defaults.

## The native UI recipe

The successful result combines real game assets with changes to native render
objects, not a website drawn over a stock four-player menu.

1. `scripts/assets/extract-menu.mjs` reads the local disc, decodes GX menu textures,
   and renders labels from Melee's SIS font. Use those glyphs for room codes,
   statuses, and actions. Extracted files live in ignored `.melee-assets/`.
2. `scripts/engine/melee-css-layout.js` moves P2's original card/model/nameplate
   to the right and hides unused P3/P4 joints. It also moves the native hit bounds.
   Apply transforms in a render callback after native animations, or animation
   updates will overwrite a one-time memory edit. Nameplates are separate SIS
   text objects; moving only the joint tree is incomplete.
3. Room controls fill the space between the two native cards. The keyboard view
   uses a procedural Three.js keyboard and physical GameCube button shapes,
   plus native-looking Back and toggle artwork. Retain this visual language.
4. Preserve the full native roster: Zelda/Sheik use the shared Zelda tile and
   native hold-A behavior. Preserve native stage selection and native pause.
   Opening keyboard settings isolates that client's game input while menu music
   and the native CSS continue running.

### How the hand stays above added controls

CSS `z-index` cannot put an HTML control underneath one object inside an opaque
video. We solved this at the native draw pass and browser GPU compositor:

- `melee-foreground.js` intercepts the two original hand render callbacks. In the
  final camera pass it draws three magenta rectangles using Melee's own GX
  routines, then renders all original passes of both animated hand models.
  The second hand's ordinary callback becomes a no-op, avoiding duplicate draws.
- `native-presenter.js` keys only those reserved rectangles to transparent in a
  WebGL shader. Room controls and keyboard indicators have CSS z-index 1; the
  transparent game canvas has z-index 2 and does not intercept pointer events.
- The real hand pixels, animation, position, and shading remain in the same
  encoded frame as the game. There is no approximate HTML hand or separately
  sampled cursor overlay to drift behind the image.
- Restrict keying to the room/icon rectangles and disable it during matches.
  Global magenta removal damages legitimate character colors. H.264 4:2:0 mixes
  chroma at edges; the shader uses a threshold and spill suppression.
- Keep native aperture coordinates and HTML dimensions aligned, including at
  different viewport ratios. P1 and P2 both need an underlying indicator because
  the same video stream contains both openings. Removing an underlying element
  leaves a transparent/black hole.

No ISO modification was required. The hooks are checked runtime RAM edits.

### Never flash the original character select

`menu-frame-gate.h`, applied from `patch-native.mjs` in Dolphin's frame dumper,
rejects CSS frames before readback/encoding until both layout callbacks are
installed and the native foreground pass has written its ready marker. Checking
callback addresses alone is insufficient: installation can precede the first
actual customized draw. The browser retains the previous frame during setup.
CPU mode changes retain the room panel during the native scene reload.

Do not replace this with a timeout, CSS fade, or frontend-only loading flag;
those allow unmodified frames into the encoder/presentation queue. Preserve the
gate at boot, CPU changes, results/rematch, and kick recovery.

## Useful GALE01 USA 1.02 addresses

These are version-specific, not general Dolphin APIs. Validate original opcodes,
object pointers and cave occupancy before writes; invalidate the instruction
cache/JIT when code changes. Inspect decomp source and original DOL together.

| Address | Purpose |
| --- | --- |
| `0x804D6CBC` / `0x804D6CC0` | CSS root GOBJ / JOBJ |
| `0x804A0BC0` / `0x804A0BC4` | P1/P2 cursor userdata pointers; first word is hand GOBJ |
| GOBJ `+28` | Native render callback |
| Cursor `+0xC` / `+0x10` | Native hand origin X/Y; not its fingertip |
| `0x80391070` | Original HSD GOBJ/JOBJ render callback |
| `0x80391A04` / `0x80391580` | Debug primitive setup / DrawRectangle |
| `0x80361FC4` | HSD state-cache invalidation after custom GX drawing |
| `0x80001840` | Hand foreground PPC stub |
| `0x80001AFC` | P2 ordinary renderer no-op |
| `0x80001B00` / `0x80001B40` | Foreground data / rendered-ready marker |
| `0x80001C00` / `0x80001C80` | Layout PPC stub / transform table (table ends below `0x2800`) |
| `0x80002800` onward | Seven tap-jump stubs at `0x80` stride; reserve existing hook region |
| `0x80002F00` / `0x80002F01` | Per-port tap-jump flags; zero means enabled |
| `0x80480820` + port × `0x24` | CSS player records; kind `+1`, stocks `+2`, CPU level `+15` |
| `0x80479D58` / `0x80479D5C` | Scene / render frame counters |

**Do not use `0x80001800` for injected code.** Dolphin installs its HBReload hook
there; an early foreground prototype exited the emulator when it jumped there.
The foreground stub starts at `0x1840` specifically to avoid that hook.

Native CSS camera projection for this layout, in normalized full 1280×720 video
coordinates, is approximately `u = .5 + x*.01073`, `v = .5 - y*.01725`.
Fingertip is approximately origin `(x+5, y-.75)`. Validate visually before using
these for a different camera. The keyboard hit target's P2 shift is 44.75 world
units, not the earlier 46.2 estimate. Source is `melee-runtime.js`.

The decomp's GetSaveData header offset was misleading in this build: actual save
data was `main + 0x1868`, not `+0x1898`. Never infer address compatibility from a
function name alone. Native controller/player identity also involves multiple
fields; validate actual fighter port, player ID and controller index after Start.

## Input and lifecycle findings

- Owner is always P1/port 0; guest is P2/port 1. Bind input to the authenticated
  socket seat, never to a client-supplied port. Refresh must preserve that seat.
- Public six-character invite codes are separate from private reconnect tokens
  in sessionStorage. Kick revokes the guest token, clears both controllers,
  stops rollback, and returns to CSS. Handle reserved disconnected seats too.
  Kicking a guest with keyboard settings open must close the dialog and reset
  local pause/input state so the new-room Start action is accessible.
- Reserve joins/mode changes across asynchronous calls. A rejected leave must
  retain membership; deleting it before checking a transition strands the seat.
- CPU mode reloads CSS with P2 kind=1 and level=9. Human guest joins are excluded
  until Remove CPU. CPU matches do not allocate rollback checkpoints. Both
  selected characters persist through opponent changes and results.
- A scene number can change before its objects and frame counter are ready.
  Require valid objects and scene progress, not just a fixed timer. The room
  monitor waits for CSS progression before enabling Ready and reapplying layout.
- Tap jump required seven patches, including MWCC-inlined checks. Patching only
  exported functions left some standing/running/air jumps active. Preserve the
  native displaced instruction, register/CR behavior, per-port settings, button
  jumps, DI/aiming, CPU behavior, and Nana's AI where intended.
- Do not use UI polling (100 ms) to implement frame-sensitive landing mechanics.
  Gameplay assists must run in emulated code and be deterministic under rewind.

## Performance wins and traps

Current rollback uses full Dolphin snapshots every four frames, a 12-frame late
window, and five slots (~383 MB total on the measured build). Worst correction
can replay 15 frames because it starts at the preceding checkpoint.

Wins: remove unused fake MMU RAM using real MMU mode; reuse GPU allocations while
still serializing contents; skip intermediate replay capture/audio; do not copy
the unchanged restored checkpoint again. Preserve compiled code only when cached
instructions match restored RAM and the instruction cache is coherent. Changed
code/BAT mappings must take normal invalidation. Do not trade determinism for FPS.

Video presently starts with three decoded frames and caps room queues at eight.
Prior stress runs averaged roughly 74 ms in this presentation queue alone. That
is a concrete latency target, not proof that the whole pipeline is 74 ms. A
server stream still incurs input transit, simulation, encoding, video transit,
decoding and presentation. WebSocket/TCP can add head-of-line stalls.

Prior evidence: sustained native delayed-input runs matched reference MEM1 hashes;
a two-browser 60-second stress sample achieved ~59.86/59.91 presented FPS with
333 corrections and zero dropped frames. The UI/CPU turn's separate 20-second
human-match sample measured ~59.98 presented FPS with zero dropped frames but no
induced corrections. Keep workload and duration attached to numbers.

## Reproduction and experiment isolation

- `npm run serve`: production-style server; `MELEE_PORT` selects its port.
- `npm test`: native-memory/room/rollback/asset/transport checks (28 at checkpoint).
- `/play/?qa=1&online=1`: room QA; plain `?qa=1` exercises solo diagnostics.
- `MELEE_VERIFY_FRAMES=3600 MELEE_VERIFY_STRESS=1 MELEE_VERIFY_MIN_FPS=60 node scripts/native/verify-rollback.mjs`:
  real-emulator deterministic rollback verification; run away from live rooms.
- Browser QA panels can overlap and move after results render. Use role-based
  button activation with Enter when pointer clicks could hit a moving overlay.
  Separate control pulses so key-up/neutral reaches the emulator.
- Native source modifications belong in reproducible patch scripts, not just the
  ignored Dolphin checkout. Setup stamps hash the patch/header/setup inputs.
- Each experiment needs independent mutable engine source/build and runtime
  directories. Do not symlink an engine that setup will patch into another live
  worktree. ISO/reference repos can be read from the original workspace.
- The other `codex/browser-dolphin` worktree is independent work; do not reset,
  rebuild, kill, or overwrite it. Supplied Slippi binaries are references, not a
  ready-made browser rollback engine.

Next experiments and external sources belong in the input-lab worktree's
`docs/INPUT-LAB.md`. Preserve this tested baseline until experiments are measured.
