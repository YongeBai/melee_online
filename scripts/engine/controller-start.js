// Read Start from every connected pad: an idle virtual/standard pad must not
// hide Start on the controller the player is actually holding.
export function createControllerStart(bindings = {}) {
  const held = new Map();
  let learning = false;
  const key = pad => `${pad.id}:${pad.index}`;
  const down = pad => pad.buttons.map((button, index) => button?.pressed ? index : -1).filter(i => i >= 0);
  return {
    bindings,
    button(pad) {
      const saved = bindings[pad.id];
      return Number.isInteger(saved) && saved >= 0 ? saved : 9;
    },
    learn(pads) {
      held.clear();
      for (const pad of pads) if (pad) held.set(key(pad), new Set(down(pad)));
      learning = true;
    },
    poll(pads) {
      let start = false, mapped = false;
      const connected = new Set();
      for (const pad of pads) {
        if (!pad) continue;
        const id = key(pad), current = new Set(down(pad)), previous = held.get(id) || new Set();
        connected.add(id);
        const fresh = [...current].filter(i => !previous.has(i));
        if (learning && fresh.length) {
          bindings[pad.id] = fresh[0];
          mapped = true;
          learning = false;
        } else if (!learning && !mapped && fresh.includes(this.button(pad))) start = true;
        held.set(id, current);
      }
      for (const id of held.keys()) if (!connected.has(id)) held.delete(id);
      return {start: start && !mapped, mapped, learning};
    },
  };
}
