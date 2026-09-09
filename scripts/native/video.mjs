// Annex-B H.264 access units are delimited by the encoder's AUD NAL units.
// Chunk boundaries are arbitrary; keep the final (possibly partial) unit.
export class H264Frames {
  constructor(onFrame) {
    this.onFrame = onFrame;
    this.buffer = Buffer.alloc(0);
    this.scan = 0;
    this.start = -1;
  }
  push(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    for (; this.scan + 4 < this.buffer.length; this.scan++) {
      const i = this.scan,
        b = this.buffer;
      if (b[i] || b[i + 1] || b[i + 2] || b[i + 3] !== 1 || (b[i + 4] & 31) !== 9) continue;
      if (this.start >= 0 && i > this.start) this.onFrame(b.subarray(this.start, i));
      this.start = i;
      this.scan += 3;
    }
    if (this.start > 0) {
      this.buffer = this.buffer.subarray(this.start);
      this.scan -= this.start;
      this.start = 0;
    }
  }
}

export function videoPacket(frame, sequence) {
  let key = false;
  for (let i = 0; i + 3 < frame.length; i++) {
    if (!frame[i] && !frame[i + 1] && frame[i + 2] === 1 && (frame[i + 3] & 31) === 5) {
      key = true;
      break;
    }
  }
  const packet = Buffer.allocUnsafe(10 + frame.length);
  packet[0] = 1;
  packet[1] = Number(key);
  packet.writeDoubleLE((sequence * 1e6) / 60, 2);
  frame.copy(packet, 10);
  return packet;
}
