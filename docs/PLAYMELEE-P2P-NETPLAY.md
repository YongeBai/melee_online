# playmelee.com peer-to-peer rollback netplay

Status as of September 23, 2026. playmelee.com serves the browser-native WASM
port (no Dolphin, no game server) with two-player rollback rooms. Each browser
simulates and renders the original game; the two browsers exchange only
controller inputs over a direct WebRTC data channel.

## Architecture

- **Room authority** (`engines/browser-native/room-core.mjs`): the input-only
  room rules formerly in the Node relay, now platform-neutral. The room owner's
  page runs it; the Node relay (`scripts/native-port/rooms.mjs`) wraps the same
  core for local development.
- **Peer transport** (`engines/browser-native/native-p2p.mjs`): the guest reaches
  the owner's authority over an ordered, reliable RTCDataChannel. The same channel
  carries room RPCs (create/join/resume), relay messages and RTT probes. The owner
  serializes its authority to sessionStorage on page hide, because Melee rooms
  reload both pages on most epoch changes (join, kick, CPU toggle, resync). A
  finished match is the exception: see "Match end" below.
  Reconnects repeat pending scene barriers and unconfirmed inputs; the authority
  treats both idempotently.
- **Signaling** (`deploy/playmelee/api/signal.js`): a Vercel function that pairs
  one offer with one answer per room code, using the regional Runtime Cache. Only
  session descriptions pass through it.
- **ICE** (`deploy/playmelee/api/ice.js`): public STUN, plus short-lived
  Cloudflare Realtime TURN credentials when `TURN_KEY_ID` and
  `TURN_KEY_API_TOKEN` are set in the Vercel project. TURN is not configured yet,
  so players behind symmetric NATs cannot connect.
- **Netcode (October 1, 2026)**: the default is now `direct,d2,w10,s,mpa`.
  - Inputs also travel peer to peer on an unordered, never-retransmitted channel
    that repeats every unacknowledged input.
  - Two frames of input delay and a 10-frame prediction window.
  - Time sync from exchanged frame-advantage estimates.
  - Menu lockstep built from both players' inputs, with a buffer sized from the
    measured round trip.

  See [NETCODE-LAB.md](NETCODE-LAB.md) for why the reliable-only design below
  lagged on real connections, and for the comparison loop. The rest of this
  section describes the room channel, which still carries every input for the
  owner's authority.
- **Rollback**: prediction covers seven frames of *one-way* peer delay
  (`native-product-rollback.mjs`). The owner's acknowledgement (a full round trip)
  gates only audio/result commitment, within a separate 30-frame bound. Matches
  finish at the earliest terminal frame of the current timeline, so a guest that
  reached the ending during replay never waits for frames the owner never ran.
- **Sound effects** (`engines/browser-native/audio-device.c`, `native-sfx.mjs`):
  the original lbAudio/AXDriver/synthesizer code drives deterministic virtual DSP
  voices stepped in 5 ms frames from every simulation frame, so sound state is
  part of rollback snapshots and identical on both peers. A worker decodes the
  hosted original banks (bit-exact with vgmstream on the checked samples) and Web
  Audio plays them. Replays keep matching sounds and stop mispredicted ones.
- **GameCube adapter** (`native-gc-adapter.mjs`): WebHID access to the Nintendo
  adapter (Wii U mode). Raw values take the SDK origin and Melee's
  `HSD_PadClamp`/`HSD_PadScale` path. Not tested with physical hardware.
- **Controllers and the room UI**: browser gamepads with the standard mapping
  (Xbox, PlayStation and similar) drive the local seat. The Xbox layout keeps
  GameCube button positions: X is B, B is X, RB is Z, and the triggers are
  analog L and R. Detecting a controller switches the player's panel icon and
  controls screen to it. The controls screen is a 3D pad, with each button's
  GameCube part floating above it, and it follows the live input. Pressing a
  keyboard key switches back to the keyboard. Each seat reports keyboard or
  controller through the room, so the opponent's panel shows the matching icon.
  Browsers expose a gamepad only after one of its buttons is pressed on the page.

## Match end (October 1, 2026)

There is no results screen. When a match ends, both pages go straight back to
character select in the same page, with the room's peer connection kept open.

- The page takes one copy of the WASM heap and globals before character select
  first runs (`createBootCheckpoint` in `wasm-snapshot.mjs`). Restoring it gives
  the native state a fresh page load would. Pages the heap grew by since then
  are cleared.
- The sound-effect audio RAM map and the rollback audio journal are restored
  alongside the heap.
- Each peer still sends its result. The room changes epoch only when both
  results match: `network.returnToCharacters()` asks for character select once
  the room reaches `results`. The new epoch then resets the client's scene
  state instead of reloading.
- If the checkpoint is missing or cannot be restored, the page falls back to the
  old reload into the same epoch.
- Verified with `probe-product-menu.mjs --results` (two CPU eliminations with a
  match between), `probe-native-rooms.mjs --results` (lockstep) and
  `probe-native-rooms.mjs --lras --rollback`. The rollback probe plays a second
  rollback match from the restored heap, with movement and self-destructs, and
  gets identical results on both peers.

Music starts as soon as the browser allows it. It no longer waits for a key
press or for the reload that used to follow the first match. Controller button
presses also retry the audio resume. The page holds a screen wake lock while
visible, because controller input does not keep the OS awake.

## Measurement loop

```sh
node scripts/netplay/playmelee-loop.mjs --url=https://playmelee.com --iterations=6 --delays=0,20,40
```

Each iteration launches two Chrome processes against the live site. One creates a
room and the other joins by code, refreshes, readies, and picks the stage and a
rotating character pair. They then play a 1,800-frame rollback match of scripted
combat. A second match sends 40 real keyboard presses.

Per iteration it records:

- simulation FPS for both peers, and the captured-canvas cadence of one seat
  (every frame distinct, at 960×720 with 4:3 framing);
- rollback corrections and replayed frames;
- the ICE candidate pair and data-channel RTT;
- one-way input transit, from browser wall clocks on the same machine;
- local key-event to native-input submission;
- sound-effect voice starts.

`--delays` adds ordered one-way delay with jitter inside both peers' links, to
emulate WAN distance. Results append to `dist/netplay-loop/results.jsonl`.

"Estimated remote latency" is:

> local input p95 + one-way transit p95 + one display frame

This is a browser-canvas estimate, not a physical input-to-photon measurement.

## Results on playmelee.com

Six-iteration run, September 23, 2026, before sound effects:

| Emulated one-way | Stage / pair | Sim FPS (P1/P2) | Captured FPS | Est. remote latency p95 |
|---|---|---|---|---|
| 0 ms | Battlefield, default | 59.92 / 59.82 | 59.97 | 43.6 ms |
| 20 ms | Final Destination, 20/2 | 59.83 / 59.80 | 59.97 | 70.1 ms |
| 40 ms | Fountain, double Ice Climbers | 59.75 / 59.57 | 59.94 | 98.7 ms |
| 0 ms | Dream Land, 9/14 | 59.74 / 59.91 | 59.97 | 45.1 ms |
| 20 ms | Yoshi's Story, 17/10 | 59.86 / 59.70 | 59.97 | 77.3 ms |
| 40 ms | Stadium, 15/4 | failed in character select* | | |

\* The probe's cursor steering overshot. Character select still runs lockstep,
so at 40 ms each way the cursor lags one round trip; the match itself was not
reached.

Local key-to-submission latency is 16–19 ms at p95. The same-machine data
channel RTT is under 1 ms. One-way transit is 5–10 ms at p95, which is mostly
waiting for the main thread's next frame.

Sound effects on production (first iteration afterwards):

- 240 and 243 voice starts per peer;
- no missing samples;
- 59.93 / 59.85 simulation FPS.

Locally with sound, the 40 ms ± 10 ms rollback run passed at 59.52 / 59.64
simulation FPS, with exact state convergence.

### Catch-up build (sound effects, GameCube adapter, peer catch-up)

Six-iteration production run, September 23, 2026. The "active" simulation rate
excludes the pre-match barrier, which is time spent waiting for the slower
browser to finish loading. That wait was 22–183 ms per seat and is reported
separately. In matches, a peer whose opponent is demonstrably 2+ frames ahead,
or whose clock owes a whole frame, takes one counted extra step. Every presented
frame is still new.

| Emulated one-way | Stage / pair | Active sim FPS | Captured FPS | Est. remote latency p95 |
|---|---|---|---|---|
| 0 ms | Battlefield | 60.04 / 59.97 | 59.97 | 43.9 ms |
| 20 ms | Final Destination, 20/2 | 59.91 / 59.90 | 59.97 | 70.6 ms |
| 40 ms | Fountain, double Ice Climbers | 59.81 / 59.81 | 59.94 | 98.7 ms |
| 0 ms | Dream Land, 9/14 | 60.00 / 59.97 | 59.97 | 44.2 ms |
| 20 ms | Yoshi's Story, 17/10 | 59.94 / 59.90 | 59.97 | 77.9 ms |
| 40 ms | Stadium, 15/4 | harness failure* | | |

\* The headless profile raised `ERR_CERT_VERIFIER_CHANGED` during the first
page load. The probe now reloads once for that harness fault.

Each match produced 170–420 sound-effect voice starts per peer, with no missing
samples.

Confirming run with the harness fixes (same build):

| Emulated one-way | Stage / pair | Active sim FPS | Captured FPS | Local input p95 | One-way p95 | Est. remote latency p95 |
|---|---|---|---|---|---|---|
| 0 ms | Battlefield | 60.04 / 59.94 | 59.97 | 17.8 ms | 9.4 ms | 43.8 ms |
| 20 ms | Final Destination, 20/2 | 59.91 / 59.91 | 59.97 | 17.4 ms | 39.0 ms | 73.1 ms |
| 40 ms | Fountain, double Ice Climbers | 59.84 / 59.84 | 59.94 | 18.0 ms† | 64.9 ms† | 99.6 ms† |
| 0 ms | Dream Land, 9/14 | 59.97 / 60.04 | 59.97 | 20.5 ms | 10.5 ms | 47.7 ms |
| 20 ms | Yoshi's Story, 17/10 | 59.94 / 59.94 | 59.97 | 16.8 ms | 43.7 ms | 77.1 ms |
| 40 ms | Stadium, 15/4 | 59.84 / 59.84 | 59.97 | 17.0 ms | 60.6 ms | 94.3 ms |

† The keyboard-latency match for this row timed out while character-select
steering overshot on the lagged lockstep menu. It was rerun on playmelee.com
after the steering fix.

## Load times on playmelee.com

Measured with fresh browser profiles (`node scripts/netplay/measure-load.mjs
https://playmelee.com 3` for the menu; the room probe's scene timestamps for
matches), September 23, 2026:

| Phase | Before | After |
|---|---|---|
| Page open to first menu frame | 27–33 s, sometimes over 60 s | 2.0–2.9 s |
| Stage chosen to match start | 5.9–9.7 s, 5.2 MB over the network | 2.6–3.0 s, 0.44 MB |

- The audited host modules are checked for integrity concurrently rather than
  one fetch at a time; each file is still fetched exactly once.
- The material-animation converter records packed byte ranges instead of a set
  of every address, which makes it about 10× faster. It produces identical output
  on all 156 public roots and every menu converter.
- Character select prefetches the common match archives and the six legal
  stages. Each chosen fighter's model and animation archives are prefetched as
  soon as the fighter is picked.
- Disc-extracted fixtures, sound banks and music are cached for a week. HTML
  stays `no-store`, so releases still take effect immediately.

In matches, a frame costs about 3.9 ms to draw, 1.2 ms to simulate, 0.55 ms to
replicate and 0.12 ms to checkpoint. That leaves the 16.7 ms budget with room,
so no in-match change was made.

## Limits

- Tests run two browsers on one machine; real WAN loss and reordering are not
  covered (the data channel is reliable and ordered). Emulated delay goes up to
  about 120 ms RTT at full speed; 150 ms RTT dips just under 59.5 FPS on one seat;
  220 ms RTT falls to about 55 FPS. Longer links would need input delay or
  frame-advantage balancing.
- Owner page reloads rebuild the room from sessionStorage. Closing the owner's
  tab ends the room.
- Without TURN, some NAT combinations cannot connect.
- The diagnostic CPU probe's jump-coverage assertion is sensitive to sound
  effects, because `ft_PlaySFX` consumes game RNG as on the console.
- The GameCube adapter path is unit-tested against the protocol, but no
  physical adapter was available.
- UCF 0.84, the tournament controller fixes used by Slippi online, is not
  implemented. The reference is compiled PowerPC code (GPL-3.0) covering eight
  patches; porting them is a separate decision and project.
