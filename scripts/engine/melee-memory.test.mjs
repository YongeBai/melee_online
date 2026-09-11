import test from "node:test";
import assert from "node:assert/strict";
import { controlMelee, inspectMelee } from "./melee-memory.js";

test("camera diagnostics read native transforms without changing game memory", () => {
  const heap = new Uint8Array(0x1800000), view = new DataView(heap.buffer);
  heap.set(new TextEncoder().encode("GALE01"));
  heap.set([124,8,2,166,60,96,128,76,144,1,0,4,148,33,255,40,219,225,0,208,219,193,0,200,219,161,0,192,190,225,0,156], 0x37750c);
  view.setUint32(0x4d6720, 0x80400000);
  heap[0x400000] = 2;
  heap[0x479d30] = 2;
  heap[0x479d33] = 2;
  const camera = 0x452c68;
  view.setUint32(camera + 4, 0);
  for (const [offset, values] of [[0x14,[1,10,0]], [0x20,[2,11,0]],
    [0x2c,[3,30,170]], [0x38,[4,31,171]]])
    values.forEach((v, i) => view.setFloat32(camera + offset + i * 4, v));
  view.setFloat32(camera + 0x44, 30);
  const before = heap.slice();
  assert.deepEqual(inspectMelee({HEAPU8: heap}).camera, {
    mode: 0, interest: [1,10,0], targetInterest: [2,11,0], position: [3,30,170],
    targetPosition: [4,31,171], fov: 30, pitchOffset: 0, yawOffset: 0,
  });
  assert.deepEqual(heap, before);
  heap[0x479d33] = 0;
  assert.equal(inspectMelee({HEAPU8: heap}).camera, undefined);
});

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
  assert.equal(view.getUint16(at(css + 30)), 0x7f7f, "stage is chosen by native stage select");
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
  assert.equal(heap[at(0x80479d35)], 2, "native router enters stage selection");
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
  controlMelee(module, api, "lockCss", { online: true });
  for (let i = 0; i < 2; i++) {
    const p = at(css + 16 + 0x60 + i * 0x24);
    assert.equal(heap[p + 1], 0, "both online players are human");
    assert.equal(heap[p + 4], 0, "native player identity follows its own slot");
    assert.equal(heap[p + 7], i, "owner uses P1 controller/color and guest P2");
  }
  controlMelee(module, api, 'lockCss', {online:true,cpu:true});
  assert.equal(heap[at(0x80480820+1)],0);
  assert.equal(heap[at(0x80480820+0x24+1)],1,'Room CPU is a native CPU');
  assert.equal(heap[at(0x80480820+0x24+15)],9);
  const chars=[heap[at(0x80480820)],heap[at(0x80480820+0x24)]];
  controlMelee(module,api,'opponent',{cpu:false});
  assert.equal(heap[at(0x80480820+0x24+1)],0);
  assert.equal(heap[at(0x80479d35)],1,'Changing opponent reloads CSS');
  assert.deepEqual([heap[at(0x80480820)],heap[at(0x80480820+0x24)]],chars);
  w(0x80479d58, 123);
  w(0x80479d5c, 45);
  assert.equal(inspectMelee(module).sceneFrame, 123);
  assert.equal(inspectMelee(module).renderFrame, 45);
  const cursor = 0x81000100;
  w(0x804a0bc0, cursor);
  view.setFloat32(at(cursor + 0xc), -20);
  view.setFloat32(at(cursor + 0x10), -21.5);
  assert.deepEqual(inspectMelee(module).cssCursor, { x: -20, y: -21.5 });
  b(0x80479d33, 2);
  assert.equal(
    inspectMelee(module).cssCursor,
    undefined,
    "stale CSS pointers are ignored outside CSS",
  );
  b(0x80479d33, 0);
  w(0x804a0bc0, 0x817ffffc);
  assert.equal(inspectMelee(module).cssCursor, undefined, "cursor structure must fit within MEM1");
});
