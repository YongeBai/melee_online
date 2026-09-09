import test from "node:test";
import assert from "node:assert/strict";
import { controlMelee, inspectMelee } from "./melee-memory.js";

test("native CSS lock restores fixed match rules and only one human and CPU", () => {
  const heap = new Uint8Array(0x1800000),
    view = new DataView(heap.buffer);
  const at = (a) => a - 0x80000000,
    b = (a, n) => view.setUint8(at(a), n),
    w = (a, n) => view.setUint32(at(a), n);
  heap.set(new TextEncoder().encode("GALE01"));
  heap.set(
    [
      124, 8, 2, 166, 60, 96, 128, 76, 144, 1, 0, 4, 148, 33, 255, 40, 219, 225, 0, 208, 219, 193,
      0, 200, 219, 161, 0, 192, 190, 225, 0, 156,
    ],
    0x37750c,
  );
  const main = 0x8045a6c0,
    css = 0x804807b0;
  w(0x804d3ee0, main);
  w(0x804d6720, 0x80400000);
  b(0x80400000, 8);
  b(0x80479d30, 2);
  b(0x80479d33, 0);
  heap.fill(127, at(css + 16), at(css + 16 + 0x60 + 6 * 0x24));
  const pauses = [];
  const module = { HEAPU8: heap },
    api = { setCorePaused: (value) => pauses.push(value) };
  controlMelee(module, api, "lockCss");
  assert.deepEqual(pauses, [1, 0]);
  assert.equal(view.getUint16(at(css + 30)), 31);
  assert.equal(heap[at(css + 24)], 0);
  assert.equal(heap[at(main + 0x1850 + 2)], 1);
  assert.equal(heap[at(main + 0x1850 + 4)], 4);
  assert.equal(heap[at(main + 0x1850 + 8)], 8);
  assert.equal(view.getInt8(at(main + 0x1cb0)), -1);
  assert.equal(view.getBigUint64(at(main + 0x1cb8)), 0n);
  for (let i = 0; i < 6; i++) {
    const p = at(css + 16 + 0x60 + i * 0x24);
    assert.equal(heap[p + 1], i === 0 ? 0 : i === 1 ? 1 : 3);
    assert.equal(heap[p + 2], 4);
    assert.equal(heap[p], 127, "chosen character stays unchanged");
  }
  assert.equal(heap[at(css + 16 + 0x60 + 0x24 + 15)], 9);
  assert.equal(heap[at(0x80479d35)], 3, "native router skips stage selection");
  b(0x80479d33, 2);
  assert.throws(() => controlMelee(module, api, "lockCss"), /Not at VS/);
  assert.deepEqual(pauses.slice(-2), [1, 0], "core resumes even on rejected changes");
  b(0x80479d33, 0);
  controlMelee(module, api, "select", { player: 19, cpu: 19 });
  assert.equal(heap[at(css + 16 + 0x60)], 18, "Sheik uses Zelda's native CSS tile");
  assert.equal(heap[at(css + 16 + 0x60 + 0x24)], 18);
  controlMelee(module, api, "start", { startingSheik: [true, true] });
  assert.equal(heap[at(css + 16 + 0x60)], 19, "human starting form changes at Start");
  assert.equal(heap[at(css + 16 + 0x60 + 0x24)], 19, "CPU starting form changes at Start");
  w(0x80479d58, 123);
  w(0x80479d5c, 45);
  assert.equal(inspectMelee(module).sceneFrame, 123);
  assert.equal(inspectMelee(module).renderFrame, 45);
});
