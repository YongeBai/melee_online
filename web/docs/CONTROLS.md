# Browser controls

| Key               | GameCube input / action                            |
| ----------------- | -------------------------------------------------- |
| W A S D           | Main analog stick: up, left, down, right           |
| P                 | A / attack / select                                |
| O                 | B / special / menu back                            |
| Space             | X / jump                                           |
| I                 | L / shield                                         |
| L                 | R / shield                                         |
| U                 | Z / grab                                           |
| K                 | C-stick up                                         |
| M                 | C-stick left                                       |
| Comma             | C-stick down                                       |
| Period            | C-stick right                                      |
| Left Shift + WASD | 50% analog magnitude for walking/tilts             |
| Enter             | GameCube Start; advances from character select     |
| Escape            | GameCube Start during battle: native pause/unpause |

The C-stick keys form an inverted T below the U/I/O/P action row. Opposing
directions cancel, and main-stick diagonals are normalized. Shift is a simple
analog modifier, not an implementation of B0XX-specific tournament modifiers.

## Game flow

The home URL opens `/play/`. Press P or Enter to enable audio and boot the local disc
into the original character-select screen. Move the hand with WASD; press P to
pick up/place the human and CPU tokens. Enter advances to the original stage
select, WASD moves the stage cursor, P confirms, and O goes back. Match settings
stay at four stocks, eight minutes, no items, one human and one level-9 CPU.

Zelda and Sheik share the original Zelda tile. Hold P (A) while the selected
stage loads to use Melee’s own Sheik-start behavior. There is no separate form
selector. Esc invokes the native pause camera and help graphic. To quit, pause,
then hold I + L + P and press Esc: Melee’s L + R + A + Start combination.
Results return automatically to character select.

## Keyboard view

Move Melee’s hand onto the keyboard icon beside P1 and press P to open the controls dialog. The icon highlights when the hand points at it; it is not a mouse button. A procedural
Three.js keyboard shows physical GameCube button caps, shoulder triggers, and
grooved analog/C-stick parts above their key anchors. Key presses light the caps; the model stays at a fixed viewing angle.
Leader arrows project from the 3D anchors, following OpenSmash’s approach in
`opensmash/web-prototype/visual/game-launcher.js`. The model is authored here;
there is no downloaded keyboard asset or external iframe. Three.js is MIT-licensed.
Back uses original menu lettering; Tap jump and ON/OFF use the original SIS
font decoded from the executable. Background textures come from the original
menu archives. The controls frame matches the game’s 4:3 picture.

Tap jump is the only setting. It defaults on and persists under `melee.tapJump`.
Seven checked PowerPC hooks disable stick-triggered jumps for the human while
preserving button jumps, upward aiming, CPU input and Nana’s behavior. The
hooks verify the USA 1.02 executable before writing anything.

The keyboard view isolates game input while the native menu and music continue.
W/S selects Tap jump or Back; P activates the selection. A turns tap jump off,
D turns it on. O or Esc closes the view; selecting Back and pressing P also
returns to character select. Tab, Enter and Space remain available for standard
keyboard accessibility. Closing clears held keys. The native
pause screen is independent and does not open this view. Native Gamepad API
input support remains in the runtime, but the UI currently represents keyboard
input; no physical controller was connected for verification.

Rendering of the keyboard is demand-driven and stops when the dialog closes.
It adds no animation loop or model rendering to live matches.
