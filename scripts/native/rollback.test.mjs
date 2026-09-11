import { test } from "node:test";
import assert from "node:assert/strict";
import { RollbackSession, neutralPad, sanitizePad } from "./rollback.mjs";
function engine() {
  let state = { x: 0, v: 0, seed: 43 };
  const snapshots = new Map();
  return {
    get state() {
      return { ...state };
    },
    restore: async (slot) => {
      state = { ...snapshots.get(slot) };
    },
    suppress: async () => {},
    advance: async (slot, pads, save) => {
      if (save) snapshots.set(slot, { ...state });
      state.v += pads[0].stickX - 128 - (pads[1].stickX - 128);
      state.x += state.v;
      state.seed = (Math.imul(state.seed, 1664525) + 1013904223) | 0;
      return { ...state };
    },
  };
}
for (const delay of [1, 3, 5, 9, 12])
  test(`late inputs rewind and match known-input reference at ${delay} frames`, async () => {
    const a = engine(),
      b = engine(),
      ref = new RollbackSession(a),
      net = new RollbackSession(b);
    const events = Array.from({ length: 9 }, (_, i) => ({
      f: i * 7,
      port: i % 2,
      pad: { ...neutralPad(), stickX: Math.floor(i / 2) % 2 ? 224 : 32 },
    }));
    for (let f = 0; f < 100; f++) {
      for (const e of events) if (e.f === f) ref.input(e.port, e.f, e.pad);
      for (const e of events) if (e.f + delay === f) net.input(e.port, e.f, e.pad);
      await ref.advance();
      await net.advance();
    }
    assert.deepEqual(a.state, b.state);
    assert.ok(net.stats.rollbacks >= 8);
    assert.ok(net.stats.resimulatedFrames >= delay * 8);
  });
test("replay retains its restored checkpoint and refreshes later checkpoints across ring reuse", async () => {
  const a = engine(), b = engine();
  const reference = new RollbackSession(a), net = new RollbackSession(b);
  let restoring = false, first = false;
  const restore = b.restore, advance = b.advance;
  b.restore = async (slot) => { restoring = first = true; await restore(slot); };
  b.advance = async (slot, pads, save) => {
    if (restoring && first) {
      assert.equal(save, false, "Restored checkpoint must not be copied again");
      first = false;
    }
    return advance(slot, pads, save);
  };
  // Alternate odd/even starting frames, both seats, and the oldest allowed
  // input. This exercises all checkpoint alignments after repeated ring wraps.
  const events = Array.from({ length: 30 }, (_, i) => ({
    f: 3 + i * 13, port: i % 2,
    pad: { ...neutralPad(), stickX: i % 3 ? 224 : 32 },
  }));
  for (let f = 0; f < 420; f++) {
    for (const e of events) {
      if (e.f === f) reference.input(e.port, e.f, e.pad);
      if (e.f + 12 === f) net.input(e.port, e.f, e.pad);
    }
    await reference.advance();
    await net.advance();
  }
  assert.deepEqual(b.state, a.state);
  assert.equal(net.stats.maxDepth, 15);
});
test("reject invalid seats, unsafe inputs and out-of-window frames", async () => {
  const r = new RollbackSession(engine());
  for (let i = 0; i < 20; i++) await r.advance();
  assert.equal(r.input(0, 0, {}), false);
  assert.throws(() => r.input(2, 20, {}));
  assert.throws(() => r.input(0, 99, {}));
  assert.throws(() => sanitizePad({ mask: Infinity }));
});
