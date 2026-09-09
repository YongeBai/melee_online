import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseHeader,
  parseFileTable,
  dolSize,
  readRange,
  inspectDisc,
  auditAssets,
} from '../lib/disc.ts';
import { roster, character, createMatch } from '../lib/roster.ts';
import {
  keyboardPad,
  gamepadPad,
  deadzone,
  KeyboardInput,
  describePad,
} from '../lib/input.ts';

function discHeader() {
  const b = new ArrayBuffer(0x440),
    v = new DataView(b);
  new Uint8Array(b).set(new TextEncoder().encode('GALE01'));
  v.setUint8(7, 2);
  v.setUint32(0x1c, 0xc2339f3d);
  v.setUint32(0x420, 0x500);
  v.setUint32(0x424, 0x700);
  v.setUint32(0x428, 40);
  return b;
}
function fst() {
  const b = new ArrayBuffer(80),
    v = new DataView(b);
  v.setUint32(0, 0x01000000);
  v.setUint32(8, 3);
  v.setUint32(12, 0x01000000);
  v.setUint32(16, 0);
  v.setUint32(20, 3);
  v.setUint32(24, 6);
  v.setUint32(28, 512);
  v.setUint32(32, 100);
  new Uint8Array(b).set(new TextEncoder().encode('audio\0test.hps\0'), 36);
  return b;
}
test('all 26 CharacterKind IDs are present and unique', () => {
  assert.equal(roster.length, 26);
  assert.deepEqual(
    roster.map((f) => f.id).sort((a, b) => a - b),
    Array.from({ length: 26 }, (_, i) => i),
  );
  assert.equal(character(19).name, 'Sheik');
  assert.equal(character(14).name, 'Ice Climbers');
  assert.throws(() => character(26));
});
test('every human/CPU combination preserves fixed match settings', () => {
  for (const p of roster)
    for (const c of roster) {
      const m = createMatch(p.id, c.id);
      assert.equal(m.players.length, 2);
      assert.equal(m.rules.timeLimitSeconds, 480);
      assert.equal(m.rules.stocks, 4);
      assert.equal(m.rules.stage, 'battlefield');
      assert.equal(m.rules.items, false);
      assert.equal(m.rules.teams, false);
      assert.equal(m.players[1].level, 9);
      assert.equal(m.players[0].characterId, p.id);
      assert.equal(m.players[1].characterId, c.id);
      if (p.id === c.id)
        assert.notEqual(m.players[0].costume, m.players[1].costume);
    }
});
test('invalid selections are rejected; returned rules cannot mutate future matches', () => {
  assert.throws(() => createMatch(99, 0));
  const m = createMatch(2, 20);
  Object.assign(m.rules, { stocks: 1 });
  assert.equal(createMatch(2, 20).rules.stocks, 4);
});
test('header checks real game ID, version, magic and range', () => {
  assert.equal(parseHeader(discHeader(), 4096).dolOffset, 0x500);
  for (const [offset, value] of [
    [0, 0],
    [7, 1],
    [0x1c, 0],
  ]) {
    const b = discHeader();
    new DataView(b).setUint8(offset, value);
    assert.throws(() => parseHeader(b, 4096));
  }
  assert.throws(() => parseHeader(discHeader(), 100));
});
test('FST reads nested paths with bounded file ranges', () => {
  assert.deepEqual(parseFileTable(fst(), 1024), [
    { path: 'audio/test.hps', offset: 512, size: 100 },
  ]);
  assert.throws(() => parseFileTable(fst(), 550));
});
test('FST rejects traversal, unknown types, bad parents, invalid offsets and oversized entry counts', () => {
  for (const mutate of [
    (b: ArrayBuffer) => new Uint8Array(b).set([46, 46, 0], 36),
    (b: ArrayBuffer) => new DataView(b).setUint8(24, 2),
    (b: ArrayBuffer) => new DataView(b).setUint32(16, 9),
    (b: ArrayBuffer) => new DataView(b).setUint32(24, 400),
    (b: ArrayBuffer) => new DataView(b).setUint32(8, 100001),
    (b: ArrayBuffer) => new DataView(b).setUint32(20, 1),
  ]) {
    const b = fst();
    mutate(b);
    assert.throws(() => parseFileTable(b, 1024));
  }
});
test('FST rejects duplicate paths and unterminated filenames', () => {
  const b = fst();
  new DataView(b).setUint32(12, 6);
  new DataView(b).setUint32(16, 512);
  new DataView(b).setUint32(20, 100);
  assert.throws(() => parseFileTable(b, 1024));
  const u = fst();
  new Uint8Array(u).fill(65, 36);
  assert.throws(() => parseFileTable(u, 1024));
});
test('DOL range is derived from sections and cannot exceed MEM1', () => {
  const b = new ArrayBuffer(256),
    v = new DataView(b);
  v.setUint32(0, 256);
  v.setUint32(0x90, 512);
  assert.equal(dolSize(b), 768);
  v.setUint32(0, 0xffff0000);
  assert.throws(() => dolSize(b));
});
test('readRange performs only requested reads and rejects huge allocations', async () => {
  let requested = 0;
  const source = {
    size: 2e9,
    slice: (a: number, b: number) => ({
      arrayBuffer: async () => {
        requested = b - a;
        return new ArrayBuffer(requested);
      },
    }),
  };
  await readRange(source, 1000, 256);
  assert.equal(requested, 256);
  await assert.rejects(readRange(source, 0, 70 * 1024 * 1024));
  assert.equal(requested, 256);
  await assert.rejects(readRange(source, 2e9, 1));
});
test('synthetic disc cannot pass executable hash verification', async () => {
  const data = new Uint8Array(4096);
  data.set(new Uint8Array(discHeader()));
  const v = new DataView(data.buffer);
  v.setUint32(0x700, 0x01000000);
  v.setUint32(0x708, 1);
  v.setUint32(0x500, 256);
  v.setUint32(0x590, 32);
  await assert.rejects(
    inspectDisc(new Blob([data])),
    /executable does not match/,
  );
});
test('asset audit reports omissions; zero-byte archives do not satisfy it', () => {
  assert.ok(auditAssets([]).missing.includes('GrNBa.dat'));
  assert.ok(
    auditAssets([{ path: 'GrNBa.dat', offset: 0, size: 0 }]).missing.includes(
      'GrNBa.dat',
    ),
  );
  assert.ok(
    !auditAssets([{ path: 'GrNBa.dat', offset: 0, size: 32 }]).missing.includes(
      'GrNBa.dat',
    ),
  );
});
test('keyboard handles opposing directions, C-stick, shields and cleared keys', () => {
  const keys = new Set(['KeyA', 'KeyD', 'KeyK', 'KeyP', 'KeyI']);
  const p = keyboardPad(keys);
  assert.equal(p.stickX, 0);
  assert.equal(p.cY, 1);
  assert.equal(p.triggerL, 1);
  assert.ok(p.buttons.includes('A'));
  keys.clear();
  assert.deepEqual(keyboardPad(keys).buttons, []);
});
test('gamepad deadzones and unsupported mappings do not inject arbitrary inputs', () => {
  assert.equal(deadzone(0.1), 0);
  assert.equal(deadzone(1), 1);
  assert.equal(deadzone(NaN), 0);
  const p = gamepadPad({ mapping: '', axes: [1, 1, 1, 1], buttons: [] });
  assert.equal(p.stickX, 0);
  const standard = gamepadPad({
    mapping: 'standard',
    axes: [1, -1, -1, 1],
    buttons: [],
  });
  assert.equal(standard.stickY, 1);
  assert.equal(standard.cY, -1);
});

test('new keyboard layout maps every requested action and the smash cluster', () => {
  for (const [code, button] of [
    ['KeyP', 'A'],
    ['KeyO', 'B'],
    ['Space', 'X'],
    ['KeyI', 'L'],
    ['KeyU', 'Z'],
  ])
    assert.ok(keyboardPad(new Set([code])).buttons.includes(button));
  for (const [code, axis, value] of [
    ['KeyW', 'stickY', 1],
    ['KeyA', 'stickX', -1],
    ['KeyS', 'stickY', -1],
    ['KeyD', 'stickX', 1],
    ['KeyK', 'cY', 1],
    ['KeyM', 'cX', -1],
    ['Comma', 'cY', -1],
    ['Period', 'cX', 1],
  ] as const)
    assert.equal(keyboardPad(new Set([code]))[axis], value);
  assert.deepEqual(keyboardPad(new Set(['KeyX', 'KeyZ', 'Enter'])).buttons, []);
});
test('digital diagonals are bounded and Shift gives a 50% analog modifier', () => {
  const p = keyboardPad(new Set(['KeyW', 'KeyD']));
  assert.ok(Math.hypot(p.stickX, p.stickY) <= 1);
  assert.equal(keyboardPad(new Set(['KeyD', 'ShiftLeft'])).stickX, 0.5);
  const modified = keyboardPad(new Set(['KeyW', 'KeyD', 'ShiftLeft']));
  assert.ok(
    Math.abs(Math.hypot(modified.stickX, modified.stickY) - 0.5) < 1e-10,
  );
});
test('Escape toggles pause once per press, clears held inputs and resumes neutral', () => {
  const input = new KeyboardInput();
  input.setKey('KeyD', true);
  assert.equal(input.sample().stickX, 1);
  assert.equal(input.setKey('Escape', true), true);
  assert.equal(input.paused, true);
  assert.equal(input.sample().stickX, 0);
  input.setKey('Escape', true, true);
  input.setKey('Escape', true);
  assert.equal(input.paused, true);
  input.setKey('KeyP', true);
  assert.deepEqual(input.sample().buttons, []);
  input.setKey('Escape', false);
  input.setKey('Escape', true);
  assert.equal(input.paused, false);
  assert.equal(input.sample().stickX, 0);
  assert.deepEqual(input.sample().buttons, []);
  input.setKey('Escape', false);
  input.setKey('KeyP', true);
  assert.deepEqual(input.sample().buttons, ['A']);
  input.clear();
  assert.deepEqual(input.sample().buttons, []);
});
test('tap-jump preference changes jump intent without removing upward aiming', () => {
  const up = keyboardPad(new Set(['KeyW']));
  assert.equal(up.stickY, 1);
  assert.match(describePad(up, { tapJump: true }), /Tap jump/);
  assert.equal(describePad(up, { tapJump: false }), 'Move up');
  assert.equal(
    describePad(keyboardPad(new Set(['Space'])), { tapJump: false }),
    'Jump',
  );
  assert.equal(createMatch(2, 20, { tapJump: false }).controls.tapJump, false);
  assert.equal(createMatch(2, 20).controls.tapJump, true);
});
