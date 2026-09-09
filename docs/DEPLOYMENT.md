# Deploying the current game

`npm run serve` is the production entry point. It serves the original game shell,
local menu textures, keyboard model, audio and same-origin WebSocket endpoint
without Vite or Wrangler. The browser connects to `/engine-session`, using WSS
when the page uses HTTPS. There is no hardcoded browser-side localhost address.

This version needs a **Linux x64 GPU host**. A static-site or Cloudflare Workers
deployment alone cannot run its native Dolphin process. The verified hardware
is a Radeon 890M with Mesa EGL/OpenGL; another server needs its own performance
and input-latency validation. This production mode serves one private human/CPU
session per worker. A second active client is rejected rather than controlling
the first player's game. Rooms and rollback are not implemented by this mode.

## Host setup

1. Use Node 24+, Git, a C++20 compiler/make, FFmpeg with libx264, Mesa EGL/OpenGL
   and permission to access the GPU render device. The existing native setup
   script builds the pinned headless engine and supplies its missing EGL headers
   locally when necessary.
2. Install frontend dependencies with `npm --prefix web ci`. Place the USA 1.02
   ISO in the checkout. The first `npm run serve` builds/reuses the engine and
   extracts the native menu textures/font. The ISO and extracted textures remain
   outside Git. The production server has no `/local-disc` download route.
3. Copy `.env.example` to `.env`. Set `MELEE_PUBLIC_ORIGIN` to the exact HTTPS
   origin, for example `https://melee.example.com`, without a trailing slash.
   Set `MELEE_ACCESS_KEY` to a random password of at least 24 characters.
   Keep `MELEE_BIND_HOST=127.0.0.1` and `MELEE_PORT=3000` behind the TLS proxy.
4. Run `npm run serve`, or adapt `deploy/melee.service` for the host account,
   checkout and Node executable. The supplied unit expects `/opt/melee` and
   `/usr/bin/node`. The service account must have GPU access and own its writable
   runtime/cache directories.
5. Point DNS at the host and use `deploy/Caddyfile` for TLS and WebSocket proxying.
   Set `MELEE_DOMAIN` in Caddy's service environment to the hostname. Caddy must
   be installed/configured on the deployment host; it is not installed here.

The browser first authenticates with username **player** and the configured
password. The server then issues a signed, Secure, HttpOnly, SameSite=Strict
session cookie for eight hours. WebSocket connections require that cookie and
the configured origin. Non-loopback binding or an external origin fails startup
without the HTTPS origin and password. Do not expose the worker port around the
TLS proxy. Generated assets and health responses are protected too.

For a loopback-only production smoke test, leave `.env` absent and run
`npm run serve`, then open `http://localhost:3000/`. `npm start` remains the
separate Vite development path; stop one before starting the other.

## Validation and limits

The actual production server is tested in the browser, including original game
boot and gameplay. HTTP tests verify authentication/cookie tampering, game
serving, cross-origin isolation, traversal rejection and ISO-route absence.
An external domain/TLS deployment has not been provisioned or measured here.
No hosting credentials or remote machine were supplied in this task.

A public multi-user release needs a session allocator, one isolated worker per
session, quotas, reconnect handling and appropriate game-data provisioning.
The private worker is a deployment foundation, not a shared global multiplayer
room server. See [rollback and rooms](ROLLBACK-AND-ROOMS.md) for the next steps.
