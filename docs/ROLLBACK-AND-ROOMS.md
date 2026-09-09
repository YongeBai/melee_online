# Browser multiplayer and rollback: implementation direction

The current game is real Melee running in a GPU process, with a browser as its
display and controller. Production serving is now independent of localhost, but
remote streaming and client-side rollback solve different latency problems.
We should retain the native menu/asset work and define a session protocol before
adding room-code controls to the live character-select screen.

## What the supplied Slippi packages provide

The inspected `Slippi-Launcher-2.15.1-x86_64.AppImage` contains an Electron
application (`slippi-launcher`, version 2.15.1). Its packaged code installs and
launches Dolphin and obtains releases for Ishiiruka, the launcher, and Dolphin.
It is a useful reference for configuration, engine lifecycle and direct-connect
UX; it is not a WebAssembly emulator. The official launcher describes the same
role: updates, online play and replays.
Source: [Slippi Launcher](https://github.com/project-slippi/slippi-launcher)

The supplied `Slippi-Nintendont-1.13.0.zip` contains Wii applications, including
PowerPC `boot.dol` executables. Its metadata identifies version 1.13.0, commit
`cf78292`. The Slippi project describes Nintendont as its recording/mirroring
component. It is useful for protocol/replay research, not as a browser netplay
engine. Source: [Slippi components guide](https://github.com/project-slippi/slippi-wiki/blob/master/GETTING_STARTED.md)

The relevant rollback engines are **Slippi Dolphin / Ishiiruka** and the Slippi
mainline Dolphin fork. The mainline repository describes its port as WIP with
cross-compatible netplay; we must choose and pin an actual tested revision.
Its additional Rust component also needs to be built. Do not assume the launcher
binary adds rollback to our upstream Dolphin build.
Sources: [Slippi Ishiiruka](https://github.com/project-slippi/Ishiiruka) and [Slippi mainline Dolphin](https://github.com/project-slippi/dolphin)

## Two separate milestones

**Hosted browser play:** keep a GPU worker and deliver media using WebRTC, with
input over a data channel. This is the shortest path to zero-install room play.
Each room has one authoritative Melee instance, two assigned controller ports,
and two browser sessions. There is no duplicated simulation to synchronize,
but each player still pays the input-to-server and video-return latency. It must
not be described as Slippi-style client-side rollback. The current WebSocket
H.264 transport should be replaced for WAN use to avoid reliable-stream stalls.

**Browser-native rollback:** each browser runs Melee locally, predicts missing
remote inputs, saves/restores emulator state and resimulates corrected frames.
This requires the WASM/WebGPU engine to reach sustained real-time operation with
headroom for multiple catch-up frames. The earlier WASM software path did not
meet that target. A native companion using Slippi is an optional intermediate
experiment, but it does not fulfill the final browser-only goal.

For browser rollback, adapt the native engine's rollback mechanisms, not its
launcher UI. Browser networking requires WebRTC/signaling/TURN rather than raw
native UDP/ENet. Input frame numbers, state hashes, RNG seeds, ROM revision,
engine revision, rules and code patches must agree. Restoring only our existing
24-MB memory snapshot is insufficient: CPU registers, timing, devices and other
emulator state matter. Rendering and audio must discard predictions without
replaying sound or presenting invalid frames.

The current tap-jump patch targets Player 1 and has one flag. Online play needs
per-port settings shared in the session configuration and applied identically
on both peers. Otherwise the engines can diverge. CPU-only rule enforcement in
`controlMelee` must also become mode-aware before enabling a second human.

## Room protocol before room widgets

Create/join operations return a room ID, a short invite code, and separate,
private reconnect credentials. The invite code is not an account password and
is not a Slippi account's connect code. Limit rooms to two seats. Normalize
codes, expire abandoned rooms, rate-limit joins, and validate seat ownership on
every input/selection message.

Use explicit states: waiting, connected, selecting, stage selection, loading,
in match, results and reconnecting. Both players must acknowledge the same
character/rules/engine configuration before starting. The owner chooses the
stage for the first version. Results retain the room and return both players
to character select. Disconnects must show a real state and either reconnect or
return to the lobby; they must not silently convert the opponent to a CPU.

Keep transport and renderer adapters separate from room state. This allows a
hosted worker to be replaced by a browser rollback peer without rebuilding the
menu. Do not wire our invite codes into Slippi's ranked/matchmaking service or
claim compatibility without an explicitly tested integration.

## Native two-player character-select layout

Preserve the original 25-tile roster and shared Zelda tile. Replace the fixed
“4-man survival test!” presentation with a native-style VS title for two players.
Use the same original character card models, portraits, metallic borders and
SIS font. Place P1 on the left and P2 on the right; remove the two N/A cards.
The current second card must move to the right, not be copied as another web
panel. Keep the keyboard icon next to each local player's name.

In original 640×480 coordinates, reserve approximately x=45–175 for P1 and
x=465–595 for P2 below the roster. The middle x=195–445 region can hold the room
controls. Use the native beveled option plates and yellow selection arrows,
with “Your code” and an editable “Join code” line in the SIS font. Show the real
assigned code; enable Join only when its backend exists. Keyboard focus in the
code field must stop WASD/P/O from controlling Melee, then return focus cleanly.

Implementation should first inspect and relocate/hide the original CSS JOBJ
card roots from `mncharsel.c`, or reproduce their verified transforms in a
native-asset scene. Do not cover live cards with opaque HTML rectangles. Room
labels can initially be aligned overlays using the extracted font, anchored in
the same 4:3 coordinates as the game. Every screenshot must check card scale,
text baselines, outline thickness, palette, cursor position and focus behavior.

These room controls are a future design, not buttons masquerading as working
multiplayer in the current release.

## Acceptance tests

- Two independent browser profiles can create/join a room, select different
  fighters, play, finish and rematch. A third player cannot obtain a seat.
- Invalid/expired codes, duplicate joins, refreshes, owner departure and temporary
  disconnects lead to the correct visible native-style state.
- Neither player can change the other player's inputs, character or credentials.
- Automated network tests inject 30/80/150-ms RTT, jitter, loss and reordering.
  Track confirmed-frame hashes and report any desync; test long matches and
  repeated character/stage transitions, transformations and Ice Climbers.
- Rollback tests deliberately deliver late inputs and compare the final state
  to a reference run with those inputs known in advance. Require successful
  rewind/resimulation, bounded audio/video correction, and 60-FPS presentation
  with catch-up headroom on each supported browser/hardware target.
- Measure real input-to-photon latency. A stream reporting 60 FPS is not enough
  evidence for competitive responsiveness.
- Validate HTTPS/WSS and WebRTC/TURN on two real networks, followed by visual
  review of every room state in the same 4:3 frame as native Melee.
