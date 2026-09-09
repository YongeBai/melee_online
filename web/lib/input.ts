export type Pad = {
  buttons: string[];
  stickX: number;
  stickY: number;
  cX: number;
  cY: number;
  triggerL: number;
  triggerR: number;
};
export type ControlOptions = { tapJump: boolean };
export const defaultControls: Readonly<ControlOptions> = Object.freeze({
  tapJump: true,
});
export const keyboardButtons: Record<string, string> = {
  KeyP: 'A',
  KeyO: 'B',
  Space: 'X',
  KeyI: 'L',
  KeyU: 'Z',
};
export const keyboardLayout = [
  ['W A S D', 'Move / aim'],
  ['P', 'A · Attack'],
  ['O', 'B · Special'],
  ['Space', 'X · Jump'],
  ['I', 'L · Shield'],
  ['U', 'Z · Grab'],
  ['K ↑  M ←  , ↓  . →', 'C-stick · Smash'],
  ['Left Shift + WASD', 'Walk / tilt'],
  ['Enter', 'Start match'],
  ['Esc', 'Pause / unpause'],
] as const;
export const keyboardCodes = new Set([
  ...Object.keys(keyboardButtons),
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'KeyK',
  'KeyM',
  'Comma',
  'Period',
  'ShiftLeft',
  'Escape',
]);
export function neutralPad(): Pad {
  return {
    buttons: [],
    stickX: 0,
    stickY: 0,
    cX: 0,
    cY: 0,
    triggerL: 0,
    triggerR: 0,
  };
}
export function keyboardPad(keys: Set<string>): Pad {
  const x = Number(keys.has('KeyD')) - Number(keys.has('KeyA'));
  const y = Number(keys.has('KeyW')) - Number(keys.has('KeyS'));
  // Digital diagonals stay inside the unit circle. Shift is a simple 50% analog
  // modifier, not a claim of B0XX's character-specific modifiers/nerfs.
  const magnitude =
    (keys.has('ShiftLeft') ? 0.5 : 1) / (x && y ? Math.SQRT2 : 1);
  return {
    buttons: Object.entries(keyboardButtons)
      .filter(([key]) => keys.has(key))
      .map(([, name]) => name),
    stickX: x * magnitude,
    stickY: y * magnitude,
    cX: Number(keys.has('Period')) - Number(keys.has('KeyM')),
    cY: Number(keys.has('KeyK')) - Number(keys.has('Comma')),
    triggerL: Number(keys.has('KeyI')),
    triggerR: 0,
  };
}
/** Escape is a host pause toggle, never a repeating GameCube START press. */
export class KeyboardInput {
  keys = new Set<string>();
  paused = false;
  private escapeHeld = false;
  setKey(code: string, pressed: boolean, repeat = false) {
    if (code === 'Escape') {
      if (pressed && !repeat && !this.escapeHeld) {
        this.escapeHeld = true;
        this.paused = !this.paused;
        this.keys.clear();
        return true;
      }
      if (!pressed) this.escapeHeld = false;
      return false;
    }
    if (!pressed) this.keys.delete(code);
    else if (!this.paused && keyboardCodes.has(code)) this.keys.add(code);
    return false;
  }
  clear() {
    this.keys.clear();
    this.escapeHeld = false;
  }
  sample() {
    return this.paused ? neutralPad() : keyboardPad(this.keys);
  }
}
export function describePad(pad: Pad, options: ControlOptions) {
  const actions: string[] = [];
  if (pad.stickX) actions.push(pad.stickX < 0 ? 'Move left' : 'Move right');
  if (pad.stickY) actions.push(pad.stickY < 0 ? 'Move down' : 'Move up');
  if (options.tapJump && pad.stickY > 0.7) actions.push('Tap jump');
  if (pad.buttons.includes('A')) actions.push('Attack');
  if (pad.buttons.includes('B')) actions.push('Special');
  if (pad.buttons.includes('X') || pad.buttons.includes('Y'))
    actions.push('Jump');
  if (pad.buttons.includes('L') || pad.buttons.includes('R'))
    actions.push('Shield');
  if (pad.buttons.includes('Z')) actions.push('Grab');
  if (pad.cX) actions.push(pad.cX < 0 ? 'Smash left' : 'Smash right');
  if (pad.cY) actions.push(pad.cY < 0 ? 'Smash down' : 'Smash up');
  return actions.join(' + ');
}
export function deadzone(value: number, zone = 0.18) {
  return Number.isFinite(value) && Math.abs(value) > zone
    ? Math.sign(value) * Math.min(1, (Math.abs(value) - zone) / (1 - zone))
    : 0;
}
export function gamepadPad(
  gamepad: Pick<Gamepad, 'mapping' | 'axes' | 'buttons'>,
): Pad {
  if (gamepad.mapping !== 'standard') return neutralPad();
  const names: Record<number, string> = {
    0: 'A',
    2: 'B',
    1: 'X',
    3: 'Y',
    5: 'Z',
    6: 'L',
    7: 'R',
    9: 'START',
    12: 'UP',
    13: 'DOWN',
    14: 'LEFT',
    15: 'RIGHT',
  };
  return {
    buttons: Object.entries(names)
      .filter(([i]) => gamepad.buttons[Number(i)]?.pressed)
      .map(([, name]) => name),
    stickX: deadzone(gamepad.axes[0] ?? 0),
    stickY: -deadzone(gamepad.axes[1] ?? 0),
    cX: deadzone(gamepad.axes[2] ?? 0),
    cY: -deadzone(gamepad.axes[3] ?? 0),
    triggerL: gamepad.buttons[6]?.value ?? 0,
    triggerR: gamepad.buttons[7]?.value ?? 0,
  };
}
