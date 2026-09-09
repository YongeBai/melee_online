import { installTapJumpHooks, TAP_JUMP_FLAG } from "./melee-tap-jump.js";
// GALE01 revision 1.02. MEM1 is located by matching original executable bytes.
const signature = [
  124, 8, 2, 166, 60, 96, 128, 76, 144, 1, 0, 4, 148, 33, 255, 40, 219, 225, 0, 208, 219, 193, 0,
  200, 219, 161, 0, 192, 190, 225, 0, 156,
];
let mem1;
let startingSheik = [false, false];
export function inspectMelee(module) {
  const heap = module.HEAPU8;
  if (mem1 === undefined) {
    outer: for (let p = 0; p < heap.length - signature.length; p += 4) {
      if (heap[p] !== signature[0] || heap[p + 1] !== signature[1]) continue;
      for (let i = 2; i < signature.length; i++) if (heap[p + i] !== signature[i]) continue outer;
      const base = p - 0x37750c;
      if (base < 0 || base + 0x1800000 > heap.length) continue;
      if (String.fromCharCode(...heap.subarray(base, base + 6)) !== "GALE01") continue;
      mem1 = base;
      break;
    }
  }
  if (mem1 === undefined) throw new Error("Melee MEM1 signature not found");
  const read = (address, length) =>
    Array.from(heap.subarray(mem1 + address - 0x80000000, mem1 + address - 0x80000000 + length));
  const view = new DataView(heap.buffer);
  const u32 = (a) => view.getUint32(mem1 + a - 0x80000000);
  const ptr = u32(0x804d6720);
  const major = read(0x80479d30, 1)[0];
  const minor = read(0x80479d33, 1)[0];
  const sceneKind = ptr >= 0x80000000 && ptr < 0x81800000 ? read(ptr, 1)[0] : -1;
  const valid = (p) => p >= 0x80003100 && p < 0x81800000;
  const fighters = [];
  let match;
  if (major === 2 && minor === 2 && sceneKind === 2) {
    const rules = 0x8046b6a0 + 0x24c8;
    match = {
      elapsed: u32(0x8046b6a0 + 0x24),
      timeRemaining: u32(0x8046b6a0 + 0x28),
      stage: view.getUint16(mem1 + rules + 14 - 0x80000000),
      timeLimit: u32(rules + 16),
      items: view.getInt8(mem1 + rules + 11 - 0x80000000),
      teams: read(rules + 8, 1)[0],
      cpuLevel: read(0x80480530 + 0x60 + 0x24 + 15, 1)[0],
    };
    for (let i = 0; i < 2; i++) {
      const slot = 0x80453080 + i * 0xe90,
        index = read(slot + 0xc, 1)[0];
      const gobj = index < 2 ? u32(slot + 0xb0 + index * 4) : 0;
      const fp = valid(gobj) ? u32(gobj + 0x2c) : 0;
      if (valid(fp))
        fighters.push({
          port: i,
          playerId: read(fp + 0xc, 1)[0],
          character: u32(slot + 4),
          stocks: read(slot + 0x8e, 1)[0],
          action: u32(fp + 0x10),
          x: view.getFloat32(mem1 + fp + 0xb0 - 0x80000000),
          y: view.getFloat32(mem1 + fp + 0xb4 - 0x80000000),
          air: u32(fp + 0xe0),
        });
    }
  }
  return {
    mem1,
    major,
    minor,
    mainPointer: u32(0x804d3ee0).toString(16),
    sceneKind,
    sceneFrame: u32(0x80479d58),
    renderFrame: u32(0x80479d5c),
    tapJump: read(TAP_JUMP_FLAG, 1)[0] === 0,
    tapJumpHooks: [
      0x800cae88, 0x800cb818, 0x800cafb0, 0x800d7420, 0x800caf04, 0x800cb060, 0x800cb988,
    ].map((a) => u32(a).toString(16)),
    fighters,
    match,
    master: read(0x804c1fac, 68),
    copy: read(0x804c20bc, 68),
    game: read(0x804c21cc, 68),
    scene: read(0x80479d58, 64),
    scenePointer: read(0x804d6720, 4),
  };
}

// Addresses use GALE01 symbols, verified against the supplied DOL. In particular
// GetSaveData returns main+0x1868, despite the current decomp header's 0x1898
// comment. Rules/scene changes only affect data; tap jump uses checked PPC hooks.
export function controlMelee(module, api, action, options = {}) {
  const state = inspectMelee(module);
  const heap = module.HEAPU8,
    v = new DataView(heap.buffer);
  const at = (a) => {
    if (a < 0x80000000 || a >= 0x81800000)
      throw new Error("Invalid Melee address " + a.toString(16));
    return mem1 + a - 0x80000000;
  };
  const u32 = (a) => v.getUint32(at(a));
  const b = (a, n) => v.setUint8(at(a), n);
  const h = (a, n) => v.setUint16(at(a), n);
  const w = (a, n) => v.setUint32(at(a), n);
  const f = (a, n) => v.setFloat32(at(a), n);
  const main = u32(0x804d3ee0);
  const rules = main + 0x1850,
    vs = main + 0x590;
  if (action === "inspect") return state;
  if (action === "tapJump") {
    b(TAP_JUMP_FLAG, options.enabled === false ? 1 : 0);
    return state;
  }
  api.setCorePaused(1);
  try {
    if (action === "prepare" || action === "enterCss") {
      installTapJumpHooks(u32, w);
      b(TAP_JUMP_FLAG, options.tapJump === false ? 1 : 0);
      h(main + 0x1868, 0x7ff); // all eleven unlockable fighters
      h(main + 0x186a, 0xffff);
      b(rules + 2, 1);
      b(rules + 4, 4);
      b(rules + 5, 0);
      b(rules + 6, 10);
      b(rules + 8, 8);
      b(rules + 9, 0);
      b(rules + 10, 1);
      b(main + 0x1cb0, 255);
      w(main + 0x1cb8, 0);
      w(main + 0x1cbc, 0);
      b(vs + 8 + 8, 0);
      h(vs + 8 + 14, 0x1f);
      for (let i = 0; i < 6; i++) {
        const p = vs + 8 + 0x60 + i * 0x24;
        b(p + 1, i === 0 ? 0 : i === 1 ? 1 : 3);
        b(p + 2, 4);
        b(p + 4, i);
        if (i < 2) {
          b(p, i === 0 ? 2 : 20);
          b(p + 3, 0);
          b(p + 8, 9);
          b(p + 14, 4);
          b(p + 15, 9);
        }
        f(p + 0x18, 1);
        f(p + 0x1c, 1);
        f(p + 0x20, 1);
      }
      if (action === "enterCss") {
        if (state.major !== 1) throw new Error("Enter CSS requires the native main menu");
        const info = u32(0x804d6720);
        b(u32(info + 8), 2); // MenuExitData::pending_mode, consumed by onExit
        b(0x80479d31, 2);
        b(0x80479d3c, 1);
        w(0x80479d64, 1);
      }
    } else if (action === "lockCss" || action === "start") {
      if (state.major !== 2 || state.minor !== 0) throw new Error("Not at VS character select");
      // Skip stage select: the native scene router proceeds directly to VS.
      b(0x80479d35, 3);
      h(0x804807b0 + 16 + 14, 0x1f);
      b(0x804807b0 + 16 + 8, 0);
      b(rules + 2, 1);
      b(rules + 4, 4);
      b(rules + 8, 8);
      b(main + 0x1cb0, 255);
      w(main + 0x1cb8, 0);
      w(main + 0x1cbc, 0);
      for (let i = 0; i < 6; i++) {
        const p = 0x804807b0 + 16 + 0x60 + i * 0x24;
        b(p + 1, i === 0 ? 0 : i === 1 ? 1 : 3);
        b(p + 2, 4);
        if (i === 1) b(p + 15, 9);
      }
      if (action === "start")
        for (let i = 0; i < 2; i++) {
          const p = 0x804807b0 + 16 + 0x60 + i * 0x24;
          if (heap[at(p)] === 18 && (options.startingSheik?.[i] ?? startingSheik[i])) b(p, 19);
        }
    } else if (action === "quit") {
      if (state.major !== 2 || state.minor !== 2 || state.sceneKind !== 2)
        throw new Error("No active match");
      // Native OUTCOME_NO_CONTEST, consumed by gm_GetMatchOutcome. The game runs
      // its own match-end callbacks, resource cleanup, and scene transition.
      b(0x8046b6a8, 7);
    } else if (action === "returnCss") {
      if (state.major !== 2 || state.minor !== 4) throw new Error("Not at results");
      for (let i = 0; i < 2; i++) {
        const p = vs + 8 + 0x60 + i * 0x24;
        if (heap[at(p)] === 19) b(p, 18);
      }
      b(0x80479d35, 1);
      w(0x80479d64, 1);
    } else if (action === "select") {
      if (state.major !== 2 || state.minor !== 0 || state.sceneKind !== 8)
        throw new Error("Selection requires character select");
      if (![options.player, options.cpu].every((n) => Number.isInteger(n) && n >= 0 && n < 26))
        throw new Error("Invalid fighter");
      const css = 0x804807b0;
      startingSheik = [options.player === 19, options.cpu === 19];
      for (let i = 0; i < 6; i++) {
        const p = css + 16 + 0x60 + i * 0x24;
        b(p + 1, i === 0 ? 0 : i === 1 ? 1 : 3);
        b(p + 2, 4);
        if (i < 2) {
          const char = i === 0 ? options.player : options.cpu;
          b(p, char === 19 ? 18 : char);
          b(p + 15, 9);
          b(p + 3, i === 1 && options.player === options.cpu ? 1 : 0);
        }
      }
      b(css + 3, 0);
      b(0x80479d35, 1);
      w(0x80479d64, 1);
    } else throw new Error("Unknown Melee action");
  } finally {
    api.setCorePaused(0);
  }
  return inspectMelee(module);
}
