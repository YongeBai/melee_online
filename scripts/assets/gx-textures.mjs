import { deflateSync } from "node:zlib";

// Nintendo GX tiled formats used by Melee's HSD image descriptors.
// Layout reference: Dolphin VideoCommon/TextureDecoder_Generic.cpp.
export function decodeGX(data, width, height, format) {
  const formats = {
    0: [8, 8, 32],
    1: [8, 4, 32],
    2: [8, 4, 32],
    3: [4, 4, 32],
    4: [4, 4, 32],
    5: [4, 4, 32],
    6: [4, 4, 64],
    14: [8, 8, 32],
  };
  const spec = formats[format];
  if (!spec) throw Error("Unsupported GX format " + format);
  const [bw, bh, bytes] = spec;
  const size = Math.ceil(width / bw) * Math.ceil(height / bh) * bytes;
  if (data.length < size) throw Error("Truncated GX texture");
  const rgba = Buffer.alloc(width * height * 4);
  const set = (x, y, c) => {
    if (x < width && y < height) rgba.set(c, (y * width + x) * 4);
  };
  const rgb565 = (v) => [
    ((v >> 11) * 255) / 31,
    (((v >> 5) & 63) * 255) / 63,
    ((v & 31) * 255) / 31,
    255,
  ];
  let p = 0;
  for (let by = 0; by < height; by += bh)
    for (let bx = 0; bx < width; bx += bw, p += bytes) {
      if (format === 14) {
        for (let sub = 0; sub < 4; sub++) {
          const q = p + sub * 8,
            a = data.readUInt16BE(q),
            b = data.readUInt16BE(q + 2),
            ca = rgb565(a),
            cb = rgb565(b);
          const lerp = (wa, wb, den) =>
            ca.map((n, i) => (i === 3 ? 255 : (n * wa + cb[i] * wb) / den));
          const colors = [
            ca,
            cb,
            a > b ? lerp(2, 1, 3) : lerp(1, 1, 2),
            a > b ? lerp(1, 2, 3) : [0, 0, 0, 0],
          ];
          for (let y = 0; y < 4; y++)
            for (let x = 0; x < 4; x++)
              set(
                bx + (sub % 2) * 4 + x,
                by + Math.floor(sub / 2) * 4 + y,
                colors[(data[q + 4 + y] >> (6 - x * 2)) & 3],
              );
        }
        continue;
      }
      for (let y = 0; y < bh; y++)
        for (let x = 0; x < bw; x++) {
          const i = y * bw + x;
          let c;
          if (format === 0) {
            const v = ((data[p + (i >> 1)] >> (i % 2 ? 0 : 4)) & 15) * 17;
            c = [v, v, v, v];
          }
          if (format === 1) {
            const v = data[p + i];
            c = [v, v, v, v];
          }
          if (format === 2) {
            const v = data[p + i],
              n = (v & 15) * 17;
            c = [n, n, n, (v >> 4) * 17];
          }
          if (format === 3) {
            const a = data[p + i * 2],
              v = data[p + i * 2 + 1];
            c = [v, v, v, a];
          }
          if (format === 4) c = rgb565(data.readUInt16BE(p + i * 2));
          if (format === 5) {
            const v = data.readUInt16BE(p + i * 2);
            c =
              v & 0x8000
                ? [
                    (((v >> 10) & 31) * 255) / 31,
                    (((v >> 5) & 31) * 255) / 31,
                    ((v & 31) * 255) / 31,
                    255,
                  ]
                : [
                    ((v >> 8) & 15) * 17,
                    ((v >> 4) & 15) * 17,
                    (v & 15) * 17,
                    (((v >> 12) & 7) * 255) / 7,
                  ];
          }
          if (format === 6)
            c = [
              data[p + i * 2 + 1],
              data[p + 32 + i * 2],
              data[p + 32 + i * 2 + 1],
              data[p + i * 2],
            ];
          set(bx + x, by + y, c);
        }
    }
  return rgba;
}
const crcTable = Array.from({ length: 256 }, (_, n) => {
  for (let i = 0; i < 8; i++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
function chunk(type, data) {
  const b = Buffer.concat([Buffer.from(type), data]);
  let crc = 0xffffffff;
  for (const n of b) crc = crcTable[(crc ^ n) & 255] ^ (crc >>> 8);
  const head = Buffer.alloc(4),
    tail = Buffer.alloc(4);
  head.writeUInt32BE(data.length);
  tail.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([head, b, tail]);
}
export function encodePNG(rgba, width, height) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++)
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
