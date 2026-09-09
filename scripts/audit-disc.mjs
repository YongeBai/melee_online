import { open } from 'node:fs/promises';
import { inspectDisc } from '../web/lib/disc.ts';
const discPath = process.argv[2];
if (!discPath) { console.error('Usage: node scripts/audit-disc.mjs /path/to/melee.iso'); process.exitCode = 1; }
else {
  let file;
  try {
    file = await open(discPath,'r');
    const {size} = await file.stat();
    const source = {size, slice(start,end) { return {async arrayBuffer() {
      const data = new Uint8Array(end-start); let offset=0;
      while (offset<data.length) { const {bytesRead} = await file.read(data,offset,data.length-offset,start+offset); if (!bytesRead) throw Error('Unexpected end of disc'); offset+=bytesRead; }
      return data.buffer;
    }}; }};
    const {gameId,revision,sha1,files,audit} = await inspectDisc(source);
    console.log(JSON.stringify({gameId,revision,sha1,fileCount:files.length,audit},null,2));
    if (audit.missing.length) process.exitCode=2;
  } catch(error) { console.error(error.message); process.exitCode=1; }
  finally { await file?.close(); }
}
