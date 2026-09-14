// USA 1.02, Pokémon Stadium only. Frozen Stadium keeps the initial neutral
// stage and disables its transformation controller. Apply only while the
// controller is idle on the initial map; never freeze a transition halfway.
export const STADIUM_TRANSFORMATION_CONTROLLER = 0x801d4548;
const ORIGINAL = 0x7c0802a6;
const RETURN = 0x4e800020;
const FOLLOWING_WORDS = [
  0x90010004, 0x9421ff50, 0xdbe100a8, 0xdbc100a0,
  0xdba10098, 0xbf610084, 0x3b830000,
];
const valid = (p, bytes) => Number.isInteger(p) && !(p & 3) &&
  p >= 0x80003100 && p + bytes <= 0x81800000;

export function planStadiumTransformations(read32, read8, enabled) {
  if (typeof enabled !== 'boolean') throw Error('Stadium transformations mode must be boolean');
  const current = read32(STADIUM_TRANSFORMATION_CONTROLLER);
  if (![ORIGINAL, RETURN].includes(current) ||
      FOLLOWING_WORDS.some((word, i) => read32(STADIUM_TRANSFORMATION_CONTROLLER + 4 + i * 4) !== word))
    throw Error('Unexpected USA 1.02 Stadium transformation controller');

  const lists = read32(0x804d782c);
  if (!valid(lists, 24)) throw Error('Invalid Stadium object lists');
  const seen = new Set(), objects = [];
  const read16 = address => (read8(address) << 8) | read8(address + 1);
  let gobj = read32(lists + 20);
  while (gobj) {
    if (!valid(gobj, 0x38) || seen.has(gobj) || seen.size >= 128)
      throw Error('Invalid Stadium object chain');
    seen.add(gobj);
    const ground = read32(gobj + 0x2c);
    if (read8(gobj) === 0 && read8(gobj + 1) === 3 && valid(ground, 0xec) &&
        read32(ground + 4) === gobj && read32(ground + 0x14) === 2) {
      const mode = read16(ground + 0xdc);
      const activeMap = read16(ground + 0xde);
      const activeObject = read32(ground + 0xe4), incomingObject = read32(ground + 0xe8);
      if (mode > 6 || !valid(activeObject, 0x38)) throw Error('Invalid Stadium transformation state');
      objects.push({gobj, ground, mode, activeMap, activeObject, incomingObject,
        timer: read32(ground + 0xd8) | 0});
    }
    gobj = read32(gobj + 8);
  }
  if (objects.length !== 1) throw Error('Expected one Stadium transformation controller');
  const state = objects[0];
  if (!enabled && (state.mode !== 0 || state.activeMap !== 5 || state.incomingObject !== 0))
    throw Error('Frozen Stadium must start on the idle neutral map');
  const target = enabled ? ORIGINAL : RETURN;
  return {enabled, frozen: !enabled, objects,
    codeWrites: current === target ? [] : [[STADIUM_TRANSFORMATION_CONTROLLER, target]], writes: []};
}
