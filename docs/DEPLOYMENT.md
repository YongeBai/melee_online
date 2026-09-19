# Deploying the browser-native tournament build

`npm run serve:native-port` is the hosted no-Dolphin entry point. It serves the
browser-native WASM build at `/play/` and the same-origin input-only room relay.
The normal product entry exposes character select, legal stage select, match,
native pause, and results; diagnostic HTML pages are not routes in this mode.
There is no ISO upload, file picker, `/local-disc` route, or Dolphin process.

The server only serves names in the native-port build manifest. `/play/` maps to
`character-menu.html`, relative modules and assets remain beneath `/play/`, and
the original victory audio is available through the allowlisted `/audio/`
alias. `/` and `/play` redirect to `/play/` while preserving room query strings.
The `/health` response identifies `browser-native-wasm`, reports
`dolphin: false`, and records the 960×720 presentation target.

## Host setup

1. Use Node 24+ and install the repository dependencies. Prepare the pinned
   source/toolchain inputs described in the engineering notes, then run
   `npm run build:native-port`. Development inputs may include a local USA 1.02
   disc fixture, but the resulting hosted player must start without a player
   supplying an ISO. Never deploy or commit the development disc, extracted
   game data outside the approved package, save data, secrets, or tool binaries.
2. Copy `.env.example` to `.env`. Set `MELEE_PUBLIC_ORIGIN` to the exact HTTPS
   origin, for example `https://melee.example.com`, without a trailing slash.
   Set `MELEE_ACCESS_KEY` to a random password of at least 24 characters. Keep
   `MELEE_BIND_HOST=127.0.0.1` and `MELEE_PORT=3000` behind the TLS proxy.
3. Run `npm run serve:native-port`, or install `deploy/melee.service` after
   adapting its account, checkout, and Node paths. Point DNS at the host and use
   `deploy/Caddyfile` for TLS and WebSocket proxying.

The browser first authenticates with username **player** and the configured
password. The server issues a signed, Secure, HttpOnly, SameSite=Strict session
cookie for eight hours. Game files, health, room POSTs, and room WebSockets all
require that session. Room traffic also requires the exact configured browser
origin. Non-loopback binding or an external origin fails startup unless an HTTPS
origin and a 24+ character access key are configured.

For an unauthenticated loopback smoke test, leave the public origin and access
key unset and run `npm run serve:native-port`, then open
`http://127.0.0.1:3000/`. `npm start` remains the development path. The legacy
`npm run serve` command is the separate native-streaming implementation and is
not the browser-native tournament deployment.

## Validation and limits

HTTP tests cover authentication, signed-cookie tampering, the product-only
route boundary, cross-origin isolation, traversal/ISO rejection, exact-origin
room POSTs, and WebSocket access. Browser probes separately validate native
menus/camera, two-browser deterministic rollback, and sustained 960×720
presentation cadence; see [VALIDATION.md](VALIDATION.md) for the exact measured
scope. An external domain/TLS deployment and broad WAN latency matrix still
require validation on the actual release host.

The server is an input relay, not a streamed server emulator. Simulation,
rollback prediction, audio, and rendering execute in each browser. See
[ROLLBACK-AND-ROOMS.md](ROLLBACK-AND-ROOMS.md) for architecture and limitations.
