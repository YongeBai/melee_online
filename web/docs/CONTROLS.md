# Browser controls

| Key | GameCube input / action |
| --- | --- |
| W A S D | Main analog stick: up, left, down, right |
| P | A / attack |
| O | B / special |
| Space | X / jump |
| I | L / shield |
| U | Z / grab |
| K | C-stick up |
| M | C-stick left |
| Comma | C-stick down |
| Period | C-stick right |
| Left Shift + WASD | 50% analog magnitude for walking/tilts |
| Enter | Start the match from character select |
| Escape | Host pause/unpause on the press edge |

The C-stick keys form an inverted T: K above M/comma/period, below the
U/I/O/P action row. Opposing directions cancel, and main-stick diagonals are
normalized to the unit circle. Shift is a simple analog modifier, not an exact
implementation of B0XX-specific modifiers, input timing, or tournament rules.

Hax's controller was the B0XX; Smash Box is a separate product. The inspiration
here is a dedicated C-stick cluster and analog modifier separate from the
attack/jump inputs. Primary manufacturer resources:
https://b0xx.com/pages/resources and https://b0xx.com/pages/b0xx-button-holds.
The manufacturer's linked quickstart manual was also consulted.

## Native game integration

Tap jump defaults on and is saved under `melee.tapJump`. Four checked PowerPC
hooks in the original jump routines disable stick-triggered jumps for the human
fighter while retaining the normal button checks, jump limits, and all upward
analog input. The CPU and Nana partner retain their normal jump handling.
The hooks are version-specific and reject unexpected original instructions.

Esc pauses the actual Dolphin core and audio, clears held inputs, and resumes
without repeating on key autorepeat. Enter sends GameCube Start from character
select after enforcing the match rules. P remains held across Start, supporting
the original Zelda hold-A starting-form behavior. The pause menu also offers
explicit Zelda/Sheik starting-form choices for the human and CPU. Zelda stays
the shared tile in the original character-select screen.

The controls screen's input preview is separate from the running game's pad.
Move the native character-select hand with WASD; press P to pick up/place a
human or CPU selection token. Use O for the native menu back action. The
local integration returns to VS character select if the native menu is exited.

## Controller model

The malformed custom diagram was replaced by the creator-enabled Sketchfab 3D
embed for **Gamecube Controller** by **CoryRichards**:
https://sketchfab.com/3d-models/gamecube-controller-21983501bac64993ac09cdc7936ffdf2

The source reports CC Attribution 4.0:
https://creativecommons.org/licenses/by/4.0/

The model is not downloaded or rehosted. The official viewer is interactive,
requires an internet connection and WebGL, and is removed when leaving the
controls screen. Attribution remains visible. Clicking the viewer focuses its
iframe; click the input tester to send keyboard input to the page again.
