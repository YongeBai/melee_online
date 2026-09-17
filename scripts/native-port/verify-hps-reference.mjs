import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';import {decodeHps} from '../../engines/browser-native/hps-audio.mjs';
const cli=process.argv[2];if(!cli)throw Error('Pass an independently built vgmstream-cli');
const root=path.resolve(import.meta.dirname,'../..'),dir=path.join(root,'dist/native-port'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'melee-music-reference-')),results=[];
try{
 for(const name of Object.keys(JSON.parse(fs.readFileSync(path.join(dir,'music-fixtures.json'))))){
  const file=path.join(dir,'audio',name),bytes=fs.readFileSync(file),audio=decodeHps(bytes),wav=path.join(temp,'reference.wav');const metadata=JSON.parse(execFileSync(cli,['-m','-I',file],{encoding:'utf8'}));if((metadata.loopingInfo?.start??null)!==audio.loopStart||metadata.numberOfSamples!==audio.length)throw Error('Reference loop/length mismatch '+name);execFileSync(cli,['-i','-o',wav,file],{stdio:'pipe'});const b=fs.readFileSync(wav);let data,format;
  for(let p=12;p+8<=b.length;){const size=b.readUInt32LE(p+4),kind=b.toString('ascii',p,p+4);if(kind==='data')data=b.subarray(p+8,p+8+size);if(kind==='fmt ')format={channels:b.readUInt16LE(p+10),rate:b.readUInt32LE(p+12),bits:b.readUInt16LE(p+22)};p+=8+size+(size%2);}
  if(!data||format.bits!==16||format.channels!==audio.pcm.length||format.rate!==audio.rate||data.length!==audio.length*audio.pcm.length*2)throw Error('Reference format mismatch '+name);
  for(let i=0;i<audio.length;i++)for(let ch=0;ch<audio.pcm.length;ch++){const expected=data.readInt16LE((i*audio.pcm.length+ch)*2),actual=audio.pcm[ch][i]*32768;if(actual!==expected)throw Error(`${name}: sample ${i} channel ${ch}: ${actual} != ${expected}`);}
  results.push({name,samplesPerChannel:audio.length,channels:audio.pcm.length,loopStart:audio.loopStart,inputSha256:createHash('sha256').update(bytes).digest('hex'),identical:true});
 }
 fs.writeFileSync(path.join(dir,'music-reference-report.json'),JSON.stringify({passed:true,reference:'vgmstream-cli, ignore loops, PCM16 output',results},null,2)+'\n');console.log(JSON.stringify({passed:true,tracks:results.length,samples:results.reduce((n,r)=>n+r.samplesPerChannel*r.channels,0)}));
}finally{fs.rmSync(temp,{recursive:true,force:true});}
