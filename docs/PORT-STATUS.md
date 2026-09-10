# Current port status

The website plays original Melee through a pinned native Dolphin GPU renderer.
The browser receives a 1280×720 video stream and stereo audio and sends controller
input. Original character select, stage select, battles and results use the supplied
USA 1.02 disc. `/play/?engine=wasm` retains the slower browser-only engine.

The default `/play/` creates a two-player invite room. The owner is P1 on the
left and the joining player is P2 on the right, with separate native controller
ports. Both players ready up before P1 selects a stage. The rules are four stocks,
eight minutes, no items and no teams. The keyboard icon beside each player's card
opens the 3D keyboard mapping view and that player's tap-jump setting.
`/play/?solo=1` retains human-versus-level-9-CPU play.

Rooms use authoritative server-side rollback: complete Dolphin snapshots,
last-input prediction and corrected resimulation for late inputs. This is not
Slippi, peer-to-peer rollback, or immediate browser-side prediction. The real-game
integration test compares final memory hashes with on-time and delayed inputs,
checks separate P1/P2 controllers, and verifies rendering and a rematch. See
[rollback details](ROLLBACK-AND-ROOMS.md) and [validation](VALIDATION.md).

The optimized simulation completed five 3,600-frame workloads at 720p, with
on-time input and input delayed 1/3/5/9 frames. The nine-frame trial performed
400 corrections and 4,000 replayed frames at 68.54 simulation FPS; every final
memory hash matched the reference. Video streaming still adds latency.
Competitive WAN latency and public multiplayer deployment remain unverified.

The same-origin production server includes private-session authentication and
per-room GPU workers. Static hosting alone cannot run the native engine. A public
GPU host has not been provisioned. The decompiled Melee and OpenSmash repositories
remain independent and unchanged.
