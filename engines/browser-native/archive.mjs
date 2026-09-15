// HSD archives carry big-endian metadata and relative pointers. Payloads require
// per-type conversion; never word-swap an archive containing packed bytes.
export function inspectArchive(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const check = (ok, message) => { if (!ok) throw Error('HSD archive: ' + message); };
  check(bytes.length >= 32, 'truncated header');
  const fileSize = view.getUint32(0), dataSize = view.getUint32(4);
  const counts = [8,12,16].map(at => view.getUint32(at));
  const [relocCount, publicCount, externCount] = counts;
  const relocStart = 32 + dataSize, publicStart = relocStart + relocCount * 4;
  const externStart = publicStart + publicCount * 8, stringStart = externStart + externCount * 8;
  check(fileSize === bytes.length && stringStart <= fileSize, 'invalid section sizes');
  const relocations = new Set();
  for (let i = 0; i < relocCount; i++) {
    const offset = view.getUint32(relocStart + i * 4);
    check(offset % 4 === 0 && offset + 4 <= dataSize, 'invalid relocation slot');
    check(!relocations.has(offset), 'duplicate relocation');
    check(view.getUint32(32 + offset) < dataSize, 'relocation outside data');
    relocations.add(offset);
  }
  const decoder = new TextDecoder('utf-8', {fatal:true});
  function symbols(start, count, external) {
    const entries = new Map();
    for (let i = 0; i < count; i++) {
      const offset = view.getUint32(start + i*8), nameAt = stringStart + view.getUint32(start + i*8 + 4);
      check(offset < dataSize || (external && offset === 0xffffffff), 'symbol outside data');
      check(nameAt < bytes.length, 'symbol name outside string table');
      const end = bytes.indexOf(0, nameAt);
      check(end > nameAt, 'unterminated or empty symbol');
      const name = decoder.decode(bytes.subarray(nameAt, end));
      check(!entries.has(name), 'duplicate symbol name');
      entries.set(name, offset);
    }
    return entries;
  }
  return {bytes, data:new DataView(bytes.buffer, bytes.byteOffset + 32, dataSize),
    dataSize, relocations, publics:symbols(publicStart, publicCount, false),
    externs:symbols(externStart, externCount, true)};
}
