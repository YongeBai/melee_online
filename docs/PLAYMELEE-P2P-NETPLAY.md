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
  reload both pages on every epoch change (join, rematch, return to menu).
  Reconnects repeat pending scene barriers and unconfirmed inputs; the authority
  treats both idempotently.
- **Signaling** (`deploy/playmelee/api/signal.js`): a Vercel function that pairs
  one offer with one answer per room code, using the regional Runtime Cache. Only
  session descriptions pass through it.
- **ICE** (`deploy/playmelee/api/ice.js`): public STUN, plus short-lived
  Cloudflare Realtime TURN credentials when `TURN_KEY_ID` and
  `TURN_KEY_API_TOKEN` are set in the Vercel project. TURN is not configured yet,
  so players behind symmetric NATs cannot connect.
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
