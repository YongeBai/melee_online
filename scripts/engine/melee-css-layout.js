// HSD JOBJ traversal uses the depth-first numbering of lb_80011E24.
export function cssJoints(heap, root) {
  const v = new DataView(heap.buffer, heap.byteOffset, heap.byteLength),
    at = (a) => a - 0x80000000;
  const valid = (a) => a >= 0x80003100 && a + 0x88 < 0x81800000;
  const u = (a) => v.getUint32(at(a));
  const list = [];
  function walk(p) {
    if (!valid(p) || list.length > 300) return;
    list.push({
      index: list.length,
      address: p,
      parent: u(p + 12),
      flags: u(p + 20),
      child: u(p + 16),
      next: u(p + 8),
      x: v.getFloat32(at(p + 56)),
      y: v.getFloat32(at(p + 60)),
      z: v.getFloat32(at(p + 64)),
    });
    if (!(u(p + 20) & 0x1000)) walk(u(p + 16));
    walk(u(p + 8));
  }
  walk(root ?? u(0x804d6cc0));
  return list;
}
const bases = new Map();
export function applyCssLayout(heap) {
  const v = new DataView(heap.buffer, heap.byteOffset, heap.byteLength),
    a = (p) => p - 0x80000000;
  const u = (p) => v.getUint32(a(p)),
    w = (p, n) => v.setUint32(a(p), n),
    f = (p, n) => v.setFloat32(a(p), n);
  const list = cssJoints(heap);
  if (list.length < 173) return false;
  const root = list[0].address,
    gobj = u(0x804d6cbc),
    stub = 0x80001c00,
    table = 0x80001c80;
  if (gobj < 0x80003100 || gobj >= 0x81800000 || ![0x80391070, stub].includes(u(gobj + 28)))
    throw Error("Unexpected native CSS render callback");
  if (u(gobj + 28) === stub) return true;
  // Set transforms immediately before the native renderer, after CSS animations.
  // Keeping the original JOBJ callback also keeps native portraits, masks and lighting.
  const writes = new Map(),
    flags = new Map();
  const mark = (p, mask, seen = new Set()) => {
    if (seen.has(p) || p < 0x80003100 || p + 136 >= 0x81800000) return;
    seen.add(p);
    flags.set(p + 20, (flags.get(p + 20) || 0) | mask);
    let c = u(p + 16);
    while (c && !seen.has(c)) {
      mark(c, mask, seen);
      c = u(c + 8);
    }
  };
  const bits = (n) => {
    const b = new DataView(new ArrayBuffer(4));
    b.setFloat32(0, n);
    return b.getUint32(0);
  };
  for (const i of [0x2a, 0x2f, 0x34, 0x39, 0x43, 0x5d, 0x75, 0x78, 0x79, 0x8d, 0xa7]) {
    const j = list[i],
      key = `${root}:${i}`;
    if (!bases.has(key)) bases.set(key, j.x);
    writes.set(j.address + 56, bits(bases.get(key) + 30.8));
    mark(j.address, 64);
  }
  for (const i of [
    0x2b, 0x2c, 0x30, 0x31, 0x35, 0x36, 0x3a, 0x3b, 0x49, 0x4f, 0x63, 0x69, 0x7a, 0x7d, 0x7e, 0x7f,
    0x82, 0x83, 0x94, 0x9c, 0xa9, 0xab,
  ]) {
    const j = list[i];
    mark(j.address, 16);
  }
  // Nameplate text/backgrounds are SIS entities, separate from the JOBJ cards.
  for (let port = 1; port < 4; port++) {
    const tag = u(0x803f0e8c + port * 12);
    if (tag < 0x80003100 || tag + 8 >= 0x81800000) continue;
    for (const offset of [0, 4]) {
      const text = u(tag + offset);
      if (text < 0x80003100 || text + 0xa0 >= 0x81800000) continue;
      if (port === 1) writes.set(text, bits(v.getFloat32(a(text)) + 30.8));
      else flags.set(text + 0x4c, 0x00010000); // HSD_Text.hidden at +0x4d
    }
  }
  const entries = [
    ...[...writes].map(([p, n]) => [p, n, 0]),
    ...[...flags].map(([p, n]) => [p, n, 1]),
  ];
  if (entries.length * 12 > 0xb80) throw Error("Native room layout table is too large");
  const code = [
    0x3d808000,
    0x618c1c80, // lis/ori r12,table
    0x39600000 | entries.length, // li r11,count
    0x814c0000,
    0x812c0004,
    0x810c0008, // lwz r10,address;r9,value;r8,operation
    0x2c080000,
    0x4182000c, // cmpwi r8,0;beq store
    0x810a0000,
    0x7d294378, // lwz r8,0(r10);or r9,r9,r8
    0x912a0000, // stw r9,0(r10)
    0x398c000c,
    0x356bffff, // addi r12,12;addic. r11,-1
    0x4082ffd8, // bne loop (-40)
    (0x48000000 | ((0x80391070 - (stub + 56)) & 0x3fffffc)) >>> 0,
  ];
  if (u(stub) !== 0 && u(stub) !== code[0]) throw Error("Native CSS code area is occupied");
  code.forEach((n, i) => w(stub + i * 4, n));
  entries.flat().forEach((n, i) => w(table + i * 4, n));
  const door = 0x803f0dfc + 0x24;
  for (const [i, offset] of [20, 24, 28, 32].entries())
    f(door + offset, [-19.4, -13.4, -11.4, -6][i] + 30.8);
  for (let port = 2; port < 4; port++)
    for (const offset of [20, 24, 28, 32]) f(0x803f0dfc + port * 0x24 + offset, 1000);
  const cursor = u(0x804a0bc4);
  if (cursor >= 0x80003100 && cursor + 24 < 0x81800000)
    f(cursor + 12, v.getFloat32(a(cursor + 12)) + 30.8);
  w(gobj + 28, stub);
  return true;
}
