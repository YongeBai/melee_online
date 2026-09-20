# Browser-only preview deployment

## Live Vercel deployment

Published September 11, 2026 at https://melee-online.vercel.app in the
`yongebais-projects/melee-online` Vercel project. Deployment ID:
`dpl_5jGiGZoyQRpzjBJAxemE9T4JpAXB`. This is a static deployment with no server
GPU or native emulator workers. It contains the candidate-49 `solo-preview`
package and matching source archive described below.

The deployment copy is in `dist/browser/vercel-solo-preview` in the main
checkout, copied only from the verified release inventory. To redeploy that
same package from the repository root:

```sh
node scripts/browser/verify-release.mjs dist/browser/vercel-solo-preview
vercel --cwd dist/browser/vercel-solo-preview --prod --yes --scope yongebais-projects
```

Remote validation passed SHA-256 checks for all 113 public content files,
COOP/COEP headers, WASM MIME, and 404 checks for `.env`, `local-disc`, a missing
engine module, and Vercel's private configuration file. The HTTPS browser
reached **Open Melee disc** without console warnings or errors. Gameplay was
not repeated on the remote origin; the earlier packaged gameplay measurements
below still apply. Players select their own local disc. Live multiplayer and
certified sustained 60 FPS remain unavailable.

The solo preview uses candidate 49 and bounded, same-frame pixel readback.
**Do not publish the older `dist/browser/release` (candidate 46):** its detached
ImageBitmap presenter accumulated graphics memory at roughly 180 MB/second
on the tested Chromium/Radeon client. The replacement keeps image storage
bounded and avoids an extra queued frame. Sustained 60 FPS and live multiplayer
are still release milestones, not capabilities established by this preview.

This is a separate deployment from the native streaming service described in
DEPLOYMENT.md. It serves static JavaScript/WASM and uses the player's computer
for emulation and WebGL2 graphics. No GPU server, native Dolphin process, ISO
upload, or game-asset hosting is required. Players select their own uncompressed
USA 1.02 ISO/GCM; menu artwork is decoded from that file inside the browser.
The release is a solo preview, not working online multiplayer. Browser-local
rollback correctness is tested separately from independent-client networking.

## Build and inspect

Use Node 24 and the existing isolated browser worktree. The candidate must already
have been built by `node scripts/browser/build-candidate.mjs`. Packaging verifies
all candidate hashes before writing and refuses to overwrite an existing release.

```
npm run build:browser -- --core b041332554a42918a67b72e58c171ffbacb3c4fff2acd1c0186f95e1b9e20b52 --out dist/browser/local-preview --wasm-dispatch
npm run verify:browser-release -- dist/browser/local-preview
PORT=8080 node dist/browser/local-preview/server.mjs
```

Open `http://localhost:8080/`. The normal entry selects the pinned browser engine
and its tested configuration without requiring a hand-written query string.
The package has no server-side application dependency or native executable.
`files.json` records file sizes and SHA-256 hashes. Release metadata explicitly
records that online multiplayer and a certified 60 FPS target are unavailable.
The server serves an inventory of packaged files only, returns proper WASM MIME,
blocks upload methods, and never exposes the checkout, ISO, saves, or `.env`.

The generated Dockerfile provides an alternative CPU-only static server:

```
docker build -t melee-browser-preview dist/browser/solo-preview
docker run --rm -p 8080:8080 melee-browser-preview
```

The container runs as the unprivileged `node` user. No GPU device, game-file
volume or emulator port should be mounted. `/health` identifies it as a browser
engine with zero native workers. The Docker image was built locally and passed health, module, WASM, source-part
and isolation-header checks. Inspection confirmed user `node`, no GPU device
requests, and no attached devices. Gameplay was tested against the identical
packaged Node server. Vercel HTTPS deployment is verified above; custom-domain
deployment remains unverified.

## Hosting

Cloudflare Pages can serve the website with the supplied `_headers`; Vercel can
use the supplied `vercel.json`. The engine WASM is approximately 13 MiB. Each
website file must fit Cloudflare's 25 MiB asset limit. The verifier checks this.
A top-level `404.html` prevents static hosts from routing missing engine modules
to the home page. Keep the content-addressed core directory intact.

For Cloudflare, create a Pages project using Direct Upload, upload the finished
release directory with Wrangler, and add the domain through that project's
Custom domains settings. This avoids trying to compile Dolphin in a hosted
frontend build job. No Cloudflare account, project, domain, or remote TLS
configuration has been modified by these local packaging steps.

All external deployments require HTTPS. The provided headers enable
Cross-Origin-Opener-Policy: same-origin and Cross-Origin-Embedder-Policy:
require-corp, which the shared-memory WASM engine needs. Do not put the game in
a cross-origin iframe or strip these headers at a reverse proxy. Same-origin
modules, workers, audio worklets and WASM must retain the same release layout.

Official configuration references, checked September 11, 2026:
- [Cloudflare Pages limits](https://developers.cloudflare.com/pages/platform/limits/)
- [Cloudflare response headers](https://developers.cloudflare.com/pages/configuration/headers/)
- [Cloudflare Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/)
- [Vercel static configuration](https://vercel.com/docs/project-configuration/vercel-json)

## Release validation

Test the **packaged** server, rather than the development server. Open `/play/?qa=1`
for menu, controls and gameplay probes. For a 240-frame ordinary-versus-optimized
rollback comparison, use:

```
/play/?qa=1&inputprobe=1&timelineprobe=1&timelineframes=240&checkpoints=prediction&wasmdispatchcompare=1
```

The probe requires exact equality of every serialized machine-state byte and
proof that the new dispatcher ran. Use a fresh session with
`/play/?qa=1&benchmarkcpu=1` for active CPU-9 gameplay measurement; keep profiling
and other emulators/builds idle. The release's 720-line image is native 4:3
960×720. CSS scaling, duplicate frames, and replay work do not count as new
60 FPS gameplay. Cross-browser hardware coverage and WAN play are not established.

## Modified engine source

The final release includes the modified engine source and licenses at `/source/`.
It is a gzip archive split into parts of at most 20 MiB, so individual assets
fit Pages' limit. The source manifest lists their exact sizes and hashes.
These files are downloaded only
when someone requests the source, not during game boot. The source page provides
links, checksums and reconstruction instructions. No local disc, extracted menu
art, saves, `.env` or Git metadata is included in that archive. Unused upstream
Game Boy test fixtures and saved-game files are excluded and the archive's
file inventory is checked before packaging.

To regenerate the source and include it when packaging (use fresh output paths):

```
node scripts/browser/package-source.mjs b041332554a42918a67b72e58c171ffbacb3c4fff2acd1c0186f95e1b9e20b52 dist/browser-source/solo-preview
npm run build:browser -- --core b041332554a42918a67b72e58c171ffbacb3c4fff2acd1c0186f95e1b9e20b52 --out dist/browser/solo-preview --wasm-dispatch --source-dir dist/browser-source/solo-preview
npm run verify:browser-release -- dist/browser/solo-preview
```

Distribute the source and license files together with the engine. The packager
checks that the source parts identify the selected core and match their hashes.
Compiler/toolchain installation is separate from deployment: a finished release
runs without those build tools. The source archive records the exact toolchain,
but a binary-identical rebuild on a second machine has not been tested.

## Measured candidate 46 results

On September 11, the actual static package passed a 240-frame rollback trial
with 98 corrections and 409 replayed frames. All 113,188,634 full-machine bytes
matched the ordinary dispatcher reference, with 14,454,035 calls to the optimized
dispatcher during the trial. This is one local engine, not a network test.

The normal presenter measured 58.912 simulation / 58.945 render / 55.911 distinct
visible FPS at 960×720 over 29.994 seconds against an active level-9 CPU. The
image-gap p95 was 32.57 ms. A bitmaprenderer alternative regressed to 53.538
simulation / 50.405 visible FPS and is not enabled by the release. These results
**do not pass** the 60 FPS acceptance test. Rollback performance during real
peer traffic and independent-browser determinism remain unverified.

The packaged browser also passed native menu flow: controls/input isolation,
tap jump, stage-select Back, Fountain of Dreams and Battlefield, Zelda hold-A
starting Sheik, native quit, fixed match rules, and return to character select.
Menu-image decoding in the browser exactly matches all seven corresponding
images from the established local extraction. Opening controls with P over the
native hand target and the appearance of Back/toggle/button models were checked
in the actual packaged UI.

All 26 fighter forms were exercised in 13 CPU-9 matches with four stocks,
eight minutes and no items, followed by return to native character select.
The fresh-session memory test then exposed the release hold above. A plain
shared-memory readback experiment stayed near 0.9 GB of device-wide graphics
memory but measured 57.850 simulation / 51.085 visible FPS; it is not a 60 FPS
solution either.

## Current bounded presenter (candidate 49)

The default is WebGL2 on the player's machine with shared pixel transport
(oglsab=1) and same-frame readback (oglsync=1). Two-PBO readback was also
measured, but offers no compelling throughput gain and adds one frame of
presentation delay. Bitmap export is not used by the release.

The 30.012-second active CPU-9 Battlefield test measured 58.876 simulation /
58.876 game-render / 56.144 distinct visible FPS, at 960×720. Image-gap p95
was 32.86 ms, maximum 69.345 ms. This remains below the 60 FPS criterion.
No profiler, concurrent build or second emulator was active during measurement.

The same-frame path passed the 240-frame delayed-input proof: 98 corrections,
409 replayed frames, maximum depth six, and every one of 113,188,634 machine
state bytes equal to the reference. The compact dispatcher ran 14,433,411
times during the comparison. Replay suppressed 416 video exports and 547,600
audio sample frames, with suppression off afterward. Mean checkpoint capture
was 7.09 ms and restore 13.12 ms. Those costs leave insufficient headroom to
claim 60 FPS under live network corrections; the test uses one local engine.

A five-minute candidate-48 bounded-presentation soak across gameplay and menus measured
0.945–1.048 GB of device-wide graphics allocation, with stage/cache warmup
rather than the earlier continuous 180 MB/second growth. Linux/AMDGPU
maintainers can repeat this check while exercising the browser:

```
node scripts/browser/watch-gpu-memory.mjs 300 /tmp/melee-gpu-memory.json
```

The counters include other applications: isolate GPU workloads when comparing.
The native RGBA fast copy is tested against an independent per-pixel reference,
including misaligned inputs, non-opaque alpha, orientation and scaled fallback.

Final solo package validation: all six tournament stages and all 26 fighter
forms passed with CPU level 9, four stocks, eight minutes and no items; the
engine returned to native character select after every trial. All 92 gameplay
files are byte-identical between the tested validation package and the final
bundle. The final container and Node server each passed 114 public-file HTTP
checks. The same-frame candidate's separate five-minute soak measured
0.957–1.034 GB of device-wide graphics memory. The final source inventory
excludes saved-game/ROM fixtures and has ten parts. This is a solo preview;
there is no working peer-room transport or certified sustained 60 FPS.
