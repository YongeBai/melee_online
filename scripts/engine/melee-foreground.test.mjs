import { test } from "node:test";
import assert from "node:assert/strict";
import { applyCssForeground } from "./melee-foreground.js";
function fixture() {
  const heap = new Uint8Array(0x1800000),
    v = new DataView(heap.buffer);
  const u = (p) => v.getUint32(p - 0x80000000),
    w = (p, n) => v.setUint32(p - 0x80000000, n);
  const objects = [0x81001000, 0x81002000];
  for (let i = 0; i < 2; i++) {
    w(0x804a0bc0 + i * 4, 0x81000000 + i * 0x100);
    w(0x81000000 + i * 0x100, objects[i]);
    w(objects[i] + 28, 0x80391070);
  }
  return { heap, v, u, w, objects };
}
test("foreground executes rectangle pass before both original hands and avoids Dolphin HLE hooks", () => {
  const { heap, u, objects } = fixture();
  assert.equal(applyCssForeground(heap), true);
  assert.equal(u(0x80001800), 0, "HBReload must never be overwritten or called");
  let pc = u(objects[0] + 28);
  assert.equal(pc, 0x80001840);
  assert.equal(u(pc), 0x2c040002);
  assert.equal(u(pc + 4), 0x4c820020, "non-final render passes return");
  const targets = [];
  for (; u(pc) !== 0x4e800020; pc += 4) {
    assert.ok(pc < 0x80001afc, "instructions cannot overlap data or no-op callback");
    const n = u(pc);
    if (n >>> 26 === 18) {
      let d = n & 0x3fffffc;
      if (d & 0x2000000) d -= 0x4000000;
      targets.push((pc + d) >>> 0);
    }
  }
  assert.deepEqual(targets, [
    0x80391a04,
    ...Array(3).fill(0x80391580),
    0x80361fc4,
    ...Array(6).fill(0x80391070),
  ]);
  assert.equal(u(u(objects[1] + 28)), 0x4e800020);
  const before = heap.slice();
  assert.equal(applyCssForeground(heap), true);
  assert.deepEqual(heap, before);
});
test("foreground rejects unexpected callbacks before mutating the game", () => {
  const { heap, w, objects } = fixture();
  w(objects[1] + 28, 0x80004560);
  const before = heap.slice();
  assert.throws(() => applyCssForeground(heap), /Unexpected/);
  assert.deepEqual(heap, before);
});

test("native foreground draws the guest hand only for a human opponent", () => {
  for (const kind of [0, 1, 3]) {
    const { heap, u, objects } = fixture();
    heap[0x480845] = kind;
    applyCssForeground(heap);
    let pc = u(objects[0] + 28) + 8, r12 = 0, r0 = 0, equal = false;
    let handPasses = 0, ready = false, steps = 0;
    while (u(pc) !== 0x4e800020) {
      assert.ok(++steps < 200, "foreground must terminate");
      const op = u(pc);
      if ((op >>> 16) === 0x3d80) r12 = (op & 0xffff) * 0x10000;
      else if ((op >>> 16) === 0x880c) r0 = heap[r12 + (op & 0xffff) - 0x80000000];
      else if (op === 0x2c000000) equal = r0 === 0;
      else if ((op >>> 16) === 0x4082 && !equal) { pc += op & 0xfffc; continue; }
      else if (op === 0x900c1b40) ready = true;
      else if (op >>> 26 === 18) {
        let d = op & 0x3fffffc;
        if (d & 0x2000000) d -= 0x4000000;
        if (((pc + d) >>> 0) === 0x80391070) handPasses++;
      }
      pc += 4;
    }
    assert.equal(handPasses, kind === 0 ? 6 : 3);
    assert.equal(ready, true, "CPU mode must still release the native frame gate");
  }
});
