import test from "node:test";
import assert from "node:assert/strict";
import { decodeGX, encodePNG } from "./gx-textures.mjs";
import { inflateSync } from "node:zlib";

test("GX I4 preserves intensity alpha and crosses horizontal tile boundaries", () => {
  const bytes = Buffer.alloc(64);
  bytes.fill(0x3f, 0, 32);
  bytes.fill(0x80, 32);
  const rgba = decodeGX(bytes, 16, 8, 0);
  assert.deepEqual([...rgba.subarray(0, 8)], [51, 51, 51, 51, 255, 255, 255, 255]);
  assert.deepEqual([...rgba.subarray(8 * 4, 8 * 4 + 8)], [136, 136, 136, 136, 0, 0, 0, 0]);
  assert.deepEqual([...rgba.subarray(16 * 4, 16 * 4 + 4)], [51, 51, 51, 51]);
});
test("GX RGBA8 joins the split AR and GB planes", () => {
  const bytes = Buffer.alloc(64);
  bytes[0] = 77;
  bytes[1] = 33;
  bytes[32] = 44;
  bytes[33] = 55;
  const rgba = decodeGX(bytes, 4, 4, 6);
  assert.deepEqual([...rgba.subarray(0, 4)], [33, 44, 55, 77]);
});
test("CMPR uses transparent palette entries and separate 4x4 subtiles", () => {
  const bytes = Buffer.alloc(32);
  bytes.writeUInt16BE(0xf800, 8);
  bytes.fill(0xff, 4, 8);
  const rgba = decodeGX(bytes, 8, 8, 14);
  assert.deepEqual([...rgba.subarray(0, 4)], [0, 0, 0, 0]);
  assert.deepEqual([...rgba.subarray(16, 20)], [255, 0, 0, 255]);
});
test("PNG encoder preserves scanlines and rejects truncated GX data", () => {
  const rgba = Buffer.from([11, 22, 33, 44, 55, 66, 77, 88]);
  const png = encodePNG(rgba, 2, 1);
  assert.equal(png.readUInt32BE(16), 2);
  assert.equal(png.readUInt32BE(20), 1);
  let pos = 8,
    parts = [];
  while (pos < png.length) {
    const size = png.readUInt32BE(pos);
    if (png.toString("ascii", pos + 4, pos + 8) === "IDAT")
      parts.push(png.subarray(pos + 8, pos + 8 + size));
    pos += size + 12;
  }
  assert.deepEqual(inflateSync(Buffer.concat(parts)), Buffer.concat([Buffer.from([0]), rgba]));
  assert.throws(() => decodeGX(Buffer.alloc(1), 32, 32, 0), /Truncated/);
});
