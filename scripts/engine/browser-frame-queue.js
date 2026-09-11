// Optional presentation experiment: one frame of buffering absorbs worker
// delivery jitter. This changes presentation latency, never emulation speed.
export class BrowserFrameQueue {
  constructor(present, {schedule = callback => requestAnimationFrame(callback), cancel = id => cancelAnimationFrame(id),
    period = 1000 / 59.94, capacity = 3} = {}) {
    this.present = present;
    this.schedule = schedule;
    this.cancel = cancel;
    this.period = period;
    this.capacity = capacity;
    this.queue = [];
    this.primed = false;
    this.pending = null;
    this.deadline = 0;
    this.closed = false;
    this.stats = {received: 0, presented: 0, dropped: 0, underruns: 0};
  }
  push(bitmap) {
    if (this.closed) { bitmap.close(); return; }
    this.stats.received++;
    if (this.queue.length >= this.capacity) {
      this.queue.shift().close();
      this.stats.dropped++;
    }
    this.queue.push(bitmap);
    this.arm();
  }
  arm() {
    if (this.pending === null && !this.closed)
      this.pending = this.schedule(at => this.tick(at));
  }
  tick(at) {
    this.pending = null;
    if (this.closed) return;
    if (!this.primed && this.queue.length >= 2) {
      this.primed = true;
      this.deadline = at;
    }
    if (this.primed && at >= this.deadline - 1) {
      if (this.queue.length) {
        // present takes ownership, including closing the bitmap.
        this.present(this.queue.shift());
        this.stats.presented++;
        this.deadline += this.period;
        if (this.deadline < at - this.period) this.deadline = at + this.period;
      } else {
        this.stats.underruns++;
        this.primed = false;
      }
    }
    if (this.primed || this.queue.length) this.arm();
  }
  close() {
    this.closed = true;
    if (this.pending !== null) this.cancel(this.pending);
    this.pending = null;
    for (const bitmap of this.queue) bitmap.close();
    this.queue = [];
  }
}
