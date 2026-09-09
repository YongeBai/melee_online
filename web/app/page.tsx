'use client';
import { useEffect, useState } from 'react';
import { ControlTest } from '@/components/control-test';
import { ControllerModel } from '@/components/controller-model';
import { Switch } from '@/components/ui/switch';
import { keyboardLayout } from '@/lib/input';
export default function Home() {
  const [tapJump, setTapJump] = useState(true);
  useEffect(() => {
    const saved = localStorage.getItem('melee.tapJump');
    if (saved !== null) setTapJump(saved === 'true');
  }, []);
  const updateTapJump = (value: boolean) => {
    setTapJump(value);
    localStorage.setItem('melee.tapJump', String(value));
  };
  return (
    <main className="console-surround">
      <div className="game-screen">
        <section className="controls-screen" aria-label="Controls">
          <header className="menu-heading">
            <h1>CONTROLS</h1>
            <span>PLAYER 1</span>
          </header>
          <div className="controls-body">
            <div className="controls-layout">
              <ControllerModel />
              <div className="bindings">
                <h2>KEYBOARD CONFIGURATION</h2>
                {keyboardLayout.map(([key, action]) => (
                  <div className="binding" key={key}>
                    <kbd>{key}</kbd>
                    <span>{action}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="tap-jump-setting">
              <div>
                <label htmlFor="tap-jump">TAP JUMP</label>
                <p>
                  W / stick up jumps when on. Upward aiming stays available when
                  off.
                </p>
              </div>
              <Switch
                id="tap-jump"
                checked={tapJump}
                onCheckedChange={updateTapJump}
                aria-label="Tap jump"
              />
            </div>
            <div className="tap-jump-setting">
              <div>
                <span>GRAPHICS</span>
                <p>Original detail · original 4:3 picture</p>
              </div>
              <strong>720p · 60 FPS</strong>
            </div>
            <ControlTest options={{ tapJump }} />
          </div>
          <footer className="controls-footer">
            <span>Keyboard · Standard gamepad</span>
            <button
              className="menu-button"
              onClick={() => {
                window.location.href = '/play/';
              }}
            >
              Character select ▶
            </button>
          </footer>
        </section>
      </div>
    </main>
  );
}
