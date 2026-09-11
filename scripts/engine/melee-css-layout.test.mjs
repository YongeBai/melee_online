import { test } from "node:test";
import assert from "node:assert/strict";
import { applyCssLayout } from "./melee-css-layout.js";
test("native CSS render callback moves P2 and hides unused cards without altering roster", () => {
  const heap = new Uint8Array(0x1800000),
    v = new DataView(heap.buffer),
    u = (a) => v.getUint32(a - 0x80000000),
    w = (a, n) => v.setUint32(a - 0x80000000, n);
  const root = 0x81000000,
    gobj = 0x81100000;
  w(0x804d6cc0, root);
  w(0x804d6cbc, gobj);
  w(gobj + 28, 0x80391070);
  w(root + 16, root + 0x100);
  for (let i = 1; i < 173; i++) {
    const p = root + i * 0x100;
    w(p + 12, root);
    w(p + 8, i < 172 ? p + 0x100 : 0);
    v.setFloat32(p + 56 - 0x80000000, i === 0x43 ? -7.6 : 0);
  }
  assert.equal(applyCssLayout(heap), true);
  const r = new Uint32Array(32);
  let pc = u(gobj + 28),
    eq = false,
    steps = 0;
  while (pc !== 0x80391070 && steps++ < 3000) {
    const n = u(pc),
      op = n >>> 26,
      t = (n >>> 21) & 31,
      a = (n >>> 16) & 31,
      b = (n >>> 11) & 31,
      imm = (n << 16) >> 16;
    if (op === 15) r[t] = (imm << 16) >>> 0;
    else if (op === 24) r[a] = r[t] | (n & 65535);
    else if (op === 14) r[t] = ((a ? r[a] : 0) + imm) >>> 0;
    else if (op === 13) {
      r[t] = (r[a] + imm) >>> 0;
      eq = r[t] === 0;
    } else if (op === 32) r[t] = u((r[a] + imm) >>> 0);
    else if (op === 36) w((r[a] + imm) >>> 0, r[t]);
    else if (op === 11) eq = r[a] === imm;
    else if (op === 31) {
      assert.equal((n >>> 1) & 1023, 444);
      r[a] = r[t] | r[b];
    } else if (op === 16) {
      const bo = (n >>> 21) & 31;
      if ((bo === 12 && eq) || (bo === 4 && !eq)) {
        pc = (pc + imm) >>> 0;
        continue;
      }
    } else if (op === 18) {
      let delta = n & 0x3fffffc;
      if (delta & 0x2000000) delta -= 0x4000000;
      pc = (pc + delta) >>> 0;
      continue;
    } else assert.fail(`Unexpected PPC ${n.toString(16)}`);
    pc += 4;
  }
  assert.equal(pc, 0x80391070);
  assert.ok(steps < 3000);
  assert.ok(Math.abs(v.getFloat32(root + 0x43 * 0x100 + 56 - 0x80000000) - 23.2) < 0.001);
  assert.ok(u(root + 0x49 * 0x100 + 20) & 16);
  assert.equal(u(root + 0x10 * 0x100 + 20), 0);
});
