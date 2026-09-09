import { test } from "node:test";
import assert from "node:assert/strict";
import { H264Frames, videoPacket } from "./video.mjs";

const aud = Buffer.from([0, 0, 0, 1, 9, 0xf0]);
const unit = (type, id) => Buffer.concat([aud, Buffer.from([0, 0, 1, type, id, 0xab])]);
test("H.264 framing survives every possible chunk boundary, without duplicate frames", () => {
  const frames = [unit(0x65, 1), unit(0x41, 2), unit(0x41, 3)];
  const stream = Buffer.concat([...frames, aud]);
  for (let size = 1; size <= stream.length; size++) {
    const output = [],
      parser = new H264Frames((frame) => output.push(frame));
    for (let at = 0; at < stream.length; at += size) parser.push(stream.subarray(at, at + size));
    assert.deepEqual(output, frames, `chunk size ${size}`);
  }
});
test("video packets preserve resolution-independent payload, keyframes and monotonic microsecond timestamps", () => {
  const frame = unit(0x65, 1),
    packet = videoPacket(frame, 60);
  assert.equal(packet[0], 1);
  assert.equal(packet[1], 1);
  assert.equal(packet.readDoubleLE(2), 1e6);
  assert.deepEqual(packet.subarray(10), frame);
  assert.equal(videoPacket(unit(0x41, 2), 61)[1], 0);
});
