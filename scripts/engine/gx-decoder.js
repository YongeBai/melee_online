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
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 1024 || height > 1024) throw Error("Invalid texture dimensions");
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const rgba = new Uint8Array(width * height * 4);
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
            a = view.getUint16(q),
            b = view.getUint16(q + 2),
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
          if (format === 4) c = rgb565(view.getUint16(p + i * 2));
          if (format === 5) {
            const v = view.getUint16(p + i * 2);
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
