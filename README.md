# Melee Online — local browser edition

The website runs the original **Super Smash Bros. Melee USA 1.02** through
a local GPU-accelerated Dolphin renderer, using your local disc. Video and audio
play in the browser at **720p / 60 FPS**. Character select, character models,
animations, attacks, CPU AI, Battlefield, sound, and match results come from
Melee itself. The browser integration fixes the match to one human against one
level-9 CPU, four stocks, eight minutes, no items, and Battlefield.

## Play

From this directory on this Linux machine, with Node 24+ installed:

```sh
npm start
```

Open **http://localhost:3000/**. The supplied `.iso` stays in this directory.
The start script builds/reuses the pinned local renderer and installs frontend
dependencies if needed. A first source build takes several minutes. Choose
**Character select**, then **Start Melee** to enable audio and
boot your disc. Loading can take a little while; leave the tab open.

Use **WASD** to move the original menu's hand and **P** to pick up/place tokens.
Move the CPU token to choose its fighter. **Enter** starts the match. All 25
original character tiles are unlocked; Zelda and Sheik share the Zelda tile.
The pause menu includes starting-form options for both players. The game
returns to character select after results; Esc → Character select ends a match
early through Melee's normal no-contest cleanup.

| Key | Action |
| --- | --- |
| WASD | Move / aim |
| P | A / attack / menu select |
| O | B / special / menu back |
| Space | Jump |
| I | Shield |
| U | Grab |
| K / M / comma / period | C-stick up / left / down / right |
| Left Shift + WASD | Walk / tilt |
| Enter | Start match |
| Esc | Pause / resume |

Tap jump is saved locally and can be changed before playing or while paused.
Turning it off preserves upward aiming, DI, up-specials, and button jumps.
Standard browser gamepads are mapped too; physical adapters need their own
browser-compatible driver/mapping. A connected physical controller has not
been tested here.

## Performance

The default renderer uses this computer's GPU with full game detail. A measured
60-second match delivered **59.94 rendered FPS and 59.96 displayed FPS**, at
1280×720 with zero dropped frames. Melee's original 4:3 image occupies 960×720;
black sidebars preserve its proportions. These measurements are for this machine.

The FPS button reports native rendering and simulation separately. The diagnostic
`/play/?qa=1` page also measures capture, encoding, decoding and browser presentation.
Use one active game tab. The local rendering/streaming process is started by
`npm start`; this performance path is not an all-WebAssembly emulator.

The earlier software WASM renderer remains at `/play/?engine=wasm`. It is much
slower (roughly 14–24 rendered FPS in previous tests). See the
[native renderer notes](docs/NATIVE-RENDERER.md) for architecture and reproduction.

## Architecture and local data

- `melee/`: the decompilation used to understand and verify native rules, scene
  transitions, character IDs, and input checks. It is not itself a browser engine.
- `opensmash/`: architectural/control inspiration from its separate N64 runtime.
- `engines/dolphin-native/`: pinned native Dolphin source and local build.
- `scripts/native/`: reproducible headless GPU/audio patches and the local bridge.
- `engines/wasm-dolphin/`: pinned third-party engine, recreated by
  `scripts/setup-engine.mjs`. See [engine integration](docs/engine/INVESTIGATION.md).
- `scripts/engine/`: the fullscreen game shell, native-memory bridge, and
  checked tap-jump hooks. No fake combat fallback is used.
- `web/local-melee.ts`: localhost-only game/engine/disc middleware, with byte ranges
  and cross-origin isolation for WASM threads.

The game disc is not included in Git or the production website build. This is
a localhost application; it does not publish your ISO, provide remote hosting,
or implement human-versus-human rollback netplay. The 3D controller uses the
creator's Sketchfab embed and needs internet; actual gameplay uses local files.

## Checks

```sh
npm test
npm --prefix web test
npm --prefix web run typecheck
npm --prefix web run build
node scripts/audit-disc.mjs '/absolute/path/to/melee.iso'
```

See [validation](docs/VALIDATION.md), [status](docs/PORT-STATUS.md), and
[controls/model attribution](web/docs/CONTROLS.md). The normal `web` production
build covers the controls frontend; run `npm start` from the root for the local
engine and disc routes.
