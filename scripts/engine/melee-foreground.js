// GALE01: draw a keyed aperture using Melee's own GX rectangle routine, then
// render the original animated hands last. The browser composites controls
// beneath this native foreground; hand geometry, animation and colors stay native.
export function applyCssForeground(heap) {
  const v = new DataView(heap.buffer, heap.byteOffset, heap.byteLength);
  const at = (p) => p - 0x80000000;
  const u = (p) => v.getUint32(at(p));
  const w = (p, n) => v.setUint32(at(p), n >>> 0);
  const f = (p, n) => v.setFloat32(at(p), n);
  const valid = (p) => p >= 0x80003100 && p + 0x30 < 0x81800000;
  const cursors = [0, 1].map((i) => u(0x804a0bc0 + i * 4));
  if (!cursors.every(valid)) return false;
  const objects = cursors.map(u);
  if (!objects.every(valid)) return false;
  // 0x80001800 is Dolphin’s HBReload hook, so executable code starts after it.
  const stub = 0x80001840,
    data = 0x80001b00,
    noop = 0x80001afc;
  if (u(objects[0] + 28) === stub) return true;
  if (objects.some((p) => u(p + 28) !== 0x80391070)) throw Error("Unexpected CSS hand renderer");
  if (u(stub) !== 0 && u(stub) !== 0x2c040002) throw Error("Foreground code area occupied");
  const code = [];
  const emit = (...ops) => code.push(...ops);
  const call = (addr) => emit((0x48000001 | ((addr - (stub + code.length * 4)) & 0x3fffffc)) >>> 0);
  const base = () => emit(0x3d808000);
  const loadf = (reg, off) => emit(0xc00c0000 | (reg << 21) | (0x1b00 + off));
  emit(0x2c040002, 0x4c820020); // Only final camera pass; other passes render below the aperture.
  emit(0x9421ffd0, 0x7c0802a6, 0x90010034); // stack and LR
  base();
  loadf(1, 12);
  loadf(2, 12);
  emit(0x38600001);
  call(0x80391a04);
  for (const off of [16, 32, 48]) {
    base();
    for (let n = 0; n < 4; n++) loadf(n + 1, off + n * 4);
    emit(0x386c1b08); // color pointer
    call(0x80391580);
  }
  emit(0x3860ffff);
  call(0x80361fc4); // Invalidate GX state caches before the native models.
  for (const port of [0, 1])
    for (const pass of [0, 1, 2]) {
      base();
      emit(0x806c0000 | (0x1b00 + port * 4), 0x38800000 | pass);
      call(0x80391070);
    }
  base();
  emit(0x38000001, 0x900c1b40); // Captured CSS is ready only after this pass actually rendered.
  emit(0x80010034, 0x7c0803a6, 0x38210030, 0x4e800020);
  if (code.length * 4 > 0x2bc) throw Error("Foreground stub exceeds reserved space");
  code.forEach((n, i) => w(stub + i * 4, n));
  objects.forEach((p, i) => w(data + i * 4, p));
  w(data + 64, 0);
  w(data + 8, 0xff00ffff);
  f(data + 12, 1);
  // World coordinates in the native CSS camera. The same apertures cover the
  // central room panel and the controller indicators on the two nameplates.
  [
    [-14.91, -2.32, 29.82, -22.61],
    [-20.04, -21.22, 2.98, -2.61],
    [24.71, -21.22, 2.98, -2.61],
  ]
    .flat()
    .forEach((n, i) => f(data + 16 + i * 4, n));
  w(noop, 0x4e800020);
  w(objects[0] + 28, stub);
  w(objects[1] + 28, noop);
  return true;
}
