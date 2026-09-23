# Vercel gameplay performance check — September 11, 2026

The deployed browser preview did **not** meet sustained 720p60 in any of three
60-second gameplay measurements. Live browser-peer rollback is not implemented
in this release (`networkMultiplayer: false`).

Tested https://melee-online.vercel.app/play/ using the release defaults below,
plus `qa=1&benchmarkSeconds=60`. The supplied link contained two concatenated
copies of the URL; the test used one clean copy.

## Results

| Measurement | First match | Warm repeat | New deployment, fresh boot |
| --- | ---: | ---: | ---: |
| Duration, seconds | 59.998270 | 59.998060 | 59.987635 |
| New simulation FPS | 53.351538 | 54.401759 | 41.225162 |
| Game-render FPS | 53.301537 | 54.351757 | 41.208492 |
| Distinct visible image FPS | 51.918164 | 52.768373 | 40.625039 |
| Image-gap p95, ms | 33.935 | 34.355 | 36.125 |
| Maximum image gap, ms | 66.825 | 63.110 | 120.285 |
| Source resolution | 960 × 720 | 960 × 720 | 960 × 720 |
| Nonblack sample fraction | 1.0 | 1.0 | 1.0 |
| Existing acceptance test | FAIL | FAIL | FAIL |

All tests used Fox versus level-9 CPU Falco on Battlefield. Each benchmark
started a fresh match and waited for the game timer to reach 7:54 before
sampling. The second run reused the engine process and warmed caches. The
browser remained visible; screenshots confirmed original Battlefield gameplay
and the native fighters/HUD. No warnings or errors were returned by the browser
console inspection after the runs. The final screenshot confirmed native P1
pause after measurement, and the tab was left paused with its result visible.

Production was updated concurrently during the first two tests. A fresh reload
then booted the new automatic game-loading release successfully, followed by the
third measurement. The WASM and benchmark hashes were unchanged. The third run
was slower, but changing background load and fresh-process warmup prevent
attributing that difference to the new loader. No controlled deployment A/B
comparison or warm repeat of the third run was performed.

720 lines retain Melee's 4:3 proportions: the game source is 960×720, rather than
a stretched 1280×720 image. Resolution passed; simulation, visible cadence and
frame pacing did not. A 60 FPS frame interval is approximately 16.67 ms.

## Environment and limits

- User's Linux machine, Codex in-app Chromium browser.
- AMD Ryzen AI 9 HX PRO 370, Radeon 890M. Reported renderer:
  `ANGLE (AMD, AMD Radeon 890M Graphics (radeonsi gfx1150 LLVM 20.1.2), OpenGL 4.6)`.
- Shared memory, cross-origin isolation and WebGL2 were enabled. WebGPU was not
  available, and the selected renderer was OGL in a worker.
- Emulation speed and CPU overclock were both 1. Profiling and metrics were off.
- The prior agent-created local emulator tab was closed before testing. Other
  user applications, including a busy Brave renderer and upload processes,
  were active. These are measurements under the observed machine load, not an
  isolated hardware ceiling or a controlled comparison with localhost.
- The existing deployed benchmark samples the actual canvas at 32×24 on
  animation callbacks and hashes its RGB pixels. This measures distinct images
  separately from simulation/render counters; it is not a physical display or
  input-to-photon measurement. Sampling incurs overhead, and identical sampled
  images can count as unchanged. No acceptance thresholds were altered.
- Three matches on one client do not cover every fighter/stage/device. No
  test injected rollback corrections or tested independent browser peers.

## Deployment checks

The live WASM download returned HTTP 200, `application/wasm`, 13,004,305 bytes,
and SHA-256:

`b041332554a42918a67b72e58c171ffbacb3c4fff2acd1c0186f95e1b9e20b52`

The downloaded runtime, benchmark, local menu decoder, engine app and WASM
matched both the public inventory and the local Vercel release copy. The HTML
response carried COOP `same-origin`, COEP `require-corp`, and CORP `same-origin`.
Runtime diagnostics independently confirmed `crossOriginIsolated: true`.
The releases identify themselves as `browser-only-preview`, with
`performanceCertified: false` and `networkMultiplayer: false`.
The first two tests used `discProvision: player-local-file`, with the user's
local USA 1.02 disc selected through the page's file chooser. The third used the
new release's automatic loader (`discProvision: hosted-authorized-game`).
This test did not deploy changes.

Release identities:

| Identity | First two runs | Third run |
| --- | --- | --- |
| Release creation time (UTC) | 2026-09-11T09:40:05.973Z | 2026-09-11T17:19:35.564Z |
| Runtime SHA-256 | `e88e8f36957540423fb022fefc23e12b7beae36ca2a2652674675f0cac25a9f6` | `0f90d1063d3c9e8142f3c52ecc2dcee625a88a68738d65cab6c80f1594fcf16e` |

The benchmark SHA-256 is
`0a1863fe9667dc68ec94870d278360f7f8d794a0448cf41d2e5c0963291cda2f`
in both releases.

Vercel serves the static engine files; emulation and graphics run on the player's
computer. These results do not establish a hosting bottleneck. Hosting changes
alone have not been demonstrated to resolve the runtime shortfall.

## Exact runtime settings

```text
engine=wasm video=ogl oglproxy=worker renderheight=720
oglsab=1 oglsync=1 wasmjit=2 forcejit=1 jitwarmup=900
shortprefix=1 smearcompile=0 determinism=1 icache=0
dcbfast=1 dcbbatch=1 inlinedispatch=1 wasmdispatch=1
coreid=b041332554a42918a67b72e58c171ffbacb3c4fff2acd1c0186f95e1b9e20b52
qa=1 benchmarkSeconds=60
```

The diagnostic reported mixed JIT tier, immediate presentation, baseline
timing, CPU thread enabled, and interpreter-disable mask `524419072` in all
runs. The existing gate requires simulation/render rates of 59.5–60.5 FPS,
at least 59.5 distinct visible images per second, at least 960×720 source,
99% nonblack samples, and p95 image gap no greater than 20 ms over at least
29.5 seconds of the same match. All runs failed that unchanged gate.
