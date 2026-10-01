# Netcode lab

Started September 30, 2026, after players reported online matches as
unacceptably laggy. This records why the shipped netcode lags on real
connections, the variants built to fix it, and the loop used to compare them.
[PLAYMELEE-P2P-NETPLAY.md](PLAYMELEE-P2P-NETPLAY.md) describes the transport and
room architecture these build on.

## Why the shipped netcode lags

The earlier measurement loop only delayed messages inside the page, in order
and without loss, so it could not see these problems. Under real impairment
(below), four causes appear:

1. **Head-of-line blocking.** Every input travels on one ordered, reliable data
   channel. When one packet is lost, Chrome's SCTP holds every later input until
   the retransmission arrives: at least three later packets plus a round trip,
   or the 400 ms minimum retransmission timeout when the retransmission is also
   lost. The rollback window is 7 frames (117 ms), so the game freezes.
2. **No time sync.** The owner starts its match a few frames earlier and stays
   ahead. The existing catch-up step judges the lead from received inputs
   without allowing for their travel time, so the owner settles about one-way
   delay plus two frames ahead. The owner then sees the guest's inputs a round
   trip plus two frames late. One side rolls back constantly while the other
   never does (seat 0: 128 corrections, seat 1: 0 in one regional run), and on
   a 120 ms round trip the owner's late inputs exceed the window and it stalls.
3. **Lockstep menus through the owner.** Character and stage select wait for
   the owner's confirmed frame. A guest therefore waits a full round trip for
   every frame against a fixed 3-frame (50 ms) buffer; above ~50 ms round trip
   the menus run at a fraction of 60 FPS (21 FPS at 120 ms).
4. **No input delay.** With zero local delay every remote input change arrives
   late and is corrected by rollback, including on short links.

## Variants

`engines/browser-native/native-netcode.mjs` makes each part selectable with
`?netcode=` on the product page (comma-separated tokens). Without the parameter
the shipped behaviour is unchanged (`room,d0,w7`).

| Token | Meaning |
|---|---|
| `room` | Inputs only through the owner's reliable, ordered room channel (shipped). |
| `direct` | Also send inputs peer to peer on an unordered channel with no retransmission (`maxRetransmits: 0`). Each packet carries every input the peer has not acknowledged (at most 32 frames, one SCTP chunk), as Slippi and GGPO do. A send is skipped while the channel has a backlog, because SCTP queues even unreliable messages behind its congestion window; the next packet repeats the same frames. The room channel still carries every input for the owner's authority, match endings and reconnection. Each remote frame and acknowledgement reaches rollback once, from whichever path delivers it first. |
| `d<N>` | Local input delay in frames (0-6). The sample taken at frame f is played at f+N and sent immediately. |
| `w<N>` | Rollback prediction window in frames (4-15). |
| `s` | Time sync. Each peer estimates its frame advantage from the newest peer input and half the round trip, and sends the estimate in every direct packet. Acting on half the difference of the two estimates cancels the bias both share. The leading peer drops one frame, at most once per 20 frames, while it is more than 0.75 frames ahead. Without a shared estimate, the trailing peer also adds a frame. |
| `ma` | Menu lockstep through the owner's confirmed frames, 3-frame buffer (shipped). |
| `mp<N>`, `mpa` | Menu lockstep built from both players' inputs as they arrive (a one-way wait), with an N-frame buffer, or one sized from the measured round trip (`mpa`, 3-12 frames). |

Analog inputs are rounded to float32 when made (`canonicalPad`). The game reads
them as `float`, so the simulation is unchanged, and both delivery paths carry
the identical immutable value in 4 bytes.

## The loop

```sh
node scripts/netplay/netcode-lab.mjs \
  --variants="room,d0,w7;direct,d1,w7,s,mpa" \
  --profiles=regional,home-wifi,wifi-spikes,far,far-wifi,very-far \
  --frames=1800 --trials=1 --out=dist/netplay-lab/run
```

Each trial runs `scripts/native-port/probe-native-rooms.mjs` with two real
Chrome browsers against the local product server. One creates a room, the other
joins by code, both reload, move the native hands, ready up and pick the stage.
They then play a 1,800-frame match with the scripted combat workload, which
feeds controller samples through the same input path as a keyboard or
controller. Results append to `results.jsonl`, and `summary.md` ranks the
variants per profile and overall.

**Network.** `scripts/netplay/netem.mjs` runs the trial inside an unprivileged
network namespace (`unshare -rn`, no root). Only UDP on loopback, which is
WebRTC, passes through Linux `netem`. Page loads are not slowed, while SCTP sees
genuine delay, jitter, reordering and loss, retransmissions included. Both
browsers share the namespace, so each packet crosses netem once: profile delay
is one-way delay. Profiles with `spikes` run a background loop that raises the
delay for a few hundred milliseconds at random intervals, like Wi-Fi stalls.

| Profile | One-way delay | Jitter | Loss | Spikes |
|---|---|---|---|---|
| `lan` | 1 ms | 0 | 0 | |
| `same-city` | 8 ms | 2 ms | 0 | |
| `regional` | 20 ms | 4 ms | 0.2% | |
| `cross-country` | 35 ms | 5 ms | 0.5% | |
| `home-wifi` | 25 ms | 15 ms | 1.5%, 25% correlated | |
| `bad-wifi` | 30 ms | 25 ms | 3%, 40% correlated | |
| `wifi-spikes` | 20 ms | 4 ms | 0.5% | +200 ms for 250 ms every 2.5-7 s |
| `far` | 60 ms | 8 ms | 1% | |
| `far-wifi` | 45 ms | 8 ms | 1% | +150 ms for 200 ms every 3-8 s |
| `very-far` | 90 ms | 10 ms | 1% | |

`--cpu-throttle=1:3` slows the guest browser's CPU 3× (DevTools throttling) to
stand in for a weaker computer.

**Measurements**, per seat:

- Simulation FPS.
- Stalled advances, which happen when the prediction window is exhausted.
- Rollback corrections and replayed frames.
- Time-sync dropped and added frames.
- Draw-gap stutter: total time beyond one frame in gaps over 25 ms, plus counts
  of gaps over 50, 100 and 250 ms.
- Menu: character-select frame rate over 3 s, and the time from the guest's key
  event to its hand moving on its own screen and on the owner's.
- Latency: the timing script stamps each input's first transmission, each peer
  input's first arrival and each simulated frame on the wall clock both browsers
  share. **Local** latency is our input's transmission to our simulation of that
  frame (input delay plus stalls). **Remote** latency is the time until the
  opponent simulates that frame with our input: the later of its arrival and the
  opponent reaching the frame. Neither is input-to-photon.

**Score** (lower is better):

> localP50 + 0.5 × remoteP95 + 0.2 × stutter ms per minute + 3 × replayed frames per second

Freezes dominate, then the delay players feel on their own inputs, how late the
opponent's actions appear, and how much rollback snapping occurs. The weights
are a judgement call; every component is kept separately in `results.jsonl`. A
failed trial (crash, desync or timeout) disqualifies the variant for that
profile.

## Results

September 30 to October 1, 2026. Each round ran 1,800-frame matches; full rows
are in `dist/netplay-lab/<round>/results.jsonl`.

**Shipped netcode (`room,d0,w7`) under impairment** (round 2, one trial each):

| Profile | Stutter | Worst gap | Sim FPS | Menu FPS |
|---|---|---|---|---|
| regional | 0.26 s/min | 34 ms | 59.9 | 60 |
| wifi-spikes | 1.75 s/min | | 58.4 | |
| far-wifi | 6.2 s/min | | 55.0 | |
| far | 8.7–9.9 s/min; one trial timed out in stage select | 237 ms | 52.6 | 21 |
| very-far | 19.4 s/min | | 47.1 | |

**Round 1** (aborted) exposed the clock offset: with `direct,d1,w7`, the two
seats made 128 and 0 corrections.

**Smoke runs on `far`** found two faults in early versions, both fixed:

1. The first direct link sent up to 64 frames per packet about 120 times a
   second. SCTP queued the messages behind its congestion window, the link's
   round trip grew to 0.9–5 s, and it starved the room channel (34 FPS).
2. One-sided time sync made both peers drop about 75 frames, and two-sided
   correction overshot. The current design exchanges estimates and only the
   leader corrects.

**Round 2**, 5 variants × 6 profiles, one trial each. Mean rank:

| Variant | Mean rank |
|---|---|
| `direct,d2,w7,s,mpa` | 1.83 |
| `direct,d1,w10,s,mpa` | 2.67 |
| `direct,d1,w7,s,mpa` | 2.83 |
| `direct,d0,w7,s,mpa` | 3.17 |
| `room,d0,w7` | 4.5 (1 failure) |

Every direct variant beat the shipped netcode on every profile except
`home-wifi`, where all were within noise.

**Round 3**, the leaders and their combination, two trials each on the four
hardest profiles, plus `far` with the guest CPU throttled 3×.
`direct,d2,w10,s,mpa` ranked first on all five, with no failures:

| Profile | `direct,d2,w10,s,mpa` | `direct,d1,w10,s,mpa` | `direct,d2,w7,s,mpa` |
|---|---|---|---|
| home-wifi | 94.5 | 94.9 | 102.5 |
| wifi-spikes | 199.6 | 238.9 | 253.7 |
| far-wifi | 212.9 | 247.5 | 294.1 |
| very-far | 696.1 | 739.9 | 1470.4 |
| far, guest CPU 3× slower | 452.4 | 623.8 | 835.3 |

With the slow guest on `far`, the shipped netcode scored 2138: 9.9 s/min of
stutter, 53 FPS and 23 FPS menus. `direct,d2,w10,s,mpa` stuttered 1.7 s/min,
with 59.6 FPS, 59 FPS menus and a worst gap of 49 ms.

**Default.** `direct,d2,w10,s,mpa` is now `defaultNetcode`. Players get two
frames (33 ms) of local input delay, as in Slippi's default. A 10-frame window
absorbs Wi-Fi stalls and long links without freezing. The verification passes
below used the product default (no `?netcode=`):

- the lab on `regional`: 0.17 s/min stutter, 59.9 FPS;
- the lab on `far-wifi`: 0.37 s/min stutter, 59.7 FPS;
- the pause and LRAS quit through results and back to character select;
- the release `/play/` entry.

**Not solved.** At `very-far` (180 ms round trip) the default still stutters
about 2.4 s/min at 57.7 FPS. Such links would need more input delay, chosen
from the measured round trip.

## Limits

- Both browsers run on one machine. They share its CPU and display clock, so
  clock drift between real computers is not exercised; time sync is exercised
  by start offsets.
- netem impairs both directions equally; real paths are often asymmetric.
- The scripted workload changes inputs about 125 times per 1,800 frames. A human
  holding an analog stick changes them more often, which means more rollback.
- CPU throttling approximates a slower computer, not a specific device or GPU.
