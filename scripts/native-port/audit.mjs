// Compile real objects, then inventory unresolved references. A successful
// compile is not proof that assembly fallbacks, ABI, or gameplay are correct.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync, spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {preparePortableSource} from './portable-source.mjs';
const root=path.resolve(import.meta.dirname,'../..');
const source=path.join(root,'engines/melee-decomp'), out=path.join(root,'dist/native-port/audit');
const emcc=process.env.EMCC||path.join(root,'.browser-tools/emsdk/upstream/emscripten/emcc');
const nm=process.env.LLVM_NM||path.join(root,'.browser-tools/emsdk/upstream/bin/llvm-nm');
const pin=JSON.parse(fs.readFileSync(new URL('./source.json',import.meta.url)));
if(execFileSync('git',['rev-parse','HEAD'],{cwd:source,encoding:'utf8'}).trim()!==pin.commit ||
  execFileSync('git',['status','--porcelain','--untracked-files=no'],{cwd:source,encoding:'utf8'}).trim())
  throw Error('Audit requires the clean pinned source.');
const include=path.join(root,'dist/native-port/include');
if(!fs.existsSync(path.join(include,'Runtime/platform.h')))throw Error('Build the native bootstrap first.');
const portable=preparePortableSource(source,path.dirname(include));
const files=execFileSync('rg',['--files','src/melee','src/sysdolphin','libs/dolphin/src','-g','*.c'],
  {cwd:source,encoding:'utf8'}).trim().split('\n').sort();
fs.mkdirSync(out,{recursive:true});
const results=[];let next=0;
async function compile(file) {
  const object=path.join(out,file.replaceAll('/','_')+'.o');
  return await new Promise((resolve,reject)=> {
    const child=spawn(emcc,['-O0','-fno-fast-math','-ffp-contract=off','-fno-strict-aliasing',
      '-I'+include,'-I'+path.join(portable.directory,'src'),'-I'+path.join(portable.directory,'libs/dolphin/include'),
      '-Isrc','-Ilibs/dolphin/include','-c',path.join(portable.directory,file),'-o',object],{cwd:source});
    let diagnostic='';
    child.stderr.on('data',b=>{if(diagnostic.length<20000)diagnostic+=b;});
    child.stdout.resume();child.on('error',reject);
    child.on('close',code=>resolve({file,object,code,diagnostic}));
  });
}
async function worker() {
  while(next<files.length) {
    const result=await compile(files[next++]);results.push(result);
    if(results.length%100===0)console.log(`Compiled ${results.length}/${files.length}; ${results.filter(r=>r.code!==0).length} failed`);
  }
}
await Promise.all(Array.from({length:4},worker));
const passed=results.filter(r=>r.code===0), definitions=new Set(), references=new Map();
for(let i=0;i<passed.length;i+=50) {
  const batch=passed.slice(i,i+50), lookup=new Map(batch.map(r=>[r.object,r.file]));
  const listing=execFileSync(nm,['--format=posix','--print-file-name',...batch.map(r=>r.object)],{encoding:'utf8',maxBuffer:32*1024**2});
  for(const line of listing.split('\n')) {
    const match=line.match(/^(.*\.o):\s+(\S+)\s+(\S)/);
    if(!match) {if(line.trim())throw Error('Unrecognized nm output: '+line);continue;}
    const [,object,symbol,kind]=match;
    if(kind==='U') {
      if(!references.has(symbol))references.set(symbol,new Set());
      references.get(symbol).add(lookup.get(object));
    } else if(kind===kind.toUpperCase())definitions.add(symbol);
  }
}
const missing=[...references].filter(([symbol])=>!definitions.has(symbol))
  .map(([symbol,files])=>({symbol,files:[...files].sort()})).sort((a,b)=>b.files.length-a.files.length||a.symbol.localeCompare(b.symbol));
const failed=results.filter(r=>r.code!==0).map(({file,diagnostic})=>({file,diagnostic})).sort((a,b)=>a.file.localeCompare(b.file));
const report={sourceCommit:pin.commit,total:files.length,compiled:passed.length,failed:failed.length,
  portableSource:portable.manifest,
  overrides:['Runtime/platform.h','placeholder.h','printf.h','stdbool.h'].map(file=>({file,
    sha256:createHash('sha256').update(fs.readFileSync(path.join(include,file))).digest('hex')})),
  callbackDiagnosticSuppressed:false,linkedGame:false,missingSymbols:missing.length,missing,failures:failed};
fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({total:report.total,compiled:report.compiled,failed:report.failed,
  missingSymbols:report.missingSymbols,mostReferenced:missing.slice(0,25).map(x=>({symbol:x.symbol,files:x.files.length}))},null,2));
