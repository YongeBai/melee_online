// Read-only workload inventory. Counts are structural opportunities, not CPU
// time or proof that an animation can be skipped. Inspect only while paused.
export function inspectStageAnimation(read32, read8) {
  const valid = (p, bytes) => Number.isInteger(p) && !(p & 3) && p >= 0x80003100 && p + bytes <= 0x81800000;
  const requirePointer = (p, bytes) => { if (!valid(p, bytes)) throw Error('Invalid animation inventory pointer'); };
  const lists = read32(0x804d782c); requirePointer(lists, 24);
  const objects = [], seenObjects = new Set(); let g = read32(lists + 20);
  while (g) {
    requirePointer(g, 0x38);
    if (seenObjects.has(g) || seenObjects.size >= 128) throw Error('Invalid animation object chain');
    seenObjects.add(g);
    const ground = read32(g + 0x2c);
    if (read8(g) === 0 && read8(g + 1) === 3 && valid(ground, 0x20) && read32(ground + 4) === g) {
      const row = {gobj: g, mapId: read32(ground + 0x14), category: read8(ground + 0x11) >>> 5,
        render: read32(g + 0x1c), joints: 0, jointAnimations: 0, jointChannels: 0,
        activeJointAnimations: 0, animationTypes: {}, processes: []};
      const seenJoints = new Set(), seenAnimations = new Set(), seenChannels = new Set();
      const visit = (j, depth = 0) => {
        if (depth > 64) throw Error('Animation joint depth exceeded');
        while (j) {
          requirePointer(j, 0x88);
          if (seenJoints.has(j) || seenJoints.size >= 2048) throw Error('Invalid animation joint tree');
          seenJoints.add(j); row.joints++;
          const a = read32(j + 0x7c);
          if (a) {
            requirePointer(a, 0x1c);
            if (seenAnimations.has(a)) throw Error('Shared joint animation owner');
            seenAnimations.add(a); row.jointAnimations++;
            if (!(read32(a) & 0x40000000)) row.activeJointAnimations++;
            let f = read32(a + 0x14);
            while (f) {
              requirePointer(f, 0x30);
              if (seenChannels.has(f) || seenChannels.size >= 16384) throw Error('Invalid animation channel chain');
              seenChannels.add(f); row.jointChannels++;
              const type = read8(f + 0x13); row.animationTypes[type] = (row.animationTypes[type] || 0) + 1;
              f = read32(f);
            }
          }
          if (!(read32(j + 0x14) & 0x1000)) visit(read32(j + 0x10), depth + 1);
          j = read32(j + 8);
        }
      };
      const root = read32(g + 0x28); requirePointer(root, 0x88); visit(root);
      const seenProcesses = new Set(); let p = read32(g + 0x18);
      while (p) {
        requirePointer(p, 0x18);
        if (seenProcesses.has(p) || seenProcesses.size >= 16 || read32(p + 0x10) !== g)
          throw Error('Invalid animation process ownership');
        seenProcesses.add(p); row.processes.push(read32(p + 0x14)); p = read32(p);
      }
      objects.push(row);
    }
    g = read32(g + 8);
  }
  return {objects, limits: 'Joint animation inventory only; excludes material/texture/shape animation and does not measure CPU time.'};
}
