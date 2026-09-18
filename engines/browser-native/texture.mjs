// Nintendo GX tiled formats used by Melee's HSD image descriptors.
// Layout reference: Dolphin VideoCommon/TextureDecoder_Generic.cpp.
const formats = {
    0: [8, 8, 32],
    1: [8, 4, 32],
    2: [8, 4, 32],
    3: [4, 4, 32],
    4: [4, 4, 32],
    5: [4, 4, 32],
    6: [4, 4, 64],
    8: [8, 8, 32],
    9: [8, 4, 32],
    10: [4, 4, 32],
    14: [8, 8, 32],
};
export function textureByteLength(width,height,format) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 1024 || height > 1024) throw Error('Invalid texture dimensions');
  const spec = formats[format];
  if (!spec) throw Error("Unsupported GX format " + format);
  const [bw, bh, bytes] = spec;
  return Math.ceil(width / bw) * Math.ceil(height / bh) * bytes;
}
// Encode browser RGBA readback into the tiled formats used by result-screen
// EFB image descriptors. The result path requests RGB5A3; RGB565 shares the
// same 4x4/16-bit copy layout and is kept as an independently checked case.
export function encodeGX(rgba,width,height,format) {
  const size=textureByteLength(width,height,format);
  if(![4,5].includes(format)||rgba.length!==width*height*4)throw Error('Unsupported GX framebuffer encode');
  const result=new Uint8Array(size),view=new DataView(result.buffer);let p=0;
  for(let by=0;by<height;by+=4)for(let bx=0;bx<width;bx+=4,p+=32)for(let y=0;y<4;y++)for(let x=0;x<4;x++){
    const at=((by+y)*width+bx+x)*4,inside=bx+x<width&&by+y<height;
    const r=inside?rgba[at]:0,g=inside?rgba[at+1]:0,b=inside?rgba[at+2]:0,a=inside?rgba[at+3]:0;
    const value=format===4?((r>>3)<<11)|((g>>2)<<5)|(b>>3):a>=224?0x8000|((r>>3)<<10)|((g>>3)<<5)|(b>>3):((a>>5)<<12)|((r>>4)<<8)|((g>>4)<<4)|(b>>4);
    view.setUint16(p+(y*4+x)*2,value);
  }
  return result;
}
export function decodeGX(data, width, height, format, palette) {
  const size=textureByteLength(width,height,format),[bw,bh,bytes]=formats[format];
  if (data.length < size) throw Error("Truncated GX texture");
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const rgba = new Uint8Array(width * height * 4);
  const set = (x, y, c) => {
    if (x < width && y < height) rgba.set(c, (y * width + x) * 4);
  };
  const five=n=>(n<<3)|(n>>2),six=n=>(n<<2)|(n>>4),three=n=>(n<<5)|(n<<2)|(n>>1);
  const rgb565 = (v) => [
    five(v >> 11),
    six((v >> 5) & 63),
    five(v & 31),
    255,
  ];
  const rgb5a3=v=>v&0x8000?[five((v>>10)&31),five((v>>5)&31),five(v&31),255]:
    [((v>>8)&15)*17,((v>>4)&15)*17,(v&15)*17,three((v>>12)&7)];
  let lookup;
  if([8,9,10].includes(format)) {
    if(!palette||![0,1,2].includes(palette.format)||!palette.data.length||palette.data.length%2)
      throw Error('Missing or invalid GX palette');
    const p=new DataView(palette.data.buffer,palette.data.byteOffset,palette.data.byteLength);
    lookup=index=>{
      if(index*2+2>p.byteLength)throw Error('GX palette index outside entries');
      const value=p.getUint16(index*2);
      return palette.format===0?[value&255,value&255,value&255,value>>8]:palette.format===1?rgb565(value):rgb5a3(value);
    };
  }
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
            a > b ? lerp(5, 3, 8) : lerp(1, 1, 2),
            a > b ? lerp(3, 5, 8) : [...lerp(1, 1, 2).slice(0,3),0],
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
          if(bx+x>=width||by+y>=height)continue;
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
          if (format === 5)c=rgb5a3(view.getUint16(p+i*2));
          if (format === 8)c=lookup((data[p+(i>>1)]>>(i%2?0:4))&15);
          if (format === 9)c=lookup(data[p+i]);
          if (format === 10)c=lookup(view.getUint16(p+i*2)&0x3fff);
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
