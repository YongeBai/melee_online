// Keep short decoder bursts, but never refill a multi-frame buffer after an
// empty display tick (common on 120/144 Hz displays with a 60 Hz stream).
export class FrameQueue {
  constructor(limit = 3) {
    this.limit = limit;
    this.frames = [];
  }
  push(frame, at) {
    this.frames.push({frame, at});
    let dropped = 0;
    while (this.frames.length > this.limit) {
      this.frames.shift().frame.close();
      dropped++;
    }
    return dropped;
  }
  take() { return this.frames.shift(); }
  clear() {
    for (const {frame} of this.frames) frame.close();
    this.frames.length = 0;
  }
}
