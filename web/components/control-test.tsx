'use client';
import { useEffect, useState } from 'react';
import {
  KeyboardInput,
  describePad,
  gamepadPad,
  neutralPad,
  keyboardButtons,
  keyboardCodes,
  type Pad,
  type ControlOptions,
} from '@/lib/input';
export function ControlTest({ options }: { options: ControlOptions }) {
  const [pad, setPad] = useState<Pad>(neutralPad),
    [device, setDevice] = useState('Keyboard ready'),
    [paused, setPaused] = useState(false),
    [lastInput, setLastInput] = useState('Press a key to test');
  useEffect(() => {
    const input = new KeyboardInput();
    let frame = 0,
      previous = '',
      lastUpdate = 0;
    setPaused(false);
    setPad(neutralPad());
    setLastInput('Press a key to test');
    const change = (event: KeyboardEvent, pressed: boolean) => {
      // Key releases always clear state, even if focus moved to a form control.
      if (
        pressed &&
        event.code !== 'Escape' &&
        ((event.target as HTMLElement)?.closest(
          'input,textarea,select,button,a,[role="switch"]',
        ) ||
          event.ctrlKey ||
          event.metaKey ||
          event.altKey)
      )
        return;
      if (!keyboardCodes.has(event.code)) return;
      event.preventDefault();
      const pauseChanged = input.setKey(event.code, pressed, event.repeat);
      setPad(input.sample());
      if (pauseChanged) {
        setPaused(input.paused);
        setLastInput(
          input.paused ? 'Input preview paused' : 'Input preview resumed',
        );
      } else if (pressed && !input.paused) {
        const description = describePad(input.sample(), options);
        if (description) setLastInput(description);
      }
    };
    const down = (e: KeyboardEvent) => change(e, true),
      up = (e: KeyboardEvent) => change(e, false);
    const clear = () => {
      input.clear();
      previous = '';
      setPad(neutralPad());
    };
    const poll = (now: number) => {
      if (now - lastUpdate >= 80 && !document.hidden) {
        lastUpdate = now;
        const pads = Array.from(navigator.getGamepads?.() ?? []).filter(
          (p): p is Gamepad => !!p?.connected,
        );
        const gamepad = pads.find((p) => p.mapping === 'standard');
        const next = input.paused
          ? neutralPad()
          : gamepad && input.keys.size === 0
            ? gamepadPad(gamepad)
            : input.sample();
        const name = gamepad
          ? 'Gamepad connected · standard layout'
          : pads.length
            ? 'Gamepad needs an OS standard mapping · use keyboard'
            : 'Keyboard ready';
        const signature = JSON.stringify([next, name]);
        if (signature !== previous) {
          previous = signature;
          setPad(next);
          setDevice(name);
        }
      }
      frame = requestAnimationFrame(poll);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', clear);
    document.addEventListener('visibilitychange', clear);
    frame = requestAnimationFrame(poll);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', clear);
      document.removeEventListener('visibilitychange', clear);
    };
  }, [options.tapJump]);
  return (
    <div
      className={`input-test ${paused ? 'preview-paused' : ''}`}
      tabIndex={0}
      role="group"
      aria-label="Keyboard input tester"
    >
      <div className="test-heading">
        <strong>Try your controls {paused ? '· PAUSED' : ''}</strong>
        <span>{device}</span>
      </div>
      <div className="pad-buttons">
        {[...new Set(Object.values(keyboardButtons))].map((name) => (
          <span
            key={name}
            className={pad.buttons.includes(name) ? 'pressed' : ''}
          >
            {name}
          </span>
        ))}
      </div>
      <div className="axis-readouts">
        <span>
          Stick{' '}
          <output>
            {pad.stickX.toFixed(2)}, {pad.stickY.toFixed(2)}
          </output>
        </span>
        <span>
          C-stick{' '}
          <output>
            {pad.cX.toFixed(2)}, {pad.cY.toFixed(2)}
          </output>
        </span>
      </div>
      <p className="last-input" role="status">
        {lastInput}
      </p>
      <p>Click here to test. Esc pauses / resumes this input preview.</p>
      <p>
        Gamepad: south → A, west → B, east/north → jump, triggers → shield,
        right shoulder → grab.
      </p>
    </div>
  );
}
