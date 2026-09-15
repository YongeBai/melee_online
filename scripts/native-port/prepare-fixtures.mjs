// Development-only extraction. Browser verification loads these hosted files
// automatically; there is no file picker or player-provided disc path.
import fs from 'node:fs';
import path from 'node:path';
import {parseFileTable, parseHeader} from '../../web/lib/disc.ts';
import {fighterArchives} from '../../engines/browser-native/fighter-assets.mjs';
const root=path.resolve(import.meta.dirname,'../..');
const filename=process.argv[2];
if(!filename)throw Error('Pass the development USA 1.02 fixture path. This is a build tool, not player setup.');
const fd=fs.openSync(filename,'r');
const names=['GrNBa.dat','GrNLa.dat','GrOp.dat','GrSt.dat','GrIz.dat','GrPs.usd'];
const fighters=Object.keys(fighterArchives).map(code=>'Pl'+code+'.dat');
const animations=Object.keys(fighterArchives).map(code=>'Pl'+code+'AJ.dat');
const models=Object.keys(fighterArchives).map(code=>'Pl'+code+'Nr.dat');
const output=path.join(root,'dist/native-port');
function read(offset,size) {
  const bytes=Buffer.alloc(size);
  if(fs.readSync(fd,bytes,0,size,offset)!==size)throw Error('Truncated development fixture');
  return bytes;
}
try {
  const total=fs.fstatSync(fd).size;
  const header=parseHeader(read(0,0x440).buffer,total);
  const files=parseFileTable(read(header.fstOffset,header.fstSize).buffer,total);
  fs.mkdirSync(path.join(output,'fixtures'),{recursive:true});
  for(const name of [...names,...fighters,...animations,...models]) {
    const file=files.find(f=>f.path===name);
    if(!file)throw Error('Stage missing: '+name);
    fs.writeFileSync(path.join(output,'fixtures',name),read(file.offset,file.size));
  }
  fs.writeFileSync(path.join(output,'stage-fixtures.json'),JSON.stringify(names,null,2)+'\n');
  fs.writeFileSync(path.join(output,'fighter-fixtures.json'),JSON.stringify(fighters,null,2)+'\n');
  fs.writeFileSync(path.join(output,'animation-fixtures.json'),JSON.stringify(animations,null,2)+'\n');
  fs.writeFileSync(path.join(output,'model-fixtures.json'),JSON.stringify(models,null,2)+'\n');
  console.log('Prepared six stages and 27 playable fighter components in ignored dist/native-port.');
} finally {fs.closeSync(fd);}
