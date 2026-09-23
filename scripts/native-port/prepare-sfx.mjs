// Development extraction only. Players automatically fetch hosted sound banks.
// Writes the original sound-effect command tables (smash2.sem) and sample
// banks (.ssm) for the USA language, plus the bank header bytes the native
// synthesizer reads synchronously. Sample data itself is decoded in the browser.
import fs from 'node:fs';import path from 'node:path';
import {parseHeader,parseFileTable} from '../../web/lib/disc.ts';
export function prepareNativeSfx(filename){if(!filename)throw Error('Supply the development USA 1.02 disc');
 const root=path.resolve(import.meta.dirname,'../..'),output=path.join(root,'dist/native-port'),fd=fs.openSync(filename,'r');
 const read=(o,n)=>{const bytes=Buffer.alloc(n);if(fs.readSync(fd,bytes,0,n,o)!==n)throw Error('Truncated development disc');return bytes;};
 try{
  const total=fs.fstatSync(fd).size,h=parseHeader(new Uint8Array(read(0,0x440)).buffer,total),files=parseFileTable(new Uint8Array(read(h.fstOffset,h.fstSize)).buffer,total);
  const wanted=files.filter(f=>/^audio\/us\/[a-z0-9_]+\.(ssm|sem)$/.test(f.path)).sort((a,b)=>a.path.localeCompare(b.path));
  if(!wanted.some(f=>f.path==='audio/us/smash2.sem'))throw Error('Missing audio/us/smash2.sem');
  fs.mkdirSync(path.join(output,'sfx'),{recursive:true});
  const manifest={files:{}},headers=[];let headerOffset=0;
  for(const f of wanted){
   const bytes=read(f.offset,f.size),name=path.basename(f.path),discPath='/'+f.path;
   let prefix;
   if(name.endsWith('.sem'))prefix=f.size;
   else{const headerSize=bytes.readUInt32BE(0),dataStart=(headerSize+0x10+31)&~31;if(dataStart+bytes.readUInt32BE(4)!==f.size)throw Error('Unexpected sound bank layout '+name);prefix=dataStart;}
   fs.writeFileSync(path.join(output,'sfx',name),bytes);
   headers.push(bytes.subarray(0,prefix));
   manifest.files[discPath]={url:'sfx/'+name,size:f.size,headerOffset,headerBytes:prefix,...(name.endsWith('.ssm')?{sounds:bytes.readUInt32BE(8),base:bytes.readUInt32BE(12)}:{})};
   headerOffset+=prefix;
  }
  fs.writeFileSync(path.join(output,'sfx/headers.bin'),Buffer.concat(headers));
  fs.writeFileSync(path.join(output,'sfx-fixtures.json'),JSON.stringify(manifest,null,1)+'\n');
  return {files:Object.keys(manifest.files).length,headerBytes:headerOffset,bankBytes:wanted.reduce((n,f)=>n+f.size,0)};
 }finally{fs.closeSync(fd);}
}
if(process.argv[1]===import.meta.filename)console.log(JSON.stringify(prepareNativeSfx(process.argv[2])));
