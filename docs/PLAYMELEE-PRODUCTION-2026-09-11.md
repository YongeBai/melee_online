# playmelee.com production investigation

Tested the custom domain on September 11, 2026 after a report of loud music,
poor frame rate, and invisible Fox/Falco/Battlefield in Brave (Chromium).
Only the Codex in-app Chromium browser was connected for this investigation;
the user's Brave instance was not available for direct reproduction.

The live `/release.json` identified `tournament-compact-experimental`, created
at `2026-09-11T18:46:33.312Z`, with core
`b041332554a42918a67b72e58c171ffbacb3c4fff2acd1c0186f95e1b9e20b52`.
It reports `performanceCertified: false` and `networkMultiplayer: false`.
This differs from the earlier full-disc deployment in the Vercel report.

## Live gameplay measurement

Opened `/play/?qa=1&benchmarkSeconds=60`; the bootstrap supplied production
engine settings. Ran the existing Benchmark 720p60 button with default Fox,
level-9 CPU Falco, and Battlefield, with the browser visible. Thresholds were
unchanged. One match was measured; this was not an isolated hardware benchmark.
Brief local Node validation commands ran during the sample; background user
applications and other work were not stopped.

| Metric | Result |
| --- | ---: |
| Duration | 59.98612 s |
| New simulation FPS | 24.22227 |
| Game-render FPS | 24.20560 |
| Distinct visible FPS | 24.00555 |
| Image gap p95 | 67.490 ms |
| Maximum image gap | 115.385 ms |
| Source size | 960 × 720 |
| Nonblack sample fraction | 1.0 |
| Existing 720p60 gate | Fail |

Renderer: ANGLE / AMD Radeon 890M / radeonsi gfx1150 LLVM 20.1.2 / OpenGL 4.6.
Cross-origin isolation, shared memory, and WebGL2 were available. WebGPU was
unavailable. The engine used worker OGL, mixed JIT, speed 1, CPU overclock 1,
and immediate presentation; profiling and metrics collection were off.

Screenshots during the match showed both Fox and Falco, Battlefield platforms
and stage geometry, and the native HUD. No console warnings or errors were
returned during the observed boot/match. The missing-assets symptom was not
reproduced here; this does not establish Brave compatibility or rule out a
device-specific rendering failure. The source has 720 lines with correct 4:3
proportions. FPS and frame pacing fail independently of resolution. These
measurements do not establish a hosting bottleneck or input-to-photon latency.

## Local audio change

The game runtime previously inherited full gain (1.0) without a volume control.
It now starts at 0.25 and offers a toolbar slider, remembered in localStorage.
Initialization preserves the audio activation gate. Storage failures leave
the control usable; saved values are bounded to 0–1. This adjusts all game
audio, including music and effects, rather than modifying native sound assets.

Local browser verification confirmed default 25, keyboard adjustment to 26,
and 26 after reload, with no console warnings/errors. Eight existing audio
tests passed, JavaScript syntax checking passed, and `git diff --check` passed.
The broader browser suite could not pass because this checkout lacks the
ignored Dolphin vendor sources required by its source-level tests.

The audio change is local only. No deployment was made. The hosted loader and
current release packaging live in the separately modified bundled-browser
worktree; that checkout and its running work were not changed. FPS optimization
and reproducing the Brave missing-model failure remain outstanding.

## Published startup-audio follow-up

The follow-up report identified harsh menu-confirmation sounds before CSS.
Browser startup now keeps output silent and the loading screen present until
native character select is initialized (major 2, minor 0, scene kind 8, at
least 60 native scene frames). User volume and autoplay activation cannot
override this startup gate. Legacy PCM requested during startup is zeroed,
including replies that arrive after CSS becomes ready, so queued startup
chunks cannot become audible when output is enabled. Audio consumption
continues while output is gated. Subsequent menu/game sounds are unaffected.
The native streaming path retains its existing startup/reconnect behavior.

Published both the gate and the earlier 25% default/persistent volume slider
to https://playmelee.com as `dpl_AszpxXxejiUrHGyHDeCxtbWfr4sc` from
`dist/browser/audio-startup-fix`. This supersedes the local-only audio status
above. `scripts/browser/prepare-audio-release.mjs` verifies that its base
inventory exactly matches production, then overlays only the audio/runtime,
startup helper, toolbar, cache versions, and release metadata. It copies no
unfinished worktree changes. The game manifest, core and source archive are
unchanged. The AudioController change is also recorded in the reproducible
engine integration patch and its source-tree/checksum metadata.

Validation: 13 focused tests passed; two full source-tree tests skipped because
the Dolphin vendor checkout is absent. The revised engine patch was separately
applied to the pinned engine commit using an isolated Git index to compute
its recorded result tree. Syntax and diff checks passed. All 128 packaged
files passed inventory verification. The packaged browser booted to CSS after
an early audio-activation gesture, with no console warnings/errors. Native
keyboard navigation and continued menu audio passed: 26 advancing native
frames, 1.099 seconds of audio scheduled, running audio context and 50 nonzero
PCM chunks. Audible output was not independently recorded/listened to.

The production alias reports READY. Remote hashes match the prepared HTML,
runtime, audio controller, startup helper, CSS, bootstrap, release metadata,
and unchanged game manifest; isolation headers are present. This update does
not fix or change the measured FPS shortfall or resolve the Brave model report.

## Camera investigation and environment distinction

The user reports an incorrect downward angle during active Fox/Falco Battlefield
gameplay in Brave, not just during pause. Early screenshots in this investigation
were from production; later ones were from local diagnostics or saved native
reference frames. These sources must be labeled when reporting results.

After the user's environment question, the live release inventory still exactly
matched `dist/browser/audio-startup-fix`. Fresh remote hashes also matched the
runtime, audio controller, bootstrap, startup helper, memory inspector and core
JavaScript loader. Production has no experimental depth correction.

Added read-only camera diagnostics to `inspectMelee` and the local QA output.
Two tests passed, including a check that camera inspection does not modify memory.
For idle Fox at (0, 0.0001) and Falco at (0, 54.4001), native Dolphin using the
original local disc and the browser using the production compact game reported
exactly identical camera values:

- Mode 0 (standard), FOV 30, pitch/yaw offsets 0.
- Interest [0.00000033092874218709767, 36.41558837890625, 0].
- Position [0.00000033092874218709767, 77.7341079711914, 226.02481079101562].

The native reference shows the top surface/gold border of Battlefield's upper
platform; the unmodified browser renderer shows different face/depth ordering at
the same camera state. This suggests a renderer defect rather than different
camera coordinates, but does not reproduce the user's complete Brave experience.
Native reference data/screenshots and scripts are ignored local artifacts under
`.local-tools/camera-native-*`. Only isolated reference workers were started;
they were closed afterward. Other running workers and checkouts were untouched.

`dist/browser/camera-diagnostic` is local-only and is NOT a deployable release.
It began as the verified production package with read-only camera diagnostics.
Its generated GL binding was subsequently changed to test inverted depth
comparisons. Inversion alone caused missing CSS geometry, so it is not a fix.
A second experiment also adjusted clear-shader clip depth; its browser stalled
and it has not been validated. The test tab and local servers were closed.
No screenshots showing a successful depth correction were captured and no camera
or depth correction was deployed. Its core loader differs from production and
must not be confused with the original package or a validated candidate.

Brave itself is not connected to the browser tools. Cached client files or GPU
backend differences remain hypotheses, not established causes. A screenshot or
short recording of the affected active match is needed to compare the user's
specific view without assuming that the in-app Chromium view is equivalent.

## Screenshot-confirmed depth ordering defect and corrected candidate

The user's screenshot of active Fox/Falco Battlefield shows the platform's
underside covering its top and partly covering Fox. This matches the unmodified
browser rendering at the native reference camera, rather than establishing a
Brave-specific camera setting or missing asset download.

The complete local correction needs three coordinated changes for the pinned
WebGL loader:

- Reverse LESS/LEQUAL/GREATER/GEQUAL comparisons; preserve the other comparisons.
- Invert `glClearDepthf`, including OGLGfx::ClearRegion's direct game-depth clear.
  The earlier two-part experiment missed this direct clear path and blanked CSS.
- Map the utility clear shader's already reversed [0,1] depth into [-1,1]
  OpenGL clip space. Ordinary vertex shaders already perform this conversion.

With all three changes, CSS renders and the idle Fox/Falco Battlefield comparison
shows the native platform top surfaces, front trim and correctly visible fighters.
Read-only diagnostics confirm exactly the previously recorded camera position,
interest, FOV 30, mode 0 and zero pitch/yaw offsets; no camera memory was changed.

`scripts/browser/webgl-depth-loader.mjs` applies a checked compatibility bridge to
this specific generated loader; its tests exercise comparison mapping, clear
depth and shader conversion. `prepare-depth-release.mjs` overlays only the checked
production inventory and selects a new content-hashed loader filename for this
core. The original immutable loader and WASM remain byte-identical. This is a
loader compatibility correction, not a newly compiled Dolphin core. Future core
builds must resolve the equivalent C++ depth conventions and revalidate rather
than assume this pinned bridge applies to a different core.

Prepared `dist/browser/depth-rendering-fix`: 129 inventory hashes verified.
Corrected loader SHA-256:
`7e594661e14c8ab343bd5c4562418dabadd141226b1cf213291677cb3443af76`.
Eight targeted depth/audio/memory tests pass. Clean package browser validation
and deployment status follow below. The diagnostic shader collector and server
on 3020 were stopped. Its diagnostic fetch instrumentation is absent from the
release candidate.

The first packaged candidate did NOT reproduce the correction: Emscripten's
pthread loader still referenced `dolphin-core-upstream.js`, so the GPU thread
executed the original bindings. Its stage test was stopped after observing the
same broken Battlefield. This is why checking only the entry module was
insufficient. No deployment was made from that candidate.

The bridge now also changes the pthread URL to `new URL(import.meta.url)`, so
all workers execute the same content-hashed corrected module. This behavior has
an additional regression test. Candidate v2 is
`dist/browser/depth-rendering-fix-v2`, loader SHA-256
`e4935a12ae4aad3e7f4f5c3fbcf827fed638f3f51a0593d1d230dcf31962b6ba`.
All 129 inventory entries pass the release verifier; no original immutable core
file changes. The old package server on 3021 was stopped.

Candidate v2 completed the six-stage UI-driven smoke test with Fox versus CPU9
Falco: Battlefield frames 142→442; Final Destination 141→444; Dream Land 64
143→445; Yoshi's Story 144→446; Fountain of Dreams 141→443; Pokémon Stadium
143→443. All had two fighters, four initial stocks, eight minutes, no items,
fixed expected stage, 960×720 output and returned to CSS. This checks initial
stage loading and frame progression, not every Pokémon transformation or every
fighter. Screenshots additionally verified visible fighters and scenery on
Dream Land and Yoshi's Story. Nine focused unit tests now pass.

## Depth correction deployment

Production deployment `dpl_BswcKhxcjLqQXKpZAknYhdCatpZS` is READY and aliased to
playmelee.com. URL:
https://melee-online-40ut7ujs7-yongebais-projects.vercel.app
The live inventory exactly matches candidate v2; HTML, bootstrap, worker protocol,
release metadata and corrected loader hashes were checked remotely. Entry modules
revalidate (`no-cache`), the corrected loader has its own immutable URL, and
COOP/COEP headers remain correct.

Before publishing, the v2 CPU9 Fox/Falco Battlefield screenshot showed correct
platform top surfaces and unobscured fighters during active combat. The final
local 30-second benchmark did not run: the local server had exited, preventing
its lazy-loaded benchmark module from being fetched. That module exists in the
verified inventory; do not report this failed attempt as a new performance
measurement. The prior measured below-target FPS remains unresolved.

Post-deploy browser verification on https://playmelee.com/play/?qa=1 confirmed
correct platform top/front surfaces during active Fox/Falco Battlefield gameplay.
The production benchmark completed successfully as a measurement, but failed
the 60-FPS target: 30.00358 seconds; simulation/game-render 16.2314 FPS;
distinct visible 16.0314 FPS; p95 gap 88.28 ms; max gap 177.695 ms;
960×720; nonblack fraction 1. Human versus level 9 CPU, WebGL worker on AMD
Radeon 890M through ANGLE, mixed JIT. This is slower than the earlier sample;
these non-isolated runs do not establish the cause of that difference. Do not
claim performance improvement or 720p60 certification from this rendering fix.
