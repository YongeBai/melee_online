// USA 1.02 draw-only experiment: category 2 is a rendering pass, not a proof
// that an object is cosmetic. Explicitly preserve Randall on Yoshi's Story.
// Redirect only grDisplay callbacks to an existing, verified empty callback.
// Animation, RNG, collision, stage processes and fighter effects keep running.
export const BACKGROUND_RENDER = 0x801c5db0;
export const EMPTY_RENDER = 0x8021a60c; // grBattle_BG_Callback3: blr
export function planStageBackground(read32, read8, enabled, stage) {
  if (typeof enabled !== 'boolean') throw Error('Background mode must be boolean');
  if (!Number.isInteger(stage) || stage < 0) throw Error('Background planning requires the current stage');
  if (read32(EMPTY_RENDER) !== 0x4e800020 || read32(BACKGROUND_RENDER) !== 0x7c0802a6)
    throw Error('Background experiment requires unmodified USA 1.02 callbacks');
  const valid = (p, bytes) => Number.isInteger(p) && !(p & 3) && p >= 0x80003100 && p + bytes <= 0x81800000;
  const entities = read32(0x804d782c);
  if (!valid(entities, 24)) throw Error('Invalid game-object list');
  let gobj = read32(entities + 5 * 4);
  const seen = new Set(), writes = [], objects = [];
  while (gobj) {
    if (!valid(gobj, 0x38) || seen.has(gobj) || seen.size >= 128) throw Error('Invalid stage-object chain');
    seen.add(gobj);
    const ground = read32(gobj + 0x2c), callback = read32(gobj + 0x1c);
    if (read8(gobj) === 0 && read8(gobj + 1) === 3 && valid(ground, 0x20) &&
        read32(ground + 4) === gobj &&
        [BACKGROUND_RENDER, EMPTY_RENDER].includes(callback)) {
      const mapId = read32(ground + 0x14);
      // Follow actual callback code, not the mislabeled decompilation table:
      // map 2 uses grStory_801E3370 / 801E33E0 (moving collision and puffs).
      // Map 1 uses grStory_801E31C0 and is the decorative background.
      const gameplayVisible = stage === 8 && mapId === 2;
      const category = read8(ground + 0x11) >>> 5;
      if (category !== 2 && !gameplayVisible) { gobj = read32(gobj + 8); continue; }
      const target = enabled || gameplayVisible ? BACKGROUND_RENDER : EMPTY_RENDER;
      objects.push({gobj, mapId, category, ...(gameplayVisible ? {preservedGameplay: 'Randall'} : {})});
      if (callback !== target) writes.push([gobj + 0x1c, target]);
    }
    gobj = read32(gobj + 8);
  }
  return {writes, objects};
}
