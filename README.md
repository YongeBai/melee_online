# Melee Online — local browser edition

The website runs the original **Super Smash Bros. Melee USA 1.02** through
a local GPU-accelerated Dolphin renderer, using your local disc. Video and audio
play in the browser at **720p / 60 FPS**. Character select, character models,
animations, attacks, CPU AI, stage select, sound, and match results come from
Melee itself. The browser integration fixes the match to one human against one
level-9 CPU, four stocks, eight minutes, and no items. Choose your stage in
Melee’s original stage-select screen.

## Play

From this directory on this Linux machine, with Node 24+ installed:

```sh
npm start
```

Open **http://localhost:3000/**. The supplied `.iso` stays in this directory.
The start script builds/reuses the pinned local renderer and installs frontend
dependencies if needed. A first source build takes several minutes. Choose
**Start Melee** to enable audio and
boot your disc. Loading can take a little while; leave the tab open.

Use **WASD** to move the original menu's hand and **P** to pick up/place tokens.
Move the CPU token to choose its fighter. **Enter** advances to stage select; **WASD** moves the stage cursor and **P**
selects a stage. **O** returns to character select. All 25
original character tiles are unlocked; Zelda and Sheik share the Zelda tile.
Hold **P** (GameCube A) while loading the stage as Zelda to start as Sheik.
The game returns to character select after results. **Esc** uses Melee’s
original pause screen. To quit early, pause, then hold **I + L + P** and press
**Esc** (the original L + R + A + Start combination).

| Key                    | Action                           |
| ---------------------- | -------------------------------- |
| WASD                   | Move / aim                       |
| P                      | A / attack / menu select         |
| O                      | B / special / menu back          |
| Space                  | Jump                             |
| I / L                  | L / R shield                     |
| U                      | Grab                             |
| K / M / comma / period | C-stick up / left / down / right |
| Left Shift + WASD      | Walk / tilt                      |
| Enter                  | GameCube Start                   |
| Esc                    | Pause / resume                   |

Point Melee’s hand at the **keyboard icon beside P1** and press **P** for the local 3D
keyboard and its colored GameCube button mappings. **Tap jump** is the only
setting in this view and is saved locally. Close with **Back** or **Esc**.
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

The game disc is not included in Git or the production website build. The default development command binds to localhost. **`npm run serve`** adds a
production server that can sit behind HTTPS on a GPU host; see
[deployment](docs/DEPLOYMENT.md). A public host has not been provisioned.
Human-versus-human rollback and room matchmaking are future work; see
[the implementation plan](docs/ROLLBACK-AND-ROOMS.md). The keyboard and physical GameCube button parts are procedural Three.js models.
Menu artwork and SIS font labels are extracted from the disc at startup and stay
in the ignored `.melee-assets/` directory. Controls need no external embeds.

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
build covers the web entry route; use root `npm start` for development or
`npm run serve` for the production game server. The production server does not
expose a disc-download route.
