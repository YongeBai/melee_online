import fs from "node:fs";
import path from "node:path";
import { parseFileTable } from "../../web/lib/disc.ts";
import { decodeGX, encodePNG } from "./gx-textures.mjs";
const root = path.resolve(import.meta.dirname, "../.."),
  out = path.join(root, ".melee-assets");
const disc = fs.readdirSync(root).find((n) => /\.iso$/i.test(n) && /melee/i.test(n));
if (!disc) throw Error("Local Melee ISO not found");
const fd = fs.openSync(path.join(root, disc), "r");
const read = (p, n) => {
  const b = Buffer.alloc(n);
  fs.readSync(fd, b, 0, n, p);
  return b;
};
try {
  const header = read(0, 0x440);
  if (header.toString("ascii", 0, 6) !== "GALE01" || header[7] !== 2)
    throw Error("USA 1.02 disc required");
  const fst = read(header.readUInt32BE(0x424), header.readUInt32BE(0x428));
  const files = parseFileTable(
    fst.buffer.slice(fst.byteOffset, fst.byteOffset + fst.byteLength),
    fs.fstatSync(fd).size,
  );
  fs.mkdirSync(out, { recursive: true });
  const catalog = [];
  for (const f of files.filter((f) =>
    /^(MnMaAll|MnSlChr|MnSlMap|MnExtAll|IfAll|IfVsCam)\.usd$/.test(f.path),
  )) {
    const dat = read(f.offset, f.size),
      size = dat.readUInt32BE(4),
      relocs = dat.readUInt32BE(8);
    const seen = new Set();
    for (let i = 0; i < relocs; i++) {
      const at = 32 + dat.readUInt32BE(32 + size + i * 4);
      if (at + 24 > 32 + size) continue;
      const image = dat.readUInt32BE(at),
        w = dat.readUInt16BE(at + 4),
        h = dat.readUInt16BE(at + 6),
        format = dat.readUInt32BE(at + 8),
        mips = dat.readUInt32BE(at + 12);
      if (
        w < 4 ||
        h < 4 ||
        w > 1024 ||
        h > 1024 ||
        mips > 1 ||
        image >= size ||
        image % 32 !== 0 ||
        ![0, 1, 2, 3, 4, 5, 6, 14].includes(format)
      )
        continue;
      const min = dat.readFloatBE(at + 16),
        max = dat.readFloatBE(at + 20);
      if (!Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max > 12) continue;
      const id = `${f.path.replace(".usd", "")}-${image.toString(16)}`;
      if (seen.has(id)) continue;
      seen.add(id);
      try {
        const rgba = decodeGX(dat.subarray(32 + image, 32 + size), w, h, format),
          name = id + ".png";
        fs.writeFileSync(path.join(out, name), encodePNG(rgba, w, h));
        catalog.push({ name, archive: f.path, descriptor: at - 32, image, w, h, format });
      } catch {}
    }
  }
  fs.writeFileSync(path.join(out, "catalog.json"), JSON.stringify(catalog, null, 2));
  // Original SIS font from main.dol. The decomp supplies its address and SJIS/code LUTs.
  const dolOffset = header.readUInt32BE(0x420),
    dolHeader = read(dolOffset, 0x100);
  const dolRead = (address, length) => {
    for (let i = 0; i < 18; i++) {
      const offset = dolHeader.readUInt32BE(i * 4),
        base = dolHeader.readUInt32BE(0x48 + i * 4),
        size = dolHeader.readUInt32BE(0x90 + i * 4);
      if (address >= base && address + length <= base + size)
        return read(dolOffset + offset + address - base, length);
    }
    throw Error("Native font address outside DOL sections");
  };
  const sjis = dolRead(0x8040c8c0, 0x240),
    codes = dolRead(0x8040c680, 0x240),
    font = dolRead(0x8040cd40, 287 * 512);
  function renderText(text, name) {
    const letters = [];
    for (const char of text) {
      if (char === " ") {
        letters.push({ width: 12 });
        continue;
      }
      const ascii = char.charCodeAt(0),
        code = 0x8200 + ascii + (ascii >= 97 ? 0x20 : 0x1f);
      let glyph;
      for (let i = 0; i < 287; i++)
        if (sjis.readUInt16BE(i * 2) === code) {
          glyph = codes.readUInt16BE(i * 2) - 0x2000;
          break;
        }
      if (glyph === undefined || glyph >= 287) throw Error("Unmapped native glyph " + char);
      const rgba = decodeGX(font.subarray(glyph * 512), 32, 32, 0);
      let left = 32,
        right = 0;
      for (let y = 0; y < 32; y++)
        for (let x = 0; x < 32; x++)
          if (rgba[(y * 32 + x) * 4 + 3] > 20) {
            left = Math.min(left, x);
            right = Math.max(right, x);
          }
      letters.push({ rgba, left, width: right - left + 2 });
    }
    const width = letters.reduce((n, l) => n + l.width, 0),
      outPixels = Buffer.alloc(width * 32 * 4);
    let x = 0;
    for (const letter of letters) {
      if (letter.rgba)
        for (let yy = 0; yy < 32; yy++)
          for (let xx = 0; xx < letter.width - 1; xx++) {
            const a = letter.rgba[(yy * 32 + xx + letter.left) * 4 + 3];
            outPixels.set([255, 255, 255, a], (yy * width + x + xx) * 4);
          }
      x += letter.width;
    }
    fs.writeFileSync(path.join(out, name + ".png"), encodePNG(outPixels, width, 32));
  }
  renderText("Tap jump", "tap-jump");
  renderText("ON", "on");
  renderText("OFF", "off");
  renderText("BACK", "back");
  for(const char of 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789')
    renderText(char,`glyph-${char.charCodeAt(0)}`);
  for(const [name,text] of Object.entries({
    'room-code':'Your code','room-join':'Join room','room-ready':'Ready',
    'room-wait':'Waiting for player','room-leave':'Leave room','room-title':'2 player Versus',
    'room-connected':'Player connected','room-copy':'Copy','room-back':'Back'
  }))renderText(text,name);

  console.log(`Extracted ${catalog.length} local menu textures to .melee-assets/`);
} finally {
  fs.closeSync(fd);
}
