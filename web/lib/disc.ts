import { requiredAssets } from './required-assets.ts';
export const DOL_SHA1 = '08e0bf20134dfcb260699671004527b2d6bb1a45';
export type DiscFile = { path: string; offset: number; size: number };
export type DiscSource = {
  size: number;
  slice(start: number, end: number): { arrayBuffer(): Promise<ArrayBuffer> };
};
const text = new TextDecoder('utf-8', { fatal: true });
function check(ok: boolean, message: string): asserts ok {
  if (!ok) throw new Error(message);
}
function range(offset: number, size: number, total: number) {
  check(
    Number.isSafeInteger(offset) &&
      Number.isSafeInteger(size) &&
      offset >= 0 &&
      size >= 0 &&
      offset + size <= total,
    'The disc is truncated or contains an invalid file range.',
  );
}
export async function readRange(
  source: DiscSource,
  offset: number,
  size: number,
) {
  range(offset, size, source.size);
  check(
    size <= 64 * 1024 * 1024,
    'Requested disc chunk exceeds the 64 MiB limit.',
  );
  const result = await source.slice(offset, offset + size).arrayBuffer();
  check(result.byteLength === size, 'The disc could not be fully read.');
  return result;
}
export function parseHeader(bytes: ArrayBuffer, total: number) {
  check(
    bytes.byteLength >= 0x440,
    'Choose an uncompressed Melee NTSC-U 1.02 ISO or GCM file.',
  );
  const v = new DataView(bytes),
    b = new Uint8Array(bytes);
  check(
    v.getUint32(0x1c) === 0xc2339f3d,
    'This is not an uncompressed GameCube disc. Extract ZIP files or convert RVZ to ISO first.',
  );
  check(
    text.decode(b.subarray(0, 6)) === 'GALE01',
    'This build requires Super Smash Bros. Melee NTSC-U (GALE01).',
  );
  check(
    b[6] === 0 && b[7] === 2,
    'This build requires Melee NTSC-U revision 1.02.',
  );
  const dolOffset = v.getUint32(0x420),
    fstOffset = v.getUint32(0x424),
    fstSize = v.getUint32(0x428);
  check(
    dolOffset >= 0x440 &&
      fstOffset >= 0x440 &&
      fstSize >= 12 &&
      fstSize <= 16 * 1024 * 1024,
    'The GameCube disc header is invalid.',
  );
  range(dolOffset, 0x100, total);
  range(fstOffset, fstSize, total);
  return { dolOffset, fstOffset, fstSize };
}
export function parseFileTable(buffer: ArrayBuffer, total: number): DiscFile[] {
  check(buffer.byteLength >= 12, 'The disc file table is missing.');
  const v = new DataView(buffer),
    bytes = new Uint8Array(buffer),
    count = v.getUint32(8);
  check(
    v.getUint32(0) === 0x01000000 &&
      v.getUint32(4) === 0 &&
      count >= 1 &&
      count <= 100000 &&
      count * 12 <= buffer.byteLength,
    'The disc file table is invalid.',
  );
  const files: DiscFile[] = [],
    names = new Set<string>();
  const stack = [{ index: 0, path: '', end: count }];
  for (let i = 1; i < count; i++) {
    while (stack.length > 1 && i >= stack[stack.length - 1].end) stack.pop();
    const parent = stack[stack.length - 1];
    const type = v.getUint8(i * 12),
      nameOffset = count * 12 + (v.getUint32(i * 12) & 0xffffff);
    check(type === 0 || type === 1, 'Invalid disc entry type.');
    check(nameOffset < bytes.length, 'Invalid disc filename offset.');
    const end = bytes.indexOf(0, nameOffset);
    check(end !== -1 && end - nameOffset <= 255, 'Invalid disc filename.');
    const name = text.decode(bytes.subarray(nameOffset, end));
    check(
      name.length > 0 &&
        name !== '.' &&
        name !== '..' &&
        !/[\\/\u0000-\u001f]/.test(name),
      'Unsafe disc filename.',
    );
    const filePath = parent.path ? `${parent.path}/${name}` : name;
    check(
      !names.has(filePath.toLowerCase()),
      'The disc has duplicate filenames.',
    );
    names.add(filePath.toLowerCase());
    const a = v.getUint32(i * 12 + 4),
      b = v.getUint32(i * 12 + 8);
    if (type === 1) {
      check(
        a === parent.index && b > i && b <= parent.end && stack.length < 32,
        'Invalid disc directory structure.',
      );
      stack.push({ index: i, path: filePath, end: b });
    } else {
      range(a, b, total);
      files.push({ path: filePath, offset: a, size: b });
    }
  }
  return files;
}
export function dolSize(buffer: ArrayBuffer) {
  check(buffer.byteLength >= 0x100, 'The executable header is missing.');
  const v = new DataView(buffer);
  let size = 0x100,
    sections = 0;
  for (let i = 0; i < 18; i++) {
    const offset = v.getUint32(i * 4),
      length = v.getUint32(0x90 + i * 4);
    if (!length) continue;
    check(
      offset >= 0x100 && offset + length <= 24 * 1024 * 1024,
      'Invalid GameCube executable section.',
    );
    size = Math.max(size, offset + length);
    sections++;
  }
  check(sections > 0, 'The disc executable has no sections.');
  return size;
}
export function auditAssets(files: DiscFile[]) {
  const present = new Set(
    files.filter((f) => f.size > 0).map((f) => f.path.toLowerCase()),
  );
  // The US release can use .usd archives in place of language-neutral .dat files.
  const missing = requiredAssets.filter(
    (name) =>
      !present.has(name.toLowerCase()) &&
      !present.has(name.replace(/\.dat$/, '.usd').toLowerCase()),
  );
  return {
    required: requiredAssets.length,
    found: requiredAssets.length - missing.length,
    missing,
  };
}
export async function inspectDisc(source: DiscSource) {
  const header = parseHeader(await readRange(source, 0, 0x440), source.size);
  const files = parseFileTable(
    await readRange(source, header.fstOffset, header.fstSize),
    source.size,
  );
  const size = dolSize(await readRange(source, header.dolOffset, 0x100));
  const dol = await readRange(source, header.dolOffset, size);
  const sha1 = [...new Uint8Array(await crypto.subtle.digest('SHA-1', dol))]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  check(
    sha1 === DOL_SHA1,
    'The executable does not match the supported, unmodified Melee NTSC-U 1.02 build.',
  );
  const audit = auditAssets(files);
  return { gameId: 'GALE01', revision: '1.02', sha1, files, audit, source };
}
export type InspectedDisc = Awaited<ReturnType<typeof inspectDisc>>;
