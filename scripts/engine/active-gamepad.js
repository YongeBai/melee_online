// Device enumeration order is not player intent. Keep the active controller
// selected through releases; a newly pressed button or moved stick can claim it.
export function createActiveGamepad() {
  let selected;
  const previous = new Map();
  return pads => {
    const connected = Array.from(pads || []).filter(Boolean);
    let chosen = connected.find(p => `${p.id}:${p.index}` === selected) || connected[0];
    const ids = new Set();
    for (const pad of connected) {
      const id = `${pad.id}:${pad.index}`;
      ids.add(id);
      const active = [...pad.buttons.map(b => !!b?.pressed),
        ...pad.axes.slice(0, 4).map(a => Math.abs(a) > .35)];
      const before = previous.get(id) || [];
      if (active.some((value, i) => value && !before[i])) chosen = pad;
      previous.set(id, active);
    }
    for (const id of previous.keys()) if (!ids.has(id)) previous.delete(id);
    selected = chosen ? `${chosen.id}:${chosen.index}` : undefined;
    return chosen || null;
  };
}
