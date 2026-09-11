// Server-side rollback. The adapter snapshots the complete Dolphin machine.
export const neutralPad = () => ({
  mask: 0,
  stickX: 128,
  stickY: 128,
  cStickX: 128,
  cStickY: 128,
  triggerLeft: 0,
  triggerRight: 0,
  analogA: 0,
  analogB: 0,
});
export function sanitizePad(p = {}) {
  const n = neutralPad();
  for (const k of Object.keys(n)) {
    const v = p[k] ?? n[k];
    if (!Number.isInteger(v) || v < 0 || v > (k === "mask" ? 255 : 255))
      throw Error("Invalid controller input");
    n[k] = v;
  }
  return n;
}
const same = (a, b) => Object.keys(a).every((k) => a[k] === b[k]);
export class RollbackSession {
  constructor(adapter, { window = 12, checkpointInterval = 4 } = {}) {
    this.adapter = adapter;
    this.window = window;
    this.frame = 0;
    this.interval = checkpointInterval;
    this.slots = Math.ceil(window / checkpointInterval) + 2;
    this.events = [new Map(), new Map()];
    this.used = new Map();
    this.dirty = null;
    this.stats = { rollbacks: 0, resimulatedFrames: 0, maxDepth: 0, lateRejected: 0 };
  }
  padAt(port, frame) {
    let best = -Infinity,
      pad = neutralPad();
    for (const [f, p] of this.events[port])
      if (f <= frame && f > best) {
        best = f;
        pad = p;
      }
    return pad;
  }
  input(port, frame, pad) {
    if (![0, 1].includes(port) || !Number.isInteger(frame)) throw Error("Invalid input frame");
    if (frame < this.frame - this.window) {
      this.stats.lateRejected++;
      return false;
    }
    if (frame > this.frame + 4) throw Error("Input is too far in the future");
    frame = Math.max(0, frame);
    pad = sanitizePad(pad);
    this.events[port].set(frame, pad);
    for (let f = frame; f < this.frame; f++) {
      const applied = this.used.get(f)?.[port];
      if (applied && !same(applied, this.padAt(port, f))) {
        this.dirty = Math.min(this.dirty ?? f, f);
        break;
      }
    }
    return true;
  }
  async advance() {
    if (this.dirty !== null) {
      const from = Math.floor(this.dirty / this.interval) * this.interval,
        end = this.frame;
      this.dirty = null;
      await this.adapter.suppress(true);
      try {
        await this.adapter.restore(Math.floor(from / this.interval) % this.slots);
        this.stats.rollbacks++;
        this.stats.maxDepth = Math.max(this.stats.maxDepth, end - from);
        for (let f = from; f < end; f++) {
          // The checkpoint we just restored is already the exact pre-input
          // state for this frame. Rewriting it adds a full GPU/RAM copy with
          // no new information; later checkpoints must still be refreshed.
          await this.simulate(f, f !== from);
          this.stats.resimulatedFrames++;
        }
      } finally {
        await this.adapter.suppress(false);
      }
    }
    const state = await this.simulate(this.frame++);
    const oldest = Math.floor((this.frame - this.window) / this.interval) * this.interval;
    for (const key of this.used.keys()) if (key < oldest) this.used.delete(key);
    for (const map of this.events) {
      let keep = -Infinity;
      for (const f of map.keys()) if (f < oldest) keep = Math.max(keep, f);
      for (const f of map.keys()) if (f < oldest && f !== keep) map.delete(f);
    }
    return state;
  }
  async simulate(frame, checkpoint = true) {
    const pads = [this.padAt(0, frame), this.padAt(1, frame)];
    this.used.set(frame, pads);
    return this.adapter.advance(
      Math.floor(frame / this.interval) % this.slots,
      pads,
      checkpoint && frame % this.interval === 0,
    );
  }
}
export function dolphinAdapter(worker) {
  return {
    restore: (slot) => worker.rollback("restore", { slot }),
    suppress: (value) => worker.rollback("suppress", { value }),
    advance: (slot, pads, save) => worker.rollback("advance", { slot, pads, save }),
  };
}
