// Development extraction only. Players automatically fetch hosted music.
import fs from 'node:fs';import path from 'node:path';
import {parseHeader,parseFileTable} from '../../web/lib/disc.ts';
import {decodeHps} from '../../engines/browser-native/hps-audio.mjs';
export function prepareNativeMusic(filename){if(!filename)throw Error('Supply the development USA 1.02 disc');
const root=path.resolve(import.meta.dirname,'../..'),output=path.join(root,'dist/native-port'),fd=fs.openSync(filename,'r');
const read=(o,n)=>{const bytes=new Uint8Array(n);if(fs.readSync(fd,bytes,0,n,o)!==n)throw Error('Truncated development disc');return bytes;};
try{
 const total=fs.fstatSync(fd).size,h=parseHeader(read(0,0x440).buffer,total),files=parseFileTable(read(h.fstOffset,h.fstSize).buffer,total);
 const names=['menu01','menu02','menu3','izumi','ystory','old_kb','pstadium','pokesta','sp_zako','sp_end'];const manifest={};fs.mkdirSync(path.join(output,'audio'),{recursive:true});
 for(const stem of names){const name=stem+'.hps',file=files.find(f=>f.path==='audio/'+name);if(!file)throw Error('Missing '+name);const bytes=read(file.offset,file.size),decoded=decodeHps(bytes);fs.writeFileSync(path.join(output,'audio',name),bytes);manifest[name]={rate:decoded.rate,length:decoded.length,channels:decoded.pcm.length,loopStart:decoded.loopStart};}
 fs.writeFileSync(path.join(output,'music-fixtures.json'),JSON.stringify(manifest,null,2)+'\n');return manifest;
}finally{fs.closeSync(fd);}
}
if(process.argv[1]===import.meta.filename)console.log(JSON.stringify(prepareNativeMusic(process.argv[2])));
