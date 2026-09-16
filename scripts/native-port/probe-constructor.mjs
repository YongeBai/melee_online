import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createNativePortServer} from './serve.mjs';
const run=promisify(execFile),chrome=process.env.CHROME||'google-chrome',output=path.resolve(import.meta.dirname,'../../dist/native-port');
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'melee-constructor-probe-')),server=createNativePortServer();
try {
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const {stdout}=await run(chrome,['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--user-data-dir='+profile,'--virtual-time-budget=15000','--dump-dom','http://127.0.0.1:'+server.address().port+'/constructor.html'],{timeout:60000,maxBuffer:4*1024**2});
  const match=stdout.match(/<pre id="result">([\s\S]*?)<\/pre>/);if(!match)throw Error('No constructor probe result');
  const entities={'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"'},probe=JSON.parse(match[1].replace(/&(amp|lt|gt|quot);/g,s=>entities[s]));
  const report={browser:(await run(chrome,['--version'])).stdout.trim(),build:JSON.parse(fs.readFileSync(path.join(output,'fighter-init-build.json'))),probe};
  fs.writeFileSync(path.join(output,'constructor-probe.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(probe,null,2));
  if(!probe.constructorCompleted)process.exitCode=2;
} finally {await new Promise(resolve=>server.close(resolve));fs.rmSync(profile,{recursive:true,force:true});}
